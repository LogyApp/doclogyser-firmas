const pool = require('./db');
const { normalizar } = require('./maestroMenu');

// ── Parámetros de los formatos de asistencia (Config_Parametros) ──────────────
// Los usan dos pestañas sobre las mismas tablas (Dynamic_formato_asistencia, columna modulo):
//   * SST > Participación          (Modulo 'sst',       Seccion 'Participación')
//   * TalentHub > Registro Asistencia (Modulo 'talenthub', Seccion 'Registro Asistencia'),
//     que además tiene la Evaluación de Eficacia de la formación.
// Ver la pestaña y qué operaciones lo decide Maestro_Menu (computarAccesoSst / computarAccesoTalenthub).
// Aquí: qué puede hacer cada rol, datos del formato y textos del PDF.
// Los conceptos "cualquier formato" son para formatos de otros usuarios: quien creó el
// formato siempre puede editarlo, generar su PDF, enviar enlaces y eliminarlo (sin PDF).
// Si una fila no existe se usa el valor por defecto (el comportamiento anterior).

const P = {
  CREAR:            'Roles que pueden crear formatos de participación',
  EDITAR:           'Roles que pueden editar cualquier formato de participación',
  ELIMINAR:         'Roles que pueden eliminar cualquier formato de participación',
  GENERAR:          'Roles que pueden generar el PDF de cualquier formato de participación',
  ENLACES:          'Roles que pueden enviar enlaces de firma de cualquier formato de participación',
  EDITAR_FIRMADO:   'Roles que pueden editar y regenerar PDF de formatos firmados en Participación',
  ELIMINAR_FIRMADO: 'Roles que pueden eliminar formatos firmados en Participación',
  HABILITAR:        'Habilitar notificaciones de correo en Participación',
  CODIGO:           'Código del formato de participación',
  VERSION:          'Versión del formato de participación',
  FECHA:            'Fecha del formato de participación',
  NOTA:             'Anotación en el PDF para asistentes sin firma',
};

const DEFAULTS = {
  [P.CREAR]:            'AdmSst, AnaSst, AuxSst, Calidad, LiderSst, Sistema',
  [P.EDITAR]:           'Sistema',
  [P.ELIMINAR]:         'Sistema, AdmSst, LiderSst',
  [P.GENERAR]:          'Sistema',
  [P.ENLACES]:          'Sistema, AdmSst, LiderSst',
  [P.EDITAR_FIRMADO]:   'Sistema',
  [P.ELIMINAR_FIRMADO]: 'Sistema',
  [P.HABILITAR]:        '1',
  [P.CODIGO]:           'SST-F-003',
  [P.VERSION]:          '03',
  [P.FECHA]:            '28/05/2026',
  [P.NOTA]:             'Soportado por correo electrónico',
};

// TalentHub > Registro Asistencia. Código, versión y fecha salen de Maestro_Plantillas
// (registro_asistencia_th); los de aquí solo se usan si la plantilla no los tiene.
const P_TH = {
  CREAR:             'Roles que pueden crear registros de asistencia',
  EDITAR:            'Roles que pueden editar cualquier registro de asistencia',
  ELIMINAR:          'Roles que pueden eliminar cualquier registro de asistencia',
  GENERAR:           'Roles que pueden generar el PDF de cualquier registro de asistencia',
  ENLACES:           'Roles que pueden enviar enlaces de firma de cualquier registro de asistencia',
  EDITAR_FIRMADO:    'Roles que pueden editar y regenerar el PDF de registros de asistencia con PDF generado',
  ELIMINAR_FIRMADO:  'Roles que pueden eliminar registros de asistencia con PDF generado',
  EVALUAR:           'Roles que pueden registrar la evaluación de eficacia de cualquier registro de asistencia',
  EDITAR_EVALUADO:   'Roles que pueden editar y regenerar el PDF de registros de asistencia con evaluación de eficacia',
  ELIMINAR_EVALUADO: 'Roles que pueden eliminar registros de asistencia con evaluación de eficacia',
  HABILITAR:         'Habilitar notificaciones de correo en Registro Asistencia',
  CODIGO:            'Código del formato de registro de asistencia',
  VERSION:           'Versión del formato de registro de asistencia',
  FECHA:             'Fecha del formato de registro de asistencia',
  NOTA:              'Anotación en el PDF para asistentes sin firma',
};

// Mismos roles que ven la pestaña Sociodemografica (Maestro_Menu, accesos 1, 2 y 3)
const ROLES_TH_CREAR = 'Contratación, CoorSelección, Directorth, Selección, Sistema, Juridica, Inventario, LiderSst, Nomina, '
  + 'Calidad, Generalista, AdmSst, Asistencial, Selección Centro, AuxiliarR, CoordinadorR, AuxSst, Auxiliar, Coordinador, AnaSst';

const DEFAULTS_TH = {
  [P_TH.CREAR]:             ROLES_TH_CREAR,
  [P_TH.EDITAR]:            'Sistema',
  [P_TH.ELIMINAR]:          'Sistema',
  [P_TH.GENERAR]:           'Sistema',
  [P_TH.ENLACES]:           'Sistema',
  [P_TH.EDITAR_FIRMADO]:    'Sistema',
  [P_TH.ELIMINAR_FIRMADO]:  'Sistema',
  [P_TH.EVALUAR]:           'Sistema',
  [P_TH.EDITAR_EVALUADO]:   'Sistema',
  [P_TH.ELIMINAR_EVALUADO]: 'Sistema',
  [P_TH.HABILITAR]:         '1',
  [P_TH.CODIGO]:            'TH-R-013',
  [P_TH.VERSION]:           '3',
  [P_TH.FECHA]:             '03/11/2026',
  [P_TH.NOTA]:              'Soportado por correo electrónico',
};

const PERFILES = {
  sst:       { modulo: 'sst',       seccion: 'Participación',       P,          DEFAULTS },
  talenthub: { modulo: 'talenthub', seccion: 'Registro Asistencia', P: P_TH,    DEFAULTS: DEFAULTS_TH },
};

function perfilDe(modulo) {
  return PERFILES[String(modulo || 'sst').toLowerCase()] || PERFILES.sst;
}

// Los parámetros llevan su módulo (propiedad oculta) para resolver conceptos y valores por defecto.
function perfilDeParams(params) {
  return perfilDe(params && params.__modulo);
}

async function obtenerParametrosParticipacion(modulo = 'sst') {
  const perfil = perfilDe(modulo);
  const params = {};
  Object.defineProperty(params, '__modulo', { value: perfil.modulo, enumerable: false });
  try {
    const [rows] = await pool.execute(
      'SELECT `Seccion`, `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ?',
      [perfil.modulo]
    );
    rows
      .filter((r) => normalizar(r.Seccion) === normalizar(perfil.seccion))
      .forEach((r) => { params[r.Concepto] = r.Parametro == null ? '' : String(r.Parametro); });
  } catch (err) {
    console.error('[configParticipacion] No se pudieron leer los parámetros, se usan los valores por defecto:', err.message);
  }
  return params;
}

function valor(params, clave) {
  const { P: conceptos, DEFAULTS: defectos } = perfilDeParams(params);
  const concepto = conceptos[clave];
  if (!concepto) return '';
  return Object.prototype.hasOwnProperty.call(params || {}, concepto) ? params[concepto] : defectos[concepto];
}

function rolEnLista(params, clave, rol) {
  const buscado = normalizar(rol);
  return !!buscado && String(valor(params, clave) || '').split(',').map(normalizar).filter(Boolean).includes(buscado);
}

// Permisos del rol para la pantalla y el servidor. Los de evaluación de eficacia solo
// existen en TalentHub (en SST quedan en false).
async function permisosParticipacion(rol, params, modulo = 'sst') {
  const p = params || await obtenerParametrosParticipacion(modulo);
  return {
    crear:              rolEnLista(p, 'CREAR', rol),
    editarCualquiera:   rolEnLista(p, 'EDITAR', rol),
    eliminarCualquiera: rolEnLista(p, 'ELIMINAR', rol),
    generarCualquiera:  rolEnLista(p, 'GENERAR', rol),
    enlacesCualquiera:  rolEnLista(p, 'ENLACES', rol),
    editarFirmado:      rolEnLista(p, 'EDITAR_FIRMADO', rol),
    eliminarFirmado:    rolEnLista(p, 'ELIMINAR_FIRMADO', rol),
    evaluarCualquiera:  rolEnLista(p, 'EVALUAR', rol),
    editarEvaluado:     rolEnLista(p, 'EDITAR_EVALUADO', rol),
    eliminarEvaluado:   rolEnLista(p, 'ELIMINAR_EVALUADO', rol),
  };
}

function notificacionesHabilitadas(params) {
  return ['1', 'true', 'si', 'yes'].includes(normalizar(valor(params, 'HABILITAR')));
}

function datosFormato(params) {
  const { P: conceptos, DEFAULTS: defectos } = perfilDeParams(params);
  return {
    codigo:  valor(params, 'CODIGO') || '',
    version: valor(params, 'VERSION') || '',
    fecha:   valor(params, 'FECHA') || '',
    nota:    valor(params, 'NOTA') || defectos[conceptos.NOTA],
  };
}

module.exports = {
  obtenerParametrosParticipacion,
  permisosParticipacion,
  notificacionesHabilitadas,
  datosFormato,
  PARAMETROS_PARTICIPACION: P,
  DEFAULTS_PARTICIPACION: DEFAULTS,
  PARAMETROS_REGISTRO_ASISTENCIA: P_TH,
  DEFAULTS_REGISTRO_ASISTENCIA: DEFAULTS_TH,
};
