const pool = require('./db');
const { agruparOperacionesPorRegional } = require('./accesoInventario');

/**
 * Calcula el acceso (Regional/Operación permitidos) de un usuario para una Sección
 * del módulo de Facturación, según Maestro_Menu_Facturacion.
 * (1=general sin filtro, 2=por Regional, 3=por Dispositivo/Operación).
 */
async function computarAccesoFacturacion(usuarioId, seccionRequested = null) {
  if (!usuarioId) return null;

  const [uRows] = await pool.execute(
    'SELECT ID, Nombre, Rol, Regional, Dispositivo, `Operación` FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );
  if (!uRows.length) return null;

  const usuario = uRows[0];
  const rol = usuario.Rol || '';

  const [menuRows] = await pool.execute(
    'SELECT `Sección` as seccion, Acceso as acceso FROM Maestro_Menu_Facturacion WHERE Rol = ?',
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
    sinFiltro: false,
    operacionesFiltro: [],
    opsPorRegional: {},
  };

  menuRows.forEach(r => { acceso.seccionAcceso[r.seccion] = r.acceso; });

  let opRows = [];
  if (accesoCode === 1) {
    acceso.sinFiltro = true;
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
    const tieneDispositivo = acceso.dispositivo && acceso.dispositivo.trim() !== '';
    if (tieneDispositivo) {
      const dispositivos = acceso.dispositivo.split(',').map(d => d.trim()).filter(Boolean);
      if (dispositivos.length) {
        const ph = dispositivos.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE (SOCIODEMOGRAFICA IN (${ph}) OR MODALIDAD IN (${ph})) AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN`,
          [...dispositivos, ...dispositivos]
        );
        opRows = rows;
      }
    } else if (acceso.operacion) {
      const [rows] = await pool.execute(
        "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
        [acceso.operacion]
      );
      opRows = rows;
    }
  }

  acceso.opsPorRegional = agruparOperacionesPorRegional(opRows);
  acceso.operacionesFiltro = opRows.map(row => row['OPERACIÓN'] || row['Operación']).filter(Boolean);

  return acceso;
}

module.exports = { computarAccesoFacturacion };
