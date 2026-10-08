const pool = require('./db');
const { agruparOperacionesPorRegional } = require('./accesoInventario');

// Roles que, además de poder VER Evaluación/Capacitación/Prueba de Consumo/
// Compromiso SST (gobernado por Maestro_Menu_Sst), también pueden crear,
// responder, editar, eliminar, reenviar firma o gestionar plantillas. Los
// demás roles con fila en Maestro_Menu_Sst (Jurídica, Dirección Hseq/
// Operaciones/RRHH, Administración, Administrador, Generalista, Calidad)
// quedan en solo-lectura por decisión explícita, no por descuido.
const ROLES_ESCRITURA_SST = ['AdmSst', 'AnaSst', 'AuxSst', 'LiderSst', 'Sistema'];

/**
 * Calcula el acceso (Regional/Operación permitidos) de un usuario para una Sección
 * de los módulos de datos de SST (Evaluación SST, Capacitación SST, Prueba de
 * Consumo, Compromiso SST), según Maestro_Menu_Sst.
 * Acceso: 1=sin filtro, 2=por Regional, 3=por Dispositivo (Sociodemográfica),
 * 4=por Modalidad. Mismo modelo que accesoNomina.js/accesoFacturacion.js,
 * extendido con el código 4 que ya usaban estos módulos para el rol AnaSst.
 */
async function computarAccesoSst(usuarioId, seccionRequested = null) {
  if (!usuarioId) return null;

  const [uRows] = await pool.execute(
    'SELECT ID, Nombre, Rol, Regional, Dispositivo, `Operación` FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );
  if (!uRows.length) return null;

  const usuario = uRows[0];
  const rol = usuario.Rol || '';

  const [menuRows] = await pool.execute(
    'SELECT `Sección` as seccion, Acceso as acceso FROM Maestro_Menu_Sst WHERE Rol = ?',
    [rol]
  );
  if (!menuRows.length) return null; // Sin accesos configurados

  const allowedSecciones = menuRows.map(r => r.seccion);

  if (seccionRequested && !allowedSecciones.includes(seccionRequested)) {
    return null;
  }

  let accesoCode = 1;
  if (seccionRequested) {
    const matched = menuRows.find(r => r.seccion === seccionRequested);
    if (matched) accesoCode = matched.acceso;
  } else {
    accesoCode = menuRows[0].acceso;
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
    sinFiltro: accesoCode === 1,
    operacionesFiltro: [],
    opsPorRegional: {},
  };

  menuRows.forEach(r => { acceso.seccionAcceso[r.seccion] = r.acceso; });

  let opRows = [];
  if (accesoCode === 1) {
    const [rows] = await pool.execute(
      "SELECT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY REGIONAL, OPERACIÓN"
    );
    opRows = rows;
  } else if (accesoCode === 2) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.regional]
    );
    opRows = rows;
  } else if (accesoCode === 3) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE SOCIODEMOGRAFICA = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.dispositivo]
    );
    opRows = rows;
  } else if (accesoCode === 4) {
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
  acceso.operacionesFiltro = opRows.map(row => row['OPERACIÓN'] || row['Operación']).filter(Boolean);

  return acceso;
}

module.exports = { computarAccesoSst, ROLES_ESCRITURA_SST };
