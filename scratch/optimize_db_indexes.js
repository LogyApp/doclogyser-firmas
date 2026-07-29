require('dotenv').config();
const pool = require('../src/services/db.js');

async function runOptimization() {
  console.log('Starting DB index optimization for compromisosst and general performance...');
  const conn = await pool.getConnection();
  try {
    // 1. Optimize Dynamic_compromisosst
    await addIndexSafe(conn, 'Dynamic_compromisosst', 'idx_identificacion_trab', 'identificaciontrabajador');
    await addIndexSafe(conn, 'Dynamic_compromisosst', 'idx_fecha_registro', 'fecha_registro');
    await addIndexSafe(conn, 'Dynamic_compromisosst', 'idx_usuario', 'usuario');

    // 2. Optimize Maestro_Vinculación
    await addIndexSafe(conn, 'Maestro_Vinculación', 'idx_vinc_identificacion', '`Identificación`');
    await addIndexSafe(conn, 'Maestro_Vinculación', 'idx_vinc_estado', '`Estado`');
    await addIndexSafe(conn, 'Maestro_Vinculación', 'idx_vinc_regional_operacion', '`Regional`, `Operación`');

    // 3. Optimize Maestro_Segmentación
    await addIndexSafe(conn, 'Maestro_Segmentación', 'idx_seg_identificacion', '`Identificación`');

    console.log('Index optimization finished.');
  } catch (err) {
    console.error('Error during index optimization:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

async function addIndexSafe(conn, table, indexName, columns) {
  try {
    console.log(`Adding index ${indexName} on ${table}(${columns})...`);
    await conn.execute(`ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (${columns})`);
    console.log(`Index ${indexName} added successfully.`);
  } catch (err) {
    if (err.errno === 1061 || err.code === 'ER_DUP_KEYNAME') {
      console.log(`Index ${indexName} already exists on ${table}.`);
    } else {
      console.error(`Error adding index ${indexName} on ${table}:`, err.message);
    }
  }
}

runOptimization();
