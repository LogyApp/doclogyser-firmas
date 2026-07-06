module.paths.push('c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/node_modules');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function getAllHtmlFiles(dir, filesList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getAllHtmlFiles(filePath, filesList);
    } else if (filePath.endsWith('.html')) {
      filesList.push(filePath);
    }
  });
  return filesList;
}

function checkHtmlScripts(absolutePath) {
  const relPath = path.relative('c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas', absolutePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let count = 0;

  while ((match = scriptRegex.exec(content)) !== null) {
    const scriptTag = match[0];
    const jsCode = match[1];

    if (scriptTag.includes(' src=')) {
      continue; // Skip external scripts
    }

    count++;
    // Replace template strings to avoid syntax errors due to template placeholders
    const sanitizedCode = jsCode
      .replace(/__CONFIG__/g, '{}')
      .replace(/__USUARIO_PARAM__/g, '""');

    try {
      new vm.Script(sanitizedCode, { filename: `${relPath}#script_${count}` });
    } catch (err) {
      console.error(`[SYNTAX ERROR] in ${relPath} script block #${count}:`);
      console.error(err.message);
    }
  }
}

const viewsDir = 'c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/src/views';
const allHtml = getAllHtmlFiles(viewsDir);
console.log(`Scanning ${allHtml.length} HTML files...`);
allHtml.forEach(checkHtmlScripts);
console.log('Scan completed.');
