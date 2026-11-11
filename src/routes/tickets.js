const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../services/db');
const { subirEvidenciaTicket } = require('../services/storage');

const router = express.Router();
const uploadTicket = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ══════════════════════════════════════════════════════════════════════════
// Backend compartido del botón "+ Ticket" (Dynamic_Tickets), reusado por
// cualquier módulo que incluya public/js/ticket-boton.js — no hay una copia
// de esta lógica por módulo. El único endpoint específico de un módulo es
// GET /facturacion/api/tickets/recibos-recientes (Dynamic_Recibos es del
// dominio de Servicios/Facturación), que el widget llama aparte solo cuando
// el Módulo elegido es "Servicios".
//
// El ticket es una acción de bajo riesgo ("reportar una novedad"), no una
// consulta de datos sensibles: se exige que el usuario exista en
// Maestro_Usuarios, pero no se restringe por Sección/Rol de ningún módulo
// en particular, ni se limita a qué Operación puede reportar (ver detalle
// de esta decisión en el historial de commits).
// ══════════════════════════════════════════════════════════════════════════

// ── GET /api/modulos — valores únicos de Config_motivo_tickets.Modulo ──────
router.get('/api/modulos', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT DISTINCT Modulo FROM Config_motivo_tickets WHERE Modulo IS NOT NULL ORDER BY Modulo ASC'
    );
    res.json(rows.map(r => r.Modulo));
  } catch (err) {
    console.error('[tickets] GET /api/modulos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/motivos?modulo=X ───────────────────────────────────────────────
// Devuelve [] si ese módulo todavía no tiene catálogo cargado; el widget cae
// a un campo de texto libre en ese caso (varios módulos no tienen Motivo
// configurado todavía: Asistencia, Inventario, Nomina, Requisiciones,
// Sociodemografica, Tecnologia).
router.get('/api/motivos', async (req, res) => {
  try {
    const { modulo } = req.query;
    if (!modulo) return res.status(400).json({ error: 'modulo requerido' });
    const [rows] = await pool.execute(
      'SELECT Motivo FROM Config_motivo_tickets WHERE Modulo = ? AND Motivo IS NOT NULL ORDER BY Motivo ASC',
      [modulo]
    );
    res.json(rows.map(r => r.Motivo));
  } catch (err) {
    console.error('[tickets] GET /api/motivos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/modulo-defecto?moduloErp=X&seccion=Y — default dinámico ───────
// Config_motivo_tickets.ModuloERP/Seccion permiten mapear, por fila "ancla"
// (Motivo = NULL), qué Modulo de Dynamic_Tickets debe preseleccionarse según
// el módulo ERP (prefijo de ruta: 'facturacion', 'nomina', 'sst'...) y,
// opcionalmente, la Sección activa dentro de ese módulo — usando el mismo
// valor de Sección que cada módulo ya tiene en su tabla Maestro_Menu_X.
// Prioridad: (1) match exacto ModuloERP+Seccion, (2) fila genérica de ese
// ModuloERP con Seccion NULL. Si ninguna existe, el widget cae a su propio
// moduloDefecto, así nunca depende por completo de esta tabla.
router.get('/api/modulo-defecto', async (req, res) => {
  try {
    const { moduloErp, seccion } = req.query;
    if (!moduloErp) return res.status(400).json({ error: 'moduloErp requerido' });

    if (seccion) {
      const [exacto] = await pool.execute(
        'SELECT Modulo FROM Config_motivo_tickets WHERE ModuloERP = ? AND Seccion = ? AND Motivo IS NULL LIMIT 1',
        [moduloErp, seccion]
      );
      if (exacto.length) return res.json({ modulo: exacto[0].Modulo });
    }

    const [generico] = await pool.execute(
      'SELECT Modulo FROM Config_motivo_tickets WHERE ModuloERP = ? AND Seccion IS NULL AND Motivo IS NULL LIMIT 1',
      [moduloErp]
    );
    res.json({ modulo: generico.length ? generico[0].Modulo : null });
  } catch (err) {
    console.error('[tickets] GET /api/modulo-defecto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/usuario-info?usuario=X — teléfono para prellenar el formulario ─
router.get('/api/usuario-info', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const [rows] = await pool.execute('SELECT Telefono FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    if (!rows.length) return res.status(403).json({ error: 'Usuario no reconocido' });
    res.json({ telefono: rows[0].Telefono || '' });
  } catch (err) {
    console.error('[tickets] GET /api/usuario-info:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/operaciones?usuario=X — operaciones activas por regional ─────
// Para los módulos que no entregan su propia lista al botón (Caja operativa,
// Directorio, Configuración). Mismo criterio de arriba: cualquier usuario
// registrado puede reportar sobre cualquier operación activa.
router.get('/api/operaciones', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ ok: false, error: 'usuario requerido' });
    const [u] = await pool.execute('SELECT ID FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    if (!u.length) return res.status(403).json({ ok: false, error: 'Usuario no reconocido' });
    const [rows] = await pool.execute(
      "SELECT OPERACIÓN AS operacion, REGIONAL AS regional FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY REGIONAL, OPERACIÓN"
    );
    const opsPorRegional = {};
    rows.forEach(r => {
      if (!r.regional || !r.operacion) return;
      (opsPorRegional[r.regional] = opsPorRegional[r.regional] || []).push(r.operacion);
    });
    res.json({ ok: true, opsPorRegional });
  } catch (err) {
    console.error('[tickets] GET /api/operaciones:', err);
    res.status(500).json({ ok: false, error: 'No se pudieron cargar las operaciones' });
  }
});

// ── POST /api/crear — crea un ticket desde cualquier módulo con el botón ───
router.post('/api/crear', uploadTicket.single('evidencia'), async (req, res) => {
  try {
    const { usuario, modulo, operacion, motivo, idrecibo, descripcion, telefono } = req.body;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const [userRows] = await pool.execute('SELECT ID FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    if (!userRows.length) return res.status(403).json({ error: 'Usuario no reconocido' });

    if (!modulo || !operacion || !motivo || !motivo.trim() || !descripcion || !descripcion.trim()) {
      return res.status(400).json({ error: 'Módulo, Operación, Motivo y Descripción son obligatorios.' });
    }

    const [opRows] = await pool.execute(
      "SELECT 1 FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' LIMIT 1",
      [operacion]
    );
    if (!opRows.length) return res.status(400).json({ error: 'Operación inválida' });

    // idrecibo solo tiene sentido para el módulo Servicios (Dynamic_Recibos);
    // para cualquier otro módulo se ignora aunque llegue en el body.
    let idReciboVal = null;
    if (modulo === 'Servicios' && idrecibo && String(idrecibo).trim()) {
      const reciboLimpio = String(idrecibo).trim();
      const [reciboRows] = await pool.execute('SELECT IdRecibo FROM Dynamic_Recibos WHERE IdRecibo = ? LIMIT 1', [reciboLimpio]);
      if (!reciboRows.length) return res.status(400).json({ error: 'El recibo seleccionado no existe' });
      idReciboVal = reciboLimpio;
    }

    const ticket = crypto.randomUUID().slice(0, 8);

    let evidenciaUrl = '';
    if (req.file) {
      evidenciaUrl = await subirEvidenciaTicket(ticket, req.file.buffer, req.file.originalname, req.file.mimetype);
    }

    const telefonoVal = (telefono && String(telefono).trim())
      ? (parseInt(String(telefono).replace(/\D/g, ''), 10) || null)
      : null;

    await pool.execute(
      `INSERT INTO Dynamic_Tickets
       (Ticket, fecha_registro, \`Operación\`, solicitante, modulo, motivo, idrecibo, descripcion, Evidencia, telefono, Estado)
       VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, 'En Proceso')`,
      [ticket, operacion, usuario, modulo, motivo.trim(), idReciboVal, descripcion.trim(), evidenciaUrl, telefonoVal]
    );

    res.json({ ok: true, ticket });
  } catch (err) {
    console.error('[tickets] POST /api/crear:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Consulta de tickets (todos los módulos)
//  - "Mis tickets" del botón: tickets del usuario en la quincena actual.
//  - Pestaña Tickets del Directorio corporativo (Maestro_Menu: directorio /
//    Tickets, Rol "Todos"): todos los tickets con filtros.
//  - Editar: solo quien puso el ticket y mientras esté En Proceso o Pendiente.
// ══════════════════════════════════════════════════════════════════════════
const { accesoSeccion } = require('../services/maestroMenu');

const ESTADOS_EDITABLES = ['en proceso', 'pendiente'];
const RE_FECHA_YMD = /^\d{4}-\d{2}-\d{2}$/;

const SELECT_TICKET = `
  SELECT t.Ticket AS ticket,
         DATE_FORMAT(t.fecha_registro, '%Y-%m-%d %H:%i') AS fechaRegistro,
         t.\`Operación\` AS operacion, mo.REGIONAL AS regional,
         t.solicitante AS solicitante, COALESCE(NULLIF(t.modulo, ''), 'Sin módulo') AS modulo,
         t.motivo AS motivo, t.idrecibo AS idrecibo, t.descripcion AS descripcion,
         t.Evidencia AS evidencia, t.telefono AS telefono, t.Estado AS estado,
         t.Observaciones AS observaciones,
         DATE_FORMAT(t.fecha_finalizacion, '%Y-%m-%d %H:%i') AS fechaFinalizacion,
         t.satisfaccion AS satisfaccion, t.sugerencia AS sugerencia
  FROM Dynamic_Tickets t
  LEFT JOIN (SELECT \`OPERACIÓN\`, MAX(REGIONAL) AS REGIONAL FROM Maestro_Operaciones GROUP BY \`OPERACIÓN\`) mo
    ON mo.\`OPERACIÓN\` = t.\`Operación\``;

function hoyBogota() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

function puedeEditarTicket(t, usuario) {
  return String(t.solicitante || '').trim() === String(usuario || '').trim()
    && ESTADOS_EDITABLES.includes(String(t.estado || '').trim().toLowerCase());
}

async function usuarioRegistrado(usuario) {
  if (!usuario) return null;
  const [rows] = await pool.execute('SELECT ID, Rol FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
  return rows[0] || null;
}

// Rango de la quincena de hoy según Maestro_Fechas (si falta, del 1 al 15 o del 16 a fin de mes)
async function quincenaActual() {
  const hoy = hoyBogota();
  try {
    const [q] = await pool.execute('SELECT `Quincena` AS quincena, `Año` AS anio FROM Maestro_Fechas WHERE Fecha = ? LIMIT 1', [hoy]);
    if (q.length) {
      const [r] = await pool.execute(
        "SELECT DATE_FORMAT(MIN(Fecha), '%Y-%m-%d') AS desde, DATE_FORMAT(MAX(Fecha), '%Y-%m-%d') AS hasta FROM Maestro_Fechas WHERE `Quincena` = ? AND `Año` = ?",
        [q[0].quincena, q[0].anio]
      );
      if (r.length && r[0].desde) return { nombre: q[0].quincena, desde: r[0].desde, hasta: r[0].hasta };
    }
  } catch (e) { /* se usa el cálculo por días */ }
  const [y, m, d] = hoy.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return Number(d) <= 15
    ? { nombre: `Quincena 1 de ${mm}/${y}`, desde: `${y}-${mm}-01`, hasta: `${y}-${mm}-15` }
    : { nombre: `Quincena 2 de ${mm}/${y}`, desde: `${y}-${mm}-16`, hasta: `${y}-${mm}-${ultimo}` };
}

function conteoPorEstado(rows) {
  const porEstado = {};
  rows.forEach(t => { const e = t.estado || 'Sin estado'; porEstado[e] = (porEstado[e] || 0) + 1; });
  return porEstado;
}

// ── GET /api/mis-tickets?usuario=X — tickets del usuario en la quincena actual ─
router.get('/api/mis-tickets', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!(await usuarioRegistrado(usuario))) return res.status(403).json({ error: 'Usuario no reconocido' });
    const quincena = await quincenaActual();
    const [rows] = await pool.query(
      `${SELECT_TICKET}
       WHERE t.solicitante = ? AND t.fecha_registro >= ? AND t.fecha_registro < DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY t.fecha_registro DESC`,
      [usuario, quincena.desde, quincena.hasta]
    );
    rows.forEach(t => { t.puedeEditar = puedeEditarTicket(t, usuario); });
    res.json({ ok: true, quincena, total: rows.length, porEstado: conteoPorEstado(rows), tickets: rows });
  } catch (err) {
    console.error('[tickets] GET /api/mis-tickets:', err);
    res.status(500).json({ error: 'No se pudieron cargar tus tickets.' });
  }
});

// ── GET /api/listado — todos los tickets con filtros (pestaña Tickets del Directorio) ─
// Filtros: desde, hasta (fecha de registro), estado, modulo, regional, operacion, q, mios=1.
// Cada faceta (estado, módulo, regional, operación) cuenta con los demás filtros aplicados,
// para que las opciones muestren cuántos tickets quedarían al escogerlas.
router.get('/api/listado', async (req, res) => {
  try {
    const { usuario } = req.query;
    const user = await usuarioRegistrado(usuario);
    if (!user) return res.status(403).json({ error: 'Usuario no reconocido' });
    if (!(await accesoSeccion('directorio', user.Rol, 'Tickets'))) {
      return res.status(403).json({ error: 'No tienes acceso a la pestaña Tickets.' });
    }

    const quincena = await quincenaActual();
    const desde = RE_FECHA_YMD.test(req.query.desde || '') ? req.query.desde : quincena.desde;
    const hasta = RE_FECHA_YMD.test(req.query.hasta || '') ? req.query.hasta : quincena.hasta;
    const where = ['t.fecha_registro >= ?', 't.fecha_registro < DATE_ADD(?, INTERVAL 1 DAY)'];
    const params = [desde, hasta];
    if (req.query.mios === '1') { where.push('t.solicitante = ?'); params.push(usuario); }
    const q = String(req.query.q || '').trim();
    if (q) {
      const like = `%${q}%`;
      where.push('(t.Ticket LIKE ? OR t.solicitante LIKE ? OR t.motivo LIKE ? OR t.descripcion LIKE ? OR t.idrecibo LIKE ?)');
      params.push(like, like, like, like, like);
    }
    const [base] = await pool.query(
      `${SELECT_TICKET} WHERE ${where.join(' AND ')} ORDER BY t.fecha_registro DESC LIMIT 5000`,
      params
    );

    const filtros = {
      estado: String(req.query.estado || ''),
      modulo: String(req.query.modulo || ''),
      regional: String(req.query.regional || ''),
      operacion: String(req.query.operacion || '')
    };
    const valor = (t, campo) => (campo === 'regional' ? (t.regional || 'SIN REGIONAL') : (t[campo] || ''));
    const cumple = (t, excepto) => Object.keys(filtros).every(c => c === excepto || !filtros[c] || valor(t, c) === filtros[c]);
    const faceta = (campo) => {
      const conteo = {};
      base.filter(t => cumple(t, campo)).forEach(t => { const v = valor(t, campo); conteo[v] = (conteo[v] || 0) + 1; });
      return Object.entries(conteo).map(([v, n]) => ({ valor: v, n })).sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor, 'es'));
    };

    const rows = base.filter(t => cumple(t, null));
    rows.forEach(t => { t.puedeEditar = puedeEditarTicket(t, usuario); });
    res.json({
      ok: true,
      desde, hasta, quincena,
      truncado: base.length >= 5000,
      total: rows.length,
      facetas: { estado: faceta('estado'), modulo: faceta('modulo'), regional: faceta('regional'), operacion: faceta('operacion') },
      tickets: rows
    });
  } catch (err) {
    console.error('[tickets] GET /api/listado:', err);
    res.status(500).json({ error: 'No se pudieron cargar los tickets.' });
  }
});

// ── GET /api/ticket/:ticket?usuario=X — detalle ───────────────────────────────
router.get('/api/ticket/:ticket', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!(await usuarioRegistrado(usuario))) return res.status(403).json({ error: 'Usuario no reconocido' });
    const [rows] = await pool.query(`${SELECT_TICKET} WHERE t.Ticket = ? LIMIT 1`, [req.params.ticket]);
    if (!rows.length) return res.status(404).json({ error: 'Ticket no encontrado' });
    const t = rows[0];
    t.puedeEditar = puedeEditarTicket(t, usuario);
    res.json({ ok: true, ticket: t });
  } catch (err) {
    console.error('[tickets] GET /api/ticket/:ticket:', err);
    res.status(500).json({ error: 'No se pudo cargar el ticket.' });
  }
});

// ── PUT /api/ticket/:ticket — editar motivo, descripción y teléfono ──────────
// (motivo puede quedar vacío: hay tickets antiguos y módulos sin motivos configurados)
// Solo quien puso el ticket y mientras esté En Proceso o Pendiente.
router.put('/api/ticket/:ticket', async (req, res) => {
  try {
    const { usuario } = req.body || {};
    if (!(await usuarioRegistrado(usuario))) return res.status(403).json({ error: 'Usuario no reconocido' });
    const [rows] = await pool.query(`${SELECT_TICKET} WHERE t.Ticket = ? LIMIT 1`, [req.params.ticket]);
    if (!rows.length) return res.status(404).json({ error: 'Ticket no encontrado' });
    if (!puedeEditarTicket(rows[0], usuario)) {
      return res.status(403).json({ error: 'Solo quien puso el ticket puede editarlo, y solo mientras esté En Proceso o Pendiente.' });
    }
    const motivo = String(req.body.motivo || '').trim();
    const descripcion = String(req.body.descripcion || '').trim();
    if (!descripcion) return res.status(400).json({ error: 'La Descripción es obligatoria.' });
    const telefonoTxt = String(req.body.telefono || '').replace(/\D/g, '');
    const telefono = telefonoTxt ? (parseInt(telefonoTxt, 10) || null) : null;
    await pool.execute(
      'UPDATE Dynamic_Tickets SET motivo = ?, descripcion = ?, telefono = ? WHERE Ticket = ?',
      [motivo || null, descripcion, telefono, req.params.ticket]
    );
    const [act] = await pool.query(`${SELECT_TICKET} WHERE t.Ticket = ? LIMIT 1`, [req.params.ticket]);
    act[0].puedeEditar = puedeEditarTicket(act[0], usuario);
    res.json({ ok: true, ticket: act[0] });
  } catch (err) {
    console.error('[tickets] PUT /api/ticket/:ticket:', err);
    res.status(500).json({ error: 'No se pudo guardar el ticket.' });
  }
});

module.exports = router;
