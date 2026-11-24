const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

let acceso;
let permiso;
let registros;
let escrituras;
const pool = {
  async withTransaction(callback) {
    return callback({
      async execute(sql, params) {
        if (sql.includes('FROM Maestro_capacitacionsst c')) return [registros];
        if (sql.includes('INSERT INTO Maestro_Segmentación')) {
          escrituras.push(params);
          return [{}];
        }
        throw new Error(`Consulta inesperada: ${sql}`);
      }
    });
  }
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.endsWith('capacitacionsst.js')) {
    if (request === '../services/db') return pool;
    if (request === '../services/accesoSst') return { computarAccesoSst: async () => acceso };
    if (request === '../services/configSst') return { rolPuedeSst: async () => permiso };
    if (request.startsWith('../services/')) return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};
let router;
try {
  router = require('../src/routes/capacitacionsst');
} finally {
  Module._load = originalLoad;
}
const handler = router.stack.find(layer => layer.route && layer.route.path === '/api/capacitacion/:id/contacto').route.stack[0].handle;

function preparar() {
  acceso = { rol: 'AuxSst', sinFiltro: false, operacionesFiltro: ['Operación A'] };
  permiso = true;
  registros = [{ identificacion: '123', operacion: 'Operación A', url_doc: null, firma_trabajador: null }];
  escrituras = [];
}

async function solicitar(body = { usuario: 'usuario', email: ' nuevo@ejemplo.com ', celular: ' 3001234567 ' }) {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; }
  };
  await handler({ params: { id: 'cap-1' }, body }, res);
  return res;
}

test('guarda el contacto del trabajador asociado a una capacitación abierta', async () => {
  preparar();
  const res = await solicitar();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, email: 'nuevo@ejemplo.com', celular: '3001234567' });
  assert.deepEqual(escrituras, [['123', 'nuevo@ejemplo.com', '3001234567']]);
});

test('permite dejar los datos de contacto vacíos', async () => {
  preparar();
  const res = await solicitar({ usuario: 'usuario', email: '', celular: ' ' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(escrituras, [['123', null, null]]);
});

test('rechaza registros cerrados o firmados sin actualizar el contacto', async () => {
  for (const campo of ['url_doc', 'firma_trabajador']) {
    preparar();
    registros[0][campo] = 'documento';
    const res = await solicitar();
    assert.equal(res.statusCode, 409);
    assert.deepEqual(escrituras, []);
  }
});

test('rechaza usuarios sin permiso o sin acceso a la operación', async () => {
  for (const situacion of ['sinAcceso', 'sinPermiso', 'otraOperacion']) {
    preparar();
    if (situacion === 'sinAcceso') acceso = null;
    if (situacion === 'sinPermiso') permiso = false;
    if (situacion === 'otraOperacion') registros[0].operacion = 'Operación B';
    const res = await solicitar();
    assert.equal(res.statusCode, 403);
    assert.deepEqual(escrituras, []);
  }
});

test('maneja registros inexistentes y datos incompletos sin escribir', async () => {
  preparar();
  registros = [];
  assert.equal((await solicitar()).statusCode, 404);
  assert.equal((await solicitar({ usuario: 'usuario', email: 'correo' })).statusCode, 400);
  assert.deepEqual(escrituras, []);
});
