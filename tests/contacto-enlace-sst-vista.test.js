const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../src/views/sst/index.html'), 'utf8');
const inicio = html.indexOf('    async function refrescarContactoEnlaceSst(');
const fin = html.indexOf('    async function guardarContactoEnlaceSst(', inicio);
assert.ok(inicio >= 0 && fin > inicio);

function preparar() {
  const llamadas = [];
  const context = {
    selectedItems: { csst: { idcsst: '1', token_trabajador: 'token-original', celular_trabajador: 'anterior' } },
    dataStore: { csst: [] },
    precargasDetalleSst: new Map([['csst|1', {}], ['ats|3', {}]]),
    atsState: { selectedId: 3 },
    currentExpedienteTrabajadorId: '123',
    window: {},
    cargarCompromisos: async () => { context.dataStore.csst = [{ idcsst: '1', celular_trabajador: 'nuevo', email_trabajador: 'nuevo@ejemplo.com' }]; },
    renderDetalleCompromisoHtml: item => llamadas.push({ compromiso: { ...item } }),
    abrirDetalleAts: async id => llamadas.push({ ats: id }),
    abrirExpedienteTrabajador: async (id, historial) => llamadas.push({ expediente: [id, historial] })
  };
  vm.createContext(context);
  vm.runInContext(html.slice(inicio, fin), context);
  return { context, llamadas };
}

test('refresca compromiso conservando el token del enlace', async () => {
  const { context, llamadas } = preparar();
  await context.refrescarContactoEnlaceSst('csst', '1');
  assert.equal(llamadas[0].compromiso.token_trabajador, 'token-original');
  assert.equal(llamadas[0].compromiso.celular_trabajador, 'nuevo');
  assert.equal(context.precargasDetalleSst.has('csst|1'), false);
});

test('refresca ATS y expediente médico sin abrir otro trabajador', async () => {
  const { context, llamadas } = preparar();
  await context.refrescarContactoEnlaceSst('ats', '8');
  assert.equal(context.precargasDetalleSst.has('ats|3'), false);
  assert.equal(llamadas[0].ats, 3);
  await context.refrescarContactoEnlaceSst('cm-cierre', '4', '123');
  assert.equal(llamadas[1].expediente[0], '123');
  assert.equal(llamadas[1].expediente[1], false);
  await context.refrescarContactoEnlaceSst('cm-cierre', '4', '456');
  assert.equal(llamadas.length, 2);
});
