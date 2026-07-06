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
    const [users] = await connection.execute('SELECT ID, Nombre, Rol, Colaborador FROM Maestro_Usuarios');
    console.log('Maestro_Usuarios table:');
    users.forEach(u => {
      console.log(`- ID: ${u.ID}, Nombre: ${u.Nombre}, Rol: ${u.Rol}, Colaborador: ${u.Colaborador}`);
    });
  } catch (err) {
    console.error('Error running query:', err);
  } finally {
    await connection.end();
  }
}

main();
