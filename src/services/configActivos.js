const pool = require('./db');

// ── Permisos de la pestaña Activos (Config_Parametros nomina / Activos) ─────
// Quién ve la pestaña y qué operaciones lo define Maestro_Menu (nomina)
// (computarAccesoNomina). Aquí solo: quién ve y usa los botones de cada fila.
// Si una fila no existe se usa el valor por defecto de abajo.
const P = {
  TOMA_CARGO: 'Puede confirmar toma de cargo',
  RETIRAR:    'Puede retirar trabajador',
};

const ROLES_POR_DEFECTO = 'AuxiliarR, Auxiliar, Coordinador, CoordinadorR, Nomina, Sistema';
const DEFAULTS = { [P.TOMA_CARGO]: ROLES_POR_DEFECTO, [P.RETIRAR]: ROLES_POR_DEFECTO };

function normalizarTexto(valor) {
  return String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

async function obtenerPermisosActivos(rol) {
  let params = {};
  try {
    const [rows] = await pool.execute(
      "SELECT `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = 'nomina' AND `Seccion` = 'Activos' AND `Concepto` IN (?, ?)",
      [P.TOMA_CARGO, P.RETIRAR]
    );
    rows.forEach(r => { params[r.Concepto] = r.Parametro == null ? '' : String(r.Parametro); });
  } catch (err) {
    console.error('[configActivos] No se pudieron leer los permisos, se usan los valores por defecto:', err.message);
    params = {};
  }
  const buscado = normalizarTexto(rol);
  const tiene = concepto => {
    const valor = Object.prototype.hasOwnProperty.call(params, concepto) ? params[concepto] : DEFAULTS[concepto];
    return !!buscado && String(valor || '').split(',').map(normalizarTexto).filter(Boolean).includes(buscado);
  };
  return {
    puedeConfirmarTomaCargo: tiene(P.TOMA_CARGO),
    puedeRetirar:            tiene(P.RETIRAR),
  };
}

module.exports = { obtenerPermisosActivos, PARAMETROS_ACTIVOS: P };
