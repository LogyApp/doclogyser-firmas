/* Firma única de documentos del Portal del aspirante (ver src/services/firmaUnica.js).
   Recorrido: firma → documento por documento → resumen → se generan todos los PDF. */
(function () {
  'use strict';
  const C = window.FIRMA_UNICA;
  const $ = (id) => document.getElementById(id);
  const pasos = C.pasos || [];
  const N = pasos.length;
  const urlBase = '/seleccion/firma-unica/' + encodeURIComponent(C.idAspirante);
  const qsUsuario = C.usuario ? ('usuario=' + encodeURIComponent(C.usuario)) : '';
  const urlPortal = '/seleccion/portal/' + encodeURIComponent(C.idAspirante) + (qsUsuario ? '?' + qsUsuario : '');

  // idx: -1 = firma, 0..N-1 = documentos, N = resumen
  const E = {
    idx: -1, maxIdx: -1,
    modoFirma: C.firmaPrevia ? 'guardada' : 'nueva',
    firmaDataUrl: null,
    aceptados: new Set(),
    vistas: {},      // clave -> Promise<{html, formulario}>
    nodos: {},       // clave -> elemento del paso (conserva lo que el aspirante respondió)
    firmaSubida: false,
    firmados: {},    // idConfigDoc -> respuesta del servidor
    generando: false
  };

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function urlPdf(path) { return 'https://storage.googleapis.com/' + C.bucket + '/' + path + '?v=' + Date.now(); }

  // Documentos (agrupa las partes de un mismo documento, ej. Formatos Italcol)
  const docsAFirmar = [];
  pasos.forEach(p => {
    let d = docsAFirmar.find(x => x.id === p.idConfigDoc);
    if (!d) { d = { id: p.idConfigDoc, nombre: p.grupo || p.titulo, pasos: [] }; docsAFirmar.push(d); }
    d.pasos.push(p);
  });
  const textoDocs = (n) => n === 1 ? '1 documento' : n + ' documentos';

  // ── Pantallas y barra ─────────────────────────────────────────────
  function mostrarPantalla(id) {
    document.querySelectorAll('.pantalla').forEach(s => s.classList.toggle('activa', s.id === id));
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
  function barra({ atras = true, texto = '', habilitado = true, naranja = false, oculta = false }) {
    $('barraAcciones').classList.toggle('hidden', oculta);
    $('btnAtras').classList.toggle('hidden', !atras);
    const b = $('btnSiguiente');
    b.innerHTML = texto;
    b.disabled = !habilitado;
    b.classList.toggle('btn-naranja', naranja);
    b.classList.toggle('btn-primario', !naranja);
  }
  function pintarPuntos() {
    const cont = $('puntos');
    if (!N) { cont.innerHTML = ''; return; }
    const total = N + 2;   // firma + documentos + resumen
    const actual = E.idx + 1;
    let html = '';
    for (let i = 0; i < total; i++) {
      const hecho = i < actual || (i - 1 >= 0 && i - 1 < N && E.aceptados.has(pasos[i - 1].clave) && i !== actual);
      html += '<span class="punto ' + (i === actual ? 'actual' : (hecho ? 'hecho' : '')) + '"></span>';
    }
    cont.innerHTML = html;
    $('btnLista').classList.remove('hidden');
    $('txtPasoCorto').textContent = E.idx < 0 ? 'Firma' : (E.idx >= N ? 'Final' : (E.idx + 1) + '/' + N);
  }
  function irA(idx) {
    E.idx = idx;
    E.maxIdx = Math.max(E.maxIdx, idx);
    if (idx < 0) mostrarFirma();
    else if (idx >= N) mostrarResumen();
    else mostrarPaso(idx);
    pintarPuntos();
  }

  // ── Información (sin pendientes o bloqueado) ──────────────────────
  function mostrarInfo() {
    const docs = C.documentos || [];
    const filas = docs.map(d => {
      const est = { firmado: ['✓ Firmado', 'text-emerald-700 bg-emerald-50'], aprobado: ['✓ Aprobado', 'text-emerald-700 bg-emerald-50'],
        no_disponible: ['Aún no disponible', 'text-slate-500 bg-slate-100'], pendiente: ['Pendiente', 'text-orange-700 bg-orange-50'] }[d.estado] || ['', ''];
      return '<li class="py-3 flex items-center justify-between gap-3"><div class="min-w-0"><p class="text-sm font-bold text-slate-800">' + esc(d.nombre) + '</p>'
        + (d.motivo ? '<p class="text-[11px] text-slate-500 mt-0.5">' + esc(d.motivo) + '</p>' : '') + '</div>'
        + '<div class="flex items-center gap-2 shrink-0"><span class="chip ' + est[1] + '">' + est[0] + '</span>'
        + (d.gcsPath && (d.estado === 'firmado' || d.estado === 'aprobado') ? '<a class="text-xs font-extrabold text-blue-700" target="_blank" href="' + esc(urlPdf(d.gcsPath)) + '">PDF ↗</a>' : '') + '</div></li>';
    }).join('');
    const hayFirmados = docs.some(d => d.estado === 'firmado');
    let cabecera;
    if (C.motivoBloqueo) {
      cabecera = '<div class="bg-white rounded-3xl border border-amber-200 p-6 text-center shadow-sm"><div class="w-14 h-14 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-2xl mx-auto">🔒</div>'
        + '<h1 class="text-xl font-extrabold mt-3">La firma no está disponible</h1><p class="text-sm text-slate-600 mt-1">' + esc(C.motivoBloqueo) + '</p></div>';
    } else {
      cabecera = '<div class="bg-white rounded-3xl border border-emerald-200 p-6 text-center shadow-sm"><div class="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl font-black mx-auto">✓</div>'
        + '<h1 class="text-xl font-extrabold mt-3">No tienes documentos pendientes</h1><p class="text-sm text-slate-600 mt-1">Ya firmaste todos los documentos disponibles.</p>'
        + (hayFirmados ? '<a href="' + urlBase + '?todos=1' + (qsUsuario ? '&' + qsUsuario : '') + '" class="inline-block mt-4 text-sm font-extrabold text-[color:var(--orange)]">Volver a firmar todos</a>' : '') + '</div>';
    }
    $('pantallaInfo').innerHTML = cabecera
      + (filas ? '<div class="mt-4 bg-white rounded-3xl border border-slate-200 p-4 shadow-sm"><ul class="divide-y divide-slate-100">' + filas + '</ul></div>' : '')
      + '<a href="' + urlPortal + '" class="mt-4 block w-full text-center btn-primario font-extrabold text-sm uppercase tracking-wider rounded-2xl py-4">Volver a mi portal</a>';
    mostrarPantalla('pantallaInfo');
    $('barraAcciones').classList.add('hidden');
  }

  // ── 1. Firma ──────────────────────────────────────────────────────
  const lienzo = $('lienzoFirma');
  const ctx = lienzo.getContext('2d');
  let trazos = [];          // [[{x,y}]] en proporción del ancho/alto del lienzo
  let trazoActual = null;

  function prepararLienzo() {
    const r = lienzo.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    lienzo.width = Math.round(r.width * dpr);
    lienzo.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redibujar();
  }
  function estiloTrazo(c, ancho) {
    c.strokeStyle = '#0B1B4D'; c.lineWidth = ancho; c.lineCap = 'round'; c.lineJoin = 'round';
  }
  function dibujarTrazo(c, t, w, h) {
    if (!t.length) return;
    c.beginPath();
    c.moveTo(t[0].x * w, t[0].y * h);
    if (t.length === 1) c.lineTo(t[0].x * w + 0.1, t[0].y * h + 0.1);
    for (let i = 1; i < t.length - 1; i++) {
      const mx = (t[i].x + t[i + 1].x) / 2 * w, my = (t[i].y + t[i + 1].y) / 2 * h;
      c.quadraticCurveTo(t[i].x * w, t[i].y * h, mx, my);
    }
    if (t.length > 1) c.lineTo(t[t.length - 1].x * w, t[t.length - 1].y * h);
    c.stroke();
  }
  function redibujar() {
    const r = lienzo.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    estiloTrazo(ctx, 2.6);
    trazos.forEach(t => dibujarTrazo(ctx, t, r.width, r.height));
    $('pistaLienzo').classList.toggle('hidden', trazos.length > 0);
  }
  function punto(e) {
    const r = lienzo.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }
  lienzo.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    lienzo.setPointerCapture(e.pointerId);
    trazoActual = [punto(e)];
    trazos.push(trazoActual);
    redibujar();
  });
  lienzo.addEventListener('pointermove', (e) => {
    if (!trazoActual) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    evs.forEach(ev => trazoActual.push(punto(ev)));
    redibujar();
  });
  const terminar = () => { trazoActual = null; actualizarBotonFirma(); };
  lienzo.addEventListener('pointerup', terminar);
  lienzo.addEventListener('pointercancel', terminar);

  // Imagen final de la firma: fondo transparente y recortada a lo dibujado
  function exportarFirma() {
    const r = lienzo.getBoundingClientRect();
    const W = r.width, H = r.height;
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    trazos.forEach(t => t.forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }));
    const esc2 = 3, pad = 8;
    const bx = Math.max(0, x0 * W - pad), by = Math.max(0, y0 * H - pad);
    const bw = Math.min(W, x1 * W + pad) - bx, bh = Math.min(H, y1 * H + pad) - by;
    const c = document.createElement('canvas');
    c.width = Math.max(10, Math.round(bw * esc2));
    c.height = Math.max(10, Math.round(bh * esc2));
    const k = c.getContext('2d');
    k.setTransform(esc2, 0, 0, esc2, -bx * esc2, -by * esc2);
    estiloTrazo(k, 2.6);
    trazos.forEach(t => dibujarTrazo(k, t, W, H));
    return c.toDataURL('image/png');
  }

  function modoFirma(modo) {
    E.modoFirma = modo;
    const guardada = modo === 'guardada' && C.firmaPrevia;
    $('bloqueFirmaGuardada').classList.toggle('hidden', !guardada);
    $('bloqueLienzo').classList.toggle('hidden', !!guardada);
    $('btnUsarGuardada').classList.toggle('hidden', !C.firmaPrevia);
    if (!guardada) requestAnimationFrame(prepararLienzo);
    actualizarBotonFirma();
  }
  function firmaLista() { return (E.modoFirma === 'guardada' && C.firmaPrevia) || trazos.length > 0; }
  function actualizarBotonFirma() {
    if (E.idx !== -1) return;
    barra({ atras: false, texto: 'Confirmar firma y empezar →', habilitado: $('chkFirma').checked && firmaLista(), naranja: true });
  }
  function mostrarFirma() {
    $('txtTotalDocs').textContent = textoDocs(docsAFirmar.length);
    if (C.firmaPrevia) $('imgFirmaGuardada').src = C.firmaPrevia;
    $('errFirma').classList.add('hidden');
    mostrarPantalla('pantallaFirma');
    modoFirma(E.modoFirma);
    if (pasos[0]) cargarVista(pasos[0].clave);   // se adelanta la carga del primer documento
  }
  $('btnDibujarOtra').addEventListener('click', () => modoFirma('nueva'));
  $('btnUsarGuardada').addEventListener('click', () => modoFirma('guardada'));
  $('btnBorrar').addEventListener('click', () => { trazos = []; redibujar(); actualizarBotonFirma(); });
  $('chkFirma').addEventListener('change', actualizarBotonFirma);

  function confirmarFirma() {
    if (!firmaLista()) { mostrarError('errFirma', 'Dibuja tu firma en el recuadro para continuar.'); return; }
    if (!$('chkFirma').checked) { mostrarError('errFirma', 'Marca la casilla para confirmar que es tu firma.'); return; }
    E.firmaDataUrl = E.modoFirma === 'guardada' ? C.firmaPrevia : exportarFirma();
    E.firmaSubida = false;
    irA(0);
  }

  // ── 2. Documentos ─────────────────────────────────────────────────
  function cargarVista(clave) {
    if (!E.vistas[clave]) {
      E.vistas[clave] = fetch(urlBase + '/paso?clave=' + encodeURIComponent(clave) + (qsUsuario ? '&' + qsUsuario : ''), { headers: { Accept: 'application/json' } })
        .then(r => r.json().then(j => { if (!r.ok || !j.ok) throw new Error(j.error || 'No se pudo cargar el documento.'); return j; }))
        .catch(err => { delete E.vistas[clave]; throw err; });
    }
    return E.vistas[clave];
  }

  function ajustarMarco(marco) {
    const iframe = marco.querySelector('iframe');
    if (!iframe) return;
    let d;
    try { d = iframe.contentDocument; } catch (e) { return; }
    if (!d || !d.documentElement) return;
    const cw = marco.clientWidth;
    iframe.style.transform = '';
    iframe.style.width = cw + 'px';
    iframe.style.height = '10px';
    const w = Math.max(d.documentElement.scrollWidth, d.body ? d.body.scrollWidth : 0);
    const h = Math.max(d.documentElement.scrollHeight, d.body ? d.body.scrollHeight : 0);
    if (w > cw + 2) {
      const s = cw / w;
      iframe.style.width = w + 'px';
      iframe.style.height = h + 'px';
      iframe.style.transform = 'scale(' + s + ')';
      marco.style.height = Math.ceil(h * s) + 'px';
      marco.classList.toggle('escalado', s < 0.75);
    } else {
      marco.classList.remove('escalado');
      iframe.style.height = h + 'px';
      marco.style.height = h + 'px';
    }
  }

  function crearNodoPaso(p) {
    const nodo = document.createElement('div');
    nodo.className = 'space-y-4';
    nodo.innerHTML =
      '<div class="bg-white rounded-3xl border border-slate-200 p-2.5 sm:p-4 shadow-sm">'
      + '<div class="flex items-center justify-between px-1.5 pb-2">'
      + '<span class="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Documento</span>'
      + '<button type="button" class="btn-ampliar text-xs font-extrabold text-[color:var(--navy)] bg-slate-100 px-3 py-2 rounded-xl">⤢ Ver en grande</button></div>'
      + '<div class="marco-doc"><div class="esqueleto" style="height:440px"></div></div>'
      + '<p class="nota-zoom text-[11px] text-slate-500 text-center pt-2">El documento se ve reducido para que quepa en tu pantalla. Toca «Ver en grande» para leerlo con más detalle.</p></div>'
      + '<div class="zona-form"></div>'
      + '<p class="err-paso hidden text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3"></p>';
    const marco = nodo.querySelector('.marco-doc');
    nodo.querySelector('.btn-ampliar').addEventListener('click', () => abrirVisor(p));
    cargarVista(p.clave).then(v => {
      marco.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.setAttribute('title', p.titulo);
      iframe.srcdoc = v.html;
      iframe.addEventListener('load', () => { ajustarMarco(marco); setTimeout(() => ajustarMarco(marco), 450); });
      marco.appendChild(iframe);
      if (v.formulario) {
        const zona = nodo.querySelector('.zona-form');
        zona.innerHTML = '<div id="formularioPaso" class="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6 shadow-sm">' + v.formulario + '</div>';
        const form = zona.querySelector('section');
        if (form && window.prepararFormulario) window.prepararFormulario(form);
        // Al responder una pregunta marcada en rojo se le quita la marca
        if (form) ['change', 'input'].forEach(ev => form.addEventListener(ev, (e) => {
          const q = e.target.closest('.pregunta');
          if (q) q.classList.remove('bg-red-50');
          if (q && q.closest('table')) q.closest('table').querySelectorAll('.pregunta').forEach(f => {
            if (f.querySelector('input[data-campo="r"]:checked')) f.classList.remove('bg-red-50');
          });
        }));
      }
      nodo.dataset.listo = '1';
      if (E.idx >= 0 && pasos[E.idx] && pasos[E.idx].clave === p.clave) actualizarBotonPaso();
    }).catch(err => {
      marco.innerHTML = '<div class="p-6 text-center"><p class="text-sm font-bold text-red-700">' + esc(err.message) + '</p>'
        + '<button type="button" class="btn-reintentar mt-3 text-sm font-extrabold text-white bg-[color:var(--navy)] px-4 py-2 rounded-xl">Reintentar</button></div>';
      marco.style.height = 'auto';
      marco.querySelector('.btn-reintentar').addEventListener('click', () => {
        delete E.nodos[p.clave];
        if (pasos[E.idx] && pasos[E.idx].clave === p.clave) mostrarPaso(E.idx);
      });
    });
    return nodo;
  }

  function actualizarBotonPaso() {
    const p = pasos[E.idx];
    const nodo = E.nodos[p.clave];
    const listo = nodo && nodo.dataset.listo === '1';
    const ultimo = E.idx === N - 1;
    let texto = p.tipo === 'formulario' ? 'Guardar respuestas y seguir →' : 'Leí y acepto →';
    if (ultimo) texto = p.tipo === 'formulario' ? 'Guardar respuestas e ir a firmar →' : 'Leí y acepto · ir a firmar →';
    barra({ atras: true, texto: listo ? texto : 'Cargando documento…', habilitado: listo });
  }

  function mostrarPaso(i) {
    const p = pasos[i];
    $('chipNumero').textContent = 'DOCUMENTO ' + (i + 1) + ' DE ' + N;
    const chip = $('chipTipo');
    if (p.tipo === 'formulario') { chip.textContent = '✎ DEBES RESPONDER'; chip.className = 'chip bg-amber-100 text-amber-800'; }
    else { chip.textContent = '👁 LECTURA'; chip.className = 'chip bg-blue-50 text-blue-700'; }
    const grupo = $('txtGrupo');
    grupo.classList.toggle('hidden', !p.grupo);
    grupo.textContent = p.grupo ? p.grupo + ' · formato ' + p.parte : '';
    $('txtTitulo').textContent = p.titulo;
    $('txtIndicacion').textContent = p.tipo === 'formulario'
      ? 'Lee el documento y responde lo que se pide abajo. No podrás seguir hasta completar las respuestas obligatorias.'
      : 'Léelo con calma. Si estás de acuerdo, confirma abajo que lo leíste y lo aceptas.';
    if (!E.nodos[p.clave]) E.nodos[p.clave] = crearNodoPaso(p);
    const cont = $('contenedorPaso');
    cont.innerHTML = '';
    cont.appendChild(E.nodos[p.clave]);
    E.nodos[p.clave].querySelector('.err-paso').classList.add('hidden');
    mostrarPantalla('pantallaDoc');
    const marco = E.nodos[p.clave].querySelector('.marco-doc');
    requestAnimationFrame(() => ajustarMarco(marco));
    actualizarBotonPaso();
    if (pasos[i + 1]) cargarVista(pasos[i + 1].clave).catch(() => {});
  }

  function formularioDe(clave) {
    const nodo = E.nodos[clave];
    return nodo ? nodo.querySelector('.zona-form section') : null;
  }

  function avanzarPaso() {
    const p = pasos[E.idx];
    const nodo = E.nodos[p.clave];
    const form = formularioDe(p.clave);
    if (form) {
      const r = window.recogerRespuestasFormulario(form);
      if (r.faltantes.length) {
        const err = nodo.querySelector('.err-paso');
        err.textContent = r.faltantes.length === 1
          ? 'Te falta 1 respuesta obligatoria (marcada en rojo).'
          : 'Te faltan ' + r.faltantes.length + ' respuestas obligatorias (marcadas en rojo).';
        err.classList.remove('hidden');
        const primera = form.querySelector('.pregunta.bg-red-50');
        if (primera) primera.scrollIntoView({ behavior: 'smooth', block: 'center' });
        $('btnSiguiente').classList.add('sacudir');
        setTimeout(() => $('btnSiguiente').classList.remove('sacudir'), 400);
        return;
      }
    }
    E.aceptados.add(p.clave);
    irA(E.idx + 1);
  }

  // Visor en pantalla completa (tamaño real, se puede desplazar y ampliar)
  function abrirVisor(p) {
    cargarVista(p.clave).then(v => {
      $('txtVisor').textContent = p.titulo;
      const cuerpo = $('cuerpoVisor');
      cuerpo.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'border:0;background:#fff;display:block;margin:0 auto;width:100%;height:100%';
      iframe.srcdoc = v.html;
      iframe.addEventListener('load', () => {
        try {
          const d = iframe.contentDocument;
          const w = Math.max(d.documentElement.scrollWidth, cuerpo.clientWidth);
          iframe.style.width = w + 'px';
          iframe.style.height = Math.max(d.documentElement.scrollHeight, cuerpo.clientHeight) + 'px';
        } catch (e) { /* sin acceso al contenido */ }
      });
      cuerpo.appendChild(iframe);
      $('visorCompleto').classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }).catch(() => {});
  }
  $('btnCerrarVisor').addEventListener('click', () => {
    $('visorCompleto').classList.add('hidden');
    $('cuerpoVisor').innerHTML = '';
    document.body.style.overflow = '';
  });

  // ── Lista de pasos ────────────────────────────────────────────────
  function abrirLista() {
    const filas = [{ idx: -1, titulo: 'Tu firma', sub: '' }]
      .concat(pasos.map((p, i) => ({ idx: i, titulo: p.titulo, sub: p.grupo ? p.grupo + ' · ' + p.parte : '', tipo: p.tipo })))
      .concat([{ idx: N, titulo: 'Firmar documentos', sub: '' }]);
    $('listaPasos').innerHTML = filas.map(f => {
      const hecho = f.idx === -1 ? !!E.firmaDataUrl : (f.idx < N && f.idx >= 0 && E.aceptados.has(pasos[f.idx].clave));
      const actual = f.idx === E.idx;
      const puede = f.idx <= E.maxIdx && !E.generando;
      return '<li><button type="button" data-idx="' + f.idx + '" ' + (puede ? '' : 'disabled') + ' class="w-full text-left py-3 flex items-center gap-3 ' + (puede ? '' : 'opacity-50') + '">'
        + '<span class="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-black '
        + (actual ? 'bg-[color:var(--orange)] text-white' : (hecho ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')) + '">'
        + (hecho && !actual ? '✓' : (f.idx === -1 ? '✍' : (f.idx === N ? '★' : f.idx + 1))) + '</span>'
        + '<span class="min-w-0"><span class="block text-sm font-bold text-slate-800 truncate">' + esc(f.titulo) + '</span>'
        + (f.sub ? '<span class="block text-[11px] text-slate-500">' + esc(f.sub) + '</span>' : '')
        + (f.tipo === 'formulario' ? '<span class="block text-[11px] font-bold text-amber-700">Con preguntas</span>' : '') + '</span></button></li>';
    }).join('');
    $('fondoLista').classList.remove('hidden');
    $('hojaLista').classList.add('abierta');
  }
  function cerrarLista() { $('fondoLista').classList.add('hidden'); $('hojaLista').classList.remove('abierta'); }
  $('btnLista').addEventListener('click', abrirLista);
  $('fondoLista').addEventListener('click', cerrarLista);
  $('btnCerrarLista').addEventListener('click', cerrarLista);
  $('listaPasos').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-idx]');
    if (!b || b.disabled) return;
    cerrarLista();
    irA(Number(b.dataset.idx));
  });

  // ── 3. Resumen ────────────────────────────────────────────────────
  function mostrarResumen() {
    $('listaResumen').innerHTML = docsAFirmar.map(d => {
      const sub = d.pasos.length > 1 ? '<span class="block text-[11px] text-slate-500 mt-0.5">' + d.pasos.map(p => esc(p.titulo)).join(' · ') + '</span>' : '';
      const conPreguntas = d.pasos.some(p => p.tipo === 'formulario');
      return '<li class="py-3 flex items-start gap-3"><span class="w-6 h-6 shrink-0 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-black">✓</span>'
        + '<span class="min-w-0"><span class="block text-sm font-bold text-slate-800">' + esc(d.nombre) + '</span>' + sub
        + '<span class="block text-[11px] font-semibold ' + (conPreguntas ? 'text-amber-700' : 'text-slate-400') + ' mt-0.5">' + (conPreguntas ? 'Leído y respondido' : 'Leído y aceptado') + '</span></span></li>';
    }).join('');
    $('imgFirmaResumen').src = E.firmaDataUrl;
    $('errResumen').classList.add('hidden');
    mostrarPantalla('pantallaResumen');
    actualizarBotonResumen();
  }
  function actualizarBotonResumen() {
    if (E.idx !== N) return;
    const pend = docsAFirmar.filter(d => !E.firmados[d.id]).length;
    barra({ atras: true, texto: '✍ Firmar ' + textoDocs(pend), habilitado: $('chkDeclaracion').checked, naranja: true });
  }
  $('chkDeclaracion').addEventListener('change', actualizarBotonResumen);
  $('btnCambiarFirma').addEventListener('click', () => irA(-1));

  // ── 4. Generar los PDF (un documento a la vez) ────────────────────
  function cuerpoFirma(d) {
    const body = {
      firma_base64: E.firmaDataUrl,
      es_nueva_firma: E.modoFirma === 'nueva' && !E.firmaSubida
    };
    d.pasos.forEach(p => {
      const form = formularioDe(p.clave);
      if (!form) return;
      const r = window.recogerRespuestasFormulario(form).respuestas || {};
      if (p.idPlantilla) {
        body.diligenciados = body.diligenciados || {};
        const valores = {};
        Object.keys(r).forEach(k => { valores[k] = r[k] && r[k].r != null ? String(r[k].r) : ''; });
        body.diligenciados[p.proceso] = valores;
      } else {
        body.respuestas = r;
      }
    });
    return body;
  }

  function filaGenerando(d, estado, mensaje) {
    const icono = { espera: '<span class="block w-6 h-6 rounded-full border-2 border-slate-200"></span>',
      trabajando: '<span class="block w-6 h-6 rounded-full border-[3px] border-orange-200 border-t-[color:var(--orange)] giro"></span>',
      ok: '<span class="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-black">✓</span>',
      error: '<span class="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-black">!</span>' }[estado];
    return '<li class="flex items-start gap-3 p-3 rounded-2xl ' + (estado === 'trabajando' ? 'bg-orange-50' : (estado === 'error' ? 'bg-red-50' : 'bg-slate-50')) + '">'
      + '<span class="shrink-0 mt-0.5">' + icono + '</span><span class="min-w-0"><span class="block text-sm font-bold text-slate-800">' + esc(d.nombre) + '</span>'
      + (d.pasos.length > 1 ? '<span class="block text-[11px] text-slate-500">' + d.pasos.length + ' formatos</span>' : '')
      + (mensaje ? '<span class="block text-xs font-semibold ' + (estado === 'error' ? 'text-red-700' : 'text-slate-500') + ' mt-0.5">' + esc(mensaje) + '</span>' : '') + '</span></li>';
  }

  async function generar() {
    if (!$('chkDeclaracion').checked) { mostrarError('errResumen', 'Marca la declaración para poder firmar.'); return; }
    E.generando = true;
    mostrarPantalla('pantallaGenerando');
    barra({ oculta: true });
    $('accionesError').classList.add('hidden');
    $('accionesError').innerHTML = '';
    $('iconoGenerando').className = 'w-11 h-11 rounded-full border-4 border-orange-200 border-t-[color:var(--orange)] giro shrink-0';
    const estados = {};
    docsAFirmar.forEach(d => { estados[d.id] = E.firmados[d.id] ? ['ok', ''] : ['espera', '']; });
    const pintar = () => {
      $('listaGenerando').innerHTML = docsAFirmar.map(d => filaGenerando(d, estados[d.id][0], estados[d.id][1])).join('');
      const hechos = docsAFirmar.filter(d => estados[d.id][0] === 'ok').length;
      $('barraGenerando').style.width = Math.round(hechos / docsAFirmar.length * 100) + '%';
      $('txtGenerando').textContent = 'Firmando ' + Math.min(hechos + 1, docsAFirmar.length) + ' de ' + docsAFirmar.length + '…';
    };
    pintar();

    for (const d of docsAFirmar) {
      if (E.firmados[d.id]) continue;
      estados[d.id] = ['trabajando', d.pasos.length > 1 ? 'Generando ' + d.pasos.length + ' formatos…' : 'Generando PDF…'];
      pintar();
      try {
        const resp = await fetch('/seleccion/firmar/' + encodeURIComponent(C.idAspirante) + '/' + d.id + (qsUsuario ? '?' + qsUsuario : ''), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpoFirma(d))
        });
        let j = {};
        try { j = await resp.json(); } catch (e) { j = { error: 'Respuesta no válida del servidor.' }; }
        if (!resp.ok || !j.ok) throw Object.assign(new Error(j.error || 'No se pudo firmar el documento.'), { status: resp.status });
        E.firmados[d.id] = j;
        if (E.modoFirma === 'nueva') E.firmaSubida = true;
        estados[d.id] = ['ok', 'Firmado'];
        pintar();
      } catch (err) {
        estados[d.id] = ['error', err.status ? err.message : 'Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.'];
        pintar();
        mostrarErrorGeneracion(d, err);
        E.generando = false;
        return;
      }
    }
    E.generando = false;
    mostrarFin();
  }

  function mostrarErrorGeneracion(d, err) {
    $('iconoGenerando').className = 'w-11 h-11 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl font-black shrink-0';
    $('iconoGenerando').textContent = '!';
    $('txtGenerando').textContent = 'No se pudo firmar un documento';
    const acciones = $('accionesError');
    const pasoForm = d.pasos.findIndex(p => p.tipo === 'formulario');
    const corregir = err.status === 400 && pasoForm >= 0;
    acciones.innerHTML =
      (corregir ? '<button type="button" id="btnCorregir" class="w-full py-3.5 rounded-2xl bg-amber-500 text-white font-extrabold text-sm">Revisar mis respuestas</button>' : '')
      + (err.status === 403 ? '' : '<button type="button" id="btnReintentar" class="w-full py-3.5 rounded-2xl btn-primario font-extrabold text-sm">Intentar de nuevo</button>')
      + '<a href="' + urlPortal + '" class="block text-center w-full py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold text-sm">Volver al portal</a>';
    acciones.classList.remove('hidden');
    const br = $('btnReintentar');
    if (br) br.addEventListener('click', () => { $('iconoGenerando').textContent = ''; generar(); });
    const bc = $('btnCorregir');
    if (bc) bc.addEventListener('click', () => {
      $('iconoGenerando').textContent = '';
      irA(pasos.indexOf(d.pasos[pasoForm]));
    });
  }

  function mostrarFin() {
    $('listaFin').innerHTML = docsAFirmar.map(d => {
      const r = E.firmados[d.id] || {};
      const subPartes = (r.partes || []).map(pt => '<a target="_blank" class="block text-xs font-bold text-blue-700 mt-1" href="' + esc(urlPdf(pt.gcsPath)) + '">' + esc(pt.observaciones || 'Formato') + ' ↗</a>').join('');
      return '<li class="py-3"><div class="flex items-center justify-between gap-3"><span class="text-sm font-bold text-slate-800">✓ ' + esc(d.nombre) + '</span>'
        + (r.gcsPath ? '<a target="_blank" class="shrink-0 text-xs font-extrabold text-white bg-[color:var(--navy)] px-3 py-1.5 rounded-lg" href="' + esc(urlPdf(r.gcsPath)) + '">Ver PDF</a>' : '') + '</div>'
        + (subPartes ? '<div class="pl-5 mt-1">' + subPartes + '</div>' : '') + '</li>';
    }).join('');
    mostrarPantalla('pantallaFin');
    barra({ oculta: true });
    $('puntos').innerHTML = '';
    $('btnLista').classList.add('hidden');
  }

  // ── Botones de la barra ───────────────────────────────────────────
  $('btnSiguiente').addEventListener('click', () => {
    if (E.idx === -1) confirmarFirma();
    else if (E.idx < N) avanzarPaso();
    else generar();
  });
  $('btnAtras').addEventListener('click', () => { if (E.idx >= 0 && !E.generando) irA(E.idx - 1); });

  function mostrarError(id, texto) {
    const el = $(id);
    el.textContent = texto;
    el.classList.remove('hidden');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  let tAjuste = null;
  window.addEventListener('resize', () => {
    clearTimeout(tAjuste);
    tAjuste = setTimeout(() => {
      if (E.idx === -1 && E.modoFirma === 'nueva') prepararLienzo();
      if (E.idx >= 0 && E.idx < N) {
        const nodo = E.nodos[pasos[E.idx].clave];
        if (nodo) ajustarMarco(nodo.querySelector('.marco-doc'));
      }
    }, 150);
  });
  window.addEventListener('beforeunload', (e) => {
    if (E.generando || (E.idx >= 0 && E.idx <= N && Object.keys(E.firmados).length < docsAFirmar.length && E.aceptados.size)) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ── Inicio ────────────────────────────────────────────────────────
  if (C.motivoBloqueo || !N) mostrarInfo();
  else irA(-1);
})();
