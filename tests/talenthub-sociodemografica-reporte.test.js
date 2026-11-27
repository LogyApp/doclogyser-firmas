const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { Writable } = require('node:stream');
const express = require('express');
const ExcelJS = require('exceljs');

let consultas = [];
const pool = {
  async execute(sql, params) {
    consultas.push({ sql, params });
    if (sql.includes("Seccion = 'Sociodemografica'")) {
      return [[
        { Concepto: 'Ver Información Bancaria - Activo', Parametro: 'Otro' },
        { Concepto: 'Ver Seguridad Social - Activo', Parametro: 'Otro' },
      ]];
    }
    if (sql.includes('FROM `Maestro_Segmentación` s')) {
      return [[
        { identificacion: '123', trabajador: 'Ana', estado: 'Activo', cargo: 'Auxiliar', regional: 'Norte',
          operacion: 'Operación A', area: 'Logística', centro_costos: 'CC-01', contrato_firmado: 1,
          fecha_ingreso: '2026-01-02', fecha_retiro: null, primer_nombre: 'Ana', banco: 'Reservado' },
        { identificacion: '456', trabajador: 'Luis', estado: 'Activo', cargo: 'Auxiliar', regional: 'Norte',
          operacion: 'Operación A', area: 'Logística', centro_costos: null, contrato_firmado: 0 },
      ]];
    }
    throw new Error('Consulta inesperada: ' + sql);
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.endsWith(path.join('routes', 'talenthub.js'))) {
    if (request === '../services/db') return pool;
    if (request === '../services/accesoTalenthub') return {
      computarAccesoTalenthub: async () => ({ rol: 'Sistema', sinFiltro: false, operacionesFiltro: ['Operación A'] }),
    };
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
const handler = router.stack.find(layer => layer.route && layer.route.path === '/api/sociodemografica/reporte').route.stack[0].handle;

async function reporte(formato, alcance) {
  consultas = [];
  const chunks = [];
  const res = new Writable({ write(chunk, encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
  res.statusCode = 200;
  res.setHeader = () => {};
  res.status = function (code) { this.statusCode = code; return this; };
  res.json = function (body) { this.body = body; return this; };
  res.send = function (body) { this.body = body; return this; };
  await handler({ query: { usuario: 'usuario', opcion: 'colaboradores', formato, alcance } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  if (formato === 'csv') return res.body.replace(/^\uFEFF/, '').split('\r\n').map(row => row.split(';'));
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(Buffer.concat(chunks));
  return libro.worksheets[0].getSheetValues().slice(1).map(row => row.slice(1));
}

const columnas = ['Trabajador', 'Estado', 'Cargo', 'Regional', 'Operación', 'Área',
  'Centro de costos', 'Fecha de Ingreso', 'Fecha de Retiro', 'Contrato firmado'];

for (const formato of ['csv', 'xlsx']) {
  test(`${formato}: vista Colaboradores exporta columnas ordenadas y contrato Sí/No`, async () => {
    const filas = await reporte(formato, 'vista_actual');
    assert.deepEqual(filas[0], columnas);
    assert.equal(filas[1][0], 'Ana');
    assert.equal(filas[1][6], 'CC-01');
    assert.equal(filas[1][9], 'Sí');
    assert.equal(filas[2][9], 'No');
    const sql = consultas.find(q => q.sql.includes('FROM `Maestro_Segmentación` s'));
    assert.match(sql.sql, /s\.`Centro de costos` AS centro_costos/);
    assert.match(sql.sql, /dc\.TipoDocumento = '18'/);
    assert.deepEqual(sql.params, ['Activo', 'Activo', 'Activo', 'Operación A']);
  });

  test(`${formato}: sábana incluye secciones autorizadas y excluye las restringidas`, async () => {
    const filas = await reporte(formato, 'sabana_completa');
    assert.ok(filas[0].includes('Identificación'));
    assert.ok(filas[0].includes('Primer Nombre'));
    assert.ok(filas[0].includes('Centro de costos'));
    assert.ok(filas[0].includes('Contrato firmado'));
    assert.ok(!filas[0].includes('Banco'));
    assert.ok(!filas[0].includes('EPS'));
  });
}

test('la descarga de la vista envía el alcance seleccionado al servidor', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/views/talenthub/index.html'), 'utf8');
  const inicio = html.indexOf("    function descargarReporteSociodemografica(");
  const fin = html.indexOf('    function renderContenidoDetalleSocio()', inicio);
  const elements = { reporteSocioTipo: { value: 'sabana_completa' } };
  const contexto = {
    URLSearchParams, CONFIG: { usuarioId: 'usuario' }, _socioEstadoVista: 'Activo',
    _socioOpcionActiva: 'colaboradores', document: { getElementById: id => elements[id] || null },
    cerrarModales() {}, showToast() {}, window: { location: {} },
  };
  vm.createContext(contexto);
  vm.runInContext(html.slice(inicio, fin), contexto);
  contexto.descargarReporteSociodemografica('csv');
  const params = new URL(contexto.window.location.href, 'http://localhost').searchParams;
  assert.equal(params.get('alcance'), 'sabana_completa');
  assert.equal(params.get('formato'), 'csv');
});
