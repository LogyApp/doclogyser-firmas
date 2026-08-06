require('dotenv').config();
const pool = require('../src/services/db');

(async () => {
  const [dupRows] = await pool.execute(
    "SELECT Identificación, COUNT(*) as total FROM `Maestro_Vinculación` GROUP BY Identificación HAVING COUNT(*) > 1 LIMIT 5"
  );
  console.log('Workers with multiple vinculacion rows (any Estado):', dupRows.length);
  console.log(dupRows);

  for (const row of dupRows) {
    const id = row['Identificación'];
    const [detail] = await pool.execute(
      'SELECT Identificación, Trabajador, Cargo, Estado, `Fecha de Ingreso`, `Fecha de Retiro` FROM `Maestro_Vinculación` WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC',
      [id]
    );
    console.log('---', id, '---');
    console.log(detail);
  }

  await pool.end();
})();
