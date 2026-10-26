const pool = require('./db');
const { normalizar } = require('./maestroMenu');

// Permisos de acciones de la pestaña Nómina · Producción (Config_Parametros, nomina / Produccion).
// Quién ve la pestaña y cada subpestaña lo decide Maestro_Menu (Produccion, Produccion_Areas,
// Produccion_Tarifas). Si una fila no existe se usa el valor por defecto.
const MODULO = 'nomina';
const SECCION = 'Produccion';

const P = {
  ELIMINAR_AREAS: 'Roles que pueden eliminar áreas de producción',
  EDITAR_TARIFAS: 'Roles que pueden agregar y editar valor fijo nómina',
  ELIMINAR_TARIFAS: 'Roles que pueden eliminar valor fijo nómina',
};
const DEFAULTS = {
  [P.ELIMINAR_AREAS]: 'Sistema',
  [P.EDITAR_TARIFAS]: 'Nomina, Sistema',
  [P.ELIMINAR_TARIFAS]: 'Sistema',
};

function enLista(texto, rol) {
  const buscado = normalizar(rol);
  return !!buscado && String(texto || '').split(',').some(r => normalizar(r) === buscado);
}

async function obtenerPermisosProduccion(rol) {
  const valores = { ...DEFAULTS };
  try {
    const [rows] = await pool.execute(
      'SELECT `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ?',
      [MODULO, SECCION]
    );
    rows.forEach(r => {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, r.Concepto)) valores[r.Concepto] = r.Parametro == null ? '' : String(r.Parametro);
    });
  } catch (err) {
    console.error('[configProduccion] No se pudieron leer los parámetros, se usan los valores por defecto:', err.message);
  }
  return {
    puedeEliminarAreas: enLista(valores[P.ELIMINAR_AREAS], rol),
    puedeEditarTarifas: enLista(valores[P.EDITAR_TARIFAS], rol),
    puedeEliminarTarifas: enLista(valores[P.ELIMINAR_TARIFAS], rol),
  };
}

module.exports = { obtenerPermisosProduccion, PARAMETROS_PRODUCCION: P };
