/**
 * Contabilidad › Formas de Pago
 * Informe de la quincena por operación: Efectivo, Transferencia y Crédito.
 * Todos ven porcentajes; los valores en pesos llegan del servidor solo para las operaciones
 * del alcance del usuario (Maestro_Menu contabilidad / Formas_Pago).
 */
(function () {
  'use strict';

  const st = {
    iniciado: false,
    datos: null,
    modalidad: 'recaudo',   // recaudo | todas | credito
    medida: 'total',        // total | base (Subtotal)
    vista: 'ranking',       // ranking | dias
    filtros: { regional: '', operacion: '' },
  };
  const MEDALLAS = ['🥇', '🥈', '🥉'];

  function usuario() {
    return new URLSearchParams(window.location.search).get('usuario') || (window.CONFIG && window.CONFIG.usuarioId) || '';
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function pesos(n) { return '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }
  function pct(x, dec = 1) { return (x == null ? '—' : (Math.round(x * 1000) / 10).toFixed(dec).replace('.', ',') + '%'); }
  function hoyBogota() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date()); }
  function fechaCorta(ymd) {
    const d = new Date(`${ymd}T12:00:00`);
    return d.toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '');
  }

  // Métrica principal según la modalidad, a partir de las fracciones [efectivo, transferencia, crédito]
  function metrica(p) {
    if (!p) return null;
    const [e, t, c] = p;
    if (st.modalidad === 'recaudo') return (e + t) > 0 ? t / (e + t) : null;
    if (st.modalidad === 'credito') return c;
    return t;
  }
  function etiquetaMetrica() {
    if (st.modalidad === 'recaudo') return 'Transf. del recaudo';
    if (st.modalidad === 'credito') return 'Crédito';
    return 'Transferencia';
  }
  // Segmentos de la barra (ancho en fracción) según la modalidad
  function segmentos(p) {
    if (!p) return [];
    const [e, t, c] = p;
    if (st.modalidad === 'recaudo') {
      const r = e + t;
      return r > 0 ? [['t', t / r, 'Transferencia'], ['e', e / r, 'Efectivo']] : [];
    }
    if (st.modalidad === 'credito') return [['c', c, 'Crédito'], ['t', t, 'Transferencia'], ['e', e, 'Efectivo']];
    return [['t', t, 'Transferencia'], ['e', e, 'Efectivo'], ['c', c, 'Crédito']];
  }
  function barra(p) {
    const segs = segmentos(p).filter(s => s[1] > 0);
    if (!segs.length) return '<div class="fp-barra"></div>';
    return `<div class="fp-barra">${segs.map(([cl, w, nom]) =>
      `<div class="${cl}" style="width:${(w * 100).toFixed(2)}%" title="${nom}: ${pct(w)}">${w >= 0.09 ? pct(w, 0) : ''}</div>`).join('')}</div>`;
  }
  function variacion(actual, anterior) {
    if (actual == null || anterior == null) return '';
    const d = Math.round((actual - anterior) * 1000) / 10;
    const q = st.datos && st.datos.anterior ? st.datos.anterior.quincena : 'la quincena anterior';
    if (Math.abs(d) < 0.1) return `<span class="fp-var igual" title="Igual que ${esc(q)}">= 0 pts</span>`;
    // En Crédito, subir no es lo deseado: se pinta al revés
    const bueno = st.modalidad === 'credito' ? d < 0 : d > 0;
    return `<span class="fp-var ${bueno ? 'sube' : 'baja'}" title="Frente a ${esc(q)}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1).replace('.', ',')} pts</span>`;
  }
  function valoresTexto(v) {
    if (!v) return '';
    const m = v[st.medida];
    const [e, t, c] = m;
    const partes = st.modalidad === 'recaudo'
      ? [['Transferencia', t], ['Efectivo', e], ['Recaudo', e + t]]
      : st.modalidad === 'credito'
        ? [['Crédito', c], ['Recaudo', e + t], ['Total', e + t + c]]
        : [['Transferencia', t], ['Efectivo', e], ['Crédito', c], ['Total', e + t + c]];
    return `<div class="fp-valores">${partes.map(([n, x]) => `<span>${n}: <b>${pesos(x)}</b></span>`).join('')}<span>${v.servicios.toLocaleString('es-CO')} servicios</span></div>`;
  }

  // ── Carga ───────────────────────────────────────────────
  async function cargarQuincenas(anio, seleccion) {
    const r = await fetch(`/contabilidad/api/formas-pago/quincenas?usuario=${encodeURIComponent(usuario())}&anio=${encodeURIComponent(anio || '')}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'No se pudieron cargar las quincenas.');
    const selAnio = document.getElementById('fpAnio');
    if (!selAnio.options.length) {
      const actual = Number(d.anioActual);
      for (let a = actual; a >= 2024; a--) selAnio.insertAdjacentHTML('beforeend', `<option value="${a}">${a}</option>`);
    }
    selAnio.value = d.anio;
    const objetivo = seleccion || (d.anio === d.anioActual ? d.quincenaActual : d.quincenas[0]);
    document.getElementById('fpQuincena').innerHTML = d.quincenas
      .map(q => `<option value="${esc(q)}"${q === objetivo ? ' selected' : ''}>${esc(q)}${q === d.quincenaActual && d.anio === d.anioActual ? ' (actual)' : ''}</option>`).join('');
  }

  window.inicializarFormasPagoSiAplica = async function () {
    if (st.iniciado) return;
    st.iniciado = true;
    try {
      await cargarQuincenas('', '');
      await window.cargarFormasPago();
    } catch (e) {
      document.getElementById('fpPanel').innerHTML = `<div class="fp-vacio" style="color:#ef4444;">${esc(e.message)}</div>`;
    }
  };

  window.cargarFormasPago = async function (btn) {
    const qs = new URLSearchParams({
      usuario: usuario(),
      anio: document.getElementById('fpAnio').value,
      quincena: document.getElementById('fpQuincena').value,
    });
    if (st.filtros.regional) qs.set('regional', st.filtros.regional);
    if (st.filtros.operacion) qs.set('operacion', st.filtros.operacion);
    if (btn && btn.classList) btn.classList.add('girando');
    try {
      const r = await fetch(`/contabilidad/api/formas-pago?${qs.toString()}`);
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo cargar el informe.');
      st.datos = d;
      fpRender();
    } catch (e) {
      document.getElementById('fpPanel').innerHTML = `<div class="fp-vacio" style="color:#ef4444;">${esc(e.message)}</div>`;
    } finally {
      if (btn && btn.classList) btn.classList.remove('girando');
    }
  };

  // ── Controles ──────────────────────────────────────────
  window.fpCambiarAnio = async function () {
    await cargarQuincenas(document.getElementById('fpAnio').value, '');
    window.cargarFormasPago();
  };
  function marcarSegmento(id, v) {
    document.querySelectorAll(`#${id} button`).forEach(b => b.classList.toggle('activo', b.dataset.v === v));
  }
  window.fpCambiarModalidad = function (m) { st.modalidad = m; marcarSegmento('fpModalidad', m); fpRender(); };
  window.fpCambiarVista = function (v) { st.vista = v; marcarSegmento('fpVista', v); fpRender(); };
  window.fpCambiarMedida = function (m) {
    st.medida = m;
    document.getElementById('fpMedidaTotal').checked = m === 'total';
    document.getElementById('fpLblTotal').classList.toggle('activo', m === 'total');
    document.getElementById('fpLblSubtotal').classList.toggle('activo', m === 'base');
    fpRender();
  };
  window.fpToggleFiltros = function () {
    const body = document.getElementById('fpFiltrosBody');
    const abrir = body.style.display === 'none';
    body.style.display = abrir ? 'block' : 'none';
    document.getElementById('fpFiltrosChevron').style.transform = abrir ? 'rotate(90deg)' : 'rotate(0deg)';
  };
  window.fpCambiarFiltro = function (campo, valor) {
    st.filtros[campo] = valor;
    if (campo === 'regional') st.filtros.operacion = '';
    window.cargarFormasPago();
  };
  window.fpLimpiarFiltros = function () {
    st.filtros = { regional: '', operacion: '' };
    document.getElementById('fpBuscar').value = '';
    window.cargarFormasPago();
  };
  window.fpVerOperacion = function (op) {
    st.filtros.operacion = op;
    st.vista = 'dias';
    marcarSegmento('fpVista', 'dias');
    window.cargarFormasPago();
    document.getElementById('fpPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function llenarSelect(id, facetas, valor, textoTodos) {
    const sel = document.getElementById(id);
    const ops = (facetas || []).slice();
    if (valor && !ops.some(f => f.valor === valor)) ops.unshift({ valor, n: 0 });
    const total = ops.reduce((a, f) => a + f.n, 0);
    sel.innerHTML = `<option value="">${textoTodos} (${total})</option>` +
      ops.map(f => `<option value="${esc(f.valor)}"${f.valor === valor ? ' selected' : ''}>${esc(f.valor)} (${f.n})</option>`).join('');
  }

  // ── Render ─────────────────────────────────────────────
  function ranking(d) {
    const conMetrica = d.operaciones.map(o => ({ ...o, m: metrica(o.pct && o.pct[st.medida]), mAnt: metrica(o.pctAnterior && o.pctAnterior[st.medida]) }));
    const con = conMetrica.filter(o => o.m != null)
      .sort((a, b) => (b.m - a.m) || a.operacion.localeCompare(b.operacion, 'es'));
    const sin = conMetrica.filter(o => o.m == null).sort((a, b) => a.operacion.localeCompare(b.operacion, 'es'));
    con.forEach((o, i) => { o.puesto = i + 1; });
    return { con, sin };
  }

  window.fpRender = function fpRender() {
    const d = st.datos;
    if (!d) return;
    const mias = new Set((d.misOperaciones || []).map(x => x.toLowerCase()));
    const esMia = op => mias.has(String(op).toLowerCase());

    llenarSelect('fpRegional', d.facetas.regional, st.filtros.regional, 'Todas las regionales');
    llenarSelect('fpOperacion', d.facetas.operacion, st.filtros.operacion, 'Todas las operaciones');
    const activos = (st.filtros.regional ? 1 : 0) + (st.filtros.operacion ? 1 : 0);
    const badge = document.getElementById('fpFiltrosBadge');
    badge.textContent = activos;
    badge.style.display = activos ? 'inline-flex' : 'none';

    // Leyenda
    const ley = st.modalidad === 'recaudo'
      ? [['var(--fp-transf)', 'Transferencia'], ['var(--fp-efectivo)', 'Efectivo']]
      : [['var(--fp-transf)', 'Transferencia'], ['var(--fp-efectivo)', 'Efectivo'], ['var(--fp-credito)', 'Crédito']];
    document.getElementById('fpLeyenda').innerHTML = ley.map(([c, n]) => `<span><i style="background:${c}"></i>${n}</span>`).join('') +
      (st.modalidad === 'recaudo' ? '<span>· Recaudo = Transferencia + Efectivo (sin crédito)</span>' : '');

    const { con, sin } = ranking(d);
    renderResumen(d, con, esMia);

    const panel = document.getElementById('fpPanel');
    if (st.vista === 'dias') { panel.innerHTML = renderDias(d); return; }

    const q = document.getElementById('fpBuscar').value.trim().toLowerCase();
    const coincide = o => !q || o.operacion.toLowerCase().includes(q) || String(o.regional).toLowerCase().includes(q);
    const fila = o => {
      const medalla = o.puesto && o.puesto <= 3 && st.modalidad !== 'credito';
      return `
      <div class="fp-fila${esMia(o.operacion) ? ' mia' : ''}${o.m == null ? ' sin-dato' : ''}" onclick="fpVerOperacion(this.dataset.op)" data-op="${esc(o.operacion)}" title="Ver ${esc(o.operacion)} por día">
        <div class="fp-puesto${medalla ? ' medalla' : ''}">${o.puesto ? (medalla ? MEDALLAS[o.puesto - 1] : o.puesto) : '—'}</div>
        <div class="fp-op">
          <div class="fp-op-nombre">${esc(o.operacion)}${esMia(o.operacion) ? '<span class="fp-tag-mia">Tu operación</span>' : ''}</div>
          <div class="fp-op-reg">${esc(o.regional)}</div>
        </div>
        <div class="fp-barra-wrap">${barra(o.pct && o.pct[st.medida])}${valoresTexto(o.valores)}</div>
        <div class="fp-pct">
          <div class="fp-pct-num">${o.m == null ? '—' : pct(o.m)}</div>
          <div class="fp-pct-lbl">${o.m == null ? 'Solo crédito' : etiquetaMetrica()}</div>
          ${variacion(o.m, o.mAnt)}
        </div>
      </div>`;
    };
    const lista = con.filter(coincide).map(fila).join('');
    const listaSin = sin.filter(coincide).map(fila).join('');
    if (!lista && !listaSin) { panel.innerHTML = '<div class="fp-vacio">No hay servicios en esta quincena con los filtros escogidos.</div>'; return; }
    const titulo = st.modalidad === 'credito'
      ? 'Operaciones ordenadas por participación del crédito'
      : `Operaciones ordenadas por % de transferencia${st.modalidad === 'recaudo' ? ' sobre el recaudo' : ' sobre el total'} · toca una operación para verla por día`;
    panel.innerHTML = `<div class="fp-titulo-panel">${titulo}</div>${lista}` +
      (listaSin ? `<div class="fp-separador">Sin recaudo en la quincena (solo crédito)</div>${listaSin}` : '');
  };

  function renderResumen(d, con, esMia) {
    const p = d.resumen.pct && d.resumen.pct[st.medida];
    const pAnt = d.resumen.pctAnterior && d.resumen.pctAnterior[st.medida];
    const v = d.resumen.valores && d.resumen.valores[st.medida];
    const kpi = (lbl, val, sub, color, extra = '') =>
      `<div class="fp-kpi ${extra}" style="--fp-c:${color}"><div class="fp-kpi-lbl">${lbl}</div><div class="fp-kpi-val">${val}</div><div class="fp-kpi-sub">${sub}</div></div>`;
    const cards = [];
    if (!p) {
      document.getElementById('fpResumen').innerHTML = kpi('Sin datos', '—', `${esc(d.quincena)} · no hay servicios con estos filtros`, 'var(--border)');
      return;
    }
    const [e, t, c] = p;
    const alcance = st.filtros.operacion || st.filtros.regional || 'Todas las operaciones';
    if (st.modalidad === 'recaudo') {
      const r = e + t;
      cards.push(kpi('Transferencia del recaudo', r > 0 ? pct(t / r) : '—', `${esc(alcance)} ${variacion(r > 0 ? t / r : null, pAnt && (pAnt[0] + pAnt[1]) > 0 ? pAnt[1] / (pAnt[0] + pAnt[1]) : null)}`, 'var(--fp-transf)'));
      cards.push(kpi('Efectivo del recaudo', r > 0 ? pct(e / r) : '—', 'La meta es que baje', 'var(--fp-efectivo)'));
      if (v) cards.push(kpi('Recaudo', pesos(v[0] + v[1]), `Transf. ${pesos(v[1])} · Efect. ${pesos(v[0])}`, 'var(--accent)'));
    } else if (st.modalidad === 'credito') {
      cards.push(kpi('Crédito', pct(c), `del total · ${esc(alcance)} ${variacion(c, pAnt ? pAnt[2] : null)}`, 'var(--fp-credito)'));
      cards.push(kpi('Recaudo', pct(e + t), 'Transferencia + Efectivo', 'var(--fp-transf)'));
      if (v) cards.push(kpi('Valor en crédito', pesos(v[2]), `de ${pesos(v[0] + v[1] + v[2])} en total`, 'var(--accent)'));
    } else {
      cards.push(kpi('Transferencia', pct(t), `del total ${variacion(t, pAnt ? pAnt[1] : null)}`, 'var(--fp-transf)'));
      cards.push(kpi('Efectivo', pct(e), 'del total', 'var(--fp-efectivo)'));
      cards.push(kpi('Crédito', pct(c), 'del total', 'var(--fp-credito)'));
      if (v) cards.push(kpi('Total facturado', pesos(v[0] + v[1] + v[2]), `${esc(alcance)}`, 'var(--accent)'));
    }
    // Puesto de la(s) operación(es) del usuario
    if (!d.sinFiltro && st.modalidad !== 'credito') {
      const mia = con.filter(o => esMia(o.operacion)).sort((a, b) => a.puesto - b.puesto)[0];
      if (mia) cards.push(kpi('Tu operación', `#${mia.puesto} de ${con.length}`, `${esc(mia.operacion)} · ${pct(mia.m)}`, 'var(--accent)', 'destacado'));
    }
    document.getElementById('fpResumen').innerHTML = cards.join('');
  }

  function renderDias(d) {
    const hoy = hoyBogota();
    const alcance = st.filtros.operacion
      ? `<b>${esc(st.filtros.operacion)}</b>`
      : st.filtros.regional ? `Regional <b>${esc(st.filtros.regional)}</b> (${d.operaciones.length} operaciones)` : `Todas las operaciones (${d.operaciones.length})`;
    const volver = st.filtros.operacion
      ? ` · <a href="#" onclick="event.preventDefault(); fpCambiarFiltro('operacion', ''); fpCambiarVista('ranking');">← Volver al ranking</a>` : '';
    const filas = d.dias.map(x => {
      const p = x.pct && x.pct[st.medida];
      const m = metrica(p);
      const futuro = x.dia > hoy;
      return `
      <div class="fp-fila fp-fila-dia${!p ? ' sin-dato' : ''}">
        <div class="fp-op"><div class="fp-op-nombre${x.dia === hoy ? ' fp-dia-hoy' : ''}">${fechaCorta(x.dia)}${x.dia === hoy ? ' · hoy' : ''}</div><div class="fp-op-reg">${x.dia}</div></div>
        <div class="fp-barra-wrap">${p ? barra(p) : `<div class="fp-op-reg">${futuro ? 'Aún no llega' : 'Sin servicios'}</div>`}${p ? valoresTexto(x.valores) : ''}</div>
        <div class="fp-pct"><div class="fp-pct-num">${m == null ? '—' : pct(m)}</div><div class="fp-pct-lbl">${p && m == null ? 'Solo crédito' : etiquetaMetrica()}</div></div>
      </div>`;
    }).join('');
    return `<div class="fp-titulo-panel">${esc(d.quincena)} día a día · ${alcance}${volver}</div>${filas}`;
  }

  // Abrir directamente si la pestaña activa es esta (la coordina index.html)
})();
