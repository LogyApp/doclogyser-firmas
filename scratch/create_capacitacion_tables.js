require('dotenv').config();
const pool = require('../src/services/db');

async function run() {
  try {
    console.log('Creando tablas para capacitacionsst...');

    // 1. Tabla de Versiones de Plantilla (Tema y Objetivo)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS Maestro_capacitacionsst_plantilla (
        id_plantilla VARCHAR(36) NOT NULL PRIMARY KEY,
        version INT NOT NULL,
        tema TEXT NOT NULL,
        objetivo TEXT NOT NULL,
        activo TINYINT DEFAULT 0,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        usuario_creador VARCHAR(50) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✓ Tabla Maestro_capacitacionsst_plantilla creada.');

    // 2. Tabla de Preguntas/Opciones de la Plantilla
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS Maestro_capacitacionsst_plantilla_items (
        id_item INT AUTO_INCREMENT PRIMARY KEY,
        id_plantilla VARCHAR(36) NOT NULL,
        pregunta INT NOT NULL,
        descripcion_pregunta TEXT NOT NULL,
        opcion TEXT NOT NULL,
        correcta VARCHAR(2) DEFAULT NULL,
        FOREIGN KEY (id_plantilla) REFERENCES Maestro_capacitacionsst_plantilla(id_plantilla) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✓ Tabla Maestro_capacitacionsst_plantilla_items creada.');

    // 3. Tabla de Registro de Capacitaciones de Trabajadores (Instancias)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS Maestro_capacitacionsst (
        id_capacitacion VARCHAR(36) NOT NULL PRIMARY KEY,
        fecha DATE NOT NULL,
        identificacion VARCHAR(20) NOT NULL,
        usuario VARCHAR(50) NOT NULL,
        tema TEXT NOT NULL,
        objetivo TEXT NOT NULL,
        firma_trabajador LONGTEXT DEFAULT NULL,
        url_doc VARCHAR(255) DEFAULT NULL,
        token_firma VARCHAR(64) DEFAULT NULL,
        token_expira DATETIME DEFAULT NULL,
        puntaje INT DEFAULT NULL,
        resultado VARCHAR(20) DEFAULT NULL,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✓ Tabla Maestro_capacitacionsst creada.');

    // 4. Tabla de Preguntas y Respuestas asociadas a cada registro/instancia de capacitación
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS Maestro_capacitacionsst_items (
        id_capacitacion_item INT AUTO_INCREMENT PRIMARY KEY,
        id_capacitacion VARCHAR(36) NOT NULL,
        pregunta INT NOT NULL,
        descripcion_pregunta TEXT NOT NULL,
        opciones TEXT NOT NULL, -- Guardamos la opcion
        Correcta VARCHAR(2) DEFAULT NULL, -- 'SI' o NULL
        seleccionada VARCHAR(2) DEFAULT NULL, -- 'SI' o NULL (cuando el trabajador responde)
        FOREIGN KEY (id_capacitacion) REFERENCES Maestro_capacitacionsst(id_capacitacion) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✓ Tabla Maestro_capacitacionsst_items creada.');

    console.log('Todas las tablas de capacitacionsst fueron creadas exitosamente.');
  } catch (err) {
    console.error('Error al crear tablas:', err);
  } finally {
    await pool.end();
  }
}

run();
