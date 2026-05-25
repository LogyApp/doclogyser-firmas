const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');
const { obtenerPlantilla, preprocesarDatos, reemplazarVariables } = require('../services/plantilla');
const { generarPDF } = require('../services/renderer');
const { obtenerUrlFirmaReciente, subirFirma, subirPDFRetiro } = require('../services/storage');
const { notificarRetiro } = require('../services/email');
const { marcarNotificado } = require('../services/retiroNotifier');

const router = express.Router();
const FORM_HTML = path.join(__dirname, '../views/formretiro/form.html');

const MOTIVOS = [
  'Abandono de Puesto de Trabajo',
  'Mutuo Acuerdo',
  'No tomó cargo',
  'Renuncia',
  'Terminación por Muerte',
  'Terminación con Justa Causa',
  'Terminación de la practica',
  'Terminación del contrato',
  'Terminación en Periodo de Prueba',
  'Terminación por Pensión',
  'Terminación Sin Justa Causa',
];

function parsearIdentificacion(param) {
  const partes = decodeURIComponent(param).split('&');
  const raw = partes[partes.length - 1];
  return parseInt(raw, 10) || raw;
}

function limpiarNombre(trabajador) {
  if (!trabajador) return '';
  const partes = String(trabajador).split(' ** ');
  return (partes.length > 1 ? partes[1] : trabajador).trim();
}

function formatFechaCO(fecha) {
  if (!fecha) return '';
  const d = new Date(typeof fecha === 'string' ? fecha + 'T12:00:00' : fecha);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function fechaHoraBogota() {
  const bogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${bogota.getFullYear()}-${p(bogota.getMonth() + 1)}-${p(bogota.getDate())} ${p(bogota.getHours())}:${p(bogota.getMinutes())}:${p(bogota.getSeconds())}`;
}

// Resuelve Colaborador → Identificación en Maestro_Vinculación → URL firma en GCS
async function resolverFirmaUsuario(colaborador) {
  if (!colaborador) return { identificacionFirmante: null, firmaUrl: null };
  const [rows] = await pool.execute(
    `SELECT \`Identificación\` FROM \`Maestro_Vinculación\`
     WHERE Trabajador = ?
     ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
    [colaborador]
  );
  if (!rows.length) return { identificacionFirmante: null, firmaUrl: null };
  const identificacionFirmante = rows[0]['Identificación'];
  const firmaUrl = await obtenerUrlFirmaReciente(identificacionFirmante).catch(() => null);
  return { identificacionFirmante, firmaUrl };
}

// ── GET /api/firma  (debe ir ANTES de /:identificacion) ─────────────────────
// El frontend lo llama después de cargar para saber si el usuario ya tiene firma
router.get('/api/firma', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.json({ url: null });

    const [usuRows] = await pool.execute(
      'SELECT Colaborador FROM Maestro_Usuarios WHERE ID = ?', [usuario]
    );
    if (!usuRows.length || !usuRows[0].Colaborador) return res.json({ url: null });

    const { firmaUrl } = await resolverFirmaUsuario(usuRows[0].Colaborador);
    res.json({ url: firmaUrl || null });
  } catch (err) {
    console.error('[formretiro api/firma]', err);
    res.json({ url: null });
  }
});

// ── GET /:identificacion — renderizar formulario ─────────────────────────────
router.get('/:identificacion', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).send(htmlError('Parámetro ?usuario requerido'));

    const [usuRows] = await pool.execute(
      'SELECT ID, Nombre FROM Maestro_Usuarios WHERE ID = ?', [usuario]
    );
    if (!usuRows.length) return res.status(403).send(htmlError('Usuario no autorizado'));

    const identificacion = parsearIdentificacion(req.params.identificacion);

    const [vinRows] = await pool.execute(
      `SELECT \`Id Vinculación\`, Trabajador, Cargo, \`Fecha de Ingreso\`, Estado
       FROM \`Maestro_Vinculación\`
       WHERE \`Identificación\` = ?
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );
    if (!vinRows.length) return res.status(404).send(htmlError('Trabajador no encontrado para esa identificación'));
    const vin = vinRows[0];
    if (vin.Estado === 'Retirado') {
      return res.status(409).send(htmlError('Este trabajador ya tiene un retiro registrado en el sistema'));
    }

    const template = fs.readFileSync(FORM_HTML, 'utf8');
    const config = JSON.stringify({
      identificacion: String(identificacion),
      usuario,
      usuarioNombre: usuRows[0].Nombre || usuario,
      trabajador: limpiarNombre(vin.Trabajador),
      cargo: vin.Cargo || '',
      fechaIngreso: formatFechaCO(vin['Fecha de Ingreso']),
      motivos: MOTIVOS,
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(template.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[formretiro GET]', err);
    res.status(500).send(htmlError('Error interno del servidor'));
  }
});

// ── POST /:identificacion — registrar retiro y generar documentos ────────────
router.post('/:identificacion', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ ok: false, error: 'Parámetro ?usuario requerido' });

    const [usuRows] = await pool.execute(
      'SELECT ID, Nombre, Colaborador, Cargo FROM Maestro_Usuarios WHERE ID = ?', [usuario]
    );
    if (!usuRows.length) return res.status(403).json({ ok: false, error: 'Usuario no autorizado' });
    const usuData = usuRows[0];

    const identificacion = parsearIdentificacion(req.params.identificacion);
    const { fechaRetiro, motivoRetiro, firmaBase64 } = req.body;

    if (!fechaRetiro) return res.status(400).json({ ok: false, error: 'La fecha de retiro es obligatoria' });
    if (!motivoRetiro || !MOTIVOS.includes(motivoRetiro)) {
      return res.status(400).json({ ok: false, error: 'Motivo de retiro inválido' });
    }

    const [vinRows] = await pool.execute(
      `SELECT \`Id Vinculación\`, Trabajador, Cargo, \`Fecha de Ingreso\`, Estado
       FROM \`Maestro_Vinculación\`
       WHERE \`Identificación\` = ?
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );
    if (!vinRows.length) return res.status(404).json({ ok: false, error: 'Trabajador no encontrado' });
    const vin = vinRows[0];
    if (vin.Estado === 'Retirado') return res.status(409).json({ ok: false, error: 'El trabajador ya figura como retirado' });

    const ahora = fechaHoraBogota();

    await pool.execute(
      `UPDATE \`Maestro_Vinculación\`
       SET Estado = 'Retirado',
           \`Fecha de Retiro\` = ?,
           \`Motivo del Retiro\` = ?,
           \`Fecha Actualización\` = ?,
           Usuario = ?
       WHERE \`Id Vinculación\` = ? AND Estado != 'Retirado'`,
      [fechaRetiro, motivoRetiro, ahora, usuario, vin['Id Vinculación']]
    );

    // Enviar correo de notificación y marcar como notificado (fire & forget)
    notificarRetiro({
      trabajador:       vin.Trabajador,
      identificacion:   String(identificacion),
      cargo:            vin.Cargo,
      operacion:        vin['Operación'],
      fechaRetiro,
      motivoRetiro,
      registradoPor:    usuData.Nombre || usuario,
      emailRegistrador: usuData.Email  || null,
    }).then(() => marcarNotificado(vin['Id Vinculación']))
      .catch(e => console.error('[retiro email]', e.message));

    const [segRows] = await pool.execute(
      'SELECT ARL, EPS, `Pensión` FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1',
      [identificacion]
    );
    const seg = segRows[0] || {};

    // Firma: subir nueva si se dibujó, usar existente si no
    const { identificacionFirmante, firmaUrl: firmaExistente } = await resolverFirmaUsuario(usuData.Colaborador);
    let firmaUrl = firmaExistente;

    if (firmaBase64 && identificacionFirmante) {
      const buffer = Buffer.from(firmaBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      firmaUrl = await subirFirma(identificacionFirmante, buffer);
    }

    const nombreFirmante = limpiarNombre(usuData.Colaborador || usuData.Nombre).toUpperCase();
    const firmaHtml = firmaUrl
      ? `<img src="${firmaUrl}" style="height:80px;display:block;margin-bottom:4px">`
      : `<div style="height:72px;border-bottom:1px solid #000;width:220px;margin-bottom:4px"></div>`;

    const plantilla = await obtenerPlantilla('certificado_retiro');
    const datos = {
      nombre_trabajador: limpiarNombre(vin.Trabajador).toUpperCase(),
      identificacion: String(identificacion),
      cargo: (vin.Cargo || '').toUpperCase(),
      fecha_ingreso: formatFechaCO(vin['Fecha de Ingreso']),
      fecha_retiro: formatFechaCO(fechaRetiro),
      arl: seg.ARL || '—',
      eps: seg.EPS || '—',
      pension: seg['Pensión'] || '—',
      fecha_expedicion: formatFechaCO(new Date()),
      firma_html: firmaHtml,
      nombre_firmante: nombreFirmante,
      cargo_firmante: usuData.Cargo || '',
    };

    const datosProc = preprocesarDatos(datos);
    const html = reemplazarVariables(plantilla.contenido_html, datosProc);
    const pdfBuffer = await generarPDF(html);
    const urlCert = await subirPDFRetiro(identificacion, 'cert_laboral', pdfBuffer);

    res.json({
      ok: true,
      trabajador: limpiarNombre(vin.Trabajador),
      fechaRetiro,
      motivoRetiro,
      documentos: [
        { titulo: 'Certificado Laboral de Retiro', url: urlCert },
      ],
    });
  } catch (err) {
    console.error('[formretiro POST]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

function htmlError(mensaje) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f0f0}div{background:#fff;padding:2rem;border-radius:8px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.15);max-width:400px;width:90%}h2{color:#e74c3c;margin-top:0}p{color:#666;margin:0}</style></head><body><div><h2>Error</h2><p>${mensaje}</p></div></body></html>`;
}

module.exports = router;
