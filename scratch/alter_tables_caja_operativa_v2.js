const mysql = require('mysql2/promise');
const pool = require('../src/services/db.js');

async function runMigration() {
  console.log('Starting migration...');
  const conn = await pool.getConnection();
  try {
    // 1. Drop columns in Dynamic_gasto_trabajador and add tipo_gasto
    console.log('Altering Dynamic_gasto_trabajador...');
    await conn.execute(`
      ALTER TABLE Dynamic_gasto_trabajador
        DROP COLUMN idtrabajador,
        DROP COLUMN trabajador,
        DROP COLUMN tipo_transporte,
        DROP COLUMN placa,
        DROP COLUMN origen,
        DROP COLUMN destino,
        ADD COLUMN tipo_gasto VARCHAR(50) AFTER idgasto
    `);
    console.log('Dynamic_gasto_trabajador altered successfully.');

    // 2. Drop columns in Dynamic_gastos
    console.log('Altering Dynamic_gastos...');
    await conn.execute(`
      ALTER TABLE Dynamic_gastos
        DROP COLUMN placa,
        DROP COLUMN origen,
        DROP COLUMN destino
    `);
    console.log('Dynamic_gastos altered successfully.');

    console.log('Migration finished successfully!');
  } catch (err) {
    console.error('Error during migration:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

runMigration();
