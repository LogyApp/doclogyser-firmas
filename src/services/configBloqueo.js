const pool = require('./db');

// ── Parámetros de Bloqueo de Datos (Config_Parametros) ──────────────────────
// Nómina (Asistencia):    Modulo 'nomina',      Seccion 'Bloqueo_datos'
// Facturación (Servicios): Modulo 'facturacion', Seccion 'Bloqueo_datos'
// Si una fila no existe se usa el valor por defecto de abajo.
const SECCION = 'Bloqueo_datos';

const CONFIG_POR_MODULO = {
  Nomina: {
    modulo: 'nomina',
    conceptos: {
      bloquear:    'Puede bloquear Asistencia',
      desbloquear: 'Puede desbloquear Asistencia',
    },
    defaults: {
      'Puede bloquear Asistencia':    'Nomina, Sistema',
      'Puede desbloquear Asistencia': 'Nomina, Sistema',
    },
  },
  Facturacion: {
    modulo: 'facturacion',
    conceptos: {
      bloquear:    'Puede bloquear Servicios',
      desbloquear: 'Puede desbloquear Servicios',
      formasPago:  'Formas de pago permitidas en el bloqueo',
    },
    defaults: {
      'Puede bloquear Servicios':                'Facturación, Sistema',
      'Puede desbloquear Servicios':             'Facturación, Sistema',
      'Formas de pago permitidas en el bloqueo': '1, 2, 3',
    },
  },
};

function normalizarTexto(valor) {
  return String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

async function obtenerParametros(modulo) {
  try {
    const [rows] = await pool.execute(
      'SELECT `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ?',
      [modulo, SECCION]
    );
    const mapa = {};
    rows.forEach(r => { mapa[r.Concepto] = r.Parametro == null ? '' : String(r.Parametro); });
    return mapa;
  } catch (err) {
    console.error('[configBloqueo] No se pudieron leer los parámetros, se usan los valores por defecto:', err.message);
    return {};
  }
}

function lista(params, defaults, concepto) {
  const valor = Object.prototype.hasOwnProperty.call(params, concepto) ? params[concepto] : defaults[concepto];
  return String(valor || '').split(',').map(s => s.trim()).filter(Boolean);
}

// Permisos del rol para el módulo ('Nomina' | 'Facturacion').
async function obtenerPermisosBloqueo(moduloBloqueo, rol) {
  const cfg = CONFIG_POR_MODULO[moduloBloqueo];
  if (!cfg) return { puedeBloquear: false, puedeDesbloquear: false, formasPago: [] };
  const params = await obtenerParametros(cfg.modulo);
  const tieneRol = concepto => {
    const buscado = normalizarTexto(rol);
    return !!buscado && lista(params, cfg.defaults, concepto).some(r => normalizarTexto(r) === buscado);
  };
  const formasPago = cfg.conceptos.formasPago
    ? lista(params, cfg.defaults, cfg.conceptos.formasPago).map(n => parseInt(n, 10)).filter(n => [1, 2, 3].includes(n))
    : [];
  return {
    puedeBloquear:    tieneRol(cfg.conceptos.bloquear),
    puedeDesbloquear: tieneRol(cfg.conceptos.desbloquear),
    formasPago,
  };
}

// ── Clientes Crédito (facturacion / Clientes_credito) ───────────────────────
// Quién puede agregar, editar, eliminar y marcar/desmarcar el Bloqueo de los
// clientes crédito. Quién ve la pestaña lo define Maestro_Menu_Facturacion.
const CONCEPTO_GESTION_CLIENTES = 'Puede gestionar Clientes Crédito';
const DEFAULT_GESTION_CLIENTES = 'Facturación, Sistema';

async function puedeGestionarClientesCredito(rol) {
  const buscado = normalizarTexto(rol);
  if (!buscado) return false;
  let valor = DEFAULT_GESTION_CLIENTES;
  try {
    const [rows] = await pool.execute(
      "SELECT `Parametro` FROM `Config_Parametros` WHERE `Modulo` = 'facturacion' AND `Seccion` = 'Clientes_credito' AND `Concepto` = ? LIMIT 1",
      [CONCEPTO_GESTION_CLIENTES]
    );
    if (rows.length) valor = rows[0].Parametro == null ? '' : String(rows[0].Parametro);
  } catch (err) {
    console.error('[configBloqueo] No se pudo leer el permiso de Clientes Crédito, se usa el valor por defecto:', err.message);
  }
  return valor.split(',').map(r => normalizarTexto(r)).filter(Boolean).includes(buscado);
}

module.exports = { obtenerPermisosBloqueo, puedeGestionarClientesCredito, CONFIG_BLOQUEO: CONFIG_POR_MODULO };
