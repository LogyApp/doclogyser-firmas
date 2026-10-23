const pool = require('./db');

// ── Parámetros configurables del módulo Facturación (Config_Parametros) ──────
// Modulo = 'facturacion', Seccion = 'Servicios'.
// Si una fila no existe aún en Config_Parametros se usa el valor por defecto,
// garantizando que el módulo funcione incluso antes de ejecutar la migración SQL.
const MODULO = 'facturacion';
const SECCION_SERVICIOS = 'Servicios';

const P = {
  ROLES_CARGA_MASIVA:    'Roles que pueden usar carga masiva de servicios',
  LIMITE_SERVICIOS:      'Límite máximo de servicios por carga',
};

const DEFAULTS = {
  [P.ROLES_CARGA_MASIVA]: 'Sistema, Facturación, AuxiliarR, CoordinadorR',
  [P.LIMITE_SERVICIOS]:   '500',
};

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function lista(texto) {
  return String(texto || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function enLista(texto, buscado) {
  if (!String(buscado || '').trim()) return false;
  const b = normalizarTexto(buscado);
  return lista(texto).some(x => normalizarTexto(x) === b);
}

async function obtenerParametrosServicios() {
  try {
    const [rows] = await pool.execute(
      'SELECT `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ?',
      [MODULO, SECCION_SERVICIOS]
    );
    const mapa = {};
    rows.forEach(r => {
      mapa[r.Concepto] = r.Parametro == null ? '' : String(r.Parametro);
    });
    return mapa;
  } catch (err) {
    console.error('[configFacturacion] No se pudieron leer parámetros de Servicios, usando defaults:', err.message);
    return {};
  }
}

function valor(params, concepto) {
  return Object.prototype.hasOwnProperty.call(params || {}, concepto)
    ? params[concepto]
    : DEFAULTS[concepto];
}

function enteroPositivo(val, fallback) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function obtenerConfigServiciosMasivo(rol) {
  const p = await obtenerParametrosServicios();
  const maxServicios = enteroPositivo(valor(p, P.LIMITE_SERVICIOS), 500);
  return {
    puedeCargaMasiva: enLista(valor(p, P.ROLES_CARGA_MASIVA), rol),
    limites: {
      transportadoras: maxServicios,
      proveedores:     maxServicios,
      placas:          maxServicios,
      recibos:         maxServicios,
      servicios:       maxServicios,
    },
  };
}

module.exports = {
  obtenerConfigServiciosMasivo,
  normalizarTexto,
  PARAMETROS_FACTURACION_SERVICIOS: P,
};
