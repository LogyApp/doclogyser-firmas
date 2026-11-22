/* SST › Documentación Inicial › INGE (Comprobante de Inducción General, SST-F-050)
 * Como EVIN: se escogen los trabajadores de una operación y el tipo (Inducción o Reinducción) y se genera el enlace;
 * el trabajador marca SI o NO en los 41 temas, lee la declaración y firma. El PDF queda en su carpeta como documento
 * 32 (solo el último). Firma como Analista SST quien lo registra y la firma del Líder SST sale sola. Avisa cuando el
 * trabajador marcó temas en NO. API: src/routes/inge.js. Usa del hub de SST: CONFIG.usuarioId,
 * registrarModalBack() / cerrarModalBack(), iconoSst() y docInicial (sst-docinicial.js).
 */
(function () {
  'use strict';

  const API = '/inge';
  const st = { iniciado: false, inges: [], permisos: {}, opsPorRegional: {}, cargos: [], total: 41, tipos: [], analista: {}, lider: {},
    estado: '', tipo: '', q: '', regional: '', operacion: '', timer: null, trabajadores: [] };
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
  const textoWhatsApp = (nombre, url) => `Hola ${nombre}, Seguridad y Salud en el Trabajo de LOG&SER le comparte el Comprobante de Inducción General para que marque los temas que recibió y lo firme: ${url}`;
  const enlaceWhatsApp = (celular, nombre, url) => {
    const num = String(celular || '').replace(/\D/g, '');
    return `https://wa.me/${num.length === 10 ? '57' + num : num}?text=${encodeURIComponent(textoWhatsApp(nombre, url))}`;
  };

  function estilos() {
    if ($('inge-estilos')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="inge-estilos">
      .inge-acc { display:flex; gap:6px; flex-wrap:wrap; }
      .inge-ico { border:1px solid var(--border); background:var(--card-bg); color:var(--text); border-radius:6px; padding:4px 9px; font-size:.78rem; cursor:pointer; text-decoration:none; font-family:inherit; white-space:nowrap; }
      .inge-ico:hover { background:var(--bg-elevated); }
      .inge-aviso { font-size:.74rem; font-weight:700; margin-top:4px; color:var(--warning-dark); }
      .inge-modal { max-width:780px; width:96%; max-height:92vh; background:var(--card-bg); border-radius:12px; box-shadow:0 20px 25px -5px rgba(0,0,0,.2); display:flex; flex-direction:column; overflow:hidden; border-top:5px solid var(--accent); }
      .inge-modal-hd { display:flex; justify-content:space-between; align-items:center; padding:14px 18px; border-bottom:1px solid var(--border); font-weight:700; color:var(--text); }
      .inge-modal-bd { padding:16px 18px; overflow-y:auto; flex:1; color:var(--text); }
      .inge-modal-ft { padding:12px 18px; border-top:1px solid var(--border); display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; align-items:center; }
      .inge-resp { background:var(--bg-elevated); border:1px solid var(--border); border-radius:8px; padding:8px 12px; font-size:.82rem; margin-bottom:12px; }
      .inge-resp .sin-firma { color:var(--warning-dark); }
      .inge-trab { display:flex; align-items:center; gap:10px; padding:7px 4px; border-bottom:1px solid var(--border); font-size:.86rem; cursor:pointer; }
      .inge-trab input { width:17px; height:17px; flex:none; }
      .inge-trab .nom { flex:1; min-width:0; }
      .inge-trab small { color:var(--text-muted); display:block; font-size:.75rem; }
      .inge-tag { font-size:.7rem; font-weight:700; border-radius:999px; padding:2px 8px; white-space:nowrap; }
      .inge-tag.ok { background:var(--success-soft); color:var(--success-dark); }
      .inge-tag.pend { background:var(--warning-soft); color:var(--warning-dark); }
      .inge-tag.no { background:var(--bg-elevated); color:var(--text-muted); }
      .inge-res { border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:8px; font-size:.86rem; }
      .inge-res input { width:100%; margin:6px 0; padding:6px 8px; border:1px solid var(--border); border-radius:6px; background:var(--bg-elevated); color:var(--text); font-size:.78rem; }
    </style>`);
  }

  function montar() {
    estilos();
    $('pane-inge').innerHTML = `
      <div class="tab-header">
        <div class="tab-header-left">
          <h1 class="tab-title"><span>✅ INGE — Inducción General</span><span class="badge badge-info" id="inge-total">0 Registros</span><span class="badge badge-warning" id="inge-accion" style="display:none;cursor:pointer" title="Ver los que tienen temas en NO" onclick="ingeVerNovedad()"></span></h1>
          <p class="tab-subtitle">SST-F-050 · El trabajador marca los temas que recibió en la inducción y firma</p>
        </div>
        <div class="tab-actions">
          <button class="btn btn-accent" id="inge-btn-generar" style="display:none" onclick="ingeAbrirGenerar()"><span>➕</span> Generar INGE</button>
        </div>
      </div>
      <div class="card-filters">
        <div class="filtros-toggle" onclick="ingeToggleFiltros()">
          <span class="filtros-toggle-left">Filtros <span class="filtros-badge" id="inge-badge">0</span></span>
          <input type="search" class="form-control filtros-busqueda" id="inge-buscar" placeholder="🔍 Buscar trabajador (nombre o C.C.)..." aria-label="Buscar" oninput="ingeBuscar()" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">
          <span class="filtros-chevron" id="inge-chevron">▸</span>
        </div>
        <div class="filtros-body" id="inge-filtros" style="display:none">
          <div class="filters-grid">
            <div class="form-group"><label class="form-label">Regional</label><select class="form-control" id="inge-f-regional" onchange="ingeFiltro()"><option value="">Todas</option></select></div>
            <div class="form-group"><label class="form-label">Operación</label><select class="form-control" id="inge-f-operacion" onchange="ingeFiltro()"><option value="">Todas</option></select></div>
            <div class="form-group"><label class="form-label">Tipo</label><select class="form-control" id="inge-f-tipo" onchange="ingeFiltro()"><option value="">Todos</option></select></div>
            <div class="form-group"><label class="form-label">Estado</label><select class="form-control" id="inge-f-estado" onchange="ingeFiltro()"><option value="">Todos</option></select></div>
            <div class="form-group"><button class="btn btn-secondary btn-sm" onclick="ingeLimpiar()" style="height:38px;">Limpiar</button></div>
          </div>
        </div>
      </div>
      <div class="table-card"><div class="table-container">
        <table class="data-table" id="inge-tabla">
          <thead>${docInicial.encabezado('inge-tabla', {
            columnas: COLUMNAS, orden: { clave: 'generado', dir: 'desc' }, anchoAcciones: 150, alOrdenar: () => pintar(),
          })}</thead>
          <tbody id="inge-body"><tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">Cargando comprobantes...</td></tr></tbody>
        </table>
      </div></div>

      <div class="modal-overlay" id="inge-modal" onclick="if(event.target === this) ingeCerrarGenerar();">
        <div class="inge-modal">
          <div class="inge-modal-hd"><span id="inge-modal-titulo">➕ Generar INGE</span><button type="button" class="modal-close" onclick="ingeCerrarGenerar()">&times;</button></div>
          <div class="inge-modal-bd" id="inge-modal-bd"></div>
          <div class="inge-modal-ft" id="inge-modal-ft"></div>
        </div>
      </div>`;
    docInicial.activar('inge-tabla');
  }

  const COLUMNAS = [
    { clave: 'radicado', titulo: 'Radicado', ancho: 100, valor: a => a.radicado },
    { clave: 'trabajador', titulo: 'Trabajador', ancho: 230, valor: a => a.trabajador },
    { clave: 'cargo', titulo: 'Cargo · Operación', ancho: 190, valor: a => `${a.cargo} ${a.operacion}` },
    { clave: 'tipo', titulo: 'Tipo', ancho: 120, valor: a => a.tipo },
    { clave: 'temas', titulo: 'Temas recibidos', ancho: 210, valor: a => (a.firmado ? st.total - a.temasNo : -1) },
    { clave: 'generado', titulo: 'Generado', ancho: 170, valor: a => String(a.fechaCreacion || '') },
  ];

  async function cargar() {
    try {
      const d = await api('/api/inges');
      st.inges = d.inges || [];
      st.permisos = d.permisos || {};
      st.opsPorRegional = d.opsPorRegional || {};
      st.cargos = d.cargos || [];
      st.total = d.totalTemas || 41;
      st.tipos = d.tipos || ['Inducción', 'Reinducción'];
      st.analista = d.analista || {};
      st.lider = d.lider || {};
    } catch (e) {
      $('inge-body').innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--danger)">${esc(e.message)}</td></tr>`;
      return;
    }
    $('inge-btn-generar').style.display = st.permisos.crear ? '' : 'none';
    pintar();
  }

  const FILTROS_ESTADO = {
    pendiente: (a) => !a.firmado,
    completo: (a) => a.firmado && !a.temasNo,
    novedad: (a) => a.firmado && a.temasNo > 0,
  };
  const ESTADOS = [['pendiente', 'Pendientes'], ['completo', 'Firmados: todos los temas'], ['novedad', 'Con temas en NO']];
  const PRUEBAS = {
    regional: (a, v) => a.regional === v,
    operacion: (a, v) => a.operacion === v,
    tipo: (a, v) => a.tipo === v,
    estado: (a, v) => FILTROS_ESTADO[v](a),
  };

  function celdaTemas(a) {
    if (!a.firmado) return '<span class="badge badge-warning">Pendiente</span>';
    return `<span class="badge ${a.temasNo ? 'badge-warning' : 'badge-success'}">Firmado · ${st.total - a.temasNo} de ${st.total}</span>
      <div style="font-size:.75rem;color:var(--text-muted)">${fecha(a.fechaFirma)}</div>
      ${a.temasNo ? `<div class="inge-aviso">⚠️ ${a.temasNo} tema${a.temasNo === 1 ? '' : 's'} en NO · reforzar con el trabajador</div>` : ''}`;
  }

  function pintar() {
    const buscados = st.inges.filter(a => !st.q || norm(`${a.trabajador} ${a.identificacion} ${a.radicado}`).includes(norm(st.q)));
    const sin = docInicial.facetas(buscados, PRUEBAS, { regional: st.regional, operacion: st.operacion, tipo: st.tipo, estado: st.estado });
    docInicial.select($('inge-f-regional'), { opciones: docInicial.distintos(st.inges, 'regional'), base: sin('regional'), prueba: PRUEBAS.regional, actual: st.regional, todos: 'Todas' });
    docInicial.select($('inge-f-operacion'), { opciones: docInicial.distintos(sin('operacion'), 'operacion'), base: sin('operacion'), prueba: PRUEBAS.operacion, actual: st.operacion, todos: 'Todas' });
    docInicial.select($('inge-f-tipo'), { opciones: st.tipos.map(t => [t, t]), base: sin('tipo'), prueba: PRUEBAS.tipo, actual: st.tipo });
    docInicial.select($('inge-f-estado'), { opciones: ESTADOS, base: sin('estado'), prueba: PRUEBAS.estado, actual: st.estado });
    const lista = docInicial.ordenar('inge-tabla', sin(null));
    $('inge-total').textContent = `${lista.length} Registro${lista.length === 1 ? '' : 's'}`;
    const nNovedad = st.inges.filter(FILTROS_ESTADO.novedad).length;
    $('inge-accion').style.display = nNovedad ? '' : 'none';
    $('inge-accion').textContent = `⚠️ ${nNovedad} con temas en NO`;
    $('inge-badge').textContent = (st.regional ? 1 : 0) + (st.operacion ? 1 : 0) + (st.tipo ? 1 : 0) + (st.estado ? 1 : 0);
    const p = st.permisos;
    $('inge-body').innerHTML = lista.length ? lista.map(a => {
      const id = esc(a.id);
      const acciones = a.firmado
        ? iconoSst('pdf', '#dc2626', 'Abrir PDF', { href: a.urlDoc })
          + (p.editarFirmado ? iconoSst('regenerar', '#0284c7', 'Regenerar PDF', { onclick: `ingeRegenerar('${id}', this)` }) : '')
          + (p.eliminarFirmado ? iconoSst('eliminar', '#b91c1c', 'Eliminar comprobante firmado', { onclick: `ingeEliminar('${id}', true)` }) : '')
        : iconoSst('enlace', '#6366f1', 'Copiar enlace del comprobante', { onclick: `ingeCopiar('${esc(a.urlFirma)}')` })
          + (a.celular ? iconoSst('whatsapp', '#25d366', 'Enviar por WhatsApp', { href: enlaceWhatsApp(a.celular, a.trabajador, a.urlFirma) }) : '')
          + (p.crear && p.correoHabilitado && a.tieneEmail ? iconoSst('correo', '#0ea5e9', 'Enviar enlace por correo', { onclick: `ingeCorreo('${id}', this)` }) : '')
          + iconoSst('firmar', '#d97706', 'Firmar aquí (abre el comprobante en este equipo)', { href: a.urlFirma })
          + (p.eliminar && (p.esSistema || a.propio) ? iconoSst('eliminar', '#b91c1c', 'Eliminar comprobante pendiente', { onclick: `ingeEliminar('${id}', false)` }) : '');
      return `<tr>
        <td><div class="acc-iconos">${acciones}</div></td>
        <td style="font-family:monospace;font-weight:700">${esc(a.radicado)}</td>
        <td><strong>${esc(a.trabajador)}</strong><div style="font-size:.75rem;color:var(--text-muted)">C.C. ${esc(a.identificacion)}</div></td>
        <td>${esc(a.cargo)}<div style="font-size:.75rem;color:var(--text-muted)">${esc(a.operacion)}${a.ciudad ? ` · ${esc(a.ciudad)}` : ''}</div></td>
        <td>${esc(a.tipo)}</td>
        <td>${celdaTemas(a)}</td>
        <td>${fecha(a.fechaCreacion)}<div style="font-size:.75rem;color:var(--text-muted)">${esc(a.analista)}</div></td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">${st.inges.length ? 'No hay comprobantes con estos filtros.' : 'Aún no se ha generado ningún comprobante. Use «Generar INGE» para enviarlo a los trabajadores.'}</td></tr>`;
  }

  // ── Generar INGE (uno o varios trabajadores de una operación) ────────────
  function abrirModal() {
    const ov = $('inge-modal');
    ov.style.display = 'flex';
    if (typeof registrarModalBack === 'function' && !ov._backEntry) ov._backEntry = registrarModalBack(() => cerrarModal());
  }
  function cerrarModal() {
    const ov = $('inge-modal');
    ov.style.display = 'none';
    if (typeof cerrarModalBack === 'function' && ov._backEntry) { cerrarModalBack(ov._backEntry); ov._backEntry = null; }
  }

  function abrirGenerar() {
    const regs = Object.keys(st.opsPorRegional).sort();
    const a = st.analista;
    const l = st.lider;
    $('inge-modal-titulo').textContent = '➕ Generar INGE';
    $('inge-modal-bd').innerHTML = `
      <div class="inge-resp">Firma como <strong>Analista SST</strong>: ${esc(a.nombre || '—')}${a.cargo ? ` · ${esc(a.cargo)}` : ''}
        ${a.tieneFirma ? '' : '<br><span class="sin-firma">⚠️ No tiene firma registrada: el PDF saldrá sin su firma. Regístrela en su perfil antes de generar.</span>'}
        <br>Firma como <strong>Líder SST</strong> (sale sola al firmar el trabajador): ${esc(l.nombre || '—')}
        ${l.nombre && !l.tieneFirma ? '<br><span class="sin-firma">⚠️ La Líder SST no tiene firma registrada.</span>' : ''}</div>
      <div class="filters-grid" style="margin-bottom:10px">
        <div class="form-group"><label class="form-label">Tipo</label><select class="form-control" id="inge-g-tipo">${st.tipos.map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Regional</label><select class="form-control" id="inge-g-regional" onchange="ingeGenRegional()"><option value="">Seleccione…</option>${regs.map(x => `<option>${esc(x)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Operación</label><select class="form-control" id="inge-g-operacion" onchange="ingeGenOperacion()" disabled><option value="">Seleccione la regional</option></select></div>
      </div>
      <div id="inge-g-lista" style="font-size:.86rem;color:var(--text-muted)">Escoja una operación para ver sus trabajadores${st.cargos.length ? ` (cargos: ${esc(st.cargos.join(', '))})` : ''}.</div>`;
    $('inge-modal-ft').innerHTML = `
      ${st.permisos.correoHabilitado ? '<label style="display:flex;gap:6px;align-items:center;font-size:.84rem;margin-right:auto;cursor:pointer"><input type="checkbox" id="inge-g-correo"> Enviar el enlace por correo a quien tenga correo</label>' : ''}
      <button class="btn btn-secondary btn-sm" onclick="ingeCerrarGenerar()">Cancelar</button>
      <button class="btn btn-accent btn-sm" id="inge-g-btn" onclick="ingeGenerar()" disabled>Generar INGE</button>`;
    if (regs.length === 1) { $('inge-g-regional').value = regs[0]; genRegional(); }
    abrirModal();
  }

  function genRegional() {
    const reg = $('inge-g-regional').value;
    const ops = (st.opsPorRegional[reg] || []).slice().sort();
    const sel = $('inge-g-operacion');
    sel.disabled = !reg;
    sel.innerHTML = '<option value="">Seleccione…</option>' + ops.map(o => `<option>${esc(o)}</option>`).join('');
    $('inge-g-lista').innerHTML = 'Escoja una operación para ver sus trabajadores.';
    if (ops.length === 1) { sel.value = ops[0]; genOperacion(); }
    actualizarBoton();
  }

  function etiquetaTrabajador(t) {
    if (t.pendiente) return '<span class="inge-tag pend">Pendiente de firma</span>';
    if (t.ultimaFirma) return `<span class="inge-tag ok">Firmó ${fecha(t.ultimaFirma)}</span>`;
    if (t.ultimoDocumento) return `<span class="inge-tag ok">INGE cargado ${fecha(t.ultimoDocumento)}</span>`;
    return '<span class="inge-tag no">Sin INGE</span>';
  }
  const sinInge = (t) => !t.pendiente && !t.ultimaFirma && !t.ultimoDocumento;

  async function genOperacion() {
    const op = $('inge-g-operacion').value;
    st.trabajadores = [];
    if (!op) { $('inge-g-lista').innerHTML = 'Escoja una operación para ver sus trabajadores.'; actualizarBoton(); return; }
    $('inge-g-lista').innerHTML = 'Cargando trabajadores…';
    try {
      const d = await api(`/api/trabajadores?operacion=${encodeURIComponent(op)}`);
      st.trabajadores = d.trabajadores || [];
    } catch (e) { $('inge-g-lista').innerHTML = `<span style="color:var(--danger)">${esc(e.message)}</span>`; return; }
    if (!st.trabajadores.length) { $('inge-g-lista').innerHTML = 'No hay trabajadores activos en esta operación.'; actualizarBoton(); return; }
    const nSin = st.trabajadores.filter(sinInge).length;
    $('inge-g-lista').innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
        <input type="search" class="form-control" id="inge-g-buscar" placeholder="🔍 Buscar…" oninput="ingeGenBuscar()" style="flex:1;min-width:160px">
        <button class="inge-ico" onclick="ingeGenMarcar('sin')">Marcar sin INGE (${nSin})</button>
        <button class="inge-ico" onclick="ingeGenMarcar('todos')">Todos</button>
        <button class="inge-ico" onclick="ingeGenMarcar('ninguno')">Ninguno</button>
      </div>
      <div id="inge-g-items">${st.trabajadores.map((t, i) => {
        const esRet = String(t.estado || '').toLowerCase() === 'retirado';
        const tagRet = esRet ? '<span class="inge-tag" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a">Retirado</span>' : '';
        return `<label class="inge-trab" data-i="${i}" data-txt="${esc(norm(t.nombre + ' ' + t.identificacion))}"><input type="checkbox" data-id="${esc(t.identificacion)}" onchange="ingeGenContar()"><span class="nom">${esc(t.nombre)}<small>C.C. ${esc(t.identificacion)} · ${esc(t.cargo)}</small></span>${tagRet}${etiquetaTrabajador(t)}</label>`;
      }).join('')}</div>`;
    actualizarBoton();
  }

  function marcados() { return [...document.querySelectorAll('#inge-g-items input[type=checkbox]:checked')].map(c => c.dataset.id); }
  function actualizarBoton() {
    const btn = $('inge-g-btn');
    if (!btn) return;
    const selIds = marcados();
    btn.disabled = !selIds.length;
    btn.textContent = selIds.length ? `Generar INGE (${selIds.length})` : 'Generar INGE';
    const chk = $('inge-g-correo');
    if (!chk) return;
    const retirados = st.trabajadores.filter(t => selIds.includes(String(t.identificacion)) && String(t.estado || '').toLowerCase() === 'retirado');
    let aviso = $('inge-g-aviso-retirados');
    if (retirados.length && !aviso) {
      aviso = document.createElement('div');
      aviso.id = 'inge-g-aviso-retirados';
      aviso.style.cssText = 'font-size:.78rem;color:#b45309;margin-top:4px;display:block;width:100%';
      aviso.textContent = '⚠️ Trabajador retirado seleccionado: no se enviará correo, solo se generará el enlace.';
      chk.parentNode.parentNode.insertBefore(aviso, chk.parentNode.nextSibling);
    } else if (!retirados.length && aviso) aviso.remove();
    chk.disabled = retirados.length > 0 && retirados.length === selIds.length;
    if (chk.disabled) chk.checked = false;
  }

  async function generar() {
    const ids = marcados();
    if (!ids.length) return;
    const btn = $('inge-g-btn');
    btn.disabled = true; btn.textContent = 'Generando…';
    try {
      const d = await api('/api/crear', { method: 'POST', body: JSON.stringify({
        identificaciones: ids, tipo: $('inge-g-tipo').value,
        enviarCorreo: !!($('inge-g-correo') && $('inge-g-correo').checked),
      }) });
      mostrarResultados(d.resultados || []);
      cargar();
    } catch (e) { alert(e.message); actualizarBoton(); }
  }

  function mostrarResultados(resultados) {
    const ok = resultados.filter(r => r.urlFirma);
    $('inge-modal-titulo').textContent = `✅ INGE generado${ok.length === 1 ? '' : 's'} (${ok.length})`;
    $('inge-modal-bd').innerHTML = `
      <p style="font-size:.86rem;color:var(--text-muted);margin-bottom:12px">Comparta el enlace con cada trabajador para que marque los temas y firme. ${ok.some(r => r.reutilizado) ? 'A quienes ya tenían un comprobante pendiente se les mantuvo el mismo enlace.' : ''}</p>
      ${resultados.map(r => r.urlFirma ? `
        <div class="inge-res"><strong>${esc(r.trabajador)}</strong> <span style="color:var(--text-muted);font-size:.78rem">C.C. ${esc(r.identificacion)}${r.correo ? ' · correo enviado' : ''}${r.reutilizado ? ' · ya estaba pendiente' : ''}</span>
          <input type="text" readonly value="${esc(r.urlFirma)}" onclick="this.select()">
          <div class="inge-acc"><button class="inge-ico" onclick="ingeCopiar('${esc(r.urlFirma)}')">🔗 Copiar</button>
            ${r.celular ? `<a class="inge-ico" href="${esc(enlaceWhatsApp(r.celular, r.trabajador, r.urlFirma))}" target="_blank" rel="noopener">WhatsApp</a>` : '<span style="font-size:.75rem;color:var(--text-muted)">Sin celular registrado</span>'}
            <a class="inge-ico" href="${esc(r.urlFirma)}" target="_blank" rel="noopener">✍ Firmar aquí</a></div>
        </div>` : `<div class="inge-res" style="color:var(--danger)">C.C. ${esc(r.identificacion)}: ${esc(r.error)}</div>`).join('')}`;
    $('inge-modal-ft').innerHTML = '<button class="btn btn-accent btn-sm" onclick="ingeCerrarGenerar()">Listo</button>';
  }

  // ── Funciones globales ───────────────────────────────────────────────────
  window.ingeAbrirGenerar = abrirGenerar;
  window.ingeCerrarGenerar = cerrarModal;
  window.ingeGenRegional = genRegional;
  window.ingeGenOperacion = genOperacion;
  window.ingeGenContar = actualizarBoton;
  window.ingeGenerar = generar;
  window.ingeGenBuscar = () => {
    const q = norm($('inge-g-buscar').value);
    document.querySelectorAll('#inge-g-items .inge-trab').forEach(el => { el.style.display = !q || el.dataset.txt.includes(q) ? '' : 'none'; });
  };
  window.ingeGenMarcar = (modo) => {
    document.querySelectorAll('#inge-g-items .inge-trab').forEach(el => {
      if (el.style.display === 'none') return;
      const t = st.trabajadores[Number(el.dataset.i)];
      el.querySelector('input').checked = modo === 'todos' ? true : (modo === 'ninguno' ? false : sinInge(t));
    });
    actualizarBoton();
  };
  window.ingeFiltro = () => {
    st.regional = $('inge-f-regional').value;
    st.operacion = $('inge-f-operacion').value;
    st.tipo = $('inge-f-tipo').value;
    st.estado = $('inge-f-estado').value;
    pintar();
  };
  window.ingeVerNovedad = () => { st.regional = st.operacion = st.tipo = st.q = ''; st.estado = 'novedad'; $('inge-buscar').value = ''; pintar(); };
  window.ingeBuscar = () => { clearTimeout(st.timer); st.timer = setTimeout(() => { st.q = $('inge-buscar').value; pintar(); }, 200); };
  window.ingeLimpiar = () => { st.regional = st.operacion = st.tipo = st.estado = st.q = ''; $('inge-buscar').value = ''; pintar(); };
  // Desde la campanita: muestra los INGE del trabajador
  window.buscarIngeSst = (texto) => {
    st.regional = st.operacion = st.tipo = st.estado = '';
    st.q = texto || '';
    if ($('inge-buscar')) { $('inge-buscar').value = st.q; pintar(); }
  };
  window.ingeToggleFiltros = () => {
    const b = $('inge-filtros');
    const abrir = b.style.display !== 'block';
    b.style.display = abrir ? 'block' : 'none';
    $('inge-chevron').style.transform = abrir ? 'rotate(90deg)' : 'rotate(0deg)';
  };
  window.ingeCopiar = async (url) => {
    try { await navigator.clipboard.writeText(url); alert('Enlace copiado. Péguelo en el chat o correo del trabajador.'); }
    catch (e) { prompt('Copie el enlace:', url); }
  };
  window.ingeCorreo = async (id, btn) => {
    btn.disabled = true;
    try { const d = await api(`/api/inge/${encodeURIComponent(id)}/enviar-correo`, { method: 'POST', body: '{}' }); alert(`Enlace enviado a ${d.email}.`); }
    catch (e) { alert(e.message); }
    finally { btn.disabled = false; }
  };
  window.ingeRegenerar = async (id, btn) => {
    if (!confirm('¿Regenerar el PDF con la plantilla vigente? Se conservan los temas marcados y las firmas.')) return;
    btn.disabled = true;
    try { await api(`/api/inge/${encodeURIComponent(id)}/regenerar`, { method: 'POST', body: '{}' }); await cargar(); alert('PDF regenerado.'); }
    catch (e) { alert(e.message); btn.disabled = false; }
  };
  window.ingeEliminar = async (id, firmado) => {
    if (!confirm(firmado ? '¿Eliminar este comprobante firmado? Su documento sale de la carpeta del trabajador y vuelve el comprobante anterior, si tiene.' : '¿Eliminar este comprobante pendiente? El enlace dejará de funcionar.')) return;
    try { await api(`/api/inge/${encodeURIComponent(id)}`, { method: 'DELETE' }); cargar(); }
    catch (e) { alert(e.message); }
  };
  window.recargarIngeSst = () => (st.iniciado ? cargar() : null);

  window.inicializarIngeSst = function () {
    if (!st.iniciado) { st.iniciado = true; montar(); }
    cargar();
  };
})();
