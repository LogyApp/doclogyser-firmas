/**
 * manualFunciones.js
 * Manual de funciones por cargo (formato SST-MA-002) — Talent Hub › Cargos y Funciones.
 *
 * Tablas (migraciones/2026-11-13_cargos_y_funciones.sql):
 *  - Config_Cargo_Laboral: catálogo de cargos (ya existía; Nómina, Talent Hub y Actas lo usan).
 *  - Config_Cargo_Manual: ficha del cargo (borrador de trabajo).
 *  - Config_Cargo_Funciones: renglones por sección (RESPONSABILIDAD, FUNCION, SST). Cargo = '__SST_COMUN__'
 *    guarda las responsabilidades SST comunes que heredan los cargos con UsaSstComun = 1.
 *  - Config_Cargo_Manual_Versiones: control de cambios. Al publicar se guarda una copia del manual (JSON):
 *    esa copia es la que se usa al firmar, así lo que se edite después no cambia lo ya publicado.
 *
 * Quién edita y publica: Config_Parametros talenthub / Cargos y Funciones
 * "Roles que pueden editar y publicar manuales de funciones" (por defecto Sistema, CoorSelección).
 * Quién ve la pestaña: Maestro_Menu (talenthub / CargosFunciones).
 */

const pool = require('./db');

const CARGO_COMUN = '__SST_COMUN__';
const SECCIONES = { responsabilidades: 'RESPONSABILIDAD', funciones: 'FUNCION', sst: 'SST' };
const P_EDITORES = 'Roles que pueden editar y publicar manuales de funciones';
const EDITORES_DEFECTO = 'Sistema, CoorSelección';
const MAX_TEXTO = 2000;
const MAX_RENGLONES = 150;

const CAMPOS_FICHA = {
  ubicacion: { col: 'Ubicacion', max: 150 },
  jefeInmediato: { col: 'JefeInmediato', max: 150 },
  nivelJerarquico: { col: 'NivelJerarquico', max: 50 },
  objetivo: { col: 'Objetivo', max: 4000 },
  autoridad: { col: 'Autoridad', max: 4000 },
  edad: { col: 'Edad', max: 200 },
  genero: { col: 'Genero', max: 100 },
  educacion: { col: 'Educacion', max: 300 },
  formacion: { col: 'Formacion', max: 4000 },
  experiencia: { col: 'Experiencia', max: 300 },
  cargosQueReportan: { col: 'CargosQueReportan', max: 500 },
  aQuienReporta: { col: 'AQuienReporta', max: 500 },
  revisadoPor: { col: 'RevisadoPor', max: 150 },
  revisadoCargo: { col: 'RevisadoCargo', max: 150 },
  aprobadoPor: { col: 'AprobadoPor', max: 150 },
  aprobadoCargo: { col: 'AprobadoCargo', max: 150 },
};

function normalizar(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function errorValidacion(msg) {
  return Object.assign(new Error(msg), { validacion: true });
}

function hoyBogota() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

function fechaIso(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function fechaLegible(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
}

function escHtml(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Permisos ────────────────────────────────────────────────────────────────
async function puedeEditarManuales(rol) {
  let lista = EDITORES_DEFECTO;
  try {
    const [rows] = await pool.execute(
      "SELECT Parametro FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Cargos y Funciones' AND Concepto = ? LIMIT 1",
      [P_EDITORES]
    );
    if (rows.length) lista = String(rows[0].Parametro || '');
  } catch (_) { /* sin fila: valor por defecto */ }
  const r = normalizar(rol);
  return !!r && lista.split(',').map(normalizar).filter(Boolean).includes(r);
}

// ── Listado de cargos ──────────────────────────────────────────────────────
async function listarCargos() {
  const [rows] = await pool.execute(`
    SELECT c.Cargo AS cargo, c.\`Grupo Nomina\` AS grupoNomina, c.Notificar AS notificar,
           COALESCE(v.activos, 0) AS activos, COALESCE(v.retirados, 0) AS retirados,
           (m.Cargo IS NOT NULL) AS tieneFicha, COALESCE(m.CambiosSinPublicar, 0) AS cambiosSinPublicar,
           m.FechaActualiza AS fechaActualiza, m.UsuarioActualiza AS usuarioActualiza,
           pub.version AS versionPublicada, pv.FechaEmision AS fechaEmision,
           COALESCE(f.renglones, 0) AS renglones
      FROM Config_Cargo_Laboral c
      LEFT JOIN (
        SELECT TRIM(Cargo) AS cargo, SUM(Estado = 'Activo') AS activos, SUM(Estado = 'Retirado') AS retirados
          FROM \`Maestro_Vinculación\` WHERE Cargo IS NOT NULL GROUP BY TRIM(Cargo)
      ) v ON v.cargo = TRIM(c.Cargo)
      LEFT JOIN Config_Cargo_Manual m ON m.Cargo = c.Cargo
      LEFT JOIN (
        SELECT Cargo, MAX(Version) AS version FROM Config_Cargo_Manual_Versiones
         WHERE Contenido IS NOT NULL GROUP BY Cargo
      ) pub ON pub.Cargo = c.Cargo
      LEFT JOIN Config_Cargo_Manual_Versiones pv ON pv.Cargo = pub.Cargo AND pv.Version = pub.version
      LEFT JOIN (SELECT Cargo, COUNT(*) AS renglones FROM Config_Cargo_Funciones GROUP BY Cargo) f ON f.Cargo = c.Cargo
     ORDER BY c.Cargo`);
  return rows.map(r => {
    const versionPublicada = r.versionPublicada == null ? null : Number(r.versionPublicada);
    const cambios = Number(r.cambiosSinPublicar) === 1;
    let estado = 'Sin manual';
    if (versionPublicada) estado = cambios ? 'Cambios sin publicar' : 'Publicado';
    else if (Number(r.tieneFicha) === 1 || Number(r.renglones) > 0) estado = 'Borrador';
    return {
      cargo: r.cargo,
      grupoNomina: r.grupoNomina || '',
      notificar: r.notificar == null ? null : Number(r.notificar),
      activos: Number(r.activos) || 0,
      retirados: Number(r.retirados) || 0,
      estado,
      versionPublicada,
      fechaEmision: fechaIso(r.fechaEmision),
      fechaActualiza: r.fechaActualiza || null,
      usuarioActualiza: r.usuarioActualiza || '',
    };
  });
}

// ── Detalle (borrador de trabajo) ──────────────────────────────────────────
async function obtenerCargoCatalogo(cargo) {
  const [rows] = await pool.execute('SELECT Cargo, `Grupo Nomina` AS grupoNomina, Notificar FROM Config_Cargo_Laboral WHERE Cargo = ? LIMIT 1', [cargo]);
  return rows[0] || null;
}

async function listaSeccion(cargo, seccion) {
  const [rows] = await pool.execute(
    'SELECT Texto FROM Config_Cargo_Funciones WHERE Cargo = ? AND Seccion = ? ORDER BY Orden, Id',
    [cargo, seccion]
  );
  return rows.map(r => r.Texto);
}

async function obtenerSstComun() {
  return listaSeccion(CARGO_COMUN, 'SST');
}

async function obtenerVersiones(cargo) {
  const [rows] = await pool.execute(
    `SELECT Version, FechaEmision, Descripcion, Usuario, FechaRegistro, (Contenido IS NOT NULL) AS tieneContenido
       FROM Config_Cargo_Manual_Versiones WHERE Cargo = ? ORDER BY Version DESC`,
    [cargo]
  );
  return rows.map(r => ({
    version: Number(r.Version),
    fechaEmision: fechaIso(r.FechaEmision),
    descripcion: r.Descripcion || '',
    usuario: r.Usuario || '',
    fechaRegistro: r.FechaRegistro || null,
    tieneContenido: Number(r.tieneContenido) === 1,
  }));
}

async function obtenerDetalle(cargo) {
  const catalogo = await obtenerCargoCatalogo(cargo);
  if (!catalogo) return null;
  const [mRows] = await pool.execute('SELECT * FROM Config_Cargo_Manual WHERE Cargo = ? LIMIT 1', [cargo]);
  const m = mRows[0] || null;
  const ficha = {};
  Object.entries(CAMPOS_FICHA).forEach(([k, def]) => { ficha[k] = m ? (m[def.col] || '') : ''; });
  const [responsabilidades, funciones, sst, sstComun, versiones] = await Promise.all([
    listaSeccion(cargo, 'RESPONSABILIDAD'),
    listaSeccion(cargo, 'FUNCION'),
    listaSeccion(cargo, 'SST'),
    obtenerSstComun(),
    obtenerVersiones(cargo),
  ]);
  const publicada = versiones.find(v => v.tieneContenido) || null;
  return {
    cargo: catalogo.Cargo,
    grupoNomina: catalogo.grupoNomina || '',
    notificar: catalogo.Notificar == null ? null : Number(catalogo.Notificar),
    tieneFicha: !!m,
    usaSstComun: m ? Number(m.UsaSstComun) === 1 : true,
    cambiosSinPublicar: m ? Number(m.CambiosSinPublicar) === 1 : false,
    usuarioActualiza: m ? (m.UsuarioActualiza || '') : '',
    fechaActualiza: m ? (m.FechaActualiza || null) : null,
    ficha,
    responsabilidades,
    funciones,
    sst,
    sstComun,
    versiones,
    versionPublicada: publicada ? publicada.version : null,
  };
}

// ── Guardar borrador ───────────────────────────────────────────────────────
function limpiarLista(lista, nombre) {
  if (!Array.isArray(lista)) return [];
  const limpia = lista.map(t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (limpia.length > MAX_RENGLONES) throw errorValidacion(`${nombre}: máximo ${MAX_RENGLONES} renglones.`);
  const largo = limpia.find(t => t.length > MAX_TEXTO);
  if (largo) throw errorValidacion(`${nombre}: un renglón supera ${MAX_TEXTO} caracteres.`);
  return limpia;
}

function limpiarFicha(ficha) {
  const out = {};
  Object.entries(CAMPOS_FICHA).forEach(([k, def]) => {
    const v = String((ficha && ficha[k]) == null ? '' : ficha[k]).trim();
    if (v.length > def.max) throw errorValidacion(`El campo "${k}" supera ${def.max} caracteres.`);
    out[k] = v;
  });
  return out;
}

async function reemplazarRenglones(conn, cargo, seccion, lista) {
  await conn.execute('DELETE FROM Config_Cargo_Funciones WHERE Cargo = ? AND Seccion = ?', [cargo, seccion]);
  for (let i = 0; i < lista.length; i++) {
    await conn.execute(
      'INSERT INTO Config_Cargo_Funciones (Cargo, Seccion, Orden, Texto) VALUES (?, ?, ?, ?)',
      [cargo, seccion, i + 1, lista[i]]
    );
  }
}

async function guardarBorrador({ cargo, ficha, responsabilidades, funciones, sst, usaSstComun, usuario }) {
  const catalogo = await obtenerCargoCatalogo(cargo);
  if (!catalogo) throw errorValidacion('El cargo no existe en Config_Cargo_Laboral.');
  const f = limpiarFicha(ficha);
  const listas = {
    RESPONSABILIDAD: limpiarLista(responsabilidades, 'Responsabilidades del cargo'),
    FUNCION: limpiarLista(funciones, 'Funciones del cargo'),
    SST: limpiarLista(sst, 'Responsabilidades en SST'),
  };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const cols = Object.values(CAMPOS_FICHA).map(d => d.col);
    const valores = Object.keys(CAMPOS_FICHA).map(k => f[k] || null);
    await conn.execute(
      `INSERT INTO Config_Cargo_Manual (Cargo, ${cols.join(', ')}, UsaSstComun, CambiosSinPublicar, UsuarioActualiza, FechaActualiza)
       VALUES (?, ${cols.map(() => '?').join(', ')}, ?, 1, ?, NOW())
       ON DUPLICATE KEY UPDATE ${cols.map(c => `${c} = VALUES(${c})`).join(', ')},
         UsaSstComun = VALUES(UsaSstComun), CambiosSinPublicar = 1,
         UsuarioActualiza = VALUES(UsuarioActualiza), FechaActualiza = NOW()`,
      [catalogo.Cargo, ...valores, usaSstComun ? 1 : 0, usuario || null]
    );
    for (const [sec, lista] of Object.entries(listas)) {
      await reemplazarRenglones(conn, catalogo.Cargo, sec, lista);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
  return obtenerDetalle(catalogo.Cargo);
}

// Las responsabilidades SST comunes: los cargos que las usan quedan con "cambios sin publicar"
// (el manual publicado no cambia hasta que se publique de nuevo).
async function guardarSstComun({ lista, usuario }) {
  const limpia = limpiarLista(lista, 'Responsabilidades SST comunes');
  if (!limpia.length) throw errorValidacion('Las responsabilidades SST comunes no pueden quedar vacías.');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await reemplazarRenglones(conn, CARGO_COMUN, 'SST', limpia);
    await conn.execute(
      `UPDATE Config_Cargo_Manual m
          JOIN (SELECT DISTINCT Cargo FROM Config_Cargo_Manual_Versiones WHERE Contenido IS NOT NULL) p ON p.Cargo = m.Cargo
          SET m.CambiosSinPublicar = 1, m.UsuarioActualiza = ?, m.FechaActualiza = NOW()
        WHERE m.UsaSstComun = 1`,
      [usuario || null]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
  return obtenerSstComun();
}

// ── Contenido del manual (para publicar o previsualizar) ───────────────────
function construirContenido({ cargo, ficha, responsabilidades, funciones, sst, usaSstComun, sstComun, version, fechaEmision }) {
  return {
    cargo,
    version,
    fechaEmision,
    ficha: limpiarFicha(ficha),
    usaSstComun: !!usaSstComun,
    responsabilidades: limpiarLista(responsabilidades, 'Responsabilidades del cargo'),
    funciones: limpiarLista(funciones, 'Funciones del cargo'),
    sst: usaSstComun
      ? [...limpiarLista(sstComun, 'Responsabilidades SST comunes'), ...limpiarLista(sst, 'Responsabilidades en SST')]
      : limpiarLista(sst, 'Responsabilidades en SST'),
  };
}

function faltantesParaPublicar(contenido) {
  const faltan = [];
  if (!contenido.ficha.objetivo) faltan.push('objetivo del cargo');
  if (!contenido.ficha.jefeInmediato) faltan.push('jefe inmediato');
  if (!contenido.responsabilidades.length) faltan.push('al menos una responsabilidad del cargo');
  if (!contenido.funciones.length) faltan.push('al menos una función del cargo');
  if (!contenido.sst.length) faltan.push('responsabilidades en SST');
  return faltan;
}

async function publicar({ cargo, descripcion, usuario }) {
  const desc = String(descripcion || '').trim();
  if (!desc) throw errorValidacion('Escribe la descripción del cambio para el control de cambios.');
  if (desc.length > 500) throw errorValidacion('La descripción del cambio admite máximo 500 caracteres.');
  const det = await obtenerDetalle(cargo);
  if (!det) throw errorValidacion('El cargo no existe en Config_Cargo_Laboral.');
  if (!det.tieneFicha) throw errorValidacion('Guarda primero el manual del cargo antes de publicarlo.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[{ ultima }]] = await conn.execute(
      // uq_ccmv_cargo_version evita dos publicaciones con el mismo número
      'SELECT COALESCE(MAX(Version), 0) AS ultima FROM Config_Cargo_Manual_Versiones WHERE Cargo = ?',
      [det.cargo]
    );
    const version = Number(ultima) + 1;
    const fechaEmision = hoyBogota();
    const contenido = construirContenido({ ...det, version, fechaEmision });
    const faltan = faltantesParaPublicar(contenido);
    if (faltan.length) throw errorValidacion(`Para publicar falta: ${faltan.join(', ')}.`);
    await conn.execute(
      `INSERT INTO Config_Cargo_Manual_Versiones (Cargo, Version, FechaEmision, Descripcion, Contenido, Usuario)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [det.cargo, version, fechaEmision, desc, JSON.stringify(contenido), usuario || null]
    );
    await conn.execute('UPDATE Config_Cargo_Manual SET CambiosSinPublicar = 0 WHERE Cargo = ?', [det.cargo]);
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
  return obtenerDetalle(det.cargo);
}

// ── Crear cargo ────────────────────────────────────────────────────────────
async function crearCargo({ cargo, grupoNomina, notificar }) {
  const nombre = String(cargo || '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!nombre) throw errorValidacion('Escribe el nombre del cargo.');
  if (nombre.length > 50) throw errorValidacion('El nombre del cargo admite máximo 50 caracteres.');
  if (nombre === CARGO_COMUN) throw errorValidacion('Nombre de cargo no permitido.');
  const grupo = ['Operativo', 'Administrativo'].find(g => normalizar(g) === normalizar(grupoNomina));
  if (!grupo) throw errorValidacion('Selecciona el grupo de nómina (Operativo o Administrativo).');
  const notif = notificar === '' || notificar == null ? null : Number(notificar);
  if (notif !== null && ![1, 2, 3].includes(notif)) throw errorValidacion('El grupo de notificación debe ser 1, 2 o 3.');

  const [todos] = await pool.execute('SELECT Cargo FROM Config_Cargo_Laboral');
  const repetido = todos.find(r => normalizar(r.Cargo) === normalizar(nombre));
  if (repetido) throw errorValidacion(`Ya existe el cargo "${repetido.Cargo}".`);

  await pool.execute(
    'INSERT INTO Config_Cargo_Laboral (Cargo, `Grupo Nomina`, Notificar) VALUES (?, ?, ?)',
    [nombre, grupo, notif]
  );
  return nombre;
}

// ── Manual publicado (para firmar) ─────────────────────────────────────────
async function buscarCargoPublicado(cargo) {
  const [exacto] = await pool.execute(
    'SELECT DISTINCT Cargo FROM Config_Cargo_Manual_Versiones WHERE Cargo = ? AND Contenido IS NOT NULL LIMIT 1',
    [String(cargo || '').trim()]
  );
  if (exacto.length) return exacto[0].Cargo;
  const [todos] = await pool.execute('SELECT DISTINCT Cargo FROM Config_Cargo_Manual_Versiones WHERE Contenido IS NOT NULL');
  const n = normalizar(cargo);
  const hit = todos.find(r => normalizar(r.Cargo) === n);
  return hit ? hit.Cargo : null;
}

/** Manual publicado vigente del cargo: { contenido, historial } o null si no tiene. */
async function obtenerManualPublicado(cargo) {
  if (!cargo) return null;
  const nombre = await buscarCargoPublicado(cargo);
  if (!nombre) return null;
  const [rows] = await pool.execute(
    `SELECT Version, Contenido FROM Config_Cargo_Manual_Versiones
      WHERE Cargo = ? AND Contenido IS NOT NULL ORDER BY Version DESC LIMIT 1`,
    [nombre]
  );
  if (!rows.length) return null;
  let contenido;
  try { contenido = JSON.parse(rows[0].Contenido); } catch (_) { return null; }
  const historial = (await obtenerVersiones(nombre)).filter(v => v.version <= Number(rows[0].Version));
  return { contenido, historial };
}

/** Variables {{mf_*}} de la plantilla MF (ya escapadas: listas en <li>, bloques en HTML). */
function variablesManual({ contenido, historial = [] }) {
  const f = contenido.ficha || {};
  const txt = v => escHtml(String(v || '').trim() || 'N/A');
  const li = lista => (lista || []).map(t => `      <li>${escHtml(t)}</li>`).join('\n');
  const hayRevision = f.revisadoPor || f.aprobadoPor;
  const revision = hayRevision ? `
  <section class="section-block">
    <div class="section-title">Revisión y aprobación</div>
    <table class="data-grid">
      <tr><td class="data-label">Revisado por</td><td class="data-val">${escHtml(f.revisadoPor || '')}${f.revisadoCargo ? ` &bull; ${escHtml(f.revisadoCargo)}` : ''}</td></tr>
      <tr><td class="data-label">Aprobado por</td><td class="data-val">${escHtml(f.aprobadoPor || '')}${f.aprobadoCargo ? ` &bull; ${escHtml(f.aprobadoCargo)}` : ''}</td></tr>
    </table>
  </section>` : '';
  const filas = [...historial].sort((a, b) => a.version - b.version).map(v =>
    `<tr><td class="c">${v.version}</td><td class="c">${escHtml(fechaLegible(v.fechaEmision))}</td><td>${escHtml(v.descripcion)}</td></tr>`).join('');
  const control = filas ? `
  <section class="section-block">
    <div class="section-title">Control de cambios</div>
    <table class="q-table">
      <tr><th style="width:12%">Versión</th><th style="width:18%">Fecha de emisión</th><th>Descripción del cambio</th></tr>
      ${filas}
    </table>
  </section>` : '';
  return {
    mf_cargo: escHtml(contenido.cargo || ''),
    mf_version: escHtml(String(contenido.version || '').padStart(2, '0')),
    mf_fecha_emision: escHtml(fechaLegible(contenido.fechaEmision)),
    mf_ubicacion: txt(f.ubicacion),
    mf_jefe_inmediato: txt(f.jefeInmediato),
    mf_nivel_jerarquico: txt(f.nivelJerarquico),
    mf_objetivo: txt(f.objetivo),
    mf_autoridad: txt(f.autoridad),
    mf_edad: txt(f.edad),
    mf_genero: txt(f.genero),
    mf_educacion: txt(f.educacion),
    mf_formacion: txt(f.formacion),
    mf_experiencia: txt(f.experiencia),
    mf_cargos_reportan: txt(f.cargosQueReportan),
    mf_a_quien_reporta: txt(f.aQuienReporta),
    mf_responsabilidades: li(contenido.responsabilidades),
    mf_funciones: li(contenido.funciones),
    mf_sst: li(contenido.sst),
    mf_revision: revision,
    mf_control_cambios: control,
  };
}

// ── Vista previa ───────────────────────────────────────────────────────────
// borrador: lo que hay en el editor (sin guardar). version: una versión publicada del historial.
async function vistaPrevia({ cargo, borrador, version }) {
  const { reemplazarVariables, aplicarFormatoPlantilla } = require('./plantilla');
  const { LOGO_BASE64 } = require('./assets');
  const [pRows] = await pool.execute(
    "SELECT contenido_html, codigo_formato, version_formato, fecha_version FROM Maestro_Plantillas WHERE nombre_proceso = 'MF' AND activo = 1 ORDER BY version DESC LIMIT 1"
  );
  if (!pRows.length) throw errorValidacion('No se encontró la plantilla del manual de funciones (MF) en Maestro_Plantillas.');
  const fila = pRows[0];
  if (!/\{\{mf_funciones\}\}/.test(fila.contenido_html || '')) {
    throw errorValidacion('La plantilla del manual (MF) aún no usa las variables por cargo: falta ejecutar la migración 2026-11-13_plantilla_mf_por_cargo.sql.');
  }

  let manual;
  if (version) {
    const [rows] = await pool.execute(
      'SELECT Contenido FROM Config_Cargo_Manual_Versiones WHERE Cargo = ? AND Version = ? AND Contenido IS NOT NULL',
      [cargo, Number(version)]
    );
    if (!rows.length) throw errorValidacion('Esa versión no tiene contenido guardado (es una versión histórica anterior a la app).');
    const contenido = JSON.parse(rows[0].Contenido);
    const historial = (await obtenerVersiones(cargo)).filter(v => v.version <= Number(version));
    manual = { contenido, historial };
  } else {
    const det = await obtenerDetalle(cargo);
    if (!det) throw errorValidacion('El cargo no existe en Config_Cargo_Laboral.');
    const b = borrador || det;
    const sigVersion = (det.versiones[0] ? det.versiones[0].version : 0) + 1;
    const contenido = construirContenido({
      cargo: det.cargo, ficha: b.ficha, responsabilidades: b.responsabilidades, funciones: b.funciones,
      sst: b.sst, usaSstComun: b.usaSstComun, sstComun: det.sstComun, version: sigVersion, fechaEmision: hoyBogota(),
    });
    const historial = [...det.versiones, { version: sigVersion, fechaEmision: hoyBogota(), descripcion: '(borrador sin publicar)' }];
    manual = { contenido, historial };
  }

  const fechaFormato = fila.fecha_version ? fechaIso(fila.fecha_version).split('-').reverse().join('/') : '';
  let html = aplicarFormatoPlantilla(fila.contenido_html, {
    codigo: fila.codigo_formato ? String(fila.codigo_formato).trim() : '',
    version: fila.version_formato ? String(fila.version_formato).trim() : '',
    fecha: fechaFormato,
  }).replace(/\{\{\s*(codigo_formato|version_formato|fecha_formato)\s*\}\}/g, '');
  html = reemplazarVariables(html, {
    ...variablesManual(manual),
    logo_src: LOGO_BASE64,
    nombre_completo: 'NOMBRE DEL COLABORADOR',
    identificacion: '0000000000',
    cargo: escHtml(manual.contenido.cargo),
    operacion: 'Operación',
    ciudad_expedicion: '—',
    municipio_firma: '—', dia_firma: '—', mes_firma: '—', anio_firma: '—',
    firma_colaborador: '<div style="color:#94a3b8;font-style:italic;font-size:10px">[Firma del colaborador]</div>',
    fecha_generacion: 'vista previa',
  });
  return html;
}

module.exports = {
  CARGO_COMUN,
  SECCIONES,
  puedeEditarManuales,
  listarCargos,
  obtenerDetalle,
  obtenerSstComun,
  guardarBorrador,
  guardarSstComun,
  publicar,
  crearCargo,
  obtenerManualPublicado,
  variablesManual,
  vistaPrevia,
};
