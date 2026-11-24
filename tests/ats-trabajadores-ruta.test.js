const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

let acceso;
let retirados;
let consultas;
let fallo;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.endsWith('ats.js')) {
    if (request === '../services/db') return {
      execute: async (sql, params) => {
        consultas.push({ sql, params });
        if (fallo) throw new Error('Error de prueba');
        return [[{ identificacion: '123', estado: 'Activo' }]];
      }
    };
    if (request === '../services/accesoSst') return { computarAccesoSst: async () => acceso };
    if (request === '../services/configSst') return { puedeProcesarRetiradosSst: async () => retirados };
    if (request.startsWith('../services/')) return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};
let router;
try {
  router = require('../src/routes/ats');
} finally {
  Module._load = originalLoad;
}
const handler = router.stack.find(layer => layer.route && layer.route.path === '/api/trabajadores-por-operacion').route.stack[0].handle;

async function consultar(query) {
  const res = {
    statusCode: 200,
    status(codigo) { this.statusCode = codigo; return this; },
    json(datos) { this.body = datos; return this; }
  };
  await handler({ query }, res);
  return res;
}

test('consulta trabajadores activos y respeta permiso para retirados', async () => {
  acceso = { rol: 'Sistema' };
  fallo = false;
  for (const permitido of [false, true]) {
    retirados = permitido;
    consultas = [];
    const res = await consultar({ usuario: 'usuario', regional: 'Norte', operacion: 'Operación A' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(consultas[0].params, ['Norte', 'Operación A']);
    assert.equal(consultas[0].sql.includes("'Retirado'"), permitido);
    assert.equal(res.body[0].identificacion, '123');
  }
});

test('informa errores de consulta en vez de devolver una lista vacía', async () => {
  acceso = { rol: 'Sistema' };
  consultas = [];
  fallo = true;
  const res = await consultar({ usuario: 'usuario', regional: 'Norte', operacion: 'Operación A' });
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /No se pudieron consultar/);
});
