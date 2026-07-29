require('dotenv').config();
const pool = require('../src/services/db.js');

async function inspectTable() {
  try {
    const [columns] = await pool.execute('DESCRIBE `Dynamic_pruebaconsumo`');
    console.log('Columns of Dynamic_pruebaconsumo:', columns);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

inspectTable();
