const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const servicio = fs.readFileSync(path.join(raiz, 'src/services/reportesSeleccionService.js'), 'utf8');
const ruta = fs.readFileSync(path.join(raiz, 'src/routes/talenthub.js'), 'utf8');
const frontend = fs.readFileSync(path.join(raiz, 'public/js/talenthub-ans-seleccion.js'), 'utf8');

test('obtenerReporteAnsSeleccion calcula KPIs, cobertura y cumplimiento por responsable', async () => {
  const pool = {
    async execute(sql) {
      if (sql.includes('FROM `Config_Parametros`')) {
        return [[
          { Modulo: 'talenthub', Seccion: 'Requisiciones', Concepto: 'Tiempo limite de Requisición', Condicion: null, Parametro: '8' },
          { Modulo: 'talenthub', Seccion: 'Requisiciones', Concepto: 'Hora de corte inicio conteo SLA', Condicion: null, Parametro: '12:00' },
          { Modulo: 'talenthub', Seccion: 'Requisiciones', Concepto: 'Conteo de Dias del proceso de Requisición', Condicion: null, Parametro: 'Lunes, Martes, Miercoles, Jueves, Viernes' },
          { Modulo: 'talenthub', Seccion: 'Requisiciones', Concepto: 'Tener en cuenta festivos en el conteo de dias del proceso', Condicion: null, Parametro: '0' }
        ]];
      }
      if (sql.includes('FROM `Maestro_Fechas`')) {
        return [[{ f: '2026-11-02' }, { f: '2026-11-16' }]];
      }
      if (sql.includes('FROM `Dynamic_Requisiciones_Suspension`')) {
        return [[]];
      }
      if (sql.includes('FROM `Dynamic_Requisiciones`')) {
        return [[
          {
            IdRequisicion: 101,
            requisicion: 'RQ00101',
            fechaRequisicion: '2026-11-03 09:00',
            fechaRequisicionCorta: '2026-11-03',
            estado: 'FINALIZADO',
            responsable: 'Kelly Cuaical',
            regional: 'CENTRO',
            operacion: 'Cedi Av 68',
            cargo: 'AUXILIAR LOGISTICO',
            solicitante: 'Jefe A',
            vacantes_req: 2,
            fecha_fin: '2026-11-06'
          },
          {
            IdRequisicion: 102,
            requisicion: 'RQ00102',
            fechaRequisicion: '2026-11-03 09:00',
            fechaRequisicionCorta: '2026-11-03',
            estado: 'FINALIZADO',
            responsable: 'Yakeline Deossa',
            regional: 'ANTIOQUIA',
            operacion: 'Pepsico Guarne',
            cargo: 'AUXILIAR LOGISTICO',
            solicitante: 'Jefe B',
            vacantes_req: 1,
            fecha_fin: '2026-11-20'
          },
          {
            IdRequisicion: 103,
            requisicion: 'RQ00103',
            fechaRequisicion: '2026-11-24 10:00',
            fechaRequisicionCorta: '2026-11-24',
            estado: 'EN PROCESO',
            responsable: 'Kelly Cuaical',
            regional: 'CENTRO',
            operacion: 'Cedi Av 68',
            cargo: 'AUXILIAR LOGISTICO',
            solicitante: 'Jefe A',
            vacantes_req: 1,
            fecha_fin: null
          }
        ]];
      }
      if (sql.includes('FROM `Dynamic_hv_aspirante`')) {
        return [[
          {
            id_aspirante: 'asp-1',
            IdRequisicion: 101,
            identificacion: '1001',
            aspirante: 'Juan Perez',
            estado_proceso: 'contratado',
            fecha_registro_asp: '2026-11-04 10:00',
            fecha_act_asp: '2026-11-05 16:00',
            usuario_gestion: 'Kelly Cuaical',
            fecha_socio: '2026-11-05 16:00',
            usuario_socio: 'Kelly Cuaical',
            fecha_ingreso_laboral: '2026-11-06'
          },
          {
            id_aspirante: 'asp-2',
            IdRequisicion: 101,
            identificacion: '1002',
            aspirante: 'Ana Gomez',
            estado_proceso: 'contratado',
            fecha_registro_asp: '2026-11-04 11:00',
            fecha_act_asp: '2026-11-06 14:00',
            usuario_gestion: 'Kelly Cuaical',
            fecha_socio: '2026-11-06 14:00',
            usuario_socio: 'Kelly Cuaical',
            fecha_ingreso_laboral: '2026-11-07'
          },
          {
            id_aspirante: 'asp-3',
            IdRequisicion: 102,
            identificacion: '1003',
            aspirante: 'Carlos Ruiz',
            estado_proceso: 'contratado',
            fecha_registro_asp: '2026-11-05 10:00',
            fecha_act_asp: '2026-11-20 15:00',
            usuario_gestion: 'Yakeline Deossa',
            fecha_socio: '2026-11-20 15:00',
            usuario_socio: 'Yakeline Deossa',
            fecha_ingreso_laboral: '2026-11-21'
          }
        ]];
      }
      throw new Error(`Consulta no simulada: ${sql}`);
    }
  };

  const slaReqModule = require('../src/services/slaRequisiciones');
  const ctx = {
    require: (mod) => {
      if (mod === './db' || mod.endsWith('/db')) return pool;
      if (mod === './slaRequisiciones' || mod.endsWith('/slaRequisiciones')) return slaReqModule;
      return require(mod);
    },
    module: { exports: {} },
    Intl,
    Date,
    console
  };

  vm.runInNewContext(servicio, ctx);
  const resultado = await ctx.module.exports.obtenerReporteAnsSeleccion({
    fechaDesde: '2026-11-01',
    fechaHasta: '2026-11-30',
    acceso: { sinFiltro: true }
  });

  // 1. Validar KPIs globales
  assert.equal(resultado.kpis.totalRequisiciones, 3);
  assert.equal(resultado.kpis.vacantesRequeridas, 4);
  assert.equal(resultado.kpis.vacantesCubiertas, 3);
  assert.equal(resultado.kpis.pctCoberturaGlobal, 75);
  assert.equal(resultado.kpis.cumpleTiempo, 1);
  assert.equal(resultado.kpis.fueraTiempo, 1);
  assert.equal(resultado.kpis.pctCumplimientoGlobal, 50);
  assert.equal(resultado.kpis.enProceso, 1);

  // 2. Validar analistas
  assert.equal(resultado.analistas.length, 2);
  const kelly = resultado.analistas.find(a => a.responsable === 'Kelly Cuaical');
  assert.ok(kelly);
  assert.equal(kelly.totalRequisiciones, 2);
  assert.equal(kelly.vacantesRequeridas, 3);
  assert.equal(kelly.vacantesCubiertas, 2);
  assert.equal(kelly.cumpleTiempo, 1);
  assert.equal(kelly.fueraTiempo, 0);
  assert.equal(kelly.pctCumplimiento, 100);

  const yakeline = resultado.analistas.find(a => a.responsable === 'Yakeline Deossa');
  assert.ok(yakeline);
  assert.equal(yakeline.cumpleTiempo, 0);
  assert.equal(yakeline.fueraTiempo, 1);
  assert.equal(yakeline.pctCumplimiento, 0);
});

test('API /talenthub/api/ans-seleccion restringe permisos y valida fechas', async () => {
  const inicio = ruta.indexOf("router.get('/api/ans-seleccion'");
  const fin = ruta.indexOf('\nfunction rolPermitidoEnParametro', inicio);
  assert.ok(inicio >= 0 && fin > inicio);

  let handler;
  const ctx = {
    router: { get(_url, fn) { handler = fn; } },
    computarAccesoTalenthub: async (usuario) => {
      if (usuario === 'denegado') return null;
      return { sinFiltro: true };
    },
    obtenerReporteAnsSeleccion: async (filtros) => ({
      kpis: { totalRequisiciones: 10 },
      analistas: [],
      requisiciones: []
    }),
    console
  };

  vm.runInNewContext(ruta.slice(inicio, fin), ctx);

  function crearRes() {
    return {
      codigo: 200,
      status(c) { this.codigo = c; return this; },
      json(d) { this.datos = d; return this; }
    };
  }

  // Permiso denegado
  const res1 = crearRes();
  await handler({ query: { usuario: 'denegado' } }, res1);
  assert.equal(res1.codigo, 403);

  // Fecha inválida
  const res2 = crearRes();
  await handler({ query: { usuario: 'permitido', desde: '2026-13-99' } }, res2);
  assert.equal(res2.codigo, 400);

  // Consulta exitosa
  const res3 = crearRes();
  await handler({ query: { usuario: 'permitido', desde: '2026-11-01', hasta: '2026-11-30' } }, res3);
  assert.equal(res3.codigo, 200);
  assert.equal(res3.datos.ok, true);
  assert.equal(res3.datos.kpis.totalRequisiciones, 10);
});

test('frontend renderiza mini-stats, selector de Año/Mes, columnas redimensionables y alternar vistas', () => {
  assert.match(frontend, /class="ans-mini-stat"/);
  assert.match(frontend, /id="ansSelAnio"/);
  assert.match(frontend, /id="ansSelMes"/);
  assert.match(frontend, /REQ\. EN PROCESO/);
  assert.match(frontend, /col-resizer/);
  assert.match(frontend, /ansOrdenar/);
  assert.match(frontend, /Consolidado por Responsable/);
  assert.match(frontend, /Detalle de Requisiciones/);
  assert.match(frontend, /Vacantes Req\./);
  assert.match(frontend, /Cubiertas \(Socio\)/);
  assert.match(frontend, /Cubiertas \| <b>\$\{vacReq\}<\/b> vacantes/);
  assert.match(frontend, /window\.ansIrARequisiciones\s*=/);
  assert.match(frontend, /window\.ansFiltrarCumplimientoReq\s*=/);
  assert.match(frontend, /Todos los años/);
  assert.match(frontend, /Todos los meses/);
  assert.match(frontend, /Cumplimiento ANS/);
  assert.match(frontend, /actualizarControlesPeriodo/);
  assert.match(frontend, /window\.recargarAnsSeleccion\s*=/);
});

test('Requisiciones incluye filtros de Año, Mes, Quincena, Cumplimiento ANS y columna Cumplimiento ANS', () => {
  const htmlIndex = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'talenthub', 'index.html'), 'utf8');
  assert.match(htmlIndex, /id="filtroReqAnio"/);
  assert.match(htmlIndex, /id="filtroReqMes"/);
  assert.match(htmlIndex, /id="filtroReqQuincena"/);
  assert.match(htmlIndex, /id="filtroReqCumplimiento"/);
  assert.match(htmlIndex, /<span>Cumplimiento ANS<\/span>/);
  assert.match(htmlIndex, /calcularRangoFechasRequisiciones/);
  assert.match(htmlIndex, /sincronizarControlesFiltroPeriodoReq/);
  assert.match(htmlIndex, /actualizarFiltrosConConteos/);
  assert.match(htmlIndex, /window\._reqFiltros\s*=/);
});

test('Opción B evalúa la menor fecha entre fecha_ingreso_laboral y fecha_socio', async () => {
  const pool = {
    async execute(sql) {
      if (sql.includes('FROM `Config_Parametros`')) {
        return [[
          { Modulo: 'talenthub', Seccion: 'Requisiciones', Concepto: 'Tiempo limite de Requisición', Condicion: null, Parametro: '8' }
        ]];
      }
      if (sql.includes('FROM `Maestro_Fechas`') || sql.includes('FROM `Dynamic_Requisiciones_Suspension`')) {
        return [[]];
      }
      if (sql.includes('FROM `Dynamic_Requisiciones`')) {
        return [[
          {
            IdRequisicion: 201,
            requisicion: 'RQ00201',
            fechaRequisicion: '2026-08-04 09:00',
            fechaRequisicionCorta: '2026-08-04',
            estado: 'FINALIZADO',
            responsable: 'Jose Agudelo',
            regional: 'CENTRO',
            operacion: 'Cedi Av 68',
            cargo: 'AUXILIAR LOGISTICO',
            solicitante: 'Jefe C',
            vacantes_req: 1,
            fecha_fin: null
          }
        ]];
      }
      if (sql.includes('FROM `Dynamic_hv_aspirante`')) {
        return [[
          {
            id_aspirante: 'asp-201',
            IdRequisicion: 201,
            identificacion: '1075675333',
            aspirante: 'Jenniffer Castellanos',
            estado_proceso: 'contratado',
            fecha_registro_asp: '2026-08-04 10:00',
            fecha_act_asp: '2026-10-10 15:44',
            usuario_gestion: 'Jose Agudelo',
            fecha_socio: '2026-08-19 16:00', // 9 días hábiles (tarde)
            usuario_socio: 'Santiago Jaramillo',
            fecha_ingreso_laboral: '2026-08-06' // 2 días hábiles (a tiempo)
          }
        ]];
      }
      throw new Error(`Consulta no simulada: ${sql}`);
    }
  };

  const slaReqModule = require('../src/services/slaRequisiciones');
  const ctx = {
    require: (mod) => {
      if (mod === './db' || mod.endsWith('/db')) return pool;
      if (mod === './slaRequisiciones' || mod.endsWith('/slaRequisiciones')) return slaReqModule;
      return require(mod);
    },
    module: { exports: {} },
    Intl,
    Date,
    console
  };

  const servicioActual = fs.readFileSync(path.join(raiz, 'src/services/reportesSeleccionService.js'), 'utf8');
  vm.runInNewContext(servicioActual, ctx);
  const resultado = await ctx.module.exports.obtenerReporteAnsSeleccion({
    fechaDesde: '2026-08-01',
    fechaHasta: '2026-08-31',
    acceso: { sinFiltro: true }
  });

  assert.equal(resultado.kpis.cumpleTiempo, 1);
  assert.equal(resultado.kpis.fueraTiempo, 0);
  assert.equal(resultado.requisiciones[0].slaEstado, 'cumple');
  assert.equal(resultado.requisiciones[0].aspirantes[0].fecha_cierre_efectiva, '2026-08-06');
  assert.equal(resultado.requisiciones[0].aspirantes[0].estadoSla, 'cumple');
});
