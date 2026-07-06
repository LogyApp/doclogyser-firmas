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
      "SELECT `Id Vinculación`, Trabajador, Identificación, Estado FROM `Maestro_Vinculación` WHERE Identificación = 1010032606"
    );
    console.log('Luisa records in Maestro_Vinculación:', rows);
  } catch (err) {
    console.error('Error running queries:', err);
  } finally {
    await connection.end();
  }
}

main();
