require('dotenv').config();
const pool = require('../src/services/db');

async function addIndex(tableName, indexName, columnsSql) {
  try {
    // Check if index exists
    const [rows] = await pool.execute(`
      SELECT COUNT(*) AS cnt 
      FROM information_schema.statistics 
      WHERE table_schema = 'Desplegables' 
        AND table_name = ? 
        AND index_name = ?
    `, [tableName, indexName]);

    if (rows[0].cnt > 0) {
      console.log(`Index "${indexName}" on table "${tableName}" already exists. Skipping.`);
      return;
    }

    console.log(`Creating index "${indexName}" on table "${tableName}"...`);
    await pool.execute(`ALTER TABLE \`${tableName}\` ADD INDEX \`${indexName}\` (${columnsSql})`);
    console.log(`Index "${indexName}" created successfully.`);
  } catch (err) {
    console.error(`Failed to create index "${indexName}" on table "${tableName}":`, err.message);
  }
}

async function main() {
  try {
    console.log('Adding database indexes for performance optimization...');

    // 1. Config_Doc_Trabajador
    await addIndex('Config_Doc_Trabajador', 'idx_cdt_tipodoc', '`tipo_doc`');
    await addIndex('Config_Doc_Trabajador', 'idx_cdt_area', '`area`');

    // 2. Maestro_docTrabajador
    await addIndex('Maestro_docTrabajador', 'idx_mdt_tipodocumento', '`TipoDocumento`');
    await addIndex('Maestro_docTrabajador', 'idx_mdt_regional_operacion', '`Regional`, `Operación`');
    await addIndex('Maestro_docTrabajador', 'idx_mdt_estado', '`Estado`');

    // 3. Maestro_docEmpresa
    await addIndex('Maestro_docEmpresa', 'idx_mde_tipodocumento', '`TipoDocumento`');
    await addIndex('Maestro_docEmpresa', 'idx_mde_regional_operacion', '`Regional`, `Operación`');

    // 4. Config_Rol
    await addIndex('Config_Rol', 'idx_cr_rol', '`Rol`');

    console.log('Database index creation checks completed!');
    process.exit(0);
  } catch (err) {
    console.error('Fatal index creation error:', err);
    process.exit(1);
  }
}

main();
