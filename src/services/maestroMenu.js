const pool = require('./db');

// Permisos por pestaña de todos los módulos (Maestro_Menu, migraciones/2026-10-25_maestro_menu.sql).
// Una fila por Modulo + Seccion + nivel de Acceso, con los roles separados por coma; la
// comparación de roles y secciones no distingue mayúsculas ni tildes.
// Acceso: 1 = todo, 2 = su regional, 3 = sus operaciones; 4, 5 y 6 = igual pero solo con las
// categorías del acceso restringido.
// Rol = 'Todos': la fila aplica a cualquier usuario registrado, sin importar su rol.
const ROL_TODOS = 'todos';

// Tabla anterior de cada módulo: solo se usa si Maestro_Menu no se puede leer.
const TABLA_ANTERIOR = {
  clouddocs: 'Maestro_Menu_Documentos',
  facturacion: 'Maestro_Menu_Facturacion',
  inventario: 'Maestro_Menu_Inventario',
  nomina: 'Maestro_Menu_Nomina',
  sst: 'Maestro_Menu_Sst',
  talenthub: 'Maestro_Menu_Talenthub',
};

function normalizar(valor) {
  return String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

// Si un rol quedó en dos filas de la misma sección, gana el acceso más amplio:
// primero el alcance (1 todo, 2 regional, 3 operaciones) y luego sin restricción de categorías.
function rangoAcceso(codigo) {
  const base = codigo > 3 ? codigo - 3 : codigo;
  return base * 2 + (codigo > 3 ? 1 : 0);
}

function rolEnFila(fila, buscado) {
  return String(fila.Rol || '').split(',').some((r) => {
    const n = normalizar(r);
    return n === buscado || n === ROL_TODOS;
  });
}

async function leerFilas(modulo) {
  try {
    const [rows] = await pool.execute(
      'SELECT Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono FROM Maestro_Menu WHERE Modulo = ?',
      [modulo]
    );
    return rows;
  } catch (err) {
    const tabla = TABLA_ANTERIOR[modulo];
    if (!tabla) throw err;
    console.error(`[maestroMenu] No se pudo leer Maestro_Menu (${modulo}), se usa ${tabla}:`, err.message);
    const [rows] = await pool.execute(`SELECT \`Sección\` AS Seccion, Rol, Acceso FROM ${tabla}`);
    return rows;
  }
}

// Secciones del módulo a las que entra el rol, en el orden del menú:
// [{ seccion, acceso, etiqueta, url, orden, icono }]
async function seccionesDelRol(modulo, rol) {
  if (!String(rol || '').trim()) return [];
  const buscado = normalizar(rol);
  const filas = await leerFilas(modulo);
  const porSeccion = new Map();
  filas.forEach((f) => {
    if (!rolEnFila(f, buscado)) return;
    const clave = normalizar(f.Seccion);
    const actual = porSeccion.get(clave);
    if (actual) {
      console.warn(`[maestroMenu] El rol ${rol} está en dos filas de ${modulo} / ${f.Seccion} (accesos ${actual.acceso} y ${f.Acceso}); se usa el más amplio.`);
      if (rangoAcceso(Number(f.Acceso)) >= rangoAcceso(actual.acceso)) return;
    }
    porSeccion.set(clave, {
      seccion: f.Seccion,
      acceso: Number(f.Acceso) || 1,
      etiqueta: f.Etiqueta || f.Seccion,
      url: f.Url || '',
      orden: f.Orden == null ? 999 : Number(f.Orden),
      icono: f.Icono || '',
    });
  });
  return [...porSeccion.values()].sort((a, b) => a.orden - b.orden);
}

// Código de acceso del rol en una sección, o null si no tiene acceso.
async function accesoSeccion(modulo, rol, seccion) {
  const buscada = normalizar(seccion);
  const fila = (await seccionesDelRol(modulo, rol)).find((s) => normalizar(s.seccion) === buscada);
  return fila ? fila.acceso : null;
}

// ── Menú OTROS ──────────────────────────────────────────────────────────────
// Nombre y orden de los módulos en el menú (solo presentación). Qué enlaces ve cada rol y en
// qué orden lo decide Maestro_Menu; un módulo que no esté aquí aparece al final con su nombre.
const MODULOS_MENU = [
  ['nomina', 'Nómina'],
  ['facturacion', 'Facturación'],
  ['sst', 'SST'],
  ['talenthub', 'TalentHub'],
  ['clouddocs', 'Cloud Docs'],
  ['inventario', 'Inventario'],
  ['directorio', 'Directorio Corporativo'],
];

// Módulos y enlaces del menú OTROS para un rol: [{ modulo, nombre, icono, items: [{ etiqueta, url }] }]
async function menuDelRol(rol) {
  if (!String(rol || '').trim()) return [];
  const buscado = normalizar(rol);
  const [filas] = await pool.execute(
    'SELECT Modulo, Seccion, Rol, Etiqueta, Url, Orden, Icono FROM Maestro_Menu WHERE Url IS NOT NULL AND Url <> \'\''
  );
  const porModulo = new Map();
  filas.filter((f) => rolEnFila(f, buscado)).forEach((f) => {
    const clave = normalizar(f.Modulo);
    if (!porModulo.has(clave)) porModulo.set(clave, { modulo: f.Modulo, icono: '', secciones: new Map() });
    const grupo = porModulo.get(clave);
    const sec = normalizar(f.Seccion);
    if (grupo.secciones.has(sec)) return; // el rol puede estar en varias filas (niveles) de la misma sección
    grupo.secciones.set(sec, { etiqueta: f.Etiqueta || f.Seccion, url: f.Url, orden: f.Orden == null ? 999 : Number(f.Orden), icono: f.Icono || '' });
  });
  const posicion = (modulo) => {
    const i = MODULOS_MENU.findIndex(([m]) => m === normalizar(modulo));
    return i < 0 ? MODULOS_MENU.length : i;
  };
  return [...porModulo.values()]
    .sort((a, b) => posicion(a.modulo) - posicion(b.modulo))
    .map((g) => {
      const items = [...g.secciones.values()].sort((a, b) => a.orden - b.orden);
      const nombre = (MODULOS_MENU.find(([m]) => m === normalizar(g.modulo)) || [])[1] || g.modulo;
      return { modulo: g.modulo, nombre, icono: (items.find((i) => i.icono) || {}).icono || '', items: items.map(({ etiqueta, url }) => ({ etiqueta, url })) };
    });
}

module.exports = { seccionesDelRol, accesoSeccion, menuDelRol, normalizar };
