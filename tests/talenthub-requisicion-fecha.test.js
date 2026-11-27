const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const express = require('express');

let rol = 'Sistema';
let consultas = [];
const pool = {
  async execute(sql, params) {
    consultas.push({ sql, params });
    if (sql.includes('FROM `Config_Parametros`')) return [[
      { Seccion: 'Requisiciones', Concepto: 'Editar Requisición despues de guardar', Parametro: 'Sistema, Directorth, CoorSelección, Otro' },
      { Seccion: 'Requisiciones', Concepto: 'Modificar Fecha de Requisición', Parametro: 'Directorth, CoorSelección, Sistema' },
    ]];
    if (sql.includes('SELECT * FROM `Dynamic_Requisiciones`')) return [[{
      Estado: 'EN PROCESO', 'Requisición': 'REQ-1', Regional: 'Centro',
      'Operación': 'Operación', 'Cargo Requerido': 'Cargo', 'N° Personas Requeridas': 1,
    }]];
    if (sql.includes('UPDATE `Dynamic_Requisiciones`')) return [{ affectedRows: 1 }];
    throw new Error('Consulta inesperada: ' + sql);
  },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.endsWith(path.join('routes', 'talenthub.js'))) {
    if (request === '../services/db') return pool;
    if (request === '../services/accesoTalenthub') return { computarAccesoTalenthub: async () => ({ rol, usuarioId: 'usuario' }) };
    if (request.startsWith('../services/')) return {};
    if (request === './cargosFunciones' || request === './entrevistasRetiro') return express.Router();
  }
  return originalLoad.call(this, request, parent, isMain);
};
let router;
try {
  router = require('../src/routes/talenthub');
} finally {
  Module._load = originalLoad;
}
const handler = router.stack.find(layer => layer.route && layer.route.path === '/api/requisiciones/:id' && layer.route.methods.put).route.stack[0].handle;

async function guardar(body) {
  consultas = [];
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  await handler({ params: { id: '1' }, body: { usuario: 'usuario', ...body } }, res);
  return res;
}

for (const permitido of ['Sistema', 'Directorth', 'coorseleccion']) {
  test(`permite modificar fecha y hora al rol ${permitido}`, async () => {
    rol = permitido;
    const res = await guardar({ 'Fecha Requisición': '2026-02-28T15:23:41' });
    assert.equal(res.statusCode, 200);
    const update = consultas.find(q => q.sql.includes('UPDATE `Dynamic_Requisiciones`'));
    assert.match(update.sql, /`Fecha Requisición` = \?/);
    assert.ok(update.params.includes('2026-02-28 15:23:41'));
  });
}

test('impide modificar fecha sin permiso y conserva fecha si no se envía', async () => {
  rol = 'Otro';
  const denegado = await guardar({ 'Fecha Requisición': '2026-02-28T15:23' });
  assert.equal(denegado.statusCode, 403);
  assert.ok(!consultas.some(q => q.sql.includes('UPDATE `Dynamic_Requisiciones`')));
  const normal = await guardar({});
  assert.equal(normal.statusCode, 200);
  const update = consultas.find(q => q.sql.includes('UPDATE `Dynamic_Requisiciones`'));
  assert.doesNotMatch(update.sql, /`Fecha Requisición` = \?/);
});

for (const fecha of ['', '2026-02-30T12:00', '2026-01-01T25:00', '2026-01-01', null]) {
  test(`rechaza fecha inválida: ${fecha}`, async () => {
    rol = 'Sistema';
    const res = await guardar({ 'Fecha Requisición': fecha });
    assert.equal(res.statusCode, 400);
    assert.ok(!consultas.some(q => q.sql.includes('UPDATE `Dynamic_Requisiciones`')));
  });
}
