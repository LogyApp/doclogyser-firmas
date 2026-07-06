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

  const tables = [
    'Dynamic_pruebaconsumo',
    'Dynamic_compromisosst',
    'Maestro_evaluacionsst',
    'Dynamic_formato_asistencia',
    'Dynamic_formato_itemsAsistencia'
  ];

  try {
    for (const table of tables) {
      console.log(`\n--- SCHEMA OF ${table} ---`);
      try {
        const [cols] = await connection.execute(`DESCRIBE \`${table}\``);
        cols.forEach(c => {
          console.log(`- ${c.Field}: ${c.Type} | Null: ${c.Null} | Key: ${c.Key} | Default: ${c.Default}`);
        });
      } catch (e) {
        console.error(`Error describing ${table}:`, e.message);
      }
    }
  } catch (err) {
    console.error('Error running queries:', err);
  } finally {
    await connection.end();
  }
}

main();
