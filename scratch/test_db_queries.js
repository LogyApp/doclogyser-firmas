require('dotenv').config({ path: 'c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/.env' });
const pool = require('c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/src/services/db');

async function test() {
  const usuario = 'Luisa Palacio - 901';
  console.log(`Testing with user: ${usuario}`);

  try {
    // 1. Run computarAccesoCSST logic
    const [uRows] = await pool.execute(
      'SELECT ID, Nombre, Rol, Regional, Dispositivo, `Operación` FROM Maestro_Usuarios WHERE ID = ?',
      [usuario]
    );
    console.log('User rows from DB:', uRows);
    if (!uRows.length) {
      console.log('User not found in Maestro_Usuarios');
      process.exit(1);
    }

    const user = uRows[0];
    const rol = user.Rol || '';
    const ROLES_SIN_FILTRO = [
      'AdmSst', 'Archivo', 'Calidad', 'Contabilidad', 'Contratación', 'Control',
      'Cuentas', 'Facturación', 'Generalista', 'Juridica', 'Jurídica', 'Nomina', 'Nómina', 'LiderSst',
      'Selección', 'Selección Centro', 'Sistema', 'Administración', 'Administrador',
      'Dirección Hseq', 'Dirección Operaciones', 'Dirección RRHH', 'Gestor Nómina'
    ];
    const ROLES_REGIONAL = ['AuxiliarR', 'CoordinadorR'];
    const ROLES_DISPOSITIVO = ['AuxSst'];
    const ROLES_MODALIDAD = ['AnaSst'];

    const acceso = {
      usuarioId: user.ID,
      usuarioNombre: user.Nombre || user.ID,
      rol,
      regional: user.Regional || '',
      dispositivo: user.Dispositivo || '',
      operacion: user['Operación'] || '',
      sinFiltro: ROLES_SIN_FILTRO.includes(rol),
      operacionesFiltro: [],
      opsPorRegional: {},
    };

    let opRows = [];
    if (acceso.sinFiltro) {
      const [rows] = await pool.execute(
        "SELECT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY REGIONAL, OPERACIÓN"
      );
      opRows = rows;
    } else if (ROLES_REGIONAL.includes(rol)) {
      const [rows] = await pool.execute(
        "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
        [acceso.regional]
      );
      opRows = rows;
    } else if (ROLES_DISPOSITIVO.includes(rol)) {
      const [rows] = await pool.execute(
        "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE SOCIODEMOGRAFICA = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
        [acceso.dispositivo]
      );
      opRows = rows;
    } else if (ROLES_MODALIDAD.includes(rol)) {
      const [rows] = await pool.execute(
        "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE MODALIDAD = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
        [acceso.dispositivo]
      );
      opRows = rows;
    } else if (acceso.operacion) {
      const [rows] = await pool.execute(
        "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
        [acceso.operacion]
      );
      opRows = rows;
    }

    function agruparOperacionesPorRegional(rows) {
      const map = {};
      rows.forEach((row) => {
        const reg = row.REGIONAL || row.Regional || '';
        const op = row['OPERACIÓN'] || row['Operación'] || row.OPERACIÓN || row.Operacion;
        if (!reg || !op) return;
        if (!map[reg]) map[reg] = [];
        if (!map[reg].includes(op)) {
          map[reg].push(op);
        }
      });
      return map;
    }

    acceso.opsPorRegional = agruparOperacionesPorRegional(opRows);
    acceso.operacionesFiltro = opRows.map((row) => row['OPERACIÓN'] || row['Operación']).filter(Boolean);

    console.log('Access computed successfully:', acceso);

    // Run /api/compromisos
    console.log('Running /api/compromisos query...');
    const conds = [];
    const params = [];

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        console.log('No operations filter for user');
      } else {
        const ph = acceso.operacionesFiltro.map(() => '?').join(',');
        conds.push(`(v.Operación IN (${ph}) OR a.usuario = ?)`);
        params.push(...acceso.operacionesFiltro, usuario);
      }
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [rows2] = await pool.execute(
      `SELECT 
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
       ${where}
       ORDER BY a.fecha_registro DESC
       LIMIT 500`,
      params
    );
    console.log(`Success: Found ${rows2.length} rows for /api/compromisos`);

    // Run /api/conteos-filtros
    console.log('Running /api/conteos-filtros queries...');
    const regConds = [...conds];
    const regParams = [...params];
    const regWhere = regConds.length ? `WHERE ${regConds.join(' AND ')}` : '';

    const [regRows] = await pool.execute(
      `SELECT v.Regional, COUNT(*) AS total
       FROM Dynamic_compromisosst a
       JOIN \`Maestro_Vinculación\` v ON a.identificaciontrabajador = v.Identificación AND v.Estado = 'Activo'
       ${regWhere}
       GROUP BY v.Regional`,
      regParams
    );
    console.log('Success: Regional counts:', regRows);

  } catch (err) {
    console.error('ERROR RUNNING QUERIES:', err);
  } finally {
    await pool.end();
  }
}

test();
