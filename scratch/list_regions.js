require('dotenv').config();
const pool = require('../src/services/db.js');

async function testRegions() {
  try {
    const [rows] = await pool.execute('SELECT DISTINCT Regional, `Operación` FROM Maestro_Vinculación WHERE Estado = "Activo" LIMIT 20');
    console.log('Active Regionals & Operations:', rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

testRegions();
