require('dotenv').config();
const pool = require('../src/services/db');

async function addColumnIfNotExist(tableName, columnName, columnDefinition) {
  try {
    const [rows] = await pool.execute(`
      SELECT COUNT(*) AS cnt 
      FROM information_schema.columns 
      WHERE table_schema = 'Desplegables' 
        AND table_name = ? 
        AND column_name = ?
    `, [tableName, columnName]);

    if (rows[0].cnt > 0) {
      console.log(`Column "${columnName}" on table "${tableName}" already exists. Skipping.`);
      return;
    }

    console.log(`Adding column "${columnName}" to table "${tableName}"...`);
    await pool.execute(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnDefinition}`);
    console.log(`Column "${columnName}" added successfully.`);
  } catch (err) {
    console.error(`Failed to add column "${columnName}" to table "${tableName}":`, err.message);
  }
}

async function main() {
  try {
    console.log('Adding request management columns to Maestro_docTrabajador and Maestro_docEmpresa...');

    // Add to Maestro_docTrabajador
    await addColumnIfNotExist('Maestro_docTrabajador', 'Usuario_Solicitud', 'VARCHAR(100) DEFAULT NULL');
    await addColumnIfNotExist('Maestro_docTrabajador', 'Estado_Solicitud', 'VARCHAR(20) DEFAULT NULL');

    // Add to Maestro_docEmpresa
    await addColumnIfNotExist('Maestro_docEmpresa', 'Usuario_Solicitud', 'VARCHAR(100) DEFAULT NULL');
    await addColumnIfNotExist('Maestro_docEmpresa', 'Estado_Solicitud', 'VARCHAR(20) DEFAULT NULL');

    console.log('Column checks and migrations completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Fatal migration error:', err);
    process.exit(1);
  }
}

main();
