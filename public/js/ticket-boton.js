/**
 * Botón flotante "+ Ticket" compartido entre módulos (Dynamic_Tickets).
 * Cada página lo activa una vez cargado el DOM:
 *
 *   initBotonTicket({
 *     usuarioId: CONFIG.usuario,         // único parámetro obligatorio
 *     moduloErp: 'facturacion',          // opcional — prefijo de ruta del módulo ERP anfitrión
 *     obtenerSeccion: miFuncion,         // opcional — ver abajo (o usar la alternativa estática `seccion: 'Recibos'`)
 *     moduloDefecto: 'Servicios',        // opcional — red de seguridad si no hay match en BD o falla la consulta
 *     opsPorRegional: CONFIG.opsPorRegional,
 *     regionalesFiltro: CONFIG.regionalesFiltro,
 *     obtenerContexto: miFuncion,        // opcional — ver abajo
 *     recibosRecientesUrl: '/facturacion/api/tickets/recibos-recientes' // opcional
 *   });
 *
 * moduloErp, si se provee, se usa para resolver dinámicamente el módulo
 * preseleccionado contra Config_motivo_tickets (columnas ModuloERP/Seccion,
 * filas con Motivo = NULL) vía GET /tickets/api/modulo-defecto — así el
 * default puede administrarse desde BD sin tocar código. La búsqueda intenta
 * primero un match exacto (ModuloERP, Seccion) y luego cae al genérico por
 * ModuloERP solo. obtenerSeccion(), si se provee, se llama cada vez que se
 * abre el modal y debe devolver la Sección actualmente visible usando el
 * MISMO valor que ya usa ese módulo en su tabla Maestro_Menu_X (p.ej.
 * 'Actas' en Inventario, 'Evaluación SST' en SST) — así no hay que inventar
 * un vocabulario nuevo. Si la página no es una SPA por pestañas, se puede
 * usar en su lugar el valor estático `seccion`. Si no hay match en BD (o
 * falla la consulta), se usa moduloDefecto; si tampoco se declaró, el
 * Módulo queda libre para que el usuario lo escoja manualmente.
 *
 * obtenerContexto(), si se provee, se llama cada vez que se abre el modal y
 * debe devolver null (sin registro abierto) o:
 *   { idRecibo, consecutivo, operacion, descripcionPrefill }
 * — idRecibo/consecutivo/operacion fijan y bloquean esos campos mientras el
 * Módulo elegido sea "Servicios"; descripcionPrefill (opcional) precarga la
 * Descripción. Fuera de "Servicios" el contexto se ignora.
 *
 * recibosRecientesUrl es específico del dominio de Servicios (Dynamic_Recibos
 * vive en Facturación); el widget solo lo usa cuando el Módulo activo es
 * "Servicios" y no hay contexto. Si no se provee, el selector manual de
 * recibos queda deshabilitado con un aviso.
 */
(() => {
  let cfg = null;
  let contexto = null;
  let yaInicializado = false;
  let recibosDisponibles = [];
  let reciboSeleccionado = null;
  let reciboIndiceResaltado = -1;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function normalizarTexto(txt) {
    return String(txt || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function renderizarOpcionesRecibo(filtro = '') {
    const listaEl = document.getElementById('tkb-recibo-list');
    if (!listaEl) return;
    const filtroNorm = normalizarTexto(filtro);
    const selId = document.getElementById('tkb-recibo-select')?.value || '';

    const filtrados = filtroNorm
      ? recibosDisponibles.filter(r => {
          const consNorm = normalizarTexto(r.consecutivo);
          const idNorm = normalizarTexto(r.idRecibo);
          return consNorm.includes(filtroNorm) || idNorm.includes(filtroNorm);
        })
      : recibosDisponibles;

    reciboIndiceResaltado = -1;

    let html = '';
    if (!filtroNorm) {
      html += `<div class="tkb-combo-item tkb-combo-item-empty" data-id="" data-consecutivo="">— Ninguno (dejar vacío) —</div>`;
    }

    if (filtrados.length === 0) {
      html += `<div class="tkb-combo-no-results">No se encontraron recibos que coincidan</div>`;
    } else {
      html += filtrados.map(r => {
        const texto = r.consecutivo || r.idRecibo;
        const isSel = (r.idRecibo === selId);
        return `<div class="tkb-combo-item ${isSel ? 'tkb-combo-item-selected' : ''}" data-id="${esc(r.idRecibo)}" data-consecutivo="${esc(texto)}">${esc(texto)}</div>`;
      }).join('');
    }

    listaEl.innerHTML = html;

    listaEl.querySelectorAll('.tkb-combo-item').forEach((itemEl) => {
      itemEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const id = itemEl.getAttribute('data-id') || '';
        const cons = itemEl.getAttribute('data-consecutivo') || '';
        seleccionarRecibo(id, cons);
      });
    });
  }

  function abrirListaRecibos() {
    const input = document.getElementById('tkb-recibo-input');
    const combo = document.getElementById('tkb-recibo-combobox');
    const listaEl = document.getElementById('tkb-recibo-list');
    if (!input || input.disabled || !recibosDisponibles.length) return;

    renderizarOpcionesRecibo(input.value);
    listaEl.style.display = 'block';
    combo.classList.add('tkb-combo-open');

    const selEl = listaEl.querySelector('.tkb-combo-item-selected');
    if (selEl) {
      selEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function cerrarListaRecibos() {
    const combo = document.getElementById('tkb-recibo-combobox');
    const listaEl = document.getElementById('tkb-recibo-list');
    if (listaEl) listaEl.style.display = 'none';
    if (combo) combo.classList.remove('tkb-combo-open');
    reciboIndiceResaltado = -1;
  }

  function seleccionarRecibo(idRecibo, consecutivo) {
    const input = document.getElementById('tkb-recibo-input');
    const hidden = document.getElementById('tkb-recibo-select');
    const clearBtn = document.getElementById('tkb-recibo-clear');

    if (idRecibo) {
      if (hidden) hidden.value = idRecibo;
      if (input) input.value = consecutivo;
      if (clearBtn) clearBtn.style.display = 'flex';
      reciboSeleccionado = { idRecibo, consecutivo };
    } else {
      if (hidden) hidden.value = '';
      if (input) input.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
      reciboSeleccionado = null;
    }
    cerrarListaRecibos();
  }

  function limpiarRecibo() {
    seleccionarRecibo('', '');
    const input = document.getElementById('tkb-recibo-input');
    if (input && !input.disabled) {
      input.focus();
      abrirListaRecibos();
    }
  }

  function resetearReciboCombobox(mensajePlaceholder = '— Seleccione primero la Operación —') {
    recibosDisponibles = [];
    reciboSeleccionado = null;
    reciboIndiceResaltado = -1;

    const input = document.getElementById('tkb-recibo-input');
    const hidden = document.getElementById('tkb-recibo-select');
    const toggle = document.getElementById('tkb-recibo-toggle');
    const clearBtn = document.getElementById('tkb-recibo-clear');

    if (input) {
      input.value = '';
      input.placeholder = mensajePlaceholder;
      input.disabled = true;
    }
    if (hidden) hidden.value = '';
    if (toggle) toggle.disabled = true;
    if (clearBtn) clearBtn.style.display = 'none';
    cerrarListaRecibos();
  }

  function establecerEstadoCargandoRecibos(mensaje = 'Cargando recibos...') {
    recibosDisponibles = [];
    reciboSeleccionado = null;
    const input = document.getElementById('tkb-recibo-input');
    const hidden = document.getElementById('tkb-recibo-select');
    const toggle = document.getElementById('tkb-recibo-toggle');
    const clearBtn = document.getElementById('tkb-recibo-clear');

    if (input) {
      input.value = '';
      input.placeholder = mensaje;
      input.disabled = true;
    }
    if (hidden) hidden.value = '';
    if (toggle) toggle.disabled = true;
    if (clearBtn) clearBtn.style.display = 'none';
    cerrarListaRecibos();
  }

  function establecerRecibosDisponibles(rows) {
    recibosDisponibles = rows || [];
    reciboSeleccionado = null;

    const input = document.getElementById('tkb-recibo-input');
    const hidden = document.getElementById('tkb-recibo-select');
    const toggle = document.getElementById('tkb-recibo-toggle');
    const clearBtn = document.getElementById('tkb-recibo-clear');

    if (input) {
      input.value = '';
      input.placeholder = 'Escriba para filtrar o elija de la lista...';
      input.disabled = false;
    }
    if (hidden) hidden.value = '';
    if (toggle) toggle.disabled = false;
    if (clearBtn) clearBtn.style.display = 'none';
    cerrarListaRecibos();
  }

  function cargarCSS() {
    if (document.querySelector('link[data-ticket-boton-style]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/ticket-boton.css';
    link.dataset.ticketBotonStyle = 'true';
    document.head.appendChild(link);
  }

  function crearMarkup() {
    if (document.getElementById('tkb-overlay')) return;

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.id = 'tkb-boton';
    boton.className = 'tkb-flotante';
    boton.title = 'Reportar un ticket';
    boton.innerHTML = '<span style="font-size:1.1rem;">🎫</span> <span class="tkb-label">Ticket</span>';
    document.body.appendChild(boton);

    const overlay = document.createElement('div');
    overlay.id = 'tkb-overlay';
    overlay.className = 'tkb-overlay';
    overlay.innerHTML = `
      <div class="tkb-card">
        <div class="tkb-header">
          <span>🎫 Tickets</span>
          <button type="button" class="tkb-close" id="tkb-cerrar-x">&times;</button>
        </div>
        <div class="tkb-tabs" role="tablist">
          <button type="button" class="tkb-tab tkb-tab-activa" data-tkb-tab="nuevo" role="tab">＋ Nuevo ticket</button>
          <button type="button" class="tkb-tab" data-tkb-tab="mis" role="tab">📋 Mis tickets <span class="tkb-tab-badge" id="tkb-mis-badge" style="display:none;"></span></button>
        </div>
        <div class="tkb-body">
          <div id="tkb-panel-mis" style="display:none;"></div>
          <form id="tkb-form" onsubmit="return false;">
            <div class="tkb-group" id="tkb-recibo-contexto-wrap" style="display:none;">
              <label>Recibo</label>
              <input type="text" id="tkb-recibo-contexto" disabled>
              <small>Tomado del registro que tiene abierto.</small>
            </div>

            <div class="tkb-group">
              <label>Módulo *</label>
              <select id="tkb-modulo"><option value="">Cargando...</option></select>
            </div>

            <div class="tkb-group">
              <label>Regional *</label>
              <select id="tkb-regional"><option value="">— Seleccione Regional —</option></select>
            </div>

            <div class="tkb-group">
              <label>Operación *</label>
              <select id="tkb-operacion"><option value="">— Seleccione primero la Regional —</option></select>
            </div>

            <div class="tkb-group" id="tkb-recibo-select-wrap" style="display:none;">
              <label for="tkb-recibo-input">Consecutivo Recibo (opcional)</label>
              <div class="tkb-combobox" id="tkb-recibo-combobox">
                <input type="text" id="tkb-recibo-input" placeholder="— Seleccione primero la Operación —" autocomplete="off" disabled>
                <input type="hidden" id="tkb-recibo-select" value="">
                <button type="button" class="tkb-combo-clear" id="tkb-recibo-clear" tabindex="-1" title="Limpiar selección" style="display:none;">&times;</button>
                <button type="button" class="tkb-combo-arrow" id="tkb-recibo-toggle" tabindex="-1" title="Mostrar recibos" disabled>▼</button>
                <div class="tkb-combo-list" id="tkb-recibo-list" style="display:none;"></div>
              </div>
              <small>Solo recibos de los últimos 30 días para la operación escogida. Déjelo vacío si la novedad no es sobre un recibo puntual.</small>
            </div>

            <div class="tkb-group">
              <label>Motivo *</label>
              <div id="tkb-motivo-wrap"><select id="tkb-motivo"><option value="">Seleccione primero el Módulo</option></select></div>
            </div>

            <div class="tkb-group">
              <label>Descripción *</label>
              <textarea id="tkb-descripcion" rows="4" placeholder="Describa la novedad o solicitud..."></textarea>
            </div>

            <div class="tkb-group">
              <label>Teléfono de contacto</label>
              <input type="text" id="tkb-telefono" placeholder="Número de contacto">
            </div>

            <div class="tkb-group" style="margin-bottom:0;">
              <label>Evidencia (opcional)</label>
              <input type="file" id="tkb-evidencia" accept="image/*,application/pdf">
            </div>
          </form>
        </div>
        <div class="tkb-footer" id="tkb-footer-nuevo">
          <button type="button" class="tkb-btn-secundario" id="tkb-cancelar">Cancelar</button>
          <button type="button" class="tkb-btn-primario" id="tkb-guardar">Crear Ticket</button>
        </div>
        <div class="tkb-footer tkb-footer-mis" id="tkb-footer-mis" style="display:none;">
          <a class="tkb-link-historial" id="tkb-link-historial" href="#">Ver tickets de otros periodos →</a>
          <button type="button" class="tkb-btn-secundario" id="tkb-cerrar-mis">Cerrar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    boton.addEventListener('click', (ev) => {
      if (boton._arrastrado) { boton._arrastrado = false; ev.preventDefault(); return; }
      abrir();
    });
    hacerMovible(boton);
    document.getElementById('tkb-cerrar-x').addEventListener('click', cerrar);
    document.getElementById('tkb-cerrar-mis').addEventListener('click', cerrar);
    overlay.querySelectorAll('[data-tkb-tab]').forEach(b => b.addEventListener('click', () => mostrarPestana(b.dataset.tkbTab)));
    document.getElementById('tkb-panel-mis').addEventListener('click', onClickMis);
    document.getElementById('tkb-cancelar').addEventListener('click', cerrar);
    document.getElementById('tkb-guardar').addEventListener('click', guardar);
    document.getElementById('tkb-modulo').addEventListener('change', onModuloChange);
    document.getElementById('tkb-regional').addEventListener('change', onRegionalChange);
    document.getElementById('tkb-operacion').addEventListener('change', onOperacionChange);

    // Eventos combobox de Recibo
    const inputRecibo = document.getElementById('tkb-recibo-input');
    const toggleRecibo = document.getElementById('tkb-recibo-toggle');
    const clearRecibo = document.getElementById('tkb-recibo-clear');

    inputRecibo.addEventListener('focus', () => {
      if (!inputRecibo.disabled && recibosDisponibles.length) {
        abrirListaRecibos();
      }
    });

    inputRecibo.addEventListener('click', () => {
      if (!inputRecibo.disabled && recibosDisponibles.length) {
        abrirListaRecibos();
      }
    });

    inputRecibo.addEventListener('input', () => {
      if (inputRecibo.disabled) return;
      abrirListaRecibos();
      const val = inputRecibo.value.trim();
      const valNorm = normalizarTexto(val);

      if (!val) {
        document.getElementById('tkb-recibo-select').value = '';
        clearRecibo.style.display = 'none';
        reciboSeleccionado = null;
      } else {
        clearRecibo.style.display = 'flex';
        const matchExacto = recibosDisponibles.find(r => 
          normalizarTexto(r.consecutivo) === valNorm || normalizarTexto(r.idRecibo) === valNorm
        );
        if (matchExacto) {
          document.getElementById('tkb-recibo-select').value = matchExacto.idRecibo;
          reciboSeleccionado = matchExacto;
        } else {
          document.getElementById('tkb-recibo-select').value = '';
        }
      }
    });

    inputRecibo.addEventListener('keydown', (e) => {
      const listaEl = document.getElementById('tkb-recibo-list');
      const items = Array.from(listaEl.querySelectorAll('.tkb-combo-item'));
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (listaEl.style.display === 'none') {
          abrirListaRecibos();
          return;
        }
        if (!items.length) return;
        reciboIndiceResaltado = (reciboIndiceResaltado + 1) % items.length;
        items.forEach((it, idx) => it.classList.toggle('tkb-combo-item-highlight', idx === reciboIndiceResaltado));
        items[reciboIndiceResaltado]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (listaEl.style.display === 'none') {
          abrirListaRecibos();
          return;
        }
        if (!items.length) return;
        reciboIndiceResaltado = (reciboIndiceResaltado - 1 + items.length) % items.length;
        items.forEach((it, idx) => it.classList.toggle('tkb-combo-item-highlight', idx === reciboIndiceResaltado));
        items[reciboIndiceResaltado]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        if (listaEl.style.display !== 'none' && reciboIndiceResaltado >= 0 && items[reciboIndiceResaltado]) {
          e.preventDefault();
          const itemEl = items[reciboIndiceResaltado];
          const id = itemEl.getAttribute('data-id') || '';
          const cons = itemEl.getAttribute('data-consecutivo') || '';
          seleccionarRecibo(id, cons);
        }
      } else if (e.key === 'Escape') {
        cerrarListaRecibos();
      }
    });

    inputRecibo.addEventListener('blur', () => {
      setTimeout(() => {
        cerrarListaRecibos();
        const hidden = document.getElementById('tkb-recibo-select');
        const val = inputRecibo.value.trim();
        if (!val) {
          seleccionarRecibo('', '');
        } else if (!hidden.value) {
          const valNorm = normalizarTexto(val);
          const match = recibosDisponibles.find(r => 
            normalizarTexto(r.consecutivo) === valNorm || normalizarTexto(r.idRecibo) === valNorm
          );
          if (match) {
            seleccionarRecibo(match.idRecibo, match.consecutivo || match.idRecibo);
          } else if (reciboSeleccionado) {
            inputRecibo.value = reciboSeleccionado.consecutivo || reciboSeleccionado.idRecibo;
            hidden.value = reciboSeleccionado.idRecibo;
          } else {
            seleccionarRecibo('', '');
          }
        }
      }, 180);
    });

    toggleRecibo.addEventListener('click', (e) => {
      e.stopPropagation();
      const listaEl = document.getElementById('tkb-recibo-list');
      if (listaEl.style.display === 'none') {
        inputRecibo.focus();
        abrirListaRecibos();
      } else {
        cerrarListaRecibos();
      }
    });

    clearRecibo.addEventListener('click', (e) => {
      e.stopPropagation();
      limpiarRecibo();
    });

    document.addEventListener('pointerdown', (e) => {
      const combo = document.getElementById('tkb-recibo-combobox');
      if (combo && !combo.contains(e.target)) {
        cerrarListaRecibos();
      }
    });
  }

  // ── Apertura / cierre ──────────────────────────────────────────────────
  async function abrir() {
    mostrarPestana('nuevo');
    cargarMisTickets(false);
    document.getElementById('tkb-form').reset();
    resetearReciboCombobox('— Seleccione primero la Operación —');

    contexto = (typeof cfg.obtenerContexto === 'function') ? (cfg.obtenerContexto() || null) : null;

    document.getElementById('tkb-telefono').value = '';
    document.getElementById('tkb-descripcion').value = contexto?.descripcionPrefill || '';

    // Módulo: cargar catálogo y preseleccionar el default de la página anfitriona
    const selModulo = document.getElementById('tkb-modulo');
    selModulo.innerHTML = '<option value="">Cargando...</option>';
    document.getElementById('tkb-overlay').classList.add('tkb-open');

    const descripcionEl = document.getElementById('tkb-descripcion');
    if (contexto?.descripcionPrefill) {
      descripcionEl.focus();
      descripcionEl.setSelectionRange(descripcionEl.value.length, descripcionEl.value.length);
    }

    // Default dinámico: si la página anfitriona declaró cfg.moduloErp, se
    // consulta Config_motivo_tickets (columnas ModuloERP/Seccion) por un
    // default configurado en BD — primero por (ModuloERP, Seccion) exacto,
    // luego por ModuloERP genérico. Si no hay ninguna fila o falla la
    // consulta, se usa cfg.moduloDefecto (si la página lo declaró); si
    // tampoco hay eso, el Módulo queda totalmente libre para que el usuario
    // escoja (se preselecciona el primero de la lista, sin intención de
    // negocio detrás).
    let moduloPreferido = cfg.moduloDefecto || null;
    if (cfg.moduloErp) {
      try {
        const seccionActual = (typeof cfg.obtenerSeccion === 'function') ? cfg.obtenerSeccion() : (cfg.seccion || null);
        const qs = new URLSearchParams({ moduloErp: cfg.moduloErp });
        if (seccionActual) qs.set('seccion', seccionActual);
        const respDefecto = await fetch(`/tickets/api/modulo-defecto?${qs.toString()}`);
        const dataDefecto = await respDefecto.json();
        if (respDefecto.ok && dataDefecto?.modulo) moduloPreferido = dataDefecto.modulo;
      } catch (e) { /* se mantiene cfg.moduloDefecto (o null) */ }
    }

    try {
      const resp = await fetch('/tickets/api/modulos');
      const modulos = await resp.json();
      const lista = (resp.ok && Array.isArray(modulos) && modulos.length) ? modulos : (moduloPreferido ? [moduloPreferido] : []);
      if (!lista.length) {
        selModulo.innerHTML = '<option value="">— Sin módulos configurados —</option>';
      } else {
        selModulo.innerHTML = lista.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
        selModulo.value = (moduloPreferido && lista.includes(moduloPreferido)) ? moduloPreferido : lista[0];
      }
    } catch (e) {
      if (moduloPreferido) {
        selModulo.innerHTML = `<option value="${esc(moduloPreferido)}">${esc(moduloPreferido)}</option>`;
        selModulo.value = moduloPreferido;
      } else {
        selModulo.innerHTML = '<option value="">— Sin módulos configurados —</option>';
      }
    }

    aplicarEstadoSegunModulo();
    cargarMotivos(selModulo.value);

    try {
      const resp = await fetch(`/tickets/api/usuario-info?usuario=${encodeURIComponent(cfg.usuarioId)}`);
      const data = await resp.json();
      if (resp.ok) document.getElementById('tkb-telefono').value = data.telefono || '';
    } catch (e) { /* el teléfono es solo una comodidad; si falla, queda vacío y editable */ }
  }

  function cerrar() {
    document.getElementById('tkb-overlay').classList.remove('tkb-open');
    cerrarListaRecibos();
  }

  // ── Módulo / Regional / Operación ───────────────────────────────────────
  function aplicarEstadoSegunModulo() {
    const modulo = document.getElementById('tkb-modulo').value;
    const esServicios = modulo === 'Servicios';
    const selRegional = document.getElementById('tkb-regional');
    const selOperacion = document.getElementById('tkb-operacion');
    const wrapContexto = document.getElementById('tkb-recibo-contexto-wrap');
    const wrapSelect = document.getElementById('tkb-recibo-select-wrap');

    const hayContexto = esServicios && !!contexto;

    wrapContexto.style.display = hayContexto ? 'block' : 'none';
    wrapSelect.style.display = (esServicios && !hayContexto) ? 'block' : 'none';

    if (hayContexto) {
      document.getElementById('tkb-recibo-contexto').value = contexto.consecutivo || contexto.idRecibo || '';
    }

    selRegional.disabled = false;
    selOperacion.disabled = false;

    if (hayContexto && contexto.operacion) {
      const op = contexto.operacion;
      const regionalDelOp = Object.keys(cfg.opsPorRegional || {}).find((reg) => (cfg.opsPorRegional[reg] || []).includes(op)) || '';
      if (regionalDelOp) {
        selRegional.value = regionalDelOp;
        selOperacion.innerHTML = (cfg.opsPorRegional[regionalDelOp] || [])
          .map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
        selOperacion.value = op;
      } else {
        selOperacion.innerHTML = `<option value="${esc(op)}">${esc(op)}</option>`;
        selOperacion.value = op;
      }
      selRegional.disabled = true;
      selOperacion.disabled = true;
    } else if (!selRegional.value) {
      // Primera carga sin contexto: dejar los selects listos para elegir
      selRegional.innerHTML = '<option value="">— Seleccione Regional —</option>' +
        (cfg.regionalesFiltro || []).map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
      selOperacion.innerHTML = '<option value="">— Seleccione primero la Regional —</option>';
    }

    if (esServicios && !hayContexto) {
      refrescarRecibosDisponibles();
    } else {
      resetearReciboCombobox('— Seleccione primero la Operación —');
    }
  }

  function onModuloChange() {
    aplicarEstadoSegunModulo();
    cargarMotivos(document.getElementById('tkb-modulo').value);
  }

  function onRegionalChange() {
    const reg = document.getElementById('tkb-regional').value;
    const selOp = document.getElementById('tkb-operacion');
    const opciones = (cfg.opsPorRegional && cfg.opsPorRegional[reg]) || [];
    selOp.innerHTML = '<option value="">— Seleccione Operación —</option>' +
      opciones.map((op) => `<option value="${esc(op)}">${esc(op)}</option>`).join('');
    onOperacionChange();
  }

  function onOperacionChange() {
    refrescarRecibosDisponibles();
  }

  async function refrescarRecibosDisponibles() {
    const modulo = document.getElementById('tkb-modulo').value;
    if (modulo !== 'Servicios' || contexto) return; // el bloque ni se muestra en ese caso

    const operacion = document.getElementById('tkb-operacion').value;
    if (!operacion) {
      resetearReciboCombobox('— Seleccione primero la Operación —');
      return;
    }
    if (!cfg.recibosRecientesUrl) {
      resetearReciboCombobox('No disponible desde este módulo');
      return;
    }

    establecerEstadoCargandoRecibos('Cargando recibos...');
    try {
      const url = `${cfg.recibosRecientesUrl}?usuario=${encodeURIComponent(cfg.usuarioId)}&operacion=${encodeURIComponent(operacion)}`;
      const resp = await fetch(url);
      const rows = await resp.json();
      if (resp.ok && Array.isArray(rows)) {
        if (rows.length) {
          establecerRecibosDisponibles(rows);
        } else {
          resetearReciboCombobox('Sin recibos en los últimos 30 días');
        }
      } else {
        resetearReciboCombobox('No se pudieron cargar los recibos');
      }
    } catch (e) {
      resetearReciboCombobox('Error al cargar recibos');
    }
  }

  // ── Motivo: desplegable si el módulo tiene catálogo, texto libre si no ──
  async function cargarMotivos(modulo) {
    const wrap = document.getElementById('tkb-motivo-wrap');
    wrap.innerHTML = '<select id="tkb-motivo"><option value="">Cargando...</option></select>';
    if (!modulo) return;
    try {
      const resp = await fetch(`/tickets/api/motivos?modulo=${encodeURIComponent(modulo)}`);
      const motivos = await resp.json();
      if (resp.ok && Array.isArray(motivos) && motivos.length) {
        wrap.innerHTML = '<select id="tkb-motivo"><option value="">— Seleccione un motivo —</option>' +
          motivos.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('') + '</select>';
      } else {
        wrap.innerHTML = '<input type="text" id="tkb-motivo" placeholder="Este módulo aún no tiene motivos configurados — descríbalo aquí">';
      }
    } catch (e) {
      wrap.innerHTML = '<input type="text" id="tkb-motivo" placeholder="Describa el motivo">';
    }
  }

  // ── Guardar ──────────────────────────────────────────────────────────────
  async function guardar() {
    const modulo = document.getElementById('tkb-modulo').value;
    const operacion = document.getElementById('tkb-operacion').value;
    const motivo = (document.getElementById('tkb-motivo').value || '').trim();
    const descripcion = document.getElementById('tkb-descripcion').value.trim();
    const telefono = document.getElementById('tkb-telefono').value.trim();
    const evidenciaInput = document.getElementById('tkb-evidencia');

    const esServicios = modulo === 'Servicios';
    const idRecibo = (esServicios && contexto) ? contexto.idRecibo : (esServicios ? document.getElementById('tkb-recibo-select').value : '');

    if (!modulo) return alert('Seleccione el Módulo.');
    if (!operacion) return alert('Seleccione la Operación.');
    if (!motivo) return alert('El Motivo es obligatorio.');
    if (!descripcion) return alert('La Descripción es obligatoria.');

    const btn = document.getElementById('tkb-guardar');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
      const fd = new FormData();
      fd.append('usuario', cfg.usuarioId);
      fd.append('modulo', modulo);
      fd.append('operacion', operacion);
      fd.append('motivo', motivo);
      fd.append('idrecibo', idRecibo || '');
      fd.append('descripcion', descripcion);
      fd.append('telefono', telefono);
      if (evidenciaInput.files[0]) fd.append('evidencia', evidenciaInput.files[0]);

      const resp = await fetch('/tickets/api/crear', { method: 'POST', body: fd });
      const data = await resp.json();
      if (resp.ok && data.ok) {
        cerrar();
        misTickets = null;
        alert(`Ticket creado correctamente: ${data.ticket}`);
        if (typeof cfg.alCrear === 'function') cfg.alCrear(data.ticket);
      } else {
        alert('Error: ' + (data.error || 'No se pudo crear el ticket.'));
      }
    } catch (e) {
      alert('Error de conexión al crear el ticket.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Crear Ticket';
    }
  }

  // ── Mis tickets (quincena actual) ─────────────────────────────────────────
  // Tickets que puso el usuario en la quincena actual, de cualquier módulo. Se pueden editar
  // (lápiz) mientras estén En Proceso o Pendiente; en los otros estados solo se ven.
  // Para otros periodos, el enlace lleva a la pestaña Tickets del Directorio corporativo.
  let misTickets = null;          // respuesta de /tickets/api/mis-tickets
  let misFiltroEstado = '';
  let misVista = { tipo: 'lista', ticket: null };

  const COLOR_ESTADO = {
    'en proceso': ['#dbeafe', '#1d4ed8'],
    'pendiente': ['#fef3c7', '#b45309'],
    'resuelto': ['#dcfce7', '#15803d'],
    'rechazado': ['#fee2e2', '#b91c1c']
  };
  function badgeEstado(estado) {
    const [fondo, color] = COLOR_ESTADO[String(estado || '').toLowerCase()] || ['#f1f5f9', '#475569'];
    return `<span class="tkb-estado" style="background:${fondo};color:${color};">${esc(estado || 'Sin estado')}</span>`;
  }

  function mostrarPestana(tab) {
    const overlay = document.getElementById('tkb-overlay');
    overlay.querySelectorAll('[data-tkb-tab]').forEach(b => b.classList.toggle('tkb-tab-activa', b.dataset.tkbTab === tab));
    const esMis = tab === 'mis';
    document.getElementById('tkb-form').style.display = esMis ? 'none' : '';
    document.getElementById('tkb-panel-mis').style.display = esMis ? '' : 'none';
    document.getElementById('tkb-footer-nuevo').style.display = esMis ? 'none' : '';
    document.getElementById('tkb-footer-mis').style.display = esMis ? '' : 'none';
    document.getElementById('tkb-link-historial').href =
      `/directorio-corporativo?usuario=${encodeURIComponent(cfg.usuarioId)}&tab=tickets`;
    if (esMis) {
      misVista = { tipo: 'lista', ticket: null };
      if (misTickets) renderMis(); else cargarMisTickets(true);
    }
  }

  async function cargarMisTickets(pintar) {
    const panel = document.getElementById('tkb-panel-mis');
    if (pintar) panel.innerHTML = '<div class="tkb-vacio">Cargando tus tickets...</div>';
    try {
      const r = await fetch(`/tickets/api/mis-tickets?usuario=${encodeURIComponent(cfg.usuarioId)}`);
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'No se pudieron cargar tus tickets.');
      misTickets = data;
      const abiertos = data.tickets.filter(t => ['en proceso', 'pendiente'].includes(String(t.estado || '').toLowerCase())).length;
      const badge = document.getElementById('tkb-mis-badge');
      badge.textContent = abiertos;
      badge.style.display = abiertos ? '' : 'none';
      if (pintar || document.getElementById('tkb-panel-mis').style.display !== 'none') renderMis();
    } catch (e) {
      if (pintar) panel.innerHTML = `<div class="tkb-vacio tkb-error">${esc(e.message)}</div>`;
    }
  }

  function renderMis() {
    const panel = document.getElementById('tkb-panel-mis');
    if (!misTickets) return;
    if (misVista.tipo === 'detalle') return renderDetalle(misVista.ticket);
    if (misVista.tipo === 'editar') return renderEditar(misVista.ticket);
    const { quincena, tickets, porEstado, total } = misTickets;
    const estados = ['En Proceso', 'Pendiente', 'Resuelto', 'Rechazado'];
    Object.keys(porEstado).forEach(e => { if (!estados.includes(e)) estados.push(e); });
    const chip = (valor, texto, n) => `<button type="button" class="tkb-chip ${misFiltroEstado === valor ? 'tkb-chip-activo' : ''}" data-tkb-filtro="${esc(valor)}"><b>${n}</b> ${esc(texto)}</button>`;
    const lista = misFiltroEstado ? tickets.filter(t => t.estado === misFiltroEstado) : tickets;
    panel.innerHTML = `
      <div class="tkb-quincena">Quincena actual: <b>${esc(quincena.nombre)}</b> <span>(${esc(quincena.desde)} a ${esc(quincena.hasta)})</span></div>
      <div class="tkb-chips">
        ${chip('', 'Total', total)}
        ${estados.map(e => chip(e, e, porEstado[e] || 0)).join('')}
      </div>
      ${lista.length ? lista.map(t => `
        <div class="tkb-item" data-tkb-ver="${esc(t.ticket)}" role="button" tabindex="0">
          <div class="tkb-item-top">
            <span class="tkb-item-id">#${esc(t.ticket)}</span>
            ${badgeEstado(t.estado)}
            <span class="tkb-item-fecha">${esc(t.fechaRegistro || '')}</span>
            ${t.puedeEditar ? `<button type="button" class="tkb-lapiz" data-tkb-editar="${esc(t.ticket)}" title="Editar ticket" aria-label="Editar ticket">✏️</button>` : ''}
          </div>
          <div class="tkb-item-meta">${esc(t.modulo)} · ${esc(t.operacion || '—')}</div>
          <div class="tkb-item-motivo">${esc(t.motivo || '')}</div>
          <div class="tkb-item-desc">${esc(t.descripcion || '')}</div>
        </div>`).join('') : `<div class="tkb-vacio">${total ? 'No hay tickets con ese estado.' : 'No has puesto tickets en esta quincena.'}</div>`}`;
  }

  function buscarTicket(id) {
    return (misTickets && misTickets.tickets.find(t => t.ticket === id)) || null;
  }

  function renderDetalle(t) {
    const panel = document.getElementById('tkb-panel-mis');
    const fila = (etq, val) => val ? `<div class="tkb-det-fila"><span>${etq}</span><div>${val}</div></div>` : '';
    panel.innerHTML = `
      <div class="tkb-det-acciones">
        <button type="button" class="tkb-volver" data-tkb-volver="1">← Volver</button>
        ${t.puedeEditar ? `<button type="button" class="tkb-btn-secundario" data-tkb-editar="${esc(t.ticket)}">✏️ Editar</button>` : ''}
      </div>
      <div class="tkb-det-titulo">#${esc(t.ticket)} ${badgeEstado(t.estado)}</div>
      ${fila('Fecha', esc(t.fechaRegistro))}
      ${fila('Módulo', esc(t.modulo))}
      ${fila('Operación', esc(t.operacion))}
      ${fila('Recibo', esc(t.idrecibo))}
      ${fila('Motivo', esc(t.motivo))}
      ${fila('Descripción', esc(t.descripcion).replace(/\n/g, '<br>'))}
      ${fila('Teléfono', esc(t.telefono))}
      ${fila('Evidencia', t.evidencia ? `<a href="${esc(t.evidencia)}" target="_blank" rel="noopener">Ver archivo</a>` : '')}
      ${fila('Observaciones', esc(t.observaciones).replace(/\n/g, '<br>'))}
      ${fila('Finalizado', esc(t.fechaFinalizacion))}
      ${t.puedeEditar ? '' : '<div class="tkb-nota">Solo se puede editar mientras esté En Proceso o Pendiente.</div>'}`;
  }

  async function renderEditar(t) {
    const panel = document.getElementById('tkb-panel-mis');
    panel.innerHTML = `
      <div class="tkb-det-acciones"><button type="button" class="tkb-volver" data-tkb-volver="1">← Volver</button></div>
      <div class="tkb-det-titulo">Editar ticket #${esc(t.ticket)} ${badgeEstado(t.estado)}</div>
      <div class="tkb-group"><label>Motivo</label><div id="tkb-ed-motivo-wrap"><input type="text" id="tkb-ed-motivo" value="${esc(t.motivo || '')}"></div></div>
      <div class="tkb-group"><label>Descripción *</label><textarea id="tkb-ed-descripcion" rows="4">${esc(t.descripcion || '')}</textarea></div>
      <div class="tkb-group"><label>Teléfono de contacto</label><input type="text" id="tkb-ed-telefono" value="${esc(t.telefono || '')}"></div>
      <div class="tkb-det-acciones" style="justify-content:flex-end;">
        <button type="button" class="tkb-btn-secundario" data-tkb-volver="1">Cancelar</button>
        <button type="button" class="tkb-btn-primario" data-tkb-guardar-edicion="${esc(t.ticket)}">Guardar cambios</button>
      </div>`;
    try {
      const r = await fetch(`/tickets/api/motivos?modulo=${encodeURIComponent(t.modulo)}`);
      const motivos = await r.json();
      if (r.ok && Array.isArray(motivos) && motivos.length && document.getElementById('tkb-ed-motivo-wrap')) {
        const lista = motivos.includes(t.motivo) || !t.motivo ? motivos : [t.motivo, ...motivos];
        document.getElementById('tkb-ed-motivo-wrap').innerHTML = '<select id="tkb-ed-motivo">' +
          lista.map(m => `<option value="${esc(m)}"${m === t.motivo ? ' selected' : ''}>${esc(m)}</option>`).join('') + '</select>';
      }
    } catch (e) { /* queda el campo de texto */ }
  }

  async function guardarEdicion(id, btn) {
    const motivo = (document.getElementById('tkb-ed-motivo').value || '').trim();
    const descripcion = document.getElementById('tkb-ed-descripcion').value.trim();
    const telefono = document.getElementById('tkb-ed-telefono').value.trim();
    if (!descripcion) return alert('La Descripción es obligatoria.');
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    try {
      const r = await fetch(`/tickets/api/ticket/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: cfg.usuarioId, motivo, descripcion, telefono })
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'No se pudo guardar.');
      const i = misTickets.tickets.findIndex(t => t.ticket === id);
      if (i >= 0) misTickets.tickets[i] = data.ticket;
      misVista = { tipo: 'detalle', ticket: data.ticket };
      renderMis();
    } catch (e) {
      alert(e.message);
      btn.disabled = false;
      btn.textContent = 'Guardar cambios';
    }
  }

  function onClickMis(ev) {
    const filtro = ev.target.closest('[data-tkb-filtro]');
    if (filtro) { misFiltroEstado = filtro.dataset.tkbFiltro; return renderMis(); }
    const editar = ev.target.closest('[data-tkb-editar]');
    if (editar) {
      ev.stopPropagation();
      const t = buscarTicket(editar.dataset.tkbEditar);
      if (t) { misVista = { tipo: 'editar', ticket: t }; renderMis(); }
      return;
    }
    const guardarEd = ev.target.closest('[data-tkb-guardar-edicion]');
    if (guardarEd) return guardarEdicion(guardarEd.dataset.tkbGuardarEdicion, guardarEd);
    if (ev.target.closest('[data-tkb-volver]')) {
      misVista = misVista.tipo === 'editar' && misVista.ticket ? { tipo: 'detalle', ticket: buscarTicket(misVista.ticket.ticket) || misVista.ticket } : { tipo: 'lista', ticket: null };
      return renderMis();
    }
    const ver = ev.target.closest('[data-tkb-ver]');
    if (ver) {
      const t = buscarTicket(ver.dataset.tkbVer);
      if (t) { misVista = { tipo: 'detalle', ticket: t }; renderMis(); }
    }
  }

  // ── Botón movible ──
  // Se puede arrastrar con el dedo (o el mouse) para que no tape acciones del formulario.
  // Al soltarlo se pega al borde izquierdo o derecho más cercano. La posición no se guarda:
  // cada vez que se abre la página vuelve a la esquina inferior derecha.
  function hacerMovible(boton) {
    const UMBRAL = 8;   // px que hay que mover para que cuente como arrastre y no como toque
    const MARGEN = 8;
    let inicio = null;

    const limitar = (x, y) => {
      const w = boton.offsetWidth, h = boton.offsetHeight;
      return [
        Math.min(Math.max(MARGEN, x), window.innerWidth - w - MARGEN),
        Math.min(Math.max(MARGEN, y), window.innerHeight - h - MARGEN)
      ];
    };
    const ubicar = (x, y) => {
      const [lx, ly] = limitar(x, y);
      boton.style.left = lx + 'px';
      boton.style.top = ly + 'px';
      boton.style.right = 'auto';
      boton.style.bottom = 'auto';
    };

    boton.addEventListener('pointerdown', (ev) => {
      if (ev.button !== undefined && ev.button !== 0) return;
      const r = boton.getBoundingClientRect();
      inicio = { px: ev.clientX, py: ev.clientY, x: r.left, y: r.top, moviendo: false, id: ev.pointerId };
      // Captura desde el inicio: si el dedo sale rápido del botón, se sigue recibiendo el movimiento
      try { boton.setPointerCapture(ev.pointerId); } catch (e) { /* sin captura */ }
    });
    boton.addEventListener('pointermove', (ev) => {
      if (!inicio || ev.pointerId !== inicio.id) return;
      const dx = ev.clientX - inicio.px, dy = ev.clientY - inicio.py;
      if (!inicio.moviendo) {
        if (Math.hypot(dx, dy) < UMBRAL) return;
        inicio.moviendo = true;
        boton.classList.add('tkb-arrastrando');
      }
      ev.preventDefault();
      ubicar(inicio.x + dx, inicio.y + dy);
    });
    const soltar = (ev) => {
      if (!inicio || (ev && ev.pointerId !== inicio.id)) return;
      if (inicio.moviendo) {
        boton._arrastrado = true;   // el "click" que sigue no abre el formulario
        setTimeout(() => { boton._arrastrado = false; }, 350);
        boton.classList.remove('tkb-arrastrando');
        const r = boton.getBoundingClientRect();
        const alBordeDerecho = r.left + r.width / 2 > window.innerWidth / 2;
        const x = alBordeDerecho ? window.innerWidth - r.width - 16 : 16;
        boton.classList.add('tkb-pegando');
        ubicar(x, r.top);
        setTimeout(() => boton.classList.remove('tkb-pegando'), 250);
      }
      inicio = null;
    };
    boton.addEventListener('pointerup', soltar);
    boton.addEventListener('pointercancel', soltar);

    // Si cambia el tamaño de la pantalla (girar el celular), que no quede por fuera
    window.addEventListener('resize', () => {
      if (!boton.style.left) return;
      const r = boton.getBoundingClientRect();
      ubicar(r.left, r.top);
    });
  }

  // Si el módulo no entrega las operaciones, se consultan las activas para el formulario
  async function cargarOperacionesSiFaltan() {
    if (cfg.opsPorRegional && Object.keys(cfg.opsPorRegional).length) return;
    try {
      const r = await fetch(`/tickets/api/operaciones?usuario=${encodeURIComponent(cfg.usuarioId)}`);
      const data = await r.json();
      if (data && data.ok && data.opsPorRegional) {
        cfg.opsPorRegional = data.opsPorRegional;
        cfg.regionalesFiltro = Object.keys(data.opsPorRegional);
      }
    } catch (e) {
      console.warn('[ticket-boton] No se pudieron cargar las operaciones:', e.message);
    }
  }

  window.initBotonTicket = function initBotonTicket(opciones) {
    if (!opciones || !opciones.usuarioId) {
      console.error('[ticket-boton] initBotonTicket requiere usuarioId.');
      return;
    }
    cfg = {
      opsPorRegional: {},
      regionalesFiltro: [],
      ...opciones
    };
    cargarCSS();
    crearMarkup();
    document.getElementById('tkb-boton').classList.add('tkb-visible');
    yaInicializado = true;
    cargarOperacionesSiFaltan();
  };
})();
