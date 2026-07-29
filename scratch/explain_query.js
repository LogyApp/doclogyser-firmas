require('dotenv').config();
const pool = require('../src/services/db');

async function checkIndexes() {
  try {
    console.log('--- SHOW INDEX FROM Dynamic_compromisosst ---');
    const [idxComp] = await pool.execute('SHOW INDEX FROM Dynamic_compromisosst');
    console.log(idxComp.map(i => ({ Table: i.Table, Column: i.Column_name, Key_name: i.Key_name, Non_unique: i.Non_unique })));

    console.log('\n--- SHOW INDEX FROM Maestro_Vinculación ---');
    const [idxVinc] = await pool.execute('SHOW INDEX FROM Maestro_Vinculación');
    console.log(idxVinc.map(i => ({ Table: i.Table, Column: i.Column_name, Key_name: i.Key_name, Non_unique: i.Non_unique })));

    console.log('\n--- SHOW INDEX FROM Maestro_Segmentación ---');
    const [idxSeg] = await pool.execute('SHOW INDEX FROM Maestro_Segmentación');
    console.log(idxSeg.map(i => ({ Table: i.Table, Column: i.Column_name, Key_name: i.Key_name, Non_unique: i.Non_unique })));

    console.log('\n--- EXPLAIN QUERY ---');
    const sql = `
      EXPLAIN SELECT 
        a.idcsst,
        a.identificaciontrabajador,
        a.nombre_trabajador,
        a.cargo_trabajador,
        a.nombre_analista,
        a.firma_trabajador,
        a.firma_analista,
        a.firma_lidersst,
        a.url_doc,
        a.usuario,
        a.fecha_registro,
        seg.Celular AS celular_trabajador
       FROM Dynamic_compromisosst a
       LEFT JOIN \`Maestro_Vinculación\` v ON a.identificaciontrabajador = v.Identificación AND v.Estado = 'Activo'
       LEFT JOIN \`Maestro_Segmentación\` seg ON a.identificaciontrabajador = seg.Identificación
       ORDER BY a.fecha_registro DESC
       LIMIT 500
    `;
    const [explainRows] = await pool.execute(sql);
    console.table(explainRows);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkIndexes();
