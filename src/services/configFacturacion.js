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
  TOPE_VALOR_BASE:       'Tope del Valor Base por servicio',
  OPS_AREA_USUARIO:      'Operaciones donde el Área del servicio se prellena con la del usuario',
};

const DEFAULTS = {
  [P.ROLES_CARGA_MASIVA]: 'Sistema, Facturación, AuxiliarR, CoordinadorR',
  [P.LIMITE_SERVICIOS]:   '500',
  [P.TOPE_VALOR_BASE]:    '3000000',
  [P.OPS_AREA_USUARIO]:   '',
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

// Tope de Cantidad × Valor Unitario de un servicio (agregar, editar y carga masiva).
async function obtenerTopeValorBaseServicio() {
  const p = await obtenerParametrosServicios();
  return enteroPositivo(valor(p, P.TOPE_VALOR_BASE), 3000000);
}

// ── Pestaña Recibos (Seccion = 'Recibos') ───────────────────────────────────
// Quién ve la pestaña y qué operaciones: Maestro_Menu (facturacion / Recibos).
const SECCION_RECIBOS = 'Recibos';
const PR = {
  CREAR:          'Roles que pueden crear y editar recibos',
  EDITAR_VERDE:   'Roles que pueden editar recibos validados',
  RETENCIONES:    'Roles que pueden modificar retenciones de recibos',
  ELIMINAR:       'Roles que pueden eliminar recibos',
  ELIMINAR_SERV:  'Roles que pueden eliminar servicios',
  REASIGNAR:      'Roles que pueden reasignar servicios a otro recibo',
  NITS_RETENCION: 'NITs con retención obligatoria de Fuente e IVA',
  VER_RECIBO_ESTADO:     'Roles que ven el Recibo del Cliente en cualquier estado',
  VER_RECIBO_MODALIDAD:  'Roles que ven el Recibo del Cliente en cualquier modalidad',
  VER_SERVICIO_FPAGO:    'Roles que ven el registro del servicio en cualquier forma de pago',
  VER_SERVICIO_SIN_TEL:  'Roles que ven el registro del servicio sin teléfono',
};
const DEFAULTS_RECIBOS = {
  [PR.CREAR]:          'Sistema, Facturación, Auxiliar, AuxiliarR, Coordinador, CoordinadorR, Lider',
  [PR.EDITAR_VERDE]:   'Facturación, Sistema',
  [PR.RETENCIONES]:    'Facturación, Sistema',
  [PR.ELIMINAR]:       'Sistema',
  [PR.ELIMINAR_SERV]:  'Sistema',
  [PR.REASIGNAR]:      'Sistema, Facturación, Auxiliar, AuxiliarR, Coordinador, CoordinadorR',
  [PR.NITS_RETENCION]: '860350940, 890204199',
  [PR.VER_RECIBO_ESTADO]:    'Facturación, Sistema',
  [PR.VER_RECIBO_MODALIDAD]: '',
  [PR.VER_SERVICIO_FPAGO]:   '',
  [PR.VER_SERVICIO_SIN_TEL]: '',
};

async function obtenerParametrosRecibos() {
  try {
    const [rows] = await pool.execute(
      'SELECT `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ?',
      [MODULO, SECCION_RECIBOS]
    );
    const mapa = {};
    rows.forEach(r => { mapa[r.Concepto] = r.Parametro == null ? '' : String(r.Parametro); });
    return mapa;
  } catch (err) {
    console.error('[configFacturacion] No se pudieron leer parámetros de Recibos, usando defaults:', err.message);
    return {};
  }
}

function valorRecibos(params, concepto) {
  return Object.prototype.hasOwnProperty.call(params || {}, concepto) ? params[concepto] : DEFAULTS_RECIBOS[concepto];
}

// Permisos del rol en Recibos: { crear, editarValidados, modificarRetenciones,
// eliminarRecibos, eliminarServicios, reasignarServicios }
async function obtenerPermisosRecibos(rol) {
  const p = await obtenerParametrosRecibos();
  const tiene = concepto => enLista(valorRecibos(p, concepto), rol);
  return {
    crear:                tiene(PR.CREAR),
    editarValidados:      tiene(PR.EDITAR_VERDE),
    modificarRetenciones: tiene(PR.RETENCIONES),
    eliminarRecibos:      tiene(PR.ELIMINAR),
    eliminarServicios:    tiene(PR.ELIMINAR_SERV),
    reasignarServicios:   tiene(PR.REASIGNAR),
    // Botones "Ver Recibo del Cliente" y "Ver Servicio / Firma del Cliente"
    verReciboCualquierEstado:      tiene(PR.VER_RECIBO_ESTADO),
    verReciboCualquierModalidad:   tiene(PR.VER_RECIBO_MODALIDAD),
    verServicioCualquierFormaPago: tiene(PR.VER_SERVICIO_FPAGO),
    verServicioSinTelefono:        tiene(PR.VER_SERVICIO_SIN_TEL),
  };
}

// NITs a los que siempre se aplica ReteFuente y ReteIVA (regla heredada de AppSheet).
async function obtenerNitsRetencionObligatoria() {
  const p = await obtenerParametrosRecibos();
  return lista(valorRecibos(p, PR.NITS_RETENCION)).map(n => Number(String(n).replace(/\D/g, ''))).filter(n => n > 0);
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

// Área con la que se prellena el servicio en las operaciones configuradas (antes, fórmula de
// AppSheet de Cedi Vegas): la de Maestro_Usuarios.Area del usuario, si es un ID de Config_Area de
// esa operación. Devuelve { operaciones: [...], area: 'ID' | '' } para el usuario y la operación.
async function obtenerAreaUsuarioServicio(usuarioId, operacion) {
  const p = await obtenerParametrosServicios();
  const operaciones = lista(valor(p, P.OPS_AREA_USUARIO));
  if (!operacion || !enLista(operaciones.join(','), operacion) || !usuarioId) return { operaciones, area: '' };
  try {
    const [rows] = await pool.execute(
      `SELECT ca.ID AS id FROM Maestro_Usuarios mu
         JOIN Config_Area ca ON CAST(ca.ID AS CHAR) = TRIM(mu.Area) AND ca.\`OPERACIÓN\` = ?
       WHERE mu.ID = ? LIMIT 1`,
      [operacion, usuarioId]
    );
    return { operaciones, area: rows.length ? String(rows[0].id) : '' };
  } catch (err) {
    console.error('[configFacturacion] No se pudo leer el Área del usuario:', err.message);
    return { operaciones, area: '' };
  }
}

// Operaciones donde aplica el Área del usuario y las Áreas (IDs) del usuario por operación, para la página
async function obtenerAreasUsuarioServicio(usuarioId) {
  const p = await obtenerParametrosServicios();
  const operaciones = lista(valor(p, P.OPS_AREA_USUARIO));
  const areas = {};
  if (operaciones.length && usuarioId) {
    try {
      const [rows] = await pool.query(
        `SELECT ca.\`OPERACIÓN\` AS operacion, ca.ID AS id FROM Maestro_Usuarios mu
           JOIN Config_Area ca ON CAST(ca.ID AS CHAR) = TRIM(mu.Area)
         WHERE mu.ID = ?`,
        [usuarioId]
      );
      rows.filter(r => enLista(operaciones.join(','), r.operacion)).forEach(r => { areas[r.operacion] = String(r.id); });
    } catch (err) {
      console.error('[configFacturacion] No se pudo leer el Área del usuario:', err.message);
    }
  }
  return { operaciones, areas };
}

module.exports = {
  obtenerAreaUsuarioServicio,
  obtenerAreasUsuarioServicio,
  obtenerConfigServiciosMasivo,
  obtenerTopeValorBaseServicio,
  obtenerPermisosRecibos,
  obtenerNitsRetencionObligatoria,
  PARAMETROS_FACTURACION_RECIBOS: PR,
  puedeDepurarMaestros,
  puedeGestionarMaestros,
  puedeEditarRetenciones,
  PARAMETROS_FACTURACION_CLIENTES: PC,
  normalizarTexto,
  PARAMETROS_FACTURACION_SERVICIOS: P,
};
