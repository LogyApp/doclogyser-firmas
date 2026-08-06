require('dotenv').config();
const pool = require('../src/services/db');

async function main() {
  try {
    const [rows] = await pool.execute('DESCRIBE Config_Rol');
    console.log('Config_Rol columns:', rows);
    const [sample] = await pool.execute('SELECT * FROM Config_Rol LIMIT 5');
    console.log('Config_Rol samples:', sample);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
