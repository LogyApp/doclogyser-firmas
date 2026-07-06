const https = require('https');
const fs = require('fs');

function getBase64(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${res.statusCode})`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString('base64');
        const contentType = res.headers['content-type'] || 'image/png';
        resolve(`data:${contentType};base64,${base64}`);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  try {
    const logo = await getBase64('https://storage.googleapis.com/logyser-recibo-public/logo.png');
    const img1 = await getBase64('https://storage.googleapis.com/logyser-recursos-corporativos/Imagenes/Actoinseguro1.png');
    const img2 = await getBase64('https://storage.googleapis.com/logyser-recursos-corporativos/Imagenes/Actoinseguro2.png');

    console.log('--- LOGO ---');
    console.log(logo ? logo.substring(0, 80) + '... (length: ' + logo.length + ')' : 'Failed');
    console.log('--- IMG1 ---');
    console.log(img1 ? img1.substring(0, 80) + '... (length: ' + img1.length + ')' : 'Failed');
    console.log('--- IMG2 ---');
    console.log(img2 ? img2.substring(0, 80) + '... (length: ' + img2.length + ')' : 'Failed');

    fs.writeFileSync('scratch/images_base64.json', JSON.stringify({ logo, img1, img2 }, null, 2));
    console.log('Saved to scratch/images_base64.json');
  } catch (err) {
    console.error('Error running fetch:', err.message);
  }
}

main();
