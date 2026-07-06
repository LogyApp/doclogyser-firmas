module.paths.push('c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/node_modules');
require('dotenv').config({ path: 'c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/.env' });
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 3307,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    const [statusRows] = await connection.execute('SELECT DISTINCT Estado FROM `Maestro_Vinculación`');
    console.log('Distinct Estado values in Maestro_Vinculación:', statusRows);

    const [countRows] = await connection.execute('SELECT COUNT(*) as count FROM `Maestro_Vinculación` WHERE Estado = "Activo"');
    console.log('Count of Activo workers:', countRows[0].count);

    const [sampleWorkers] = await connection.execute('SELECT Regional, `Operación`, Trabajador, Estado FROM `Maestro_Vinculación` LIMIT 5');
    console.log('Sample workers:', sampleWorkers);
  } catch (err) {
    console.error('Error running query:', err);
  } finally {
    await connection.end();
  }
}

main();
