const pool = require('./db');
const { notificarTomoCargoPendiente } = require('./email');
const { obtenerResponsablesOperacionRegional } = require('./configRetiro');

let lastRunDate = '';

function limpiarNombre(trabajador) {
  if (!trabajador) return '';
  const partes = String(trabajador).split(' ** ');
  return (partes.length > 1 ? partes[1] : trabajador).trim();
}

function hoyBogotaStr() {
  const b = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${b.getFullYear()}-${p(b.getMonth() + 1)}-${p(b.getDate())}`;
}

/**
 * Busca ingresos con Fecha de Ingreso ya vencida que siguen Activos sin
 * confirmar "Tomó Cargo" (Motivo del Retiro distinto del centinela 'SI'), y
 * notifica a los responsables de cada Operación (o su Regional, si la
 * Operación no tiene Auxiliar/Coordinador asignado).
 */
async function ejecutarNotificacionTomoCargo() {
  console.log('[tomoCargoNotifier] Iniciando verificación de ingresos sin confirmar...');
  try {
    const hoy = hoyBogotaStr();
    const [rows] = await pool.execute(
      `SELECT \`Id Vinculación\` AS idVinculacion, Trabajador, Cargo, \`Operación\` AS Operacion, Regional,
              \`Fecha de Ingreso\` AS FechaIngreso
       FROM \`Maestro_Vinculación\`
       WHERE Estado = 'Activo'
         AND \`Fecha de Ingreso\` IS NOT NULL
         AND DATE(\`Fecha de Ingreso\`) < ?
         AND (\`Motivo del Retiro\` IS NULL OR \`Motivo del Retiro\` <> 'SI')`,
      [hoy]
    );
    console.log(`[tomoCargoNotifier] ${rows.length} ingreso(s) sin confirmar.`);
    if (!rows.length) return;

    // Agrupar por Operación: cada grupo resuelve sus propios responsables
    // (Auxiliar/Coordinador de la Operación, o AuxiliarR/CoordinadorR de la Regional).
    const grupos = new Map();
    rows.forEach(r => {
      const key = r.Operacion || `__sinop__${r.Regional}`;
      if (!grupos.has(key)) grupos.set(key, { operacion: r.Operacion, regional: r.Regional, registros: [] });
      grupos.get(key).registros.push(r);
    });

    for (const grupo of grupos.values()) {
      try {
        const responsables = await obtenerResponsablesOperacionRegional(grupo.operacion, grupo.regional);
        const emails = [...new Set(responsables.map(d => d.Email).filter(Boolean))];
        if (!emails.length) {
          console.warn(`[tomoCargoNotifier] Sin responsables para Operación="${grupo.operacion}" Regional="${grupo.regional}" — se omite`);
          continue;
        }
        const scopeLabel = grupo.operacion ? `Operación: ${grupo.operacion}` : `Regional: ${grupo.regional}`;
        await notificarTomoCargoPendiente({
          destinatarios: emails,
          scopeLabel,
          registros: grupo.registros.map(r => ({
            trabajador:   limpiarNombre(r.Trabajador),
            cargo:        r.Cargo,
            operacion:    r.Operacion,
            fechaIngreso: r.FechaIngreso,
          })),
        });
        console.log(`[tomoCargoNotifier] Enviado a ${emails.join(', ')} (${scopeLabel}, ${grupo.registros.length} registro(s))`);
      } catch (err) {
        console.error(`[tomoCargoNotifier] Error notificando grupo Operación="${grupo.operacion}":`, err.message);
      }
    }
  } catch (err) {
    console.error('[tomoCargoNotifier] Error general:', err.message);
  }
}

/**
 * Inicia el temporizador diario que dispara la verificación a las 7:30 AM
 * hora de Colombia (Bogota, UTC-5) — mismo patrón que formaPagoUpdater.js.
 */
function iniciarProgramadorTomoCargo() {
  console.log('[tomoCargoNotifier] Daily scheduler started.');
  setInterval(async () => {
    try {
      const nowColombia = new Date(Date.now() - 5 * 3600000);
      const hours = nowColombia.getUTCHours();
      const minutes = nowColombia.getUTCMinutes();
      const todayStr = nowColombia.toISOString().slice(0, 10);
      if (hours === 7 && minutes === 30 && lastRunDate !== todayStr) {
        lastRunDate = todayStr;
        console.log(`[tomoCargoNotifier] Triggering daily task at 7:30 AM Colombia time (${todayStr})`);
        await ejecutarNotificacionTomoCargo();
      }
    } catch (err) {
      console.error('[tomoCargoNotifier] Error checking daily scheduler time:', err.message);
    }
  }, 30000);
}

module.exports = { ejecutarNotificacionTomoCargo, iniciarProgramadorTomoCargo };
