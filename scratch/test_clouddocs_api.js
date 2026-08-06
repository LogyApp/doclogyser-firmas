require('dotenv').config();
const pool = require('../src/services/db');

// Directly test access function from the new module logic
const ROLES_SIN_FILTRO = ['Sistema', 'AdmSst', 'LiderSst'];
const ROLES_REGIONAL = [];
const ROLES_DISPOSITIVO = ['AuxSst'];
const ROLES_MODALIDAD = ['AnaSst'];

async function obtenerPermisosRol(rol) {
  if (!rol) return { doc_activo: [], doc_retirado: [], doc_general: [] };
  const [rows] = await pool.execute('SELECT doc_activo, doc_retirado, doc_general FROM Config_Rol WHERE Rol = ?', [rol]);
  if (!rows.length) return { doc_activo: [], doc_retirado: [], doc_general: [] };
  const parseIds = (val) => {
    if (!val) return [];
    if (val.trim().toLowerCase() === 'todo') return 'Todo';
    return val.split(',').map(s => s.trim()).filter(Boolean);
  };
  return {
    doc_activo: parseIds(rows[0].doc_activo),
    doc_retirado: parseIds(rows[0].doc_retirado),
    doc_general: parseIds(rows[0].doc_general)
  };
}

async function computarAccesoCloudDocs(usuarioId) {
  const [uRows] = await pool.execute(
    'SELECT ID, Nombre, Rol, Regional, Dispositivo, `Operación`, Email FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );
  if (!uRows.length) return null;
  const usuario = uRows[0];
  const rol = usuario.Rol || '';
  const acceso = {
    usuarioId: usuario.ID,
    usuarioNombre: usuario.Nombre || usuario.ID,
    rol,
    regional: usuario.Regional || '',
    dispositivo: usuario.Dispositivo || '',
    operacion: usuario['Operación'] || '',
    sinFiltro: ROLES_SIN_FILTRO.includes(rol),
    operacionesFiltro: [],
    opsPorRegional: {},
    permisos: await obtenerPermisosRol(rol)
  };

  let opRows = [];
  if (acceso.sinFiltro) {
    const [rows] = await pool.execute(
      "SELECT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY REGIONAL, OPERACIÓN"
    );
    opRows = rows;
  } else if (acceso.operacion) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.operacion]
    );
    opRows = rows;
  }
  
  acceso.opsPorRegional = {};
  opRows.forEach((row) => {
    const reg = row.REGIONAL || row.Regional;
    const op = row.OPERACIÓN || row.Operación;
    if (reg && op) {
      if (!acceso.opsPorRegional[reg]) acceso.opsPorRegional[reg] = [];
      acceso.opsPorRegional[reg].push(op);
    }
  });
  acceso.operacionesFiltro = opRows.map((row) => row['OPERACIÓN'] || row['Operación']).filter(Boolean);
  return acceso;
}

function construirFiltroRolTrabajador(permisos, tableAlias = 't') {
  const conds = [];
  if (permisos.doc_activo === 'Todo') {
    conds.push(`(${tableAlias}.Estado = 'Activo')`);
  } else if (Array.isArray(permisos.doc_activo) && permisos.doc_activo.length > 0) {
    const ph = permisos.doc_activo.map(id => `'${id}'`).join(',');
    conds.push(`(${tableAlias}.Estado = 'Activo' AND ${tableAlias}.TipoDocumento IN (${ph}))`);
  }
  if (permisos.doc_retirado === 'Todo') {
    conds.push(`(${tableAlias}.Estado = 'Retirado')`);
  } else if (Array.isArray(permisos.doc_retirado) && permisos.doc_retirado.length > 0) {
    const ph = permisos.doc_retirado.map(id => `'${id}'`).join(',');
    conds.push(`(${tableAlias}.Estado = 'Retirado' AND ${tableAlias}.TipoDocumento IN (${ph}))`);
  }
  if (conds.length === 0) return '0 = 1';
  return `(${conds.join(' OR ')})`;
}

async function test() {
  try {
    console.log('1. Getting a sample user...');
    const [users] = await pool.execute('SELECT ID, Rol, Nombre FROM Maestro_Usuarios WHERE Rol IS NOT NULL LIMIT 3');
    console.log('Sample users:', users);

    if (users.length > 0) {
      const user = users[0];
      console.log(`\n2. Computing access for user: ${user.ID} (${user.Rol})...`);
      const acceso = await computarAccesoCloudDocs(user.ID);
      console.log('Access configuration:', JSON.stringify(acceso, null, 2));

      if (acceso) {
        console.log('\n3. Testing Trabajadores Query for this user...');
        const roleFilter = construirFiltroRolTrabajador(acceso.permisos, 't');
        const sql = `
          SELECT 
            s.Identificación AS identificacion,
            s.Trabajador AS trabajador,
            mv.Operación AS operacion,
            mv.Estado AS estado,
            DATE_FORMAT(mv.max_fecha_ingreso, '%Y-%m-%d') AS fechaIngreso,
            COALESCE(d.doc_count, 0) AS documentosCount
          FROM Maestro_Segmentación s
          JOIN (
            SELECT v1.Identificación, v1.Regional, v1.Operación, v1.Estado, v1.\`Fecha de Ingreso\` AS max_fecha_ingreso
            FROM Maestro_Vinculación v1
            INNER JOIN (
              SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS max_fecha
              FROM Maestro_Vinculación
              GROUP BY Identificación
            ) v2 ON v1.Identificación = v2.Identificación AND v1.\`Fecha de Ingreso\` = v2.max_fecha
          ) mv ON s.Identificación = mv.Identificación
          LEFT JOIN (
            SELECT Identificación, COUNT(*) AS doc_count
            FROM Maestro_docTrabajador t
            WHERE ${roleFilter}
            GROUP BY Identificación
          ) d ON s.Identificación = d.Identificación
          ORDER BY s.Trabajador ASC
          LIMIT 3
        `;
        const [workers] = await pool.execute(sql);
        console.log('Workers sample query results:', workers);
      }
    }

    console.log('\n4. Testing combined TODO query syntax (UNION ALL)...');
    const sqlTodo = `
      SELECT * FROM (
        SELECT 
          'Trabajador' AS tipo_registro,
          t.id,
          t.TipoDocumento,
          t.Prefijo,
          c.Documento,
          t.Identificación AS Identificacion,
          v.Trabajador AS TrabajadorNombre,
          t.Operación,
          t.Estado,
          DATE_FORMAT(t.Fecha_Ingreso, '%Y-%m-%d') AS FechaIngreso,
          DATE_FORMAT(t.FechaRegistro, '%Y-%m-%d %H:%i:%s') AS FechaRegistro,
          t.Usuario,
          t.Observaciones,
          t.Url,
          t.Solicitud,
          t.Justificacion_Solicitud
        FROM Maestro_docTrabajador t
        LEFT JOIN Config_Doc_Trabajador c ON t.TipoDocumento = CAST(c.Id AS CHAR)
        LEFT JOIN Maestro_Segmentación v ON t.Identificación = v.Identificación
        LIMIT 5
      ) combined
    `;
    const [todoRows] = await pool.execute(sqlTodo);
    console.log('Combined Todo syntax check successful. Rows:', todoRows.length);
    console.log(todoRows);

    console.log('\nVerification tests completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

test();
