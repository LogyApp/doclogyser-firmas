require('dotenv').config();
const pool = require('../src/services/db');

async function main() {
  try {
    const [rows] = await pool.execute('DESCRIBE Maestro_Segmentación');
    console.log('Maestro_Segmentación columns:', rows);
    const [sample] = await pool.execute('SELECT * FROM Maestro_Segmentación LIMIT 1');
    console.log('Maestro_Segmentación sample:', sample);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
