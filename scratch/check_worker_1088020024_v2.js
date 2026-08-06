require('dotenv').config();
const pool = require('../src/services/db');

(async () => {
  const id = '1088020024';

  const [vin] = await pool.execute(
    'SELECT * FROM `Maestro_Vinculación` WHERE Identificación = ?',
    [id]
  );
  console.log('=== Maestro_Vinculación (full row) ===');
  console.log(vin);

  await pool.end();
})();
