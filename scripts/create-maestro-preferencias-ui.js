const pool = require('../src/services/db');

async function main() {
  console.log('=== Creando tabla Maestro_Preferencias_UI (si no existe) ===\n');

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS Maestro_Preferencias_UI (
      ID VARCHAR(50) NOT NULL,
      Tema VARCHAR(10) NOT NULL DEFAULT 'sistema',
      ColorAcento VARCHAR(7) NOT NULL DEFAULT '#F55400',
      fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (ID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  console.log('Tabla Maestro_Preferencias_UI lista.');
  process.exit(0);
}

main().catch(err => {
  console.error('ERROR creando Maestro_Preferencias_UI:', err);
  process.exit(1);
});
