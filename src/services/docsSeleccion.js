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

const TTL_MS = 5 * 60 * 1000;
let cacheDocs = { t: 0, data: null };
let cacheReglas = { t: 0, data: null };

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
  if (cacheReglas.data && Date.now() - cacheReglas.t < TTL_MS) return cacheReglas.data;

  const reglas = {};
  for (const [id, ops] of Object.entries(DEFAULT_OPERACIONES_POR_DOC)) {
    reglas[id] = ops.split(',').map(normalizar).filter(Boolean);
  }
  try {
    const [rows] = await pool.execute(
      `SELECT Concepto, Parametro FROM Config_Parametros
       WHERE Modulo = ? AND Seccion = ? AND Concepto LIKE ?`,
      [MODULO, SECCION, `${PREFIJO_CONCEPTO_OPERACION}%`]
    );
    for (const r of rows) {
      const id = parseInt((r.Concepto || '').slice(PREFIJO_CONCEPTO_OPERACION.length), 10);
      if (!id) continue;
      reglas[id] = (r.Parametro || '').split(',').map(normalizar).filter(Boolean);
    }
    cacheReglas = { t: Date.now(), data: reglas };
  } catch (err) {
    console.error('[docsSeleccion] No se pudo leer Config_Parametros, se usan las reglas por defecto:', err.message);
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

module.exports = {
  ID_HOJA_VIDA,
  ID_CEDULA,
  MARCA_HV_ASPIRANTE,
  rutaHvAspirante,
  obtenerDocsSeleccion,
  obtenerDocsFirmaParaOperacion,
  obtenerDocFirma
};
