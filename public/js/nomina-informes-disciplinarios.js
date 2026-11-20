/* Nómina › Informes Disciplinarios
 * Listado de informes (cada usuario ve los suyos; los roles de 'Roles que ven todos los informes
 * disciplinarios' ven todos), formulario en ventana (/informes-disciplinarios/form) y detalle con el
 * seguimiento de Jurídica (anotar, cerrar con resultado, regenerar PDF) y los documentos del proceso.
 * API: src/routes/informesDisciplinarios.js. Usa del index de Nómina: usuario, makeTableResizable(),
 * registrarModalBack() / cerrarModalBack() (modal-back.js) y _tabActual.
 */
(function () {
  'use strict';

  const API = '/informes-disciplinarios';
  const st = { iniciado: false, informes: [], permisos: {}, estado: '', q: '', falta: '', orden: { col: 'fecha', dir: 'desc' }, timer: null, detalle: null };
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const usuarioActual = () => (typeof usuario !== 'undefined' ? usuario : new URLSearchParams(location.search).get('usuario'));
  const api = (ruta, opciones = {}) => fetch(`${API}${ruta}${ruta.includes('?') ? '&' : '?'}usuario=${encodeURIComponent(usuarioActual())}`, {
    ...opciones, headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined,
  }).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Error de conexión'); return d; });
  const fecha = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };
  const fechaHora = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d) ? String(v) : d.toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const ESTADOS = { Borrador: 'idis-b-borrador', Recibido: 'idis-b-recibido', Cerrado: 'idis-b-cerrado' };

  function estilos() {
    if ($('idis-estilos')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="idis-estilos">
      .idis-chips { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
      .idis-chip { border:1.5px solid var(--border); background:var(--card-bg); border-radius:10px; padding:10px 16px; cursor:pointer; min-width:120px; text-align:left; font-family:inherit; color:var(--text); }
      .idis-chip strong { display:block; font-size:1.25rem; }
      .idis-chip span { font-size:.74rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px; font-weight:700; }
      .idis-chip.activo { border-color:var(--primary); background:var(--accent-soft); }
      .idis-badge { display:inline-block; padding:3px 10px; border-radius:999px; font-size:.72rem; font-weight:700; }
      .idis-b-borrador { background:var(--bg-elevated); color:var(--text-muted); border:1px dashed var(--border-strong, #94a3b8); }
      .idis-b-recibido { background:var(--warning-soft, #fef3c7); color:var(--warning-dark, #92400e); }
      .idis-b-cerrado { background:var(--success-soft, #dcfce7); color:var(--success-dark, #166534); }
      .idis-det { padding:18px 20px; overflow-y:auto; flex:1; color:var(--text); }
      .idis-sec { margin-bottom:18px; }
      .idis-sec h4 { font-size:.74rem; text-transform:uppercase; letter-spacing:.8px; color:var(--text-muted); margin:0 0 8px; border-bottom:1px solid var(--border); padding-bottom:5px; }
      .idis-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:10px 18px; font-size:.86rem; }
      .idis-grid label { display:block; font-size:.72rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; letter-spacing:.4px; }
      .idis-texto { white-space:pre-line; font-size:.86rem; line-height:1.5; background:var(--bg-elevated); border-radius:8px; padding:10px 12px; }
      .idis-fotos { display:grid; grid-template-columns:repeat(auto-fill, minmax(110px, 1fr)); gap:8px; }
      .idis-fotos a { display:block; aspect-ratio:1; border-radius:6px; overflow:hidden; border:1px solid var(--border); }
      .idis-fotos img { width:100%; height:100%; object-fit:cover; }
      .idis-linea { border-left:3px solid var(--primary); padding:6px 10px; margin-bottom:8px; background:var(--bg-elevated); border-radius:0 6px 6px 0; font-size:.84rem; }
      .idis-linea small { display:block; color:var(--text-muted); font-size:.74rem; }
      .idis-linea.cierre { border-left-color:var(--success, #16a34a); }
      .idis-acc { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .idis-acc textarea, .idis-acc select { width:100%; padding:8px 10px; border:1.5px solid var(--border); border-radius:6px; background:var(--card-bg); color:var(--text); font-family:inherit; font-size:.86rem; }
      .idis-btn { border:1.5px solid var(--primary); background:var(--card-bg); color:var(--primary); padding:7px 14px; border-radius:6px; font-weight:700; font-size:.82rem; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; gap:6px; }
      .idis-btn.lleno { background:var(--primary); color:var(--text-inverse, #fff); }
      .idis-btn.peligro { border-color:var(--danger, #dc2626); color:var(--danger, #dc2626); }
      .idis-btn:disabled { opacity:.55; cursor:not-allowed; }
      .idis-hd { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; }
    </style>`);
  }

  function montar() {
    estilos();
    $('panelInformesDisciplinarios').innerHTML = `
      <div class="page-hd idis-hd">
        <div>
          <div class="page-title">Nómina · Informes Disciplinarios</div>
          <div class="page-sub" id="idisSub">Reporte de novedades disciplinarias de los trabajadores para Jurídica (formato OP-R-010)</div>
        </div>
        <button type="button" class="btn-guardar-ficha" onclick="idisNuevo()">+ Nuevo informe</button>
      </div>
      <div class="idis-chips" id="idisChips"></div>
      <div class="card">
        <div class="filtros-toggle" onclick="idisToggleFiltros()">
          <span class="filtros-toggle-left">Filtros <span class="filtros-badge" id="idisBadge"></span></span>
          <input type="search" class="filtros-busqueda" id="idisBuscar" placeholder="&#128269; Buscar trabajador, cédula, radicado o quien reporta..." aria-label="Buscar" oninput="idisBuscar()" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">
          <span class="filtros-chevron" id="idisChevron">▸</span>
        </div>
        <div class="filtros-body" id="idisFiltrosBody" style="display:none">
          <div class="filtros-grid">
            <div class="filtro-field"><label>Estado</label><select id="idisEstado" onchange="idisFiltro()"><option value="">Todos</option><option>Borrador</option><option>Recibido</option><option>Cerrado</option></select></div>
            <div class="filtro-field"><label>Tipo de falta</label><select id="idisFalta" onchange="idisFiltro()"><option value="">Todos</option></select></div>
          </div>
          <button type="button" class="btn-reset" onclick="idisLimpiar()">&#8635; Limpiar filtros</button>
        </div>
      </div>
      <div class="contador-resultados" id="idisContador"></div>
      <div class="table-container">
        <table class="retiros-table" id="idisTabla">
          <thead><tr>
            <th style="width:100px" data-col="radicado">Radicado<span class="sort-indicator"></span></th>
            <th style="width:110px" data-col="fecha">Registro<span class="sort-indicator"></span></th>
            <th style="width:230px" data-col="trabajador">Trabajador<span class="sort-indicator"></span></th>
            <th style="width:210px" data-col="cargo">Cargo · Operación<span class="sort-indicator"></span></th>
            <th style="width:220px" data-col="tipoFalta">Tipo de falta<span class="sort-indicator"></span></th>
            <th style="width:110px" data-col="fechaHechos">Hechos<span class="sort-indicator"></span></th>
            <th style="width:190px" data-col="reporta" id="idisThReporta">Reporta<span class="sort-indicator"></span></th>
            <th style="width:110px" data-col="estado">Estado<span class="sort-indicator"></span></th>
          </tr></thead>
          <tbody id="idisBody"><tr><td colspan="8" class="empty-state">Cargando informes...</td></tr></tbody>
        </table>
      </div>

      <div class="modal-full-overlay" id="idisFormOverlay">
        <div class="modal-full" style="max-width:820px">
          <div class="modal-full-header"><span id="idisFormTitulo">Nuevo informe disciplinario</span><button type="button" onclick="idisCerrarForm()">&#10005; Cerrar</button></div>
          <iframe id="idisIframe" src="about:blank" title="Formulario de informe disciplinario"></iframe>
        </div>
      </div>
      <div class="modal-full-overlay" id="idisDetOverlay">
        <div class="modal-full" style="max-width:860px">
          <div class="modal-full-header"><span id="idisDetTitulo">Informe disciplinario</span><button type="button" onclick="idisCerrarDetalle()">&#10005; Cerrar</button></div>
          <div class="idis-det" id="idisDetBody"></div>
        </div>
      </div>`;
    document.querySelectorAll('#idisTabla thead th[data-col]').forEach(th => th.addEventListener('click', (e) => {
      if (e.target.classList.contains('th-resize')) return;
      const col = th.dataset.col;
      st.orden = st.orden.col === col ? { col, dir: st.orden.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: ['fecha', 'fechaHechos', 'radicado'].includes(col) ? 'desc' : 'asc' };
      pintar();
    }));
    if (typeof makeTableResizable === 'function') makeTableResizable($('idisTabla'));
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data || e.data.tipo !== 'informeDisciplinario') return;
      cargar();
    });
  }

  async function cargar() {
    try {
      const d = await api('/api/informes');
      st.informes = d.informes || [];
      st.permisos = d.permisos || {};
    } catch (e) {
      $('idisBody').innerHTML = `<tr><td colspan="8" class="empty-state" style="color:var(--danger)">${esc(e.message)}</td></tr>`;
      return;
    }
    $('idisSub').textContent = st.permisos.verTodos
      ? 'Todos los informes disciplinarios registrados y sus borradores propios (formato OP-R-010)'
      : 'Informes disciplinarios que usted registró (formato OP-R-010)';
    $('idisThReporta').style.display = st.permisos.verTodos ? '' : 'none';
    const faltas = [...new Set(st.informes.map(i => i.tipoFalta).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    const sel = $('idisFalta');
    const actual = sel.value;
    sel.innerHTML = '<option value="">Todos</option>' + faltas.map(f => `<option ${f === actual ? 'selected' : ''}>${esc(f)}</option>`).join('');
    pintar();
  }

  function pintarChips() {
    const n = (e) => st.informes.filter(i => i.estado === e).length;
    const chips = [['', 'Todos', st.informes.length], ['Borrador', 'Borradores', n('Borrador')], ['Recibido', 'Recibidos', n('Recibido')], ['Cerrado', 'Cerrados', n('Cerrado')]];
    $('idisChips').innerHTML = chips.map(([e, l, c]) => `<button type="button" class="idis-chip ${st.estado === e ? 'activo' : ''}" onclick="idisChip('${e}')"><strong>${c}</strong><span>${l}</span></button>`).join('');
  }

  function pintar() {
    pintarChips();
    const q = norm(st.q);
    const lista = st.informes.filter(i => (!st.estado || i.estado === st.estado) && (!st.falta || i.tipoFalta === st.falta)
      && (!q || norm(`${i.trabajador} ${i.identificacion} ${i.radicado} ${i.reporta}`).includes(q)));
    const { col, dir } = st.orden;
    const valor = (i) => col === 'fecha' ? (i.fechaRegistro || i.fechaCreacion) : (col === 'cargo' ? `${i.cargo} ${i.operacion}` : i[col] || '');
    lista.sort((a, b) => { const r = String(valor(a)).localeCompare(String(valor(b)), 'es'); return dir === 'asc' ? r : -r; });
    document.querySelectorAll('#idisTabla thead th[data-col]').forEach(th => { th.querySelector('.sort-indicator').textContent = th.dataset.col === col ? (dir === 'asc' ? ' ▲' : ' ▼') : ''; });
    const filtros = (st.estado ? 1 : 0) + (st.falta ? 1 : 0);
    $('idisBadge').textContent = filtros || '';
    $('idisBadge').style.display = filtros ? 'inline-flex' : 'none';
    $('idisContador').textContent = `${lista.length} informe${lista.length === 1 ? '' : 's'}`;
    const verReporta = st.permisos.verTodos;
    $('idisBody').innerHTML = lista.length ? lista.map(i => `
      <tr onclick="idisAbrir('${esc(i.id)}')">
        <td style="font-family:monospace;font-weight:700">${esc(i.radicado)}</td>
        <td>${i.fechaRegistro ? fecha(i.fechaRegistro) : `<span style="color:var(--text-muted)">${fecha(i.fechaCreacion)}</span>`}</td>
        <td title="${esc(i.trabajador)}"><strong>${esc(i.trabajador) || '<span style="color:var(--text-muted)">Sin trabajador</span>'}</strong><div class="celda-fecha-hora">${esc(i.identificacion)}</div></td>
        <td title="${esc(i.cargo)} · ${esc(i.operacion)}">${esc(i.cargo) || '—'}<div class="celda-fecha-hora">${esc(i.operacion)}</div></td>
        <td title="${esc(i.tipoFalta)}">${esc(i.tipoFalta) || '—'}</td>
        <td>${fecha(i.fechaHechos)}</td>
        <td style="${verReporta ? '' : 'display:none'}" title="${esc(i.reporta)}">${esc(i.reporta)}<div class="celda-fecha-hora">${esc(i.cargoReporta)}</div></td>
        <td><span class="idis-badge ${ESTADOS[i.estado] || ''}">${esc(i.estado)}</span>${i.resultado ? `<div class="celda-fecha-hora" title="${esc(i.resultado)}">${esc(i.resultado)}</div>` : ''}</td>
      </tr>`).join('') : `<tr><td colspan="8" class="empty-state">${st.informes.length ? 'No hay informes con estos filtros.' : 'Aún no hay informes disciplinarios. Use «+ Nuevo informe» para registrar uno.'}</td></tr>`;
  }

  // ── Formulario ───────────────────────────────────────────────────────────
  function abrirForm(id) {
    $('idisFormTitulo').textContent = id ? 'Continuar informe disciplinario (borrador)' : 'Nuevo informe disciplinario';
    $('idisIframe').src = `${API}/form?usuario=${encodeURIComponent(usuarioActual())}${id ? '&id=' + encodeURIComponent(id) : ''}`;
    const ov = $('idisFormOverlay');
    ov.classList.add('open');
    if (typeof registrarModalBack === 'function') ov._backEntry = registrarModalBack(() => cerrarForm());
  }
  function cerrarForm() {
    const ov = $('idisFormOverlay');
    ov.classList.remove('open');
    if (typeof cerrarModalBack === 'function' && ov._backEntry) { cerrarModalBack(ov._backEntry); ov._backEntry = null; }
    $('idisIframe').src = 'about:blank';
    cargar();
  }

  // ── Detalle ──────────────────────────────────────────────────────────────
  async function abrirDetalle(id) {
    const inf = st.informes.find(i => i.id === id);
    const ov = $('idisDetOverlay');
    if (!ov.classList.contains('open')) {
      ov.classList.add('open');
      if (typeof registrarModalBack === 'function') ov._backEntry = registrarModalBack(() => cerrarDetalle());
    }
    if (inf && inf.estado === 'Borrador' && inf.propio) {
      $('idisDetTitulo').textContent = `Borrador ${inf.radicado}`;
      $('idisDetBody').innerHTML = `
        <div class="idis-sec"><span class="idis-badge idis-b-borrador">Borrador</span>
          <p style="margin-top:10px;font-size:.9rem">Informe sin firmar${inf.trabajador ? ` sobre <strong>${esc(inf.trabajador)}</strong>` : ''}, guardado el ${fecha(inf.fechaCreacion)}. Solo usted lo ve; Jurídica lo recibe cuando lo firme.</p></div>
        <div class="idis-acc">
          <button type="button" class="idis-btn lleno" onclick="idisCerrarDetalle(); setTimeout(() => idisContinuar('${esc(id)}'), 350)">Continuar diligenciando</button>
          <button type="button" class="idis-btn peligro" onclick="idisBorrarBorrador('${esc(id)}')">Borrar borrador</button>
        </div>`;
      return;
    }
    $('idisDetBody').innerHTML = '<div class="empty-state">Cargando informe...</div>';
    try {
      st.detalle = await api(`/api/informe/${encodeURIComponent(id)}`);
      pintarDetalle();
    } catch (e) { $('idisDetBody').innerHTML = `<div class="empty-state" style="color:var(--danger)">${esc(e.message)}</div>`; }
  }
  function cerrarDetalle() {
    const ov = $('idisDetOverlay');
    ov.classList.remove('open');
    if (typeof cerrarModalBack === 'function' && ov._backEntry) { cerrarModalBack(ov._backEntry); ov._backEntry = null; }
  }

  function pintarDetalle() {
    const { informe: i, evidencias, seguimiento, documentos, antecedentes, permisos } = st.detalle;
    $('idisDetTitulo').textContent = `Informe disciplinario ${i.radicado}`;
    const texto = (t) => `<div class="idis-texto">${esc(t) || '—'}</div>`;
    const acciones = permisos.puedeCerrar ? `
      <div class="idis-sec"><h4>Seguimiento de Jurídica</h4>
        <div class="idis-acc"><textarea id="idisNota" rows="2" placeholder="Anotación: citación a descargos, novedades, decisiones…"></textarea>
          <button type="button" class="idis-btn" onclick="idisAnotar()">Agregar anotación</button>
          <button type="button" class="idis-btn" onclick="idisRegenerar(this)">Regenerar PDF</button></div>
        ${i.estado === 'Recibido' ? `<div class="idis-acc" style="margin-top:12px">
          <select id="idisResultado"><option value="">Resultado del cierre…</option>${(permisos.resultadosCierre || []).map(r => `<option>${esc(r)}</option>`).join('')}</select>
          <textarea id="idisNotaCierre" rows="2" placeholder="Nota del cierre (opcional)"></textarea>
          <button type="button" class="idis-btn lleno" onclick="idisCerrarInforme()">Cerrar informe</button></div>` : ''}
      </div>` : '';
    $('idisDetBody').innerHTML = `
      <div class="idis-sec idis-hd">
        <div><span class="idis-badge ${ESTADOS[i.estado] || ''}">${esc(i.estado)}</span>
          ${i.resultado ? `<strong style="margin-left:8px">${esc(i.resultado)}</strong>` : ''}
          <div class="celda-fecha-hora" style="margin-top:4px">Registrado el ${fechaHora(i.fechaRegistro)} por ${esc(i.reporta)}${i.cargoReporta ? ' · ' + esc(i.cargoReporta) : ''}</div></div>
        ${i.urlDoc ? `<a class="idis-btn lleno" href="${esc(i.urlDoc)}" target="_blank" rel="noopener">&#128196; Ver PDF</a>` : '<span class="celda-fecha-hora">PDF sin generar</span>'}
      </div>
      <div class="idis-sec"><h4>Trabajador</h4><div class="idis-grid">
        <div><label>Nombre</label>${esc(i.trabajador)}</div><div><label>Identificación</label>${esc(i.identificacion)}</div>
        <div><label>Cargo</label>${esc(i.cargo) || '—'}</div><div><label>Operación</label>${esc(i.operacion) || '—'}${i.regional ? ' (' + esc(i.regional) + ')' : ''}</div>
        <div><label>Fecha de ingreso</label>${fecha(i.fechaIngreso)}</div></div></div>
      <div class="idis-sec"><h4>Falta</h4><div class="idis-grid">
        <div><label>Tipo de falta</label><strong>${esc(i.tipoFalta)}</strong></div><div><label>Fecha de los hechos</label>${fecha(i.fechaHechos)}</div></div></div>
      ${antecedentes && antecedentes.length ? `<div class="idis-sec"><h4>Antecedentes del trabajador (${antecedentes.length})</h4>${antecedentes.map(a => `<div class="idis-linea">${fecha(a.fechaHechos)} · ${esc(a.tipoFalta)}<small>${esc(a.radicado)} · ${esc(a.estado)}${a.resultado ? ' · ' + esc(a.resultado) : ''}</small></div>`).join('')}</div>` : ''}
      <div class="idis-sec"><h4>Descripción de los hechos</h4>${texto(i.descripcion)}</div>
      <div class="idis-sec"><h4>Acción inmediata</h4>${texto(i.accion)}</div>
      <div class="idis-sec"><h4>Consecuencias</h4>${texto(i.consecuencias)}</div>
      <div class="idis-sec"><h4>Forma de conocimiento</h4>${texto(i.formaConocimiento)}</div>
      ${evidencias.length || i.comentariosFotos ? `<div class="idis-sec"><h4>Evidencias</h4>
        ${evidencias.length ? `<div class="idis-fotos">${evidencias.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Evidencia" loading="lazy"></a>`).join('')}</div>` : ''}
        ${i.comentariosFotos ? `<div style="margin-top:8px">${texto(i.comentariosFotos)}</div>` : ''}</div>` : ''}
      <div class="idis-sec"><h4>Historial</h4>
        <div class="idis-linea">Recibido<small>${fechaHora(i.fechaRegistro)} · ${esc(i.reporta)}</small></div>
        ${seguimiento.map(s => `<div class="idis-linea ${s.tipo === 'Cierre' ? 'cierre' : ''}">${s.tipo === 'Cierre' ? '<strong>Cerrado:</strong> ' : ''}${esc(s.nota)}<small>${fechaHora(s.fecha)} · ${esc(s.usuario)}</small></div>`).join('')}
      </div>
      ${documentos && documentos.length ? `<div class="idis-sec"><h4>Documentos del proceso disciplinario</h4>${documentos.map(d => `<div class="idis-linea"><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.observaciones || 'Documento')}</a><small>${fechaHora(d.fecha)}${d.usuario ? ' · ' + esc(d.usuario) : ''}</small></div>`).join('')}</div>` : ''}
      ${acciones}`;
  }

  async function accionDetalle(ruta, cuerpo, boton) {
    const id = st.detalle.informe.id;
    if (boton) boton.disabled = true;
    try {
      await api(`/api/informe/${encodeURIComponent(id)}/${ruta}`, { method: 'POST', body: JSON.stringify(cuerpo || {}) });
      await abrirDetalle(id);
      cargar();
    } catch (e) { alert(e.message); if (boton) boton.disabled = false; }
  }

  // ── Funciones globales ───────────────────────────────────────────────────
  window.idisNuevo = () => abrirForm(null);
  window.idisContinuar = (id) => abrirForm(id);
  window.idisBorrarBorrador = async (id) => {
    if (!confirm('¿Borrar este borrador? No se puede deshacer.')) return;
    try { await api(`/api/informe/${encodeURIComponent(id)}`, { method: 'DELETE' }); cerrarDetalle(); cargar(); } catch (e) { alert(e.message); }
  };
  window.idisCerrarForm = cerrarForm;
  window.idisAbrir = abrirDetalle;
  window.idisCerrarDetalle = cerrarDetalle;
  window.idisChip = (e) => { st.estado = e; $('idisEstado').value = e; pintar(); };
  window.idisFiltro = () => { st.estado = $('idisEstado').value; st.falta = $('idisFalta').value; pintar(); };
  window.idisBuscar = () => { clearTimeout(st.timer); st.timer = setTimeout(() => { st.q = $('idisBuscar').value; pintar(); }, 200); };
  window.idisLimpiar = () => { st.estado = ''; st.falta = ''; st.q = ''; $('idisEstado').value = ''; $('idisFalta').value = ''; $('idisBuscar').value = ''; pintar(); };
  window.idisToggleFiltros = () => {
    const body = $('idisFiltrosBody');
    const abrir = body.style.display !== 'block';
    body.style.display = abrir ? 'block' : 'none';
    $('idisChevron').style.transform = abrir ? 'rotate(90deg)' : 'rotate(0deg)';
  };
  window.idisAnotar = () => {
    const nota = $('idisNota').value.trim();
    if (!nota) return alert('Escriba la anotación.');
    accionDetalle('seguimiento', { nota });
  };
  window.idisCerrarInforme = () => {
    const resultado = $('idisResultado').value;
    if (!resultado) return alert('Escoja el resultado del cierre.');
    if (!confirm(`¿Cerrar el informe con resultado «${resultado}»?`)) return;
    accionDetalle('cerrar', { resultado, nota: $('idisNotaCierre').value.trim() });
  };
  window.idisRegenerar = (btn) => { if (confirm('¿Regenerar el PDF con la plantilla vigente?')) accionDetalle('regenerar', {}, btn); };
  window.recargarInformesDisciplinarios = () => (st.iniciado ? cargar() : null);

  window.inicializarInformesDisciplinarios = function () {
    if (st.iniciado) return;
    st.iniciado = true;
    montar();
    cargar().then(() => {
      // ?informe=<id> (enlace del correo) abre el detalle
      const id = new URLSearchParams(location.search).get('informe');
      if (id) abrirDetalle(id);
    });
  };

  // La pestaña pudo escogerse al cargar la página antes de que este archivo existiera
  if (typeof _tabActual !== 'undefined' && _tabActual === 'informesdisciplinarios') window.inicializarInformesDisciplinarios();
})();
