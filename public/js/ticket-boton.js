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
          <span>🎫 Nuevo Ticket</span>
          <button type="button" class="tkb-close" id="tkb-cerrar-x">&times;</button>
        </div>
        <div class="tkb-body">
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
        <div class="tkb-footer">
          <button type="button" class="tkb-btn-secundario" id="tkb-cancelar">Cancelar</button>
          <button type="button" class="tkb-btn-primario" id="tkb-guardar">Crear Ticket</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    boton.addEventListener('click', abrir);
    document.getElementById('tkb-cerrar-x').addEventListener('click', cerrar);
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
  };
})();
