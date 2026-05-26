const pool = require('./db');
const { notificarRetiro } = require('./email');

const MARCA = '[RN]';

// Detecta TODOS los retirados sin marcar, sin restricción de fecha.
// Depende únicamente de que el registro no tenga la marca [RN].
// Antes de activar, corre el SQL de inicialización para marcar históricos.
async function obtenerRetirosPendientes() {
  const [rows] = await pool.execute(
    `SELECT \`Id Vinculación\`         AS id,
            \`Identificación\`         AS identificacion,
            Trabajador,
            Cargo,
            \`Operación\`              AS operacion,
            \`Fecha de Retiro\`        AS fechaRetiro,
            \`Motivo del Retiro\`      AS motivoRetiro,
            Usuario,
            \`Observaciones Vinculación\` AS observaciones
     FROM \`Maestro_Vinculación\`
     WHERE Estado = 'Retirado'
       AND \`Fecha de Retiro\` IS NOT NULL
       AND (
             \`Observaciones Vinculación\` IS NULL
          OR \`Observaciones Vinculación\` NOT LIKE ?
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

async function obtenerDatosUsuario(usuarioId) {
  if (!usuarioId) return null;
  const [rows] = await pool.execute(
    'SELECT Email, Nombre FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
    [usuarioId]
  );
  return rows[0] || null;
}

async function verificarRetiros() {
  try {
    const retiros = await obtenerRetirosPendientes();

    if (retiros.length > 0) {
      console.log(`[retiroNotifier] ${retiros.length} retiro(s) pendiente(s) de notificar`);
    }

    for (const r of retiros) {
      try {
        const usuData = await obtenerDatosUsuario(r.Usuario);
        console.log(`[retiroNotifier] Notificando retiro id=${r.id} trabajador="${r.Trabajador}"`);

        await notificarRetiro({
          trabajador:       r.Trabajador,
          identificacion:   r.identificacion,
          cargo:            r.Cargo,
          operacion:        r.operacion,
          fechaRetiro:      r.fechaRetiro,
          motivoRetiro:     r.motivoRetiro,
          registradoPor:    usuData?.Nombre || r.Usuario || '—',
          emailRegistrador: usuData?.Email  || null,
        });

        await marcarNotificado(r.id);
        console.log(`[retiroNotifier] OK — notificado y marcado id=${r.id}`);
      } catch (err) {
        // Sin marca → reintentará en el siguiente ciclo
        console.error(`[retiroNotifier] ERROR id=${r.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[retiroNotifier] Error general:', err.message);
  }
}

module.exports = { verificarRetiros, marcarNotificado };
