// Vista personal de una tabla (Maestro_Preferencias_Tabla): qué columnas ve cada usuario, en qué orden, con qué
// etiqueta y ancho. Cada pantalla define su catálogo de columnas; aquí solo se guarda y se valida contra él, para
// que nadie pueda pedir columnas que no existen. Sin fila, la pantalla usa su vista predeterminada.
const pool = require('./db');

const MAX_ETIQUETA = 60;
const ANCHO_MIN = 50;
const ANCHO_MAX = 800;

function leerJson(valor) {
  if (!valor) return null;
  if (typeof valor === 'object') return valor;
  try { return JSON.parse(valor); } catch (e) { return null; }
}

// Deja solo claves del catálogo (sin repetir), etiqueta recortada y ancho dentro de los límites.
function limpiarColumnas(columnas, catalogo) {
  if (!Array.isArray(columnas)) return [];
  const claves = new Set(catalogo.map(c => c.clave));
  const vistas = new Set();
  const out = [];
  for (const c of columnas) {
    if (!c || !claves.has(c.clave) || vistas.has(c.clave)) continue;
    vistas.add(c.clave);
    const ancho = parseInt(c.ancho, 10);
    out.push({
      clave: c.clave,
      etiqueta: String(c.etiqueta || '').trim().slice(0, MAX_ETIQUETA),
      ancho: Number.isFinite(ancho) ? Math.min(Math.max(ancho, ANCHO_MIN), ANCHO_MAX) : null,
      visible: c.visible !== false
    });
  }
  return out;
}

async function obtener(usuario, vista, catalogo) {
  const [[fila]] = await pool.query(
    'SELECT Columnas FROM Maestro_Preferencias_Tabla WHERE Usuario = ? AND Vista = ? LIMIT 1',
    [usuario, vista]
  );
  if (!fila) return null;
  const columnas = limpiarColumnas(leerJson(fila.Columnas), catalogo);
  return columnas.length ? columnas : null;
}

async function guardar(usuario, vista, columnas, catalogo) {
  const limpias = limpiarColumnas(columnas, catalogo);
  if (!limpias.some(c => c.visible)) throw new Error('Debe quedar al menos una columna visible.');
  await pool.query(
    `INSERT INTO Maestro_Preferencias_Tabla (Usuario, Vista, Columnas) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE Columnas = VALUES(Columnas)`,
    [usuario, vista, JSON.stringify(limpias)]
  );
  return limpias;
}

// Volver a la vista predeterminada: se borra solo la fila de ese usuario y esa vista.
async function restaurar(usuario, vista) {
  await pool.query('DELETE FROM Maestro_Preferencias_Tabla WHERE Usuario = ? AND Vista = ?', [usuario, vista]);
}

module.exports = { obtener, guardar, restaurar };
