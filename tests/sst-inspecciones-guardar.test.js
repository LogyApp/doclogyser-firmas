const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const colaborador = { identificacion: '123', nombre: 'Trabajador', operacion: 'Operación A' };
let llamada;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.endsWith(path.join('routes', 'sst.js'))) {
    if (request === '../services/accesoSst') return { computarAccesoSst: async () => ({ rol: 'SST' }) };
    if (request === '../services/inspeccionesVehiculoService') return {
      obtenerConfigInspeccionesSST: async () => ({ puedeRegistrar: true }),
      buscarColaboradorPorIdentificacionSST: async () => ({ colaborador }),
      crearInspeccionVehiculo: async (...args) => {
        llamada = args;
        return { ok: true, id: 'INS-TEST' };
      },
    };
    if (request.startsWith('../services/')) return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};
let router;
try {
  router = require('../src/routes/sst');
} finally {
  Module._load = originalLoad;
}

const handler = router.stack.find(layer => layer.route && layer.route.path === '/api/inspecciones/guardar').route.stack[0].handle;

for (const signatureMode of ['saved', 'draw']) {
  test(`SST envía al servicio la inspección y la firma ${signatureMode}`, async () => {
    const body = {
      identificacion: '123',
      type: 'vehiculo',
      subtype: 'moto',
      placa: 'ABC123',
      equipoInterno: 'EQ-1',
      odometro: '100',
      reportaA: 'Coordinador',
      generalObservations: 'Observación',
      actionPlan: 'Plan',
      items: [{ id: 'm1', answer: 'NC', observation: 'Reparar' }],
      photos: [],
      signatureMode,
      signatureDataUrl: signatureMode === 'draw' ? 'data:image/png;base64,abc' : null,
    };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; },
    };
    await handler({ query: { usuario: 'usuario' }, body }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true, id: 'INS-TEST' });
    assert.deepEqual(llamada, [{
      type: 'vehiculo',
      subtype: 'moto',
      plate: 'ABC123',
      equipmentId: 'EQ-1',
      meter: '100',
      reportTo: 'Coordinador',
      generalObservations: 'Observación',
      actionPlan: 'Plan',
      items: [{ id: 'm1', result: 'NC', observation: 'Reparar' }],
      photos: [],
      usarFirmaPrevia: signatureMode === 'saved',
      firmaBase64: body.signatureDataUrl,
    }, colaborador]);
  });
}
