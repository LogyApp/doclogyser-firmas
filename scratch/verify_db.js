require('dotenv').config();
const pool = require('../src/services/db');

async function verify() {
  try {
    console.log('Verifying table changes...');

    // 1. Describe table
    console.log('\n--- Config_Doc_Trabajador Columns ---');
    const [cols] = await pool.execute('DESCRIBE Config_Doc_Trabajador');
    console.log(cols.map(c => `${c.Field}: ${c.Type} | Null: ${c.Null} | Key: ${c.Key} | Default: ${c.Default}`));

    // 2. Fetch sample rows
    console.log('\n--- Config_Doc_Trabajador Samples (limit 5) ---');
    const [rows] = await pool.execute('SELECT Id, Prefijo, Documento, area, tipo_doc FROM Config_Doc_Trabajador LIMIT 5');
    console.log(rows);

    // 3. Count documents by tipo_doc
    console.log('\n--- Count by tipo_doc ---');
    const [counts] = await pool.execute('SELECT tipo_doc, COUNT(*) as count FROM Config_Doc_Trabajador GROUP BY tipo_doc');
    console.log(counts);

    // 4. Verify foreign key relationship
    console.log('\n--- Foreign Key Constraint ---');
    const [fks] = await pool.execute(`
      SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = 'Desplegables'
        AND TABLE_NAME = 'Config_Doc_Trabajador'
        AND COLUMN_NAME = 'area'
    `);
    console.log(fks);

    console.log('\nVerification completed!');
    process.exit(0);
  } catch (err) {
    console.error('Verification failed:', err);
    process.exit(1);
  }
}

verify();
