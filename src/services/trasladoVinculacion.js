const pool = require('./db');

// ── Traslados → Operación del trabajador en Maestro_Vinculación (Activos) ───
// Al generarse el documento de traslado (firma o "No firma") la Operación del
// trabajador cambia al destino SOLO si la fecha del traslado ya llegó. Si el
// traslado es para una fecha futura, la tarea aplicarTrasladosPendientes (app.js)
// hace el cambio ese día. Solo se cambia la vinculación ACTIVA más reciente.
// La columna Dynamic_traslados_trabajador.fecha_aplicado_vinculacion guarda cuándo
// se aplicó (migraciones/2026-11-21_traslados_aplicar_en_fecha.sql). Si la columna
// aún no existe, se conserva el comportamiento anterior (se aplica de inmediato).

function hoyBogota() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

function ahoraBogota() {
  const p = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function fechaISO(valor) {
  if (!valor) return '';
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

let columnaExiste = null;
async function existeColumnaAplicado() {
  if (columnaExiste !== null) return columnaExiste;
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_traslados_trabajador'
          AND COLUMN_NAME = 'fecha_aplicado_vinculacion'`
    );
    columnaExiste = Number(rows[0].n) > 0;
  } catch (err) {
    console.error('[trasladoVinculacion] No se pudo revisar la columna fecha_aplicado_vinculacion:', err.message);
    return false; // se reintenta en la próxima llamada
  }
  return columnaExiste;
}

// Cambia la Operación y el Área de la vinculación activa más reciente. Devuelve true si la cambió.
async function actualizarOperacionActiva(t) {
  let areaDestino = null;
  try {
    const [curr] = await pool.execute(
      'SELECT Area FROM `Maestro_Vinculación` WHERE `Identificación` = ? AND Estado = \'Activo\' ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [t['Identificación']]
    );
    if (curr.length && curr[0].Area) {
      const [nombreArea] = await pool.execute('SELECT AREA FROM Config_Area WHERE ID = ? OR AREA = ? LIMIT 1', [curr[0].Area, curr[0].Area]);
      const nombre = nombreArea.length ? nombreArea[0].AREA : null;
      if (nombre) {
        const [matchDestino] = await pool.execute('SELECT ID FROM Config_Area WHERE `OPERACIÓN` = ? AND AREA = ? LIMIT 1', [t.operacion_destino, nombre]);
        if (matchDestino.length) areaDestino = matchDestino[0].ID;
      }
    }
    if (!areaDestino) {
      const [opDef] = await pool.execute('SELECT ID FROM Config_Area WHERE `OPERACIÓN` = ? AND AREA = \'OPERATIVO\' LIMIT 1', [t.operacion_destino]);
      if (opDef.length) areaDestino = opDef[0].ID;
      else {
        const [firstArea] = await pool.execute('SELECT ID FROM Config_Area WHERE `OPERACIÓN` = ? AND ADMINISTRATIVO = \'V\' ORDER BY ID LIMIT 1', [t.operacion_destino]);
        if (firstArea.length) areaDestino = firstArea[0].ID;
      }
    }
  } catch (err) {
    console.warn('[trasladoVinculacion] No se pudo resolver área destino automática:', err.message);
  }

  const sql = areaDestino
    ? `UPDATE \`Maestro_Vinculación\`
          SET \`Operación\` = ?, Area = ?, Usuario = ?, \`Fecha Actualización\` = ?
        WHERE \`Identificación\` = ? AND Estado = 'Activo'
        ORDER BY \`Fecha de Ingreso\` DESC
        LIMIT 1`
    : `UPDATE \`Maestro_Vinculación\`
          SET \`Operación\` = ?, Usuario = ?, \`Fecha Actualización\` = ?
        WHERE \`Identificación\` = ? AND Estado = 'Activo'
        ORDER BY \`Fecha de Ingreso\` DESC
        LIMIT 1`;

  const params = areaDestino
    ? [t.operacion_destino, areaDestino, t.Usuario, ahoraBogota(), t['Identificación']]
    : [t.operacion_destino, t.Usuario, ahoraBogota(), t['Identificación']];

  const [result] = await pool.execute(sql, params);
  if (!result.affectedRows) {
    console.warn(`[trasladoVinculacion] ${t['Identificación']} no tiene vinculación activa: no se cambia la operación (traslado ${t.IdTraslado}).`);
  }
  return result.affectedRows > 0;
}

// Se llama cuando el documento del traslado queda generado. Devuelve
// { aplicado: true } si cambió la operación ahora, o { programado: 'AAAA-MM-DD' }.
async function aplicarTrasladoEnVinculacion(t) {
  const fecha = fechaISO(t.fecha_traslado);
  const tieneColumna = await existeColumnaAplicado();

  if (!tieneColumna) return { aplicado: await actualizarOperacionActiva(t) };
  if (fecha && fecha > hoyBogota()) return { programado: fecha };

  // "Reclama" el traslado para no aplicarlo dos veces (dos servicios corren la tarea)
  const [claim] = await pool.execute(
    'UPDATE Dynamic_traslados_trabajador SET fecha_aplicado_vinculacion = ? WHERE IdTraslado = ? AND fecha_aplicado_vinculacion IS NULL',
    [ahoraBogota(), t.IdTraslado]
  );
  if (!claim.affectedRows) return { aplicado: false };
  return { aplicado: await actualizarOperacionActiva(t) };
}

// Tarea periódica: traslados generados cuya fecha ya llegó y aún no se aplicaron.
async function aplicarTrasladosPendientes() {
  try {
    if (!(await existeColumnaAplicado())) return;
    const [rows] = await pool.execute(
      `SELECT IdTraslado, \`Identificación\`, operacion_destino, fecha_traslado, Usuario
         FROM Dynamic_traslados_trabajador
        WHERE estado_doc = 'generado' AND fecha_aplicado_vinculacion IS NULL AND fecha_traslado <= ?
        ORDER BY fecha_traslado, Fecha_Registro`,
      [hoyBogota()]
    );
    for (const t of rows) {
      const r = await aplicarTrasladoEnVinculacion(t);
      if (r.aplicado) console.log(`[trasladoVinculacion] Traslado ${t.IdTraslado} aplicado: ${t['Identificación']} → ${t.operacion_destino}`);
    }
  } catch (err) {
    console.error('[trasladoVinculacion] Error aplicando traslados pendientes:', err.message);
  }
}

module.exports = { aplicarTrasladoEnVinculacion, aplicarTrasladosPendientes, hoyBogota };
