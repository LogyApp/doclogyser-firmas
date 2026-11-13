/* Talent Hub › Cargos y Funciones
 * Manual de funciones, responsabilidades y competencias por cargo (formato SST-MA-002).
 * Lo ven los roles con la pestaña en Maestro_Menu; editar y publicar, los de Config_Parametros
 * talenthub / Cargos y Funciones (por defecto Sistema y CoorSelección). API: /talenthub/api/cargos-funciones.
 * Usa del index de Talent Hub: CONFIG, esc(), showToast().
 */
(function () {
  'use strict';

  const API = '/talenthub/api/cargos-funciones';
  const SECCIONES = [
    { clave: 'responsabilidades', titulo: 'Responsabilidades del cargo' },
    { clave: 'funciones', titulo: 'Funciones del cargo' },
    { clave: 'sst', titulo: 'Responsabilidades en SST' },
  ];
  const CAMPOS = [
    { k: 'ubicacion', l: 'Ubicación', ph: 'Sede Operativa / Sede Administrativa' },
    { k: 'jefeInmediato', l: 'Jefe inmediato', ph: 'Cargo del jefe inmediato' },
    { k: 'nivelJerarquico', l: 'Nivel jerárquico', ph: 'Operativo / Administrativo', lista: ['Operativo', 'Administrativo', 'Directivo'] },
    { k: 'objetivo', l: 'Objetivo del cargo', area: true, ancho: true },
    { k: 'autoridad', l: 'Autoridad', area: true, ancho: true },
    { k: 'edad', l: 'Edad', ph: 'N/A' },
    { k: 'genero', l: 'Género', ph: 'N/A' },
    { k: 'educacion', l: 'Educación', ph: 'N/A' },
    { k: 'experiencia', l: 'Experiencia en el cargo', ph: 'N/A' },
    { k: 'formacion', l: 'Formación', area: true, ancho: true },
    { k: 'cargosQueReportan', l: 'Cargos que le reportan', ph: 'N/A' },
    { k: 'aQuienReporta', l: 'A quién le reporta', ph: 'Jefe directo, Recursos Humanos…' },
    { k: 'revisadoPor', l: 'Revisado por' },
    { k: 'revisadoCargo', l: 'Cargo de quien revisa' },
    { k: 'aprobadoPor', l: 'Aprobado por' },
    { k: 'aprobadoCargo', l: 'Cargo de quien aprueba' },
  ];
  const ESTADOS = ['Publicado', 'Cambios sin publicar', 'Borrador', 'Sin manual'];

  const st = {
    iniciado: false,
    cargos: [],
    puedeEditar: false,
    orden: { campo: 'activos', dir: -1 },
    seleccionado: null, // nombre del cargo abierto, o '__SST_COMUN__'
    detalle: null,      // copia editable
    original: '',       // JSON para saber si hay cambios
    sstComun: [],
    timer: null,
  };

  const $ = (id) => document.getElementById(id);
  const e = (v) => (typeof esc === 'function' ? esc(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const toast = (m, t) => (typeof showToast === 'function' ? showToast(m, t) : alert(m));
  const usuario = () => encodeURIComponent((window.CONFIG || CONFIG).usuarioId);
  const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

  async function api(ruta, opciones = {}) {
    const sep = ruta.includes('?') ? '&' : '?';
    const res = await fetch(`${API}${ruta}${sep}usuario=${usuario()}`, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
    });
    let datos = {};
    try { datos = await res.json(); } catch (_) { /* sin cuerpo */ }
    if (!res.ok || datos.ok === false) throw new Error(datos.error || `Error ${res.status}`);
    return datos;
  }

  // ── Estructura de la pestaña ────────────────────────────────────────────
  function montar() {
    const cont = $('tabContentCargosFunciones');
    if (!cont || cont.dataset.montado) return;
    cont.dataset.montado = '1';
    cont.innerHTML = `
      <style>
        .cf-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin-bottom:14px; }
        .cf-kpi { background:var(--card-bg); border:1px solid var(--border); border-radius:10px; padding:10px 12px; cursor:pointer; transition:border-color .15s; }
        .cf-kpi:hover, .cf-kpi.activo { border-color:var(--accent); }
        .cf-kpi-num { font-size:1.3rem; font-weight:800; color:var(--text); font-family:'JetBrains Mono',monospace; }
        .cf-kpi-lbl { font-size:.7rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.03em; }
        .cf-layout { display:grid; grid-template-columns:1fr; gap:18px; align-items:start; }
        .cf-layout.detalle { grid-template-columns:minmax(0,.95fr) minmax(460px,1.25fr); }
        .cf-tabla-card { min-width:0; margin-bottom:0; }
        #cfTabla tbody tr { cursor:pointer; }
        #cfTabla tbody tr.sel td { background:var(--accent-soft) !important; }
        #cfTabla tbody tr.sel td:first-child { box-shadow:inset 4px 0 0 var(--accent); }
        .cf-num { text-align:right; font-family:'JetBrains Mono',monospace; font-weight:700; }
        .cf-badge { display:inline-block; padding:2px 9px; border-radius:10px; font-size:.7rem; font-weight:800; white-space:nowrap; border:1px solid var(--border); }
        .cf-badge.publicado { background:var(--success-soft); color:var(--success-dark); border-color:var(--success); }
        .cf-badge.cambios { background:var(--warning-soft); color:var(--warning-dark); border-color:var(--warning); }
        .cf-badge.borrador { background:var(--info-soft); color:var(--info-dark); border-color:var(--info); }
        .cf-badge.sin { background:var(--danger-soft); color:var(--danger-dark); border-color:var(--danger); }
        [data-theme="oscuro"] .cf-badge { color:var(--text) !important; }
        .cf-det { position:sticky; top:16px; max-height:calc(100vh - 40px); display:none; flex-direction:column; overflow:hidden; padding:0 !important; margin-bottom:0 !important; border-top:4px solid var(--accent) !important; }
        .cf-det.abierto { display:flex; }
        .cf-det-movil { display:none; align-items:center; justify-content:space-between; padding:10px 14px; background:var(--bg-elevated); border-bottom:1px solid var(--border); flex-shrink:0; }
        .cf-det-hdr { padding:14px 18px 10px; border-bottom:1.5px solid var(--border); flex-shrink:0; }
        .cf-det-titulo { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:space-between; }
        .cf-det-titulo h3 { margin:0; font-size:1rem; font-weight:800; color:var(--text); }
        .cf-det-sub { font-size:.74rem; color:var(--text-muted); margin-top:3px; }
        .cf-acciones { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
        .cf-acciones .btn { padding:6px 12px; font-size:.78rem; }
        .cf-det-body { padding:14px 18px 22px; overflow-y:auto; flex:1; }
        .cf-sec { margin-bottom:18px; }
        .cf-sec-hdr { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; padding-bottom:6px; border-bottom:1px solid var(--border); margin-bottom:8px; }
        .cf-sec-tit { font-size:.72rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; }
        .cf-sec-tit .cnt { color:var(--accent); margin-left:4px; }
        .cf-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 12px; }
        .cf-campo { display:flex; flex-direction:column; gap:3px; min-width:0; }
        .cf-campo.ancho { grid-column:1 / -1; }
        .cf-campo label { font-size:.7rem; font-weight:700; color:var(--text-muted); }
        .cf-campo input, .cf-campo textarea, .cf-modal input, .cf-modal select, .cf-modal textarea {
          width:100%; padding:7px 9px; border:1px solid var(--border); border-radius:7px; background:var(--card-bg); color:var(--text); font:inherit; font-size:.82rem; }
        .cf-campo textarea { resize:vertical; min-height:54px; }
        .cf-campo .valor { font-size:.82rem; color:var(--text); white-space:pre-line; word-break:break-word; padding:2px 0; }
        .cf-lista { list-style:none; margin:0; padding:0; counter-reset:cfn; }
        .cf-item { display:flex; gap:6px; align-items:flex-start; padding:4px 0; border-bottom:1px dashed var(--border); counter-increment:cfn; }
        .cf-item::before { content:counter(cfn); min-width:22px; height:22px; border-radius:50%; background:var(--bg-elevated); color:var(--text-muted); font-size:.68rem; font-weight:800; display:flex; align-items:center; justify-content:center; margin-top:4px; flex-shrink:0; }
        .cf-item.dup::before { background:var(--warning); color:#fff; }
        .cf-item.arrastrando { opacity:.4; }
        .cf-item.sobre { border-top:2px solid var(--accent); }
        .cf-item textarea { flex:1; min-height:32px; padding:5px 8px; border:1px solid var(--border); border-radius:6px; background:var(--card-bg); color:var(--text); font:inherit; font-size:.8rem; resize:none; overflow:hidden; line-height:1.4; }
        .cf-item .texto { flex:1; font-size:.8rem; color:var(--text); line-height:1.45; padding:3px 0; }
        .cf-item-btns { display:flex; gap:2px; flex-shrink:0; margin-top:3px; }
        .cf-ib { border:1px solid var(--border); background:var(--card-bg); color:var(--text-muted); border-radius:5px; width:24px; height:24px; cursor:pointer; font-size:.72rem; line-height:1; padding:0; }
        .cf-ib:hover { border-color:var(--accent); color:var(--accent); }
        .cf-ib.borrar:hover { border-color:var(--danger); color:var(--danger); }
        .cf-ib.mover { cursor:grab; }
        .cf-cerrar-esc { width:28px; height:28px; font-size:.85rem; }
        .cf-lista-btns { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
        .cf-lista-btns .btn { padding:5px 10px; font-size:.75rem; }
        .cf-aviso { font-size:.75rem; padding:8px 10px; border-radius:7px; margin-bottom:10px; background:var(--warning-soft); color:var(--warning-dark); border:1px solid var(--warning); }
        .cf-info { font-size:.75rem; padding:8px 10px; border-radius:7px; margin-bottom:10px; background:var(--bg-elevated); color:var(--text-muted); border:1px solid var(--border); }
        [data-theme="oscuro"] .cf-aviso { color:var(--text); }
        .cf-comun { background:var(--bg-elevated); border:1px solid var(--border); border-radius:8px; padding:8px 10px; margin-bottom:8px; }
        .cf-comun summary { cursor:pointer; font-size:.76rem; font-weight:700; color:var(--text); }
        .cf-comun ol { margin:6px 0 0 18px; font-size:.76rem; color:var(--text-muted); line-height:1.45; }
        .cf-check { display:flex; gap:8px; align-items:center; font-size:.8rem; color:var(--text); margin-bottom:8px; }
        .cf-vers { width:100%; border-collapse:collapse; font-size:.78rem; }
        .cf-vers th { text-align:left; font-size:.68rem; text-transform:uppercase; color:var(--text-muted); padding:5px 6px; border-bottom:1px solid var(--border); }
        .cf-vers td { padding:6px; border-bottom:1px solid var(--border); color:var(--text); vertical-align:top; }
        .cf-modal { position:fixed; inset:0; background:rgba(15,23,42,.65); backdrop-filter:blur(4px); z-index:1300; display:none; align-items:center; justify-content:center; padding:20px; }
        .cf-modal.abierto { display:flex; }
        .cf-modal-box { background:var(--card-bg); color:var(--text); border-radius:12px; box-shadow:var(--shadow-lg); width:100%; max-width:520px; max-height:92vh; display:flex; flex-direction:column; overflow:hidden; }
        .cf-modal-box.grande { max-width:900px; height:92vh; }
        .cf-modal-hdr { display:flex; justify-content:space-between; align-items:center; padding:14px 18px; border-bottom:1.5px solid var(--border); }
        .cf-modal-hdr h3 { margin:0; font-size:1rem; font-weight:800; }
        .cf-modal-body { padding:16px 18px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:10px; font-size:.84rem; }
        .cf-modal-body label { font-size:.74rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:3px; }
        .cf-modal-ftr { display:flex; justify-content:flex-end; gap:8px; padding:12px 18px; border-top:1px solid var(--border); }
        .cf-modal iframe { width:100%; flex:1; border:1px solid var(--border); border-radius:8px; background:#fff; min-height:60vh; }
        @media (max-width: 900px) {
          .cf-layout, .cf-layout.detalle { grid-template-columns:1fr !important; }
          .cf-det.abierto { position:fixed !important; inset:0 !important; width:100% !important; height:100dvh !important; max-height:100dvh !important; z-index:1250 !important; border-radius:0 !important; border:none !important; margin:0 !important; }
          .cf-det-movil { display:flex; }
          .cf-cerrar-esc { display:none; }
          .cf-grid { grid-template-columns:1fr; }
          .cf-modal { padding:0; }
          .cf-modal-box, .cf-modal-box.grande { max-width:100%; height:100dvh; max-height:100dvh; border-radius:0; }
        }
      </style>

      <div class="filter-panel" id="cfPanelFiltros">
        <div class="filter-panel-header" id="cfFiltrosHdr">
          <span class="filtros-toggle-left">Filtros <span class="filtros-badge" id="cfFiltrosBadge"></span></span>
          <input type="search" class="filtros-busqueda" id="cfBuscar" placeholder="&#128269; Buscar cargo..." aria-label="Buscar cargo">
          <span class="filtros-chevron" id="cfFiltrosIcono">▸</span>
        </div>
        <div class="filter-panel-body" id="cfFiltrosBody" style="display:none;">
          <div class="filter-grid">
            <div class="filter-group"><label>Grupo de nómina</label><select id="cfFGrupo"></select></div>
            <div class="filter-group"><label>Estado del manual</label><select id="cfFEstado"></select></div>
            <div class="filter-group"><label>Trabajadores</label><select id="cfFTrab"></select></div>
            <div style="display:flex; gap:8px; align-items:center;"><button type="button" class="btn btn-outline" id="cfLimpiar">Limpiar</button></div>
          </div>
        </div>
      </div>

      <div class="cf-kpis" id="cfKpis"></div>

      <div class="cf-layout" id="cfLayout">
        <div class="card cf-tabla-card">
          <div class="card-title" style="justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
            <span style="font-weight:700;">🗂️ Cargos <span id="cfTotal" style="font-size:.78rem; color:var(--text-muted); font-weight:600;"></span></span>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button type="button" class="btn btn-outline" id="cfBtnComun" style="padding:6px 12px; font-size:.78rem;">🦺 SST comunes</button>
              <button type="button" class="btn btn-primary" id="cfBtnNuevo" style="padding:6px 12px; font-size:.78rem; display:none;">+ Nuevo cargo</button>
            </div>
          </div>
          <div class="req-table-wrapper">
            <table id="cfTabla" class="resizable-table">
              <thead><tr>
                ${th('cargo', 'Cargo', 240)}${th('grupoNomina', 'Grupo', 120)}${th('activos', 'Activos', 90)}${th('retirados', 'Retirados', 95)}${th('estado', 'Manual', 150)}${th('versionPublicada', 'Versión', 85)}${th('fechaEmision', 'Emisión', 105)}
              </tr></thead>
              <tbody id="cfTbody"><tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted);">Cargando cargos...</td></tr></tbody>
            </table>
          </div>
        </div>

        <div class="card cf-det" id="cfDet">
          <div class="cf-det-movil">
            <button type="button" class="btn btn-outline" data-cf="cerrar" style="padding:5px 12px; font-size:.78rem; font-weight:700;">← Volver a la lista</button>
            <span style="font-size:.74rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Manual de funciones</span>
          </div>
          <div class="cf-det-hdr" id="cfDetHdr"></div>
          <div class="cf-det-body" id="cfDetBody"></div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', `
      <div class="cf-modal" id="cfModal"><div class="cf-modal-box" id="cfModalBox">
        <div class="cf-modal-hdr"><h3 id="cfModalTitulo"></h3><button type="button" class="btn btn-outline" style="padding:4px 9px;" data-cf="cerrar-modal" aria-label="Cerrar">✕</button></div>
        <div class="cf-modal-body" id="cfModalBody"></div>
        <div class="cf-modal-ftr" id="cfModalFtr"></div>
      </div></div>`);

    $('cfFiltrosHdr').addEventListener('click', (ev) => { if (ev.target.id !== 'cfBuscar') toggleFiltros(); });
    $('cfBuscar').addEventListener('click', ev => ev.stopPropagation());
    $('cfBuscar').addEventListener('keydown', ev => ev.stopPropagation());
    $('cfBuscar').addEventListener('input', () => { clearTimeout(st.timer); st.timer = setTimeout(pintarTabla, 200); });
    ['cfFGrupo', 'cfFEstado', 'cfFTrab'].forEach(id => $(id).addEventListener('change', pintarTabla));
    $('cfLimpiar').addEventListener('click', () => { $('cfBuscar').value = ''; ['cfFGrupo', 'cfFEstado', 'cfFTrab'].forEach(id => { $(id).value = ''; }); pintarTabla(); });
    $('cfBtnNuevo').addEventListener('click', modalNuevoCargo);
    $('cfBtnComun').addEventListener('click', () => confirmarSalida(() => abrirSstComun()));
    document.querySelectorAll('#cfTabla thead th[data-campo]').forEach(thEl => thEl.addEventListener('click', () => ordenar(thEl.dataset.campo)));
    activarRedimension();
    document.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-cf]');
      if (!b) return;
      const accion = b.dataset.cf;
      if (accion === 'cerrar') confirmarSalida(cerrarDetalle);
      if (accion === 'cerrar-modal') cerrarModal();
    });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && $('cfModal').classList.contains('abierto')) cerrarModal(); });
    window.addEventListener('beforeunload', (ev) => { if (hayCambios()) { ev.preventDefault(); ev.returnValue = ''; } });
  }

  function th(campo, titulo, ancho) {
    return `<th class="sortable" data-campo="${campo}" style="width:${ancho}px; min-width:${Math.min(ancho, 80)}px;"><div class="th-content"><span>${titulo}</span><span class="sort-icon" id="cfSort-${campo}">↕</span></div><div class="col-resizer"></div></th>`;
  }

  function activarRedimension() {
    document.querySelectorAll('#cfTabla .col-resizer').forEach(r => {
      r.addEventListener('click', ev => ev.stopPropagation());
      r.addEventListener('mousedown', function (ev) {
        ev.stopPropagation(); ev.preventDefault();
        const thEl = this.parentElement; const x0 = ev.pageX; const w0 = thEl.offsetWidth;
        r.classList.add('resizing');
        const mover = e2 => { const w = Math.max(60, w0 + e2.pageX - x0); thEl.style.width = w + 'px'; thEl.style.minWidth = w + 'px'; };
        const soltar = () => { r.classList.remove('resizing'); window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar); };
        window.addEventListener('mousemove', mover); window.addEventListener('mouseup', soltar);
      });
    });
  }

  function toggleFiltros() {
    const body = $('cfFiltrosBody');
    const abrir = body.style.display === 'none';
    body.style.display = abrir ? 'block' : 'none';
    $('cfFiltrosIcono').classList.toggle('open', abrir);
  }

  // ── Listado ─────────────────────────────────────────────────────────────
  async function cargar() {
    try {
      const d = await api('');
      st.cargos = d.cargos || [];
      st.puedeEditar = !!d.puedeEditar;
      $('cfBtnNuevo').style.display = st.puedeEditar ? 'inline-flex' : 'none';
      pintarFiltros();
      pintarTabla();
    } catch (err) {
      $('cfTbody').innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--danger);">${e(err.message)}</td></tr>`;
    }
  }

  function trabajadoresDe(c) { return c.activos > 0 ? 'Con activos' : (c.retirados > 0 ? 'Solo retirados' : 'Sin trabajadores'); }

  function pintarFiltros() {
    const opciones = (id, valores, todos) => {
      const sel = $(id); const actual = sel.value;
      const cuenta = {}; st.cargos.forEach(c => { const v = valores.fn(c); cuenta[v] = (cuenta[v] || 0) + 1; });
      sel.innerHTML = `<option value="">${todos} (${st.cargos.length})</option>` +
        valores.lista.filter(v => cuenta[v]).map(v => `<option value="${e(v)}">${e(v)} (${cuenta[v]})</option>`).join('');
      sel.value = actual;
    };
    opciones('cfFGrupo', { fn: c => c.grupoNomina || 'Sin grupo', lista: ['Operativo', 'Administrativo', 'Sin grupo'] }, 'Todos');
    opciones('cfFEstado', { fn: c => c.estado, lista: ESTADOS }, 'Todos');
    opciones('cfFTrab', { fn: trabajadoresDe, lista: ['Con activos', 'Solo retirados', 'Sin trabajadores'] }, 'Todos');
  }

  function filtrados() {
    const q = norm($('cfBuscar').value);
    const g = $('cfFGrupo').value, es = $('cfFEstado').value, tr = $('cfFTrab').value;
    return st.cargos.filter(c =>
      (!q || norm(c.cargo).includes(q)) &&
      (!g || (c.grupoNomina || 'Sin grupo') === g) &&
      (!es || c.estado === es) &&
      (!tr || trabajadoresDe(c) === tr));
  }

  function ordenar(campo) {
    st.orden = st.orden.campo === campo ? { campo, dir: -st.orden.dir } : { campo, dir: ['activos', 'retirados', 'versionPublicada', 'fechaEmision'].includes(campo) ? -1 : 1 };
    pintarTabla();
  }

  function claseEstado(estado) {
    return { 'Publicado': 'publicado', 'Cambios sin publicar': 'cambios', 'Borrador': 'borrador' }[estado] || 'sin';
  }

  function pintarTabla() {
    const lista = filtrados();
    const { campo, dir } = st.orden;
    lista.sort((a, b) => {
      const va = a[campo], vb = b[campo];
      if (typeof va === 'number' || typeof vb === 'number') return ((va || 0) - (vb || 0)) * dir || a.cargo.localeCompare(b.cargo);
      return String(va || '').localeCompare(String(vb || ''), 'es') * dir || a.cargo.localeCompare(b.cargo);
    });
    document.querySelectorAll('#cfTabla .sort-icon').forEach(s => { s.textContent = '↕'; });
    const icono = $(`cfSort-${campo}`); if (icono) icono.textContent = dir > 0 ? '▲' : '▼';

    const activos = [$('cfBuscar').value, $('cfFGrupo').value, $('cfFEstado').value, $('cfFTrab').value].filter(Boolean).length;
    $('cfFiltrosBadge').textContent = activos ? activos : '';
    $('cfTotal').textContent = `(${lista.length} de ${st.cargos.length})`;
    pintarKpis();

    $('cfTbody').innerHTML = lista.length ? lista.map(c => `
      <tr data-cargo="${e(c.cargo)}" class="${c.cargo === st.seleccionado ? 'sel' : ''}">
        <td><strong>${e(c.cargo)}</strong></td>
        <td>${e(c.grupoNomina || '—')}</td>
        <td class="cf-num">${c.activos}</td>
        <td class="cf-num" style="color:var(--text-muted)">${c.retirados}</td>
        <td><span class="cf-badge ${claseEstado(c.estado)}">${e(c.estado)}</span></td>
        <td class="cf-num">${c.versionPublicada ? 'v' + String(c.versionPublicada).padStart(2, '0') : '—'}</td>
        <td style="font-size:.78rem; color:var(--text-muted)">${c.fechaEmision ? fecha(c.fechaEmision) : '—'}</td>
      </tr>`).join('')
      : '<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted);">No hay cargos con esos filtros.</td></tr>';
    $('cfTbody').querySelectorAll('tr[data-cargo]').forEach(tr => tr.addEventListener('click', () => {
      const cargo = tr.dataset.cargo;
      if (cargo === st.seleccionado) return;
      confirmarSalida(() => abrirCargo(cargo));
    }));
  }

  function pintarKpis() {
    const cnt = (fn) => st.cargos.filter(fn).length;
    const estadoSel = $('cfFEstado').value;
    const kpi = (num, lbl, estado) => `<div class="cf-kpi ${estado !== null && estadoSel === estado ? 'activo' : ''}" data-estado="${estado === null ? '' : e(estado)}"><div class="cf-kpi-num">${num}</div><div class="cf-kpi-lbl">${lbl}</div></div>`;
    $('cfKpis').innerHTML =
      kpi(st.cargos.length, 'Cargos', '') +
      kpi(cnt(c => c.estado === 'Publicado'), 'Publicados', 'Publicado') +
      kpi(cnt(c => c.estado === 'Cambios sin publicar'), 'Cambios sin publicar', 'Cambios sin publicar') +
      kpi(cnt(c => c.estado === 'Sin manual' || c.estado === 'Borrador'), 'Sin publicar', 'Sin manual') +
      kpi(cnt(c => c.activos > 0 && !c.versionPublicada), 'Con activos y sin manual', null);
    $('cfKpis').querySelectorAll('.cf-kpi').forEach(k => k.addEventListener('click', () => {
      if (k.dataset.estado === '' && k.querySelector('.cf-kpi-lbl').textContent === 'Con activos y sin manual') {
        $('cfFTrab').value = 'Con activos'; $('cfFEstado').value = 'Sin manual';
      } else {
        $('cfFEstado').value = k.dataset.estado;
      }
      pintarTabla();
    }));
  }

  function fecha(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
  }

  // ── Detalle ─────────────────────────────────────────────────────────────
  function hayCambios() { return !!st.detalle && JSON.stringify(datosEditor()) !== st.original; }

  function confirmarSalida(siguiente) {
    if (hayCambios() && !confirm('Tienes cambios sin guardar en este manual. ¿Salir sin guardar?')) return;
    siguiente();
  }

  function abrirPanel() {
    $('cfDet').classList.add('abierto');
    $('cfLayout').classList.add('detalle');
    document.querySelectorAll('#cfTbody tr').forEach(tr => tr.classList.toggle('sel', tr.dataset.cargo === st.seleccionado));
  }

  function cerrarDetalle() {
    st.seleccionado = null; st.detalle = null; st.original = '';
    $('cfDet').classList.remove('abierto');
    $('cfLayout').classList.remove('detalle');
    document.querySelectorAll('#cfTbody tr').forEach(tr => tr.classList.remove('sel'));
  }

  async function abrirCargo(cargo, mantenerEditor) {
    st.seleccionado = cargo;
    abrirPanel();
    if (!mantenerEditor) {
      $('cfDetHdr').innerHTML = `<div class="cf-det-titulo"><h3>${e(cargo)}</h3></div>`;
      $('cfDetBody').innerHTML = '<div style="padding:20px; color:var(--text-muted);">Cargando manual...</div>';
    }
    try {
      const d = await api(`/cargo?cargo=${encodeURIComponent(cargo)}`);
      st.puedeEditar = !!d.puedeEditar;
      st.detalle = JSON.parse(JSON.stringify(d.cargo));
      st.sstComun = d.cargo.sstComun || [];
      pintarDetalle();
      st.original = JSON.stringify(datosEditor());
    } catch (err) {
      $('cfDetBody').innerHTML = `<div class="cf-aviso">${e(err.message)}</div>`;
    }
  }

  function pintarDetalle() {
    const d = st.detalle; const ed = st.puedeEditar;
    const est = d.versionPublicada ? (d.cambiosSinPublicar ? 'Cambios sin publicar' : 'Publicado') : (d.tieneFicha ? 'Borrador' : 'Sin manual');
    const datosCat = st.cargos.find(c => c.cargo === d.cargo) || {};
    $('cfDetHdr').innerHTML = `
      <div class="cf-det-titulo">
        <h3>${e(d.cargo)}</h3>
        <span style="display:flex; gap:6px; align-items:center;">
          <span class="cf-badge ${claseEstado(est)}">${e(est)}${d.versionPublicada ? ' · v' + String(d.versionPublicada).padStart(2, '0') : ''}</span>
          <button type="button" class="cf-ib cf-cerrar-esc" data-cf="cerrar" title="Cerrar" aria-label="Cerrar">✕</button>
        </span>
      </div>
      <div class="cf-det-sub">${e(d.grupoNomina || 'Sin grupo de nómina')} · ${datosCat.activos || 0} activos · ${datosCat.retirados || 0} retirados${d.usuarioActualiza ? ` · Última edición: ${e(d.usuarioActualiza)}` : ''}</div>
      <div class="cf-acciones">
        <button type="button" class="btn btn-outline" id="cfBtnPrevia">👁 Vista previa</button>
        ${ed ? `
          <button type="button" class="btn btn-outline" id="cfBtnCopiar">⧉ Copiar de otro cargo</button>
          <button type="button" class="btn btn-outline" id="cfBtnGuardar">💾 Guardar</button>
          <button type="button" class="btn btn-primary" id="cfBtnPublicar">🚀 Publicar versión</button>` : ''}
      </div>`;

    const avisos = [];
    if (!d.versionPublicada) avisos.push('Este cargo no tiene manual publicado: los aspirantes de este cargo <strong>no pueden firmar</strong> el Manual de funciones hasta que se publique.');
    else if (d.cambiosSinPublicar) avisos.push('Hay cambios guardados que aún no se publican. Al firmar se usa la versión publicada.');
    if (!ed) avisos.push('Solo lectura: CoorSelección o Sistema pueden editar y publicar.');

    $('cfDetBody').innerHTML = `
      ${avisos.map((a, i) => `<div class="${i === avisos.length - 1 && !ed ? 'cf-info' : 'cf-aviso'}">${a}</div>`).join('')}
      <div class="cf-aviso" id="cfAvisoDup" style="display:none;"></div>
      <div class="cf-sec">
        <div class="cf-sec-hdr"><span class="cf-sec-tit">Identificación, perfil y rendición de cuentas</span></div>
        <div class="cf-grid">
          ${CAMPOS.map(c => `
            <div class="cf-campo ${c.ancho ? 'ancho' : ''}">
              <label for="cfF-${c.k}">${c.l}</label>
              ${ed
                ? (c.area
                  ? `<textarea id="cfF-${c.k}" data-campo="${c.k}" rows="3">${e(d.ficha[c.k] || '')}</textarea>`
                  : `<input id="cfF-${c.k}" data-campo="${c.k}" value="${e(d.ficha[c.k] || '')}" placeholder="${e(c.ph || '')}" ${c.lista ? 'list="cfLista-' + c.k + '"' : ''}>${c.lista ? `<datalist id="cfLista-${c.k}">${c.lista.map(v => `<option value="${e(v)}">`).join('')}</datalist>` : ''}`)
                : `<div class="valor">${e(d.ficha[c.k] || '—')}</div>`}
            </div>`).join('')}
        </div>
      </div>
      ${SECCIONES.map(s => seccionLista(s)).join('')}
      <div class="cf-sec">
        <div class="cf-sec-hdr"><span class="cf-sec-tit">Control de cambios</span></div>
        ${d.versiones.length ? `<table class="cf-vers"><thead><tr><th>Versión</th><th>Emisión</th><th>Descripción</th><th></th></tr></thead><tbody>
          ${d.versiones.map(v => `<tr><td><strong>v${String(v.version).padStart(2, '0')}</strong></td><td>${fecha(v.fechaEmision)}</td>
            <td>${e(v.descripcion)}${v.usuario ? `<div style="font-size:.7rem; color:var(--text-muted)">${e(v.usuario)}</div>` : ''}</td>
            <td>${v.tieneContenido ? `<button type="button" class="cf-ib" style="width:auto; padding:0 8px;" data-version="${v.version}" title="Ver esta versión">Ver</button>` : ''}</td></tr>`).join('')}
        </tbody></table>` : '<div style="font-size:.8rem; color:var(--text-muted);">Aún no hay versiones publicadas.</div>'}
      </div>`;

    $('cfBtnPrevia').addEventListener('click', () => vistaPrevia());
    if (ed) {
      $('cfBtnGuardar').addEventListener('click', guardar);
      $('cfBtnPublicar').addEventListener('click', modalPublicar);
      $('cfBtnCopiar').addEventListener('click', modalCopiar);
      const chk = $('cfUsaComun');
      if (chk) chk.addEventListener('change', () => { $('cfComunBox').style.display = chk.checked ? 'block' : 'none'; actualizarEtiquetaSst(); });
    }
    $('cfDetBody').querySelectorAll('[data-version]').forEach(b => b.addEventListener('click', () => vistaPrevia(Number(b.dataset.version))));
    SECCIONES.forEach(s => activarLista(s.clave));
    revisarDuplicados();
  }

  function seccionLista(s) {
    const d = st.detalle; const ed = st.puedeEditar; const lista = d[s.clave] || [];
    let extra = '';
    if (s.clave === 'sst') {
      extra = `
        ${ed ? `<label class="cf-check"><input type="checkbox" id="cfUsaComun" ${d.usaSstComun ? 'checked' : ''}> Incluir las responsabilidades SST comunes (${st.sstComun.length})</label>` : ''}
        <details class="cf-comun" id="cfComunBox" style="display:${d.usaSstComun ? 'block' : 'none'};">
          <summary>Responsabilidades SST comunes (${st.sstComun.length}) — se editan en «SST comunes»</summary>
          <ol>${st.sstComun.map(t => `<li>${e(t)}</li>`).join('')}</ol>
        </details>
        <div class="cf-info" id="cfEtiquetaSst" style="margin-bottom:6px;"></div>`;
    }
    return `
      <div class="cf-sec">
        <div class="cf-sec-hdr"><span class="cf-sec-tit">${s.titulo}<span class="cnt" id="cfCnt-${s.clave}">(${lista.length})</span></span></div>
        ${extra}
        <ol class="cf-lista" id="cfL-${s.clave}">${lista.map(t => itemHtml(t)).join('')}</ol>
        ${ed ? `<div class="cf-lista-btns">
          <button type="button" class="btn btn-outline" data-agregar="${s.clave}">+ Agregar renglón</button>
          <button type="button" class="btn btn-outline" data-pegar="${s.clave}" title="Pega varias líneas: cada línea queda como un renglón">📋 Pegar varios</button>
        </div>` : ''}
      </div>`;
  }

  function itemHtml(texto) {
    if (!st.puedeEditar) return `<li class="cf-item"><div class="texto">${e(texto)}</div></li>`;
    return `<li class="cf-item" draggable="false">
      <textarea rows="1" placeholder="Escribe el renglón...">${e(texto)}</textarea>
      <span class="cf-item-btns">
        <button type="button" class="cf-ib mover" title="Arrastrar para mover" data-mover>⠿</button>
        <button type="button" class="cf-ib" title="Subir" data-subir>↑</button>
        <button type="button" class="cf-ib" title="Bajar" data-bajar>↓</button>
        <button type="button" class="cf-ib borrar" title="Quitar" data-quitar>✕</button>
      </span>
    </li>`;
  }

  function autoAlto(t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; }

  function activarLista(clave) {
    const ol = $(`cfL-${clave}`);
    if (!ol) return;
    ol.querySelectorAll('textarea').forEach(autoAlto);
    if (!st.puedeEditar) return;
    ol.addEventListener('input', ev => { if (ev.target.tagName === 'TEXTAREA') { autoAlto(ev.target); revisarDuplicados(); } });
    ol.addEventListener('click', ev => {
      const li = ev.target.closest('.cf-item'); if (!li) return;
      if (ev.target.closest('[data-quitar]')) {
        const t = li.querySelector('textarea').value.trim();
        if (t && !confirm('¿Quitar este renglón?')) return;
        li.remove();
      } else if (ev.target.closest('[data-subir]') && li.previousElementSibling) {
        ol.insertBefore(li, li.previousElementSibling);
      } else if (ev.target.closest('[data-bajar]') && li.nextElementSibling) {
        ol.insertBefore(li.nextElementSibling, li);
      } else return;
      contar(clave); revisarDuplicados();
    });
    // Arrastrar (el asa activa el arrastre para no estorbar al escribir)
    ol.addEventListener('mousedown', ev => { const li = ev.target.closest('.cf-item'); if (li) li.draggable = !!ev.target.closest('[data-mover]'); });
    ol.addEventListener('dragstart', ev => { const li = ev.target.closest('.cf-item'); if (!li) return; li.classList.add('arrastrando'); ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', ''); });
    ol.addEventListener('dragend', ev => { const li = ev.target.closest('.cf-item'); if (li) { li.classList.remove('arrastrando'); li.draggable = false; } ol.querySelectorAll('.sobre').forEach(x => x.classList.remove('sobre')); revisarDuplicados(); });
    ol.addEventListener('dragover', ev => {
      const mov = ol.querySelector('.arrastrando'); if (!mov) return;
      ev.preventDefault();
      const li = ev.target.closest('.cf-item');
      ol.querySelectorAll('.sobre').forEach(x => x.classList.remove('sobre'));
      if (li && li !== mov) li.classList.add('sobre');
    });
    ol.addEventListener('drop', ev => {
      const mov = ol.querySelector('.arrastrando'); const li = ev.target.closest('.cf-item');
      if (!mov) return; ev.preventDefault();
      if (li && li !== mov) ol.insertBefore(mov, li); else if (!li) ol.appendChild(mov);
    });
    const sec = ol.parentElement;
    sec.querySelector(`[data-agregar="${clave}"]`).addEventListener('click', () => {
      ol.insertAdjacentHTML('beforeend', itemHtml(''));
      const t = ol.lastElementChild.querySelector('textarea'); autoAlto(t); t.focus();
      contar(clave);
    });
    sec.querySelector(`[data-pegar="${clave}"]`).addEventListener('click', () => modalPegar(clave));
  }

  function contar(clave) {
    const ol = $(`cfL-${clave}`); const c = $(`cfCnt-${clave}`);
    if (ol && c) c.textContent = `(${ol.children.length})`;
    if (clave === 'sst') actualizarEtiquetaSst();
  }

  function actualizarEtiquetaSst() {
    const el = $('cfEtiquetaSst'); if (!el) return;
    const usa = $('cfUsaComun') ? $('cfUsaComun').checked : st.detalle.usaSstComun;
    const propias = ($('cfL-sst') || { children: [] }).children.length;
    el.textContent = usa
      ? `En el documento salen las ${st.sstComun.length} comunes y debajo estas ${propias} propias del cargo.`
      : `En el documento salen solo estas ${propias} responsabilidades (no incluye las comunes).`;
  }

  function listaDe(clave) {
    const ol = $(`cfL-${clave}`);
    if (!ol) return st.detalle ? st.detalle[clave] || [] : [];
    if (!st.puedeEditar) return st.detalle[clave] || [];
    return [...ol.querySelectorAll('textarea')].map(t => t.value.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  function datosEditor() {
    if (!st.detalle) return null;
    if (st.seleccionado === '__SST_COMUN__') return { lista: listaDe('sst') };
    const ficha = {};
    CAMPOS.forEach(c => { const el = $(`cfF-${c.k}`); ficha[c.k] = el ? el.value.trim() : (st.detalle.ficha[c.k] || ''); });
    return {
      cargo: st.detalle.cargo,
      ficha,
      responsabilidades: listaDe('responsabilidades'),
      funciones: listaDe('funciones'),
      sst: listaDe('sst'),
      usaSstComun: $('cfUsaComun') ? $('cfUsaComun').checked : !!st.detalle.usaSstComun,
    };
  }

  function revisarDuplicados() {
    const items = [];
    SECCIONES.forEach(s => {
      const ol = $(`cfL-${s.clave}`); if (!ol) return;
      [...ol.children].forEach(li => {
        const t = li.querySelector('textarea') ? li.querySelector('textarea').value : li.textContent;
        items.push({ li, n: norm(t).replace(/[.,;:]+$/, ''), sec: s.titulo });
      });
    });
    const cuenta = {};
    items.forEach(i => { if (i.n) cuenta[i.n] = (cuenta[i.n] || 0) + 1; });
    let dups = 0;
    items.forEach(i => { const d = i.n && cuenta[i.n] > 1; i.li.classList.toggle('dup', !!d); if (d) dups++; });
    const aviso = $('cfAvisoDup');
    if (aviso) {
      aviso.style.display = dups ? 'block' : 'none';
      aviso.textContent = dups ? `Hay ${dups} renglones repetidos (marcados en amarillo). Revisa si deben quedar en una sola sección.` : '';
    }
  }

  async function guardar() {
    const datos = datosEditor();
    const btn = $('cfBtnGuardar'); btn.disabled = true;
    try {
      const d = await api('/cargo', { method: 'PUT', body: JSON.stringify(datos) });
      st.detalle = d.cargo; st.sstComun = d.cargo.sstComun || st.sstComun;
      pintarDetalle();
      st.original = JSON.stringify(datosEditor());
      toast('Manual guardado. Recuerda publicarlo para que se use al firmar.', 'success');
      actualizarFila(d.cargo);
      return true;
    } catch (err) {
      toast(err.message, 'error');
      return false;
    } finally { if ($('cfBtnGuardar')) $('cfBtnGuardar').disabled = false; }
  }

  function actualizarFila(det) {
    cargar().then(() => { st.seleccionado = det.cargo; document.querySelectorAll('#cfTbody tr').forEach(tr => tr.classList.toggle('sel', tr.dataset.cargo === det.cargo)); });
  }

  // ── SST comunes ─────────────────────────────────────────────────────────
  async function abrirSstComun() {
    st.seleccionado = '__SST_COMUN__';
    abrirPanel();
    $('cfDetBody').innerHTML = '<div style="padding:20px; color:var(--text-muted);">Cargando...</div>';
    try {
      const d = await api('/sst-comun');
      st.puedeEditar = !!d.puedeEditar;
      st.sstComun = d.lista || [];
      st.detalle = { cargo: '__SST_COMUN__', sst: st.sstComun.slice(), ficha: {} };
      const ed = st.puedeEditar;
      $('cfDetHdr').innerHTML = `
        <div class="cf-det-titulo"><h3>🦺 Responsabilidades SST comunes</h3><button type="button" class="cf-ib cf-cerrar-esc" data-cf="cerrar" title="Cerrar" aria-label="Cerrar">✕</button></div>
        <div class="cf-det-sub">Las heredan los cargos que tienen marcada la opción «Incluir las responsabilidades SST comunes».</div>
        <div class="cf-acciones">
          ${ed ? '<button type="button" class="btn btn-primary" id="cfBtnGuardarComun">💾 Guardar</button>' : ''}
        </div>`;
      $('cfDetBody').innerHTML = `
        <div class="cf-info">Al guardar, los cargos publicados que usan estas responsabilidades quedan con «Cambios sin publicar»: el cambio llega al documento cuando se publique de nuevo cada cargo.</div>
        <div class="cf-aviso" id="cfAvisoDup" style="display:none;"></div>
        ${seccionLista({ clave: 'sst', titulo: 'Responsabilidades SST comunes' }).replace(/<label class="cf-check">[\s\S]*?<\/label>/, '').replace(/<details[\s\S]*?<\/details>/, '').replace(/<div class="cf-info" id="cfEtiquetaSst"[^>]*><\/div>/, '')}`;
      activarLista('sst');
      revisarDuplicados();
      st.original = JSON.stringify(datosEditor());
      if (ed) $('cfBtnGuardarComun').addEventListener('click', async () => {
        try {
          const r = await api('/sst-comun', { method: 'PUT', body: JSON.stringify({ lista: listaDe('sst') }) });
          st.sstComun = r.lista; st.detalle.sst = r.lista.slice();
          st.original = JSON.stringify(datosEditor());
          toast('Responsabilidades SST comunes guardadas.', 'success');
          cargar();
        } catch (err) { toast(err.message, 'error'); }
      });
    } catch (err) {
      $('cfDetBody').innerHTML = `<div class="cf-aviso">${e(err.message)}</div>`;
    }
  }

  // ── Modales ─────────────────────────────────────────────────────────────
  function abrirModal(titulo, cuerpo, pie, grande) {
    $('cfModalTitulo').textContent = titulo;
    $('cfModalBody').innerHTML = cuerpo;
    $('cfModalFtr').innerHTML = pie || '';
    $('cfModalFtr').style.display = pie ? 'flex' : 'none';
    $('cfModalBox').classList.toggle('grande', !!grande);
    $('cfModal').classList.add('abierto');
  }
  function cerrarModal() { $('cfModal').classList.remove('abierto'); $('cfModalBody').innerHTML = ''; }

  async function vistaPrevia(version) {
    abrirModal(version ? `Versión v${String(version).padStart(2, '0')} — ${st.detalle.cargo}` : `Vista previa — ${st.detalle.cargo}`,
      '<div style="color:var(--text-muted);">Generando vista previa...</div>', '', true);
    try {
      const cuerpo = { cargo: st.detalle.cargo };
      if (version) cuerpo.version = version; else if (st.puedeEditar) cuerpo.borrador = datosEditor();
      const d = await api('/vista-previa', { method: 'POST', body: JSON.stringify(cuerpo) });
      $('cfModalBody').innerHTML = `${!version && st.puedeEditar && hayCambios() ? '<div class="cf-info" style="margin:0;">Incluye los cambios del editor que aún no guardas.</div>' : ''}<iframe id="cfPrevia" title="Vista previa del manual"></iframe>`;
      $('cfPrevia').srcdoc = d.html;
    } catch (err) {
      $('cfModalBody').innerHTML = `<div class="cf-aviso">${e(err.message)}</div>`;
    }
  }

  function modalPublicar() {
    const d = st.detalle;
    const sig = (d.versiones[0] ? d.versiones[0].version : 0) + 1;
    abrirModal('Publicar nueva versión', `
      <div>Se publicará la <strong>versión ${String(sig).padStart(2, '0')}</strong> del manual de <strong>${e(d.cargo)}</strong> con fecha de hoy. Desde ese momento es la que firman los aspirantes de este cargo.</div>
      ${hayCambios() ? '<div class="cf-info" style="margin:0;">Primero se guardan los cambios del editor.</div>' : ''}
      <div><label for="cfDescCambio">Descripción del cambio (control de cambios)</label>
      <textarea id="cfDescCambio" rows="3" maxlength="500" placeholder="Ej.: Actualización de funciones según revisión documental"></textarea></div>`,
      `<button type="button" class="btn btn-outline" data-cf="cerrar-modal">Cancelar</button><button type="button" class="btn btn-primary" id="cfConfirmarPublicar">🚀 Publicar</button>`);
    setTimeout(() => $('cfDescCambio').focus(), 50);
    $('cfConfirmarPublicar').addEventListener('click', async () => {
      const desc = $('cfDescCambio').value.trim();
      if (!desc) { toast('Escribe la descripción del cambio.', 'error'); return; }
      const btn = $('cfConfirmarPublicar'); btn.disabled = true;
      try {
        if (hayCambios() && !(await guardar())) { btn.disabled = false; return; }
        const r = await api('/publicar', { method: 'POST', body: JSON.stringify({ cargo: d.cargo, descripcion: desc }) });
        cerrarModal();
        st.detalle = r.cargo; pintarDetalle(); st.original = JSON.stringify(datosEditor());
        toast(`Versión ${String(r.cargo.versionPublicada).padStart(2, '0')} publicada.`, 'success');
        actualizarFila(r.cargo);
      } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
    });
  }

  function modalPegar(clave) {
    abrirModal('Pegar varios renglones', `
      <div style="color:var(--text-muted);">Pega el texto (por ejemplo, copiado del manual en Word o PDF). Cada línea queda como un renglón al final de la lista; las líneas vacías se ignoran.</div>
      <textarea id="cfPegarTxt" rows="12" placeholder="Una función por línea..."></textarea>
      <label class="cf-check"><input type="checkbox" id="cfPegarUnir"> Unir líneas cortadas (si una línea no termina en punto, se une con la siguiente)</label>`,
      `<button type="button" class="btn btn-outline" data-cf="cerrar-modal">Cancelar</button><button type="button" class="btn btn-primary" id="cfPegarOk">Agregar</button>`);
    setTimeout(() => $('cfPegarTxt').focus(), 50);
    $('cfPegarOk').addEventListener('click', () => {
      let lineas = $('cfPegarTxt').value.split(/\r?\n/).map(l => l.replace(/^\s*(?:[-•*·]|\d+[.)])\s*/, '').trim());
      if ($('cfPegarUnir').checked) {
        const unidas = []; let actual = '';
        lineas.forEach(l => {
          if (!l) { if (actual) { unidas.push(actual); actual = ''; } return; }
          actual = actual ? `${actual} ${l}` : l;
          if (/[.;:!?)]$/.test(l)) { unidas.push(actual); actual = ''; }
        });
        if (actual) unidas.push(actual);
        lineas = unidas;
      }
      lineas = lineas.filter(Boolean);
      if (!lineas.length) { toast('No hay líneas para agregar.', 'error'); return; }
      const ol = $(`cfL-${clave}`);
      ol.insertAdjacentHTML('beforeend', lineas.map(itemHtml).join(''));
      ol.querySelectorAll('textarea').forEach(autoAlto);
      contar(clave); revisarDuplicados(); cerrarModal();
      toast(`${lineas.length} renglones agregados. Revisa y guarda.`, 'success');
    });
  }

  function modalCopiar() {
    const origenes = st.cargos.filter(c => c.cargo !== st.detalle.cargo && c.estado !== 'Sin manual');
    if (!origenes.length) { toast('No hay otros cargos con manual para copiar.', 'error'); return; }
    abrirModal('Copiar de otro cargo', `
      <div style="color:var(--text-muted);">Trae al editor el contenido guardado de otro cargo para usarlo como punto de partida. No se guarda hasta que presiones «Guardar».</div>
      <div><label for="cfCopiarDe">Cargo de origen</label><select id="cfCopiarDe">${origenes.map(c => `<option value="${e(c.cargo)}">${e(c.cargo)} — ${e(c.estado)}</option>`).join('')}</select></div>
      <div><label>Qué copiar</label>
        <label class="cf-check"><input type="checkbox" id="cfCpFicha" checked> Identificación, perfil y rendición de cuentas</label>
        <label class="cf-check"><input type="checkbox" id="cfCpListas" checked> Responsabilidades, funciones y SST</label>
      </div>
      <div class="cf-aviso" style="margin:0;">Lo que haya en el editor de ${e(st.detalle.cargo)} se reemplaza.</div>`,
      `<button type="button" class="btn btn-outline" data-cf="cerrar-modal">Cancelar</button><button type="button" class="btn btn-primary" id="cfCopiarOk">Copiar al editor</button>`);
    $('cfCopiarOk').addEventListener('click', async () => {
      try {
        const r = await api(`/cargo?cargo=${encodeURIComponent($('cfCopiarDe').value)}`);
        const o = r.cargo; const original = st.original;
        if ($('cfCpFicha').checked) st.detalle.ficha = { ...o.ficha };
        else st.detalle.ficha = datosEditor().ficha;
        if ($('cfCpListas').checked) {
          st.detalle.responsabilidades = o.responsabilidades.slice();
          st.detalle.funciones = o.funciones.slice();
          st.detalle.sst = o.sst.slice();
          st.detalle.usaSstComun = o.usaSstComun;
        } else {
          const act = datosEditor();
          Object.assign(st.detalle, { responsabilidades: act.responsabilidades, funciones: act.funciones, sst: act.sst, usaSstComun: act.usaSstComun });
        }
        cerrarModal(); pintarDetalle(); st.original = original;
        toast(`Contenido de ${o.cargo} copiado. Ajusta lo necesario y guarda.`, 'success');
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  function modalNuevoCargo() {
    abrirModal('Nuevo cargo', `
      <div style="color:var(--text-muted);">Se crea en el catálogo de cargos (Config_Cargo_Laboral) y queda disponible en Requisiciones, Nómina y Actas. Luego agregas su manual de funciones.</div>
      <div><label for="cfNCargo">Nombre del cargo</label><input id="cfNCargo" maxlength="50" placeholder="Ej.: AUXILIAR DE BODEGA" style="text-transform:uppercase;"></div>
      <div><label for="cfNGrupo">Grupo de nómina</label><select id="cfNGrupo"><option value="">Selecciona...</option><option>Operativo</option><option>Administrativo</option></select></div>
      <div><label for="cfNNotif">Grupo de notificación de ingreso</label><select id="cfNNotif"><option value="">Sin grupo</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select>
        <div style="font-size:.72rem; color:var(--text-muted); margin-top:3px;">Define a quién se avisa cuando ingresa un trabajador con este cargo (igual que los demás cargos).</div></div>
      <label class="cf-check"><input type="checkbox" id="cfNCopiar"> Empezar copiando el manual de otro cargo</label>
      <select id="cfNCopiarDe" style="display:none;">${st.cargos.filter(c => c.estado !== 'Sin manual').map(c => `<option value="${e(c.cargo)}">${e(c.cargo)}</option>`).join('')}</select>`,
      `<button type="button" class="btn btn-outline" data-cf="cerrar-modal">Cancelar</button><button type="button" class="btn btn-primary" id="cfNOk">Crear cargo</button>`);
    setTimeout(() => $('cfNCargo').focus(), 50);
    $('cfNCopiar').addEventListener('change', () => { $('cfNCopiarDe').style.display = $('cfNCopiar').checked ? 'block' : 'none'; });
    $('cfNOk').addEventListener('click', async () => {
      const btn = $('cfNOk'); btn.disabled = true;
      try {
        const copiarDe = $('cfNCopiar').checked ? $('cfNCopiarDe').value : '';
        const r = await api('/cargos', { method: 'POST', body: JSON.stringify({ cargo: $('cfNCargo').value, grupoNomina: $('cfNGrupo').value, notificar: $('cfNNotif').value }) });
        cerrarModal();
        toast(`Cargo ${r.cargo} creado.`, 'success');
        await cargar();
        await abrirCargo(r.cargo);
        if (copiarDe) {
          const o = (await api(`/cargo?cargo=${encodeURIComponent(copiarDe)}`)).cargo;
          Object.assign(st.detalle, { ficha: { ...o.ficha }, responsabilidades: o.responsabilidades.slice(), funciones: o.funciones.slice(), sst: o.sst.slice(), usaSstComun: o.usaSstComun });
          const original = st.original; pintarDetalle(); st.original = original;
          toast(`Contenido de ${o.cargo} copiado: ajusta y guarda.`, 'info');
        }
      } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
    });
  }

  // ── Entrada ─────────────────────────────────────────────────────────────
  window.inicializarCargosFunciones = function () {
    montar();
    if (!st.iniciado) { st.iniciado = true; cargar(); }
  };
  window.recargarCargosFunciones = function () {
    montar();
    return cargar().then(() => { if (st.seleccionado && !hayCambios()) (st.seleccionado === '__SST_COMUN__' ? abrirSstComun() : abrirCargo(st.seleccionado)); });
  };
})();
