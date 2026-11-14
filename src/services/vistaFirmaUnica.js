/**
 * vistaFirmaUnica.js
 * Página de la firma única del Portal del aspirante (GET /seleccion/firma-unica/:uuid).
 * La lógica de la pantalla está en public/js/seleccion-firma-unica.js; aquí van el HTML base y
 * los datos iniciales (pasos, firma guardada). Pensada primero para celular.
 */
const formularios = require('./formulariosSeleccion');

function esc(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsonSeguro(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function generarHtmlFirmaUnica({ datos, usuario = '', bucket, soloDoc = null, todos = false }) {
  const config = {
    idAspirante: datos.aspirante.id,
    usuario,
    bucket,
    soloDoc: soloDoc ? Number(soloDoc) : null,
    todos: !!todos,
    aspirante: datos.aspirante,
    firmaPrevia: datos.firmaPrevia || null,
    motivoBloqueo: datos.motivoBloqueo || null,
    pasos: datos.pasos,
    documentos: datos.documentos
  };
  const urlPortal = `/seleccion/portal/${encodeURIComponent(datos.aspirante.id)}${usuario ? `?usuario=${encodeURIComponent(usuario)}` : ''}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#1B2A5E">
  <title>Firma de documentos | Logyser</title>
  <!-- CSS propio (sin el script externo de Tailwind, que a veces no carga en el celular) -->
  <link rel="stylesheet" href="/css/seleccion.css">
  <link rel="stylesheet" href="/css/firma-unica.css?v=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root { --navy: #1B2A5E; --orange: #F15A22; --orange-soft: #FFF1EA; }
    html { -webkit-text-size-adjust: 100%; }
    body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; background: #F4F6FA; color: #0f172a; }
    .pantalla { display: none; }
    .pantalla.activa { display: block; animation: entrar .28s ease-out; }
    @keyframes entrar { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    .barra-acciones { padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
    .espacio-barra { height: calc(96px + env(safe-area-inset-bottom)); }
    .btn-primario { background: var(--navy); color: #fff; }
    .btn-primario:not(:disabled):active { transform: scale(.98); }
    #btnSiguiente:disabled { opacity: .45; box-shadow: none; }
    .btn-naranja { background: var(--orange); color: #fff; }
    .chip { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: .02em; padding: 4px 10px; border-radius: 999px; }
    .marco-doc { background: #e9edf3; border-radius: 16px; overflow: hidden; position: relative; }
    .marco-doc iframe { border: 0; background: #fff; display: block; transform-origin: 0 0; }
    .esqueleto { background: linear-gradient(90deg, #eef1f6 25%, #f8fafc 37%, #eef1f6 63%); background-size: 400% 100%; animation: brillo 1.3s ease infinite; }
    @keyframes brillo { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
    #lienzoFirma { touch-action: none; cursor: crosshair; }
    .punto { width: 8px; height: 8px; border-radius: 999px; background: #cbd5e1; flex: 0 0 auto; transition: all .2s; }
    .punto.hecho { background: #10b981; }
    .punto.actual { background: var(--orange); width: 22px; }
    .hoja-lista { transform: translateY(100%); visibility: hidden; transition: transform .25s ease, visibility 0s linear .25s; }
    .hoja-lista.abierta { transform: none; visibility: visible; transition: transform .25s ease; }
    .giro { animation: giro 0.9s linear infinite; }
    @keyframes giro { to { transform: rotate(360deg); } }
    .sacudir { animation: sacudir .35s; }
    @keyframes sacudir { 25% { transform: translateX(-6px); } 50% { transform: translateX(6px); } 75% { transform: translateX(-3px); } }
    #formularioPaso .pregunta.bg-red-50 { border-radius: 10px; box-shadow: 0 0 0 2px #fecaca; }
    .nota-zoom { display: none; }
    .marco-doc.escalado + .nota-zoom { display: block; }
  </style>
</head>
<body class="min-h-screen">
  <header class="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
    <div class="max-w-3xl mx-auto px-4 pt-3 pb-2">
      <div class="flex items-center justify-between gap-3">
        <a href="${esc(urlPortal)}" class="shrink-0 w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center text-lg" aria-label="Volver al portal">←</a>
        <div class="flex-1 min-w-0">
          <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wider leading-none">Firma de documentos</p>
          <p class="text-sm font-extrabold text-slate-900 truncate mt-0.5">${esc(datos.aspirante.nombreCompleto || datos.aspirante.nombre)}</p>
        </div>
        <button type="button" id="btnLista" class="hidden shrink-0 text-xs font-extrabold text-[color:var(--navy)] bg-slate-100 px-3 py-2 rounded-xl">
          <span id="txtPasoCorto">1/1</span> ▾
        </button>
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" class="h-8 w-auto object-contain hidden sm:block" alt="Logyser">
      </div>
      <div id="puntos" class="flex items-center gap-1.5 mt-2.5 overflow-hidden"></div>
    </div>
  </header>

  <main class="max-w-3xl mx-auto px-4 pt-4">

    <!-- Sin pasos / bloqueado -->
    <section id="pantallaInfo" class="pantalla"></section>

    <!-- 1. Firma -->
    <section id="pantallaFirma" class="pantalla">
      <div class="mb-4">
        <span class="chip bg-orange-50 text-orange-700">PASO 1 · TU FIRMA</span>
        <h1 class="text-2xl font-extrabold tracking-tight mt-2">Confirma tu firma</h1>
        <p class="text-sm text-slate-600 mt-1">Firmarás <b id="txtTotalDocs"></b> con esta misma firma. Después revisarás cada documento antes de firmarlo.</p>
      </div>

      <div id="bloqueFirmaGuardada" class="hidden bg-white rounded-3xl border-2 border-[color:var(--orange)] p-4 shadow-sm">
        <div class="flex items-center justify-between">
          <p class="text-xs font-extrabold text-slate-800 uppercase tracking-wide">Tu firma guardada</p>
          <span class="chip bg-orange-50 text-orange-700">Última firma</span>
        </div>
        <div class="mt-3 h-36 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center p-3">
          <img id="imgFirmaGuardada" class="max-h-full max-w-full object-contain" alt="Firma guardada">
        </div>
        <button type="button" id="btnDibujarOtra" class="mt-3 w-full text-sm font-bold text-slate-600 py-2.5 rounded-xl bg-slate-100">No es mi firma / Quiero dibujar otra</button>
      </div>

      <div id="bloqueLienzo" class="hidden bg-white rounded-3xl border border-slate-200 p-4 shadow-sm">
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs font-extrabold text-slate-800 uppercase tracking-wide">Dibuja tu firma</p>
          <button type="button" id="btnBorrar" class="text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">Borrar</button>
        </div>
        <div class="relative rounded-2xl border-2 border-dashed border-slate-300 bg-white overflow-hidden">
          <canvas id="lienzoFirma" class="block w-full" style="height:210px"></canvas>
          <div class="pointer-events-none absolute left-6 right-6 bottom-12 border-b border-slate-300"></div>
          <p id="pistaLienzo" class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400 font-semibold">Firma aquí con tu dedo</p>
        </div>
        <button type="button" id="btnUsarGuardada" class="hidden mt-3 w-full text-sm font-bold text-slate-600 py-2.5 rounded-xl bg-slate-100">Usar mi firma guardada</button>
      </div>

      <label class="mt-4 flex items-start gap-3 bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer select-none">
        <input type="checkbox" id="chkFirma" class="mt-0.5 w-5 h-5 accent-[#F15A22] shrink-0">
        <span class="text-sm text-slate-700 leading-snug">Confirmo que esta es mi firma y autorizo usarla en los documentos de mi vinculación con LOG&amp;SER.</span>
      </label>
      <p id="errFirma" class="hidden mt-3 text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3"></p>
    </section>

    <!-- 2. Documento -->
    <section id="pantallaDoc" class="pantalla">
      <div class="mb-3">
        <div class="flex flex-wrap items-center gap-2">
          <span id="chipNumero" class="chip bg-slate-200 text-slate-700"></span>
          <span id="chipTipo" class="chip"></span>
        </div>
        <p id="txtGrupo" class="hidden text-xs font-bold text-slate-500 mt-2"></p>
        <h1 id="txtTitulo" class="text-xl sm:text-2xl font-extrabold tracking-tight mt-1 leading-tight"></h1>
        <p id="txtIndicacion" class="text-sm text-slate-600 mt-1"></p>
      </div>
      <div id="contenedorPaso"></div>
    </section>

    <!-- 3. Resumen -->
    <section id="pantallaResumen" class="pantalla">
      <span class="chip bg-emerald-50 text-emerald-700">ÚLTIMO PASO</span>
      <h1 class="text-2xl font-extrabold tracking-tight mt-2">Firma tus documentos</h1>
      <p class="text-sm text-slate-600 mt-1">Revisaste todos los documentos. Al firmar se generan los PDF con tu firma y la fecha de firma.</p>
      <div class="mt-4 bg-white rounded-3xl border border-slate-200 p-4 shadow-sm">
        <ul id="listaResumen" class="divide-y divide-slate-100"></ul>
      </div>
      <div class="mt-4 bg-white rounded-3xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
        <div class="w-28 h-16 shrink-0 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center p-1.5">
          <img id="imgFirmaResumen" class="max-h-full max-w-full object-contain" alt="Tu firma">
        </div>
        <div class="min-w-0">
          <p class="text-xs font-extrabold text-slate-800 uppercase">Tu firma</p>
          <button type="button" id="btnCambiarFirma" class="text-sm font-bold text-[color:var(--orange)] mt-0.5">Cambiar firma</button>
        </div>
      </div>
      <label class="mt-4 flex items-start gap-3 bg-orange-50/60 rounded-2xl border border-orange-200 p-4 cursor-pointer select-none">
        <input type="checkbox" id="chkDeclaracion" class="mt-0.5 w-5 h-5 accent-[#F15A22] shrink-0">
        <span class="text-sm text-slate-800 leading-snug">Declaro que leí, entendí y acepto los documentos anteriores, que mis respuestas son verdaderas y que autorizo firmarlos electrónicamente con mi firma (Ley 527 de 1999).</span>
      </label>
      <p id="errResumen" class="hidden mt-3 text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3"></p>
    </section>

    <!-- 4. Generando -->
    <section id="pantallaGenerando" class="pantalla">
      <div class="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
        <div class="flex items-center gap-3">
          <div id="iconoGenerando" class="w-11 h-11 rounded-full border-4 border-orange-200 border-t-[color:var(--orange)] giro shrink-0"></div>
          <div>
            <h1 id="txtGenerando" class="text-lg font-extrabold">Firmando tus documentos…</h1>
            <p class="text-xs text-slate-500">No cierres esta página hasta que termine.</p>
          </div>
        </div>
        <div class="w-full bg-slate-100 h-2.5 rounded-full mt-4 overflow-hidden">
          <div id="barraGenerando" class="h-full rounded-full bg-[color:var(--orange)] transition-all duration-500" style="width:0%"></div>
        </div>
        <ul id="listaGenerando" class="mt-4 space-y-2"></ul>
        <div id="accionesError" class="hidden mt-4 space-y-2"></div>
      </div>
    </section>

    <!-- 5. Fin -->
    <section id="pantallaFin" class="pantalla">
      <div class="bg-white rounded-3xl border border-emerald-200 p-6 shadow-sm text-center">
        <div class="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl font-black mx-auto">✓</div>
        <h1 class="text-2xl font-extrabold tracking-tight mt-3">¡Documentos firmados!</h1>
        <p class="text-sm text-slate-600 mt-1">Selección revisará tus documentos. Puedes consultarlos cuando quieras desde tu portal.</p>
      </div>
      <div class="mt-4 bg-white rounded-3xl border border-slate-200 p-4 shadow-sm">
        <ul id="listaFin" class="divide-y divide-slate-100"></ul>
      </div>
      <a href="${esc(urlPortal)}${usuario ? '&amp;' : '?'}msg=firmado" id="lnkPortalFin" class="mt-4 mb-8 block w-full text-center btn-primario font-extrabold text-sm uppercase tracking-wider rounded-2xl py-4">Volver a mi portal</a>
    </section>

    <div class="espacio-barra"></div>
  </main>

  <!-- Barra inferior de acciones (fija, a mano en el celular) -->
  <div id="barraAcciones" class="barra-acciones hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200">
    <div class="max-w-3xl mx-auto px-4 pt-3 flex gap-3">
      <button type="button" id="btnAtras" class="shrink-0 px-5 py-4 rounded-2xl bg-slate-100 text-slate-700 font-extrabold text-sm">Atrás</button>
      <button type="button" id="btnSiguiente" class="flex-1 btn-primario py-4 rounded-2xl font-extrabold text-sm uppercase tracking-wide shadow-lg shadow-slate-900/10 transition"></button>
    </div>
  </div>

  <!-- Lista de pasos (hoja inferior) -->
  <div id="fondoLista" class="hidden fixed inset-0 z-40 bg-slate-900/40"></div>
  <div id="hojaLista" class="hoja-lista fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl max-h-[75vh] overflow-y-auto shadow-2xl">
    <div class="max-w-3xl mx-auto p-4 pb-8">
      <div class="w-10 h-1.5 rounded-full bg-slate-200 mx-auto mb-3"></div>
      <div class="flex items-center justify-between mb-2">
        <p class="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Tus documentos</p>
        <button type="button" id="btnCerrarLista" class="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">Cerrar ✕</button>
      </div>
      <ul id="listaPasos" class="divide-y divide-slate-100"></ul>
    </div>
  </div>

  <!-- Documento en pantalla completa -->
  <div id="visorCompleto" class="hidden fixed inset-0 z-50 bg-slate-900 flex flex-col">
    <div class="flex items-center justify-between gap-3 px-4 py-3 bg-slate-900 text-white">
      <p id="txtVisor" class="text-sm font-bold truncate"></p>
      <button type="button" id="btnCerrarVisor" class="shrink-0 px-4 py-2 rounded-xl bg-white/15 font-bold text-sm">Cerrar ✕</button>
    </div>
    <div id="cuerpoVisor" class="flex-1 overflow-auto bg-slate-200"></div>
  </div>

  <script>
    window.FIRMA_UNICA = ${jsonSeguro(config)};
    ${formularios.JS_FORMULARIO}
  </script>
  <script src="/js/seleccion-firma-unica.js?v=1"></script>
</body>
</html>`;
}

module.exports = { generarHtmlFirmaUnica };
