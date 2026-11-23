// Habilitar Doc. SST desde Aspirantes (Panel Admin) y Cloud-Docs: Selección, Archivo o SST habilitan la Prueba de
// Consumo, el ARO, la EVIN y el INGE para un aspirante (o trabajador de Cloud-Docs), y él los responde y firma desde
// su portal (/seleccion/portal/:id) con las mismas páginas de firma de SST. Los registros quedan en las mismas
// tablas de SST con id_aspirante (migraciones/2026-11-22_doc_sst_aspirantes.sql) y se ven en sus pestañas.
// Datos: del aspirante sin vincular salen de su requisición (sin requisición no se habilita); del trabajador, de
// Maestro_Vinculación. Quien habilita firma como responsable (EVIN) o analista (INGE).
// Carpeta digital: mientras el aspirante no esté vinculado, el PDF firmado no pasa a Maestro_docTrabajador
// (registroDiferido); pasa al insertarlo en la Sociodemográfica (alVincular). Roles: Config_Parametros sst / General.
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const aro = require('./aro');
const evin = require('./evin');
const inge = require('./inge');
const { puedeProcesarRetiradosSst } = require('./configSst');
const { urlFirmaRegistrada } = require('./firmaUsuario');

const CONCEPTO_ROLES = 'Roles que pueden habilitar Doc. SST desde Aspirantes y Cloud-Docs';
const ROLES_DEFECTO = 'Selección, CoorSelección, Selección Centro, Directorth, Archivo, Sistema, AdmSst, AnaSst, AuxSst, LiderSst';

// Prueba de Consumo: documento 19 (CPC), como en routes/pruebaconsumo.js
const CPC_TIPO = 19;
const CPC_PREFIJO = 'CPC';

const DOCS = [
  { clave: 'CPC', nombre: 'Prueba de Consumo', accion: 'Leer y firmar', icono: '🧪' },
  { clave: 'ARO', nombre: 'Análisis de Riesgo por Oficio', accion: 'Leer y firmar', icono: '⚠️' },
  { clave: 'EVIN', nombre: 'Evaluación de Inducción Corporativa', accion: 'Responder y firmar', icono: '📝' },
  { clave: 'INGE', nombre: 'Compromiso de Inducción General', accion: 'Responder y firmar', icono: '✅' },
];

function normalizar(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function nombreSinCedula(trabajador) {
  const partes = String(trabajador || '').split(' ** ');
  return (partes.length > 1 ? partes[1] : partes[0]).trim();
}

function ahoraBogota() {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function urlBase(req) {
  return process.env.BASE_URL || (req ? `${req.protocol}://${req.get('host')}` : '');
}

// ── Permiso ──────────────────────────────────────────────────────────────────
async function rolDeUsuario(usuarioId) {
  if (!usuarioId) return null;
  const [[u]] = await pool.execute('SELECT Rol FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuarioId]);
  return u ? u.Rol : null;
}

async function puedeHabilitar(usuarioId) {
  const rol = await rolDeUsuario(usuarioId);
  if (!rol) return { puede: false, rol: null };
  let lista = ROLES_DEFECTO;
  try {
    const [[r]] = await pool.execute(
      "SELECT Parametro FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'General' AND Concepto = ? LIMIT 1",
      [CONCEPTO_ROLES]
    );
    if (r) lista = String(r.Parametro || '');
  } catch (err) {
    console.error('[docSstPortal] No se pudo leer el parámetro de roles, se usa el valor por defecto:', err.message);
  }
  const roles = lista.split(',').map(normalizar).filter(Boolean);
  return { puede: roles.includes(normalizar(rol)), rol };
}

// ── Datos del aspirante o trabajador ─────────────────────────────────────────
// Aspirante sin vincular: requisición. Trabajador (Cloud-Docs, estado contratado): su última vinculación.
async function datosPersona(idAspirante) {
  const [[a]] = await pool.execute(
    `SELECT id_aspirante, identificacion, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
            estado_proceso, IdRequisicion
       FROM Dynamic_hv_aspirante WHERE id_aspirante = ? LIMIT 1`,
    [idAspirante]
  );
  if (!a) return { error: 'No se encontró el aspirante.' };
  const nombre = [a.primer_nombre, a.segundo_nombre, a.primer_apellido, a.segundo_apellido]
    .filter(n => n && String(n).trim()).join(' ').replace(/\s+/g, ' ').toUpperCase();
  const base = { idAspirante: a.id_aspirante, identificacion: String(a.identificacion), nombre };

  if (a.estado_proceso === 'contratado') {
    const [[v]] = await pool.execute(
      `SELECT \`Id Vinculación\` AS idv, Trabajador, Cargo, \`Operación\` AS operacion, Regional, Estado, \`Fecha de Ingreso\` AS ingreso
         FROM \`Maestro_Vinculación\` WHERE \`Identificación\` = ? ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [a.identificacion]
    );
    if (v) {
      return {
        ...base, vinculado: true, nombre: nombreSinCedula(v.Trabajador) || nombre, cargo: v.Cargo || '',
        operacion: v.operacion || '', regional: v.Regional || '', idVinculacion: v.idv, fechaIngreso: v.ingreso || null,
        retirado: normalizar(v.Estado) === 'retirado', ciudad: await evin.ciudadDeOperacion(v.operacion),
      };
    }
  }
  if (!a.IdRequisicion) return { ...base, error: 'El aspirante no tiene una requisición vinculada: vincúlela para habilitar los documentos SST.' };
  const [[r]] = await pool.execute(
    'SELECT `Operación` AS operacion, Regional, Ciudad, `Cargo Requerido` AS cargo FROM Dynamic_Requisiciones WHERE IdRequisicion = ? LIMIT 1',
    [a.IdRequisicion]
  );
  if (!r) return { ...base, error: 'No se encontró la requisición del aspirante.' };
  return {
    ...base, vinculado: false, cargo: r.cargo || '', operacion: r.operacion || '', regional: r.Regional || '',
    idVinculacion: null, fechaIngreso: null, retirado: false,
    ciudad: String(r.Ciudad || '').trim() || await evin.ciudadDeOperacion(r.operacion),
  };
}

// Cliente de la Prueba de Consumo: el más usado en las pruebas de esa operación; Administración es LOGYSER
async function clienteDeOperacion(operacion) {
  if (normalizar(operacion).startsWith('administracion')) return 'LOGYSER';
  const [[c]] = await pool.execute(
    `SELECT p.cliente, COUNT(*) AS n FROM Dynamic_pruebaconsumo p
      WHERE p.cliente IS NOT NULL AND p.cliente <> ''
        AND (p.operacion = ? OR p.identificacion IN (SELECT \`Identificación\` FROM \`Maestro_Vinculación\` WHERE \`Operación\` = ?))
      GROUP BY p.cliente ORDER BY n DESC LIMIT 1`,
    [operacion, operacion]
  );
  return (c && c.cliente) || operacion || 'LOGYSER';
}

// ── Registros de cada documento ──────────────────────────────────────────────
// desde=portal: al terminar, la página de firma muestra "Volver a mi portal" (htmlVolverPortal)
function enlace(req, clave, fila) {
  const base = urlBase(req);
  if (clave === 'CPC') return `${base}/pruebaconsumo/firmar?item=${encodeURIComponent(fila.idprueba)}&desde=portal`;
  return fila.token_firma ? `${base}/${clave.toLowerCase()}/firmar?t=${encodeURIComponent(fila.token_firma)}&desde=portal` : '';
}

// Script para la página de firma abierta desde el portal (public/js/volver-portal.js); vacío si viene de SST
function htmlVolverPortal(req, fila) {
  if (!fila || !fila.id_aspirante || String(req.query.desde || '') !== 'portal') return '';
  const url = JSON.stringify(`/seleccion/portal/${encodeURIComponent(fila.id_aspirante)}`);
  return `<script>window.VOLVER_PORTAL = ${url};</script><script src="/js/volver-portal.js" defer></script>`;
}

// Último registro de cada documento habilitado desde el portal de este aspirante
async function registros(idAspirante) {
  const consulta = (sql) => pool.execute(sql, [idAspirante]).then(([rows]) => rows[0] || null);
  const [cpc, aroF, evinF, ingeF] = await Promise.all([
    consulta('SELECT idprueba, token_firma, url_doc, fecha_firma, fecha_registro AS fecha_creacion FROM Dynamic_pruebaconsumo WHERE id_aspirante = ? ORDER BY fecha_registro DESC LIMIT 1'),
    consulta('SELECT id_aro, token_firma, url_doc, fecha_firma, fecha_creacion FROM Dynamic_aro WHERE id_aspirante = ? ORDER BY fecha_creacion DESC LIMIT 1'),
    consulta('SELECT id_evin, token_firma, url_doc, fecha_firma, fecha_creacion, porcentaje, aprobado FROM Dynamic_evin WHERE id_aspirante = ? ORDER BY fecha_creacion DESC LIMIT 1'),
    consulta('SELECT id_inge, token_firma, url_doc, fecha_firma, fecha_creacion, temas_no FROM Dynamic_inge WHERE id_aspirante = ? ORDER BY fecha_creacion DESC LIMIT 1'),
  ]);
  return { CPC: cpc, ARO: aroF, EVIN: evinF, INGE: ingeF };
}

async function aplica(clave, cargo) {
  if (clave === 'ARO') return aro.cargoPermitido((await aro.configuracion()).cargos, cargo);
  if (clave === 'EVIN') return evin.cargoPermitido((await evin.configuracion()).cargos, cargo);
  if (clave === 'INGE') return inge.cargoPermitido((await inge.configuracion()).cargos, cargo);
  return true;
}

// Estado para la ventana "Habilitar Doc. SST" y la lista del Panel Admin / Cloud-Docs
async function estado(idAspirante, usuarioId, req) {
  const persona = await datosPersona(idAspirante);
  const permiso = await puedeHabilitar(usuarioId);
  const regs = await registros(idAspirante);
  const opciones = [];
  for (const d of DOCS) {
    const r = regs[d.clave];
    opciones.push({
      ...d,
      aplica: persona.error ? false : await aplica(d.clave, persona.cargo),
      estado: r ? (r.url_doc ? 'firmado' : 'pendiente') : null,
      fechaCreacion: r ? r.fecha_creacion : null,
      fechaFirma: r ? r.fecha_firma : null,
      urlDoc: r && r.url_doc ? r.url_doc : '',
      enlace: r && !r.url_doc ? enlace(req, d.clave, r) : '',
    });
  }
  return {
    persona: { nombre: persona.nombre, identificacion: persona.identificacion, cargo: persona.cargo || '', operacion: persona.operacion || '', vinculado: !!persona.vinculado },
    error: persona.error || null,
    puede: permiso.puede,
    tieneFirma: usuarioId ? !!(await urlFirmaRegistrada(usuarioId)) : false,
    opciones,
  };
}

async function versionPlantilla(nombre, defecto) {
  const [[p]] = await pool.execute('SELECT version_formato FROM Maestro_Plantillas WHERE nombre_proceso = ? ORDER BY activo DESC, version DESC LIMIT 1', [nombre]);
  return (p && p.version_formato) || defecto;
}

async function crearCpc(p, usuarioId) {
  const idprueba = uuidv4();
  await pool.execute(
    `INSERT INTO Dynamic_pruebaconsumo
       (idprueba, fecha, identificacion, nombre_trabajador, cargo, ciudad, cliente, firma_trabajador, url_firma, url_doc,
        token_firma, token_expira, observaciones, usuario, id_aspirante, operacion, regional)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, '', ?, ?, ?, ?)`,
    [idprueba, ahoraBogota().slice(0, 10), p.identificacion, p.nombre, p.cargo || '', p.ciudad || '', await clienteDeOperacion(p.operacion),
      crypto.randomBytes(32).toString('hex'), usuarioId, p.idAspirante, p.operacion || null, p.regional || null]
  );
}

// ARO, EVIN e INGE: si ya tiene uno pendiente (de SST o del portal), se reutiliza y queda en su portal
async function reutilizarPendiente(tabla, id, p) {
  const [[pend]] = await pool.execute(`SELECT ${id} AS id FROM ${tabla} WHERE identificacion = ? AND url_doc IS NULL AND token_firma IS NOT NULL LIMIT 1`, [p.identificacion]);
  if (!pend) return false;
  await pool.execute(`UPDATE ${tabla} SET id_aspirante = ? WHERE ${id} = ?`, [p.idAspirante, pend.id]);
  return true;
}

async function crearAro(p, usuarioId) {
  if (await reutilizarPendiente('Dynamic_aro', 'id_aro', p)) return;
  await pool.execute(
    `INSERT INTO Dynamic_aro (habilitado_portal, id_aro, identificacion, id_vinculacion, nombre_trabajador, cargo, operacion, regional, version_formato,
                              token_firma, usuario, fecha_creacion, id_aspirante)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), p.identificacion, p.idVinculacion, p.nombre, p.cargo, p.operacion, p.regional, await versionPlantilla('ARO', '04'),
      crypto.randomBytes(24).toString('hex'), usuarioId, ahoraBogota(), p.idAspirante]
  );
}

async function crearEvin(p, usuarioId) {
  if (await reutilizarPendiente('Dynamic_evin', 'id_evin', p)) return;
  const resp = await evin.responsable(usuarioId);
  await pool.execute(
    `INSERT INTO Dynamic_evin (habilitado_portal, id_evin, identificacion, id_vinculacion, nombre_trabajador, cargo, operacion, regional, ciudad,
                               tipo, intento, version_formato, observaciones, nombre_responsable, cargo_responsable,
                               url_firma_responsable, token_firma, usuario, fecha_creacion, id_aspirante)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 'Inducción', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), p.identificacion, p.idVinculacion, p.nombre, p.cargo, p.operacion, p.regional, p.ciudad,
      await evin.siguienteIntento(p.identificacion), await versionPlantilla('EVIN', '04'),
      resp.nombre || null, resp.cargo || null, resp.urlFirma, crypto.randomBytes(24).toString('hex'), usuarioId, ahoraBogota(), p.idAspirante]
  );
}

async function crearInge(p, usuarioId) {
  if (await reutilizarPendiente('Dynamic_inge', 'id_inge', p)) return;
  const an = await inge.analista(usuarioId);
  await pool.execute(
    `INSERT INTO Dynamic_inge (habilitado_portal, id_inge, identificacion, id_vinculacion, nombre_trabajador, cargo, operacion, regional, ciudad,
                               fecha_ingreso, tipo, version_formato, nombre_analista, cargo_analista, url_firma_analista,
                               token_firma, usuario, fecha_creacion, id_aspirante)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Inducción', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), p.identificacion, p.idVinculacion, p.nombre, p.cargo, p.operacion, p.regional, p.ciudad,
      p.fechaIngreso, await versionPlantilla('INGE', '05'), an.nombre || null, an.cargo || null, an.urlFirma,
      crypto.randomBytes(24).toString('hex'), usuarioId, ahoraBogota(), p.idAspirante]
  );
}

const CREAR = { CPC: crearCpc, ARO: crearAro, EVIN: crearEvin, INGE: crearInge };

// Habilita los documentos escogidos. Los que ya tiene habilitados (pendientes o firmados) no se repiten.
async function habilitar(idAspirante, claves, usuarioId, req) {
  const permiso = await puedeHabilitar(usuarioId);
  if (!permiso.puede) return { status: 403, error: 'Su rol no puede habilitar documentos SST.' };
  const p = await datosPersona(idAspirante);
  if (p.error) return { status: 400, error: p.error };
  if (p.retirado && !(await puedeProcesarRetiradosSst(permiso.rol))) {
    return { status: 403, error: 'Su rol no está autorizado para realizar procesos a personal retirado.' };
  }
  const escogidos = DOCS.map(d => d.clave).filter(c => (Array.isArray(claves) ? claves : []).includes(c));
  if (!escogidos.length) return { status: 400, error: 'Escoja al menos un documento.' };
  const regs = await registros(idAspirante);
  const habilitados = [];
  const omitidos = [];
  for (const clave of escogidos) {
    const nombre = DOCS.find(d => d.clave === clave).nombre;
    if (regs[clave]) { omitidos.push(`${nombre} (ya estaba habilitado)`); continue; }
    if (!(await aplica(clave, p.cargo))) { omitidos.push(`${nombre} (no aplica para el cargo ${p.cargo || 'sin cargo'})`); continue; }
    await CREAR[clave](p, usuarioId);
    habilitados.push(nombre);
  }
  return { ok: true, habilitados, omitidos, estado: await estado(idAspirante, usuarioId, req) };
}

// Deshabilitar: solo los que el aspirante aún no ha firmado. Los creados por el portal se borran (como si no hubiera
// pasado nada); un pendiente que SST ya tenía y el portal reutilizó solo sale del portal y sigue en SST.
const TABLAS = {
  CPC: { tabla: 'Dynamic_pruebaconsumo', id: 'idprueba', propio: '1' },
  ARO: { tabla: 'Dynamic_aro', id: 'id_aro', propio: 'habilitado_portal' },
  EVIN: { tabla: 'Dynamic_evin', id: 'id_evin', propio: 'habilitado_portal' },
  INGE: { tabla: 'Dynamic_inge', id: 'id_inge', propio: 'habilitado_portal' },
};

async function deshabilitar(idAspirante, claves, usuarioId, req) {
  const permiso = await puedeHabilitar(usuarioId);
  if (!permiso.puede) return { status: 403, error: 'Su rol no puede deshabilitar documentos SST.' };
  const escogidos = DOCS.map(d => d.clave).filter(c => (Array.isArray(claves) ? claves : []).includes(c));
  if (!escogidos.length) return { status: 400, error: 'Escoja al menos un documento.' };
  const deshabilitados = [];
  const omitidos = [];
  for (const clave of escogidos) {
    const { tabla, id, propio } = TABLAS[clave];
    const nombre = DOCS.find(d => d.clave === clave).nombre;
    const [filas] = await pool.execute(`SELECT ${id} AS id, url_doc, ${propio} AS propio FROM ${tabla} WHERE id_aspirante = ?`, [idAspirante]);
    if (!filas.length) { omitidos.push(`${nombre} (no estaba habilitado)`); continue; }
    if (filas.some(r => r.url_doc)) { omitidos.push(`${nombre} (ya fue firmado)`); continue; }
    for (const r of filas) {
      const sql = Number(r.propio) === 1
        ? `DELETE FROM ${tabla} WHERE ${id} = ? AND id_aspirante = ? AND url_doc IS NULL`
        : `UPDATE ${tabla} SET id_aspirante = NULL WHERE ${id} = ? AND id_aspirante = ? AND url_doc IS NULL`;
      await pool.execute(sql, [r.id, idAspirante]);
    }
    deshabilitados.push(nombre);
  }
  return { ok: true, deshabilitados, omitidos, estado: await estado(idAspirante, usuarioId, req) };
}

// Documentos SST del portal del aspirante (solo los habilitados)
async function enlacesPortal(idAspirante, req) {
  const regs = await registros(idAspirante);
  return DOCS.filter(d => regs[d.clave]).map(d => ({
    clave: d.clave, nombre: d.nombre, accion: d.accion, icono: d.icono,
    firmado: !!regs[d.clave].url_doc, fechaFirma: regs[d.clave].fecha_firma,
    enlace: regs[d.clave].url_doc ? '' : enlace(req, d.clave, regs[d.clave]),
  }));
}

// ── Carpeta digital ──────────────────────────────────────────────────────────
// true: el registro es de un aspirante que aún no está vinculado; su PDF pasa a la carpeta al vincularlo
async function registroDiferido(idAspirante) {
  if (!idAspirante) return false;
  const [[a]] = await pool.execute('SELECT estado_proceso FROM Dynamic_hv_aspirante WHERE id_aspirante = ? LIMIT 1', [idAspirante]);
  return !!a && a.estado_proceso !== 'contratado';
}

async function registrarCpc(c) {
  const [[v]] = await pool.execute(
    'SELECT Regional, `Operación`, Estado, `Fecha de Ingreso` FROM `Maestro_Vinculación` WHERE `Identificación` = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
    [c.identificacion]
  );
  const [[ya]] = await pool.execute('SELECT 1 FROM Maestro_docTrabajador WHERE `Identificación` = ? AND Prefijo = ? AND Doc = ? LIMIT 1', [c.identificacion, CPC_PREFIJO, c.url_doc]);
  if (ya) return;
  await pool.execute(
    `INSERT INTO Maestro_docTrabajador (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso, TipoDocumento, Prefijo, Doc, Usuario)
     VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), (v && v.Regional) || c.regional || null, (v && v['Operación']) || c.operacion || null, c.identificacion,
      (v && v.Estado) || null, (v && v['Fecha de Ingreso']) || null, CPC_TIPO, CPC_PREFIJO, c.url_doc, c.usuario]
  );
}

// Al insertar al aspirante en la Sociodemográfica: los registros quedan con su vinculación, el INGE toma la fecha de
// ingreso (si ya estaba firmado se regenera su PDF) y los firmados pasan a la carpeta digital.
async function alVincular({ idAspirante, idVinculacion, fechaIngreso }) {
  for (const t of ['Dynamic_aro', 'Dynamic_evin', 'Dynamic_inge']) {
    await pool.execute(`UPDATE ${t} SET id_vinculacion = ? WHERE id_aspirante = ? AND id_vinculacion IS NULL`, [idVinculacion, idAspirante]);
  }
  await pool.execute('UPDATE Dynamic_inge SET fecha_ingreso = ? WHERE id_aspirante = ? AND fecha_ingreso IS NULL', [fechaIngreso, idAspirante]);

  const errores = [];
  const paso = async (nombre, fn) => { try { await fn(); } catch (err) { errores.push(nombre); console.error(`[docSstPortal] alVincular ${nombre}:`, err.message); } };
  const [cpcs] = await pool.execute('SELECT * FROM Dynamic_pruebaconsumo WHERE id_aspirante = ? AND url_doc IS NOT NULL', [idAspirante]);
  for (const c of cpcs) await paso('Prueba de Consumo', () => registrarCpc(c));
  const [aros] = await pool.execute('SELECT * FROM Dynamic_aro WHERE id_aspirante = ? AND url_doc IS NOT NULL', [idAspirante]);
  for (const a of aros) {
    await paso('ARO', async () => {
      const [[ya]] = await pool.execute('SELECT 1 FROM Maestro_docTrabajador WHERE `Identificación` = ? AND Prefijo = ? AND Doc = ? LIMIT 1', [a.identificacion, aro.PREFIJO_DOC, a.url_doc]);
      if (!ya) await aro.registrarDocumentoTrabajador(a, a.url_doc, null);
    });
  }
  const [[ev]] = await pool.execute('SELECT * FROM Dynamic_evin WHERE id_aspirante = ? AND url_doc IS NOT NULL ORDER BY fecha_firma DESC LIMIT 1', [idAspirante]);
  if (ev) await paso('EVIN', () => evin.registrarDocumentoTrabajador(ev, ev.url_doc));
  const [[ig]] = await pool.execute('SELECT * FROM Dynamic_inge WHERE id_aspirante = ? AND url_doc IS NOT NULL ORDER BY fecha_firma DESC LIMIT 1', [idAspirante]);
  if (ig) {
    await paso('INGE', async () => {
      const urlDoc = await inge.generarPdf(ig);
      await pool.execute('UPDATE Dynamic_inge SET url_doc = ? WHERE id_inge = ?', [urlDoc, ig.id_inge]);
      await inge.registrarDocumentoTrabajador(ig, urlDoc);
    });
  }
  return { errores };
}

module.exports = {
  DOCS,
  urlBase,
  puedeHabilitar,
  estado,
  habilitar,
  deshabilitar,
  enlacesPortal,
  htmlVolverPortal,
  registroDiferido,
  alVincular,
};
