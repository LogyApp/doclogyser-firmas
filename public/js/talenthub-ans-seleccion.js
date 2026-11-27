/**
 * talenthub-ans-seleccion.js
 * Módulo de Monitoreo y Reporte de Cumplimiento ANS Selección (TalentHub)
 * Filtros por Año, Mes y Quincena, conteos dinámicos en filtros, columnas redimensionables
 * y ordenamiento interactivo por columnas.
 */
(function () {
  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;

  let _ansState = {
    anio: anioActual,
    mes: mesActual,
    quincena: 'todas', // 'todas' | 'Q1' | 'Q2'
    desde: '',
    hasta: '',
    regional: '',
    operacion: '',
    responsable: '',
    vistaActiva: 'responsables', // 'responsables' | 'requisiciones'
    filtroBusqueda: '',
    ordenColumna: 'totalRequisiciones',
    ordenAsc: false,
    ordenReqCol: 'fechaRequisicion',
    ordenReqAsc: false,
    filtroCumplimientoReq: 'todos',
    data: null,
    cargando: false
  };

  let _reqExpandida = null;
  let _ansReqLimiteRender = 80;

  const NOMBRES_MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const $ = id => document.getElementById(id);
  const esc = valor => String(valor == null ? '' : valor).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function obtenerUsuarioActual() {
    if (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.usuarioId) return CONFIG.usuarioId;
    if (window.CONFIG && window.CONFIG.usuarioId) return window.CONFIG.usuarioId;
    try {
      const urlUser = new URLSearchParams(window.location.search).get('usuario');
      if (urlUser) return urlUser;
    } catch (_) {}
    return '';
  }

  function calcularRangoFechasAns() {
    const a = _ansState.anio;
    const m = _ansState.mes;

    let desde = '';
    let hasta = '';
    let label = '';

    if (a === 'todos' || !a) {
      desde = '';
      hasta = '';
      label = 'Histórico completo (Todos los años)';
    } else if (m === 'todos' || !m) {
      desde = `${a}-01-01`;
      hasta = `${a}-12-31`;
      label = `Año ${a} completo`;
    } else {
      const mesNum = parseInt(m, 10);
      const mesStr = String(mesNum).padStart(2, '0');
      const ultimoDia = new Date(Number(a), mesNum, 0).getDate();
      desde = `${a}-${mesStr}-01`;
      hasta = `${a}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`;
      label = `${NOMBRES_MESES[mesNum - 1]} ${a}`;
    }

    _ansState.desde = desde;
    _ansState.hasta = hasta;
    return { desde, hasta, label };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // INICIALIZACIÓN DE LA PESTAÑA
  // ──────────────────────────────────────────────────────────────────────────
  window.inicializarAnsSeleccion = function () {
    const panel = $('tabContentAnsSeleccion');
    if (!panel) return;

    if (!panel.dataset.inicializado) {
      calcularRangoFechasAns();
      inyectarEstilosAns();
      renderizarEstructuraBase(panel);
      panel.dataset.inicializado = '1';
    }

    cargarDatosAns();
  };

  window.recargarAnsSeleccion = function () {
    cargarDatosAns();
  };

  // ──────────────────────────────────────────────────────────────────────────
  // ESTILOS CSS DEL MÓDULO
  // ──────────────────────────────────────────────────────────────────────────
  function inyectarEstilosAns() {
    if (document.getElementById('ans-seleccion-styles')) return;
    const style = document.createElement('style');
    style.id = 'ans-seleccion-styles';
    style.textContent = `
      .ans-mini-stat {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 9px 12px;
        border: 1px solid var(--border);
        background-color: var(--card-bg, #fff);
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        min-width: 140px;
        overflow: hidden;
      }
      .ans-mini-stat-icon {
        font-size: 1.25rem;
        flex-shrink: 0;
      }
      .ans-mini-stat-info {
        display: flex;
        flex-direction: column;
        line-height: 1.2;
        flex: 1;
        min-width: 0;
      }
      .ans-mini-stat-lbl {
        color: var(--text-muted);
        font-weight: 600;
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 4px;
      }
      .ans-mini-stat-val {
        font-weight: 800;
        font-size: 1.15rem;
        margin: 1px 0;
        white-space: nowrap;
      }
      .ans-mini-stat-sub {
        font-size: 0.72rem;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .ans-tabs-nav {
        display: flex;
        gap: 6px;
        border-bottom: 1.5px solid var(--border);
        margin-bottom: 14px;
        overflow-x: auto;
      }
      .ans-tab-btn {
        background: transparent;
        border: none;
        border-bottom: 2.5px solid transparent;
        padding: 8px 14px;
        font-size: 0.84rem;
        font-weight: 600;
        color: var(--text-muted);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
        transition: all 0.15s ease;
      }
      .ans-tab-btn:hover {
        color: var(--text);
      }
      .ans-tab-btn.activa {
        color: var(--accent, #2563eb);
        border-bottom-color: var(--accent, #2563eb);
        font-weight: 700;
      }

      .ans-table-wrap {
        overflow-x: auto;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--card-bg, #fff);
        margin-bottom: 20px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.02);
      }
      .ans-table-custom {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.83rem;
        text-align: left;
      }
      .ans-table-custom th {
        background: var(--bg-elevated, #f8fafc);
        color: var(--text-muted);
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        padding: 9px 12px;
        border-bottom: 1px solid var(--border);
        white-space: nowrap;
        cursor: pointer;
        user-select: none;
        position: relative;
      }
      .ans-table-custom th:hover {
        color: var(--text);
        background: rgba(0,0,0,0.03);
      }
      .ans-table-custom td {
        padding: 9px 12px;
        border-bottom: 1px solid var(--border);
        color: var(--text);
        white-space: nowrap;
      }
      .ans-table-custom tr:hover td {
        background-color: var(--bg-hover, rgba(0,0,0,0.015));
      }
      .ans-table-custom tfoot td {
        background: var(--bg-elevated, #f8fafc);
        font-weight: 800;
        border-top: 2px solid var(--border);
      }

      .col-resizer {
        position: absolute;
        top: 0;
        right: 0;
        width: 7px;
        cursor: col-resize;
        user-select: none;
        height: 100%;
        z-index: 10;
      }
      .col-resizer:hover, .col-resizer.resizing {
        background: var(--accent, #2563eb);
        opacity: 0.6;
      }

      .ans-badge-status {
        display: inline-flex;
        align-items: center;
        padding: 2px 7px;
        border-radius: 5px;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.2px;
      }
      .ans-badge-cumple {
        background: rgba(22, 163, 74, 0.12);
        color: #16a34a;
      }
      .ans-badge-nocumple {
        background: rgba(220, 38, 38, 0.12);
        color: #dc2626;
      }
      .ans-badge-proceso {
        background: rgba(37, 99, 235, 0.12);
        color: #2563eb;
      }
      .ans-badge-suspendida {
        background: rgba(217, 119, 6, 0.12);
        color: #d97706;
      }
      .ans-badge-cancelada {
        background: rgba(100, 116, 139, 0.12);
        color: #64748b;
      }

      @media (max-width: 768px) {
        .ans-mini-stat {
          padding: 6px 10px !important;
          gap: 6px !important;
          min-width: 0 !important;
        }
        .ans-mini-stat-icon { font-size: 1.05rem !important; }
        .ans-mini-stat-val { font-size: 1rem !important; }
        .ans-mini-stat-sub { font-size: 0.68rem !important; }
      }
    `;
    document.head.appendChild(style);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ESTRUCTURA BASE DEL PANEL (Sin fila redundante de título/sincronizar)
  // ──────────────────────────────────────────────────────────────────────────
  function renderizarEstructuraBase(panel) {
    const rango = calcularRangoFechasAns();

    const aniosDisponibles = [anioActual, anioActual - 1, anioActual - 2, anioActual - 3];
    const aniosOpts = `<option value="todos" ${_ansState.anio === 'todos' ? 'selected' : ''}>Todos los años</option>` +
      aniosDisponibles.map(y => `<option value="${y}" ${String(y) === String(_ansState.anio) ? 'selected' : ''}>${y}</option>`).join('');

    const mesesOpts = `<option value="todos" ${_ansState.mes === 'todos' ? 'selected' : ''}>Todos los meses</option>` +
      NOMBRES_MESES.map((nom, idx) => {
        const num = idx + 1;
        return `<option value="${num}" ${String(num) === String(_ansState.mes) ? 'selected' : ''}>${nom}</option>`;
      }).join('');

    panel.innerHTML = `
      <!-- Barra de Filtros: Año, Mes, Quincena, Regional, Operación, Responsable -->
      <section class="card" style="padding:14px 16px; border:1px solid var(--border); border-radius:10px; background:var(--card-bg, #fff); margin-bottom:14px;">
        <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px;">
          <!-- Controles de Periodo -->
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:10px;">
            <div style="display:flex; flex-direction:column; gap:3px;">
              <label for="ansSelAnio" style="font-size:0.73rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Año</label>
              <select id="ansSelAnio" onchange="window.ansCambiarPeriodo('anio', this.value)" style="padding:5px 9px; border-radius:7px; border:1.5px solid var(--border); background:var(--bg); color:var(--text); font-weight:600; font-size:0.84rem; cursor:pointer;">
                ${aniosOpts}
              </select>
            </div>

            <div style="display:flex; flex-direction:column; gap:3px;">
              <label for="ansSelMes" style="font-size:0.73rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Mes</label>
              <select id="ansSelMes" onchange="window.ansCambiarPeriodo('mes', this.value)" style="padding:5px 9px; border-radius:7px; border:1.5px solid var(--border); background:var(--bg); color:var(--text); font-weight:600; font-size:0.84rem; cursor:pointer; transition:opacity 0.2s ease;">
                ${mesesOpts}
              </select>
            </div>
          </div>

          <!-- Badge Indicador del Rango Activo -->
          <div id="ansPeriodoBadge" style="font-size:0.83rem; font-weight:700; color:var(--accent, #2563eb); background:rgba(37,99,235,0.08); padding:5px 12px; border-radius:7px; border:1px solid rgba(37,99,235,0.2);">
            📅 Periodo: ${rango.label}
          </div>
        </div>

        <!-- Filtros en Cascada con Conteos -->
        <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; border-top:1px solid var(--border); padding-top:10px;">
          <div style="display:flex; align-items:center; gap:5px;">
            <label for="ansFiltroRegional" style="font-size:0.73rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Regional:</label>
            <select id="ansFiltroRegional" onchange="window.ansCambiarRegional(this.value)" style="padding:5px 8px; border:1.5px solid var(--border); border-radius:7px; background:var(--bg); color:var(--text); font-size:0.83rem; min-width:180px; max-width:230px;">
              <option value="">Todas las regionales</option>
            </select>
          </div>

          <div style="display:flex; align-items:center; gap:5px;">
            <label for="ansFiltroOperacion" style="font-size:0.73rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Operación:</label>
            <select id="ansFiltroOperacion" onchange="window.ansCambiarOperacion(this.value)" style="padding:5px 8px; border:1.5px solid var(--border); border-radius:7px; background:var(--bg); color:var(--text); font-size:0.83rem; min-width:200px; max-width:270px;">
              <option value="">Todas las operaciones</option>
            </select>
          </div>

          <div style="display:flex; align-items:center; gap:5px;">
            <label for="ansFiltroResponsable" style="font-size:0.73rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Responsable:</label>
            <select id="ansFiltroResponsable" onchange="window.ansCambiarResponsable(this.value)" style="padding:5px 8px; border:1.5px solid var(--border); border-radius:7px; background:var(--bg); color:var(--text); font-size:0.83rem; min-width:200px; max-width:260px;">
              <option value="">Todos los responsables</option>
            </select>
          </div>
        </div>
      </section>

      <!-- Tarjetas Resumen Estilo Mini-Stat (KPIs) -->
      <section id="ansKpisResumen" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(175px, 1fr)); gap:10px; margin-bottom:14px;">
        <div style="background:var(--card-bg, #fff); border:1px solid var(--border); border-radius:8px; padding:10px; text-align:center; color:var(--text-muted); font-size:0.8rem;">
          Cargando indicadores de selección...
        </div>
      </section>

      <!-- Pestañas de Navegación de Vista -->
      <nav class="ans-tabs-nav" aria-label="Vistas de ANS Selección">
        <button type="button" class="ans-tab-btn activa" id="ansBtnTabResp" onclick="window.ansCambiarVista('responsables')">
          👥 Consolidado por Responsable
        </button>
        <button type="button" class="ans-tab-btn" id="ansBtnTabReqs" onclick="window.ansCambiarVista('requisiciones')">
          📋 Detalle de Requisiciones
        </button>
      </nav>

      <!-- Contenedor Dinámico de Tablas -->
      <section id="ansContenedorVista"></section>
    `;

    actualizarControlesPeriodo();
  }

  function actualizarControlesPeriodo() {
    const selAnio = $('ansSelAnio');
    const selMes = $('ansSelMes');

    const anioEsTodos = !_ansState.anio || _ansState.anio === 'todos';

    if (selMes) {
      selMes.disabled = anioEsTodos;
      selMes.style.opacity = anioEsTodos ? '0.55' : '1';
      selMes.style.cursor = anioEsTodos ? 'not-allowed' : 'pointer';
      selMes.title = anioEsTodos ? 'Habilitado solo al seleccionar un año específico' : 'Selecciona el mes a consultar';
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CARGA DE DATOS DESDE LA API
  // ──────────────────────────────────────────────────────────────────────────
  async function cargarDatosAns() {
    if (_ansState.cargando) return;
    _ansState.cargando = true;

    const rango = calcularRangoFechasAns();
    const badge = $('ansPeriodoBadge');
    if (badge) badge.textContent = `📅 Periodo: ${rango.label}`;

    // Si existe botón de sync global o local, activar giro
    const syncBtns = document.querySelectorAll('.bsync');
    syncBtns.forEach(b => { if (b.classList) b.classList.add('girando'); });

    const cont = $('ansContenedorVista');
    if (cont && !_ansState.data) {
      cont.innerHTML = `
        <div style="padding:40px; text-align:center; color:var(--text-muted);">
          <div class="th-admin-spinner" style="width:30px; height:30px; border:3px solid rgba(37,99,235,0.2); border-top-color:#2563eb; border-radius:50%; animation:thSpinAdmin 0.8s linear infinite; margin:0 auto 10px;"></div>
          Consultando métricas y requisiciones de selección...
        </div>`;
    }

    try {
      const usuario = obtenerUsuarioActual();
      let url = `/talenthub/api/ans-seleccion?usuario=${encodeURIComponent(usuario)}`;
      if (_ansState.desde) url += `&desde=${encodeURIComponent(_ansState.desde)}`;
      if (_ansState.hasta) url += `&hasta=${encodeURIComponent(_ansState.hasta)}`;
      if (_ansState.regional) url += `&regional=${encodeURIComponent(_ansState.regional)}`;
      if (_ansState.operacion) url += `&operacion=${encodeURIComponent(_ansState.operacion)}`;
      if (_ansState.responsable) url += `&responsable=${encodeURIComponent(_ansState.responsable)}`;

      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'No se pudieron cargar los datos de ANS Selección');

      _ansState.data = json;
      actualizarSelectoresConConteos();
      renderizarKpis(json.kpis || {});
      renderizarVista();
    } catch (err) {
      console.error('[ANS Selección] Error cargando:', err);
      if (cont) {
        cont.innerHTML = `
          <div style="padding:25px; text-align:center; color:var(--danger, #dc2626); background:var(--card-bg); border:1px solid var(--border); border-radius:10px;">
            ⚠️ Error: ${esc(err.message)}
          </div>`;
      }
    } finally {
      _ansState.cargando = false;
      syncBtns.forEach(b => { if (b.classList) b.classList.remove('girando'); });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ACTUALIZACIÓN DE SELECTORES CON CONTEOS DINÁMICOS
  // ──────────────────────────────────────────────────────────────────────────
  function actualizarSelectoresConConteos() {
    if (!_ansState.data) return;
    const reqs = _ansState.data.requisiciones || [];

    const selReg = $('ansFiltroRegional');
    const selOp = $('ansFiltroOperacion');
    const selResp = $('ansFiltroResponsable');

    // 1. Regionales con conteo
    const mapRegCount = {};
    reqs.forEach(r => {
      const reg = r.regional || 'CENTRO';
      mapRegCount[reg] = (mapRegCount[reg] || 0) + 1;
    });

    if (selReg) {
      const regActual = _ansState.regional;
      const regKeys = Object.keys(mapRegCount).sort();
      selReg.innerHTML = `<option value="">Todas las regionales (${reqs.length})</option>` +
        regKeys.map(r => `<option value="${esc(r)}" ${r === regActual ? 'selected' : ''}>${esc(r)} (${mapRegCount[r]})</option>`).join('');
    }

    // 2. Operaciones con conteo (filtradas si hay regional seleccionada)
    const reqsFiltradasPorReg = _ansState.regional ? reqs.filter(r => r.regional === _ansState.regional) : reqs;
    const mapOpCount = {};
    reqsFiltradasPorReg.forEach(r => {
      const op = r.operacion || 'Sin Operación';
      mapOpCount[op] = (mapOpCount[op] || 0) + 1;
    });

    if (selOp) {
      const opActual = _ansState.operacion;
      const opKeys = Object.keys(mapOpCount).sort();
      selOp.innerHTML = `<option value="">Todas las operaciones (${reqsFiltradasPorReg.length})</option>` +
        opKeys.map(o => `<option value="${esc(o)}" ${o === opActual ? 'selected' : ''}>${esc(o)} (${mapOpCount[o]})</option>`).join('');
    }

    // 3. Responsables con conteo (filtradas según filtros actuales)
    const mapRespCount = {};
    reqs.forEach(r => {
      const resp = r.responsable || 'Sin Asignar';
      mapRespCount[resp] = (mapRespCount[resp] || 0) + 1;
    });

    if (selResp) {
      const respActual = _ansState.responsable;
      const respKeys = Object.keys(mapRespCount).sort();
      selResp.innerHTML = `<option value="">Todos los responsables (${reqs.length})</option>` +
        respKeys.map(rp => `<option value="${esc(rp)}" ${rp === respActual ? 'selected' : ''}>${esc(rp)} (${mapRespCount[rp]})</option>`).join('');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RENDERIZADO DE KPIS (TARJETAS MINI-STAT COMPACTAS)
  // ──────────────────────────────────────────────────────────────────────────
  function renderizarKpis(kpis) {
    const el = $('ansKpisResumen');
    if (!el) return;

    const totalReq = kpis.totalRequisiciones || 0;
    const vacReq = kpis.vacantesRequeridas || 0;
    const vacCub = kpis.vacantesCubiertas || 0;
    const pctCob = kpis.pctCoberturaGlobal || 0;
    const cumple = kpis.cumpleTiempo || 0;
    const fuera = kpis.fueraTiempo || 0;
    const pctCumple = kpis.pctCumplimientoGlobal || 100.0;
    const enProc = kpis.enProceso || 0;
    const promDias = kpis.diasPromedioGlobal != null ? kpis.diasPromedioGlobal : '—';
    const limiteSla = kpis.limiteDiasSla || 8;

    const colorCumple = pctCumple >= 80 ? '#16a34a' : (pctCumple >= 50 ? '#d97706' : '#dc2626');
    const colorCob = pctCob >= 80 ? '#16a34a' : (pctCob >= 50 ? '#d97706' : '#dc2626');
    const pctEnProc = totalReq > 0 ? Number(((enProc / totalReq) * 100).toFixed(1)) : 0;

    el.innerHTML = `
      <div class="ans-mini-stat">
        <span class="ans-mini-stat-icon">📋</span>
        <div class="ans-mini-stat-info">
          <div class="ans-mini-stat-lbl"><span>Requisiciones</span></div>
          <div class="ans-mini-stat-val">${totalReq}</div>
          <div class="ans-mini-stat-sub"><b>${vacReq}</b> vacantes solicitadas</div>
        </div>
      </div>

      <div class="ans-mini-stat">
        <span class="ans-mini-stat-icon">👥</span>
        <div class="ans-mini-stat-info">
          <div class="ans-mini-stat-lbl"><span>Vacantes &amp; Cobertura</span></div>
          <div class="ans-mini-stat-val" style="color:${colorCob};">${pctCob}%</div>
          <div class="ans-mini-stat-sub"><b>${vacCub}</b> Cubiertas | <b>${vacReq}</b> vacantes</div>
        </div>
      </div>

      <div class="ans-mini-stat">
        <span class="ans-mini-stat-icon">⏱️</span>
        <div class="ans-mini-stat-info">
          <div class="ans-mini-stat-lbl"><span>Cumplimiento ANS</span></div>
          <div class="ans-mini-stat-val" style="color:${colorCumple};">${pctCumple}%</div>
          <div class="ans-mini-stat-sub"><b>${cumple}</b> a tiempo | <b style="color:#dc2626;">${fuera}</b> fuera</div>
        </div>
      </div>

      <div class="ans-mini-stat">
        <span class="ans-mini-stat-icon">📈</span>
        <div class="ans-mini-stat-info">
          <div class="ans-mini-stat-lbl"><span>Días Promedio</span></div>
          <div class="ans-mini-stat-val">${promDias} <small style="font-size:0.75rem; font-weight:600;">días</small></div>
          <div class="ans-mini-stat-sub">Meta: &le; ${limiteSla} días hábiles</div>
        </div>
      </div>

      <div class="ans-mini-stat">
        <span class="ans-mini-stat-icon">⏳</span>
        <div class="ans-mini-stat-info">
          <div class="ans-mini-stat-lbl"><span>REQ. EN PROCESO</span></div>
          <div class="ans-mini-stat-val" style="color:#2563eb;">${enProc} <small style="font-size:0.8rem; font-weight:600; color:var(--text-muted);">(${pctEnProc}%)</small></div>
          <div class="ans-mini-stat-sub">Requisiciones activas</div>
        </div>
      </div>
    `;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VISTAS Y TABLAS CON REDIMENSIÓN DE COLUMNAS
  // ──────────────────────────────────────────────────────────────────────────
  function renderizarVista() {
    const cont = $('ansContenedorVista');
    if (!cont || !_ansState.data) return;

    if (_ansState.vistaActiva === 'responsables') {
      renderizarTablaResponsables(cont);
    } else {
      renderizarTablaRequisiciones(cont);
    }

    inicializarRedimensionColumnas();
  }

  // ── Vista 1: Consolidado por Responsable ──────────────────────────────────
  function renderizarTablaResponsables(cont) {
    const lista = [...(_ansState.data.analistas || [])];

    // Ordenamiento dinámico
    const col = _ansState.ordenColumna;
    const asc = _ansState.ordenAsc;
    lista.sort((a, b) => {
      let va = a[col];
      let vb = b[col];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va == null) return 1;
      if (vb == null) return -1;
      return asc ? (va > vb ? 1 : (va < vb ? -1 : 0)) : (va < vb ? 1 : (va > vb ? -1 : 0));
    });

    let totReq = 0, totVacReq = 0, totVacCub = 0, totEnProc = 0, totCumple = 0, totFuera = 0;
    lista.forEach(item => {
      totReq += item.totalRequisiciones;
      totVacReq += item.vacantesRequeridas;
      totVacCub += item.vacantesCubiertas;
      totEnProc += item.enProceso;
      totCumple += item.cumpleTiempo;
      totFuera += item.fueraTiempo;
    });

    const totEvaluados = totCumple + totFuera;
    const totPctCumple = totEvaluados > 0 ? Number(((totCumple / totEvaluados) * 100).toFixed(1)) : 100.0;
    const totPctCob = totVacReq > 0 ? Number(((totVacCub / totVacReq) * 100).toFixed(1)) : 0.0;
    const totFaltan = Math.max(0, totVacReq - totVacCub);
    const totPctFaltan = totVacReq > 0 ? Number(((totFaltan / totVacReq) * 100).toFixed(1)) : 0.0;

    const rowsHtml = lista.map(item => {
      const colorCumple = item.pctCumplimiento >= 80 ? 'color:#16a34a;' : (item.pctCumplimiento >= 50 ? 'color:#d97706;' : 'color:#dc2626;');
      const diasStr = item.diasPromedio != null ? `${item.diasPromedio} d` : '—';
      const isSinAsignar = !item.responsable || item.responsable === '(Sin asignar)';
      const respParam = isSinAsignar ? 'sin_asignar' : item.responsable;
      const faltantes = Math.max(0, item.vacantesRequeridas - item.vacantesCubiertas);
      const pctFaltan = item.vacantesRequeridas > 0 ? Number(((faltantes / item.vacantesRequeridas) * 100).toFixed(1)) : 0;

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
              <b style="color:var(--text);">${esc(item.responsable)}</b>
              <button type="button" class="btn-link-reqs" title="Ver requisiciones de ${esc(item.responsable)}"
                onclick="window.ansIrARequisiciones('${esc(respParam)}')"
                style="display:inline-flex; align-items:center; gap:4px; background:rgba(37,99,235,0.08); color:#2563eb; border:1px solid rgba(37,99,235,0.22); border-radius:6px; padding:2px 7px; font-size:0.72rem; font-weight:700; cursor:pointer; white-space:nowrap; text-decoration:none; transition:all 0.15s ease;"
                onmouseover="this.style.background='rgba(37,99,235,0.18)'" onmouseout="this.style.background='rgba(37,99,235,0.08)'">
                📋 Ver reqs
              </button>
            </div>
          </td>
          <td style="text-align:right;"><b>${item.totalRequisiciones}</b></td>
          <td style="text-align:right;">${item.vacantesRequeridas}</td>
          <td style="text-align:right; font-weight:700;">
            <span style="color:#16a34a;">${item.vacantesCubiertas} (${item.coberturaPct}%)</span>
            <span style="color:var(--text-muted); font-weight:400; margin:0 3px;">|</span>
            <span style="color:#dc2626;">${faltantes} (${pctFaltan}%)</span>
          </td>
          <td style="text-align:right; color:#2563eb; font-weight:700;">${item.enProceso}</td>
          <td style="text-align:right; font-weight:700; ${colorCumple}">
            ${item.cumpleTiempo} <span style="font-size:0.75rem;">(${item.pctCumplimiento}%)</span>
          </td>
          <td style="text-align:right; color:${item.fueraTiempo > 0 ? '#dc2626' : 'var(--text-muted)'}; font-weight:${item.fueraTiempo > 0 ? '700' : '400'};">
            ${item.fueraTiempo}
          </td>
          <td style="text-align:right; font-weight:600;">${diasStr}</td>
        </tr>
      `;
    }).join('');

    cont.innerHTML = `
      <div class="ans-table-wrap">
        <table class="ans-table-custom" id="tablaAnsResponsables">
          <thead>
            <tr>
              <th onclick="window.ansOrdenar('responsable')" style="min-width:180px;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
                  <span>Responsable de Selección</span>
                  <span class="sort-icon">${iconoOrden('responsable')}</span>
                </div>
                <div class="col-resizer"></div>
              </th>
              <th style="text-align:right; min-width:110px;" onclick="window.ansOrdenar('totalRequisiciones')">
                <div style="display:flex; align-items:center; justify-content:flex-end; gap:4px;">
                  <span>Requisiciones</span>
                  <span class="sort-icon">${iconoOrden('totalRequisiciones')}</span>
                </div>
                <div class="col-resizer"></div>
              </th>
              <th style="text-align:right; min-width:120px;" onclick="window.ansOrdenar('vacantesRequeridas')">
                <div style="display:flex; align-items:center; justify-content:flex-end; gap:4px;">
                  <span>Vacantes Req.</span>
                  <span class="sort-icon">${iconoOrden('vacantesRequeridas')}</span>
                </div>
                <div class="col-resizer"></div>
              </th>
              <th style="text-align:right; min-width:160px;" onclick="window.ansOrdenar('vacantesCubiertas')">
                <div style="display:flex; align-items:center; justify-content:flex-end; gap:4px;">
                  <span>Cubiertas (Socio)</span>
                  <span class="sort-icon">${iconoOrden('vacantesCubiertas')}</span>
                </div>
                <div class="col-resizer"></div>
              </th>
              <th style="text-align:right; min-width:130px;" onclick="window.ansOrdenar('enProceso')">
                <div style="display:flex; align-items:center; justify-content:flex-end; gap:4px;">
                  <span>REQ. EN PROCESO</span>
                  <span class="sort-icon">${iconoOrden('enProceso')}</span>
                </div>
                <div class="col-resizer"></div>
              </th>
              <th style="text-align:right; min-width:150px;" onclick="window.ansOrdenar('pctCumplimiento')">
                <div style="display:flex; align-items:center; justify-content:flex-end; gap:4px;">
                  <span>Cumplimiento ANS</span>
                  <span class="sort-icon">${iconoOrden('pctCumplimiento')}</span>
                </div>
                <div class="col-resizer"></div>
              </th>
              <th style="text-align:right; min-width:120px;" onclick="window.ansOrdenar('fueraTiempo')">
                <div style="display:flex; align-items:center; justify-content:flex-end; gap:4px;">
                  <span>Fuera de Tiempo</span>
                  <span class="sort-icon">${iconoOrden('fueraTiempo')}</span>
                </div>
                <div class="col-resizer"></div>
              </th>
              <th style="text-align:right; min-width:110px;" onclick="window.ansOrdenar('diasPromedio')">
                <div style="display:flex; align-items:center; justify-content:flex-end; gap:4px;">
                  <span>Días Promedio</span>
                  <span class="sort-icon">${iconoOrden('diasPromedio')}</span>
                </div>
                <div class="col-resizer"></div>
              </th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-muted);">No se encontraron registros para los filtros seleccionados.</td></tr>'}
          </tbody>
          <tfoot>
            <tr>
              <td>TOTAL CONSOLIDADO (${lista.length} responsables)</td>
              <td style="text-align:right;">${totReq}</td>
              <td style="text-align:right;">${totVacReq}</td>
              <td style="text-align:right; font-weight:700;">
                <span style="color:#16a34a;">${totVacCub} (${totPctCob}%)</span>
                <span style="color:var(--text-muted); font-weight:400; margin:0 3px;">|</span>
                <span style="color:#dc2626;">${totFaltan} (${totPctFaltan}%)</span>
              </td>
              <td style="text-align:right; color:#2563eb;">${totEnProc}</td>
              <td style="text-align:right;">${totCumple} (${totPctCumple}%)</td>
              <td style="text-align:right; color:${totFuera > 0 ? '#dc2626' : 'var(--text-muted)'};">${totFuera}</td>
              <td style="text-align:right;">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  // ── Vista 2: Detalle de Requisiciones ────────────────────────────────────
  function renderizarTablaRequisiciones(cont) {
    const allReqs = _ansState.data?.requisiciones || [];
    let reqs = [...allReqs];

    // Conteo por cumplimiento ANS antes de filtrar
    const cntCumple = allReqs.filter(r => r.slaEstado === 'cumple').length;
    const cntEnPlazo = allReqs.filter(r => r.slaEstado === 'en_tiempo').length;
    const cntVencida = allReqs.filter(r => r.slaEstado === 'vencido').length;
    const cntFuera = allReqs.filter(r => r.slaEstado === 'nocumple').length;

    // Filtro Cumplimiento ANS
    const fCumple = _ansState.filtroCumplimientoReq || 'todos';
    if (fCumple !== 'todos') {
      reqs = reqs.filter(r => r.slaEstado === fCumple);
    }

    // Buscador rápido
    const q = (_ansState.filtroBusqueda || '').trim().toLowerCase();
    if (q) {
      reqs = reqs.filter(r =>
        (r.requisicion || '').toLowerCase().includes(q) ||
        (r.cargo || '').toLowerCase().includes(q) ||
        (r.operacion || '').toLowerCase().includes(q) ||
        (r.solicitante || '').toLowerCase().includes(q) ||
        (r.responsable || '').toLowerCase().includes(q)
      );
    }

    // Ordenamiento
    const col = _ansState.ordenReqCol;
    const asc = _ansState.ordenReqAsc;
    reqs.sort((a, b) => {
      let va = a[col];
      let vb = b[col];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va == null) return 1;
      if (vb == null) return -1;
      return asc ? (va > vb ? 1 : (va < vb ? -1 : 0)) : (va < vb ? 1 : (va > vb ? -1 : 0));
    });

    const visibles = reqs.slice(0, _ansReqLimiteRender);
    const hayMas = reqs.length > visibles.length;

    const rowsHtml = visibles.map(r => {
      let badgeSla = '';
      if (r.slaEstado === 'cumple') badgeSla = '<span class="ans-badge-status ans-badge-cumple">✓ Cumple</span>';
      else if (r.slaEstado === 'nocumple') badgeSla = '<span class="ans-badge-status ans-badge-nocumple">✕ Fuera de tiempo</span>';
      else if (r.slaEstado === 'en_tiempo') badgeSla = '<span class="ans-badge-status ans-badge-proceso">En plazo</span>';
      else if (r.slaEstado === 'vencido') badgeSla = '<span class="ans-badge-status ans-badge-nocumple">Vencida</span>';
      else if (r.slaEstado === 'suspendido') badgeSla = '<span class="ans-badge-status ans-badge-suspendida">Suspendida</span>';
      else badgeSla = '<span class="ans-badge-status ans-badge-cancelada">Cancelada</span>';

      const esExpandida = _reqExpandida === r.id;
      const numAsp = (r.aspirantes || []).length;

      let subtablaAsp = '';
      if (esExpandida) {
        const aspHtml = (r.aspirantes || []).map(a => `
          <tr style="background:rgba(37,99,235,0.03);">
            <td style="padding:6px 10px 6px 24px; font-size:0.78rem;">
              👤 <b>${esc(a.aspirante)}</b> (CC: ${esc(a.identificacion)})
            </td>
            <td style="padding:6px 10px; font-size:0.78rem;" colspan="2">
              F. Cierre ANS: <b>${esc(a.fecha_cierre_efectiva || a.fecha_socio || a.fecha_ingreso_laboral || '—')}</b>
              <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">
                Ingreso: ${esc(a.fecha_ingreso_laboral || '—')} | Socio: ${esc(a.fecha_socio ? a.fecha_socio.slice(0, 10) : '—')}
              </div>
            </td>
            <td style="padding:6px 10px; font-size:0.78rem;">
              Por: ${esc(a.usuario_socio || '—')}
            </td>
            <td style="padding:6px 10px; text-align:right; font-size:0.78rem;" colspan="2">
              Tiempo: <b>${a.dias != null ? `${a.dias} d` : '—'}</b>
              ${a.estadoSla === 'cumple' ? '<span style="color:#16a34a; font-weight:700; margin-left:6px;">✓ Cumple</span>' : '<span style="color:#dc2626; font-weight:700; margin-left:6px;">✕ Fuera</span>'}
            </td>
          </tr>
        `).join('');

        subtablaAsp = `
          <tr style="background:var(--bg-elevated, #f8fafc);">
            <td colspan="7" style="padding:10px 14px; border-bottom:1.5px solid var(--border);">
              <div style="font-weight:700; font-size:0.78rem; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">
                Aspirantes enviados a Sociodemográfica (${numAsp} personas):
              </div>
              <table style="width:100%; border-collapse:collapse; background:var(--card-bg, #fff); border-radius:6px; overflow:hidden;">
                ${aspHtml || '<tr><td style="padding:10px; text-align:center; color:var(--text-muted); font-size:0.78rem;">Aún no hay aspirantes enviados a la Sociodemográfica en esta requisición.</td></tr>'}
              </table>
            </td>
          </tr>
        `;
      }

      return `
        <tr>
          <td>
            <div style="font-weight:800; color:var(--text);">${esc(r.requisicion)}</div>
            <div style="font-size:0.72rem; color:var(--text-muted);">${esc(r.fechaRequisicion)}</div>
          </td>
          <td>
            <div style="font-weight:700;">${esc(r.cargo || '—')}</div>
            <div style="font-size:0.72rem; color:var(--text-muted);">${esc(r.regional)} &bull; ${esc(r.operacion)}</div>
          </td>
          <td>
            <div style="font-weight:700; color:var(--text);">${esc(r.responsable)}</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">Solicitante: ${esc(r.solicitante ? r.solicitante.slice(0, 24) : '—')}</div>
          </td>
          <td style="text-align:right;">
            <b style="color:#16a34a;">${r.vacantesCubiertas}</b> / <b>${r.vacantesReq}</b>
            <div style="font-size:0.7rem; color:var(--text-muted);">
              ${r.vacantesPendientes > 0 ? `<span style="color:#2563eb;">${r.vacantesPendientes} pend.</span>` : 'Completa'}
            </div>
          </td>
          <td style="text-align:right;">
            <b>${r.diasProceso != null ? `${r.diasProceso} d` : '—'}</b>
          </td>
          <td style="text-align:center;">
            ${badgeSla}
            <div style="font-size:0.68rem; color:var(--text-muted); margin-top:2px;">${esc(r.estado)}</div>
          </td>
          <td style="text-align:center;">
            <button type="button" class="btn btn-outline" onclick="window.ansToggleDetalleReq(${r.id})" style="padding:3px 8px; font-size:0.72rem; cursor:pointer;">
              ${esExpandida ? '▲ Ocultar' : `▼ Ver (${numAsp})`}
            </button>
          </td>
        </tr>
        ${subtablaAsp}
      `;
    }).join('');

    const botonCargarMasHtml = hayMas
      ? `<div style="text-align:center; padding:12px 16px;">
           <button type="button" class="btn btn-outline" onclick="window.ansCargarMasRequisiciones()" style="padding:6px 16px; font-size:0.82rem; font-weight:600; cursor:pointer;">
             ⬇️ Mostrar más requisiciones (mostrando ${visibles.length} de ${reqs.length})
           </button>
         </div>`
      : '';

    // Optimización: si la tabla ya existe en el DOM, actualizamos solo tbody, contador y botón
    const tbodyExistente = $('tbodyAnsRequisiciones');
    const lblConteo = $('ansReqConteoLbl');
    const wrapMas = $('ansReqCargarMasWrap');
    if (tbodyExistente && lblConteo && cont.contains(tbodyExistente)) {
      lblConteo.textContent = `Mostrando ${visibles.length} de ${reqs.length} requisiciones${fCumple !== 'todos' ? ` (filtradas de ${allReqs.length})` : ''}`;
      tbodyExistente.innerHTML = rowsHtml || '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">No se encontraron requisiciones con los criterios seleccionados.</td></tr>';
      if (wrapMas) wrapMas.innerHTML = botonCargarMasHtml;
      return;
    }

    cont.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <div id="ansReqConteoLbl" style="font-size:0.84rem; font-weight:700; color:var(--text);">
            Mostrando ${visibles.length} de ${reqs.length} requisiciones${fCumple !== 'todos' ? ` (filtradas de ${allReqs.length})` : ''}
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <label style="font-size:0.78rem; font-weight:600; color:var(--text-muted);">Cumplimiento ANS:</label>
            <select id="ansSelCumplimientoReq" onchange="window.ansFiltrarCumplimientoReq(this.value)" style="padding:5px 10px; border:1.5px solid var(--border); border-radius:8px; background:var(--card-bg); color:var(--text); font-size:0.8rem; font-weight:600; cursor:pointer;">
              <option value="todos" ${fCumple === 'todos' ? 'selected' : ''}>Todos (${allReqs.length})</option>
              <option value="cumple" ${fCumple === 'cumple' ? 'selected' : ''}>✓ Cumple (${cntCumple})</option>
              <option value="en_tiempo" ${fCumple === 'en_tiempo' ? 'selected' : ''}>⏳ En plazo (${cntEnPlazo})</option>
              <option value="vencido" ${fCumple === 'vencido' ? 'selected' : ''}>⚠️ Vencida (${cntVencida})</option>
              <option value="nocumple" ${fCumple === 'nocumple' ? 'selected' : ''}>✕ Fuera de tiempo (${cntFuera})</option>
            </select>
          </div>
        </div>
        <input type="search" placeholder="🔍 Buscar requisición, cargo, solicitante u operación..." value="${esc(_ansState.filtroBusqueda)}" oninput="window.ansFiltrarBusqueda(this.value)" style="padding:6px 12px; border:1.5px solid var(--border); border-radius:8px; background:var(--card-bg); color:var(--text); font-size:0.82rem; min-width:260px;">
      </div>

      <div class="ans-table-wrap">
        <table class="ans-table-custom" id="tablaAnsRequisiciones">
          <thead>
            <tr>
              <th onclick="window.ansOrdenarReq('fechaRequisicion')" style="min-width:130px;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
                  <span>Requisición</span>
                  <span class="sort-icon">${iconoOrdenReq('fechaRequisicion')}</span>
                </div>
                <div class="col-resizer"></div>
              </th>
              <th onclick="window.ansOrdenarReq('cargo')" style="min-width:170px;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
                  <span>Cargo &amp; Operación</span>
                  <span class="sort-icon">${iconoOrdenReq('cargo')}</span>
                </div>
                <div class="col-resizer"></div>
              </th>
              <th onclick="window.ansOrdenarReq('responsable')" style="min-width:160px;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
                  <span>Responsable</span>
                  <span class="sort-icon">${iconoOrdenReq('responsable')}</span>
                </div>
                <div class="col-resizer"></div>
              </th>
              <th style="text-align:right; min-width:125px;" onclick="window.ansOrdenarReq('vacantesReq')">
                <div style="display:flex; align-items:center; justify-content:flex-end; gap:4px;">
                  <span>Vacantes (Cub/Req)</span>
                  <span class="sort-icon">${iconoOrdenReq('vacantesReq')}</span>
                </div>
                <div class="col-resizer"></div>
              </th>
              <th style="text-align:right; min-width:110px;" onclick="window.ansOrdenarReq('diasProceso')">
                <div style="display:flex; align-items:center; justify-content:flex-end; gap:4px;">
                  <span>Días Proceso</span>
                  <span class="sort-icon">${iconoOrdenReq('diasProceso')}</span>
                </div>
                <div class="col-resizer"></div>
              </th>
              <th style="text-align:center; min-width:130px;" onclick="window.ansOrdenarReq('slaEstado')">
                <div style="display:flex; align-items:center; justify-content:center; gap:4px;">
                  <span>Cumplimiento ANS</span>
                  <span class="sort-icon">${iconoOrdenReq('slaEstado')}</span>
                </div>
                <div class="col-resizer"></div>
              </th>
              <th style="text-align:center; min-width:90px;">Aspirantes</th>
            </tr>
          </thead>
          <tbody id="tbodyAnsRequisiciones">
            ${rowsHtml || '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">No se encontraron requisiciones con los criterios seleccionados.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div id="ansReqCargarMasWrap">${botonCargarMasHtml}</div>
    `;

    inicializarRedimensionColumnas();
  }

  function iconoOrden(col) {
    if (_ansState.ordenColumna !== col) return '<span style="opacity:0.35;">⇅</span>';
    return _ansState.ordenAsc ? '▲' : '▼';
  }

  function iconoOrdenReq(col) {
    if (_ansState.ordenReqCol !== col) return '<span style="opacity:0.35;">⇅</span>';
    return _ansState.ordenReqAsc ? '▲' : '▼';
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LÓGICA DE REDIMENSIÓN DE COLUMNAS (COL-RESIZER)
  // ──────────────────────────────────────────────────────────────────────────
  function inicializarRedimensionColumnas() {
    const resizers = document.querySelectorAll('.ans-table-custom .col-resizer');
    resizers.forEach(resizer => {
      if (resizer._hasResizerHandler) return;
      resizer._hasResizerHandler = true;

      resizer.addEventListener('click', function (e) {
        e.stopPropagation();
      });

      resizer.addEventListener('mousedown', function (e) {
        e.stopPropagation();
        e.preventDefault();

        const th = this.parentElement;
        const startX = e.pageX;
        const startWidth = th.offsetWidth;
        resizer.classList.add('resizing');

        const mover = ev => {
          const w = Math.max(60, startWidth + ev.pageX - startX);
          th.style.width = w + 'px';
          th.style.minWidth = w + 'px';
        };

        const soltar = () => {
          resizer.classList.remove('resizing');
          window.removeEventListener('mousemove', mover);
          window.removeEventListener('mouseup', soltar);
        };

        window.addEventListener('mousemove', mover);
        window.addEventListener('mouseup', soltar);
      });
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CONTROLADORES GLOBALES
  // ──────────────────────────────────────────────────────────────────────────
  window.ansCambiarPeriodo = function (tipo, valor) {
    if (tipo === 'anio') {
      _ansState.anio = (valor === 'todos' || !valor) ? 'todos' : parseInt(valor, 10);
    }
    if (tipo === 'mes') {
      _ansState.mes = (valor === 'todos' || !valor) ? 'todos' : parseInt(valor, 10);
    }
    if (tipo === 'quincena') {
      _ansState.quincena = valor;
    }
    actualizarControlesPeriodo();
    cargarDatosAns();
  };

  window.ansCambiarVista = function (vista) {
    _ansState.vistaActiva = vista;
    const btnResp = $('ansBtnTabResp');
    const btnReqs = $('ansBtnTabReqs');
    if (btnResp) btnResp.className = `ans-tab-btn ${vista === 'responsables' ? 'activa' : ''}`;
    if (btnReqs) btnReqs.className = `ans-tab-btn ${vista === 'requisiciones' ? 'activa' : ''}`;
    renderizarVista();
  };

  window.ansOrdenar = function (col) {
    if (_ansState.ordenColumna === col) {
      _ansState.ordenAsc = !_ansState.ordenAsc;
    } else {
      _ansState.ordenColumna = col;
      _ansState.ordenAsc = false;
    }
    renderizarVista();
  };

  window.ansOrdenarReq = function (col) {
    if (_ansState.ordenReqCol === col) {
      _ansState.ordenReqAsc = !_ansState.ordenReqAsc;
    } else {
      _ansState.ordenReqCol = col;
      _ansState.ordenReqAsc = false;
    }
    renderizarVista();
  };

  window.ansFiltrarBusqueda = function (valor) {
    _ansState.filtroBusqueda = valor;
    _ansReqLimiteRender = 80;
    const cont = $('ansVistaContenido');
    if (cont) renderizarTablaRequisiciones(cont);
  };

  window.ansToggleDetalleReq = function (id) {
    _reqExpandida = (_reqExpandida === id) ? null : id;
    const cont = $('ansVistaContenido');
    if (cont) renderizarTablaRequisiciones(cont);
  };

  window.ansCambiarRegional = function (val) {
    _ansState.regional = val;
    cargarDatosAns();
  };

  window.ansCambiarOperacion = function (val) {
    _ansState.operacion = val;
    cargarDatosAns();
  };

  window.ansCambiarResponsable = function (val) {
    _ansState.responsable = val;
    cargarDatosAns();
  };

  window.ansFiltrarCumplimientoReq = function (val) {
    _ansState.filtroCumplimientoReq = val || 'todos';
    _ansReqLimiteRender = 80;
    const cont = $('ansVistaContenido');
    if (cont) renderizarTablaRequisiciones(cont);
  };

  window.ansCargarMasRequisiciones = function () {
    _ansReqLimiteRender += 80;
    const cont = $('ansVistaContenido');
    if (cont) renderizarTablaRequisiciones(cont);
  };

  window.ansIrARequisiciones = function (responsable) {
    if (typeof window.switchTab === 'function') {
      window.switchTab('Requisiciones');
    }
    setTimeout(() => {
      // 1. Limpieza absoluta de filtros previos en DOM para que no se mezclen
      const resetInputs = {
        filtroReqQ: '',
        filtroReqRegional: 'todas',
        filtroReqOperacion: 'todas',
        filtroReqCargo: 'todos',
        filtroReqCumplimiento: 'todos',
        filtroReqQuincena: 'todas'
      };
      Object.keys(resetInputs).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = resetInputs[id];
      });

      const respFinal = (!responsable || responsable === '(Sin asignar)' || responsable === 'sin_asignar')
        ? 'sin_asignar'
        : responsable;

      const selResp = document.getElementById('filtroReqResponsable');
      if (selResp) selResp.value = respFinal;

      const anioFinal = (_ansState.anio && _ansState.anio !== 'todos') ? String(_ansState.anio) : 'todos';
      const mesFinal = (_ansState.mes && _ansState.mes !== 'todos') ? String(_ansState.mes) : 'todos';

      const selAnio = document.getElementById('filtroReqAnio');
      if (selAnio) selAnio.value = anioFinal;

      const selMes = document.getElementById('filtroReqMes');
      if (selMes) selMes.value = mesFinal;

      // 2. Limpieza exhaustiva en el objeto de estado _reqFiltros
      if (window._reqFiltros) {
        Object.assign(window._reqFiltros, {
          q: '',
          estado: 'TODOS',
          regional: 'todas',
          operacion: 'todas',
          cargo: 'todos',
          responsable: respFinal,
          anio: anioFinal,
          mes: mesFinal,
          quincena: 'todas',
          cumplimiento: 'todos',
          desde: '',
          hasta: ''
        });
      }

      if (typeof window.sincronizarControlesFiltroPeriodoReq === 'function') {
        window.sincronizarControlesFiltroPeriodoReq();
      }
      if (typeof window.calcularRangoFechasRequisiciones === 'function') {
        window.calcularRangoFechasRequisiciones();
      }
      if (typeof window.cargarRequisiciones === 'function') {
        window.cargarRequisiciones();
      }
    }, 70);
  };

})();
