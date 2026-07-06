require('dotenv').config();
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const { GoogleAuth } = require('google-auth-library');

const storage = process.env.GCS_KEYFILE
  ? new Storage({ keyFilename: path.resolve(process.env.GCS_KEYFILE) })
  : new Storage();

async function testProcessor(processorId, projectId) {
  try {
    console.log(`\n--- Testing Processor ID: ${processorId} in Project: ${projectId} ---`);
    
    // Auth setup
    const keyPath = path.resolve(process.env.GCS_KEYFILE || 'google-auth.json');
    const auth = new GoogleAuth({
      keyFilename: keyPath,
      scopes: 'https://www.googleapis.com/auth/cloud-platform'
    });
    const client = await auth.getClient();
    const credentials = await client.getAccessToken();

    // Get a test file from GCS bucket
    const bucketName = 'document_inbox';
    const fileName = 'Errores/20260622094643310.pdf';
    console.log(`Downloading test file gs://${bucketName}/${fileName}...`);
    const [fileBuffer] = await storage.bucket(bucketName).file(fileName).download();
    console.log(`Downloaded ${fileBuffer.length} bytes.`);

    const location = process.env.DOCAI_LOCATION || 'us';
    const url = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`;

    const requestBody = {
      rawDocument: {
        content: fileBuffer.toString('base64'),
        mimeType: 'application/pdf',
      },
    };

    console.log(`Calling Document AI API...`);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const text = await response.text();
    if (!response.ok) {
      console.error(`Error Response (Status ${response.status}):`, text);
      return false;
    }

    const data = JSON.parse(text);
    console.log(`SUCCESS! Extracted entities:`, data.document?.entities?.map(e => `${e.type}: ${e.mentionText}`));
    return true;
  } catch (err) {
    console.error(`Failed testing processor:`, err.message);
    return false;
  }
}

async function run() {
  // Test 1: Local .env config
  const ok1 = await testProcessor(process.env.DOCAI_PROCESSOR_ID, process.env.DOCAI_PROJECT_ID);

  // Test 2: env.yaml config (from production function)
  const ok2 = await testProcessor('28167bf427e732d8', '594761951101');
  
  // Test 3: production processor with project ID name instead of number
  const ok3 = await testProcessor('28167bf427e732d8', 'eternal-brand-454501-i8');

  console.log('\n--- RESULTS SUMMARY ---');
  console.log(`Processor ${process.env.DOCAI_PROCESSOR_ID} (Local .env):`, ok1 ? 'WORKS' : 'FAILED');
  console.log(`Processor 28167bf427e732d8 (Project 594761951101):`, ok2 ? 'WORKS' : 'FAILED');
  console.log(`Processor 28167bf427e732d8 (Project eternal-brand-454501-i8):`, ok3 ? 'WORKS' : 'FAILED');

  process.exit(0);
}

run();
