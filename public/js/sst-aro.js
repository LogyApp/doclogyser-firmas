/* SST › ARO (Análisis de Riesgo por Oficio, SST-FM-054)
 * Como Prueba de Consumo: se escogen los trabajadores de una operación (cargos de Config_Parametros sst / ARO),
 * se genera el enlace de firma y se comparte por WhatsApp, correo o copiándolo; el trabajador lee y firma, y el
 * PDF queda en su carpeta como documento 7. API: src/routes/aro.js. Usa del hub de SST: CONFIG.usuarioId,
 * registrarModalBack() / cerrarModalBack() (modal-back.js), iconoSst() y docInicial (sst-docinicial.js).
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
      <div class="card-filters">
        <div class="filtros-toggle" onclick="aroToggleFiltros()">
          <span class="filtros-toggle-left">Filtros <span class="filtros-badge" id="aro-badge">0</span></span>
          <input type="search" class="form-control filtros-busqueda" id="aro-buscar" placeholder="🔍 Buscar trabajador (nombre o C.C.)..." aria-label="Buscar" oninput="aroBuscar()" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">
          <span class="filtros-chevron" id="aro-chevron">▸</span>
        </div>
        <div class="filtros-body" id="aro-filtros" style="display:none">
          <div class="filters-grid">
            <div class="form-group"><label class="form-label">Regional</label><select class="form-control" id="aro-f-regional" onchange="aroFiltro()"><option value="">Todas</option></select></div>
            <div class="form-group"><label class="form-label">Operación</label><select class="form-control" id="aro-f-operacion" onchange="aroFiltro()"><option value="">Todas</option></select></div>
            <div class="form-group"><label class="form-label">Estado de firma</label><select class="form-control" id="aro-f-estado" onchange="aroFiltro()"><option value="">Todos</option><option value="pendiente">Pendientes</option><option value="firmado">Firmados</option></select></div>
            <div class="form-group"><button class="btn btn-secondary btn-sm" onclick="aroLimpiar()" style="height:38px;">Limpiar</button></div>
          </div>
        </div>
      </div>
      <div class="table-card"><div class="table-container">
        <table class="data-table" id="aro-tabla">
          <thead>${docInicial.encabezado('aro-tabla', {
            columnas: COLUMNAS, orden: { clave: 'generado', dir: 'desc' }, anchoAcciones: 150, alOrdenar: () => pintar(),
          })}</thead>
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
    docInicial.activar('aro-tabla');
  }

  const COLUMNAS = [
    { clave: 'radicado', titulo: 'Radicado', ancho: 100, valor: a => a.radicado },
    { clave: 'trabajador', titulo: 'Trabajador', ancho: 240, valor: a => a.trabajador },
    { clave: 'cargo', titulo: 'Cargo', ancho: 170, valor: a => a.cargo },
    { clave: 'operacion', titulo: 'Operación', ancho: 170, valor: a => `${a.operacion} ${a.regional}` },
    { clave: 'estado', titulo: 'Estado', ancho: 130, valor: a => (a.firmado ? 1 : 0) },
    { clave: 'generado', titulo: 'Generado', ancho: 170, valor: a => String(a.fechaCreacion || '') },
  ];
  const ESTADOS = [['pendiente', 'Pendientes'], ['firmado', 'Firmados']];
  const PRUEBAS = {
    regional: (a, v) => a.regional === v,
    operacion: (a, v) => a.operacion === v,
    estado: (a, v) => (v === 'firmado' ? a.firmado : !a.firmado),
  };

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
    pintar();
  }

  function pintar() {
    const buscados = st.aros.filter(a => !st.q || norm(`${a.trabajador} ${a.identificacion} ${a.radicado}`).includes(norm(st.q)));
    const sin = docInicial.facetas(buscados, PRUEBAS, { regional: st.regional, operacion: st.operacion, estado: st.estado });
    docInicial.select($('aro-f-regional'), { opciones: docInicial.distintos(st.aros, 'regional'), base: sin('regional'), prueba: PRUEBAS.regional, actual: st.regional, todos: 'Todas' });
    docInicial.select($('aro-f-operacion'), { opciones: docInicial.distintos(sin('operacion'), 'operacion'), base: sin('operacion'), prueba: PRUEBAS.operacion, actual: st.operacion, todos: 'Todas' });
    docInicial.select($('aro-f-estado'), { opciones: ESTADOS, base: sin('estado'), prueba: PRUEBAS.estado, actual: st.estado });
    const lista = docInicial.ordenar('aro-tabla', sin(null));
    $('aro-total').textContent = `${lista.length} Registro${lista.length === 1 ? '' : 's'}`;
    const filtros = (st.regional ? 1 : 0) + (st.operacion ? 1 : 0) + (st.estado ? 1 : 0);
    $('aro-badge').textContent = filtros;
    const p = st.permisos;
    $('aro-body').innerHTML = lista.length ? lista.map(a => {
      const id = esc(a.id);
      const acciones = a.firmado
        ? iconoSst('pdf', '#dc2626', 'Abrir PDF', { href: a.urlDoc })
          + (p.editarFirmado ? iconoSst('regenerar', '#0284c7', 'Regenerar PDF', { onclick: `aroRegenerar('${id}', this)` }) : '')
          + (p.eliminarFirmado ? iconoSst('eliminar', '#b91c1c', 'Eliminar ARO firmado', { onclick: `aroEliminar('${id}', true)` }) : '')
        : iconoSst('enlace', '#6366f1', 'Copiar enlace de firma', { onclick: `aroCopiar('${esc(a.urlFirma)}')` })
          + (p.crear ? iconoSst('contacto', '#64748b', 'Actualizar contacto del trabajador', { onclick: `abrirContactoEnlaceSst('aro', '${id}')` }) : '')
          + (a.celular ? iconoSst('whatsapp', '#25d366', 'Enviar por WhatsApp', { href: enlaceWhatsApp(a.celular, a.trabajador, a.urlFirma) }) : '')
          + (p.crear && p.correoHabilitado && a.tieneEmail ? iconoSst('correo', '#0ea5e9', 'Enviar enlace por correo', { onclick: `aroCorreo('${id}', this)` }) : '')
          + iconoSst('firmar', '#d97706', 'Firmar aquí (abre el formato en este equipo)', { href: a.urlFirma })
          + (p.eliminar && (p.esSistema || a.propio) ? iconoSst('eliminar', '#b91c1c', 'Eliminar ARO pendiente', { onclick: `aroEliminar('${id}', false)` }) : '');
      return `<tr>
        <td><div class="acc-iconos">${acciones}</div></td>
        <td style="font-family:monospace;font-weight:700">${esc(a.radicado)}</td>
        <td><strong>${esc(a.trabajador)}</strong><div style="font-size:.75rem;color:var(--text-muted)">C.C. ${esc(a.identificacion)}</div></td>
        <td>${esc(a.cargo)}</td>
        <td>${esc(a.operacion)}<div style="font-size:.75rem;color:var(--text-muted)">${esc(a.regional)}</div></td>
        <td>${a.firmado ? `<span class="badge badge-success">Firmado</span><div style="font-size:.75rem;color:var(--text-muted)">${fecha(a.fechaFirma)}</div>` : '<span class="badge badge-warning">Pendiente</span>'}</td>
        <td>${fecha(a.fechaCreacion)}<div style="font-size:.75rem;color:var(--text-muted)">${esc(a.creador)}</div></td>
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
        const esRet = String(t.estado || '').toLowerCase() === 'retirado';
        const tagRet = esRet ? '<span class="aro-tag" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a">Retirado</span>' : '';
        const tag = t.pendiente ? '<span class="aro-tag pend">Pendiente de firma</span>'
          : (t.ultimaFirma ? `<span class="aro-tag ok">Firmó ${fecha(t.ultimaFirma)}</span>`
            : (t.ultimoDocumento ? `<span class="aro-tag ok">ARO cargado ${fecha(t.ultimoDocumento)}</span>` : '<span class="aro-tag no">Sin ARO</span>'));
        return `<label class="aro-trab" data-i="${i}" data-txt="${esc(norm(t.nombre + ' ' + t.identificacion))}"><input type="checkbox" data-id="${esc(t.identificacion)}" onchange="aroGenContar()"><span class="nom">${esc(t.nombre)}<small>C.C. ${esc(t.identificacion)} · ${esc(t.cargo)}</small></span>${tagRet}${tag}</label>`;
      }).join('')}</div>`;
    actualizarBoton();
  }

  function marcados() { return [...document.querySelectorAll('#aro-g-items input[type=checkbox]:checked')].map(c => c.dataset.id); }
  function actualizarBoton() {
    const btn = $('aro-g-btn');
    if (!btn) return;
    const selIds = marcados();
    const n = selIds.length;
    btn.disabled = !n;
    btn.textContent = n ? `Generar ARO (${n})` : 'Generar ARO';

    const chkCorreo = $('aro-g-correo');
    const avisoRet = $('aro-g-aviso-retirados');
    if (chkCorreo) {
      const retiradosSel = (st.trabajadores || []).filter(t => selIds.includes(String(t.identificacion)) && String(t.estado || '').toLowerCase() === 'retirado');
      if (retiradosSel.length > 0) {
        if (!avisoRet) {
          const div = document.createElement('div');
          div.id = 'aro-g-aviso-retirados';
          div.style.cssText = 'font-size:.78rem;color:#b45309;margin-top:4px;display:block;width:100%';
          div.textContent = '⚠️ Trabajador retirado seleccionado: no se enviará correo, solo se generará el enlace de firma.';
          chkCorreo.parentNode.parentNode.insertBefore(div, chkCorreo.parentNode.nextSibling);
        }
        if (retiradosSel.length === selIds.length) {
          chkCorreo.checked = false;
          chkCorreo.disabled = true;
        } else {
          chkCorreo.disabled = false;
        }
      } else {
        if (avisoRet) avisoRet.remove();
        chkCorreo.disabled = false;
      }
    }
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
  window.aroFiltro = () => {
    st.regional = $('aro-f-regional').value;
    st.operacion = $('aro-f-operacion').value;
    st.estado = $('aro-f-estado').value;
    pintar();
  };
  window.aroBuscar = () => { clearTimeout(st.timer); st.timer = setTimeout(() => { st.q = $('aro-buscar').value; pintar(); }, 200); };
  window.aroLimpiar = () => { st.regional = st.operacion = st.estado = st.q = ''; $('aro-buscar').value = ''; pintar(); };
  // Desde la campanita: muestra los ARO del trabajador
  window.buscarAroSst = (texto) => {
    st.regional = st.operacion = st.estado = '';
    st.q = texto || '';
    if ($('aro-buscar')) { $('aro-buscar').value = st.q; pintar(); }
  };
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
