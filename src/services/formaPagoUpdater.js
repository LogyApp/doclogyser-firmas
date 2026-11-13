const pool = require('./db');
const { notificarReportePendientes, notificarPendientesCoordinador } = require('./email');
const { obtenerResponsablesOperacionRegional } = require('./configRetiro');

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

    // 4. Aviso por Operación a sus responsables, con el mismo método del reporte de "Tomó Cargo":
    //    Auxiliar y Coordinador de la Operación (incluye AuxiliarR/CoordinadorR asignados a ella); si la
    //    Operación no tiene ninguno, AuxiliarR y CoordinadorR de su Regional.
    const grupos = new Map();
    records.forEach(r => {
      const key = r.Operacion || `__sinop__${r.Regional || ''}`;
      if (!grupos.has(key)) grupos.set(key, { operacion: r.Operacion, regional: r.Regional, registros: [] });
      grupos.get(key).registros.push(r);
    });
    console.log(`[formaPagoUpdater] ${grupos.size} operación(es) con pendientes para notificar.`);

    for (const grupo of grupos.values()) {
      try {
        const responsables = await obtenerResponsablesOperacionRegional(grupo.operacion, grupo.regional);
        const vistos = new Set();
        const unicos = responsables.filter(d => {
          const e = String(d.Email || '').trim().toLowerCase();
          if (!e || vistos.has(e)) return false;
          vistos.add(e);
          return true;
        });
        if (!unicos.length) {
          console.warn(`[formaPagoUpdater] Sin responsables para Operación="${grupo.operacion}" Regional="${grupo.regional}" — se omite`);
          continue;
        }
        const tipoScope = grupo.operacion ? 'Operación' : 'Regional';
        const scope = grupo.operacion || grupo.regional || 'Sin operación';
        await notificarPendientesCoordinador({
          destinatarios: unicos.map(d => d.Email.trim()),
          nombres: unicos.map(d => d.Nombre),
          tipoScope,
          scope,
          records: grupo.registros,
        });
        console.log(`[formaPagoUpdater] Enviado a ${unicos.map(d => d.Email).join(', ')} (${tipoScope}: ${scope}, ${grupo.registros.length} registro(s))`);
      } catch (err) {
        console.error(`[formaPagoUpdater] Error notificando Operación="${grupo.operacion}":`, err.message);
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
