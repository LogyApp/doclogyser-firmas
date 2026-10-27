const pool = require('./db');
const { normalizar } = require('./maestroMenu');

// ── Parámetros de SST > Participación (Config_Parametros, Modulo 'sst', Seccion 'Participación') ──
// Ver la pestaña y qué operaciones lo decide Maestro_Menu (computarAccesoSst).
// Aquí: qué puede hacer cada rol, datos del formato y textos del PDF.
// Los conceptos "cualquier formato" son para formatos de otros usuarios: quien creó el
// formato siempre puede editarlo, generar su PDF, enviar enlaces y eliminarlo (sin PDF).
// Si una fila no existe se usa el valor por defecto (el comportamiento anterior).
const MODULO = 'sst';
const SECCION = 'Participación';

const P = {
  CREAR:      'Roles que pueden crear formatos de participación',
  EDITAR:     'Roles que pueden editar cualquier formato de participación',
  ELIMINAR:   'Roles que pueden eliminar cualquier formato de participación',
  GENERAR:    'Roles que pueden generar el PDF de cualquier formato de participación',
  ENLACES:    'Roles que pueden enviar enlaces de firma de cualquier formato de participación',
  HABILITAR:  'Habilitar notificaciones de correo en Participación',
  CODIGO:     'Código del formato de participación',
  VERSION:    'Versión del formato de participación',
  FECHA:      'Fecha del formato de participación',
  NOTA:       'Anotación en el PDF para asistentes sin firma',
};

const DEFAULTS = {
  [P.CREAR]:     'AdmSst, AnaSst, AuxSst, Calidad, LiderSst, Sistema',
  [P.EDITAR]:    'Sistema',
  [P.ELIMINAR]:  'Sistema, AdmSst, LiderSst',
  [P.GENERAR]:   'Sistema',
  [P.ENLACES]:   'Sistema, AdmSst, LiderSst',
  [P.HABILITAR]: '1',
  [P.CODIGO]:    'SST-F-003',
  [P.VERSION]:   '02',
  [P.FECHA]:     '28/05/2026',
  [P.NOTA]:      'Soportado por correo electrónico',
};

async function obtenerParametrosParticipacion() {
  const params = {};
  try {
    const [rows] = await pool.execute(
      'SELECT `Seccion`, `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ?',
      [MODULO]
    );
    rows
      .filter((r) => normalizar(r.Seccion) === normalizar(SECCION))
      .forEach((r) => { params[r.Concepto] = r.Parametro == null ? '' : String(r.Parametro); });
  } catch (err) {
    console.error('[configParticipacion] No se pudieron leer los parámetros, se usan los valores por defecto:', err.message);
  }
  return params;
}

function valor(params, concepto) {
  return Object.prototype.hasOwnProperty.call(params || {}, concepto) ? params[concepto] : DEFAULTS[concepto];
}

function rolEnLista(params, concepto, rol) {
  const buscado = normalizar(rol);
  return !!buscado && String(valor(params, concepto) || '').split(',').map(normalizar).filter(Boolean).includes(buscado);
}

// Permisos del rol para la pantalla y el servidor.
async function permisosParticipacion(rol, params) {
  const p = params || await obtenerParametrosParticipacion();
  return {
    crear:              rolEnLista(p, P.CREAR, rol),
    editarCualquiera:   rolEnLista(p, P.EDITAR, rol),
    eliminarCualquiera: rolEnLista(p, P.ELIMINAR, rol),
    generarCualquiera:  rolEnLista(p, P.GENERAR, rol),
    enlacesCualquiera:  rolEnLista(p, P.ENLACES, rol),
  };
}

function notificacionesHabilitadas(params) {
  return ['1', 'true', 'si', 'yes'].includes(normalizar(valor(params, P.HABILITAR)));
}

function datosFormato(params) {
  return {
    codigo:  valor(params, P.CODIGO) || '',
    version: valor(params, P.VERSION) || '',
    fecha:   valor(params, P.FECHA) || '',
    nota:    valor(params, P.NOTA) || DEFAULTS[P.NOTA],
  };
}

module.exports = {
  obtenerParametrosParticipacion,
  permisosParticipacion,
  notificacionesHabilitadas,
  datosFormato,
  PARAMETROS_PARTICIPACION: P,
  DEFAULTS_PARTICIPACION: DEFAULTS,
};
