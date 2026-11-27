// SST › Casos Médicos: lo que antes se llevaba en la "Matriz de casos médicos" (Excel de noviembre 2026).
// - Campos del caso en el formulario (estado laboral, origen, concepto, examen post-incapacidad,
//   adaptación del puesto con fecha límite de días hábiles, calificación, APT, observación administrativa).
// - En el expediente: resumen de esos campos y las secciones Restricciones, Compromisos (con reprogramación),
//   Calificación y Revisiones, con su formulario (la definición viene de /casosmedicos/api/catalogos).
// - Firma del jefe inmediato en las actas de apertura y cierre.
// Usa de src/views/sst/index.html: CONFIG, permisoSst, showToast, showLoading, hideLoading,
// registrarModalBack, abrirExpedienteTrabajador y currentExpedienteTrabajadorId.
(function () {
  'use strict';

  let LISTAS = {};
  let DEF = {};
  const cacheRegistros = {};

  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const f10 = v => (v ? String(v).slice(0, 10) : '');
  const fecha = v => (v ? f10(v).split('-').reverse().join('/') : '—');
  const hoy = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  const usuario = () => (typeof CONFIG !== 'undefined' ? CONFIG.usuarioId : '');
  const esCreador = reg => {
    const c = String((reg && reg.usuario) || '').trim().toLowerCase();
    return !!c && (c === String(CONFIG.usuarioId || '').trim().toLowerCase() || c === String(CONFIG.usuarioNombre || '').trim().toLowerCase());
  };
  const puedeRegistrar = caso => permisoSst('cm', 'bitacora') || permisoSst('cm', 'editar') || esCreador(caso);
  const puedeEliminar = reg => permisoSst('cm', 'eliminar') || esCreador(reg);

  // ── Campos del caso en el formulario ──
  const CAMPOS_CASO = [
    ['area', 'Área', 'lista', 'area'],
    ['cargo', 'Cargo', 'texto'],
    ['origen', 'Origen', 'lista', 'origen'],
    ['estado_laboral', 'Estado laboral', 'lista', 'estado_laboral'],
    ['fecha_inicio_incap', 'Inicio incapacidad', 'fecha'],
    ['fecha_fin_incap', 'Fin incapacidad vigente', 'fecha'],
    ['fecha_ultimo_concepto', 'Fecha último concepto', 'fecha'],
    ['tipo_concepto', 'Tipo de concepto', 'lista', 'tipo_concepto'],
    ['requiere_examen_postincap', '¿Requiere examen post-incapacidad?', 'sino'],
    ['fecha_examen_postincap', 'Fecha examen post-incapacidad', 'fecha'],
    ['adaptacion_implementada', '¿Adaptación implementada?', 'sino'],
    ['fecha_evaluacion_ocupacional', 'Fecha evaluación ocupacional', 'fecha'],
    ['estado_adaptacion', 'Estado de la adaptación', 'lista', 'estado_adaptacion'],
    ['proceso_calificacion', 'Proceso de calificación', 'lista', 'proceso_calificacion'],
    ['requiere_apt', '¿Requiere APT (análisis de puesto)?', 'sino'],
    ['fecha_apt', 'Fecha del APT', 'fecha'],
    ['apt_ubicacion', 'Informe APT (enlace o ubicación)', 'texto'],
    ['observacion_administrativa', 'Observación administrativa (sin información clínica)', 'textoLargo'],
  ];

  function opciones(clave, valor) {
    const lista = clave === 'sino' ? ['Sí', 'No'] : clave === 'sinona' ? ['Sí', 'No', 'N.A.'] : (LISTAS[clave] || []);
    const extra = valor && !lista.includes(valor) ? [valor] : []; // valor guardado que ya no está en la lista
    return '<option value="">—</option>' + [...lista, ...extra].map(o => `<option value="${esc(o)}"${o === valor ? ' selected' : ''}>${esc(o)}</option>`).join('');
  }

  function control(id, tipo, lista, valor) {
    if (tipo === 'fecha') return `<input type="date" class="form-control" id="${id}" value="${esc(f10(valor))}">`;
    if (tipo === 'numero') return `<input type="number" step="0.01" min="0" class="form-control" id="${id}" value="${valor == null ? '' : esc(valor)}">`;
    if (tipo === 'textoLargo') return `<textarea class="form-control" id="${id}" rows="2">${esc(valor || '')}</textarea>`;
    if (tipo === 'lista' || tipo === 'sino' || tipo === 'sinona') return `<select class="form-control" id="${id}">${opciones(tipo === 'lista' ? lista : tipo, valor || '')}</select>`;
    return `<input type="text" class="form-control" id="${id}" value="${esc(valor || '')}">`;
  }

  function pintarCamposCaso() {
    const cont = document.getElementById('cm-matriz-campos');
    if (!cont) return;
    cont.innerHTML = `
      <div style="background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
        <div style="font-weight: 700; color: var(--text); font-size: 0.9rem; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
          <span>🧭</span> Seguimiento laboral, adaptación y calificación
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 12px;">La fecha límite de la adaptación se calcula sola: evaluación ocupacional + días hábiles (Res. 1843/2025).</div>
        <div class="filters-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
          ${CAMPOS_CASO.map(([n, et, tipo, lista]) => `
            <div class="form-group"${tipo === 'textoLargo' ? ' style="grid-column: 1 / -1;"' : ''}>
              <label class="form-label">${esc(et)}</label>
              ${control(`cm-mx-${n}`, tipo, lista, '')}
            </div>`).join('')}
        </div>
      </div>`;
  }

  function llenarCampos(caso) {
    CAMPOS_CASO.forEach(([n, , tipo, lista]) => {
      const el = document.getElementById(`cm-mx-${n}`);
      if (!el) return;
      const v = caso ? caso[n] : '';
      if (el.tagName === 'SELECT') el.innerHTML = opciones(tipo === 'lista' ? lista : tipo, v || '');
      el.value = tipo === 'fecha' ? f10(v) : (v == null ? '' : v);
    });
  }

  function leerCampos() {
    const res = {};
    CAMPOS_CASO.forEach(([n]) => {
      const el = document.getElementById(`cm-mx-${n}`);
      if (el) res[n] = el.value.trim() || null;
    });
    if (!res.cargo) res.cargo = (document.getElementById('cm-view-cargo') || {}).value || null;
    return res;
  }

  // ── Resumen en el expediente ──
  function dato(etiqueta, valor) {
    return `<div><span class="lbl" style="color:var(--text-muted); font-size:0.72rem; text-transform:uppercase; font-weight:600; display:block;">${etiqueta}</span> <span class="val" style="font-weight:600;">${valor}</span></div>`;
  }

  function htmlResumenCaso(c) {
    const limite = f10(c.fecha_limite_adaptacion);
    const fueraPlazo = limite && c.adaptacion_implementada !== 'Sí' && limite < hoy();
    const adaptacion = [c.adaptacion_implementada ? `Implementada: ${esc(c.adaptacion_implementada)}` : '', esc(c.estado_adaptacion || ''),
      limite ? `límite ${fecha(limite)}${fueraPlazo ? ' <span class="badge badge-danger" style="font-size:0.68rem;">Fuera de plazo</span>' : ''}` : ''].filter(Boolean).join(' · ') || '—';
    const actasAnt = [c.acta_inicio_ext_fecha || c.acta_inicio_ext_ubicacion ? `Inicio ${fecha(c.acta_inicio_ext_fecha)} ${esc(c.acta_inicio_ext_ubicacion || '')}` : '',
      c.acta_cierre_ext_fecha || c.acta_cierre_ext_ubicacion ? `Cierre ${fecha(c.acta_cierre_ext_fecha)} ${esc(c.acta_cierre_ext_ubicacion || '')}` : ''].filter(Boolean).join(' · ');
    return `
      <div class="cm-info-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:8px 12px; border-top:1px dashed var(--border); padding-top:10px; margin-top:8px; font-size:0.82rem;">
        ${dato('Estado laboral', esc(c.estado_laboral || '—'))}
        ${dato('Origen', esc(c.origen || '—'))}
        ${dato('Área / Cargo', `${esc(c.area || '—')} · ${esc(c.cargo || '—')}`)}
        ${dato('Incapacidad', c.fecha_inicio_incap ? `${fecha(c.fecha_inicio_incap)} al ${fecha(c.fecha_fin_incap)}` : '—')}
        ${dato('Último concepto', c.fecha_ultimo_concepto || c.tipo_concepto ? `${fecha(c.fecha_ultimo_concepto)} · ${esc(c.tipo_concepto || '—')}` : '—')}
        ${dato('Examen post-incapacidad', c.requiere_examen_postincap ? `${esc(c.requiere_examen_postincap)}${c.fecha_examen_postincap ? ' · ' + fecha(c.fecha_examen_postincap) : ''}` : '—')}
        ${dato('Adaptación del puesto', adaptacion)}
        ${dato('Proceso de calificación', esc(c.proceso_calificacion || '—'))}
        ${dato('APT', c.requiere_apt ? `${esc(c.requiere_apt)}${c.fecha_apt ? ' · ' + fecha(c.fecha_apt) : ''}${c.apt_ubicacion ? ' · ' + esc(c.apt_ubicacion) : ''}` : '—')}
      </div>
      ${c.observacion_administrativa ? `<div style="background:var(--bg); border:1px solid var(--border); padding:8px 12px; border-radius:6px; font-size:0.8rem; margin-top:10px; white-space:pre-line;"><strong>Observación administrativa:</strong> ${esc(c.observacion_administrativa)}</div>` : ''}
      ${actasAnt ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px;"><strong>Actas del sistema anterior:</strong> ${actasAnt}</div>` : ''}`;
  }

  // ── Secciones de registros (restricciones, compromisos, calificación, revisiones) ──
  function htmlSecciones(c) {
    return `<div class="cm-mx" id="cm-mx-${c.id}" data-idcaso="${c.id}" style="background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:12px 14px; margin-top:12px;">
      <div style="font-size:0.8rem; color:var(--text-muted);">Cargando restricciones, compromisos, calificación y revisiones...</div>
    </div>`;
  }

  async function cargar(idcaso, pestana) {
    const cont = document.getElementById(`cm-mx-${idcaso}`);
    if (!cont) return;
    try {
      const r = await fetch(`/casosmedicos/api/caso/${idcaso}/matriz?usuario=${encodeURIComponent(usuario())}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error');
      cacheRegistros[idcaso] = data;
      pintar(idcaso, pestana || cont.dataset.pestana || 'restricciones');
    } catch (err) {
      cont.innerHTML = `<div style="color:var(--danger); font-size:0.8rem;">No se pudieron cargar los registros: ${esc(err.message)}</div>`;
    }
  }

  function valorCelda(entidad, campo, reg) {
    const v = reg[campo];
    if (campo === 'estado_vigencia') {
      const cls = { VENCIDA: 'badge-danger', 'POR VENCER': 'badge-warning', VIGENTE: 'badge-success' }[v] || 'badge-secondary';
      return `<span class="badge ${cls}" style="font-size:0.68rem;">${esc(v)}</span>`;
    }
    if (campo === 'estado') {
      const cls = v === 'Vencido' ? 'badge-danger' : v === 'Pendiente' ? 'badge-warning' : String(v).startsWith('Cumplido') ? 'badge-success' : 'badge-secondary';
      return `<span class="badge ${cls}" style="font-size:0.68rem;">${esc(v)}</span>`;
    }
    if (campo === 'n_reprogramaciones') return v ? `<span title="Reprogramaciones">🔁 ${v}</span>` : '—';
    if (campo.startsWith('fecha')) return fecha(v);
    if (campo === 'pcl_porcentaje') return v != null ? `${esc(v)}%` : '—';
    const s = String(v == null ? '' : v);
    return s ? esc(s.length > 140 ? s.slice(0, 140) + '…' : s) : '—';
  }

  function etiquetaColumna(entidad, campo) {
    const extra = { estado_vigencia: 'Vigencia', estado: 'Estado', n_reprogramaciones: 'Reprog.', fecha_vigente: 'Fecha vigente' };
    if (extra[campo]) return extra[campo];
    const c = DEF[entidad].campos.find(x => x.nombre === campo);
    return c ? c.etiqueta.replace(/\s*\(.*\)$/, '') : campo;
  }

  function pintar(idcaso, pestana) {
    const cont = document.getElementById(`cm-mx-${idcaso}`);
    const data = cacheRegistros[idcaso];
    if (!cont || !data) return;
    cont.dataset.pestana = pestana;
    const caso = (window._casosMedicosExpediente || []).find(x => String(x.id) === String(idcaso)) || {};
    const registrar = puedeRegistrar(caso);
    const def = DEF[pestana];
    const filas = data[pestana] || [];
    const tabs = Object.entries(DEF).map(([k, d]) => `
      <button type="button" class="btn btn-sm" onclick="CmMatriz.pestana(${idcaso}, '${k}')" style="font-size:0.75rem; padding:4px 10px; border-radius:6px; font-weight:600; border:1px solid ${k === pestana ? 'var(--info)' : 'var(--border)'}; background:${k === pestana ? 'var(--info-soft)' : 'var(--card-bg)'}; color:${k === pestana ? 'var(--info-dark)' : 'var(--text)'};">
        ${d.icono} ${esc(d.titulo)} <span class="badge badge-secondary" style="font-size:0.68rem;">${(data[k] || []).length}</span>
      </button>`).join('');

    const cuerpo = filas.length ? `
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.78rem;">
          <thead><tr>${def.columnas.map(col => `<th style="text-align:left; padding:6px 8px; border-bottom:1px solid var(--border); color:var(--text-muted); font-size:0.7rem; text-transform:uppercase;">${esc(etiquetaColumna(pestana, col))}</th>`).join('')}<th style="border-bottom:1px solid var(--border);"></th></tr></thead>
          <tbody>${filas.map(reg => `
            <tr style="border-bottom:1px solid var(--border);">
              ${def.columnas.map(col => `<td style="padding:6px 8px; vertical-align:top;">${valorCelda(pestana, col, reg)}</td>`).join('')}
              <td style="padding:6px 8px; white-space:nowrap; text-align:right;">
                <button type="button" class="btn btn-sm btn-secondary" style="font-size:0.7rem; padding:2px 7px;" onclick="CmMatriz.abrir(${idcaso}, '${pestana}', ${reg.id})">${registrar ? '✏️' : '👁'}</button>
                ${pestana === 'compromisos' && registrar && !reg.fecha_cumplimiento ? `<button type="button" class="btn btn-sm btn-secondary" style="font-size:0.7rem; padding:2px 7px;" title="Reprogramar (conserva la fecha inicial)" onclick="CmMatriz.reprogramar(${idcaso}, ${reg.id})">🔁</button>` : ''}
                ${puedeEliminar(reg) ? `<button type="button" class="btn btn-sm" style="font-size:0.7rem; padding:2px 7px; background:var(--danger-soft); color:var(--danger-dark); border:1px solid var(--danger-soft);" onclick="CmMatriz.eliminar(${idcaso}, '${pestana}', ${reg.id})">🗑</button>` : ''}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : `<div style="text-align:center; padding:14px; color:var(--text-muted); font-size:0.8rem; border:1px dashed var(--border-strong); border-radius:6px;">Sin registros.</div>`;

    const compromisos = data.compromisos || [];
    const exigibles = compromisos.filter(x => f10(x.fecha_vigente || x.fecha_inicial) && f10(x.fecha_vigente || x.fecha_inicial) < hoy());
    const indicador = pestana === 'compromisos' && compromisos.length
      ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px;">Cumplimiento: <strong>${exigibles.length ? Math.round((exigibles.filter(x => x.fecha_cumplimiento).length / exigibles.length) * 100) + '%' : 'N/A'}</strong> de los compromisos exigibles (fecha vigente ya cumplida) · ${compromisos.filter(x => x.estado === 'Vencido').length} vencido(s)</div>`
      : '';

    cont.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
        <div style="display:flex; gap:6px; flex-wrap:wrap;">${tabs}</div>
        ${registrar ? `<button type="button" class="btn btn-sm" onclick="CmMatriz.abrir(${idcaso}, '${pestana}')" style="font-size:0.75rem; padding:4px 10px; font-weight:600; background:var(--info-soft); color:var(--info-dark); border:1px solid var(--info-soft);">➕ Agregar</button>` : ''}
      </div>
      <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:8px;">${esc(def.nota)}</div>
      ${cuerpo}
      ${indicador}`;
  }

  // Carga los registros al abrir cada caso del expediente (los <details> abiertos, de una vez)
  function montarExpediente() {
    document.querySelectorAll('.cm-mx').forEach(cont => {
      const id = cont.dataset.idcaso;
      const det = cont.closest('details');
      if (!det) return cargar(id);
      if (det.open) cargar(id);
      else det.addEventListener('toggle', () => { if (det.open && !cacheRegistros[id]) cargar(id); }, { once: false });
    });
  }

  // ── Modal de registro ──
  function modal() {
    let m = document.getElementById('cm-mx-modal');
    if (m) return m;
    m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'cm-mx-modal';
    m.style.display = 'none';
    m.innerHTML = `
      <div class="modal-content modal-form-large" style="max-width: 760px; height: auto; max-height: 88vh;">
        <div class="modal-header">
          <div class="modal-title" id="cm-mx-modal-title"></div>
          <button type="button" class="modal-close" onclick="CmMatriz.cerrar()" title="Cerrar">&times;</button>
        </div>
        <div style="flex: 1; overflow-y: auto; padding: 20px;">
          <form id="cm-mx-form" onsubmit="CmMatriz.guardar(event)"></form>
        </div>
      </div>`;
    document.body.appendChild(m);
    return m;
  }

  function mostrarModal(titulo, html) {
    const m = modal();
    document.getElementById('cm-mx-modal-title').innerHTML = titulo;
    document.getElementById('cm-mx-form').innerHTML = html;
    m.style.display = 'flex';
    if (typeof registrarModalBack === 'function') m._backEntry = registrarModalBack(() => cerrar());
  }

  function cerrar() {
    const m = document.getElementById('cm-mx-modal');
    if (m) m.style.display = 'none';
  }

  function abrir(idcaso, entidad, idRegistro) {
    const def = DEF[entidad];
    const reg = idRegistro ? (cacheRegistros[idcaso][entidad] || []).find(x => x.id === idRegistro) : {};
    const caso = (window._casosMedicosExpediente || []).find(x => String(x.id) === String(idcaso)) || {};
    const soloVer = !puedeRegistrar(caso);
    const bloqueaInicial = entidad === 'compromisos' && reg && reg.n_reprogramaciones;
    const campos = def.campos.map(c => `
      <div class="form-group"${c.tipo === 'textoLargo' ? ' style="grid-column: 1 / -1;"' : ''}>
        <label class="form-label">${esc(c.etiqueta)}</label>
        ${control(`cm-mxf-${c.nombre}`, c.tipo, c.lista, reg[c.nombre])}
        ${c.nombre === 'fecha_inicial' && bloqueaInicial ? '<div style="font-size:0.7rem; color:var(--text-muted);">Con reprogramaciones la fecha inicial no cambia.</div>' : ''}
      </div>`).join('');
    const historial = entidad === 'compromisos' && reg && (reg.reprogramaciones || []).length ? `
      <div style="grid-column: 1 / -1; background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:8px 12px; font-size:0.78rem;">
        <strong>Historial de reprogramaciones</strong>
        ${reg.reprogramaciones.map(r => `<div style="margin-top:4px;">${fecha(r.fecha_anterior)} → <strong>${fecha(r.fecha_nueva)}</strong> · ${esc(r.motivo || '—')}${r.autorizado_por ? ' · ' + esc(r.autorizado_por) : ''} <span style="color:var(--text-muted);">(${esc(r.usuario_nombre || r.usuario || '')})</span></div>`).join('')}
      </div>` : '';
    mostrarModal(`<span>${def.icono}</span> ${idRegistro ? (soloVer ? '' : 'Editar') : 'Agregar'} ${esc(def.titulo)}`, `
      <input type="hidden" id="cm-mxf-idcaso" value="${idcaso}">
      <input type="hidden" id="cm-mxf-entidad" value="${entidad}">
      <input type="hidden" id="cm-mxf-id" value="${idRegistro || ''}">
      <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:12px;">${esc(def.nota)}</div>
      <div class="filters-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">${campos}${historial}</div>
      <div style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid var(--border); padding-top:14px; margin-top:14px;">
        <button type="button" class="btn btn-secondary" onclick="CmMatriz.cerrar()">${soloVer ? 'Cerrar' : 'Cancelar'}</button>
        ${soloVer ? '' : '<button type="submit" class="btn btn-accent" style="font-weight:700;">💾 Guardar</button>'}
      </div>`);
    if (bloqueaInicial) document.getElementById('cm-mxf-fecha_inicial').disabled = true;
    if (soloVer) document.querySelectorAll('#cm-mx-form input, #cm-mx-form select, #cm-mx-form textarea').forEach(el => { el.disabled = true; });
  }

  async function enviar(url, body, ok) {
    showLoading('Guardando...');
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: usuario(), ...body }) });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'No se pudo guardar');
      showToast(ok, 'success');
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
    } finally {
      hideLoading();
    }
  }

  async function guardar(e) {
    e.preventDefault();
    const idcaso = document.getElementById('cm-mxf-idcaso').value;
    const entidad = document.getElementById('cm-mxf-entidad').value;
    if (entidad === '__reprogramar') return guardarReprogramacion(idcaso);
    const body = { id: document.getElementById('cm-mxf-id').value || null };
    DEF[entidad].campos.forEach(c => {
      const el = document.getElementById(`cm-mxf-${c.nombre}`);
      if (el && !el.disabled) body[c.nombre] = el.value.trim();
    });
    if (await enviar(`/casosmedicos/api/caso/${idcaso}/matriz/${entidad}`, body, 'Registro guardado')) {
      cerrar();
      cargar(idcaso, entidad);
    }
  }

  function reprogramar(idcaso, idCompromiso) {
    const c = (cacheRegistros[idcaso].compromisos || []).find(x => x.id === idCompromiso) || {};
    mostrarModal('<span>🔁</span> Reprogramar compromiso', `
      <input type="hidden" id="cm-mxf-idcaso" value="${idcaso}">
      <input type="hidden" id="cm-mxf-entidad" value="__reprogramar">
      <input type="hidden" id="cm-mxf-id" value="${idCompromiso}">
      <div style="background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:8px 12px; font-size:0.8rem; margin-bottom:12px;">
        <strong>${esc(c.compromiso || 'Compromiso')}</strong><br>
        Fecha inicial: <strong>${fecha(c.fecha_inicial)}</strong> · Fecha vigente: <strong>${fecha(c.fecha_vigente)}</strong><br>
        <span style="color:var(--text-muted);">La fecha inicial se conserva para medir el cumplimiento oportuno; el cambio queda en el historial.</span>
      </div>
      <div class="filters-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
        <div class="form-group"><label class="form-label">Nueva fecha *</label><input type="date" class="form-control" id="cm-mxf-fecha_nueva" required></div>
        <div class="form-group"><label class="form-label">Motivo</label><select class="form-control" id="cm-mxf-motivo">${opciones('motivo_reprogramacion', '')}</select></div>
        <div class="form-group"><label class="form-label">Solicitado o autorizado por</label><input type="text" class="form-control" id="cm-mxf-autorizado_por"></div>
        <div class="form-group" style="grid-column: 1 / -1;"><label class="form-label">Observaciones</label><textarea class="form-control" id="cm-mxf-observaciones" rows="2"></textarea></div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid var(--border); padding-top:14px; margin-top:14px;">
        <button type="button" class="btn btn-secondary" onclick="CmMatriz.cerrar()">Cancelar</button>
        <button type="submit" class="btn btn-accent" style="font-weight:700;">🔁 Reprogramar</button>
      </div>`);
  }

  async function guardarReprogramacion(idcaso) {
    const id = document.getElementById('cm-mxf-id').value;
    const body = ['fecha_nueva', 'motivo', 'autorizado_por', 'observaciones'].reduce((o, k) => ({ ...o, [k]: document.getElementById(`cm-mxf-${k}`).value.trim() }), {});
    if (await enviar(`/casosmedicos/api/caso/${idcaso}/compromiso/${id}/reprogramar`, body, 'Compromiso reprogramado')) {
      cerrar();
      cargar(idcaso, 'compromisos');
    }
  }

  async function eliminar(idcaso, entidad, id) {
    if (!confirm('¿Eliminar este registro?')) return;
    showLoading('Eliminando...');
    try {
      const r = await fetch(`/casosmedicos/api/caso/${idcaso}/matriz/${entidad}/${id}?usuario=${encodeURIComponent(usuario())}`, { method: 'DELETE' });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'No se pudo eliminar');
      showToast('Registro eliminado', 'success');
      cargar(idcaso, entidad);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
  }

  // ── Firma del jefe inmediato en las actas ──
  function htmlFirmaJefe(c, tipo, puedeActas) {
    const habilitada = Number(c.estado_general_id) === (tipo === 'apertura' ? 1 : 2);
    const firmada = c[`firma_jefe_${tipo}`];
    const trabajador = c[`firma_${tipo}`] || c[`url_firma_${tipo}`];
    const estado = (ok, txt) => `<span class="badge ${ok ? 'badge-success' : 'badge-warning'}" style="font-size:0.68rem;">${ok ? '✓' : '…'} ${txt}</span>`;
    let acciones = '';
    if (!firmada && habilitada && puedeActas) {
      acciones = c.responsable_operacion
        ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
            <button type="button" class="btn btn-sm btn-secondary" style="font-size:0.72rem; padding:3px 8px; font-weight:600;" onclick="CmMatriz.enlaceJefe(${c.id}, '${tipo}', 'copiar')">👔 Copiar enlace del jefe</button>
            <button type="button" class="btn btn-sm" style="font-size:0.72rem; padding:3px 8px; font-weight:600; background:var(--success-soft); color:var(--success-dark); border:1px solid var(--success-soft);" onclick="CmMatriz.enlaceJefe(${c.id}, '${tipo}', 'whatsapp')">📲 WhatsApp al jefe</button>
          </div>`
        : '<div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">Registre el jefe inmediato en el caso para generar su enlace de firma.</div>';
    }
    return `<div style="border-top:1px dashed var(--border); margin-top:8px; padding-top:6px; font-size:0.74rem;">
      <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
        <span style="color:var(--text-muted);">Firmas:</span>
        ${estado(!!trabajador, 'Trabajador')}
        ${estado(!!firmada, `Jefe inmediato${c.responsable_operacion ? ' (' + esc(c.responsable_operacion) + ')' : ''}`)}
        <span class="badge badge-secondary" style="font-size:0.68rem;">Líder SST: firma registrada</span>
      </div>
      ${acciones}
    </div>`;
  }

  async function enlaceJefe(idcaso, tipo, accion) {
    showLoading('Generando enlace del jefe inmediato...');
    try {
      const r = await fetch(`/casosmedicos/api/caso/${idcaso}/generar-acta-jefe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: usuario(), tipo }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'No se pudo generar el enlace');
      const titulo = tipo === 'apertura' ? 'acta de inicio de seguimiento' : 'acta de cierre y seguimiento';
      if (accion === 'whatsapp') {
        const texto = `Hola ${data.jefe}, por favor firme el ${titulo} del caso de salud de su colaborador en el siguiente enlace (vigente 48 horas): ${data.url}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
      } else {
        await navigator.clipboard.writeText(data.url).catch(() => window.prompt('Copie el enlace:', data.url));
        showToast('Enlace del jefe inmediato copiado (vigente 48 horas)', 'success');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
  }

  function init(catalogos) {
    LISTAS = (catalogos && catalogos.listas) || {};
    DEF = (catalogos && catalogos.matriz) || {};
    pintarCamposCaso();
  }

  window.CmMatriz = {
    init, llenarCampos, leerCampos, limpiarCampos: () => llenarCampos(null),
    htmlResumenCaso, htmlSecciones, montarExpediente, htmlFirmaJefe,
    pestana: (idcaso, k) => pintar(idcaso, k), abrir, cerrar, guardar, reprogramar, eliminar, enlaceJefe,
  };
})();
