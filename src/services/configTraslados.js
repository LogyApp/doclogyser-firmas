const pool = require('./db');
const { resolverResponsablesRetiro } = require('./configRetiro');

// ── Parámetros configurables de Traslados (Config_Parametros) ───────────────
// Modulo = 'nomina', Seccion = 'Traslados'. Si una fila no existe en la tabla se
// usa el valor por defecto de abajo (el mismo que tenía el código).
// Todas las listas de notificación son de ROLES: se envía al Email de los
// usuarios de Maestro_Usuarios con ese Rol.
const MODULO_TRASLADOS  = 'nomina';
const SECCION_TRASLADOS = 'Traslados';

const P = {
  PUEDE_VALIDAR:     'Puede validar traslados',
  EDITAR_PLANTILLA:  'Puede editar plantilla de traslados',
  PREVISUALIZAR:     'Puede previsualizar documento de traslado',
  REGENERAR:         'Puede regenerar documento de traslado',
  HORAS_ENLACE:      'Horas de vigencia del enlace de firma',
  NUEVO_PARA:        'Notificación nuevo traslado - Para:',
  NUEVO_COPIA:       'Notificación nuevo traslado - Copia:',
  FIRMA_COPIA:       'Notificación firma trabajador - Copia:',
  DOC_PARA:          'Notificación documento generado - Para:',
  DOC_COPIA:         'Notificación documento generado - Copia:',
  CARGOS_CALIDAD:    'Cargos con copia de Calidad en traslados',
  COPIA_POR_CARGO:   'Notificación traslado - Copia por cargo:',
  HABILITAR:         'Habilitar notificaciones de correo en Traslados',
  PUEDE_EDITAR:      'Puede editar traslados',
  FUERA_QUINCENA:    'Roles que pueden registrar traslados fuera de la quincena actual',
  TIPO_DOC:          'Tipo de documento del traslado en Maestro_docTrabajador',
  ANOTACION_NO_FIRMA:'Anotación por defecto de No firma',
  MAX_LISTADO:       'Máximo de traslados en el listado',
};

const DEFAULTS_TRASLADOS = {
  [P.PUEDE_VALIDAR]:    'Juridica, Sistema',
  [P.EDITAR_PLANTILLA]: 'Juridica, Sistema',
  [P.PREVISUALIZAR]:    'Juridica, Sistema',
  [P.REGENERAR]:        'Juridica, Sistema',
  [P.HORAS_ENLACE]:     '48',
  [P.NUEVO_PARA]:       'Juridica',
  [P.NUEVO_COPIA]:      'Sistema',
  [P.FIRMA_COPIA]:      'Juridica, Sistema, Auxiliar, AuxiliarR, Coordinador, CoordinadorR',
  [P.DOC_PARA]:         'Juridica, Control',
  [P.DOC_COPIA]:        'Nomina, Sistema, CoorSelección, Contratación, Inventario, Auxiliar, AuxiliarR, Coordinador, CoordinadorR',
  [P.CARGOS_CALIDAD]:   'COORDINADOR LOGISTICO, AUXILIAR ADMINISTRATIVO DE OPERACIÓN, AUXILIAR ADMINISTRATIVO REGIONAL, COORDINADOR REGIONAL',
  [P.COPIA_POR_CARGO]:  'Calidad, Directorth',
  [P.HABILITAR]:        '1',
  [P.PUEDE_EDITAR]:     '',      // vacío = cualquier rol con acceso a la pestaña (comportamiento anterior)
  [P.FUERA_QUINCENA]:   'Sistema, Juridica',
  [P.TIPO_DOC]:         '50',     // Id de Config_Doc_Trabajador; el prefijo sale de su columna Prefijo
  [P.ANOTACION_NO_FIRMA]: 'El trabajador no firma, se soporta por correo electrónico',
  [P.MAX_LISTADO]:      '300',
};

// Roles que se resuelven según la Operación Destino (misma lógica de Retiros:
// regional + operación y, si no hay nadie, SOCIODEMOGRAFICA en Dispositivo).
const ROLES_RESPONSABLES = ['Auxiliar', 'AuxiliarR', 'Coordinador', 'CoordinadorR'];

function normalizarTexto(valor) {
  return String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

async function obtenerParametrosTraslados() {
  try {
    const [rows] = await pool.execute(
      'SELECT `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ?',
      [MODULO_TRASLADOS, SECCION_TRASLADOS]
    );
    const mapa = {};
    rows.forEach(r => { mapa[r.Concepto] = r.Parametro == null ? '' : String(r.Parametro); });
    return mapa;
  } catch (err) {
    console.error('[configTraslados] No se pudieron leer los parámetros de Traslados, se usan los valores por defecto:', err.message);
    return {};
  }
}

function valorParametro(params, concepto) {
  return Object.prototype.hasOwnProperty.call(params || {}, concepto) ? params[concepto] : DEFAULTS_TRASLADOS[concepto];
}

function listaParametro(params, concepto) {
  return String(valorParametro(params, concepto) || '').split(',').map(s => s.trim()).filter(Boolean);
}

function estaEnParametro(params, concepto, valor) {
  if (!String(valor || '').trim()) return false;
  const buscado = normalizarTexto(valor);
  return listaParametro(params, concepto).some(item => normalizarTexto(item) === buscado);
}

function parametroActivo(params, concepto) {
  return ['1', 'true', 'si', 'yes'].includes(normalizarTexto(valorParametro(params, concepto)));
}

// ── Permisos ────────────────────────────────────────────────────────────────
async function obtenerPermisosTraslados(rol, params) {
  const p = params || await obtenerParametrosTraslados();
  return {
    params: p,
    puedeValidar:         estaEnParametro(p, P.PUEDE_VALIDAR, rol),
    puedeEditarPlantilla: estaEnParametro(p, P.EDITAR_PLANTILLA, rol),
    puedePrevisualizar:   estaEnParametro(p, P.PREVISUALIZAR, rol),
    puedeRegenerar:       estaEnParametro(p, P.REGENERAR, rol),
    // Si la lista está vacía, edita cualquier rol con acceso a la pestaña Traslados
    puedeEditar:          listaParametro(p, P.PUEDE_EDITAR).length ? estaEnParametro(p, P.PUEDE_EDITAR, rol) : true,
    horasEnlace:          horasVigenciaEnlace(p),
    anotacionNoFirma:     String(valorParametro(p, P.ANOTACION_NO_FIRMA) || DEFAULTS_TRASLADOS[P.ANOTACION_NO_FIRMA]),
  };
}

// Quincena (inicio y fin, AAAA-MM-DD) de una fecha: del 1 al 15 o del 16 al último día del mes
function quincenaDe(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  const p = n => String(n).padStart(2, '0');
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= 15
    ? { inicio: `${y}-${p(m)}-01`, fin: `${y}-${p(m)}-15` }
    : { inicio: `${y}-${p(m)}-16`, fin: `${y}-${p(m)}-${p(ultimo)}` };
}

// Rango de fechas permitido para el calendario: { min, max } de la quincena actual, o null si el rol
// puede usar cualquier fecha.
function rangoFechaTraslado(params, hoy, rol) {
  if (estaEnParametro(params, P.FUERA_QUINCENA, rol)) return null;
  const q = quincenaDe(hoy);
  return { min: q.inicio, max: q.fin };
}

// La fecha del traslado (AAAA-MM-DD) debe estar en la quincena actual, salvo para los roles de
// "Roles que pueden registrar traslados fuera de la quincena actual". Devuelve un error o null.
function validarFechaTraslado(params, fecha, hoy, rol) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) return 'La fecha del traslado no es válida.';
  if (estaEnParametro(params, P.FUERA_QUINCENA, rol)) return null;
  const q = quincenaDe(hoy);
  if (fecha < q.inicio || fecha > q.fin) {
    return `La fecha del traslado debe estar en la quincena actual (${q.inicio} a ${q.fin}). Para otra fecha, comuníquese con Jurídica.`;
  }
  return null;
}

// Tipo de documento del traslado (Id de Config_Doc_Trabajador) y su Prefijo en esa tabla
async function documentoTraslado(params) {
  const tipoDocumento = String(valorParametro(params, P.TIPO_DOC) || '50').trim() || '50';
  let prefijo = 'TRAS';
  try {
    const [rows] = await pool.execute('SELECT Prefijo FROM Config_Doc_Trabajador WHERE Id = ? LIMIT 1', [tipoDocumento]);
    if (rows.length && rows[0].Prefijo) prefijo = String(rows[0].Prefijo).trim();
  } catch (err) {
    console.error('[configTraslados] No se pudo leer el prefijo en Config_Doc_Trabajador:', err.message);
  }
  return { tipoDocumento, prefijo };
}

function maximoListado(params) {
  const n = parseInt(valorParametro(params, P.MAX_LISTADO), 10);
  return n > 0 ? Math.min(n, 5000) : 300;
}

function horasVigenciaEnlace(params) {
  const horas = parseInt(valorParametro(params, P.HORAS_ENLACE), 10);
  return horas > 0 ? horas : 48;
}

// ── Correos ─────────────────────────────────────────────────────────────────
// Lista de roles → correos. Los cuatro roles responsables se resuelven por la
// Operación Destino; cualquier otro rol envía a todos sus usuarios con Email.
async function correosPorRoles(roles, operacionDestino) {
  const rolesValidos = roles.filter(r => !r.includes('@'));
  const esResponsable = r => ROLES_RESPONSABLES.some(x => normalizarTexto(x) === normalizarTexto(r));
  const rolesResp  = rolesValidos.filter(esResponsable);
  const rolesOtros = rolesValidos.filter(r => !esResponsable(r));
  const correos = [];

  if (rolesResp.length && operacionDestino) {
    const responsables = await resolverResponsablesRetiro(operacionDestino, rolesResp);
    correos.push(...responsables.map(r => r.Email));
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

function unicos(correos) {
  const vistos = new Set();
  return correos.map(c => String(c || '').trim()).filter(c => {
    const clave = c.toLowerCase();
    if (!c || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

const CONCEPTOS_POR_TIPO = {
  nuevo:     { para: P.NUEVO_PARA, copia: P.NUEVO_COPIA },
  firma:     { para: null,         copia: P.FIRMA_COPIA }, // Para = el trabajador
  documento: { para: P.DOC_PARA,   copia: P.DOC_COPIA },
};

// Para / Copia de una notificación de traslado. Quien registró el traslado
// siempre va en Copia. Si el cargo del trabajador está en "Cargos con copia de
// Calidad en traslados", se agregan los roles de "Notificación traslado - Copia
// por cargo:".
async function obtenerDestinatariosTraslado(tipo, { operacionDestino, cargo, emailRegistrador }) {
  const conceptos = CONCEPTOS_POR_TIPO[tipo];
  if (!conceptos) throw new Error(`Tipo de notificación de traslado desconocido: ${tipo}`);

  const params = await obtenerParametrosTraslados();
  if (!parametroActivo(params, P.HABILITAR)) return { habilitado: false, para: [], copia: [] };

  const para  = conceptos.para ? await correosPorRoles(listaParametro(params, conceptos.para), operacionDestino) : [];
  const copia = await correosPorRoles(listaParametro(params, conceptos.copia), operacionDestino);
  if (estaEnParametro(params, P.CARGOS_CALIDAD, cargo)) {
    copia.push(...await correosPorRoles(listaParametro(params, P.COPIA_POR_CARGO), operacionDestino));
  }
  if (emailRegistrador) copia.push(emailRegistrador);

  const paraUnicos = unicos(para);
  const enPara = new Set(paraUnicos.map(c => c.toLowerCase()));
  return { habilitado: true, para: paraUnicos, copia: unicos(copia).filter(c => !enPara.has(c.toLowerCase())) };
}

module.exports = {
  obtenerParametrosTraslados,
  obtenerPermisosTraslados,
  horasVigenciaEnlace,
  obtenerDestinatariosTraslado,
  validarFechaTraslado,
  rangoFechaTraslado,
  documentoTraslado,
  maximoListado,
  PARAMETROS_TRASLADOS: P,
  DEFAULTS_TRASLADOS,
};
