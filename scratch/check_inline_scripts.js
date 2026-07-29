const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Extracting and checking syntax of inline scripts in index.html...');

const htmlPath = path.join(__dirname, '..', 'src', 'views', 'pruebaconsumo', 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Simple regex to match script tags content
const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;

while ((match = scriptRegex.exec(htmlContent)) !== null) {
  count++;
  let scriptContent = match[1];
  
  // Replace __CONFIG__ with a mock object
  scriptContent = scriptContent.replace(/__CONFIG__/g, '{}');

  const tempFilePath = path.join(__dirname, `temp_script_${count}.js`);
  fs.writeFileSync(tempFilePath, scriptContent, 'utf8');

  try {
    execSync(`node -c "${tempFilePath}"`);
    console.log(`✓ Inline Script #${count} OK`);
  } catch (err) {
    console.error(`✗ Syntax ERROR in Inline Script #${count}:`, err.message);
  } finally {
    try { fs.unlinkSync(tempFilePath); } catch (e) {}
  }
}
