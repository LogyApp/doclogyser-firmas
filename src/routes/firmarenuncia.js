const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../services/db');
const { obtenerPlantilla, preprocesarDatos, reemplazarVariables } = require('../services/plantilla');
const { generarPDF } = require('../services/renderer');
const {
  obtenerFirmaBase64Reciente,
  obtenerUrlFirmaReciente,
  subirFirma,
  subirPDFAceptacionRenuncia,
} = require('../services/storage');
const { validarTokenAR } = require('../services/token');
const { verificarYEnviarEmailConcluido } = require('../services/retiroCompletadoChecker');
// notificarRenunciaFirmada se enviara en conjunto con todos los documentos
// const { notificarRenunciaFirmada } = require('../services/email');

const router = express.Router();
const FIRMA_AR_HTML = path.join(__dirname, '../views/firmarenuncia/firma.html');

function fechaHoraBogota() {
  const bogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${bogota.getFullYear()}-${p(bogota.getMonth() + 1)}-${p(bogota.getDate())} ${p(bogota.getHours())}:${p(bogota.getMinutes())}:${p(bogota.getSeconds())}`;
}

function toDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

async function registrarDocTrabajador({ regional, operacion, identificacion, fechaIngreso,
  tipoDocumento, prefijo, doc, observaciones, usuario }) {
  const id    = uuidv4();
  const ahora = fechaHoraBogota();
  await pool.execute(
    `INSERT INTO Maestro_docTrabajador
     (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
      TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud,
      Justificacion_Solicitud, FechaRegistro, Usuario)
     VALUES (?, 'PEND', ?, ?, ?, 'Retirado', ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
    [id, regional || null, operacion || null, identificacion,
     toDateStr(fechaIngreso), tipoDocumento, prefijo, doc, observaciones || null, ahora, usuario]
  );
  return id;
}

function paginaError(mensaje) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f0f0}div{background:#fff;padding:2rem;border-radius:8px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.15);max-width:400px;width:90%}h2{color:#e74c3c;margin-top:0}p{color:#666;margin:0}</style></head><body><div><h2>Enlace no válido</h2><p>${mensaje}</p></div></body></html>`;
}

function limpiarNombre(trabajador) {
  if (!trabajador) return '';
  const partes = String(trabajador).split(' ** ');
  return (partes.length > 1 ? partes[1] : trabajador).trim();
}

function formatFechaCO(fecha) {
  if (!fecha) return '';
  const str = fecha instanceof Date ? fecha.toISOString().slice(0, 10) : String(fecha).slice(0, 10);
  const d = new Date(str + 'T12:00:00');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

async function resolverFirmaResponsable(idUsuario) {
  if (!idUsuario) return null;
  const [usuRows] = await pool.execute(
    'SELECT Nombre, Cargo, Colaborador FROM Maestro_Usuarios WHERE ID = ?', [idUsuario]
  );
  if (!usuRows.length) return null;
  const usu = usuRows[0];

  let firmaUrl = null;
  if (usu.Colaborador) {
    const [vinRows] = await pool.execute(
      `SELECT \`Identificación\` FROM \`Maestro_Vinculación\`
       WHERE Trabajador = ? ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [usu.Colaborador]
    );
    if (vinRows.length) {
      firmaUrl = await obtenerUrlFirmaReciente(vinRows[0]['Identificación']).catch(() => null);
    }
  }

  return {
    nombre:   limpiarNombre(usu.Colaborador || usu.Nombre).toUpperCase(),
    cargo:    usu.Cargo || '',
    firmaUrl,
  };
}

function buildFirmaHtml(url) {
  return url
    ? `<img src="${url}" style="height:80px;display:block;margin-bottom:4px">`
    : `<div style="height:72px;border-bottom:1px solid #000;width:220px;margin-bottom:4px"></div>`;
}

function buildDatosPlantilla(vin, firmante, firmaTrabajadorHtml) {
  const tipo = vin['Archivo Vinculación'] || '';
  return {
    nombre_trabajador:    limpiarNombre(vin.Trabajador).toUpperCase(),
    identificacion:       String(vin['Identificación']),
    ciudad_regional:      vin.ar_ciudad_regional || '',
    fecha_expedicion:     formatFechaCO(new Date()),
    verbal_marca:         tipo === 'Verbal' ? 'X' : '___',
    escrita_marca:        tipo === 'Escrita' ? 'X' : '___',
    fecha_retiro_texto:   formatFechaCO(vin['Fecha de Retiro']),
    firma_responsable_html: buildFirmaHtml(firmante ? firmante.firmaUrl : null),
    nombre_firmante:      firmante ? firmante.nombre : '',
    cargo_firmante:       firmante ? firmante.cargo  : '',
    firma_trabajador_html: firmaTrabajadorHtml,
  };
}

// ── GET /:idVinculacion?token=... ──────────────────────────────────────────
router.get('/:idVinculacion', async (req, res) => {
  try {
    const idVinculacion = decodeURIComponent(req.params.idVinculacion);
    const { token } = req.query;

    if (!token) return res.status(401).send(paginaError('Token no proporcionado.'));

    const resultado = await validarTokenAR(token, idVinculacion);
    if (!resultado.valido) {
      const msg = resultado.motivo === 'expirado'
        ? 'El enlace ha expirado. Solicite un nuevo envío al área de Recursos Humanos.'
        : 'El enlace no es válido o ya fue utilizado.';
      return res.status(401).send(paginaError(msg));
    }

    const [vinRows] = await pool.execute(
      'SELECT * FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ?',
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).send(paginaError('Registro no encontrado.'));
    const vin = vinRows[0];

    const firmante = await resolverFirmaResponsable(vin.Usuario);

    const plantilla = await obtenerPlantilla('aceptacion_renuncia');
    const datos = buildDatosPlantilla(vin, firmante, '');
    const htmlDoc = reemplazarVariables(plantilla.contenido_html, preprocesarDatos(datos));

    let firmaPrevia = null;
    try {
      firmaPrevia = await obtenerFirmaBase64Reciente(vin['Identificación']);
    } catch {}

    const template = fs.readFileSync(FIRMA_AR_HTML, 'utf8');
    const config = JSON.stringify({
      token,
      idVinculacion,
      documentoHtml: htmlDoc,
      firmaPrevia,
      tipoRenuncia: vin['Archivo Vinculación'] || '',
      nombreTrabajador: limpiarNombre(vin.Trabajador),
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(template.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[firmarenuncia GET]', err);
    res.status(500).send(paginaError('Error interno. Intente más tarde.'));
  }
});

// ── POST /:idVinculacion ───────────────────────────────────────────────────
router.post('/:idVinculacion', async (req, res) => {
  try {
    const idVinculacion = decodeURIComponent(req.params.idVinculacion);
    const { token, firma_base64, es_nueva_firma } = req.body;

    if (!token) return res.status(401).json({ ok: false, error: 'Token no proporcionado' });

    const resultado = await validarTokenAR(token, idVinculacion);
    if (!resultado.valido) return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });

    const [vinRows] = await pool.execute(
      'SELECT * FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ?',
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
    const vin = vinRows[0];

    // Resolver y guardar firma del trabajador
    let urlFirmaTrab;
    if (es_nueva_firma && firma_base64) {
      const base64Data = firma_base64.replace(/^data:image\/png;base64,/, '');
      const bufferPng = Buffer.from(base64Data, 'base64');
      urlFirmaTrab = await subirFirma(vin['Identificación'], bufferPng);
    } else {
      urlFirmaTrab = await obtenerUrlFirmaReciente(vin['Identificación']);
    }

    const firmante = await resolverFirmaResponsable(vin.Usuario);

    // Generar PDF final con ambas firmas
    const plantilla = await obtenerPlantilla('aceptacion_renuncia');
    const firmaTrabajadorHtml = buildFirmaHtml(urlFirmaTrab);
    const datos = buildDatosPlantilla(vin, firmante, firmaTrabajadorHtml);
    const htmlFinal = reemplazarVariables(plantilla.contenido_html, preprocesarDatos(datos));
    const pdfBuffer = await generarPDF(htmlFinal);

    const urlPdf = await subirPDFAceptacionRenuncia(vin['Identificación'], idVinculacion, pdfBuffer);

    // Registrar AR en Maestro_docTrabajador
    const [vinExtra] = await pool.execute(
      'SELECT Regional, Operación, `Fecha de Ingreso`, Usuario FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ? LIMIT 1',
      [idVinculacion]
    );
    if (vinExtra.length) {
      const ve = vinExtra[0];
      await registrarDocTrabajador({
        regional:      ve.Regional     || null,
        operacion:     ve['Operación'] || null,
        identificacion: String(vin['Identificación']),
        fechaIngreso:  ve['Fecha de Ingreso'],
        tipoDocumento: '54',
        prefijo:       'AR',
        doc:           urlPdf,
        usuario:       ve.Usuario || null,
      }).catch(e => console.error('[AR docTrabajador]', e.message));
    }

    // Invalidar token
    await pool.execute(
      'UPDATE `Maestro_Vinculación` SET token_firma_ar = NULL, token_firma_ar_expira = NULL WHERE `Id Vinculación` = ?',
      [idVinculacion]
    );

    // notificarRenunciaFirmada se enviara mas adelante junto con todos los documentos
    // notificarRenunciaFirmada({ ... }).catch(...);

    res.json({ ok: true, urlPdf });

    // Verificar si todos los docs están firmados → enviar email automático al trabajador
    verificarYEnviarEmailConcluido(idVinculacion).catch(e => console.error('[auto-email AR]', e.message));
  } catch (err) {
    console.error('[firmarenuncia POST]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
