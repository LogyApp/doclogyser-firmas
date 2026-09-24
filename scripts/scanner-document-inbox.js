require('dotenv').config();

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { Storage } = require('@google-cloud/storage');

const INPUT_DIR = process.env.SCANNER_INPUT_DIR || 'C:\\Users\\Admin\\OneDrive - APOYO LOGISTICO Y OPERATIVO SAS\\Documents\\Scaner';
const PROCESSED_DIR = path.join(INPUT_DIR, 'Procesados');
const ERROR_DIR = path.join(INPUT_DIR, 'Errores');
const LOG_DIR = path.join(INPUT_DIR, 'logs');
const BUCKET_NAME = process.env.SCANNER_BUCKET || 'document_inbox';
const POLL_MS = Number(process.env.SCANNER_POLL_MS || 3000);
const STABLE_WAIT_MS = Number(process.env.SCANNER_STABLE_WAIT_MS || 1500);
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.bmp']);
const PROCESSING = new Set();

const storage = process.env.GCS_KEYFILE
  ? new Storage({ keyFilename: path.resolve(process.env.GCS_KEYFILE) })
  : new Storage();

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.tiff': 'image/tiff',
    '.bmp': 'image/bmp'
  }[ext] || 'application/octet-stream';
}

function timestamp() {
  return new Date().toISOString();
}

async function writeLog(event, details = {}) {
  await fsp.mkdir(LOG_DIR, { recursive: true });
  const line = JSON.stringify({ timestamp: timestamp(), event, ...details }) + '\n';
  await fsp.appendFile(path.join(LOG_DIR, 'scanner.log.jsonl'), line, 'utf8');
}

async function isStable(filePath) {
  const first = await fsp.stat(filePath);
  await new Promise(resolve => setTimeout(resolve, STABLE_WAIT_MS));
  const second = await fsp.stat(filePath);
  return first.size === second.size && first.mtimeMs === second.mtimeMs;
}

async function moveToFolder(filePath, folder, originalName) {
  await fsp.mkdir(folder, { recursive: true });
  let destination = path.join(folder, originalName);
  try {
    await fsp.access(destination);
    const ext = path.extname(originalName);
    const base = path.basename(originalName, ext);
    destination = path.join(folder, `${base}_${Date.now()}${ext}`);
  } catch {}
  await fsp.rename(filePath, destination);
  return destination;
}

async function processFile(filePath) {
  const fileName = path.basename(filePath);
  if (PROCESSING.has(fileName)) return;
  PROCESSING.add(fileName);

  try {
    if (!(await isStable(filePath))) return;

    const contentType = contentTypeFor(filePath);
    await writeLog('upload_started', { fileName, bucket: BUCKET_NAME, contentType });

    await storage.bucket(BUCKET_NAME).upload(filePath, {
      destination: fileName,
      resumable: false,
      metadata: { contentType }
    });

    const destination = await moveToFolder(filePath, PROCESSED_DIR, fileName);
    await writeLog('upload_accepted', {
      fileName,
      bucketPath: `gs://${BUCKET_NAME}/${fileName}`,
      localDestination: destination,
      note: 'La clasificacion posterior la realiza la Cloud Function document-classifier.'
    });
    console.log(`[OK] ${fileName} subido a gs://${BUCKET_NAME}/${fileName}`);
  } catch (error) {
    try {
      const destination = await moveToFolder(filePath, ERROR_DIR, fileName);
      await writeLog('upload_error', { fileName, localDestination: destination, error: error.message });
    } catch (moveError) {
      await writeLog('upload_error_move_failed', { fileName, error: error.message, moveError: moveError.message });
    }
    console.error(`[ERROR] ${fileName}: ${error.message}`);
  } finally {
    PROCESSING.delete(fileName);
  }
}

async function scanFolder() {
  await fsp.mkdir(INPUT_DIR, { recursive: true });
  const entries = await fsp.readdir(INPUT_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(INPUT_DIR, entry.name);
    if (!ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    await processFile(filePath);
  }
}

async function main() {
  await fsp.mkdir(PROCESSED_DIR, { recursive: true });
  await fsp.mkdir(ERROR_DIR, { recursive: true });
  await fsp.mkdir(LOG_DIR, { recursive: true });

  console.log('Agente de scanner activo.');
  console.log(`Entrada: ${INPUT_DIR}`);
  console.log(`Bucket: gs://${BUCKET_NAME}/`);
  console.log('Presiona Ctrl+C para detenerlo.');

  await scanFolder();
  setInterval(() => scanFolder().catch(error => {
    console.error(`[ERROR] No se pudo revisar la carpeta: ${error.message}`);
    writeLog('scan_error', { error: error.message }).catch(() => {});
  }), POLL_MS);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
