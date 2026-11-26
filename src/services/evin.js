// SST › Documentación Inicial › EVIN (Evaluación de Inducción Corporativa, SST-F-049): parámetros
// (Config_Parametros sst / EVIN), preguntas y respuestas correctas, calificación, documento con la plantilla
// 'EVIN' (Maestro_Plantillas) y registro del documento 29 (EVIN) en Maestro_docTrabajador (solo el último).
// Rutas: src/routes/evin.js. Pestaña: public/js/sst-evin.js. Página del trabajador: src/views/evin/firmar.html.
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const { obtenerPlantilla, reemplazarVariables, firmaConFecha } = require('./plantilla');
const { generarPDF } = require('./renderer');
const { LOGO_BASE64 } = require('./assets');
const { subirPDFEVIN } = require('./storage');
const { urlFirmaRegistrada } = require('./firmaUsuario');

const SECCION = 'EVIN';
const ID_DOC_TRABAJADOR = 29;
const PREFIJO_DOC = 'EVIN';
const CODIGO_FORMATO = 'SST-F-049';
const TIPOS = ['Inducción', 'Reinducción'];

const P = {
  CARGOS:    'Cargos a los que se les genera la EVIN',
  MINIMO:    'Porcentaje mínimo para aprobar la EVIN',
  HABILITAR: 'Habilitar notificaciones de correo en EVIN',
  RESPUESTA_9: 'Respuesta correcta EVIN pregunta 9 COPASST',
  RESPUESTA_25: 'Respuesta correcta EVIN pregunta 25 PESV',
};
const DEFAULTS = {
  [P.CARGOS]:    '',
  [P.MINIMO]:    '80',
  [P.HABILITAR]: '1',
  [P.RESPUESTA_9]: 'c',
  [P.RESPUESTA_25]: 'b',
};

// Calificación de cada aspecto de la inducción: el trabajador ve la palabra; el PDF marca la letra
const CALIFICACIONES = [
  { clave: 'E', texto: 'Excelente' },
  { clave: 'B', texto: 'Bueno' },
  { clave: 'R', texto: 'Regular' },
  { clave: 'M', texto: 'Malo' },
];

const ASPECTOS = [
  'Organigrama', 'Visión', 'Misión', 'Objetivos de la empresa', 'Políticas de la empresa',
  'Funciones y responsabilidades de su cargo', 'Derechos y deberes del trabajador', 'Reglamento interno de la empresa',
  'Generalidades sobre seguridad social', 'Nómina y prestaciones sociales', 'Jefes inmediatos',
  'Estructura de su área de trabajo', 'Procedimiento de trabajo seguro', 'Permisos de trabajo',
  'Plan Estratégico de Seguridad Vial (PESV)', 'Incapacidades',
];

// Preguntas del formato SST-F-049 v04. `correcta` nunca sale al navegador (ver preguntasPublicas).
const SECCIONES_PREGUNTAS = [
  { titulo: 'Generalidades del SG-SST', preguntas: [
    { n: 1, texto: '¿Qué significa la sigla SG-SST?', correcta: 'd', opciones: {
      a: 'Sistema de Gestión de Seguridad y Salud en la Operación.',
      b: 'Sistema General de Servicios de Salud y Trabajo.',
      c: 'Servicio de Gestión de Seguridad Social y Trabajo.',
      d: 'Sistema de Gestión de Seguridad y Salud en el Trabajo.' } },
    { n: 2, texto: '¿Qué establece la Política de Seguridad y Salud en el Trabajo de LOGYSER S.A.S.?', correcta: 'b', opciones: {
      a: 'El aumento de la producción sin importar los riesgos laborales.',
      b: 'El compromiso de la alta dirección de proteger la seguridad y salud de trabajadores y clientes, controlar los riesgos, prevenir accidentes y enfermedades laborales, cumplir la ley y mejorar continuamente.',
      c: 'La aplicación de amonestaciones a todos los trabajadores.',
      d: 'Reducir las horas extras.' } },
    { n: 3, texto: '¿Cuál de los siguientes es un objetivo del SG-SST?', correcta: 'b', opciones: {
      a: 'Premiar a los trabajadores que realicen de forma correcta su trabajo.',
      b: 'Sensibilizar al personal sobre los peligros de su trabajo para prevenir accidentes y enfermedades laborales.',
      c: 'Aumentar la jornada laboral.',
      d: 'Ninguna de las anteriores.' } },
  ] },
  { titulo: 'Accidentalidad y enfermedad laboral', preguntas: [
    { n: 4, texto: '¿Qué es un accidente de trabajo?', correcta: 'c', opciones: {
      a: 'Todo suceso repentino que ocurre por causa o con ocasión del trabajo.',
      b: 'Puede causar al trabajador una lesión, perturbación funcional, invalidez o la muerte.',
      c: 'A y B son correctas.',
      d: 'Solo la A es correcta.' } },
    { n: 5, texto: '¿Qué es enfermedad laboral?', correcta: 'a', opciones: {
      a: 'Enfermedad causada por el trabajo.',
      b: 'Enfermedad hereditaria.',
      c: 'Enfermedad adquirida en vacaciones.',
      d: 'Enfermedad sin relación con el trabajo.' } },
    { n: 6, texto: '¿Qué accidentes puede sufrir en su lugar de trabajo?', correcta: 'a', opciones: {
      a: 'Caídas, golpes, heridas, atropellamiento.',
      b: 'Dolor de estómago, estrés, fatigas.',
      c: 'Ninguna de las anteriores.',
      d: 'Solo riesgo de caída.' } },
    { n: 7, texto: '¿Cuál es su ARL y en cuánto tiempo se reporta un accidente de trabajo?', correcta: 'a', opciones: {
      a: 'ARL Seguros Sura, reporte en 48 horas.',
      b: 'ARL Axa, reporte en 15 días.',
      c: 'ARL Colmena, reporte en 30 días.',
      d: 'ARL Positiva, reporte en 48 días.' } },
    { n: 8, texto: 'En caso de un accidente de trabajo, el trabajador debe:', correcta: 'b', opciones: {
      a: 'Reportarlo después de terminar la jornada laboral.',
      b: 'Reportarlo de inmediato al jefe y a SST, informar con veracidad, enviar la incapacidad y participar en la investigación.',
      c: 'No asistir a terapias ni reclamar los medicamentos.',
      d: 'Reportarlo solo si genera incapacidad.' } },
  ] },
  { titulo: 'Participación y gestión del SG-SST', preguntas: [
    { n: 9, texto: '¿Qué es el COPASST?', correcta: 'c', opciones: {
      a: 'Es una medida preventiva del acoso laboral.',
      b: 'Organismo que promueve y vigila las normas de SST en la empresa y participa en la investigación de accidentes.',
      c: 'A y B son correctas.',
      d: 'Es el comité encargado del pago de la nómina.' } },
    { n: 10, texto: '¿Qué es el Comité de Convivencia Laboral?', correcta: 'a', opciones: {
      a: 'Medida preventiva del acoso laboral que protege a los trabajadores de los riesgos psicosociales.',
      b: 'Es un comité para dirigir las rutas de evacuación.',
      c: 'Fomenta estilos de vida saludables.',
      d: 'A y C son correctas.' } },
    { n: 11, texto: '¿Qué es acoso laboral?', correcta: 'a', opciones: {
      a: 'Toda conducta persistente y demostrable contra un trabajador que busca causarle miedo, intimidación, angustia o perjuicio.',
      b: 'Una llamada de atención por incumplir las normas de la empresa.',
      c: 'Una diferencia de opinión entre compañeros.',
      d: 'Una capacitación obligatoria.' } },
    { n: 12, texto: '¿Qué debe hacer si es víctima o testigo de una situación de acoso sexual en el trabajo?', correcta: 'a', opciones: {
      a: 'Informar la situación a los canales establecidos por la empresa.',
      b: 'Ignorar la situación.',
      c: 'Compartir la situación con otros compañeros sin reportarla.',
      d: 'Esperar a que la situación se resuelva sola.' } },
    { n: 13, texto: 'Si debe ausentarse por salud, incapacidad, accidente o calamidad, usted debe:', correcta: 'a', opciones: {
      a: 'Informar de forma inmediata a su jefe inmediato.',
      b: 'Informar cuando regrese al trabajo.',
      c: 'No informar a nadie.',
      d: 'Informar solo a un compañero.' } },
    { n: 14, texto: '¿Cuál de las siguientes opciones es un deber del trabajador?', correcta: 'a', opciones: {
      a: 'Respetar a sus compañeros y acatar las recomendaciones para sus tareas.',
      b: 'Incumplir las normas de seguridad sin ninguna consecuencia.',
      c: 'Notificar su estado de salud solo cuando el jefe lo pregunte.',
      d: 'Ninguna de las anteriores.' } },
  ] },
  { titulo: 'Identificación de peligros y riesgos', preguntas: [
    { n: 15, texto: '¿Qué es un acto inseguro?', correcta: 'a', opciones: {
      a: 'Toda acción del trabajador (olvido, error u omisión) que puede generar lesiones.',
      b: 'Una característica insegura del lugar de trabajo.',
      c: 'Un equipo de emergencia.',
      d: 'Una pausa activa.' } },
    { n: 16, texto: '¿Qué es una condición insegura?', correcta: 'b', opciones: {
      a: 'Una acción incorrecta del trabajador.',
      b: 'Una característica insegura del lugar de trabajo que puede generar lesiones.',
      c: 'Un procedimiento de trabajo seguro.',
      d: 'Un elemento de protección personal.' } },
    { n: 17, texto: '¿A qué riesgos está expuesto en su lugar de trabajo?', correcta: 'd', opciones: {
      a: 'Locativo (caídas, golpes, superficies irregulares).',
      b: 'Biomecánico (levantamiento y manipulación de cargas).',
      c: 'Tránsito / seguridad vial (vehículos y montacargas).',
      d: 'Todas las anteriores.' } },
  ] },
  { titulo: 'Preparación y atención de emergencias', preguntas: [
    { n: 18, texto: 'En caso de una emergencia, ¿qué debe hacer primero?', correcta: 'a', opciones: {
      a: 'Seguir las instrucciones del jefe y los brigadistas, evacuar con calma por la ruta y llegar al punto de encuentro.',
      b: 'Continuar trabajando hasta recibir otra instrucción.',
      c: 'Salir corriendo sin seguir las indicaciones.',
      d: 'Quedarse en el puesto de trabajo hasta que pase la emergencia.' } },
    { n: 19, texto: '¿Quién está autorizado para atender una emergencia y manejar los equipos?', correcta: 'b', opciones: {
      a: 'Cualquier trabajador.',
      b: 'El personal brigadista capacitado.',
      c: 'El cliente.',
      d: 'Nadie; se debe esperar.' } },
  ] },
  { titulo: 'Programas de prevención y control', preguntas: [
    { n: 20, texto: 'Sobre las pausas activas es correcto afirmar:', correcta: 'b', opciones: {
      a: 'No es obligatorio participar en ellas.',
      b: 'Se hacen 5 pausas al día (1 grupal y 4 individuales), cada 2 horas, con registro de asistencia.',
      c: 'Se realiza una sola pausa al final de la jornada.',
      d: 'Solo se hacen si el jefe lo solicita.' } },
    { n: 21, texto: 'Sobre los EPP y la dotación es correcto afirmar:', correcta: 'b', opciones: {
      a: 'Se usan solo cuando el jefe está presente.',
      b: 'Se usan toda la jornada, de forma correcta e higiénica; no usarlos genera proceso disciplinario y para reponerlos se entrega el deteriorado.',
      c: 'Si se pierden, no es necesario informar.',
      d: 'Al terminar el contrato puede quedarse con la dotación con logo.' } },
    { n: 22, texto: 'Para operar ramplas, plataformas, estibadores o montacargas:', correcta: 'b', opciones: {
      a: 'Cualquier auxiliar logístico puede operar montacargas.',
      b: 'Se requiere capacitación y autorización del jefe (montacargas: certificación); si falla, se avisa al cliente y no se opera.',
      c: 'El trabajador debe hacer el mantenimiento de los equipos.',
      d: 'Si el equipo falla, se puede seguir operando con cuidado.' } },
  ] },
  { titulo: 'Seguridad vial', preguntas: [
    { n: 23, texto: '¿Cuál de las siguientes acciones es obligatoria al conducir?', correcta: 'c', opciones: {
      a: 'Conducir sin estar certificado como operador.',
      b: 'Exceder los límites de velocidad para llegar más rápido.',
      c: 'Cumplir las normas de tránsito y conducir de manera segura.',
      d: 'Utilizar el celular mientras conduce.' } },
    { n: 24, texto: '¿Para qué se realizan las inspecciones preoperacionales de vehículos?', correcta: 'b', opciones: {
      a: 'Solo para cumplir un requisito documental.',
      b: 'Para verificar antes de operar el estado del vehículo (frenos, luces, llantas, niveles, documentos) y detectar fallas.',
      c: 'Para revisar el vehículo solo cuando ya falla.',
      d: 'Para medir el consumo de combustible.' } },
    { n: 25, texto: '¿Qué nivel de Plan Estratégico de Seguridad Vial (PESV) aplica para la empresa?', correcta: 'b', opciones: {
      a: 'PESV avanzado.',
      b: 'PESV estándar.',
      c: 'PESV básico.',
      d: 'La empresa no está obligada a contar con un PESV.' } },
  ] },
  { titulo: 'Componente ambiental', preguntas: [
    { n: 26, texto: 'Según el código de colores (Res. 2184 de 2019), ¿dónde se depositan los residuos aprovechables limpios y secos (cartón, plástico, papel, vidrio, metal)?', correcta: 'c', opciones: {
      a: 'Caneca verde.',
      b: 'Caneca negra.',
      c: 'Caneca blanca.',
      d: 'Cualquier caneca; luego se separan.' } },
    { n: 27, texto: '¿Para qué se realizan las mediciones ambientales (ruido, iluminación, temperatura, material particulado)?', correcta: 'b', opciones: {
      a: 'Para medir la productividad de los trabajadores.',
      b: 'Para medir la exposición a factores de riesgo, compararla con los límites permitidos y definir controles.',
      c: 'Solo para cumplir un requisito del cliente.',
      d: 'Para determinar el salario del trabajador.' } },
  ] },
];
const PREGUNTAS = SECCIONES_PREGUNTAS.flatMap(s => s.preguntas);
const TOTAL_PREGUNTAS = PREGUNTAS.length;

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
    console.error('[evin] No se pudieron leer los parámetros, se usan los valores por defecto:', err.message);
    return {};
  }
}

function valor(params, concepto) {
  return Object.prototype.hasOwnProperty.call(params || {}, concepto) ? params[concepto] : DEFAULTS[concepto];
}

async function configuracion() {
  const p = await obtenerParametros();
  const minimo = Number(String(valor(p, P.MINIMO) || '').replace(',', '.'));
  const claves = Object.fromEntries(PREGUNTAS.map(q => [q.n, q.correcta]));
  for (const [numero, concepto] of [[9, P.RESPUESTA_9], [25, P.RESPUESTA_25]]) {
    const respuesta = String(valor(p, concepto) || '').trim().toLowerCase();
    const pregunta = PREGUNTAS.find(q => q.n === numero);
    if (!Object.prototype.hasOwnProperty.call(pregunta.opciones, respuesta)) {
      throw new Error(`La respuesta configurada para la pregunta EVIN ${numero} no es válida.`);
    }
    claves[numero] = respuesta;
  }
  return {
    cargos: String(valor(p, P.CARGOS) || '').split(',').map(s => s.trim()).filter(Boolean),
    minimo: minimo > 0 && minimo <= 100 ? minimo : Number(DEFAULTS[P.MINIMO]),
    correoHabilitado: ['1', 'true', 'si', 'yes'].includes(normalizarTexto(valor(p, P.HABILITAR))),
    claves,
  };
}

function cargoPermitido(cargos, cargo) {
  if (!cargos.length) return true;
  const c = normalizarTexto(cargo);
  return cargos.some(x => normalizarTexto(x) === c);
}

// Preguntas y aspectos para la página del trabajador (sin las respuestas correctas)
function formularioPublico() {
  return {
    aspectos: ASPECTOS,
    calificaciones: CALIFICACIONES,
    secciones: SECCIONES_PREGUNTAS.map(s => ({
      titulo: s.titulo,
      preguntas: s.preguntas.map(q => ({ n: q.n, texto: q.texto, opciones: q.opciones })),
    })),
  };
}

// Valida lo que envía el trabajador. Devuelve { error } o { aspectos, respuestas } normalizados.
function validarRespuestas(aspectosIn, respuestasIn) {
  const aspectos = {};
  for (let i = 1; i <= ASPECTOS.length; i++) {
    const v = String((aspectosIn || {})[i] || '').toUpperCase();
    if (!CALIFICACIONES.some(c => c.clave === v)) return { error: `Falta calificar el aspecto «${ASPECTOS[i - 1]}».` };
    aspectos[i] = v;
  }
  const respuestas = {};
  for (const q of PREGUNTAS) {
    const v = String((respuestasIn || {})[q.n] || '').toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(q.opciones, v)) return { error: `Falta responder la pregunta ${q.n}.` };
    respuestas[q.n] = v;
  }
  return { aspectos, respuestas };
}

function calificar(respuestas, minimo, claves) {
  const correctas = PREGUNTAS.filter(q => respuestas[q.n] === claves[q.n]).length;
  const porcentaje = Math.round((correctas / TOTAL_PREGUNTAS) * 10000) / 100;
  return { correctas, total: TOTAL_PREGUNTAS, porcentaje, aprobado: porcentaje >= minimo };
}

// Quien crea la evaluación firma como Responsable de Inducción, con su firma registrada
async function responsable(usuarioId) {
  const [[u]] = await pool.execute('SELECT ID, Nombre, Colaborador, Cargo FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuarioId]);
  if (!u) return { nombre: String(usuarioId || ''), cargo: '', urlFirma: null };
  const nombreColaborador = String(u.Colaborador || '').split(' ** ')[1];
  return {
    nombre: (nombreColaborador || u.Nombre || u.ID || '').trim(),
    cargo: u.Cargo || '',
    urlFirma: await urlFirmaRegistrada(u.ID),
  };
}

// Ciudad: columna C.C. de Maestro_Operaciones para la operación del trabajador
async function ciudadDeOperacion(operacion) {
  if (!operacion) return '';
  const [[o]] = await pool.execute('SELECT `C.C.` AS ciudad FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1', [operacion]);
  return (o && o.ciudad) || '';
}

// Intento de la nueva evaluación: tras una no aprobada va el segundo intento; tras dos seguidas no aprobadas
// (reinducción completa) se vuelve a empezar en el primero.
async function siguienteIntento(identificacion) {
  const [rows] = await pool.execute(
    'SELECT aprobado FROM Dynamic_evin WHERE identificacion = ? AND url_doc IS NOT NULL ORDER BY fecha_firma DESC LIMIT 10',
    [identificacion]
  );
  let fallidas = 0;
  for (const r of rows) { if (Number(r.aprobado) === 1) break; fallidas++; }
  return (fallidas % 2) + 1;
}

// Aviso para la pestaña según la última evaluación firmada del trabajador
function avisoResultado(e) {
  if (!e || !e.url_doc || Number(e.aprobado) === 1) return '';
  return Number(e.intento) >= 2 ? 'reinduccion' : 'segundo';
}

function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function radicado(id) {
  return String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
}

function fechaCorta(v) {
  const d = v ? (v instanceof Date ? v : new Date(`${String(v).replace(' ', 'T')}-05:00`)) : new Date();
  return isNaN(d) ? '—' : d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });
}

function leerJson(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return {}; }
}

const formatoPorcentaje = (n) => (n == null ? '—' : `${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`);

function htmlAspectos(aspectos) {
  const filas = ASPECTOS.map((nombre, i) => {
    const v = aspectos[i + 1];
    return `<tr><td class="asp-nom">${esc(nombre)}</td>${CALIFICACIONES.map(c => `<td class="asp-x">${v === c.clave ? 'X' : ''}</td>`).join('')}</tr>`;
  });
  return `<table class="asp-table"><tr><th>Aspecto</th>${CALIFICACIONES.map(c => `<th class="asp-x" title="${c.texto}">${c.clave}</th>`).join('')}</tr>${filas.join('')}</table>`;
}

// Preguntas con la opción que marcó el trabajador; con respuestas muestra si acertó (para el refuerzo)
function htmlPreguntas(respuestas) {
  const hay = Object.keys(respuestas).length > 0;
  // Las evaluaciones antiguas no tienen claves guardadas y usaron las originales del formato.
  const claves = respuestas._claves || Object.fromEntries(PREGUNTAS.map(q => [q.n, q.correcta]));
  return SECCIONES_PREGUNTAS.map(s => `
    <div class="preg-seccion">${esc(s.titulo)}</div>
    <div class="preg-grid">${s.preguntas.map(q => {
      const marcada = respuestas[q.n];
      const estado = !hay ? '' : (marcada === claves[q.n] ? '<span class="preg-ok">✓ Correcta</span>' : '<span class="preg-mal">✗ Incorrecta</span>');
      return `<div class="preg"><div class="preg-txt">${q.n}. ${esc(q.texto)} ${estado}</div>${Object.entries(q.opciones).map(([k, t]) =>
        `<div class="preg-op${marcada === k ? ' marcada' : ''}"><span class="preg-caja">${marcada === k ? 'X' : '&nbsp;'}</span> ${k}. ${esc(t)}</div>`).join('')}</div>`;
    }).join('')}</div>`).join('');
}

// HTML del documento. e: fila de Dynamic_evin.
async function htmlDocumento(e) {
  const plantilla = await obtenerPlantilla('EVIN');
  const cfg = await configuracion();
  const aspectos = leerJson(e.aspectos);
  const respuestas = leerJson(e.respuestas);
  const firmado = !!e.fecha_firma;
  const aprobado = Number(e.aprobado) === 1;
  const firma = (url, fecha, aviso) => (url
    ? firmaConFecha(`<img src="${esc(url)}" class="sig-img" alt="Firma">`, fecha)
    : `<span class="firma-nota">${aviso}</span>`);
  return reemplazarVariables(plantilla.contenido_html, {
    logo_src: LOGO_BASE64,
    radicado: radicado(e.id_evin),
    tipo: esc(e.tipo || 'Inducción'),
    intento: esc(e.intento || 1),
    nombre_trabajador: esc(String(e.nombre_trabajador || '').toUpperCase()) || '—',
    identificacion: esc(e.identificacion) || '—',
    cargo: esc(e.cargo) || '—',
    operacion: esc(e.operacion) || '—',
    ciudad: esc(e.ciudad) || '—',
    fecha_evaluacion: fechaCorta(e.fecha_creacion),
    aspectos_html: htmlAspectos(aspectos),
    preguntas_html: htmlPreguntas(respuestas),
    total_preguntas: TOTAL_PREGUNTAS,
    minimo_porcentaje: formatoPorcentaje(cfg.minimo),
    minimo_correctas: Math.ceil((cfg.minimo / 100) * TOTAL_PREGUNTAS),
    correctas: firmado ? esc(e.correctas) : '___',
    porcentaje: firmado ? formatoPorcentaje(e.porcentaje) : '___',
    marca_aprobo: firmado && aprobado ? 'X' : '&nbsp;',
    marca_no_aprobo: firmado && !aprobado ? 'X' : '&nbsp;',
    observaciones: esc(e.observaciones || '').replace(/\n/g, '<br>') || '&nbsp;',
    firma_trabajador_html: firma(e.url_firma, e.fecha_firma, 'Firma pendiente'),
    firma_responsable_html: firma(e.url_firma_responsable, e.fecha_creacion, 'Sin firma registrada'),
    nombre_responsable: esc(e.nombre_responsable) || '—',
    cargo_responsable: esc(e.cargo_responsable) || '—',
    calificacion: firmado ? formatoPorcentaje(e.porcentaje) : '—',
    resultado_texto: firmado ? (aprobado ? 'Aprobó' : 'No aprobó') : 'Pendiente',
  });
}

async function generarPdf(e) {
  return subirPDFEVIN(e.identificacion, e.id_evin, await generarPDF(await htmlDocumento(e)));
}

const OBS_DOC = `EVIN ${CODIGO_FORMATO}`;

// Documento 29 (EVIN) en Maestro_docTrabajador: solo queda el último generado aquí (los cargados a mano no se tocan)
async function registrarDocumentoTrabajador(e, urlDoc) {
  // Aspirante aún sin vincular (Doc. SST desde Aspirantes): pasa a la carpeta al vincularlo (docSstPortal.alVincular)
  if (await require('./docSstPortal').registroDiferido(e.id_aspirante)) return;
  await pool.execute(
    'DELETE FROM Maestro_docTrabajador WHERE `Identificación` = ? AND Prefijo = ? AND Observaciones LIKE ?',
    [e.identificacion, PREFIJO_DOC, `${OBS_DOC}%`]
  );
  const [vin] = await pool.execute(
    'SELECT Regional, `Operación`, Estado, `Fecha de Ingreso` FROM `Maestro_Vinculación` WHERE `Identificación` = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
    [e.identificacion]
  );
  const v = vin[0] || {};
  await pool.execute(
    `INSERT INTO Maestro_docTrabajador
       (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso, TipoDocumento, Prefijo, Doc, Observaciones, Usuario)
     VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), v.Regional || e.regional || null, v['Operación'] || e.operacion || null, e.identificacion, v.Estado || null,
      v['Fecha de Ingreso'] || null, ID_DOC_TRABAJADOR, PREFIJO_DOC, urlDoc,
      `${OBS_DOC} v${e.version_formato || '04'} (${radicado(e.id_evin)}) ${e.tipo || ''} intento ${e.intento || 1}: ${Number(e.aprobado) === 1 ? 'aprobó' : 'no aprobó'} ${formatoPorcentaje(e.porcentaje)}`.slice(0, 512),
      String(e.usuario || '').slice(0, 50)]
  );
}

// Al eliminar una evaluación firmada: si quedan otras firmadas del trabajador, la más reciente vuelve a su carpeta
async function restaurarUltimoDocumento(identificacion) {
  const [[ultima]] = await pool.execute(
    'SELECT * FROM Dynamic_evin WHERE identificacion = ? AND url_doc IS NOT NULL ORDER BY fecha_firma DESC LIMIT 1',
    [identificacion]
  );
  if (ultima) await registrarDocumentoTrabajador(ultima, ultima.url_doc);
}

module.exports = {
  PARAMETROS_EVIN: P,
  SECCION,
  ID_DOC_TRABAJADOR,
  PREFIJO_DOC,
  OBS_DOC,
  TIPOS,
  TOTAL_PREGUNTAS,
  configuracion,
  cargoPermitido,
  formularioPublico,
  validarRespuestas,
  calificar,
  responsable,
  ciudadDeOperacion,
  siguienteIntento,
  avisoResultado,
  htmlDocumento,
  generarPdf,
  registrarDocumentoTrabajador,
  restaurarUltimoDocumento,
  radicado,
};
