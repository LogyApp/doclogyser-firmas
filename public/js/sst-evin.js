/* SST › Documentación Inicial › EVIN (Evaluación de Inducción Corporativa, SST-F-049)
 * Como ARO: se escogen los trabajadores de una operación, el tipo (Inducción o Reinducción) y las observaciones, y se
 * genera el enlace; el trabajador califica la inducción, responde las 27 preguntas y firma. Se califica sola y el PDF
 * queda en su carpeta como documento 29 (solo el último). Avisa cuando toca el segundo intento o la reinducción
 * completa. API: src/routes/evin.js. Usa del hub de SST: CONFIG.usuarioId, registrarModalBack() / cerrarModalBack(),
 * iconoSst() y docInicial (sst-docinicial.js).
 */
(function () {
  'use strict';

  const API = '/evin';
  const st = { iniciado: false, evins: [], permisos: {}, opsPorRegional: {}, cargos: [], minimo: 80, total: 27, tipos: [], responsable: {},
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
  const pct = (n) => (n == null ? '—' : `${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`);
  const textoWhatsApp = (nombre, url) => `Hola ${nombre}, Seguridad y Salud en el Trabajo de LOG&SER le comparte la Evaluación de Inducción Corporativa para que la responda y la firme: ${url}`;
  const enlaceWhatsApp = (celular, nombre, url) => {
    const num = String(celular || '').replace(/\D/g, '');
    return `https://wa.me/${num.length === 10 ? '57' + num : num}?text=${encodeURIComponent(textoWhatsApp(nombre, url))}`;
  };
  const AVISOS = {
    segundo: '⚠️ Aplicar el segundo intento (máx. 5 días hábiles)',
    reinduccion: '⛔ Requiere reinducción completa · informar al jefe inmediato',
  };

  function estilos() {
    if ($('evin-estilos')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="evin-estilos">
      .evin-acc { display:flex; gap:6px; flex-wrap:wrap; }
      .evin-ico { border:1px solid var(--border); background:var(--card-bg); color:var(--text); border-radius:6px; padding:4px 9px; font-size:.78rem; cursor:pointer; text-decoration:none; font-family:inherit; white-space:nowrap; }
      .evin-ico:hover { background:var(--bg-elevated); }
      .evin-ico.peligro { color:var(--danger); border-color:var(--danger); }
      .evin-aviso { font-size:.74rem; font-weight:700; margin-top:4px; }
      .evin-aviso.segundo { color:var(--warning-dark); }
      .evin-aviso.reinduccion { color:var(--danger); }
      .evin-modal { max-width:780px; width:96%; max-height:92vh; background:var(--card-bg); border-radius:12px; box-shadow:0 20px 25px -5px rgba(0,0,0,.2); display:flex; flex-direction:column; overflow:hidden; border-top:5px solid var(--accent); }
      .evin-modal-hd { display:flex; justify-content:space-between; align-items:center; padding:14px 18px; border-bottom:1px solid var(--border); font-weight:700; color:var(--text); }
      .evin-modal-bd { padding:16px 18px; overflow-y:auto; flex:1; color:var(--text); }
      .evin-modal-ft { padding:12px 18px; border-top:1px solid var(--border); display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; align-items:center; }
      .evin-resp { background:var(--bg-elevated); border:1px solid var(--border); border-radius:8px; padding:8px 12px; font-size:.82rem; margin-bottom:12px; }
      .evin-resp.sin-firma { border-color:var(--warning-dark); color:var(--warning-dark); }
      .evin-trab { display:flex; align-items:center; gap:10px; padding:7px 4px; border-bottom:1px solid var(--border); font-size:.86rem; cursor:pointer; }
      .evin-trab input { width:17px; height:17px; flex:none; }
      .evin-trab .nom { flex:1; min-width:0; }
      .evin-trab small { color:var(--text-muted); display:block; font-size:.75rem; }
      .evin-tag { font-size:.7rem; font-weight:700; border-radius:999px; padding:2px 8px; white-space:nowrap; }
      .evin-tag.ok { background:var(--success-soft); color:var(--success-dark); }
      .evin-tag.pend { background:var(--warning-soft); color:var(--warning-dark); }
      .evin-tag.mal { background:var(--danger-soft, #fee2e2); color:var(--danger); }
      .evin-tag.no { background:var(--bg-elevated); color:var(--text-muted); }
      .evin-res { border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:8px; font-size:.86rem; }
      .evin-res input { width:100%; margin:6px 0; padding:6px 8px; border:1px solid var(--border); border-radius:6px; background:var(--bg-elevated); color:var(--text); font-size:.78rem; }
    </style>`);
  }

  function montar() {
    estilos();
    $('pane-evin').innerHTML = `
      <div class="tab-header">
        <div class="tab-header-left">
          <h1 class="tab-title"><span>📝 ${window.etiquetaSeccionSst ? window.etiquetaSeccionSst('EVIN', 'Evaluación de Inducción') : 'Evaluación de Inducción'}</span><span class="badge badge-info" id="evin-total">0 Registros</span><span class="badge badge-danger" id="evin-accion" style="display:none;cursor:pointer" title="Ver las que requieren acción" onclick="evinVerAccion()"></span></h1>
          <p class="tab-subtitle">SST-F-049 · El trabajador califica la inducción, responde las preguntas y firma</p>
        </div>
        <div class="tab-actions">
          <button class="btn btn-accent" id="evin-btn-generar" style="display:none" onclick="evinAbrirGenerar()"><span>➕</span> Generar EVIN</button>
        </div>
      </div>
      <div class="card-filters">
        <div class="filtros-toggle" onclick="evinToggleFiltros()">
          <span class="filtros-toggle-left">Filtros <span class="filtros-badge" id="evin-badge">0</span></span>
          <input type="search" class="form-control filtros-busqueda" id="evin-buscar" placeholder="🔍 Buscar trabajador (nombre o C.C.)..." aria-label="Buscar" oninput="evinBuscar()" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">
          <span class="filtros-chevron" id="evin-chevron">▸</span>
        </div>
        <div class="filtros-body" id="evin-filtros" style="display:none">
          <div class="filters-grid">
            <div class="form-group"><label class="form-label">Regional</label><select class="form-control" id="evin-f-regional" onchange="evinFiltro()"><option value="">Todas</option></select></div>
            <div class="form-group"><label class="form-label">Operación</label><select class="form-control" id="evin-f-operacion" onchange="evinFiltro()"><option value="">Todas</option></select></div>
            <div class="form-group"><label class="form-label">Tipo</label><select class="form-control" id="evin-f-tipo" onchange="evinFiltro()"><option value="">Todos</option></select></div>
            <div class="form-group"><label class="form-label">Estado</label><select class="form-control" id="evin-f-estado" onchange="evinFiltro()"><option value="">Todos</option></select></div>
            <div class="form-group"><button class="btn btn-secondary btn-sm" onclick="evinLimpiar()" style="height:38px;">Limpiar</button></div>
          </div>
        </div>
      </div>
      <div class="table-card"><div class="table-container">
        <table class="data-table" id="evin-tabla">
          <thead>${docInicial.encabezado('evin-tabla', {
            columnas: COLUMNAS, orden: { clave: 'generada', dir: 'desc' }, anchoAcciones: 150, alOrdenar: () => pintar(),
          })}</thead>
          <tbody id="evin-body"><tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">Cargando evaluaciones...</td></tr></tbody>
        </table>
      </div></div>

      <div class="modal-overlay" id="evin-modal" onclick="if(event.target === this) evinCerrarGenerar();">
        <div class="evin-modal">
          <div class="evin-modal-hd"><span id="evin-modal-titulo">➕ Generar EVIN</span><button type="button" class="modal-close" onclick="evinCerrarGenerar()">&times;</button></div>
          <div class="evin-modal-bd" id="evin-modal-bd"></div>
          <div class="evin-modal-ft" id="evin-modal-ft"></div>
        </div>
      </div>`;
    docInicial.activar('evin-tabla');
  }

  const COLUMNAS = [
    { clave: 'radicado', titulo: 'Radicado', ancho: 100, valor: a => a.radicado },
    { clave: 'trabajador', titulo: 'Trabajador', ancho: 230, valor: a => a.trabajador },
    { clave: 'cargo', titulo: 'Cargo · Operación', ancho: 190, valor: a => `${a.cargo} ${a.operacion}` },
    { clave: 'tipo', titulo: 'Tipo', ancho: 120, valor: a => `${a.tipo} ${a.intento}` },
    { clave: 'resultado', titulo: 'Resultado', ancho: 220, valor: a => (a.firmado ? Number(a.porcentaje) || 0 : -1) },
    { clave: 'generada', titulo: 'Generada', ancho: 170, valor: a => String(a.fechaCreacion || '') },
  ];

  async function cargar() {
    try {
      const d = await api('/api/evins');
      st.evins = d.evins || [];
      st.permisos = d.permisos || {};
      st.opsPorRegional = d.opsPorRegional || {};
      st.cargos = d.cargos || [];
      st.minimo = d.minimo || 80;
      st.total = d.totalPreguntas || 27;
      st.tipos = d.tipos || ['Inducción', 'Reinducción'];
      st.responsable = d.responsable || {};
    } catch (e) {
      $('evin-body').innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--danger)">${esc(e.message)}</td></tr>`;
      return;
    }
    $('evin-btn-generar').style.display = st.permisos.crear ? '' : 'none';
    pintar();
  }

  const FILTROS_ESTADO = {
    pendiente: (a) => !a.firmado,
    aprobado: (a) => a.firmado && a.aprobado,
    noaprobado: (a) => a.firmado && !a.aprobado,
    accion: (a) => !!a.aviso,
  };
  const ESTADOS = [['pendiente', 'Pendientes'], ['aprobado', 'Aprobadas'], ['noaprobado', 'No aprobadas'], ['accion', 'Requieren acción']];
  const PRUEBAS = {
    regional: (a, v) => a.regional === v,
    operacion: (a, v) => a.operacion === v,
    tipo: (a, v) => a.tipo === v,
    estado: (a, v) => FILTROS_ESTADO[v](a),
  };

  function celdaResultado(a) {
    if (!a.firmado) return '<span class="badge badge-warning">Pendiente</span>';
    return `<span class="badge ${a.aprobado ? 'badge-success' : 'badge-danger'}">${a.aprobado ? 'Aprobó' : 'No aprobó'} · ${pct(a.porcentaje)}</span>
      <div style="font-size:.75rem;color:var(--text-muted)">${esc(a.correctas)} de ${st.total} correctas · ${fecha(a.fechaFirma)}</div>
      ${a.aviso ? `<div class="evin-aviso ${a.aviso}">${AVISOS[a.aviso]}</div>` : ''}`;
  }

  function pintar() {
    const buscados = st.evins.filter(a => !st.q || norm(`${a.trabajador} ${a.identificacion} ${a.radicado}`).includes(norm(st.q)));
    const sin = docInicial.facetas(buscados, PRUEBAS, { regional: st.regional, operacion: st.operacion, tipo: st.tipo, estado: st.estado });
    docInicial.select($('evin-f-regional'), { opciones: docInicial.distintos(st.evins, 'regional'), base: sin('regional'), prueba: PRUEBAS.regional, actual: st.regional, todos: 'Todas' });
    docInicial.select($('evin-f-operacion'), { opciones: docInicial.distintos(sin('operacion'), 'operacion'), base: sin('operacion'), prueba: PRUEBAS.operacion, actual: st.operacion, todos: 'Todas' });
    docInicial.select($('evin-f-tipo'), { opciones: st.tipos.map(t => [t, t]), base: sin('tipo'), prueba: PRUEBAS.tipo, actual: st.tipo });
    docInicial.select($('evin-f-estado'), { opciones: ESTADOS, base: sin('estado'), prueba: PRUEBAS.estado, actual: st.estado });
    const lista = docInicial.ordenar('evin-tabla', sin(null));
    $('evin-total').textContent = `${lista.length} Registro${lista.length === 1 ? '' : 's'}`;
    const nAccion = st.evins.filter(FILTROS_ESTADO.accion).length;
    $('evin-accion').style.display = nAccion ? '' : 'none';
    $('evin-accion').textContent = `⚠️ ${nAccion} Requiere${nAccion === 1 ? '' : 'n'} acción`;
    $('evin-badge').textContent = (st.regional ? 1 : 0) + (st.operacion ? 1 : 0) + (st.tipo ? 1 : 0) + (st.estado ? 1 : 0);
    const p = st.permisos;
    $('evin-body').innerHTML = lista.length ? lista.map(a => {
      const id = esc(a.id);
      const acciones = a.firmado
        ? iconoSst('pdf', '#dc2626', 'Abrir PDF', { href: a.urlDoc })
          + (p.editarFirmado ? iconoSst('regenerar', '#0284c7', 'Regenerar PDF', { onclick: `evinRegenerar('${id}', this)` }) : '')
          + (p.eliminarFirmado ? iconoSst('eliminar', '#b91c1c', 'Eliminar evaluación respondida', { onclick: `evinEliminar('${id}', true)` }) : '')
        : iconoSst('enlace', '#6366f1', 'Copiar enlace de la evaluación', { onclick: `evinCopiar('${esc(a.urlFirma)}')` })
          + (p.crear ? iconoSst('contacto', '#64748b', 'Actualizar contacto del trabajador', { onclick: `abrirContactoEnlaceSst('evin', '${id}')` }) : '')
          + (a.celular ? iconoSst('whatsapp', '#25d366', 'Enviar por WhatsApp', { href: enlaceWhatsApp(a.celular, a.trabajador, a.urlFirma) }) : '')
          + (p.crear && p.correoHabilitado && a.tieneEmail ? iconoSst('correo', '#0ea5e9', 'Enviar enlace por correo', { onclick: `evinCorreo('${id}', this)` }) : '')
          + iconoSst('firmar', '#d97706', 'Responder aquí (abre la evaluación en este equipo)', { href: a.urlFirma })
          + (p.eliminar && (p.esSistema || a.propio) ? iconoSst('eliminar', '#b91c1c', 'Eliminar evaluación pendiente', { onclick: `evinEliminar('${id}', false)` }) : '');
      return `<tr>
        <td><div class="acc-iconos">${acciones}</div></td>
        <td style="font-family:monospace;font-weight:700">${esc(a.radicado)}</td>
        <td><strong>${esc(a.trabajador)}</strong><div style="font-size:.75rem;color:var(--text-muted)">C.C. ${esc(a.identificacion)}</div></td>
        <td>${esc(a.cargo)}<div style="font-size:.75rem;color:var(--text-muted)">${esc(a.operacion)}${a.ciudad ? ` · ${esc(a.ciudad)}` : ''}</div></td>
        <td>${esc(a.tipo)}<div style="font-size:.75rem;color:var(--text-muted)">Intento ${esc(a.intento)}</div></td>
        <td>${celdaResultado(a)}</td>
        <td>${fecha(a.fechaCreacion)}<div style="font-size:.75rem;color:var(--text-muted)">${esc(a.responsable)}</div></td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">${st.evins.length ? 'No hay evaluaciones con estos filtros.' : 'Aún no se ha generado ninguna evaluación. Use «Generar EVIN» para enviarla a los trabajadores.'}</td></tr>`;
  }

  // ── Generar EVIN (uno o varios trabajadores de una operación) ────────────
  function abrirModal() {
    const ov = $('evin-modal');
    ov.style.display = 'flex';
    if (typeof registrarModalBack === 'function' && !ov._backEntry) ov._backEntry = registrarModalBack(() => cerrarModal());
  }
  function cerrarModal() {
    const ov = $('evin-modal');
    ov.style.display = 'none';
    if (typeof cerrarModalBack === 'function' && ov._backEntry) { cerrarModalBack(ov._backEntry); ov._backEntry = null; }
  }

  function abrirGenerar() {
    const regs = Object.keys(st.opsPorRegional).sort();
    const r = st.responsable;
    $('evin-modal-titulo').textContent = '➕ Generar EVIN';
    $('evin-modal-bd').innerHTML = `
      <div class="evin-resp ${r.tieneFirma ? '' : 'sin-firma'}">Firma como <strong>Responsable</strong>: ${esc(r.nombre || '—')}${r.cargo ? ` · ${esc(r.cargo)}` : ''}
        ${r.tieneFirma ? '' : '<br>⚠️ No tiene firma registrada: el PDF saldrá sin su firma. Regístrela en su perfil antes de generar.'}</div>
      <div class="filters-grid" style="margin-bottom:10px">
        <div class="form-group"><label class="form-label">Tipo</label><select class="form-control" id="evin-g-tipo">${st.tipos.map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Regional</label><select class="form-control" id="evin-g-regional" onchange="evinGenRegional()"><option value="">Seleccione…</option>${regs.map(x => `<option>${esc(x)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Operación</label><select class="form-control" id="evin-g-operacion" onchange="evinGenOperacion()" disabled><option value="">Seleccione la regional</option></select></div>
      </div>
      <div class="form-group" style="margin-bottom:12px"><label class="form-label">Observaciones (salen en el formato)</label>
        <textarea class="form-control" id="evin-g-obs" rows="2" maxlength="2000" placeholder="Opcional"></textarea></div>
      <div id="evin-g-lista" style="font-size:.86rem;color:var(--text-muted)">Escoja una operación para ver sus trabajadores${st.cargos.length ? ` (cargos: ${esc(st.cargos.join(', '))})` : ''}.</div>`;
    $('evin-modal-ft').innerHTML = `
      ${st.permisos.correoHabilitado ? '<label style="display:flex;gap:6px;align-items:center;font-size:.84rem;margin-right:auto;cursor:pointer"><input type="checkbox" id="evin-g-correo"> Enviar el enlace por correo a quien tenga correo</label>' : ''}
      <button class="btn btn-secondary btn-sm" onclick="evinCerrarGenerar()">Cancelar</button>
      <button class="btn btn-accent btn-sm" id="evin-g-btn" onclick="evinGenerar()" disabled>Generar EVIN</button>`;
    if (regs.length === 1) { $('evin-g-regional').value = regs[0]; genRegional(); }
    abrirModal();
  }

  function genRegional() {
    const reg = $('evin-g-regional').value;
    const ops = (st.opsPorRegional[reg] || []).slice().sort();
    const sel = $('evin-g-operacion');
    sel.disabled = !reg;
    sel.innerHTML = '<option value="">Seleccione…</option>' + ops.map(o => `<option>${esc(o)}</option>`).join('');
    $('evin-g-lista').innerHTML = 'Escoja una operación para ver sus trabajadores.';
    if (ops.length === 1) { sel.value = ops[0]; genOperacion(); }
    actualizarBoton();
  }

  function etiquetaTrabajador(t) {
    if (t.pendiente) return '<span class="evin-tag pend">Pendiente de respuesta</span>';
    if (t.ultima) {
      if (t.ultima.aviso === 'reinduccion') return '<span class="evin-tag mal">Requiere reinducción</span>';
      if (t.ultima.aviso === 'segundo') return `<span class="evin-tag mal">No aprobó ${pct(t.ultima.porcentaje)} · segundo intento</span>`;
      return `<span class="evin-tag ok">Aprobó ${fecha(t.ultima.fecha)}</span>`;
    }
    if (t.ultimoDocumento) return `<span class="evin-tag ok">EVIN cargada ${fecha(t.ultimoDocumento)}</span>`;
    return '<span class="evin-tag no">Sin EVIN</span>';
  }
  const sinEvin = (t) => !t.pendiente && !t.ultima && !t.ultimoDocumento;

  async function genOperacion() {
    const op = $('evin-g-operacion').value;
    st.trabajadores = [];
    if (!op) { $('evin-g-lista').innerHTML = 'Escoja una operación para ver sus trabajadores.'; actualizarBoton(); return; }
    $('evin-g-lista').innerHTML = 'Cargando trabajadores…';
    try {
      const d = await api(`/api/trabajadores?operacion=${encodeURIComponent(op)}`);
      st.trabajadores = d.trabajadores || [];
    } catch (e) { $('evin-g-lista').innerHTML = `<span style="color:var(--danger)">${esc(e.message)}</span>`; return; }
    if (!st.trabajadores.length) { $('evin-g-lista').innerHTML = 'No hay trabajadores activos en esta operación.'; actualizarBoton(); return; }
    const nSin = st.trabajadores.filter(sinEvin).length;
    $('evin-g-lista').innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
        <input type="search" class="form-control" id="evin-g-buscar" placeholder="🔍 Buscar…" oninput="evinGenBuscar()" style="flex:1;min-width:160px">
        <button class="evin-ico" onclick="evinGenMarcar('sin')">Marcar sin EVIN (${nSin})</button>
        <button class="evin-ico" onclick="evinGenMarcar('todos')">Todos</button>
        <button class="evin-ico" onclick="evinGenMarcar('ninguno')">Ninguno</button>
      </div>
      <div id="evin-g-items">${st.trabajadores.map((t, i) => {
        const esRet = String(t.estado || '').toLowerCase() === 'retirado';
        const tagRet = esRet ? '<span class="evin-tag" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a">Retirado</span>' : '';
        return `<label class="evin-trab" data-i="${i}" data-txt="${esc(norm(t.nombre + ' ' + t.identificacion))}"><input type="checkbox" data-id="${esc(t.identificacion)}" onchange="evinGenContar()"><span class="nom">${esc(t.nombre)}<small>C.C. ${esc(t.identificacion)} · ${esc(t.cargo)}</small></span>${tagRet}${etiquetaTrabajador(t)}</label>`;
      }).join('')}</div>`;
    actualizarBoton();
  }

  function marcados() { return [...document.querySelectorAll('#evin-g-items input[type=checkbox]:checked')].map(c => c.dataset.id); }
  function actualizarBoton() {
    const btn = $('evin-g-btn');
    if (!btn) return;
    const selIds = marcados();
    btn.disabled = !selIds.length;
    btn.textContent = selIds.length ? `Generar EVIN (${selIds.length})` : 'Generar EVIN';
    const chk = $('evin-g-correo');
    if (!chk) return;
    const retirados = st.trabajadores.filter(t => selIds.includes(String(t.identificacion)) && String(t.estado || '').toLowerCase() === 'retirado');
    let aviso = $('evin-g-aviso-retirados');
    if (retirados.length && !aviso) {
      aviso = document.createElement('div');
      aviso.id = 'evin-g-aviso-retirados';
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
    const btn = $('evin-g-btn');
    btn.disabled = true; btn.textContent = 'Generando…';
    try {
      const d = await api('/api/crear', { method: 'POST', body: JSON.stringify({
        identificaciones: ids, tipo: $('evin-g-tipo').value, observaciones: $('evin-g-obs').value,
        enviarCorreo: !!($('evin-g-correo') && $('evin-g-correo').checked),
      }) });
      mostrarResultados(d.resultados || []);
      cargar();
    } catch (e) { alert(e.message); actualizarBoton(); }
  }

  function mostrarResultados(resultados) {
    const ok = resultados.filter(r => r.urlFirma);
    $('evin-modal-titulo').textContent = `✅ EVIN generada${ok.length === 1 ? '' : 's'} (${ok.length})`;
    $('evin-modal-bd').innerHTML = `
      <p style="font-size:.86rem;color:var(--text-muted);margin-bottom:12px">Comparta el enlace con cada trabajador para que responda y firme. ${ok.some(r => r.reutilizado) ? 'A quienes ya tenían una evaluación pendiente se les mantuvo el mismo enlace.' : ''}</p>
      ${resultados.map(r => r.urlFirma ? `
        <div class="evin-res"><strong>${esc(r.trabajador)}</strong> <span style="color:var(--text-muted);font-size:.78rem">C.C. ${esc(r.identificacion)}${r.intento ? ` · intento ${r.intento}` : ''}${r.correo ? ' · correo enviado' : ''}${r.reutilizado ? ' · ya estaba pendiente' : ''}</span>
          <input type="text" readonly value="${esc(r.urlFirma)}" onclick="this.select()">
          <div class="evin-acc"><button class="evin-ico" onclick="evinCopiar('${esc(r.urlFirma)}')">🔗 Copiar</button>
            ${r.celular ? `<a class="evin-ico" href="${esc(enlaceWhatsApp(r.celular, r.trabajador, r.urlFirma))}" target="_blank" rel="noopener">WhatsApp</a>` : '<span style="font-size:.75rem;color:var(--text-muted)">Sin celular registrado</span>'}
            <a class="evin-ico" href="${esc(r.urlFirma)}" target="_blank" rel="noopener">✍ Responder aquí</a></div>
        </div>` : `<div class="evin-res" style="color:var(--danger)">C.C. ${esc(r.identificacion)}: ${esc(r.error)}</div>`).join('')}`;
    $('evin-modal-ft').innerHTML = '<button class="btn btn-accent btn-sm" onclick="evinCerrarGenerar()">Listo</button>';
  }

  // ── Funciones globales ───────────────────────────────────────────────────
  window.evinAbrirGenerar = abrirGenerar;
  window.evinCerrarGenerar = cerrarModal;
  window.evinGenRegional = genRegional;
  window.evinGenOperacion = genOperacion;
  window.evinGenContar = actualizarBoton;
  window.evinGenerar = generar;
  window.evinGenBuscar = () => {
    const q = norm($('evin-g-buscar').value);
    document.querySelectorAll('#evin-g-items .evin-trab').forEach(el => { el.style.display = !q || el.dataset.txt.includes(q) ? '' : 'none'; });
  };
  window.evinGenMarcar = (modo) => {
    document.querySelectorAll('#evin-g-items .evin-trab').forEach(el => {
      if (el.style.display === 'none') return;
      const t = st.trabajadores[Number(el.dataset.i)];
      el.querySelector('input').checked = modo === 'todos' ? true : (modo === 'ninguno' ? false : sinEvin(t));
    });
    actualizarBoton();
  };
  window.evinFiltro = () => {
    st.regional = $('evin-f-regional').value;
    st.operacion = $('evin-f-operacion').value;
    st.tipo = $('evin-f-tipo').value;
    st.estado = $('evin-f-estado').value;
    pintar();
  };
  window.evinVerAccion = () => { st.regional = st.operacion = st.tipo = st.q = ''; st.estado = 'accion'; $('evin-buscar').value = ''; pintar(); };
  window.evinBuscar = () => { clearTimeout(st.timer); st.timer = setTimeout(() => { st.q = $('evin-buscar').value; pintar(); }, 200); };
  window.evinLimpiar = () => { st.regional = st.operacion = st.tipo = st.estado = st.q = ''; $('evin-buscar').value = ''; pintar(); };
  // Desde la campanita: muestra las EVIN del trabajador
  window.buscarEvinSst = (texto) => {
    st.regional = st.operacion = st.tipo = st.estado = '';
    st.q = texto || '';
    if ($('evin-buscar')) { $('evin-buscar').value = st.q; pintar(); }
  };
  window.evinToggleFiltros = () => {
    const b = $('evin-filtros');
    const abrir = b.style.display !== 'block';
    b.style.display = abrir ? 'block' : 'none';
    $('evin-chevron').style.transform = abrir ? 'rotate(90deg)' : 'rotate(0deg)';
  };
  window.evinCopiar = async (url) => {
    try { await navigator.clipboard.writeText(url); alert('Enlace copiado. Péguelo en el chat o correo del trabajador.'); }
    catch (e) { prompt('Copie el enlace:', url); }
  };
  window.evinCorreo = async (id, btn) => {
    btn.disabled = true;
    try { const d = await api(`/api/evin/${encodeURIComponent(id)}/enviar-correo`, { method: 'POST', body: '{}' }); alert(`Enlace enviado a ${d.email}.`); }
    catch (e) { alert(e.message); }
    finally { btn.disabled = false; }
  };
  window.evinRegenerar = async (id, btn) => {
    if (!confirm('¿Regenerar el PDF con la plantilla vigente? Se conservan las respuestas y las firmas.')) return;
    btn.disabled = true;
    try { await api(`/api/evin/${encodeURIComponent(id)}/regenerar`, { method: 'POST', body: '{}' }); await cargar(); alert('PDF regenerado.'); }
    catch (e) { alert(e.message); btn.disabled = false; }
  };
  window.evinEliminar = async (id, firmado) => {
    if (!confirm(firmado ? '¿Eliminar esta evaluación respondida? Su documento sale de la carpeta del trabajador y vuelve la evaluación anterior, si tiene.' : '¿Eliminar esta evaluación pendiente? El enlace dejará de funcionar.')) return;
    try { await api(`/api/evin/${encodeURIComponent(id)}`, { method: 'DELETE' }); cargar(); }
    catch (e) { alert(e.message); }
  };
  window.recargarEvinSst = () => (st.iniciado ? cargar() : null);

  window.inicializarEvinSst = function () {
    if (!st.iniciado) { st.iniciado = true; montar(); }
    cargar();
  };
})();
