const pool = require('./db');
const { agruparOperacionesPorRegional } = require('./accesoInventario');
const { seccionesDelRol } = require('./maestroMenu');

// Ver una pestaña lo decide Maestro_Menu; crear, eliminar y gestionar plantillas lo decide
// Config_Parametros (sst / pestaña) vía configSst.js.

function normalizarSeccionSst(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

async function consultarOperacionesPorCodigoAcceso(accesoCode, usuario) {
  const code = Number(accesoCode) || 1;
  const regional = usuario.Regional || '';
  const dispositivo = usuario.Dispositivo || '';
  const operacion = usuario['Operación'] || '';

  let opRows = [];
  if (code === 1) {
    const [rows] = await pool.execute(
      "SELECT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY REGIONAL, OPERACIÓN"
    );
    opRows = rows;
  } else if (code === 2) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [regional]
    );
    opRows = rows;
  } else if (code === 3) {
    const tieneDispositivo = dispositivo && dispositivo.trim() !== '';
    if (tieneDispositivo) {
      const dispositivos = dispositivo.split(',').map(d => d.trim()).filter(Boolean);
      if (dispositivos.length) {
        const ph = dispositivos.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE (SOCIODEMOGRAFICA IN (${ph}) OR MODALIDAD IN (${ph})) AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN`,
          [...dispositivos, ...dispositivos]
        );
        opRows = rows;
      }
    }
    if (!opRows.length && operacion) {
      const [rows] = await pool.execute(
        "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
        [operacion]
      );
      opRows = rows;
    }
  } else if (code === 4 || code === 6) {
    const tieneDispositivo = dispositivo && dispositivo.trim() !== '';
    if (tieneDispositivo) {
      const dispositivos = dispositivo.split(',').map(d => d.trim()).filter(Boolean);
      if (dispositivos.length) {
        const ph = dispositivos.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE MODALIDAD IN (${ph}) AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN`,
          dispositivos
        );
        opRows = rows;
      }
    } else if (operacion) {
      const [rows] = await pool.execute(
        "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
        [operacion]
      );
      opRows = rows;
    }
  } else if (operacion) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [operacion]
    );
    opRows = rows;
  }

  const opsPorRegional = agruparOperacionesPorRegional(opRows);
  const operacionesFiltro = opRows.map(row => row['OPERACIÓN'] || row['Operación']).filter(Boolean);

  return {
    sinFiltro: code === 1,
    opsPorRegional,
    operacionesFiltro,
    regionalesFiltro: Object.keys(opsPorRegional),
  };
}

/**
 * Calcula el acceso (Regional/Operación permitidos) de un usuario para una Sección
 * del módulo SST (Evaluación SST, Capacitación SST, Prueba de Consumo,
 * Participación, Compromiso SST, Casos Medicos, Inspecciones_vehiculos),
 * gobernado exclusivamente por Maestro_Menu (Modulo 'sst'; mismo modelo que Nómina).
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

  // Permisos del Rol en Maestro_Menu (secciones en el orden del menú)
  const menuRows = await seccionesDelRol('sst', rol);
  if (!menuRows.length) return null; // Sin accesos configurados en Maestro_Menu

  const allowedSecciones = menuRows.map(r => r.seccion).filter(Boolean);

  let matchedRow = null;
  if (seccionRequested) {
    const reqNorm = normalizarSeccionSst(seccionRequested);
    matchedRow = menuRows.find(r => normalizarSeccionSst(r.seccion) === reqNorm);
    if (!matchedRow) {
      return null;
    }
  } else {
    matchedRow = menuRows[0];
  }

  const accesoCode = Number(matchedRow.acceso) || 1;
  const cachePorCodigo = {};
  cachePorCodigo[accesoCode] = await consultarOperacionesPorAccesoSafe(accesoCode, usuario);

  const seccionAcceso = {};
  const alcancePorSeccion = {};
  for (const r of menuRows) {
    if (!r.seccion) continue;
    const c = Number(r.acceso) || 1;
    seccionAcceso[r.seccion] = c;
    if (!cachePorCodigo[c]) {
      cachePorCodigo[c] = await consultarOperacionesPorAccesoSafe(c, usuario);
    }
    alcancePorSeccion[r.seccion] = cachePorCodigo[c];
  }

  const principal = cachePorCodigo[accesoCode];

  return {
    usuarioId: usuario.ID,
    usuarioNombre: usuario.Nombre || usuario.ID,
    rol,
    regional: usuario.Regional || '',
    dispositivo: usuario.Dispositivo || '',
    operacion: usuario['Operación'] || '',
    secciones: allowedSecciones,
    seccionAcceso,
    alcancePorSeccion,
    sinFiltro: principal.sinFiltro,
    operacionesFiltro: principal.operacionesFiltro,
    opsPorRegional: principal.opsPorRegional,
  };
}

async function consultarOperacionesPorAccesoSafe(accesoCode, usuario) {
  return consultarOperacionesPorCodigoAcceso(accesoCode, usuario);
}

module.exports = { computarAccesoSst, normalizarSeccionSst };
