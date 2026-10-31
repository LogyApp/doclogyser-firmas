const pool = require('./db');
const { computarAccesoSst } = require('./accesoSst');
const { normalizar } = require('./maestroMenu');

// Quién puede crear, eliminar y gestionar plantillas en las pestañas de SST
// (Config_Parametros, Modulo 'sst', una Sección por pestaña con el mismo nombre de Maestro_Menu).
// Ver o no la pestaña lo decide Maestro_Menu; esto decide qué puede hacer adentro.
// Si la fila no existe se usan los roles que tenía el código.
const MODULO = 'sst';
const ROLES_ESCRITURA_ANTERIOR = 'AdmSst, AnaSst, AuxSst, LiderSst, Sistema';

const PERMISOS_SST = {
  'Evaluación SST': {
    clave: 'ev',
    crear: 'Roles que pueden crear evaluaciones en SST',
    eliminar: 'Roles que pueden eliminar evaluaciones en SST',
    editarFirmado: 'Roles que pueden editar y regenerar PDF de evaluaciones firmadas en SST',
    eliminarFirmado: 'Roles que pueden eliminar evaluaciones firmadas en SST',
  },
  'Capacitación SST': {
    clave: 'cap',
    crear: 'Roles que pueden crear capacitaciones en SST',
    eliminar: 'Roles que pueden eliminar capacitaciones en SST',
    plantillas: 'Roles que pueden gestionar plantillas de capacitación',
    editarFirmado: 'Roles que pueden editar y regenerar PDF de capacitaciones firmadas en SST',
    eliminarFirmado: 'Roles que pueden eliminar capacitaciones firmadas en SST',
  },
  'Prueba de Consumo': {
    clave: 'pc',
    crear: 'Roles que pueden crear pruebas de consumo',
    eliminar: 'Roles que pueden eliminar pruebas de consumo',
    editarFirmado: 'Roles que pueden editar y regenerar PDF de pruebas de consumo firmadas',
    eliminarFirmado: 'Roles que pueden eliminar pruebas de consumo firmadas',
  },
  'Compromiso SST': {
    clave: 'csst',
    crear: 'Roles que pueden crear compromisos SST',
    eliminar: 'Roles que pueden eliminar compromisos SST',
  },
  ATS: {
    clave: 'ats',
    crear: 'Roles que pueden registrar ATS en SST',
    eliminar: 'Roles que pueden eliminar ATS en SST',
  },
  'Participación': {
    clave: 'part',
    crear: 'Roles que pueden crear formatos de participación',
    eliminar: 'Roles que pueden eliminar cualquier formato de participación',
    editarFirmado: 'Roles que pueden editar y regenerar PDF de formatos firmados en Participación',
    eliminarFirmado: 'Roles que pueden eliminar formatos firmados en Participación',
  },
};

const DEFECTO_POR_ACCION = {
  crear: ROLES_ESCRITURA_ANTERIOR,
  eliminar: ROLES_ESCRITURA_ANTERIOR,
  plantillas: 'LiderSst, Sistema',
  editarFirmado: 'Sistema',
  eliminarFirmado: 'Sistema',
};

async function leerParametros() {
  try {
    const [rows] = await pool.execute(
      'SELECT `Seccion`, `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ?',
      [MODULO]
    );
    return rows;
  } catch (err) {
    console.error('[configSst] No se pudieron leer los parámetros de SST, se usan los valores por defecto:', err.message);
    return [];
  }
}

function rolesDe(filas, seccion, accion) {
  const concepto = (PERMISOS_SST[seccion] || {})[accion];
  if (!concepto) return [];
  const fila = filas.find((f) => normalizar(f.Seccion) === normalizar(seccion) && normalizar(f.Concepto) === normalizar(concepto));
  const texto = fila ? String(fila.Parametro == null ? '' : fila.Parametro) : DEFECTO_POR_ACCION[accion];
  return texto.split(',').map((s) => s.trim()).filter(Boolean);
}

function rolEn(roles, rol) {
  const buscado = normalizar(rol);
  return !!buscado && roles.some((r) => normalizar(r) === buscado);
}

// ¿El rol puede hacer la acción ('crear', 'eliminar', 'plantillas') en la pestaña?
async function rolPuedeSst(rol, seccion, accion) {
  return rolEn(rolesDe(await leerParametros(), seccion, accion), rol);
}

// Acceso del usuario si ve la pestaña (Maestro_Menu) y su rol puede hacer la acción; si no, null.
async function autorizarAccionSst(usuario, seccion, accion) {
  if (!usuario) return null;
  const acceso = await computarAccesoSst(usuario, seccion);
  if (!acceso) return null;
  return (await rolPuedeSst(acceso.rol, seccion, accion)) ? acceso : null;
}

// Permisos del rol para la pantalla: { ev: { crear, eliminar, editarFirmado, eliminarFirmado }, cap: { crear, eliminar, plantillas }, ... }
async function permisosSstDelRol(rol) {
  const filas = await leerParametros();
  const permisos = {};
  Object.entries(PERMISOS_SST).forEach(([seccion, def]) => {
    permisos[def.clave] = {};
    ['crear', 'eliminar', 'plantillas', 'editarFirmado', 'eliminarFirmado'].forEach((accion) => {
      if (def[accion]) permisos[def.clave][accion] = rolEn(rolesDe(filas, seccion, accion), rol);
    });
  });
  return permisos;
}

module.exports = { rolPuedeSst, autorizarAccionSst, permisosSstDelRol, PERMISOS_SST };
