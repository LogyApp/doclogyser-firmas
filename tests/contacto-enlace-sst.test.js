const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

let acceso;
let permiso;
let registro;
let contacto;
let consultas;
const pool = {
  async withTransaction(callback) {
    return callback({
      async execute(sql, params) {
        consultas.push({ sql, params });
        if (sql.includes('FOR UPDATE')) return [registro ? [registro] : []];
        if (sql.startsWith('SELECT Email')) return [contacto ? [contacto] : []];
        return [{}];
      }
    });
  }
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.endsWith('contactoEnlaceSst.js')) {
    if (request === './db') return pool;
    if (request === './accesoSst') return { computarAccesoSst: async () => acceso };
    if (request === './configSst') return { rolPuedeSst: async () => permiso };
    if (request === './atsService') return { obtenerConfigAts: async () => ({ puedeRegistrar: permiso }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};
let gestionarContacto;
try {
  ({ gestionarContacto } = require('../src/services/contactoEnlaceSst'));
} finally {
  Module._load = originalLoad;
}

function preparar() {
  acceso = { usuarioId: 'usuario', rol: 'AuxSst', sinFiltro: false, operacionesFiltro: ['Operación A'] };
  permiso = true;
  registro = { identificacion: '123', usuario: 'usuario', operacion: 'Operación A' };
  contacto = { Email: 'anterior@ejemplo.com', Celular: '300' };
  consultas = [];
}

const tablas = {
  ev: 'Maestro_evaluacionsst',
  pc: 'Dynamic_pruebaconsumo',
  csst: 'Dynamic_compromisosst',
  aro: 'Dynamic_aro',
  evin: 'Dynamic_evin',
  inge: 'Dynamic_inge',
  ats: 'Dynamic_ats_trabajadores',
  'cm-apertura': 'Maestro_casosmedicos',
  'cm-cierre': 'Maestro_casosmedicos',
};

for (const [tipo, tabla] of Object.entries(tablas)) {
  test(`${tipo}: consulta y guarda el contacto del trabajador del registro`, async () => {
    preparar();
    if (tipo === 'cm-apertura') registro.estado_general_id = 1;
    if (tipo === 'cm-cierre') registro.estado_general_id = 2;
    const leido = await gestionarContacto(tipo, 'id', 'usuario', null);
    assert.deepEqual(leido, { ok: true, email: 'anterior@ejemplo.com', celular: '300' });
    assert.ok(consultas[0].sql.includes(tabla));
    consultas = [];
    const guardado = await gestionarContacto(tipo, 'id', 'usuario', { email: ' nuevo@ejemplo.com ', celular: ' 3001234567 ' });
    const esperado = { ok: true, email: 'nuevo@ejemplo.com', celular: '3001234567' };
    if (tipo.startsWith('cm-')) esperado.identificacion = '123';
    assert.deepEqual(guardado, esperado);
    const update = consultas.find(q => q.sql.includes('INSERT INTO Maestro_Segmentación'));
    assert.deepEqual(update.params, ['123', 'nuevo@ejemplo.com', '3001234567']);
    const atsUpdate = consultas.find(q => q.sql.includes('UPDATE Dynamic_ats_trabajadores'));
    if (tipo === 'ats') assert.deepEqual(atsUpdate.params, ['nuevo@ejemplo.com', '3001234567', 'id']);
    else assert.equal(atsUpdate, undefined);
  });

  test(`${tipo}: impide editar después de la firma`, async () => {
    preparar();
    if (tipo === 'cm-apertura') registro.estado_general_id = 1;
    if (tipo === 'cm-cierre') registro.estado_general_id = 2;
    if (tipo === 'ats') registro.estado_firma = 'ACEPTADA';
    else registro.firma_trabajador = 'firma';
    const respuesta = await gestionarContacto(tipo, 'id', 'usuario', { email: '', celular: '' });
    assert.equal(respuesta.status, 409);
    assert.equal(consultas.length, 1);
  });

}

test('en casos médicos respeta la etapa del acta y el permiso del creador', async () => {
  preparar();
  permiso = false;
  registro.estado_general_id = 1;
  assert.equal((await gestionarContacto('cm-apertura', 'id', 'usuario', null)).ok, true);
  assert.equal((await gestionarContacto('cm-cierre', 'id', 'usuario', null)).status, 409);
  registro.usuario = 'otra persona';
  assert.equal((await gestionarContacto('cm-apertura', 'id', 'usuario', null)).status, 403);
  registro.usuario = 'usuario';
  registro.estado_general_id = 2;
  assert.equal((await gestionarContacto('cm-cierre', 'id', 'usuario', null)).ok, true);
  assert.equal((await gestionarContacto('cm-apertura', 'id', 'usuario', null)).status, 409);
});

test('impide acceso sin permiso o fuera del alcance, salvo creador cuando la pestaña lo permite', async () => {
  preparar();
  permiso = false;
  assert.equal((await gestionarContacto('ev', 'id', 'usuario', null)).status, 403);
  assert.equal(consultas.length, 0);
  permiso = true;
  registro.operacion = 'Otra';
  assert.equal((await gestionarContacto('ev', 'id', 'usuario', null)).status, 403);
  assert.equal((await gestionarContacto('pc', 'id', 'usuario', null)).ok, true);
  registro.usuario = 'otra persona';
  assert.equal((await gestionarContacto('pc', 'id', 'usuario', null)).status, 403);
  assert.equal((await gestionarContacto('ats', 'id', 'usuario', null)).status, 403);
});

test('valida datos, registros inexistentes y cierre por PDF', async () => {
  preparar();
  assert.equal((await gestionarContacto('inexistente', 'id', 'usuario', null)).status, 400);
  assert.equal((await gestionarContacto('ev', 'id', 'usuario', { email: '' })).status, 400);
  registro = null;
  assert.equal((await gestionarContacto('ev', 'id', 'usuario', null)).status, 404);
  registro = { identificacion: '123', operacion: 'Operación A', url_doc: 'pdf' };
  assert.equal((await gestionarContacto('ev', 'id', 'usuario', null)).status, 409);
});
