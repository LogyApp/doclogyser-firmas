// SST › Documentación Inicial (/docinicial): campanita compartida por las subpestañas ARO, EVIN e INGE.
// Las notificaciones se crean al firmar (crearNotificacionDocInicialSST) con modulo 'docinicial' en Maestro_notificaciones.
const express = require('express');
const pool = require('../services/db');
const {
  obtenerNotificacionesUsuario,
  marcarNotificacionesLeidas,
  marcarTodasLeidas,
} = require('../services/notificacionesService');

const router = express.Router();
const MODULO = 'docinicial';

router.get('/api/notificaciones', async (req, res) => {
  try {
    const { usuario, limit } = req.query;
    if (!usuario) return res.status(400).json({ error: 'Parámetro usuario requerido' });
    res.json(await obtenerNotificacionesUsuario(pool, { usuarioId: usuario, modulo: MODULO, limit }));
  } catch (err) {
    console.error('[docinicial] GET /api/notificaciones:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/notificaciones/marcar-leidas', async (req, res) => {
  try {
    const { usuario, ids } = req.body || {};
    if (!usuario || !ids) return res.status(400).json({ error: 'usuario e ids requeridos' });
    res.json(await marcarNotificacionesLeidas(pool, { usuarioId: usuario, ids }));
  } catch (err) {
    console.error('[docinicial] POST /api/notificaciones/marcar-leidas:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/notificaciones/marcar-todas-leidas', async (req, res) => {
  try {
    const { usuario } = req.body || {};
    if (!usuario) return res.status(400).json({ error: 'Parámetro usuario requerido' });
    res.json(await marcarTodasLeidas(pool, { usuarioId: usuario, modulo: MODULO }));
  } catch (err) {
    console.error('[docinicial] POST /api/notificaciones/marcar-todas-leidas:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
