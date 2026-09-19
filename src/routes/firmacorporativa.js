const express = require('express');
const path = require('path');
const multer = require('multer');
const {
  buscarEmpleadoParaFirma,
  buscarColaboradoresSugeridos,
  guardarEmpleadoFirma,
  generarFirmaPNG,
  subirFirmaGeneradaPNG
} = require('../services/firmaSyncService');

const router = express.Router();
const HTML_VIEW_PATH = path.join(__dirname, '../views/firmacorporativa/index.html');

// Configuración de Multer para recibir fotos de perfil en memoria
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// 1. Vista principal del generador de firmas
router.get('/', (req, res) => {
  res.sendFile(HTML_VIEW_PATH);
});

// 2. API: Consultar empleado por cédula
router.get('/api/empleado/:id', async (req, res) => {
  try {
    const resultado = await buscarEmpleadoParaFirma(req.params.id);
    if (!resultado || (!resultado.existeEnFirma && !resultado.esDeVinculacion)) {
      return res.json({ ok: false, error: 'Empleado no encontrado' });
    }
    res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('[firmacorporativa] Error al consultar empleado:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 3. API: Autocompletado o sugerencias de colaboradores
router.get('/api/buscar-empleados', async (req, res) => {
  try {
    const sugeridos = await buscarColaboradoresSugeridos(req.query.q || '');
    res.json({ ok: true, sugeridos });
  } catch (err) {
    console.error('[firmacorporativa] Error al buscar empleados:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 4. API: Guardar o actualizar datos de firma corporativa
router.post('/api/guardar', upload.single('foto'), async (req, res) => {
  try {
    const generarPng = req.body.generarPng !== 'false';
    const resultado = await guardarEmpleadoFirma(req.body, req.file, generarPng, req.body.usuario);
    res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('[firmacorporativa] Error al guardar datos:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 5. API: Generar solo el PNG de la firma
router.post('/api/generar-png', async (req, res) => {
  try {
    const d = req.body;
    if (!d.identificacion || !d.nombre) {
      return res.status(400).json({ ok: false, error: 'Identificación y nombre requeridos' });
    }

    const pngBuffer = await generarFirmaPNG(d);
    const finalUrl = await subirFirmaGeneradaPNG(d.identificacion, pngBuffer);

    res.json({ ok: true, finalUrl });
  } catch (err) {
    console.error('[firmacorporativa] Error al generar PNG:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
