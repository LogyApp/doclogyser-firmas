const pool = require('./db');
const { notificarReportePendientes, notificarPendientesCoordinador } = require('./email');
const { resolverDestinatariosOperacion } = require('./configRetiro');

const { reclamarTareaDiaria, terminarTareaDiaria } = require('./tareaProgramadaUnica');
let lastRunDate = '';

/**
 * Updates Forma De Pago from 1 or 2 to 4 for records with Estado = 'Yellow' from the previous day backwards,
 * and sends an email report listing all records currently with Forma De Pago = 4.
 */
async function ejecutarActualizacionFormaPago() {
  console.log('[formaPagoUpdater] Starting update process...');
  try {
    // 1. Execute update to mark previous days' yellow records with payment form 1 or 2 as 4 (Pendiente)
    const updateQuery = `
      UPDATE \`Dynamic_Servicios\`
      SET \`Forma De Pago\` = 4
      WHERE \`Estado\` = 'Yellow'
        AND \`Forma De Pago\` IN (1, 2)
        AND \`Fecha\` < CURRENT_DATE()
    `;
    const [updateResult] = await pool.execute(updateQuery);
    console.log(`[formaPagoUpdater] Update query executed. Affected rows: ${updateResult.affectedRows}`);

    // 2. Query all records currently with Forma De Pago = 4 for the email report (including Regional)
    const selectQuery = `
      SELECT s.IdServicio, s.IdRecibo, s.Estado, s.\`Forma De Pago\`, s.Fecha, s.Usuario, s.\`Hora Inicio\` AS HoraInicio, r.\`Operación\` AS Operacion, o.REGIONAL AS Regional
      FROM \`Dynamic_Servicios\` s
      LEFT JOIN \`Dynamic_Recibos\` r ON s.IdRecibo = r.IdRecibo
      LEFT JOIN \`Maestro_Operaciones\` o ON r.\`Operación\` = o.OPERACIÓN
      WHERE s.\`Forma De Pago\` = 4
      ORDER BY s.Fecha DESC
    `;
    const [records] = await pool.execute(selectQuery);
    console.log(`[formaPagoUpdater] Found ${records.length} records in status 4 (Pendiente). Sending general report...`);

    // 3. Send email reporting all these records to billing area
    await notificarReportePendientes(records);
    console.log('[formaPagoUpdater] General notification email sent successfully.');

    // 4. Aviso por Operación, con el mismo método del reporte de "Tomó Cargo": Auxiliar y Coordinador de
    //    la Operación (si no tiene, AuxiliarR y CoordinadorR de su Regional), y en copia los AuxiliarR y
    //    CoordinadorR de la Regional.
    const grupos = new Map();
    records.forEach(r => {
      const key = r.Operacion || `__sinop__${r.Regional || ''}`;
      if (!grupos.has(key)) grupos.set(key, { operacion: r.Operacion, regional: r.Regional, registros: [] });
      grupos.get(key).registros.push(r);
    });
    console.log(`[formaPagoUpdater] ${grupos.size} operación(es) con pendientes para notificar.`);

    for (const grupo of grupos.values()) {
      try {
        // Para: responsables de la Operación; copia: AuxiliarR/CoordinadorR de su Regional
        const { para: unicos, copia } = await resolverDestinatariosOperacion(grupo.operacion, grupo.regional);
        if (!unicos.length) {
          console.warn(`[formaPagoUpdater] Sin responsables para Operación="${grupo.operacion}" Regional="${grupo.regional}" — se omite`);
          continue;
        }
        const tipoScope = grupo.operacion ? 'Operación' : 'Regional';
        const scope = grupo.operacion || grupo.regional || 'Sin operación';
        await notificarPendientesCoordinador({
          destinatarios: unicos.map(d => d.Email),
          copia,
          nombres: unicos.map(d => d.Nombre),
          tipoScope,
          scope,
          records: grupo.registros,
        });
        console.log(`[formaPagoUpdater] Enviado a ${unicos.map(d => d.Email).join(', ')}${copia.length ? ' (copia ' + copia.join(', ') + ')' : ''} (${tipoScope}: ${scope}, ${grupo.registros.length} registro(s))`);
      } catch (err) {
        console.error(`[formaPagoUpdater] Error notificando Operación="${grupo.operacion}":`, err.message);
      }
    }
  } catch (err) {
    console.error('[formaPagoUpdater] Error executing update/email task:', err);
  }
}

/**
 * Starts the daily timer checking for 7:35 AM Colombia Time (Bogota, UTC-5).
 */
function iniciarProgramadorFormaPago() {
  console.log('[formaPagoUpdater] Daily scheduler started.');
  
  // Every 30 seconds, check the time in Colombia
  setInterval(async () => {
    try {
      // Bogota is UTC-5
      const nowColombia = new Date(Date.now() - 5 * 3600000);
      const hours = nowColombia.getUTCHours();
      const minutes = nowColombia.getUTCMinutes();
      const todayStr = nowColombia.toISOString().slice(0, 10); // 'YYYY-MM-DD'

      // Check if it's 7:35 AM and we haven't run today yet
      if (hours === 7 && minutes === 35 && lastRunDate !== todayStr) {
        lastRunDate = todayStr;
        // Solo un servidor la ejecuta (hay dos servicios de Cloud Run con las tareas activas)
        if (!(await reclamarTareaDiaria('forma_pago_pendiente', todayStr))) return;
        console.log(`[formaPagoUpdater] Triggering daily task at 7:35 AM Colombia time (${todayStr})`);
        await ejecutarActualizacionFormaPago();
        await terminarTareaDiaria('forma_pago_pendiente', todayStr, 'ok');
      }
    } catch (err) {
      console.error('[formaPagoUpdater] Error checking daily scheduler time:', err.message);
    }
  }, 30000);
}

module.exports = {
  ejecutarActualizacionFormaPago,
  iniciarProgramadorFormaPago
};
