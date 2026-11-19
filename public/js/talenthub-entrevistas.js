/* Talent Hub › Entrevistas de Retiro
 * Respuestas de la entrevista de retiro (Maestro_evaluacionretiro) para que Selección y Bienestar
 * encuentren los puntos a mejorar: indicadores, aspectos peor calificados, resultados por operación y
 * coordinador, y la tabla de entrevistas con su documento.
 * Ver la pestaña: Maestro_Menu talenthub / EntrevistasRetiro. Regenerar y campana: Config_Parametros
 * talenthub / Entrevistas de Retiro. API: /talenthub/api/entrevistas-retiro.
 * Usa del index de Talent Hub: CONFIG, esc(), showToast().
 */
(function () {
  'use strict';

  const API = '/talenthub/api/entrevistas-retiro';

  // Preguntas cerradas con sus opciones de mejor a peor (las mismas del formulario y del PDF)
  const PREGUNTAS = [
    { k: 'relacion_jefe', l: 'Relación con jefe inmediato', corto: 'Jefe', ops: ['Excelente', 'Buena', 'Regular', 'Deficiente'] },
    { k: 'relacion_companeros', l: 'Relación con compañeros', corto: 'Compañeros', ops: ['Excelente', 'Buena', 'Regular', 'Deficiente'] },
    { k: 'claridad_funciones', l: 'Claridad en funciones', corto: 'Funciones', ops: ['Muy claras', 'Claras', 'Poco claras', 'Nada claras'] },
    { k: 'condiciones_trabajo', l: 'Condiciones de trabajo', corto: 'Condiciones', ops: ['Muy adecuadas', 'Adecuadas', 'Poco adecuadas', 'Inadecuadas'] },
    { k: 'satisfaccion_sueldo', l: 'Sueldo percibido', corto: 'Sueldo', ops: ['Muy satisfactorio', 'Satisfactorio', 'Poco satisfactorio', 'Insatisfactorio'] },
    { k: 'satisfaccion_beneficios', l: 'Beneficios adicionales', corto: 'Beneficios', ops: ['Muy satisfactorios', 'Satisfactorios', 'Poco satisfactorios', 'Insatisfactorios'] },
    { k: 'oportunidad_formacion', l: 'Formación y capacitación', corto: 'Formación', ops: ['Excelentes', 'Buenas', 'Regulares', 'Escasas'] },
    { k: 'oportunidad_crecimiento', l: 'Crecimiento y ascenso', corto: 'Crecimiento', ops: ['Excelentes', 'Buenas', 'Regulares', 'Escasas'] },
  ];
  const NIVEL_CLASE = ['evr-n1', 'evr-n2', 'evr-n3', 'evr-n4'];

  const st = {
    iniciado: false,
    datos: [],
    puedeRegenerar: false,
    orden: { col: 'fecha', dir: 'desc' },
    ordenCoord: { col: 'indice', dir: 'asc' },
    timer: null,
    notif: { items: [], noLeidas: 0, abierta: false },
  };

  const $ = (id) => document.getElementById(id);
  const e = (v) => (typeof esc === 'function' ? esc(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const toast = (m, t) => (typeof showToast === 'function' ? showToast(m, t) : alert(m));
  const usuario = () => encodeURIComponent((window.CONFIG || CONFIG).usuarioId);
  const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);
  const fechaCorta = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };
  const fechaDe = (r) => r.fecha_entrevista || r.fecha_registro || '';

  // Nivel 0 (mejor) a 3 (peor) de una respuesta; -1 si no respondió
  const nivel = (preg, valor) => preg.ops.indexOf(valor);
  // Índice de satisfacción de una entrevista: 100 = todo en la mejor opción, 0 = todo en la peor
  function indiceSatisfaccion(r) {
    const niveles = PREGUNTAS.map(p => nivel(p, r[p.k])).filter(n => n >= 0);
    if (!niveles.length) return null;
    return Math.round(niveles.reduce((s, n) => s + (3 - n) / 3, 0) / niveles.length * 100);
  }
  const claseIndice = (v) => (v == null ? '' : v >= 75 ? 'evr-n1' : v >= 60 ? 'evr-n2' : v >= 45 ? 'evr-n3' : 'evr-n4');

  async function api(ruta, opciones = {}) {
    const sep = ruta.includes('?') ? '&' : '?';
    const res = await fetch(`${API}${ruta}${sep}usuario=${usuario()}`, {
      ...opciones, headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
    });
    let datos = {};
    try { datos = await res.json(); } catch (_) { /* respuesta vacía */ }
    if (!res.ok || datos.ok === false) throw new Error(datos.error || 'No se pudo completar la solicitud.');
    return datos;
  }

  // ── Estructura de la pestaña ─────────────────────────────────────────────
  function th(col, label, ancho, fnOrden = 'evrOrdenar') {
    return `<th class="sortable" style="width:${ancho}px; min-width:${Math.min(ancho, 90)}px;" onclick="${fnOrden}('${col}')">
      <div class="th-content"><span>${label}</span><span class="sort-icon" data-col="${col}">↕</span></div><div class="col-resizer"></div></th>`;
  }

  function montar() {
    const cont = $('tabContentEntrevistasRetiro');
    const filtro = (id, label) => `<div class="filter-group"><label>${label}</label><select id="${id}" onchange="evrAplicar()"><option value="">Todos</option></select></div>`;
    cont.innerHTML = `
      <style>
        .evr-n1 { background: var(--success-soft); color: var(--success-dark); border-color: var(--success) !important; }
        .evr-n2 { background: rgba(132, 204, 22, 0.14); color: #4d7c0f; border-color: #a3e635 !important; }
        .evr-n3 { background: var(--warning-soft); color: var(--warning-dark); border-color: var(--warning) !important; }
        .evr-n4 { background: var(--danger-soft); color: var(--danger-dark); border-color: var(--danger) !important; }
        .evr-chip { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.72rem; font-weight: 700; border: 1px solid transparent; white-space: nowrap; }
        .evr-muted { color: var(--text-muted); }
        .evr-grid2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr); gap: 16px; margin-bottom: 16px; }
        .evr-bar-row { display: grid; grid-template-columns: 150px 1fr 46px; gap: 10px; align-items: center; padding: 5px 0; font-size: 0.8rem; }
        .evr-bar-row .lbl { color: var(--text); font-weight: 600; }
        .evr-bar { height: 10px; border-radius: 6px; background: var(--bg-elevated); overflow: hidden; border: 1px solid var(--border); }
        .evr-bar > span { display: block; height: 100%; border-radius: 6px; }
        .evr-bar > span.evr-n1 { background: var(--success); }
        .evr-bar > span.evr-n2 { background: #84cc16; }
        .evr-bar > span.evr-n3 { background: var(--warning); }
        .evr-bar > span.evr-n4 { background: var(--danger); }
        .evr-bar-row .val { text-align: right; font-weight: 800; font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; }
        .evr-hint { font-size: 0.74rem; color: var(--text-muted); margin: -4px 0 10px; }
        .evr-acciones { display: flex; flex-direction: column; align-items: center; gap: 5px; }
        .evr-btn { display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 0.74rem; font-weight: 700; text-decoration: none; white-space: nowrap; border: 1px solid var(--border); background: var(--bg-elevated); color: var(--text); cursor: pointer; font-family: inherit; }
        .evr-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .evr-btn:disabled { opacity: 0.55; cursor: default; }
        .evr-texto { max-width: 100%; white-space: normal; font-size: 0.78rem; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        #evrTablaCoord tbody tr { cursor: pointer; }
        .evr-kpi-sub { font-size: 0.68rem; color: var(--text-muted); margin-top: 2px; }
        @media (max-width: 1100px) { .evr-grid2 { grid-template-columns: 1fr; } }
      </style>

      <div class="filter-panel" id="evrPanelFiltros">
        <div class="filter-panel-header" onclick="evrToggleFiltros()">
          <span class="filtros-toggle-left">Filtros <span class="filtros-badge" id="evrFiltrosActivos"></span></span>
          <input type="search" class="filtros-busqueda" id="evrQ" placeholder="&#128269; Buscar por trabajador, cédula, cargo, operación, coordinador o comentarios..." aria-label="Buscar" onclick="event.stopPropagation()" oninput="evrBuscar()" onkeydown="event.stopPropagation()">
          <span class="filtros-chevron" id="evrChevron">▸</span>
        </div>
        <div class="filter-panel-body" id="evrCuerpoFiltros" style="display:none;">
          <div class="filter-grid">
            ${filtro('evrEstado', 'Estado')}
            ${filtro('evrRegional', 'Regional')}
            ${filtro('evrOperacion', 'Operación')}
            ${filtro('evrCoordinador', 'Coordinador')}
            ${filtro('evrMotivo', 'Motivo principal')}
            ${filtro('evrJefe', 'Relación con jefe')}
            ${filtro('evrRecomienda', '¿Recomendaría la empresa?')}
            <div class="filter-group"><label>Desde</label><input type="date" id="evrDesde" onchange="evrAplicar()"></div>
            <div class="filter-group"><label>Hasta</label><input type="date" id="evrHasta" onchange="evrAplicar()"></div>
            <div style="display:flex; gap:8px; align-items:center;"><button type="button" class="btn btn-outline" onclick="evrLimpiar()"><span>Limpiar</span></button></div>
          </div>
        </div>
      </div>

      <div class="kpi-grid" id="evrKpis"></div>

      <div class="evr-grid2">
        <div class="card" style="margin-bottom:0;">
          <div class="card-title" style="margin-bottom:8px;"><span>🎯</span> Puntos a mejorar</div>
          <p class="evr-hint">% de respuestas favorables (las dos mejores opciones) por aspecto, de menor a mayor.</p>
          <div id="evrPuntos"></div>
        </div>
        <div class="card" style="margin-bottom:0;">
          <div class="card-title" style="margin-bottom:8px;"><span>🧭</span> Por operación y coordinador</div>
          <p class="evr-hint">Clic en una fila para filtrar por esa operación. Alertas = relación con el jefe Regular o Deficiente.</p>
          <div class="req-table-wrapper" style="max-height: 320px;">
            <table id="evrTablaCoord" class="resizable-table">
              <thead><tr>
                ${th('operacion', 'Operación', 150, 'evrOrdenarCoord')}
                ${th('coordinador', 'Coordinador', 170, 'evrOrdenarCoord')}
                ${th('n', 'Entrevistas', 95, 'evrOrdenarCoord')}
                ${th('jefe', 'Jefe favorable', 110, 'evrOrdenarCoord')}
                ${th('alertas', 'Alertas jefe', 100, 'evrOrdenarCoord')}
                ${th('indice', 'Índice', 85, 'evrOrdenarCoord')}
                ${th('recomienda', 'Recomienda', 100, 'evrOrdenarCoord')}
              </tr></thead>
              <tbody id="evrCoordBody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <div style="display:flex; align-items:center; gap:8px;"><span>🗣️</span> Entrevistas de retiro <span id="evrTotal" style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;"></span></div>
          <div style="position: relative;">
            <button type="button" class="btn-notif-bell" id="evrBell" onclick="evrToggleNotif()" title="Nuevas entrevistas de retiro" aria-label="Nuevas entrevistas de retiro">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
              <span class="notif-badge" id="evrBellBadge" style="display:none;">0</span>
            </button>
            <div class="notif-dropdown" id="evrNotifDropdown" style="display:none;">
              <div class="notif-dropdown-header">
                <div class="notif-header-title"><span>🔔 Nuevas entrevistas</span><span class="notif-header-pill" id="evrNotifPill">0 no leídas</span></div>
                <button type="button" class="btn-mark-all-read" onclick="evrMarcarTodas()">✓ Marcar leídas</button>
              </div>
              <div class="notif-dropdown-body" id="evrNotifLista"></div>
            </div>
          </div>
        </div>
        <div class="req-table-wrapper">
          <table id="evrTabla" class="resizable-table">
            <thead><tr>
              ${th('doc', 'Documento', 120)}
              ${th('fecha', 'Fecha', 100)}
              ${th('trabajador', 'Trabajador', 210)}
              ${th('cargo', 'Cargo', 170)}
              ${th('operacion', 'Operación', 150)}
              ${th('coordinador', 'Coordinador', 170)}
              ${th('motivo_retiro', 'Motivo del retiro', 170)}
              ${th('motivo_principal', 'Motivo principal (trabajador)', 200)}
              ${PREGUNTAS.map(p => th(p.k, p.corto, 115)).join('')}
              ${th('indice', 'Índice', 85)}
              ${th('recomienda', 'Recomienda', 105)}
              ${th('valoracion_principal', 'Lo que más valoró', 220)}
              ${th('aspectos_mejorar', 'Aspectos a mejorar', 220)}
              ${th('comentarios_adicionales', 'Comentarios', 220)}
            </tr></thead>
            <tbody id="evrBody"><tr><td colspan="20" style="text-align:center; padding:24px; color:var(--text-muted);">Cargando entrevistas...</td></tr></tbody>
          </table>
        </div>
      </div>`;
    activarRedimension('#evrTabla');
    activarRedimension('#evrTablaCoord');
    document.addEventListener('click', (ev) => {
      const dd = $('evrNotifDropdown');
      if (st.notif.abierta && dd && !dd.contains(ev.target) && !$('evrBell').contains(ev.target)) cerrarNotif();
    });
  }

  function activarRedimension(selector) {
    document.querySelectorAll(`${selector} .col-resizer`).forEach(resizer => {
      if (resizer._evr) return;
      resizer._evr = true;
      resizer.addEventListener('click', ev => ev.stopPropagation());
      resizer.addEventListener('mousedown', function (ev) {
        ev.stopPropagation(); ev.preventDefault();
        const celda = this.parentElement;
        const x0 = ev.pageX;
        const w0 = celda.offsetWidth;
        resizer.classList.add('resizing');
        const mover = m => { const w = Math.max(60, w0 + m.pageX - x0); celda.style.width = w + 'px'; celda.style.minWidth = w + 'px'; };
        const soltar = () => { resizer.classList.remove('resizing'); window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar); };
        window.addEventListener('mousemove', mover);
        window.addEventListener('mouseup', soltar);
      });
    });
  }

  // ── Carga y filtros ──────────────────────────────────────────────────────
  async function cargar() {
    try {
      const d = await api('');
      st.datos = (d.entrevistas || []).map(r => ({ ...r, indice: r.completada ? indiceSatisfaccion(r) : null }));
      st.puedeRegenerar = !!d.puedeRegenerar;
    } catch (err) {
      st.datos = [];
      toast(err.message, 'error');
    }
    aplicar();
  }

  const valor = (id) => ($(id)?.value || '').trim();
  const FILTROS = {
    evrEstado:      { de: r => (r.completada ? 'Diligenciadas' : 'Pendientes') },
    evrRegional:    { de: r => r.regional || '(Sin regional)' },
    evrOperacion:   { de: r => r.operacion || '(Sin operación)' },
    evrCoordinador: { de: r => r.coordinador || '(Sin coordinador)' },
    evrMotivo:      { de: r => (r.completada ? (String(r.motivo_principal).startsWith('Otro:') ? 'Otro' : r.motivo_principal || '(Sin respuesta)') : null) },
    evrJefe:        { de: r => (r.completada && r.relacion_jefe ? (nivel(PREGUNTAS[0], r.relacion_jefe) <= 1 ? 'Favorable (Excelente / Buena)' : 'Desfavorable (Regular / Deficiente)') : null) },
    evrRecomienda:  { de: r => (r.completada && r.recomienda_empresa != null ? (r.recomienda_empresa ? 'Sí' : 'No') : null) },
  };

  function filtrar(excepto) {
    const q = norm(valor('evrQ'));
    const desde = valor('evrDesde');
    const hasta = valor('evrHasta');
    return st.datos.filter(r => {
      for (const [id, f] of Object.entries(FILTROS)) {
        if (id === excepto) continue;
        const v = valor(id);
        if (v && f.de(r) !== v) return false;
      }
      const fecha = fechaDe(r);
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      if (q) {
        const texto = norm([r.trabajador, r.identificacion, r.cargo, r.operacion, r.regional, r.coordinador, r.motivo_retiro,
          r.motivo_principal, r.valoracion_principal, r.aspectos_mejorar, r.comentarios_adicionales].join(' '));
        if (!texto.includes(q)) return false;
      }
      return true;
    });
  }

  // Opciones de cada filtro con su conteo (calculado con los demás filtros aplicados)
  function pintarOpciones() {
    Object.entries(FILTROS).forEach(([id, f]) => {
      const sel = $(id);
      const actual = sel.value;
      const conteo = {};
      filtrar(id).forEach(r => { const v = f.de(r); if (v != null) conteo[v] = (conteo[v] || 0) + 1; });
      const claves = Object.keys(conteo).sort((a, b) => a.localeCompare(b, 'es'));
      if (actual && !claves.includes(actual)) claves.push(actual);
      sel.innerHTML = '<option value="">Todos</option>' + claves
        .map(k => `<option value="${e(k)}" ${k === actual ? 'selected' : ''}>${e(k)} (${conteo[k] || 0})</option>`).join('');
    });
  }

  function aplicar() {
    pintarOpciones();
    const activos = [...Object.keys(FILTROS), 'evrDesde', 'evrHasta'].filter(id => valor(id)).length;
    $('evrFiltrosActivos').textContent = activos || '';
    const filas = filtrar();
    pintarKpis(filas);
    pintarPuntos(filas);
    pintarCoordinadores(filas);
    pintarTabla(filas);
  }

  // ── Indicadores ──────────────────────────────────────────────────────────
  function pintarKpis(filas) {
    const hechas = filas.filter(r => r.completada);
    const indices = hechas.map(r => r.indice).filter(v => v != null);
    const indice = indices.length ? Math.round(indices.reduce((s, v) => s + v, 0) / indices.length) : null;
    const conRec = hechas.filter(r => r.recomienda_empresa != null);
    const recomienda = pct(conRec.filter(r => r.recomienda_empresa).length, conRec.length);
    const motivos = {};
    hechas.forEach(r => { const m = String(r.motivo_principal).startsWith('Otro:') ? 'Otro' : r.motivo_principal; if (m) motivos[m] = (motivos[m] || 0) + 1; });
    const [motivoTop, motivoN] = Object.entries(motivos).sort((a, b) => b[1] - a[1])[0] || ['—', 0];
    const alertas = hechas.filter(r => nivel(PREGUNTAS[0], r.relacion_jefe) >= 2).length;
    const kpi = (num, lbl, sub = '', clase = '') => `<div class="kpi-pill"><div class="kpi-pill-num ${clase}" style="border-radius:6px;">${num}</div><div class="kpi-pill-lbl">${lbl}</div>${sub ? `<div class="evr-kpi-sub">${sub}</div>` : ''}</div>`;
    $('evrKpis').innerHTML = [
      kpi(hechas.length, 'Diligenciadas', `${filas.length - hechas.length} pendientes`),
      kpi(indice == null ? '—' : indice + '%', 'Índice de satisfacción', 'Promedio de las 8 preguntas', claseIndice(indice)),
      kpi(recomienda == null ? '—' : recomienda + '%', 'Recomendaría la empresa', `${conRec.length} respuestas`, claseIndice(recomienda)),
      kpi(alertas, 'Alertas con el jefe', 'Relación Regular o Deficiente', alertas ? 'evr-n4' : ''),
      kpi(motivoN || '—', 'Motivo más frecuente', e(motivoTop)),
    ].join('');
  }

  function pintarPuntos(filas) {
    const hechas = filas.filter(r => r.completada);
    const items = PREGUNTAS.map(p => {
      const resp = hechas.map(r => nivel(p, r[p.k])).filter(n => n >= 0);
      return { p, n: resp.length, fav: pct(resp.filter(n => n <= 1).length, resp.length) };
    }).sort((a, b) => (a.fav ?? 101) - (b.fav ?? 101));
    $('evrPuntos').innerHTML = items.map(({ p, n, fav }) => {
      const clase = claseIndice(fav);
      return `<div class="evr-bar-row" title="${n} respuestas">
        <span class="lbl">${e(p.l)}</span>
        <div class="evr-bar"><span class="${clase}" style="width:${fav || 0}%; border:none;"></span></div>
        <span class="val">${fav == null ? '—' : fav + '%'}</span></div>`;
    }).join('') || '<div class="evr-muted" style="font-size:0.8rem;">Sin entrevistas diligenciadas con estos filtros.</div>';
  }

  // ── Por operación y coordinador ──────────────────────────────────────────
  function gruposCoordinador(filas) {
    const grupos = new Map();
    filas.filter(r => r.completada).forEach(r => {
      const clave = `${r.operacion}|${r.coordinador}`;
      if (!grupos.has(clave)) grupos.set(clave, { operacion: r.operacion || '(Sin operación)', coordinador: r.coordinador || '—', filas: [] });
      grupos.get(clave).filas.push(r);
    });
    return [...grupos.values()].map(g => {
      const jefe = g.filas.map(r => nivel(PREGUNTAS[0], r.relacion_jefe)).filter(n => n >= 0);
      const indices = g.filas.map(r => r.indice).filter(v => v != null);
      const conRec = g.filas.filter(r => r.recomienda_empresa != null);
      return {
        ...g, n: g.filas.length,
        jefe: pct(jefe.filter(n => n <= 1).length, jefe.length),
        alertas: jefe.filter(n => n >= 2).length,
        indice: indices.length ? Math.round(indices.reduce((s, v) => s + v, 0) / indices.length) : null,
        recomienda: pct(conRec.filter(r => r.recomienda_empresa).length, conRec.length),
      };
    });
  }

  function ordenarLista(lista, orden, valorDe) {
    return lista.slice().sort((a, b) => {
      const va = valorDe(a, orden.col);
      const vb = valorDe(b, orden.col);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es');
      return orden.dir === 'asc' ? r : -r;
    });
  }

  function marcarOrden(selector, orden) {
    document.querySelectorAll(`${selector} .sort-icon`).forEach(el => {
      const activo = el.dataset.col === orden.col;
      el.textContent = activo ? (orden.dir === 'asc' ? '▲' : '▼') : '↕';
      el.closest('th').classList.toggle('sorted', activo);
    });
  }

  function pintarCoordinadores(filas) {
    const lista = ordenarLista(gruposCoordinador(filas), st.ordenCoord, (g, c) => g[c]);
    marcarOrden('#evrTablaCoord', st.ordenCoord);
    const chip = (v, sufijo = '%') => (v == null ? '<span class="evr-muted">—</span>' : `<span class="evr-chip ${claseIndice(v)}">${v}${sufijo}</span>`);
    $('evrCoordBody').innerHTML = lista.length ? lista.map(g => `
      <tr data-op="${e(g.operacion)}" onclick="evrFiltrarOperacion(this.dataset.op)" title="Filtrar por ${e(g.operacion)}">
        <td><strong>${e(g.operacion)}</strong></td>
        <td>${e(g.coordinador)}</td>
        <td style="text-align:center;">${g.n}</td>
        <td style="text-align:center;">${chip(g.jefe)}</td>
        <td style="text-align:center;">${g.alertas ? `<span class="evr-chip evr-n4">${g.alertas}</span>` : '<span class="evr-muted">0</span>'}</td>
        <td style="text-align:center;">${chip(g.indice)}</td>
        <td style="text-align:center;">${chip(g.recomienda)}</td>
      </tr>`).join('') : '<tr><td colspan="7" style="text-align:center; padding:16px; color:var(--text-muted);">Sin entrevistas diligenciadas con estos filtros.</td></tr>';
  }

  // ── Tabla principal ──────────────────────────────────────────────────────
  function valorOrden(r, col) {
    if (col === 'doc') return r.url_pdf ? 1 : r.completada ? 0.5 : 0;
    if (col === 'fecha') return fechaDe(r);
    if (col === 'indice') return r.indice;
    if (col === 'recomienda') return r.recomienda_empresa == null ? null : r.recomienda_empresa ? 1 : 0;
    const preg = PREGUNTAS.find(p => p.k === col);
    if (preg) { const n = nivel(preg, r[col]); return n < 0 ? null : n; }
    return norm(r[col]) || null;
  }

  function celdaDocumento(r) {
    if (!r.completada) return '<span class="evr-chip" style="background:var(--bg-elevated); color:var(--text-muted); border-color:var(--border);">Pendiente</span>';
    const ver = r.url_pdf ? `<a href="${e(r.url_pdf)}" target="_blank" rel="noopener" class="evr-btn">📄 Ver ↗</a>` : '<span class="evr-muted" style="font-size:0.74rem;">Sin PDF</span>';
    const regen = st.puedeRegenerar ? `<button type="button" class="evr-btn" onclick="evrRegenerar('${e(r.id_evaluacion)}', this)" title="Volver a generar el PDF con la plantilla actual">🔄 Regenerar</button>` : '';
    return `<div class="evr-acciones">${ver}${regen}</div>`;
  }

  function chipRespuesta(preg, v) {
    const n = nivel(preg, v);
    return n < 0 ? '<span class="evr-muted">—</span>' : `<span class="evr-chip ${NIVEL_CLASE[n]}">${e(v)}</span>`;
  }

  function texto(v) {
    const t = String(v || '').trim();
    return t ? `<div class="evr-texto" title="${e(t)}">${e(t)}</div>` : '<span class="evr-muted">—</span>';
  }

  function pintarTabla(filas) {
    const lista = ordenarLista(filas, st.orden, valorOrden);
    marcarOrden('#evrTabla', st.orden);
    $('evrTotal').textContent = `(${lista.length} de ${st.datos.length})`;
    if (!lista.length) {
      $('evrBody').innerHTML = '<tr><td colspan="20" style="text-align:center; padding:24px; color:var(--text-muted);">No se encontraron entrevistas con estos filtros.</td></tr>';
      return;
    }
    $('evrBody').innerHTML = lista.map(r => `
      <tr>
        <td style="text-align:center;">${celdaDocumento(r)}</td>
        <td><strong>${fechaCorta(fechaDe(r))}</strong></td>
        <td><strong>${e(r.trabajador)}</strong><div class="evr-muted" style="font-size:0.74rem;">C.C. ${e(r.identificacion)} · Retiro ${fechaCorta(r.fecha_retiro)}</div></td>
        <td>${e(r.cargo) || '—'}</td>
        <td>${e(r.operacion) || '—'}<div class="evr-muted" style="font-size:0.74rem;">${e(r.regional)}</div></td>
        <td>${e(r.coordinador) || '<span class="evr-muted">—</span>'}</td>
        <td>${e(r.motivo_retiro) || '—'}</td>
        <td>${r.completada ? e(r.motivo_principal) || '—' : '<span class="evr-muted">—</span>'}</td>
        ${PREGUNTAS.map(p => `<td style="text-align:center;">${chipRespuesta(p, r[p.k])}</td>`).join('')}
        <td style="text-align:center;">${r.indice == null ? '<span class="evr-muted">—</span>' : `<span class="evr-chip ${claseIndice(r.indice)}">${r.indice}%</span>`}</td>
        <td style="text-align:center;">${r.recomienda_empresa == null || !r.completada ? '<span class="evr-muted">—</span>' : `<span class="evr-chip ${r.recomienda_empresa ? 'evr-n1' : 'evr-n4'}">${r.recomienda_empresa ? 'Sí' : 'No'}</span>`}</td>
        <td>${texto(r.valoracion_principal)}</td>
        <td>${texto(r.aspectos_mejorar)}</td>
        <td>${texto(r.comentarios_adicionales)}</td>
      </tr>`).join('');
  }

  // ── Regenerar ────────────────────────────────────────────────────────────
  async function regenerar(idEvaluacion, btn) {
    const r = st.datos.find(x => x.id_evaluacion === idEvaluacion);
    if (!confirm(`¿Regenerar la entrevista de retiro${r ? ' de ' + r.trabajador : ''}?\n\nSe arma de nuevo con la plantilla actual y reemplaza el PDF.`)) return;
    const textoBtn = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Regenerando…';
    try {
      const d = await api(`/${encodeURIComponent(idEvaluacion)}/regenerar`, { method: 'POST', body: JSON.stringify({}) });
      toast('Documento regenerado.', 'success');
      if (r && d.urlPdf) r.url_pdf = d.urlPdf;
      if (d.urlPdf) window.open(d.urlPdf + '?v=' + Date.now(), '_blank');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = textoBtn;
    }
  }

  // ── Campana ──────────────────────────────────────────────────────────────
  async function cargarNotif() {
    try {
      const res = await fetch(`${API}/notificaciones?usuario=${usuario()}&limit=50`);
      if (!res.ok) return;
      const d = await res.json();
      st.notif.items = d.notificaciones || [];
      st.notif.noLeidas = parseInt(d.totalNoLeidos, 10) || 0;
      pintarBadge();
      if (st.notif.abierta) pintarNotif();
    } catch (_) { /* sin conexión: se reintenta en el siguiente ciclo */ }
  }

  function pintarBadge() {
    const n = st.notif.noLeidas;
    const textoN = n > 99 ? '99+' : String(n);
    ['evrBellBadge', 'nav-notif-badge-evr'].forEach(id => {
      const b = $(id);
      if (!b) return;
      b.textContent = textoN;
      b.style.display = n > 0 ? 'inline-flex' : 'none';
    });
    const pill = $('evrNotifPill');
    if (pill) pill.textContent = `${n} no leída${n === 1 ? '' : 's'}`;
  }

  function pintarNotif() {
    const cont = $('evrNotifLista');
    if (!cont) return;
    if (!st.notif.items.length) {
      cont.innerHTML = `<div style="padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 0.84rem;">
        <div style="font-size: 1.8rem; margin-bottom: 6px;">🔔</div><p style="font-weight: 600;">Sin notificaciones</p>
        <p style="font-size: 0.76rem; margin-top: 4px;">Te avisaremos cuando un trabajador diligencie su entrevista de retiro.</p></div>`;
      return;
    }
    cont.innerHTML = st.notif.items.map(it => `
      <div class="notif-item ${it.leido ? 'notif-read' : 'notif-unread'}" onclick="evrAbrirNotif(${Number(it.id)})">
        <div class="notif-unread-dot" style="${it.leido ? 'display:none;' : ''}"></div>
        <div class="notif-item-content">
          <div class="notif-item-top"><span class="notif-worker-name" title="${e(it.nombre_trabajador)}">🗣️ ${e(it.nombre_trabajador || 'Trabajador')}</span><span class="notif-tag notif-tag-firmado">Entrevista</span></div>
          <div class="notif-worker-sub">${e(it.identificacion_trabajador || '')}${it.operacion ? ` · ${e(it.operacion)}` : ''}</div>
          <p class="notif-item-msg">${e(it.mensaje || '')}</p>
          <div class="notif-item-time">${e(String(it.fecha_creacion || '').slice(0, 16).replace('T', ' '))}</div>
        </div>
      </div>`).join('');
  }

  function cerrarNotif() {
    $('evrNotifDropdown').style.display = 'none';
    $('evrBell').classList.remove('active');
    st.notif.abierta = false;
  }

  async function marcarLeidas(cuerpo) {
    try {
      await fetch(`${API}/notificaciones/marcar-leidas?usuario=${usuario()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
      });
    } catch (_) { /* se vuelve a intentar al recargar */ }
  }

  // ── Funciones globales (onclick) ─────────────────────────────────────────
  window.evrToggleFiltros = () => {
    const cuerpo = $('evrCuerpoFiltros');
    const abrir = cuerpo.style.display === 'none';
    cuerpo.style.display = abrir ? 'block' : 'none';
    $('evrChevron').classList.toggle('open', abrir);
  };
  window.evrBuscar = () => { clearTimeout(st.timer); st.timer = setTimeout(aplicar, 250); };
  window.evrAplicar = aplicar;
  window.evrLimpiar = () => {
    ['evrQ', 'evrDesde', 'evrHasta', ...Object.keys(FILTROS)].forEach(id => { const el = $(id); if (el) el.value = ''; });
    aplicar();
  };
  window.evrOrdenar = (col) => {
    st.orden = { col, dir: st.orden.col === col && st.orden.dir === 'asc' ? 'desc' : 'asc' };
    pintarTabla(filtrar());
  };
  window.evrOrdenarCoord = (col) => {
    st.ordenCoord = { col, dir: st.ordenCoord.col === col && st.ordenCoord.dir === 'asc' ? 'desc' : 'asc' };
    pintarCoordinadores(filtrar());
  };
  window.evrFiltrarOperacion = (operacion) => {
    $('evrOperacion').value = operacion;
    aplicar();
    $('evrTabla').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  window.evrRegenerar = regenerar;
  window.evrToggleNotif = () => {
    if (st.notif.abierta) return cerrarNotif();
    st.notif.abierta = true;
    $('evrBell').classList.add('active');
    $('evrNotifDropdown').style.display = 'flex';
    pintarNotif();
    cargarNotif();
  };
  window.evrAbrirNotif = (id) => {
    const it = st.notif.items.find(x => x.id === id);
    if (it && !it.leido) {
      it.leido = 1;
      st.notif.noLeidas = Math.max(0, st.notif.noLeidas - 1);
      pintarBadge();
      marcarLeidas({ ids: [id] });
    }
    cerrarNotif();
    if (it && it.identificacion_trabajador) { $('evrQ').value = it.identificacion_trabajador; aplicar(); }
  };
  window.evrMarcarTodas = async () => {
    if (!st.notif.noLeidas) return toast('No tienes notificaciones pendientes', 'info');
    await marcarLeidas({ todas: true });
    st.notif.items.forEach(x => { x.leido = 1; });
    st.notif.noLeidas = 0;
    pintarBadge();
    pintarNotif();
  };

  // Campana en el menú lateral desde que se abre Talent Hub (aunque no se entre a la pestaña)
  window.iniciarNotificacionesEntrevistas = () => { cargarNotif(); setInterval(cargarNotif, 60000); };

  window.inicializarEntrevistasRetiro = function () {
    if (!st.iniciado) { montar(); st.iniciado = true; }
    cargar();
    cargarNotif();
  };
})();
