require('dotenv').config();
const pool = require('../src/services/db');

async function createTable() {
  try {
    console.log('Creating table Maestro_docEmpresa...');

    const createSql = `
      CREATE TABLE \`Maestro_docEmpresa\` (
        \`id\` CHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        \`Validación\` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
        \`Regional\` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
        \`Operación\` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
        \`TipoDocumento\` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        \`Prefijo\` VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
        \`Observaciones\` VARCHAR(512) COLLATE utf8mb4_bin DEFAULT NULL,
        \`Visualizar\` VARCHAR(10) COLLATE utf8mb4_bin DEFAULT NULL,
        \`Solicitud\` VARCHAR(10) COLLATE utf8mb4_bin DEFAULT NULL,
        \`Justificacion_Solicitud\` VARCHAR(512) COLLATE utf8mb4_bin DEFAULT NULL,
        \`FechaRegistro\` DATETIME DEFAULT (CONVERT_TZ(NOW(), 'SYSTEM', '-05:00')),
        \`Usuario\` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
        \`Url\` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`idx_solicitud_visualizar\` (\`Solicitud\`, \`Visualizar\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
    `;

    await pool.execute(createSql);
    console.log('Table Maestro_docEmpresa created successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Failed to create table:', err);
    process.exit(1);
  }
}

createTable();
