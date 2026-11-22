// SST › Documentación Inicial › INGE (Comprobante de Inducción General, SST-F-050): parámetros
// (Config_Parametros sst / INGE), temas de la inducción, documento con la plantilla 'INGE' (Maestro_Plantillas)
// y registro del documento 32 (INGE) en Maestro_docTrabajador (solo el último).
// Rutas: src/routes/inge.js. Pestaña: public/js/sst-inge.js. Página del trabajador: src/views/inge/firmar.html.
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const { obtenerPlantilla, reemplazarVariables, firmaConFecha } = require('./plantilla');
const { generarPDF } = require('./renderer');
const { LOGO_BASE64 } = require('./assets');
const { subirPDFINGE } = require('./storage');
const { urlFirmaRegistrada } = require('./firmaUsuario');

const SECCION = 'INGE';
const ID_DOC_TRABAJADOR = 32;
const PREFIJO_DOC = 'INGE';
const CODIGO_FORMATO = 'SST-F-050';
const TIPOS = ['Inducción', 'Reinducción'];

const P = {
  CARGOS:    'Cargos a los que se les genera el INGE',
  ROL_LIDER: 'Rol que firma como Líder SST en el INGE',
  HABILITAR: 'Habilitar notificaciones de correo en INGE',
};
const DEFAULTS = {
  [P.CARGOS]:    '',
  [P.ROL_LIDER]: 'LiderSst',
  [P.HABILITAR]: '1',
};

// Temas del formato SST-F-050 v05: el trabajador marca SI o NO según la información que recibió
const SECCIONES_TEMAS = [
  { titulo: 'Información general de la empresa', temas: [
    'Historia, Misión y Visión, actividad económica, operación y valores corporativos.',
    'Organigrama de la empresa.',
    'Objetivos de la empresa y objetivos de calidad.',
    'Políticas de la empresa: Política de calidad, SST, PESV y Acoso sexual.',
  ] },
  { titulo: 'Aspectos administrativos y laborales', temas: [
    'Funciones y responsabilidades de su cargo (entrega del perfil del cargo asignado).',
    'Jefes inmediatos y estructura de su área de trabajo.',
    'Horario de trabajo, condiciones laborales y obligaciones contractuales.',
    'Derechos y deberes del trabajador.',
    'Reglamento Interno de Trabajo (RIT), normas y políticas.',
    'Código de Ética y comportamiento y cláusula de confidencialidad.',
    'Generalidades sobre seguridad social.',
    'Nómina y prestaciones sociales.',
    'Incapacidades y reporte de ausencias (salud, accidente o calamidad).',
    'Política de desconexión laboral.',
  ] },
  { titulo: 'Generalidades del SG-SST', temas: [
    'Qué es el SG-SST, objetivos y metas del SG-SST y organigrama SG-SST.',
    'Política de Seguridad y Salud en el Trabajo de LOGYSER S.A.S.',
    'Roles y responsabilidades del trabajador en Seguridad y Salud en el Trabajo (normas de seguridad).',
    'Procesos de formación y capacitación dentro de la compañía.',
  ] },
  { titulo: 'Accidentalidad y enfermedad laboral', temas: [
    'Definición de accidente de trabajo y enfermedad laboral.',
    'Accidentes que puede sufrir en su lugar de trabajo.',
    'Administradora de Riesgos Laborales (ARL) y reporte de accidente de trabajo: protocolo de atención y reporte, investigación y planes de acción.',
  ] },
  { titulo: 'Participación y gestión del SG-SST', temas: [
    'Comité Paritario de Seguridad y Salud en el Trabajo (COPASST) (conformación y funciones).',
    'Comité de Convivencia Laboral (conformación y funciones).',
    'Acoso laboral y acoso sexual: definición, ruta de atención y reporte.',
  ] },
  { titulo: 'Identificación de peligros y riesgos', temas: [
    'Identificación de peligros y valoración de riesgos de exposición (físico, químico, locativo, biológico, biomecánico, mecánico, eléctrico, psicosocial, tránsito y trabajos de alto riesgo como alturas).',
    'Actos y condiciones inseguras: medidas de prevención y autocuidado, y reporte de actos y condiciones.',
    'Procedimiento de trabajo seguro y permisos de trabajo.',
    'Normas de seguridad del cliente.',
  ] },
  { titulo: 'Preparación y atención de emergencias', temas: [
    'Plan de emergencias: objetivo, brigada (conformación y funciones) y personal autorizado para atender emergencias.',
    'Salidas de emergencia, puntos de encuentro, sistema de alarma y simulacros de evacuación.',
    'Equipos, elementos y sistemas para la atención de emergencias (botiquín, camillas, extintores).',
  ] },
  { titulo: 'Programas de prevención y control', temas: [
    'Programas de Vigilancia Epidemiológica: osteomuscular, auditivo y respiratorio (pausas activas, manejo manual de cargas, higiene postural, uso de respiradores y protección auditiva).',
    'Uso correcto y continuo de la dotación y los Elementos de Protección Personal (EPP) suministrados por la empresa, sin alteraciones.',
    'Operación de ramplas, plataformas, estibadores y montacargas (capacitación, autorización y certificación).',
    'Asistencia y participación en campañas y en el programa de inspecciones de seguridad.',
  ] },
  { titulo: 'Seguridad vial', temas: [
    'Plan Estratégico de Seguridad Vial (PESV): nivel aplicable a la empresa y normas de tránsito.',
    'Inspecciones preoperacionales de vehículos.',
  ] },
  { titulo: 'Componente ambiental', temas: [
    'Ahorro y uso eficiente de recursos.',
    'Manejo de residuos sólidos y separación en la fuente según el código de colores (Resolución 2184 de 2019).',
    'Mediciones ambientales (ruido, iluminación, temperatura, material particulado).',
  ] },
  { titulo: 'Retroalimentación o amonestación por incumplimiento de normas', temas: [
    'Se podrán aplicar amonestaciones verbales y escritas por el incumplimiento de las normas, procedimientos y políticas de la empresa. Entre estas conductas se incluyen: no utilizar la dotación y los elementos de protección personal (EPP), operar equipos sin autorización, realizar actos inseguros o exponerse innecesariamente a riesgos, incurrir en actos de violencia o discriminación, omitir el reporte oportuno de condiciones de salud, accidentes e incidentes laborales, incumplir los horarios y tiempos establecidos para las pausas activas, presentarse a laborar bajo los efectos de sustancias psicoactivas o consumirlas durante la jornada laboral, así como incumplir las disposiciones establecidas en el Reglamento Interno de Trabajo y las políticas corporativas. Todas las medidas se adoptarán garantizando el debido proceso y el cumplimiento de la normatividad laboral vigente.',
  ] },
];

// Numeración continua de los temas (1 a 41)
let contador = 0;
const SECCIONES = SECCIONES_TEMAS.map((s, i) => ({ n: i + 1, titulo: s.titulo, temas: s.temas.map(texto => ({ n: ++contador, texto })) }));
const TEMAS = SECCIONES.flatMap(s => s.temas);
const TOTAL_TEMAS = TEMAS.length;

const DECLARACION = [
  'Declaro haber recibido y entendido los contenidos del curso de Seguridad y Salud en el Trabajo, Medio Ambiente, brindado por LOGYSER.',
  'Manifiesto, además, conocer y entender el reglamento de higiene y seguridad en el Trabajo, Reglamento Interno, proceso disciplinario, cláusula de confidencialidad para con LOGYSER y con clientes, Código de Ética; manifiesto conocer e identificar los riesgos a los que voy a estar expuesto y las medidas de control que debo utilizar en el desarrollo de mi labor dando cumplimiento a directrices de la compañía y del cliente.',
  'De igual forma, declaro que he conocido y entendido Políticas de: Seguridad y Salud en el trabajo; Política integral, política de Prevención de consumo de sustancias psicoactivas; No discriminación, Seguridad Vial y aspectos ambientales, que tiene la compañía, por esta razón acepto de manera voluntaria la realización de las pruebas de alcoholemia que el empleador considere necesarias durante la relación laboral.',
  'En concordancia con lo anterior, me obligo y me comprometo a cumplir con las normas y procedimientos establecidos por la empresa, velar por la preservación del medio ambiente, el uso y mantenimiento de los elementos de protección personal tales como: botas de seguridad, uniforme y otros que sean necesarios para el buen desempeño de mi trabajo y/o durante la permanencia en la compañía.',
  'Hacer uso adecuado de las zonas comunes: Comedores, Baños, vestier, lockers así como el no uso de celular en jornada laboral y cualquier otro elemento distractor y que ponga en riesgo mi integridad.',
  'Por último, manifiesto que conozco las sanciones disciplinarias, a las cuales me encuentro expuesto en caso de incumplimiento de lo anteriormente mencionado, de acuerdo con la reglamentación legal vigente, al igual que las dispuestas en el reglamento interno de trabajo.',
];

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
    console.error('[inge] No se pudieron leer los parámetros, se usan los valores por defecto:', err.message);
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
    rolLider: String(valor(p, P.ROL_LIDER) || '').trim(),
    correoHabilitado: ['1', 'true', 'si', 'yes'].includes(normalizarTexto(valor(p, P.HABILITAR))),
  };
}

function cargoPermitido(cargos, cargo) {
  if (!cargos.length) return true;
  const c = normalizarTexto(cargo);
  return cargos.some(x => normalizarTexto(x) === c);
}

function formularioPublico() {
  return { secciones: SECCIONES, declaracion: DECLARACION };
}

// Valida lo que envía el trabajador. Devuelve { error } o { temas: {n: 'SI'|'NO'}, no }.
function validarTemas(temasIn) {
  const temas = {};
  for (const t of TEMAS) {
    const v = String((temasIn || {})[t.n] || '').toUpperCase();
    if (v !== 'SI' && v !== 'NO') return { error: `Falta marcar SI o NO en el tema ${t.n}.` };
    temas[t.n] = v;
  }
  return { temas, no: Object.values(temas).filter(v => v === 'NO').length };
}

async function datosUsuario(usuarioId) {
  const [[u]] = await pool.execute('SELECT ID, Nombre, Colaborador, Cargo FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuarioId]);
  if (!u) return null;
  const nombreColaborador = String(u.Colaborador || '').split(' ** ')[1];
  return { nombre: (nombreColaborador || u.Nombre || u.ID || '').trim(), cargo: u.Cargo || '', urlFirma: await urlFirmaRegistrada(u.ID) };
}

// Quien registra el INGE firma como Analista SST, con su firma registrada
async function analista(usuarioId) {
  return (await datosUsuario(usuarioId)) || { nombre: String(usuarioId || ''), cargo: '', urlFirma: null };
}

// Líder SST: el usuario del rol configurado; su firma sale sola al firmar el trabajador
async function lider(rol) {
  if (!rol) return { nombre: '', cargo: '', urlFirma: null };
  const [[u]] = await pool.execute('SELECT ID FROM Maestro_Usuarios WHERE Rol = ? ORDER BY ID LIMIT 1', [rol]);
  return (u && (await datosUsuario(u.ID))) || { nombre: '', cargo: '', urlFirma: null };
}

async function ciudadDeOperacion(operacion) {
  if (!operacion) return '';
  const [[o]] = await pool.execute('SELECT `C.C.` AS ciudad FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1', [operacion]);
  return (o && o.ciudad) || '';
}

function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function radicado(id) {
  return String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
}

function fechaCorta(v) {
  if (!v) return '—';
  const d = v instanceof Date ? v : new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${v}T12:00:00-05:00` : `${String(v).replace(' ', 'T')}-05:00`);
  return isNaN(d) ? '—' : d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });
}

function leerJson(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return {}; }
}

// Tabla de temas con la X en SI o NO
function htmlTemas(temas) {
  return `<table class="temas">${SECCIONES.map(s => `
    <tr class="tema-sec"><td class="tema-num">${s.n}</td><td>${esc(s.titulo)}</td><td class="tema-x">SI</td><td class="tema-x">NO</td></tr>
    ${s.temas.map(t => `<tr><td class="tema-num"></td><td class="tema-txt">${esc(t.texto)}</td><td class="tema-x">${temas[t.n] === 'SI' ? 'X' : ''}</td><td class="tema-x">${temas[t.n] === 'NO' ? 'X' : ''}</td></tr>`).join('')}`).join('')}</table>`;
}

const htmlDeclaracion = () => DECLARACION.map(p => `<p>${esc(p)}</p>`).join('');

// HTML del documento. e: fila de Dynamic_inge.
async function htmlDocumento(e) {
  const plantilla = await obtenerPlantilla('INGE');
  const temas = leerJson(e.temas);
  const firmado = !!e.fecha_firma;
  const esReinduccion = e.tipo === 'Reinducción';
  const firma = (url, fecha, aviso) => (url
    ? firmaConFecha(`<img src="${esc(url)}" class="sig-img" alt="Firma">`, fecha)
    : `<span class="firma-nota">${aviso}</span>`);
  return reemplazarVariables(plantilla.contenido_html, {
    logo_src: LOGO_BASE64,
    radicado: radicado(e.id_inge),
    tipo: esc(e.tipo || 'Inducción'),
    marca_induccion_si: esReinduccion ? '&nbsp;' : 'X',
    marca_induccion_no: esReinduccion ? 'X' : '&nbsp;',
    marca_reinduccion_si: esReinduccion ? 'X' : '&nbsp;',
    marca_reinduccion_no: esReinduccion ? '&nbsp;' : 'X',
    nombre_trabajador: esc(String(e.nombre_trabajador || '').toUpperCase()) || '—',
    identificacion: esc(e.identificacion) || '—',
    cargo: esc(e.cargo) || '—',
    operacion: esc(e.operacion) || '—',
    ciudad: esc(e.ciudad) || '—',
    fecha_capacitacion: fechaCorta(e.fecha_creacion),
    fecha_ingreso: fechaCorta(e.fecha_ingreso),
    temas_html: htmlTemas(temas),
    total_temas: TOTAL_TEMAS,
    temas_si: firmado ? TOTAL_TEMAS - (Number(e.temas_no) || 0) : '___',
    temas_no: firmado ? Number(e.temas_no) || 0 : '___',
    declaracion_html: htmlDeclaracion(),
    firma_trabajador_html: firma(e.url_firma, e.fecha_firma, 'Firma pendiente'),
    firma_analista_html: firma(e.url_firma_analista, e.fecha_creacion, 'Sin firma registrada'),
    firma_lider_html: firma(e.url_firma_lider, e.fecha_firma, firmado ? 'Sin firma registrada' : 'Firma al completar'),
    nombre_analista: esc(e.nombre_analista) || '—',
    cargo_analista: esc(e.cargo_analista) || 'Analista SST',
    nombre_lider: esc(e.nombre_lider) || '—',
    cargo_lider: esc(e.cargo_lider) || 'Líder SST',
  });
}

async function generarPdf(e) {
  return subirPDFINGE(e.identificacion, e.id_inge, await generarPDF(await htmlDocumento(e)));
}

const OBS_DOC = `INGE ${CODIGO_FORMATO}`;

// Documento 32 (INGE) en Maestro_docTrabajador: solo queda el último generado aquí (los cargados a mano no se tocan)
async function registrarDocumentoTrabajador(e, urlDoc) {
  await pool.execute(
    'DELETE FROM Maestro_docTrabajador WHERE `Identificación` = ? AND Prefijo = ? AND Observaciones LIKE ?',
    [e.identificacion, PREFIJO_DOC, `${OBS_DOC}%`]
  );
  const [vin] = await pool.execute(
    'SELECT Regional, `Operación`, Estado, `Fecha de Ingreso` FROM `Maestro_Vinculación` WHERE `Identificación` = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
    [e.identificacion]
  );
  const v = vin[0] || {};
  const no = Number(e.temas_no) || 0;
  await pool.execute(
    `INSERT INTO Maestro_docTrabajador
       (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso, TipoDocumento, Prefijo, Doc, Observaciones, Usuario)
     VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), v.Regional || e.regional || null, v['Operación'] || e.operacion || null, e.identificacion, v.Estado || null,
      v['Fecha de Ingreso'] || null, ID_DOC_TRABAJADOR, PREFIJO_DOC, urlDoc,
      `${OBS_DOC} v${e.version_formato || '05'} (${radicado(e.id_inge)}) ${e.tipo || ''}: ${TOTAL_TEMAS - no} temas SI, ${no} NO`.slice(0, 512),
      String(e.usuario || '').slice(0, 50)]
  );
}

// Al eliminar un INGE firmado: si quedan otros firmados del trabajador, el más reciente vuelve a su carpeta
async function restaurarUltimoDocumento(identificacion) {
  const [[ultimo]] = await pool.execute(
    'SELECT * FROM Dynamic_inge WHERE identificacion = ? AND url_doc IS NOT NULL ORDER BY fecha_firma DESC LIMIT 1',
    [identificacion]
  );
  if (ultimo) await registrarDocumentoTrabajador(ultimo, ultimo.url_doc);
}

module.exports = {
  PARAMETROS_INGE: P,
  SECCION,
  ID_DOC_TRABAJADOR,
  PREFIJO_DOC,
  OBS_DOC,
  TIPOS,
  TOTAL_TEMAS,
  configuracion,
  cargoPermitido,
  formularioPublico,
  validarTemas,
  analista,
  lider,
  ciudadDeOperacion,
  htmlDocumento,
  generarPdf,
  registrarDocumentoTrabajador,
  restaurarUltimoDocumento,
  radicado,
};
