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
    const [rows] = await connection.execute(
      `SELECT \`Id Vinculación\`, Trabajador, Identificación, Cargo, Operación, Regional 
       FROM \`Maestro_Vinculación\` 
       WHERE Estado = 'Activo' AND (
         Trabajador IS NULL OR Trabajador = '' OR
         Identificación IS NULL OR Identificación = '' OR
         Cargo IS NULL OR Cargo = '' OR
         \`Operación\` IS NULL OR \`Operación\` = '' OR
         Regional IS NULL OR Regional = ''
       )`
    );

    console.log(`Active workers with NULL/empty columns: ${rows.length}`);
    if (rows.length > 0) {
      console.log('Sample rows:', rows.slice(0, 10));
    }
  } catch (err) {
    console.error('Error running queries:', err);
  } finally {
    await connection.end();
  }
}

main();
