/* Facturación › registro sin conexión de Recibos y Servicios.
 *
 * Con el modo activo (Config_Parametros facturacion / Offline "Habilitar registro sin conexión"):
 *  - Registra el service worker (/sw-facturacion.js) para abrir la página y buscar sin señal.
 *  - Descarga los catálogos de las operaciones del usuario (placas, transportadoras, proveedores,
 *    clientes, auxiliares) y los guarda en el celular.
 *  - Lo que no se pudo enviar (Recibo nuevo con sus servicios, o Servicio nuevo de un recibo que
 *    ya existe) queda en una bandeja en el celular (IndexedDB) y se sube solo al volver la señal.
 *  - Cada registro lleva un código único (idOffline): si se reintenta, el servidor no lo duplica.
 *
 * Uso desde la página: FacOffline.init(CONFIG), FacOffline.activo(), FacOffline.prepararRecibo(),
 * FacOffline.prepararServicio(fd), FacOffline.encolarRecibo(...), FacOffline.encolarServicios(...),
 * FacOffline.esErrorDeRed(e).
 */
(function () {
  'use strict';

  const DB_NOMBRE = 'logyapp-facturacion-offline';
  const DB_STORE = 'pendientes';
  const CACHE_CATALOGOS = 'fac-offline-catalogos';
  const CLAVE_CATALOGOS = '/facturacion/__offline/catalogos';
  const HORAS_CATALOGOS = 6;
  const FOTO_MAX_PX = 1600;
  const FOTO_CALIDAD = 0.72;

  let CFG = null;
  let sincronizando = false;
  let onSincronizado = null;

  // ── Utilidades ──
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // Fecha y hora de Bogotá "YYYY-MM-DD HH:mm:ss"
  function ahoraBogota() {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    const p = Object.fromEntries(fmt.formatToParts(new Date()).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
  }

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function esErrorDeRed(e) {
    if (!e) return false;
    if (e.name === 'TypeError' || e.name === 'AbortError') return true;
    return /failed to fetch|networkerror|load failed|network request failed/i.test(String(e.message || e));
  }

  function urlApi(ruta) {
    const sep = ruta.includes('?') ? '&' : '?';
    return `/facturacion/api/${ruta}${sep}usuario=${encodeURIComponent(CFG.usuario)}`;
  }

  // ── IndexedDB ──
  function abrirDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NOMBRE, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbOp(modo, fn) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, modo);
      const store = tx.objectStore(DB_STORE);
      let resultado;
      Promise.resolve(fn(store)).then(r => { resultado = r; });
      tx.oncomplete = () => { db.close(); resolve(resultado); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Operación cancelada')); };
    });
  }
  function reqProm(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  const guardar = (item) => dbOp('readwrite', s => reqProm(s.put(item)));
  const borrar = (id) => dbOp('readwrite', s => reqProm(s.delete(id)));
  const todos = () => dbOp('readonly', s => reqProm(s.getAll())).then(l => (l || []).sort((a, b) => String(a.creado).localeCompare(String(b.creado))));

  // Solo los registros de este usuario (un celular puede usarse con varios usuarios)
  async function pendientesDelUsuario() {
    return (await todos()).filter(p => String(p.usuario) === String(CFG.usuario));
  }

  // ── Fotos: se comprimen antes de guardarlas en el celular ──
  async function comprimirImagen(archivo) {
    if (!archivo || !/^image\/(jpe?g|png|webp|heic|heif)$/i.test(archivo.type || '') || archivo.size < 400 * 1024) return archivo;
    try {
      const bitmap = await createImageBitmap(archivo);
      const escala = Math.min(1, FOTO_MAX_PX / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * escala);
      canvas.height = Math.round(bitmap.height * escala);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', FOTO_CALIDAD));
      if (!blob || blob.size >= archivo.size) return archivo;
      const nombre = String(archivo.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
      return new File([blob], nombre, { type: 'image/jpeg' });
    } catch (e) {
      return archivo;
    }
  }

  async function serializarFormData(fd) {
    const campos = [];
    const archivos = [];
    for (const [k, v] of fd.entries()) {
      if (v instanceof Blob) {
        const comp = await comprimirImagen(v);
        archivos.push([k, { blob: comp, nombre: comp.name || v.name || 'archivo', tipo: comp.type || v.type || '' }]);
      } else {
        campos.push([k, String(v)]);
      }
    }
    return { campos, archivos };
  }

  function construirFormData(ser, extra) {
    const fd = new FormData();
    ser.campos.forEach(([k, v]) => fd.append(k, v));
    ser.archivos.forEach(([k, a]) => fd.append(k, new File([a.blob], a.nombre, { type: a.tipo })));
    Object.entries(extra || {}).forEach(([k, v]) => fd.set(k, v));
    return fd;
  }

  // ── API pública para la página ──
  function activo() { return !!(CFG && CFG.offline && CFG.offline.habilitado && window.indexedDB); }

  // Recibo nuevo: código y fecha de captura (se mandan también con internet, para no duplicar)
  function prepararRecibo(payload) {
    if (!activo()) return payload;
    if (!payload.idOffline) payload.idOffline = uuid();
    if (!payload.fechaCaptura) payload.fechaCaptura = ahoraBogota();
    return payload;
  }

  // Servicio nuevo: idem sobre su FormData
  function prepararServicio(fd) {
    if (!activo() || !fd) return fd;
    if (!fd.get('idOffline')) fd.set('idOffline', uuid());
    if (!fd.get('fechaCaptura')) fd.set('fechaCaptura', ahoraBogota());
    return fd;
  }

  async function serializarServicios(servicios) {
    const lista = [];
    for (const s of servicios) {
      prepararServicio(s.fd);
      lista.push({
        idOffline: s.fd.get('idOffline'),
        fechaCaptura: s.fd.get('fechaCaptura'),
        descripcion: (s.resumen && s.resumen.descripcion) || 'Servicio',
        datos: await serializarFormData(s.fd),
        estado: 'pendiente',
        error: null,
      });
    }
    return lista;
  }

  /** Recibo nuevo con sus servicios ({ fd, resumen }) que no se pudo enviar */
  async function encolarRecibo(payload, servicios, info) {
    prepararRecibo(payload);
    const item = {
      id: payload.idOffline,
      tipo: 'recibo',
      usuario: CFG.usuario,
      creado: payload.fechaCaptura,
      operacion: payload.operacion,
      modalidad: payload.modalidad,
      cliente: (info && info.cliente) || payload.clienteAFacturar || payload.nit || '',
      recibo: payload,
      idReciboServidor: null,
      servicios: await serializarServicios(servicios || []),
      estado: 'pendiente',
      error: null,
    };
    await guardar(item);
    await pedirAlmacenamientoPersistente();
    actualizarIndicador();
    toast(`📴 Sin conexión: el recibo y ${item.servicios.length} servicio(s) quedaron guardados en el celular. Se subirán solos cuando vuelva la señal.`);
    return item;
  }

  /** Servicios nuevos de un recibo que ya existe en el servidor */
  async function encolarServicios(idRecibo, servicios, info) {
    const lista = await serializarServicios(servicios || []);
    if (!lista.length) return null;
    const item = {
      id: uuid(),
      tipo: 'servicio',
      usuario: CFG.usuario,
      creado: lista[0].fechaCaptura || ahoraBogota(),
      operacion: (info && info.operacion) || '',
      cliente: (info && info.recibo) || '',
      idReciboServidor: idRecibo,
      servicios: lista,
      estado: 'pendiente',
      error: null,
    };
    await guardar(item);
    await pedirAlmacenamientoPersistente();
    actualizarIndicador();
    toast(`📴 Sin conexión: ${lista.length} servicio(s) quedaron guardados en el celular. Se subirán solos cuando vuelva la señal.`);
    return item;
  }

  async function pedirAlmacenamientoPersistente() {
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* opcional */ }
  }

  // ── Sincronización ──
  class ErrorDeRed extends Error {}

  async function enviar(url, opciones) {
    let resp;
    try {
      resp = await fetch(url, opciones);
    } catch (e) {
      throw new ErrorDeRed(e.message);
    }
    // Sin señal o error del servidor (5xx): se reintenta más tarde, no se marca como rechazado
    if (resp.status >= 500 || resp.headers.get('X-Offline') === '1') throw new ErrorDeRed(`Servidor no disponible (${resp.status})`);
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok && data.ok, status: resp.status, data };
  }

  async function sincronizarItem(item) {
    // 1) El recibo
    if (item.tipo === 'recibo' && !item.idReciboServidor) {
      const r = await enviar(urlApi('recibos'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item.recibo, sinConexion: '1' }),
      });
      if (!r.ok) {
        item.estado = 'error';
        item.error = r.data.error || `No se pudo crear el recibo (código ${r.status}).`;
        await guardar(item);
        return { subidos: 0 };
      }
      item.idReciboServidor = r.data.idRecibo;
      item.error = null;
      item.reciboCreadoAqui = !r.data.repetido;
      await guardar(item);
    }

    // 2) Sus servicios, en orden
    let subidos = 0;
    for (const s of item.servicios) {
      if (s.estado === 'ok') continue;
      const fd = construirFormData(s.datos, { idOffline: s.idOffline, fechaCaptura: s.fechaCaptura, sinConexion: '1' });
      const r = await enviar(urlApi(`recibos/${encodeURIComponent(item.idReciboServidor)}/servicios`), { method: 'POST', body: fd });
      if (r.ok) {
        s.estado = 'ok';
        s.error = null;
        s.idServicio = r.data.idServicio;
        s.datos = { campos: [], archivos: [] }; // libera el espacio de las fotos
        subidos++;
      } else {
        s.estado = 'error';
        s.error = r.data.error || `No se pudo guardar (código ${r.status}).`;
      }
      await guardar(item);
    }

    const conError = item.servicios.filter(s => s.estado === 'error');
    if (!conError.length) {
      await borrar(item.id);
      return { subidos, terminado: true };
    }

    // Recibo nuevo sin ningún servicio aceptado: se descarta el recibo vacío, como con internet
    if (item.tipo === 'recibo' && item.reciboCreadoAqui && !item.servicios.some(s => s.estado === 'ok')) {
      await enviar(urlApi(`recibos/${encodeURIComponent(item.idReciboServidor)}/vacio`), { method: 'DELETE' }).catch(() => {});
      item.idReciboServidor = null;
      item.reciboCreadoAqui = false;
      item.recibo = { ...item.recibo, idOffline: uuid() }; // al reintentar se crea de nuevo
    }
    item.estado = 'error';
    item.error = `${conError.length} servicio(s) no se aceptaron.`;
    await guardar(item);
    return { subidos };
  }

  async function sincronizar({ manual = false } = {}) {
    if (!CFG || sincronizando) return;
    if (!navigator.onLine && !manual) return;
    const lista = (await pendientesDelUsuario()).filter(p => manual || p.estado !== 'error');
    if (!lista.length) { actualizarIndicador(); return; }

    sincronizando = true;
    actualizarIndicador();
    let subidos = 0;
    let sinRed = false;
    try {
      for (const item of lista) {
        if (manual && item.estado === 'error') {
          item.estado = 'pendiente';
          item.servicios.forEach(s => { if (s.estado === 'error') s.estado = 'pendiente'; });
        }
        try {
          const r = await sincronizarItem(item);
          subidos += r.subidos || 0;
        } catch (e) {
          if (e instanceof ErrorDeRed) { sinRed = true; break; }
          console.error('[FacOffline] Error sincronizando', e);
          item.estado = 'error';
          item.error = e.message || 'Error inesperado';
          await guardar(item).catch(() => {});
        }
      }
    } finally {
      sincronizando = false;
      await actualizarIndicador();
    }
    if (subidos) {
      toast(`✅ Se subieron ${subidos} servicio(s) guardados sin conexión.`);
      if (typeof onSincronizado === 'function') { try { onSincronizado(); } catch (e) { /* opcional */ } }
    }
    if (manual && sinRed) toast('Aún no hay conexión. Se intentará de nuevo automáticamente.');
    const quedanError = (await pendientesDelUsuario()).some(p => p.estado === 'error');
    if (quedanError && (subidos || manual)) toast('⚠️ Algunos registros no se aceptaron. Toca el aviso de pendientes para ver el motivo.');
  }

  // ── Catálogos y consultas para trabajar sin señal ──
  async function precargar(forzar = false) {
    if (!activo() || !navigator.onLine || !('caches' in window)) return;
    const claveTs = `facOfflineCatalogos_${CFG.usuario}`;
    const ultimo = Number(localStorage.getItem(claveTs) || 0);
    if (!forzar && Date.now() - ultimo < HORAS_CATALOGOS * 3600 * 1000) return;
    try {
      const resp = await fetch(urlApi('offline/catalogos'));
      if (!resp.ok) return;
      const data = await resp.json();
      const cache = await caches.open(CACHE_CATALOGOS);
      await cache.put(CLAVE_CATALOGOS, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
      localStorage.setItem(claveTs, String(Date.now()));

      // Consultas del formulario que no dependen de lo que se escribe: pasan por el service
      // worker, que guarda la respuesta (mismos parámetros y orden que usa la página)
      const ops = operacionesUsuario().slice(0, 8);
      const urls = [
        `/facturacion/api/config/vehiculos?usuario=${encodeURIComponent(CFG.usuario)}`,
        `/facturacion/api/config/unidades?usuario=${encodeURIComponent(CFG.usuario)}`,
        `/facturacion/api/config/duraciones?usuario=${encodeURIComponent(CFG.usuario)}`,
        `/facturacion/api/clientes-a-facturar?usuario=${encodeURIComponent(CFG.usuario)}`,
      ];
      ops.forEach(op => {
        urls.push(`/facturacion/api/config/areas?${new URLSearchParams({ usuario: CFG.usuario, operacion: op })}`);
        urls.push(`/facturacion/api/config/actividades?${new URLSearchParams({ usuario: CFG.usuario, operacion: op })}`);
        ['Recibo', 'Servicio'].forEach(seccion => ['RECAUDO', 'CREDITO'].forEach(modalidad => {
          urls.push(`/facturacion/api/config-servicios?${new URLSearchParams({ usuario: CFG.usuario, seccion, operacion: op, modalidad, clienteAFacturar: '' })}`);
        }));
      });
      for (const u of urls) { try { await fetch(u); } catch (e) { /* se intenta en la próxima carga */ } }
      actualizarIndicador();
    } catch (e) {
      console.warn('[FacOffline] No se pudieron descargar los catálogos', e);
    }
  }

  function operacionesUsuario() {
    const ops = Object.values(CFG.opsPorRegional || {}).flat().filter(Boolean);
    if (CFG.operacion && !ops.includes(CFG.operacion)) ops.unshift(CFG.operacion);
    return [...new Set(ops)];
  }

  // ── Indicador y bandeja ──
  function asegurarEstilos() {
    if (document.getElementById('fac-offline-estilos')) return;
    const st = document.createElement('style');
    st.id = 'fac-offline-estilos';
    st.textContent = `
      #fac-offline-chip { position: fixed; left: 14px; bottom: 14px; z-index: 9998; display: none; align-items: center; gap: 6px;
        padding: 8px 14px; border-radius: 999px; font: 600 0.82rem/1.2 Inter, system-ui, sans-serif; cursor: pointer;
        box-shadow: 0 4px 14px rgba(0,0,0,.18); border: 1px solid rgba(0,0,0,.08); }
      #fac-offline-chip.sin-red { background: #334155; color: #fff; }
      #fac-offline-chip.pendiente { background: #fef3c7; color: #92400e; }
      #fac-offline-chip.error { background: #fee2e2; color: #991b1b; }
      #fac-offline-toast { position: fixed; left: 50%; bottom: 64px; transform: translateX(-50%); z-index: 9999; max-width: 92vw;
        background: #1B2A5E; color: #fff; padding: 10px 16px; border-radius: 10px; font: 500 0.85rem/1.35 Inter, system-ui, sans-serif;
        box-shadow: 0 6px 18px rgba(0,0,0,.25); display: none; }
      #fac-offline-panel { position: fixed; inset: 0; z-index: 10000; background: rgba(15,23,42,.55); display: none; align-items: flex-end; justify-content: center; }
      #fac-offline-panel .fop-caja { background: var(--card-bg, #fff); color: var(--text, #1a1a2e); width: min(640px, 100%); max-height: 85vh; overflow: auto;
        border-radius: 14px 14px 0 0; padding: 18px; font-family: Inter, system-ui, sans-serif; }
      #fac-offline-panel .fop-item { border: 1px solid var(--border, #e2e8f0); border-radius: 10px; padding: 10px 12px; margin: 10px 0; font-size: .86rem; }
      #fac-offline-panel .fop-err { color: #b91c1c; font-size: .8rem; margin-top: 4px; }
      #fac-offline-panel .fop-ok { color: #15803d; font-size: .8rem; }
      #fac-offline-panel button { font: 600 .82rem Inter, system-ui, sans-serif; border-radius: 8px; padding: 8px 12px; cursor: pointer; border: 1.5px solid var(--border, #e2e8f0); background: var(--card-bg, #fff); color: var(--text, #1a1a2e); }
      #fac-offline-panel button.fop-primario { background: #1B2A5E; color: #fff; border-color: #1B2A5E; }
      @media (min-width: 700px) { #fac-offline-panel { align-items: center; } #fac-offline-panel .fop-caja { border-radius: 14px; } }
    `;
    document.head.appendChild(st);
  }

  function toast(texto) {
    asegurarEstilos();
    let t = document.getElementById('fac-offline-toast');
    if (!t) { t = document.createElement('div'); t.id = 'fac-offline-toast'; document.body.appendChild(t); }
    t.textContent = texto;
    t.style.display = 'block';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.display = 'none'; }, 6000);
  }

  async function actualizarIndicador() {
    if (!CFG) return;
    asegurarEstilos();
    let chip = document.getElementById('fac-offline-chip');
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'fac-offline-chip';
      chip.setAttribute('role', 'button');
      chip.onclick = abrirPanel;
      document.body.appendChild(chip);
    }
    let lista = [];
    try { lista = await pendientesDelUsuario(); } catch (e) { /* sin IndexedDB */ }
    const nServ = lista.reduce((n, p) => n + p.servicios.filter(s => s.estado !== 'ok').length, 0);
    const conError = lista.some(p => p.estado === 'error');
    const sinRed = !navigator.onLine;
    chip.className = '';
    if (!lista.length && !sinRed) { chip.style.display = 'none'; return; }
    chip.style.display = 'inline-flex';
    if (sincronizando) { chip.classList.add('pendiente'); chip.textContent = `⏫ Subiendo ${nServ} pendiente(s)...`; return; }
    if (conError) { chip.classList.add('error'); chip.textContent = `⚠️ ${nServ} pendiente(s) con novedad`; return; }
    if (lista.length) { chip.classList.add(sinRed ? 'sin-red' : 'pendiente'); chip.textContent = `${sinRed ? '📴 Sin conexión · ' : '⏳ '}${nServ} servicio(s) por subir`; return; }
    chip.classList.add('sin-red');
    chip.textContent = activo() ? '📴 Sin conexión · puedes registrar' : '📴 Sin conexión';
  }

  async function abrirPanel() {
    asegurarEstilos();
    let panel = document.getElementById('fac-offline-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'fac-offline-panel';
      panel.onclick = (e) => { if (e.target === panel) cerrarPanel(); };
      document.body.appendChild(panel);
    }
    const lista = await pendientesDelUsuario();
    const items = lista.map(p => {
      const servicios = p.servicios.map(s => `
        <div style="margin-left:8px;">• ${esc(s.descripcion)} ${s.estado === 'ok' ? '<span class="fop-ok">✓ subido</span>' : ''}
          ${s.error ? `<div class="fop-err">${esc(s.error)}</div>` : ''}</div>`).join('');
      const titulo = p.tipo === 'recibo'
        ? `Recibo nuevo · ${esc(p.operacion || '')} · ${esc(p.modalidad || '')}${p.cliente ? ' · ' + esc(p.cliente) : ''}`
        : `Servicios para el recibo ${esc(p.cliente || p.idReciboServidor || '')}`;
      return `<div class="fop-item">
        <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start;">
          <div><strong>${titulo}</strong><div style="color:var(--text-muted,#64748b); font-size:.78rem;">Guardado: ${esc(p.creado)}</div></div>
          <button type="button" data-descartar="${esc(p.id)}" title="Borrar del celular">🗑️</button>
        </div>
        ${p.error ? `<div class="fop-err">${esc(p.error)}</div>` : ''}
        ${servicios}
      </div>`;
    }).join('');
    const cat = await infoCatalogos();
    panel.innerHTML = `<div class="fop-caja">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3 style="margin:0; font-size:1.05rem;">Registros guardados en el celular</h3>
        <button type="button" data-cerrar="1">✕</button>
      </div>
      <p style="font-size:.8rem; color:var(--text-muted,#64748b); margin:8px 0 0;">
        ${navigator.onLine ? 'Hay conexión.' : 'Sin conexión.'} Se suben solos cuando vuelve la señal.
        No borres los datos del navegador ni desinstales la app mientras haya pendientes.
        ${cat ? `<br>Catálogos para trabajar sin señal: ${esc(cat)}.` : ''}
      </p>
      ${items || '<p style="font-size:.88rem;">No hay registros pendientes.</p>'}
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px; flex-wrap:wrap;">
        <button type="button" data-catalogos="1">Actualizar catálogos</button>
        <button type="button" class="fop-primario" data-sincronizar="1" ${lista.length ? '' : 'disabled'}>Subir ahora</button>
      </div>
    </div>`;
    panel.querySelector('[data-cerrar]').onclick = cerrarPanel;
    panel.querySelector('[data-sincronizar]').onclick = async () => { cerrarPanel(); await sincronizar({ manual: true }); };
    panel.querySelector('[data-catalogos]').onclick = async () => {
      if (!navigator.onLine) { toast('Necesitas conexión para actualizar los catálogos.'); return; }
      toast('Actualizando catálogos...');
      await precargar(true);
      toast('Catálogos actualizados.');
      abrirPanel();
    };
    panel.querySelectorAll('[data-descartar]').forEach(b => {
      b.onclick = async () => {
        if (!confirm('¿Borrar este registro del celular? Lo que no se haya subido se pierde.')) return;
        await borrar(b.dataset.descartar);
        await actualizarIndicador();
        abrirPanel();
      };
    });
    panel.style.display = 'flex';
  }

  function cerrarPanel() {
    const panel = document.getElementById('fac-offline-panel');
    if (panel) panel.style.display = 'none';
  }

  async function infoCatalogos() {
    try {
      const cache = await caches.open(CACHE_CATALOGOS);
      const r = await cache.match(CLAVE_CATALOGOS);
      if (!r) return null;
      const c = await r.json();
      return `${(c.placas || []).length} placas, ${(c.clientes || []).length} clientes, ${(c.transportadoras || []).length} transportadoras (descargados ${c.generado})`;
    } catch (e) { return null; }
  }

  // ── Inicio ──
  async function init(config, opciones = {}) {
    CFG = config;
    onSincronizado = opciones.onSincronizado || null;
    window.addEventListener('online', () => { actualizarIndicador(); setTimeout(() => sincronizar(), 1500); setTimeout(() => precargar(), 4000); });
    window.addEventListener('offline', () => actualizarIndicador());

    if ('serviceWorker' in navigator) {
      if (activo()) {
        navigator.serviceWorker.register('/sw-facturacion.js', { scope: '/facturacion' }).catch(e => console.warn('[FacOffline] service worker', e));
      } else {
        // Modo apagado: se quita el service worker si había uno
        navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => {
          if (r.active && /sw-facturacion\.js/.test(r.active.scriptURL)) r.unregister();
        })).catch(() => {});
      }
    }

    await actualizarIndicador();
    // Lo pendiente se intenta subir aunque el modo se haya apagado después de guardarlo
    setTimeout(() => sincronizar(), 2500);
    setInterval(() => { if (navigator.onLine) sincronizar(); }, 60 * 1000);
    if (activo()) setTimeout(() => precargar(), 6000);
  }

  window.FacOffline = {
    init, activo, prepararRecibo, prepararServicio, encolarRecibo, encolarServicios,
    esErrorDeRed, sincronizar, abrirPanel, precargar,
  };
})();
