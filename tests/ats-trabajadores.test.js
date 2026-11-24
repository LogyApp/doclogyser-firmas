const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../src/views/ats/form.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => s.trim());
assert.equal(scripts.length, 1);

function preparar(fetch) {
  const elementos = new Map();
  function elemento(id) {
    if (!elementos.has(id)) {
      elementos.set(id, {
        value: '', checked: false, style: {}, classList: { add() {}, remove() {} }, remove() {},
        appendChild(opcion) { this.options.push(opcion); },
        options: [],
        set innerHTML(valor) { this.html = valor; this.options = []; },
        get innerHTML() { return this.html || ''; }
      });
    }
    return elementos.get(id);
  }
  const avisos = [];
  const context = {
    document: { addEventListener() {}, getElementById: elemento },
    Option: function (label, value) { this.label = label; this.value = value; },
    window: {}, fetch, console, setTimeout() {},
  };
  vm.createContext(context);
  vm.runInContext(scripts[0], context);
  context.showLoading = () => {};
  context.hideLoading = () => {};
  context.showToast = (mensaje, tipo) => avisos.push({ mensaje, tipo });
  vm.runInContext("usuarioActual = 'usuario SST'; opsPorRegional = { Norte: ['Op A', 'Op B'], Sur: ['Op C'] }", context);
  return { context, elemento, avisos };
}

test('consulta con el usuario del formulario y permite seleccionar trabajadores', async () => {
  const urls = [];
  const datos = preparar(async u => {
    urls.push(u);
    return { ok: true, json: async () => [{ identificacion: '123', nombre_trabajador: 'Juan Prueba', estado: 'Activo', operacion: 'Op A' }] };
  });
  datos.elemento('ats-regional').value = 'Norte';
  datos.context.onRegionalChange();
  datos.elemento('ats-operacion').value = 'Op A';
  await datos.context.onOperacionChange();
  assert.match(urls[0], /usuario=usuario%20SST/);
  assert.match(datos.elemento('body-checklist-trab').innerHTML, /Juan Prueba/);
  datos.context.toggleTrabajador('123');
  assert.equal(datos.elemento('count-trabajadores').textContent, 1);
});

test('cambiar regional de trabajadores actualiza operaciones y conserva seleccionados', async () => {
  const datos = preparar(async () => ({ ok: true, json: async () => [] }));
  vm.runInContext("trabajadoresSeleccionados = [{ identificacion: '123', nombre_trabajador: 'Juan' }]", datos.context);
  datos.elemento('sel-trab-regional').value = 'Sur';
  datos.context.onRegionalTrabajadoresChange();
  assert.equal(datos.elemento('sel-trab-operacion').options[0].value, 'Op C');
  assert.equal(vm.runInContext('trabajadoresSeleccionados.length', datos.context), 1);
  assert.equal(datos.elemento('wrap-checklist').style.display, 'none');
});

test('informa errores del servidor y no muestra resultados anteriores', async () => {
  const datos = preparar(async () => ({ ok: false, json: async () => ({ error: 'Error de base de datos' }) }));
  datos.elemento('sel-trab-regional').value = 'Norte';
  datos.elemento('sel-trab-operacion').value = 'Op A';
  await datos.context.cargarTrabajadoresChecklist();
  assert.equal(datos.avisos[0].mensaje, 'Error de base de datos');
  assert.equal(datos.elemento('wrap-checklist').style.display, 'none');
});

test('ignora respuestas tardías de filtros anteriores', async () => {
  const pendientes = [];
  const datos = preparar(() => new Promise(resolve => pendientes.push(resolve)));
  datos.elemento('sel-trab-regional').value = 'Norte';
  datos.elemento('sel-trab-operacion').value = 'Op A';
  const primera = datos.context.cargarTrabajadoresChecklist();
  datos.elemento('sel-trab-operacion').value = 'Op B';
  const segunda = datos.context.cargarTrabajadoresChecklist();
  pendientes[1]({ ok: true, json: async () => [{ identificacion: '2', nombre_trabajador: 'Actual', operacion: 'Op B' }] });
  await segunda;
  pendientes[0]({ ok: true, json: async () => [{ identificacion: '1', nombre_trabajador: 'Anterior', operacion: 'Op A' }] });
  await primera;
  assert.match(datos.elemento('body-checklist-trab').innerHTML, /Actual/);
  assert.doesNotMatch(datos.elemento('body-checklist-trab').innerHTML, /Anterior/);
});

test('seleccionar todos conserva el estado de trabajadores retirados', async () => {
  const datos = preparar(async () => ({
    ok: true,
    json: async () => [{ identificacion: '3', nombre_trabajador: 'Persona Retirada', estado: 'Retirado', operacion: 'Op A' }]
  }));
  datos.elemento('sel-trab-regional').value = 'Norte';
  datos.elemento('sel-trab-operacion').value = 'Op A';
  await datos.context.cargarTrabajadoresChecklist();
  datos.context.actualizarChipsTrabajadores = () => {};
  datos.context.toggleSeleccionarTodosTrab(true);
  assert.equal(vm.runInContext('trabajadoresSeleccionados[0].estado', datos.context), 'Retirado');
});
