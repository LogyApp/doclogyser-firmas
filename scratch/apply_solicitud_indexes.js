require('dotenv').config();
const pool = require('../src/services/db');

async function main() {
  try {
    console.log('Adding indexes for Estado_Solicitud...');
    await pool.execute('ALTER TABLE `Maestro_docTrabajador` ADD INDEX `idx_mdt_estado_solicitud` (`Estado_Solicitud`)');
    await pool.execute('ALTER TABLE `Maestro_docEmpresa` ADD INDEX `idx_mde_estado_solicitud` (`Estado_Solicitud`)');
    console.log('Indexes added successfully!');
    process.exit(0);
  } catch (err) {
    console.log('Index addition skipped or failed:', err.message);
    process.exit(0);
  }
}
main();
