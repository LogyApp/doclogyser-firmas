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

async function routeToError(bucketName, fileName, errorType, details = {}) {
  if (fileName.startsWith('Errores/')) {
    console.log(`[Skip] El archivo ya está en Errores/: gs://${bucketName}/${fileName}`);
    return;
  }

  const base = path.basename(fileName);
  let destPath = `Errores/${base}`;

  if (errorType === 'no_identificacion' && details.prefijo) {
    destPath = `Errores/${details.prefijo}/${base}`;
  } else if (errorType === 'no_doc' && details.identificacion) {
    destPath = `Errores/Identificacion/${details.identificacion}/${base}`;
  }

  await moveFileCross(bucketName, fileName, bucketName, destPath);
  console.log(`[GCS] Archivo enrutado a errores (${errorType}): gs://${bucketName}/${destPath}`);
}

// ─── Base de datos ────────────────────────────────────────────────────────────

/**
 * Calcula qué porcentaje de las palabras de `candidate` (registro en BD)
 * aparecen en `extracted` (texto extraído por Document AI).
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
  // 1. Intento exacto
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

  // 2. Coincidencia por palabras clave (fuzzy)
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
  const [rows] = await pool.execute(
    `SELECT \`Id Vinculación\` AS IdVinculacion, Regional, \`Operación\` AS Operacion, Estado, \`Fecha de Ingreso\` AS Fecha_Ingreso
     FROM \`Maestro_Vinculación\`
     WHERE \`Identificación\` = ?
     ORDER BY \`Fecha de Ingreso\` DESC
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

  await pool.execute(
    `INSERT INTO Maestro_docTrabajador
       (id, \`Validación\`, Regional, \`Operación\`, \`Identificación\`, Estado, Fecha_Ingreso,
        TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud, Justificacion_Solicitud, Usuario)
     VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, 'Document IA', NULL, NULL, NULL, 'Sistema')`,
    [id, Regional, Operacion, identificacion, Estado, Fecha_Ingreso, idConfig, prefijo, rutaArchivo]
  );

  console.log(`[DB] Registro insertado — id: ${id}`);
}

function formatTimestampColombia() {
  const date = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yy}${mm}${dd}${hh}${ss}`;
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

  if (bucket !== 'document_inbox') {
    console.log(`[Skip] Bucket ignorado: ${bucket}. Solo se procesa 'document_inbox'.`);
    return;
  }

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
    
    try {
      document = await extractFieldsFromDocument(bucket, fileName, mimeType);
    } catch (docAiErr) {
      console.error(`[Error] Fallo en procesamiento de Document AI (archivo posiblemente corrupto o formato inválido):`, docAiErr.message);
      await routeToError(bucket, fileName, 'general');
      return;
    }

    const entities = document?.entities ?? [];
    const findEntity = (type) =>
      entities
        .find((e) => normalize(e.type) === normalize(type))
        ?.mentionText
        ?.trim() ?? null;

    let identificacion = findEntity('identificacion');
    if (identificacion) {
      identificacion = identificacion.replace(/[\.\s,]/g, '').trim();
    }
    const docTitle = findEntity('doc');

    console.log(`[DocAI] Campos extraídos — identificacion: "${identificacion}", doc: "${docTitle}"`);

    const pool = getPool();
    const hasDoc = !!docTitle;
    const hasId = !!identificacion;

    if (hasDoc && hasId) {
      const configDoc = await getPrefijo(pool, docTitle);
      const vinculacion = await getVinculacion(pool, identificacion);

      if (configDoc && vinculacion) {
        // success!
        const { idConfig, prefijo } = configDoc;
        const timestamp = formatTimestampColombia();
        const destBucket = 'talenthub_central';
        const destPath = `${identificacion}/${identificacion}.${prefijo}.${timestamp}${ext}`;
        
        await moveFileCross(bucket, fileName, destBucket, destPath);

        const docId = uuidv4();
        await insertarDocTrabajador(pool, {
          id: docId,
          identificacion,
          idConfig,
          prefijo,
          vinculacion,
          rutaArchivo: `gs://${destBucket}/${destPath}`
        });

        console.log(`[Done] Clasificación exitosa registrada: gs://${destBucket}/${destPath}`);
      } else if (configDoc && !vinculacion) {
        // Doc recognized but ID not in DB -> Error 1
        console.error(`[Error] Identificacion "${identificacion}" no encontrada en Maestro_Vinculación. Enrutando.`);
        await routeToError(bucket, fileName, 'no_identificacion', { prefijo: configDoc.Prefijo });
      } else if (!configDoc && vinculacion) {
        // ID recognized but Doc not in DB -> Error 2
        console.error(`[Error] Doc "${docTitle}" no mapea a prefijo en Config_Doc_Trabajador. Enrutando.`);
        await routeToError(bucket, fileName, 'no_doc', { identificacion });
      } else {
        // Neither matched in DB -> Error General
        console.error(`[Error] Ni doc ni identificacion encontrados en base de datos. Enrutando.`);
        await routeToError(bucket, fileName, 'general');
      }
    } else if (hasDoc && !hasId) {
      // Doc recognized but ID missing -> Error 1
      const configDoc = await getPrefijo(pool, docTitle);
      const prefijo = configDoc ? configDoc.Prefijo : 'UNK';
      await routeToError(bucket, fileName, 'no_identificacion', { prefijo });
    } else if (!hasDoc && hasId) {
      // ID recognized but Doc missing -> Error 2
      await routeToError(bucket, fileName, 'no_doc', { identificacion });
    } else {
      // Neither recognized -> Error General
      await routeToError(bucket, fileName, 'general');
    }
  } catch (err) {
    console.error('[Fatal] Error inesperado en la base de datos o lógica principal:', err);
    throw err;
  }
};
