const pool = require('./db');

// ── Documentos del proceso de selección (Portal del aspirante y Panel Admin) ──
// Las listas salen de Config_Doc_Trabajador (solo tipo_doc = 'Trabajador') según su Clasificacion:
//   "1. Documentos Aspirante"   → bloque del aspirante
//   "2. Documentos Técnicos"    → bloque técnico (lo carga Selección)
//   "3. Documentos para Firmas" → documentos que el aspirante firma digitalmente
// Si la tabla no responde o una clasificación queda vacía, se usa el respaldo de
// abajo (copia de cómo está organizada la tabla hoy) para que nada se rompa.

const ID_HOJA_VIDA = 30;   // "Hoja de Vida": en el portal va en su propio bloque (opcional)
const ID_CEDULA = 11;

// Versión propia de la Hoja de Vida que sube el aspirante (opcional). La del sistema
// ocupa el registro de Id 30 en Dynamic_hv_documentos (solo se permite uno por
// aspirante y documento), así que la versión propia va en un archivo aparte y se
// marca en `observaciones` con: "Versión del aspirante: <ruta del archivo>".
const MARCA_HV_ASPIRANTE = 'Versión del aspirante';

function rutaHvAspirante(observaciones) {
  const obs = (observaciones || '').toString().trim();
  if (!obs.toLowerCase().startsWith(MARCA_HV_ASPIRANTE.toLowerCase())) return null;
  const ruta = obs.slice(MARCA_HV_ASPIRANTE.length).replace(/^\s*:\s*/, '').trim();
  return ruta || null;
}

const CLASIFICACIONES = { aspirante: '1.', tecnicos: '2.', firmas: '3.' };

const RESPALDO = {
  aspirante: [
    { id: 11, prefijo: 'CC',      nombre: 'Cédula de Ciudadanía' },
    { id: 5,  prefijo: 'ANT',     nombre: 'Antecedentes' },
    { id: 15, prefijo: 'CERTEPS', nombre: 'Certificado de EPS' },
    { id: 3,  prefijo: 'AD',      nombre: 'Adres' },
    { id: 14, prefijo: 'CERTAFP', nombre: 'Certificado fondo de pensión' },
    { id: 13, prefijo: 'CE',      nombre: 'Certificado de estudio' },
    { id: 17, prefijo: 'CL',      nombre: 'Certificación laboral' },
    { id: 10, prefijo: 'CB',      nombre: 'Cuenta bancaria' },
    { id: 30, prefijo: 'HV',      nombre: 'Hoja de Vida' }
  ],
  tecnicos: [
    { id: 24, prefijo: 'EMO',    nombre: 'Examen médico' },
    { id: 28, prefijo: 'EST.SE', nombre: 'Estudio de seguridad' },
    { id: 27, prefijo: 'ES',     nombre: 'Entrevista de selección' },
    { id: 8,  prefijo: 'BPM',    nombre: 'Manipulación higiénica de alimentos' },
    { id: 53, prefijo: 'VR',     nombre: 'Verificación de referencias' }
  ],
  firmas: [
    { id: 2,  prefijo: 'ACTCON', nombre: 'Acta de conocimiento de condiciones contractuales' },
    { id: 16, prefijo: 'CHC',    nombre: 'Consentimiento historial clínico' },
    { id: 20, prefijo: 'CS',     nombre: 'Condiciones de salud' },
    { id: 39, prefijo: 'MF',     nombre: 'Manual de funciones' },
    { id: 48, prefijo: 'SEOP',   nombre: 'Normas de seguridad en la operación' },
    { id: 49, prefijo: 'TD',     nombre: 'Tratamiento de datos' },
    { id: 33, prefijo: 'ITAL',   nombre: 'Formatos Italcol' }
  ]
};

// Orden en que se muestran (la cédula primero: desbloquea los demás en el portal).
// Un documento nuevo en la tabla aparece al final, ordenado por Id.
const ORDEN = {
  aspirante: [11, 5, 15, 3, 14, 13, 17, 10, 30],
  tecnicos: [24, 28, 27, 8, 53],
  firmas: [2, 16, 20, 39, 48, 49, 33]
};

// Etiquetas que ve el ASPIRANTE en su portal y en la pantalla de firma. El Panel
// Admin usa el nombre oficial de Config_Doc_Trabajador. Un documento sin etiqueta
// aquí muestra su nombre oficial.
const ETIQUETAS_PORTAL = {
  11: 'Copia de la cédula ampliada al 150%',
  5:  'Antecedentes (Policía, Procuraduría, Contraloría)',
  15: 'Certificado de EPS',
  3:  'ADRES (Si no tiene EPS)',
  14: 'Certificado de Pensión',
  13: 'Certificado de Estudio',
  17: 'Certificado Laboral',
  10: 'Certificación Bancaria',
  30: 'Mi propia versión de la Hoja de Vida',
  2:  'Acta de Condiciones / Vinculación',
  16: 'Consentimiento de Historia Clínica',
  20: 'Declaración Condiciones de Salud',
  39: 'Manual de Funciones y Responsabilidades',
  48: 'Normas de Seguridad en la Operación',
  49: 'Tratamiento de Datos Personales',
  33: 'Formatos Específicos Operación (Italcol)'
};

// ── Config_Parametros: documentos de firma que solo aplican a ciertas operaciones ──
// Modulo = 'talenthub', Seccion = 'Aspirantes',
// Concepto = 'Documento de firma solo para operaciones - Id <Id del documento>',
// Parametro = operaciones separadas por coma. Vacío = aplica a todas las operaciones.
const MODULO = 'talenthub';
const SECCION = 'Aspirantes';
const PREFIJO_CONCEPTO_OPERACION = 'Documento de firma solo para operaciones - Id ';
const DEFAULT_OPERACIONES_POR_DOC = { 33: 'Italcol La Estrella' };

// Validaciones y avisos del proceso (Config_Parametros talenthub/Aspirantes).
// Si la fila no existe se usa el valor de DEFAULTS (comportamiento anterior: sin validar, sin avisos).
const P = {
  EXIGIR_DOCS_EN_PROCESO: 'Exigir documentos del aspirante aprobados para pasar a En proceso',
  DOCS_OBLIGATORIOS:      'Documentos del aspirante obligatorios para pasar a En proceso',
  EXIGIR_FIRMAS:          'Exigir todos los documentos de firma para finalizar la contratación',
  HABILITAR_AVISOS:       'Habilitar notificaciones de correo en Aspirantes',
  AVISO_EN_PROCESO:       'Aviso al aspirante al pasar a En proceso',
  AVISO_FIRMAS:           'Aviso a Selección cuando el aspirante completa las firmas',
  AVISO_FIRMAS_PARA:      'Aviso de firmas completas - Para:',
  AVISO_FIRMAS_COPIA:     'Aviso de firmas completas - Copia:',
};
const DEFAULTS = {
  [P.EXIGIR_DOCS_EN_PROCESO]: '0',
  [P.DOCS_OBLIGATORIOS]:      '11, 5, 15/3, 10',
  [P.EXIGIR_FIRMAS]:          '0',
  [P.HABILITAR_AVISOS]:       '0',
  [P.AVISO_EN_PROCESO]:       '1',
  [P.AVISO_FIRMAS]:           '1',
  [P.AVISO_FIRMAS_PARA]:      'CoorSelección',
  [P.AVISO_FIRMAS_COPIA]:     '',
};

const TTL_MS = 5 * 60 * 1000;
let cacheDocs = { t: 0, data: null };
let cacheReglas = { t: 0, data: null };
let cacheParams = { t: 0, data: null };

// { Concepto: Parametro } de todas las filas de talenthub/Aspirantes
async function obtenerParametrosAspirantes() {
  if (cacheParams.data && Date.now() - cacheParams.t < TTL_MS) return cacheParams.data;
  try {
    const [rows] = await pool.execute(
      'SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = ? AND Seccion = ?',
      [MODULO, SECCION]
    );
    const mapa = {};
    rows.forEach(r => { mapa[r.Concepto] = r.Parametro == null ? '' : String(r.Parametro); });
    cacheParams = { t: Date.now(), data: mapa };
    return mapa;
  } catch (err) {
    console.error('[docsSeleccion] No se pudieron leer los parámetros de Aspirantes, se usan los valores por defecto:', err.message);
    return {};
  }
}

function valorParametro(params, concepto) {
  return Object.prototype.hasOwnProperty.call(params || {}, concepto) ? params[concepto] : DEFAULTS[concepto];
}

function parametroActivo(params, concepto) {
  return ['1', 'true', 'si', 'yes'].includes(normalizar(valorParametro(params, concepto)));
}

function listaParametro(params, concepto) {
  return String(valorParametro(params, concepto) || '').split(',').map(x => x.trim()).filter(Boolean);
}

function normalizar(txt) {
  return (txt || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function ordenar(lista, orden) {
  const pos = id => { const i = orden.indexOf(id); return i === -1 ? 1000 + id : i; };
  return [...lista].sort((a, b) => pos(a.id) - pos(b.id));
}

function conEtiqueta(doc) {
  return { ...doc, etiqueta: ETIQUETAS_PORTAL[doc.id] || doc.nombre };
}

// Devuelve { aspirante: [...], tecnicos: [...], firmas: [...] } con { id, prefijo, nombre, etiqueta }.
async function obtenerDocsSeleccion() {
  if (cacheDocs.data && Date.now() - cacheDocs.t < TTL_MS) return cacheDocs.data;

  let filas = [];
  try {
    const [rows] = await pool.execute(
      `SELECT Id, Prefijo, Documento, Clasificacion FROM Config_Doc_Trabajador
       WHERE tipo_doc = 'Trabajador'
         AND (Clasificacion LIKE '1.%' OR Clasificacion LIKE '2.%' OR Clasificacion LIKE '3.%')`
    );
    filas = rows;
  } catch (err) {
    console.error('[docsSeleccion] No se pudo leer Config_Doc_Trabajador, se usa el respaldo:', err.message);
  }

  const data = {};
  for (const [grupo, prefijoClasif] of Object.entries(CLASIFICACIONES)) {
    const deTabla = filas
      .filter(r => (r.Clasificacion || '').trim().startsWith(prefijoClasif))
      .map(r => ({ id: Number(r.Id), prefijo: r.Prefijo, nombre: (r.Documento || '').trim() }));
    const base = deTabla.length ? deTabla : RESPALDO[grupo];
    data[grupo] = ordenar(base, ORDEN[grupo]).map(conEtiqueta);
  }

  // Solo se guarda en caché si la tabla respondió (si falló, se reintenta en la próxima carga)
  if (filas.length) cacheDocs = { t: Date.now(), data };
  return data;
}

// { idDoc: [operaciones normalizadas] } — sin entrada o lista vacía = aplica a todas.
async function obtenerReglasOperacion() {
  const reglas = {};
  for (const [id, ops] of Object.entries(DEFAULT_OPERACIONES_POR_DOC)) {
    reglas[id] = ops.split(',').map(normalizar).filter(Boolean);
  }
  const params = await obtenerParametrosAspirantes();
  for (const [concepto, parametro] of Object.entries(params)) {
    if (!concepto.startsWith(PREFIJO_CONCEPTO_OPERACION)) continue;
    const id = parseInt(concepto.slice(PREFIJO_CONCEPTO_OPERACION.length), 10);
    if (!id) continue;
    reglas[id] = (parametro || '').split(',').map(normalizar).filter(Boolean);
  }
  return reglas;
}

// Documentos para firma que aplican a la operación de la requisición del aspirante.
async function obtenerDocsFirmaParaOperacion(operacion) {
  const [{ firmas }, reglas] = await Promise.all([obtenerDocsSeleccion(), obtenerReglasOperacion()]);
  const op = normalizar(operacion);
  return firmas.filter(d => {
    const ops = reglas[d.id];
    if (!ops || !ops.length) return true;
    return ops.includes(op);
  });
}

// Documento de firma por Id (sin filtrar por operación), o null si no es de firma.
async function obtenerDocFirma(idConfigDoc) {
  const { firmas } = await obtenerDocsSeleccion();
  return firmas.find(d => d.id === Number(idConfigDoc)) || null;
}

const ESTADOS_FIRMA_COMPLETA = ['firmado', 'aprobado'];

// ¿Puede pasar a "En proceso"? Revisa los documentos obligatorios aprobados.
// Cada elemento de la lista es un Id, o varios separados por "/" cuando basta uno
// de ellos (ej. "15/3": Certificado de EPS o ADRES).
// Devuelve { ok, faltantes: [nombres] }.
async function validarPasoEnProceso(idAspirante) {
  const params = await obtenerParametrosAspirantes();
  if (!parametroActivo(params, P.EXIGIR_DOCS_EN_PROCESO)) return { ok: true, faltantes: [] };

  const grupos = listaParametro(params, P.DOCS_OBLIGATORIOS)
    .map(g => g.split('/').map(x => parseInt(x, 10)).filter(Boolean))
    .filter(g => g.length);
  if (!grupos.length) return { ok: true, faltantes: [] };

  const [{ aspirante }, [rows]] = await Promise.all([
    obtenerDocsSeleccion(),
    pool.execute('SELECT id_config_doc, estado FROM Dynamic_hv_documentos WHERE id_aspirante = ?', [idAspirante])
  ]);
  const aprobados = new Set(rows.filter(r => normalizar(r.estado) === 'aprobado').map(r => Number(r.id_config_doc)));
  const nombre = id => (aspirante.find(d => d.id === id) || {}).nombre || `Documento ${id}`;

  const faltantes = grupos
    .filter(g => !g.some(id => aprobados.has(id)))
    .map(g => g.map(nombre).join(' o '));
  return { ok: faltantes.length === 0, faltantes };
}

// Estado de las firmas del aspirante para una operación: { total, completas, faltantes: [nombres] }
async function estadoFirmasAspirante(idAspirante, operacion) {
  const [docs, [rows]] = await Promise.all([
    obtenerDocsFirmaParaOperacion(operacion),
    pool.execute('SELECT id_config_doc, estado FROM Dynamic_hv_documentos WHERE id_aspirante = ?', [idAspirante])
  ]);
  const listos = new Set(rows.filter(r => ESTADOS_FIRMA_COMPLETA.includes(normalizar(r.estado))).map(r => Number(r.id_config_doc)));
  const faltantes = docs.filter(d => !listos.has(d.id)).map(d => d.nombre);
  return { total: docs.length, completas: docs.length - faltantes.length, faltantes };
}

// ¿Puede finalizar la contratación? Revisa que todas las firmas estén completas.
async function validarFirmasParaContratar(idAspirante, operacion) {
  const params = await obtenerParametrosAspirantes();
  if (!parametroActivo(params, P.EXIGIR_FIRMAS)) return { ok: true, faltantes: [] };
  const estado = await estadoFirmasAspirante(idAspirante, operacion);
  return { ok: estado.faltantes.length === 0, faltantes: estado.faltantes };
}

module.exports = {
  PARAMETROS_ASPIRANTES: P,
  obtenerParametrosAspirantes,
  parametroActivo,
  listaParametro,
  validarPasoEnProceso,
  validarFirmasParaContratar,
  estadoFirmasAspirante,
  normalizar,
  ID_HOJA_VIDA,
  ID_CEDULA,
  MARCA_HV_ASPIRANTE,
  rutaHvAspirante,
  obtenerDocsSeleccion,
  obtenerDocsFirmaParaOperacion,
  obtenerDocFirma
};
