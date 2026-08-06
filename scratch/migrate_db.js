require('dotenv').config();
const pool = require('../src/services/db');

async function migrate() {
  try {
    console.log('Starting migration...');

    // 1. Add tipo_doc column
    console.log('Adding column "tipo_doc" to Config_Doc_Trabajador...');
    await pool.execute(`
      ALTER TABLE Config_Doc_Trabajador 
      ADD COLUMN tipo_doc ENUM('Trabajador', 'General') NOT NULL DEFAULT 'Trabajador'
    `);
    console.log('Column "tipo_doc" added successfully.');

    // 2. Add area column
    console.log('Adding column "area" to Config_Doc_Trabajador...');
    await pool.execute(`
      ALTER TABLE Config_Doc_Trabajador 
      ADD COLUMN area INT DEFAULT NULL
    `);
    console.log('Column "area" added successfully.');

    // 3. Add foreign key constraint
    console.log('Adding foreign key constraint referencing Config_Area(ID)...');
    await pool.execute(`
      ALTER TABLE Config_Doc_Trabajador 
      ADD CONSTRAINT fk_config_doc_trabajador_area 
      FOREIGN KEY (area) REFERENCES Config_Area(ID) 
      ON DELETE SET NULL 
      ON UPDATE CASCADE
    `);
    console.log('Foreign key constraint added successfully.');

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
