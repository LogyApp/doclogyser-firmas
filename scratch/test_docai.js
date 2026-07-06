require('dotenv').config();
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

async function testDocAi() {
  try {
    console.log('Testing authentication using GoogleAuth with keyFilename...');
    const keyPath = path.resolve(process.env.GCS_KEYFILE || 'google-auth.json');
    console.log('Keyfile path:', keyPath);

    const auth = new GoogleAuth({
      keyFilename: keyPath,
      scopes: 'https://www.googleapis.com/auth/cloud-platform'
    });

    const client = await auth.getClient();
    const credentials = await client.getAccessToken();
    console.log('Successfully authenticated!');
    console.log('Token starts with:', credentials.token.substring(0, 15) + '...');

    const projectId = process.env.DOCAI_PROJECT_ID;
    const location = process.env.DOCAI_LOCATION || 'us';
    const processorId = process.env.DOCAI_PROCESSOR_ID;
    const url = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`;
    console.log('Document AI Target URL:', url);

    process.exit(0);
  } catch (err) {
    console.error('Authentication failed:', err);
    process.exit(1);
  }
}

testDocAi();
