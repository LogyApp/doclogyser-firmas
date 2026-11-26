const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('la firma guarda las claves usadas junto a las respuestas y genera el PDF con ellas', async () => {
  const claves = { 9: 'b', 25: 'c' };
  const respuestas = { 9: 'b', 25: 'c' };
  let guardado, pdf;
  const pool = {
    async execute(sql, params) {
      if (sql.includes('WHERE token_firma')) return [[{ id_evin: 'id1', identificacion: '123' }]];
      if (sql.includes('SET aspectos =')) { guardado = params; return [{ affectedRows: 1 }]; }
      if (sql.includes('WHERE id_evin = ? LIMIT 1')) return [[{
        id_evin: 'id1', nombre_trabajador: 'PRUEBA', respuestas: guardado[1]
      }]];
      if (sql.includes('SET url_doc')) return [{}];
      throw new Error('Consulta inesperada: ' + sql);
    }
  };
  const evin = {
    validarRespuestas: () => ({ aspectos: { 1: 'E' }, respuestas }),
    configuracion: async () => ({ minimo: 80, claves }),
    calificar: (r, minimo, c) => {
      assert.deepEqual(r, respuestas); assert.equal(minimo, 80); assert.deepEqual(c, claves);
      return { correctas: 27, total: 27, porcentaje: 100, aprobado: true };
    },
    generarPdf: async e => { pdf = JSON.parse(e.respuestas); return 'documento'; },
    registrarDocumentoTrabajador: async () => {}
  };
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent && /routes[\\/]evin\.js$/.test(parent.filename)) {
      if (request === '../services/db') return pool;
      if (request === '../services/evin') return evin;
      if (request === '../services/storage') return { obtenerUrlFirmaReciente: async () => 'firma' };
      if (request === '../services/notificacionesService') return { crearNotificacionDocInicialSST() {} };
      if (request.startsWith('../services/')) return {};
    }
    return original.call(this, request, parent, isMain);
  };
  let router;
  try { router = require('../src/routes/evin'); } finally { Module._load = original; }
  const handler = router.stack.find(l => l.route && l.route.path === '/api/firmar').route.stack[0].handle;
  const res = {
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json(body) { this.body = body; return this; }
  };
  await handler({ body: { token: 'token', usarFirmaRegistrada: true, aspectos: {}, respuestas } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(pdf, { 9: 'b', 25: 'c', _claves: claves });
  assert.equal(res.body.correctas, 27);
});
