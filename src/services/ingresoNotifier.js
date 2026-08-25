const pool = require('./db');
const { notificarIngreso, DESTINATARIOS_INGRESO_REDUCIDO } = require('./email');
const { obtenerCcEmails } = require('./logysignScheduler');

const MARCA = '[NI]';

// El cargo a notificar y su grupo de destinatarios se definen en
// Config_Cargo_Laboral.Notificar:
//   1 → grupo completo (DESTINATARIOS_INGRESO, definido en email.js)
//   2 → grupo reducido (DESTINATARIOS_INGRESO_REDUCIDO)
//   3 → dinámico por Operación/Regional del trabajador (misma lógica de logysign) + admin@logyser.com
async function obtenerIngresosPendientes() {
  const [rows] = await pool.execute(
    `SELECT mv.\`Id Vinculación\`            AS id,
            mv.\`Identificación\`            AS identificacion,
            mv.Trabajador,
            mv.Cargo,
            mv.\`Operación\`                 AS operacion,
            mv.\`Fecha de Ingreso\`          AS fechaIngreso,
            mv.\`Observaciones Vinculación\` AS observaciones,
            ccl.Notificar                   AS notificar
     FROM \`Maestro_Vinculación\` mv
     INNER JOIN \`Config_Cargo_Laboral\` ccl
       ON TRIM(mv.Cargo) COLLATE utf8mb4_bin = ccl.Cargo
     WHERE ccl.Notificar IN (1, 2, 3)
       AND (
             mv.\`Observaciones Vinculación\` IS NULL
          OR mv.\`Observaciones Vinculación\` NOT LIKE ?
       )`,
    [`%${MARCA}%`]
  );
  return rows;
}

async function marcarNotificado(idVinculacion) {
  await pool.execute(
    `UPDATE \`Maestro_Vinculación\`
     SET \`Observaciones Vinculación\` =
           LEFT(CONCAT(COALESCE(\`Observaciones Vinculación\`, ''), ?), 200)
     WHERE \`Id Vinculación\` = ?`,
    [` ${MARCA}`, idVinculacion]
  );
}

async function resolverDestinatarios(notificar, identificacion) {
  const grupo = Number(notificar);
  if (grupo === 1) return undefined; // notificarIngreso usa DESTINATARIOS_INGRESO por defecto
  if (grupo === 2) return DESTINATARIOS_INGRESO_REDUCIDO;
  if (grupo === 3) return obtenerCcEmails(null, identificacion, null); // ya incluye admin@logyser.com
  return null;
}

async function verificarIngresos() {
  try {
    const ingresos = await obtenerIngresosPendientes();

    if (ingresos.length > 0) {
      console.log(`[ingresoNotifier] ${ingresos.length} ingreso(s) pendiente(s) de notificar`);
    }

    for (const r of ingresos) {
      try {
        console.log(`[ingresoNotifier] Notificando ingreso id=${r.id} trabajador="${r.Trabajador}" (Notificar=${r.notificar})`);

        const destinatarios = await resolverDestinatarios(r.notificar, r.identificacion);
        if (destinatarios === null) {
          console.warn(`[ingresoNotifier] Valor de Notificar no reconocido (${r.notificar}) id=${r.id}`);
          continue;
        }
        if (Array.isArray(destinatarios) && !destinatarios.length) {
          console.warn(`[ingresoNotifier] Sin destinatarios resueltos (Notificar=${r.notificar}) id=${r.id}`);
        }

        await notificarIngreso({
          trabajador:     r.Trabajador,
          identificacion: r.identificacion,
          cargo:          r.Cargo,
          operacion:      r.operacion,
          fechaIngreso:   r.fechaIngreso,
          destinatarios,
        });

        await marcarNotificado(r.id);
        console.log(`[ingresoNotifier] OK — notificado y marcado id=${r.id}`);
      } catch (err) {
        // Sin marca → reintentará en el siguiente ciclo
        console.error(`[ingresoNotifier] ERROR id=${r.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[ingresoNotifier] Error general:', err.message);
  }
}

module.exports = { verificarIngresos };
