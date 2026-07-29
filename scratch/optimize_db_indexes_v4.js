require('dotenv').config();
const pool = require('../src/services/db.js');

async function runOptimization() {
  console.log('Starting DB index optimization v4...');
  const conn = await pool.getConnection();
  try {
    // 1. Optimize lookup by Trabajador in Maestro_Vinculación
    await addIndexSafe(conn, 'Maestro_Vinculación', 'idx_vinc_trabajador', '`Trabajador`(100)');

    // 2. Optimize lookup by Trabajador in Maestro_Segmentación
    await addIndexSafe(conn, 'Maestro_Segmentación', 'idx_seg_trabajador', '`Trabajador`(100)');

    console.log('Index optimization v4 finished successfully.');
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
