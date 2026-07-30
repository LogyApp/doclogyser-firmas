require('dotenv').config({ path: 'c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/.env' });
const pool = require('c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/src/services/db');

async function test() {
  try {
    console.time('without_signatures');
    const [rows] = await pool.execute(
      `SELECT 
        a.idcsst,
        a.identificaciontrabajador,
        a.nombre_trabajador,
        a.cargo_trabajador,
        a.nombre_analista,
        -- Exclude the mediumtext base64 signatures
        (a.firma_trabajador IS NOT NULL) AS has_firma_trabajador,
        (a.firma_analista IS NOT NULL) AS has_firma_analista,
        (a.firma_lidersst IS NOT NULL) AS has_firma_lidersst,
        a.url_doc,
        a.usuario,
        a.fecha_registro,
        seg.Celular AS celular_trabajador
       FROM Dynamic_compromisosst a
       LEFT JOIN \`Maestro_Vinculación\` v ON a.identificaciontrabajador = v.Identificación AND v.Estado = 'Activo'
       LEFT JOIN \`Maestro_Segmentación\` seg ON a.identificaciontrabajador = seg.Identificación
       ORDER BY a.fecha_registro DESC
       LIMIT 500`
    );
    console.timeEnd('without_signatures');
    console.log('Returned rows without signatures:', rows.length);

  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await pool.end();
  }
}

test();
