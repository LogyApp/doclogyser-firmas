const pool = require('./db');
const { seccionesDelRol, normalizar } = require('./maestroMenu');

// Módulo Configuración. Ver cada pestaña lo decide Maestro_Menu (Modulo 'configuracion',
// secciones Parametros y Visual); crear, editar y eliminar dentro de ellas lo decide
// Config_Parametros (configuracion / Parametros y configuracion / Visual).
// Si la fila no existe se usa solo Sistema.
const MODULO = 'configuracion';
const ROL_PROTEGIDO = 'Sistema';

const PERMISOS = {
  Parametros: {
    editar: 'Roles que pueden crear y editar parámetros',
    eliminar: 'Roles que pueden eliminar parámetros',
  },
  Visual: {
    editar: 'Roles que pueden crear y editar el menú',
    eliminar: 'Roles que pueden eliminar del menú',
  },
};

function listaRoles(texto) {
  return String(texto == null ? '' : texto).split(',').map((s) => s.trim()).filter(Boolean);
}

function rolEnLista(texto, rol) {
  const buscado = normalizar(rol);
  return !!buscado && listaRoles(texto).some((r) => normalizar(r) === buscado);
}

async function leerPermisos() {
  try {
    const [rows] = await pool.execute(
      'SELECT `Seccion`, `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ?',
      [MODULO]
    );
    return rows;
  } catch (err) {
    console.error('[configuracion] No se pudieron leer los permisos, se usa solo Sistema:', err.message);
    return [];
  }
}

// { parametros: { ver, editar, eliminar }, visual: { ver, editar, eliminar } }
async function permisosDelRol(rol, secciones) {
  const filas = await leerPermisos();
  const valor = (seccion, concepto) => {
    const fila = filas.find((f) => normalizar(f.Seccion) === normalizar(seccion) && normalizar(f.Concepto) === normalizar(concepto));
    return fila ? fila.Parametro : ROL_PROTEGIDO;
  };
  const ve = (seccion) => secciones.some((s) => normalizar(s.seccion) === normalizar(seccion));
  const resultado = {};
  Object.entries(PERMISOS).forEach(([seccion, def]) => {
    const ver = ve(seccion);
    resultado[seccion.toLowerCase()] = {
      ver,
      editar: ver && rolEnLista(valor(seccion, def.editar), rol),
      eliminar: ver && rolEnLista(valor(seccion, def.eliminar), rol),
    };
  });
  return resultado;
}

// Usuario, rol y permisos en el módulo; null si no ve ninguna pestaña.
async function computarAccesoConfiguracion(usuarioId) {
  if (!usuarioId) return null;
  const [uRows] = await pool.execute('SELECT ID, Nombre, Rol FROM Maestro_Usuarios WHERE ID = ?', [usuarioId]);
  if (!uRows.length) return null;
  const usuario = uRows[0];
  const secciones = await seccionesDelRol(MODULO, usuario.Rol || '');
  if (!secciones.length) return null;
  return {
    usuarioId: usuario.ID,
    usuarioNombre: usuario.Nombre || usuario.ID,
    rol: usuario.Rol || '',
    permisos: await permisosDelRol(usuario.Rol || '', secciones),
  };
}

module.exports = { computarAccesoConfiguracion, listaRoles, rolEnLista, MODULO, ROL_PROTEGIDO };
