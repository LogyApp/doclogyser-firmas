const fs = require('fs');
const path = require('path');
const content = fs.readFileSync(path.join(__dirname, '../src/services/assets.js'), 'utf8');
console.log('Primeros 500 caracteres de assets.js:');
console.log(content.substring(0, 500));
