const express = require('express');
const path = require('path');
const multer = require('multer');
const {
  buscarTrabajadorCesantias,
  obtenerFondosCesantias,
  obtenerCiudadYCiudadesPorOperacion,
  obtenerFirmaPreviaTrabajador,
  buscarCedulaPreviaTrabajador,
  obtenerMotivosCesantias,
  crearSolicitudCesantias,
  verificarSolicitudActivaTrabajador,
  obtenerLimitesCesantias,
} = require('../services/cesantiasService');

const router = express.Router();
// Techo técnico de multer. El límite real por archivo es "Tamaño máximo de
// soportes (MB)" en Config_Parametros (se valida en crearSolicitudCesantias).
// Cloud Run no acepta peticiones de más de 32 MB en total.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 32 * 1024 * 1024 } });

const FORM_HTML = path.join(__dirname, '../views/formcesantias/form.html');

// ── GET / ── Servir la vista del formulario independiente
router.get('/', (req, res) => {
  res.sendFile(FORM_HTML);
});

// ── GET /api/config ── Límites que el formulario muestra y valida
router.get('/api/config', async (req, res) => {
  try {
    const { maxSoporteMB } = await obtenerLimitesCesantias();
    res.json({ ok: true, maxSoporteMB });
  } catch (err) {
    console.error('[formcesantias] Error obteniendo configuración:', err);
    res.json({ ok: true, maxSoporteMB: 15 });
  }
});

// ── GET /api/motivos ──
router.get('/api/motivos', async (req, res) => {
  try {
    const motivos = await obtenerMotivosCesantias();
    res.json({ ok: true, motivos });
  } catch (err) {
    console.error('[formcesantias] Error obteniendo motivos:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/fondos ──
router.get('/api/fondos', async (req, res) => {
  try {
    const fondos = await obtenerFondosCesantias();
    res.json({ ok: true, fondos });
  } catch (err) {
    console.error('[formcesantias] Error obteniendo fondos:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/ciudades-operacion ──
router.get('/api/ciudades-operacion', async (req, res) => {
  try {
    const operacion = req.query.operacion || '';
    const data = await obtenerCiudadYCiudadesPorOperacion(operacion);
    res.json({ ok: true, ...data });
  } catch (err) {
    console.error('[formcesantias] Error obteniendo ciudades por operación:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/firma-previa/:identificacion ──
router.get('/api/firma-previa/:identificacion', async (req, res) => {
  try {
    const { identificacion } = req.params;
    const data = await obtenerFirmaPreviaTrabajador(identificacion);
    res.json({ ok: true, ...data });
  } catch (err) {
    console.error('[formcesantias] Error buscando firma previa:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/trabajador/:identificacion ──
router.get('/api/trabajador/:identificacion', async (req, res) => {
  try {
    const { identificacion } = req.params;
    const trabajador = await buscarTrabajadorCesantias(identificacion);
    if (!trabajador) {
      return res.status(404).json({ ok: false, error: 'Trabajador no encontrado en el sistema.' });
    }
    res.json({ ok: true, trabajador });
  } catch (err) {
    console.error('[formcesantias] Error buscando trabajador:', err);
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/solicitar ──
router.post('/api/solicitar', upload.any(), async (req, res) => {
  try {
    const body = req.body;
    const files = req.files || [];

    const resultado = await crearSolicitudCesantias({
      identificacion: body.identificacion,
      usuario: 'Autogestión Colaborador',
      celular: body.celular || body.telefono,
      email: body.email,
      ciudad_solicitud: body.ciudad_solicitud,
      fondo_cesantias: body.fondo_cesantias,
      monto_solicitado: body.monto_solicitado,
      motivo_retiro: body.motivo_retiro,
      aplica_conyuge: body.aplica_conyuge === 'true' || body.aplica_conyuge === '1',
      institucion_educativa: body.institucion_educativa,
      programa_academico: body.programa_academico,
      semestre: body.semestre,
      nombre_beneficiario: body.nombre_beneficiario,
      identificacion_beneficiario: body.identificacion_beneficiario,
      usar_firma_previa: body.usar_firma_previa,
      firma_base64: body.firma_base64,
      usar_cedula_previa: body.usar_cedula_previa,
      url_cedula_previa: body.url_cedula_previa,
      raw_doc_cedula_previa: body.raw_doc_cedula_previa,
      labels_map: body.labels_map,
      ip_cliente: req.ip || req.headers['x-forwarded-for'],
    }, files);

    res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('[formcesantias] Error creando solicitud:', err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
