const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');

function downloadToBase64(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download '${url}' (${res.statusCode})`));
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
  console.log('Downloading images via Node...');
  let logoBase64, img1Base64, img2Base64;
  try {
    logoBase64 = await downloadToBase64('https://storage.googleapis.com/logyser-recibo-public/logo.png');
    img1Base64 = await downloadToBase64('https://storage.googleapis.com/logyser-recursos-corporativos/Imagenes/Actoinseguro1.png');
    img2Base64 = await downloadToBase64('https://storage.googleapis.com/logyser-recursos-corporativos/Imagenes/Actoinseguro2.png');
    console.log('Downloads finished successfully.');
  } catch (err) {
    console.error('Download error:', err.message);
    return;
  }

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    const resizeImage = async (dataUrl) => {
      return await page.evaluate(async (srcDataUrl) => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDim = 240;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > maxDim) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              }
            } else {
              if (height > maxDim) {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            resolve({
              png: canvas.toDataURL('image/png'),
              jpeg: canvas.toDataURL('image/jpeg', 0.8),
              width,
              height,
              originalWidth: img.width,
              originalHeight: img.height
            });
          };
          img.onerror = () => reject(new Error('Failed to load image on canvas'));
          img.src = srcDataUrl;
        });
      }, dataUrl);
    };

    console.log('Resizing logo...');
    const logoResult = await resizeImage(logoBase64);
    console.log('Resizing image 1...');
    const img1Result = await resizeImage(img1Base64);
    console.log('Resizing image 2...');
    const img2Result = await resizeImage(img2Base64);

    console.log('\n--- LOGO DETAILS ---');
    console.log(`Original: ${logoResult.originalWidth}x${logoResult.originalHeight}`);
    console.log(`Resized: ${logoResult.width}x${logoResult.height}`);
    console.log(`PNG length: ${logoResult.png.length}`);

    console.log('\n--- IMG1 DETAILS ---');
    console.log(`Original: ${img1Result.originalWidth}x${img1Result.originalHeight}`);
    console.log(`Resized: ${img1Result.width}x${img1Result.height}`);
    console.log(`JPEG length: ${img1Result.jpeg.length}`);

    console.log('\n--- IMG2 DETAILS ---');
    console.log(`Original: ${img2Result.originalWidth}x${img2Result.originalHeight}`);
    console.log(`Resized: ${img2Result.width}x${img2Result.height}`);
    console.log(`JPEG length: ${img2Result.jpeg.length}`);

    // Save optimized results
    const optimized = {
      logo: logoResult.png, // logo needs transparency
      img1: img1Result.jpeg,
      img2: img2Result.jpeg
    };

    fs.writeFileSync('scratch/optimized_images.json', JSON.stringify(optimized, null, 2));
    console.log('\nSaved optimized base64 to scratch/optimized_images.json');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

main();
