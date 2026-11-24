const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { servicioYaAnulado } = require('../public/js/servicio-anulacion');

test('servicios amarillos con pago cero pueden completar la anulación', () => {
  for (const estado of ['Yellow', 'yellow', 'YELLOW']) {
    for (const pago of [0, '0']) assert.equal(servicioYaAnulado(estado, pago), false);
  }
});

test('servicios con pago cero que no están en amarillo siguen considerados anulados', () => {
  for (const estado of ['Red', 'Green', null, '']) {
    for (const pago of [0, '0']) assert.equal(servicioYaAnulado(estado, pago), true);
  }
});

test('las demás formas de pago conservan su comportamiento', () => {
  for (const estado of ['Yellow', 'Red', 'Green']) {
    for (const pago of [null, undefined, '', 1, '2', 3]) assert.equal(servicioYaAnulado(estado, pago), false);
  }
});

test('el detalle y la selección masiva respetan los permisos para amarillos con pago cero', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/views/facturacion/index.html'), 'utf8');
  const fragmento = html.slice(html.indexOf('    function servicioAnulable('), html.indexOf('    function puedeAnularServicios('));
  assert.match(fragmento, /servicioYaAnulado/);
  for (const [permisos, esperado] of [
    [{ anularServicios: true }, true],
    [{ anularServiciosAmarillo: true }, true],
    [{}, false],
  ]) {
    const contexto = { PERMISOS_RECIBOS: permisos, servicioYaAnulado };
    vm.runInNewContext(fragmento, contexto);
    assert.equal(contexto.servicioAnulable({ estado: 'Yellow', formaDePago: 0 }), esperado);
    assert.equal(contexto.servicioAnulable({ estado: 'Red', formaDePago: 0 }), false);
  }
});

test('el servidor anula solo los servicios autorizados con datos simulados', async () => {
  const ruta = fs.readFileSync(path.join(__dirname, '../src/routes/facturacion.js'), 'utf8');
  const fragmento = ruta.slice(ruta.indexOf('async function anularServicios('), ruta.indexOf('// Máximo de servicios por anulación masiva'));
  assert.match(fragmento, /servicioYaAnulado/);
  const filas = [
    { IdServicio: 'amarillo', IdRecibo: 'r1', Estado: 'Yellow', formaDePago: 0, validado: null, operacion: 'A' },
    { IdServicio: 'rojo', IdRecibo: 'r2', Estado: 'Red', formaDePago: 0, validado: null, operacion: 'A' },
    { IdServicio: 'validado', IdRecibo: 'r3', Estado: 'Yellow', formaDePago: 0, validado: 'SI', operacion: 'A' },
    { IdServicio: 'otra', IdRecibo: 'r4', Estado: 'Yellow', formaDePago: 0, validado: null, operacion: 'B' },
    { IdServicio: 'verde', IdRecibo: 'r5', Estado: 'Green', formaDePago: 1, validado: null, operacion: 'A' },
  ];
  const cambios = [], recalculados = [];
  const contexto = {
    servicioYaAnulado,
    pool: {
      query: async () => [filas],
      execute: async (sql, params) => { cambios.push({ sql, params }); },
    },
    recalcularRetencionesRecibo: async id => { recalculados.push(id); },
  };
  vm.runInNewContext(fragmento, contexto);
  const resultado = await contexto.anularServicios({
    usuario: 'prueba',
    acceso: { sinFiltro: false, operacionesFiltro: ['A'] },
    todos: false,
    ids: filas.map(fila => fila.IdServicio),
    observaciones: 'motivo',
  });
  assert.deepEqual(Array.from(resultado.anulados), ['amarillo']);
  assert.deepEqual(Array.from(resultado.omitidos, item => item.idServicio), ['rojo', 'validado', 'otra', 'verde']);
  assert.equal(cambios.length, 1);
  assert.match(cambios[0].sql, /Estado = 'Red'/);
  assert.match(cambios[0].sql, /`Valor Unitario` = 0/);
  assert.deepEqual(Array.from(cambios[0].params), ['prueba', 'motivo', 'amarillo']);
  assert.deepEqual(recalculados, ['r1']);
});
