const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const pool = require('../services/db');
const { subirSoporteGasto, storage } = require('../services/storage');


const router = express.Router();

const HTML_INDEX_PATH = path.join(__dirname, '../views/cajaoperativa/index.html');
const HTML_REEMBOLSO_PATH = path.join(__dirname, '../views/reembolso/index.html');

// Helper to format date in Colombia time
function getBogotaDateString() {
  const date = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ═════ ACCESO Y ROLES ═════
async function computarAccesoCajaOperativa(usuarioId) {
  if (!usuarioId) return null;
  const [uRows] = await pool.execute(
    'SELECT ID, Nombre, Rol, Regional, Dispositivo, `Operación` FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );
  if (!uRows.length) return null;
  const usuario = uRows[0];
  const rol = usuario.Rol || '';

  const ALLOWED_ROLES = [
    'Contabilidad', 'Control', 'Sistema', 
    'Auxiliar', 'AuxiliarR', 'Coordinador', 'CoordinadorR'
  ];
  if (!ALLOWED_ROLES.includes(rol)) return null;

  const acceso = {
    usuarioId: usuario.ID,
    usuarioNombre: usuario.Nombre || usuario.ID,
    rol,
    regional: usuario.Regional || '',
    dispositivo: usuario.Dispositivo || '',
    operacion: usuario['Operación'] || '',
    sinFiltro: ['Contabilidad', 'Control', 'Sistema'].includes(rol),
    operacionesFiltro: [],
    opsPorRegional: {},
  };

  let opRows = [];
  if (acceso.sinFiltro) {
    const [rows] = await pool.execute(
      "SELECT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY REGIONAL, OPERACIÓN"
    );
    opRows = rows;
  } else if (['AuxiliarR', 'CoordinadorR'].includes(rol)) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.regional]
    );
    opRows = rows;
  } else if (acceso.operacion) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.operacion]
    );
    opRows = rows;
  }

  acceso.opsPorRegional = {};
  opRows.forEach((row) => {
    const reg = row.REGIONAL || row.Regional;
    const op = row.OPERACIÓN || row.Operación;
    if (reg && op) {
      if (!acceso.opsPorRegional[reg]) acceso.opsPorRegional[reg] = [];
      acceso.opsPorRegional[reg].push(op);
    }
  });
  acceso.operacionesFiltro = opRows.map((row) => row['OPERACIÓN'] || row['Operación']).filter(Boolean);

  return acceso;
}

let lastPeriodVerificationDate = null;

// ═════ AUTOMATED PERIOD GENERATOR ═════
async function verificarYGenerarPeriodos() {
  try {
    const dateStr = getBogotaDateString();
    if (lastPeriodVerificationDate === dateStr) {
      return; // Already checked/generated for today
    }
    
    // 1. Query Maestro_Fechas for current quincena/year mapped to today's date
    const [mfRows] = await pool.execute(
      'SELECT Quincena, Año FROM Maestro_Fechas WHERE Fecha = ? LIMIT 1',
      [dateStr]
    );
    if (!mfRows.length) {
      console.log(`[CajaOperativa] No dates mapping for ${dateStr} in Maestro_Fechas.`);
      return;
    }
    const { Quincena, Año } = mfRows[0];

    // 2. Fetch all responsibles
    const [respRows] = await pool.execute('SELECT * FROM Maestro_responsablegastos');
    if (!respRows.length) return;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const resp of respRows) {
        // Check if period already exists
        const [existing] = await conn.execute(
          'SELECT idperiodo FROM Dynamic_gastos_periodo WHERE idresponsable = ? AND quincena = ? AND año = ? LIMIT 1',
          [resp.idresponsable, Quincena, Año]
        );
        if (existing.length) continue;

        // Fetch previous period to carry over saldo_final as new saldo_inicial
        const [prevPeriod] = await conn.execute(
          'SELECT saldo_final FROM Dynamic_gastos_periodo WHERE idresponsable = ? ORDER BY fecha_registro DESC LIMIT 1',
          [resp.idresponsable]
        );

        let saldoInicial = resp.base_autorizada;
        if (prevPeriod.length) {
          saldoInicial = prevPeriod[0].saldo_final;
        }

        const idperiodo = uuidv4();
        await conn.execute(
          `INSERT INTO Dynamic_gastos_periodo 
           (idperiodo, quincena, año, saldo_inicial, saldo_final, idresponsable, observaciones, usuario)
           VALUES (?, ?, ?, ?, ?, ?, 'Generación automática', 'Sistema')`,
          [idperiodo, Quincena, Año, saldoInicial, saldoInicial, resp.idresponsable]
        );
        console.log(`[CajaOperativa] Auto-generated period for responsible ${resp.idresponsable} (${Quincena} - ${Año})`);
      }

      await conn.commit();
      lastPeriodVerificationDate = dateStr;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('[CajaOperativa] Error generating automatic periods:', err);
  }
}

// Resolves responsible names from Maestro_Vinculación
async function obtenerNombresResponsables(identificaciones) {
  if (!identificaciones || identificaciones.length === 0) return {};
  try {
    const placeholders = identificaciones.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT Identificación, Trabajador 
       FROM Maestro_Vinculación 
       WHERE Identificación IN (${placeholders})`,
      identificaciones
    );
    const map = {};
    for (const r of rows) {
      const ident = r.Identificación;
      const trab = r.Trabajador;
      if (!ident || !trab) continue;
      const parts = trab.split(' ** ');
      map[ident] = parts.length > 1 ? parts[1].trim() : trab.trim();
    }
    return map;
  } catch (err) {
    console.error('[CajaOperativa] Error looking up names in Maestro_Vinculación:', err);
    return {};
  }
}

// Recalculates and updates saldo_inicial and saldo_final for ALL periods of a responsible chronologically
async function recalcularTodosLosSaldosResponsable(idresponsable, conn = pool) {
  try {
    // 1. Get base authorized
    const [respRows] = await conn.execute(
      'SELECT base_autorizada FROM Maestro_responsablegastos WHERE idresponsable = ? LIMIT 1',
      [idresponsable]
    );
    if (!respRows.length) return;
    const baseAutorizada = Number(respRows[0].base_autorizada);

    // 2. Get all periods of this responsible, sorted chronologically using Maestro_Fechas
    const [periods] = await conn.execute(
      `SELECT p.idperiodo, p.quincena, p.año,
              (SELECT MIN(Fecha) FROM Maestro_Fechas WHERE Quincena = p.quincena AND Año = p.año) AS min_fecha
       FROM Dynamic_gastos_periodo p
       WHERE p.idresponsable = ?
       ORDER BY min_fecha ASC, p.fecha_registro ASC`,
      [idresponsable]
    );

    let currentSaldoInicial = baseAutorizada;

    for (const p of periods) {
      const idperiodo = p.idperiodo;

      // 3. Compute dynamic reintegros for this period
      const [reintRows] = await conn.execute(
        `SELECT COALESCE(SUM(r.valor), 0) AS total_reintegros
         FROM Dynamic_gastos_reintegro r
         JOIN Dynamic_gastos_periodo gp ON gp.idresponsable = r.idresponsable
         JOIN Maestro_Fechas mf ON mf.Fecha = DATE(r.fecha_reintegro)
         WHERE gp.idperiodo = ?
           AND r.estado = 'APROBADO'
           AND mf.Quincena = gp.quincena
           AND mf.Año = gp.año`,
        [idperiodo]
      );
      const reintegros = reintRows.length ? Number(reintRows[0].total_reintegros) : 0;

      // 4. Compute dynamic expenses for this period
      const [gRows] = await conn.execute(
        'SELECT valor, valida_operacion, valida_contable FROM Dynamic_gastos WHERE idperiodo = ?',
        [idperiodo]
      );

      const hasPendingContable = gRows.some(g => g.valida_contable === 'PENDIENTE');
      let totalGastos = 0;
      if (hasPendingContable) {
        // Prioritize valida_operacion (Validado por Responsable)
        totalGastos = gRows
          .filter(g => g.valida_operacion === 'Confirmado')
          .reduce((sum, g) => sum + Number(g.valor), 0);
      } else {
        // Prioritize valida_contable (Aprobado por Contabilidad)
        totalGastos = gRows
          .filter(g => g.valida_contable === 'Confirmado')
          .reduce((sum, g) => sum + Number(g.valor), 0);
      }

      const saldoFinal = currentSaldoInicial + reintegros - totalGastos;

      // 5. Update period in database
      await conn.execute(
        'UPDATE Dynamic_gastos_periodo SET saldo_inicial = ?, saldo_final = ? WHERE idperiodo = ?',
        [currentSaldoInicial, saldoFinal, idperiodo]
      );

      // Carry over to next period
      currentSaldoInicial = saldoFinal;
    }
  } catch (err) {
    console.error('[CajaOperativa] Error recalculating all periods for responsible:', err);
  }
}

async function recargarSaldosPeriodo(idperiodo, conn = pool) {
  try {
    const [pRows] = await conn.execute(
      'SELECT idresponsable FROM Dynamic_gastos_periodo WHERE idperiodo = ? LIMIT 1',
      [idperiodo]
    );
    if (!pRows.length) return;
    await recalcularTodosLosSaldosResponsable(pRows[0].idresponsable, conn);
  } catch (err) {
    console.error('[CajaOperativa] Error wrapping balance recalculation:', err);
  }
}

// ═════ ROUTES ═════

// Serve Admin UI / Reembolso UI
router.get('/', (req, res) => {
  if (req.baseUrl === '/reembolso') {
    res.sendFile(HTML_REEMBOLSO_PATH);
  } else {
    res.sendFile(HTML_INDEX_PATH);
  }
});

// Serve Public Reembolso UI
router.get('/reembolso', (req, res) => {
  res.sendFile(HTML_REEMBOLSO_PATH);
});

// Access Info API
router.get('/api/acceso', async (req, res) => {
  try {
    const { usuario } = req.query;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    
    // Auto-generate missing periods on panel load
    await verificarYGenerarPeriodos();

    res.json(acceso);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/quincenas-maestro', async (req, res) => {
  try {
    const { usuario } = req.query;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [rows] = await pool.execute(
      'SELECT Quincena, MIN(Fecha) as MinFecha FROM Maestro_Fechas GROUP BY Quincena ORDER BY MinFecha DESC'
    );
    const quincenas = rows.map(r => r.Quincena).filter(Boolean);
    res.json(quincenas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 1. RESPONSABLES ENDPOINTS ──

router.get('/api/responsables', async (req, res) => {
  try {
    const { usuario } = req.query;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'No autorizado.' });
    }

    const [rows] = await pool.execute('SELECT * FROM Maestro_responsablegastos ORDER BY fecha_registro DESC');
    
    // Filter rows based on user permissions
    const filteredRows = rows.filter(r => {
      if (acceso.sinFiltro) return true;
      return acceso.opsPorRegional[r.regional] && acceso.opsPorRegional[r.regional].includes(r.operacionprincipal);
    });

    // Resolve full names from Maestro_Vinculación
    const idents = [...new Set(filteredRows.map(r => r.identificacion).filter(Boolean))];
    const namesMap = await obtenerNombresResponsables(idents);

    const processed = [];
    for (const r of filteredRows) {
      const [pRows] = await pool.execute(
        'SELECT idperiodo, saldo_final FROM Dynamic_gastos_periodo WHERE idresponsable = ? ORDER BY fecha_registro DESC LIMIT 1',
        [r.idresponsable]
      );
      
      let saldo = Number(r.base_autorizada);
      if (pRows.length) {
        saldo = Number(pRows[0].saldo_final);
      }

      const totalUsado = Number(r.base_autorizada) - saldo;
      const porcentaje = Number(r.base_autorizada) > 0 ? (totalUsado / Number(r.base_autorizada)) * 100 : 0;
      const resolvedName = namesMap[r.identificacion] || r.usuario;

      processed.push({
        ...r,
        usuario: resolvedName,
        saldo,
        porcentaje_uso: porcentaje
      });
    }

    res.json(processed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/responsables/crear', async (req, res) => {
  try {
    const { usuario, identificacion, regional, operacionprincipal, banco, numerocuenta, base_autorizada, observaciones } = req.body;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso || !acceso.sinFiltro) {
      return res.status(403).json({ error: 'No autorizado para crear responsables.' });
    }

    if (!identificacion || !regional || !operacionprincipal || !base_autorizada) {
      return res.status(400).json({ error: 'identificacion, regional, operacionprincipal y base_autorizada requeridos.' });
    }

    const idresponsable = uuidv4();
    await pool.execute(
      `INSERT INTO Maestro_responsablegastos 
       (idresponsable, identificacion, regional, operacionprincipal, banco, numerocuenta, base_autorizada, observaciones, usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [idresponsable, identificacion, regional, operacionprincipal, banco || null, numerocuenta || null, base_autorizada, observaciones || null, acceso.usuarioNombre]
    );

    // Auto-generate quincena period for this new responsible
    await verificarYGenerarPeriodos();

    res.json({ ok: true, idresponsable });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/responsables/:idresponsable', async (req, res) => {
  try {
    const { idresponsable } = req.params;
    const { usuario, identificacion, regional, operacionprincipal, banco, numerocuenta, base_autorizada, observaciones } = req.body;

    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso || !acceso.sinFiltro) {
      return res.status(403).json({ error: 'No autorizado para editar responsables.' });
    }

    if (!identificacion || !regional || !operacionprincipal || !base_autorizada) {
      return res.status(400).json({ error: 'Cédula, regional, operación y base autorizada son obligatorios.' });
    }

    await pool.execute(
      `UPDATE Maestro_responsablegastos 
       SET identificacion = ?, regional = ?, operacionprincipal = ?, banco = ?, 
           numerocuenta = ?, base_autorizada = ?, observaciones = ?
       WHERE idresponsable = ?`,
      [
        identificacion.trim(), regional, operacionprincipal, banco ? banco.trim() : null,
        numerocuenta ? numerocuenta.trim() : null, base_autorizada, observaciones ? observaciones.trim() : null,
        idresponsable
      ]
    );

    // Recalculate balances for the active/latest period of this responsible if exists!
    const [pRows] = await pool.execute(
      'SELECT idperiodo FROM Dynamic_gastos_periodo WHERE idresponsable = ? ORDER BY fecha_registro DESC LIMIT 1',
      [idresponsable]
    );
    if (pRows.length) {
      await recargarSaldosPeriodo(pRows[0].idperiodo);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/responsables/:id', async (req, res) => {
  try {
    const { usuario } = req.query;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso || !acceso.sinFiltro) {
      return res.status(403).json({ error: 'No autorizado.' });
    }

    await pool.execute('DELETE FROM Maestro_responsablegastos WHERE idresponsable = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 2. REINTEGROS ENDPOINTS ──

router.get('/api/reintegros', async (req, res) => {
  try {
    const { usuario } = req.query;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    let query = `
      SELECT r.*, resp.regional, resp.operacionprincipal AS operacion, resp.identificacion AS resp_identificacion, resp.base_autorizada
      FROM Dynamic_gastos_reintegro r
      JOIN Maestro_responsablegastos resp ON r.idresponsable = resp.idresponsable
    `;
    const params = [];

    // Filter by role view
    if (!acceso.sinFiltro) {
      if (acceso.operacionesFiltro.length > 0) {
        const placeholders = acceso.operacionesFiltro.map(() => '?').join(',');
        query += ` WHERE resp.operacionprincipal IN (${placeholders})`;
        params.push(...acceso.operacionesFiltro);
      } else {
        query += ` WHERE resp.regional = ?`;
        params.push(acceso.regional);
      }
    }

    query += ' ORDER BY r.fecha_solicitud DESC';

    const [rows] = await pool.execute(query, params);

    // Resolve full names from Maestro_Vinculación
    const idents = [...new Set(rows.map(r => r.resp_identificacion).filter(Boolean))];
    const namesMap = await obtenerNombresResponsables(idents);

    const processed = rows.map(r => {
      const resolvedName = namesMap[r.resp_identificacion] || r.usuariosolicita;
      return {
        ...r,
        usuariosolicita: resolvedName
      };
    });

    res.json(processed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/reintegros/solicitar', async (req, res) => {
  try {
    const { usuario, idresponsable, observaciones_solicitante } = req.body;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    // Validate that this responsible exists
    const [respRows] = await pool.execute(
      'SELECT base_autorizada FROM Maestro_responsablegastos WHERE idresponsable = ? LIMIT 1',
      [idresponsable]
    );
    if (!respRows.length) return res.status(400).json({ error: 'Responsable no encontrado.' });
    const baseAutorizada = Number(respRows[0].base_autorizada);

    // Calculate current usage percentage in the active period
    const [pRows] = await pool.execute(
      'SELECT idperiodo, saldo_final FROM Dynamic_gastos_periodo WHERE idresponsable = ? ORDER BY fecha_registro DESC LIMIT 1',
      [idresponsable]
    );
    let saldo = baseAutorizada;
    if (pRows.length) {
      const idperiodo = pRows[0].idperiodo;
      await recargarSaldosPeriodo(idperiodo);
      const [updatedPeriod] = await pool.execute(
        'SELECT saldo_final FROM Dynamic_gastos_periodo WHERE idperiodo = ? LIMIT 1',
        [idperiodo]
      );
      saldo = Number(updatedPeriod[0].saldo_final);
    }
    const totalUsado = baseAutorizada - saldo;
    const porcentaje = baseAutorizada > 0 ? (totalUsado / baseAutorizada) * 100 : 0;

    if (porcentaje < 60) {
      return res.status(400).json({ 
        error: `No se puede solicitar reintegro. El porcentaje de uso actual es del ${porcentaje.toFixed(1)}%, y debe ser igual o superior al 60%.` 
      });
    }

    const idreintegro = uuidv4();
    await pool.execute(
      `INSERT INTO Dynamic_gastos_reintegro 
       (idreintegro, fecha_solicitud, valor, idresponsable, observaciones_solicitante, usuariosolicita, estado)
       VALUES (?, NOW(), ?, ?, ?, ?, 'PENDIENTE')`,
      [idreintegro, baseAutorizada, idresponsable, observaciones_solicitante || null, acceso.usuarioNombre]
    );

    res.json({ ok: true, idreintegro });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/reintegros/:id/aprobar', async (req, res) => {
  try {
    const { usuario, valor, observaciones_aprobador } = req.body;
    const { id } = req.params;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso || !acceso.sinFiltro) {
      return res.status(403).json({ error: 'No autorizado para aprobar reintegros.' });
    }

    const [rRows] = await pool.execute(
      'SELECT idresponsable, estado FROM Dynamic_gastos_reintegro WHERE idreintegro = ? LIMIT 1',
      [id]
    );
    if (!rRows.length) return res.status(404).json({ error: 'Reintegro no encontrado.' });
    if (rRows[0].estado === 'APROBADO') return res.status(400).json({ error: 'El reintegro ya ha sido aprobado.' });

    const idresponsable = rRows[0].idresponsable;

    // Resolve active quincena period for this responsible today
    const dateStr = getBogotaDateString();
    const [mfRows] = await pool.execute(
      'SELECT Quincena, Año FROM Maestro_Fechas WHERE Fecha = ? LIMIT 1',
      [dateStr]
    );
    if (!mfRows.length) return res.status(400).json({ error: 'No se pudo mapear la fecha actual a una quincena.' });
    const { Quincena, Año } = mfRows[0];

    const [pRows] = await pool.execute(
      'SELECT idperiodo FROM Dynamic_gastos_periodo WHERE idresponsable = ? AND quincena = ? AND año = ? LIMIT 1',
      [idresponsable, Quincena, Año]
    );
    if (!pRows.length) return res.status(400).json({ error: 'No existe un período activo de flujo de caja para este responsable hoy.' });
    const idperiodo = pRows[0].idperiodo;

    const approvedVal = Number(valor);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Update reintegro status
      await conn.execute(
        `UPDATE Dynamic_gastos_reintegro 
         SET estado = 'APROBADO', fecha_reintegro = NOW(), valor = ?, observaciones_aprobador = ?, usuarioaprueba = ?
         WHERE idreintegro = ?`,
        [approvedVal, observaciones_aprobador || null, acceso.usuarioNombre, id]
      );

      // Recalculation will be handled by recargarSaldosPeriodo right after committing
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    // Recalculate balances
    await recargarSaldosPeriodo(idperiodo);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 3. FLUJO DE CAJA / PERIODOS ENDPOINTS ──

router.get('/api/periodos', async (req, res) => {
  try {
    const { usuario } = req.query;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    let query = `
      SELECT p.*, resp.identificacion AS resp_identificacion, resp.regional, resp.operacionprincipal,
             (SELECT COALESCE(SUM(valor), 0) FROM Dynamic_gastos WHERE idperiodo = p.idperiodo) AS total_gastos,
             (SELECT COALESCE(SUM(valor), 0) FROM Dynamic_gastos WHERE idperiodo = p.idperiodo AND valida_operacion = 'Confirmado') AS total_confirmado_operacion,
             (SELECT COALESCE(SUM(valor), 0) FROM Dynamic_gastos WHERE idperiodo = p.idperiodo AND valida_contable = 'Confirmado') AS total_confirmado_contable,
             (SELECT COALESCE(SUM(r.valor), 0)
              FROM Dynamic_gastos_reintegro r
              JOIN Maestro_Fechas mf ON mf.Fecha = DATE(r.fecha_reintegro)
              WHERE r.idresponsable = p.idresponsable
                AND r.estado = 'APROBADO'
                AND mf.Quincena = p.quincena
                AND mf.Año = p.año) AS reintegros
      FROM Dynamic_gastos_periodo p
      JOIN Maestro_responsablegastos resp ON p.idresponsable = resp.idresponsable
    `;
    const params = [];

    // Filter by role view
    if (!acceso.sinFiltro) {
      if (acceso.operacionesFiltro.length > 0) {
        const placeholders = acceso.operacionesFiltro.map(() => '?').join(',');
        query += ` WHERE resp.operacionprincipal IN (${placeholders})`;
        params.push(...acceso.operacionesFiltro);
      } else {
        query += ` WHERE resp.regional = ?`;
        params.push(acceso.regional);
      }
    }

    query += ' ORDER BY p.fecha_registro DESC';

    const [rows] = await pool.execute(query, params);

    // Resolve full names from Maestro_Vinculación
    const idents = [...new Set(rows.map(r => r.resp_identificacion).filter(Boolean))];
    const namesMap = await obtenerNombresResponsables(idents);

    const processed = rows.map(r => {
      const resolvedName = namesMap[r.resp_identificacion] || r.usuario;
      return {
        ...r,
        usuario: resolvedName
      };
    });

    res.json(processed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 4. GASTOS ENDPOINTS ──

function transformUrlSoporte(url, usuarioId) {
  if (!url) return null;
  if (url.startsWith('https://storage.googleapis.com/logyser-cloud/')) {
    const relativePath = url.replace('https://storage.googleapis.com/logyser-cloud/', '');
    return `/cajaoperativa/api/soportes/ver?path=${encodeURIComponent(relativePath)}&usuario=${usuarioId}`;
  }
  return url;
}

router.get('/api/soportes/ver', async (req, res) => {
  try {
    const { usuario, path: filePath } = req.query;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    if (!filePath) {
      return res.status(400).json({ error: 'Falta el parámetro path.' });
    }

    const bucketName = 'logyser-cloud';
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);

    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: 'El archivo no existe.' });
    }

    const [metadata] = await file.getMetadata();
    res.setHeader('Content-Type', metadata.contentType || 'application/octet-stream');
    
    file.createReadStream()
      .on('error', (err) => {
        console.error('Error streaming file from GCS:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error al obtener el archivo.' });
        }
      })
      .pipe(res);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/periodos/:idperiodo/gastos', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { idperiodo } = req.params;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    // Recalculate first to ensure accuracy
    await recargarSaldosPeriodo(idperiodo);

    const query = `
      SELECT g.*,
             COALESCE(
               (SELECT razon_social FROM Maestro_proveedorcompra WHERE nit = g.numero_identificacion LIMIT 1),
               (SELECT 
                  CASE 
                    WHEN Trabajador LIKE '% ** %' THEN SUBSTRING_INDEX(Trabajador, ' ** ', -1) 
                    ELSE Trabajador 
                  END 
                FROM Maestro_Vinculación 
                WHERE Identificación = g.numero_identificacion 
                ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1)
             ) AS tercero
      FROM Dynamic_gastos g
      WHERE g.idperiodo = ?
      ORDER BY g.fechamovimiento DESC
    `;
    const [rows] = await pool.execute(query, [idperiodo]);
    const processed = rows.map(r => ({
      ...r,
      url_soporte: transformUrlSoporte(r.url_soporte, usuario)
    }));
    res.json(processed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/periodos/:idperiodo/soportes', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { idperiodo } = req.params;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const bucketName = 'logyser-cloud';
    const bucket = storage.bucket(bucketName);
    const [files] = await bucket.getFiles({ prefix: `Caja_Operativa/${idperiodo}/` });

    const fileList = files
      .filter(f => !f.name.endsWith('/'))
      .map(file => {
        return {
          name: path.basename(file.name),
          fullPath: file.name,
          size: Number(file.metadata.size),
          updated: file.metadata.updated,
          url: `/cajaoperativa/api/soportes/ver?path=${encodeURIComponent(file.name)}&usuario=${usuario}`
        };
      });

    res.json(fileList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/gastos/registrar', async (req, res) => {
  try {
    const {
      usuario, idperiodo, regional, operacion, fechamovimiento, tipo_gasto,
      tipo_identificacion, numero_identificacion, descripcion, valor,
      observaciones, url_soporte, tipo_transporte, placa, origen, destino,
      idreembolso_pendiente, firma_trabajador
    } = req.body;

    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!idperiodo || !regional || !operacion || !fechamovimiento || !tipo_gasto || !tipo_identificacion || !numero_identificacion || !valor) {
      return res.status(400).json({ error: 'Faltan campos obligatorios para registrar el gasto.' });
    }

    // Query quincena and año of this period to use in filename
    const [periodRows] = await pool.execute(
      'SELECT quincena, año FROM Dynamic_gastos_periodo WHERE idperiodo = ? LIMIT 1',
      [idperiodo]
    );
    if (!periodRows.length) {
      return res.status(400).json({ error: 'Período no encontrado.' });
    }
    const { quincena, año } = periodRows[0];

    // Upload base64 support to GCS if present
    let uploadUrl = null;
    if (url_soporte && url_soporte.startsWith('data:')) {
      try {
        uploadUrl = await subirSoporteGasto(
          idperiodo,
          quincena,
          año,
          tipo_gasto,
          tipo_identificacion,
          numero_identificacion,
          url_soporte
        );
      } catch (uploadErr) {
        console.error('Error al subir soporte a GCS:', uploadErr);
        return res.status(500).json({ error: 'Error al subir el archivo de soporte.' });
      }
    } else {
      uploadUrl = url_soporte || null;
    }

    // Resolve name of Tercero (worker or provider) to use for worker link if needed
    let resolvedTercero = '';
    if (tipo_identificacion === 'CC') {
      const [vRows] = await pool.execute(
        "SELECT Trabajador FROM Maestro_Vinculación WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1",
        [numero_identificacion]
      );
      if (vRows.length) {
        const parts = vRows[0].Trabajador.split(' ** ');
        resolvedTercero = parts.length > 1 ? parts[1].trim() : vRows[0].Trabajador.trim();
      } else {
        resolvedTercero = `CC ${numero_identificacion}`;
      }
    } else if (tipo_identificacion === 'NIT') {
      const [pRows] = await pool.execute(
        "SELECT razon_social FROM Maestro_proveedorcompra WHERE nit = ? LIMIT 1",
        [numero_identificacion]
      );
      if (pRows.length) {
        resolvedTercero = pRows[0].razon_social;
      } else {
        resolvedTercero = `NIT ${numero_identificacion}`;
      }
    }

    const idgasto = uuidv4();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Insert gasto record (without "tercero" or deleted plaque/origin/destination columns)
      await conn.execute(
        `INSERT INTO Dynamic_gastos 
         (idgasto, idperiodo, regional, operacion, fechamovimiento, tipo_identificacion,
          numero_identificacion, tipo_gasto, descripcion, valor, url_soporte,
          observaciones, valida_operacion, valida_contable, usuario)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', 'PENDIENTE', ?)`,
        [
          idgasto, idperiodo, regional, operacion, fechamovimiento, tipo_identificacion,
          numero_identificacion, tipo_gasto, descripcion || '', valor, uploadUrl,
          observaciones || null, acceso.usuarioNombre
        ]
      );

      // 2. Handle linked worker relationships (only automatically for Transporte)
      if (tipo_gasto === 'Transporte') {
        const idgt = uuidv4();
        const tieneFirma = !!firma_trabajador;
        const estadoFinal = tieneFirma ? 'VINCULADO' : 'PENDIENTE';
        await conn.execute(
          `INSERT INTO Dynamic_gasto_trabajador
           (idgasto_trabajador, idgasto, tipo_gasto, regional, operacion, identificacion,
            descripcion_gasto, valor, firma, observaciones, usuario, estado)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            idgt, idgasto, tipo_gasto, regional, operacion, numero_identificacion,
            descripcion || '', valor, firma_trabajador || null,
            observaciones || null, acceso.usuarioNombre, estadoFinal
          ]
        );
      }

      // If linking an existing pending reimbursement (Anticipado)
      if (idreembolso_pendiente) {
        await conn.execute(
          `UPDATE Dynamic_gasto_trabajador 
           SET idgasto = ?, estado = 'VINCULADO' 
           WHERE idgasto_trabajador = ?`,
          [idgasto, idreembolso_pendiente]
        );
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    // Refresh balances
    await recargarSaldosPeriodo(idperiodo);

    res.json({ ok: true, idgasto });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/gastos/:idgasto/colaboradores', async (req, res) => {
  try {
    const { idgasto } = req.params;
    const { usuario } = req.query;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [rows] = await pool.execute(
      `SELECT t.*,
              COALESCE(
                (SELECT 
                   CASE 
                     WHEN Trabajador LIKE '% ** %' THEN SUBSTRING_INDEX(Trabajador, ' ** ', -1) 
                     ELSE Trabajador 
                   END 
                 FROM Maestro_Vinculación 
                 WHERE Identificación = t.identificacion 
                 ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1),
                'Colaborador no encontrado'
              ) AS trabajador_nombre,
              seg.Celular AS telefono, seg.Email AS email
       FROM Dynamic_gasto_trabajador t
       LEFT JOIN Maestro_Segmentación seg ON seg.Identificación = t.identificacion
       WHERE t.idgasto = ?
       ORDER BY t.fecha_registro ASC`,
      [idgasto]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/gastos/:idgasto/colaboradores', async (req, res) => {
  try {
    const { idgasto } = req.params;
    const { usuario, identificacion, valor, observaciones } = req.body;

    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!identificacion || !valor) {
      return res.status(400).json({ error: 'Identificación y valor son obligatorios.' });
    }

    const [gRows] = await pool.execute(
      'SELECT regional, operacion, tipo_gasto, descripcion FROM Dynamic_gastos WHERE idgasto = ? LIMIT 1',
      [idgasto]
    );
    if (!gRows.length) {
      return res.status(404).json({ error: 'Gasto padre no encontrado' });
    }
    const { regional, operacion, tipo_gasto, descripcion } = gRows[0];

    const idgt = uuidv4();
    await pool.execute(
      `INSERT INTO Dynamic_gasto_trabajador
       (idgasto_trabajador, idgasto, tipo_gasto, regional, operacion, identificacion,
        descripcion_gasto, valor, observaciones, estado, firma)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', NULL)`,
      [
        idgt, idgasto, tipo_gasto, regional, operacion, identificacion.trim(),
        descripcion || '', valor, observaciones || null
      ]
    );

    res.json({ ok: true, idgasto_trabajador: idgt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/gastos/:idgasto/colaboradores/:idgasto_trabajador', async (req, res) => {
  try {
    const { idgasto, idgasto_trabajador } = req.params;
    const { usuario } = req.query;

    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [rows] = await pool.execute(
      'SELECT idgasto_trabajador, tipo_gasto FROM Dynamic_gasto_trabajador WHERE idgasto_trabajador = ? AND idgasto = ? LIMIT 1',
      [idgasto_trabajador, idgasto]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Relación no encontrada' });
    }

    if (rows[0].tipo_gasto === 'Transporte') {
      return res.status(400).json({ error: 'No se puede eliminar el colaborador automático de un gasto de transporte.' });
    }

    await pool.execute(
      'DELETE FROM Dynamic_gasto_trabajador WHERE idgasto_trabajador = ?',
      [idgasto_trabajador]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/gastos/:idgasto', async (req, res) => {
  try {
    const { idgasto } = req.params;
    const {
      usuario, fechamovimiento, tipo_gasto, tipo_identificacion,
      numero_identificacion, descripcion, valor, observaciones,
      url_soporte, placa, origen, destino, eliminar_soporte
    } = req.body;

    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    // Fetch the existing record
    const [gRows] = await pool.execute('SELECT * FROM Dynamic_gastos WHERE idgasto = ? LIMIT 1', [idgasto]);
    if (!gRows.length) return res.status(404).json({ error: 'Gasto no encontrado' });
    const existing = gRows[0];

    // Perform backend security checks on editability
    const isSistema = acceso.rol === 'Sistema';
    const isContabilidad = acceso.rol === 'Contabilidad';
    const isContabilidadOrSistema = isContabilidad || isSistema;

    let allowedMode = 'ALL';
    if (existing.valida_contable === 'Confirmado') {
      if (isSistema) {
        allowedMode = 'ALL';
      } else {
        return res.status(403).json({ error: 'Este gasto está confirmado por contabilidad y solo el rol Sistema puede editarlo.' });
      }
    } else if (existing.valida_operacion === 'Confirmado') {
      if (isContabilidadOrSistema) {
        allowedMode = 'ALL';
      } else {
        allowedMode = 'SUPPORT_ONLY';
      }
    }

    if (allowedMode === 'SUPPORT_ONLY') {
      let finalSoporte = existing.url_soporte;
      if (eliminar_soporte) {
        finalSoporte = null;
      } else if (url_soporte && url_soporte.startsWith('data:')) {
        // Query quincena and año of this period
        const [periodRows] = await pool.execute(
          'SELECT quincena, año FROM Dynamic_gastos_periodo WHERE idperiodo = ? LIMIT 1',
          [existing.idperiodo]
        );
        const { quincena, año } = periodRows[0];
        finalSoporte = await subirSoporteGasto(
          existing.idperiodo,
          quincena,
          año,
          existing.tipo_gasto,
          existing.tipo_identificacion,
          existing.numero_identificacion,
          url_soporte
        );
      }

      await pool.execute(
        'UPDATE Dynamic_gastos SET url_soporte = ? WHERE idgasto = ?',
        [finalSoporte, idgasto]
      );
    } else {
      // mode is ALL
      let finalSoporte = eliminar_soporte ? null : (url_soporte || existing.url_soporte);
      if (url_soporte && url_soporte.startsWith('data:')) {
        const [periodRows] = await pool.execute(
          'SELECT quincena, año FROM Dynamic_gastos_periodo WHERE idperiodo = ? LIMIT 1',
          [existing.idperiodo]
        );
        const { quincena, año } = periodRows[0];
        finalSoporte = await subirSoporteGasto(
          existing.idperiodo,
          quincena,
          año,
          tipo_gasto,
          tipo_identificacion,
          numero_identificacion,
          url_soporte
        );
      }

      // Resolve name of Tercero (worker or provider) to use for worker link if needed
      let resolvedTercero = '';
      if (tipo_identificacion === 'CC') {
        const [vRows] = await pool.execute(
          "SELECT Trabajador FROM Maestro_Vinculación WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1",
          [numero_identificacion]
        );
        if (vRows.length) {
          const parts = vRows[0].Trabajador.split(' ** ');
          resolvedTercero = parts.length > 1 ? parts[1].trim() : vRows[0].Trabajador.trim();
        } else {
          resolvedTercero = `CC ${numero_identificacion}`;
        }
      } else if (tipo_identificacion === 'NIT') {
        const [pRows] = await pool.execute(
          "SELECT razon_social FROM Maestro_proveedorcompra WHERE nit = ? LIMIT 1",
          [numero_identificacion]
        );
        if (pRows.length) {
          resolvedTercero = pRows[0].razon_social;
        } else {
          resolvedTercero = `NIT ${numero_identificacion}`;
        }
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        await conn.execute(
          `UPDATE Dynamic_gastos 
           SET fechamovimiento = ?, tipo_identificacion = ?, numero_identificacion = ?,
               tipo_gasto = ?, descripcion = ?, valor = ?, url_soporte = ?, observaciones = ?
           WHERE idgasto = ?`,
          [
            fechamovimiento, tipo_identificacion, numero_identificacion,
            tipo_gasto, descripcion || '', valor, finalSoporte, observaciones || null,
            idgasto
          ]
        );

        // Update Dynamic_gasto_trabajador if it exists
        await conn.execute(
          `UPDATE Dynamic_gasto_trabajador 
           SET regional = ?, operacion = ?, identificacion = ?,
               descripcion_gasto = ?, valor = ?, observaciones = ?,
               tipo_gasto = ?
           WHERE idgasto = ?`,
          [
            existing.regional, existing.operacion, numero_identificacion,
            descripcion || '', valor, observaciones || null, tipo_gasto, idgasto
          ]
        );

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }

    await recargarSaldosPeriodo(existing.idperiodo);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/gastos/:idgasto/validar-operacion', async (req, res) => {
  try {
    const { usuario, estado } = req.body;
    const { idgasto } = req.params;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [gRows] = await pool.execute('SELECT idperiodo FROM Dynamic_gastos WHERE idgasto = ? LIMIT 1', [idgasto]);
    if (!gRows.length) return res.status(404).json({ error: 'Gasto no encontrado' });
    const idperiodo = gRows[0].idperiodo;

    await pool.execute('UPDATE Dynamic_gastos SET valida_operacion = ? WHERE idgasto = ?', [estado, idgasto]);
    
    await recargarSaldosPeriodo(idperiodo);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/gastos/:idgasto/validar-contable', async (req, res) => {
  try {
    const { usuario, estado } = req.body;
    const { idgasto } = req.params;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso || !['Contabilidad', 'Sistema'].includes(acceso.rol)) {
      return res.status(403).json({ error: 'No autorizado para validación contable.' });
    }

    const [gRows] = await pool.execute('SELECT idperiodo FROM Dynamic_gastos WHERE idgasto = ? LIMIT 1', [idgasto]);
    if (!gRows.length) return res.status(404).json({ error: 'Gasto no encontrado' });
    const idperiodo = gRows[0].idperiodo;

    await pool.execute('UPDATE Dynamic_gastos SET valida_contable = ? WHERE idgasto = ?', [estado, idgasto]);
    
    await recargarSaldosPeriodo(idperiodo);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 5. REEMBOLSOS (PUBLIC & PENDING) ENDPOINTS ──

router.get('/api/reembolsos/gasto-trabajador/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT t.*,
              COALESCE(
                (SELECT 
                   CASE 
                     WHEN Trabajador LIKE '% ** %' THEN SUBSTRING_INDEX(Trabajador, ' ** ', -1) 
                     ELSE Trabajador 
                   END 
                 FROM Maestro_Vinculación 
                 WHERE Identificación = t.identificacion 
                 ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1),
                'Colaborador no encontrado'
              ) AS trabajador_nombre,
              seg.Celular AS telefono, seg.Email AS email
       FROM Dynamic_gasto_trabajador t
       LEFT JOIN Maestro_Segmentación seg ON seg.Identificación = t.identificacion
       WHERE t.idgasto_trabajador = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/reembolsos/firmar-gasto-trabajador/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { firma } = req.body;
    if (!firma) {
      return res.status(400).json({ error: 'La firma es obligatoria.' });
    }

    const [rows] = await pool.execute(
      'SELECT idgasto FROM Dynamic_gasto_trabajador WHERE idgasto_trabajador = ? LIMIT 1',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    const idgasto = rows[0].idgasto;
    const estado = idgasto ? 'VINCULADO' : 'PENDIENTE';

    await pool.execute(
      'UPDATE Dynamic_gasto_trabajador SET firma = ?, estado = ? WHERE idgasto_trabajador = ?',
      [firma, estado, id]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/reembolsos/contacto-colaborador/:identificacion', async (req, res) => {
  try {
    const { identificacion } = req.params;
    const { telefono, email, usuario } = req.body;

    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    // Verify if record exists in Maestro_Segmentación
    const [rows] = await pool.execute(
      'SELECT Identificación FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1',
      [identificacion]
    );

    if (rows.length) {
      await pool.execute(
        'UPDATE Maestro_Segmentación SET Celular = ?, Email = ? WHERE Identificación = ?',
        [telefono || '', email || '', identificacion]
      );
    } else {
      await pool.execute(
        'INSERT INTO Maestro_Segmentación (Identificación, Celular, Email) VALUES (?, ?, ?)',
        [identificacion, telefono || '', email || '']
      );
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/reembolsos/pendientes', async (req, res) => {
  try {
    const { usuario } = req.query;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    let query = `
      SELECT t.*,
             COALESCE(
               (SELECT 
                  CASE 
                    WHEN Trabajador LIKE '% ** %' THEN SUBSTRING_INDEX(Trabajador, ' ** ', -1) 
                    ELSE Trabajador 
                  END 
                FROM Maestro_Vinculación 
                WHERE Identificación = t.identificacion 
                ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1),
               'Colaborador no encontrado'
             ) AS trabajador_nombre,
             seg.Celular AS telefono, seg.Email AS email
      FROM Dynamic_gasto_trabajador t
      LEFT JOIN Maestro_Segmentación seg ON t.identificacion = seg.Identificación
      WHERE t.estado = 'PENDIENTE' AND t.idgasto IS NULL
    `;
    const params = [];

    if (!acceso.sinFiltro) {
      if (acceso.operacionesFiltro.length > 0) {
        const placeholders = acceso.operacionesFiltro.map(() => '?').join(',');
        query += ` AND t.operacion IN (${placeholders})`;
        params.push(...acceso.operacionesFiltro);
      } else {
        query += ` AND t.regional = ?`;
        params.push(acceso.regional);
      }
    }

    query += ' ORDER BY t.fecha_registro DESC';

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/reembolsos/periodos-vincular', async (req, res) => {
  try {
    const { regional, operacion } = req.query;
    const [rows] = await pool.execute(
      'SELECT idperiodo, quincena, año, base_autorizada FROM Dynamic_gastos_periodo WHERE regional = ? AND operacionprincipal = ? ORDER BY fecha_registro DESC LIMIT 15',
      [regional, operacion]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/reembolsos/gastos-vincular', async (req, res) => {
  try {
    const { regional, operacion } = req.query;
    const query = `
      SELECT g.idgasto, g.tipo_gasto, g.descripcion, g.valor, g.fechamovimiento,
             COALESCE(
               (SELECT razon_social FROM Maestro_proveedorcompra WHERE nit = g.numero_identificacion LIMIT 1),
               (SELECT 
                  CASE 
                    WHEN Trabajador LIKE '% ** %' THEN SUBSTRING_INDEX(Trabajador, ' ** ', -1) 
                    ELSE Trabajador 
                  END 
                FROM Maestro_Vinculación 
                WHERE Identificación = g.numero_identificacion 
                ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1)
             ) AS tercero
      FROM Dynamic_gastos g
      WHERE g.regional = ? AND g.operacion = ?
      ORDER BY g.fechamovimiento DESC LIMIT 30
    `;
    const [rows] = await pool.execute(query, [regional, operacion]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/reembolsos/vincular', async (req, res) => {
  try {
    const { idgasto_trabajador, tipo_gasto, targetId, usuario } = req.body;

    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [tRows] = await pool.execute('SELECT * FROM Dynamic_gasto_trabajador WHERE idgasto_trabajador = ? LIMIT 1', [idgasto_trabajador]);
    if (!tRows.length) return res.status(404).json({ error: 'Reembolso pendiente no encontrado' });
    const orphan = tRows[0];

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (tipo_gasto === 'Transporte') {
        const idgasto = uuidv4();
        
        await conn.execute(
          `INSERT INTO Dynamic_gastos 
           (idgasto, idperiodo, regional, operacion, fechamovimiento, tipo_identificacion,
            numero_identificacion, tipo_gasto, descripcion, valor, url_soporte,
            observaciones, valida_operacion, valida_contable, usuario)
           VALUES (?, ?, ?, ?, ?, 'CC', ?, 'Transporte', ?, ?, ?, ?, 'PENDIENTE', 'PENDIENTE', ?)`,
          [
            idgasto, targetId, orphan.regional, orphan.operacion, orphan.fecha_registro || new Date(),
            orphan.identificacion, orphan.descripcion_gasto || 'Transporte Colaborador', orphan.valor,
            null, orphan.observaciones || null, acceso.usuarioNombre
          ]
        );

        await conn.execute(
          'UPDATE Dynamic_gasto_trabajador SET idgasto = ?, estado = "VINCULADO" WHERE idgasto_trabajador = ?',
          [idgasto, idgasto_trabajador]
        );

        await conn.commit();
        await recargarSaldosPeriodo(targetId);
      } else {
        await conn.execute(
          'UPDATE Dynamic_gasto_trabajador SET idgasto = ?, estado = "VINCULADO" WHERE idgasto_trabajador = ?',
          [targetId, idgasto_trabajador]
        );

        const [gRows] = await conn.execute('SELECT idperiodo FROM Dynamic_gastos WHERE idgasto = ? LIMIT 1', [targetId]);
        await conn.commit();

        if (gRows.length) {
          await recargarSaldosPeriodo(gRows[0].idperiodo);
        }
      }
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch worker info by identification
router.get('/api/trabajador/:identificacion', async (req, res) => {
  try {
    const { identificacion } = req.params;

    // Query worker info
    const [vinRows] = await pool.execute(
      `SELECT Trabajador, Regional, \`Operación\` AS operacion 
       FROM Maestro_Vinculación 
       WHERE Identificación = ? AND Estado = 'Activo' 
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );

    if (!vinRows.length) {
      return res.status(404).json({ error: 'Trabajador activo no encontrado.' });
    }

    const worker = vinRows[0];

    // Query contact info
    const [segRows] = await pool.execute(
      'SELECT Celular, Email FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1',
      [identificacion]
    );

    const telefono = segRows.length ? segRows[0].Celular : '';
    const email = segRows.length ? segRows[0].Email : '';

    res.json({
      trabajador: worker.Trabajador,
      regional: worker.Regional,
      operacion: worker.operacion,
      telefono,
      email
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register public refund request
router.post('/api/reembolsos/solicitar-publico', async (req, res) => {
  try {
    const {
      identificacion, regional, operacion, telefono, email,
      tipo_gasto, descripcion_gasto, valor, firma, observaciones
    } = req.body;

    if (!identificacion || !regional || !operacion || !valor || !firma || !tipo_gasto) {
      return res.status(400).json({ error: 'Identificacion, regional, operacion, valor, tipo_gasto y firma requeridos.' });
    }

    const idgasto_trabajador = uuidv4();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        `INSERT INTO Dynamic_gasto_trabajador
         (idgasto_trabajador, idgasto, tipo_gasto, regional, operacion, identificacion,
          descripcion_gasto, valor, firma, observaciones, estado)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')`,
        [
          idgasto_trabajador, tipo_gasto, regional, operacion, identificacion,
          descripcion_gasto || '', valor, firma, observaciones || null
        ]
      );

      // 2. Update contact details in segmentacion
      if (telefono || email) {
        const [existingSeg] = await conn.execute(
          'SELECT Identificación FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1',
          [identificacion]
        );
        if (existingSeg.length) {
          await conn.execute(
            'UPDATE Maestro_Segmentación SET Celular = ?, Email = ? WHERE Identificación = ?',
            [telefono || '', email || '', identificacion]
          );
        } else {
          await conn.execute(
            'INSERT INTO Maestro_Segmentación (Identificación, Celular, Email) VALUES (?, ?, ?)',
            [identificacion, telefono || '', email || '']
          );
        }
      }

      await conn.commit();
      res.json({ ok: true, idgasto_trabajador });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 6. PROVEEDORES ENDPOINTS ──

router.get('/api/proveedores', async (req, res) => {
  try {
    const { usuario } = req.query;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [rows] = await pool.execute('SELECT * FROM Maestro_proveedorcompra ORDER BY razon_social ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/proveedores/crear', async (req, res) => {
  try {
    const { usuario, nit, razon_social } = req.body;
    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!nit || !razon_social) {
      return res.status(400).json({ error: 'NIT y Razón Social son campos obligatorios.' });
    }

    const [existing] = await pool.execute(
      'SELECT nit FROM Maestro_proveedorcompra WHERE nit = ? LIMIT 1',
      [nit.trim()]
    );
    if (existing.length) {
      return res.status(400).json({ error: 'Ya existe un proveedor registrado con este NIT.' });
    }

    await pool.execute(
      'INSERT INTO Maestro_proveedorcompra (nit, razon_social, usuario) VALUES (?, ?, ?)',
      [nit.trim(), razon_social.trim(), acceso.usuarioNombre]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/proveedores/:originalNit', async (req, res) => {
  try {
    const { originalNit } = req.params;
    const { usuario, nit, razon_social } = req.body;

    const acceso = await computarAccesoCajaOperativa(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!nit || !razon_social) {
      return res.status(400).json({ error: 'NIT y Razón Social son obligatorios.' });
    }

    const trimmedNit = nit.trim();
    const trimmedRazon = razon_social.trim();

    if (trimmedNit !== originalNit) {
      const [exists] = await pool.execute('SELECT nit FROM Maestro_proveedorcompra WHERE nit = ? LIMIT 1', [trimmedNit]);
      if (exists.length) {
        return res.status(400).json({ error: 'Ya existe otro proveedor con el nuevo NIT ingresado.' });
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        'UPDATE Maestro_proveedorcompra SET nit = ?, razon_social = ? WHERE nit = ?',
        [trimmedNit, trimmedRazon, originalNit]
      );

      await conn.execute(
        "UPDATE Dynamic_gastos SET numero_identificacion = ? WHERE tipo_identificacion = 'NIT' AND numero_identificacion = ?",
        [trimmedNit, originalNit]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
