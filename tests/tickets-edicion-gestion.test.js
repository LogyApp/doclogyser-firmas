const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

let rol, acceso, permiso, escrituras, ticket, encontrado, archivoSubido, motivos;
const pool = {
  async execute(sql, params) {
    if (sql.includes('Maestro_Usuarios')) return params[0] === 'inexistente' ? [[]] : [[{ ID: params[0], Rol: rol }]];
    if (sql.includes('Config_Parametros')) return [[{ Parametro: permiso }]];
    if (sql.includes('SELECT Motivo FROM Config_motivo_tickets')) return [motivos.map(Motivo => ({ Motivo }))];
    if (sql.includes('Config_motivo_tickets')) return params[0] === 'Inválido' ? [[]] : [[{}]];
    if (sql.includes('Maestro_Operaciones')) return params[0] === 'Inválida' ? [[]] : [[{}]];
    if (sql.includes('Dynamic_Recibos')) return [[{ recibo: params[0] === 'recibo2' ? 1 : 0, servicio: params[0] === 'servicio2' ? 1 : 0 }]];
    if (sql.startsWith('UPDATE Dynamic_Tickets')) { escrituras.push({ sql, params }); return [{}]; }
    throw new Error('Consulta inesperada: ' + sql);
  },
  async query(sql) {
    if (sql.includes('information_schema.COLUMNS')) return [[{ n: 1 }]];
    if (sql.includes('SELECT DISTINCT')) return [encontrado ? [{ id: '456' }] : []];
    if (sql.includes('FROM Dynamic_Tickets t')) return [[ticket]];
    throw new Error('Consulta inesperada: ' + sql);
  }
};
const original = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.endsWith('tickets.js')) {
    if (request === '../services/db') return pool;
    if (request === '../services/maestroMenu') return { accesoSeccion: async () => acceso };
    if (request === '../services/storage') return { subirEvidenciaTicket: async () => { archivoSubido = true; return 'evidencia-nueva'; } };
    if (request === '../services/calificacionTickets') return { SQL_POR_CALIFICAR: '0' };
  }
  return original.call(this, request, parent, isMain);
};
let router;
try { router = require('../src/routes/tickets'); } finally { Module._load = original; }
const handler = router.stack.find(layer => layer.route && layer.route.path === '/api/ticket/:ticket/gestion').route.stack.at(-1).handle;
const handlerPropio = router.stack.find(layer => layer.route && layer.route.path === '/api/ticket/:ticket' && layer.route.methods.put).route.stack[0].handle;

function preparar() {
  rol = 'Sistema'; acceso = true; permiso = 'Sistema'; escrituras = []; encontrado = true; archivoSubido = false; motivos = ['Corrección'];
  ticket = { solicitante: 'original', estado: 'Resuelto', modulo: 'Servicios', operacion: 'Anterior', idrecibo: 'recibo1',
    identificaciones: '123', evidencia: 'evidencia-original' };
}
function cuerpo() {
  return { usuario: 'admin', modulo: 'Asistencia', operacion: 'Anterior', solicitante: 'original',
    motivo: 'Corrección', descripcion: 'Descripción', telefono: '3001234567', idrecibo: 'recibo1',
    identificaciones: '123', observaciones: 'Respuesta' };
}
async function llamar(fn, body, file) {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await fn({ body, params: { ticket: 'ticket1' }, file }, res);
  return res;
}

test('permite corregir módulo de ticket resuelto y conserva recibo, trabajadores y fechas', async () => {
  preparar();
  const res = await llamar(handler, cuerpo());
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  const { sql, params } = escrituras[0];
  assert.deepEqual(params, ['Asistencia', 'Anterior', 'original', 'Corrección', 'Descripción', '3001234567',
    'recibo1', 'Respuesta', 'evidencia-original', '123', 'ticket1']);
  assert.doesNotMatch(sql, /fecha_|satisfaccion|sugerencia|Estado/);
});

test('solo los roles autorizados con acceso a la pestaña pueden editar', async () => {
  for (const opciones of [{ rol: 'Otro' }, { acceso: false }, { permiso: '' }]) {
    preparar();
    if (opciones.rol) rol = opciones.rol;
    if (opciones.acceso === false) acceso = false;
    if (opciones.permiso === '') permiso = '';
    const res = await llamar(handler, cuerpo());
    assert.equal(res.statusCode, 403);
    assert.equal(escrituras.length, 0);
  }
});

test('valida los datos cambiados antes de subir evidencia o actualizar', async () => {
  const casos = [
    { modulo: 'Inválido' }, { operacion: 'Inválida' }, { solicitante: 'inexistente' },
    { idrecibo: 'inexistente' }, { identificaciones: 'abc' }, { telefono: '12x' }, { descripcion: '' },
    { motivo: 'Otro' }, { motivo: '' }
  ];
  for (const caso of casos) {
    preparar();
    const res = await llamar(handler, { ...cuerpo(), ...caso }, { buffer: Buffer.from('x'), originalname: 'archivo.pdf' });
    assert.equal(res.statusCode, 400, JSON.stringify(caso));
    assert.equal(archivoSubido, false);
    assert.equal(escrituras.length, 0);
  }
  preparar(); encontrado = false;
  const res = await llamar(handler, { ...cuerpo(), identificaciones: '456' });
  assert.equal(res.statusCode, 400);
});

test('acepta recibos o servicios válidos y motivos libres solo sin catálogo', async () => {
  for (const idrecibo of ['recibo2', 'servicio2']) {
    preparar();
    const res = await llamar(handler, { ...cuerpo(), idrecibo });
    assert.equal(res.statusCode, 200);
    assert.equal(escrituras[0].params[6], idrecibo);
  }
  preparar(); motivos = [];
  assert.equal((await llamar(handler, { ...cuerpo(), motivo: 'Texto libre' })).statusCode, 200);
  preparar(); ticket.motivo = 'Motivo anterior'; motivos = ['Otro'];
  assert.equal((await llamar(handler, { ...cuerpo(), modulo: 'Servicios', motivo: 'Motivo anterior' })).statusCode, 200);
});

test('permite corregir trabajadores y reemplazar evidencia', async () => {
  preparar();
  const res = await llamar(handler, { ...cuerpo(), identificaciones: '456' }, { buffer: Buffer.from('x'), originalname: 'archivo.pdf' });
  assert.equal(res.statusCode, 200);
  assert.equal(archivoSubido, true);
  assert.equal(escrituras[0].params[8], 'evidencia-nueva');
  assert.equal(escrituras[0].params[9], '456');
});

test('la edición del solicitante sigue restringida a tickets propios abiertos', async () => {
  preparar();
  const res = await llamar(handlerPropio, { usuario: 'original', motivo: 'x', descripcion: 'x' });
  assert.equal(res.statusCode, 403);
  assert.equal(escrituras.length, 0);
});

test('el formulario multipart envía datos y evidencia a la ruta administrativa', async () => {
  preparar();
  const express = require('express');
  const app = express();
  app.use('/tickets', router);
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const form = new FormData();
    Object.entries(cuerpo()).forEach(([clave, valor]) => form.append(clave, valor));
    form.append('evidencia', new Blob(['archivo'], { type: 'application/pdf' }), 'soporte.pdf');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/tickets/api/ticket/ticket1/gestion`, {
      method: 'PUT', body: form
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.equal(archivoSubido, true);
    assert.equal(escrituras[0].params[0], 'Asistencia');
    assert.equal(escrituras[0].params[7], 'Respuesta');
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
