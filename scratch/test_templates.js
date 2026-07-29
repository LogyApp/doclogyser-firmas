require('dotenv').config();
const pool = require('../src/services/db.js');

async function testTemplates() {
  try {
    const [rows] = await pool.execute('SELECT nombre_proceso FROM Maestro_Plantillas');
    console.log('Available template processes:', rows.map(r => r.nombre_proceso));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

testTemplates();
