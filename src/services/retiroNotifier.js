const pool = require('./db');

const MARCA = '[RN]';

// Marca un registro como ya notificado (evita duplicar el aviso de retiro).
// Usado por las rutas de UI (formretiro.js, nomina.js) justo después de
// enviar la notificación correspondiente al cambio de Estado.
async function marcarNotificado(idVinculacion) {
  await pool.execute(
    `UPDATE \`Maestro_Vinculación\`
     SET \`Observaciones Vinculación\` =
           LEFT(CONCAT(COALESCE(\`Observaciones Vinculación\`, ''), ?), 200)
     WHERE \`Id Vinculación\` = ?`,
    [` ${MARCA}`, idVinculacion]
  );
}

module.exports = { marcarNotificado };
