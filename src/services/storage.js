const path = require('path');
const { Storage } = require('@google-cloud/storage');

const storage = process.env.GCS_KEYFILE
  ? new Storage({ keyFilename: path.resolve(process.env.GCS_KEYFILE) })
  : new Storage();

const BUCKET_FIRMAS = process.env.BUCKET_FIRMAS || 'firmas-images';
const BUCKET_PDFS   = process.env.BUCKET_PDFS   || 'talenthub_central';

function archivosMasRecientesPrimero(files) {
  return files
    .filter(f => f.name.endsWith('.png'))
    .sort((a, b) => {
      const ta = new Date(a.metadata?.timeCreated || 0).getTime();
      const tb = new Date(b.metadata?.timeCreated || 0).getTime();
      return tb - ta;
    });
}

async function obtenerFirmaBase64Reciente(identificacion) {
  const bucket = storage.bucket(BUCKET_FIRMAS);
  const [files] = await bucket.getFiles({ prefix: `${identificacion}/` });
  const ordenados = archivosMasRecientesPrimero(files);
  if (!ordenados.length) return null;
  const [buffer] = await ordenados[0].download();
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

async function obtenerUrlFirmaReciente(identificacion) {
  const bucket = storage.bucket(BUCKET_FIRMAS);
  const [files] = await bucket.getFiles({ prefix: `${identificacion}/` });
  const ordenados = archivosMasRecientesPrimero(files);
  if (!ordenados.length) return null;
  return `https://storage.googleapis.com/${BUCKET_FIRMAS}/${ordenados[0].name}`;
}

async function subirFirma(identificacion, bufferPng) {
  const timestamp = Date.now();
  const nombre = `${identificacion}/firma_${timestamp}.png`;
  const file = storage.bucket(BUCKET_FIRMAS).file(nombre);
  await file.save(bufferPng, { contentType: 'image/png' });
  return `https://storage.googleapis.com/${BUCKET_FIRMAS}/${nombre}`;
}

async function subirPDF(identificacion, idTraslado, bufferPdf) {
  const nombre = `${identificacion}/${identificacion}.TRAS.${idTraslado}.pdf`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(bufferPdf, { contentType: 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirPDFRetiro(identificacion, tipo, bufferPdf) {
  const timestamp = Date.now();
  const nombre = `${identificacion}/${identificacion}.RET.${tipo}.${timestamp}.pdf`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(bufferPdf, { contentType: 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirPDFAceptacionRenuncia(identificacion, idVinculacion, bufferPdf) {
  const nombre = `${identificacion}/${identificacion}.AR.${idVinculacion}.pdf`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(bufferPdf, { contentType: 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirPDFExamenEgreso(identificacion, idVinculacion, bufferPdf) {
  const nombre = `${identificacion}/${identificacion}.EMOE.${idVinculacion}.pdf`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(bufferPdf, { contentType: 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirPDFCartaRenuncia(identificacion, idVinculacion, bufferPdf) {
  const nombre = `${identificacion}/${identificacion}.TCR.${idVinculacion}.pdf`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(bufferPdf, { contentType: 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirPDFEvaluacionDesempeno(identificacion, idVinculacion, bufferPdf) {
  const nombre = `${identificacion}/${identificacion}.ED.${idVinculacion}.pdf`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(bufferPdf, { contentType: 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirPDFCesantias(identificacion, idVinculacion, bufferPdf) {
  const nombre = `${identificacion}/${identificacion}.CRS.${idVinculacion}.pdf`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(bufferPdf, { contentType: 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirPDFPazYSalvo(identificacion, idVinculacion, bufferPdf) {
  const nombre = `${identificacion}/${identificacion}.PZ.${idVinculacion}.pdf`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(bufferPdf, { contentType: 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirPDFCertificadoRetiro(identificacion, idVinculacion, bufferPdf) {
  const nombre = `${identificacion}/${identificacion}.CT.${idVinculacion}.pdf`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(bufferPdf, { contentType: 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirPDFEvaluacionRetiro(identificacion, idVinculacion, bufferPdf) {
  const nombre = `${identificacion}/${identificacion}.EVR.${idVinculacion}.pdf`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(bufferPdf, { contentType: 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirPDFAstAsistencia(identificacion, formattedDate, bufferPdf) {
  const nombre = `${identificacion}/${identificacion}.ACTASI.${formattedDate}.pdf`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(bufferPdf, { contentType: 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirPDFGeneralAsistencia(idAsistencia, formattedDate, bufferPdf) {
  const nombre = `asistencias/asistencia_${idAsistencia}_${formattedDate}.pdf`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(bufferPdf, { contentType: 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirPDFPruebaConsumo(identificacion, formattedDate, bufferPdf) {
  const nombre = `${identificacion}/${identificacion}.CPC.${formattedDate}.pdf`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(bufferPdf, { contentType: 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirPDFCompromisoSST(identificacion, formattedDate, bufferPdf) {
  const nombre = `${identificacion}/${identificacion}.CSST.${formattedDate}.pdf`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(bufferPdf, { contentType: 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirPDFEvaluacionSST(identificacion, formattedDate, bufferPdf) {
  const nombre = `${identificacion}/${identificacion}.EVSST.${formattedDate}.pdf`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(bufferPdf, { contentType: 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirPDFCapacitacionSST(identificacion, formattedDate, bufferPdf) {
  const nombre = `${identificacion}/${identificacion}.CAPSST.${formattedDate}.pdf`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(bufferPdf, { contentType: 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirEvidenciaAsistencia(idAsistencia, filename, buffer, contentType) {
  const nombre = `asistencias/${idAsistencia}/evidencias/${filename}`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(buffer, { contentType: contentType || 'image/jpeg' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirDocMovilidadTrabajador(identificacion, tipoConTs, buffer, contentType) {
  const nombre = `${identificacion}/${identificacion}.OTROS.${tipoConTs}.pdf`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(buffer, { contentType: contentType || 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirDocMovilidadExterno(identificacion, filename, buffer, contentType) {
  const nombre = `movilidad/${identificacion}/${filename}`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(buffer, { contentType: contentType || 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirCertificadoBancario(identificacion, formattedDate, buffer, originalName) {
  const ext = path.extname(originalName) || '.pdf';
  const nombre = `${identificacion}/${identificacion}.CB.${formattedDate}${ext}`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  let contentType = 'application/pdf';
  if (ext.toLowerCase() === '.png') contentType = 'image/png';
  else if (ext.toLowerCase() === '.jpg' || ext.toLowerCase() === '.jpeg') contentType = 'image/jpeg';
  
  await file.save(buffer, { contentType });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirPDFConfirmacionInventario(nombreArchivo, bufferPdf) {
  const nombre = `confirma_inventario/${nombreArchivo}`;
  const file = storage.bucket(BUCKET_PDFS).file(nombre);
  await file.save(bufferPdf, { contentType: 'application/pdf' });
  return `https://storage.googleapis.com/${BUCKET_PDFS}/${nombre}`;
}

async function subirSoporteGasto(idperiodo, quincena, año, tipoGasto, tipoIdentificacion, numeroIdentificacion, base64Data) {
  const matches = base64Data.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Formato de base64 inválido.');
  }

  const contentType = matches[1];
  const base64Content = matches[2];
  const buffer = Buffer.from(base64Content, 'base64');

  let ext = '.bin';
  if (contentType === 'application/pdf') ext = '.pdf';
  else if (contentType === 'image/png') ext = '.png';
  else if (contentType === 'image/jpeg' || contentType === 'image/jpg') ext = '.jpg';
  else if (contentType === 'image/webp') ext = '.webp';

  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const HH = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const SS = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${YYYY}${MM}${DD}${HH}${mm}${SS}`;

  const cleanQuincena = quincena.replace(/[^a-zA-Z0-9]/g, '_');
  const cleanTipoGasto = tipoGasto.replace(/[^a-zA-Z0-9]/g, '_');

  const nombreArchivo = `${cleanQuincena}-${año}-${cleanTipoGasto}-${tipoIdentificacion}-${numeroIdentificacion}-${timestamp}${ext}`;
  const pathInBucket = `Caja_Operativa/${idperiodo}/${nombreArchivo}`;
  const bucketName = 'logyser-cloud';

  const file = storage.bucket(bucketName).file(pathInBucket);
  await file.save(buffer, { contentType });

  return `https://storage.googleapis.com/${bucketName}/${pathInBucket}`;
}

module.exports = {
  obtenerFirmaBase64Reciente,
  obtenerUrlFirmaReciente,
  subirFirma,
  subirPDF,
  subirPDFRetiro,
  subirPDFAceptacionRenuncia,
  subirPDFExamenEgreso,
  subirPDFCartaRenuncia,
  subirPDFEvaluacionDesempeno,
  subirPDFCesantias,
  subirPDFPazYSalvo,
  subirPDFCertificadoRetiro,
  subirPDFEvaluacionRetiro,
  subirPDFAstAsistencia,
  subirPDFGeneralAsistencia,
  subirPDFPruebaConsumo,
  subirPDFCompromisoSST,
  subirPDFEvaluacionSST,
  subirPDFCapacitacionSST,
  subirEvidenciaAsistencia,
  subirDocMovilidadTrabajador,
  subirDocMovilidadExterno,
  subirCertificadoBancario,
  subirPDFConfirmacionInventario,
  subirSoporteGasto,
  storage,
};
