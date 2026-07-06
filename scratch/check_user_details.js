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
    const [cols] = await connection.execute('DESCRIBE Maestro_Usuarios');
    console.log('Maestro_Usuarios columns:', cols.map(c => c.Field));

    const [sstUsers] = await connection.execute(
      "SELECT ID, Nombre, Rol, Regional, Dispositivo, `Operación` FROM Maestro_Usuarios WHERE Rol IN ('AdmSst', 'AnaSst', 'AuxSst', 'LiderSst', 'Sistema') LIMIT 10"
    );
    console.log('SST Users:', sstUsers);
  } catch (err) {
    console.error('Error running query:', err);
  } finally {
    await connection.end();
  }
}

main();
