/**
 * Contabilidad › Caja Operativa (grupo de subpestañas en la barra lateral)
 * Flujo de Caja (gastos, validación y firmas), Reintegros, Responsables, Reembolsos y Proveedores. Usa la API de /cajaoperativa/api; el acceso de cada
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

  // ═════════════ FASE 2: GASTOS DEL PERIODO (registro, edición y validación) ═════════════
  const seleccionGastos = new Set();
  let gastoActual = null;      // gasto en edición (null = nuevo)
  let proveedores = [];
  let trabajadores = [];

  function accFlujo() { return st.acceso.Caja_Flujo || {}; }
  function esSistema() { return accFlujo().rol === 'Sistema'; }
  function puedeContable() { return Boolean(accFlujo().puedeValidarContable); }
  // Mismo criterio que el servidor (PUT /api/gastos/:id)
  function permisoEdicion(g) {
    if (!g) return 'ALL';
    if (g.valida_contable === 'Confirmado') return esSistema() ? 'ALL' : 'NONE';
    if (g.valida_operacion === 'Confirmado') return (esSistema() || puedeContable()) ? 'ALL' : 'SUPPORT_ONLY';
    return 'ALL';
  }
  function ahoraLocal() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date()).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
  }
  function aLocal(v) {
    if (!v) return '';
    const m = String(v).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    if (m && !/Z$/.test(String(v))) return `${m[1]}T${m[2]}`;
    const d = new Date(v);
    if (isNaN(d)) return '';
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(d).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
  }

  function celdaValidacion(g, area) {
    const valor = area === 'operacion' ? g.valida_operacion : g.valida_contable;
    const puede = area === 'contable' ? puedeContable() : (g.valida_contable !== 'Confirmado' || esSistema());
    const botones = puede
      ? `<button type="button" title="Confirmar" onclick="event.stopPropagation(); cajaValidarUno('${g.idgasto}','${area}','Confirmado')">✓</button>` +
        `<button type="button" class="no" title="No aplica" onclick="event.stopPropagation(); cajaValidarUno('${g.idgasto}','${area}','No aplica')">✗</button>`
      : '';
    return `<div class="caja-val">${chipValidacion(valor)}${botones}</div>`;
  }

  async function pintarGastosPeriodo() {
    const p = st.periodo;
    const body = document.getElementById('cpGastos');
    body.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:var(--text-muted);">Cargando gastos...</td></tr>';
    try {
      const r = await fetch(`/cajaoperativa/api/periodos/${encodeURIComponent(p.idperiodo)}/gastos?usuario=${encodeURIComponent(usuario())}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los gastos.');
      st.gastos = d;
      [...seleccionGastos].forEach(id => { if (!d.some(g => g.idgasto === id)) seleccionGastos.delete(id); });
      const total = d.reduce((a, g) => a + num(g.valor), 0);
      const op = d.filter(g => g.valida_operacion === 'Confirmado').reduce((a, g) => a + num(g.valor), 0);
      const co = d.filter(g => g.valida_contable === 'Confirmado').reduce((a, g) => a + num(g.valor), 0);
      document.getElementById('cpResumenVal').innerHTML = `${d.length} gasto(s) · ${pesos(total)} · Operación ${pesos(op)} · Contable ${pesos(co)}`;
      if (!d.length) {
        body.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:var(--text-muted);">Este periodo no tiene gastos registrados.</td></tr>';
      } else {
        body.innerHTML = d.map((g, i) => `
          <tr onclick="cajaAbrirGasto(${i})" title="${permisoEdicion(g) === 'NONE' ? 'Ver gasto (confirmado por contabilidad)' : 'Editar gasto'}">
            <td class="col-sel" onclick="event.stopPropagation()"><input type="checkbox" class="chk-sel" ${seleccionGastos.has(g.idgasto) ? 'checked' : ''} onchange="cajaSeleccionarGasto('${g.idgasto}', this.checked)"></td>
            <td>${esc(String(aLocal(g.fechamovimiento)).slice(0, 10))}</td>
            <td>${esc(g.tipo_gasto || '-')}</td>
            <td title="${esc(g.tercero || g.numero_identificacion || '')}"><strong>${esc(g.tercero || '-')}</strong><br><small style="color:var(--text-muted);">${esc(g.tipo_identificacion || '')} ${esc(g.numero_identificacion || '')}</small></td>
            <td title="${esc(g.descripcion || '')}">${esc(g.descripcion || '-')}${g.observaciones ? `<br><small style="color:var(--text-muted);">${esc(g.observaciones)}</small>` : ''}</td>
            <td style="text-align:right;"><strong>${pesos(g.valor)}</strong></td>
            <td>${celdaValidacion(g, 'operacion')}</td>
            <td>${celdaValidacion(g, 'contable')}</td>
            <td style="text-align:center;" onclick="event.stopPropagation()">${g.url_soporte ? `<a href="${esc(g.url_soporte)}" target="_blank" rel="noopener">📎 Ver</a>` : '—'}</td>
          </tr>`).join('');
      }
      actualizarBarraGastos();
    } catch (e) {
      body.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px; color:#ef4444;">${esc(e.message)}</td></tr>`;
    }
  }

  // Reemplaza la vista de solo lectura de la fase 1
  window.cajaVerPeriodo = async function (i) {
    const p = st.flujoVista[i];
    st.periodo = p;
    seleccionGastos.clear();
    document.getElementById('cpTitulo').textContent = `${p.quincena} ${p.año} — ${p.usuario || ''} (${p.operacionprincipal || ''})`;
    const kpi = (lbl, val) => `<div class="caja-kpi"><div class="lbl">${lbl}</div><div class="val">${val}</div></div>`;
    document.getElementById('cpKpis').innerHTML =
      kpi('Saldo inicial', pesos(p.saldo_inicial)) + kpi('Reintegros', pesos(p.reintegros)) +
      kpi('Gastos reportados', pesos(p.total_gastos)) + kpi('Saldo final', pesos(p.saldo_final));
    document.getElementById('cpBtnContable').style.display = puedeContable() ? '' : 'none';
    const todos = document.getElementById('cpSelTodos');
    if (todos && !todos.dataset.listo) {
      todos.dataset.listo = '1';
      todos.addEventListener('click', e => e.stopPropagation());
      todos.addEventListener('change', () => {
        (st.gastos || []).forEach(g => { if (todos.checked) seleccionGastos.add(g.idgasto); else seleccionGastos.delete(g.idgasto); });
        pintarGastosPeriodo();
      });
    }
    abrirModal('modalCajaPeriodo');
    await pintarGastosPeriodo();
  };

  // Al cambiar gastos se recargan los saldos del periodo y la tabla del flujo
  async function refrescarTrasCambio() {
    await pintarGastosPeriodo();
    const idp = st.periodo && st.periodo.idperiodo;
    await window.cargarCajaFlujo();
    const nuevo = (st.flujo || []).find(x => x.idperiodo === idp);
    if (nuevo) {
      st.periodo = nuevo;
      const kpi = (lbl, val) => `<div class="caja-kpi"><div class="lbl">${lbl}</div><div class="val">${val}</div></div>`;
      document.getElementById('cpKpis').innerHTML =
        kpi('Saldo inicial', pesos(nuevo.saldo_inicial)) + kpi('Reintegros', pesos(nuevo.reintegros)) +
        kpi('Gastos reportados', pesos(nuevo.total_gastos)) + kpi('Saldo final', pesos(nuevo.saldo_final));
    }
  }

  window.cajaSeleccionarGasto = function (id, marcado) {
    if (marcado) seleccionGastos.add(id); else seleccionGastos.delete(id);
    actualizarBarraGastos();
  };
  window.cajaLimpiarSeleccionGastos = function () { seleccionGastos.clear(); pintarGastosPeriodo(); };
  function actualizarBarraGastos() {
    document.getElementById('cpSelConteo').textContent = seleccionGastos.size;
    document.getElementById('cpBarraMasiva').classList.toggle('visible', seleccionGastos.size > 0);
    const todos = document.getElementById('cpSelTodos');
    const n = (st.gastos || []).length;
    if (todos) { todos.checked = n > 0 && seleccionGastos.size === n; todos.indeterminate = seleccionGastos.size > 0 && seleccionGastos.size < n; }
  }

  async function enviarValidacionGastos(ids, area, estado) {
    const r = await fetch('/cajaoperativa/api/gastos/validar-masivo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: usuario(), ids, area, estado }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'No se pudo validar.');
    return d;
  }
  window.cajaValidarUno = async function (id, area, estado) {
    try {
      const d = await enviarValidacionGastos([id], area, estado);
      if (!d.actualizados.length) throw new Error('No se pudo cambiar: el gasto está fuera de su alcance o ya fue confirmado por contabilidad.');
      await refrescarTrasCambio();
    } catch (e) { alert('Error: ' + e.message); }
  };
  window.cajaValidarMasivo = async function (area, estado) {
    const ids = [...seleccionGastos];
    if (!ids.length) return;
    const texto = estado === 'Confirmado' ? `confirmar (${area === 'contable' ? 'contable' : 'operación'})` : 'marcar como "No aplica"';
    if (!confirm(`¿Desea ${texto} ${ids.length} gasto(s)?`)) return;
    try {
      const d = await enviarValidacionGastos(ids, area, estado);
      seleccionGastos.clear();
      await refrescarTrasCambio();
      if (d.omitidos) alert(`${d.actualizados.length} gasto(s) actualizados · ${d.omitidos} omitido(s) (fuera de su alcance o ya confirmados por contabilidad).`);
    } catch (e) { alert('Error: ' + e.message); }
  };

  // ── Formulario de gasto ──
  function marcarSeg(id, v) { document.querySelectorAll(`#${id} button`).forEach(b => b.classList.toggle('activo', b.dataset.v === v)); }
  window.cajaTipoGasto = function (tipo) {
    st.tipoGasto = tipo;
    marcarSeg('cgTipo', tipo);
    const tipoId = document.getElementById('cgTipoId');
    document.getElementById('cgBloqueTransporte').style.display = tipo === 'Transporte' ? 'block' : 'none';
    document.getElementById('cgCampoDescripcion').style.display = tipo === 'Transporte' ? 'none' : 'block';
    document.getElementById('cgDescripcion').required = tipo !== 'Transporte';
    if (tipo !== 'Transporte') ['cgPlaca', 'cgOrigen', 'cgDestino'].forEach(id => { document.getElementById(id).required = false; });
    if (tipo === 'Transporte') { tipoId.value = 'CC'; tipoId.disabled = true; window.cajaConceptoTransporte(st.conceptoTransporte || 'Turno Extendido'); }
    else if (tipo === 'Compra') { tipoId.value = 'NIT'; tipoId.disabled = true; }
    else { tipoId.disabled = false; }
    window.cajaTipoIdentificacion();
  };
  window.cajaConceptoTransporte = function (c) {
    st.conceptoTransporte = c;
    marcarSeg('cgConcepto', c);
    document.getElementById('cgCampoPlaca').style.display = c === 'Domicilio' ? 'block' : 'none';
    document.getElementById('cgCampoTraslado').style.display = c === 'Traslado' ? 'grid' : 'none';
    document.getElementById('cgPlaca').required = c === 'Domicilio';
    document.getElementById('cgOrigen').required = c === 'Traslado';
    document.getElementById('cgDestino').required = c === 'Traslado';
  };
  window.cajaTipoIdentificacion = function () {
    const tipo = st.tipoGasto;
    const tipoId = document.getElementById('cgTipoId').value;
    const esProveedor = tipoId === 'NIT' && tipo === 'Compra';
    const esTrabajador = tipo === 'Transporte';
    document.getElementById('cgCampoProveedor').style.display = esProveedor ? 'block' : 'none';
    document.getElementById('cgCampoTrabajador').style.display = esTrabajador ? 'block' : 'none';
    document.getElementById('cgLblNumId').textContent = tipoId === 'NIT' ? 'NIT *' : 'Cédula *';
    document.getElementById('cgNumId').readOnly = esProveedor || esTrabajador;
    document.getElementById('cgTercero').readOnly = esProveedor || esTrabajador;
  };

  async function cargarProveedores() {
    try {
      const r = await fetch(`/cajaoperativa/api/proveedores?usuario=${encodeURIComponent(usuario())}`);
      proveedores = r.ok ? await r.json() : [];
    } catch (e) { proveedores = []; }
    window.cajaFiltrarProveedores();
  }
  window.cajaFiltrarProveedores = function () {
    const q = (document.getElementById('cgBuscarProveedor').value || '').toLowerCase().trim();
    const actual = document.getElementById('cgNumId').value;
    const lista = proveedores.filter(p => !q || String(p.nit).toLowerCase().includes(q) || String(p.razon_social || '').toLowerCase().includes(q));
    document.getElementById('cgProveedor').innerHTML = '<option value="">Seleccione proveedor...</option>' +
      lista.map(p => `<option value="${esc(p.nit)}"${String(p.nit) === actual ? ' selected' : ''}>${esc(p.razon_social)} · NIT ${esc(p.nit)}</option>`).join('') +
      '<option value="NUEVO">＋ Nuevo proveedor...</option>';
  };
  window.cajaElegirProveedor = function () {
    const sel = document.getElementById('cgProveedor');
    if (sel.value === 'NUEVO') {
      sel.value = '';
      document.getElementById('cgNuevoProveedor').style.display = 'block';
      return;
    }
    const p = proveedores.find(x => String(x.nit) === sel.value);
    document.getElementById('cgNumId').value = p ? p.nit : '';
    document.getElementById('cgTercero').value = p ? p.razon_social : '';
  };
  window.cajaCrearProveedor = async function () {
    const nit = document.getElementById('cgNpNit').value.trim();
    const razon = document.getElementById('cgNpRazon').value.trim();
    if (!nit || !razon) return alert('NIT y razón social son obligatorios.');
    try {
      const r = await fetch('/cajaoperativa/api/proveedores/crear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: usuario(), nit, razon_social: razon }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo crear el proveedor.');
      document.getElementById('cgNuevoProveedor').style.display = 'none';
      document.getElementById('cgNumId').value = nit;
      document.getElementById('cgTercero').value = razon;
      await cargarProveedores();
    } catch (e) { alert('Error: ' + e.message); }
  };

  window.cajaCargarTrabajadores = async function (seleccion) {
    const op = document.getElementById('cgOperacion').value;
    const sel = document.getElementById('cgTrabajador');
    const regional = st.periodo ? st.periodo.regional : '';
    if (!op) { sel.innerHTML = '<option value="">Seleccione operación...</option>'; trabajadores = []; return; }
    sel.innerHTML = '<option value="">Cargando colaboradores...</option>';
    try {
      const r = await fetch(`/capacitacionsst/api/trabajadores-por-operacion?regional=${encodeURIComponent(regional)}&operacion=${encodeURIComponent(op)}`);
      trabajadores = r.ok ? await r.json() : [];
    } catch (e) { trabajadores = []; }
    const nombre = t => String(t.Trabajador || t.nombre_trabajador || '').split(' ** ').pop();
    const actual = seleccion || document.getElementById('cgNumId').value;
    const opciones = '<option value="">Seleccione colaborador...</option>' +
      trabajadores.map(t => `<option value="${esc(t.identificacion)}"${String(t.identificacion) === String(actual) ? ' selected' : ''}>${esc(nombre(t))} · C.C. ${esc(t.identificacion)}</option>`).join('');
    sel.innerHTML = opciones;
    document.getElementById('cgColabSel').innerHTML = opciones;
  };
  window.cajaElegirTrabajador = function () {
    const cc = document.getElementById('cgTrabajador').value;
    const t = trabajadores.find(x => String(x.identificacion) === cc);
    document.getElementById('cgNumId').value = cc || '';
    document.getElementById('cgTercero').value = t ? String(t.Trabajador || '').split(' ** ').pop() : '';
  };

  // Zona para adjuntar el soporte (mismo diseño de Facturación y Transferencias)
  function montarZonaSoporte() {
    const zona = document.querySelector('.zona-archivo[data-input="cgSoporte"]');
    if (!zona || zona.dataset.montada) return;
    zona.dataset.montada = '1';
    const input = document.getElementById('cgSoporte');
    const camara = document.getElementById('cgSoporteCamara');
    zona.innerHTML = `
      <div class="zona-archivo-caja" style="border:2px dashed var(--border); border-radius:8px; padding:12px; text-align:center; background:var(--bg-elevated); cursor:pointer;">
        <div class="zona-archivo-placeholder">
          <div style="font-size:0.78rem; color: var(--text-muted); margin-bottom:8px;">Arrastra una foto o PDF aquí o elige una opción</div>
          <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
            <button type="button" class="zona-archivo-btn" data-accion="archivo">📎 Elegir archivo</button>
            <button type="button" class="zona-archivo-btn" data-accion="camara">📷 Tomar foto</button>
          </div>
        </div>
        <div class="zona-archivo-preview" style="display:none;"></div>
      </div>`;
    const caja = zona.querySelector('.zona-archivo-caja');
    const asignar = file => {
      if (!file || !(file.type.startsWith('image/') || file.type === 'application/pdf')) return;
      try { const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; } catch (e) { return; }
      pintarZonaSoporte();
    };
    caja.addEventListener('click', e => {
      if (input.disabled) return;
      const btn = e.target.closest('[data-accion]');
      if (btn && btn.dataset.accion === 'camara') { e.stopPropagation(); camara.value = ''; camara.click(); return; }
      if (btn && btn.dataset.accion === 'quitar') { e.stopPropagation(); input.value = ''; pintarZonaSoporte(); return; }
      input.click();
    });
    input.addEventListener('change', pintarZonaSoporte);
    camara.addEventListener('change', () => { asignar(camara.files && camara.files[0]); camara.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => caja.addEventListener(ev, e => { e.preventDefault(); caja.style.borderColor = 'var(--accent)'; }));
    ['dragleave', 'drop'].forEach(ev => caja.addEventListener(ev, e => { e.preventDefault(); caja.style.borderColor = 'var(--border)'; }));
    caja.addEventListener('drop', e => asignar(e.dataTransfer.files && e.dataTransfer.files[0]));
  }
  function pintarZonaSoporte() {
    const zona = document.querySelector('.zona-archivo[data-input="cgSoporte"]');
    const input = document.getElementById('cgSoporte');
    const ph = zona.querySelector('.zona-archivo-placeholder');
    const pv = zona.querySelector('.zona-archivo-preview');
    if (pv.dataset.url) { URL.revokeObjectURL(pv.dataset.url); delete pv.dataset.url; }
    const f = input.files && input.files[0];
    if (!f) { pv.style.display = 'none'; pv.innerHTML = ''; ph.style.display = 'block'; return; }
    ph.style.display = 'none'; pv.style.display = 'block';
    const quitar = '<button type="button" data-accion="quitar" style="margin-top:6px; font-size:0.74rem; color:#ef4444; background:none; border:none; cursor:pointer; text-decoration:underline; font-weight:600;">Quitar archivo</button>';
    if (f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f); pv.dataset.url = url;
      pv.innerHTML = `<img src="${url}" alt="Vista previa" style="max-width:100%; max-height:150px; border-radius:6px; display:block; margin:0 auto;">${quitar}`;
    } else {
      pv.innerHTML = `<div style="font-size:0.84rem; font-weight:700;">📄 ${esc(f.name)}</div>${quitar}`;
    }
  }
  function leerBase64(file) {
    return new Promise((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = mal; fr.readAsDataURL(file); });
  }

  window.cajaAbrirGasto = async function (i) {
    const p = st.periodo;
    if (!p) return;
    const g = i == null ? null : st.gastos[i];
    gastoActual = g;
    const permiso = permisoEdicion(g);
    montarZonaSoporte();
    document.getElementById('formCajaGasto').reset();
    document.getElementById('cgNuevoProveedor').style.display = 'none';
    document.getElementById('cgError').style.display = 'none';
    document.getElementById('cgTitulo').textContent = g ? (permiso === 'NONE' ? 'Gasto (confirmado por contabilidad)' : 'Editar gasto') : `Registrar gasto · ${p.usuario || ''}`;
    const aviso = document.getElementById('cgAviso');
    aviso.style.display = permiso === 'ALL' ? 'none' : 'block';
    aviso.textContent = permiso === 'NONE'
      ? 'Este gasto ya fue confirmado por contabilidad: solo el rol Sistema puede modificarlo.'
      : 'El gasto ya fue confirmado por la operación: solo puedes cambiar el soporte.';

    // Operaciones de la regional del periodo
    const acc = accFlujo();
    let ops = (acc.opsPorRegional || {})[p.regional] || [];
    if (acc.sinFiltro && !ops.length) ops = Object.values(acc.opsPorRegional || {}).flat();
    const opSel = g ? (g.operacion || p.operacionprincipal) : p.operacionprincipal;
    if (opSel && !ops.includes(opSel)) ops = [opSel, ...ops];
    document.getElementById('cgOperacion').innerHTML = [...new Set(ops)].map(o => `<option value="${esc(o)}"${o === opSel ? ' selected' : ''}>${esc(o)}</option>`).join('');

    document.getElementById('cgFecha').value = g ? aLocal(g.fechamovimiento) : ahoraLocal();
    st.conceptoTransporte = '';
    window.cajaTipoGasto(g ? g.tipo_gasto || 'Otro' : 'Compra');
    if (g) {
      document.getElementById('cgTipoId').value = g.tipo_identificacion || 'CC';
      window.cajaTipoIdentificacion();
      document.getElementById('cgNumId').value = g.numero_identificacion || '';
      document.getElementById('cgTercero').value = g.tercero || '';
      document.getElementById('cgDescripcion').value = g.descripcion || '';
      document.getElementById('cgValor').value = Math.round(num(g.valor));
      document.getElementById('cgObs').value = g.observaciones || '';
      if (g.tipo_gasto === 'Transporte') {
        const d = String(g.descripcion || '');
        window.cajaConceptoTransporte(d.includes('Domicilio') ? 'Domicilio' : d.includes('Traslado') ? 'Traslado' : 'Turno Extendido');
        const placa = d.match(/Domicilio\s+(\S+)/); if (placa) document.getElementById('cgPlaca').value = placa[1];
        const tr = d.match(/Origen:\s*(.*?)\s*-\s*Destino:\s*(.*)$/); if (tr) { document.getElementById('cgOrigen').value = tr[1]; document.getElementById('cgDestino').value = tr[2]; }
      }
    }
    document.getElementById('cgSoporteActual').innerHTML = g && g.url_soporte ? `Soporte actual: <a href="${esc(g.url_soporte)}" target="_blank" rel="noopener">ver archivo</a> (se reemplaza si adjuntas otro)` : '';
    pintarZonaSoporte();

    // Bloqueos según permiso
    const campos = ['cgFecha', 'cgOperacion', 'cgBuscarProveedor', 'cgProveedor', 'cgTrabajador', 'cgTipoId', 'cgNumId', 'cgTercero', 'cgDescripcion', 'cgValor', 'cgObs', 'cgPlaca', 'cgOrigen', 'cgDestino'];
    campos.forEach(id => { const el = document.getElementById(id); if (el && permiso !== 'ALL') el.disabled = true; else if (el && id !== 'cgTipoId') el.disabled = false; });
    if (permiso === 'ALL') window.cajaTipoGasto(st.tipoGasto); // reaplica el bloqueo del tipo de identificación
    document.querySelectorAll('#cgTipo button, #cgConcepto button').forEach(b => { b.disabled = permiso !== 'ALL'; });
    document.getElementById('cgSoporte').disabled = permiso === 'NONE';
    document.getElementById('cgGuardar').style.display = permiso === 'NONE' ? 'none' : '';

    abrirModal('modalCajaGasto');
    await Promise.all([cargarProveedores(), window.cajaCargarTrabajadores(g ? g.numero_identificacion : '')]);

    // Colaboradores y firmas (solo gastos ya guardados)
    document.getElementById('cgColaboradores').style.display = g ? 'block' : 'none';
    document.getElementById('cgAgregarColab').style.display = 'none';
    document.getElementById('cgBtnAgregarColab').style.display = g && g.tipo_gasto !== 'Transporte' ? '' : 'none';
    if (g) cargarColaboradores();
  };

  window.cajaGuardarGasto = async function (e) {
    e.preventDefault();
    const p = st.periodo;
    const err = document.getElementById('cgError');
    err.style.display = 'none';
    const tipo = st.tipoGasto;
    const tipoId = document.getElementById('cgTipoId').value;
    const numId = document.getElementById('cgNumId').value.trim();
    const tercero = document.getElementById('cgTercero').value.trim();
    const valor = document.getElementById('cgValor').value;
    if (!numId || !tercero || !valor) { err.textContent = 'Ingrese la identificación, el nombre o razón social y el valor.'; err.style.display = 'block'; return; }
    let descripcion = document.getElementById('cgDescripcion').value.trim();
    if (tipo === 'Transporte') {
      const c = st.conceptoTransporte || 'Turno Extendido';
      const placa = document.getElementById('cgPlaca').value.trim().toUpperCase();
      const origen = document.getElementById('cgOrigen').value.trim();
      const destino = document.getElementById('cgDestino').value.trim();
      descripcion = c === 'Domicilio' ? `Transporte Domicilio ${placa}` : c === 'Traslado' ? `Transporte Traslado Origen: ${origen} - Destino: ${destino}` : 'Transporte Turno Extendido';
    }
    const file = document.getElementById('cgSoporte').files[0];
    const btn = document.getElementById('cgGuardar');
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    try {
      const payload = {
        usuario: usuario(), idperiodo: p.idperiodo, regional: p.regional,
        operacion: document.getElementById('cgOperacion').value || p.operacionprincipal,
        fechamovimiento: document.getElementById('cgFecha').value, tipo_gasto: tipo,
        tipo_identificacion: tipoId, numero_identificacion: numId, tercero, descripcion, valor,
        observaciones: document.getElementById('cgObs').value.trim(),
        url_soporte: file ? await leerBase64(file) : (gastoActual ? gastoActual.url_soporte_original || null : null),
      };
      if (gastoActual && !file) delete payload.url_soporte; // conserva el soporte existente
      const url = gastoActual ? `/cajaoperativa/api/gastos/${encodeURIComponent(gastoActual.idgasto)}` : '/cajaoperativa/api/gastos/registrar';
      const r = await fetch(url, { method: gastoActual ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar el gasto.');
      window.cajaCerrarModal('modalCajaGasto');
      await refrescarTrasCambio();
    } catch (ex) {
      err.textContent = ex.message;
      err.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar gasto';
    }
  };

  // ── Colaboradores y firmas del gasto ──
  async function cargarColaboradores() {
    const cont = document.getElementById('cgListaColab');
    cont.innerHTML = '<div class="caja-nota">Cargando colaboradores...</div>';
    try {
      const r = await fetch(`/cajaoperativa/api/gastos/${encodeURIComponent(gastoActual.idgasto)}/colaboradores?usuario=${encodeURIComponent(usuario())}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los colaboradores.');
      st.colaboradores = d;
      if (!d.length) { cont.innerHTML = '<div class="caja-nota">No hay colaboradores relacionados con este gasto.</div>'; return; }
      cont.innerHTML = d.map((c, i) => `
        <div class="caja-colab">
          <div class="caja-colab-top">
            <div><strong>${esc(c.trabajador_nombre)}</strong><br><small style="color:var(--text-muted);">C.C. ${esc(c.identificacion)} · ${pesos(c.valor)}</small></div>
            ${c.firma ? '<span class="caja-chip ok">✓ Firmado</span>' : '<span class="caja-chip pend">⏳ Pendiente de firma</span>'}
          </div>
          ${c.firma ? '' : `<div class="caja-colab-acc">
            <button type="button" class="btn-action secondary" onclick="cajaColabAccion(${i}, 'copiar')">🔗 Copiar enlace</button>
            <button type="button" class="btn-action secondary" onclick="cajaColabAccion(${i}, 'whatsapp')">💬 WhatsApp</button>
            <button type="button" class="btn-action secondary" onclick="cajaColabAccion(${i}, 'correo')">✉️ Correo</button>
            ${c.tipo_gasto !== 'Transporte' ? `<button type="button" class="btn-action secondary" style="color:#ef4444;" onclick="cajaColabAccion(${i}, 'eliminar')">🗑️ Quitar</button>` : ''}
          </div>`}
        </div>`).join('');
    } catch (e) {
      cont.innerHTML = `<div class="caja-nota" style="color:#ef4444;">${esc(e.message)}</div>`;
    }
  }
  window.cajaColabAccion = async function (i, accion) {
    const c = st.colaboradores[i];
    const url = `${window.location.origin}/reembolso?idgt=${encodeURIComponent(c.idgasto_trabajador)}`;
    const texto = `Hola ${c.trabajador_nombre}, por favor firma el soporte del egreso por ${pesos(c.valor)} en este enlace: ${url}`;
    if (accion === 'copiar') {
      try { await navigator.clipboard.writeText(url); alert('Enlace copiado.'); } catch (e) { prompt('Copia el enlace:', url); }
    } else if (accion === 'whatsapp') {
      window.open(`https://api.whatsapp.com/send?phone=${String(c.telefono || '').replace(/[^0-9]/g, '')}&text=${encodeURIComponent(texto)}`, '_blank');
    } else if (accion === 'correo') {
      window.open(`mailto:${c.email || ''}?subject=${encodeURIComponent('Firma de soporte de gasto')}&body=${encodeURIComponent(texto)}`);
    } else if (accion === 'eliminar') {
      if (!confirm('¿Quitar este colaborador del gasto?')) return;
      const r = await fetch(`/cajaoperativa/api/gastos/${encodeURIComponent(gastoActual.idgasto)}/colaboradores/${encodeURIComponent(c.idgasto_trabajador)}?usuario=${encodeURIComponent(usuario())}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) return alert('Error: ' + (d.error || 'No se pudo quitar.'));
      cargarColaboradores();
    }
  };
  window.cajaMostrarAgregarColab = function (mostrar) {
    document.getElementById('cgAgregarColab').style.display = mostrar ? 'block' : 'none';
    if (mostrar) { document.getElementById('cgColabValor').value = ''; document.getElementById('cgColabObs').value = ''; }
  };
  window.cajaAgregarColab = async function () {
    const identificacion = document.getElementById('cgColabSel').value;
    const valor = document.getElementById('cgColabValor').value;
    if (!identificacion || !valor) return alert('Seleccione un colaborador y el valor.');
    const r = await fetch(`/cajaoperativa/api/gastos/${encodeURIComponent(gastoActual.idgasto)}/colaboradores`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: usuario(), identificacion, valor, observaciones: document.getElementById('cgColabObs').value.trim() }),
    });
    const d = await r.json();
    if (!r.ok) return alert('Error: ' + (d.error || 'No se pudo agregar.'));
    window.cajaMostrarAgregarColab(false);
    cargarColaboradores();
  };

  // ═════════════ REINTEGROS ═════════════
  st.fRein = { estado: '', regional: '', operacion: '' };
  st.ordenRein = { col: 'fecha_solicitud', dir: 'desc' };
  window.inicializarCajaReintegrosSiAplica = async function () {
    if (st.reinIniciado) return;
    st.reinIniciado = true;
    tablaInteractiva(document.getElementById('tablaCajaRein'), st.ordenRein, () => window.cajaRenderReintegros());
    await window.cargarCajaReintegros();
  };
  window.cargarCajaReintegros = async function () {
    const body = document.getElementById('riBody');
    try {
      await obtenerAcceso('Caja_Reintegros');
      const r = await fetch(`/cajaoperativa/api/reintegros?usuario=${encodeURIComponent(usuario())}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los reintegros.');
      st.rein = d;
      window.cajaRenderReintegros();
    } catch (e) {
      body.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px; color:#ef4444;">${esc(e.message)}</td></tr>`;
    }
  };
  window.cajaCambiarFiltroRein = function (campo, valor) {
    st.fRein[campo] = valor;
    if (campo === 'regional') st.fRein.operacion = '';
    window.cajaRenderReintegros();
  };
  window.cajaLimpiarFiltrosRein = function () {
    st.fRein = { estado: '', regional: '', operacion: '' };
    document.getElementById('riBuscar').value = '';
    window.cajaRenderReintegros();
  };
  function fechaHora(v) {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d) ? esc(v) : d.toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  window.cajaRenderReintegros = function () {
    if (!st.rein) return;
    const f = st.fRein;
    const q = document.getElementById('riBuscar').value.trim().toLowerCase();
    const pasa = (x, ex) => (ex === 'estado' || !f.estado || x.estado === f.estado) &&
      (ex === 'regional' || !f.regional || x.regional === f.regional) &&
      (ex === 'operacion' || !f.operacion || x.operacion === f.operacion);
    llenarSelect('riEstado', contarPor(st.rein.filter(x => pasa(x, 'estado')), 'estado'), f.estado, 'Todos los estados');
    llenarSelect('riRegional', contarPor(st.rein.filter(x => pasa(x, 'regional')), 'regional'), f.regional, 'Todas las regionales');
    llenarSelect('riOperacion', contarPor(st.rein.filter(x => pasa(x, 'operacion')), 'operacion'), f.operacion, 'Todas las operaciones');
    badge('riFiltrosBadge', Object.values(f).filter(Boolean).length);
    let lista = st.rein.filter(x => pasa(x));
    if (q) lista = lista.filter(x => [x.usuariosolicita, x.resp_identificacion, x.regional, x.operacion, x.observaciones_solicitante].some(v => String(v || '').toLowerCase().includes(q)));
    const pend = lista.filter(x => x.estado === 'PENDIENTE');
    const aprob = lista.filter(x => x.estado === 'APROBADO');
    document.getElementById('riKpiPend').textContent = pend.length;
    document.getElementById('riKpiPendVal').textContent = pesos(pend.reduce((a, x) => a + num(x.valor), 0));
    document.getElementById('riKpiAprob').textContent = aprob.length;
    document.getElementById('riKpiAprobVal').textContent = pesos(aprob.reduce((a, x) => a + num(x.valor), 0));
    marcarOrden(document.getElementById('tablaCajaRein'), st.ordenRein);
    lista = ordenar(lista, st.ordenRein, (x, col) => (col === 'valor' ? num(x.valor) : x[col]));
    st.reinVista = lista;
    const puedeAprobar = Boolean((st.acceso.Caja_Reintegros || {}).sinFiltro);
    const body = document.getElementById('riBody');
    if (!lista.length) {
      body.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">${st.rein.length ? 'No hay reintegros con estos filtros.' : 'Aún no hay solicitudes de reintegro.'}</td></tr>`;
      return;
    }
    body.innerHTML = lista.map((x, i) => {
      const chip = x.estado === 'APROBADO' ? 'ok' : x.estado === 'PENDIENTE' ? 'pend' : 'no';
      const aprobable = puedeAprobar && x.estado === 'PENDIENTE';
      return `
      <tr ${aprobable ? `onclick="cajaAbrirAprobacion(${i})" title="Aprobar reintegro"` : 'style="cursor:default;"'}>
        <td>${fechaHora(x.fecha_solicitud)}</td>
        <td><strong>${esc(x.usuariosolicita || '-')}</strong><br><small style="color:var(--text-muted);">C.C. ${esc(x.resp_identificacion || '')}</small></td>
        <td>${esc(x.regional || '-')}</td>
        <td>${esc(x.operacion || '-')}</td>
        <td style="text-align:right;"><strong>${pesos(x.valor)}</strong></td>
        <td><span class="caja-chip ${chip}">${esc(x.estado)}</span>${aprobable ? '<br><small style="color:var(--accent); font-weight:700;">Toca para aprobar</small>' : ''}</td>
        <td>${fechaHora(x.fecha_reintegro)}</td>
        <td>${esc(x.usuarioaprueba || '—')}</td>
        <td title="${esc((x.observaciones_solicitante || '') + ' / ' + (x.observaciones_aprobador || ''))}"><small><b>Sol:</b> ${esc(x.observaciones_solicitante || '—')}<br><b>Aprob:</b> ${esc(x.observaciones_aprobador || '—')}</small></td>
      </tr>`;
    }).join('');
  };

  window.cajaAbrirSolicitudReintegro = async function () {
    document.getElementById('rsObs').value = '';
    document.getElementById('rsError').style.display = 'none';
    document.getElementById('rsInfo').style.display = 'none';
    document.getElementById('rsAviso').style.display = 'none';
    const sel = document.getElementById('rsResponsable');
    sel.innerHTML = '<option value="">Cargando responsables...</option>';
    abrirModal('modalCajaSolicitud');
    try {
      const r = await fetch(`/cajaoperativa/api/responsables?usuario=${encodeURIComponent(usuario())}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los responsables.');
      st.respSolicitud = d;
      sel.innerHTML = '<option value="">Seleccione responsable...</option>' +
        d.map((x, i) => `<option value="${i}">${esc(x.usuario)} (${esc(x.operacionprincipal || '')})</option>`).join('');
      if (d.length === 1) { sel.value = '0'; window.cajaInfoReintegro(); }
    } catch (e) {
      sel.innerHTML = '<option value="">—</option>';
      document.getElementById('rsError').textContent = e.message;
      document.getElementById('rsError').style.display = 'block';
    }
  };
  window.cajaInfoReintegro = function () {
    const i = document.getElementById('rsResponsable').value;
    const info = document.getElementById('rsInfo');
    const aviso = document.getElementById('rsAviso');
    const btn = document.getElementById('rsEnviar');
    if (i === '') { info.style.display = 'none'; aviso.style.display = 'none'; btn.disabled = true; return; }
    const x = st.respSolicitud[Number(i)];
    const uso = num(x.porcentaje_uso);
    const kpi = (lbl, val, color) => `<div class="caja-kpi"><div class="lbl">${lbl}</div><div class="val"${color ? ` style="color:${color}"` : ''}>${val}</div></div>`;
    info.innerHTML = kpi('Base autorizada', pesos(x.base_autorizada)) + kpi('Saldo disponible', pesos(x.saldo)) +
      kpi('Uso', `${uso.toFixed(1).replace('.', ',')}%`, uso > 70 ? '#ef4444' : uso >= 60 ? '#f59e0b' : '#16a34a');
    info.style.display = 'grid';
    const bloqueado = uso < 60;
    aviso.style.display = bloqueado ? 'block' : 'none';
    aviso.textContent = 'El reintegro se puede solicitar cuando el uso de la caja llega al 60% o más.';
    btn.disabled = bloqueado;
  };
  window.cajaEnviarSolicitud = async function () {
    const i = document.getElementById('rsResponsable').value;
    if (i === '') return;
    const x = st.respSolicitud[Number(i)];
    const err = document.getElementById('rsError');
    const btn = document.getElementById('rsEnviar');
    btn.disabled = true;
    try {
      const r = await fetch('/cajaoperativa/api/reintegros/solicitar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: usuario(), idresponsable: x.idresponsable, observaciones_solicitante: document.getElementById('rsObs').value.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo enviar la solicitud.');
      window.cajaCerrarModal('modalCajaSolicitud');
      await window.cargarCajaReintegros();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  };
  window.cajaAbrirAprobacion = function (i) {
    const x = st.reinVista[i];
    st.reinAprobar = x;
    document.getElementById('raResumen').innerHTML = `
      <b>Caja de:</b> ${esc(x.usuariosolicita)} (C.C. ${esc(x.resp_identificacion || '')})<br>
      <b>Ubicación:</b> ${esc(x.regional || '')} — ${esc(x.operacion || '')}<br>
      <b>Base autorizada:</b> ${pesos(x.base_autorizada)}<br>
      <b>Solicitado:</b> ${fechaHora(x.fecha_solicitud)}<br>
      <b>Observaciones:</b> ${esc(x.observaciones_solicitante || '—')}`;
    document.getElementById('raValor').value = Math.round(num(x.valor));
    document.getElementById('raObs').value = '';
    document.getElementById('raError').style.display = 'none';
    abrirModal('modalCajaAprobar');
  };
  window.cajaAprobarReintegro = async function () {
    const x = st.reinAprobar;
    const valor = document.getElementById('raValor').value;
    const err = document.getElementById('raError');
    if (!valor || num(valor) <= 0) { err.textContent = 'Ingrese el valor a reintegrar.'; err.style.display = 'block'; return; }
    const btn = document.getElementById('raAprobar');
    btn.disabled = true;
    try {
      const r = await fetch(`/cajaoperativa/api/reintegros/${encodeURIComponent(x.idreintegro)}/aprobar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: usuario(), valor, observaciones_aprobador: document.getElementById('raObs').value.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo aprobar.');
      window.cajaCerrarModal('modalCajaAprobar');
      await window.cargarCajaReintegros();
      if (st.flujoIniciado) window.cargarCajaFlujo();
      if (st.respIniciado) window.cargarCajaResponsables();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  };


  // ═════════════ FASE 3: REEMBOLSOS ═════════════
  st.fReem = { tipo: '', regional: '', operacion: '' };
  st.ordenReem = { col: 'fecha_registro', dir: 'desc' };
  function tipoReembolso(x) { return x.tipo_gasto || (x.tipo_transporte ? 'Transporte' : 'Otro'); }
  window.inicializarCajaReembolsosSiAplica = async function () {
    if (st.reemIniciado) return;
    st.reemIniciado = true;
    document.getElementById('reEnlacePublico').textContent = `${window.location.origin}/reembolso`;
    tablaInteractiva(document.getElementById('tablaCajaReem'), st.ordenReem, () => window.cajaRenderReembolsos());
    await window.cargarCajaReembolsos();
  };
  window.cargarCajaReembolsos = async function () {
    const body = document.getElementById('reBody');
    try {
      await obtenerAcceso('Caja_Reembolsos');
      const r = await fetch(`/cajaoperativa/api/reembolsos/pendientes?usuario=${encodeURIComponent(usuario())}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los reembolsos.');
      st.reem = d.map(x => ({ ...x, tipo: tipoReembolso(x) }));
      window.cajaRenderReembolsos();
    } catch (e) {
      body.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#ef4444;">${esc(e.message)}</td></tr>`;
    }
  };
  window.cajaCambiarFiltroReem = function (campo, valor) {
    st.fReem[campo] = valor;
    if (campo === 'regional') st.fReem.operacion = '';
    window.cajaRenderReembolsos();
  };
  window.cajaLimpiarFiltrosReem = function () {
    st.fReem = { tipo: '', regional: '', operacion: '' };
    document.getElementById('reBuscar').value = '';
    window.cajaRenderReembolsos();
  };
  window.cajaCopiarEnlaceReembolso = async function () {
    const url = `${window.location.origin}/reembolso`;
    try { await navigator.clipboard.writeText(url); alert('Enlace copiado: ' + url); } catch (e) { prompt('Copia el enlace:', url); }
  };
  window.cajaRenderReembolsos = function () {
    if (!st.reem) return;
    const f = st.fReem;
    const q = document.getElementById('reBuscar').value.trim().toLowerCase();
    const pasa = (x, ex) => (ex === 'tipo' || !f.tipo || x.tipo === f.tipo) &&
      (ex === 'regional' || !f.regional || x.regional === f.regional) &&
      (ex === 'operacion' || !f.operacion || x.operacion === f.operacion);
    llenarSelect('reTipo', contarPor(st.reem.filter(x => pasa(x, 'tipo')), 'tipo'), f.tipo, 'Todos los tipos');
    llenarSelect('reRegional', contarPor(st.reem.filter(x => pasa(x, 'regional')), 'regional'), f.regional, 'Todas las regionales');
    llenarSelect('reOperacion', contarPor(st.reem.filter(x => pasa(x, 'operacion')), 'operacion'), f.operacion, 'Todas las operaciones');
    badge('reFiltrosBadge', Object.values(f).filter(Boolean).length);
    let lista = st.reem.filter(x => pasa(x));
    if (q) lista = lista.filter(x => [x.trabajador_nombre, x.identificacion, x.descripcion_gasto, x.operacion, x.observaciones].some(v => String(v || '').toLowerCase().includes(q)));
    document.getElementById('reKpiTotal').textContent = lista.length;
    document.getElementById('reKpiValor').textContent = pesos(lista.reduce((a, x) => a + num(x.valor), 0));
    document.getElementById('reKpiFirma').textContent = lista.filter(x => x.firma).length;
    marcarOrden(document.getElementById('tablaCajaReem'), st.ordenReem);
    lista = ordenar(lista, st.ordenReem, (x, col) => (col === 'valor' ? num(x.valor) : col === 'firma' ? (x.firma ? 1 : 0) : x[col]));
    st.reemVista = lista;
    const body = document.getElementById('reBody');
    if (!lista.length) {
      body.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">${st.reem.length ? 'No hay reembolsos con estos filtros.' : 'No hay reembolsos pendientes de vincular.'}</td></tr>`;
      return;
    }
    body.innerHTML = lista.map((x, i) => `
      <tr onclick="cajaAbrirVincular(${i})" title="Vincular a una caja">
        <td>${fechaHora(x.fecha_registro)}</td>
        <td><strong>${esc(x.trabajador_nombre || '-')}</strong><br><small style="color:var(--text-muted);">C.C. ${esc(x.identificacion)}</small></td>
        <td><small>${x.telefono ? `📱 ${esc(x.telefono)}` : '—'}${x.email ? `<br>✉️ ${esc(x.email)}` : ''}</small></td>
        <td>${esc(x.operacion || '-')}<br><small style="color:var(--text-muted);">${esc(x.regional || '')}</small></td>
        <td title="${esc(x.descripcion_gasto || '')}"><strong>${esc(x.tipo)}</strong>: ${esc(x.descripcion_gasto || '')}${x.observaciones ? `<br><small style="color:var(--text-muted);">${esc(x.observaciones)}</small>` : ''}</td>
        <td style="text-align:right;"><strong>${pesos(x.valor)}</strong></td>
        <td style="text-align:center;" onclick="event.stopPropagation()">${x.firma ? `<a href="#" onclick="event.preventDefault(); cajaVerFirma(${i})">📝 Ver</a>` : '<span class="caja-chip pend">Sin firma</span>'}</td>
      </tr>`).join('');
  };
  window.cajaVerFirma = function (i) {
    const x = st.reemVista[i];
    if (!x || !x.firma) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.title = `Firma - ${x.trabajador_nombre || ''}`;
    const img = w.document.createElement('img');
    img.src = x.firma;
    img.style.cssText = 'max-width:90%; max-height:90vh; border:1px solid #ddd; display:block; margin:5vh auto;';
    w.document.body.appendChild(img);
  };
  window.cajaAbrirVincular = async function (i) {
    const x = st.reemVista[i];
    st.reemVincular = x;
    const esTransporte = x.tipo === 'Transporte';
    document.getElementById('viResumen').innerHTML = `
      <b>Colaborador:</b> ${esc(x.trabajador_nombre || '')} (C.C. ${esc(x.identificacion)})<br>
      <b>Operación:</b> ${esc(x.regional || '')} — ${esc(x.operacion || '')}<br>
      <b>Gasto:</b> ${esc(x.tipo)} · ${esc(x.descripcion_gasto || '')}<br>
      <b>Valor:</b> ${pesos(x.valor)} · ${x.firma ? '✓ Firmado' : '⏳ Sin firma'}`;
    document.getElementById('viLblDestino').textContent = esTransporte ? 'Caja / quincena donde se registra *' : 'Gasto existente al que se asocia *';
    document.getElementById('viAyuda').textContent = esTransporte
      ? 'Se crea un gasto de Transporte en esa caja con el valor del reembolso.'
      : 'El reembolso queda como colaborador de ese gasto.';
    document.getElementById('viError').style.display = 'none';
    const sel = document.getElementById('viDestino');
    sel.innerHTML = '<option value="">Cargando opciones...</option>';
    abrirModal('modalCajaVincular');
    try {
      const qs = `usuario=${encodeURIComponent(usuario())}&regional=${encodeURIComponent(x.regional || '')}&operacion=${encodeURIComponent(x.operacion || '')}`;
      const r = await fetch(`/cajaoperativa/api/reembolsos/${esTransporte ? 'periodos' : 'gastos'}-vincular?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudieron cargar las opciones.');
      if (!d.length) {
        sel.innerHTML = `<option value="">${esTransporte ? 'No hay cajas de esta operación.' : 'No hay gastos registrados en esta operación.'}</option>`;
        return;
      }
      sel.innerHTML = '<option value="">Seleccione...</option>' + d.map(o => esTransporte
        ? `<option value="${esc(o.idperiodo)}">${esc(o.quincena)} ${esc(o.año)} · ${esc(o.responsable || o.identificacion || '')} (base ${pesos(o.base_autorizada)})</option>`
        : `<option value="${esc(o.idgasto)}">${esc(String(aLocal(o.fechamovimiento)).slice(0, 10))} · ${esc(o.tipo_gasto)} · ${esc(o.tercero || '')} · ${pesos(o.valor)}</option>`).join('');
    } catch (e) {
      sel.innerHTML = '<option value="">—</option>';
      document.getElementById('viError').textContent = e.message;
      document.getElementById('viError').style.display = 'block';
    }
  };
  window.cajaVincularReembolso = async function () {
    const x = st.reemVincular;
    const destino = document.getElementById('viDestino').value;
    const err = document.getElementById('viError');
    if (!destino) { err.textContent = 'Seleccione una opción de la lista.'; err.style.display = 'block'; return; }
    const btn = document.getElementById('viGuardar');
    btn.disabled = true;
    try {
      const r = await fetch('/cajaoperativa/api/reembolsos/vincular', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: usuario(), idgasto_trabajador: x.idgasto_trabajador, tipo_gasto: x.tipo, targetId: destino }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo vincular.');
      window.cajaCerrarModal('modalCajaVincular');
      await window.cargarCajaReembolsos();
      if (st.flujoIniciado) window.cargarCajaFlujo();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  };

  // ═════════════ FASE 3: PROVEEDORES ═════════════
  st.ordenProv = { col: 'razon_social', dir: 'asc' };
  window.inicializarCajaProveedoresSiAplica = async function () {
    if (st.provIniciado) return;
    st.provIniciado = true;
    tablaInteractiva(document.getElementById('tablaCajaProv'), st.ordenProv, () => window.cajaRenderProveedores());
    await window.cargarCajaProveedores();
  };
  window.cargarCajaProveedores = async function () {
    const body = document.getElementById('pvBody');
    try {
      await obtenerAcceso('Caja_Proveedores');
      const r = await fetch(`/cajaoperativa/api/proveedores?usuario=${encodeURIComponent(usuario())}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los proveedores.');
      st.prov = d;
      window.cajaRenderProveedores();
    } catch (e) {
      body.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:30px; color:#ef4444;">${esc(e.message)}</td></tr>`;
    }
  };
  window.cajaRenderProveedores = function () {
    if (!st.prov) return;
    const q = document.getElementById('pvBuscar').value.trim().toLowerCase();
    let lista = st.prov.filter(x => !q || String(x.nit).toLowerCase().includes(q) || String(x.razon_social || '').toLowerCase().includes(q));
    document.getElementById('pvKpiTotal').textContent = lista.length;
    marcarOrden(document.getElementById('tablaCajaProv'), st.ordenProv);
    lista = ordenar(lista, st.ordenProv, (x, col) => x[col]);
    st.provVista = lista;
    const body = document.getElementById('pvBody');
    if (!lista.length) {
      body.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:30px; color:var(--text-muted);">${st.prov.length ? 'No hay proveedores con esa búsqueda.' : 'Aún no hay proveedores registrados.'}</td></tr>`;
      return;
    }
    body.innerHTML = lista.map((x, i) => `
      <tr onclick="cajaAbrirProveedor(${i})" title="Editar proveedor">
        <td><strong>${esc(x.nit)}</strong></td>
        <td>${esc(x.razon_social || '-')}</td>
        <td>${esc(x.usuario || '—')}</td>
      </tr>`).join('');
  };
  window.cajaAbrirProveedor = function (i) {
    const x = i == null ? null : st.provVista[i];
    st.provEditando = x ? String(x.nit) : null;
    document.getElementById('pvmTitulo').textContent = x ? 'Editar proveedor' : 'Nuevo proveedor';
    document.getElementById('pvmNit').value = x ? x.nit : '';
    document.getElementById('pvmRazon').value = x ? x.razon_social || '' : '';
    document.getElementById('pvmNota').style.display = x ? 'block' : 'none';
    document.getElementById('pvmError').style.display = 'none';
    abrirModal('modalCajaProveedor');
  };
  window.cajaGuardarProveedor = async function () {
    const nit = document.getElementById('pvmNit').value.trim();
    const razon = document.getElementById('pvmRazon').value.trim();
    const err = document.getElementById('pvmError');
    if (!nit || !razon) { err.textContent = 'NIT y razón social son obligatorios.'; err.style.display = 'block'; return; }
    const btn = document.getElementById('pvmGuardar');
    btn.disabled = true;
    try {
      const editando = st.provEditando;
      const url = editando ? `/cajaoperativa/api/proveedores/${encodeURIComponent(editando)}` : '/cajaoperativa/api/proveedores/crear';
      const r = await fetch(url, { method: editando ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: usuario(), nit, razon_social: razon }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar el proveedor.');
      window.cajaCerrarModal('modalCajaProveedor');
      await window.cargarCajaProveedores();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  };

})();
