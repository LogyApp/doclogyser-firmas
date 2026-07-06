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
    // Test 1: plain LIKE %Luisa%
    const [rows1] = await connection.execute(
      "SELECT Trabajador FROM `Maestro_Vinculación` WHERE Estado = 'Activo' AND Trabajador LIKE ? LIMIT 1",
      ['%Luisa%']
    );
    console.log('Result for %Luisa%:', rows1.length);

    // Test 2: plain LIKE %LUISA%
    const [rows2] = await connection.execute(
      "SELECT Trabajador FROM `Maestro_Vinculación` WHERE Estado = 'Activo' AND Trabajador LIKE ? LIMIT 1",
      ['%LUISA%']
    );
    console.log('Result for %LUISA%:', rows2.length);

    // Test 3: UPPER(Trabajador) LIKE UPPER(?)
    const [rows3] = await connection.execute(
      "SELECT Trabajador FROM `Maestro_Vinculación` WHERE Estado = 'Activo' AND UPPER(Trabajador) LIKE ? LIMIT 1",
      ['%LUISA%']
    );
    console.log('Result for UPPER(Trabajador) LIKE %LUISA%:', rows3.length);

  } catch (err) {
    console.error('Error running queries:', err);
  } finally {
    await connection.end();
  }
}

main();
