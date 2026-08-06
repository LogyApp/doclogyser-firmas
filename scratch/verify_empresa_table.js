require('dotenv').config();
const pool = require('../src/services/db');

async function verify() {
  try {
    console.log('Verifying table Maestro_docEmpresa schema...');

    // 1. Describe table
    console.log('\n--- Maestro_docEmpresa Columns ---');
    const [cols] = await pool.execute('DESCRIBE Maestro_docEmpresa');
    console.log(cols.map(c => `${c.Field}: ${c.Type} | Null: ${c.Null} | Key: ${c.Key} | Default: ${c.Default} | Extra: ${c.Extra}`));

    // 2. Check indexes
    console.log('\n--- Maestro_docEmpresa Indexes ---');
    const [indexes] = await pool.execute('SHOW INDEX FROM Maestro_docEmpresa');
    console.log(indexes.map(i => `Index: ${i.Key_name} | Column: ${i.Column_name} | Unique: ${i.Non_unique === 0}`));

    console.log('\nVerification completed!');
    process.exit(0);
  } catch (err) {
    console.error('Verification failed:', err);
    process.exit(1);
  }
}

verify();
