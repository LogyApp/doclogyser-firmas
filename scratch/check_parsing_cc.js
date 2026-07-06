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
      
      let cc = '';
      let name = '';
      const colStr = u.Colaborador.trim();
      if (colStr.includes(' ** ')) {
        const parts = colStr.split(' ** ');
        cc = parts[0].trim();
        name = parts[1].trim();
      }

      if (!cc) {
        console.log(`User ${u.ID}: Could not parse CC from Colaborador string "${u.Colaborador}"`);
        continue;
      }

      const [vinRows] = await connection.execute(
        `SELECT Identificación, Trabajador, Cargo 
         FROM \`Maestro_Vinculación\` 
         WHERE Identificación = ? 
         ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
        [cc]
      );

      if (vinRows.length) {
        console.log(`User ${u.ID}: MATCH by CC = "${cc}" -> Name: ${vinRows[0].Trabajador}, Cargo: ${vinRows[0].Cargo}`);
      } else {
        console.log(`User ${u.ID}: NO MATCH by CC = "${cc}" (Colaborador string: "${u.Colaborador}")`);
      }
    }
  } catch (err) {
    console.error('Error running queries:', err);
  } finally {
    await connection.end();
  }
}

main();
