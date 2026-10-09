/**
 * Botón flotante "+ Ticket" compartido entre módulos (Dynamic_Tickets).
 * Cada página lo activa una vez cargado el DOM:
 *
 *   initBotonTicket({
 *     moduloDefecto: 'Servicios',        // módulo preseleccionado (editable)
 *     usuarioId: CONFIG.usuario,
 *     opsPorRegional: CONFIG.opsPorRegional,
 *     regionalesFiltro: CONFIG.regionalesFiltro,
 *     obtenerContexto: miFuncion,        // opcional — ver abajo
 *     recibosRecientesUrl: '/facturacion/api/tickets/recibos-recientes' // opcional
 *   });
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

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
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
              <label>Consecutivo Recibo (opcional)</label>
              <select id="tkb-recibo-select"><option value="">— Seleccione primero la Operación —</option></select>
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
  }

  // ── Apertura / cierre ──────────────────────────────────────────────────
  async function abrir() {
    document.getElementById('tkb-form').reset();

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

    try {
      const resp = await fetch('/tickets/api/modulos');
      const modulos = await resp.json();
      const lista = (resp.ok && Array.isArray(modulos) && modulos.length) ? modulos : [cfg.moduloDefecto];
      selModulo.innerHTML = lista.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
      selModulo.value = lista.includes(cfg.moduloDefecto) ? cfg.moduloDefecto : lista[0];
    } catch (e) {
      selModulo.innerHTML = `<option value="${esc(cfg.moduloDefecto)}">${esc(cfg.moduloDefecto)}</option>`;
      selModulo.value = cfg.moduloDefecto;
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
      document.getElementById('tkb-recibo-select').innerHTML = '<option value="">— Seleccione primero la Operación —</option>';
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
    const selRecibo = document.getElementById('tkb-recibo-select');
    if (modulo !== 'Servicios' || contexto) return; // el bloque ni se muestra en ese caso

    const operacion = document.getElementById('tkb-operacion').value;
    if (!operacion) {
      selRecibo.innerHTML = '<option value="">— Seleccione primero la Operación —</option>';
      return;
    }
    if (!cfg.recibosRecientesUrl) {
      selRecibo.innerHTML = '<option value="">No disponible desde este módulo</option>';
      return;
    }

    selRecibo.innerHTML = '<option value="">Cargando recibos...</option>';
    try {
      const url = `${cfg.recibosRecientesUrl}?usuario=${encodeURIComponent(cfg.usuarioId)}&operacion=${encodeURIComponent(operacion)}`;
      const resp = await fetch(url);
      const rows = await resp.json();
      if (resp.ok && Array.isArray(rows)) {
        selRecibo.innerHTML = rows.length
          ? ('<option value="">— Seleccione un recibo —</option>' + rows.map((r) => `<option value="${esc(r.idRecibo)}">${esc(r.consecutivo || r.idRecibo)}</option>`).join(''))
          : '<option value="">Sin recibos en los últimos 30 días</option>';
      } else {
        selRecibo.innerHTML = '<option value="">No se pudieron cargar los recibos</option>';
      }
    } catch (e) {
      selRecibo.innerHTML = '<option value="">Error al cargar recibos</option>';
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
    if (!opciones || !opciones.moduloDefecto || !opciones.usuarioId) {
      console.error('[ticket-boton] initBotonTicket requiere moduloDefecto y usuarioId.');
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
