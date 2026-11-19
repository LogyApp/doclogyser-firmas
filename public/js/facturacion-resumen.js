/* Facturación › Resumen
 * Valor de los servicios por Operación y Día, separado en Efectivo, Transferencia y Crédito, con el
 * interruptor Subtotal / Total de Servicios y Recibos. Filtros: año, quincena (con flechas) y regional;
 * la búsqueda filtra por operación. Alcance por rol: Maestro_Menu facturacion / Resumen (columna Acceso).
 * Interruptores "Por Área" y "Por Bodega" (apagados por defecto): solo aparecen si el usuario ve alguna
 * operación configurada (CONFIG.resumenDesglose, de Config_Parametros) y agregan esa columna.
 * API: /facturacion/api/resumen. Usa del index de Facturación: CONFIG, esc(), formatMiles(),
 * facNombreQuincena(), facQuincenaDeHoy(), makeTableResizable().
 */
(function () {
  'use strict';

  const COL_AREA = { k: 'area', l: 'Área', ancho: 140 };
  const COL_BODEGA = { k: 'bodega', l: 'Bodega', ancho: 140 };
  const COLUMNAS_FIJAS = [
    { k: 'dia', l: 'Día', ancho: 150 },
    { k: 'efectivo', l: 'Efectivo', ancho: 150, num: true },
    { k: 'transferencia', l: 'Transferencia', ancho: 150, num: true },
    { k: 'credito', l: 'Crédito', ancho: 150, num: true },
    { k: 'total', l: 'Total', ancho: 160, num: true },
  ];
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const st = {
    iniciado: false, filas: [], modo: 'total', orden: { col: 'dia', dir: 'desc' }, timer: null, carga: 0,
    porArea: false, porBodega: false,
  };
  const $ = (id) => document.getElementById(id);
  const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const pesos = (n) => '$ ' + formatMiles(Math.round(Number(n) || 0));
  const opsDesglose = (tipo) => (CONFIG.resumenDesglose && CONFIG.resumenDesglose[tipo]) || [];

  // Columnas visibles: Operación, [Área], [Bodega], Día y los valores
  function columnas() {
    return [{ k: 'operacion', l: 'Operación', ancho: 220 }]
      .concat(st.porArea ? [COL_AREA] : [], st.porBodega ? [COL_BODEGA] : [], COLUMNAS_FIJAS);
  }

  function nombreDia(iso) {
    const f = new Date(`${iso}T12:00:00`);
    if (isNaN(f)) return iso || '—';
    return `${DIAS[f.getDay()]} ${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}/${f.getFullYear()}`;
  }

  // Valores de la fila según el interruptor (subtotal = sin IVA ni retenciones; total = con ellos)
  function valores(f) {
    const v = f[st.modo] || {};
    return { efectivo: v.efectivo || 0, transferencia: v.transferencia || 0, credito: v.credito || 0,
      total: (v.efectivo || 0) + (v.transferencia || 0) + (v.credito || 0) };
  }

  // Interruptor pequeño "Por Área" / "Por Bodega" (solo si hay operaciones configuradas a la vista)
  function interruptorDesglose(tipo, etiqueta) {
    const ops = opsDesglose(tipo);
    if (!ops.length) return '';
    return `
      <label title="Separa por ${etiqueta.toLowerCase()} en: ${esc(ops.join(', '))}" style="display: flex; align-items: center; gap: 8px; background: var(--accent-soft); padding: 4px 14px; border-radius: 20px; border: 1px solid var(--border); cursor: pointer; margin: 0;">
        <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted);">Por ${etiqueta}</span>
        <span class="switch" style="position: relative; display: inline-block; width: 38px; height: 20px; margin: 0;">
          <input type="checkbox" id="res-chk-${tipo}" onchange="resDesglose('${tipo}', this.checked)">
          <span class="slider round"></span>
        </span>
      </label>`;
  }

  function montar() {
    const regionales = (CONFIG.tabs?.resumen?.regionalesFiltro || []);
    const hoy = facQuincenaDeHoy();
    const anios = [];
    for (let a = Number(hoy.anio); a >= 2025; a--) anios.push(a);
    $('tab-content-resumen').innerHTML = `
      <div class="page-hd">
        <div>
          <div class="page-title">Facturación · Resumen</div>
          <div class="page-sub">Valor de los servicios por operación y día, en efectivo, transferencia y crédito</div>
        </div>
        <div class="fq-acciones" style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <div class="fq-nav">
            <button type="button" onclick="resCambiarQuincena(-1)" aria-label="Quincena anterior">‹</button>
            <span id="res-quincena-txt" class="fq-txt">—</span>
            <button type="button" id="res-quincena-sig" onclick="resCambiarQuincena(1)" aria-label="Quincena siguiente">›</button>
          </div>
          ${interruptorDesglose('area', 'Área')}
          ${interruptorDesglose('bodega', 'Bodega')}
          <div style="display: flex; align-items: center; gap: 8px; background: var(--accent-soft); padding: 4px 14px; border-radius: 20px; border: 1px solid var(--border);">
            <span id="res-lbl-subtotal" style="font-size: 0.8rem; font-weight: 500; color: var(--text-muted); cursor: pointer;" onclick="resModo(false)">Subtotal</span>
            <label class="switch" style="position: relative; display: inline-block; width: 38px; height: 20px; margin: 0;">
              <input type="checkbox" id="res-chk-total" onchange="resModo(this.checked)" checked>
              <span class="slider round"></span>
            </label>
            <span id="res-lbl-total" style="font-size: 0.8rem; font-weight: 700; color: var(--accent); cursor: pointer;" onclick="resModo(true)">Total</span>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom: 16px;">
        <div class="filtros-toggle" onclick="resToggleFiltros()">
          <span class="filtros-toggle-left">Filtros <span class="filtros-badge" id="res-filtros-badge">0</span></span>
          <input type="search" class="filtros-busqueda" id="res-filtro-q" placeholder="&#128269; Buscar operación..." aria-label="Buscar operación" oninput="resBuscar()" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">
          <span class="filtros-chevron" id="res-filtros-chevron">▸</span>
        </div>
        <div class="filtros-body" id="res-filtros-body" style="display: none;">
          <div class="filtros-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
            <div class="filtro-field">
              <label>Año</label>
              <select id="res-filtro-anio" onchange="resCambioAnio()">
                ${anios.map(a => `<option value="${a}" ${String(a) === hoy.anio ? 'selected' : ''}>${a}</option>`).join('')}
                <option value="todos">Todos los años</option>
              </select>
            </div>
            <div class="filtro-field filtro-field-quincena-highlight">
              <label>Quincena</label>
              <select id="res-filtro-quincena" onchange="resCargar()"></select>
            </div>
            <div class="filtro-field" ${regionales.length > 1 ? '' : 'style="display:none;"'}>
              <label>Regional</label>
              <select id="res-filtro-regional" onchange="resCargar()">
                <option value="">Todas las regionales</option>
                ${regionales.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="display: flex; justify-content: flex-end; margin-top: 14px; gap: 8px;">
            <button type="button" class="btn-reset" onclick="resLimpiar()">↺ Limpiar filtros</button>
          </div>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table" id="tabla-resumen">
          <thead></thead>
          <tbody id="res-body"></tbody>
          <tfoot id="res-foot"></tfoot>
        </table>
      </div>`;
    pintarQuincenas(hoy.nombre);
    pintarEncabezado();
  }

  // Encabezado según las columnas visibles: orden al hacer clic y ancho ajustable
  function pintarEncabezado() {
    const tabla = $('tabla-resumen');
    tabla.querySelector('thead').innerHTML = `<tr>
      ${columnas().map(c => `<th style="width:${c.ancho}px; ${c.num ? 'text-align:right;' : ''}" data-sort="${c.k}">${c.l}<span id="resSort-${c.k}" class="sort-indicator"></span></th>`).join('')}
    </tr>`;
    tabla.querySelectorAll('thead th[data-sort]').forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', (ev) => {
        if (ev.target.classList.contains('th-resize')) return;
        const col = th.dataset.sort;
        const numerica = COLUMNAS_FIJAS.find(c => c.k === col)?.num;
        st.orden = st.orden.col === col
          ? { col, dir: st.orden.dir === 'asc' ? 'desc' : 'asc' }
          : { col, dir: numerica || col === 'dia' ? 'desc' : 'asc' };
        pintar();
      });
    });
    makeTableResizable(tabla);
  }

  function mensaje(texto, color = 'var(--text-muted)') {
    $('res-body').innerHTML = `<tr><td colspan="${columnas().length}" style="text-align:center; padding:24px; color:${color};">${texto}</td></tr>`;
    $('res-foot').innerHTML = '';
  }

  // Quincenas del año escogido (hasta la actual si es el año en curso)
  function pintarQuincenas(seleccion) {
    const sel = $('res-filtro-quincena');
    const anio = $('res-filtro-anio').value;
    const hoy = facQuincenaDeHoy();
    const limite = anio === hoy.anio ? hoy.mes * 10 + hoy.q : 999;
    const opciones = [];
    for (let m = 1; m <= 12; m++) for (let q = 1; q <= 2; q++) if (m * 10 + q <= limite) opciones.push(facNombreQuincena(m, q));
    const actual = seleccion !== undefined ? seleccion : sel.value;
    sel.innerHTML = '<option value="">Todas las quincenas</option>' + opciones.reverse()
      .map(n => `<option value="${esc(n)}" ${n === actual ? 'selected' : ''}>${esc(n)}</option>`).join('');
  }

  function pintarNavQuincena() {
    const nombre = $('res-filtro-quincena').value;
    const anio = $('res-filtro-anio').value;
    const hoy = facQuincenaDeHoy();
    $('res-quincena-txt').textContent = nombre ? (anio !== hoy.anio && anio !== 'todos' ? `${nombre} · ${anio}` : nombre) : 'Todas las quincenas';
    $('res-quincena-sig').disabled = !!nombre && nombre === hoy.nombre && anio === hoy.anio;
  }

  async function cargar() {
    pintarNavQuincena();
    const badge = ['res-filtro-regional'].filter(id => $(id).value).length
      + ($('res-filtro-quincena').value ? 1 : 0) + ($('res-filtro-anio').value !== facQuincenaDeHoy().anio ? 1 : 0);
    $('res-filtros-badge').textContent = badge;
    const params = new URLSearchParams({
      usuario: CONFIG.usuario,
      anio: $('res-filtro-anio').value,
      quincena: $('res-filtro-quincena').value || 'todas',
      regional: $('res-filtro-regional').value || 'todas',
    });
    if (st.porArea) params.set('area', '1');
    if (st.porBodega) params.set('bodega', '1');
    const carga = ++st.carga;
    mensaje('Cargando resumen...');
    try {
      const resp = await fetch(`/facturacion/api/resumen?${params}`);
      const data = await resp.json();
      if (carga !== st.carga) return; // llegó otra consulta más reciente
      if (!resp.ok) throw new Error(data.error || 'No se pudo cargar el resumen');
      st.filas = data.filas || [];
    } catch (err) {
      if (carga !== st.carga) return;
      st.filas = [];
      mensaje(esc(err.message), 'var(--danger)');
      return;
    }
    pintar();
  }

  function pintar() {
    const q = norm($('res-filtro-q').value);
    const lista = st.filas.filter(f => !q || norm(`${f.operacion} ${f.area || ''} ${f.bodega || ''}`).includes(q))
      .map(f => ({ ...f, ...valores(f) }));
    const cols = columnas();
    if (!cols.some(c => c.k === st.orden.col)) st.orden = { col: 'dia', dir: 'desc' };
    const { col, dir } = st.orden;
    lista.sort((a, b) => {
      let r = typeof a[col] === 'number' ? a[col] - b[col] : String(a[col] || '').localeCompare(String(b[col] || ''), 'es');
      if (!r) r = col === 'dia' ? a.operacion.localeCompare(b.operacion, 'es') : String(b.dia).localeCompare(String(a.dia));
      if (!r) r = `${a.area || ''} ${a.bodega || ''}`.localeCompare(`${b.area || ''} ${b.bodega || ''}`, 'es');
      return dir === 'asc' ? r : -r;
    });
    cols.forEach(c => {
      const ind = $(`resSort-${c.k}`);
      if (ind) ind.textContent = c.k === col ? (dir === 'asc' ? ' ▲' : ' ▼') : '';
      ind?.closest('th')?.classList.toggle('sorted', c.k === col);
    });
    if (!lista.length) {
      mensaje('No hay servicios en efectivo, transferencia o crédito con estos filtros.');
      return;
    }
    const celda = (v, extra = '') => `<td style="text-align:right; ${extra}">${v ? pesos(v) : '<span style="color:var(--text-muted);">—</span>'}</td>`;
    const texto = (v) => `<td>${v ? esc(v) : '<span style="color:var(--text-muted);">—</span>'}</td>`;
    $('res-body').innerHTML = lista.map(f => `
      <tr>
        <td style="font-weight:600;">${esc(f.operacion) || '—'}<div style="font-size:0.72rem; color:var(--text-muted);">${esc(f.regional)} · ${f.servicios} servicio${f.servicios === 1 ? '' : 's'}</div></td>
        ${st.porArea ? texto(f.area) : ''}${st.porBodega ? texto(f.bodega) : ''}
        <td>${nombreDia(f.dia)}</td>
        ${celda(f.efectivo)}${celda(f.transferencia)}${celda(f.credito)}
        ${celda(f.total, 'font-weight:800; color:var(--accent);')}
      </tr>`).join('');
    const suma = (k) => lista.reduce((s, f) => s + f[k], 0);
    const servicios = lista.reduce((s, f) => s + f.servicios, 0);
    $('res-foot').innerHTML = `
      <tr style="background:var(--bg-elevated); font-weight:800;">
        <td>TOTAL <span style="font-size:0.72rem; color:var(--text-muted); font-weight:600;">· ${lista.length} fila${lista.length === 1 ? '' : 's'} · ${formatMiles(servicios)} servicios</span></td>
        ${'<td></td>'.repeat(cols.length - 5)}
        ${celda(suma('efectivo'), 'font-weight:800;')}${celda(suma('transferencia'), 'font-weight:800;')}${celda(suma('credito'), 'font-weight:800;')}
        ${celda(suma('total'), 'font-weight:800; color:var(--accent);')}
      </tr>`;
  }

  // ── Funciones globales (onclick) ─────────────────────────────────────────
  window.resToggleFiltros = () => {
    const body = $('res-filtros-body');
    const abrir = body.style.display !== 'block';
    body.style.display = abrir ? 'block' : 'none';
    $('res-filtros-chevron').style.transform = abrir ? 'rotate(90deg)' : 'rotate(0deg)';
  };
  window.resBuscar = () => { clearTimeout(st.timer); st.timer = setTimeout(pintar, 200); };
  window.resCargar = cargar;
  window.resCambioAnio = () => { pintarQuincenas(''); cargar(); };
  window.resModo = (total) => {
    st.modo = total ? 'total' : 'subtotal';
    $('res-chk-total').checked = !!total;
    $('res-lbl-total').style.cssText += total ? ';font-weight:700;color:var(--accent);' : ';font-weight:500;color:var(--text-muted);';
    $('res-lbl-subtotal').style.cssText += total ? ';font-weight:500;color:var(--text-muted);' : ';font-weight:700;color:var(--accent);';
    pintar();
  };
  // "Por Área" / "Por Bodega": agrega la columna y vuelve a consultar con ese desglose
  window.resDesglose = (tipo, activo) => {
    if (tipo === 'area') st.porArea = !!activo;
    if (tipo === 'bodega') st.porBodega = !!activo;
    pintarEncabezado();
    cargar();
  };
  window.resLimpiar = () => {
    $('res-filtro-q').value = '';
    $('res-filtro-regional').value = '';
    $('res-filtro-anio').value = facQuincenaDeHoy().anio;
    pintarQuincenas(facQuincenaDeHoy().nombre);
    cargar();
  };
  window.resCambiarQuincena = (delta) => {
    const hoy = facQuincenaDeHoy();
    const selQ = $('res-filtro-quincena');
    const selAnio = $('res-filtro-anio');
    const m = /^(\d{1,2})\.\s.*Q([12])$/.exec(selQ.value || '');
    let anio = m && /^\d{4}$/.test(selAnio.value) ? Number(selAnio.value) : Number(hoy.anio);
    let mes = m ? Number(m[1]) : hoy.mes;
    let q = m ? Number(m[2]) : hoy.q;
    if (m) {
      q += delta;
      if (q > 2) { q = 1; mes += 1; }
      if (q < 1) { q = 2; mes -= 1; }
      if (mes > 12) { mes = 1; anio += 1; }
      if (mes < 1) { mes = 12; anio -= 1; }
    }
    if (anio * 1000 + mes * 10 + q > Number(hoy.anio) * 1000 + hoy.mes * 10 + hoy.q) return;
    if (![...selAnio.options].some(o => o.value === String(anio))) selAnio.insertAdjacentHTML('afterbegin', `<option value="${anio}">${anio}</option>`);
    selAnio.value = String(anio);
    pintarQuincenas(facNombreQuincena(mes, q));
    cargar();
  };

  window.inicializarResumenFacturacion = function () {
    if (!st.iniciado) { montar(); st.iniciado = true; }
    cargar();
  };
})();
