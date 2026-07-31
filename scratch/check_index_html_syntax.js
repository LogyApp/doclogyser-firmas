const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Extracting and checking syntax of inline scripts in all index files...');

const files = [
  'src/views/compromisosst/index.html',
  'src/views/evaluacionsst/index.html',
  'src/views/capacitacionsst/index.html',
  'src/views/pruebaconsumo/index.html',
  'src/views/solicitudes/index.html',
  'src/views/logysign/form.html',
  'src/views/logysign/sign.html'
];

let failed = false;

files.forEach(file => {
  const htmlPath = path.join(__dirname, '..', file);
  if (!fs.existsSync(htmlPath)) {
    console.error(`File does not exist: ${file}`);
    return;
  }
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
  let match;
  let count = 0;

  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    count++;
    let scriptContent = match[1];
    scriptContent = scriptContent.replace(/__CONFIG__/g, '{}');

    const tempFilePath = path.join(__dirname, `temp_${path.basename(file)}_${count}.js`);
    fs.writeFileSync(tempFilePath, scriptContent, 'utf8');

    try {
      execSync(`node -c "${tempFilePath}"`);
    } catch (err) {
      console.error(`✗ Syntax ERROR in ${file} script #${count}:`, err.message);
      failed = true;
    } finally {
      try { fs.unlinkSync(tempFilePath); } catch (e) {}
    }
  }
  console.log(`✓ Checked ${file} (${count} script blocks)`);
});

if (failed) {
  process.exit(1);
} else {
  console.log('All index inline scripts parsed successfully with 0 errors.');
  process.exit(0);
}
