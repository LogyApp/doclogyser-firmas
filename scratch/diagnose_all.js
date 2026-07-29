require('dotenv').config();
const pool = require('../src/services/db.js');

async function runDiagnosis() {
  console.log('--- Database Queries Diagnostic ---');
  const testUserId = 'Luisa Palacio - 901'; // Common test user in the DB

  // 1. Diagnostic for compromisosst
  try {
    console.log('[compromisosst] Testing list query...');
    const [rows] = await pool.execute(`
      SELECT 
        a.idcsst,
        a.fecha_registro,
        a.identificaciontrabajador,
        a.usuario,
        a.estado,
        a.url_doc,
        a.token_trabajador,
        v.Trabajador AS nombre_trabajador,
        v.Cargo AS cargo,
        v.Regional AS regional,
        v.Operación AS operacion,
        seg.Email AS email_trabajador,
        seg.Celular AS celular_trabajador
      FROM Dynamic_compromisosst a
      LEFT JOIN \`Maestro_Vinculación\` v ON a.identificaciontrabajador = v.Identificación AND v.Estado = 'Activo'
      LEFT JOIN \`Maestro_Segmentación\` seg ON a.identificaciontrabajador = seg.Identificación
      ORDER BY a.fecha_registro DESC
      LIMIT 10
    `);
    console.log('[compromisosst] List query ok, found:', rows.length);
  } catch (err) {
    console.error('[compromisosst] List query failed:', err.message);
  }

  // 2. Diagnostic for evaluacionsst
  try {
    console.log('[evaluacionsst] Testing list query...');
    const [rows] = await pool.execute(`
      SELECT ev.*, vin.Trabajador AS nombre_trabajador, vin.Cargo, vin.Regional, vin.Operación AS operacion,
             seg.Email AS email_trabajador, seg.Celular AS celular_trabajador,
             usu.Nombre AS nombre_evaluador
      FROM Maestro_evaluacionsst ev
      LEFT JOIN (
        SELECT t1.Identificación, t1.Trabajador, t1.Cargo, t1.Regional, t1.\`Operación\`
        FROM Maestro_Vinculación t1
        INNER JOIN (
          SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS MaxFecha
          FROM Maestro_Vinculación
          GROUP BY Identificación
        ) t2 ON t1.Identificación = t2.Identificación AND t1.\`Fecha de Ingreso\` = t2.MaxFecha
      ) vin ON ev.identificacion = vin.Identificación
      LEFT JOIN Maestro_Segmentación seg ON ev.identificacion = seg.Identificación
      LEFT JOIN Maestro_Usuarios usu ON ev.usuario = usu.ID
      ORDER BY ev.fecha_registro DESC
      LIMIT 10
    `);
    console.log('[evaluacionsst] List query ok, found:', rows.length);
  } catch (err) {
    console.error('[evaluacionsst] List query failed:', err.message);
  }

  // 3. Diagnostic for capacitacionsst
  try {
    console.log('[capacitacionsst] Testing list query...');
    const [rows] = await pool.execute(`
      SELECT c.*, vin.Trabajador AS nombre_trabajador, vin.Cargo, vin.Regional, vin.Operación AS operacion,
             seg.Email AS email_trabajador, seg.Celular AS celular_trabajador,
             usu.Nombre AS nombre_evaluador
      FROM Maestro_capacitacionsst c
      LEFT JOIN (
        SELECT t1.Identificación, t1.Trabajador, t1.Cargo, t1.Regional, t1.\`Operación\`
        FROM Maestro_Vinculación t1
        INNER JOIN (
          SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS MaxFecha
          FROM Maestro_Vinculación
          GROUP BY Identificación
        ) t2 ON t1.Identificación = t2.Identificación AND t1.\`Fecha de Ingreso\` = t2.MaxFecha
      ) vin ON c.identificacion = vin.Identificación
      LEFT JOIN Maestro_Segmentación seg ON c.identificacion = seg.Identificación
      LEFT JOIN Maestro_Usuarios usu ON c.usuario = usu.ID
      ORDER BY c.fecha_registro DESC
      LIMIT 10
    `);
    console.log('[capacitacionsst] List query ok, found:', rows.length);
  } catch (err) {
    console.error('[capacitacionsst] List query failed:', err.message);
  }

  // 4. Diagnostic for pruebaconsumo
  try {
    console.log('[pruebaconsumo] Testing list query...');
    const [rows] = await pool.execute(`
      SELECT 
        a.idprueba,
        a.fecha,
        a.identificacion,
        a.nombre_trabajador,
        a.cargo,
        a.ciudad,
        a.cliente,
        a.url_doc,
        a.usuario,
        a.fecha_registro,
        a.token_firma,
        seg.Celular AS celular_trabajador
       FROM Dynamic_pruebaconsumo a
       LEFT JOIN \`Maestro_Vinculación\` v ON a.identificacion = v.Identificación AND v.Estado = 'Activo'
       LEFT JOIN \`Maestro_Segmentación\` seg ON a.identificacion = seg.Identificación
       ORDER BY a.fecha_registro DESC
       LIMIT 10
    `);
    console.log('[pruebaconsumo] List query ok, found:', rows.length);
  } catch (err) {
    console.error('[pruebaconsumo] List query failed:', err.message);
  }

  // 5. Diagnostic for participacion
  try {
    console.log('[participacion] Testing list query...');
    const [rows] = await pool.execute(`
      SELECT 
        a.id_asistencia,
        a.tema,
        a.fecha,
        a.lugar,
        a.url_doc,
        a.usuario,
        a.fecha_registro,
        v.Trabajador AS nombre_responsable,
        v.Regional AS regional,
        v.Operación AS operacion
      FROM Dynamic_formato_asistencia a
      LEFT JOIN \`Maestro_Vinculación\` v ON a.responsable = v.\`Id Vinculación\`
      ORDER BY a.fecha_registro DESC
      LIMIT 10
    `);
    console.log('[participacion] List query ok, found:', rows.length);
  } catch (err) {
    console.error('[participacion] List query failed:', err.message);
  }

  console.log('--- Diagnostic Finished ---');
  process.exit(0);
}

runDiagnosis();
