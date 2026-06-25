const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Storage } = require('@google-cloud/storage');
const { GoogleAuth } = require('google-auth-library');
const pool = require('../services/db');

const router = express.Router();

const HTML_INDEX_PATH = path.join(__dirname, '../views/documentClassifier/index.html');

// GCS Initialization
const storage = process.env.GCS_KEYFILE
  ? new Storage({ keyFilename: path.resolve(process.env.GCS_KEYFILE) })
  : new Storage();

const BUCKET_INBOX = 'document_inbox';
const BUCKET_CENTRAL = 'talenthub_central';

// ─── Normalization & Matching Helpers ─────────────────────────────────────────

const normalize = (text) =>
  (text ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '');

const STOPWORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'a', 'al', 'por', 'con', 'para']);

function matchScore(candidate, extracted) {
  const words = normalize(candidate).split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
  if (words.length === 0) return 0;
  const extractedNorm = normalize(extracted);
  const matched = words.filter(w => extractedNorm.includes(w));
  return matched.length / words.length;
}

// Format date as YYMMDDHHSS in Colombia time zone
function formatTimestamp() {
  const date = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yy}${mm}${dd}${hh}${ss}`;
}

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

// ─── Document AI Invocation ──────────────────────────────────────────────────

async function extractFieldsFromBuffer(fileBuffer, mimeType) {
  // Use the same auth library strategy as in Cloud Function
  const authOptions = { scopes: 'https://www.googleapis.com/auth/cloud-platform' };
  if (process.env.GCS_KEYFILE) {
    authOptions.keyFilename = path.resolve(process.env.GCS_KEYFILE);
  }
  const auth = new GoogleAuth(authOptions);
  const client = await auth.getClient();
  const credentials = await client.getAccessToken();

  const projectId = process.env.DOCAI_PROJECT_ID;
  const location = process.env.DOCAI_LOCATION || 'us';
  const processorId = process.env.DOCAI_PROCESSOR_ID;
  const url = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`;

  const base64Content = fileBuffer.toString('base64');
  const requestBody = {
    rawDocument: {
      content: base64Content,
      mimeType: mimeType,
    },
  };

  console.log(`[DocAI] Invoking Document AI: ${url}`);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${credentials.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[DocAI] API Error:', errorText);
    throw new Error(`Document AI API error: ${errorText}`);
  }

  const data = await response.json();
  return data.document;
}

// ─── Database Helpers ─────────────────────────────────────────────────────────

async function getPrefijo(docTitle) {
  // 1. Exact Match
  const [exactRows] = await pool.execute(
    `SELECT Id, Prefijo, Documento FROM Config_Doc_Trabajador
     WHERE TRIM(Documento) COLLATE utf8mb4_0900_ai_ci = TRIM(?) COLLATE utf8mb4_0900_ai_ci LIMIT 1`,
    [docTitle]
  );
  if (exactRows.length > 0) {
    return { idConfig: exactRows[0].Id, prefijo: exactRows[0].Prefijo };
  }

  // 2. Fuzzy Match
  const [allRows] = await pool.execute('SELECT Id, Prefijo, Documento FROM Config_Doc_Trabajador');
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
    return { idConfig: best.Id, prefijo: best.Prefijo };
  }

  return null;
}

async function getVinculacion(identificacion) {
  const [rows] = await pool.execute(
    `SELECT \`Id Vinculación\` AS IdVinculacion, Regional, \`Operación\` AS Operacion, Estado, \`Fecha de Ingreso\` AS Fecha_Ingreso
     FROM \`Maestro_Vinculación\`
     WHERE \`Identificación\` = ?
     ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
    [identificacion]
  );
  return rows[0] ?? null;
}

async function registrarDocumento({
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
     VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, 'Document AI (Test panel)', NULL, NULL, NULL, 'Sistema')`,
    [id, Regional, Operacion, identificacion, Estado, Fecha_Ingreso, idConfig, prefijo, rutaArchivo]
  );
}

// ─── Express Routes ───────────────────────────────────────────────────────────

// Serve test UI
router.get('/', (req, res) => {
  try {
    if (!fs.existsSync(HTML_INDEX_PATH)) {
      return res.status(404).send('<h2>Error: Vista no encontrada</h2>');
    }
    const html = fs.readFileSync(HTML_INDEX_PATH, 'utf8');
    res.send(html);
  } catch (err) {
    console.error('[documentClassifier] Error serving page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// GET /api/document-types
router.get('/api/document-types', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT Id, Prefijo, Documento FROM Config_Doc_Trabajador ORDER BY Documento ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/search-worker/:identificacion
router.get('/api/search-worker/:identificacion', async (req, res) => {
  try {
    const { identificacion } = req.params;
    const [rows] = await pool.execute(
      `SELECT Trabajador, Regional, \`Operación\` AS Operacion, Estado 
       FROM \`Maestro_Vinculación\` 
       WHERE \`Identificación\` = ? 
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );
    if (rows.length) {
      res.json({ found: true, worker: rows[0] });
    } else {
      res.json({ found: false });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/classify
router.post('/api/classify', async (req, res) => {
  try {
    const { base64, filename } = req.body;
    if (!base64 || !filename) {
      return res.status(400).json({ error: 'Faltan parámetros base64 o filename' });
    }

    const cleanBase64 = base64.replace(/^data:.*;base64,/, '');
    const fileBuffer = Buffer.from(cleanBase64, 'base64');
    const ext = path.extname(filename).toLowerCase();
    const mimeType = getMimeType(ext);

    console.log(`[Classifier] Procesando archivo de prueba: ${filename} (${mimeType})`);

    // Call Document AI
    let document;
    try {
      document = await extractFieldsFromBuffer(fileBuffer, mimeType);
    } catch (docAiErr) {
      console.error('[Classifier] Error de Document AI:', docAiErr.message);
      // In case of extraction failure, save in Errores folder and return general error
      const destPath = `Errores/${filename}`;
      await storage.bucket(BUCKET_INBOX).file(destPath).save(fileBuffer, { contentType: mimeType });
      return res.status(200).json({
        status: 'error',
        errorType: 'general',
        message: 'No se pudo procesar el archivo mediante Document AI (posiblemente corrupto).',
        gcsPath: `gs://${BUCKET_INBOX}/${destPath}`
      });
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

    console.log(`[Classifier] Entidades extraídas — ID: "${identificacion}", Doc: "${docTitle}"`);

    // Determine status and paths based on entities
    const hasDoc = !!docTitle;
    const hasId = !!identificacion;

    if (hasDoc && hasId) {
      // Both entities extracted -> Check DB existence
      const configDoc = await getPrefijo(docTitle);
      const vinculacion = await getVinculacion(identificacion);

      if (configDoc && vinculacion) {
        // Success Path!
        const { idConfig, prefijo } = configDoc;
        const timestamp = formatTimestamp();
        const destPath = `${identificacion}/${identificacion}.${prefijo}.${timestamp}${ext}`;

        console.log(`[Classifier] Éxito! Guardando en talento central: gs://${BUCKET_CENTRAL}/${destPath}`);
        await storage.bucket(BUCKET_CENTRAL).file(destPath).save(fileBuffer, { contentType: mimeType });

        // Database insert
        const docId = uuidv4();
        await registrarDocumento({
          id: docId,
          identificacion,
          idConfig,
          prefijo,
          vinculacion,
          rutaArchivo: `gs://${BUCKET_CENTRAL}/${destPath}`
        });

        return res.json({
          status: 'success',
          identificacion,
          trabajador: vinculacion.Trabajador,
          prefijo,
          documento: configDoc.Documento,
          destination: `gs://${BUCKET_CENTRAL}/${destPath}`
        });
      } else if (configDoc && !vinculacion) {
        // Doc matches but ID is not found in database -> Error Type 1 (No Identificacion)
        const { prefijo } = configDoc;
        const destPath = `Errores/${prefijo}/${filename}`;
        console.log(`[Classifier] Error: ID "${identificacion}" no existe en DB. Enrutando a: gs://${BUCKET_INBOX}/${destPath}`);
        await storage.bucket(BUCKET_INBOX).file(destPath).save(fileBuffer, { contentType: mimeType });

        return res.json({
          status: 'error',
          errorType: 'no_identificacion',
          message: 'Número de identificación no legible (No encontrado en base de datos)',
          prefijo,
          extractedDoc: docTitle,
          extractedID: identificacion,
          gcsPath: `gs://${BUCKET_INBOX}/${destPath}`
        });
      } else if (!configDoc && vinculacion) {
        // ID matches but Doc is not found in Config_Doc_Trabajador -> Error Type 2 (No Doc)
        const destPath = `Errores/Identificacion/${identificacion}/${filename}`;
        console.log(`[Classifier] Error: Doc "${docTitle}" no tiene prefijo en DB. Enrutando a: gs://${BUCKET_INBOX}/${destPath}`);
        await storage.bucket(BUCKET_INBOX).file(destPath).save(fileBuffer, { contentType: mimeType });

        return res.json({
          status: 'error',
          errorType: 'no_doc',
          message: 'Tipo de documento no reconocido (Sin coincidencia en base de datos)',
          identificacion,
          extractedDoc: docTitle,
          gcsPath: `gs://${BUCKET_INBOX}/${destPath}`
        });
      } else {
        // Neither matches in Database -> Error general
        const destPath = `Errores/${filename}`;
        console.log(`[Classifier] Error: Ambos campos no coinciden en DB. Enrutando a: gs://${BUCKET_INBOX}/${destPath}`);
        await storage.bucket(BUCKET_INBOX).file(destPath).save(fileBuffer, { contentType: mimeType });

        return res.json({
          status: 'error',
          errorType: 'general',
          message: 'No se identificó ningún campo válido en el documento (Sin correspondencia en base de datos)',
          extractedDoc: docTitle,
          extractedID: identificacion,
          gcsPath: `gs://${BUCKET_INBOX}/${destPath}`
        });
      }
    } else if (hasDoc && !hasId) {
      // Doc extracted but ID is missing -> Error Type 1
      const configDoc = await getPrefijo(docTitle);
      const prefijo = configDoc ? configDoc.Prefijo : 'UNK';
      const destPath = `Errores/${prefijo}/${filename}`;
      console.log(`[Classifier] Error: ID ausente. Enrutando a: gs://${BUCKET_INBOX}/${destPath}`);
      await storage.bucket(BUCKET_INBOX).file(destPath).save(fileBuffer, { contentType: mimeType });

      return res.json({
        status: 'error',
        errorType: 'no_identificacion',
        message: 'Número de identificación no legible',
        prefijo,
        extractedDoc: docTitle,
        gcsPath: `gs://${BUCKET_INBOX}/${destPath}`
      });
    } else if (!hasDoc && hasId) {
      // ID extracted but Doc is missing -> Error Type 2
      const destPath = `Errores/Identificacion/${identificacion}/${filename}`;
      console.log(`[Classifier] Error: Doc ausente. Enrutando a: gs://${BUCKET_INBOX}/${destPath}`);
      await storage.bucket(BUCKET_INBOX).file(destPath).save(fileBuffer, { contentType: mimeType });

      return res.json({
        status: 'error',
        errorType: 'no_doc',
        message: 'Tipo de documento no reconocido',
        identificacion,
        gcsPath: `gs://${BUCKET_INBOX}/${destPath}`
      });
    } else {
      // Neither extracted
      const destPath = `Errores/${filename}`;
      console.log(`[Classifier] Error: Ambos ausentes. Enrutando a: gs://${BUCKET_INBOX}/${destPath}`);
      await storage.bucket(BUCKET_INBOX).file(destPath).save(fileBuffer, { contentType: mimeType });

      return res.json({
        status: 'error',
        errorType: 'general',
        message: 'No se identificó ningún campo en el documento',
        gcsPath: `gs://${BUCKET_INBOX}/${destPath}`
      });
    }

  } catch (err) {
    console.error('[Classifier] Error in POST /api/classify:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/errors - List error files in GCS
router.get('/api/errors', async (req, res) => {
  try {
    const bucket = storage.bucket(BUCKET_INBOX);
    const [files] = await bucket.getFiles({ prefix: 'Errores/' });

    const errorFiles = [];

    for (const file of files) {
      // Skip directory placeholders
      if (file.name.endsWith('/') || Number(file.metadata.size || 0) === 0) continue;

      const name = file.name;
      const baseName = path.basename(name);
      let errorType = 'general';
      let message = 'No se identificó ningún campo en el documento';
      let identificacion = null;
      let prefijo = null;

      // Check classification error rules
      // 1. Identificación reconocida, Doc NO reconocido: Errores/Identificacion/[Identificación]/[NombreArchivo]
      const noDocMatch = name.match(/^Errores\/Identificacion\/([^/]+)\/(.+)$/i);
      // 2. Doc reconocido, Identificación NO legible: Errores/[Prefijo]/[NombreArchivo] (excluyendo la subcarpeta Identificacion)
      const noIdMatch = name.match(/^Errores\/([^/]+)\/(.+)$/i);

      if (noDocMatch) {
        errorType = 'no_doc';
        message = 'Tipo de documento no reconocido';
        identificacion = noDocMatch[1];
      } else if (noIdMatch && noIdMatch[1].toLowerCase() !== 'identificacion') {
        errorType = 'no_identificacion';
        message = 'Número de identificación no legible';
        prefijo = noIdMatch[1];
      }

      errorFiles.push({
        name: baseName,
        path: name,
        sizeBytes: Number(file.metadata.size || 0),
        timeCreated: file.metadata.timeCreated,
        errorType,
        message,
        identificacion,
        prefijo
      });
    }

    res.json(errorFiles);
  } catch (err) {
    console.error('[Classifier] Error in GET /api/errors:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/errors - Delete GCS error file
router.post('/api/errors/delete', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: 'Falta parámetro filePath' });
    }

    console.log(`[Classifier] Deleting GCS file: gs://${BUCKET_INBOX}/${filePath}`);
    await storage.bucket(BUCKET_INBOX).file(filePath).delete();
    res.json({ ok: true });
  } catch (err) {
    console.error('[Classifier] Error deleting GCS file:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/correct - Correct file entities manually (Active Learning)
router.post('/api/correct', async (req, res) => {
  try {
    const { filePath, identificacion, prefijo } = req.body;
    if (!filePath || !identificacion || !prefijo) {
      return res.status(400).json({ error: 'Faltan parámetros: filePath, identificacion o prefijo' });
    }

    console.log(`[Classifier] Correcting file gs://${BUCKET_INBOX}/${filePath} to ID: ${identificacion}, Prefix: ${prefijo}`);

    // 1. Verify worker exists in database
    const vinculacion = await getVinculacion(identificacion);
    if (!vinculacion) {
      return res.status(404).json({ error: `La identificación ${identificacion} no fue encontrada en Maestro_Vinculación.` });
    }

    // 2. Verify prefix exists in database
    const [configRows] = await pool.execute(
      'SELECT Id, Documento FROM Config_Doc_Trabajador WHERE Prefijo = ? LIMIT 1',
      [prefijo]
    );
    if (!configRows.length) {
      return res.status(404).json({ error: `El prefijo de documento "${prefijo}" no existe en Config_Doc_Trabajador.` });
    }
    const idConfig = configRows[0].Id;
    const documentName = configRows[0].Documento;

    // 3. Setup paths and move
    const ext = path.extname(filePath).toLowerCase();
    const timestamp = formatTimestamp();
    const destPath = `${identificacion}/${identificacion}.${prefijo}.${timestamp}${ext}`;

    const srcFile = storage.bucket(BUCKET_INBOX).file(filePath);
    const destFile = storage.bucket(BUCKET_CENTRAL).file(destPath);

    console.log(`[Classifier] Copying gs://${BUCKET_INBOX}/${filePath} → gs://${BUCKET_CENTRAL}/${destPath}`);
    await srcFile.copy(destFile);
    await srcFile.delete();

    // 4. Register in database
    const docId = uuidv4();
    await registrarDocumento({
      id: docId,
      identificacion,
      idConfig,
      prefijo,
      vinculacion,
      rutaArchivo: `gs://${BUCKET_CENTRAL}/${destPath}`
    });

    // 5. Save training JSON metadata for Document AI Active Learning
    const originalFileName = path.basename(filePath);
    const trainingMetadataPath = `Entrenamiento/${originalFileName}.json`;
    const trainingMetadata = {
      originalFile: `gs://${BUCKET_INBOX}/${filePath}`,
      destinationFile: `gs://${BUCKET_CENTRAL}/${destPath}`,
      correctionDetails: {
        identificacion: Number(identificacion),
        prefijo: prefijo,
        documentType: documentName
      },
      correctedBy: 'Usuario (Manual Test Panel)',
      timestamp: new Date().toISOString()
    };

    console.log(`[Classifier] Saving training feedback metadata under gs://${BUCKET_INBOX}/${trainingMetadataPath}`);
    await storage.bucket(BUCKET_INBOX).file(trainingMetadataPath).save(
      JSON.stringify(trainingMetadata, null, 2),
      { contentType: 'application/json' }
    );

    res.json({
      ok: true,
      destination: `gs://${BUCKET_CENTRAL}/${destPath}`,
      docId,
      trabajador: vinculacion.Trabajador
    });
  } catch (err) {
    console.error('[Classifier] Error in manual correction:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/errors/view - Proxy route to view error files from GCS
router.get('/api/errors/view', async (req, res) => {
  try {
    const { filePath } = req.query;
    if (!filePath) {
      return res.status(400).send('Falta parámetro filePath');
    }

    const file = storage.bucket(BUCKET_INBOX).file(filePath);
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).send('Archivo no encontrado en GCS');
    }

    const [metadata] = await file.getMetadata();
    res.setHeader('Content-Type', metadata.contentType || 'application/octet-stream');
    file.createReadStream().pipe(res);
  } catch (err) {
    console.error('[Classifier] Error serving GCS file:', err);
    res.status(500).send('Error al obtener el archivo de GCS');
  }
});

module.exports = router;

