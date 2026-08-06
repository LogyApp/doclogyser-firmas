const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 3307,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    const query = `
      SELECT s.IdServicio, s.IdRecibo, s.Estado, s.\`Forma De Pago\`, s.Fecha, s.Usuario, s.\`Hora Inicio\`, r.\`Operación\` AS Operacion
      FROM \`Dynamic_Servicios\` s
      LEFT JOIN \`Dynamic_Recibos\` r ON s.IdRecibo = r.IdRecibo
      WHERE s.\`Forma De Pago\` = 4
      LIMIT 5
    `;
    const [records] = await pool.query(query);
    console.log("Joined records result:", records);
  } catch (err) {
    console.error("Error during execution:", err);
  } finally {
    await pool.end();
  }
}
main();
