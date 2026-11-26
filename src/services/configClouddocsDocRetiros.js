const pool = require('./db');
const { escape: sqlEscape } = require('mysql2');
const { resolverResponsablesRetiro } = require('./configRetiro');

// ── Parámetros de Cloud Docs › Doc. Retiros (Config_Parametros) ──
// Modulo = 'CloudDocs', Seccion = 'DocRetiros'. Si una fila no existe en la tabla se usa
// el valor por defecto de abajo, que es el mismo comportamiento que tenía el código.
const MODULO = 'CloudDocs';
const SECCION = 'DocRetiros';

const P = {
  MAX_LISTADO:    'Máximo de documentos en el listado',
  CLASIFICACION:  'Clasificación de documentos de retiro',
  ROLES_VALIDAR:  'Roles que pueden validar documentos de retiro',
  HABILITAR:      'Habilitar notificaciones de correo en Doc. Retiros',
  AVISO_PARA:     'Aviso de documento con ERROR - Para:',
  AVISO_COPIA:    'Aviso de documento con ERROR - Copia:',
};

const DEFAULTS = {
  [P.MAX_LISTADO]:   '1000',
  [P.CLASIFICACION]: 'Retiro',
  [P.ROLES_VALIDAR]: 'Archivo, Nomina, Sistema',
  [P.HABILITAR]:     '1',
  [P.AVISO_PARA]:    'Auxiliar, AuxiliarR, Coordinador, CoordinadorR',
  [P.AVISO_COPIA]:   '',
};

// Roles que se resuelven según la Operación del trabajador (configRetiro.js)
const ROLES_RESPONSABLES = ['Auxiliar', 'AuxiliarR', 'Coordinador', 'CoordinadorR'];

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
    console.error('[configClouddocsDocRetiros] No se pudieron leer los parámetros, se usan los valores por defecto:', err.message);
    return {};
  }
}

function valor(params, concepto) {
  return Object.prototype.hasOwnProperty.call(params || {}, concepto) ? params[concepto] : DEFAULTS[concepto];
}

function lista(params, concepto) {
  return String(valor(params, concepto) || '').split(',').map(x => x.trim()).filter(Boolean);
}

function activo(params, concepto) {
  return ['1', 'true', 'si', 'yes'].includes(normalizar(valor(params, concepto)));
}

async function maxListado() {
  const n = parseInt(valor(await obtenerParametros(), P.MAX_LISTADO), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20000) : 1000;
}

// Textos de clasificación que identifican un documento de retiro (vacío → 'Retiro')
async function clasificacionesRetiro() {
  const l = lista(await obtenerParametros(), P.CLASIFICACION);
  return l.length ? l : ['Retiro'];
}

// Fragmento SQL: (alias.Clasificacion LIKE '%Retiro%' OR ...). Valores escapados.
async function sqlClasificacionRetiro(alias = 'c') {
  const partes = (await clasificacionesRetiro()).map(t => `${alias}.Clasificacion LIKE ${sqlEscape('%' + t + '%')}`);
  return `(${partes.join(' OR ')})`;
}

async function puedeValidar(rol) {
  const r = normalizar(rol);
  return !!r && lista(await obtenerParametros(), P.ROLES_VALIDAR).some(x => normalizar(x) === r);
}

// Correos de una lista de roles: Auxiliar/AuxiliarR/Coordinador/CoordinadorR según la Operación
// del trabajador; los demás roles por Maestro_Usuarios.Rol.
async function correosPorRoles(roles, operacion) {
  const esResp = r => ROLES_RESPONSABLES.some(x => normalizar(x) === normalizar(r));
  const rolesResp = roles.filter(esResp);
  const rolesOtros = roles.filter(r => !esResp(r));
  const correos = [];
  if (rolesResp.length && operacion) {
    const resp = await resolverResponsablesRetiro(operacion, rolesResp);
    correos.push(...resp.map(r => r.Email));
  }
  if (rolesOtros.length) {
    const [rows] = await pool.execute(
      `SELECT Email FROM Maestro_Usuarios
       WHERE Rol IN (${rolesOtros.map(() => '?').join(',')}) AND Email IS NOT NULL AND Email <> ''`,
      rolesOtros
    );
    correos.push(...rows.map(r => r.Email));
  }
  return correos;
}

function unicos(correos, excluir = []) {
  const fuera = new Set(excluir.map(c => String(c || '').trim().toLowerCase()));
  const vistos = new Set();
  return correos.map(c => String(c || '').trim()).filter(c => {
    const k = c.toLowerCase();
    if (!c.includes('@') || vistos.has(k) || fuera.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

// Destinatarios del aviso de ERROR para una operación. null = avisos apagados.
async function destinatariosAvisoError(operacion, correoQuienMarca) {
  const params = await obtenerParametros();
  if (!activo(params, P.HABILITAR)) return null;
  const para = unicos(await correosPorRoles(lista(params, P.AVISO_PARA), operacion));
  const copia = unicos(
    [...(await correosPorRoles(lista(params, P.AVISO_COPIA), operacion)), correoQuienMarca || ''],
    para
  );
  return { para, copia };
}

module.exports = {
  P,
  DEFAULTS,
  obtenerParametros,
  maxListado,
  clasificacionesRetiro,
  sqlClasificacionRetiro,
  puedeValidar,
  destinatariosAvisoError,
};
