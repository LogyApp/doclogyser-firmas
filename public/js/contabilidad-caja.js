/**
 * Contabilidad › Caja Operativa (grupo de subpestañas en la barra lateral)
 * Fase 1: Flujo de Caja y Responsables. Usa la API de /cajaoperativa/api; el acceso de cada
 * subpestaña lo decide Maestro_Menu (contabilidad / Caja_Flujo, Caja_Responsables, ...).
 */
(function () {
  'use strict';

  const st = {
    acceso: {},          // por sección: respuesta de /cajaoperativa/api/acceso
    flujo: null, flujoIniciado: false,
    resp: null, respIniciado: false,
    fFlujo: { anio: '', quincena: '', regional: '', operacion: '' },
    fResp: { regional: '', operacion: '' },
    ordenFlujo: { col: 'periodo', dir: 'desc' },
    ordenResp: { col: 'usuario', dir: 'asc' },
    editando: null,
  };

  function usuario() {
    return new URLSearchParams(window.location.search).get('usuario') || (window.CONFIG && window.CONFIG.usuarioId) || '';
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function pesos(n) { return '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }
  function num(v) { return Number(v) || 0; }
  // "11. Noviembre Q1" + 2026 → número para ordenar cronológicamente
  function clavePeriodo(p) {
    const m = String(p.quincena || '').match(/^(\d+)\.\s.*Q([12])/i);
    return (num(p.año) * 100) + (m ? Number(m[1]) * 2 + Number(m[2]) : 0);
  }

  async function obtenerAcceso(seccion) {
    if (st.acceso[seccion]) return st.acceso[seccion];
    const r = await fetch(`/cajaoperativa/api/acceso?usuario=${encodeURIComponent(usuario())}&seccion=${encodeURIComponent(seccion)}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'No autorizado para Caja Operativa.');
    st.acceso[seccion] = d;
    return d;
  }

  // ── Utilidades de tabla: ancho de columnas y orden por encabezado ──
  function tablaInteractiva(tabla, estadoOrden, alOrdenar) {
    if (!tabla || tabla.dataset.listo) return;
    tabla.dataset.listo = '1';
    tabla.querySelectorAll('thead th').forEach(th => {
      const handle = document.createElement('span');
      handle.className = 'th-resize';
      handle.title = 'Arrastra para cambiar el ancho';
      th.appendChild(handle);
      handle.addEventListener('click', e => e.stopPropagation());
      handle.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        const x0 = e.clientX; const w0 = th.offsetWidth;
        handle.classList.add('resizing');
        try { handle.setPointerCapture(e.pointerId); } catch (err) { /* */ }
        const mover = ev => { const w = Math.max(50, w0 + ev.clientX - x0); th.style.width = w + 'px'; th.style.minWidth = w + 'px'; };
        const soltar = () => {
          handle.classList.remove('resizing');
          handle.removeEventListener('pointermove', mover);
          handle.removeEventListener('pointerup', soltar);
          handle.removeEventListener('pointercancel', soltar);
        };
        handle.addEventListener('pointermove', mover);
        handle.addEventListener('pointerup', soltar);
        handle.addEventListener('pointercancel', soltar);
      });
      if (th.dataset.sort) {
        th.addEventListener('click', e => {
          if (e.target.classList.contains('th-resize')) return;
          const col = th.dataset.sort;
          if (estadoOrden.col === col) estadoOrden.dir = estadoOrden.dir === 'asc' ? 'desc' : 'asc';
          else { estadoOrden.col = col; estadoOrden.dir = 'asc'; }
          alOrdenar();
        });
      }
    });
  }
  function marcarOrden(tabla, estadoOrden) {
    tabla.querySelectorAll('thead th[data-sort]').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.sort === estadoOrden.col) th.classList.add(estadoOrden.dir === 'asc' ? 'sort-asc' : 'sort-desc');
    });
  }
  function ordenar(lista, estadoOrden, valor) {
    const s = estadoOrden.dir === 'asc' ? 1 : -1;
    return lista.slice().sort((a, b) => {
      const va = valor(a, estadoOrden.col); const vb = valor(b, estadoOrden.col);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * s;
      return String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb), 'es', { numeric: true, sensitivity: 'base' }) * s;
    });
  }
  function llenarSelect(id, conteo, valor, textoTodos) {
    const sel = document.getElementById(id);
    const opciones = Object.entries(conteo).sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }));
    if (valor && !conteo[valor]) opciones.unshift([valor, 0]);
    const total = Object.values(conteo).reduce((a, n) => a + n, 0);
    sel.innerHTML = `<option value="">${textoTodos} (${total})</option>` +
      opciones.map(([v, n]) => `<option value="${esc(v)}"${v === valor ? ' selected' : ''}>${esc(v)} (${n})</option>`).join('');
  }
  function contarPor(lista, campo) {
    const c = {};
    lista.forEach(x => { const v = x[campo] || 'Sin dato'; c[v] = (c[v] || 0) + 1; });
    return c;
  }
  function badge(id, n) {
    const b = document.getElementById(id);
    b.textContent = n;
    b.style.display = n ? 'inline-flex' : 'none';
  }

  window.cajaToggleFiltros = function (pref) {
    const body = document.getElementById(`${pref}FiltrosBody`);
    const abrir = body.style.display === 'none';
    body.style.display = abrir ? 'block' : 'none';
    document.getElementById(`${pref}FiltrosChevron`).style.transform = abrir ? 'rotate(90deg)' : 'rotate(0deg)';
  };
  window.cajaCerrarModal = function (id) { document.getElementById(id).classList.remove('active'); };
  function abrirModal(id) { document.getElementById(id).classList.add('active'); }

  // ═════════════ FLUJO DE CAJA ═════════════
  window.inicializarCajaFlujoSiAplica = async function () {
    if (st.flujoIniciado) return;
    st.flujoIniciado = true;
    tablaInteractiva(document.getElementById('tablaCajaFlujo'), st.ordenFlujo, () => window.cajaRenderFlujo());
    tablaInteractiva(document.getElementById('tablaCajaGastos'), { col: '', dir: 'asc' }, () => {});
    await window.cargarCajaFlujo();
  };

  window.cargarCajaFlujo = async function () {
    const body = document.getElementById('cfBody');
    try {
      await obtenerAcceso('Caja_Flujo');
      const r = await fetch(`/cajaoperativa/api/periodos?usuario=${encodeURIComponent(usuario())}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar el flujo de caja.');
      st.flujo = d.map(p => ({ ...p, _clave: clavePeriodo(p), periodo: `${p.quincena} ${p.año}` }));
      // Por defecto: la quincena más reciente con datos
      if (!st.fFlujo.quincena && !st.fFlujo.anio && st.flujo.length) {
        const ult = st.flujo.reduce((a, b) => (b._clave > a._clave ? b : a));
        st.fFlujo.anio = String(ult.año);
        st.fFlujo.quincena = ult.quincena;
      }
      window.cajaRenderFlujo();
    } catch (e) {
      body.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:#ef4444;">${esc(e.message)}</td></tr>`;
    }
  };

  window.cajaCambiarFiltroFlujo = function (campo, valor) {
    st.fFlujo[campo] = valor;
    if (campo === 'anio') st.fFlujo.quincena = '';
    if (campo === 'regional') st.fFlujo.operacion = '';
    window.cajaRenderFlujo();
  };
  window.cajaLimpiarFiltrosFlujo = function () {
    st.fFlujo = { anio: '', quincena: '', regional: '', operacion: '' };
    document.getElementById('cfBuscar').value = '';
    window.cajaRenderFlujo();
  };

  window.cajaRenderFlujo = function () {
    if (!st.flujo) return;
    const f = st.fFlujo;
    const q = document.getElementById('cfBuscar').value.trim().toLowerCase();
    const pasa = (p, excepto) =>
      (excepto === 'anio' || !f.anio || String(p.año) === f.anio) &&
      (excepto === 'quincena' || !f.quincena || p.quincena === f.quincena) &&
      (excepto === 'regional' || !f.regional || p.regional === f.regional) &&
      (excepto === 'operacion' || !f.operacion || p.operacionprincipal === f.operacion);
    const anios = {};
    st.flujo.filter(p => pasa(p, 'anio')).forEach(p => { anios[p.año] = (anios[p.año] || 0) + 1; });
    llenarSelect('cfAnio', anios, f.anio, 'Todos los años');
    const quin = {};
    st.flujo.filter(p => pasa(p, 'quincena')).forEach(p => { quin[p.quincena] = (quin[p.quincena] || 0) + 1; });
    llenarSelect('cfQuincena', quin, f.quincena, 'Todas las quincenas');
    // Quincenas en orden cronológico inverso
    const selQ = document.getElementById('cfQuincena');
    const opts = [...selQ.options].slice(1).sort((a, b) => {
      const n = o => { const m = o.value.match(/^(\d+)\.\s.*Q([12])/i); return m ? Number(m[1]) * 2 + Number(m[2]) : 0; };
      return n(b) - n(a);
    });
    opts.forEach(o => selQ.appendChild(o));
    llenarSelect('cfRegional', contarPor(st.flujo.filter(p => pasa(p, 'regional')), 'regional'), f.regional, 'Todas las regionales');
    llenarSelect('cfOperacion', contarPor(st.flujo.filter(p => pasa(p, 'operacion')), 'operacionprincipal'), f.operacion, 'Todas las operaciones');
    badge('cfFiltrosBadge', Object.values(f).filter(Boolean).length);

    let lista = st.flujo.filter(p => pasa(p));
    if (q) {
      lista = lista.filter(p => [p.usuario, p.resp_identificacion, p.regional, p.operacionprincipal, p.quincena]
        .some(v => String(v || '').toLowerCase().includes(q)));
    }
    document.getElementById('cfKpiCajas').textContent = lista.length.toLocaleString('es-CO');
    document.getElementById('cfKpiInicial').textContent = pesos(lista.reduce((a, p) => a + num(p.saldo_inicial), 0));
    document.getElementById('cfKpiGastos').textContent = pesos(lista.reduce((a, p) => a + num(p.total_gastos), 0));
    document.getElementById('cfKpiFinal').textContent = pesos(lista.reduce((a, p) => a + num(p.saldo_final), 0));

    const tabla = document.getElementById('tablaCajaFlujo');
    marcarOrden(tabla, st.ordenFlujo);
    lista = ordenar(lista, st.ordenFlujo, (p, col) => {
      if (col === 'periodo') return p._clave;
      if (['saldo_inicial', 'reintegros', 'total_gastos', 'total_confirmado_operacion', 'total_confirmado_contable', 'saldo_final'].includes(col)) return num(p[col]);
      return p[col];
    });
    st.flujoVista = lista;
    const body = document.getElementById('cfBody');
    if (!lista.length) {
      body.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--text-muted);">${st.flujo.length ? 'No hay periodos con estos filtros.' : 'Aún no hay cajas registradas. Los periodos se crean solos cada quincena para cada responsable.'}</td></tr>`;
      return;
    }
    body.innerHTML = lista.map((p, i) => `
      <tr onclick="cajaVerPeriodo(${i})" title="Ver los gastos del periodo">
        <td><strong>${esc(p.quincena)}</strong><br><small style="color:var(--text-muted);">${esc(p.año)}</small></td>
        <td><strong>${esc(p.usuario || '-')}</strong><br><small style="color:var(--text-muted);">C.C. ${esc(p.resp_identificacion || '')}</small></td>
        <td>${esc(p.regional || '-')}</td>
        <td>${esc(p.operacionprincipal || '-')}</td>
        <td style="text-align:right;">${pesos(p.saldo_inicial)}</td>
        <td style="text-align:right;">${pesos(p.reintegros)}</td>
        <td style="text-align:right;">${pesos(p.total_gastos)}</td>
        <td style="text-align:right;">${pesos(p.total_confirmado_operacion)}</td>
        <td style="text-align:right;">${pesos(p.total_confirmado_contable)}</td>
        <td style="text-align:right;"><strong style="color:${num(p.saldo_final) < 0 ? '#ef4444' : 'var(--accent)'};">${pesos(p.saldo_final)}</strong></td>
      </tr>`).join('');
  };

  function chipValidacion(v) {
    const t = String(v || 'PENDIENTE');
    const cl = /confirmado/i.test(t) ? 'ok' : /rechaz|no/i.test(t) ? 'no' : 'pend';
    return `<span class="caja-chip ${cl}">${esc(t)}</span>`;
  }

  window.cajaVerPeriodo = async function (i) {
    const p = st.flujoVista[i];
    document.getElementById('cpTitulo').textContent = `${p.quincena} ${p.año} — ${p.usuario || ''} (${p.operacionprincipal || ''})`;
    const kpi = (lbl, val) => `<div class="caja-kpi"><div class="lbl">${lbl}</div><div class="val">${val}</div></div>`;
    document.getElementById('cpKpis').innerHTML =
      kpi('Saldo inicial', pesos(p.saldo_inicial)) + kpi('Reintegros', pesos(p.reintegros)) +
      kpi('Gastos reportados', pesos(p.total_gastos)) + kpi('Saldo final', pesos(p.saldo_final));
    const body = document.getElementById('cpGastos');
    body.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted);">Cargando gastos...</td></tr>';
    abrirModal('modalCajaPeriodo');
    try {
      const r = await fetch(`/cajaoperativa/api/periodos/${encodeURIComponent(p.idperiodo)}/gastos?usuario=${encodeURIComponent(usuario())}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los gastos.');
      if (!d.length) {
        body.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted);">Este periodo no tiene gastos registrados.</td></tr>';
        return;
      }
      body.innerHTML = d.map(g => `
        <tr style="cursor:default;">
          <td>${esc(String(g.fechamovimiento || '').slice(0, 10))}</td>
          <td>${esc(g.tipo_gasto || '-')}</td>
          <td title="${esc(g.tercero || g.numero_identificacion || '')}">${esc(g.tercero || g.numero_identificacion || '-')}</td>
          <td title="${esc(g.descripcion || '')}">${esc(g.descripcion || '-')}</td>
          <td style="text-align:right;"><strong>${pesos(g.valor)}</strong></td>
          <td>${chipValidacion(g.valida_operacion)}</td>
          <td>${chipValidacion(g.valida_contable)}</td>
          <td style="text-align:center;">${g.url_soporte ? `<a href="${esc(g.url_soporte)}" target="_blank" rel="noopener">📎 Ver</a>` : '—'}</td>
        </tr>`).join('');
    } catch (e) {
      body.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#ef4444;">${esc(e.message)}</td></tr>`;
    }
  };

  // ═════════════ RESPONSABLES ═════════════
  window.inicializarCajaResponsablesSiAplica = async function () {
    if (st.respIniciado) return;
    st.respIniciado = true;
    tablaInteractiva(document.getElementById('tablaCajaResp'), st.ordenResp, () => window.cajaRenderResponsables());
    await window.cargarCajaResponsables();
  };

  window.cargarCajaResponsables = async function () {
    const body = document.getElementById('crBody');
    try {
      const acc = await obtenerAcceso('Caja_Responsables');
      document.getElementById('crAcciones').style.display = acc.sinFiltro ? 'flex' : 'none';
      const r = await fetch(`/cajaoperativa/api/responsables?usuario=${encodeURIComponent(usuario())}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los responsables.');
      st.resp = d;
      window.cajaRenderResponsables();
    } catch (e) {
      body.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#ef4444;">${esc(e.message)}</td></tr>`;
    }
  };

  window.cajaCambiarFiltroResp = function (campo, valor) {
    st.fResp[campo] = valor;
    if (campo === 'regional') st.fResp.operacion = '';
    window.cajaRenderResponsables();
  };
  window.cajaLimpiarFiltrosResp = function () {
    st.fResp = { regional: '', operacion: '' };
    document.getElementById('crBuscar').value = '';
    window.cajaRenderResponsables();
  };

  window.cajaRenderResponsables = function () {
    if (!st.resp) return;
    const f = st.fResp;
    const q = document.getElementById('crBuscar').value.trim().toLowerCase();
    const pasa = (x, excepto) =>
      (excepto === 'regional' || !f.regional || x.regional === f.regional) &&
      (excepto === 'operacion' || !f.operacion || x.operacionprincipal === f.operacion);
    llenarSelect('crRegional', contarPor(st.resp.filter(x => pasa(x, 'regional')), 'regional'), f.regional, 'Todas las regionales');
    llenarSelect('crOperacion', contarPor(st.resp.filter(x => pasa(x, 'operacion')), 'operacionprincipal'), f.operacion, 'Todas las operaciones');
    badge('crFiltrosBadge', Object.values(f).filter(Boolean).length);

    let lista = st.resp.filter(x => pasa(x));
    if (q) {
      lista = lista.filter(x => [x.usuario, x.identificacion, x.regional, x.operacionprincipal, x.banco, x.numerocuenta]
        .some(v => String(v || '').toLowerCase().includes(q)));
    }
    const base = lista.reduce((a, x) => a + num(x.base_autorizada), 0);
    const saldo = lista.reduce((a, x) => a + num(x.saldo), 0);
    document.getElementById('crKpiTotal').textContent = lista.length.toLocaleString('es-CO');
    document.getElementById('crKpiBase').textContent = pesos(base);
    document.getElementById('crKpiSaldo').textContent = pesos(saldo);
    document.getElementById('crKpiUso').textContent = lista.length
      ? `${(lista.reduce((a, x) => a + num(x.porcentaje_uso), 0) / lista.length).toFixed(1).replace('.', ',')}%` : '0%';

    const tabla = document.getElementById('tablaCajaResp');
    marcarOrden(tabla, st.ordenResp);
    lista = ordenar(lista, st.ordenResp, (x, col) => (['base_autorizada', 'saldo', 'porcentaje_uso'].includes(col) ? num(x[col]) : x[col]));
    st.respVista = lista;
    const body = document.getElementById('crBody');
    if (!lista.length) {
      body.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">${st.resp.length ? 'No hay responsables con estos filtros.' : 'Aún no hay responsables de caja registrados.'}</td></tr>`;
      return;
    }
    body.innerHTML = lista.map((x, i) => {
      const uso = Math.max(0, num(x.porcentaje_uso));
      const color = uso > 70 ? '#ef4444' : uso >= 60 ? '#f59e0b' : '#16a34a';
      return `
      <tr onclick="cajaAbrirResponsable(${i})" title="${(st.acceso.Caja_Responsables || {}).sinFiltro ? 'Editar responsable' : 'Ver responsable'}">
        <td><strong>${esc(x.usuario || '-')}</strong><br><small style="color:var(--text-muted);">C.C. ${esc(x.identificacion)}</small></td>
        <td>${esc(x.regional || '-')}</td>
        <td>${esc(x.operacionprincipal || '-')}</td>
        <td>${x.banco ? `<strong>${esc(x.banco)}</strong><br><small style="color:var(--text-muted);">${esc(x.numerocuenta || '')}</small>` : '—'}</td>
        <td style="text-align:right;">${pesos(x.base_autorizada)}</td>
        <td style="text-align:right;"><strong style="color:${num(x.saldo) < 0 ? '#ef4444' : 'var(--accent)'};">${pesos(x.saldo)}</strong></td>
        <td><div class="caja-uso"><div class="caja-uso-barra"><div style="width:${Math.min(100, uso)}%; background:${color};"></div></div><span class="caja-uso-num" style="color:${color};">${uso.toFixed(1).replace('.', ',')}%</span></div></td>
      </tr>`;
    }).join('');
  };

  // Formulario de responsable (crear / editar; solo acceso 1)
  window.cajaLlenarOperacionesForm = function (valor) {
    const acc = st.acceso.Caja_Responsables || {};
    const reg = document.getElementById('crmRegional').value;
    const ops = (acc.opsPorRegional || {})[reg] || [];
    document.getElementById('crmOperacion').innerHTML = '<option value="">Seleccione operación...</option>' +
      ops.map(o => `<option value="${esc(o)}"${o === valor ? ' selected' : ''}>${esc(o)}</option>`).join('');
  };

  window.cajaAbrirResponsable = function (i) {
    const acc = st.acceso.Caja_Responsables || {};
    const x = i == null ? null : st.respVista[i];
    st.editando = x ? x.idresponsable : null;
    const editable = Boolean(acc.sinFiltro);
    document.getElementById('crmTitulo').textContent = x ? (editable ? 'Editar Responsable de Caja' : 'Responsable de Caja') : 'Registrar Responsable de Caja';
    const regs = Object.keys(acc.opsPorRegional || {}).sort();
    if (x && x.regional && !regs.includes(x.regional)) regs.unshift(x.regional);
    document.getElementById('crmRegional').innerHTML = '<option value="">Seleccione regional...</option>' +
      regs.map(r => `<option value="${esc(r)}"${x && r === x.regional ? ' selected' : ''}>${esc(r)}</option>`).join('');
    window.cajaLlenarOperacionesForm(x ? x.operacionprincipal : '');
    if (x && x.operacionprincipal && !document.querySelector(`#crmOperacion option[value="${CSS.escape(x.operacionprincipal)}"]`)) {
      document.getElementById('crmOperacion').insertAdjacentHTML('beforeend', `<option value="${esc(x.operacionprincipal)}" selected>${esc(x.operacionprincipal)}</option>`);
    }
    document.getElementById('crmCedula').value = x ? x.identificacion : '';
    document.getElementById('crmNombre').textContent = x ? x.usuario || '' : '';
    document.getElementById('crmBanco').value = x ? x.banco || '' : '';
    document.getElementById('crmCuenta').value = x ? x.numerocuenta || '' : '';
    document.getElementById('crmBase').value = x ? Math.round(num(x.base_autorizada)) : '';
    document.getElementById('crmObs').value = x ? x.observaciones || '' : '';
    document.getElementById('crmError').style.display = 'none';
    document.querySelectorAll('#formCajaResponsable input, #formCajaResponsable select, #formCajaResponsable textarea')
      .forEach(el => { el.disabled = !editable; });
    document.getElementById('crmGuardar').style.display = editable ? '' : 'none';
    document.getElementById('crmEliminar').style.display = editable && x ? '' : 'none';
    abrirModal('modalCajaResponsable');
  };

  window.cajaBuscarNombre = async function () {
    const cc = document.getElementById('crmCedula').value.trim();
    const out = document.getElementById('crmNombre');
    if (!cc) { out.textContent = ''; return; }
    try {
      const r = await fetch(`/cajaoperativa/api/trabajador/${encodeURIComponent(cc)}`);
      const d = await r.json();
      out.textContent = r.ok ? `✓ ${String(d.trabajador || '').split(' ** ').pop()} · ${d.operacion || ''}` : 'No se encontró un trabajador activo con esa cédula.';
    } catch (e) { out.textContent = ''; }
  };

  window.cajaGuardarResponsable = async function (e) {
    e.preventDefault();
    const err = document.getElementById('crmError');
    const payload = {
      usuario: usuario(),
      identificacion: document.getElementById('crmCedula').value.trim(),
      regional: document.getElementById('crmRegional').value,
      operacionprincipal: document.getElementById('crmOperacion').value,
      banco: document.getElementById('crmBanco').value.trim(),
      numerocuenta: document.getElementById('crmCuenta').value.trim(),
      base_autorizada: document.getElementById('crmBase').value,
      observaciones: document.getElementById('crmObs').value.trim(),
    };
    const btn = document.getElementById('crmGuardar');
    btn.disabled = true;
    try {
      const url = st.editando ? `/cajaoperativa/api/responsables/${encodeURIComponent(st.editando)}` : '/cajaoperativa/api/responsables/crear';
      const r = await fetch(url, { method: st.editando ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar.');
      window.cajaCerrarModal('modalCajaResponsable');
      await window.cargarCajaResponsables();
      if (st.flujoIniciado) window.cargarCajaFlujo();
    } catch (ex) {
      err.textContent = ex.message;
      err.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  };

  window.cajaEliminarResponsable = async function () {
    if (!st.editando) return;
    if (!confirm('¿Eliminar este responsable de caja? Sus periodos y gastos ya registrados se conservan.')) return;
    try {
      const r = await fetch(`/cajaoperativa/api/responsables/${encodeURIComponent(st.editando)}?usuario=${encodeURIComponent(usuario())}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo eliminar.');
      window.cajaCerrarModal('modalCajaResponsable');
      await window.cargarCajaResponsables();
    } catch (ex) {
      alert('Error: ' + ex.message);
    }
  };
})();
