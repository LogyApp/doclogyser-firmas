require('dotenv').config();
const pool = require('../src/services/db');
const fs = require('fs');
const path = require('path');

async function run() {
  try {
    const [rows] = await pool.execute(
      'SELECT contenido_html FROM Maestro_Plantillas WHERE LOWER(nombre_proceso) = LOWER(?)',
      ['compromisosst']
    );
    if (!rows.length) {
      console.error('Plantilla no encontrada');
      process.exit(1);
    }
    const html = rows[0].contenido_html;
    const destPath = path.join(__dirname, 'compromisosst_template.html');
    fs.writeFileSync(destPath, html, 'utf8');
    console.log('Plantilla guardada exitosamente en:', destPath);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

run();
