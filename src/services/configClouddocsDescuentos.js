const pool = require('./db');

// ── Parámetros de Cloud Docs › Autorizaciones de Descuento (Config_Parametros) ──
// Modulo = 'CloudDocs', Seccion = 'DescuentoNomina'. Si una fila no existe en la tabla se usa
// el valor por defecto de abajo, que es el mismo comportamiento que tenía el código.
const MODULO = 'CloudDocs';
const SECCION = 'DescuentoNomina';

const P = {
  ROLES_REGENERAR:      'Roles que pueden regenerar el PDF de autorizaciones',
  ROLES_ELIMINAR:       'Roles que pueden eliminar autorizaciones',
  ROLES_NO_FIRMA:       'Roles que pueden generar soporte de No firma',
  ROLES_SOLO_ANTICIPADA: 'Roles que solo gestionan autorizaciones Anticipadas',
  HORAS_ENLACE:         'Horas de vigencia del enlace de firma',
};

const DEFAULTS = {
  [P.ROLES_REGENERAR]:       'Sistema, Contratación',
  [P.ROLES_ELIMINAR]:        'Sistema, Contratación',
  [P.ROLES_NO_FIRMA]:        'Sistema, Contratación',
  [P.ROLES_SOLO_ANTICIPADA]: 'Contratación, Archivo, Asistencial',
  [P.HORAS_ENLACE]:          '48',
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
    console.error('[configClouddocsDescuentos] No se pudieron leer los parámetros, se usan los valores por defecto:', err.message);
    return {};
  }
}

function valor(params, concepto) {
  return Object.prototype.hasOwnProperty.call(params || {}, concepto) ? params[concepto] : DEFAULTS[concepto];
}

function rolEnLista(params, concepto, rol) {
  const r = normalizar(rol);
  if (!r) return false;
  return String(valor(params, concepto) || '').split(',').some(x => normalizar(x) === r);
}

// Permisos del rol en la pestaña (se envían a la página y se validan en cada ruta)
async function permisosDescuentos(rol) {
  const p = await obtenerParametros();
  return {
    puedeRegenerar:  rolEnLista(p, P.ROLES_REGENERAR, rol),
    puedeEliminar:   rolEnLista(p, P.ROLES_ELIMINAR, rol),
    puedeNoFirma:    rolEnLista(p, P.ROLES_NO_FIRMA, rol),
    soloAnticipada:  rolEnLista(p, P.ROLES_SOLO_ANTICIPADA, rol),
  };
}

// Milisegundos de vigencia del enlace de firma (vacío o no válido → 48 horas)
async function vigenciaEnlaceMs() {
  const h = parseFloat(String(valor(await obtenerParametros(), P.HORAS_ENLACE) || '').replace(',', '.'));
  return (Number.isFinite(h) && h > 0 ? Math.min(h, 24 * 90) : 48) * 3600000;
}

module.exports = { permisosDescuentos, vigenciaEnlaceMs, PARAMETROS_DESCUENTOS: P };
