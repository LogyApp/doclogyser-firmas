const path = require('path');
const { Storage } = require('@google-cloud/storage');
const { GoogleAuth } = require('google-auth-library');

const storage = process.env.GCS_KEYFILE
  ? new Storage({ keyFilename: path.resolve(process.env.GCS_KEYFILE) })
  : new Storage();

/**
 * Invokes Document AI Custom Extractor in the background, augments it with
 * candidate/worker identification and document name labels, and saves the
 * resulting labeled JSON alongside the PDF in GCS for processor training.
 */
async function registrarEntrenamientoDocumentIA(identificacion, docName, fileBuffer, mimeType) {
  // Execute asynchronously in background using setImmediate so it doesn't block HTTP responses
  setImmediate(async () => {
    try {
      console.log(`[DocAI Training] Background process started for worker: ${identificacion}, doc: ${docName}`);
      
      const projectId = process.env.DOCAI_PROJECT_ID || '594761951101';
      const location = process.env.DOCAI_LOCATION || 'us';
      const processorId = process.env.DOCAI_PROCESSOR_ID || '28167bf427e732d8';
      
      // 1. Get credentials
      const authOptions = { scopes: 'https://www.googleapis.com/auth/cloud-platform' };
      if (process.env.GCS_KEYFILE) {
        authOptions.keyFilename = path.resolve(process.env.GCS_KEYFILE);
      }
      const auth = new GoogleAuth(authOptions);
      const client = await auth.getClient();
      const credentials = await client.getAccessToken();

      // 2. Call Document AI process
      const url = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`;
      const base64Content = fileBuffer.toString('base64');
      const requestBody = {
        rawDocument: {
          content: base64Content,
          mimeType: mimeType || 'application/pdf',
        },
      };

      console.log(`[DocAI Training] Processing document with Document AI Custom Extractor...`);
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
        throw new Error(`Document AI API error: ${errorText}`);
      }

      const data = await response.json();
      const documentObj = data.document || {};

      // 3. Inject ground truth labels
      if (!Array.isArray(documentObj.entities)) {
        documentObj.entities = [];
      }

      // Add 'identificacion' entity
      documentObj.entities.push({
        type: 'identificacion',
        mentionText: String(identificacion),
        confidence: 1.0,
      });

      // Add 'doc' entity
      documentObj.entities.push({
        type: 'doc',
        mentionText: String(docName),
        confidence: 1.0,
      });

      // 4. Save both the original PDF and the updated labeled Document JSON to GCS
      const timestamp = Date.now();
      const baseName = `training_${identificacion}_${timestamp}`;
      const pdfPath = `document_ia_training/${baseName}.pdf`;
      const jsonPath = `document_ia_training/${baseName}.json`;

      const bucketName = process.env.BUCKET_ASPIRANTES || 'hojas_vida_logyser';
      const bucket = storage.bucket(bucketName);

      console.log(`[DocAI Training] Saving PDF to gs://${bucketName}/${pdfPath}`);
      await bucket.file(pdfPath).save(fileBuffer, { contentType: mimeType || 'application/pdf' });

      console.log(`[DocAI Training] Saving labeled JSON to gs://${bucketName}/${jsonPath}`);
      await bucket.file(jsonPath).save(JSON.stringify(documentObj, null, 2), { contentType: 'application/json' });

      console.log(`[DocAI Training] Background process completed successfully for gs://${bucketName}/${pdfPath}`);
    } catch (err) {
      console.error('[DocAI Training] Error in background process:', err.message);
    }
  });
}

module.exports = {
  registrarEntrenamientoDocumentIA
};
