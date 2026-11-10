const express = require('express');
const path = require('path');
const multer = require('multer');
const { computarAccesoContabilidad } = require('../services/accesoContabilidad');
const consignacionesService = require('../services/consignacionesService');

const router = express.Router();
const uploadConsignacion = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

const CONTABILIDAD_HTML = path.join(__dirname, '../views/contabilidad/index.html');

function paginaError(mensaje) {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Error de Acceso — Contabilidad</title>
      <link rel="stylesheet" href="/css/theme-tokens.css">
      <style>
        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: var(--bg, #f4f6f9); color: var(--text, #1e293b); }
        .card { background: var(--surface, #fff); padding: 2rem; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 480px; text-align: center; }
        h2 { color: #ef4444; margin-bottom: 0.5rem; }
        p { margin-bottom: 1.5rem; color: var(--text-muted, #64748b); }
        a { display: inline-block; padding: 0.6rem 1.2rem; background: var(--primary, #1e40af); color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>Acceso Restringido</h2>
        <p>${mensaje}</p>
        <a href="/">Ir al Inicio</a>
      </div>
    </body>
    </html>
  `;
}

// ── GET / (Vista Principal de Contabilidad) ───────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).send(paginaError('Parámetro ?usuario requerido.'));
    }

    const acceso = await computarAccesoContabilidad(usuario, 'Consignaciones');
    if (!acceso) {
      return res.status(403).send(paginaError('No tienes permisos asignados en Maestro_Menu para el módulo de Contabilidad.'));
    }

    res.sendFile(CONTABILIDAD_HTML);
  } catch (err) {
    console.error('[contabilidad] GET / error:', err);
    res.status(500).send(paginaError(`Error interno del servidor: ${err.message}`));
  }
});

// ── GET /api/estado (Metadatos de usuario, alcance, quincena y filtros) ──────
router.get('/api/estado', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoContabilidad(usuario, 'Consignaciones');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [bancos, anios, quincenaActual] = await Promise.all([
      consignacionesService.obtenerBancos(),
      consignacionesService.obtenerAnios(),
      consignacionesService.obtenerQuincenaActual(),
    ]);

    const anioActual = new Date().getFullYear().toString();
    const [quincenas, puedeValidar, puedeEliminarFoto] = await Promise.all([
      consignacionesService.obtenerQuincenasPorAnio(anioActual),
      consignacionesService.puedeValidarConsignaciones(acceso.rol),
      consignacionesService.puedeEliminarFotoConsignacion(acceso.rol),
    ]);

    const regionales = Object.keys(acceso.opsPorRegional).sort();
    const operaciones = acceso.operacionesFiltro || [];

    res.json({
      usuarioId: acceso.usuarioId,
      usuarioNombre: acceso.usuarioNombre,
      rol: acceso.rol,
      accesoCode: acceso.accesoCode,
      sinFiltro: acceso.sinFiltro,
      puedeValidar,
      puedeEliminarFoto,
      regionales,
      operaciones,
      opsPorRegional: acceso.opsPorRegional,
      quincenaActual,
      anioActual,
      bancos,
      anios,
      quincenas,
    });
  } catch (err) {
    console.error('[contabilidad] GET /api/estado error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/quincenas (Quincenas por año) ───────────────────────────────────
router.get('/api/quincenas', async (req, res) => {
  try {
    const { usuario, anio } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoContabilidad(usuario, 'Consignaciones');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const quincenas = await consignacionesService.obtenerQuincenasPorAnio(anio || new Date().getFullYear());
    res.json(quincenas);
  } catch (err) {
    console.error('[contabilidad] GET /api/quincenas error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/consignaciones (Lista de consignaciones con filtros y totales) ───
router.get('/api/consignaciones', async (req, res) => {
  try {
    const { usuario, anio, quincena, dia, regional, operacion, fase, busqueda } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoContabilidad(usuario, 'Consignaciones');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const data = await consignacionesService.obtenerConsignaciones(
      { anio, quincena, dia, regional, operacion, fase, busqueda },
      acceso
    );

    res.json(data);
  } catch (err) {
    console.error('[contabilidad] GET /api/consignaciones error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/servicios-asociados (Detalle individual de servicios en efectivo) ─
router.get('/api/servicios-asociados', async (req, res) => {
  try {
    const { usuario, dia, operacion } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!dia || !operacion) return res.status(400).json({ error: 'dia y operacion requeridos' });

    const acceso = await computarAccesoContabilidad(usuario, 'Consignaciones');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const servicios = await consignacionesService.obtenerServiciosAsociados(dia, operacion, acceso);
    res.json(servicios);
  } catch (err) {
    console.error('[contabilidad] GET /api/servicios-asociados error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/consignaciones (Registrar o editar consignación con soporte) ────
router.post('/api/consignaciones', uploadConsignacion.single('foto'), async (req, res) => {
  try {
    const { usuario } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido en el cuerpo' });

    const acceso = await computarAccesoContabilidad(usuario, 'Consignaciones');
    if (!acceso) return res.status(403).json({ error: 'No autorizado para el módulo de Contabilidad' });

    const resultado = await consignacionesService.guardarConsignacion(req.body, acceso, req.file);
    res.json(resultado);
  } catch (err) {
    console.error('[contabilidad] POST /api/consignaciones error:', err);
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/consignaciones/validar (Alternar validación de consignación) ─────
router.post('/api/consignaciones/validar', async (req, res) => {
  try {
    const { usuario, dia, operacion, validado } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!dia || !operacion) return res.status(400).json({ error: 'dia y operacion requeridos' });

    const acceso = await computarAccesoContabilidad(usuario, 'Consignaciones');
    if (!acceso) return res.status(403).json({ error: 'No autorizado para el módulo de Contabilidad' });

    const resultado = await consignacionesService.alternarValidacion(dia, operacion, validado, acceso);
    res.json(resultado);
  } catch (err) {
    console.error('[contabilidad] POST /api/consignaciones/validar error:', err);
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/consignaciones/eliminar-foto (Eliminar foto/soporte) ────────────
router.post('/api/consignaciones/eliminar-foto', async (req, res) => {
  try {
    const { usuario, dia, operacion } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!dia || !operacion) return res.status(400).json({ error: 'dia y operacion requeridos' });

    const acceso = await computarAccesoContabilidad(usuario, 'Consignaciones');
    if (!acceso) return res.status(403).json({ error: 'No autorizado para el módulo de Contabilidad' });

    const resultado = await consignacionesService.eliminarFotoConsignacion(dia, operacion, acceso);
    res.json(resultado);
  } catch (err) {
    console.error('[contabilidad] POST /api/consignaciones/eliminar-foto error:', err);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
