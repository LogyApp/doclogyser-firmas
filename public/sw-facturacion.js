/* Service worker de Facturación: registro sin conexión de Recibos y Servicios.
 *
 * - La página /facturacion y sus archivos (/js, /css, /img) se guardan para abrir sin señal.
 * - Las consultas GET de /facturacion/api/ van primero a internet y, si no hay señal, se responde
 *   con la última respuesta guardada.
 * - Las búsquedas del formulario (placas, transportadoras, proveedores, clientes, auxiliares) sin
 *   señal se resuelven con los catálogos que la pantalla descarga (/facturacion/api/offline/catalogos).
 * - No toca los POST/PUT/DELETE: la pantalla guarda en el celular lo que no pudo enviar
 *   (public/js/facturacion-offline.js) y lo sube al volver la conexión.
 */
const VERSION = 'fac-offline-v1';
const CACHE_PAGINAS = `${VERSION}-paginas`;
const CACHE_API = `${VERSION}-api`;
// Catálogos en su propia caché (no se recorta ni se borra al cambiar de versión); la escribe la página
const CACHE_CATALOGOS = 'fac-offline-catalogos';
const CLAVE_CATALOGOS = '/facturacion/__offline/catalogos';
const MAX_API = 400;
const TIMEOUT_RED_MS = 8000;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter(k => k.startsWith('fac-offline-') && k !== CACHE_CATALOGOS && !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function jsonResp(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Offline': '1', ...extra }
  });
}

function conTimeout(promesa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promesa.then(r => { clearTimeout(t); resolve(r); }, e => { clearTimeout(t); reject(e); });
  });
}

async function recortarCache(nombre, max) {
  const cache = await caches.open(nombre);
  const claves = await cache.keys();
  for (let i = 0; i < claves.length - max; i++) await cache.delete(claves[i]);
}

function norm(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

async function leerCatalogos() {
  const cache = await caches.open(CACHE_CATALOGOS);
  const r = await cache.match(CLAVE_CATALOGOS);
  return r ? r.json() : null;
}

// Búsquedas del formulario resueltas con los catálogos guardados
async function busquedaSinConexion(url) {
  const cat = await leerCatalogos();
  if (!cat) return null;
  const q = norm(url.searchParams.get('q'));
  const ruta = url.pathname;
  const filtrar = (lista, campo, max) => {
    const conQ = q ? lista.filter(x => norm(x[campo]).includes(q)) : lista.slice();
    conQ.sort((a, b) => (norm(b[campo]).startsWith(q) ? 1 : 0) - (norm(a[campo]).startsWith(q) ? 1 : 0));
    return conQ.slice(0, max);
  };
  if (ruta.endsWith('/api/transportadoras/buscar')) return filtrar(cat.transportadoras || [], 'transportadora', 50);
  if (ruta.endsWith('/api/proveedores/buscar')) return filtrar(cat.proveedores || [], 'proveedor', 50);
  if (ruta.endsWith('/api/placas/buscar')) return filtrar(cat.placas || [], 'placa', 50);
  if (ruta.endsWith('/api/clientes/buscar')) {
    if (q.length < 2) return [];
    return (cat.clientes || []).filter(c => norm(c.razonSocial).includes(q) || String(c.codigo).includes(q)).slice(0, 20);
  }
  if (ruta.endsWith('/api/buscar-cliente')) {
    const nit = String(url.searchParams.get('nit') || url.searchParams.get('q') || '').replace(/[^0-9]/g, '');
    const c = (cat.clientes || []).find(x => String(x.codigo) === nit);
    return c ? { encontrado: true, ...c, razonSocial: String(c.razonSocial || '').trim() } : { encontrado: false };
  }
  if (ruta.endsWith('/api/auxiliares/buscar')) {
    const lista = (cat.auxiliares || {})[url.searchParams.get('operacion') || ''] || [];
    return filtrar(lista, 'trabajador', 300);
  }
  return null;
}

// Coincidencia aproximada: misma ruta sin el parámetro clienteAFacturar (config-servicios)
async function coincidenciaAproximada(cache, url) {
  if (!url.pathname.endsWith('/api/config-servicios')) return null;
  const sinCliente = new URL(url.href);
  sinCliente.searchParams.set('clienteAFacturar', '');
  return cache.match(sinCliente.href);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Página de Facturación
  if (req.mode === 'navigate' && url.pathname.replace(/\/$/, '') === '/facturacion') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_PAGINAS);
      try {
        const resp = await conTimeout(fetch(req), TIMEOUT_RED_MS);
        if (resp.ok) cache.put(req, resp.clone());
        return resp;
      } catch (e) {
        return (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true })) ||
          new Response('<h3 style="font-family:sans-serif">Sin conexión. Abra Facturación una vez con internet para usarla sin señal.</h3>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // Archivos de la página
  if (/^\/(js|css|img)\//.test(url.pathname) || url.pathname === '/manifest.webmanifest') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_PAGINAS);
      const guardado = await cache.match(req);
      const red = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
      return guardado || (await red) || new Response('', { status: 504 });
    })());
    return;
  }

  // Consultas del módulo
  if (url.pathname.startsWith('/facturacion/api/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_API);
      try {
        const resp = await conTimeout(fetch(req), TIMEOUT_RED_MS);
        if (resp.ok && !url.pathname.endsWith('/api/offline/catalogos')) {
          cache.put(req, resp.clone()).then(() => recortarCache(CACHE_API, MAX_API)).catch(() => {});
        }
        return resp;
      } catch (e) {
        // 1) la misma consulta ya respondida con internet, 2) los catálogos, 3) aproximada
        const exacta = await cache.match(req);
        if (exacta) return exacta;
        const busqueda = await busquedaSinConexion(url);
        if (busqueda) return jsonResp(busqueda);
        const aproximada = await coincidenciaAproximada(cache, url);
        if (aproximada) return aproximada;
        return jsonResp({ error: 'Sin conexión', offline: true }, 503);
      }
    })());
  }
});
