require('dotenv').config();
const path = require('path');
const { Storage } = require('@google-cloud/storage');

const storage = process.env.GCS_KEYFILE
  ? new Storage({ keyFilename: path.resolve(process.env.GCS_KEYFILE) })
  : new Storage();

async function testGcs() {
  try {
    const bucketName = 'document_inbox';
    console.log(`Listing files in bucket "${bucketName}"...`);
    const [files] = await storage.bucket(bucketName).getFiles({ prefix: 'Errores/', maxResults: 10 });
    console.log(`Found ${files.length} files under 'Errores/':`);
    files.forEach(f => {
      console.log(`- ${f.name} (Size: ${f.metadata.size} bytes, Created: ${f.metadata.timeCreated})`);
    });
    process.exit(0);
  } catch (err) {
    console.error('Error in GCS test:', err);
    process.exit(1);
  }
}

testGcs();
