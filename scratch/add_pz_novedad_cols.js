require('dotenv').config();
const pool = require('../src/services/db');

async function migrate() {
  try {
    const areas = ['nomina', 'tecnologia', 'sst', 'facturacion', 'contabilidad', 'cuentas', 'gerencia'];
    
    console.log('Adding novelty columns to Maestro_pazysalvo...');
    for (const area of areas) {
      const colName = `novedad_${area}`;
      console.log(`Adding column: ${colName}`);
      
      // Check if column already exists
      const [cols] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Maestro_pazysalvo' AND COLUMN_NAME = ? AND TABLE_SCHEMA = ?
      `, [colName, process.env.DB_NAME]);
      
      if (cols.length === 0) {
        await pool.execute(`ALTER TABLE \`Maestro_pazysalvo\` ADD COLUMN \`${colName}\` TEXT NULL`);
        console.log(`Column ${colName} added successfully.`);
      } else {
        console.log(`Column ${colName} already exists.`);
      }
    }
    
    console.log('Migration complete!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
