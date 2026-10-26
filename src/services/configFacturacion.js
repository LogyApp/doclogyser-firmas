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

// ── Pestaña Clientes: maestros de Transportadoras, Proveedores y Placas ─────
// Seccion = 'Clientes'. Depurar = eliminar, eliminar y reemplazar, unificar duplicados de
// Placas y las acciones provisionales (mayúsculas, normalizar textos). Antes era fijo: Sistema.
const SECCION_CLIENTES = 'Clientes';
const PC = {
  ROLES_DEPURAR:     'Roles que pueden depurar maestros de Clientes',
  ROLES_GESTIONAR:   'Roles que pueden editar y agregar en maestros de Clientes',
  ROLES_RETENCIONES: 'Roles que pueden editar retenciones de Clientes',
};
const DEFAULTS_CLIENTES = {
  [PC.ROLES_DEPURAR]:     'Sistema',
  [PC.ROLES_GESTIONAR]:   'Auxiliar, AuxiliarR, Coordinador, CoordinadorR, Facturación, Sistema',
  [PC.ROLES_RETENCIONES]: 'Facturación, Sistema',
};

async function puedeDepurarMaestros(rol) {
  let texto = DEFAULTS_CLIENTES[PC.ROLES_DEPURAR];
  try {
    const [rows] = await pool.execute(
      'SELECT `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ? AND `Concepto` = ? LIMIT 1',
      [MODULO, SECCION_CLIENTES, PC.ROLES_DEPURAR]
    );
    if (rows.length) texto = rows[0].Parametro == null ? '' : String(rows[0].Parametro);
  } catch (err) {
    console.error('[configFacturacion] No se pudo leer el permiso de depurar maestros, usando default:', err.message);
  }
  return enLista(texto, rol);
}

async function puedeGestionarMaestros(rol) {
  let texto = DEFAULTS_CLIENTES[PC.ROLES_GESTIONAR];
  try {
    const [rows] = await pool.execute(
      'SELECT `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ? AND `Concepto` = ? LIMIT 1',
      [MODULO, SECCION_CLIENTES, PC.ROLES_GESTIONAR]
    );
    if (rows.length) texto = rows[0].Parametro == null ? '' : String(rows[0].Parametro);
  } catch (err) {
    console.error('[configFacturacion] No se pudo leer el permiso de gestionar maestros, usando default:', err.message);
  }
  return enLista(texto, rol);
}

async function puedeEditarRetenciones(rol) {
  let texto = DEFAULTS_CLIENTES[PC.ROLES_RETENCIONES];
  try {
    const [rows] = await pool.execute(
      'SELECT `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ? AND `Concepto` = ? LIMIT 1',
      [MODULO, SECCION_CLIENTES, PC.ROLES_RETENCIONES]
    );
    if (rows.length) texto = rows[0].Parametro == null ? '' : String(rows[0].Parametro);
  } catch (err) {
    console.error('[configFacturacion] No se pudo leer el permiso de editar retenciones, usando default:', err.message);
  }
  return enLista(texto, rol);
}

module.exports = {
  obtenerConfigServiciosMasivo,
  puedeDepurarMaestros,
  puedeGestionarMaestros,
  puedeEditarRetenciones,
  PARAMETROS_FACTURACION_CLIENTES: PC,
  normalizarTexto,
  PARAMETROS_FACTURACION_SERVICIOS: P,
};
