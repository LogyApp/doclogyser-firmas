require('dotenv').config();
const pool = require('../src/services/db');

async function check() {
  try {
    const [rows] = await pool.execute(
      `SELECT Estado, \`Motivo del Retiro\`, COUNT(*) as qty 
       FROM \`Maestro_Vinculación\` 
       GROUP BY Estado, \`Motivo del Retiro\``
    );
    console.log('Frequencies of Estado and Motivo del Retiro:');
    console.log(rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
