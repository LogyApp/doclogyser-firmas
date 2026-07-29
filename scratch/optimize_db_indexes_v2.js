require('dotenv').config();
const pool = require('../src/services/db.js');

async function runOptimization() {
  console.log('Starting DB index optimization for all modules...');
  const conn = await pool.getConnection();
  try {
    // 1. Maestro_evaluacionsst
    await addIndexSafe(conn, 'Maestro_evaluacionsst', 'idx_ev_identificacion', 'identificacion');
    await addIndexSafe(conn, 'Maestro_evaluacionsst', 'idx_ev_usuario', 'usuario');
    await addIndexSafe(conn, 'Maestro_evaluacionsst', 'idx_ev_fecha', 'fecha');

    // 2. Maestro_capacitacionsst
    await addIndexSafe(conn, 'Maestro_capacitacionsst', 'idx_cap_identificacion', 'identificacion');
    await addIndexSafe(conn, 'Maestro_capacitacionsst', 'idx_cap_usuario', 'usuario');
    await addIndexSafe(conn, 'Maestro_capacitacionsst', 'idx_cap_fecha', 'fecha');

    // 3. Dynamic_pruebaconsumo
    await addIndexSafe(conn, 'Dynamic_pruebaconsumo', 'idx_pc_identificacion', 'identificacion');
    await addIndexSafe(conn, 'Dynamic_pruebaconsumo', 'idx_pc_usuario', 'usuario');
    await addIndexSafe(conn, 'Dynamic_pruebaconsumo', 'idx_pc_fecha', 'fecha');
    await addIndexSafe(conn, 'Dynamic_pruebaconsumo', 'idx_pc_token_firma', 'token_firma');

    // 4. Dynamic_formato_asistencia
    await addIndexSafe(conn, 'Dynamic_formato_asistencia', 'idx_as_responsable', 'responsable');
    await addIndexSafe(conn, 'Dynamic_formato_asistencia', 'idx_as_usuario', 'usuario');
    await addIndexSafe(conn, 'Dynamic_formato_asistencia', 'idx_as_fecha', 'fecha');

    // 5. Dynamic_formato_itemsAsistencia
    await addIndexSafe(conn, 'Dynamic_formato_itemsAsistencia', 'idx_item_asistencia', 'id_asistencia');
    await addIndexSafe(conn, 'Dynamic_formato_itemsAsistencia', 'idx_item_identificacion', 'identificacion');

    // 6. Dynamic_formato_evidencias
    await addIndexSafe(conn, 'Dynamic_formato_evidencias', 'idx_evid_asistencia', 'id_asistencia');

    console.log('Index optimization finished successfully.');
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
