require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

async function reconstruct() {
  const possiblePaths = [
    path.join(__dirname, 'contrato_original.pdf'),
    path.join(__dirname, '..', 'contrato_original.pdf'),
    path.join(__dirname, 'contrato.pdf'),
    path.join(__dirname, '..', 'contrato.pdf')
  ];

  let originalPdfPath = possiblePaths.find(p => fs.existsSync(p));

  if (!originalPdfPath) {
    const scratchFiles = fs.readdirSync(__dirname).filter(f => f.toLowerCase().endsWith('.pdf') && f !== 'test_capacitacion.pdf');
    if (scratchFiles.length > 0) {
      originalPdfPath = path.join(__dirname, scratchFiles[0]);
    }
  }

  if (!originalPdfPath) {
    console.error('ERROR: No se encontró el archivo PDF original.');
    console.error('Por favor guarda el archivo como: scratch/contrato_original.pdf o en la raíz del proyecto.');
    process.exit(1);
  }

  console.log(`[1/5] Archivo original encontrado: ${originalPdfPath}`);
  const originalPdfBuffer = fs.readFileSync(originalPdfPath);

  // Initialize GCS using project service account
  const storage = process.env.GCS_KEYFILE
    ? new Storage({ keyFilename: path.resolve(process.env.GCS_KEYFILE) })
    : new Storage();

  const bucketFirmas = storage.bucket('firmas-images');
  const bucketCentral = storage.bucket('talenthub_central');

  console.log('[2/5] Descargando firma original desde gs://firmas-images/1063947977/firma_1787582019153.png ...');
  const signatureFile = bucketFirmas.file('1063947977/firma_1787582019153.png');
  const [signatureBuffer] = await signatureFile.download();
  console.log(`✓ Firma descargada (${signatureBuffer.length} bytes)`);

  console.log('[3/5] Procesando y estampando firma en el PDF...');
  const pdfDoc = await PDFDocument.load(originalPdfBuffer);
  const signatureImage = await pdfDoc.embedPng(signatureBuffer);
  const fontFecha = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  console.log(`Total páginas del documento: ${pages.length}`);

  // Coordenadas originales registradas en Dynamic_Logysign:
  // [{"page":13,"x":0.48484848484848486,"y":0.2953216374269006,"w":0.29734848484848486,"h":0.06432748538011696}]
  const boxes = [
    {
      page: 13,
      x: 0.48484848484848486,
      y: 0.2953216374269006,
      w: 0.29734848484848486,
      h: 0.06432748538011696
    }
  ];

  // Fecha exacta de firma según el registro y log: 24/08/2026 09:33
  const fechaFirmaTexto = 'Firmado: 24/08/2026 09:33';

  for (const box of boxes) {
    const pageIdx = Math.min(box.page, pages.length) - 1;
    if (pageIdx >= 0 && pageIdx < pages.length) {
      const targetPage = pages[pageIdx];
      const { width: pageWidth, height: pageHeight } = targetPage.getSize();

      const pdfX = box.x * pageWidth;
      const pdfY = (1 - box.y - box.h) * pageHeight;
      const pdfW = box.w * pageWidth;
      const pdfH = box.h * pageHeight;

      console.log(`Estampando en página ${pageIdx + 1}: x=${pdfX.toFixed(2)}, y=${pdfY.toFixed(2)}, w=${pdfW.toFixed(2)}, h=${pdfH.toFixed(2)}`);

      targetPage.drawImage(signatureImage, {
        x: pdfX,
        y: pdfY,
        width: pdfW,
        height: pdfH,
      });

      const fechaFontSize = Math.max(5, Math.min(7, pdfH * 0.22));
      const fechaWidth = fontFecha.widthOfTextAtSize(fechaFirmaTexto, fechaFontSize);
      targetPage.drawText(fechaFirmaTexto, {
        x: pdfX + (pdfW - fechaWidth) / 2,
        y: Math.max(pdfY - fechaFontSize - 2, 2),
        size: fechaFontSize,
        font: fontFecha,
        color: rgb(0.45, 0.45, 0.45),
      });
    }
  }

  const signedPdfBytes = await pdfDoc.save();
  console.log(`✓ PDF generado exitosamente (${signedPdfBytes.length} bytes)`);

  const destKey = '1063947977/1063947977.CONT.202608240911.pdf';
  console.log(`[4/5] Subiendo a gs://talenthub_central/${destKey} ...`);

  const finalPdfFile = bucketCentral.file(destKey);
  await finalPdfFile.save(Buffer.from(signedPdfBytes), {
    contentType: 'application/pdf',
    resumable: false
  });
  console.log('✓ Subida completada a Google Cloud Storage.');

  console.log('[5/5] Verificando existencia y tamaño en GCS...');
  const [exists] = await finalPdfFile.exists();
  if (exists) {
    const [meta] = await finalPdfFile.getMetadata();
    console.log(`\n========================================`);
    console.log(`✓ ¡ARCHIVO RESTAURADO EXITOSAMENTE!`);
    console.log(`  Ubicación: gs://${bucketCentral.name}/${destKey}`);
    console.log(`  Tamaño: ${meta.size} bytes`);
    console.log(`  Actualizado: ${meta.updated}`);
    console.log(`  Link directo: https://digital.logyser.com/logysign/api/signed-pdf/b855bac9-49e0-4b9f-9780-893ea2026ebd`);
    console.log(`========================================\n`);
  } else {
    console.error('ERROR: No se pudo verificar la existencia del archivo en GCS tras subirlo.');
  }

  process.exit(0);
}

reconstruct().catch(err => {
  console.error('Error durante la reconstrucción:', err);
  process.exit(1);
});
