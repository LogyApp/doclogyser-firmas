// Nómina › Informes Disciplinarios: parámetros (Config_Parametros nomina / Informes Disciplinarios),
// firma de quien reporta, PDF con la plantilla 'informe_disciplinario' (Maestro_Plantillas, OP-R-010)
// y registro del documento 43 (Proceso Disciplinario, PDIS) en Maestro_docTrabajador.
// Rutas: src/routes/informesDisciplinarios.js. Pestaña: public/js/nomina-informes-disciplinarios.js.
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const { obtenerPlantilla, reemplazarVariables, firmaConFecha } = require('./plantilla');
const { generarPDF } = require('./renderer');
const { LOGO_BASE64 } = require('./assets');
const { subirPDFInformeDisciplinario, obtenerUrlFirmaReciente } = require('./storage');

const MODULO = 'nomina';
const SECCION = 'Informes Disciplinarios';
const ID_DOC_TRABAJADOR = 43;
const PREFIJO_DOC = 'PDIS';

const P = {
  VER_TODOS:   'Roles que ven todos los informes disciplinarios',
  CERRAR:      'Roles que pueden cerrar informes disciplinarios',
  TIPOS_FALTA: 'Tipos de falta',
  RESULTADOS:  'Resultados de cierre',
  DIAS_INMEDIATEZ: 'Días para aviso de inmediatez',
  HABILITAR:   'Habilitar notificaciones de correo en Informes Disciplinarios',
  NUEVO_PARA:  'Notificación nuevo informe disciplinario - Para:',
  NUEVO_COPIA: 'Notificación nuevo informe disciplinario - Copia:',
};

const DEFAULTS = {
  [P.VER_TODOS]:   'Juridica, Directorth, Sistema',
  [P.CERRAR]:      'Juridica, Sistema',
  [P.TIPOS_FALTA]: 'INASISTENCIA A TRABAJAR, LLEGADAS TARDE, AVERÍAS GENERADAS, FALTA DE RESPETO A LOS COMPAÑEROS O SUPERIORES, HURTO, PRESENTARSE AL TRABAJO BAJO LOS EFECTOS DE SUSTANCIAS, INCUMPLIMIENTO DE LAS ÓRDENES ASIGNADAS, BAJO RENDIMIENTO EN LA OPERACIÓN, TERMINACIÓN DE CONTRATO POR PERIODO DE PRUEBA, OTRO',
  [P.RESULTADOS]:  'LLAMADO DE ATENCIÓN, SUSPENSIÓN, TERMINACIÓN DE CONTRATO, ARCHIVADO SIN SANCIÓN',
  [P.DIAS_INMEDIATEZ]: '15',
  [P.HABILITAR]:   '1',
  [P.NUEVO_PARA]:  'Juridica',
  [P.NUEVO_COPIA]: 'Directorth, Sistema',
};

function normalizarTexto(valor) {
  return String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

async function obtenerParametros() {
  try {
    const [rows] = await pool.execute(
      'SELECT `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ?',
      [MODULO, SECCION]
    );
    const mapa = {};
    rows.forEach(r => { mapa[r.Concepto] = r.Parametro == null ? '' : String(r.Parametro); });
    return mapa;
  } catch (err) {
    console.error('[informesDisciplinarios] No se pudieron leer los parámetros, se usan los valores por defecto:', err.message);
    return {};
  }
}

function valor(params, concepto) {
  return Object.prototype.hasOwnProperty.call(params || {}, concepto) ? params[concepto] : DEFAULTS[concepto];
}

function lista(params, concepto) {
  return String(valor(params, concepto) || '').split(',').map(s => s.trim()).filter(Boolean);
}

function enLista(params, concepto, buscado) {
  if (!String(buscado || '').trim()) return false;
  const b = normalizarTexto(buscado);
  return lista(params, concepto).some(x => normalizarTexto(x) === b);
}

// Permisos y listas del formulario para el rol
async function configuracionDelRol(rol) {
  const p = await obtenerParametros();
  const dias = parseInt(valor(p, P.DIAS_INMEDIATEZ), 10);
  return {
    verTodos: enLista(p, P.VER_TODOS, rol),
    puedeCerrar: enLista(p, P.CERRAR, rol),
    tiposFalta: lista(p, P.TIPOS_FALTA),
    resultadosCierre: lista(p, P.RESULTADOS),
    diasInmediatez: dias > 0 ? dias : 0,
  };
}

// Para / Copia del correo de un informe nuevo (roles → Email de Maestro_Usuarios). Quien registra va en copia.
async function destinatariosNuevoInforme(emailRegistrador) {
  const p = await obtenerParametros();
  if (!['1', 'true', 'si', 'yes'].includes(normalizarTexto(valor(p, P.HABILITAR)))) return { habilitado: false, para: [], copia: [] };
  const correos = async (roles) => {
    const directos = roles.filter(r => r.includes('@'));
    const soloRoles = roles.filter(r => !r.includes('@'));
    if (!soloRoles.length) return directos;
    const [rows] = await pool.execute(
      `SELECT Email FROM Maestro_Usuarios WHERE Rol IN (${soloRoles.map(() => '?').join(',')}) AND Email IS NOT NULL AND Email <> ''`,
      soloRoles
    );
    return directos.concat(rows.map(r => r.Email));
  };
  const unicos = (arr) => [...new Map(arr.map(c => String(c || '').trim()).filter(Boolean).map(c => [c.toLowerCase(), c])).values()];
  const para = unicos(await correos(lista(p, P.NUEVO_PARA)));
  const enPara = new Set(para.map(c => c.toLowerCase()));
  const copia = unicos((await correos(lista(p, P.NUEVO_COPIA))).concat(emailRegistrador ? [emailRegistrador] : []))
    .filter(c => !enPara.has(c.toLowerCase()));
  return { habilitado: true, para, copia };
}

// Clave de la carpeta de firmas del usuario: la cédula de su Colaborador (Maestro_Segmentación o
// Maestro_Vinculación) o, si no tiene (p. ej. el usuario Sistema), 'usuario_<ID>'.
async function claveFirmaUsuario(usuarioId) {
  const [[u]] = await pool.execute('SELECT Colaborador FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuarioId]);
  const colaborador = u && u.Colaborador ? String(u.Colaborador).trim() : '';
  if (colaborador) {
    const cedula = colaborador.split(' ** ')[0].replace(/\D/g, '');
    if (cedula) return cedula;
    let [[fila]] = await pool.execute('SELECT `Identificación` AS id FROM `Maestro_Segmentación` WHERE Trabajador = ? LIMIT 1', [colaborador]);
    if (!fila) [[fila]] = await pool.execute('SELECT `Identificación` AS id FROM `Maestro_Vinculación` WHERE Trabajador = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1', [colaborador]);
    if (fila && fila.id) return String(fila.id);
  }
  return `usuario_${String(usuarioId).replace(/[^A-Za-z0-9_-]+/g, '_')}`;
}

async function urlFirmaRegistrada(usuarioId) {
  return obtenerUrlFirmaReciente(await claveFirmaUsuario(usuarioId)).catch(() => null);
}

// Funciones del cargo (pestaña Cargos y Funciones de Talent Hub: Config_Cargo_Funciones, sección FUNCION)
async function funcionesDelCargo(cargo) {
  if (!String(cargo || '').trim()) return [];
  try {
    const [rows] = await pool.execute(
      "SELECT Texto FROM Config_Cargo_Funciones WHERE TRIM(Cargo) = TRIM(?) AND Seccion = 'FUNCION' ORDER BY Orden, Id",
      [cargo]
    );
    return rows.map(r => String(r.Texto || '').trim()).filter(Boolean);
  } catch (err) {
    console.warn('[informesDisciplinarios] No se pudieron leer las funciones del cargo:', err.message);
    return [];
  }
}

function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fechaIso(v) {
  if (!v) return '';
  if (v instanceof Date) return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(v);
  const m = String(v).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}

function fechaLarga(v) {
  const iso = fechaIso(v);
  if (!iso) return '—';
  return new Date(`${iso}T12:00:00-05:00`).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });
}

function fechaHoraTexto(v) {
  if (!v) return '—';
  const d = v instanceof Date ? v : new Date(`${String(v).replace(' ', 'T')}-05:00`);
  if (isNaN(d)) return '—';
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

function radicado(idInforme) {
  return String(idInforme || '').replace(/-/g, '').slice(0, 8).toUpperCase();
}

function textoFalta(inf) {
  return normalizarTexto(inf.tipo_falta) === 'otro' && inf.tipo_falta_otro ? `OTRO: ${inf.tipo_falta_otro}` : (inf.tipo_falta || '—');
}

function parseFunciones(texto) {
  try { const a = JSON.parse(texto || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}

// Arma el PDF del informe y lo sube a la carpeta del trabajador. inf: fila de Dynamic_Informe_Disciplinario.
async function generarPdfInforme(inf) {
  const plantilla = await obtenerPlantilla('informe_disciplinario');
  const [evidencias] = await pool.execute(
    'SELECT url FROM Dynamic_Informe_Disciplinario_Evidencias WHERE id_informe = ? ORDER BY id_evidencia',
    [inf.id_informe]
  );
  const funciones = parseFunciones(inf.funciones);
  const seccionFunciones = funciones.length ? `
  <section class="section-block">
    <div class="section-title">Funciones principales del cargo</div>
    <div class="funciones-box"><ol class="funciones-list">${funciones.map(f => `<li>${esc(f)}</li>`).join('')}</ol></div>
  </section>` : '';

  let seccionEvidencias = '';
  if (evidencias.length || String(inf.comentarios_fotos || '').trim()) {
    const filas = [];
    for (let i = 0; i < evidencias.length; i += 3) {
      const celdas = evidencias.slice(i, i + 3).map(ev => `<td><div class="evidencia"><img src="${esc(ev.url)}" alt="Evidencia"></div></td>`);
      while (celdas.length < 3) celdas.push('<td></td>');
      filas.push(`<tr>${celdas.join('')}</tr>`);
    }
    seccionEvidencias = `
  <section class="section-block">
    <div class="section-title">Evidencias</div>
    ${filas.length ? `<table class="evidencias-grid">${filas.join('')}</table>` : ''}
    ${String(inf.comentarios_fotos || '').trim() ? `<div class="obs-box" style="margin-top:10px"><strong>Comentarios de las evidencias:</strong>\n${esc(inf.comentarios_fotos)}</div>` : ''}
  </section>`;
  }

  const firma = inf.url_firma
    ? firmaConFecha(`<img src="${esc(inf.url_firma)}" class="sig-img" alt="Firma">`, inf.fecha_firma)
    : '<span class="firma-nota">Sin firma</span>';

  const datos = {
    logo_src: LOGO_BASE64,
    radicado: radicado(inf.id_informe),
    fecha_registro: fechaHoraTexto(inf.fecha_registro || inf.fecha_firma),
    nombre_trabajador: esc(inf.nombre_trabajador) || '—',
    identificacion: esc(inf.identificacion) || '—',
    cargo_trabajador: esc(inf.cargo_trabajador) || '—',
    operacion: esc([inf.operacion, inf.regional ? `(${inf.regional})` : ''].filter(Boolean).join(' ')) || '—',
    fecha_ingreso: fechaLarga(inf.fecha_ingreso),
    fecha_informe: fechaLarga(inf.fecha_informe),
    fecha_hechos: fechaLarga(inf.fecha_hechos),
    tipo_falta: esc(textoFalta(inf)),
    nombre_reporta: esc(inf.nombre_reporta) || '—',
    cargo_reporta: esc(inf.cargo_reporta) || '',
    descripcion_hechos: esc(inf.descripcion_hechos) || '—',
    accion_inmediata: esc(inf.accion_inmediata) || '—',
    consecuencias: esc(inf.consecuencias) || '—',
    forma_conocimiento: esc(inf.forma_conocimiento) || '—',
    seccion_funciones: seccionFunciones,
    seccion_evidencias: seccionEvidencias,
    firma_reporta_html: firma,
  };
  const pdf = await generarPDF(reemplazarVariables(plantilla.contenido_html, datos));
  return subirPDFInformeDisciplinario(inf.identificacion, inf.id_informe, pdf);
}

// Documento 43 (Proceso Disciplinario) en Maestro_docTrabajador: lo reemplaza si ya estaba (regenerar)
async function registrarDocumentoTrabajador(inf, urlDoc, urlAnterior) {
  if (urlAnterior) {
    const [upd] = await pool.execute(
      'UPDATE Maestro_docTrabajador SET Doc = ? WHERE `Identificación` = ? AND Prefijo = ? AND Doc = ?',
      [urlDoc, inf.identificacion, PREFIJO_DOC, urlAnterior]
    );
    if (upd.affectedRows) return;
  }
  const [vin] = await pool.execute(
    'SELECT Regional, `Operación`, Estado, `Fecha de Ingreso` FROM `Maestro_Vinculación` WHERE `Identificación` = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
    [inf.identificacion]
  );
  const v = vin[0] || {};
  await pool.execute(
    `INSERT INTO Maestro_docTrabajador
       (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso, TipoDocumento, Prefijo, Doc, Observaciones, Usuario)
     VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), v.Regional || inf.regional || null, v['Operación'] || inf.operacion || null, inf.identificacion, v.Estado || null,
      v['Fecha de Ingreso'] || inf.fecha_ingreso || null, ID_DOC_TRABAJADOR, PREFIJO_DOC, urlDoc,
      `Informe disciplinario ${radicado(inf.id_informe)}`, String(inf.usuario || '').slice(0, 50)]
  );
}

module.exports = {
  PARAMETROS_INFORMES_DISCIPLINARIOS: P,
  ID_DOC_TRABAJADOR,
  PREFIJO_DOC,
  configuracionDelRol,
  destinatariosNuevoInforme,
  claveFirmaUsuario,
  urlFirmaRegistrada,
  funcionesDelCargo,
  generarPdfInforme,
  registrarDocumentoTrabajador,
  radicado,
  textoFalta,
  fechaLarga,
  fechaIso,
  normalizarTexto,
};
