const express = require('express');
const crypto = require('crypto');
const pool = require('../services/db');
const { computarAccesoNomina } = require('../services/accesoNomina');
const { calcularProduccion, MAX_DIAS_RANGO } = require('../services/produccionDestajo');
const { obtenerPermisosProduccion } = require('../services/configProduccion');

// Nómina · Producción (destajo colectivo). Ver cada subpestaña: Maestro_Menu (nomina /
// Produccion, Produccion_Areas, Produccion_Tarifas). Acciones: Config_Parametros (configProduccion.js).
const router = express.Router();

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function ahoraBogota() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

// Acceso a la sección; si no lo tiene, responde y devuelve null.
async function exigirSeccion(req, res, seccion) {
  const usuario = req.query.usuario || (req.body && req.body.usuario);
  if (!usuario) { res.status(400).json({ error: 'usuario requerido' }); return null; }
  const acceso = await computarAccesoNomina(usuario, seccion);
  if (!acceso) { res.status(403).json({ error: 'No autorizado' }); return null; }
  return acceso;
}

function operacionPermitida(acceso, operacion) {
  return acceso.sinFiltro || (acceso.operacionesFiltro || []).includes(operacion);
}

// ══════════════════════════════════════════════════════════════════════════
// Registros (destajo por Operación y Día)
// ══════════════════════════════════════════════════════════════════════════
router.get('/api/registros', async (req, res) => {
  try {
    const acceso = await exigirSeccion(req, res, 'Produccion');
    if (!acceso) return;

    const { desde, hasta, operacion } = req.query;
    if (!RE_FECHA.test(desde || '') || !RE_FECHA.test(hasta || '')) {
      return res.status(400).json({ error: 'Rango de fechas inválido (desde y hasta en formato AAAA-MM-DD).' });
    }
    const dias = (new Date(hasta) - new Date(desde)) / 86400000;
    if (dias < 0) return res.status(400).json({ error: 'La fecha inicial es posterior a la final.' });
    if (dias > MAX_DIAS_RANGO) return res.status(400).json({ error: `El rango máximo es de ${MAX_DIAS_RANGO} días.` });
    if (operacion && !operacionPermitida(acceso, operacion)) return res.status(403).json({ error: 'No tienes acceso a esa operación.' });

    const registros = await calcularProduccion({
      desde, hasta,
      operacion: operacion || null,
      operaciones: acceso.sinFiltro ? null : acceso.operacionesFiltro,
    });
    res.json({ ok: true, registros });
  } catch (err) {
    console.error('[produccion] GET /api/registros:', err);
    res.status(500).json({ error: 'Error al calcular la producción.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Áreas (Config_Area)
// ══════════════════════════════════════════════════════════════════════════
router.get('/api/areas', async (req, res) => {
  try {
    const acceso = await exigirSeccion(req, res, 'Produccion_Areas');
    if (!acceso) return;
    const [rows] = await pool.query(`
      SELECT a.ID AS id, a.AREA AS area, a.\`OPERACIÓN\` AS operacion, o.REGIONAL AS regional,
             a.OPERATIVO AS operativo, a.ADMINISTRATIVO AS administrativo, a.DTJO AS dtjo,
             a.GRUPAL AS grupal, a.ASIGNADO AS asignado
      FROM Config_Area a
      LEFT JOIN Maestro_Operaciones o ON o.\`OPERACIÓN\` = a.\`OPERACIÓN\`
      ORDER BY a.\`OPERACIÓN\`, a.AREA`);
    res.json(rows.filter(r => operacionPermitida(acceso, r.operacion)));
  } catch (err) {
    console.error('[produccion] GET /api/areas:', err);
    res.status(500).json({ error: 'Error al consultar las áreas.' });
  }
});

// Valida el cuerpo de un área. ASIGNADO llega en porcentaje (0 a 100) y se guarda como fracción.
function leerArea(body, acceso) {
  const area = String(body.area || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const operacion = String(body.operacion || '').trim();
  if (!area) return { error: 'El nombre del área es obligatorio.' };
  if (!operacion) return { error: 'Escoge la operación.' };
  if (!operacionPermitida(acceso, operacion)) return { error: 'No tienes acceso a esa operación.' };
  const pct = body.asignado === '' || body.asignado == null ? 0 : Number(body.asignado);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { error: 'ASIGNADO debe ser un porcentaje entre 0 y 100.' };
  return {
    area, operacion,
    operativo: body.operativo ? 'V' : '',
    administrativo: body.administrativo ? 'V' : '',
    dtjo: body.dtjo ? 1 : 0,
    grupal: body.grupal ? 1 : 0,
    asignado: Math.round(pct) / 100,
  };
}

router.post('/api/areas', async (req, res) => {
  try {
    const acceso = await exigirSeccion(req, res, 'Produccion_Areas');
    if (!acceso) return;
    const a = leerArea(req.body, acceso);
    if (a.error) return res.status(400).json({ error: a.error });

    const [dup] = await pool.query('SELECT ID FROM Config_Area WHERE UPPER(TRIM(AREA)) = ? AND `OPERACIÓN` = ? LIMIT 1', [a.area, a.operacion]);
    if (dup.length) return res.status(409).json({ error: `Ya existe el área ${a.area} en ${a.operacion}.` });

    // ID autoincremental (migración 2026-10-26_nomina_produccion.sql)
    const [r] = await pool.execute(
      'INSERT INTO Config_Area (AREA, `OPERACIÓN`, OPERATIVO, ADMINISTRATIVO, DTJO, GRUPAL, ASIGNADO) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [a.area, a.operacion, a.operativo, a.administrativo, a.dtjo, a.grupal, a.asignado]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error('[produccion] POST /api/areas:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/areas/:id', async (req, res) => {
  try {
    const acceso = await exigirSeccion(req, res, 'Produccion_Areas');
    if (!acceso) return;
    const [actual] = await pool.query('SELECT `OPERACIÓN` AS operacion FROM Config_Area WHERE ID = ? LIMIT 1', [req.params.id]);
    if (!actual.length) return res.status(404).json({ error: 'Área no encontrada.' });
    if (!operacionPermitida(acceso, actual[0].operacion)) return res.status(403).json({ error: 'No tienes acceso a esa operación.' });
    const a = leerArea(req.body, acceso);
    if (a.error) return res.status(400).json({ error: a.error });

    const [dup] = await pool.query('SELECT ID FROM Config_Area WHERE UPPER(TRIM(AREA)) = ? AND `OPERACIÓN` = ? AND ID <> ? LIMIT 1', [a.area, a.operacion, req.params.id]);
    if (dup.length) return res.status(409).json({ error: `Ya existe el área ${a.area} en ${a.operacion}.` });

    await pool.execute(
      'UPDATE Config_Area SET AREA = ?, `OPERACIÓN` = ?, OPERATIVO = ?, ADMINISTRATIVO = ?, DTJO = ?, GRUPAL = ?, ASIGNADO = ? WHERE ID = ?',
      [a.area, a.operacion, a.operativo, a.administrativo, a.dtjo, a.grupal, a.asignado, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[produccion] PUT /api/areas/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/areas/:id', async (req, res) => {
  try {
    const acceso = await exigirSeccion(req, res, 'Produccion_Areas');
    if (!acceso) return;
    if (!(await obtenerPermisosProduccion(acceso.rol)).puedeEliminarAreas) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para eliminar áreas.' });
    }
    // No se borra un área en uso: la usan la asistencia, los servicios u otras tablas.
    const id = req.params.id;
    const [[uso]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM Dynamic_Asistencia WHERE Area = ?) AS asistencia,
         (SELECT COUNT(*) FROM Dynamic_Servicios WHERE Area = ?) AS servicios`,
      [String(id), id]
    );
    if (Number(uso.asistencia) || Number(uso.servicios)) {
      return res.status(409).json({ error: `No se puede eliminar: el área tiene ${uso.asistencia} registros de asistencia y ${uso.servicios} servicios.` });
    }
    const [r] = await pool.execute('DELETE FROM Config_Area WHERE ID = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Área no encontrada.' });
    res.json({ ok: true });
  } catch (err) {
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'No se puede eliminar: otra tabla usa esta área.' });
    }
    console.error('[produccion] DELETE /api/areas/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Valor fijo Nómina (Maestro_Tarifas, solo Tipo de Cobro GENERAL)
// ══════════════════════════════════════════════════════════════════════════
router.get('/api/tarifas', async (req, res) => {
  try {
    const acceso = await exigirSeccion(req, res, 'Produccion_Tarifas');
    if (!acceso) return;
    const [rows] = await pool.query(`
      SELECT t.IdTarifa AS id, o.REGIONAL AS regional, t.\`Operación\` AS operacion,
             t.Actividad AS actividadId, ca.Actividad AS actividad, t.Unidad AS unidad, t.Vehiculo AS vehiculo,
             t.\`Tipo de Cobro\` AS tipoCobro, t.Valor AS valor, t.valor_nomina AS valorNomina,
             t.Observaciones AS observaciones,
             DATE_FORMAT(t.\`Fecha de Registro\`, '%Y-%m-%d %H:%i') AS fechaRegistro, t.Usuario AS usuario
      FROM Maestro_Tarifas t
      LEFT JOIN Config_Actividad ca ON CAST(ca.ID AS CHAR) = t.Actividad
      LEFT JOIN Maestro_Operaciones o ON o.\`OPERACIÓN\` = t.\`Operación\`
      WHERE UPPER(TRIM(t.\`Tipo de Cobro\`)) = 'GENERAL'
      ORDER BY t.\`Operación\`, ca.Actividad, t.Unidad`);
    res.json(rows.filter(r => operacionPermitida(acceso, r.operacion)));
  } catch (err) {
    console.error('[produccion] GET /api/tarifas:', err);
    res.status(500).json({ error: 'Error al consultar las tarifas.' });
  }
});

// Listas del formulario: actividades por operación, unidades y vehículos.
router.get('/api/tarifas/opciones', async (req, res) => {
  try {
    const acceso = await exigirSeccion(req, res, 'Produccion_Tarifas');
    if (!acceso) return;
    const [[actividades], [unidades], [vehiculos]] = await Promise.all([
      pool.query('SELECT ID AS id, Actividad AS actividad, `Operación` AS operacion FROM Config_Actividad ORDER BY Actividad'),
      pool.query('SELECT Unidad AS unidad FROM Config_Unidad ORDER BY Unidad'),
      pool.query('SELECT Vehiculo AS vehiculo FROM Config_Vehiculo ORDER BY Vehiculo'),
    ]);
    res.json({
      actividades: actividades.filter(a => operacionPermitida(acceso, a.operacion)),
      unidades: unidades.map(u => u.unidad),
      vehiculos: vehiculos.map(v => v.vehiculo),
    });
  } catch (err) {
    console.error('[produccion] GET /api/tarifas/opciones:', err);
    res.status(500).json({ error: 'Error al consultar las opciones.' });
  }
});

async function leerTarifa(body, acceso) {
  const operacion = String(body.operacion || '').trim();
  const actividad = String(body.actividadId || '').trim();
  const unidad = String(body.unidad || '').trim().toUpperCase();
  const vehiculo = unidad === 'CUPO' ? String(body.vehiculo || '').trim().toUpperCase() : '';
  if (!operacion || !actividad || !unidad) return { error: 'Operación, Actividad y Unidad son obligatorias.' };
  if (unidad === 'CUPO' && !vehiculo) return { error: 'Con la unidad CUPO el Vehículo es obligatorio.' };
  if (!operacionPermitida(acceso, operacion)) return { error: 'No tienes acceso a esa operación.' };
  const [act] = await pool.query('SELECT ID FROM Config_Actividad WHERE ID = ? AND `Operación` = ? LIMIT 1', [actividad, operacion]);
  if (!act.length) return { error: 'La actividad no pertenece a esa operación.' };
  const valor = Number(body.valor);
  const valorNomina = Number(body.valorNomina);
  if (!Number.isFinite(valor) || valor < 0) return { error: 'El Valor no es válido.' };
  if (!Number.isFinite(valorNomina) || valorNomina < 0) return { error: 'El valor_nomina no es válido.' };
  return { operacion, actividad, unidad, vehiculo, valor, valorNomina, observaciones: String(body.observaciones || '').trim().slice(0, 50) };
}

async function existeTarifa(t, excluirId = null) {
  const [dup] = await pool.query(
    `SELECT IdTarifa FROM Maestro_Tarifas
     WHERE UPPER(TRIM(\`Tipo de Cobro\`)) = 'GENERAL' AND \`Operación\` = ? AND Actividad = ? AND UPPER(TRIM(Unidad)) = ?
       AND UPPER(TRIM(IFNULL(Vehiculo, ''))) = ? AND (? IS NULL OR IdTarifa <> ?) LIMIT 1`,
    [t.operacion, t.actividad, t.unidad, t.vehiculo, excluirId, excluirId]
  );
  return dup.length > 0;
}

router.post('/api/tarifas', async (req, res) => {
  try {
    const acceso = await exigirSeccion(req, res, 'Produccion_Tarifas');
    if (!acceso) return;
    if (!(await obtenerPermisosProduccion(acceso.rol)).puedeEditarTarifas) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para agregar valores fijos de nómina.' });
    }
    const t = await leerTarifa(req.body, acceso);
    if (t.error) return res.status(400).json({ error: t.error });
    if (await existeTarifa(t)) return res.status(409).json({ error: 'Ya existe una tarifa GENERAL con esa Operación, Actividad, Unidad y Vehículo.' });

    const id = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO Maestro_Tarifas (IdTarifa, \`Operación\`, Actividad, Unidad, Vehiculo, \`Tipo de Cobro\`, Proveedor, Transportadora, Valor, valor_nomina, Observaciones, \`Fecha de Registro\`, Usuario)
       VALUES (?, ?, ?, ?, ?, 'GENERAL', '', '', ?, ?, ?, ?, ?)`,
      [id, t.operacion, t.actividad, t.unidad, t.vehiculo, t.valor, t.valorNomina, t.observaciones, ahoraBogota(), acceso.usuarioId]
    );
    res.json({ ok: true, id });
  } catch (err) {
    console.error('[produccion] POST /api/tarifas:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/tarifas/:id', async (req, res) => {
  try {
    const acceso = await exigirSeccion(req, res, 'Produccion_Tarifas');
    if (!acceso) return;
    if (!(await obtenerPermisosProduccion(acceso.rol)).puedeEditarTarifas) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para editar valores fijos de nómina.' });
    }
    const [actual] = await pool.query("SELECT `Operación` AS operacion FROM Maestro_Tarifas WHERE IdTarifa = ? AND UPPER(TRIM(`Tipo de Cobro`)) = 'GENERAL' LIMIT 1", [req.params.id]);
    if (!actual.length) return res.status(404).json({ error: 'Tarifa no encontrada.' });
    if (!operacionPermitida(acceso, actual[0].operacion)) return res.status(403).json({ error: 'No tienes acceso a esa operación.' });
    const t = await leerTarifa(req.body, acceso);
    if (t.error) return res.status(400).json({ error: t.error });
    if (await existeTarifa(t, req.params.id)) return res.status(409).json({ error: 'Ya existe otra tarifa GENERAL con esa Operación, Actividad, Unidad y Vehículo.' });

    await pool.execute(
      'UPDATE Maestro_Tarifas SET `Operación` = ?, Actividad = ?, Unidad = ?, Vehiculo = ?, Valor = ?, valor_nomina = ?, Observaciones = ?, Usuario = ? WHERE IdTarifa = ?',
      [t.operacion, t.actividad, t.unidad, t.vehiculo, t.valor, t.valorNomina, t.observaciones, acceso.usuarioId, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[produccion] PUT /api/tarifas/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/tarifas/:id', async (req, res) => {
  try {
    const acceso = await exigirSeccion(req, res, 'Produccion_Tarifas');
    if (!acceso) return;
    if (!(await obtenerPermisosProduccion(acceso.rol)).puedeEliminarTarifas) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para eliminar valores fijos de nómina.' });
    }
    const [r] = await pool.execute("DELETE FROM Maestro_Tarifas WHERE IdTarifa = ? AND UPPER(TRIM(`Tipo de Cobro`)) = 'GENERAL'", [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Tarifa no encontrada.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[produccion] DELETE /api/tarifas/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
