/**
 * Botón "Sincronizar" (ícono como el de AppSheet) compartido entre módulos.
 * Recarga los datos de la pestaña visible sin recargar la página.
 * Mismo diseño y ubicación que en Facturación:
 *   - Celular (≤ 900 px): en la barra superior, a la izquierda de la foto de perfil.
 *   - Escritorio: en el encabezado de cada pestaña, como primera acción a la derecha.
 *
 * Uso (una vez cargado el DOM):
 *
 *   initBotonSync({
 *     alSincronizar: async () => { ... },   // obligatorio: recarga la vista actual
 *     escritorio: [                          // dónde va el ícono en escritorio
 *       { encabezado: '.page-hd', acciones: '.page-hd-actions' }
 *     ]
 *   });
 *
 * Por cada elemento que coincide con `encabezado`, el ícono se inserta al inicio de su
 * contenedor `acciones`. Si el encabezado no tiene ese contenedor, el ícono se ubica en
 * la esquina superior derecha del encabezado.
 *
 * window.sincronizarVista() ejecuta la misma acción (por ejemplo, desde otro botón).
 */
(() => {
  const ICONO = '<svg class="icono-sync" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/></svg>';
  const CSS = `
    .bsync {
      display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;
      width: 38px; height: 38px; padding: 0; border-radius: 8px;
      border: 1.5px solid var(--border, #cbd5e1); background: var(--card-bg, #fff); color: var(--accent, #f55400);
    }
    .bsync:disabled { opacity: .7; cursor: default; }
    .bsync.girando .icono-sync { animation: bsync-giro .8s linear infinite; }
    @keyframes bsync-giro { to { transform: rotate(360deg); } }
    .bsync-movil { display: none; width: 34px; height: 34px; border: none; background: transparent; color: var(--text-inverse, #fff); border-radius: 50%; margin-right: 8px; }
    .bsync-con-esquina { position: relative; padding-right: 50px; }
    .bsync-esquina { position: absolute; top: 0; right: 0; }
    @media (max-width: 900px) {
      .bsync-escritorio { display: none !important; }
      .bsync-movil { display: inline-flex; }
      .bsync-con-esquina { padding-right: 0; }
    }`;

  let cfg = null;
  let ocupado = false;

  function crear(clase) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `bsync ${clase}`;
    b.title = 'Sincronizar';
    b.setAttribute('aria-label', 'Sincronizar');
    b.innerHTML = ICONO;
    b.addEventListener('click', () => sincronizar());
    return b;
  }

  async function sincronizar() {
    if (ocupado || !cfg) return;
    ocupado = true;
    const botones = document.querySelectorAll('.bsync');
    botones.forEach(b => { b.disabled = true; b.classList.add('girando'); });
    try {
      await cfg.alSincronizar();
    } catch (e) {
      console.error('[boton-sync]', e);
    } finally {
      ocupado = false;
      botones.forEach(b => { b.disabled = false; b.classList.remove('girando'); });
    }
  }

  function colocarEscritorio() {
    (cfg.escritorio || []).forEach(({ encabezado, acciones }) => {
      document.querySelectorAll(encabezado).forEach(hd => {
        if (hd.querySelector('.bsync-escritorio')) return;
        let cont = null;
        if (acciones) {
          try { cont = hd.querySelector(acciones); } catch (e) { cont = null; }
        }
        if (cont) {
          cont.insertBefore(crear('bsync-escritorio'), cont.firstChild);
        } else {
          hd.classList.add('bsync-con-esquina');
          hd.appendChild(crear('bsync-escritorio bsync-esquina'));
        }
      });
    });
  }

  window.initBotonSync = function initBotonSync(opciones) {
    if (!opciones || typeof opciones.alSincronizar !== 'function') {
      console.error('[boton-sync] initBotonSync requiere alSincronizar.');
      return;
    }
    cfg = opciones;
    if (!document.getElementById('bsync-estilos')) {
      const st = document.createElement('style');
      st.id = 'bsync-estilos';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const der = document.querySelector('.mobile-header-right');
    if (der && !der.querySelector('.bsync-movil')) der.insertBefore(crear('bsync-movil'), der.firstChild);
    colocarEscritorio();
  };

  window.sincronizarVista = sincronizar;
})();
