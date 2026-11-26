/**
 * nomina-reportes-indicadores.js
 * Pestaña Reportes e Indicadores de Nómina:
 * - Vista por defecto: Tabla consolidada por operación con conteos y porcentajes,
 *   ordenamiento interactivo en columnas y redimensionamiento (achicar/anchar).
 * - Vistas: tabla consolidada y ranking de rotación por operación.
 * - Filtros en cascada: Regional -> Operación con porcentajes interactivos (Rotación e Ingresos).
 * - Ventana emergente (Modal): Evolución histórica mensual (1-12) de En Planta, Ingresos, Retiros y Fuga <60d
 *   con filtros por Año, Regional y Operación (exclusiva para roles autorizados: Nomina, Directorth, Juridica, etc.).
 * - Adaptación 100% responsive para móviles y pantallas táctiles.
 */

(function () {
  const _repState = {
    cargado: false,
    cargando: false,
    vista: 'tabla', // 'tabla' (por defecto) | 'ranking'
    anio: new Date().getFullYear(),
    mes: new Date().getMonth() + 1,
    quincena: 'todas', // 'todas' | 'Q1' | 'Q2'
    filtroRegional: '',
    filtroOperacion: '',
    filtroSoloRetiros: false, // Por defecto false para mostrar operaciones con 0 retiros (ej. Norte de Santander)
    filtrosPrellenados: false,
    ordenColumna: 'regional',
    ordenDir: 'asc',
    data: null,
    // Estado del modal de evolución mensual
    modalHist: {
      abierto: false,
      cargando: false,
      anio: new Date().getFullYear(),
      regional: '',
      operacion: '',
      data: null
    }
  };

  const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function obtenerUsuarioActual() {
    return window.usuario || (window._cfg && window._cfg.usuario) || (new URLSearchParams(window.location.search).get('usuario')) || '';
  }

  function calcularRangoFechas() {
    const a = _repState.anio;
    const m = _repState.mes;
    const p = n => String(n).padStart(2, '0');

    if (_repState.quincena === 'Q1') {
      return {
        desde: `${a}-${p(m)}-01`,
        hasta: `${a}-${p(m)}-15`,
        label: `${MESES[m - 1]} Q1 (${a})`
      };
    } else if (_repState.quincena === 'Q2') {
      const ultimoDia = new Date(a, m, 0).getDate();
      return {
        desde: `${a}-${p(m)}-16`,
        hasta: `${a}-${p(m)}-${p(ultimoDia)}`,
        label: `${MESES[m - 1]} Q2 (${a})`
      };
    } else {
      const ultimoDia = new Date(a, m, 0).getDate();
      return {
        desde: `${a}-${p(m)}-01`,
        hasta: `${a}-${p(m)}-${p(ultimoDia)}`,
        label: `Mes de ${MESES[m - 1]} ${a}`
      };
    }
  }

  window.inicializarReportesIndicadores = function () {
    const container = document.getElementById('panelReportes');
    if (!container) return;

    inyectarEstilosResponsive();

    if (!_repState.cargado) {
      renderizarEstructuraBase(container);
      _repState.cargado = true;
    }
    cargarDatosReportes();
  };

  function inyectarEstilosResponsive() {
    if (document.getElementById('repEstilosReportes')) return;
    const style = document.createElement('style');
    style.id = 'repEstilosReportes';
    style.textContent = `
      .rep-vistas-strip {
        display: inline-flex;
        border: 1.5px solid var(--border);
        border-radius: 9px;
        overflow-x: auto;
        white-space: nowrap;
        background: var(--card-bg, #fff);
        max-width: 100%;
        -webkit-overflow-scrolling: touch;
      }
      .rep-vistas-strip::-webkit-scrollbar {
        height: 4px;
      }
      .rep-vistas-strip::-webkit-scrollbar-thumb {
        background: rgba(0,0,0,0.15);
        border-radius: 4px;
      }
      .rep-table-wrap {
        width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: var(--card-bg, #fff);
      }
      .rep-table-custom {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
        table-layout: auto;
      }
      .rep-table-custom th {
        background: var(--bg-elevated, #f8fafc);
        color: var(--text);
        font-weight: 700;
        padding: 10px 12px;
        border-bottom: 2px solid var(--border);
        text-align: left;
        position: relative;
        user-select: none;
        cursor: pointer;
        white-space: nowrap;
      }
      .rep-table-custom th:hover {
        background: rgba(37,99,235,0.06);
      }
      .rep-table-custom td {
        padding: 9px 12px;
        border-bottom: 1px solid var(--border);
        color: var(--text);
        vertical-align: middle;
      }
      .rep-table-custom tr:hover td {
        background: rgba(37,99,235,0.03);
      }
      .rep-table-custom tfoot td {
        background: var(--bg-elevated, #f8fafc);
        font-weight: 800;
        border-top: 2px solid var(--border);
      }
      .rep-resizer {
        position: absolute;
        top: 0;
        right: 0;
        width: 6px;
        cursor: col-resize;
        user-select: none;
        height: 100%;
        z-index: 1;
      }
      .rep-resizer:hover, .rep-resizer.resizing {
        background: var(--accent, #2563eb);
      }
      /* Modal */
      .rep-modal-backdrop {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(15, 23, 42, 0.65);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        backdrop-filter: blur(2px);
        padding: 16px;
      }
      .rep-modal-dialog {
        background: var(--card-bg, #fff);
        border: 1px solid var(--border);
        border-radius: 14px;
        max-width: 950px;
        width: 100%;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.25), 0 8px 10px -6px rgba(0,0,0,0.2);
        overflow: hidden;
        animation: repModalFadeIn 0.2s ease-out;
      }
      @keyframes repModalFadeIn {
        from { opacity: 0; transform: scale(0.97) translateY(8px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      @media (max-width: 768px) {
        .rep-module-header > div {
          flex-direction: column;
          align-items: stretch !important;
        }
        .rep-header-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }
        .rep-header-actions button {
          flex: 1;
          justify-content: center;
        }
        .rep-kpis-grid {
          grid-template-columns: 1fr 1fr !important;
          gap: 8px !important;
        }
        .rep-filtros-bar {
          flex-direction: column !important;
          align-items: stretch !important;
        }
        .rep-filtros-cascada {
          flex-direction: column !important;
          align-items: stretch !important;
        }
        .rep-filtros-cascada select {
          width: 100% !important;
        }
      }
      @media (max-width: 480px) {
        .rep-kpis-grid {
          grid-template-columns: 1fr !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function renderizarEstructuraBase(container) {
    const anioActual = new Date().getFullYear();
    const aniosOpts = [anioActual, anioActual - 1, anioActual - 2]
      .map(y => `<option value="${y}" ${y === _repState.anio ? 'selected' : ''}>${y}</option>`)
      .join('');

    const mesesOpts = MESES.map((nombre, i) => {
      const num = i + 1;
      return `<option value="${num}" ${num === _repState.mes ? 'selected' : ''}>${nombre}</option>`;
    }).join('');

    container.innerHTML = `
      <div class="rep-module-header" style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
          <div>
            <h1 style="font-size:1.45rem; font-weight:800; color:var(--text); margin:0 0 4px 0; display:flex; align-items:center; gap:8px;">
              <span>📊</span> Reportes e Indicadores de Operaciones
            </h1>
            <p style="font-size:0.86rem; color:var(--text-muted); margin:0;">
              Consolidado de planta, rotación, oportunidad de aviso de retiros, deserción en prueba (&lt;60 días) e ingresos.
            </p>
          </div>
          <div class="rep-header-actions" style="display:inline-flex; align-items:center; gap:8px;">
            <button type="button" id="btnRepAbrirModal" class="btn btn-outline" onclick="window.repAbrirModalEvolucion()" style="display:none; align-items:center; gap:6px; font-weight:700; padding:6px 14px; font-size:0.84rem; cursor:pointer; background:var(--card-bg, #fff); border:1.5px solid var(--accent, #2563eb); color:var(--accent, #2563eb); border-radius:8px;">
              <span>📈</span> Evolución Mensual
            </button>
            <button type="button" class="btn btn-outline" onclick="window.cargarDatosReportes()" style="display:inline-flex; align-items:center; gap:6px; font-weight:600; padding:6px 14px; font-size:0.84rem; cursor:pointer; border-radius:8px;">
              <span>🔄</span> Actualizar
            </button>
          </div>
        </div>
      </div>

      <!-- Controles de Periodo -->
      <section class="card" style="padding:14px 18px; margin-bottom:16px; border-radius:12px; background:var(--card-bg, #fff); border:1px solid var(--border);">
        <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:14px;">
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:12px;">
            <div style="display:flex; flex-direction:column; gap:4px;">
              <label for="repSelAnio" style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Año</label>
              <select id="repSelAnio" onchange="window.repCambiarPeriodo('anio', this.value)" style="padding:6px 10px; border-radius:8px; border:1.5px solid var(--border); background:var(--bg); color:var(--text); font-weight:600; font-size:0.86rem;">
                ${aniosOpts}
              </select>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
              <label for="repSelMes" style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Mes</label>
              <select id="repSelMes" onchange="window.repCambiarPeriodo('mes', this.value)" style="padding:6px 10px; border-radius:8px; border:1.5px solid var(--border); background:var(--bg); color:var(--text); font-weight:600; font-size:0.86rem;">
                ${mesesOpts}
              </select>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
              <label style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Corte</label>
              <div class="fp-segmento" id="repSegQuincena" style="display:inline-flex; border:1.5px solid var(--border); border-radius:8px; overflow:hidden;">
                <button type="button" class="btn-seg active" data-q="todas" onclick="window.repCambiarPeriodo('quincena', 'todas')" style="padding:6px 12px; border:none; background:var(--accent, #2563eb); color:#fff; font-weight:700; font-size:0.8rem; cursor:pointer;">Mes completo</button>
                <button type="button" class="btn-seg" data-q="Q1" onclick="window.repCambiarPeriodo('quincena', 'Q1')" style="padding:6px 12px; border:none; background:transparent; color:var(--text-muted); font-weight:700; font-size:0.8rem; cursor:pointer; border-left:1px solid var(--border);">Q1 (1-15)</button>
                <button type="button" class="btn-seg" data-q="Q2" onclick="window.repCambiarPeriodo('quincena', 'Q2')" style="padding:6px 12px; border:none; background:transparent; color:var(--text-muted); font-weight:700; font-size:0.8rem; cursor:pointer; border-left:1px solid var(--border);">Q2 (16-fin)</button>
              </div>
            </div>
          </div>
          <div id="repPeriodoBadge" style="font-size:0.85rem; font-weight:700; color:var(--accent); background:rgba(37,99,235,0.08); padding:6px 14px; border-radius:8px; border:1px solid rgba(37,99,235,0.2);">
            Cargando periodo...
          </div>
        </div>
      </section>

      <!-- KPIs Globales / Dinámicos -->
      <section id="repKpisResumen" class="rep-kpis-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:12px; margin-bottom:18px;">
        <div style="background:var(--card-bg, #fff); border:1px solid var(--border); border-radius:12px; padding:14px; text-align:center; color:var(--text-muted);">Cargando indicadores...</div>
      </section>

      <!-- Barra de Navegación de Vistas y Filtros en Cascada (Regional -> Operación) -->
      <section class="rep-filtros-bar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
        <div class="rep-vistas-strip" id="repSegVistas">
          <button type="button" class="btn-vista active" data-v="tabla" onclick="window.repCambiarVista('tabla')" style="padding:7px 14px; border:none; background:var(--accent, #2563eb); color:#fff; font-weight:700; font-size:0.82rem; cursor:pointer;">
            📋 Consolidado
          </button>
          <button type="button" class="btn-vista" data-v="ranking" onclick="window.repCambiarVista('ranking')" style="padding:7px 14px; border:none; background:transparent; color:var(--text-muted); font-weight:700; font-size:0.82rem; cursor:pointer; border-left:1px solid var(--border);">
            🏆 Ranking Rotación
          </button>
        </div>

        <div class="rep-filtros-cascada" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:6px;">
            <label for="repFiltroRegional" style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Regional:</label>
            <select id="repFiltroRegional" onchange="window.repFiltrarRegional(this.value)" style="padding:6px 10px; border-radius:8px; border:1.5px solid var(--border); background:var(--bg); color:var(--text); font-size:0.84rem; font-weight:600; max-width:240px;">
              <option value="">Todas las regionales</option>
            </select>
          </div>

          <div style="display:flex; align-items:center; gap:6px;">
            <label for="repFiltroOperacion" style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Operación:</label>
            <select id="repFiltroOperacion" onchange="window.repFiltrarOperacion(this.value)" style="padding:6px 10px; border-radius:8px; border:1.5px solid var(--border); background:var(--bg); color:var(--text); font-size:0.84rem; font-weight:600; min-width:190px; max-width:280px;">
              <option value="">Todas las operaciones</option>
            </select>
          </div>

          <label id="repWrapCheckRetiros" style="display:flex; align-items:center; gap:6px; font-size:0.8rem; font-weight:600; color:var(--text-muted); cursor:pointer; user-select:none;">
            <input type="checkbox" id="repCheckSoloRetiros" onchange="window.repToggleSoloRetiros(this.checked)">
            Solo con retiros
          </label>

          <button type="button" id="btnRepLimpiarFiltros" onclick="window.repLimpiarFiltros()" class="btn btn-outline" style="display:none; padding:4px 10px; font-size:0.76rem; font-weight:700; cursor:pointer;">
            ↺ Ver todo
          </button>
        </div>
      </section>

      <!-- Contenedor del Listado o Tabla de Operaciones -->
      <section id="repContenedorOperaciones" style="display:flex; flex-direction:column; gap:10px;">
        <div style="padding:40px; text-align:center; color:var(--text-muted);">Cargando reporte de operaciones...</div>
      </section>

      <!-- Modal de Evolución Histórica Mensual (Contenedor) -->
      <div id="repModalEvolucionWrap" style="display:none;"></div>
    `;
  }

  window.cargarDatosReportes = async function () {
    const rango = calcularRangoFechas();
    const badgePeriodo = document.getElementById('repPeriodoBadge');
    if (badgePeriodo) badgePeriodo.textContent = `📅 Periodo: ${rango.label}`;

    const contenedor = document.getElementById('repContenedorOperaciones');
    if (contenedor) {
      contenedor.innerHTML = `
        <div style="padding:40px; text-align:center; color:var(--text-muted);">
          <div class="th-admin-spinner" style="width:32px; height:32px; border:3px solid rgba(37,99,235,0.2); border-top-color:#2563eb; border-radius:50%; animation:thSpinAdmin 0.8s linear infinite; margin:0 auto 12px;"></div>
          Consultando indicadores, retiros y rotación del periodo...
        </div>`;
    }

    try {
      const user = obtenerUsuarioActual();
      const url = `/nomina/api/reportes/indicadores-operaciones?usuario=${encodeURIComponent(user)}&fechaDesde=${rango.desde}&fechaHasta=${rango.hasta}`;
      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Error al obtener indicadores');
      }

      _repState.data = json;

      // Prellenar filtros de Regional / Operación según el tipo de acceso del rol
      if (!_repState.filtrosPrellenados) {
        const acc = json.accesoUsuario || {};
        if (!acc.sinFiltro) {
          const opsPermitidas = acc.operacionesFiltro || [];
          if (acc.tipoAcceso === 'operacion' || acc.operacion || opsPermitidas.length === 1) {
            const opTarget = acc.operacion || opsPermitidas[0];
            if (opTarget) {
              _repState.filtroOperacion = opTarget;
              const opObj = (json.operaciones || []).find(o => o.operacion.toLowerCase() === opTarget.toLowerCase());
              if (opObj && opObj.regional) {
                _repState.filtroRegional = opObj.regional;
              } else if (acc.regional) {
                _repState.filtroRegional = acc.regional;
              }
            }
          } else if (acc.tipoAcceso === 'regional' || acc.regional) {
            if (acc.regional) {
              _repState.filtroRegional = acc.regional;
            }
          }
        }
        _repState.filtrosPrellenados = true;
      }

      // Habilitar botón de evolución mensual si tiene permiso
      const btnModal = document.getElementById('btnRepAbrirModal');
      if (btnModal) {
        btnModal.style.display = json.kpisGlobales?.puedeVerHistorico ? 'inline-flex' : 'none';
      }

      actualizarSelectoresCascada();
      renderizarTodo();
    } catch (err) {
      console.error('[Reportes Nomina] Error al cargar:', err);
      if (contenedor) {
        contenedor.innerHTML = `
          <div style="padding:30px; text-align:center; color:var(--danger, #dc2626); background:var(--card-bg); border:1px solid var(--border); border-radius:12px;">
            ⚠️ No se pudieron cargar los indicadores: ${esc(err.message)}
          </div>`;
      }
    }
  };

  /**
   * Actualiza el selector de Regionales y Operaciones incorporando los porcentajes
   * interactivos de Rotación e Ingreso entre paréntesis.
   */
  function actualizarSelectoresCascada() {
    if (!_repState.data) return;
    const operaciones = _repState.data.operaciones || [];

    // Calcular agregados de cada regional (Rotación e Ingreso)
    const mapRegTotales = {};
    operaciones.forEach(o => {
      const reg = o.regional || 'CENTRO';
      if (!mapRegTotales[reg]) {
        mapRegTotales[reg] = { retiros: 0, planta: 0, ingresos: 0 };
      }
      // Usar los valores disponibles
      mapRegTotales[reg].retiros += (o.retiros !== null ? o.retiros : 0);
      mapRegTotales[reg].planta += (o.planta !== null ? o.planta : 0);
      mapRegTotales[reg].ingresos += (o.ingresos !== null ? o.ingresos : 0);
    });

    // 1. Selector de Regionales
    const selReg = document.getElementById('repFiltroRegional');
    if (selReg) {
      const regList = Object.keys(mapRegTotales).sort();
      const regActual = _repState.filtroRegional;

      const optsHtml = ['<option value="">Todas las regionales</option>'];
      regList.forEach(r => {
        const item = mapRegTotales[r];
        const rot = item.planta > 0 ? ((item.retiros / item.planta) * 100).toFixed(1) : '0.0';
        const ing = item.planta > 0 ? ((item.ingresos / item.planta) * 100).toFixed(1) : '0.0';
        const label = `${esc(r)} (Rot: ${rot}% | Ing: ${ing}%)`;
        optsHtml.push(`<option value="${esc(r)}" ${r === regActual ? 'selected' : ''}>${label}</option>`);
      });

      selReg.innerHTML = optsHtml.join('');
    }

    // 2. Selector de Operaciones (filtrado por la Regional seleccionada)
    actualizarSelectorOperaciones();
  }

  function actualizarSelectorOperaciones() {
    const selOp = document.getElementById('repFiltroOperacion');
    if (!selOp || !_repState.data) return;

    let ops = _repState.data.operaciones || [];
    if (_repState.filtroRegional) {
      ops = ops.filter(o => o.regional === _repState.filtroRegional);
    }

    // Ordenar alfabéticamente por nombre de operación
    ops.sort((a, b) => a.operacion.localeCompare(b.operacion));

    const opList = ops.map(o => o.operacion);
    const opActual = _repState.filtroOperacion;

    if (opActual && !opList.includes(opActual)) {
      _repState.filtroOperacion = '';
    }

    const optsHtml = [`<option value="">Todas las operaciones (${ops.length})</option>`];
    ops.forEach(o => {
      const rot = o.pctRotacion !== undefined ? o.pctRotacion : 0;
      const ing = o.pctIngreso !== undefined ? o.pctIngreso : (o.planta > 0 ? ((o.ingresos / o.planta) * 100).toFixed(1) : 0);
      const label = `${esc(o.operacion)} (Rot: ${rot}% | Ing: ${ing}%)`;
      optsHtml.push(`<option value="${esc(o.operacion)}" ${o.operacion === _repState.filtroOperacion ? 'selected' : ''}>${label}</option>`);
    });

    selOp.innerHTML = optsHtml.join('');

    // Botón "Ver todo" visible si hay algún filtro activo
    const btnLimpiar = document.getElementById('btnRepLimpiarFiltros');
    if (btnLimpiar) {
      btnLimpiar.style.display = (_repState.filtroRegional || _repState.filtroOperacion) ? 'inline-block' : 'none';
    }
  }

  function renderizarTodo() {
    renderizarKpis();
    if (_repState.vista === 'tabla') {
      renderizarTablaConsolidada();
    } else {
      renderizarListaOperaciones();
    }
  }

  function obtenerOperacionesFiltradas() {
    if (!_repState.data) return [];
    let lista = [...(_repState.data.operaciones || [])];

    if (_repState.filtroRegional) {
      lista = lista.filter(o => o.regional === _repState.filtroRegional);
    }
    if (_repState.filtroOperacion) {
      lista = lista.filter(o => o.operacion === _repState.filtroOperacion);
    }
    return lista;
  }

  function renderizarKpis() {
    const el = document.getElementById('repKpisResumen');
    if (!el || !_repState.data) return;

    const kGlobal = _repState.data.kpisGlobales || {};
    const params = _repState.data.parametros || {};
    const esCorp = !!kGlobal.esCorporativo;

    const opsFiltradas = obtenerOperacionesFiltradas();
    const hayFiltro = Boolean(_repState.filtroRegional || _repState.filtroOperacion);

    let sumRetiros = 0;
    let sumTempranos = 0;
    let sumIngresos = 0;
    let sumPlanta = 0;
    let sumAvisoPonderado = 0;
    let puedeVerCantidades = esCorp;

    opsFiltradas.forEach(o => {
      if (o.esPropia) puedeVerCantidades = true;
      if (o.retiros !== null) {
        sumRetiros += o.retiros;
        sumTempranos += (o.retirosTempranos || 0);
        sumIngresos += (o.ingresos || 0);
        sumPlanta += (o.planta || 0);
        sumAvisoPonderado += ((o.retrasoAvisoMedioDias || 0) * o.retiros);
      }
    });

    const rotacionDinamica = sumPlanta > 0 ? Number(((sumRetiros / sumPlanta) * 100).toFixed(1)) : 0;
    const tiempoAvisoDinamico = sumRetiros > 0 ? Number((sumAvisoPonderado / sumRetiros).toFixed(1)) : 0;
    const pctFugaDinamico = sumRetiros > 0 ? Number(((sumTempranos / sumRetiros) * 100).toFixed(1)) : 0;

    const rotacionMostrar = hayFiltro ? rotacionDinamica : kGlobal.rotacionMediaGlobal;
    const tiempoAvisoMostrar = hayFiltro ? tiempoAvisoDinamico : kGlobal.tiempoAvisoMedioGlobal;
    const pctFugaMostrar = hayFiltro ? pctFugaDinamico : kGlobal.pctFugaTempranaGlobal;

    const retirosTotalMostrar = hayFiltro ? sumRetiros : (kGlobal.totalesCorporativos ? kGlobal.totalesCorporativos.retirosTotal : sumRetiros);
    const tempranosTotalMostrar = hayFiltro ? sumTempranos : (kGlobal.totalesCorporativos ? kGlobal.totalesCorporativos.retirosTempranosTotal : sumTempranos);
    const ingresosTotalMostrar = hayFiltro ? sumIngresos : (kGlobal.totalesCorporativos ? kGlobal.totalesCorporativos.ingresosTotal : sumIngresos);

    // Semáforo Rotación
    let colorRot = '#16a34a';
    if (rotacionMostrar > (params.Pct_Rotacion_Alerta || 5)) colorRot = '#dc2626';
    else if (rotacionMostrar > 3) colorRot = '#f59e0b';

    // Semáforo Aviso
    let colorAviso = '#16a34a';
    if (tiempoAvisoMostrar > (params.Dias_Aviso_Alerta || 5)) colorAviso = '#dc2626';
    else if (tiempoAvisoMostrar > (params.Dias_Aviso_Oportuno || 2)) colorAviso = '#f59e0b';

    // Semáforo Fuga
    let colorFuga = '#16a34a';
    if (pctFugaMostrar > 30) colorFuga = '#dc2626';
    else if (pctFugaMostrar > 15) colorFuga = '#f59e0b';

    let subtituloFiltro = '';
    if (_repState.filtroOperacion) {
      subtituloFiltro = `<span style="font-size:0.75rem; color:var(--accent); font-weight:700;">📍 ${esc(_repState.filtroOperacion)}</span>`;
    } else if (_repState.filtroRegional) {
      subtituloFiltro = `<span style="font-size:0.75rem; color:var(--accent); font-weight:700;">🗺️ Reg. ${esc(_repState.filtroRegional)} (${opsFiltradas.length} ops)</span>`;
    }

    const subtextoFuga = puedeVerCantidades
      ? `<b>${tempranosTotalMostrar} retiros &lt; 60d</b> de ${retirosTotalMostrar} retiros`
      : `Promedio ponderado del periodo`;

    let htmlBalanceCard = '';
    if (puedeVerCantidades) {
      const balanceNeto = ingresosTotalMostrar - retirosTotalMostrar;
      const balanceColor = balanceNeto >= 0 ? '#16a34a' : '#dc2626';
      const balanceSign = balanceNeto > 0 ? `+${balanceNeto}` : `${balanceNeto}`;
      const plantaFinalCalc = (sumPlanta || 0) + balanceNeto;
      const tituloBalance = hayFiltro ? 'Balance Filtro' : 'Balance Corporativo';

      htmlBalanceCard = `
        <div class="card" style="background:var(--card-bg, #fff); border:1px solid var(--border); border-radius:12px; padding:14px; position:relative; overflow:hidden;">
          <div style="font-size:0.74rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px; display:flex; justify-content:space-between;">
            <span>⚖️ ${tituloBalance}</span>
            ${subtituloFiltro}
          </div>
          <div style="font-size:1.65rem; font-weight:800; color:var(--text); margin-bottom:2px;">
            ${plantaFinalCalc} <span style="font-size:1.05rem; color:${balanceColor}; font-weight:700;">(${balanceSign})</span>
          </div>
          <div style="font-size:0.76rem; color:var(--text-muted);">
            Planta activa final | <b>${ingresosTotalMostrar}</b> ingresos | <b style="color:#dc2626;">${retirosTotalMostrar}</b> retiros
          </div>
          <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">
            <b style="color:#d97706;">${tempranosTotalMostrar}</b> retiros en prueba (&lt;60d)
          </div>
        </div>
      `;
    }

    el.innerHTML = `
      <div class="card" style="background:var(--card-bg, #fff); border:1px solid var(--border); border-radius:12px; padding:14px; position:relative; overflow:hidden;">
        <div style="font-size:0.74rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px; display:flex; justify-content:space-between;">
          <span>📉 Tasa de Rotación Media</span>
          ${subtituloFiltro}
        </div>
        <div style="font-size:1.65rem; font-weight:800; color:${colorRot}; margin-bottom:2px;">
          ${rotacionMostrar}%
        </div>
        <div style="font-size:0.76rem; color:var(--text-muted);">
          ${puedeVerCantidades ? `<b>${retirosTotalMostrar}</b> retiros sobre <b>${sumPlanta || '—'}</b> planta inicial` : 'Porcentaje medio ponderado'}
        </div>
      </div>

      <div class="card" style="background:var(--card-bg, #fff); border:1px solid var(--border); border-radius:12px; padding:14px; position:relative; overflow:hidden;">
        <div style="font-size:0.74rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px; display:flex; justify-content:space-between;">
          <span>⏱️ Oportunidad de Aviso</span>
          ${subtituloFiltro}
        </div>
        <div style="font-size:1.65rem; font-weight:800; color:${colorAviso}; margin-bottom:2px;">
          ${tiempoAvisoMostrar} <span style="font-size:0.95rem; font-weight:600;">días</span>
        </div>
        <div style="font-size:0.76rem; color:var(--text-muted);">
          Meta óptima: &le; ${params.Dias_Aviso_Oportuno || 2} días
        </div>
      </div>

      <div class="card" style="background:var(--card-bg, #fff); border:1px solid var(--border); border-radius:12px; padding:14px; position:relative; overflow:hidden;">
        <div style="font-size:0.74rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px; display:flex; justify-content:space-between;">
          <span>💸 Fuga en Prueba (&lt;60d)</span>
          ${subtituloFiltro}
        </div>
        <div style="font-size:1.65rem; font-weight:800; color:${colorFuga}; margin-bottom:2px;">
          ${pctFugaMostrar}%
        </div>
        <div style="font-size:0.76rem; color:var(--text-muted);">${subtextoFuga}</div>
      </div>

      ${htmlBalanceCard}
    `;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VISTA 1: TABLA CONSOLIDADA POR OPERACIÓN (NUEVA VISTA POR DEFECTO)
  // ──────────────────────────────────────────────────────────────────────────
  function renderizarTablaConsolidada() {
    const contenedor = document.getElementById('repContenedorOperaciones');
    if (!contenedor || !_repState.data) return;

    let lista = obtenerOperacionesFiltradas();

    // Regla de privacidad: en la tabla sólo se muestran las operaciones a las que el rol tiene acceso
    lista = lista.filter(o => o.esPropia);

    // Filtro "Solo con retiros"
    if (_repState.filtroSoloRetiros && !_repState.filtroOperacion) {
      lista = lista.filter(o => (o.retiros || 0) > 0);
    }

    if (lista.length === 0) {
      contenedor.innerHTML = `
        <div style="padding:40px; text-align:center; background:var(--card-bg, #fff); border:1px solid var(--border); border-radius:12px; color:var(--text-muted);">
          No se encontraron operaciones accesibles con los filtros seleccionados.
        </div>`;
      return;
    }

    // Ordenamiento por columna activa
    const col = _repState.ordenColumna;
    const dir = _repState.ordenDir === 'asc' ? 1 : -1;

    lista.sort((a, b) => {
      let va = a[col];
      let vb = b[col];

      if (va === null || va === undefined) va = (typeof vb === 'number' ? -999999 : '');
      if (vb === null || vb === undefined) vb = (typeof va === 'number' ? -999999 : '');

      if (typeof va === 'string') {
        return va.localeCompare(vb) * dir;
      }
      return (va - vb) * dir;
    });

    // Totales de la tabla consolidada
    let totPlanta = 0;
    let totRetiros = 0;
    let totIngresos = 0;
    let totIngresoRetiroPeriodo = 0;
    let totTempranos = 0;
    let sumPondAviso = 0;
    let sumPondPerm = 0;
    let opsConRetiro = 0;

    lista.forEach(o => {
      totPlanta += (o.planta || 0);
      totRetiros += (o.retiros || 0);
      totIngresos += (o.ingresos || 0);
      totIngresoRetiroPeriodo += (o.ingresoRetiroPeriodo || 0);
      totTempranos += (o.retirosTempranos || 0);
      if (o.retiros > 0) {
        sumPondAviso += (o.retrasoAvisoMedioDias * o.retiros);
        if (o.permanenciaMediaDias !== null) {
          sumPondPerm += (o.permanenciaMediaDias * o.retiros);
          opsConRetiro += o.retiros;
        }
      }
    });

    const totBalance = totIngresos - totRetiros;
    const rotGlobal = totPlanta > 0 ? ((totRetiros / totPlanta) * 100).toFixed(1) : '0.0';
    const ingGlobal = totPlanta > 0 ? ((totIngresos / totPlanta) * 100).toFixed(1) : '0.0';
    const fugaGlobal = totRetiros > 0 ? ((totTempranos / totRetiros) * 100).toFixed(1) : '0.0';
    const ingresoRetiroGlobal = totIngresos > 0 ? ((totIngresoRetiroPeriodo / totIngresos) * 100).toFixed(1) : '0.0';
    const avisoGlobal = totRetiros > 0 ? (sumPondAviso / totRetiros).toFixed(1) : '0.0';
    const permGlobal = opsConRetiro > 0 ? Math.round(sumPondPerm / opsConRetiro) : '—';

    // Función para renderizar indicador de ordenamiento
    const sortIcon = c => (_repState.ordenColumna === c ? (_repState.ordenDir === 'asc' ? ' ▲' : ' ▼') : '');

    const rowsHtml = lista.map(o => {
      const pctIng = o.planta > 0 ? ((o.ingresos / o.planta) * 100).toFixed(1) : (o.ingresos > 0 ? '100' : '0.0');
      const bal = o.balance || 0;
      const balClass = bal > 0 ? 'color:#16a34a;' : (bal < 0 ? 'color:#dc2626;' : 'color:var(--text-muted);');
      const balSign = bal > 0 ? `+${bal}` : `${bal}`;
      const plantaFinal = (o.planta || 0) + bal;

      // Semáforo Aviso
      let avisoTag = `<span style="color:var(--text-muted);">-</span>`;
      if (o.retiros > 0) {
        let dot = '🟢';
        if (o.semaforoAviso === 'rojo') dot = '🔴';
        else if (o.semaforoAviso === 'amarillo') dot = '🟡';
        avisoTag = `<span style="font-weight:700;">${dot} ${o.retrasoAvisoMedioDias} d</span>`;
      }

      function indicadorRetiros(cantidad, porcentaje) {
        if (!o.retiros) return `0 <span style="font-size:0.75rem; color:var(--text-muted);">(0.0%)</span>`;
        const color = porcentaje > 30 ? '#dc2626' : (porcentaje > 15 ? '#d97706' : 'var(--text)');
        return `<b>${cantidad}</b> <span style="font-size:0.75rem; color:${color};">(${porcentaje}%)</span>`;
      }

      function indicadorIngresoRetiro(cantidad, porcentaje) {
        if (!cantidad) return `0 <span style="font-size:0.75rem; color:var(--text-muted);">(0.0%)</span>`;
        const color = porcentaje > 30 ? '#dc2626' : (porcentaje > 15 ? '#d97706' : 'var(--text)');
        return `<b>${cantidad}</b> <span style="font-size:0.75rem; color:${color};">(${porcentaje}%)</span>`;
      }

      const ingresoRetiro = o.ingresoRetiroPeriodo || 0;
      const pctIngresoRetiro = o.ingresos > 0 ? ((ingresoRetiro / o.ingresos) * 100).toFixed(1) : (ingresoRetiro > 0 ? '100.0' : '0.0');
      const ingresoRetiroTag = indicadorIngresoRetiro(ingresoRetiro, pctIngresoRetiro);
      const fugaTag = indicadorRetiros(o.retirosTempranos || 0, o.pctTemprano);

      const permTag = o.permanenciaMediaDias !== null ? `${Math.round(o.permanenciaMediaDias)} d` : `<span style="color:var(--text-muted);">-</span>`;

      return `
        <tr>
          <td><span style="font-weight:600; color:var(--text-muted); font-size:0.8rem;">${esc(o.regional)}</span></td>
          <td><b style="color:var(--text);">${esc(o.operacion)}</b></td>
          <td style="text-align:right;"><b>${o.planta || 0}</b></td>
          <td style="text-align:right;">
            <b style="color:#dc2626;">${o.retiros || 0}</b>
            <span style="font-size:0.75rem; color:#dc2626; font-weight:700;">(${o.pctRotacion}%)</span>
          </td>
          <td style="text-align:right;">
            <b style="color:#16a34a;">${o.ingresos || 0}</b>
            <span style="font-size:0.75rem; color:#16a34a; font-weight:700;">(${pctIng}%)</span>
          </td>
          <td style="text-align:right;">
            <b style="color:var(--text);">${plantaFinal}</b>
            <span style="font-size:0.75rem; ${balClass} font-weight:700;">(${balSign})</span>
          </td>
          <td style="text-align:right;">${ingresoRetiroTag}</td>
          <td style="text-align:right;">${fugaTag}</td>
          <td style="text-align:center;">${avisoTag}</td>
          <td style="text-align:center;">${permTag}</td>
        </tr>
      `;
    }).join('');

    const totPlantaFinal = totPlanta + totBalance;
    const balGlobalSign = totBalance > 0 ? `+${totBalance}` : `${totBalance}`;
    const balGlobalColor = totBalance >= 0 ? '#16a34a' : '#dc2626';

    contenedor.innerHTML = `
      <div class="rep-table-wrap">
        <table class="rep-table-custom" id="repTablaConsolidada">
          <thead>
            <tr>
              <th onclick="window.repOrdenarTabla('regional')" style="min-width:140px;">
                Regional${sortIcon('regional')}<div class="rep-resizer"></div>
              </th>
              <th onclick="window.repOrdenarTabla('operacion')" style="min-width:180px;">
                Operación${sortIcon('operacion')}<div class="rep-resizer"></div>
              </th>
              <th onclick="window.repOrdenarTabla('planta')" style="text-align:right; min-width:90px;">
                En Planta${sortIcon('planta')}<div class="rep-resizer"></div>
              </th>
              <th onclick="window.repOrdenarTabla('retiros')" style="text-align:right; min-width:110px;">
                Retiros (%) ${sortIcon('retiros')}<div class="rep-resizer"></div>
              </th>
              <th onclick="window.repOrdenarTabla('ingresos')" style="text-align:right; min-width:110px;">
                Ingresos (%) ${sortIcon('ingresos')}<div class="rep-resizer"></div>
              </th>
              <th onclick="window.repOrdenarTabla('balance')" style="text-align:right; min-width:115px;">
                Balance Neto${sortIcon('balance')}<div class="rep-resizer"></div>
              </th>
              <th onclick="window.repOrdenarTabla('ingresoRetiroPeriodo')" title="Personas que ingresaron en el mes y salieron en este período; porcentaje sobre los ingresos del período" style="text-align:right; min-width:145px;">
                Ingresaron y salieron${sortIcon('ingresoRetiroPeriodo')}<div class="rep-resizer"></div>
              </th>
              <th onclick="window.repOrdenarTabla('retirosTempranos')" style="text-align:right; min-width:125px;">
                Retiros &lt; 60 d${sortIcon('retirosTempranos')}<div class="rep-resizer"></div>
              </th>
              <th onclick="window.repOrdenarTabla('retrasoAvisoMedioDias')" style="text-align:center; min-width:120px;">
                Oportunidad Aviso${sortIcon('retrasoAvisoMedioDias')}<div class="rep-resizer"></div>
              </th>
              <th onclick="window.repOrdenarTabla('permanenciaMediaDias')" style="text-align:center; min-width:120px;">
                Permanencia Media${sortIcon('permanenciaMediaDias')}<div class="rep-resizer"></div>
              </th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2">TOTAL CONSOLIDADO (${lista.length} operaciones)</td>
              <td style="text-align:right;">${totPlanta}</td>
              <td style="text-align:right; color:#dc2626;">${totRetiros} (${rotGlobal}%)</td>
              <td style="text-align:right; color:#16a34a;">${totIngresos} (${ingGlobal}%)</td>
              <td style="text-align:right;">
                <b>${totPlantaFinal}</b>
                <span style="font-size:0.75rem; color:${balGlobalColor}; font-weight:700;">(${balGlobalSign})</span>
              </td>
              <td style="text-align:right;">${totIngresoRetiroPeriodo} (${ingresoRetiroGlobal}%)</td>
              <td style="text-align:right;">${totTempranos} (${fugaGlobal}%)</td>
              <td style="text-align:center;">${avisoGlobal} d</td>
              <td style="text-align:center;">${permGlobal} ${permGlobal !== '—' ? 'd' : ''}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

    inicializarRedimensionColumnas();
  }

  window.repOrdenarTabla = function (columna) {
    if (_repState.ordenColumna === columna) {
      _repState.ordenDir = _repState.ordenDir === 'asc' ? 'desc' : 'asc';
    } else {
      _repState.ordenColumna = columna;
      _repState.ordenDir = (columna === 'operacion' || columna === 'regional') ? 'asc' : 'desc';
    }
    renderizarTablaConsolidada();
  };

  /**
   * Permite achicar y anchar columnas arrastrando el borde derecho del th
   */
  function inicializarRedimensionColumnas() {
    const tabla = document.getElementById('repTablaConsolidada');
    if (!tabla) return;

    const resizers = tabla.querySelectorAll('.rep-resizer');
    resizers.forEach(resizer => {
      let startX, startWidth, th;

      const onMouseDown = function (e) {
        e.stopPropagation();
        th = resizer.parentElement;
        startX = e.pageX;
        startWidth = th.offsetWidth;
        resizer.classList.add('resizing');

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };

      const onMouseMove = function (e) {
        if (!th) return;
        const width = startWidth + (e.pageX - startX);
        if (width > 50) {
          th.style.width = width + 'px';
          th.style.minWidth = width + 'px';
        }
      };

      const onMouseUp = function () {
        if (resizer) resizer.classList.remove('resizing');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      resizer.addEventListener('mousedown', onMouseDown);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VISTA DE RANKING: TARJETAS POR OPERACIÓN
  // ──────────────────────────────────────────────────────────────────────────
  function renderizarListaOperaciones() {
    const contenedor = document.getElementById('repContenedorOperaciones');
    if (!contenedor || !_repState.data) return;

    let lista = obtenerOperacionesFiltradas();

    // Filtro "Solo con retiros"
    if (_repState.filtroSoloRetiros && !_repState.filtroOperacion) {
      lista = lista.filter(o => o.pctRotacion > 0 || (o.retiros !== null ? o.retiros > 0 : false));
    }

    lista.sort((a, b) => b.pctRotacion - a.pctRotacion);

    if (lista.length === 0) {
      contenedor.innerHTML = `
        <div style="padding:40px; text-align:center; background:var(--card-bg, #fff); border:1px solid var(--border); border-radius:12px; color:var(--text-muted);">
          No se encontraron operaciones con los filtros seleccionados.
        </div>`;
      return;
    }

    const cardsHtml = lista.map((op, idx) => {
      return renderFilaOperacion(op, idx + 1);
    }).join('');

    contenedor.innerHTML = cardsHtml;
  }

  function renderFilaOperacion(op, posVisual) {
    const esPropia = !!op.esPropia;
    const esCorp = !!(_repState.data?.kpisGlobales?.esCorporativo);

    let badgeAvisoText = `🟢 ${op.retrasoAvisoMedioDias} d (Oportuno)`;
    if (op.semaforoAviso === 'rojo') {
      badgeAvisoText = `🔴 ${op.retrasoAvisoMedioDias} d (Extemporáneo)`;
    } else if (op.semaforoAviso === 'amarillo') {
      badgeAvisoText = `🟡 ${op.retrasoAvisoMedioDias} d (Alerta)`;
    }

    let badgeFugaText = `🟢 ${op.pctTemprano}% fuga &lt;60d`;
    if (op.semaforoFuga === 'rojo') {
      badgeFugaText = `🔴 ${op.pctTemprano}% fuga &lt;60d (Crítico)`;
    } else if (op.semaforoFuga === 'amarillo') {
      badgeFugaText = `🟡 ${op.pctTemprano}% fuga &lt;60d (Alerta)`;
    }

    const anchoBarra = Math.min(100, Math.round((op.pctRotacion / 40) * 100));
    const colorBarra = op.pctRotacion > 10 ? '#dc2626' : (op.pctRotacion > 5 ? '#f59e0b' : '#16a34a');

    let seccionCantidades = '';
    if (esPropia) {
      const balanceSign = (op.balance || 0) > 0 ? `+${op.balance}` : op.balance;
      const balanceColor = (op.balance || 0) >= 0 ? '#16a34a' : '#dc2626';

      seccionCantidades = `
        <div style="display:flex; flex-wrap:wrap; align-items:center; gap:16px; margin-top:10px; padding-top:10px; border-top:1px dashed var(--border); font-size:0.83rem;">
          <div><span style="color:var(--text-muted);">Planta activa:</span> <b>${op.planta}</b></div>
          <div><span style="color:var(--text-muted);">Retiros:</span> <b style="color:#dc2626;">${op.retiros}</b></div>
          <div><span style="color:var(--text-muted);">Ingresos:</span> <b style="color:#16a34a;">${op.ingresos}</b></div>
          <div><span style="color:var(--text-muted);">Balance neto:</span> <b style="color:${balanceColor};">${balanceSign}</b></div>
          <div><span style="color:var(--text-muted);">Retiros &lt; 60 días:</span> <b style="color:#d97706;">${op.retirosTempranos}</b></div>
          ${op.permanenciaMediaDias !== null ? `<div><span style="color:var(--text-muted);">Permanencia media:</span> <b>${op.permanenciaMediaDias} días</b></div>` : ''}
        </div>
      `;
    } else {
      seccionCantidades = `
        <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; margin-top:10px; padding-top:10px; border-top:1px dashed var(--border); font-size:0.8rem; color:var(--text-muted);">
          <div style="display:flex; align-items:center; gap:12px;">
            <span>Planta: <b>***</b></span>
            <span>Retiros: <b>***</b></span>
            <span>Ingresos: <b>***</b></span>
            <span>Balance: <b>***</b></span>
          </div>
          <span style="font-size:0.75rem; font-style:italic;">🔒 Cantidades absolutas reservadas para la operación asignada</span>
        </div>
      `;
    }

    let seccionMotivos = '';
    if (op.motivos && op.motivos.length > 0) {
      const itemsMotivos = op.motivos.slice(0, 4).map(m => {
        const detalle = m.cantidad !== undefined ? `${m.cantidad} (${Math.round((m.cantidad / (op.retiros || 1)) * 100)}%)` : `${m.porcentaje}%`;
        return `<span style="background:var(--bg, #f1f5f9); padding:3px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; color:var(--text);">
          ${esc(m.motivo)}: <span style="color:var(--accent);">${detalle}</span>
        </span>`;
      }).join(' ');

      seccionMotivos = `
        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-top:8px;">
          <span style="font-size:0.74rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Motivos frecuentes:</span>
          ${itemsMotivos}
        </div>
      `;
    }

    const badgePropia = esPropia && !esCorp ? `<span style="background:rgba(37,99,235,0.1); color:#2563eb; font-size:0.72rem; font-weight:800; padding:2px 8px; border-radius:6px; text-transform:uppercase;">Tu Operación</span>` : '';

    return `
      <div class="card rep-op-card" style="background:var(--card-bg, #fff); border:1px solid var(--border); border-radius:12px; padding:14px 16px; transition:transform 0.15s, box-shadow 0.15s;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:1.15rem; font-weight:800; color:var(--text-muted); font-family:monospace; min-width:28px;">#${posVisual}</span>
            <div>
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <h3 style="font-size:1.02rem; font-weight:700; color:var(--text); margin:0;">${esc(op.operacion)}</h3>
                <span style="background:var(--bg-elevated, #e2e8f0); color:var(--text-muted); font-size:0.74rem; font-weight:700; padding:2px 7px; border-radius:5px;">${esc(op.regional)}</span>
                ${badgePropia}
              </div>
              <div style="font-size:0.78rem; color:var(--text-muted); margin-top:3px;">
                Motivo predominante: <b style="color:var(--text);">${esc(op.motivoPrincipal)}</b>
              </div>
            </div>
          </div>

          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="font-size:0.76rem; font-weight:700; padding:4px 9px; border-radius:7px; border:1px solid var(--border); background:var(--bg);">
              ${badgeAvisoText}
            </span>
            <span style="font-size:0.76rem; font-weight:700; padding:4px 9px; border-radius:7px; border:1px solid var(--border); background:var(--bg);">
              ${badgeFugaText}
            </span>
            <div style="text-align:right; min-width:85px;">
              <span style="font-size:1.25rem; font-weight:800; color:${colorBarra};">${op.pctRotacion}%</span>
              <div style="font-size:0.68rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Rotación</div>
            </div>
          </div>
        </div>

        <div style="width:100%; height:6px; background:var(--bg-elevated, #e2e8f0); border-radius:3px; margin-top:10px; overflow:hidden;">
          <div style="width:${anchoBarra}%; height:100%; background:${colorBarra}; border-radius:3px; transition:width 0.4s ease;"></div>
        </div>

        ${seccionCantidades}
        ${seccionMotivos}
      </div>
    `;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VENTANA EMERGENTE (MODAL): EVOLUCIÓN HISTÓRICA MENSUAL
  // ──────────────────────────────────────────────────────────────────────────
  window.repAbrirModalEvolucion = function () {
    const wrap = document.getElementById('repModalEvolucionWrap');
    if (!wrap) return;

    _repState.modalHist.abierto = true;
    _repState.modalHist.anio = _repState.anio;
    _repState.modalHist.regional = _repState.filtroRegional;
    _repState.modalHist.operacion = _repState.filtroOperacion;

    // Si aún no hay filtro fijado y el rol tiene restricción por Operación o Regional, prellenarlo
    const acc = (_repState.data && _repState.data.accesoUsuario) || {};
    if (!acc.sinFiltro) {
      if (!_repState.modalHist.operacion && (acc.tipoAcceso === 'operacion' || acc.operacion || (acc.operacionesFiltro && acc.operacionesFiltro.length === 1))) {
        _repState.modalHist.operacion = acc.operacion || acc.operacionesFiltro[0];
        if (acc.regional && !_repState.modalHist.regional) {
          _repState.modalHist.regional = acc.regional;
        }
      } else if (!_repState.modalHist.regional && (acc.tipoAcceso === 'regional' || acc.regional)) {
        _repState.modalHist.regional = acc.regional;
      }
    }

    wrap.style.display = 'block';
    renderizarEstructuraModal();
    cargarDatosModalEvolucion();
  };

  window.repCerrarModalEvolucion = function () {
    const wrap = document.getElementById('repModalEvolucionWrap');
    if (wrap) wrap.style.display = 'none';
    _repState.modalHist.abierto = false;
  };

  function renderizarEstructuraModal() {
    const wrap = document.getElementById('repModalEvolucionWrap');
    if (!wrap) return;

    const anioActual = new Date().getFullYear();
    const aniosOpts = [anioActual, anioActual - 1, anioActual - 2]
      .map(y => `<option value="${y}" ${y === _repState.modalHist.anio ? 'selected' : ''}>${y}</option>`)
      .join('');

    wrap.innerHTML = `
      <div class="rep-modal-backdrop" onclick="if(event.target === this) window.repCerrarModalEvolucion()">
        <div class="rep-modal-dialog">
          <!-- Encabezado Modal -->
          <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--bg-elevated, #f8fafc);">
            <div>
              <h2 style="margin:0; font-size:1.18rem; font-weight:800; color:var(--text); display:flex; align-items:center; gap:8px;">
                <span>📈</span> Evolución Mensual - Planta, Ingresos y Retiros
              </h2>
              <p style="margin:2px 0 0 0; font-size:0.78rem; color:var(--text-muted);">
                Comportamiento mes a mes agrupado por año con conteo de planta, altas, bajas y fuga temprana.
              </p>
            </div>
            <button type="button" onclick="window.repCerrarModalEvolucion()" style="background:transparent; border:none; font-size:1.4rem; color:var(--text-muted); cursor:pointer; line-height:1; padding:4px 8px; border-radius:6px;">
              ✕
            </button>
          </div>

          <!-- Filtros de la Evolución Mensual (Año, Regional, Operación) -->
          <div style="padding:12px 20px; border-bottom:1px solid var(--border); background:var(--card-bg, #fff); display:flex; flex-wrap:wrap; align-items:center; gap:12px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <label for="repModSelAnio" style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Año:</label>
              <select id="repModSelAnio" onchange="window.repModCambiarAnio(this.value)" style="padding:5px 10px; border-radius:7px; border:1.5px solid var(--border); background:var(--bg); color:var(--text); font-weight:600; font-size:0.84rem;">
                ${aniosOpts}
              </select>
            </div>

            <div style="display:flex; align-items:center; gap:6px;">
              <label for="repModSelRegional" style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Regional:</label>
              <select id="repModSelRegional" onchange="window.repModCambiarRegional(this.value)" style="padding:5px 10px; border-radius:7px; border:1.5px solid var(--border); background:var(--bg); color:var(--text); font-weight:600; font-size:0.84rem; max-width:220px;">
                <option value="">Todas las regionales</option>
              </select>
            </div>

            <div style="display:flex; align-items:center; gap:6px;">
              <label for="repModSelOperacion" style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Operación:</label>
              <select id="repModSelOperacion" onchange="window.repModCambiarOperacion(this.value)" style="padding:5px 10px; border-radius:7px; border:1.5px solid var(--border); background:var(--bg); color:var(--text); font-weight:600; font-size:0.84rem; min-width:180px; max-width:260px;">
                <option value="">Todas las operaciones</option>
              </select>
            </div>

            <button type="button" class="btn btn-outline" onclick="window.cargarDatosModalEvolucion()" style="padding:5px 12px; font-size:0.8rem; font-weight:700; cursor:pointer;">
              🔄 Consultar
            </button>
          </div>

          <!-- Cuerpo con Tabla de Meses -->
          <div id="repModCuerpoTabla" style="padding:16px 20px; overflow-y:auto; flex:1;">
            <div style="padding:40px; text-align:center; color:var(--text-muted);">
              Cargando evolución histórica anual...
            </div>
          </div>
        </div>
      </div>
    `;
  }

  window.cargarDatosModalEvolucion = async function () {
    const cuerpo = document.getElementById('repModCuerpoTabla');
    if (!cuerpo) return;

    cuerpo.innerHTML = `
      <div style="padding:40px; text-align:center; color:var(--text-muted);">
        <div class="th-admin-spinner" style="width:28px; height:28px; border:3px solid rgba(37,99,235,0.2); border-top-color:#2563eb; border-radius:50%; animation:thSpinAdmin 0.8s linear infinite; margin:0 auto 10px;"></div>
        Calculando planta activa, ingresos y retiros de cada mes...
      </div>`;

    try {
      const user = obtenerUsuarioActual();
      const anio = _repState.modalHist.anio;
      const reg = _repState.modalHist.regional;
      const op = _repState.modalHist.operacion;

      let url = `/nomina/api/reportes/evolucion-mensual?usuario=${encodeURIComponent(user)}&anio=${anio}`;
      if (reg) url += `&regional=${encodeURIComponent(reg)}`;
      if (op) url += `&operacion=${encodeURIComponent(op)}`;

      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Error al obtener la evolución mensual');
      }

      _repState.modalHist.data = json;
      actualizarFiltrosModalCatalogo(json.catalogo || []);
      renderizarTablaEvolucionModal(json);
    } catch (err) {
      console.error('[Modal Evolucion] Error:', err);
      cuerpo.innerHTML = `
        <div style="padding:30px; text-align:center; color:var(--danger, #dc2626);">
          ⚠️ Error al cargar la evolución mensual: ${esc(err.message)}
        </div>`;
    }
  };

  function actualizarFiltrosModalCatalogo(catalogo) {
    const selReg = document.getElementById('repModSelRegional');
    const selOp = document.getElementById('repModSelOperacion');
    if (!selReg || !selOp) return;

    const acc = (_repState.modalHist.data && _repState.modalHist.data.accesoUsuario) || (_repState.data && _repState.data.accesoUsuario) || {};

    // Si aún no hay filtro fijado en el modal y el rol tiene restricción por Operación o Regional, prellenar
    if (!_repState.modalHist.regional && !_repState.modalHist.operacion && !acc.sinFiltro) {
      if (acc.tipoAcceso === 'operacion' || acc.operacion || (acc.operacionesFiltro && acc.operacionesFiltro.length === 1)) {
        const opTarget = acc.operacion || acc.operacionesFiltro[0];
        if (opTarget) {
          _repState.modalHist.operacion = opTarget;
          const matchCat = catalogo.find(c => c.operacion.toLowerCase() === opTarget.toLowerCase());
          if (matchCat && matchCat.regional) {
            _repState.modalHist.regional = matchCat.regional;
          } else if (acc.regional) {
            _repState.modalHist.regional = acc.regional;
          }
        }
      } else if (acc.tipoAcceso === 'regional' || acc.regional) {
        if (acc.regional) {
          _repState.modalHist.regional = acc.regional;
        }
      }
    }

    // 1. Regionales
    const regSet = new Set();
    catalogo.forEach(c => { if (c.regional) regSet.add(c.regional); });
    const regList = Array.from(regSet).sort();

    const regActual = _repState.modalHist.regional;
    selReg.innerHTML = '<option value="">Todas las regionales</option>' +
      regList.map(r => `<option value="${esc(r)}" ${r === regActual ? 'selected' : ''}>${esc(r)}</option>`).join('');

    // 2. Operaciones
    let ops = catalogo;
    if (_repState.modalHist.regional) {
      ops = ops.filter(c => c.regional === _repState.modalHist.regional);
    }
    const opList = Array.from(new Set(ops.map(c => c.operacion))).sort();
    const opActual = _repState.modalHist.operacion;

    selOp.innerHTML = `<option value="">Todas las operaciones (${opList.length})</option>` +
      opList.map(o => `<option value="${esc(o)}" ${o === opActual ? 'selected' : ''}>${esc(o)}</option>`).join('');
  }

  function renderizarTablaEvolucionModal(data) {
    const cuerpo = document.getElementById('repModCuerpoTabla');
    if (!cuerpo) return;

    const meses = data.meses || [];
    const totales = data.totalesAnio || {};

    const rowsHtml = meses.map(m => {
      if (m.esFuturo) {
        return `
          <tr style="opacity:0.55;">
            <td>
              <span style="color:var(--text-muted);">${esc(m.mes)}</span>
              <span style="font-size:0.7rem; color:var(--text-muted); font-style:italic; margin-left:4px;">(Próximo)</span>
            </td>
            <td style="text-align:right; color:var(--text-muted);">—</td>
            <td style="text-align:right; color:var(--text-muted);">—</td>
            <td style="text-align:right; color:var(--text-muted);">—</td>
            <td style="text-align:right; color:var(--text-muted);">—</td>
            <td style="text-align:right; color:var(--text-muted);">—</td>
            <td style="text-align:right; color:var(--text-muted);">—</td>
            <td style="text-align:right; color:var(--text-muted);">—</td>
          </tr>
        `;
      }

      const bal = m.balance;
      const balClass = bal > 0 ? 'color:#16a34a;' : (bal < 0 ? 'color:#dc2626;' : 'color:var(--text-muted);');
      const balSign = bal > 0 ? `+${bal}` : `${bal}`;
      const plantaFinalMes = m.planta + bal;
      const rotClass = m.pctRotacion > 10 ? 'color:#dc2626; font-weight:800;' : (m.pctRotacion > 5 ? 'color:#f59e0b; font-weight:700;' : 'color:#16a34a;');
      const fugaClass = m.pctFuga > 30 ? 'color:#dc2626; font-weight:800;' : (m.pctFuga > 15 ? 'color:#d97706; font-weight:700;' : 'color:var(--text-muted);');
      const irClass = m.pctIngresoRetiro > 30 ? 'color:#dc2626; font-weight:800;' : (m.pctIngresoRetiro > 15 ? 'color:#d97706; font-weight:700;' : 'color:var(--text-muted);');
      const badgeCurso = m.esMesEnCurso ? `<span style="font-size:0.68rem; background:rgba(37,99,235,0.1); color:#2563eb; font-weight:700; padding:1px 5px; border-radius:4px; margin-left:4px;">En curso</span>` : '';

      return `
        <tr>
          <td><b style="color:var(--text);">${esc(m.mes)}</b>${badgeCurso}</td>
          <td style="text-align:right;"><b>${m.planta}</b></td>
          <td style="text-align:right; color:#16a34a; font-weight:700;">${m.ingresos}</td>
          <td style="text-align:right; color:#dc2626; font-weight:700;">${m.retiros}</td>
          <td style="text-align:right;">
            <b style="color:var(--text);">${plantaFinalMes}</b> <span style="font-size:0.75rem; ${balClass} font-weight:700;">(${balSign})</span>
          </td>
          <td style="text-align:right;">
            <b>${m.ingresoRetiro || 0}</b> <span style="font-size:0.75rem; ${irClass}">(${m.pctIngresoRetiro || 0}%)</span>
          </td>
          <td style="text-align:right;">
            <b>${m.retirosTempranos}</b> <span style="font-size:0.75rem; ${fugaClass}">(${m.pctFuga}%)</span>
          </td>
          <td style="text-align:right; ${rotClass}">${m.pctRotacion}%</td>
        </tr>
      `;
    }).join('');

    const balTotSign = (totales.balanceNeto || 0) > 0 ? `+${totales.balanceNeto}` : `${totales.balanceNeto || 0}`;
    const balTotColor = (totales.balanceNeto || 0) >= 0 ? '#16a34a' : '#dc2626';

    cuerpo.innerHTML = `
      <div class="rep-table-wrap">
        <table class="rep-table-custom">
          <thead>
            <tr>
              <th style="min-width:110px;">Mes</th>
              <th style="text-align:right; min-width:95px;">En Planta</th>
              <th style="text-align:right; min-width:90px;">Ingresos</th>
              <th style="text-align:right; min-width:90px;">Retiros</th>
              <th style="text-align:right; min-width:115px;">Balance</th>
              <th style="text-align:right; min-width:145px;" title="Personas que ingresaron en el mes y salieron en el mismo mes; porcentaje sobre los ingresos del mes">Ingresaron y salieron</th>
              <th style="text-align:right; min-width:130px;">Retiros &lt; 60 días</th>
              <th style="text-align:right; min-width:105px;">Rotación %</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td>TOTAL AÑO ${data.anio}</td>
              <td style="text-align:right;">—</td>
              <td style="text-align:right; color:#16a34a;">${totales.totalIngresos || 0}</td>
              <td style="text-align:right; color:#dc2626;">${totales.totalRetiros || 0}</td>
              <td style="text-align:right; color:${balTotColor}; font-weight:800;">${balTotSign}</td>
              <td style="text-align:right;">${totales.totalIngresoRetiro || 0} (${totales.pctIngresoRetiroMedia || 0}%)</td>
              <td style="text-align:right;">${totales.totalTempranos || 0} (${totales.pctFugaMedia || 0}%)</td>
              <td style="text-align:right;">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  window.repModCambiarAnio = function (anio) {
    _repState.modalHist.anio = parseInt(anio, 10);
    cargarDatosModalEvolucion();
  };

  window.repModCambiarRegional = function (reg) {
    _repState.modalHist.regional = reg;
    _repState.modalHist.operacion = '';
    cargarDatosModalEvolucion();
  };

  window.repModCambiarOperacion = function (op) {
    _repState.modalHist.operacion = op;
    cargarDatosModalEvolucion();
  };

  // ──────────────────────────────────────────────────────────────────────────
  // CONTROLADORES GLOBALES DE FILTROS Y EVENTOS
  // ──────────────────────────────────────────────────────────────────────────
  window.repCambiarPeriodo = function (tipo, valor) {
    if (tipo === 'anio') _repState.anio = parseInt(valor, 10);
    if (tipo === 'mes') _repState.mes = parseInt(valor, 10);
    if (tipo === 'quincena') {
      _repState.quincena = valor;
      const btns = document.querySelectorAll('#repSegQuincena .btn-seg');
      btns.forEach(b => {
        const act = b.getAttribute('data-q') === valor;
        b.style.background = act ? 'var(--accent, #2563eb)' : 'transparent';
        b.style.color = act ? '#fff' : 'var(--text-muted)';
      });
    }
    cargarDatosReportes();
  };

  window.repCambiarVista = function (vista) {
    _repState.vista = vista;
    const btns = document.querySelectorAll('#repSegVistas .btn-vista');
    btns.forEach(b => {
      const act = b.getAttribute('data-v') === vista;
      b.style.background = act ? 'var(--accent, #2563eb)' : 'transparent';
      b.style.color = act ? '#fff' : 'var(--text-muted)';
    });

    // Ocultar checkbox de retiros en tabla consolidada para evitar confusión
    const chkWrap = document.getElementById('repWrapCheckRetiros');
    if (chkWrap) chkWrap.style.display = (vista === 'tabla') ? 'none' : 'flex';

    if (vista === 'tabla') {
      renderizarTablaConsolidada();
    } else {
      renderizarListaOperaciones();
    }
  };

  window.repFiltrarRegional = function (reg) {
    _repState.filtroRegional = reg;
    actualizarSelectorOperaciones();
    renderizarTodo();
  };

  window.repFiltrarOperacion = function (op) {
    _repState.filtroOperacion = op;
    const btnLimpiar = document.getElementById('btnRepLimpiarFiltros');
    if (btnLimpiar) {
      btnLimpiar.style.display = (_repState.filtroRegional || _repState.filtroOperacion) ? 'inline-block' : 'none';
    }
    renderizarTodo();
  };

  window.repLimpiarFiltros = function () {
    _repState.filtroRegional = '';
    _repState.filtroOperacion = '';
    const selReg = document.getElementById('repFiltroRegional');
    if (selReg) selReg.value = '';
    actualizarSelectorOperaciones();
    renderizarTodo();
  };

  window.repToggleSoloRetiros = function (checked) {
    _repState.filtroSoloRetiros = checked;
    if (_repState.vista === 'tabla') {
      renderizarTablaConsolidada();
    } else {
      renderizarListaOperaciones();
    }
  };

  if (typeof _tabActual !== 'undefined' && _tabActual === 'reportes') window.inicializarReportesIndicadores();
})();
