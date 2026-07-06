const assets = require('../src/services/assets');

console.log('Teclas exportadas en assets:', Object.keys(assets));
for (const key of Object.keys(assets)) {
  const value = assets[key];
  console.log(`- ${key}: longitud = ${value ? value.length : 0} caracteres`);
  if (value) {
    console.log(`  Comienza con: "${value.substring(0, 50)}..."`);
  }
}
