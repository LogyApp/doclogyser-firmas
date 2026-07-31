require('dotenv').config({ path: 'c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/.env' });
const pool = require('c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/src/services/db');

async function run() {
  try {
    console.log('Creating table Dynamic_Logysign...');
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS Dynamic_Logysign (
        id VARCHAR(36) PRIMARY KEY,
        token VARCHAR(64) UNIQUE NOT NULL,
        token_expira DATETIME,
        identificacion VARCHAR(50) NOT NULL,
        nombre_trabajador VARCHAR(150) NOT NULL,
        email_trabajador VARCHAR(150) NOT NULL,
        regional VARCHAR(50),
        operacion VARCHAR(50),
        cargo VARCHAR(100),
        fecha_ingreso DATE,
        id_config_doc INT NOT NULL,
        prefijo VARCHAR(10),
        original_pdf_url VARCHAR(255) NOT NULL,
        firma_x FLOAT NOT NULL,
        firma_y FLOAT NOT NULL,
        firma_w FLOAT NOT NULL,
        firma_h FLOAT NOT NULL,
        firma_page INT NOT NULL,
        usuario_creador VARCHAR(50) NOT NULL,
        estado VARCHAR(20) DEFAULT 'PENDIENTE',
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Table Dynamic_Logysign created successfully!');
  } catch (err) {
    console.error('Error creating table:', err);
  } finally {
    await pool.end();
  }
}

run();
