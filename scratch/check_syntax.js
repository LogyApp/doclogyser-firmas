const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Checking syntax for all routes and main entry file...');

const filesToCheck = [
  'app.js',
  'src/routes/pruebaconsumo.js',
  'src/routes/evaluacionsst.js',
  'src/routes/capacitacionsst.js',
  'src/routes/participacion.js',
  'src/routes/compromisosst.js',
  'src/routes/solicitudes.js',
  'src/services/email.js'
];

let failed = false;
filesToCheck.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  try {
    execSync(`node -c "${filePath}"`);
    console.log(`✓ Syntax OK: ${file}`);
  } catch (err) {
    console.error(`✗ Syntax ERROR in ${file}:`, err.message);
    failed = true;
  }
});

if (failed) {
  process.exit(1);
} else {
  console.log('All files checked successfully with 0 syntax errors.');
  process.exit(0);
}
