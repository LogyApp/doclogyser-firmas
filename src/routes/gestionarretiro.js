const express = require('express');
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const pool    = require('../services/db');
const { reconstruirToken, generarTokenCT, generarTokenAR, generarTokenEMOE, generarTokenCRS, generarTokenPZ } = require('../services/token');
const { obtenerCondicionRetiro, obtenerEstadoLogysign, obtenerPrefijoDoc, ID_DOC_TCR, ID_DOC_TCRP, puedeGenerarDocumentosRetiro, obtenerPermisosRetiro, obtenerPendientesLegalizacion } = require('../services/configRetiro');
const { subirDocumentoRetiro } = require('../services/storage');
const { regenerarCertificadoRetiro } = require('./firmarcertificadoretiro');
const { regenerarAceptacionRenuncia } = require('./firmarenuncia');
const { regenerarPazYSalvoFinal } = require('./pazysalvoarea');

const router   = express.Router();
const DASHBOARD_HTML = path.join(__dirname, '../views/gestionarretiro/index.html');

// CR = Carta de Renuncia (doc 55, cargada manualmente). TCR/TCRP = Terminación de Contrato
// (docs 76/77), firmados por el módulo Logysign — solo aparecen aquí una vez FIRMADOS.
const RETIRO_PREFIJOS   = ['CT', 'AR', 'EMOE', 'CRS', 'CR', 'TCR', 'TCRP', 'ED', 'PZ'];

const NOMBRES_DOC = {
  CT:   'Certificado Laboral de Retiro',
  AR:   'Aceptación de Renuncia',
  EMOE: 'Autorización Examen Médico de Egreso',
  CRS:  'Carta Retiro Cesantías',
  CR:   'Carta de Renuncia',
  TCR:  'Terminación de Contrato',
  TCRP: 'Terminación de Contrato (Periodo de Prueba)',
  ED:   'Evaluación de Desempeño',
  PZ:   'Paz y Salvo',
};

function limpiarNombre(trabajador) {
  if (!trabajador) return '';
  const partes = String(trabajador).split(' ** ');
  return (partes.length > 1 ? partes[1] : trabajador).trim();
}

function formatFechaCO(fecha) {
  if (!fecha) return '';
  const str = fecha instanceof Date ? `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}` : String(fecha).slice(0, 10);
  const d = new Date(str + 'T12:00:00');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function toDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
  return String(val).slice(0, 10);
}

function fechaHoraBogota() {
  const bogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${bogota.getFullYear()}-${p(bogota.getMonth() + 1)}-${p(bogota.getDate())} ${p(bogota.getHours())}:${p(bogota.getMinutes())}:${p(bogota.getSeconds())}`;
}

async function registrarDocTrabajador({ regional, operacion, identificacion, fechaIngreso,
  tipoDocumento, prefijo, doc, usuario }) {
  const id = uuidv4();
  await pool.execute(
    `INSERT INTO Maestro_docTrabajador
     (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
      TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud,
      Justificacion_Solicitud, FechaRegistro, Usuario)
     VALUES (?, 'PEND', ?, ?, ?, 'Retirado', ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
    [id, regional || null, operacion || null, identificacion,
     toDateStr(fechaIngreso), tipoDocumento, prefijo, doc, fechaHoraBogota(), usuario]
  );
  return id;
}

function paginaError(mensaje) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f0f0}.card{background:#fff;padding:2rem;border-radius:8px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.15);max-width:420px;width:90%}h2{color:#e74c3c;margin-top:0}p{color:#666;margin:0}</style></head><body><div class="card"><h2>Error</h2><p>${mensaje}</p></div></body></html>`;
}

// ── GET /:idVinculacion ────────────────────────────────────────────────────
router.get('/:idVinculacion', async (req, res) => {
  try {
    const idVinculacion = decodeURIComponent(req.params.idVinculacion);
    const { usuario }   = req.query;

    if (!usuario) return res.status(400).send(paginaError('Parámetro ?usuario requerido'));

    const [usuRows] = await pool.execute(
      'SELECT ID, Nombre, Colaborador, Cargo, Rol, Regional, `Operación` FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]
    );
    if (!usuRows.length) return res.status(403).send(paginaError('Usuario no autorizado'));
    const usu             = usuRows[0];
    const rolUsuario      = usu.Rol || '';
    const permisosRetiro  = await obtenerPermisosRetiro(rolUsuario, usu.Regional);
    if (!permisosRetiro.puedeGenerarDocs) {
      return res.status(403).send(paginaError('No tiene permiso para gestionar los documentos de este retiro. Esta gestión está a cargo del área de Nómina.'));
    }

    // Vinculación completa
    const [vinRows] = await pool.execute(
      `SELECT \`Id Vinculación\`, \`Identificación\`, Trabajador, Cargo,
              \`Fecha de Ingreso\`, \`Fecha de Retiro\`, Estado,
              \`Operación\`, Regional, \`Motivo del Retiro\`, \`Archivo Vinculación\`,
              ar_ciudad_regional,
              token_firma_ct,   token_firma_ct_expira,
              token_firma_ar,   token_firma_ar_expira,
              token_firma_emoe, token_firma_emoe_expira,
              token_firma_crs,  token_firma_crs_expira
       FROM \`Maestro_Vinculación\`
       WHERE \`Id Vinculación\` = ? LIMIT 1`,
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).send(paginaError('Vinculación no encontrada'));
    const vin           = vinRows[0];
    const identificacion = vin['Identificación'];
    const motivoRetiro  = vin['Motivo del Retiro'] || '';
    const condicion     = await obtenerCondicionRetiro(motivoRetiro);
    const esMotivoFinal = !!condicion?.TerminaProceso;

    const esRetirado = (vin.Estado === 'Retirado') || (vin['Motivo del Retiro'] && vin['Motivo del Retiro'] !== 'SI' && vin['Motivo del Retiro'].trim() !== '');
    if (!esRetirado) {
      return res.status(400).send(paginaError('El trabajador aún no ha sido registrado como retirado.'));
    }

    // Documentos del trabajador (retiro)
    const [docRows] = await pool.execute(
      `SELECT Prefijo, Doc, \`Validación\`, TipoDocumento, FechaRegistro
       FROM Maestro_docTrabajador
       WHERE Identificación = ? AND DATE(Fecha_Ingreso) = DATE(?)
       ORDER BY FechaRegistro DESC`,
      [String(identificacion), toDateStr(vin['Fecha de Ingreso'])]
    );
    const docsMap = {};
    docRows.forEach(r => { if (!docsMap[r.Prefijo]) docsMap[r.Prefijo] = r; });

    const docs = Object.values(docsMap)
      .filter(r => RETIRO_PREFIJOS.includes(r.Prefijo))
      .map(r => ({
        prefijo:    r.Prefijo,
        label:      NOMBRES_DOC[r.Prefijo] || r.Prefijo,
        url:        r.Doc,
        validacion: r['Validación'],
      }));

    // ── Terminación de Contrato — gestión en el módulo Logysign (docs 76/77), o
    // cargada manualmente (ver /api/subir-terminacion-contrato) cuando Jurídica
    // no pudo tramitarla por Logysign. La carga manual tiene prioridad: si el
    // documento ya está en Maestro_docTrabajador, se considera vinculado sin
    // necesidad de consultar el estado en Logysign.
    const fechaIngresoStr = toDateStr(vin['Fecha de Ingreso']);
    let terminacionContrato = null;
    if (condicion?.TieneTCR || condicion?.TieneTCRP) {
      const tipo = condicion.TieneTCRP ? 'TCRP' : 'TCR';
      const docManual = docsMap[tipo];
      if (docManual) {
        terminacionContrato = {
          tipo, observacion: condicion.ObservacionTCR, estado: 'FIRMADO', url: docManual.Doc,
          desactualizado: docManual['Validación'] === 'DESACTUALIZADO',
        };
      } else {
        const idConfigDoc = tipo === 'TCRP' ? ID_DOC_TCRP : ID_DOC_TCR;
        const info = await obtenerEstadoLogysign({ identificacion, idConfigDoc, fechaIngreso: fechaIngresoStr });
        terminacionContrato = { tipo, observacion: condicion.ObservacionTCR, ...info };
      }
    }

    // Paz y Salvo
    let pzInfo = null;
    const [pzRows] = await pool.execute(
      `SELECT id, estado, token_trabajador, token_trabajador_expira,
              articulos, observaciones, firma_responsable_url, url_pdf_final
       FROM Maestro_pazysalvo
       WHERE id_vinculacion = ? ORDER BY fecha_creacion DESC LIMIT 1`,
      [idVinculacion]
    );
    if (pzRows.length) {
      const p = pzRows[0];
      const articulosParsed = Array.isArray(p.articulos) ? p.articulos
        : typeof p.articulos === 'string' ? (() => { try { return JSON.parse(p.articulos); } catch { return []; } })()
        : [];
      const baseUrl2 = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      // p.token_trabajador es solo el JTI; hay que reconstruir el JWT completo para que sea válido
      let urlFirmaPZ = null;
      if (p.token_trabajador) {
        let jwt_pz = reconstruirToken(p.token_trabajador, p.id, p.token_trabajador_expira);
        if (!jwt_pz) {
          // Token expirado → regenerar
          jwt_pz = await generarTokenPZ(p.id, 'token_trabajador', 'token_trabajador_expira').catch(() => null);
        }
        if (jwt_pz) urlFirmaPZ = `${baseUrl2}/firmar-pazysalvo/${p.id}?token=${encodeURIComponent(jwt_pz)}`;
      }
      pzInfo = {
        idPz:               p.id,
        estado:             p.estado,
        urlFirma:           urlFirmaPZ,
        urlPdfFinal:        p.url_pdf_final || null,
        articulos:          articulosParsed,
        observaciones:      p.observaciones || '',
        articulosGuardados: !!p.token_trabajador || p.estado !== 'esperando_trabajador' || articulosParsed.length > 0,
        workerSigned:       p.token_trabajador === null && p.estado !== 'esperando_trabajador',
      };
    }

    // Segmentación (contacto)
    const [segRows] = await pool.execute(
      'SELECT Email, Celular FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1',
      [String(identificacion)]
    );
    const seg           = segRows[0] || {};
    const emailTrabajador  = seg.Email  || null;
    const celularTrabajador = String(seg.Celular || '').replace(/\D/g, '') || null;

    // ── Derivar estado del proceso ───────────────────────────────────────────
    const firmaConfirmada = esMotivoFinal
      ? true
      : !!(vin.ar_ciudad_regional ||
           vin.token_firma_ct !== null ||
           (pzRows.length && pzRows[0].firma_responsable_url));

    // "Completado" (vista bloqueada de solo lectura) usa la misma lógica de
    // legalización que la columna de la pestaña Retiros en Nómina — antes solo
    // miraba que los tokens de firma estuvieran en null y el PZ completado.
    // También detalla qué falta puntualmente cuando el proceso sigue "en proceso".
    const { legalizado: retiroLegalizado, pendientes: legalizacionPendientes } = await obtenerPendientesLegalizacion({
      identificacion,
      motivoRetiro,
      fechaIngreso:  vin['Fecha de Ingreso'],
      fechaRetiro:   vin['Fecha de Retiro'],
      tipoRenuncia:  vin['Archivo Vinculación'],
    });
    const procesoCompleto = firmaConfirmada && retiroLegalizado;

    const estadoPagina = !firmaConfirmada ? 'formulario'
                       : procesoCompleto  ? 'completado'
                       : 'dashboard';

    // ── URLs de firma (reconstruir tokens activos) ───────────────────────────
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

    async function getUrlFirma(jti, expira, genFn, prefijo, ruta) {
      // Si el doc ya está firmado (existe en docTrabajador), no hay URL de firma
      if (docsMap[prefijo]) return null;
      if (!jti) return null;
      const t = reconstruirToken(jti, idVinculacion, expira);
      const tokenFinal = t || await genFn(idVinculacion);
      return `${baseUrl}${ruta}${encodeURIComponent(idVinculacion)}?token=${encodeURIComponent(tokenFinal)}`;
    }

    const urlFirmaCT   = await getUrlFirma(vin.token_firma_ct,   vin.token_firma_ct_expira,   generarTokenCT,   'CT',   '/firmar-certificado-retiro/');
    const urlFirmaAR   = await getUrlFirma(vin.token_firma_ar,   vin.token_firma_ar_expira,   generarTokenAR,   'AR',   '/firmar-renuncia/');
    const urlFirmaEMOE = await getUrlFirma(vin.token_firma_emoe, vin.token_firma_emoe_expira, generarTokenEMOE, 'EMOE', '/firmar-examen-egreso/');
    const urlFirmaCRS  = await getUrlFirma(vin.token_firma_crs,  vin.token_firma_crs_expira,  generarTokenCRS,  'CRS',  '/firmar-cesantias/');

    // ── Evaluación de Retiro (EVR) ────────────────────────────────────────────
    let evrInfo = null;
    try {
      const [evrRows] = await pool.execute(
        `SELECT id_evaluacion, completada, url_pdf, token_acceso, token_acceso_expira, fecha_registro
         FROM Maestro_evaluacionretiro WHERE id_vinculacion = ? LIMIT 1`,
        [idVinculacion]
      );
      if (evrRows.length) {
        const evr      = evrRows[0];
        const baseUrl0 = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        let urlEVR = null;
        if (!evr.completada && evr.token_acceso) {
          const { reconstruirToken, generarTokenEVR } = require('../services/token');
          const t   = reconstruirToken(evr.token_acceso, evr.id_evaluacion, evr.token_acceso_expira);
          const tok = t || await generarTokenEVR(evr.id_evaluacion).catch(() => null);
          if (tok) urlEVR = `${baseUrl0}/evaluacion-retiro/${encodeURIComponent(evr.id_evaluacion)}?token=${encodeURIComponent(tok)}`;
        }
        const freg = evr.fecha_registro
          ? new Date(evr.fecha_registro).toLocaleDateString('es-CO', {
              timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })
          : null;
        evrInfo = {
          idEvaluacion:   evr.id_evaluacion,
          completada:     !!evr.completada,
          urlAcceso:      urlEVR,
          urlPdf:         evr.url_pdf || null,
          fechaRegistro:  freg,
        };
      }
    } catch (evrErr) {
      // Columnas EVR aún no migradas — continúa sin bloque EVR
      console.warn('[gestionarretiro] EVR no disponible (¿ALTER TABLE pendiente?):', evrErr.message);
    }

    // ── Ciudad sugerida: usuario → Maestro_Usuarios.Operación → Maestro_Operaciones.C.C. ──
    let ciudadSugerida = '';
    if (estadoPagina === 'formulario' && usu['Operación']) {
      try {
        const [ccRows] = await pool.execute(
          'SELECT `C.C.` FROM Maestro_Operaciones WHERE `Operación` = ? LIMIT 1',
          [usu['Operación']]
        );
        if (ccRows.length) ciudadSugerida = ccRows[0]['C.C.'] || '';
      } catch {}
    }

    // ── Firma del responsable (para mostrar en formulario) ───────────────────
    let firmaResponsableUrl = null;
    if (estadoPagina === 'formulario' && usu.Colaborador) {
      const { obtenerUrlFirmaReciente } = require('../services/storage');
      const [vinUsu] = await pool.execute(
        'SELECT `Identificación` FROM `Maestro_Vinculación` WHERE Trabajador = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
        [usu.Colaborador]
      );
      if (vinUsu.length) {
        firmaResponsableUrl = await obtenerUrlFirmaReciente(vinUsu[0]['Identificación']).catch(() => null);
      }
    }

    const template = fs.readFileSync(DASHBOARD_HTML, 'utf8');
    const config   = JSON.stringify({
      // Estado
      estadoPagina,
      // Identidad
      idVinculacion,
      usuario,
      usuarioNombre:    usu.Nombre || usuario,
      rolUsuario,
      // Permisos (Config_Parametros, nomina / Retiros)
      puedeEditarFechaRetiro:    permisosRetiro.puedeEditarFechaRetiro,
      puedeModificarArticulosPz: permisosRetiro.puedeModificarArticulosPz,
      puedeReenviarPzAreas:      permisosRetiro.puedeReenviarPzAreas,
      puedeGenerarPzAnticipado:  permisosRetiro.puedeGenerarPzAnticipado,
      puedeReenviarPzCompletado: permisosRetiro.puedeReenviarPzCompletado,
      // Trabajador
      trabajador:       limpiarNombre(vin.Trabajador),
      cargo:            vin.Cargo || '',
      identificacion:   String(identificacion),
      // Retiro
      motivoRetiro,
      tipoRenuncia:     vin['Archivo Vinculación'] || null,
      fechaRetiro:      formatFechaCO(vin['Fecha de Retiro']),
      fechaRetiroISO:   toDateStr(vin['Fecha de Retiro']),
      ciudadRegional:   vin.ar_ciudad_regional || '',
      // Formulario (estado A)
      firmaResponsableUrl,
      ciudadSugerida,
      // Dashboard (estado B)
      docs,
      docsOpcionales: {
        cr: docsMap['CR'] ? { url: docsMap['CR'].Doc, validacion: docsMap['CR']['Validación'] } : null,
        ed: docsMap['ED'] ? { url: docsMap['ED'].Doc, validacion: docsMap['ED']['Validación'] } : null,
      },
      terminacionContrato,
      legalizacionPendientes: estadoPagina === 'dashboard' ? legalizacionPendientes : [],
      urlFirmaCT,
      urlFirmaAR,
      urlFirmaEMOE,
      urlFirmaCRS,
      pazYSalvo:        pzInfo,
      evr:              evrInfo,
      contacto:         { email: emailTrabajador, celular: celularTrabajador },
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(template.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[gestionarretiro GET]', err);
    res.status(500).send(paginaError('Error interno del servidor'));
  }
});

// ── POST /api/reenviar-pz-areas ───────────────────────────────────────────
// Nómina/Sistema reenvía recordatorio de firma a áreas pendientes del PZ
router.post('/api/reenviar-pz-areas', async (req, res) => {
  try {
    const { idPz, usuario } = req.body;
    if (!idPz) return res.status(400).json({ ok: false, error: 'idPz requerido' });

    const [uRows] = await pool.execute(
      'SELECT Rol, Regional FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]
    );
    const permisos = uRows.length ? await obtenerPermisosRetiro(uRows[0].Rol, uRows[0].Regional) : null;
    const tienePermiso = permisos && (permisos.puedeReenviarPzAreas || permisos.puedeReenviarPzCompletado);
    if (!tienePermiso) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para reenviar enlace de Paz y Salvo a áreas' });
    }

    const [pzRows] = await pool.execute(
      `SELECT pz.*, v.Trabajador, v.Cargo, v.\`Operación\`, v.\`Identificación\`,
              v.\`Id Vinculación\` AS idVin,
              pz.areas_requeridas, pz.estado
       FROM Maestro_pazysalvo pz
       JOIN \`Maestro_Vinculación\` v ON v.\`Id Vinculación\` = pz.id_vinculacion
       WHERE pz.id = ? LIMIT 1`, [idPz]
    );
    if (!pzRows.length) return res.status(404).json({ ok: false, error: 'PZ no encontrado' });
    const pz = pzRows[0];

    if (pz.estado === 'completado' && !permisos.puedeReenviarPzCompletado) {
      return res.status(403).json({ ok: false, error: 'No tiene permiso para reenviar Paz y Salvo ya completado' });
    }

    const { EMAILS_AREA, normalizarAreasRequeridas } = require('../services/pazYSalvoService');
    const { notificarAreaPazYSalvo } = require('../services/email');
    const areasReq = normalizarAreasRequeridas(pz.areas_requeridas);
    const baseUrl  = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

    const areasPendientes = areasReq.filter(a => !pz[`firma_${a}_url`]);
    if (!areasPendientes.length) return res.json({ ok: true, reenviados: 0 });

    let reenviados = 0;
    for (const area of areasPendientes) {
      const destinatarios = EMAILS_AREA[area] || [];
      if (!destinatarios.length) continue;
      // Reconstruir o generar token del área
      const campoToken  = `token_${area}`;
      const campoExpira = `token_${area}_expira`;
      const { generarTokenPZ, validarTokenPZ } = require('../services/token');
      let tokenFinal = null;
      if (pz[campoToken]) {
        tokenFinal = await validarTokenPZ(pz[campoToken], idPz, campoToken, campoExpira)
          .then(r => r.valido ? pz[campoToken] : null).catch(() => null);
      }
      if (!tokenFinal) {
        tokenFinal = await generarTokenPZ(idPz, campoToken, campoExpira);
      }
      const urlFirma   = `${baseUrl}/pazysalvo-area/${area}/${encodeURIComponent(idPz)}?token=${encodeURIComponent(tokenFinal)}`;
      try {
        await notificarAreaPazYSalvo({
          area, destinatarios,
          trabajador:    limpiarNombre(pz.Trabajador),
          identificacion: String(pz['Identificación']),
          cargo:         pz.Cargo || '',
          operacion:     pz['Operación'] || '',
          urlFirma,
        });
        reenviados++;
      } catch (e) { console.error(`[reenviar-pz ${area}]`, e.message); }
    }

    res.json({ ok: true, reenviados, areasPendientes });
  } catch (err) {
    console.error('[reenviar-pz-areas]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/generar-pz-anticipado ───────────────────────────────────────
// Cierra el PZ anticipadamente (antes de las 120 h), marcando las áreas no firmadas
router.post('/api/generar-pz-anticipado', async (req, res) => {
  try {
    const { idPz, usuario } = req.body;
    if (!idPz) return res.status(400).json({ ok: false, error: 'idPz requerido' });

    const [uRows] = await pool.execute('SELECT Rol, Regional FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    const permisos = uRows.length ? await obtenerPermisosRetiro(uRows[0].Rol, uRows[0].Regional) : null;
    if (!permisos || !permisos.puedeGenerarPzAnticipado) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para generar el Paz y Salvo anticipadamente' });
    }

    const [pzRows] = await pool.execute(
      `SELECT pz.*, v.Trabajador, v.Cargo, v.\`Operación\`, v.\`Fecha de Retiro\`,
              v.\`Fecha de Ingreso\`, v.Regional, v.Usuario
       FROM Maestro_pazysalvo pz
       JOIN \`Maestro_Vinculación\` v ON v.\`Id Vinculación\` = pz.id_vinculacion
       WHERE pz.id = ? LIMIT 1`,
      [idPz]
    );
    if (!pzRows.length) return res.status(404).json({ ok: false, error: 'PZ no encontrado' });
    const pz = pzRows[0];

    if (pz.estado === 'completado') {
      return res.status(400).json({ ok: false, error: 'El Paz y Salvo ya se encuentra completado' });
    }

    const { regenerarPazYSalvoFinal } = require('./pazysalvoarea');
    // Para generar el PDF final usamos la función generarPazYSalvoFinalPDF
    // Si aún no está en estado completado, lo completamos
    const { obtenerPlantilla, reemplazarVariables } = require('../services/plantilla');
    const { generarPDF } = require('../services/renderer');
    const { subirPDFPazYSalvo } = require('../services/storage');
    const { generarFilasArticulosHTML, generarFirmasAreasHtml, fechaFirmaTexto, escapeHtml, NOMBRES_AREA, normalizarAreasRequeridas } = require('../services/pazYSalvoService');

    const areasRequeridas = normalizarAreasRequeridas(pz.areas_requeridas);

    const nombrePlantilla = pz.nivel_compromiso === 'alto' ? 'paz_y_salvo_alto' : 'paz_y_salvo_bajo';
    const plantilla = await obtenerPlantilla(nombrePlantilla);
    const articulos = typeof pz.articulos === 'string' ? JSON.parse(pz.articulos) : (pz.articulos || []);
    const hoy = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });

    let obsFinal = (pz.observaciones || '').trim();
    const obsAreas = areasRequeridas
      .filter(a => pz[`observacion_${a}`])
      .map(a => `• ${NOMBRES_AREA[a] || a}: ${pz['observacion_' + a].trim()}`);
    if (obsAreas.length) {
      const bloque = 'Comentarios de las áreas:\n' + obsAreas.join('\n');
      obsFinal = obsFinal ? `${obsFinal}\n\n${bloque}` : bloque;
    }

    const datosPlantilla = {
      fecha_expedicion:        hoy,
      nombre_trabajador:       limpiarNombre(pz.Trabajador).toUpperCase(),
      identificacion:          String(pz.identificacion),
      cargo:                   pz.Cargo || '',
      operacion:               pz['Operación'] || '',
      fecha_retiro:            formatFechaCO(pz['Fecha de Retiro']),
      filas_articulos:         generarFilasArticulosHTML(articulos),
      firma_trabajador_html:   pz.firma_trabajador_url
        ? `<img src="${pz.firma_trabajador_url}" style="height:80px;display:block;margin-bottom:4px"><div style="font-size:7px;color:#888;text-align:center">${fechaFirmaTexto(pz.fecha_firma_trabajador)}</div>`
        : `<div style="border:1.5px solid #ccc;border-radius:4px;padding:8px 10px;color:#888;font-size:.78rem;display:inline-block;width:220px;text-align:center;line-height:1.4;margin-bottom:4px">Documento soportado por correo electrónico – No firmó dentro del plazo</div>`,
      firma_responsable_html:  pz.firma_responsable_url
        ? `<img src="${pz.firma_responsable_url}" style="height:80px;display:block;margin-bottom:4px"><div style="font-size:7px;color:#888;text-align:center">${fechaFirmaTexto(pz.fecha_firma_responsable)}</div>`
        : `<div style="height:72px;border-bottom:1px solid #000;width:220px;margin-bottom:4px"></div>`,
      nombre_firmante:         pz.firma_responsable_nombre || '',
      cargo_firmante:          pz.firma_responsable_cargo || '',
      observaciones:           obsFinal || 'Sin observaciones registradas.',
      firma_nomina_html:       pz.firma_nomina_url
        ? `<img src="${pz.firma_nomina_url}" style="height:80px;display:block;margin-bottom:4px"><div style="font-size:7px;color:#888;text-align:center">${fechaFirmaTexto(pz.fecha_firma_nomina)}</div>`
        : `<div style="border:1px dashed #999;border-radius:3px;padding:6px;color:#555;font-size:8px;text-align:center;line-height:1.3;background:#f9f9f9">Se informó al área por correo electrónico</div>`,
      firma_nomina_nombre:     pz.firma_nomina_nombre || '—',
      firma_nomina_cargo:      pz.firma_nomina_cargo ? pz.firma_nomina_cargo + (pz.observacion_nomina ? `<div style="margin-top:3px;padding:2px 4px;background:#f4faf8;border-left:2px solid #16a085;font-size:7.5px;color:#222"><strong>Comentario:</strong> ${escapeHtml(pz.observacion_nomina)}</div>` : '') : '—',
    };

    if (pz.nivel_compromiso === 'alto') {
      datosPlantilla.firmas_areas_html = `<table style="width:100%;border-collapse:collapse">${generarFirmasAreasHtml(pz, areasRequeridas)}</table>`;
    }

    const htmlFinal = reemplazarVariables(plantilla.contenido_html, datosPlantilla);
    const pdfBuffer = await generarPDF(htmlFinal);
    const urlPdf    = await subirPDFPazYSalvo(pz.identificacion, pz.id_vinculacion, pdfBuffer);
    const ahoraFin  = new Date();

    await pool.execute(
      `UPDATE Maestro_pazysalvo SET estado = 'completado', url_pdf_final = ?, fecha_completado = ? WHERE id = ?`,
      [urlPdf, ahoraFin, idPz]
    );

    // Actualizar o insertar en Maestro_docTrabajador
    const [docExist] = await pool.execute(
      `SELECT id FROM Maestro_docTrabajador
       WHERE Identificación = ? AND TipoDocumento = '59' AND DATE(Fecha_Ingreso) = DATE(?)
       ORDER BY FechaRegistro DESC LIMIT 1`,
      [String(pz.identificacion), toDateStr(pz['Fecha de Ingreso'])]
    );
    if (docExist.length) {
      await pool.execute(
        `UPDATE Maestro_docTrabajador SET Doc = ?, FechaRegistro = ? WHERE id = ?`,
        [urlPdf, fechaHoraBogota(), docExist[0].id]
      );
    } else {
      const { v4: uuidv4 } = require('uuid');
      await pool.execute(
        `INSERT INTO Maestro_docTrabajador
         (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
          TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud,
          Justificacion_Solicitud, FechaRegistro, Usuario)
         VALUES (?, 'PEND', ?, ?, ?, 'Retirado', ?, '59', 'PZ', ?, NULL, NULL, NULL, NULL, ?, ?)`,
        [uuidv4(), pz.Regional || null, pz['Operación'] || null, String(pz.identificacion),
         toDateStr(pz['Fecha de Ingreso']), urlPdf, fechaHoraBogota(), pz.Usuario || null]
      );
    }

    res.json({ ok: true, urlPdf });
  } catch (err) {
    console.error('[generar-pz-anticipado]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/subir-terminacion-contrato ───────────────────────────────────
// Carga manual de la Terminación de Contrato (76) o su variante de Periodo de
// Prueba (77), para cuando el área Jurídica no puede tramitarla por Logysign.
// Solo disponible si el motivo del retiro lo exige (TieneTCR/TieneTCRP) y el
// documento aún no está vinculado al trabajador.
router.post('/api/subir-terminacion-contrato', async (req, res) => {
  try {
    const { idVinculacion, docBase64, usuario } = req.body;
    if (!idVinculacion || !docBase64 || !usuario) {
      return res.status(400).json({ ok: false, error: 'Datos incompletos' });
    }

    const [uRows] = await pool.execute('SELECT Rol, Regional FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    if (!uRows.length || !(await puedeGenerarDocumentosRetiro(uRows[0].Rol, uRows[0].Regional))) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para cargar este documento' });
    }

    const [vinRows] = await pool.execute(
      `SELECT \`Identificación\`, Regional, \`Operación\`, \`Fecha de Ingreso\`, \`Motivo del Retiro\`
       FROM \`Maestro_Vinculación\` WHERE \`Id Vinculación\` = ? LIMIT 1`,
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).json({ ok: false, error: 'Vinculación no encontrada' });
    const vin = vinRows[0];
    const identificacion = vin['Identificación'];

    const condicion = await obtenerCondicionRetiro(vin['Motivo del Retiro'] || '');
    const tipoDoc = condicion?.TieneTCRP ? ID_DOC_TCRP : (condicion?.TieneTCR ? ID_DOC_TCR : null);
    if (!tipoDoc) {
      return res.status(400).json({ ok: false, error: 'El motivo de este retiro no requiere Terminación de Contrato' });
    }

    const [docRows] = await pool.execute(
      `SELECT id, \`Validación\` FROM Maestro_docTrabajador
       WHERE Identificación = ? AND TipoDocumento = ? AND DATE(Fecha_Ingreso) = DATE(?)
       ORDER BY FechaRegistro DESC LIMIT 1`,
      [String(identificacion), tipoDoc, toDateStr(vin['Fecha de Ingreso'])]
    );
    // Un documento "DESACTUALIZADO" (ver /api/actualizar-fecha-retiro) sí puede
    // reemplazarse — es justamente para eso que queda marcado así.
    if (docRows.length && docRows[0]['Validación'] !== 'DESACTUALIZADO') {
      return res.status(409).json({ ok: false, error: 'Este documento ya está cargado para el trabajador' });
    }

    const prefijo = await obtenerPrefijoDoc(tipoDoc);
    const buffer  = Buffer.from(docBase64.replace(/^data:.*;base64,/, ''), 'base64');
    const url     = await subirDocumentoRetiro(identificacion, prefijo, buffer);

    if (docRows.length) {
      await pool.execute(
        `UPDATE Maestro_docTrabajador SET Doc = ?, \`Validación\` = 'PEND', FechaRegistro = ? WHERE id = ?`,
        [url, fechaHoraBogota(), docRows[0].id]
      );
    } else {
      await registrarDocTrabajador({
        regional:      vin.Regional || null,
        operacion:     vin['Operación'] || null,
        identificacion,
        fechaIngreso:  vin['Fecha de Ingreso'],
        tipoDocumento: tipoDoc,
        prefijo,
        doc:           url,
        usuario,
      });
    }

    res.json({ ok: true, url });
  } catch (err) {
    console.error('[subir-terminacion-contrato]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/actualizar-fecha-retiro ──────────────────────────────────────
// Solo Nómina/Sistema pueden corregir la Fecha de Retiro una vez registrada.
// Al cambiarla, se regeneran en el acto los documentos que la incluyen en su
// texto y que generamos nosotros de punta a punta (Certificado de Retiro,
// Aceptación de Renuncia y el PDF final del Paz y Salvo), reutilizando la
// firma ya capturada. Los demás documentos ya vinculados que no se pueden
// regenerar automáticamente (Carta de Renuncia, Terminación de Contrato/TCRP,
// vengan de Logysign o cargados a mano) quedan marcados como DESACTUALIZADO
// para que alguien los vuelva a tramitar o cargar manualmente.
router.post('/api/actualizar-fecha-retiro', async (req, res) => {
  try {
    const { idVinculacion, usuario, nuevaFecha } = req.body;
    if (!idVinculacion || !usuario || !nuevaFecha) {
      return res.status(400).json({ ok: false, error: 'Datos incompletos' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha)) {
      return res.status(400).json({ ok: false, error: 'Fecha inválida' });
    }

    const [uRows] = await pool.execute('SELECT Rol, Regional FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    const permisos = uRows.length ? await obtenerPermisosRetiro(uRows[0].Rol, uRows[0].Regional) : null;
    if (!permisos || !permisos.puedeEditarFechaRetiro) {
      return res.status(403).json({ ok: false, error: 'Su rol no puede editar la Fecha de Retiro' });
    }

    const [vinRows] = await pool.execute(
      'SELECT `Identificación`, `Fecha de Ingreso`, `Fecha de Retiro` FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ? LIMIT 1',
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).json({ ok: false, error: 'Vinculación no encontrada' });
    const identificacion = vinRows[0]['Identificación'];
    const fechaIngreso = toDateStr(vinRows[0]['Fecha de Ingreso']);
    const fechaAnterior  = toDateStr(vinRows[0]['Fecha de Retiro']);
    if (fechaAnterior === nuevaFecha) return res.json({ ok: true, sinCambios: true });

    await pool.execute(
      `UPDATE \`Maestro_Vinculación\` SET \`Fecha de Retiro\` = ?, Usuario = ?, \`Fecha Actualización\` = ? WHERE \`Id Vinculación\` = ?`,
      [nuevaFecha, usuario, fechaHoraBogota(), idVinculacion]
    );

    const [docRows] = await pool.execute(
      `SELECT id, Prefijo, FechaRegistro FROM Maestro_docTrabajador
       WHERE Identificación = ? AND DATE(Fecha_Ingreso) = DATE(?)
         AND Prefijo IN ('CT','AR','CR','TCR','TCRP')`,
      [String(identificacion), fechaIngreso]
    );
    const docCT = docRows.find(d => d.Prefijo === 'CT');
    const docAR = docRows.find(d => d.Prefijo === 'AR');
    const docsManuales = docRows.filter(d => ['CR', 'TCR', 'TCRP'].includes(d.Prefijo));

    const regenerados = [];
    const errores = [];

    if (docCT) {
      try { await regenerarCertificadoRetiro(idVinculacion, docCT); regenerados.push('Certificado Laboral de Retiro'); }
      catch (e) { console.error('[actualizar-fecha-retiro CT]', e.message); errores.push('Certificado Laboral de Retiro'); }
    }
    if (docAR) {
      try { await regenerarAceptacionRenuncia(idVinculacion, docAR); regenerados.push('Aceptación de Renuncia'); }
      catch (e) { console.error('[actualizar-fecha-retiro AR]', e.message); errores.push('Aceptación de Renuncia'); }
    }
    try {
      const urlPz = await regenerarPazYSalvoFinal(idVinculacion);
      if (urlPz) regenerados.push('Paz y Salvo');
    } catch (e) { console.error('[actualizar-fecha-retiro PZ]', e.message); errores.push('Paz y Salvo'); }

    if (docsManuales.length) {
      const ph = docsManuales.map(() => '?').join(',');
      await pool.execute(
        `UPDATE Maestro_docTrabajador SET \`Validación\` = 'DESACTUALIZADO' WHERE id IN (${ph})`,
        docsManuales.map(d => d.id)
      );
    }

    res.json({
      ok: true,
      regenerados,
      errores,
      desactualizados: docsManuales.map(d => NOMBRES_DOC[d.Prefijo] || d.Prefijo),
    });
  } catch (err) {
    console.error('[actualizar-fecha-retiro]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
