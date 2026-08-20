const ROLES_SIN_FILTRO = ['Sistema', 'AdmSst', 'LiderSst'];
const ROLES_REGIONAL = [];
const ROLES_DISPOSITIVO = ['AuxSst'];
const ROLES_MODALIDAD = ['AnaSst'];

async function obtenerPermisosRol(pool, rol) {
  if (!rol) return { doc_activo: [], doc_retirado: [], doc_general: [] };

  try {
    const [rows] = await pool.execute(
      'SELECT doc_activo, doc_retirado, doc_general FROM Config_Rol WHERE Rol = ?',
      [rol]
    );

    if (!rows.length) return { doc_activo: [], doc_retirado: [], doc_general: [] };

    const parseIds = (val) => {
      if (!val) return [];
      const raw = String(val).trim();
      if (raw.toLowerCase() === 'todo') return 'Todo';
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    };

    return {
      doc_activo: parseIds(rows[0].doc_activo),
      doc_retirado: parseIds(rows[0].doc_retirado),
      doc_general: parseIds(rows[0].doc_general),
    };
  } catch (err) {
    console.error('[cloud-docs] Error fetching role permissions:', err.message);
    return { doc_activo: [], doc_retirado: [], doc_general: [] };
  }
}

function agruparOperacionesPorRegional(opRows) {
  const map = {};

  opRows.forEach((row) => {
    const reg = row.REGIONAL || row.Regional;
    const op = row.OPERACIÓN || row.Operación;

    if (!reg || !op) return;

    if (!map[reg]) map[reg] = [];
    if (!map[reg].includes(op)) map[reg].push(op);
  });

  return map;
}

async function computarAccesoCloudDocs(pool, usuarioId) {
  if (!usuarioId) return null;

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
    usuarioEmail: usuario.Email || '',
    rol,
    regional: usuario.Regional || '',
    dispositivo: usuario.Dispositivo || '',
    operacion: usuario['Operación'] || '',
    sinFiltro: ROLES_SIN_FILTRO.includes(rol) || (usuario['Operación'] && ['administracion', 'administración'].includes(usuario['Operación'].toLowerCase().trim())),
    operacionesFiltro: [],
    opsPorRegional: {},
    permisos: await obtenerPermisosRol(pool, rol),
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

  acceso.opsPorRegional = agruparOperacionesPorRegional(opRows);
  acceso.operacionesFiltro = opRows
    .map((row) => row['OPERACIÓN'] || row['Operación'])
    .filter(Boolean);

  return acceso;
}

function construirFiltroRolTrabajador(permisos, tableAlias = 't') {
  const conds = [];

  if (permisos.doc_activo === 'Todo') {
    conds.push(`(${tableAlias}.Estado = 'Activo')`);
  } else if (Array.isArray(permisos.doc_activo) && permisos.doc_activo.length > 0) {
    const ph = permisos.doc_activo.map((id) => `'${id}'`).join(',');
    conds.push(`(${tableAlias}.Estado = 'Activo' AND ${tableAlias}.TipoDocumento IN (${ph}))`);
  }

  if (permisos.doc_retirado === 'Todo') {
    conds.push(`(${tableAlias}.Estado = 'Retirado')`);
  } else if (Array.isArray(permisos.doc_retirado) && permisos.doc_retirado.length > 0) {
    const ph = permisos.doc_retirado.map((id) => `'${id}'`).join(',');
    conds.push(`(${tableAlias}.Estado = 'Retirado' AND ${tableAlias}.TipoDocumento IN (${ph}))`);
  }

  if (conds.length === 0) return '0 = 1';
  return `(${conds.join(' OR ')})`;
}

function construirFiltroRolGeneral(permisos, tableAlias = 'e') {
  if (permisos.doc_general === 'Todo') {
    return '1 = 1';
  }

  if (Array.isArray(permisos.doc_general) && permisos.doc_general.length > 0) {
    const ph = permisos.doc_general.map((id) => `'${id}'`).join(',');
    return `${tableAlias}.TipoDocumento IN (${ph})`;
  }

  return '0 = 1';
}

module.exports = {
  obtenerPermisosRol,
  computarAccesoCloudDocs,
  agruparOperacionesPorRegional,
  construirFiltroRolTrabajador,
  construirFiltroRolGeneral,
};