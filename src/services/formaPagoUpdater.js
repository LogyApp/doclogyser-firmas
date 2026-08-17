const pool = require('./db');
const { notificarReportePendientes, notificarPendientesCoordinador } = require('./email');

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

    // 4. Query coordinators to dispatch filtered notifications by Regional or Operation
    const [coordinators] = await pool.execute(
      "SELECT ID, Nombre, Rol, Regional, `Operación` AS Operacion, Email FROM Maestro_Usuarios WHERE Rol IN ('CoordinadorR', 'Coordinador')"
    );
    console.log(`[formaPagoUpdater] Found ${coordinators.length} coordinators to process.`);

    for (const coord of coordinators) {
      if (!coord.Email) continue;

      if (coord.Rol === 'CoordinadorR') {
        const regionalRecords = records.filter(r => 
          r.Regional && coord.Regional && 
          r.Regional.trim().toUpperCase() === coord.Regional.trim().toUpperCase()
        );
        if (regionalRecords.length > 0) {
          console.log(`[formaPagoUpdater] Sending email to Regional Coordinator: ${coord.Nombre} (${coord.Email}) for Regional: ${coord.Regional}`);
          await notificarPendientesCoordinador({
            email: coord.Email,
            nombreCoordinador: coord.Nombre,
            rol: coord.Rol,
            scope: coord.Regional,
            records: regionalRecords
          }).catch(err => console.error(`[formaPagoUpdater] Error sending email to regional coordinator ${coord.Nombre}:`, err));
        }
      } else if (coord.Rol === 'Coordinador') {
        const operacionRecords = records.filter(r => 
          r.Operacion && coord.Operacion && 
          r.Operacion.trim().toUpperCase() === coord.Operacion.trim().toUpperCase()
        );
        if (operacionRecords.length > 0) {
          console.log(`[formaPagoUpdater] Sending email to Coordinator: ${coord.Nombre} (${coord.Email}) for Operation: ${coord.Operacion}`);
          await notificarPendientesCoordinador({
            email: coord.Email,
            nombreCoordinador: coord.Nombre,
            rol: coord.Rol,
            scope: coord.Operacion,
            records: operacionRecords
          }).catch(err => console.error(`[formaPagoUpdater] Error sending email to coordinator ${coord.Nombre}:`, err));
        }
      }
    }
  } catch (err) {
    console.error('[formaPagoUpdater] Error executing update/email task:', err);
  }
}

/**
 * Starts the daily timer checking for 7:30 AM Colombia Time (Bogota, UTC-5).
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

      // Check if it's 7:30 AM and we haven't run today yet
      if (hours === 7 && minutes === 30 && lastRunDate !== todayStr) {
        lastRunDate = todayStr;
        console.log(`[formaPagoUpdater] Triggering daily task at 7:30 AM Colombia time (${todayStr})`);
        await ejecutarActualizacionFormaPago();
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
