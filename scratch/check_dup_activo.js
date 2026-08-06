require('dotenv').config();
const pool = require('../src/services/db');

(async () => {
  const [dupRows] = await pool.execute(
    "SELECT Identificación, COUNT(*) as total FROM `Maestro_Vinculación` WHERE Estado = 'Activo' GROUP BY Identificación HAVING COUNT(*) > 1 LIMIT 10"
  );
  console.log('Duplicated Activo identificaciones:', dupRows.length);
  console.log(dupRows);

  if (dupRows.length) {
    const id = dupRows[0]['Identificación'];
    const [detail] = await pool.execute(
      'SELECT Identificación, Trabajador, Cargo, Regional, `Operación`, Estado, `Fecha de Ingreso` FROM `Maestro_Vinculación` WHERE Identificación = ?',
      [id]
    );
    console.log('Detail for', id, detail);
  }

  await pool.end();
})();
