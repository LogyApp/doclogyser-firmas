require('dotenv').config();
const pool = require('../src/services/db');

async function check() {
  try {
    console.log('Querying Maestro_pazysalvo columns...');
    const [rows] = await pool.execute('DESCRIBE Maestro_pazysalvo');
    console.log(rows.map(r => `${r.Field} (${r.Type})`));

    console.log('\nSample row:');
    const [sample] = await pool.execute('SELECT * FROM Maestro_pazysalvo LIMIT 1');
    console.log(sample);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
