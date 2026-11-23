// SST › ARO (Análisis de Riesgo por Oficio, SST-FM-054): parámetros (Config_Parametros sst / ARO), firma del
// SG-SST, documento con la plantilla 'ARO' (Maestro_Plantillas) y registro del documento 7 (ARO) en
// Maestro_docTrabajador. Rutas: src/routes/aro.js. Pestaña: public/js/sst-aro.js.
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const { obtenerPlantilla, reemplazarVariables, firmaConFecha } = require('./plantilla');
const { generarPDF } = require('./renderer');
const { LOGO_BASE64 } = require('./assets');
const { subirPDFARO } = require('./storage');
const { urlFirmaRegistrada } = require('./firmaUsuario');

const SECCION = 'ARO';
const ID_DOC_TRABAJADOR = 7;
const PREFIJO_DOC = 'ARO';

const P = {
  CARGOS:    'Cargos a los que se les genera el ARO',
  ROL_SST:   'Rol que firma como SG-SST en el ARO',
  HABILITAR: 'Habilitar notificaciones de correo en ARO',
};
const DEFAULTS = {
  [P.CARGOS]:    'AUXILIAR LOGISTICO, LIDER AUXILIAR LOGISTICO',
  [P.ROL_SST]:   'LiderSst',
  [P.HABILITAR]: '1',
};

function normalizarTexto(valor) {
  return String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

async function obtenerParametros() {
  try {
    const [rows] = await pool.execute(
      "SELECT `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = 'sst' AND `Seccion` = ?",
      [SECCION]
    );
    const mapa = {};
    rows.forEach(r => { mapa[r.Concepto] = r.Parametro == null ? '' : String(r.Parametro); });
    return mapa;
  } catch (err) {
    console.error('[aro] No se pudieron leer los parámetros, se usan los valores por defecto:', err.message);
    return {};
  }
}

function valor(params, concepto) {
  return Object.prototype.hasOwnProperty.call(params || {}, concepto) ? params[concepto] : DEFAULTS[concepto];
}

async function configuracion() {
  const p = await obtenerParametros();
  return {
    cargos: String(valor(p, P.CARGOS) || '').split(',').map(s => s.trim()).filter(Boolean),
    rolSst: String(valor(p, P.ROL_SST) || '').trim(),
    correoHabilitado: ['1', 'true', 'si', 'yes'].includes(normalizarTexto(valor(p, P.HABILITAR))),
  };
}

function cargoPermitido(cargos, cargo) {
  if (!cargos.length) return true;
  const c = normalizarTexto(cargo);
  return cargos.some(x => normalizarTexto(x) === c);
}

// Quien firma como SG-SST: el primer usuario con el rol configurado, con su firma registrada
async function firmanteSst(rolSst) {
  if (!rolSst) return { nombre: '', cargo: '', urlFirma: null };
  const [[u]] = await pool.execute('SELECT ID, Nombre, Colaborador, Cargo FROM Maestro_Usuarios WHERE Rol = ? ORDER BY ID LIMIT 1', [rolSst]);
  if (!u) return { nombre: '', cargo: '', urlFirma: null };
  const nombreColaborador = String(u.Colaborador || '').split(' ** ')[1];
  return {
    nombre: (nombreColaborador || u.Nombre || '').trim(),
    cargo: u.Cargo || 'Seguridad y Salud en el Trabajo',
    urlFirma: await urlFirmaRegistrada(u.ID),
  };
}

function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function radicado(idAro) {
  return String(idAro || '').replace(/-/g, '').slice(0, 8).toUpperCase();
}

function fechaLarga(v) {
  const d = v ? (v instanceof Date ? v : new Date(`${String(v).replace(' ', 'T')}-05:00`)) : new Date();
  return isNaN(d) ? '—' : d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });
}

// HTML del documento. a: fila de Dynamic_aro. Sin firma del trabajador, muestra el aviso (vista para firmar).
async function htmlDocumento(a) {
  const plantilla = await obtenerPlantilla('ARO');
  const firma = (url, fecha, aviso) => (url
    ? firmaConFecha(`<img src="${esc(url)}" class="sig-img" alt="Firma">`, fecha)
    : `<span class="firma-nota">${aviso}</span>`);
  return reemplazarVariables(plantilla.contenido_html, {
    logo_src: LOGO_BASE64,
    radicado: radicado(a.id_aro),
    nombre_trabajador: esc(String(a.nombre_trabajador || '').toUpperCase()) || '—',
    identificacion: esc(a.identificacion) || '—',
    cargo: esc(a.cargo) || '—',
    operacion: esc([a.operacion, a.regional ? `(${a.regional})` : ''].filter(Boolean).join(' ')) || '—',
    fecha_notificacion: fechaLarga(a.fecha_firma || a.fecha_creacion),
    firma_trabajador_html: firma(a.url_firma, a.fecha_firma, 'Firma pendiente'),
    firma_sst_html: firma(a.url_firma_sst, a.fecha_firma, 'Sin firma registrada'),
    nombre_sst: esc(a.nombre_sst) || '—',
    cargo_sst: esc(a.cargo_sst) || 'Seguridad y Salud en el Trabajo',
  });
}

async function generarPdf(a) {
  return subirPDFARO(a.identificacion, a.id_aro, await generarPDF(await htmlDocumento(a)));
}

// Documento 7 (ARO) en Maestro_docTrabajador: lo reemplaza si ya estaba (regenerar)
async function registrarDocumentoTrabajador(a, urlDoc, urlAnterior) {
  // Aspirante aún sin vincular (Doc. SST desde Aspirantes): pasa a la carpeta al vincularlo (docSstPortal.alVincular)
  if (await require('./docSstPortal').registroDiferido(a.id_aspirante)) return;
  if (urlAnterior) {
    const [upd] = await pool.execute(
      'UPDATE Maestro_docTrabajador SET Doc = ? WHERE `Identificación` = ? AND Prefijo = ? AND Doc = ?',
      [urlDoc, a.identificacion, PREFIJO_DOC, urlAnterior]
    );
    if (upd.affectedRows) return;
  }
  const [vin] = await pool.execute(
    'SELECT Regional, `Operación`, Estado, `Fecha de Ingreso` FROM `Maestro_Vinculación` WHERE `Identificación` = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
    [a.identificacion]
  );
  const v = vin[0] || {};
  await pool.execute(
    `INSERT INTO Maestro_docTrabajador
       (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso, TipoDocumento, Prefijo, Doc, Observaciones, Usuario)
     VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), v.Regional || a.regional || null, v['Operación'] || a.operacion || null, a.identificacion, v.Estado || null,
      v['Fecha de Ingreso'] || null, ID_DOC_TRABAJADOR, PREFIJO_DOC, urlDoc,
      `ARO SST-FM-054 v${a.version_formato || '04'} (${radicado(a.id_aro)})`, String(a.usuario || '').slice(0, 50)]
  );
}

module.exports = {
  PARAMETROS_ARO: P,
  SECCION,
  ID_DOC_TRABAJADOR,
  PREFIJO_DOC,
  configuracion,
  cargoPermitido,
  firmanteSst,
  htmlDocumento,
  generarPdf,
  registrarDocumentoTrabajador,
  radicado,
};
