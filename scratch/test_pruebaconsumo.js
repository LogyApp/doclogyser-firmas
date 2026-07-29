require('dotenv').config();
const pool = require('../src/services/db.js');

async function testPruebaConsumo() {
  try {
    console.log('Testing DB connection...');
    const [connTest] = await pool.execute('SELECT 1');
    console.log('DB connection ok:', connTest);

    console.log('Testing Dynamic_pruebaconsumo table...');
    const [rows] = await pool.execute('SELECT COUNT(*) AS total FROM Dynamic_pruebaconsumo');
    console.log('Total rows in Dynamic_pruebaconsumo:', rows[0].total);

    console.log('Selecting first row in Dynamic_pruebaconsumo...');
    const [sample] = await pool.execute('SELECT * FROM Dynamic_pruebaconsumo LIMIT 1');
    console.log('Sample row:', sample[0]);

    console.log('Testing Maestro_Vinculación joins...');
    const [joined] = await pool.execute(`
      SELECT COUNT(*) AS total
      FROM Dynamic_pruebaconsumo a
      LEFT JOIN Maestro_Vinculación v ON a.identificacion = v.Identificación AND v.Estado = 'Activo'
    `);
    console.log('Joined count with Active Vinculación:', joined[0].total);

    console.log('All tests passed successfully!');
  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    process.exit(0);
  }
}

testPruebaConsumo();
