require('dotenv').config();
const pool = require('../src/services/db');

async function main() {
  try {
    const [rows] = await pool.execute(`
      SELECT TABLE_NAME, ENGINE, TABLE_COLLATION 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = 'Desplegables' 
        AND TABLE_NAME IN ('Config_Doc_Trabajador', 'Config_Area')
    `);
    console.log('Tables information:', rows);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
