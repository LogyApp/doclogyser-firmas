const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('frontend inventario incluye columna de Costo editable y handlers en el modal de elementos', () => {
  const htmlIndex = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'inventario', 'index.html'), 'utf8');

  // 1. Cabecera de la tabla en el modal
  assert.match(htmlIndex, /Costo \(Editable ✏️\)/);

  // 2. Columna en el grid
  assert.match(htmlIndex, /class="col-costo-td"/);
  assert.match(htmlIndex, /class="costo-view"/);
  assert.match(htmlIndex, /class="costo-form"/);
  assert.match(htmlIndex, /class="costo-input"/);

  // 3. Handlers de JavaScript
  assert.match(htmlIndex, /window\.startEditCosto\s*=/);
  assert.match(htmlIndex, /window\.cancelEditCosto\s*=/);
  assert.match(htmlIndex, /window\.handleCostoKeydown\s*=/);
  assert.match(htmlIndex, /window\.saveEditCosto\s*=/);
  assert.match(htmlIndex, /\/inventario\/api\/articulos\/elementos\/editar-costo/);
});

test('backend inventario expone endpoint para editar costo de todos los artículos de un elemento', () => {
  const routeFile = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'inventario.js'), 'utf8');

  // 1. Consulta en GET /api/articulos/elementos incluye MAX(Costo) y distinctCostos
  assert.match(routeFile, /MAX\(Costo\) AS costoMax/);
  assert.match(routeFile, /COUNT\(DISTINCT Costo\) AS distinctCostos/);
  assert.match(routeFile, /costo:\s*costoVal/);

  // 2. Endpoint POST /api/articulos/elementos/editar-costo
  assert.match(routeFile, /router\.post\('\/api\/articulos\/elementos\/editar-costo'/);
  assert.match(routeFile, /UPDATE Dynamic_Articulos SET Costo = \? WHERE Elemento = \? OR Elemento = \?/);
});
