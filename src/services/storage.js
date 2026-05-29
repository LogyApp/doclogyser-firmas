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
    .sort((a, b) => b.name.localeCompare(a.name));
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
};
