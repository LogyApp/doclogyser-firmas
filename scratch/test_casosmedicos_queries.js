const db = require('../src/services/db');

(async () => {
  try {
    console.log('--- Probando consultas de Casos Médicos ---');

    // 1. Trabajadores agrupados con casos
    const [workers] = await db.query(`
      SELECT
        cm.identificacion,
        cm.total_casos,
        cm.casos_abiertos,
        cm.casos_cerrados,
        cm.min_prioridad_id,
        cm.max_fecha_caso,
        cm.ultimo_diagnostico_cod,
        cm.ultimo_tipo_evento_id,
        COALESCE(v.Trabajador, s.Trabajador, cm.identificacion) AS nombre_trabajador,
        COALESCE(v.Cargo, '—') AS cargo,
        COALESCE(v.Regional, cm.ultima_regional) AS regional,
        COALESCE(v.Operación, s.Operación, cm.ultima_operacion) AS operacion,
        COALESCE(v.Estado, s.Estado, 'Activo') AS estado_trabajador,
        v.Fecha_Ingreso AS fecha_ingreso
      FROM (
        SELECT
          identificacion,
          COUNT(id) AS total_casos,
          SUM(CASE WHEN estado_general_id = 1 THEN 1 ELSE 0 END) AS casos_abiertos,
          SUM(CASE WHEN estado_general_id = 2 THEN 1 ELSE 0 END) AS casos_cerrados,
          MIN(prioridad_id) AS min_prioridad_id,
          MAX(fecha_registro) AS max_fecha_caso,
          SUBSTRING_INDEX(GROUP_CONCAT(regional_id ORDER BY id DESC SEPARATOR '||'), '||', 1) AS ultima_regional,
          SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(operacion, '') ORDER BY id DESC SEPARATOR '||'), '||', 1) AS ultima_operacion,
          SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(diagnostico, '') ORDER BY id DESC SEPARATOR '||'), '||', 1) AS ultimo_diagnostico_cod,
          SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(tipo_evento_id, '') ORDER BY id DESC SEPARATOR '||'), '||', 1) AS ultimo_tipo_evento_id
        FROM Maestro_casosmedicos
        GROUP BY identificacion
      ) cm
      LEFT JOIN (
        SELECT Identificación, Trabajador, Cargo, Regional, \`Operación\`, Estado, \`Fecha de Ingreso\` AS Fecha_Ingreso,
               ROW_NUMBER() OVER(PARTITION BY Identificación ORDER BY \`Fecha de Ingreso\` DESC) as rn
        FROM \`Maestro_Vinculación\`
      ) v ON cm.identificacion = v.Identificación AND v.rn = 1
      LEFT JOIN \`Maestro_Segmentación\` s ON cm.identificacion = s.Identificación
    `);
    console.log('Trabajadores agrupados:', workers);

    // 2. Consecutivo de codigo_caso
    const [maxCode] = await db.query(`
      SELECT codigo_caso FROM Maestro_casosmedicos
      WHERE codigo_caso REGEXP '^CM-[0-9]+$'
      ORDER BY id DESC LIMIT 1
    `);
    let nextNum = 1;
    if (maxCode.length && maxCode[0].codigo_caso) {
      const match = maxCode[0].codigo_caso.match(/^CM-(\d+)$/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const nextCode = `CM-${String(nextNum).padStart(4, '0')}`;
    console.log('Siguiente código correlativo:', nextCode);

    // 3. Catálogos
    const [tiposCaso] = await db.query('SELECT id, nombre FROM Config_Tipo_Caso ORDER BY id');
    const [estados] = await db.query('SELECT id, nombre FROM Config_Estado_General ORDER BY id');
    const [prioridades] = await db.query('SELECT id, nombre FROM Config_Prioridad ORDER BY id');
    const [tiposEvento] = await db.query('SELECT id, nombre FROM Config_Tipo_Evento ORDER BY id');
    const [accidentesTransito] = await db.query('SELECT id, nombre FROM Config_Tipo_Accidente_Transito ORDER BY id');
    const [siNo] = await db.query('SELECT id, nombre, etiqueta FROM Config_Si_No ORDER BY id');

    console.log('Catálogos cargados correctamente:');
    console.log({
      tiposCaso: tiposCaso.length,
      estados: estados.length,
      prioridades: prioridades.length,
      tiposEvento: tiposEvento.length,
      accidentesTransito: accidentesTransito.length,
      siNo: siNo.length
    });

    // 4. Búsqueda diagnósticos
    const [diags] = await db.query('SELECT Cod, `Descripción` FROM Config_Diagnostico WHERE Cod LIKE ? OR `Descripción` LIKE ? LIMIT 5', ['%LUMBA%', '%LUMBA%']);
    console.log('Búsqueda de diagnósticos (ejemplo LUMBA):', diags);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
})();
