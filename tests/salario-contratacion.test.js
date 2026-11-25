const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.endsWith('docsSeleccion.js') && request === './db') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const { obtenerSalarioPredeterminado, validarSalario } = require('../src/services/salarioContratacion');
Module._load = originalLoad;

function dbCon({ cargo = 'AUXILIAR LOGISTICO', parametros = [{ Parametro: 'AUXILIAR LOGISTICO' }], salarios = [{ valor: 1750905 }], aspirantes } = {}) {
  const consultas = [];
  return {
    consultas,
    async execute(sql) {
      consultas.push(sql);
      if (sql.includes('Dynamic_hv_aspirante')) return [aspirantes || [{ cargo }]];
      if (sql.includes('Config_Parametros')) return [parametros];
      if (sql.includes('Config_Impuestos')) return [salarios];
      throw new Error('Consulta inesperada');
    }
  };
}

test('prellena el valor vigente para el cargo configurado sin distinguir tildes o mayúsculas', async () => {
  const db = dbCon({ cargo: 'Auxiliar Logístico', salarios: [{ valor: '1750905' }] });
  assert.equal(await obtenerSalarioPredeterminado(db, '1'), 1750905);
  assert.equal(await obtenerSalarioPredeterminado(dbCon({ salarios: [{ valor: 1900123 }] }), '1'), 1900123);
});

test('no prellena otros cargos ni cuando la configuración falta o está vacía', async () => {
  for (const opciones of [{ cargo: 'CONDUCTOR' }, { cargo: null }, { parametros: [] }, { parametros: [{ Parametro: '' }] }]) {
    const db = dbCon(opciones);
    assert.equal(await obtenerSalarioPredeterminado(db, '1'), null);
    assert.equal(db.consultas.length, 2);
  }
});

test('informa si el aspirante, el parámetro o el salario mínimo son inválidos', async () => {
  await assert.rejects(obtenerSalarioPredeterminado(dbCon({ aspirantes: [] }), '1'), /Aspirante no encontrado/);
  await assert.rejects(obtenerSalarioPredeterminado(dbCon({ parametros: [{ Parametro: 'A' }, { Parametro: 'B' }] }), '1'), /duplicados/);
  for (const salarios of [[], [{ valor: null }], [{ valor: 'no válido' }], [{ valor: 1.5 }], [{ valor: 2147483648 }], [{ valor: 1 }, { valor: 2 }]]) {
    await assert.rejects(obtenerSalarioPredeterminado(dbCon({ salarios }), '1'), /Config_Impuestos/);
  }
});

test('acepta edición manual en pesos enteros y rechaza valores fuera de rango', () => {
  assert.equal(validarSalario('1750905'), 1750905);
  assert.equal(validarSalario('0'), 0);
  assert.equal(validarSalario(''), null);
  assert.equal(validarSalario(undefined), null);
  for (const valor of ['-1', '1.5', '1e3', 'abc', '2147483648']) {
    assert.throws(() => validarSalario(valor), /salario debe ser/);
  }
});

test('el envío guarda el salario editado en la nueva vinculación y no modifica las anteriores', async () => {
  const escrituras = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() { assert.fail('No debe revertir la contratación'); },
    release() {},
    async query(sql, params) {
      if (sql.includes('SELECT * FROM Dynamic_hv_aspirante')) {
        return [[{ IdRequisicion: 1, identificacion: '123', primer_nombre: 'PRUEBA', primer_apellido: 'PERSONA' }]];
      }
      if (sql.includes('Dynamic_hv_educacion') || sql.includes('Dynamic_hv_contacto_emergencia') ||
          sql.includes('Maestro_Operaciones') || sql.includes('Config_Tipo_Identificación') ||
          sql.includes('SELECT Identificación FROM Maestro_Segmentación') ||
          sql.includes('FROM Dynamic_hv_documentos') || sql.includes('FROM Dynamic_hv_documentos_partes') ||
          sql.includes('FROM Maestro_docTrabajador')) return [[]];
      if (sql.includes('SELECT `Cargo Requerido`')) return [[{ 'Cargo Requerido': 'AUXILIAR LOGISTICO' }]];
      escrituras.push({ sql, params });
      return [{}];
    }
  };
  const pool = {
    async execute(sql) {
      if (sql.includes('Dynamic_hv_documentos')) return [[]];
      if (sql.includes('Dynamic_Requisiciones')) return [[{ operacion: 'Prueba' }]];
      throw new Error('Consulta inesperada: ' + sql);
    },
    async getConnection() { return connection; }
  };
  Module._load = function (request, parent, isMain) {
    if (parent && parent.filename.endsWith('seleccion.js')) {
      if (request === '@google-cloud/storage') return { Storage: class { bucket() { return {}; } } };
      if (request === 'google-auth-library') return { GoogleAuth: class {} };
      if (request === '../services/db') return pool;
      if (request === '../services/salarioContratacion') return { obtenerSalarioPredeterminado, validarSalario };
      if (request === '../services/docsSeleccion') return { validarFirmasParaContratar: async () => ({ ok: true }) };
      if (request === '../services/docSstPortal') return { alVincular: async () => ({ errores: [] }) };
      if (request === '../services/rellenoAsistencia') return { programarRelleno() {} };
      if (request === '../services/notificacionIngreso') return { notificarNuevoIngreso() {} };
      if (request.startsWith('../services/')) return {};
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  let router;
  try {
    router = require('../src/routes/seleccion');
  } finally {
    Module._load = originalLoad;
  }
  const handler = router.stack.find(layer => layer.route && layer.route.path === '/finalizar-contratacion').route.stack[0].handle;
  let redireccion;
  const req = { body: { id_aspirante: '1', regional: 'R', operacion: 'O', fecha_ingreso: '2026-01-01', salario: '1750905' }, query: {} };
  const res = {
    redirect(url) { redireccion = url; },
    status(code) { assert.fail('Respuesta inesperada: ' + code); }
  };
  await handler(req, res);
  assert.match(redireccion, /msg=success/);
  const vinc = escrituras.find(write => write.sql.includes('INSERT INTO Maestro_Vinculación'));
  assert.ok(vinc);
  assert.match(vinc.sql, /Salario/);
  assert.equal(vinc.params[8], 1750905);
  assert.equal(escrituras.some(write => /UPDATE\s+`?Maestro_Vinculación/i.test(write.sql)), false);
});
