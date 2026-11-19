/**
 * Talent Hub › Entrevistas de Retiro: respuestas de la entrevista que diligencia el trabajador al
 * retirarse (Maestro_evaluacionretiro), para que Selección y Bienestar analicen los puntos a mejorar.
 * Se monta dentro del router de Talent Hub (/talenthub/api/entrevistas-retiro/...).
 * Ver la pestaña: Maestro_Menu talenthub / EntrevistasRetiro.
 * Regenerar el PDF y recibir la campana de nuevas entrevistas: Config_Parametros
 * talenthub / Entrevistas de Retiro (ver services/entrevistasRetiro.js).
 */
const express = require('express');
const router = express.Router();
const pool = require('../services/db');
const { computarAccesoTalenthub } = require('../services/accesoTalenthub');
const { puedeRegenerarEntrevistas } = require('../services/entrevistasRetiro');
const { obtenerNotificacionesUsuario, marcarNotificacionesLeidas, marcarTodasLeidas } = require('../services/notificacionesService');

const SECCION_MENU = 'EntrevistasRetiro';
const MODULO_NOTIF = 'entrevistasretiro';

const limpiarNombre = (t) => { const p = String(t || '').split(' ** '); return (p.length > 1 ? p[1] : t || '').trim(); };
const normalizar = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const fechaISO = (v) => {
  if (!v) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  return String(v).slice(0, 10);
};

async function acceso(req) {
  const usuario = req.query.usuario || (req.body && req.body.usuario) || '';
  return computarAccesoTalenthub(usuario, SECCION_MENU);
}

// Coordinador de cada operación: rol Coordinador de esa operación o, si no hay, CoordinadorR de su
// regional (igual que los responsables de Retiros). Es el coordinador actual, no el de la fecha del retiro.
async function mapaCoordinadores() {
  const [rows] = await pool.execute(
    "SELECT Nombre, Colaborador, Rol, Regional, `Operación` AS operacion FROM Maestro_Usuarios WHERE Rol IN ('Coordinador', 'CoordinadorR')"
  );
  const porOperacion = new Map();
  const porRegional = new Map();
  rows.forEach((u) => {
    const nombre = limpiarNombre(u.Colaborador || u.Nombre);
    if (!nombre) return;
    const [mapa, clave] = u.Rol === 'Coordinador' ? [porOperacion, normalizar(u.operacion)] : [porRegional, normalizar(u.Regional)];
    if (!clave) return;
    if (!mapa.has(clave)) mapa.set(clave, new Set());
    mapa.get(clave).add(nombre);
  });
  return (operacion, regional) => {
    const lista = porOperacion.get(normalizar(operacion)) || porRegional.get(normalizar(regional));
    return lista ? [...lista].join(', ') : '';
  };
}

// ── Listado (todas las del alcance del usuario; los filtros se aplican en el navegador) ──
router.get('/api/entrevistas-retiro', async (req, res) => {
  try {
    const a = await acceso(req);
    if (!a) return res.status(403).json({ ok: false, error: 'No tienes acceso a Entrevistas de Retiro.' });

    const filtros = [];
    const params = [];
    if (!a.sinFiltro) {
      if (!a.operacionesFiltro.length) return res.json({ ok: true, puedeRegenerar: false, entrevistas: [] });
      filtros.push(`v.\`Operación\` IN (${a.operacionesFiltro.map(() => '?').join(',')})`);
      params.push(...a.operacionesFiltro);
    }
    const [rows] = await pool.execute(`
      SELECT e.id_evaluacion, e.id_vinculacion, e.completada, e.fecha_entrevista, e.fecha_registro, e.url_pdf,
             e.motivo_principal, e.relacion_companeros, e.relacion_jefe, e.claridad_funciones, e.condiciones_trabajo,
             e.satisfaccion_sueldo, e.satisfaccion_beneficios, e.oportunidad_formacion, e.oportunidad_crecimiento,
             e.valoracion_principal, e.aspectos_mejorar, e.recomienda_empresa, e.comentarios_adicionales,
             v.Trabajador, v.\`Identificación\` AS identificacion, v.Cargo AS cargo, v.\`Operación\` AS operacion,
             v.Regional AS regional, v.\`Fecha de Ingreso\` AS fecha_ingreso, v.\`Fecha de Retiro\` AS fecha_retiro,
             v.\`Motivo del Retiro\` AS motivo_retiro
        FROM Maestro_evaluacionretiro e
        JOIN \`Maestro_Vinculación\` v ON v.\`Id Vinculación\` = e.id_vinculacion
       ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''}
       ORDER BY COALESCE(e.fecha_entrevista, DATE(e.fecha_registro)) DESC, e.fecha_registro DESC`, params);

    const coordinadorDe = await mapaCoordinadores();
    const entrevistas = rows.map((r) => ({
      id_evaluacion: r.id_evaluacion,
      id_vinculacion: r.id_vinculacion,
      completada: Number(r.completada) === 1,
      fecha_entrevista: fechaISO(r.fecha_entrevista),
      fecha_registro: fechaISO(r.fecha_registro),
      url_pdf: r.url_pdf || '',
      trabajador: limpiarNombre(r.Trabajador),
      identificacion: String(r.identificacion || ''),
      cargo: r.cargo || '',
      operacion: r.operacion || '',
      regional: r.regional || '',
      coordinador: coordinadorDe(r.operacion, r.regional),
      fecha_ingreso: fechaISO(r.fecha_ingreso),
      fecha_retiro: fechaISO(r.fecha_retiro),
      motivo_retiro: r.motivo_retiro || '',
      motivo_principal: r.motivo_principal || '',
      relacion_companeros: r.relacion_companeros || '',
      relacion_jefe: r.relacion_jefe || '',
      claridad_funciones: r.claridad_funciones || '',
      condiciones_trabajo: r.condiciones_trabajo || '',
      satisfaccion_sueldo: r.satisfaccion_sueldo || '',
      satisfaccion_beneficios: r.satisfaccion_beneficios || '',
      oportunidad_formacion: r.oportunidad_formacion || '',
      oportunidad_crecimiento: r.oportunidad_crecimiento || '',
      valoracion_principal: r.valoracion_principal || '',
      aspectos_mejorar: r.aspectos_mejorar || '',
      recomienda_empresa: r.recomienda_empresa == null ? null : Number(r.recomienda_empresa) === 1,
      comentarios_adicionales: r.comentarios_adicionales || '',
    }));
    res.json({ ok: true, puedeRegenerar: await puedeRegenerarEntrevistas(a.rol), entrevistas });
  } catch (err) {
    console.error('[entrevistas-retiro] listado:', err);
    res.status(500).json({ ok: false, error: 'No se pudieron cargar las entrevistas de retiro.' });
  }
});

// ── Regenerar el PDF de una entrevista diligenciada ─────────────────────────
router.post('/api/entrevistas-retiro/:idEvaluacion/regenerar', async (req, res) => {
  try {
    const a = await acceso(req);
    if (!a) return res.status(403).json({ ok: false, error: 'No tienes acceso a Entrevistas de Retiro.' });
    if (!(await puedeRegenerarEntrevistas(a.rol))) {
      return res.status(403).json({ ok: false, error: 'Tu rol no puede regenerar entrevistas de retiro.' });
    }
    const [rows] = await pool.execute(
      `SELECT e.id_vinculacion, e.completada, v.\`Operación\` AS operacion
         FROM Maestro_evaluacionretiro e JOIN \`Maestro_Vinculación\` v ON v.\`Id Vinculación\` = e.id_vinculacion
        WHERE e.id_evaluacion = ? LIMIT 1`,
      [req.params.idEvaluacion]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Entrevista no encontrada.' });
    if (!a.sinFiltro && !a.operacionesFiltro.includes(rows[0].operacion)) {
      return res.status(403).json({ ok: false, error: 'La entrevista no está en tu alcance.' });
    }
    if (Number(rows[0].completada) !== 1) return res.status(400).json({ ok: false, error: 'La entrevista aún no ha sido diligenciada.' });
    const { regenerarEvaluacionRetiro } = require('./evaluacionretiro');
    const urlPdf = await regenerarEvaluacionRetiro(rows[0].id_vinculacion);
    res.json({ ok: true, urlPdf });
  } catch (err) {
    console.error('[entrevistas-retiro] regenerar:', err);
    res.status(500).json({ ok: false, error: 'No se pudo regenerar el documento.' });
  }
});

// ── Campana de nuevas entrevistas ───────────────────────────────────────────
router.get('/api/entrevistas-retiro/notificaciones', async (req, res) => {
  try {
    const a = await acceso(req);
    if (!a) return res.json({ notificaciones: [], totalNoLeidos: 0 });
    res.json(await obtenerNotificacionesUsuario(pool, { usuarioId: a.usuarioId, modulo: MODULO_NOTIF, limit: req.query.limit || 50 }));
  } catch (err) {
    console.error('[entrevistas-retiro] notificaciones:', err);
    res.status(500).json({ notificaciones: [], totalNoLeidos: 0 });
  }
});

router.post('/api/entrevistas-retiro/notificaciones/marcar-leidas', async (req, res) => {
  try {
    const a = await acceso(req);
    if (!a) return res.status(403).json({ ok: false });
    const { ids, todas } = req.body || {};
    res.json(todas
      ? await marcarTodasLeidas(pool, { usuarioId: a.usuarioId, modulo: MODULO_NOTIF })
      : await marcarNotificacionesLeidas(pool, { usuarioId: a.usuarioId, ids }));
  } catch (err) {
    console.error('[entrevistas-retiro] marcar leídas:', err);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
