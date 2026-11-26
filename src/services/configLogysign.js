const pool = require('./db');
const { accesoSeccion } = require('./maestroMenu');

// ── Parámetros de Cloud Docs › LogySign (Config_Parametros) ──
// Modulo = 'CloudDocs', Seccion = 'LogySign'. Si una fila no existe en la tabla se usa el valor
// por defecto de abajo, que es el mismo comportamiento que tenía el código. Los documentos se
// configuran por Prefijo de Config_Doc_Trabajador (CR, TCR, CONT…), no por Id.
const MODULO = 'CloudDocs';
const SECCION = 'LogySign';

const P = {
  HABILITAR:           'Habilitar notificaciones de correo en LogySign',
  DIAS_ENLACE:         'Días de vigencia del enlace de firma',
  DIAS_DESCUENTO:      'Días de vigencia del enlace de la Autorización de Descuento del contrato',
  DOCS_CAUSA:          'Documentos que piden Causa',
  DOCS_CAUSA_EDITABLE: 'Documentos con Causa editable en Registros',
  DOCS_CON_DESCUENTO:  'Documentos que se envían con la Autorización de Descuento',
  DOCS_SIN_RESPONSABLES: 'Documentos que no copian a los responsables de la Operación',
  ROLES_VER_TODO:      'Roles que ven todos los registros',
  ROLES_VER_INGRESO:   'Roles que ven los Documentos de Ingreso',
  CLASIF_INGRESO:      'Clasificación de los Documentos de Ingreso',
  ROLES_CAUSA:         'Roles que ven la columna y el filtro Causa',
  // Conceptos que se repiten (uno por rol / por grupo): cualquier Concepto que empiece así
  PRESELECCION:        'Documento preseleccionado por rol', // Condicion = rol, Parametro = prefijo
  TEXTO_NO_FIRMA:      'Texto por defecto de la anotación No firma',
  ROLES_NO_FIRMA:      'Roles que pueden marcar No firma',
  DOC_SOPORTE:         'Documento de soporte de No firma',
  ROLES_ELIMINAR_PENDIENTES: 'Roles que pueden eliminar registros pendientes',
  ROLES_RESPONSABLES:  'Roles responsables de la Operación en copia',
  ROLES_REGIONAL:      'Roles en copia por Regional cuando la Operación no tiene responsables',
  COPIA_DOCUMENTO:     'Copia por documento',                // Condicion = prefijos, Parametro = roles o correos
};

const DEFAULTS = {
  [P.HABILITAR]:             '1',
  [P.DIAS_ENLACE]:           '30',
  [P.DIAS_DESCUENTO]:        '30',
  [P.DOCS_CAUSA]:            'CR, TCR, TCRP',
  [P.DOCS_CAUSA_EDITABLE]:   'CR',
  [P.DOCS_CON_DESCUENTO]:    'CONT',
  [P.DOCS_SIN_RESPONSABLES]: 'CONT',
  [P.ROLES_VER_TODO]:        'Sistema',
  [P.ROLES_VER_INGRESO]:     'Contratación, Archivo, Asistencial',
  [P.CLASIF_INGRESO]:        'Documentos de Ingreso',
  [P.ROLES_CAUSA]:           'Sistema, Juridica',
  [P.TEXTO_NO_FIRMA]:        'El trabajador no firma,|se soporta por correo electrónico',
  [P.ROLES_NO_FIRMA]:        'Sistema',
  [P.DOC_SOPORTE]:           'SSFD',
  [P.ROLES_ELIMINAR_PENDIENTES]: 'Sistema',
  [P.ROLES_RESPONSABLES]:    'Auxiliar, Coordinador, AuxiliarR, CoordinadorR',
  [P.ROLES_REGIONAL]:        'AuxiliarR, CoordinadorR',
};
// Preselección por rol cuando no hay ninguna fila de ese concepto
const DEFAULT_PRESELECCION = { contratacion: 'CONT' };
// Copias por documento cuando no hay ninguna fila de ese concepto (las que tenía el código)
const DEFAULT_COPIAS_DOCUMENTO = [
  { prefijos: ['CR', 'PRE', 'TCR', 'TCRP'], destinos: ['retiros@logyser.com'] },
  { prefijos: ['MODCTO'], destinos: ['nomina@logyser.com', 'gestor.nomina@logyser.com', 'contratacionnacional@logyser.com'] },
  { prefijos: ['PCD'], destinos: ['gestor.nomina@logyser.com'] },
];

const TTL_MS = 60 * 1000;
let cache = { t: 0, data: null };

function normalizar(txt) {
  return (txt || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function lista(txt) {
  return String(txt || '').split(',').map(x => x.trim()).filter(Boolean);
}

async function obtenerParametros() {
  if (cache.data && Date.now() - cache.t < TTL_MS) return cache.data;
  try {
    const [rows] = await pool.execute(
      'SELECT `Concepto`, `Condicion`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ?',
      [MODULO, SECCION]
    );
    const mapa = {};
    let preseleccion = null;
    let copiasDocumento = null;
    rows.forEach(r => {
      const valor = r.Parametro == null ? '' : String(r.Parametro);
      // La tabla no admite dos filas con el mismo Concepto en la sección: las reglas que se repiten
      // usan conceptos que empiezan igual ('Copia por documento - Retiros', '... - Otrosí')
      if (r.Concepto.startsWith(P.PRESELECCION)) {
        preseleccion = preseleccion || {};
        if (normalizar(r.Condicion)) preseleccion[normalizar(r.Condicion)] = valor.trim().toUpperCase();
      } else if (r.Concepto.startsWith(P.COPIA_DOCUMENTO)) {
        copiasDocumento = copiasDocumento || [];
        copiasDocumento.push({ prefijos: lista(r.Condicion).map(x => x.toUpperCase()), destinos: lista(valor) });
      } else {
        mapa[r.Concepto] = valor;
      }
    });
    cache = {
      t: Date.now(),
      data: { mapa, preseleccion: preseleccion || DEFAULT_PRESELECCION, copiasDocumento: copiasDocumento || DEFAULT_COPIAS_DOCUMENTO },
    };
    return cache.data;
  } catch (err) {
    console.error('[configLogysign] No se pudieron leer los parámetros, se usan los valores por defecto:', err.message);
    return { mapa: {}, preseleccion: DEFAULT_PRESELECCION, copiasDocumento: DEFAULT_COPIAS_DOCUMENTO };
  }
}

function valor(p, concepto) {
  return Object.prototype.hasOwnProperty.call(p.mapa, concepto) ? p.mapa[concepto] : DEFAULTS[concepto];
}

function dias(p, concepto) {
  const n = parseFloat(String(valor(p, concepto) || '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 365) : parseFloat(DEFAULTS[concepto]);
}

// Configuración ya interpretada (listas de prefijos en mayúscula, roles normalizados)
async function obtenerConfigLogysign() {
  const p = await obtenerParametros();
  const prefijos = c => lista(valor(p, c)).map(x => x.toUpperCase());
  const roles = c => lista(valor(p, c)).map(normalizar);
  return {
    notificaciones: ['1', 'si', 'true', 'yes'].includes(normalizar(valor(p, P.HABILITAR))),
    diasEnlace: dias(p, P.DIAS_ENLACE),
    diasDescuento: dias(p, P.DIAS_DESCUENTO),
    docsCausa: prefijos(P.DOCS_CAUSA),
    docsCausaEditable: prefijos(P.DOCS_CAUSA_EDITABLE),
    docsConDescuento: prefijos(P.DOCS_CON_DESCUENTO),
    docsSinResponsables: prefijos(P.DOCS_SIN_RESPONSABLES),
    rolesVerTodo: roles(P.ROLES_VER_TODO),
    rolesVerIngreso: roles(P.ROLES_VER_INGRESO),
    clasificacionIngreso: String(valor(p, P.CLASIF_INGRESO) || '').trim(),
    rolesCausa: roles(P.ROLES_CAUSA),
    preseleccion: p.preseleccion,
    rolesNoFirma: roles(P.ROLES_NO_FIRMA),
    docSoporte: String(valor(p, P.DOC_SOPORTE) || DEFAULTS[P.DOC_SOPORTE]).trim().toUpperCase(),
    rolesEliminarPendientes: roles(P.ROLES_ELIMINAR_PENDIENTES),
    rolesResponsables: roles(P.ROLES_RESPONSABLES),
    rolesRegional: roles(P.ROLES_REGIONAL),
    copiasDocumento: p.copiasDocumento,
    // "|" separa los renglones de la anotación dentro del cuadro de firma
    textoNoFirma: String(valor(p, P.TEXTO_NO_FIRMA) || DEFAULTS[P.TEXTO_NO_FIRMA]).split('|').map(x => x.trim()).join('\n'),
  };
}

const rolEn = (listaRoles, rol) => !!normalizar(rol) && listaRoles.includes(normalizar(rol));
const prefijoEn = (listaPrefijos, prefijo) => !!prefijo && listaPrefijos.includes(String(prefijo).trim().toUpperCase());

// Qué registros ve el rol: todos, los de la clasificación de ingreso + los propios, o solo los propios
function alcanceRegistros(cfg, rol) {
  if (rolEn(cfg.rolesVerTodo, rol)) return 'todo';
  if (rolEn(cfg.rolesVerIngreso, rol) && cfg.clasificacionIngreso) return 'ingreso';
  return 'propios';
}

const diasMs = d => Math.round(d * 24 * 3600000);

// Usuario con acceso a Cloud Docs › LogySign en Maestro_Menu ({ ID, Nombre, Rol, Email }) o null
async function usuarioLogysign(usuarioId) {
  if (!usuarioId) return null;
  const [rows] = await pool.execute('SELECT ID, Nombre, Rol, Email FROM Maestro_Usuarios WHERE ID = ?', [usuarioId]);
  if (!rows.length) return null;
  const acceso = await accesoSeccion('clouddocs', rows[0].Rol || '', 'LogySign');
  return acceso == null ? null : rows[0];
}

module.exports = {
  obtenerConfigLogysign,
  alcanceRegistros,
  rolEn,
  prefijoEn,
  diasMs,
  normalizar,
  usuarioLogysign,
  PARAMETROS_LOGYSIGN: P,
};
