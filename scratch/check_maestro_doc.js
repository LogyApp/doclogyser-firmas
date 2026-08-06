require('dotenv').config();
const pool = require('../src/services/db');

async function main() {
  try {
    const [rows] = await pool.execute('SELECT TipoDocumento, Prefijo, COUNT(*) FROM Maestro_docTrabajador GROUP BY TipoDocumento, Prefijo LIMIT 10');
    console.log('Maestro_docTrabajador rows:', rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
