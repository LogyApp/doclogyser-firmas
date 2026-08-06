require('dotenv').config();
const pool = require('../src/services/db');

(async () => {
  const [rows] = await pool.execute(
    'SELECT idcsst, identificaciontrabajador, nombre_trabajador, cargo_trabajador, firma_trabajador IS NOT NULL AS firmado_trabajador, firma_analista IS NOT NULL AS firmado_analista, firma_lidersst IS NOT NULL AS firmado_lider, url_doc FROM Dynamic_compromisosst WHERE idcsst = ?',
    ['d798dee6-1722-4d10-bbf8-89fe4cd4994f']
  );
  console.log(rows);
  await pool.end();
})();
