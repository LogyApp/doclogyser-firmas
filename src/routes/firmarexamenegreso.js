const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../services/db');

function fechaHoraBogota() {
  const b = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${b.getFullYear()}-${p(b.getMonth()+1)}-${p(b.getDate())} ${p(b.getHours())}:${p(b.getMinutes())}:${p(b.getSeconds())}`;
}

function toDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
  return String(val).slice(0, 10);
}
const { obtenerPlantilla, preprocesarDatos, reemplazarVariables } = require('../services/plantilla');
const { generarPDF } = require('../services/renderer');
const {
  obtenerFirmaBase64Reciente,
  obtenerUrlFirmaReciente,
  subirFirma,
  subirPDFExamenEgreso,
} = require('../services/storage');
const { validarTokenEMOE } = require('../services/token');
const { verificarYEnviarEmailConcluido } = require('../services/retiroCompletadoChecker');

const router = express.Router();
const FIRMA_HTML = path.join(__dirname, '../views/firmarexamenegreso/firma.html');

// ── Helpers ────────────────────────────────────────────────────────────────

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
    timeZone: 'America/Bogota',
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function paginaError(mensaje) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f0f0}div{background:#fff;padding:2rem;border-radius:8px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.15);max-width:400px;width:90%}h2{color:#e74c3c;margin-top:0}p{color:#666;margin:0}</style></head><body><div><h2>Enlace no válido</h2><p>${mensaje}</p></div></body></html>`;
}

async function resolverFirmaResponsable(usuarioId) {
  const vacio = {
    nombre: '', cargo: '',
    firmaHtml: `<div style="height:72px;border-bottom:1px solid #000;width:220px;margin-bottom:4px"></div>`,
  };
  if (!usuarioId) return vacio;
  const [usuRows] = await pool.execute(
    'SELECT Nombre, Cargo, Colaborador FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
    [usuarioId]
  );
  if (!usuRows.length) return vacio;
  const usu = usuRows[0];
  let firmaHtml = vacio.firmaHtml;
  if (usu.Colaborador) {
    const [vinRows] = await pool.execute(
      'SELECT `Identificación` FROM `Maestro_Vinculación` WHERE Trabajador = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [usu.Colaborador]
    );
    if (vinRows.length) {
      const url = await obtenerUrlFirmaReciente(vinRows[0]['Identificación']).catch(() => null);
      if (url) firmaHtml = `<img src="${url}" style="height:80px;display:block;margin-bottom:4px">`;
    }
  }
  return {
    nombre:   limpiarNombre(usu.Colaborador || usu.Nombre).toUpperCase(),
    cargo:    usu.Cargo || '',
    firmaHtml,
  };
}

async function resolverCiudad(regional) {
  if (!regional) return '';
  const [rows] = await pool.execute(
    'SELECT Ciudad FROM Config_Regionales WHERE Regional = ? LIMIT 1',
    [regional]
  );
  return rows.length ? (rows[0].Ciudad || '') : '';
}

function buildDatos(vin, ciudadDoc, responsable, firmaTrabajadorHtml) {
  return {
    ciudad_regional:       ciudadDoc,
    fecha_expedicion:      formatFechaCO(new Date()),
    nombre_trabajador:     limpiarNombre(vin.Trabajador).toUpperCase(),
    identificacion:        String(vin['Identificación']),
    firma_responsable_html: responsable.firmaHtml,
    nombre_firmante:       responsable.nombre,
    cargo_firmante:        responsable.cargo,
    firma_trabajador_html: firmaTrabajadorHtml,
  };
}

// ── GET /:idVinculacion?token=... ──────────────────────────────────────────
router.get('/:idVinculacion', async (req, res) => {
  try {
    const idVinculacion = decodeURIComponent(req.params.idVinculacion);
    const { token } = req.query;

    if (!token) return res.status(401).send(paginaError('Token no proporcionado.'));

    const resultado = await validarTokenEMOE(token, idVinculacion);
    if (!resultado.valido) {
      const msg = resultado.motivo === 'expirado'
        ? 'El enlace ha expirado. Comuníquese con el área de Recursos Humanos.'
        : 'El enlace no es válido o ya fue utilizado.';
      return res.status(401).send(paginaError(msg));
    }

    const [vinRows] = await pool.execute(
      'SELECT * FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ?',
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).send(paginaError('Registro no encontrado.'));
    const vin = vinRows[0];

    const responsable = await resolverFirmaResponsable(vin.Usuario);
    const ciudadDoc   = await resolverCiudad(vin.Regional);
    const plantilla   = await obtenerPlantilla('examen_egreso');

    // En la vista previa la firma del trabajador aparece como espacio vacío
    const datos   = buildDatos(vin, ciudadDoc, responsable, '');
    const htmlDoc = reemplazarVariables(plantilla.contenido_html, preprocesarDatos(datos));

    let firmaPrevia = null;
    try { firmaPrevia = await obtenerFirmaBase64Reciente(vin['Identificación']); } catch {}

    const template = fs.readFileSync(FIRMA_HTML, 'utf8');
    const config = JSON.stringify({
      token,
      idVinculacion,
      documentoHtml:            htmlDoc,
      firmaPrevia,
      nombreTrabajador:         limpiarNombre(vin.Trabajador),
      identificacionTrabajador: String(vin['Identificación']),
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(template.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[firmarexamenegreso GET]', err);
    res.status(500).send(paginaError('Error interno. Intente más tarde.'));
  }
});

// ── POST /:idVinculacion ───────────────────────────────────────────────────
router.post('/:idVinculacion', async (req, res) => {
  try {
    const idVinculacion = decodeURIComponent(req.params.idVinculacion);
    const { token, firma_base64, es_nueva_firma } = req.body;

    if (!token) return res.status(401).json({ ok: false, error: 'Token no proporcionado' });

    const resultado = await validarTokenEMOE(token, idVinculacion);
    if (!resultado.valido) return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });

    const [vinRows] = await pool.execute(
      'SELECT * FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ?',
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
    const vin = vinRows[0];

    // Resolver firma del trabajador
    let urlFirmaTrab;
    if (es_nueva_firma && firma_base64) {
      const base64Data = firma_base64.replace(/^data:image\/png;base64,/, '');
      const bufferPng  = Buffer.from(base64Data, 'base64');
      urlFirmaTrab = await subirFirma(vin['Identificación'], bufferPng);
    } else {
      urlFirmaTrab = await obtenerUrlFirmaReciente(vin['Identificación']);
    }

    const firmaTrabajadorHtml = urlFirmaTrab
      ? `<img src="${urlFirmaTrab}" style="height:80px;display:block;margin-bottom:4px">`
      : `<div style="height:72px;border-bottom:1px solid #000;width:220px;margin-bottom:4px"></div>`;

    const responsable = await resolverFirmaResponsable(vin.Usuario);
    const ciudadDoc   = await resolverCiudad(vin.Regional);
    const plantilla   = await obtenerPlantilla('examen_egreso');

    const datos     = buildDatos(vin, ciudadDoc, responsable, firmaTrabajadorHtml);
    const htmlFinal = reemplazarVariables(plantilla.contenido_html, preprocesarDatos(datos));
    const pdfBuffer = await generarPDF(htmlFinal);
    const urlPdf    = await subirPDFExamenEgreso(vin['Identificación'], idVinculacion, pdfBuffer);

    // Registrar documento firmado en Maestro_docTrabajador
    await pool.execute(
      `INSERT INTO Maestro_docTrabajador
       (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
        TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud,
        Justificacion_Solicitud, FechaRegistro, Usuario)
       VALUES (?, 'PEND', ?, ?, ?, 'Retirado', ?, '58', 'EMOE', ?, NULL, NULL, NULL, NULL, ?, ?)`,
      [uuidv4(), vin.Regional || null, vin['Operación'] || null,
       String(vin['Identificación']), toDateStr(vin['Fecha de Ingreso']),
       urlPdf, fechaHoraBogota(), vin.Usuario || 'sistema']
    );

    // Invalidar token
    await pool.execute(
      'UPDATE `Maestro_Vinculación` SET token_firma_emoe = NULL, token_firma_emoe_expira = NULL WHERE `Id Vinculación` = ?',
      [idVinculacion]
    );

    res.json({ ok: true, urlPdf });

    // Verificar si todos los docs están firmados → enviar email automático al trabajador
    verificarYEnviarEmailConcluido(idVinculacion).catch(e => console.error('[auto-email EMOE]', e.message));
  } catch (err) {
    console.error('[firmarexamenegreso POST]', err);
    res.status(500).json({ ok: false, error: 'Error interno. Intente más tarde.' });
  }
});

module.exports = router;
