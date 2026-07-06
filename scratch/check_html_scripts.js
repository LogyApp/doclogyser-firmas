module.paths.push('c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/node_modules');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlFiles = [
  'src/views/pruebaconsumo/index.html',
  'src/views/formpruebaconsumo/form.html',
  'src/views/compromisosst/index.html',
  'src/views/formcompromisosst/form.html',
  'src/views/evaluacionsst/index.html',
  'src/views/formevaluacionsst/form.html',
  'src/views/participacion/index.html',
  'src/views/formparticipacion/form.html'
];

function checkHtmlScripts(filePath) {
  const absolutePath = path.join('c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas', filePath);
  if (!fs.existsSync(absolutePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  // Regular expression to match script blocks (ignoring scripts with src attribute)
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let count = 0;

  console.log(`\nChecking ${filePath}...`);
  while ((match = scriptRegex.exec(content)) !== null) {
    const scriptTag = match[0];
    const jsCode = match[1];

    if (scriptTag.includes(' src=')) {
      continue; // Skip external scripts
    }

    count++;
    // Replace template strings like __CONFIG__ with dummy object to avoid syntax errors due to undefined templates
    const sanitizedCode = jsCode
      .replace(/__CONFIG__/g, '{}')
      .replace(/__USUARIO_PARAM__/g, '""');

    try {
      new vm.Script(sanitizedCode, { filename: `${filePath}#script_${count}` });
      console.log(`  [OK] Script block #${count}`);
    } catch (err) {
      console.error(`  [ERROR] Syntax error in ${filePath} script block #${count}:`);
      console.error(err.stack || err.message);
    }
  }
}

htmlFiles.forEach(checkHtmlScripts);
