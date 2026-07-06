const fs = require('fs');
const path = require('path');

const assetsPath = path.join(__dirname, '../src/services/assets.js');
let content = fs.readFileSync(assetsPath, 'utf8');

// Reemplazar literal '\n' con salto de línea real
content = content.replace(/\\n/g, '\n');

fs.writeFileSync(assetsPath, content, 'utf8');
console.log('✓ Se corrigieron los saltos de línea en assets.js.');
