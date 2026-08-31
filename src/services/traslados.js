const pool = require('./db');

// Correos del personal (Auxiliar/Coordinador) de la Operación Destino de un traslado.
// Si no hay usuarios con Rol Auxiliar/Coordinador asignados directamente a esa Operación,
// se busca por Regional (Rol AuxiliarR/CoordinadorR) como respaldo.
async function obtenerCorreosOperacionDestino(operacionDestino) {
  if (!operacionDestino) return [];

  const [opRows] = await pool.execute(
    "SELECT Email FROM Maestro_Usuarios WHERE `Operación` = ? AND Rol IN ('Auxiliar','Coordinador') AND Email IS NOT NULL AND Email != ''",
    [operacionDestino]
  );
  if (opRows.length) return opRows.map(r => r.Email).filter(Boolean);

  const [regDestRows] = await pool.execute(
    'SELECT REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? LIMIT 1',
    [operacionDestino]
  );
  const regional = regDestRows.length ? regDestRows[0].REGIONAL : null;
  if (!regional) return [];

  const [regRows] = await pool.execute(
    "SELECT Email FROM Maestro_Usuarios WHERE Regional = ? AND Rol IN ('AuxiliarR','CoordinadorR') AND Email IS NOT NULL AND Email != ''",
    [regional]
  );
  return regRows.map(r => r.Email).filter(Boolean);
}

module.exports = { obtenerCorreosOperacionDestino };
