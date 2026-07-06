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
    const [cols] = await connection.execute('DESCRIBE Maestro_Operaciones');
    const fields = cols.map(c => c.Field);
    console.log('Maestro_Operaciones columns:', fields);

    if (fields.includes('MODALIDAD') || fields.includes('Modalidad')) {
      const [modRows] = await connection.execute('SELECT DISTINCT MODALIDAD FROM Maestro_Operaciones');
      console.log('Distinct MODALIDAD:', modRows);
    }
    if (fields.includes('SOCIODEMOGRAFICA') || fields.includes('Sociodemografica')) {
      const [socRows] = await connection.execute('SELECT DISTINCT SOCIODEMOGRAFICA FROM Maestro_Operaciones');
      console.log('Distinct SOCIODEMOGRAFICA:', socRows);
    }

    const [allOps] = await connection.execute('SELECT OPERACIÓN, REGIONAL, MODALIDAD, SOCIODEMOGRAFICA FROM Maestro_Operaciones WHERE REGIONAL != "INACTIVO" LIMIT 10');
    console.log('Sample Maestro_Operaciones rows:', allOps);
  } catch (err) {
    console.error('Error running query:', err);
  } finally {
    await connection.end();
  }
}

main();
