const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../services/db');
const { enviarEmailAsistencia } = require('../services/email');
const {
  obtenerUrlFirmaReciente,
  obtenerFirmaBase64Reciente,
  descargarFirmaBase64PorUrl,
  subirFirma,
  subirPDFRegistroAsistencia,
  subirEvidenciaAsistencia,
} = require('../services/storage');
const { generarPDFDesdeHTML } = require('../services/renderer');
const { LOGO_BASE64 } = require('../services/assets');
const { resolverRutaFirmaResponsable } = require('../services/firmaPathResolver');
const { computarAccesoSst } = require('../services/accesoSst');
const { computarAccesoTalenthub } = require('../services/accesoTalenthub');
const { normalizar } = require('../services/maestroMenu');
const {
  obtenerParametrosParticipacion,
  permisosParticipacion,
  notificacionesHabilitadas,
  datosFormato,
} = require('../services/configParticipacion');
const { formatoDePlantilla, firmaConFecha } = require('../services/plantilla');

const router = express.Router();
const HTML_FORM_PATH = path.join(__dirname, '../views/formparticipacion/form.html');
const HTML_SIGN_PATH = path.join(__dirname, '../views/participacion/firmar.html');

// Documento general (Maestro_docEmpresa): Config_Doc_Trabajador Id 89 "Registro de Asistencia".
const TIPO_DOC_REGISTRO_ASISTENCIA = 89;
const SECCION_MENU = 'Participación';

// ── Utilidades ──────────────────────────────────────────────────────────────
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function nombreLimpio(nombre) {
  const n = String(nombre || '');
  return n.includes(' ** ') ? n.split(' ** ').pop().trim() : n;
}

function nuevoToken() {
  return crypto.randomBytes(24).toString('hex');
}

function partesBogota(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return p;
}

// DATE de MySQL (medianoche en Bogotá) o 'AAAA-MM-DD' → 'DD/MM/AAAA'
function formatFechaEspanol(valor) {
  if (!valor) return '';
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
    const [y, m, d] = valor.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const p = partesBogota(valor);
  return `${p.day}/${p.month}/${p.year}`;
}

function baseUrl(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function enlaceFirma(base, token) {
  return `${base}/participacion/firmar?t=${encodeURIComponent(token)}`;
}

// ── Pestañas que usan estos formatos ────────────────────────────────────────
// Las dos guardan en las mismas tablas; Dynamic_formato_asistencia.modulo dice de cuál es cada
// formato y cada pestaña solo ve los suyos. Las peticiones llevan ?modulo= (sin él: sst).
//   * sst:       SST > Participación. La Operación del formato es la de sus asistentes (MAX).
//   * talenthub: TalentHub > Registro Asistencia. Un formato puede tener asistentes de varias
//     operaciones (filtros y conteos por cualquiera de ellas), lleva la columna Operación en el
//     PDF y la Evaluación de Eficacia de la formación después de generar el PDF.
const PERFILES_ASISTENCIA = {
  sst: {
    modulo: 'sst',
    seccionMenu: SECCION_MENU,
    plantilla: 'registro_asistencia',
    variasOperaciones: false,
    evaluacion: false,
    acceso: (usuarioId) => computarAccesoSst(usuarioId, SECCION_MENU),
    nombre: 'Participación',
  },
  talenthub: {
    modulo: 'talenthub',
    seccionMenu: 'RegistroAsistencia',
    plantilla: 'registro_asistencia_th',
    variasOperaciones: true,
    evaluacion: true,
    acceso: (usuarioId) => computarAccesoTalenthub(usuarioId, 'RegistroAsistencia'),
    nombre: 'Registro Asistencia',
  },
};

function perfilAsistencia(modulo) {
  return PERFILES_ASISTENCIA[String(modulo || 'sst').toLowerCase()] || PERFILES_ASISTENCIA.sst;
}

function perfilDeReq(req) {
  return perfilAsistencia((req.query || {}).modulo || (req.body || {}).modulo);
}

// ── Acceso ──────────────────────────────────────────────────────────────────
// Quién ve la pestaña y qué operaciones: Maestro_Menu (sst / Participación o
// talenthub / RegistroAsistencia). accesoCodigo: 1 nacional, 2 regional, 3 operación.
async function computarAccesoParticipacion(usuarioId, perfil = PERFILES_ASISTENCIA.sst) {
  const acceso = await perfil.acceso(usuarioId);
  if (!acceso) return null;
  acceso.perfil = perfil;
  acceso.accesoCodigo = Number((acceso.seccionAcceso || {})[perfil.seccionMenu]) || (acceso.sinFiltro ? 1 : 3);
  return acceso;
}

// TalentHub: el formato se ve si alguno de sus asistentes es de una operación del usuario.
async function operacionesDelFormato(id) {
  const [rows] = await pool.execute(
    'SELECT DISTINCT regional, operacion FROM Dynamic_formato_itemsAsistencia WHERE id_asistencia = ? ORDER BY regional, operacion',
    [id]
  );
  return {
    regionales: [...new Set(rows.map((r) => r.regional).filter(Boolean))],
    operaciones: [...new Set(rows.map((r) => r.operacion).filter(Boolean))],
  };
}

// Formato visible para el usuario (por la Operación de quien lo creó, o si lo creó él).
// Devuelve { asistencia, esCreador, permisos } o { status, error }.
async function cargarFormato(acceso, id) {
  const perfil = acceso.perfil || PERFILES_ASISTENCIA.sst;
  const [[asistencia]] = await pool.execute(
    `SELECT a.*, u.Nombre AS nombre_responsable, u.Cargo AS cargo_responsable,
            COALESCE(item_reg.regional, u.Regional) AS regional_responsable,
            COALESCE(item_reg.operacion, u.\`Operación\`) AS operacion_responsable,
            u.Nombre AS nombre_creador
     FROM Dynamic_formato_asistencia a
     LEFT JOIN Maestro_Usuarios u ON a.usuario = u.ID
     LEFT JOIN (
       SELECT id_asistencia, MAX(regional) as regional, MAX(operacion) as operacion
       FROM Dynamic_formato_itemsAsistencia
       WHERE id_asistencia = ?
       GROUP BY id_asistencia
     ) item_reg ON item_reg.id_asistencia = a.id_asistencia
     WHERE a.id_asistencia = ?`,
    [id, id]
  );
  if (!asistencia || (asistencia.modulo || 'sst') !== perfil.modulo) return { status: 404, error: 'Formato no encontrado' };
  const esCreador = normalizar(asistencia.usuario) === normalizar(acceso.usuarioId);
  if (perfil.variasOperaciones) {
    const ops = await operacionesDelFormato(id);
    asistencia.regionales = ops.regionales;
    asistencia.operaciones = ops.operaciones;
    asistencia.regional_responsable = ops.regionales.join(', ') || asistencia.regional_responsable;
    asistencia.operacion_responsable = ops.operaciones.join(', ') || asistencia.operacion_responsable;
    const permitidas = acceso.operacionesFiltro || [];
    if (!acceso.sinFiltro && !esCreador && !ops.operaciones.some((op) => permitidas.includes(op))) {
      return { status: 403, error: 'No tiene acceso a este formato' };
    }
  } else if (!acceso.sinFiltro && !esCreador && !(acceso.operacionesFiltro || []).includes(asistencia.operacion_responsable)) {
    return { status: 403, error: 'No tiene acceso a este formato' };
  }
  const p = await permisosParticipacion(acceso.rol, null, perfil.modulo);
  const tieneDoc = !!asistencia.url_doc;
  // Con Evaluación de Eficacia (solo TalentHub) rigen los permisos de "con evaluación".
  // Regenerar el PDF lo puede hacer quien puede editar.
  const evaluado = perfil.evaluacion && asistencia.formacion_eficaz != null;
  const editar = evaluado ? p.editarEvaluado : tieneDoc ? p.editarFirmado : (esCreador || p.editarCualquiera);
  const permisos = {
    editar,
    generar:  tieneDoc ? editar : (esCreador || p.generarCualquiera),
    enlaces:  esCreador || p.enlacesCualquiera,
    eliminar: evaluado ? p.eliminarEvaluado : tieneDoc ? p.eliminarFirmado : (esCreador || p.eliminarCualquiera),
    editarFirmado:   p.editarFirmado,
    eliminarFirmado: p.eliminarFirmado,
    evaluar:  perfil.evaluacion && tieneDoc && (evaluado ? p.editarEvaluado : (esCreador || p.evaluarCualquiera)),
  };
  return { asistencia, esCreador, permisos, evaluado };
}

// ── Firmas ──────────────────────────────────────────────────────────────────
// firma_asistente guarda la URL de la firma que el asistente usó en este formato.
// Los registros antiguos tienen 'ACEPTADA' (aceptó la firma del sistema): se toma la firma
// más reciente del bucket y se deja guardada, para que el PDF no cambie más adelante.
async function resolverFirmaItem(item) {
  let url = item.firma_asistente;
  if (!url) return null;
  if (url === 'ACEPTADA') {
    url = await obtenerUrlFirmaReciente(item.identificacion).catch(() => null);
    if (!url) return null;
    await pool.execute(
      "UPDATE Dynamic_formato_itemsAsistencia SET firma_asistente = ? WHERE id_item_asistencia = ? AND firma_asistente = 'ACEPTADA'",
      [url, item.id_item_asistencia]
    );
  }
  if (!/^https:\/\//.test(url)) return null;
  return descargarFirmaBase64PorUrl(url).catch((err) => {
    console.warn(`[participacion] No se pudo descargar la firma de ${item.identificacion}:`, err.message);
    return null;
  });
}

// Asegura que cada asistente tenga su clave única de firma.
async function asegurarTokens(items) {
  for (const item of items) {
    if (item.token_firma) continue;
    item.token_firma = nuevoToken();
    await pool.execute(
      'UPDATE Dynamic_formato_itemsAsistencia SET token_firma = ? WHERE id_item_asistencia = ? AND token_firma IS NULL',
      [item.token_firma, item.id_item_asistencia]
    );
  }
  return items;
}

// Envía el correo de solicitud de firma. idsItems = null → a todos los que no han firmado.
async function enviarSolicitudesFirma(idAsistencia, base, idsItems = null) {
  const [[asistencia]] = await pool.execute(
    'SELECT * FROM Dynamic_formato_asistencia WHERE id_asistencia = ?',
    [idAsistencia]
  );
  if (!asistencia) return { enviados: 0, sinCorreo: 0 };
  // Interruptor del módulo del formato (Participación o Registro Asistencia)
  const params = await obtenerParametrosParticipacion(asistencia.modulo || 'sst');
  if (!notificacionesHabilitadas(params)) return { enviados: 0, sinCorreo: 0, deshabilitado: true };

  const [rows] = await pool.execute(
    `SELECT i.id_item_asistencia, i.nombre_trabajador, i.identificacion, i.token_firma, i.firma_asistente, s.Email
     FROM Dynamic_formato_itemsAsistencia i
     LEFT JOIN \`Maestro_Segmentación\` s ON s.Identificación = i.identificacion
     WHERE i.id_asistencia = ?`,
    [idAsistencia]
  );
  const items = rows.filter((r) => (idsItems ? idsItems.map(Number).includes(Number(r.id_item_asistencia)) : !r.firma_asistente));
  await asegurarTokens(items);

  let enviados = 0;
  let sinCorreo = 0;
  for (const item of items) {
    const email = String(item.Email || '').trim();
    if (!email || !email.includes('@')) { sinCorreo++; continue; }
    try {
      await enviarEmailAsistencia({
        email,
        trabajador: item.nombre_trabajador,
        tema: asistencia.tema,
        fecha: asistencia.fecha,
        lugar: asistencia.lugar,
        urlFirma: enlaceFirma(base, item.token_firma),
      });
      await pool.execute(
        'UPDATE Dynamic_formato_itemsAsistencia SET fecha_envio_correo = NOW() WHERE id_item_asistencia = ?',
        [item.id_item_asistencia]
      );
      enviados++;
    } catch (err) {
      console.error(`[participacion] Error enviando correo de firma a ${item.identificacion}:`, err.message);
    }
  }
  return { enviados, sinCorreo };
}

// ── PDF ─────────────────────────────────────────────────────────────────────
// Diseño: plantilla de Maestro_Plantillas del perfil ('registro_asistencia' en SST,
// 'registro_asistencia_th' en TalentHub). En SST, si no existe o está inactiva, se usa el
// diseño anterior escrito aquí.

function fechaHoraBogotaTexto(d = new Date()) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

// TalentHub: sección de Evaluación de Eficacia al final del PDF (solo cuando ya se registró).
async function seccionEvaluacionEficacia(asistencia) {
  if (asistencia.formacion_eficaz == null) return '';
  const eficaz = Number(asistencia.formacion_eficaz) === 1;
  let firmaHtml = '';
  if (asistencia.firma_evaluador && /^https:\/\//.test(asistencia.firma_evaluador)) {
    const b64 = await descargarFirmaBase64PorUrl(asistencia.firma_evaluador).catch(() => null);
    if (b64) firmaHtml = firmaConFecha(`<img src="${b64}" class="sig-img" alt="Firma">`, asistencia.fecha_registro_evaluacion);
  }
  const texto = (v) => (esc(v) || '—').replace(/\r?\n/g, '<br>');
  return `
  <section class="section-block" style="page-break-inside: avoid; break-inside: avoid;">
    <div class="section-title">Evaluación de la Eficacia de la Formación</div>
    <table class="data-grid">
      <tr><td class="data-label" style="width: 36%;">¿LA FORMACIÓN FUE EFICAZ?</td><td class="data-val"><span class="${eficaz ? 'eficacia-badge-si' : 'eficacia-badge-no'}">${eficaz ? 'SÍ' : 'NO'}</span></td></tr>
      <tr><td class="data-label">RESULTADO DE LA EVALUACIÓN DE LA EFICACIA DE LA FORMACIÓN</td><td class="data-val">${texto(asistencia.resultado_evaluacion)}</td></tr>
      <tr><td class="data-label">FECHA DE LA EVALUACIÓN</td><td class="data-val">${esc(formatFechaEspanol(asistencia.fecha_evaluacion)) || '—'}</td></tr>
      <tr><td class="data-label">ACCIÓN A SEGUIR SI NO FUE EFICAZ</td><td class="data-val">${texto(asistencia.accion_no_eficaz)}</td></tr>
    </table>
    <div class="signature-container" style="margin-top: 22px;">
      <div class="signature-card">
        <div class="sig-img-wrap">${firmaHtml}</div>
        <div class="sig-line"></div>
        <div class="sig-name">${esc(nombreLimpio(asistencia.nombre_evaluador)) || '—'}</div>
        <div class="sig-details">${esc(asistencia.cargo_evaluador) || ''}${asistencia.cargo_evaluador ? '<br>' : ''}Evaluador de la eficacia</div>
      </div>
    </div>
  </section>`;
}

async function armarHtmlDesdePlantilla({ asistencia, asistentes, evidencias, formato, firmaResponsableBase64, firmados, porCorreo, perfil = PERFILES_ASISTENCIA.sst }) {
  let plantilla = null;
  try {
    const [rows] = await pool.execute(
      'SELECT contenido_html FROM Maestro_Plantillas WHERE nombre_proceso = ? AND activo = 1 ORDER BY version DESC LIMIT 1',
      [perfil.plantilla]
    );
    plantilla = rows.length ? rows[0].contenido_html : null;
  } catch (err) {
    console.warn(`[participacion] No se pudo leer la plantilla ${perfil.plantilla}:`, err.message);
  }
  if (!plantilla) return null;

  const filas = asistentes.map((ast, idx) => `
        <tr>
          <td class="col-num">${idx + 1}</td>${perfil.variasOperaciones ? `
          <td class="col-op">${esc(ast.operacion)}</td>` : ''}
          <td><strong>${esc(nombreLimpio(ast.nombre_trabajador))}</strong></td>
          <td>${esc(ast.identificacion)}</td>
          <td>${esc(ast.cargo)}</td>
          <td class="col-firma">${ast.firmaBase64
            ? firmaConFecha(`<img src="${ast.firmaBase64}" class="firma-img" alt="Firma">`, ast.fecha_firma)
            : `<span class="firma-nota">${esc(ast.anotacion)}</span>`}</td>
        </tr>`).join('');

  const seccionEvidencias = evidencias.length ? `
  <section class="section-block" style="page-break-inside: avoid; break-inside: avoid;">
    <div class="section-title">Evidencia Fotográfica</div>
    <div class="evidencias-grid">
      ${evidencias.map((ev) => `<div class="evidencia"><img src="${esc(ev.url_evidencia)}" alt="Evidencia"></div>`).join('')}
    </div>
  </section>` : '';

  const total = asistentes.length;
  const datos = {
    logo_src: LOGO_BASE64,
    codigo_formato: esc(formato.codigo),
    version_formato: esc(formato.version),
    fecha_formato: esc(formato.fecha),
    id_asistencia: esc(asistencia.id_asistencia),
    fecha: esc(formatFechaEspanol(asistencia.fecha)),
    hora_inicial: esc(String(asistencia.hora_inicial || '').slice(0, 5)),
    hora_final: esc(String(asistencia.hora_final || '').slice(0, 5)),
    lugar: esc(asistencia.lugar),
    duracion: esc(String(asistencia.duracion || '').slice(0, 5)),
    total_asistentes: total,
    resumen_firmas: `${firmados} con firma${porCorreo ? ` · ${porCorreo} por correo` : ''}`,
    resumen_detalle: `Asistentes: ${total} · Con firma digital: ${firmados}${porCorreo ? ` · ${esc(formato.nota)}: ${porCorreo}` : ''}${total - firmados - porCorreo > 0 ? ` · Sin correo registrado: ${total - firmados - porCorreo}` : ''}`,
    tema: esc(asistencia.tema),
    objetivo: esc(asistencia.objetivo) || '—',
    nombre_responsable: esc(nombreLimpio(asistencia.nombre_responsable)) || '—',
    cargo_responsable: esc(asistencia.cargo_responsable) || '—',
    filas_asistentes: filas,
    seccion_evidencias: seccionEvidencias,
    firma_responsable_html: firmaResponsableBase64 ? `<img src="${firmaResponsableBase64}" class="sig-img" alt="Firma">` : '',
    seccion_evaluacion_eficacia: perfil.evaluacion ? await seccionEvaluacionEficacia(asistencia) : '',
    fecha_generacion: fechaHoraBogotaTexto(),
  };
  return plantilla.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, clave) => (Object.prototype.hasOwnProperty.call(datos, clave) ? String(datos[clave]) : ''));
}

// Un PDF por formato, guardado en talenthub_central/general y registrado en
// Maestro_docEmpresa (TipoDocumento 89). Al regenerarlo se reemplaza el registro.
// Asistentes sin firma: anotación de soporte por correo electrónico.
const _colaPdf = new Map();
function generarPDFAsistencia(id, opciones = {}) {
  const clave = String(id);
  const anterior = _colaPdf.get(clave) || Promise.resolve();
  const actual = anterior.catch(() => {}).then(() => _generarPDFAsistencia(id, opciones));
  _colaPdf.set(clave, actual);
  actual.catch(() => {}).finally(() => { if (_colaPdf.get(clave) === actual) _colaPdf.delete(clave); });
  return actual;
}

async function _generarPDFAsistencia(id, { usuarioId } = {}) {
  const [[asistencia]] = await pool.execute(
    `SELECT a.*,
            u.Nombre AS nombre_responsable, u.Cargo AS cargo_responsable,
            ev.Nombre AS nombre_evaluador, ev.Cargo AS cargo_evaluador,
            COALESCE(item_reg.regional, u.Regional) AS regional_responsable,
            COALESCE(item_reg.operacion, u.\`Operación\`) AS operacion_responsable
     FROM Dynamic_formato_asistencia a
     LEFT JOIN Maestro_Usuarios u ON a.usuario = u.ID
     LEFT JOIN Maestro_Usuarios ev ON ev.ID = a.evaluador
     LEFT JOIN (
       SELECT id_asistencia, MAX(regional) as regional, MAX(operacion) as operacion
       FROM Dynamic_formato_itemsAsistencia
       WHERE id_asistencia = ?
       GROUP BY id_asistencia
     ) item_reg ON item_reg.id_asistencia = a.id_asistencia
     WHERE a.id_asistencia = ?`,
    [id, id]
  );
  if (!asistencia) throw new Error('Asistencia no encontrada');
  const perfil = perfilAsistencia(asistencia.modulo);

  // TalentHub: asistentes de varias operaciones, ordenados por operación
  const [items] = await pool.execute(
    `SELECT i.id_item_asistencia, i.nombre_trabajador, i.identificacion, i.cargo, i.operacion, i.firma_asistente,
            i.fecha_firma, i.fecha_envio_correo, s.Email AS email
     FROM Dynamic_formato_itemsAsistencia i
     LEFT JOIN \`Maestro_Segmentación\` s ON s.Identificación = i.identificacion
     WHERE i.id_asistencia = ?
     ORDER BY ${perfil.variasOperaciones ? 'i.operacion, ' : ''}i.id_item_asistencia`,
    [id]
  );

  const params = await obtenerParametrosParticipacion(perfil.modulo);
  const formato = datosFormato(params);
  // Lo de Maestro_Plantillas (codigo_formato, version_formato, fecha_version) tiene prioridad
  const dePlantilla = await formatoDePlantilla(perfil.plantilla);
  if (dePlantilla.codigo) formato.codigo = dePlantilla.codigo;
  if (dePlantilla.version) formato.version = dePlantilla.version;
  if (dePlantilla.fecha) formato.fecha = dePlantilla.fecha;

  let firmados = 0;
  let porCorreo = 0;
  const asistentesConFirma = [];
  for (const item of items) {
    const firmaBase64 = await resolverFirmaItem(item);
    let anotacion = '';
    if (firmaBase64) {
      firmados++;
    } else if (item.fecha_envio_correo) {
      porCorreo++;
      anotacion = `${formato.nota} (${formatFechaEspanol(item.fecha_envio_correo)})`;
    } else if (String(item.email || '').includes('@')) {
      porCorreo++;
      anotacion = formato.nota;
    } else {
      anotacion = 'Sin firma — no tiene correo registrado';
    }
    asistentesConFirma.push({ ...item, firmaBase64, anotacion });
  }

  let firmaResponsableBase64 = null;
  const rutaFirmaResponsable = await resolverRutaFirmaResponsable(asistencia.usuario).catch(() => null);
  if (rutaFirmaResponsable && rutaFirmaResponsable.urlFirma) firmaResponsableBase64 = rutaFirmaResponsable.urlFirma;

  let filasAsistentesHtml = '';
  let num = 1;
  for (const ast of asistentesConFirma) {
    const celdaFirma = ast.firmaBase64
      ? firmaConFecha(`<img src="${ast.firmaBase64}" style="height: 38px; display: block; margin: 0 auto;" />`, ast.fecha_firma)
      : `<span style="color: #555; font-size: 7.5pt; font-style: italic;">${esc(ast.anotacion)}</span>`;
    filasAsistentesHtml += `
      <tr>
        <td style="border: 1px solid #111; padding: 6px; text-align: center;">${num++}</td>
        <td style="border: 1px solid #111; padding: 6px; font-weight: bold;">${esc(nombreLimpio(ast.nombre_trabajador))}</td>
        <td style="border: 1px solid #111; padding: 6px;">${esc(ast.identificacion)}</td>
        <td style="border: 1px solid #111; padding: 6px;">${esc(ast.cargo)}</td>
        <td style="border: 1px solid #111; padding: 6px; text-align: center; vertical-align: middle;">${celdaFirma}</td>
      </tr>
    `;
  }

  const imgFirmaResponsable = firmaResponsableBase64
    ? `<img src="${firmaResponsableBase64}" style="height: 55px; display: block; margin: 0 auto;" />`
    : '<div style="height: 50px; width: 200px; margin: 0 auto; border-bottom: 1px dashed #999;"></div>';
  const cleanResponsable = nombreLimpio(asistencia.nombre_responsable) || '—';
  const resumen = `Asistentes: ${items.length} · Firmados: ${firmados}${porCorreo ? ` · ${esc(formato.nota)}: ${porCorreo}` : ''}`;

  const htmlCompleto = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; }
        @page { margin: 1.2cm 1.2cm 1.2cm 1.2cm; }
        body { font-family: Arial, sans-serif; font-size: 9.5pt; color: #222; margin: 0; padding: 0; }
        .header-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        .header-table td { border: 1px solid #111; padding: 8px; vertical-align: middle; }
        .logo-cell { width: 140px; text-align: center; }
        .logo-cell img { height: 42px; max-width: 130px; }
        .title-cell { text-align: center; font-size: 11pt; font-weight: bold; line-height: 1.4; }
        .meta-cell { width: 140px; font-size: 8pt; line-height: 1.4; }
        
        .section-title {
          background: #d9d9d9; font-size: 9.5pt; font-weight: bold; padding: 6px;
          border: 1px solid #111; text-align: center; margin-top: 14px; margin-bottom: 0;
          text-transform: uppercase;
        }
        
        .info-table { width: 100%; border-collapse: collapse; margin-top: 0; }
        .info-table td { border: 1px solid #111; padding: 6px; vertical-align: middle; }
        .label { font-weight: bold; background: #f2f2f2; width: 15%; }
        
        .asistentes-table { width: 100%; border-collapse: collapse; margin-top: 0; }
        .asistentes-table th { border: 1px solid #111; background: #e6e6e6; padding: 6px; font-weight: bold; text-align: left; font-size: 9pt; }
        .asistentes-table td { border: 1px solid #111; padding: 5px; font-size: 8.5pt; }
        
        .firma-table { width: 60%; border-collapse: collapse; margin: 25px auto 0; }
        .firma-table td { border: 1px solid #111; padding: 12px; vertical-align: top; text-align: center; background: #fff; }
      </style>
    </head>
    <body>
      <table class="header-table">
        <tr>
          <td class="logo-cell"><img src="https://storage.googleapis.com/logyser-recibo-public/Logyser%20sin%20Nit.png" alt="LOG&SER"></td>
          <td class="title-cell">REGISTRO DE PARTICIPANTES</td>
          <td class="meta-cell">
            <strong>Código:</strong> ${esc(formato.codigo)}<br>
            <strong>Versión:</strong> ${esc(formato.version)}<br>
            <strong>Fecha:</strong> ${esc(formato.fecha)}
          </td>
        </tr>
      </table>

      <div class="section-title">Información Básica</div>
      <table class="info-table">
        <tr>
          <td class="label">Tema</td>
          <td colspan="5" style="font-weight: bold; font-size: 10.5pt;">${esc(asistencia.tema)}</td>
        </tr>
        <tr>
          <td class="label">Fecha</td>
          <td style="width: 18%;">${formatFechaEspanol(asistencia.fecha)}</td>
          <td class="label">Hora Inicial</td>
          <td style="width: 18%;">${esc(String(asistencia.hora_inicial || '').slice(0, 5))}</td>
          <td class="label">Hora Final</td>
          <td style="width: 20%;">${esc(String(asistencia.hora_final || '').slice(0, 5))}</td>
        </tr>
        <tr>
          <td class="label">Lugar</td>
          <td colspan="3">${esc(asistencia.lugar)}</td>
          <td class="label">Duración</td>
          <td>${esc(String(asistencia.duracion || '').slice(0, 5))} Hs</td>
        </tr>
        <tr>
          <td class="label">Objetivo</td>
          <td colspan="5" style="text-align: justify;">${esc(asistencia.objetivo) || '—'}</td>
        </tr>
      </table>

      <div class="section-title">Asistentes Registrados</div>
      <table class="asistentes-table">
        <thead>
          <tr>
            <th style="width: 5%; text-align: center;">#</th>
            <th style="width: 40%;">Nombres y apellidos</th>
            <th style="width: 15%;">Cédula</th>
            <th style="width: 20%;">Cargo</th>
            <th style="width: 20%; text-align: center;">Firma</th>
          </tr>
        </thead>
        <tbody>
          ${filasAsistentesHtml}
        </tbody>
      </table>
      <p style="font-size: 8pt; color: #444; margin: 6px 0 0;">${resumen}</p>

      <table class="firma-table">
        <tr>
          <td>
            <p style="margin: 0 0 8px; font-weight: bold; font-size: 10pt; text-transform: uppercase;">RESPONSABLE DEL REGISTRO</p>
            <p style="margin: 3px 0; font-size: 9pt;">Nombre: <strong>${esc(cleanResponsable)}</strong></p>
            <p style="margin: 3px 0; font-size: 9pt;">Cargo: ${esc(asistencia.cargo_responsable) || '—'}</p>
            <div style="margin-top: 14px;">
              ${imgFirmaResponsable}
            </div>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const [evidencias] = await pool.execute(
    'SELECT url_evidencia FROM Dynamic_formato_evidencias WHERE id_asistencia = ? ORDER BY id_evidencia',
    [id]
  );
  const htmlPlantilla = await armarHtmlDesdePlantilla({
    asistencia, asistentes: asistentesConFirma, evidencias, formato, firmaResponsableBase64, firmados, porCorreo, perfil,
  });
  if (!htmlPlantilla && perfil.modulo !== 'sst') {
    throw new Error(`No hay una plantilla activa '${perfil.plantilla}' en Maestro_Plantillas.`);
  }
  const pdfBuffer = await generarPDFDesdeHTML(htmlPlantilla || htmlCompleto, {
    margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
  });
  const urlGeneral = await subirPDFRegistroAsistencia(id, pdfBuffer);

  // Registro en Maestro_docEmpresa (se reemplaza al regenerar)
  let prefijo = 'REGASIS';
  try {
    const [[tipo]] = await pool.execute('SELECT Prefijo FROM Config_Doc_Trabajador WHERE Id = ?', [TIPO_DOC_REGISTRO_ASISTENCIA]);
    if (tipo && tipo.Prefijo) prefijo = tipo.Prefijo;
  } catch { /* se usa REGASIS */ }

  const fechaAct = asistencia.fecha ? partesBogota(asistencia.fecha) : partesBogota(new Date());
  const observaciones = `Registro de asistencia${perfil.modulo === 'talenthub' ? ' (TalentHub)' : ''} #${id} · ${String(asistencia.tema || '').slice(0, 300)} · ${formatFechaEspanol(asistencia.fecha)} · ${items.length} asistentes, ${firmados} firmados`.slice(0, 512);

  let idDocEmpresa = asistencia.id_doc_empresa || null;
  if (idDocEmpresa) {
    const [upd] = await pool.execute(
      'UPDATE Maestro_docEmpresa SET Url = ?, Observaciones = ?, FechaRegistro = NOW() WHERE id = ?',
      [urlGeneral, observaciones, idDocEmpresa]
    );
    if (!upd.affectedRows) idDocEmpresa = null;
  }
  if (!idDocEmpresa) {
    idDocEmpresa = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO Maestro_docEmpresa
         (id, TipoDocumento, Prefijo, Regional, \`Operación\`, FechaRegistro, Usuario, Observaciones, Url, \`Validación\`, Mes, \`Año\`)
       VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?, 'PEND', ?, ?)`,
      [
        idDocEmpresa, String(TIPO_DOC_REGISTRO_ASISTENCIA), prefijo,
        asistencia.regional_responsable || null, asistencia.operacion_responsable || null,
        usuarioId || asistencia.usuario || 'Sistema', observaciones, urlGeneral,
        String(Number(fechaAct.month)), fechaAct.year,
      ]
    );
  }

  await pool.execute(
    'UPDATE Dynamic_formato_asistencia SET url_doc = ?, id_doc_empresa = ? WHERE id_asistencia = ?',
    [urlGeneral, idDocEmpresa, id]
  );

  return { urlGeneral, firmados, total: items.length, todasFirmadas: firmados === items.length };
}

// ═════ FORMULARIO (crear / editar) ═════
router.get('/', async (req, res) => {
  try {
    const isForm = (req.baseUrl || '').toLowerCase().includes('/formparticipacion');
    if (!isForm) {
      const q = new URLSearchParams(req.query);
      if (!q.has('tab')) q.set('tab', 'participacion');
      return res.redirect(302, `/sst?${q.toString()}`);
    }

    const { usuario } = req.query;
    if (!usuario) return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');

    const perfil = perfilDeReq(req);
    const acceso = await computarAccesoParticipacion(usuario, perfil);
    if (!acceso) return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');

    const params = await obtenerParametrosParticipacion(perfil.modulo);
    const permisos = await permisosParticipacion(acceso.rol, params);
    const html = fs.readFileSync(HTML_FORM_PATH, 'utf8');
    const { perfil: _perfil, ...accesoPublico } = acceso;
    const config = JSON.stringify({
      ...accesoPublico,
      regionalesFiltro: Object.keys(acceso.opsPorRegional),
      initialView: 'formulario',
      permisosParticipacion: permisos,
      notificacionesHabilitadas: notificacionesHabilitadas(params),
      modulo: perfil.modulo,
      variasOperaciones: perfil.variasOperaciones,
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[participacion] Error sirviendo interfaz:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// ═════ API: GET /api/usuario ═════
router.get('/api/usuario', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id requerido' });

    const [rows] = await pool.execute(
      'SELECT ID, Nombre FROM Maestro_Usuarios WHERE ID = ?',
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({
      id: rows[0].ID,
      nombre: rows[0].Nombre,
      usuario: rows[0].ID,
    });
  } catch (err) {
    console.error('[participacion] GET /api/usuario:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/asistentes-buscar (BÚSQUEDA GENERAL) ═════
router.get('/api/asistentes-buscar', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const qUpper = q.toUpperCase();

    const [rows] = await pool.execute(
      `SELECT \`Id Vinculación\` AS id_vinculacion, Trabajador, Identificación, Cargo, Operación, Regional 
       FROM \`Maestro_Vinculación\` 
       WHERE Estado = 'Activo' AND (Identificación LIKE ? OR Trabajador LIKE ?) 
       LIMIT 30`,
      [`%${qUpper}%`, `%${qUpper}%`]
    );

    res.json(rows);
  } catch (err) {
    console.error('[participacion] GET /api/asistentes-buscar:', err);
    res.status(500).json([]);
  }
});

// ═════ API: GET /api/trabajadores-por-operacion ═════
router.get('/api/trabajadores-por-operacion', async (req, res) => {
  try {
    const { regional, operacion } = req.query;
    if (!regional || !operacion) {
      return res.status(400).json({ error: 'regional y operacion requeridos' });
    }

    const [rows] = await pool.execute(
      `SELECT \`Id Vinculación\` AS id_vinculacion, Trabajador, Identificación AS identificacion, Cargo, Operación, Regional 
       FROM \`Maestro_Vinculación\` 
       WHERE Estado = 'Activo' AND Regional = ? AND Operación = ?
       ORDER BY Trabajador`,
      [regional, operacion]
    );

    res.json(rows);
  } catch (err) {
    console.error('[participacion] GET /api/trabajadores-por-operacion:', err);
    res.status(500).json([]);
  }
});

// ═════ API: GET /api/trabajadores (TalentHub > Registro Asistencia) ═════
// Personal activo para escoger asistentes, según el acceso de Maestro_Menu:
//   1: Regional y Operación opcionales (sin ellas, todo el personal activo).
//   2: Regional obligatoria, Operación opcional.
//   3: Regional y Operación obligatorias.
// Siempre dentro de las operaciones que el usuario puede ver.
router.get('/api/trabajadores', async (req, res) => {
  try {
    const perfil = perfilDeReq(req);
    const acceso = await computarAccesoParticipacion(req.query.usuario, perfil);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });
    const regional = String(req.query.regional || '').trim();
    const operacion = String(req.query.operacion || '').trim();
    if (acceso.accesoCodigo >= 2 && !regional) return res.status(400).json({ error: 'Seleccione la regional.' });
    if (acceso.accesoCodigo >= 3 && !operacion) return res.status(400).json({ error: 'Seleccione la operación.' });

    const conds = ["Estado = 'Activo'"];
    const params = [];
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) return res.json([]);
      conds.push(`\`Operación\` IN (${acceso.operacionesFiltro.map(() => '?').join(',')})`);
      params.push(...acceso.operacionesFiltro);
    }
    if (regional) { conds.push('Regional = ?'); params.push(regional); }
    if (operacion) { conds.push('`Operación` = ?'); params.push(operacion); }

    const [rows] = await pool.execute(
      `SELECT \`Id Vinculación\` AS id_vinculacion, Trabajador, Identificación AS identificacion, Cargo, Operación, Regional
       FROM \`Maestro_Vinculación\`
       WHERE ${conds.join(' AND ')}
       ORDER BY Operación, Trabajador`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('[participacion] GET /api/trabajadores:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/permisos ═════
// Permisos del rol en la pestaña (botón "Nueva Asistencia") y su código de acceso.
router.get('/api/permisos', async (req, res) => {
  try {
    const perfil = perfilDeReq(req);
    const acceso = await computarAccesoParticipacion(req.query.usuario, perfil);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });
    const params = await obtenerParametrosParticipacion(perfil.modulo);
    res.json({
      ok: true,
      permisos: await permisosParticipacion(acceso.rol, params),
      accesoCodigo: acceso.accesoCodigo,
      notificacionesHabilitadas: notificacionesHabilitadas(params),
      usuarioNombre: nombreLimpio(acceso.usuarioNombre),
    });
  } catch (err) {
    console.error('[participacion] GET /api/permisos:', err);
    res.status(500).json({ error: err.message });
  }
});

// Firma del evaluador de eficacia: Maestro_Usuarios.Colaborador → Maestro_Segmentación.Trabajador
// → Identificación → firma más reciente del bucket de firmas (si no está en Segmentación, se
// busca en Maestro_Vinculación). Devuelve { identificacion, url } o null.
async function firmaDelUsuario(usuarioId) {
  const [[u]] = await pool.execute('SELECT Colaborador FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuarioId]);
  if (!u || !u.Colaborador) return null;
  let [[fila]] = await pool.execute(
    'SELECT `Identificación` AS identificacion FROM `Maestro_Segmentación` WHERE Trabajador = ? LIMIT 1',
    [u.Colaborador]
  );
  if (!fila) {
    [[fila]] = await pool.execute(
      'SELECT `Identificación` AS identificacion FROM `Maestro_Vinculación` WHERE Trabajador = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [u.Colaborador]
    );
  }
  if (!fila || !fila.identificacion) return null;
  const url = await obtenerUrlFirmaReciente(String(fila.identificacion)).catch(() => null);
  return url ? { identificacion: String(fila.identificacion), url } : null;
}

// ═════ API: GET /api/firma-evaluador ═════
// Vista previa de la firma de quien va a registrar la evaluación de eficacia.
router.get('/api/firma-evaluador', async (req, res) => {
  try {
    const perfil = perfilDeReq(req);
    const acceso = await computarAccesoParticipacion(req.query.usuario, perfil);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });
    const firma = await firmaDelUsuario(acceso.usuarioId);
    const base64 = firma ? await descargarFirmaBase64PorUrl(firma.url).catch(() => null) : null;
    res.json({ ok: true, nombre: nombreLimpio(acceso.usuarioNombre), tieneFirma: !!base64, firmaBase64: base64 });
  } catch (err) {
    console.error('[participacion] GET /api/firma-evaluador:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── TalentHub: formatos con asistentes de varias operaciones ─────────────────
// Un formato cuenta (y se filtra) por cada Regional y Operación de sus asistentes.
// Estado: PENDIENTE (sin PDF), EVALUAR (con PDF, falta la evaluación de eficacia) o
// COMPLETADO (con PDF y evaluación).
const SQL_ESTADO_TH = `CASE WHEN a.url_doc IS NULL OR a.url_doc = '' THEN 'PENDIENTE'
                            WHEN a.formacion_eficaz IS NULL THEN 'EVALUAR' ELSE 'COMPLETADO' END`;

function condicionesVariasOperaciones(acceso, query) {
  const conds = ['a.modulo = ?'];
  const params = [acceso.perfil.modulo];
  if (!acceso.sinFiltro) {
    if (!acceso.operacionesFiltro.length) {
      conds.push('a.usuario = ?');
      params.push(acceso.usuarioId);
    } else {
      conds.push(`(a.usuario = ? OR EXISTS (SELECT 1 FROM Dynamic_formato_itemsAsistencia ia
                    WHERE ia.id_asistencia = a.id_asistencia AND ia.operacion IN (${acceso.operacionesFiltro.map(() => '?').join(',')})))`);
      params.push(acceso.usuarioId, ...acceso.operacionesFiltro);
    }
  }
  const search = query.tema || query.q || query.search;
  if (search) {
    conds.push('(a.tema LIKE ? OR u.Nombre LIKE ? OR a.lugar LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (query.fechaDesde) { conds.push('a.fecha >= ?'); params.push(query.fechaDesde); }
  if (query.fechaHasta) { conds.push('a.fecha <= ?'); params.push(query.fechaHasta); }
  return { conds, params };
}

async function listarVariasOperaciones(acceso, query) {
  const { conds, params } = condicionesVariasOperaciones(acceso, query);
  if (query.regional) {
    conds.push('EXISTS (SELECT 1 FROM Dynamic_formato_itemsAsistencia ir WHERE ir.id_asistencia = a.id_asistencia AND ir.regional = ?)');
    params.push(query.regional);
  }
  if (query.operacion) {
    conds.push('EXISTS (SELECT 1 FROM Dynamic_formato_itemsAsistencia io WHERE io.id_asistencia = a.id_asistencia AND io.operacion = ?)');
    params.push(query.operacion);
  }
  if (['PENDIENTE', 'EVALUAR', 'COMPLETADO'].includes(query.estado)) {
    conds.push(`${SQL_ESTADO_TH} = ?`);
    params.push(query.estado);
  }
  const [rows] = await pool.execute(
    `SELECT a.id_asistencia, a.tema, a.fecha, a.hora_inicial, a.hora_final, a.duracion, a.lugar, a.objetivo,
            a.url_doc, a.usuario, a.fecha_creacion, a.formacion_eficaz, a.fecha_evaluacion,
            ${SQL_ESTADO_TH} AS estado_doc,
            u.Nombre AS nombre_responsable,
            it.regionales AS regional_responsable,
            it.operaciones AS operacion_responsable,
            COALESCE(it.total_asistentes, 0) AS total_asistentes
     FROM Dynamic_formato_asistencia a
     LEFT JOIN Maestro_Usuarios u ON a.usuario = u.ID
     LEFT JOIN (
       SELECT id_asistencia,
              GROUP_CONCAT(DISTINCT regional ORDER BY regional SEPARATOR ', ') AS regionales,
              GROUP_CONCAT(DISTINCT operacion ORDER BY operacion SEPARATOR ', ') AS operaciones,
              COUNT(*) AS total_asistentes
       FROM Dynamic_formato_itemsAsistencia
       WHERE id_asistencia IN (SELECT id_asistencia FROM Dynamic_formato_asistencia WHERE modulo = ?)
       GROUP BY id_asistencia
     ) it ON it.id_asistencia = a.id_asistencia
     WHERE ${conds.join(' AND ')}
     ORDER BY a.fecha_creacion DESC, a.id_asistencia DESC`,
    [acceso.perfil.modulo, ...params]
  );
  return rows;
}

// Conteos de los filtros: cada formato se cuenta una vez por Regional / Operación de sus
// asistentes, respetando los demás filtros escogidos.
async function conteosVariasOperaciones(acceso, query) {
  const { conds, params } = condicionesVariasOperaciones(acceso, query);
  const [rows] = await pool.execute(
    `SELECT DISTINCT a.id_asistencia, ${SQL_ESTADO_TH} AS estado_doc, i.regional, i.operacion
     FROM Dynamic_formato_asistencia a
     LEFT JOIN Maestro_Usuarios u ON a.usuario = u.ID
     INNER JOIN Dynamic_formato_itemsAsistencia i ON i.id_asistencia = a.id_asistencia
     WHERE ${conds.join(' AND ')}`,
    params
  );

  const porFormato = new Map(); // id → { estado, regionales:Set, operaciones:Set }
  rows.forEach((r) => {
    if (!porFormato.has(r.id_asistencia)) porFormato.set(r.id_asistencia, { estado: r.estado_doc, regionales: new Set(), operaciones: new Set() });
    const f = porFormato.get(r.id_asistencia);
    if (r.regional) f.regionales.add(r.regional);
    if (r.operacion) f.operaciones.add(r.operacion);
  });

  const { regional, operacion, estado } = query;
  const okReg = (f) => !regional || f.regionales.has(regional);
  const okOp = (f) => !operacion || f.operaciones.has(operacion);
  const okEst = (f) => !estado || f.estado === estado;
  const regionales = {};
  const operaciones = {};
  const estados = { COMPLETADO: 0, EVALUAR: 0, PENDIENTE: 0 };
  porFormato.forEach((f) => {
    if (okOp(f) && okEst(f)) f.regionales.forEach((r) => { regionales[r] = (regionales[r] || 0) + 1; });
    if (okReg(f) && okEst(f)) f.operaciones.forEach((o) => { operaciones[o] = (operaciones[o] || 0) + 1; });
    if (okReg(f) && okOp(f)) estados[f.estado] = (estados[f.estado] || 0) + 1;
  });
  return { regionales, operaciones, estados };
}

// ═════ API: GET /api/conteos-filtros ═════
router.get('/api/conteos-filtros', async (req, res) => {
  try {
    const { usuario, tema, regional, operacion, fechaDesde, fechaHasta, estado } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const perfil = perfilDeReq(req);
    const acceso = await computarAccesoParticipacion(usuario, perfil);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }
    if (perfil.variasOperaciones) return res.json(await conteosVariasOperaciones(acceso, req.query));

    const baseConds = ["a.modulo = 'sst'"];
    const baseParams = [];

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json({ regionales: {}, operaciones: {}, estados: { COMPLETADO: 0, PENDIENTE: 0 } });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      baseConds.push(`(COALESCE(item_reg.operacion, u.\`Operación\`) IN (${ph}) OR a.usuario = ?)`);
      baseParams.push(...acceso.operacionesFiltro, usuario);
    }

    const sharedConds = [];
    const sharedParams = [];

    const search = tema || req.query.q || req.query.search;
    if (search) {
      sharedConds.push('(a.tema LIKE ? OR u.Nombre LIKE ? OR a.lugar LIKE ?)');
      sharedParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (fechaDesde) {
      sharedConds.push('a.fecha >= ?');
      sharedParams.push(fechaDesde);
    }
    if (fechaHasta) {
      sharedConds.push('a.fecha <= ?');
      sharedParams.push(fechaHasta);
    }

    // Consulta consolidada para Regionales, Operaciones y Estados
    const combConds = [...baseConds, ...sharedConds];
    const combParams = [...baseParams, ...sharedParams];
    const combWhere = combConds.length ? 'WHERE ' + combConds.join(' AND ') : '';

    const [combRows] = await pool.execute(
      `SELECT CASE WHEN a.url_doc IS NOT NULL AND a.url_doc != '' THEN 'COMPLETADO' ELSE 'PENDIENTE' END AS estado_doc,
              COALESCE(item_reg.regional, u.Regional) AS Regional,
              COALESCE(item_reg.operacion, u.\`Operación\`) AS operacion,
              COUNT(*) AS total
       FROM Dynamic_formato_asistencia a
       LEFT JOIN Maestro_Usuarios u ON a.usuario = u.ID
       LEFT JOIN (
         SELECT id_asistencia, MAX(regional) as regional, MAX(operacion) as operacion
         FROM Dynamic_formato_itemsAsistencia
         GROUP BY id_asistencia
       ) item_reg ON item_reg.id_asistencia = a.id_asistencia
       ${combWhere}
       GROUP BY CASE WHEN a.url_doc IS NOT NULL AND a.url_doc != '' THEN 'COMPLETADO' ELSE 'PENDIENTE' END,
                COALESCE(item_reg.regional, u.Regional),
                COALESCE(item_reg.operacion, u.\`Operación\`)`,
      combParams
    );

    const regionales = {};
    const operaciones = {};
    const estados = { COMPLETADO: 0, PENDIENTE: 0 };

    combRows.forEach(r => {
      if ((!operacion || r.operacion === operacion) && (!estado || r.estado_doc === estado)) {
        if (r.Regional) {
          regionales[r.Regional] = (regionales[r.Regional] || 0) + r.total;
        }
      }
      if ((!regional || r.Regional === regional) && (!estado || r.estado_doc === estado)) {
        if (r.operacion) {
          operaciones[r.operacion] = (operaciones[r.operacion] || 0) + r.total;
        }
      }
      if ((!regional || r.Regional === regional) && (!operacion || r.operacion === operacion)) {
        if (r.estado_doc) {
          estados[r.estado_doc] = (estados[r.estado_doc] || 0) + r.total;
        }
      }
    });

    res.json({ regionales, operaciones, estados });
  } catch (err) {
    console.error('[participacion] GET /api/conteos-filtros:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/asistencias ═════
router.get('/api/asistencias', async (req, res) => {
  try {
    const { usuario, tema, regional, operacion, fechaDesde, fechaHasta, estado } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const perfil = perfilDeReq(req);
    const acceso = await computarAccesoParticipacion(usuario, perfil);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });
    if (perfil.variasOperaciones) return res.json(await listarVariasOperaciones(acceso, req.query));

    const conds = ["a.modulo = 'sst'"];
    const params = [];
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        conds.push('a.usuario = ?');
        params.push(usuario);
      } else {
        const ph = acceso.operacionesFiltro.map(() => '?').join(',');
        conds.push(`(COALESCE(item_reg.operacion, u.\`Operación\`) IN (${ph}) OR a.usuario = ?)`);
        params.push(...acceso.operacionesFiltro, usuario);
      }
    }
    const search = tema || req.query.q || req.query.search;
    if (search) {
      conds.push('(a.tema LIKE ? OR u.Nombre LIKE ? OR a.lugar LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (regional) {
      conds.push('COALESCE(item_reg.regional, u.Regional) = ?');
      params.push(regional);
    }
    if (operacion) {
      conds.push('COALESCE(item_reg.operacion, u.\`Operación\`) = ?');
      params.push(operacion);
    }
    if (fechaDesde) {
      conds.push('a.fecha >= ?');
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      conds.push('a.fecha <= ?');
      params.push(fechaHasta);
    }
    if (estado === 'COMPLETADO') {
      conds.push("(a.url_doc IS NOT NULL AND a.url_doc != '')");
    } else if (estado === 'PENDIENTE') {
      conds.push("(a.url_doc IS NULL OR a.url_doc = '')");
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT a.id_asistencia, a.tema, a.fecha, a.hora_inicial, a.hora_final, a.duracion, a.lugar, a.objetivo,
              a.url_doc, a.usuario, a.fecha_creacion,
              u.Nombre AS nombre_responsable,
              COALESCE(item_reg.regional, u.Regional) AS regional_responsable,
              COALESCE(item_reg.operacion, u.\`Operación\`) AS operacion_responsable,
              COALESCE(item_reg.total_asistentes, 0) AS total_asistentes
       FROM Dynamic_formato_asistencia a
       LEFT JOIN Maestro_Usuarios u ON a.usuario = u.ID
       LEFT JOIN (
         SELECT id_asistencia, MAX(regional) as regional, MAX(operacion) as operacion, COUNT(*) as total_asistentes
         FROM Dynamic_formato_itemsAsistencia
         GROUP BY id_asistencia
       ) item_reg ON item_reg.id_asistencia = a.id_asistencia
       ${where}
       ORDER BY a.fecha_creacion DESC, a.id_asistencia DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('[participacion] GET /api/asistencias:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/asistencia/:id ═════
// Estado de firma: FIRMADA (firmó en el enlace), CORREO_ENVIADO o PENDIENTE.
// No consulta el bucket de firmas (más rápido).
router.get('/api/asistencia/:id', async (req, res) => {
  try {
    const acceso = await computarAccesoParticipacion(req.query.usuario, perfilDeReq(req));
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });
    const f = await cargarFormato(acceso, req.params.id);
    if (f.error) return res.status(f.status).json({ error: f.error });

    // Evaluación de eficacia (TalentHub): nombre del evaluador y su firma guardada
    let evaluacion = null;
    if (f.evaluado) {
      const [[ev]] = await pool.execute('SELECT Nombre FROM Maestro_Usuarios WHERE ID = ?', [f.asistencia.evaluador]);
      const firmaBase64 = f.asistencia.firma_evaluador
        ? await descargarFirmaBase64PorUrl(f.asistencia.firma_evaluador).catch(() => null)
        : null;
      evaluacion = {
        formacion_eficaz: Number(f.asistencia.formacion_eficaz),
        resultado_evaluacion: f.asistencia.resultado_evaluacion || '',
        fecha_evaluacion: f.asistencia.fecha_evaluacion,
        accion_no_eficaz: f.asistencia.accion_no_eficaz || '',
        nombre_evaluador: nombreLimpio(ev && ev.Nombre) || f.asistencia.evaluador,
        fecha_registro_evaluacion: f.asistencia.fecha_registro_evaluacion,
        firmaBase64,
      };
    }

    const [items] = await pool.execute(
      `SELECT i.id_item_asistencia, i.id_asistencia, i.id_vinculacion, i.nombre_trabajador, i.identificacion,
              i.cargo, i.operacion, i.regional, i.firma_asistente, i.token_firma, i.fecha_envio_correo, i.fecha_firma,
              s.Celular AS celular, s.Email AS email
       FROM Dynamic_formato_itemsAsistencia i
       LEFT JOIN \`Maestro_Segmentación\` s ON s.Identificación = i.identificacion
       WHERE i.id_asistencia = ?
       ORDER BY i.id_item_asistencia`,
      [req.params.id]
    );
    if (f.permisos.enlaces) await asegurarTokens(items);
    const base = baseUrl(req);
    const salida = items.map(({ token_firma: token, firma_asistente: firma, ...item }) => ({
      ...item,
      tiene_firma: !!firma,
      estado_firma: firma ? 'FIRMADA' : (item.fecha_envio_correo ? 'CORREO_ENVIADO' : 'PENDIENTE'),
      enlace_firma: f.permisos.enlaces && !firma && token ? enlaceFirma(base, token) : null,
    }));

    const [evidencias] = await pool.execute(
      'SELECT id_evidencia, url_evidencia FROM Dynamic_formato_evidencias WHERE id_asistencia = ?',
      [req.params.id]
    );

    const { firma_evaluador: _firmaEv, ...datos } = f.asistencia;
    res.json({ ...datos, permisos: f.permisos, evaluacion, items: salida, asistentes: salida, evidencias });
  } catch (err) {
    console.error('[participacion] GET /api/asistencia/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

async function guardarEvidencias(conn, idAsistencia, evidencias, conservarExistentes) {
  if (!Array.isArray(evidencias)) return;
  for (const ev of evidencias) {
    if (conservarExistentes && ev.url_evidencia) {
      await conn.execute('INSERT INTO Dynamic_formato_evidencias (id_asistencia, url_evidencia) VALUES (?, ?)', [idAsistencia, ev.url_evidencia]);
    } else if (ev.base64) {
      const buffer = Buffer.from(ev.base64.replace(/^data:.*;base64,/, ''), 'base64');
      const urlGcs = await subirEvidenciaAsistencia(idAsistencia, ev.filename, buffer, ev.contentType);
      await conn.execute('INSERT INTO Dynamic_formato_evidencias (id_asistencia, url_evidencia) VALUES (?, ?)', [idAsistencia, urlGcs]);
    }
  }
}

async function insertarAsistente(conn, idAsistencia, idVinculacion) {
  const [vinRows] = await conn.execute(
    'SELECT Trabajador, Identificación, Cargo, Operación, Regional FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ? LIMIT 1',
    [idVinculacion]
  );
  if (!vinRows.length) return null;
  const v = vinRows[0];
  const [r] = await conn.execute(
    `INSERT INTO Dynamic_formato_itemsAsistencia
       (id_asistencia, id_vinculacion, nombre_trabajador, identificacion, cargo, operacion, regional, token_firma)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [idAsistencia, idVinculacion, v.Trabajador, v.Identificación, v.Cargo || '', v.Operación, v.Regional, nuevoToken()]
  );
  return r.insertId;
}

// TalentHub: los asistentes nuevos deben ser de operaciones que el usuario puede ver.
// Devuelve el mensaje de error o null. (En SST no se valida, como antes.)
async function asistentesFueraDeAlcance(acceso, idsVinculacion, yaEstaban = new Set()) {
  if (!acceso.perfil.variasOperaciones || acceso.sinFiltro) return null;
  const nuevos = [...new Set((idsVinculacion || []).map(String))].filter((id) => !yaEstaban.has(id));
  if (!nuevos.length) return null;
  const [rows] = await pool.query(
    'SELECT `Id Vinculación` AS id, `Operación` AS operacion FROM `Maestro_Vinculación` WHERE `Id Vinculación` IN (?)',
    [nuevos]
  );
  const permitidas = acceso.operacionesFiltro || [];
  const fuera = rows.filter((r) => !permitidas.includes(r.operacion));
  return fuera.length ? `Hay ${fuera.length} asistente(s) de operaciones que su usuario no tiene asignadas.` : null;
}

// ═════ API: POST /api/asistencias ═════
// Crea el formato y envía a cada asistente el correo para firmar.
router.post('/api/asistencias', async (req, res) => {
  const { tema, fecha, hora_inicial, hora_final, lugar, objetivo, usuario, asistentes, evidencias } = req.body;
  if (!tema || !fecha || !hora_inicial || !hora_final || !lugar || !usuario) {
    return res.status(400).json({ error: 'Faltan campos requeridos en la información básica.' });
  }
  const hoyBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (String(fecha).slice(0, 10) > hoyBogota) {
    return res.status(400).json({ error: 'La fecha de la actividad no puede ser superior a la fecha actual.' });
  }
  if (!Array.isArray(asistentes) || asistentes.length === 0) {
    return res.status(400).json({ error: 'Debe incluir al menos un asistente.' });
  }
  const perfil = perfilDeReq(req);
  const acceso = await computarAccesoParticipacion(usuario, perfil).catch(() => null);
  if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });
  if (!(await permisosParticipacion(acceso.rol, null, perfil.modulo)).crear) {
    return res.status(403).json({ error: `Su rol no tiene permiso para crear formatos en ${perfil.nombre}` });
  }
  const fueraDeAlcance = await asistentesFueraDeAlcance(acceso, asistentes);
  if (fueraDeAlcance) return res.status(403).json({ error: fueraDeAlcance });

  const conn = await pool.getConnection();
  let idAsistencia;
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO Dynamic_formato_asistencia (tema, fecha, hora_inicial, hora_final, lugar, objetivo, responsable, usuario, modulo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tema, fecha, hora_inicial, hora_final, lugar, objetivo || '', usuario, usuario, perfil.modulo]
    );
    idAsistencia = result.insertId;
    for (const idVinculacion of [...new Set(asistentes)]) await insertarAsistente(conn, idAsistencia, idVinculacion);
    await guardarEvidencias(conn, idAsistencia, evidencias, false);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error('[participacion] POST /api/asistencias:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }

  let correos = { enviados: 0, sinCorreo: 0 };
  try {
    correos = await enviarSolicitudesFirma(idAsistencia, baseUrl(req));
  } catch (err) {
    console.error('[participacion] Error enviando correos de firma:', err.message);
  }
  res.status(201).json({ ok: true, id_asistencia: idAsistencia, correos });
});

// ═════ API: PUT /api/asistencia/:id ═════
// Conserva a los asistentes que siguen (con su firma, clave y envío) y envía correo a los nuevos.
router.put('/api/asistencia/:id', async (req, res) => {
  const { id } = req.params;
  const { tema, fecha, hora_inicial, hora_final, lugar, objetivo, usuario, asistentes, evidencias } = req.body;
  if (!tema || !fecha || !hora_inicial || !hora_final || !lugar || !usuario) {
    return res.status(400).json({ error: 'Faltan campos requeridos en la información básica.' });
  }
  const hoyBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (String(fecha).slice(0, 10) > hoyBogota) {
    return res.status(400).json({ error: 'La fecha de la actividad no puede ser superior a la fecha actual.' });
  }
  if (!Array.isArray(asistentes) || asistentes.length === 0) {
    return res.status(400).json({ error: 'Debe incluir al menos un asistente.' });
  }
  const acceso = await computarAccesoParticipacion(usuario, perfilDeReq(req)).catch(() => null);
  if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });
  const f = await cargarFormato(acceso, id);
  if (f.error) return res.status(f.status).json({ error: f.error });
  if (f.evaluado) {
    if (!f.permisos.editar) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para editar un registro de asistencia que ya tiene la evaluación de eficacia.' });
    }
  } else if (f.asistencia.url_doc) {
    if (!f.permisos.editar) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para editar y regenerar el PDF de un formato de asistencia ya firmado.' });
    }
  } else if (!f.permisos.editar) {
    return res.status(403).json({ error: 'Su rol no tiene permiso para editar este formato' });
  }
  const [yaEstaban] = await pool.execute('SELECT id_vinculacion FROM Dynamic_formato_itemsAsistencia WHERE id_asistencia = ?', [id]);
  const fueraDeAlcance = await asistentesFueraDeAlcance(acceso, asistentes, new Set(yaEstaban.map((r) => String(r.id_vinculacion))));
  if (fueraDeAlcance) return res.status(403).json({ error: fueraDeAlcance });

  const conn = await pool.getConnection();
  const nuevos = [];
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE Dynamic_formato_asistencia
       SET tema = ?, fecha = ?, hora_inicial = ?, hora_final = ?, lugar = ?, objetivo = ?
       WHERE id_asistencia = ?`,
      [tema, fecha, hora_inicial, hora_final, lugar, objetivo || '', id]
    );

    const [actuales] = await conn.execute(
      'SELECT id_item_asistencia, id_vinculacion FROM Dynamic_formato_itemsAsistencia WHERE id_asistencia = ?',
      [id]
    );
    const lista = [...new Set(asistentes.map(String))];
    const quitar = actuales.filter((r) => !lista.includes(String(r.id_vinculacion)));
    if (quitar.length) {
      await conn.execute(
        `DELETE FROM Dynamic_formato_itemsAsistencia WHERE id_item_asistencia IN (${quitar.map(() => '?').join(',')})`,
        quitar.map((r) => r.id_item_asistencia)
      );
    }
    const existentes = new Set(actuales.map((r) => String(r.id_vinculacion)));
    for (const idVinculacion of lista) {
      if (existentes.has(idVinculacion)) continue;
      const idItem = await insertarAsistente(conn, id, idVinculacion);
      if (idItem) nuevos.push(idItem);
    }

    await conn.execute('DELETE FROM Dynamic_formato_evidencias WHERE id_asistencia = ?', [id]);
    await guardarEvidencias(conn, id, evidencias, true);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error('[participacion] PUT /api/asistencia/:id:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }

  let correos = { enviados: 0, sinCorreo: 0 };
  if (nuevos.length) {
    try {
      correos = await enviarSolicitudesFirma(id, baseUrl(req), nuevos);
    } catch (err) {
      console.error('[participacion] Error enviando correos de firma:', err.message);
    }
  }

  let urlDoc = f.asistencia.url_doc || null;
  if (f.asistencia.url_doc) {
    try {
      const pdfRes = await generarPDFAsistencia(id, { usuarioId: acceso.usuarioId });
      urlDoc = pdfRes.urlGeneral;
    } catch (err) {
      console.error('[participacion] Error regenerando PDF tras edición:', err);
    }
  }

  res.json({ ok: true, id_asistencia: id, correos, url_doc: urlDoc });
});

// ═════ API: DELETE /api/asistencia/:id ═════
router.delete('/api/asistencia/:id', async (req, res) => {
  const { id } = req.params;
  const acceso = await computarAccesoParticipacion(req.query.usuario, perfilDeReq(req)).catch(() => null);
  if (!acceso) return res.status(403).json({ error: 'Usuario no autenticado o no autorizado.' });
  const f = await cargarFormato(acceso, id);
  if (f.error) return res.status(f.status).json({ error: f.error });
  if (f.evaluado) {
    if (!f.permisos.eliminar) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para eliminar registros de asistencia que ya tienen la evaluación de eficacia.' });
    }
  } else if (f.asistencia.url_doc) {
    if (!f.permisos.eliminar) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para eliminar formatos de asistencia que ya tienen documento PDF generado.' });
    }
  } else if (!f.permisos.eliminar) {
    return res.status(403).json({ error: 'Su rol no tiene permiso para eliminar este formato.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM Dynamic_formato_itemsAsistencia WHERE id_asistencia = ?', [id]);
    await conn.execute('DELETE FROM Dynamic_formato_evidencias WHERE id_asistencia = ?', [id]);
    await conn.execute('DELETE FROM Dynamic_formato_asistencia WHERE id_asistencia = ?', [id]);
    if (f.asistencia.id_doc_empresa) {
      await conn.execute('DELETE FROM Maestro_docEmpresa WHERE id = ?', [f.asistencia.id_doc_empresa]);
    }
    await conn.commit();
    res.json({ ok: true, id_asistencia: id });
  } catch (err) {
    await conn.rollback();
    console.error('[participacion] DELETE /api/asistencia/:id:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ═════ API: PATCH /api/asistencia/:id/guardar-contacto ═════
router.patch('/api/asistencia/:id/guardar-contacto', async (req, res) => {
  try {
    const { identificacion, celular, email } = req.body;
    if (!identificacion) {
      return res.status(400).json({ error: 'identificacion requerida' });
    }

    await pool.execute(
      `INSERT INTO \`Maestro_Segmentación\` (Identificación, Celular, Email)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE Celular = ?, Email = ?`,
      [identificacion, celular || null, email || null, celular || null, email || null]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[participacion] PATCH /api/asistencia/:id/guardar-contacto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/asistencia/:id/enviar-notificacion ═════
// Reenvía el correo para firmar (a uno o a todos los que no han firmado).
router.post('/api/asistencia/:id/enviar-notificacion', async (req, res) => {
  try {
    const { id } = req.params;
    const { id_item_asistencia, enviarATodos } = req.body || {};
    const acceso = await computarAccesoParticipacion(req.query.usuario || (req.body || {}).usuario, perfilDeReq(req));
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });
    const f = await cargarFormato(acceso, id);
    if (f.error) return res.status(f.status).json({ error: f.error });
    if (!f.permisos.enlaces) return res.status(403).json({ error: 'Su rol no tiene permiso para enviar enlaces de firma de este formato' });
    if (f.asistencia.url_doc && !enviarATodos && !id_item_asistencia) return res.status(400).json({ error: 'Nada que enviar' });

    const r = await enviarSolicitudesFirma(id, baseUrl(req), enviarATodos ? null : [id_item_asistencia]);
    if (r.deshabilitado) return res.status(400).json({ error: `Las notificaciones de correo de ${acceso.perfil.nombre} están deshabilitadas (Config_Parametros).` });
    if (!enviarATodos && !r.enviados) {
      return res.status(400).json({ error: r.sinCorreo ? 'El asistente no tiene correo registrado.' : 'No se pudo enviar el correo (¿ya firmó?).' });
    }
    res.json({ ok: true, enviados: r.enviados, sinCorreo: r.sinCorreo });
  } catch (err) {
    console.error('[participacion] POST /api/asistencia/:id/enviar-notificacion:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/asistencia/:id/generar-pdf ═════
// Genera (o regenera y reemplaza) el PDF con todos los asistentes: firma de quienes firmaron y
// anotación de soporte por correo para los demás.
router.post('/api/asistencia/:id/generar-pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const acceso = await computarAccesoParticipacion(req.query.usuario || (req.body || {}).usuario, perfilDeReq(req));
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });
    const f = await cargarFormato(acceso, id);
    if (f.error) return res.status(f.status).json({ error: f.error });
    if (!f.permisos.generar) return res.status(403).json({ error: 'Su rol no tiene permiso para generar el PDF de este formato' });

    const result = await generarPDFAsistencia(id, { usuarioId: acceso.usuarioId });
    res.json({ ok: true, url_doc: result.urlGeneral, firmados: result.firmados, total: result.total, firmasCompletas: result.todasFirmadas });
  } catch (err) {
    console.error('[participacion] POST /api/asistencia/:id/generar-pdf:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: PUT /api/asistencia/:id/evaluacion (TalentHub) ═════
// Evaluación de Eficacia de la formación: solo con el PDF ya generado. Evaluador = usuario
// actual (su firma más reciente del bucket). Al guardar se regenera el PDF (reemplaza el
// anterior) con la sección de evaluación al final.
router.put('/api/asistencia/:id/evaluacion', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const perfil = perfilDeReq(req);
    if (!perfil.evaluacion) return res.status(400).json({ error: 'Esta pestaña no tiene evaluación de eficacia.' });
    const acceso = await computarAccesoParticipacion(req.query.usuario || body.usuario, perfil);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });
    const f = await cargarFormato(acceso, id);
    if (f.error) return res.status(f.status).json({ error: f.error });
    if (!f.asistencia.url_doc) return res.status(400).json({ error: 'Primero genere el PDF del registro de asistencia.' });
    if (!f.permisos.evaluar) {
      return res.status(403).json({ error: f.evaluado
        ? 'Tu rol no tiene permiso para editar la evaluación de eficacia.'
        : 'Tu rol no tiene permiso para registrar la evaluación de eficacia de este registro.' });
    }

    const eficaz = String(body.formacion_eficaz);
    if (!['0', '1'].includes(eficaz)) return res.status(400).json({ error: 'Indique si la formación fue eficaz (Sí o No).' });
    const resultado = String(body.resultado_evaluacion || '').trim();
    const accion = String(body.accion_no_eficaz || '').trim();
    const fechaEval = String(body.fecha_evaluacion || '').slice(0, 10);
    if (!resultado) return res.status(400).json({ error: 'Escriba el resultado de la evaluación de la eficacia de la formación.' });
    if (eficaz === '0' && !accion) return res.status(400).json({ error: 'Si la formación no fue eficaz, escriba la acción a seguir.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEval)) return res.status(400).json({ error: 'Indique la fecha de la evaluación.' });
    const hoyBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (fechaEval > hoyBogota) return res.status(400).json({ error: 'La fecha de la evaluación no puede ser superior a la fecha actual.' });
    const fechaActividad = f.asistencia.fecha ? (typeof f.asistencia.fecha === 'string'
      ? f.asistencia.fecha.slice(0, 10)
      : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(f.asistencia.fecha)) : '';
    if (fechaActividad && fechaEval < fechaActividad) {
      return res.status(400).json({ error: 'La fecha de la evaluación no puede ser anterior a la fecha de la actividad.' });
    }

    const firma = await firmaDelUsuario(acceso.usuarioId);
    if (!firma) {
      return res.status(400).json({ error: 'No se encontró su firma registrada. Regístrela en su perfil y vuelva a intentarlo.' });
    }

    await pool.execute(
      `UPDATE Dynamic_formato_asistencia
       SET formacion_eficaz = ?, resultado_evaluacion = ?, fecha_evaluacion = ?, accion_no_eficaz = ?,
           evaluador = ?, firma_evaluador = ?, fecha_registro_evaluacion = NOW()
       WHERE id_asistencia = ?`,
      [Number(eficaz), resultado.slice(0, 5000), fechaEval, accion.slice(0, 5000) || null, acceso.usuarioId, firma.url, id]
    );

    const result = await generarPDFAsistencia(id, { usuarioId: acceso.usuarioId });
    res.json({ ok: true, url_doc: result.urlGeneral });
  } catch (err) {
    console.error('[participacion] PUT /api/asistencia/:id/evaluacion:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ Regenerar los PDF que tienen asistentes sin firma (una sola vez) ═════
// Formatos con PDF anterior (no REGASIS) y asistentes sin firmar.
router.get('/api/pdfs-con-pendientes', async (req, res) => {
  try {
    const acceso = await computarAccesoParticipacion(req.query.usuario);
    if (!acceso || !(await permisosParticipacion(acceso.rol)).generarCualquiera) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const [rows] = await pool.execute(
      `SELECT a.id_asistencia
       FROM Dynamic_formato_asistencia a
       WHERE a.modulo = 'sst' AND a.url_doc IS NOT NULL AND a.url_doc NOT LIKE '%/general/REGASIS.%'
         AND EXISTS (SELECT 1 FROM Dynamic_formato_itemsAsistencia i WHERE i.id_asistencia = a.id_asistencia AND i.firma_asistente IS NULL)
       ORDER BY a.id_asistencia`
    );
    res.json({ ok: true, ids: rows.map((r) => r.id_asistencia) });
  } catch (err) {
    console.error('[participacion] GET /api/pdfs-con-pendientes:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/regenerar-pdfs', async (req, res) => {
  const acceso = await computarAccesoParticipacion(req.query.usuario).catch(() => null);
  if (!acceso || !(await permisosParticipacion(acceso.rol)).generarCualquiera) {
    return res.status(403).send('<h2>No autorizado</h2>');
  }
  const usuario = JSON.stringify(String(req.query.usuario));
  res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Regenerar PDF de Participación</title>
<style>body{font-family:Arial,sans-serif;max-width:640px;margin:30px auto;padding:0 16px;color:#222}
button{background:#1B2A5E;color:#fff;border:0;border-radius:6px;padding:12px 20px;font-size:1rem;cursor:pointer}
button:disabled{opacity:.5}#log{font-size:.85rem;margin-top:16px;max-height:340px;overflow:auto;background:#f6f7fb;padding:10px;border-radius:6px}</style></head>
<body><h2>Regenerar PDF de Participación</h2>
<p>Formatos con PDF anterior y asistentes sin firma. Se regeneran con la anotación de soporte por correo electrónico
y se guardan en <code>talenthub_central/general</code> (Maestro_docEmpresa, tipo 89).</p>
<p id="estado">Buscando formatos...</p><button id="btn" disabled>Regenerar</button><div id="log"></div>
<script>
const usuario=${usuario};let ids=[];
const estado=document.getElementById('estado'),btn=document.getElementById('btn'),log=document.getElementById('log');
fetch('/participacion/api/pdfs-con-pendientes?usuario='+encodeURIComponent(usuario)).then(r=>r.json()).then(d=>{
  ids=d.ids||[];estado.textContent=ids.length+' formato(s) por regenerar.';btn.disabled=!ids.length;});
btn.onclick=async()=>{btn.disabled=true;let ok=0,err=0;
  for(const [i,id] of ids.entries()){
    estado.textContent='Regenerando '+(i+1)+' de '+ids.length+'...';
    try{const r=await fetch('/participacion/api/asistencia/'+id+'/generar-pdf?usuario='+encodeURIComponent(usuario),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      const d=await r.json();if(r.ok&&d.ok){ok++;log.insertAdjacentHTML('afterbegin','<div>#'+id+' ✓ '+d.firmados+'/'+d.total+' firmados</div>');}
      else{err++;log.insertAdjacentHTML('afterbegin','<div style="color:#b00">#'+id+' ✗ '+(d.error||r.status)+'</div>');}
    }catch(e){err++;log.insertAdjacentHTML('afterbegin','<div style="color:#b00">#'+id+' ✗ red</div>');}
  }
  estado.textContent='Terminado: '+ok+' regenerados, '+err+' con error.'+(err?' Puede volver a cargar la página para reintentar los que fallaron.':'');};
</script></body></html>`);
});

// ═════ PÁGINA DE FIRMA DEL ASISTENTE ═════
// Enlace con clave única: /participacion/firmar?t=<clave>
function paginaMensaje(titulo, texto) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)} — LOG&SER</title></head>
<body style="font-family:Arial,sans-serif;background:#f4f6f9;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:15px">
<div style="background:#fff;border-radius:8px;box-shadow:0 4px 15px rgba(0,0,0,.08);max-width:460px;padding:28px;border-top:5px solid #1B2A5E;text-align:center">
<img src="https://storage.googleapis.com/logyser-recibo-public/Logyser%20sin%20Nit.png" alt="LOG&SER" style="height:44px;margin-bottom:12px">
<h2 style="color:#1a1a2e;font-size:1.1rem">${esc(titulo)}</h2><p style="color:#555;font-size:.92rem;line-height:1.5">${esc(texto)}</p></div></body></html>`;
}

router.get('/firmar', async (req, res) => {
  try {
    const token = String(req.query.t || '').trim();
    if (!token) {
      return res.status(410).send(paginaMensaje('Enlace no válido',
        'Este enlace de firma ya no está vigente. Solicite al responsable de la actividad que le envíe un nuevo enlace.'));
    }

    const [[ast]] = await pool.execute(
      `SELECT i.id_item_asistencia, i.nombre_trabajador, i.identificacion, i.cargo, i.firma_asistente,
              a.tema, a.fecha, a.lugar, u.Nombre AS nombre_responsable
       FROM Dynamic_formato_itemsAsistencia i
       INNER JOIN Dynamic_formato_asistencia a ON i.id_asistencia = a.id_asistencia
       LEFT JOIN Maestro_Usuarios u ON a.usuario = u.ID
       WHERE i.token_firma = ? LIMIT 1`,
      [token]
    );
    if (!ast) return res.status(404).send(paginaMensaje('Enlace no válido', 'No se encontró el registro de asistencia de este enlace.'));

    const yaFirmo = !!ast.firma_asistente;
    const firmaBase64 = yaFirmo ? null : await obtenerFirmaBase64Reciente(ast.identificacion).catch(() => null);
    const config = JSON.stringify({
      token,
      yaFirmo,
      tema: ast.tema,
      fecha: ast.fecha,
      lugar: ast.lugar,
      nombre_responsable: ast.nombre_responsable,
      nombre_trabajador: ast.nombre_trabajador,
      identificacion: ast.identificacion,
      cargo: ast.cargo,
      firmaBase64,
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(fs.readFileSync(HTML_SIGN_PATH, 'utf8').replace('__CONFIG_FIRMA__', config));
  } catch (err) {
    console.error('[participacion] GET /firmar:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// El asistente firma: usa su firma registrada o dibuja una nueva.
// Si ya todos firmaron, o si el PDF ya existía, se genera / reemplaza el PDF.
router.post('/api/firmar-asistente', async (req, res) => {
  try {
    const { token, firmaBase64, aceptarExistente } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Enlace no válido' });

    const [[itemInfo]] = await pool.execute(
      'SELECT id_item_asistencia, id_asistencia, identificacion, firma_asistente FROM Dynamic_formato_itemsAsistencia WHERE token_firma = ? LIMIT 1',
      [String(token)]
    );
    if (!itemInfo) return res.status(404).json({ error: 'Registro no encontrado' });
    if (itemInfo.firma_asistente) return res.status(409).json({ error: 'Ya había registrado su firma.' });

    let urlFirma = null;
    if (aceptarExistente) {
      urlFirma = await obtenerUrlFirmaReciente(itemInfo.identificacion).catch(() => null);
      if (!urlFirma) return res.status(400).json({ error: 'No tiene una firma registrada; por favor dibuje su firma.' });
    } else {
      if (!firmaBase64) return res.status(400).json({ error: 'Debe dibujar su firma.' });
      const buffer = Buffer.from(String(firmaBase64).replace(/^data:.*;base64,/, ''), 'base64');
      urlFirma = await subirFirma(itemInfo.identificacion, buffer);
    }

    const [upd] = await pool.execute(
      'UPDATE Dynamic_formato_itemsAsistencia SET firma_asistente = ?, fecha_firma = NOW() WHERE id_item_asistencia = ? AND firma_asistente IS NULL',
      [urlFirma, itemInfo.id_item_asistencia]
    );
    if (!upd.affectedRows) return res.status(409).json({ error: 'Ya había registrado su firma.' });

    const [[estado]] = await pool.execute(
      `SELECT (SELECT COUNT(*) FROM Dynamic_formato_itemsAsistencia WHERE id_asistencia = ? AND firma_asistente IS NULL) AS pendientes,
              (SELECT url_doc FROM Dynamic_formato_asistencia WHERE id_asistencia = ?) AS url_doc`,
      [itemInfo.id_asistencia, itemInfo.id_asistencia]
    );

    let pdfGenerado = false;
    if (Number(estado.pendientes) === 0 || estado.url_doc) {
      try {
        await generarPDFAsistencia(itemInfo.id_asistencia);
        pdfGenerado = true;
      } catch (pdfErr) {
        console.warn(`[participacion] No se pudo generar el PDF de la asistencia ${itemInfo.id_asistencia}:`, pdfErr.message);
      }
    }
    res.json({ ok: true, pdfGenerado });
  } catch (err) {
    console.error('[participacion] POST /api/firmar-asistente:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
