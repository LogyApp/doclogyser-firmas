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
    console.log("Checking and adding column 'causa' to Dynamic_Logysign...");
    await pool.query(`
      ALTER TABLE Dynamic_Logysign 
      ADD COLUMN causa VARCHAR(255) NULL
    `);
    console.log("Column 'causa' added successfully.");
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log("Column 'causa' already exists.");
    } else {
      console.error("Error during execution:", err);
    }
  } finally {
    await pool.end();
  }
}
main();
