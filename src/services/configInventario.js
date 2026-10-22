const pool = require('./db');
const { resolverResponsablesRetiro } = require('./configRetiro');

// ── Parámetros configurables del módulo Inventario (Config_Parametros) ──────
// Modulo = 'inventario'. Seccion = 'Inventario' (pestaña Inventario) o 'General'
// (reglas que aplican a todas las pestañas del módulo). Si una fila no existe en
// la tabla se usa el valor por defecto de abajo (el mismo que tenía el código).
// Listas separadas por coma; comparación sin distinguir mayúsculas ni tildes.
const MODULO = 'inventario';

const P = {
  // Seccion 'Inventario'
  AJUSTAR_STOCK:      'Roles que pueden ajustar stock',
  EDITAR_PLACA:       'Roles que pueden editar placa',
  MES_INICIAL:        'Mes inicial de confirmación de inventario',
  MESES_ADELANTE:     'Meses hacia adelante permitidos para confirmar',
  HABILITAR_CORREO:   'Habilitar notificaciones de correo en Confirmación de Inventario',
  // Seccion 'General'
  CATEGORIAS_RESTRINGIDAS: 'Categorías permitidas en acceso restringido',
};

// Destinatarios del correo de confirmación, una fila por categoría:
// "Notificación confirmación inventario <CATEGORÍA> - Para:" (lista de ROLES).
const conceptoCorreoCategoria = (categoria) => `Notificación confirmación inventario ${String(categoria || '').trim().toUpperCase()} - Para:`;

const DEFAULTS = {
  Inventario: {
    // Antes: estos 6 roles + cualquier usuario de la operación Administración. Los roles de
    // Administración con acceso a la pestaña se agregaron para no quitarle el permiso a nadie.
    [P.AJUSTAR_STOCK]: 'Inventario, Sistema, AuxiliarR, Auxiliar, AnaSst, AuxSst, AdmSst, Asistencial, Calidad, Contratación, Control, Cuentas, LiderSst',
    [P.EDITAR_PLACA]: '',            // vacío / sin fila = cualquiera con acceso a la pestaña
    [P.MES_INICIAL]: '2026-07',
    [P.MESES_ADELANTE]: '1',
    [P.HABILITAR_CORREO]: '1',
  },
  General: {
    [P.CATEGORIAS_RESTRINGIDAS]: 'EPP, DOTACIÓN',
  },
};

// Destinatarios por categoría que tenía el código (correos fijos → su rol en Maestro_Usuarios).
// Todas llevaban Sistema (admin@) y, menos EPP, Control (subgerenciaoperaciones@).
const DEFAULT_CORREO_POR_CATEGORIA = {
  'ACTIVO FIJO': 'Sistema, Cuentas, Control',
  'DOTACION':    'Sistema, Cuentas, Inventario, Control',
  'HERRAMIENTA': 'Sistema, Cuentas, Control',
  'EPP':         'Sistema, AdmSst',
  'PAPELERIA':   'Sistema, Cuentas, Control',
  'TECNOLOGIA':  'Sistema, Control',
};
const DEFAULT_CORREO_OTRA_CATEGORIA = 'Sistema, Control';

// Roles que se resuelven según la Operación (misma lógica de Retiros/Traslados).
const ROLES_RESPONSABLES = ['Auxiliar', 'AuxiliarR', 'Coordinador', 'CoordinadorR'];

function normalizarTexto(valor) {
  return String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

async function obtenerParametros(seccion) {
  try {
    const [rows] = await pool.execute(
      'SELECT `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ?',
      [MODULO, seccion]
    );
    const mapa = {};
    rows.forEach((r) => { mapa[r.Concepto] = r.Parametro == null ? '' : String(r.Parametro); });
    return mapa;
  } catch (err) {
    console.error(`[configInventario] No se pudieron leer los parámetros de ${seccion}, se usan los valores por defecto:`, err.message);
    return {};
  }
}

function valor(params, seccion, concepto) {
  return Object.prototype.hasOwnProperty.call(params || {}, concepto) ? params[concepto] : (DEFAULTS[seccion] || {})[concepto];
}

function lista(texto) {
  return String(texto || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function enLista(texto, buscado) {
  if (!String(buscado || '').trim()) return false;
  const b = normalizarTexto(buscado);
  return lista(texto).some((x) => normalizarTexto(x) === b);
}

function activo(texto) {
  return ['1', 'true', 'si', 'yes', 'habilitado'].includes(normalizarTexto(texto));
}

// ── Pestaña Inventario ──────────────────────────────────────────────────────
// Permisos y reglas de la pestaña para un rol.
async function obtenerConfigPestanaInventario(rol) {
  const p = await obtenerParametros('Inventario');
  const rolesPlaca = String(valor(p, 'Inventario', P.EDITAR_PLACA) || '').trim();
  const mesInicial = String(valor(p, 'Inventario', P.MES_INICIAL) || '').trim();
  const mesesAdelante = parseInt(valor(p, 'Inventario', P.MESES_ADELANTE), 10);
  return {
    puedeAjustarStock: enLista(valor(p, 'Inventario', P.AJUSTAR_STOCK), rol),
    puedeEditarPlaca: rolesPlaca === '' ? true : enLista(rolesPlaca, rol),
    mesInicialConfirmacion: /^\d{4}-(0[1-9]|1[0-2])$/.test(mesInicial) ? mesInicial : DEFAULTS.Inventario[P.MES_INICIAL],
    mesesAdelanteConfirmacion: mesesAdelante >= 0 ? mesesAdelante : 1,
  };
}

// 'AAAA-MM' de hoy + n meses (hora de Bogotá)
function mesBogota(desplazamiento = 0) {
  const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const d = new Date(hoy.getFullYear(), hoy.getMonth() + desplazamiento, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ¿El mes ('AAAA-MM') está entre el mes inicial y hoy + meses permitidos?
function mesConfirmacionPermitido(cfg, mes) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes || ''))) return false;
  return mes >= cfg.mesInicialConfirmacion && mes <= mesBogota(cfg.mesesAdelanteConfirmacion);
}

// Categorías que se pueden confirmar: Config_Categoria_Inventario sin las "No aplica"
// (y, si el rol tiene acceso restringido, solo las permitidas).
async function obtenerCategoriasConfirmacion(filtroCategorias) {
  const [rows] = await pool.execute(
    "SELECT DISTINCT Categoria FROM Config_Categoria_Inventario WHERE Categoria IS NOT NULL AND (Condicion IS NULL OR Condicion <> 'No aplica') ORDER BY Categoria"
  );
  let categorias = rows.map((r) => r.Categoria).filter(Boolean);
  if (filtroCategorias) {
    const permitidas = new Set(filtroCategorias.map(normalizarTexto));
    categorias = categorias.filter((c) => permitidas.has(normalizarTexto(c)));
  }
  return categorias;
}

// Condición de cada categoría (Recuperable / Definitivo / No aplica), con la clave normalizada.
async function obtenerCondicionesCategoria() {
  const [rows] = await pool.execute('SELECT Categoria, Condicion FROM Config_Categoria_Inventario WHERE Categoria IS NOT NULL');
  const mapa = {};
  rows.forEach((r) => { mapa[normalizarTexto(r.Categoria)] = r.Condicion || ''; });
  return mapa;
}

async function categoriaEsRecuperable(categoria) {
  const mapa = await obtenerCondicionesCategoria();
  return mapa[normalizarTexto(categoria)] === 'Recuperable';
}

// ── Correo de confirmación de inventario ────────────────────────────────────
async function correosPorRoles(roles, operacion) {
  const esResponsable = (r) => ROLES_RESPONSABLES.some((x) => normalizarTexto(x) === normalizarTexto(r));
  const rolesResp = roles.filter(esResponsable);
  const rolesOtros = roles.filter((r) => !esResponsable(r));
  const correos = [];
  if (rolesResp.length && operacion) {
    const responsables = await resolverResponsablesRetiro(operacion, rolesResp);
    correos.push(...responsables.map((r) => r.Email));
  }
  if (rolesOtros.length) {
    const [rows] = await pool.execute(
      `SELECT Email FROM Maestro_Usuarios
       WHERE Rol IN (${rolesOtros.map(() => '?').join(',')}) AND Email IS NOT NULL AND Email <> ''`,
      rolesOtros
    );
    correos.push(...rows.map((r) => r.Email));
  }
  const vistos = new Set();
  return correos.map((c) => String(c || '').trim()).filter((c) => {
    const k = c.toLowerCase();
    if (!c || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

// Destinatarios (Para) del correo de confirmación según la categoría. Quien confirma
// va en copia (lo agrega notificarConfirmacionInventario).
async function obtenerDestinatariosConfirmacion(categoria, operacion) {
  const p = await obtenerParametros('Inventario');
  if (!activo(valor(p, 'Inventario', P.HABILITAR_CORREO))) return { habilitado: false, para: [] };

  // Busca la fila de la categoría sin distinguir mayúsculas ni tildes
  const buscado = normalizarTexto(conceptoCorreoCategoria(categoria));
  const concepto = Object.keys(p).find((k) => normalizarTexto(k) === buscado);
  const roles = concepto !== undefined
    ? lista(p[concepto])
    : lista(DEFAULT_CORREO_POR_CATEGORIA[normalizarTexto(categoria).toUpperCase()] || DEFAULT_CORREO_OTRA_CATEGORIA);

  return { habilitado: true, para: await correosPorRoles(roles, operacion) };
}

// ── General (todas las pestañas del módulo) ─────────────────────────────────
// Categorías del acceso restringido (códigos 4, 5 y 6 de Maestro_Menu_Inventario). Se
// devuelven con y sin tilde, porque Dynamic_Kardex/Vista_Inventario tienen ambas escrituras.
async function obtenerCategoriasRestringidas() {
  const p = await obtenerParametros('General');
  const categorias = lista(valor(p, 'General', P.CATEGORIAS_RESTRINGIDAS));
  const variantes = new Set();
  categorias.forEach((c) => {
    variantes.add(c);
    variantes.add(c.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  });
  return [...variantes];
}

module.exports = {
  obtenerConfigPestanaInventario,
  mesConfirmacionPermitido,
  obtenerCategoriasConfirmacion,
  obtenerCondicionesCategoria,
  categoriaEsRecuperable,
  obtenerDestinatariosConfirmacion,
  obtenerCategoriasRestringidas,
  normalizarTexto,
  conceptoCorreoCategoria,
  PARAMETROS_INVENTARIO: P,
};
