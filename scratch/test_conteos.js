const db = require('../src/services/db');

(async () => {
  try {
    const [regRows] = await db.query(`
      SELECT Regional, COUNT(DISTINCT identificacion) AS total
      FROM (
        SELECT cm.identificacion, COALESCE(v.Regional, cm.regional_id) AS Regional
        FROM Maestro_casosmedicos cm
        LEFT JOIN (
          SELECT Identificación, Regional,
                 ROW_NUMBER() OVER(PARTITION BY Identificación ORDER BY \`Fecha de Ingreso\` DESC) as rn
          FROM \`Maestro_Vinculación\`
        ) v ON cm.identificacion = v.Identificación AND v.rn = 1
      ) t
      WHERE Regional IS NOT NULL
      GROUP BY Regional
    `);
    console.log('Regionales conteo:', regRows);

    const [opRows] = await db.query(`
      SELECT Operacion, COUNT(DISTINCT identificacion) AS total
      FROM (
        SELECT cm.identificacion, COALESCE(v.Operación, s.Operación, cm.operacion) AS Operacion
        FROM Maestro_casosmedicos cm
        LEFT JOIN (
          SELECT Identificación, \`Operación\`,
                 ROW_NUMBER() OVER(PARTITION BY Identificación ORDER BY \`Fecha de Ingreso\` DESC) as rn
          FROM \`Maestro_Vinculación\`
        ) v ON cm.identificacion = v.Identificación AND v.rn = 1
        LEFT JOIN \`Maestro_Segmentación\` s ON cm.identificacion = s.Identificación
      ) t
      WHERE Operacion IS NOT NULL
      GROUP BY Operacion
    `);
    console.log('Operaciones conteo:', opRows);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
})();
