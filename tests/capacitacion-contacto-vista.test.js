const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../src/views/sst/index.html'), 'utf8');
const inicio = html.indexOf('    async function guardarContactoCapacitacion(event) {');
const fin = html.indexOf('    function abrirModalEditarCapacitacion(id)', inicio);
assert.ok(inicio >= 0 && fin > inicio);
const funcion = html.slice(inicio, fin);

function preparar(respuesta) {
  const trabajador = { id_capacitacion: 'cap-1', identificacion: '123', celular_trabajador: 'anterior' };
  const otraCapacitacion = { id_capacitacion: 'cap-2', identificacion: '123' };
  const otroTrabajador = { id_capacitacion: 'cap-3', identificacion: '456' };
  const llamadas = [];
  const context = {
    selectedItems: { cap: trabajador },
    dataStore: { cap: [trabajador, otraCapacitacion, otroTrabajador] },
    CONFIG: { usuarioId: 'usuario' },
    document: { getElementById: id => ({ value: id === 'cap-contacto-email' ? 'nuevo@ejemplo.com' : '3001234567' }) },
    fetch: async (url, options) => {
      llamadas.push({ url, options });
      return respuesta;
    },
    showLoading() {},
    hideLoading() {},
    showToast: (...args) => llamadas.push({ toast: args }),
    aplicarFiltroYOrdenCap: () => llamadas.push({ refrescarTabla: true }),
    abrirDetalleCapacitacion: (...args) => llamadas.push({ detalle: args }),
    cargarCapacitaciones: async () => llamadas.push({ recargar: true }),
    console
  };
  vm.createContext(context);
  vm.runInContext(funcion, context);
  return { context, llamadas, trabajador, otraCapacitacion, otroTrabajador };
}

test('el guardado refresca todos los registros del trabajador y sus enlaces', async () => {
  const datos = preparar({ ok: true, json: async () => ({ ok: true, email: 'nuevo@ejemplo.com', celular: '3001234567' }) });
  await datos.context.guardarContactoCapacitacion({ preventDefault() {} });
  assert.equal(datos.llamadas[0].url, '/capacitacionsst/api/capacitacion/cap-1/contacto');
  assert.deepEqual(JSON.parse(datos.llamadas[0].options.body), {
    usuario: 'usuario', email: 'nuevo@ejemplo.com', celular: '3001234567'
  });
  assert.equal(datos.trabajador.celular_trabajador, '3001234567');
  assert.equal(datos.otraCapacitacion.email_trabajador, 'nuevo@ejemplo.com');
  assert.equal(datos.otroTrabajador.celular_trabajador, undefined);
  assert.ok(datos.llamadas.some(llamada => llamada.refrescarTabla));
  assert.ok(datos.llamadas.some(llamada => llamada.detalle && llamada.detalle[0] === 'cap-1' && llamada.detalle[1] === false));
});

test('si la capacitación ya cerró, informa el error y recarga el estado', async () => {
  const datos = preparar({ ok: false, status: 409, json: async () => ({ error: 'Ya está cerrada' }) });
  await datos.context.guardarContactoCapacitacion({ preventDefault() {} });
  assert.equal(datos.trabajador.celular_trabajador, 'anterior');
  assert.ok(datos.llamadas.some(llamada => llamada.toast && llamada.toast[0] === 'Ya está cerrada'));
  assert.ok(datos.llamadas.some(llamada => llamada.recargar));
});
