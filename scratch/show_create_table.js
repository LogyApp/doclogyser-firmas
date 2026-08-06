require('dotenv').config();
const pool = require('../src/services/db');

async function main() {
  try {
    const [rows] = await pool.execute('SHOW CREATE TABLE Maestro_docTrabajador');
    console.log(rows[0]['Create Table']);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
