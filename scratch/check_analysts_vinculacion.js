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
    const [users] = await connection.execute(
      "SELECT ID, Nombre, Rol, Colaborador FROM Maestro_Usuarios WHERE Rol IN ('AdmSst', 'AnaSst', 'AuxSst', 'LiderSst', 'Sistema')"
    );

    for (const u of users) {
      if (!u.Colaborador) {
        console.log(`User ${u.ID} (${u.Rol}): Colaborador is empty/null.`);
        continue;
      }
      
      const [vinRows] = await connection.execute(
        `SELECT Identificación, Trabajador, Cargo 
         FROM \`Maestro_Vinculación\` 
         WHERE Trabajador = ? 
         ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
        [u.Colaborador]
      );

      if (vinRows.length) {
        console.log(`User ${u.ID} (${u.Rol}): Found match in Maestro_Vinculación -> Identificación: ${vinRows[0].Identificación}, Trabajador: ${vinRows[0].Trabajador}`);
      } else {
        console.log(`User ${u.ID} (${u.Rol}): NO MATCH in Maestro_Vinculación for Colaborador = "${u.Colaborador}"`);
      }
    }
  } catch (err) {
    console.error('Error running queries:', err);
  } finally {
    await connection.end();
  }
}

main();
