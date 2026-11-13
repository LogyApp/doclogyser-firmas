/**
 * tareaProgramadaUnica.js
 * Evita que una tarea programada diaria (correos de las 7:25–7:40) se ejecute dos veces cuando hay más de
 * un servidor con las tareas activas: main se despliega en dos servicios de Cloud Run (digital-logyser y
 * nomina-logyser) y cada uno puede tener varias instancias, cada una con su propio setInterval.
 *
 * El primero que registra la tarea del día en Sistema_Tareas_Programadas (llave Tarea + Fecha) la ejecuta;
 * los demás ven la llave repetida y no hacen nada. Si la tabla aún no existe (migración
 * 2026-11-13_correos_programados_ajustes.sql), se usa un candado de MySQL (GET_LOCK) que se mantiene
 * 3 minutos, suficiente para que los demás servidores, que revisan cada 30 segundos, lo encuentren ocupado.
 */
const os = require('os');
const pool = require('./db');

const INSTANCIA = [process.env.K_SERVICE, process.env.K_REVISION, os.hostname()].filter(Boolean).join(' / ').slice(0, 150);
const CANDADO_MS = 3 * 60 * 1000;

async function candadoMysql(nombre) {
  let conn;
  try {
    conn = await pool.getConnection();
    const [[fila]] = await conn.query('SELECT GET_LOCK(?, 0) AS ok', [nombre.slice(0, 64)]);
    if (Number(fila.ok) !== 1) { conn.release(); return false; }
    const c = conn;
    setTimeout(() => {
      c.query('SELECT RELEASE_LOCK(?)', [nombre.slice(0, 64)]).catch(() => {}).finally(() => c.release());
    }, CANDADO_MS);
    return true;
  } catch (err) {
    if (conn) conn.release();
    console.error(`[tareaProgramadaUnica] No se pudo tomar el candado "${nombre}":`, err.message);
    return false;
  }
}

/**
 * true si esta instancia debe ejecutar la tarea hoy; false si otra ya la tomó.
 * @param {string} tarea  nombre corto, p. ej. 'forma_pago_pendiente'
 * @param {string} fecha  'AAAA-MM-DD' (hora de Colombia)
 */
async function reclamarTareaDiaria(tarea, fecha) {
  try {
    await pool.execute(
      'INSERT INTO Sistema_Tareas_Programadas (Tarea, Fecha, Instancia, FechaInicio) VALUES (?, ?, ?, NOW())',
      [tarea, fecha, INSTANCIA]
    );
    return true;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      console.log(`[tareaProgramadaUnica] "${tarea}" del ${fecha} ya la ejecutó otro servidor — se omite aquí.`);
      return false;
    }
    if (err.code === 'ER_NO_SUCH_TABLE') {
      const ok = await candadoMysql(`tarea_${tarea}_${fecha}`);
      if (!ok) console.log(`[tareaProgramadaUnica] "${tarea}" del ${fecha} la está ejecutando otro servidor — se omite aquí.`);
      return ok;
    }
    // Error de conexión u otro: mejor no enviar que enviar dos veces; se registra para revisarlo
    console.error(`[tareaProgramadaUnica] No se pudo registrar "${tarea}" del ${fecha}:`, err.message);
    return false;
  }
}

/** Marca la tarea como terminada (informativo). */
async function terminarTareaDiaria(tarea, fecha, resumen) {
  try {
    await pool.execute(
      'UPDATE Sistema_Tareas_Programadas SET FechaFin = NOW(), Resumen = ? WHERE Tarea = ? AND Fecha = ?',
      [String(resumen || '').slice(0, 500), tarea, fecha]
    );
  } catch (_) { /* tabla aún no creada */ }
}

module.exports = { reclamarTareaDiaria, terminarTareaDiaria };
