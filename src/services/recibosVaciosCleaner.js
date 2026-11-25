const pool = require('./db');
const { reclamarTareaDiaria, terminarTareaDiaria } = require('./tareaProgramadaUnica');
const { normalizar } = require('./maestroMenu');

// ── Borrado diario de recibos sin servicios ──────────────────────────────────────
// Un recibo puede quedar vacío al pasar sus servicios (en amarillo) a otro recibo. Cada día
// a las 2:00 AM (Colombia) se borran los recibos sin servicios creados antes de hoy; el
// trigger ad_recibos_free_consec devuelve su consecutivo a Maestro_Consecutivos_Pendientes.
// Interruptor en Config_Parametros facturacion / Recibos; si la fila no existe no se borra nada.

const MODULO = 'facturacion';
const SECCION = 'Recibos';
const P_HABILITAR = 'Habilitar borrado automático de recibos sin servicios';
const TAREA = 'recibos_vacios';

let lastRunDate = null;

async function borradoHabilitado() {
  const [rows] = await pool.execute(
    'SELECT `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ?',
    [MODULO, SECCION]
  ).catch(() => [[]]);
  const fila = rows.find((r) => normalizar(r.Concepto) === normalizar(P_HABILITAR));
  return ['1', 'si', 'sí', 'true'].includes(String(fila?.Parametro || '').trim().toLowerCase());
}

// hoy: 'YYYY-MM-DD' en Colombia. Se borran los recibos con Fecha anterior a ese día.
async function borrarRecibosVacios(hoy) {
  if (!(await borradoHabilitado())) return 0;
  // Recibos referenciados por tickets se conservan
  const condicion = `r.Fecha < ?
    AND NOT EXISTS (SELECT 1 FROM Dynamic_Servicios s WHERE s.IdRecibo = r.IdRecibo)
    AND NOT EXISTS (SELECT 1 FROM Dynamic_Tickets t WHERE t.idrecibo = r.IdRecibo)`;
  const [vacios] = await pool.execute(
    `SELECT r.IdRecibo, r.\`Consecutivo Recibo\` AS consecutivo, r.\`Operación\` AS operacion
       FROM Dynamic_Recibos r WHERE ${condicion}`,
    [hoy]
  );
  if (!vacios.length) return 0;
  const [result] = await pool.execute(`DELETE r FROM Dynamic_Recibos r WHERE ${condicion}`, [hoy]);
  console.log(`[recibosVacios] ${result.affectedRows} recibo(s) sin servicios borrados:`,
    vacios.map((v) => `${v.consecutivo || v.IdRecibo} (${v.operacion})`).join(', '));
  return result.affectedRows;
}

function iniciarProgramadorRecibosVacios() {
  setInterval(async () => {
    try {
      const nowColombia = new Date(Date.now() - 5 * 3600000);
      const todayStr = nowColombia.toISOString().slice(0, 10);
      if (nowColombia.getUTCHours() === 2 && nowColombia.getUTCMinutes() === 0 && lastRunDate !== todayStr) {
        lastRunDate = todayStr;
        // Solo un servidor la ejecuta (hay dos servicios de Cloud Run con las tareas activas)
        if (!(await reclamarTareaDiaria(TAREA, todayStr))) return;
        const n = await borrarRecibosVacios(todayStr);
        await terminarTareaDiaria(TAREA, todayStr, `ok: ${n}`);
      }
    } catch (err) {
      console.error('[recibosVacios] Error en el borrado diario:', err.message);
    }
  }, 30000);
}

module.exports = { borrarRecibosVacios, iniciarProgramadorRecibosVacios };
