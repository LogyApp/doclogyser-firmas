const pool = require('./db');
const { agruparOperacionesPorRegional } = require('./accesoInventario');
const { seccionesDelRol, normalizar } = require('./maestroMenu');

/**
 * Calcula el acceso (Regional/Operación permitidos y Secciones autorizadas)
 * de un usuario para el módulo TalentHub, según Maestro_Menu (Modulo 'talenthub').
 * 1 = Acceso nacional sin filtro
 * 2 = Filtrado por Regional
 * 3 = Filtrado por Operación / Dispositivo
 */
// Caché corta: cada pestaña llama varias veces por carga (catálogos, listado, conteos).
// Un cambio de rol o de Maestro_Menu se refleja a más tardar en ACCESO_TTL_MS.
const ACCESO_TTL_MS = 60 * 1000;
const cacheAcceso = new Map();   // `${usuario}|${seccion}` → { t, valor }

async function computarAccesoTalenthub(usuarioId, seccionRequested = null) {
  if (!usuarioId) return null;
  const clave = `${usuarioId}|${seccionRequested || ''}`;
  const enCache = cacheAcceso.get(clave);
  if (enCache && Date.now() - enCache.t < ACCESO_TTL_MS) {
    return enCache.valor ? structuredClone(enCache.valor) : null;
  }
  const valor = await calcularAccesoTalenthub(usuarioId, seccionRequested);
  if (cacheAcceso.size > 500) cacheAcceso.clear();
  cacheAcceso.set(clave, { t: Date.now(), valor });
  return valor ? structuredClone(valor) : null;
}

async function calcularAccesoTalenthub(usuarioId, seccionRequested = null) {

  const [uRows] = await pool.execute(
    'SELECT ID, Nombre, Colaborador, Rol, Cargo, Regional, Dispositivo, `Operación` FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );
  if (!uRows.length) return null;

  const usuario = uRows[0];
  const rol = usuario.Rol || '';

  // Permisos del Rol en Maestro_Menu (secciones en el orden del menú)
  const menuRows = await seccionesDelRol('talenthub', rol);
  if (!menuRows.length) return null; // Sin accesos en TalentHub

  const allowedSecciones = menuRows.map(r => r.seccion);

  const matched = seccionRequested
    ? menuRows.find(r => normalizar(r.seccion) === normalizar(seccionRequested))
    : null;
  if (seccionRequested && !matched) {
    return null;
  }

  // Código de acceso activo (el de la sección solicitada o el de la primera del menú)
  const accesoCode = matched ? matched.acceso : menuRows[0].acceso;

  const acceso = {
    usuarioId: usuario.ID,
    usuarioNombre: usuario.Nombre || usuario.ID,
    colaborador: usuario.Colaborador || usuario.Nombre || usuario.ID,
    rol,
    cargo: usuario.Cargo || '',
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

module.exports = { computarAccesoTalenthub };
