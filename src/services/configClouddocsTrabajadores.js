const pool = require('./db');
const { obtenerDocsSeleccion, obtenerDocsFirmaParaOperacion } = require('./docsSeleccion');

// ── Parámetros configurables de Cloud Docs › Trabajadores (Config_Parametros) ──
// Modulo = 'CloudDocs', Seccion = 'Trabajadores'. Si una fila no existe en la tabla
// se usa el valor por defecto de abajo (el mismo comportamiento que tenía el código).
const MODULO = 'CloudDocs';
const SECCION = 'Trabajadores';

const P = {
  MAX_LISTADO:        'Máximo de trabajadores en el listado',
  ROLES_VALIDAR:      'Roles que pueden validar documentos',
  ROLES_ELIMINAR:     'Roles que pueden eliminar documentos',
  ROLES_CREAR_TIPO:   'Roles que pueden crear tipos de documento',
  BLOQUEAR_REPETIDOS: 'Bloquear documentos repetidos al cargar',
};

const DEFAULTS = {
  [P.MAX_LISTADO]:        '1000',
  [P.ROLES_VALIDAR]:      'Archivo, Sistema, Asistencial',
  [P.ROLES_ELIMINAR]:     'Archivo, Sistema',
  [P.ROLES_CREAR_TIPO]:   'Archivo, Sistema',
  [P.BLOQUEAR_REPETIDOS]: '0',
};

const TTL_MS = 60 * 1000;
let cache = { t: 0, data: null };

function normalizar(txt) {
  return (txt || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

async function obtenerParametros() {
  if (cache.data && Date.now() - cache.t < TTL_MS) return cache.data;
  try {
    const [rows] = await pool.execute(
      'SELECT `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ?',
      [MODULO, SECCION]
    );
    const mapa = {};
    rows.forEach(r => { mapa[r.Concepto] = r.Parametro == null ? '' : String(r.Parametro); });
    cache = { t: Date.now(), data: mapa };
    return mapa;
  } catch (err) {
    console.error('[configClouddocsTrabajadores] No se pudieron leer los parámetros, se usan los valores por defecto:', err.message);
    return {};
  }
}

// Nombres anteriores de un concepto (por si la fila aún no se ha renombrado en la tabla)
const NOMBRES_ANTERIORES = {
  [P.ROLES_ELIMINAR]: ['Roles que pueden eliminar documentos con validación ERROR'],
};

function valor(params, concepto) {
  const tiene = c => Object.prototype.hasOwnProperty.call(params || {}, c);
  if (tiene(concepto)) return params[concepto];
  const anterior = (NOMBRES_ANTERIORES[concepto] || []).find(tiene);
  return anterior ? params[anterior] : DEFAULTS[concepto];
}

function lista(params, concepto) {
  return String(valor(params, concepto) || '').split(',').map(x => x.trim()).filter(Boolean);
}

function activo(params, concepto) {
  return ['1', 'true', 'si', 'yes'].includes(normalizar(valor(params, concepto)));
}

function rolEnLista(params, concepto, rol) {
  const r = normalizar(rol);
  return !!r && lista(params, concepto).some(x => normalizar(x) === r);
}

async function maxListado() {
  const n = parseInt(valor(await obtenerParametros(), P.MAX_LISTADO), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20000) : 1000;
}

async function puedeValidarDocumentos(rol) {
  return rolEnLista(await obtenerParametros(), P.ROLES_VALIDAR, rol);
}

async function puedeEliminarDocumentos(rol) {
  return rolEnLista(await obtenerParametros(), P.ROLES_ELIMINAR, rol);
}

async function puedeCrearTiposDocumento(rol) {
  return rolEnLista(await obtenerParametros(), P.ROLES_CREAR_TIPO, rol);
}

async function bloquearRepetidos() {
  return activo(await obtenerParametros(), P.BLOQUEAR_REPETIDOS);
}

// Permisos que necesita la interfaz (se envían en CONFIG)
async function permisosInterfaz(rol) {
  const params = await obtenerParametros();
  return {
    puedeValidarDocs: rolEnLista(params, P.ROLES_VALIDAR, rol),
    puedeEliminarDocs: rolEnLista(params, P.ROLES_ELIMINAR, rol),
    puedeCrearTipoDoc: rolEnLista(params, P.ROLES_CREAR_TIPO, rol),
  };
}

// ── Firmas del listado de Trabajadores ──
// Los documentos de firma salen de Config_Doc_Trabajador (Clasificación "3.") y la
// regla de operaciones de talenthub/Aspirantes ("Documento de firma solo para
// operaciones - Id N"), igual que el portal de firmas. Así el contador del listado
// coincide con lo que el trabajador ve en su portal.
async function idsDocumentosFirma() {
  const { firmas } = await obtenerDocsSeleccion();
  return firmas.map(d => Number(d.id)).filter(Boolean);
}

// Crea una función (operación) → [ids aplicables], con caché por operación durante la petición
function crearResolverFirmasPorOperacion() {
  const memo = new Map();
  return async (operacion) => {
    const clave = normalizar(operacion);
    if (!memo.has(clave)) {
      memo.set(clave, obtenerDocsFirmaParaOperacion(operacion).then(docs => docs.map(d => Number(d.id))));
    }
    return memo.get(clave);
  };
}

module.exports = {
  P,
  DEFAULTS,
  obtenerParametros,
  maxListado,
  puedeValidarDocumentos,
  puedeEliminarDocumentos,
  puedeCrearTiposDocumento,
  bloquearRepetidos,
  permisosInterfaz,
  idsDocumentosFirma,
  crearResolverFirmasPorOperacion,
};
