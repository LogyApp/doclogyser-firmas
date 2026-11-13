/**
 * Talent Hub › Cargos y Funciones (manual de funciones SST-MA-002 por cargo).
 * Se monta dentro del router de Talent Hub (/talenthub/api/cargos-funciones/...).
 * Ver la pestaña: Maestro_Menu talenthub / CargosFunciones.
 * Editar y publicar: Config_Parametros talenthub / Cargos y Funciones (ver services/manualFunciones.js).
 */
const express = require('express');
const router = express.Router();
const { computarAccesoTalenthub } = require('../services/accesoTalenthub');
const mf = require('../services/manualFunciones');

const SECCION_MENU = 'CargosFunciones';

async function acceso(req) {
  const usuario = req.query.usuario || (req.body && req.body.usuario) || '';
  const a = await computarAccesoTalenthub(usuario, SECCION_MENU);
  if (!a) return null;
  a.puedeEditar = await mf.puedeEditarManuales(a.rol);
  return a;
}

function responderError(res, err, etiqueta) {
  if (err && err.validacion) return res.status(400).json({ ok: false, error: err.message });
  if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: 'Otro usuario publicó al mismo tiempo. Recarga e intenta de nuevo.' });
  if (err && err.code === 'ER_NO_SUCH_TABLE') {
    return res.status(503).json({ ok: false, error: 'Falta ejecutar la migración 2026-11-13_cargos_y_funciones.sql.' });
  }
  console.error(`[cargos-funciones] ${etiqueta}:`, err);
  return res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
}

function soloEditores(a, res) {
  if (!a) { res.status(403).json({ ok: false, error: 'No tienes acceso a Cargos y Funciones.' }); return false; }
  if (!a.puedeEditar) { res.status(403).json({ ok: false, error: 'Solo los roles autorizados (CoorSelección o Sistema) pueden editar y publicar.' }); return false; }
  return true;
}

router.get('/api/cargos-funciones', async (req, res) => {
  try {
    const a = await acceso(req);
    if (!a) return res.status(403).json({ ok: false, error: 'No tienes acceso a Cargos y Funciones.' });
    const cargos = await mf.listarCargos();
    res.json({ ok: true, puedeEditar: a.puedeEditar, cargos });
  } catch (err) { responderError(res, err, 'listado'); }
});

router.get('/api/cargos-funciones/cargo', async (req, res) => {
  try {
    const a = await acceso(req);
    if (!a) return res.status(403).json({ ok: false, error: 'No tienes acceso a Cargos y Funciones.' });
    const det = await mf.obtenerDetalle(String(req.query.cargo || ''));
    if (!det) return res.status(404).json({ ok: false, error: 'Cargo no encontrado.' });
    res.json({ ok: true, puedeEditar: a.puedeEditar, cargo: det });
  } catch (err) { responderError(res, err, 'detalle'); }
});

router.get('/api/cargos-funciones/sst-comun', async (req, res) => {
  try {
    const a = await acceso(req);
    if (!a) return res.status(403).json({ ok: false, error: 'No tienes acceso a Cargos y Funciones.' });
    res.json({ ok: true, puedeEditar: a.puedeEditar, lista: await mf.obtenerSstComun() });
  } catch (err) { responderError(res, err, 'sst común'); }
});

router.put('/api/cargos-funciones/cargo', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const a = await acceso(req);
    if (!soloEditores(a, res)) return;
    const b = req.body || {};
    const det = await mf.guardarBorrador({
      cargo: String(b.cargo || ''), ficha: b.ficha || {}, responsabilidades: b.responsabilidades,
      funciones: b.funciones, sst: b.sst, usaSstComun: !!b.usaSstComun, usuario: a.usuarioNombre,
    });
    res.json({ ok: true, cargo: det });
  } catch (err) { responderError(res, err, 'guardar'); }
});

router.put('/api/cargos-funciones/sst-comun', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const a = await acceso(req);
    if (!soloEditores(a, res)) return;
    const lista = await mf.guardarSstComun({ lista: (req.body || {}).lista, usuario: a.usuarioNombre });
    res.json({ ok: true, lista });
  } catch (err) { responderError(res, err, 'guardar sst común'); }
});

router.post('/api/cargos-funciones/publicar', express.json(), async (req, res) => {
  try {
    const a = await acceso(req);
    if (!soloEditores(a, res)) return;
    const det = await mf.publicar({ cargo: String(req.body.cargo || ''), descripcion: req.body.descripcion, usuario: a.usuarioNombre });
    res.json({ ok: true, cargo: det });
  } catch (err) { responderError(res, err, 'publicar'); }
});

router.post('/api/cargos-funciones/cargos', express.json(), async (req, res) => {
  try {
    const a = await acceso(req);
    if (!soloEditores(a, res)) return;
    const nombre = await mf.crearCargo(req.body || {});
    res.json({ ok: true, cargo: nombre });
  } catch (err) { responderError(res, err, 'crear cargo'); }
});

router.post('/api/cargos-funciones/vista-previa', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const a = await acceso(req);
    if (!a) return res.status(403).json({ ok: false, error: 'No tienes acceso a Cargos y Funciones.' });
    const b = req.body || {};
    // Los que solo ven no pueden previsualizar borradores sin guardar: ven lo guardado o una versión publicada
    const html = await mf.vistaPrevia({
      cargo: String(b.cargo || ''),
      borrador: a.puedeEditar ? (b.borrador || null) : null,
      version: b.version || null,
    });
    res.json({ ok: true, html });
  } catch (err) { responderError(res, err, 'vista previa'); }
});

module.exports = router;
