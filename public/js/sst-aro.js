/* SST › ARO (Análisis de Riesgo por Oficio, SST-FM-054)
 * Como Prueba de Consumo: se escogen los trabajadores de una operación (cargos de Config_Parametros sst / ARO),
 * se genera el enlace de firma y se comparte por WhatsApp, correo o copiándolo; el trabajador lee y firma, y el
 * PDF queda en su carpeta como documento 7. API: src/routes/aro.js. Usa del hub de SST: CONFIG.usuarioId,
 * registrarModalBack() / cerrarModalBack() (modal-back.js).
 */
(function () {
  'use strict';

  const API = '/aro';
  const st = { iniciado: false, aros: [], permisos: {}, opsPorRegional: {}, cargos: [], estado: '', q: '', regional: '', operacion: '', timer: null, trabajadores: [] };
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const usuario = () => (typeof CONFIG !== 'undefined' && CONFIG.usuarioId) || new URLSearchParams(location.search).get('usuario');
  const api = (ruta, opciones = {}) => fetch(`${API}${ruta}${ruta.includes('?') ? '&' : '?'}usuario=${encodeURIComponent(usuario())}`, {
    ...opciones, headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined,
  }).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Error de conexión'); return d; });
  const fecha = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d) ? String(v).slice(0, 10) : d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  const textoWhatsApp = (nombre, url) => `Hola ${nombre}, Seguridad y Salud en el Trabajo de LOG&SER le comparte el Análisis de Riesgo por Oficio de su cargo para que lo lea y lo firme: ${url}`;
  const enlaceWhatsApp = (celular, nombre, url) => {
    const num = String(celular || '').replace(/\D/g, '');
    return `https://wa.me/${num.length === 10 ? '57' + num : num}?text=${encodeURIComponent(textoWhatsApp(nombre, url))}`;
  };

  function estilos() {
    if ($('aro-estilos')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="aro-estilos">
      .aro-chips { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
      .aro-chip { border:1.5px solid var(--border); background:var(--card-bg); border-radius:10px; padding:10px 16px; cursor:pointer; min-width:120px; text-align:left; font-family:inherit; color:var(--text); }
      .aro-chip strong { display:block; font-size:1.25rem; }
      .aro-chip span { font-size:.72rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px; font-weight:700; }
      .aro-chip.activo { border-color:var(--accent); box-shadow:0 0 0 2px var(--accent-soft, rgba(245,84,0,.15)); }
      .aro-acc { display:flex; gap:6px; flex-wrap:wrap; }
      .aro-ico { border:1px solid var(--border); background:var(--card-bg); color:var(--text); border-radius:6px; padding:4px 9px; font-size:.78rem; cursor:pointer; text-decoration:none; font-family:inherit; white-space:nowrap; }
      .aro-ico:hover { background:var(--bg-elevated); }
      .aro-ico.peligro { color:var(--danger); border-color:var(--danger); }
      .aro-modal { max-width:760px; width:96%; max-height:92vh; background:var(--card-bg); border-radius:12px; box-shadow:0 20px 25px -5px rgba(0,0,0,.2); display:flex; flex-direction:column; overflow:hidden; border-top:5px solid var(--accent); }
      .aro-modal-hd { display:flex; justify-content:space-between; align-items:center; padding:14px 18px; border-bottom:1px solid var(--border); font-weight:700; color:var(--text); }
      .aro-modal-bd { padding:16px 18px; overflow-y:auto; flex:1; color:var(--text); }
      .aro-modal-ft { padding:12px 18px; border-top:1px solid var(--border); display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; align-items:center; }
      .aro-trab { display:flex; align-items:center; gap:10px; padding:7px 4px; border-bottom:1px solid var(--border); font-size:.86rem; cursor:pointer; }
      .aro-trab input { width:17px; height:17px; flex:none; }
      .aro-trab .nom { flex:1; min-width:0; }
      .aro-trab small { color:var(--text-muted); display:block; font-size:.75rem; }
      .aro-tag { font-size:.7rem; font-weight:700; border-radius:999px; padding:2px 8px; white-space:nowrap; }
      .aro-tag.ok { background:var(--success-soft); color:var(--success-dark); }
      .aro-tag.pend { background:var(--warning-soft); color:var(--warning-dark); }
      .aro-tag.no { background:var(--bg-elevated); color:var(--text-muted); }
      .aro-res { border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:8px; font-size:.86rem; }
      .aro-res input { width:100%; margin:6px 0; padding:6px 8px; border:1px solid var(--border); border-radius:6px; background:var(--bg-elevated); color:var(--text); font-size:.78rem; }
    </style>`);
  }

  function montar() {
    estilos();
    $('pane-aro').innerHTML = `
      <div class="tab-header">
        <div class="tab-header-left">
          <h1 class="tab-title"><span>🦺 ARO — Análisis de Riesgo por Oficio</span><span class="badge badge-info" id="aro-total">0 Registros</span></h1>
          <p class="tab-subtitle">SST-FM-054 · Descargue y cargue de mercancía: notificación y firma del trabajador</p>
        </div>
        <div class="tab-actions">
          <button class="btn btn-accent" id="aro-btn-generar" style="display:none" onclick="aroAbrirGenerar()"><span>➕</span> Generar ARO</button>
        </div>
      </div>
      <div class="aro-chips" id="aro-chips"></div>
      <div class="card-filters">
        <div class="filtros-toggle" onclick="aroToggleFiltros()">
          <span class="filtros-toggle-left">Filtros <span class="filtros-badge" id="aro-badge">0</span></span>
          <input type="search" class="form-control filtros-busqueda" id="aro-buscar" placeholder="🔍 Buscar trabajador (nombre o C.C.)..." aria-label="Buscar" oninput="aroBuscar()" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">
          <span class="filtros-chevron" id="aro-chevron">▸</span>
        </div>
        <div class="filtros-body" id="aro-filtros" style="display:none">
          <div class="filters-grid">
            <div class="form-group"><label class="form-label">Regional</label><select class="form-control" id="aro-f-regional" onchange="aroFiltro('regional')"><option value="">Todas</option></select></div>
            <div class="form-group"><label class="form-label">Operación</label><select class="form-control" id="aro-f-operacion" onchange="aroFiltro()"><option value="">Todas</option></select></div>
            <div class="form-group"><label class="form-label">Estado de firma</label><select class="form-control" id="aro-f-estado" onchange="aroFiltro()"><option value="">Todos</option><option value="pendiente">Pendientes</option><option value="firmado">Firmados</option></select></div>
            <div class="form-group"><button class="btn btn-secondary btn-sm" onclick="aroLimpiar()" style="height:38px;">Limpiar</button></div>
          </div>
        </div>
      </div>
      <div class="table-card"><div class="table-container">
        <table class="data-table" id="aro-tabla">
          <thead><tr>
            <th style="width:100px">Radicado</th><th style="width:240px">Trabajador</th><th style="width:170px">Cargo</th>
            <th style="width:170px">Operación</th><th style="width:130px">Estado</th><th style="width:170px">Generado</th><th style="width:250px">Acciones</th>
          </tr></thead>
          <tbody id="aro-body"><tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">Cargando ARO...</td></tr></tbody>
        </table>
      </div></div>

      <div class="modal-overlay" id="aro-modal" onclick="if(event.target === this) aroCerrarGenerar();">
        <div class="aro-modal">
          <div class="aro-modal-hd"><span id="aro-modal-titulo">➕ Generar ARO</span><button type="button" class="modal-close" onclick="aroCerrarGenerar()">&times;</button></div>
          <div class="aro-modal-bd" id="aro-modal-bd"></div>
          <div class="aro-modal-ft" id="aro-modal-ft"></div>
        </div>
      </div>`;
  }

  async function cargar() {
    try {
      const d = await api('/api/aros');
      st.aros = d.aros || [];
      st.permisos = d.permisos || {};
      st.opsPorRegional = d.opsPorRegional || {};
      st.cargos = d.cargos || [];
    } catch (e) {
      $('aro-body').innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--danger)">${esc(e.message)}</td></tr>`;
      return;
    }
    $('aro-btn-generar').style.display = st.permisos.crear ? '' : 'none';
    const selR = $('aro-f-regional');
    const regs = [...new Set(st.aros.map(a => a.regional).filter(Boolean))].sort();
    selR.innerHTML = '<option value="">Todas</option>' + regs.map(r => `<option ${r === st.regional ? 'selected' : ''}>${esc(r)}</option>`).join('');
    pintarOperaciones();
    pintar();
  }

  function pintarOperaciones() {
    const ops = [...new Set(st.aros.filter(a => !st.regional || a.regional === st.regional).map(a => a.operacion).filter(Boolean))].sort();
    if (st.operacion && !ops.includes(st.operacion)) st.operacion = '';
    $('aro-f-operacion').innerHTML = '<option value="">Todas</option>' + ops.map(o => `<option ${o === st.operacion ? 'selected' : ''}>${esc(o)}</option>`).join('');
  }

  function pintar() {
    const base = st.aros.filter(a => (!st.regional || a.regional === st.regional) && (!st.operacion || a.operacion === st.operacion)
      && (!st.q || norm(`${a.trabajador} ${a.identificacion} ${a.radicado}`).includes(norm(st.q))));
    const n = { '': base.length, pendiente: base.filter(a => !a.firmado).length, firmado: base.filter(a => a.firmado).length };
    $('aro-chips').innerHTML = [['', 'Todos'], ['pendiente', 'Pendientes de firma'], ['firmado', 'Firmados']]
      .map(([e, l]) => `<button type="button" class="aro-chip ${st.estado === e ? 'activo' : ''}" onclick="aroChip('${e}')"><strong>${n[e]}</strong><span>${l}</span></button>`).join('');
    const lista = base.filter(a => !st.estado || (st.estado === 'firmado' ? a.firmado : !a.firmado));
    $('aro-total').textContent = `${lista.length} Registro${lista.length === 1 ? '' : 's'}`;
    const filtros = (st.regional ? 1 : 0) + (st.operacion ? 1 : 0) + (st.estado ? 1 : 0);
    $('aro-badge').textContent = filtros;
    const p = st.permisos;
    $('aro-body').innerHTML = lista.length ? lista.map(a => {
      const acciones = a.firmado
        ? `<a class="aro-ico" href="${esc(a.urlDoc)}" target="_blank" rel="noopener">📄 PDF</a>${p.editarFirmado ? `<button class="aro-ico" onclick="aroRegenerar('${esc(a.id)}', this)">↻ Regenerar</button>` : ''}${p.eliminarFirmado ? `<button class="aro-ico peligro" onclick="aroEliminar('${esc(a.id)}', true)">🗑</button>` : ''}`
        : `<button class="aro-ico" onclick="aroCopiar('${esc(a.urlFirma)}')">🔗 Copiar enlace</button>
           ${a.celular ? `<a class="aro-ico" href="${esc(enlaceWhatsApp(a.celular, a.trabajador, a.urlFirma))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
           ${p.crear && p.correoHabilitado && a.tieneEmail ? `<button class="aro-ico" onclick="aroCorreo('${esc(a.id)}', this)">✉ Correo</button>` : ''}
           <a class="aro-ico" href="${esc(a.urlFirma)}" target="_blank" rel="noopener" title="Abrir para que firme en este equipo">✍ Firmar aquí</a>
           ${p.eliminar && (p.esSistema || a.propio) ? `<button class="aro-ico peligro" onclick="aroEliminar('${esc(a.id)}', false)">🗑</button>` : ''}`;
      return `<tr>
        <td style="font-family:monospace;font-weight:700">${esc(a.radicado)}</td>
        <td><strong>${esc(a.trabajador)}</strong><div style="font-size:.75rem;color:var(--text-muted)">C.C. ${esc(a.identificacion)}</div></td>
        <td>${esc(a.cargo)}</td>
        <td>${esc(a.operacion)}<div style="font-size:.75rem;color:var(--text-muted)">${esc(a.regional)}</div></td>
        <td>${a.firmado ? `<span class="badge badge-success">Firmado</span><div style="font-size:.75rem;color:var(--text-muted)">${fecha(a.fechaFirma)}</div>` : '<span class="badge badge-warning">Pendiente</span>'}</td>
        <td>${fecha(a.fechaCreacion)}<div style="font-size:.75rem;color:var(--text-muted)">${esc(a.creador)}</div></td>
        <td><div class="aro-acc">${acciones}</div></td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">${st.aros.length ? 'No hay ARO con estos filtros.' : 'Aún no se ha generado ningún ARO. Use «Generar ARO» para notificar a los trabajadores.'}</td></tr>`;
  }

  // ── Generar ARO (uno o varios trabajadores de una operación) ─────────────
  function abrirModal() {
    const ov = $('aro-modal');
    ov.style.display = 'flex';
    if (typeof registrarModalBack === 'function' && !ov._backEntry) ov._backEntry = registrarModalBack(() => cerrarModal());
  }
  function cerrarModal() {
    const ov = $('aro-modal');
    ov.style.display = 'none';
    if (typeof cerrarModalBack === 'function' && ov._backEntry) { cerrarModalBack(ov._backEntry); ov._backEntry = null; }
  }

  function abrirGenerar() {
    const regs = Object.keys(st.opsPorRegional).sort();
    $('aro-modal-titulo').textContent = '➕ Generar ARO';
    $('aro-modal-bd').innerHTML = `
      <p style="font-size:.86rem;color:var(--text-muted);margin-bottom:12px">Escoja la operación y los trabajadores. Solo aparecen los cargos configurados para el ARO${st.cargos.length ? ` (${esc(st.cargos.join(', '))})` : ''}.</p>
      <div class="filters-grid" style="margin-bottom:10px">
        <div class="form-group"><label class="form-label">Regional</label><select class="form-control" id="aro-g-regional" onchange="aroGenRegional()"><option value="">Seleccione…</option>${regs.map(r => `<option>${esc(r)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Operación</label><select class="form-control" id="aro-g-operacion" onchange="aroGenOperacion()" disabled><option value="">Seleccione la regional</option></select></div>
      </div>
      <div id="aro-g-lista" style="font-size:.86rem;color:var(--text-muted)">Escoja una operación para ver sus trabajadores.</div>`;
    $('aro-modal-ft').innerHTML = `
      ${st.permisos.correoHabilitado ? '<label style="display:flex;gap:6px;align-items:center;font-size:.84rem;margin-right:auto;cursor:pointer"><input type="checkbox" id="aro-g-correo"> Enviar el enlace por correo a quien tenga correo</label>' : ''}
      <button class="btn btn-secondary btn-sm" onclick="aroCerrarGenerar()">Cancelar</button>
      <button class="btn btn-accent btn-sm" id="aro-g-btn" onclick="aroGenerar()" disabled>Generar ARO</button>`;
    if (regs.length === 1) { $('aro-g-regional').value = regs[0]; genRegional(); }
    abrirModal();
  }

  function genRegional() {
    const reg = $('aro-g-regional').value;
    const ops = (st.opsPorRegional[reg] || []).slice().sort();
    const sel = $('aro-g-operacion');
    sel.disabled = !reg;
    sel.innerHTML = '<option value="">Seleccione…</option>' + ops.map(o => `<option>${esc(o)}</option>`).join('');
    $('aro-g-lista').innerHTML = 'Escoja una operación para ver sus trabajadores.';
    if (ops.length === 1) { sel.value = ops[0]; genOperacion(); }
    actualizarBoton();
  }

  async function genOperacion() {
    const op = $('aro-g-operacion').value;
    st.trabajadores = [];
    if (!op) { $('aro-g-lista').innerHTML = 'Escoja una operación para ver sus trabajadores.'; actualizarBoton(); return; }
    $('aro-g-lista').innerHTML = 'Cargando trabajadores…';
    try {
      const d = await api(`/api/trabajadores?operacion=${encodeURIComponent(op)}`);
      st.trabajadores = d.trabajadores || [];
    } catch (e) { $('aro-g-lista').innerHTML = `<span style="color:var(--danger)">${esc(e.message)}</span>`; return; }
    if (!st.trabajadores.length) { $('aro-g-lista').innerHTML = 'No hay trabajadores activos con los cargos del ARO en esta operación.'; actualizarBoton(); return; }
    const sinAro = st.trabajadores.filter(t => !t.ultimaFirma && !t.ultimoDocumento && !t.pendiente).length;
    $('aro-g-lista').innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
        <input type="search" class="form-control" id="aro-g-buscar" placeholder="🔍 Buscar…" oninput="aroGenBuscar()" style="flex:1;min-width:160px">
        <button class="aro-ico" onclick="aroGenMarcar('sin')">Marcar sin ARO (${sinAro})</button>
        <button class="aro-ico" onclick="aroGenMarcar('todos')">Todos</button>
        <button class="aro-ico" onclick="aroGenMarcar('ninguno')">Ninguno</button>
      </div>
      <div id="aro-g-items">${st.trabajadores.map((t, i) => {
        const tag = t.pendiente ? '<span class="aro-tag pend">Pendiente de firma</span>'
          : (t.ultimaFirma ? `<span class="aro-tag ok">Firmó ${fecha(t.ultimaFirma)}</span>`
            : (t.ultimoDocumento ? `<span class="aro-tag ok">ARO cargado ${fecha(t.ultimoDocumento)}</span>` : '<span class="aro-tag no">Sin ARO</span>'));
        return `<label class="aro-trab" data-i="${i}" data-txt="${esc(norm(t.nombre + ' ' + t.identificacion))}"><input type="checkbox" data-id="${esc(t.identificacion)}" onchange="aroGenContar()"><span class="nom">${esc(t.nombre)}<small>C.C. ${esc(t.identificacion)} · ${esc(t.cargo)}</small></span>${tag}</label>`;
      }).join('')}</div>`;
    actualizarBoton();
  }

  function marcados() { return [...document.querySelectorAll('#aro-g-items input[type=checkbox]:checked')].map(c => c.dataset.id); }
  function actualizarBoton() {
    const btn = $('aro-g-btn');
    if (!btn) return;
    const n = marcados().length;
    btn.disabled = !n;
    btn.textContent = n ? `Generar ARO (${n})` : 'Generar ARO';
  }

  async function generar() {
    const ids = marcados();
    if (!ids.length) return;
    const btn = $('aro-g-btn');
    btn.disabled = true; btn.textContent = 'Generando…';
    try {
      const d = await api('/api/crear', { method: 'POST', body: JSON.stringify({ identificaciones: ids, enviarCorreo: !!($('aro-g-correo') && $('aro-g-correo').checked) }) });
      mostrarResultados(d.resultados || []);
      cargar();
    } catch (e) { alert(e.message); actualizarBoton(); }
  }

  function mostrarResultados(resultados) {
    const ok = resultados.filter(r => r.urlFirma);
    $('aro-modal-titulo').textContent = `✅ ARO generado${ok.length === 1 ? '' : 's'} (${ok.length})`;
    $('aro-modal-bd').innerHTML = `
      <p style="font-size:.86rem;color:var(--text-muted);margin-bottom:12px">Comparta el enlace con cada trabajador para que lea y firme. ${ok.some(r => r.reutilizado) ? 'A quienes ya tenían un ARO pendiente se les mantuvo el mismo enlace.' : ''}</p>
      ${resultados.map(r => r.urlFirma ? `
        <div class="aro-res"><strong>${esc(r.trabajador)}</strong> <span style="color:var(--text-muted);font-size:.78rem">C.C. ${esc(r.identificacion)}${r.correo ? ' · correo enviado' : ''}${r.reutilizado ? ' · ya estaba pendiente' : ''}</span>
          <input type="text" readonly value="${esc(r.urlFirma)}" onclick="this.select()">
          <div class="aro-acc"><button class="aro-ico" onclick="aroCopiar('${esc(r.urlFirma)}')">🔗 Copiar</button>
            ${r.celular ? `<a class="aro-ico" href="${esc(enlaceWhatsApp(r.celular, r.trabajador, r.urlFirma))}" target="_blank" rel="noopener">WhatsApp</a>` : '<span style="font-size:.75rem;color:var(--text-muted)">Sin celular registrado</span>'}
            <a class="aro-ico" href="${esc(r.urlFirma)}" target="_blank" rel="noopener">✍ Firmar aquí</a></div>
        </div>` : `<div class="aro-res" style="color:var(--danger)">C.C. ${esc(r.identificacion)}: ${esc(r.error)}</div>`).join('')}`;
    $('aro-modal-ft').innerHTML = '<button class="btn btn-accent btn-sm" onclick="aroCerrarGenerar()">Listo</button>';
  }

  // ── Funciones globales ───────────────────────────────────────────────────
  window.aroAbrirGenerar = abrirGenerar;
  window.aroCerrarGenerar = cerrarModal;
  window.aroGenRegional = genRegional;
  window.aroGenOperacion = genOperacion;
  window.aroGenContar = actualizarBoton;
  window.aroGenerar = generar;
  window.aroGenBuscar = () => {
    const q = norm($('aro-g-buscar').value);
    document.querySelectorAll('#aro-g-items .aro-trab').forEach(el => { el.style.display = !q || el.dataset.txt.includes(q) ? '' : 'none'; });
  };
  window.aroGenMarcar = (modo) => {
    document.querySelectorAll('#aro-g-items .aro-trab').forEach(el => {
      const t = st.trabajadores[Number(el.dataset.i)];
      const cb = el.querySelector('input');
      if (el.style.display === 'none') return;
      cb.checked = modo === 'todos' ? true : (modo === 'ninguno' ? false : (!t.ultimaFirma && !t.ultimoDocumento && !t.pendiente));
    });
    actualizarBoton();
  };
  window.aroChip = (e) => { st.estado = e; $('aro-f-estado').value = e; pintar(); };
  window.aroFiltro = (campo) => {
    st.regional = $('aro-f-regional').value;
    if (campo === 'regional') pintarOperaciones();
    st.operacion = $('aro-f-operacion').value;
    st.estado = $('aro-f-estado').value;
    pintar();
  };
  window.aroBuscar = () => { clearTimeout(st.timer); st.timer = setTimeout(() => { st.q = $('aro-buscar').value; pintar(); }, 200); };
  window.aroLimpiar = () => { st.regional = st.operacion = st.estado = st.q = ''; $('aro-buscar').value = ''; $('aro-f-regional').value = ''; $('aro-f-estado').value = ''; pintarOperaciones(); pintar(); };
  window.aroToggleFiltros = () => {
    const b = $('aro-filtros');
    const abrir = b.style.display !== 'block';
    b.style.display = abrir ? 'block' : 'none';
    $('aro-chevron').style.transform = abrir ? 'rotate(90deg)' : 'rotate(0deg)';
  };
  window.aroCopiar = async (url) => {
    try { await navigator.clipboard.writeText(url); alert('Enlace copiado. Péguelo en el chat o correo del trabajador.'); }
    catch (e) { prompt('Copie el enlace:', url); }
  };
  window.aroCorreo = async (id, btn) => {
    btn.disabled = true;
    try { const d = await api(`/api/aro/${encodeURIComponent(id)}/enviar-correo`, { method: 'POST', body: '{}' }); alert(`Enlace enviado a ${d.email}.`); }
    catch (e) { alert(e.message); }
    finally { btn.disabled = false; }
  };
  window.aroRegenerar = async (id, btn) => {
    if (!confirm('¿Regenerar el PDF con la plantilla vigente? Se conservan las firmas.')) return;
    btn.disabled = true;
    try { await api(`/api/aro/${encodeURIComponent(id)}/regenerar`, { method: 'POST', body: '{}' }); await cargar(); alert('PDF regenerado.'); }
    catch (e) { alert(e.message); btn.disabled = false; }
  };
  window.aroEliminar = async (id, firmado) => {
    if (!confirm(firmado ? '¿Eliminar este ARO firmado? También se quita el documento de la carpeta del trabajador.' : '¿Eliminar este ARO pendiente? El enlace dejará de funcionar.')) return;
    try { await api(`/api/aro/${encodeURIComponent(id)}`, { method: 'DELETE' }); cargar(); }
    catch (e) { alert(e.message); }
  };
  window.recargarAroSst = () => (st.iniciado ? cargar() : null);

  window.inicializarAroSst = function () {
    if (!st.iniciado) { st.iniciado = true; montar(); }
    cargar();
  };
})();
