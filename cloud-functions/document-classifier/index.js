'use strict';

const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;
const { Storage } = require('@google-cloud/storage');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

// ─── Singletons (se reutilizan entre invocaciones en el mismo contenedor) ─────

const storage = new Storage();
const docaiClient = new DocumentProcessorServiceClient();

let _pool;
const getPool = () => {
  if (!_pool) {
    _pool = mysql.createPool({
      host: process.env.DB_HOST,
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
 * Normaliza texto: trim, minúsculas, sin tildes.
 * Usado para comparar titulo_obtenido con la tabla Config_Doc_Trabajador.
 */
const normalize = (text) =>
  (text ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Devuelve timestamp en formato ddmmyyyy_hhss (según especificación).
 * Ejemplo: 05062026_1432
 */
const formatTimestamp = (date) => {
  const p = (n) => String(n).padStart(2, '0');
  const dd   = p(date.getDate());
  const mm   = p(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  const hh   = p(date.getHours());
  const ss   = p(date.getSeconds());
  return `${dd}${mm}${yyyy}_${hh}${ss}`;
};

// ─── Document AI ──────────────────────────────────────────────────────────────

async function extractFieldsFromPDF(bucket, fileName) {
  const client = new DocumentProcessorServiceClient({
    apiEndpoint: 'us-documentai.googleapis.com'
  });

  // Asegúrate de que este ID sea el correcto y el procesador esté "Enabled"
  const name = `projects/${process.env.DOCAI_PROJECT_ID}/locations/us/processors/${process.env.DOCAI_PROCESSOR_ID}`;

  // LA ESTRUCTURA CORRECTA PARA GCS
  const request = {
    name: name,
    rawDocument: null, // Aseguramos que esto esté vacío
    gcsDocument: {
      gcsUri: `gs://${bucket}/${fileName}`,
      mimeType: 'application/pdf',
    },
  };

  console.log('[DocAI] Intentando proceso vía GCS URI...');

  try {
    const [result] = await client.processDocument(request);
    return result.document;
  } catch (err) {
    console.error('[DocAI] Error crítico detectado:', err.message);
    throw err;
  }
}

// ─── GCS ──────────────────────────────────────────────────────────────────────

async function moveFile(bucketName, srcPath, destPath) {
  const bucket = storage.bucket(bucketName);
  await bucket.file(srcPath).copy(bucket.file(destPath));
  await bucket.file(srcPath).delete();
  console.log(`[GCS] Archivo movido: "${srcPath}" → "${destPath}"`);
}

// ─── Base de datos ────────────────────────────────────────────────────────────

async function getPrefijo(pool, tituloObtenido) {
  const [rows] = await pool.execute(
    `SELECT Prefijo
     FROM Config_Doc_Trabajador
     WHERE LOWER(TRIM(Documento)) = ?
     LIMIT 1`,
    [normalize(tituloObtenido)]
  );
  return rows[0]?.Prefijo ?? null;
}

async function getVinculacion(pool, identificacion) {
  const [rows] = await pool.execute(
    `SELECT Regional, \`Operación\` AS Operacion, Estado, Fecha_Ingreso
     FROM \`Maestro_Vinculación\`
     WHERE Identificacion = ?
     LIMIT 1`,
    [identificacion]
  );
  return rows[0] ?? null;
}

async function insertarDocTrabajador(pool, {
  id,
  identificacion,
  prefijo,
  vinculacion,
  rutaArchivo,
}) {
  const { Regional, Operacion, Estado, Fecha_Ingreso } = vinculacion;

  await pool.execute(
    `INSERT INTO Maestro_docTrabajador
       (id, Identificacion, Regional, Operacion, Estado, Fecha_Ingreso,
        TipoDocumento, Validacion, Observaciones, Visualizar, Usuario, RutaArchivo)
     VALUES (?, ?, ?, ?, ?, ?, '8', 'PEND', 'Document_IA', 'Cargue', 'Sistema', ?)`,
    [id, identificacion, Regional, Operacion, Estado, Fecha_Ingreso, rutaArchivo]
  );

  console.log(`[DB] Registro insertado — id: ${id}, ruta: ${rutaArchivo}`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

exports.classifyDocument = async (cloudEvent) => {
  // 1. Log detallado de todo el objeto que llega
  console.log('--- EVENTO RECIBIDO ---');
  console.log('Tipo de evento:', typeof cloudEvent);
  console.log('Contenido completo:', JSON.stringify(cloudEvent, null, 2));

  // 2. Intentar extraer de forma super flexible
  const data = cloudEvent.data || cloudEvent; // A veces el data está en la raíz
  let bucket = data.bucket || (data.data && data.data.bucket);
  let fileName = data.name || (data.data && data.data.name);

  if (!bucket || !fileName) {
    console.error('--- ERROR CRÍTICO: NO SE PUDO EXTRAER BUCKET O NAME ---');
    console.error('Data procesada:', JSON.stringify(data));
    console.error('Campos encontrados — bucket:', bucket, 'name:', fileName);
    return; // Salimos para no romper el resto
  }

  console.log(`[ÉXITO] Extracción — Bucket: ${bucket}, Name: ${fileName}`);

  // Ignorar archivos que no sean PDF (e.g. marcadores de carpeta)
  if (!fileName?.toLowerCase().endsWith('.pdf')) {
    console.log(`[Skip] Ignorado (no es PDF): ${fileName}`);
    return;
  }

  console.log(`[Start] Nuevo archivo: gs://${bucket}/${fileName}`);

  try {
    // 1. Extraer documento con Document AI
    const document = await extractFieldsFromPDF(bucket, fileName);

    // 2. Extraer campos específicos del documento
    const entities = document?.entities ?? [];
    const findEntity = (type) =>
      entities
        .find((e) => normalize(e.type) === normalize(type))
        ?.mentionText
        ?.trim() ?? null;

    const identificacion  = findEntity('identificacion');
    const titulo_obtenido = findEntity('titulo_obtenido');

    console.log(
      `[DocAI] Campos extraídos — identificacion: "${identificacion}", titulo_obtenido: "${titulo_obtenido}"`
    );

    if (!identificacion || !titulo_obtenido) {
      console.error('[Error] Document AI no extrajo los campos requeridos. Moviendo a /Errores/');
      await moveFile(bucket, fileName, `Errores/${fileName}`);
      return;
    }

    const pool = getPool();

    // 2. Obtener Prefijo desde configuración dinámica
    const prefijo = await getPrefijo(pool, titulo_obtenido);

    if (!prefijo) {
      console.error(
        `[Error] Sin coincidencia en Config_Doc_Trabajador para: "${titulo_obtenido}". Moviendo a /Errores/`
      );
      await moveFile(bucket, fileName, `Errores/${fileName}`);
      return;
    }

    console.log(`[Config] Prefijo encontrado: "${prefijo}"`);

    // 3. Construir ruta destino y mover archivo
    const timestamp = formatTimestamp(new Date());
    const destPath  = `talenthub_central/${identificacion}/${identificacion}.${prefijo}.${timestamp}.pdf`;

    await moveFile(bucket, fileName, destPath);

    // 4. Obtener datos de Maestro_Vinculación
    const vinculacion = await getVinculacion(pool, identificacion);

    if (!vinculacion) {
      console.error(
        `[Error] Identificacion "${identificacion}" no encontrada en Maestro_Vinculación. ` +
        `El archivo ya fue movido a: ${destPath}`
      );
      return;
    }

    console.log(
      `[DB] Vinculación — Regional: "${vinculacion.Regional}", Estado: "${vinculacion.Estado}"`
    );

    // 5. Insertar registro en Maestro_docTrabajador
    const docId = uuidv4();
    await insertarDocTrabajador(pool, {
      id: docId,
      identificacion,
      prefijo,
      vinculacion,
      rutaArchivo: destPath,
    });

    console.log(`[Done] Procesamiento completo: ${destPath}`);
  } catch (err) {
    console.error('[Fatal] Error inesperado:', err);
    throw err; // Cloud Functions marcará la ejecución como fallida para reintentos
  }
};
