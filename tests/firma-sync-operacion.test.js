const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
let query;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.endsWith('firmaSyncService.js')) {
    if (request === './db') return { query: (...args) => query(...args) };
    if (request === './renderer') return { nuevaPagina: () => { throw new Error('No debe generar PNG'); } };
    if (request === './storage') return { storage: {} };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { guardarEmpleadoFirma, sincronizarConVinculacion } = require('../src/services/firmaSyncService');
Module._load = originalLoad;

const datos = { identificacion: '123', nombre: 'Prueba', operacion: 'Administracion' };

function prepararGuardado(opciones) {
  const updates = [];
  query = async (sql, params) => {
    if (sql.includes('Maestro_Vinculación')) return [[]];
    if (sql.includes('Maestro_Operaciones')) return [opciones.map(operacion => ({ operacion }))];
    if (sql.includes('SELECT Identificacion FROM Maestro_firma_corporativa')) return [[{ Identificacion: '123' }]];
    if (sql.includes('UPDATE Maestro_firma_corporativa')) { updates.push(params); return [{}]; }
    throw new Error(`Consulta inesperada: ${sql}`);
  };
  return updates;
}

test('preserva el nombre exacto de la operación existente', async () => {
  const updates = prepararGuardado(['Administracion']);
  await guardarEmpleadoFirma(datos, null, false);
  assert.equal(updates[0][3], 'Administracion');
});

test('resuelve variantes de tildes contra el catálogo', async () => {
  const updates = prepararGuardado(['Administracion']);
  await guardarEmpleadoFirma({ ...datos, operacion: 'Administración' }, null, false);
  assert.equal(updates[0][3], 'Administracion');
});

test('prefiere la coincidencia exacta cuando hay variantes en el catálogo', async () => {
  const updates = prepararGuardado(['Administracion', 'Administración']);
  await guardarEmpleadoFirma(datos, null, false);
  assert.equal(updates[0][3], 'Administracion');
});

test('rechaza una operación ambigua o inexistente sin actualizar', async () => {
  for (const opciones of [[], ['Administracion', 'ADMINISTRACION']]) {
    const updates = prepararGuardado(opciones);
    await assert.rejects(guardarEmpleadoFirma({ ...datos, operacion: 'Administración' }, null, false), /operación de Administración única/);
    assert.equal(updates.length, 0);
  }
});

test('conserva operaciones distintas y acepta operación nula', async () => {
  for (const operacion of ['OTRA OPERACION', null]) {
    const updates = prepararGuardado([]);
    await guardarEmpleadoFirma({ ...datos, operacion }, null, false);
    assert.equal(updates[0][3], operacion);
  }
});

test('la sincronización usa la operación válida del catálogo', async () => {
  const writes = [];
  query = async (sql, params) => {
    if (sql.includes('FROM `Maestro_Vinculación`')) return [[{ identificacion: '123', Trabajador: '123 ** PRUEBA', cargo: 'Cargo', regional: 'Regional', operacion: 'Administración' }]];
    if (sql.includes('SELECT Identificacion, cargo')) return [[]];
    if (sql.includes('Maestro_Operaciones')) return [[{ operacion: 'Administracion' }]];
    if (sql.includes('INSERT INTO Maestro_firma_corporativa')) { writes.push(params); return [{}]; }
    throw new Error(`Consulta inesperada: ${sql}`);
  };
  const resultado = await sincronizarConVinculacion();
  assert.equal(resultado.creados, 1);
  assert.equal(writes[0][5], 'Administracion');
});
