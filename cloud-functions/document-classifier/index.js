'use strict';

const { Storage } = require('@google-cloud/storage');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const { GoogleAuth } = require('google-auth-library');
const path = require('path');

// ─── Singletons (se reutilizan entre invocaciones en el mismo contenedor) ─────

const storage = new Storage();

let _pool;
const getPool = () => {
  if (!_pool) {
    _pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return _pool;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normaliza texto: trim, minúsculas, sin tildes, limpieza de caracteres especiales.
 */
const normalize = (text) =>
  (text ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Elimina tildes y diacríticos
    .replace(/[^a-z0-9\s]/g, '');    // Elimina caracteres especiales (deja letras, números y espacios)

const formatTimestamp = (date) => {
  const p = (n) => String(n).padStart(2, '0');
  const dd   = p(date.getDate());
  const mm   = p(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  const hh   = p(date.getHours());
  const ss   = p(date.getSeconds());
  return `${dd}${mm}${yyyy}_${hh}${ss}`;
};

/**
 * Retorna el mimeType adecuado según la extensión del archivo.
 */
function getMimeType(extension) {
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.tiff': 'image/tiff',
    '.bmp': 'image/bmp'
  };
  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
}

// ─── Document AI ──────────────────────────────────────────────────────────────

async function extractFieldsFromDocument(bucket, fileName, mimeType) {
  const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
  const client = await auth.getClient();
  const credentials = await client.getAccessToken();

  const projectId = process.env.DOCAI_PROJECT_ID;
  const location = process.env.DOCAI_LOCATION || 'us';
  const processorId = process.env.DOCAI_PROCESSOR_ID;
  const url = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`;

  console.log('[DocAI] Descargando archivo desde GCS...');
  const [fileBuffer] = await storage.bucket(bucket).file(fileName).download();
  const base64Content = fileBuffer.toString('base64');

  const requestBody = {
    rawDocument: {
      content: base64Content,
      mimeType: mimeType,
    },
  };

  console.log(`[DocAI] Enviando a Document AI. MimeType: ${mimeType}, Size: ${fileBuffer.length} bytes`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${credentials.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[DocAI] Error Response:', error);
    throw new Error(`Document AI error: ${error}`);
  }

  const data = await response.json();
  console.log('[DocAI] Success - Document extracted');
  return data.document;
}

// ─── GCS ──────────────────────────────────────────────────────────────────────

async function moveFileCross(srcBucketName, srcPath, destBucketName, destPath) {
  const srcBucket = storage.bucket(srcBucketName);
  const destBucket = storage.bucket(destBucketName);
  
  await srcBucket.file(srcPath).copy(destBucket.file(destPath));
  await srcBucket.file(srcPath).delete();
  console.log(`[GCS] Archivo movido: gs://${srcBucketName}/${srcPath} → gs://${destBucketName}/${destPath}`);
}

async function moveToErrors(bucketName, fileName) {
  if (fileName.startsWith('Errores/')) {
    console.log(`[Skip] El archivo ya está en Errores/: gs://${bucketName}/${fileName}`);
    return;
  }

  // Aseguramos que el nombre en Errores/ no arrastre carpetas previas si las hubiera
  const destPath = `Errores/${path.basename(fileName)}`;
  await moveFileCross(bucketName, fileName, bucketName, destPath);
  console.log(`[GCS] Archivo movido a la ruta de errores: gs://${bucketName}/${destPath}`);
}

// ─── Base de datos ────────────────────────────────────────────────────────────

/**
 * Calcula qué porcentaje de las palabras de `candidate` (registro en BD)
 * aparecen en `extracted` (texto extraído por Document AI).
 * Ejemplo: candidate="Manipulación de alimentos", extracted="MANIPULACIÓN HIGIÉNICA DE ALIMENTOS"
 * → palabras significativas de candidate: ["manipulacion", "alimentos"] (excluye stopwords)
 * → ambas aparecen en extracted → score 1.0
 */
const STOPWORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'a', 'al', 'por', 'con', 'para']);

function matchScore(candidate, extracted) {
  const words = normalize(candidate).split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
  if (words.length === 0) return 0;
  const extractedNorm = normalize(extracted);
  const matched = words.filter(w => extractedNorm.includes(w));
  return matched.length / words.length;
}

async function getPrefijo(pool, docTitle) {
  // 1. Intento exacto (acento/case insensitive)
  const [exactRows] = await pool.execute(
    `SELECT \`Id\`, \`Prefijo\`, \`Documento\`
     FROM \`Config_Doc_Trabajador\`
     WHERE TRIM(\`Documento\`) COLLATE utf8mb4_0900_ai_ci = TRIM(?) COLLATE utf8mb4_0900_ai_ci
     LIMIT 1`,
    [docTitle]
  );
  if (exactRows.length > 0) {
    console.log(`[Config] Coincidencia exacta: "${exactRows[0].Documento}"`);
    return { idConfig: exactRows[0].Id, prefijo: exactRows[0].Prefijo };
  }

  // 2. Coincidencia por palabras clave (fuzzy): carga todos los registros y puntúa
  const [allRows] = await pool.execute(`SELECT \`Id\`, \`Prefijo\`, \`Documento\` FROM \`Config_Doc_Trabajador\``);
  const THRESHOLD = 0.6;
  let best = null;
  let bestScore = 0;

  for (const row of allRows) {
    const score = matchScore(row.Documento, docTitle);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  if (best && bestScore >= THRESHOLD) {
    console.log(`[Config] Coincidencia fuzzy (score ${bestScore.toFixed(2)}): "${best.Documento}" → "${docTitle}"`);
    return { idConfig: best.Id, prefijo: best.Prefijo };
  }

  console.warn(`[Config] Sin coincidencia para: "${docTitle}" (mejor score: ${bestScore.toFixed(2)})`);
  return null;
}

async function getVinculacion(pool, identificacion) {
  // Nota el uso de backticks y los nombres exactos de tu tabla
  const [rows] = await pool.execute(
    `SELECT \`Id Vinculación\` AS IdVinculacion, Regional, \`Operación\` AS Operacion, Estado, \`Fecha de Ingreso\` AS Fecha_Ingreso
     FROM \`Maestro_Vinculación\`
     WHERE \`Identificación\` = ?
     LIMIT 1`,
    [identificacion]
  );
  return rows[0] ?? null;
}

async function insertarDocTrabajador(pool, {
  id,
  identificacion,
  idConfig,
  prefijo,
  vinculacion,
  rutaArchivo
}) {
  const { Regional, Operacion, Estado, Fecha_Ingreso } = vinculacion;

  // Insertar respetando las columnas exactas solicitadas
  await pool.execute(
    `INSERT INTO Maestro_docTrabajador
       (id, \`Validación\`, Regional, \`Operación\`, \`Identificación\`, Estado, Fecha_Ingreso,
        TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud, Justificacion_Solicitud, Usuario)
     VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, 'Document IA', NULL, NULL, NULL, 'Sistema')`,
    [id, Regional, Operacion, identificacion, Estado, Fecha_Ingreso, idConfig, prefijo, rutaArchivo]
  );

  console.log(`[DB] Registro insertado — id: ${id}`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

exports.classifyDocument = async (cloudEvent) => {
  console.log('--- EVENTO RECIBIDO ---');
  
  const data = cloudEvent.data || cloudEvent;
  let bucket = data.bucket || (data.data && data.data.bucket);
  let fileName = data.name || (data.data && data.data.name);

  if (!bucket || !fileName) {
    console.error('--- ERROR CRÍTICO: NO SE PUDO EXTRAER BUCKET O NAME ---');
    return;
  }

  if (fileName.startsWith('Errores/')) {
    console.log(`[Skip] Ignorado (ya está en Errores): ${fileName}`);
    return;
  }

  // 1. Cambio de Bucket de Entrada: Forzar procesamiento solo de 'document_inbox'
  if (bucket !== 'document_inbox') {
    console.log(`[Skip] Bucket ignorado: ${bucket}. Solo se procesa 'document_inbox'.`);
    return;
  }

  // 2. Soporte Multiformato
  const ext = path.extname(fileName).toLowerCase();
  const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.bmp'];

  if (!allowedExtensions.includes(ext)) {
    console.log(`[Skip] Ignorado (formato no soportado): ${fileName}`);
    return;
  }

  console.log(`[Start] Procesando archivo: gs://${bucket}/${fileName}`);

  try {
    const mimeType = getMimeType(ext);
    let document;
    
    // 3. Robustez: Capturar error específico de DocAI o de archivos corruptos sin matar la CF
    try {
      document = await extractFieldsFromDocument(bucket, fileName, mimeType);
    } catch (docAiErr) {
      console.error(`[Error] Fallo en procesamiento de Document AI (archivo posiblemente corrupto o formato inválido):`, docAiErr.message);
      await moveToErrors(bucket, fileName);
      return;
    }

    const entities = document?.entities ?? [];
    const findEntity = (type) =>
      entities
        .find((e) => normalize(e.type) === normalize(type))
        ?.mentionText
        ?.trim() ?? null;

    // 4. Arquitectura de Mapeo y Clasificación: Extraer "identificacion" y "doc"
    const identificacion = findEntity('identificacion');
    const docTitle = findEntity('doc'); // Cambio: ahora busca la entidad 'doc'

    console.log(`[DocAI] Campos extraídos — identificacion: "${identificacion}", doc: "${docTitle}"`);

    // Validar si es clasificable por entidades
    if (!identificacion || !docTitle) {
      console.error('[Error] No se extrajeron los campos requeridos (identificacion y doc). Moviendo a Errores/');
      await moveToErrors(bucket, fileName);
      return;
    }

    const pool = getPool();
    // 4.1. Normalización y búsqueda de Prefijo en BD (la normalización ocurre dentro de getPrefijo vía 'normalize')
    const configDoc = await getPrefijo(pool, docTitle);

    // Validar si es clasificable por prefijo existente
    if (!configDoc) {
      console.error(`[Error] Sin coincidencia en Config_Doc_Trabajador para doc: "${docTitle}". Moviendo a Errores/`);
      await moveToErrors(bucket, fileName);
      return;
    }

    const { idConfig, prefijo } = configDoc;
    console.log(`[Config] Config encontrada: Id=${idConfig}, Prefijo="${prefijo}"`);

    // Extraer datos adicionales de BD antes de mover el archivo (para obtener el Id Vinculación)
    const vinculacion = await getVinculacion(pool, identificacion);

    if (!vinculacion) {
      console.error(`[Error] Identificacion "${identificacion}" no encontrada en Maestro_Vinculación. Moviendo a Errores/`);
      await moveToErrors(bucket, fileName);
      return;
    }

    const idVinculacion = vinculacion.IdVinculacion;
    
    // 5. Organización Final: Mover hacia talenthub_central
    // gs://talenthub_central/[identificacion]/[identificacion].[Prefijo].[IdVinculación]
    const destBucket = 'talenthub_central';
    const destPath = `${identificacion}/${identificacion}.${prefijo}.${idVinculacion}${ext}`;
    
    await moveFileCross(bucket, fileName, destBucket, destPath);

    // Insertar el registro final
    const docId = uuidv4();
    await insertarDocTrabajador(pool, {
      id: docId,
      identificacion,
      idConfig,
      prefijo,
      vinculacion,
      rutaArchivo: `gs://${destBucket}/${destPath}`
    });

    console.log(`[Done] Procesamiento completo, registrado exitosamente: gs://${destBucket}/${destPath}`);
  } catch (err) {
    console.error('[Fatal] Error inesperado en la base de datos o lógica principal:', err);
    throw err; // Solo lanzamos error fatal si falla la BD u otro componente crítico para permitir reintentos del evento
  }
};
