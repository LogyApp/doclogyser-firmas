const pool = require('./db');
const { notificarRetiro } = require('./email');

// Marca que se escribe en Observaciones para evitar doble notificación
const MARCA = '[RN]';

// Retiros recientes sin marcar: cambiados en la última hora, hoy, sin nuestra marca
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
       AND \`Fecha Actualización\` >= DATE_SUB(NOW(), INTERVAL 60 MINUTE)
       AND DATE(\`Fecha Actualización\`) = CURDATE()
       AND (
             \`Observaciones Vinculación\` IS NULL
          OR \`Observaciones Vinculación\` NOT LIKE ?
       )`,
    [`%${MARCA}%`]
  );
  return rows;
}

async function marcarNotificado(idVinculacion) {
  // LEFT(..., 200) protege el límite VARCHAR(200) de la columna
  await pool.execute(
    `UPDATE \`Maestro_Vinculación\`
     SET \`Observaciones Vinculación\` =
           LEFT(CONCAT(COALESCE(\`Observaciones Vinculación\`, ''), ?), 200)
     WHERE \`Id Vinculación\` = ?`,
    [` ${MARCA}`, idVinculacion]
  );
}

async function obtenerEmailUsuario(usuarioId) {
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
    for (const r of retiros) {
      try {
        const usuData = await obtenerEmailUsuario(r.Usuario);
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
      } catch (err) {
        // No marca → reintentará en el siguiente ciclo
        console.error('[retiroNotifier] Error al notificar', r.id, err.message);
      }
    }
  } catch (err) {
    console.error('[retiroNotifier] Error general:', err.message);
  }
}

module.exports = { verificarRetiros, marcarNotificado };
