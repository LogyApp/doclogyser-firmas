const pool = require('./db');

function agruparOperacionesPorRegional(rows) {
  const opsPorRegional = {};
  rows.forEach((row) => {
    const regional = row.REGIONAL || row.Regional || '';
    const operacion = row['OPERACIÓN'] || row['Operación'] || row.OPERACIÓN || row.Operacion;
    if (!regional || !operacion) return;
    if (!opsPorRegional[regional]) opsPorRegional[regional] = [];
    opsPorRegional[regional].push(operacion);
  });
  return opsPorRegional;
}

// Calcula el acceso (Regional/Operación/Categoría permitidos) de un usuario para una Sección
// del módulo de Inventario, según Maestro_Menu_Inventario. Compartido por inventario.js,
// dotacionley.js y cualquier otra pestaña del módulo que necesite el mismo modelo de acceso.
async function computarAccesoInventario(usuarioId, seccionRequested = null) {
  if (!usuarioId) return null;

  const [uRows] = await pool.execute(
    'SELECT ID, Nombre, Rol, Regional, Dispositivo, `Operación` FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );
  if (!uRows.length) return null;

  const usuario = uRows[0];
  const rol = usuario.Rol || '';

  // Obtener permisos de Maestro_Menu_Inventario para el Rol del usuario
  const [menuRows] = await pool.execute(
    'SELECT `Sección` as seccion, Acceso as acceso FROM Maestro_Menu_Inventario WHERE Rol = ?',
    [rol]
  );
  if (!menuRows.length) return null; // Sin accesos configurados

  const allowedSecciones = menuRows.map(r => r.seccion);

  // Si se pide una sección específica y el usuario no la tiene asignada, denegar acceso
  if (seccionRequested && !allowedSecciones.includes(seccionRequested)) {
    return null;
  }

  // Determinar el código de acceso activo (según la sección solicitada o la primera disponible)
  let activeAccesoCode = 1;
  if (seccionRequested) {
    const matched = menuRows.find(r => r.seccion === seccionRequested);
    if (matched) activeAccesoCode = matched.acceso;
  } else {
    activeAccesoCode = menuRows[0].acceso;
  }

  const acceso = {
    usuarioId: usuario.ID,
    usuarioNombre: usuario.Nombre || usuario.ID,
    rol,
    regional: usuario.Regional || '',
    dispositivo: usuario.Dispositivo || '',
    operacion: usuario['Operación'] || '',
    secciones: allowedSecciones,
    seccionAcceso: {},
    sinFiltro: false,
    operacionesFiltro: [],
    opsPorRegional: {},
    filtroCategorias: null // null es acceso a todas, de lo contrario restringido a ['EPP', 'DOTACION']
  };

  menuRows.forEach(r => {
    acceso.seccionAcceso[r.seccion] = r.acceso;
  });

  // Códigos 4, 5 y 6 restringen a categorías EPP y DOTACIÓN
  if ([4, 5, 6].includes(activeAccesoCode)) {
    acceso.filtroCategorias = ['EPP', 'DOTACIÓN', 'DOTACION'];
  }

  // Resolver el filtro de operaciones según el código de acceso (normalizado de 1 a 3)
  const codeBase = activeAccesoCode > 3 ? activeAccesoCode - 3 : activeAccesoCode;

  let opRows = [];
  if (codeBase === 1) {
    acceso.sinFiltro = true;
    const [rows] = await pool.execute(
      "SELECT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY REGIONAL, OPERACIÓN"
    );
    opRows = rows;
  } else if (codeBase === 2) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.regional]
    );
    opRows = rows;
  } else if (codeBase === 3) {
    const tieneDispositivo = acceso.dispositivo && acceso.dispositivo.trim() !== '';
    if (tieneDispositivo) {
      const [rows] = await pool.execute(
        "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE (SOCIODEMOGRAFICA = ? OR MODALIDAD = ?) AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
        [acceso.dispositivo, acceso.dispositivo]
      );
      opRows = rows;
    } else if (acceso.operacion) {
      const [rows] = await pool.execute(
        "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
        [acceso.operacion]
      );
      opRows = rows;
    }
  }

  acceso.opsPorRegional = agruparOperacionesPorRegional(opRows);
  acceso.operacionesFiltro = opRows.map((row) => row['OPERACIÓN'] || row['Operación']).filter(Boolean);

  return acceso;
}

module.exports = { computarAccesoInventario, agruparOperacionesPorRegional };
