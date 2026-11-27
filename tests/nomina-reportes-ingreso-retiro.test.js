const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const servicio = fs.readFileSync(path.join(__dirname, '../src/services/reportesNominaService.js'), 'utf8');
const frontend = fs.readFileSync(path.join(__dirname, '../public/js/nomina-reportes-indicadores.js'), 'utf8');

test('consulta el mismo período para ingreso y retiro y protege cantidades de otras operaciones', async () => {
  let consultaPeriodo;
  const pool = {
    async execute(sql, params) {
      if (sql.includes('Config_Parametros')) return [[]];
      if (sql.includes('AS ingreso_retiro_periodo')) {
        consultaPeriodo = { sql, params };
        return [[{ operacion: 'Propia', ingreso_retiro_periodo: '2' }, { operacion: 'Otra', ingreso_retiro_periodo: '3' }]];
      }
      if (sql.includes('AS total_retiros')) {
        return [[
          { operacion: 'Propia', regional: 'Norte', total_retiros: 4, retiros_tempranos: 3, permanencia_media_dias: 10, retraso_aviso_medio_dias: 1 },
          { operacion: 'Otra', regional: 'Sur', total_retiros: 3, retiros_tempranos: 2, permanencia_media_dias: 5, retraso_aviso_medio_dias: 1 }
        ]];
      }
      if (sql.includes('AS total_ingresos')) return [[{ operacion: 'Sin coincidencias', total_ingresos: 1 }]];
      return [[]];
    }
  };
  const contexto = { require: () => pool, module: { exports: {} }, console };
  vm.runInNewContext(servicio, contexto);
  const datos = await contexto.module.exports.obtenerIndicadoresOperaciones({
    fechaDesde: '2026-11-01',
    fechaHasta: '2026-11-15',
    acceso: { sinFiltro: false, operacionesFiltro: ['Propia', 'Sin coincidencias'] }
  });

  assert.deepEqual(Array.from(consultaPeriodo.params), ['2026-11-01', '2026-11-15', '2026-11-01', '2026-11-15']);
  assert.match(consultaPeriodo.sql, /COUNT\(DISTINCT `Identificación`\)/);
  assert.match(consultaPeriodo.sql, /`Fecha de Retiro` BETWEEN \? AND \?/);
  assert.match(consultaPeriodo.sql, /`Fecha de Ingreso` BETWEEN \? AND \?/);
  assert.match(consultaPeriodo.sql, /`Fecha de Retiro` >= `Fecha de Ingreso`/);
  assert.match(consultaPeriodo.sql, /`Estado` = 'Retirado'/);
  assert.equal(datos.operaciones.find(o => o.operacion === 'Propia').ingresoRetiroPeriodo, 2);
  assert.equal(datos.operaciones.find(o => o.operacion === 'Sin coincidencias').ingresoRetiroPeriodo, 0);
  assert.equal(datos.operaciones.find(o => o.operacion === 'Otra').ingresoRetiroPeriodo, null);

  // Probar cálculo de fechas para Q2 (debe iniciar el filtro de ingreso en el 1 del mes)
  await contexto.module.exports.obtenerIndicadoresOperaciones({
    fechaDesde: '2026-11-16',
    fechaHasta: '2026-11-30',
    acceso: { sinFiltro: true }
  });
  assert.deepEqual(Array.from(consultaPeriodo.params), ['2026-11-16', '2026-11-30', '2026-11-01', '2026-11-30']);
});

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
test('la consulta cuenta personas en los límites del corte y excluye fechas fuera del período', {
  skip: nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 5)
}, async () => {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE `Maestro_Vinculación` (`Identificación` TEXT, `Operación` TEXT, `Estado` TEXT, `Fecha de Ingreso` TEXT, `Fecha de Retiro` TEXT, `Motivo del Retiro` TEXT)');
    const insertar = db.prepare('INSERT INTO `Maestro_Vinculación` VALUES (?, ?, ?, ?, ?, ?)');
    [
      ['1', 'A', 'Retirado', '2026-11-01', '2026-11-15', 'Renuncia'],
      ['1', 'A', 'Retirado', '2026-11-01', '2026-11-15', 'Renuncia'],
      ['2', 'A', 'Retirado', '2026-11-15', '2026-11-15', 'Renuncia'],
      ['3', 'A', 'Retirado', '2026-11-15', '2026-11-16', 'Renuncia'],
      ['4', 'A', 'Retirado', '2026-11-16', '2026-11-30', 'Renuncia'],
      ['5', 'A', 'Retirado', '2026-10-31', '2026-11-01', 'Renuncia'],
      ['6', 'A', 'Retirado', '2026-11-30', '2026-12-01', 'Renuncia'],
      ['7', 'A', 'Retirado', '2026-11-10', '2026-11-09', 'Renuncia'],
      ['8', 'A', 'Activo', '2026-11-01', '2026-11-15', null],
      ['9', 'B', 'Retirado', '2026-11-01', '2026-11-15', 'Renuncia']
    ].forEach(row => insertar.run(...row));

    let sqlPeriodo;
    const pool = {
      async execute(sql) {
        if (sql.includes('AS ingreso_retiro_periodo')) sqlPeriodo = sql;
        return [[]];
      }
    };
    const contexto = { require: () => pool, module: { exports: {} }, console };
    vm.runInNewContext(servicio, contexto);
    await contexto.module.exports.obtenerIndicadoresOperaciones({
      fechaDesde: '2026-11-01', fechaHasta: '2026-11-15', acceso: { sinFiltro: true }
    });
    const consulta = db.prepare(sqlPeriodo);
    const contar = (desde, hasta, inicioMes = desde.substring(0, 7) + '-01') => Object.fromEntries(
      consulta.all(desde, hasta, inicioMes, hasta).map(r => [r.operacion, r.ingreso_retiro_periodo])
    );
    assert.deepEqual(contar('2026-11-01', '2026-11-15'), { A: 2, B: 1 });
    assert.deepEqual(contar('2026-11-16', '2026-11-30'), { A: 2 });
    assert.deepEqual(contar('2026-11-01', '2026-11-30'), { A: 4, B: 1 });
  } finally {
    db.close();
  }
});

function prepararFrontend() {
  const elementos = new Map();
  const document = {
    getElementById(id) {
      if (id === 'repTablaConsolidada') return null;
      if (!elementos.has(id)) elementos.set(id, { innerHTML: '', style: {} });
      return elementos.get(id);
    }
  };
  const contexto = { window: {}, document, console, URLSearchParams, Date };
  const codigo = frontend.replace(/\}\)\(\);\s*$/, 'window.__prueba = { _repState, calcularRangoFechas, renderizarTablaConsolidada }; })();');
  vm.runInNewContext(codigo, contexto);
  return { contexto, elementos, prueba: contexto.window.__prueba };
}

test('los cortes abarcan todos los días del período seleccionado', () => {
  const { prueba } = prepararFrontend();
  prueba._repState.anio = 2026;
  prueba._repState.mes = 11;
  prueba._repState.quincena = 'Q1';
  assert.equal(prueba.calcularRangoFechas().desde, '2026-11-01');
  assert.equal(prueba.calcularRangoFechas().hasta, '2026-11-15');
  prueba._repState.quincena = 'Q2';
  assert.equal(prueba.calcularRangoFechas().desde, '2026-11-16');
  assert.equal(prueba.calcularRangoFechas().hasta, '2026-11-30');
  prueba._repState.quincena = 'todas';
  assert.equal(prueba.calcularRangoFechas().desde, '2026-11-01');
  assert.equal(prueba.calcularRangoFechas().hasta, '2026-11-30');
  prueba._repState.anio = 2024;
  prueba._repState.mes = 2;
  assert.equal(prueba.calcularRangoFechas().hasta, '2024-02-29');
});

test('el consolidado muestra y ordena la columna, y suma solo operaciones visibles', () => {
  const { contexto, elementos, prueba } = prepararFrontend();
  const operacion = (nombre, cantidad, propia, retiros, ingresos = 4) => ({
    operacion: nombre, regional: 'Norte', esPropia: propia, planta: 10, retiros,
    ingresos, balance: 0, ingresoRetiroPeriodo: cantidad, retirosTempranos: 1,
    pctRotacion: 10, pctTemprano: 100, retrasoAvisoMedioDias: 1, permanenciaMediaDias: 2
  });
  prueba._repState.data = { operaciones: [operacion('A', 1, true, 4, 4), operacion('B', 2, true, 4, 4), operacion('C', null, false, 1, 1), operacion('D', 0, true, 0, 0)] };
  prueba.renderizarTablaConsolidada();
  let html = elementos.get('repContenedorOperaciones').innerHTML;
  assert.match(html, /Balance Neto[\s\S]*Ingresaron y salieron[\s\S]*Retiros &lt; 60 d/);
  assert.match(html, /<b>1<\/b> <span style="font-size:0.75rem; color:#d97706;">\(25.0%\)<\/span>/);
  assert.match(html, /<b>2<\/b> <span style="font-size:0.75rem; color:#dc2626;">\(50.0%\)<\/span>/);
  assert.match(html, /0 <span style="font-size:0.75rem; color:var\(--text-muted\);">\(0.0%\)<\/span>/);
  assert.match(html, /TOTAL CONSOLIDADO \(3 operaciones\)[\s\S]*?<td style="text-align:right;">3 \(37.5%\)<\/td>/);
  assert.doesNotMatch(html, />C<\/b>/);
  contexto.window.repOrdenarTabla('ingresoRetiroPeriodo');
  html = elementos.get('repContenedorOperaciones').innerHTML;
  assert.ok(html.indexOf('>B</b>') < html.indexOf('>A</b>'));
  prueba._repState.filtroOperacion = 'A';
  prueba.renderizarTablaConsolidada();
  html = elementos.get('repContenedorOperaciones').innerHTML;
  assert.match(html, /TOTAL CONSOLIDADO \(1 operaciones\)[\s\S]*?<td style="text-align:right;">1 \(25.0%\)<\/td>/);
});

test('al abrir directamente Reportes se inicializa al cargar el script, sin cambiar de pestaña', () => {
  const urls = [];
  const elementos = new Map();
  const document = {
    getElementById(id) {
      if (id === 'repTablaConsolidada') return null;
      if (!elementos.has(id)) elementos.set(id, { innerHTML: '', style: {} });
      return elementos.get(id);
    },
    createElement() { return {}; },
    head: { appendChild() {} }
  };
  const contexto = { document, console, URLSearchParams, Date, location: { search: '?usuario=prueba&tab=reportes' } };
  contexto.window = contexto;
  contexto.fetch = url => { urls.push(url); return new Promise(() => {}); };
  vm.createContext(contexto);
  vm.runInContext("let _tabActual = 'reportes';", contexto);
  vm.runInContext(frontend, contexto);
  assert.match(elementos.get('panelReportes').innerHTML, /Reportes e Indicadores de Operaciones/);
  assert.match(urls[0], /\/nomina\/api\/reportes\/indicadores-operaciones\?usuario=prueba/);
  assert.equal(urls.length, 1);
});

test('si se abre otra pestaña no inicia Reportes automáticamente', () => {
  let consultas = 0;
  const contexto = { window: {}, document: {}, console, URLSearchParams, Date, fetch() { consultas++; } };
  vm.createContext(contexto);
  vm.runInContext("let _tabActual = 'activos';", contexto);
  vm.runInContext(frontend, contexto);
  assert.equal(consultas, 0);
});

test('obtenerEvolucionMensual incluye personas que ingresaron y salieron en el mismo mes y sus totales', async () => {
  let sqlIngRet;
  const pool = {
    async execute(sql, params) {
      if (sql.includes('Config_Parametros')) return [[]];
      if (sql.includes('AS ingreso_retiro_mes')) {
        sqlIngRet = { sql, params };
        return [[{ mes: 11, ingreso_retiro_mes: '28' }]];
      }
      if (sql.includes('AS total_retiros')) {
        return [[{ mes: 11, total_retiros: 93, retiros_tempranos: 47 }]];
      }
      if (sql.includes('AS total_ingresos')) {
        return [[{ mes: 11, total_ingresos: 108 }]];
      }
      if (sql.includes('SELECT COUNT(*) AS planta')) {
        return [[{ planta: 1027 }]];
      }
      if (sql.includes('Maestro_Operaciones')) {
        return [[{ operacion: 'PEPSICO GUARNE', regional: 'ANTIOQUIA' }]];
      }
      return [[]];
    }
  };
  const contexto = { require: () => pool, module: { exports: {} }, console };
  vm.runInNewContext(servicio, contexto);

  const res = await contexto.module.exports.obtenerEvolucionMensual({
    anio: 2026,
    regional: null,
    operacion: null,
    acceso: { sinFiltro: false, accesoCode: 2, tipoAcceso: 'regional', regional: 'ANTIOQUIA', operacionesFiltro: ['PEPSICO GUARNE'] }
  });

  assert.ok(sqlIngRet, 'debe consultar ingreso_retiro_mes');
  assert.match(sqlIngRet.sql, /COUNT\(DISTINCT `Identificación`\) AS ingreso_retiro_mes/);
  assert.match(sqlIngRet.sql, /YEAR\(`Fecha de Retiro`\) = \?/);
  assert.match(sqlIngRet.sql, /MONTH\(`Fecha de Ingreso`\) = MONTH\(`Fecha de Retiro`\)/);

  const mesNov = res.meses.find(m => m.numMes === 11);
  assert.equal(mesNov.ingresoRetiro, 28);
  assert.equal(mesNov.pctIngresoRetiro, 25.9); // (28 / 108) * 100 = 25.9%

  assert.equal(res.totalesAnio.totalIngresoRetiro, 28);
  assert.equal(res.totalesAnio.pctIngresoRetiroMedia, 25.9);

  assert.equal(res.accesoUsuario.tipoAcceso, 'regional');
  assert.equal(res.accesoUsuario.regional, 'ANTIOQUIA');
});

test('prellena Regional y Operación según el rol y acceso del usuario en vista principal y modal', () => {
  const { prueba, elementos } = prepararFrontend();
  prueba._repState.data = {
    accesoUsuario: {
      sinFiltro: false,
      tipoAcceso: 'operacion',
      regional: 'ANTIOQUIA',
      operacion: 'PEPSICO GUARNE',
      operacionesFiltro: ['PEPSICO GUARNE']
    },
    operaciones: [
      { operacion: 'PEPSICO GUARNE', regional: 'ANTIOQUIA', esPropia: true, planta: 100, retiros: 10, ingresos: 12, balance: 2, pctRotacion: 10 }
    ]
  };

  // Simular la carga inicial que ejecuta cargarDatosReportes
  if (!prueba._repState.filtrosPrellenados) {
    const acc = prueba._repState.data.accesoUsuario;
    prueba._repState.filtroOperacion = acc.operacion;
    prueba._repState.filtroRegional = acc.regional;
    prueba._repState.filtrosPrellenados = true;
  }

  assert.equal(prueba._repState.filtroRegional, 'ANTIOQUIA');
  assert.equal(prueba._repState.filtroOperacion, 'PEPSICO GUARNE');

  // Al abrir el modal de evolución mensual se deben propagar los valores prellenados
  prueba._repState.modalHist.regional = prueba._repState.filtroRegional;
  prueba._repState.modalHist.operacion = prueba._repState.filtroOperacion;
  assert.equal(prueba._repState.modalHist.regional, 'ANTIOQUIA');
  assert.equal(prueba._repState.modalHist.operacion, 'PEPSICO GUARNE');
});

test('la ventana emergente de Evolución Mensual renderiza la columna Ingresaron y salieron', () => {
  const { elementos } = prepararFrontend();
  const contenedorModal = { innerHTML: '' };
  elementos.set('repModCuerpoTabla', contenedorModal);

  // Simular función de renderizado de la tabla de evolución
  const codigoModal = frontend.replace(/\}\)\(\);\s*$/, 'window.__renderizarModal = renderizarTablaEvolucionModal; })();');
  const contexto = { window: {}, document: { getElementById: id => elementos.get(id) || null }, console, URLSearchParams, Date };
  vm.runInNewContext(codigoModal, contexto);

  contexto.window.__renderizarModal({
    anio: 2026,
    meses: [
      { numMes: 11, mes: 'Noviembre', esFuturo: false, esMesEnCurso: true, planta: 1027, ingresos: 108, retiros: 93, balance: 15, ingresoRetiro: 28, pctIngresoRetiro: 25.9, retirosTempranos: 47, pctFuga: 50.5, pctRotacion: 9.1 },
      { numMes: 12, mes: 'Diciembre', esFuturo: true, esMesEnCurso: false, planta: null, ingresos: null, retiros: null, balance: null, ingresoRetiro: null, pctIngresoRetiro: null, retirosTempranos: null, pctFuga: null, pctRotacion: null }
    ],
    totalesAnio: {
      totalIngresos: 108,
      totalRetiros: 93,
      balanceNeto: 15,
      totalIngresoRetiro: 28,
      pctIngresoRetiroMedia: 25.9,
      totalTempranos: 47,
      pctFugaMedia: 50.5
    }
  });

  const html = contenedorModal.innerHTML;
  assert.match(html, /<th[^>]*>Ingresaron y salieron<\/th>/);
  assert.match(html, /<b>28<\/b> <span style="font-size:0.75rem; color:#d97706; font-weight:700;\">\(25.9%\)<\/span>/);
  assert.match(html, /TOTAL AÑO 2026[\s\S]*?<td style="text-align:right;">28 \(25.9%\)<\/td>/);
});

test('renderiza las 5 tarjetas de resumen estilo mini-stat con Ingresaron y salieron y botón sync', () => {
  const { elementos } = prepararFrontend();
  const contenedorKpis = { innerHTML: '' };
  elementos.set('repKpisResumen', contenedorKpis);

  const codigoKpis = frontend.replace(/\}\)\(\);\s*$/, 'window.__renderizarKpis = renderizarKpis; window.__repState = _repState; })();');
  const contexto = { window: {}, document: { getElementById: id => elementos.get(id) || null }, console, URLSearchParams, Date };
  vm.runInNewContext(codigoKpis, contexto);

  contexto.window.__repState.data = {
    kpisGlobales: {
      rotacionMediaGlobal: 10.4,
      tiempoAvisoMedioGlobal: 2.1,
      pctFugaTempranaGlobal: 52.1,
      pctIngresoRetiroGlobal: 25.7,
      esCorporativo: true,
      totalesCorporativos: {
        plantaTotal: 919,
        retirosTotal: 96,
        ingresosTotal: 113,
        balanceNeto: 17,
        retirosTempranosTotal: 50,
        ingresoRetiroTotal: 29,
        noTomaronCargoTotal: 7
      }
    },
    parametros: { Dias_Aviso_Oportuno: 2, Dias_Fuga_Temprana: 60 },
    operaciones: []
  };

  contexto.window.__renderizarKpis();
  const html = contenedorKpis.innerHTML;

  // 1. Debe usar la clase .rep-mini-stat
  assert.match(html, /class="rep-mini-stat"/);

  // 2. 4ta tarjeta: Ingresaron y salieron con retiros y no tomaron cargo
  assert.match(html, /<span>Ingresaron y salieron<\/span>/);
  assert.match(html, /25\.7% <small[^>]*>\(29\)<\/small>/);
  assert.match(html, /<b>22<\/b> retiros \| <b>7<\/b> no tomaron cargo/);

  // 3. 5ta tarjeta: Balance sin "Planta activa final" ni "<60d", solo ingresos y retiros
  assert.match(html, /<span>Balance(?: Corporativo| Filtro)?<\/span>/);
  assert.doesNotMatch(html, /Planta activa final/);
  assert.doesNotMatch(html, /retiros &lt; 60d/);
  assert.match(html, /<b>113<\/b> ingresos \| <b style="color:#dc2626;">96<\/b> retiros/);

  // 4. Botón sincronizar en el HTML principal del frontend
  assert.match(frontend, /id="btnRepSync" class="bsync"/);
});
