/**
 * contabilidad-consignaciones.js
 * Lógica frontend para el módulo de Contabilidad — Pestaña Consignaciones
 */

(function () {
  'use strict';

  // Base URL para archivos históricos de AppSheet
  const URL_APPSHEET_CONSIGNACIONES = 'https://www.appsheet.com/template/gettablefileurl?appName=Control-661901843&tableName=Consignaciones&fileName=';

  // Resuelve la URL de la foto o comprobante (soporta URLs completas de GCS y rutas relativas de AppSheet)
  function resolverUrlSoporte(ruta) {
    const r = String(ruta || '').trim();
    if (!r || /^unable to load/i.test(r) || /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(r)) return '';
    if (/^https?:\/\//i.test(r)) return r;
    if (/^gs:\/\//i.test(r)) return 'https://storage.googleapis.com/' + r.slice(5);
    return URL_APPSHEET_CONSIGNACIONES + encodeURIComponent(r);
  }

  // Variables globales
  let usuario = null;
  let estadoUsuario = null;
  let estadoTickets = null; // estado sin recortar (el botón de tickets usa todas las operaciones del usuario)
  let todosLosRegistros = [];
  let registrosFiltrados = [];
  const seleccionConsig = new Set(); // "día|operación" seleccionados para validar de forma masiva
  const claveConsig = (item) => `${item.dia}|${item.operacion}`;
  const esSeleccionableConsig = (item) => Boolean(item.comprobante);
  let archivoSoporteSeleccionado = null;
  let sortState = { col: 'dia', order: 'desc' };

  // Variables de zoom y rotación del visor
  let visorZoom = 1;
  let visorRotacion = 0;
  let itemVisorActual = null;

  // Elementos DOM
  const dom = {
    // Sidebar
    sidebar: document.getElementById('sidebar'),
    sidebarUser: document.getElementById('sidebarUser'),
    mobileBackdrop: document.getElementById('mobile-backdrop'),

    // KPIs compactos
    kpiTotalEfectivo: document.getElementById('kpiTotalEfectivo'),
    kpiTotalConsignado: document.getElementById('kpiTotalConsignado'),
    kpiSaldoPendiente: document.getElementById('kpiSaldoPendiente'),
    kpiTotalRegistros: document.getElementById('kpiTotalRegistros'),

    // Filtros
    filtrosToggle: document.getElementById('filtrosToggle'),
    filtrosChevron: document.getElementById('filtrosChevron'),
    filtrosBadge: document.getElementById('filtrosBadge'),
    filtrosBody: document.getElementById('filtrosBody'),
    filtroAnio: document.getElementById('filtroAnio'),
    filtroQuincena: document.getElementById('filtroQuincena'),
    filtroDia: document.getElementById('filtroDia'),
    filtroRegional: document.getElementById('filtroRegional'),
    filtroOperacion: document.getElementById('filtroOperacion'),
    grupoSelectOperacion: document.getElementById('grupoSelectOperacion'),
    contenedorChipsOperacion: document.getElementById('contenedorChipsOperacion'),
    chipsOperacionBar: document.getElementById('chipsOperacionBar'),
    filtroFase: document.getElementById('filtroFase'),
    filtroBusqueda: document.getElementById('filtroBusqueda'),
    conteoVisible: document.getElementById('conteoVisible'),
    conteoTotal: document.getElementById('conteoTotal'),

    // Tabla
    tablaConsignaciones: document.getElementById('tablaConsignaciones'),
    tbodyConsignaciones: document.getElementById('tbodyConsignaciones'),

    // Modal Consignación
    modalConsignacion: document.getElementById('modalConsignacion'),
    modalTitulo: document.getElementById('modalTitulo'),
    modalSubtitulo: document.getElementById('modalSubtitulo'),
    modalServiciosInfo: document.getElementById('modalServiciosInfo'),
    modalEfectivoVal: document.getElementById('modalEfectivoVal'),
    formConsignacion: document.getElementById('formConsignacion'),
    formDia: document.getElementById('formDia'),
    formOperacion: document.getElementById('formOperacion'),
    formBanco: document.getElementById('formBanco'),
    formCuenta: document.getElementById('formCuenta'),
    formComprobante: document.getElementById('formComprobante'),
    formFechaConsignacion: document.getElementById('formFechaConsignacion'),
    formValorConsignado: document.getElementById('formValorConsignado'),
    formFotoFile: document.getElementById('formFotoFile'),
    formFotoCamara: document.getElementById('formFotoCamara'),
    contenedorFotoActual: document.getElementById('contenedorFotoActual'),
    formFotoActualTexto: document.getElementById('formFotoActualTexto'),
    btnEliminarFotoModal: document.getElementById('btnEliminarFotoModal'),
    formObservaciones: document.getElementById('formObservaciones'),
    grupoValidadoContenedor: document.getElementById('grupoValidadoContenedor'),
    formValidado: document.getElementById('formValidado'),
    infoValidadoPrevio: document.getElementById('infoValidadoPrevio'),
    modalErrorMsg: document.getElementById('modalErrorMsg'),
    btnGuardarConsignacion: document.getElementById('btnGuardarConsignacion'),
    btnGuardarTexto: document.getElementById('btnGuardarTexto'),

    // Visor
    modalVisor: document.getElementById('modalVisor'),
    visorTitulo: document.getElementById('visorTitulo'),
    visorToolbar: document.getElementById('visorToolbar'),
    visorContent: document.getElementById('visorContent'),
    btnDescargarSoporte: document.getElementById('btnDescargarSoporte'),
    visorValidacionContenedor: document.getElementById('visorValidacionContenedor'),
    visorValidadoBadge: document.getElementById('visorValidadoBadge'),
    btnVisorValidar: document.getElementById('btnVisorValidar'),
    btnVisorEliminarFoto: document.getElementById('btnVisorEliminarFoto'),
    btnVisorEditar: document.getElementById('btnVisorEditar'),

    // Modal Servicios Asociados
    modalServiciosAsociados: document.getElementById('modalServiciosAsociados'),
    serviciosAsociadosTitulo: document.getElementById('serviciosAsociadosTitulo'),
    serviciosAsociadosSubtitulo: document.getElementById('serviciosAsociadosSubtitulo'),
    serviciosAsociadosTotalPago: document.getElementById('serviciosAsociadosTotalPago'),
    tbodyServiciosAsociados: document.getElementById('tbodyServiciosAsociados'),
  };

  // Formateador de moneda en pesos colombianos
  function formatearMoneda(valor) {
    const num = Math.round(Number(valor) || 0);
    return '$ ' + num.toLocaleString('es-CO');
  }

  // Formateador de fecha legible
  function formatearFechaLegible(fechaStr) {
    if (!fechaStr) return '-';
    try {
      const partes = fechaStr.split('-');
      if (partes.length === 3) {
        const d = new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10));
        const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${dias[d.getDay()]}, ${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
      }
    } catch (e) {}
    return fechaStr;
  }

  // Obtener usuario de la sesión
  function obtenerUsuario() {
    const params = new URLSearchParams(window.location.search);
    const u = params.get('usuario') || localStorage.getItem('usuario_logyser');
    if (!u) {
      alert('Error: No se encontró el usuario en la sesión.');
      window.location.href = '/';
      return null;
    }
    return u;
  }

  // Control móvil del sidebar
  window.toggleMobileSidebar = function () {
    if (dom.sidebar) dom.sidebar.classList.toggle('open');
    if (dom.mobileBackdrop) dom.mobileBackdrop.classList.toggle('open');
  };

  // Abrir perfil corporativo (integrado con app-launcher-profile)
  window.abrirPerfilCorporativo = function () {
    const trigger = document.querySelector('.alp-profile-trigger');
    if (trigger) {
      trigger.click();
    } else if (typeof window.abrirPerfilNomina === 'function') {
      window.abrirPerfilNomina();
    } else if (typeof window.abrirModalPerfil === 'function') {
      window.abrirModalPerfil();
    }
  };

  // Botón flotante de Tickets (Dynamic_Tickets)
  function inicializarBotonTicket() {
    const activar = () => {
      const est = estadoTickets || estadoUsuario;
      if (typeof window.initBotonTicket === 'function' && est) {
        window.initBotonTicket({
          moduloErp: 'contabilidad',
          usuarioId: usuario,
          opsPorRegional: est.opsPorRegional || {},
          regionalesFiltro: est.regionales || [],
          seccion: 'Consignaciones',
        });
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', activar);
    } else {
      activar();
    }
  }

  // Iconos SVG para la zona interactiva de archivos
  const ICONO_SUBIR = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="display:block; margin:0 auto 6px;"><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"></path><polyline points="7 9 12 4 17 9"></polyline><line x1="12" y1="4" x2="12" y2="16"></line></svg>';
  const ICONO_CLIP = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>';
  const ICONO_CAMARA = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>';

  // Montar zonas de archivo (Idéntico a Facturación e Inventario)
  function montarZonasArchivoConsignacion() {
    document.querySelectorAll('.zona-archivo[data-input]').forEach(zona => {
      if (zona.dataset.montada) return;
      zona.dataset.montada = '1';
      const id = zona.dataset.input;
      const input = document.getElementById(id);
      if (!input) return;

      zona.innerHTML = `
        <div class="zona-archivo-caja" style="border:2px dashed var(--border); border-radius:8px; padding:14px; text-align:center; background:var(--bg-elevated); transition: border-color .15s, background-color .15s; cursor:pointer;">
          <div class="zona-archivo-placeholder">
            ${ICONO_SUBIR}
            <div style="font-size:0.78rem; color: var(--text-muted); margin-bottom:8px;">Arrastra una foto o archivo aquí o elige una opción</div>
            <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
              <button type="button" class="zona-archivo-btn" data-accion="archivo">${ICONO_CLIP} Elegir archivo</button>
              <button type="button" class="zona-archivo-btn" data-accion="camara">${ICONO_CAMARA} Tomar foto</button>
            </div>
          </div>
          <div class="zona-archivo-preview" style="display:none;"></div>
        </div>`;

      const caja = zona.querySelector('.zona-archivo-caja');
      caja.addEventListener('click', e => {
        const btn = e.target.closest('[data-accion]');
        if (btn && btn.dataset.accion === 'camara') {
          e.stopPropagation();
          tomarFotoConsignacion();
          return;
        }
        if (btn && btn.dataset.accion === 'quitar') {
          e.stopPropagation();
          input.value = '';
          archivoSoporteSeleccionado = null;
          actualizarZonaArchivoConsignacion(id);
          return;
        }
        if (e.target.closest('a')) return;
        input.click();
      });

      input.addEventListener('change', () => {
        if (input.files && input.files[0]) {
          archivoSoporteSeleccionado = input.files[0];
        } else {
          archivoSoporteSeleccionado = null;
        }
        actualizarZonaArchivoConsignacion(id);
      });

      ['dragenter', 'dragover'].forEach(evt => caja.addEventListener(evt, e => {
        e.preventDefault(); e.stopPropagation();
        caja.style.borderColor = 'var(--accent)';
        caja.style.background = 'rgba(37, 99, 235, 0.08)';
      }));

      ['dragleave', 'drop'].forEach(evt => caja.addEventListener(evt, e => {
        e.preventDefault(); e.stopPropagation();
        caja.style.borderColor = 'var(--border)';
        caja.style.background = 'var(--bg-elevated)';
      }));

      caja.addEventListener('drop', e => {
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file || !(file.type.startsWith('image/') || file.type === 'application/pdf')) return;
        try {
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          archivoSoporteSeleccionado = file;
          actualizarZonaArchivoConsignacion(id);
        } catch (err) {}
      });
    });
  }

  function actualizarZonaArchivoConsignacion(id) {
    const zona = document.querySelector(`.zona-archivo[data-input="${id}"]`);
    const input = document.getElementById(id);
    if (!zona || !input) return;
    const placeholder = zona.querySelector('.zona-archivo-placeholder');
    const preview = zona.querySelector('.zona-archivo-preview');
    if (!preview) return;

    const file = input.files && input.files[0];
    if (preview.dataset.url) {
      URL.revokeObjectURL(preview.dataset.url);
      delete preview.dataset.url;
    }

    if (!file) {
      preview.style.display = 'none';
      preview.innerHTML = '';
      placeholder.style.display = 'block';
      return;
    }

    placeholder.style.display = 'none';
    preview.style.display = 'block';
    const quitar = '<button type="button" data-accion="quitar" style="margin-top:6px; font-size:0.74rem; color:#ef4444; background:none; border:none; cursor:pointer; text-decoration:underline; font-weight:600;">Quitar archivo</button>';

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      preview.dataset.url = url;
      preview.innerHTML = `<img src="${url}" alt="Vista previa" style="max-width:100%; max-height:160px; border-radius:6px; display:block; margin:0 auto; box-shadow: 0 1px 3px rgba(0,0,0,0.15);">${quitar}`;
    } else {
      preview.innerHTML = `<div style="font-size:0.84rem; font-weight:700; color:var(--text); word-break:break-all;">📄 ${file.name}</div>${quitar}`;
    }
  }

  function tomarFotoConsignacion() {
    if (dom.formFotoCamara) {
      dom.formFotoCamara.value = '';
      dom.formFotoCamara.click();
    }
  }

  window.onFotoCamaraConsignacion = function (camara) {
    const foto = camara.files && camara.files[0];
    if (!foto || !dom.formFotoFile) return;
    try {
      const dt = new DataTransfer();
      dt.items.add(foto);
      dom.formFotoFile.files = dt.files;
      archivoSoporteSeleccionado = foto;
      actualizarZonaArchivoConsignacion('formFotoFile');
    } catch (e) {
      alert('Este navegador no permite pasar la foto directamente. Use "Elegir archivo" y seleccione Cámara.');
    }
    camara.value = '';
  };

  // Inicialización principal
  async function inicializar() {
    usuario = obtenerUsuario();
    if (!usuario) return;

    try {
      // 1. Obtener metadatos y estado (la misma consulta que ya hizo el coordinador de pestañas)
      const est = window.__estadoContabilidad ||
        fetch(`/contabilidad/api/estado?usuario=${encodeURIComponent(usuario)}`).then(async r => ({ ok: r.ok, datos: await r.json() }));
      const { ok, datos } = await est;
      if (!ok) throw new Error(datos.error || 'Error al obtener estado');
      estadoUsuario = datos;
      // Filtros: solo las operaciones que tienen servicios en efectivo (las demás son solo crédito)
      estadoTickets = datos;
      if (typeof window.restringirEstadoContabilidad === 'function') {
        estadoUsuario = window.restringirEstadoContabilidad(datos, 'consignaciones');
      }

      // Info de usuario en sidebar
      if (dom.sidebarUser) {
        dom.sidebarUser.innerHTML = `
          <strong>${estadoUsuario.usuarioNombre || estadoUsuario.usuarioId}</strong>
          <span>${estadoUsuario.rol || 'Usuario'}</span>
          ${estadoUsuario.regional ? `<br><small style="opacity:.7">${estadoUsuario.regional}</small>` : ''}
        `;
      }

      // 2. Poblar selector de Años
      dom.filtroAnio.innerHTML = '';
      (estadoUsuario.anios || [estadoUsuario.anioActual]).forEach(a => {
        const opt = document.createElement('option');
        opt.value = a;
        opt.textContent = a;
        if (a === estadoUsuario.anioActual) opt.selected = true;
        dom.filtroAnio.appendChild(opt);
      });

      // 3. Poblar Quincenas
      poblarQuincenas(estadoUsuario.quincenas || [], estadoUsuario.quincenaActual);

      // 4. Poblar Bancos en modal
      dom.formBanco.innerHTML = '<option value="">Seleccione Banco...</option>';
      (estadoUsuario.bancos || []).forEach(b => {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = b;
        dom.formBanco.appendChild(opt);
      });

      // 5. Poblar Regionales
      dom.filtroRegional.innerHTML = '';
      if (estadoUsuario.sinFiltro || (estadoUsuario.regionales && estadoUsuario.regionales.length > 1)) {
        const optTodas = document.createElement('option');
        optTodas.value = 'TODAS';
        optTodas.textContent = 'Todas las Regionales';
        dom.filtroRegional.appendChild(optTodas);
      }
      (estadoUsuario.regionales || []).forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        dom.filtroRegional.appendChild(opt);
      });

      // 6. Configurar operaciones
      configurarOperaciones();

      // 7. Configurar eventos
      configurarEventos();

      // 8. Hacer tabla redimensionable y ordenable
      hacerTablaRedimensionable(dom.tablaConsignaciones);
      configurarOrdenamientoTabla();

      // 9. Montar zona de archivos interactiva (Estilo Facturación)
      montarZonasArchivoConsignacion();

      // 10. Inicializar botón flotante de Tickets
      inicializarBotonTicket();

      // 11. Cargar datos solo si la pestaña Consignaciones está a la vista (Formas de Pago es la
      //     pestaña por defecto y hay roles que no tienen Consignaciones)
      listoParaCargar = true;
      const vista = document.getElementById('vistaConsignaciones');
      if (vista && vista.style.display !== 'none') await window.cargarConsignacionesSiFalta();

    } catch (err) {
      console.error('[contabilidad] Error en inicializar:', err);
      dom.tbodyConsignaciones.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:30px; color:#ef4444;">${err.message}</td></tr>`;
    }
  }

  let listoParaCargar = false;
  let consignacionesCargadas = false;
  window.cargarConsignacionesSiFalta = async function () {
    if (!listoParaCargar || consignacionesCargadas) return;
    const secciones = (estadoUsuario && estadoUsuario.secciones || []).map(x => String(x).toLowerCase());
    if (secciones.length && !secciones.includes('consignaciones')) return;
    consignacionesCargadas = true;
    await cargarConsignaciones();
  };

  function poblarQuincenas(listaQuincenas, seleccionada) {
    dom.filtroQuincena.innerHTML = '';
    listaQuincenas.forEach(qObj => {
      const opt = document.createElement('option');
      opt.value = qObj.quincena;
      opt.textContent = qObj.quincena;
      if (qObj.quincena === seleccionada) opt.selected = true;
      dom.filtroQuincena.appendChild(opt);
    });
  }

  function configurarOperaciones() {
    const ops = estadoUsuario.operaciones || [];
    if (ops.length > 0 && ops.length <= 5) {
      dom.grupoSelectOperacion.style.display = 'none';
      dom.contenedorChipsOperacion.style.display = 'block';
      dom.chipsOperacionBar.innerHTML = '';

      if (ops.length > 1) {
        const chipTodas = document.createElement('button');
        chipTodas.type = 'button';
        chipTodas.className = 'op-chip active';
        chipTodas.textContent = 'Todas';
        chipTodas.dataset.op = 'TODAS';
        chipTodas.onclick = () => seleccionarChipOperacion('TODAS');
        dom.chipsOperacionBar.appendChild(chipTodas);
      }

      ops.forEach((op, idx) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `op-chip ${ops.length === 1 && idx === 0 ? 'active' : ''}`;
        chip.textContent = op;
        chip.dataset.op = op;
        chip.onclick = () => seleccionarChipOperacion(op);
        dom.chipsOperacionBar.appendChild(chip);
      });
    } else {
      dom.contenedorChipsOperacion.style.display = 'none';
      dom.grupoSelectOperacion.style.display = 'flex';
      dom.filtroOperacion.innerHTML = '<option value="TODAS">Todas las Operaciones</option>';
      ops.forEach(op => {
        const opt = document.createElement('option');
        opt.value = op;
        opt.textContent = op;
        dom.filtroOperacion.appendChild(opt);
      });
    }
  }

  function seleccionarChipOperacion(opNombre) {
    const chips = dom.chipsOperacionBar.querySelectorAll('.op-chip');
    chips.forEach(c => {
      if (c.dataset.op === opNombre) c.classList.add('active');
      else c.classList.remove('active');
    });
    aplicarFiltrosMemoria();
  }

  function obtenerOperacionSeleccionada() {
    const ops = estadoUsuario.operaciones || [];
    if (ops.length > 0 && ops.length <= 5) {
      const active = dom.chipsOperacionBar.querySelector('.op-chip.active');
      return active ? active.dataset.op : 'TODAS';
    }
    return dom.filtroOperacion ? dom.filtroOperacion.value : 'TODAS';
  }

  // Plegar / Desplegar Filtros
  window.toggleFiltros = function () {
    const abierto = dom.filtrosBody.style.display !== 'none';
    if (abierto) {
      dom.filtrosBody.style.display = 'none';
      dom.filtrosChevron.classList.remove('abierto');
    } else {
      dom.filtrosBody.style.display = 'flex';
      dom.filtrosChevron.classList.add('abierto');
    }
  };

  function actualizarBadgeFiltros() {
    let activos = 0;
    if (dom.filtroRegional && dom.filtroRegional.value !== 'TODAS') activos++;
    if (obtenerOperacionSeleccionada() !== 'TODAS') activos++;
    if (dom.filtroFase && dom.filtroFase.value !== 'TODAS') activos++;
    if (dom.filtroDia && dom.filtroDia.value.trim() !== '') activos++;

    if (activos > 0) {
      dom.filtrosBadge.textContent = activos;
      dom.filtrosBadge.style.display = 'inline-flex';
    } else {
      dom.filtrosBadge.style.display = 'none';
    }
  }

  function configurarEventos() {
    const todas = document.getElementById('selTodasConsig');
    if (todas) {
      todas.addEventListener('click', (e) => e.stopPropagation());
      todas.addEventListener('change', () => {
        registrosFiltrados.filter(esSeleccionableConsig).forEach(r => {
          if (todas.checked) seleccionConsig.add(claveConsig(r)); else seleccionConsig.delete(claveConsig(r));
        });
        renderizarTabla();
      });
    }

    dom.filtroAnio.addEventListener('change', async () => {
      const anio = dom.filtroAnio.value;
      try {
        const res = await fetch(`/contabilidad/api/quincenas?usuario=${encodeURIComponent(usuario)}&anio=${encodeURIComponent(anio)}`);
        const quincenas = await res.json();
        poblarQuincenas(quincenas, quincenas.length ? quincenas[0].quincena : '');
        await cargarConsignaciones();
      } catch (e) {
        console.error(e);
      }
    });

    dom.filtroQuincena.addEventListener('change', () => cargarConsignaciones());
    dom.filtroDia.addEventListener('change', () => {
      actualizarBadgeFiltros();
      cargarConsignaciones();
    });

    dom.filtroRegional.addEventListener('change', () => {
      filtrarOperacionesPorRegional();
      actualizarBadgeFiltros();
      aplicarFiltrosMemoria();
    });

    if (dom.filtroOperacion) {
      dom.filtroOperacion.addEventListener('change', () => {
        actualizarBadgeFiltros();
        aplicarFiltrosMemoria();
      });
    }

    dom.filtroFase.addEventListener('change', () => {
      actualizarBadgeFiltros();
      aplicarFiltrosMemoria();
    });

    dom.filtroBusqueda.addEventListener('input', () => aplicarFiltrosMemoria());
  }

  function filtrarOperacionesPorRegional() {
    const reg = dom.filtroRegional.value;
    if (dom.filtroOperacion && estadoUsuario.opsPorRegional) {
      dom.filtroOperacion.innerHTML = '<option value="TODAS">Todas las Operaciones</option>';
      let listaOps = (reg === 'TODAS')
        ? (estadoUsuario.operaciones || [])
        : (estadoUsuario.opsPorRegional[reg] || []);
      listaOps.forEach(op => {
        const opt = document.createElement('option');
        opt.value = op;
        opt.textContent = op;
        dom.filtroOperacion.appendChild(opt);
      });
    }
  }

  // Sincronizar
  window.sincronizarConsignaciones = async function (btn) {
    const syncBtns = document.querySelectorAll('.btn-sync');
    syncBtns.forEach(b => { b.classList.add('girando'); b.disabled = true; });
    try {
      await cargarConsignaciones();
    } finally {
      syncBtns.forEach(b => { b.classList.remove('girando'); b.disabled = false; });
    }
  };

  // Carga de datos
  async function cargarConsignaciones() {
    dom.tbodyConsignaciones.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:30px; color:var(--text-muted);"><span class="spinner" style="border-color:var(--text-muted); border-top-color:var(--accent);"></span> Cargando consignaciones...</td></tr>`;

    const anio = dom.filtroAnio.value;
    const quincena = dom.filtroQuincena.value;
    const dia = dom.filtroDia.value;

    const query = new URLSearchParams({
      usuario,
      anio,
      quincena: dia ? '' : quincena,
      dia: dia || '',
    });

    try {
      const res = await fetch(`/contabilidad/api/consignaciones?${query.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al obtener datos');
      }
      const data = await res.json();
      todosLosRegistros = data.registros || [];

      aplicarFiltrosMemoria();
    } catch (err) {
      console.error('[contabilidad] Error en cargarConsignaciones:', err);
      dom.tbodyConsignaciones.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:30px; color:#ef4444;">${err.message}</td></tr>`;
    }
  }

  // Filtros en memoria
  function aplicarFiltrosMemoria() {
    const reg = dom.filtroRegional.value;
    const op = obtenerOperacionSeleccionada();
    const fase = dom.filtroFase.value;
    const busqueda = (dom.filtroBusqueda.value || '').trim().toLowerCase();

    registrosFiltrados = todosLosRegistros.filter(r => {
      if (reg !== 'TODAS' && (r.regional || '').toUpperCase() !== reg.toUpperCase()) return false;
      if (op !== 'TODAS' && (r.operacion || '').toLowerCase() !== op.toLowerCase()) return false;
      if (fase !== 'TODAS' && r.fase.toLowerCase() !== fase.toLowerCase()) return false;
      if (busqueda !== '') {
        const match =
          (r.operacion && r.operacion.toLowerCase().includes(busqueda)) ||
          (r.comprobante && r.comprobante.toLowerCase().includes(busqueda)) ||
          (r.banco && r.banco.toLowerCase().includes(busqueda)) ||
          (r.cuenta && r.cuenta.toLowerCase().includes(busqueda)) ||
          (r.usuario && r.usuario.toLowerCase().includes(busqueda)) ||
          (r.observaciones && r.observaciones.toLowerCase().includes(busqueda)) ||
          (r.dia && r.dia.includes(busqueda));
        if (!match) return false;
      }
      return true;
    });

    ordenarRegistrosFiltrados();
    actualizarKPIs();
    renderizarTabla();
  }

  // Ordenamiento por columnas
  function configurarOrdenamientoTabla() {
    dom.tablaConsignaciones.querySelectorAll('thead th[data-sort]').forEach(th => {
      th.addEventListener('click', (e) => {
        if (e.target.classList.contains('th-resize')) return;
        const col = th.getAttribute('data-sort');
        if (sortState.col === col) {
          sortState.order = sortState.order === 'asc' ? 'desc' : 'asc';
        } else {
          sortState.col = col;
          sortState.order = 'asc';
        }

        dom.tablaConsignaciones.querySelectorAll('thead th[data-sort]').forEach(h => {
          h.classList.remove('sort-asc', 'sort-desc');
        });
        th.classList.add(sortState.order === 'asc' ? 'sort-asc' : 'sort-desc');

        ordenarRegistrosFiltrados();
        renderizarTabla();
      });
    });
  }

  function ordenarRegistrosFiltrados() {
    const { col, order } = sortState;
    registrosFiltrados.sort((a, b) => {
      let valA = a[col];
      let valB = b[col];

      if (valA == null) valA = '';
      if (valB == null) valB = '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return order === 'asc' ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return order === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }

  // Redimensionamiento de columnas (idéntico a Facturación)
  function hacerTablaRedimensionable(table) {
    if (!table) return;
    const row = table.querySelector('thead tr');
    const cols = row ? row.children : [];
    if (!cols.length) return;

    for (let i = 0; i < cols.length; i++) {
      const th = cols[i];
      const existing = th.querySelector('.th-resize');
      if (existing) existing.remove();

      const handle = document.createElement('span');
      handle.className = 'th-resize';
      handle.title = 'Arrastra para cambiar el ancho';
      th.appendChild(handle);

      let startX, startWidth;
      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startWidth = th.offsetWidth;
        handle.classList.add('resizing');
        try { handle.setPointerCapture(e.pointerId); } catch (err) {}

        const onPointerMove = (moveEvent) => {
          const width = Math.max(50, startWidth + (moveEvent.clientX - startX));
          th.style.width = width + 'px';
          th.style.minWidth = width + 'px';
        };

        const onPointerUp = () => {
          handle.classList.remove('resizing');
          handle.removeEventListener('pointermove', onPointerMove);
          handle.removeEventListener('pointerup', onPointerUp);
          handle.removeEventListener('pointercancel', onPointerUp);
        };

        handle.addEventListener('pointermove', onPointerMove);
        handle.addEventListener('pointerup', onPointerUp);
        handle.addEventListener('pointercancel', onPointerUp);
      });
    }
  }

  // Actualizar KPIs
  function actualizarKPIs() {
    let totEfectivo = 0;
    let totConsignado = 0;
    let totPendiente = 0;

    registrosFiltrados.forEach(r => {
      totEfectivo += (r.totalEfectivo || 0);
      totConsignado += (r.valorConsignado || 0);
      totPendiente += (r.saldoPendiente || 0);
    });

    dom.kpiTotalEfectivo.textContent = formatearMoneda(totEfectivo);
    dom.kpiTotalConsignado.textContent = formatearMoneda(totConsignado);
    dom.kpiSaldoPendiente.textContent = formatearMoneda(totPendiente);
    dom.kpiTotalRegistros.textContent = registrosFiltrados.length;

    dom.conteoVisible.textContent = registrosFiltrados.length;
    dom.conteoTotal.textContent = todosLosRegistros.length;
  }

  // Renderizar filas de la tabla
  function renderizarTabla() {
    const conSel = Boolean(estadoUsuario && estadoUsuario.puedeValidar);
    const thSel = document.querySelector('#tablaConsignaciones thead th.col-sel');
    if (thSel) thSel.style.display = conSel ? '' : 'none';
    const visibles = new Set(registrosFiltrados.map(claveConsig));
    [...seleccionConsig].forEach(k => { if (!visibles.has(k)) seleccionConsig.delete(k); });
    actualizarBarraConsig();
    if (!registrosFiltrados.length) {
      dom.tbodyConsignaciones.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:30px; color:var(--text-muted);">No se encontraron consignaciones para los filtros seleccionados.</td></tr>`;
      return;
    }

    const fragment = document.createDocumentFragment();

    registrosFiltrados.forEach(item => {
      const tr = document.createElement('tr');
      const isGreen = item.fase === 'Green';
      const isValidado = item.validado === 'SI';
      const puedeEditar = !isValidado || (estadoUsuario && estadoUsuario.puedeValidar);
      const urlSoporte = resolverUrlSoporte(item.fotoConsignacion);

      // Clic en fila:
      // Si tiene soporte, abre el visor de soporte.
      // Si no tiene soporte, abre la ventana emergente de registrar.
      tr.addEventListener('click', (e) => {
        if (e.target.closest('.btn-action') || e.target.closest('.btn-lapiz-edit') || e.target.closest('.servicios-btn-badge') || e.target.closest('.th-resize') || e.target.closest('.col-sel')) return;

        if (urlSoporte) {
          abrirVisorSoporte(item);
        } else {
          abrirModalConsignacion(item);
        }
      });

      // 0. Selección para validar de forma masiva (solo con comprobante)
      if (conSel) {
        const tdSel = document.createElement('td');
        tdSel.className = 'col-sel';
        if (esSeleccionableConsig(item)) {
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.className = 'chk-sel';
          chk.title = 'Seleccionar para validar';
          chk.checked = seleccionConsig.has(claveConsig(item));
          chk.addEventListener('change', () => {
            if (chk.checked) seleccionConsig.add(claveConsig(item)); else seleccionConsig.delete(claveConsig(item));
            actualizarBarraConsig();
          });
          tdSel.appendChild(chk);
        }
        tr.appendChild(tdSel);
      }

      // 1. Estado / Fase con Lápiz para editar
      const tdFase = document.createElement('td');
      let htmlFase = `
        <span class="fase-badge ${isGreen ? 'green' : 'red'}" title="${isGreen ? 'Consignación Registrada' : 'Pendiente por Consignar'}">
          <span class="fase-dot"></span>
          ${isGreen ? 'Consignado' : 'Pendiente'}
        </span>
      `;

      if (isValidado) {
        htmlFase += `<span class="badge-validado" title="Validado por ${item.usuarioValida || 'Contabilidad'} ${item.fechaValidacion ? '(' + item.fechaValidacion + ')' : ''}">✓ Validado</span>`;
      }

      tdFase.innerHTML = htmlFase;

      // Icono del lápiz para registrar o editar
      if (!isGreen || puedeEditar) {
        const btnLapiz = document.createElement('button');
        btnLapiz.type = 'button';
        btnLapiz.className = 'btn-lapiz-edit';
        btnLapiz.title = !isGreen ? 'Registrar consignación' : (isValidado ? 'Editar consignación validada (Rol autorizado)' : 'Editar consignación');
        btnLapiz.innerHTML = '✏️';
        btnLapiz.onclick = (e) => {
          e.stopPropagation();
          abrirModalConsignacion(item);
        };
        tdFase.appendChild(btnLapiz);
      }

      tr.appendChild(tdFase);

      // 2. Día
      const tdDia = document.createElement('td');
      tdDia.innerHTML = `<strong>${formatearFechaLegible(item.dia)}</strong><br><small style="color:var(--text-muted);">${item.dia}</small>`;
      tr.appendChild(tdDia);

      // 3. Operación
      const tdOp = document.createElement('td');
      tdOp.innerHTML = `<span style="font-weight:600;">${item.operacion}</span>`;
      tr.appendChild(tdOp);

      // 5. Total Efectivo
      const tdTotEf = document.createElement('td');
      tdTotEf.innerHTML = `<span class="currency-text">${formatearMoneda(item.totalEfectivo)}</span>`;
      tr.appendChild(tdTotEf);

      // 6. Servicios (Clickable: replica LINKTOFILTEREDVIEW de AppSheet)
      const tdServ = document.createElement('td');
      tdServ.style.textAlign = 'center';
      const btnServ = document.createElement('button');
      btnServ.type = 'button';
      btnServ.className = 'servicios-btn-badge';
      btnServ.title = 'Ver servicios asociados en efectivo';
      btnServ.innerHTML = `<span>${item.totalServicios}</span> <span>🔍</span>`;
      btnServ.onclick = (e) => {
        e.stopPropagation();
        abrirModalServiciosAsociados(item);
      };
      tdServ.appendChild(btnServ);
      tr.appendChild(tdServ);

      // 7. Banco / Entidad
      const tdBanco = document.createElement('td');
      tdBanco.textContent = item.banco || item.entidad || '-';
      tr.appendChild(tdBanco);

      // 8. Cuenta
      const tdCuenta = document.createElement('td');
      tdCuenta.textContent = item.cuenta ? String(item.cuenta) : '-';
      tr.appendChild(tdCuenta);

      // 9. Comprobante
      const tdComp = document.createElement('td');
      tdComp.innerHTML = item.comprobante ? `<code style="font-weight:700; color:var(--text);">${item.comprobante}</code>` : '<span style="color:var(--text-muted);">-</span>';
      tr.appendChild(tdComp);

      // 10. Fecha Consignación
      const tdFechaConsig = document.createElement('td');
      tdFechaConsig.textContent = item.fechaConsignacion ? item.fechaConsignacion : '-';
      tr.appendChild(tdFechaConsig);

      // 11. Valor Consignado
      const tdValConsig = document.createElement('td');
      tdValConsig.innerHTML = item.valorConsignado > 0 ? `<span class="currency-text" style="color:#16a34a;">${formatearMoneda(item.valorConsignado)}</span>` : '<span style="color:var(--text-muted);">$ 0</span>';
      tr.appendChild(tdValConsig);

      // 12. Diferencia
      const tdDif = document.createElement('td');
      if (item.fase === 'Green') {
        const dif = item.diferencia || 0;
        let difClass = 'ok';
        if (dif < 0) difClass = 'danger';
        else if (dif > 0) difClass = 'warn';
        tdDif.innerHTML = `<span class="diferencia-text ${difClass}">${formatearMoneda(dif)}</span>`;
      } else {
        tdDif.innerHTML = `<span class="diferencia-text danger">-${formatearMoneda(item.saldoPendiente)}</span>`;
      }
      tr.appendChild(tdDif);

      fragment.appendChild(tr);
    });

    dom.tbodyConsignaciones.innerHTML = '';
    dom.tbodyConsignaciones.appendChild(fragment);
  }

  // ── VALIDACIÓN MASIVA ─────────────────────────────────────
  function actualizarBarraConsig() {
    const conSel = Boolean(estadoUsuario && estadoUsuario.puedeValidar);
    const barra = document.getElementById('barraMasivaConsig');
    const conteo = document.getElementById('selConteoConsig');
    const todas = document.getElementById('selTodasConsig');
    const seleccionables = registrosFiltrados.filter(esSeleccionableConsig);
    if (conteo) conteo.textContent = seleccionConsig.size.toLocaleString('es-CO');
    if (barra) barra.classList.toggle('visible', conSel && seleccionConsig.size > 0);
    if (todas) {
      todas.checked = seleccionables.length > 0 && seleccionables.every(r => seleccionConsig.has(claveConsig(r)));
      todas.indeterminate = seleccionConsig.size > 0 && !todas.checked;
    }
  }

  window.limpiarSeleccionConsig = function () {
    seleccionConsig.clear();
    renderizarTabla();
  };

  window.validarConsignacionesMasivo = async function (validado) {
    const items = [...seleccionConsig].map(k => {
      const i = k.indexOf('|');
      return { dia: k.slice(0, i), operacion: k.slice(i + 1) };
    });
    if (!items.length) return;
    const accion = validado === 'SI' ? 'validar' : 'quitar la validación a';
    if (!confirm(`¿Desea ${accion} ${items.length} consignación(es) seleccionada(s)?`)) return;
    const barra = document.getElementById('barraMasivaConsig');
    barra.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try {
      const res = await fetch('/contabilidad/api/consignaciones/validar-masivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, items, validado }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar la validación.');
      const hechas = new Set((data.actualizados || []).map(claveConsig));
      const fecha = new Date().toISOString().slice(0, 19).replace('T', ' ');
      todosLosRegistros.forEach(r => {
        if (!hechas.has(claveConsig(r))) return;
        r.validado = data.validado;
        r.usuarioValida = data.usuarioValida || '';
        r.fechaValidacion = data.validado === 'SI' ? fecha : '';
      });
      seleccionConsig.clear();
      renderizarTabla();
      const omitidas = (data.omitidos || []).length;
      alert(`${hechas.size} consignación(es) ${data.validado === 'SI' ? 'validada(s)' : 'sin validación'}${omitidas ? ` · ${omitidas} omitida(s) (sin comprobante o fuera de su alcance)` : ''}.`);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      barra.querySelectorAll('button').forEach(b => { b.disabled = false; });
    }
  };

  // ── MODAL DE REGISTRO / EDICIÓN ───────────────────────────
  window.abrirModalConsignacion = function (item) {
    dom.modalErrorMsg.style.display = 'none';
    dom.modalErrorMsg.textContent = '';
    archivoSoporteSeleccionado = null;
    dom.formFotoFile.value = '';

    dom.modalTitulo.textContent = item.fase === 'Green' ? 'Editar Consignación' : 'Registrar Consignación';
    dom.btnGuardarTexto.textContent = item.fase === 'Green' ? 'Actualizar Consignación' : 'Guardar Consignación';

    dom.formDia.value = item.dia;
    dom.formOperacion.value = item.operacion;
    dom.modalSubtitulo.textContent = `${formatearFechaLegible(item.dia)} — ${item.operacion}`;
    dom.modalServiciosInfo.textContent = `${item.totalServicios} servicios recaudados en efectivo`;
    dom.modalEfectivoVal.textContent = formatearMoneda(item.totalEfectivo);

    // Pre-llenar campos
    dom.formBanco.value = item.banco || item.entidad || '';
    dom.formCuenta.value = item.cuenta || '';
    dom.formComprobante.value = item.comprobante || '';
    dom.formFechaConsignacion.value = item.fechaConsignacion || item.dia || new Date().toISOString().slice(0, 10);
    dom.formValorConsignado.value = item.valorConsignado > 0 ? item.valorConsignado : item.totalEfectivo;
    dom.formObservaciones.value = item.observaciones || '';

    // Manejo del bloque de validación
    if (dom.grupoValidadoContenedor) {
      if (item.fase === 'Green') {
        if (estadoUsuario && estadoUsuario.puedeValidar) {
          dom.grupoValidadoContenedor.style.display = 'block';
          dom.formValidado.disabled = false;
          dom.formValidado.checked = (item.validado === 'SI');
          dom.infoValidadoPrevio.textContent = item.validado === 'SI'
            ? `Validado por ${item.usuarioValida || 'Contabilidad'} ${item.fechaValidacion ? '(' + item.fechaValidacion + ')' : ''}. Desmarca la casilla si deseas anular la validación.`
            : 'Marca la casilla si este soporte ha sido verificado y validado en bancos.';
        } else {
          if (item.validado === 'SI') {
            dom.grupoValidadoContenedor.style.display = 'block';
            dom.formValidado.disabled = true;
            dom.formValidado.checked = true;
            dom.infoValidadoPrevio.textContent = `Validado por ${item.usuarioValida || 'Contabilidad'} ${item.fechaValidacion ? '(' + item.fechaValidacion + ')' : ''}. No editable.`;
          } else {
            dom.grupoValidadoContenedor.style.display = 'none';
          }
        }
      } else {
        dom.grupoValidadoContenedor.style.display = 'none';
      }
    }

    // Soporte previo
    dom.formFotoFile.value = '';
    if (dom.formFotoCamara) dom.formFotoCamara.value = '';
    actualizarZonaArchivoConsignacion('formFotoFile');

    const urlSoporte = resolverUrlSoporte(item.fotoConsignacion);
    if (urlSoporte) {
      dom.contenedorFotoActual.style.display = 'flex';
      dom.formFotoActualTexto.innerHTML = `Soporte cargado: <a href="${urlSoporte}" target="_blank" style="color:var(--accent); font-weight:600; text-decoration:underline;">Ver comprobante actual</a> (se conserva si no sube otro)`;
      if (estadoUsuario && estadoUsuario.puedeEliminarFoto) {
        dom.btnEliminarFotoModal.style.display = 'inline-block';
      } else {
        dom.btnEliminarFotoModal.style.display = 'none';
      }
    } else {
      dom.contenedorFotoActual.style.display = 'none';
    }

    dom.modalConsignacion.classList.add('active');
  };

  window.cerrarModalConsignacion = function () {
    dom.modalConsignacion.classList.remove('active');
  };

  window.eliminarFotoDesdeModal = async function () {
    const dia = dom.formDia.value;
    const operacion = dom.formOperacion.value;
    if (!dia || !operacion) return;

    if (!confirm(`¿Está seguro de que desea eliminar el soporte fotográfico cargado para ${dia} (${operacion})?`)) {
      return;
    }

    dom.btnEliminarFotoModal.disabled = true;
    dom.btnEliminarFotoModal.textContent = 'Eliminando...';

    try {
      const res = await fetch('/contabilidad/api/consignaciones/eliminar-foto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, dia, operacion }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al eliminar el soporte');
      }

      dom.contenedorFotoActual.style.display = 'none';
      const itemEnTodos = todosLosRegistros.find(r => r.dia === dia && r.operacion === operacion);
      if (itemEnTodos) {
        itemEnTodos.fotoConsignacion = null;
      }
      renderizarTabla();
      alert('Soporte eliminado con éxito.');
    } catch (err) {
      console.error('[contabilidad] Error eliminando foto desde modal:', err);
      alert('Error: ' + err.message);
    } finally {
      dom.btnEliminarFotoModal.disabled = false;
      dom.btnEliminarFotoModal.textContent = '🗑️ Eliminar soporte actual';
    }
  };

  window.guardarConsignacionSubmit = async function (e) {
    e.preventDefault();
    dom.modalErrorMsg.style.display = 'none';

    const dia = dom.formDia.value;
    const operacion = dom.formOperacion.value;
    const banco = dom.formBanco.value;
    const cuenta = dom.formCuenta.value;
    const comprobante = dom.formComprobante.value;
    const fechaConsignacion = dom.formFechaConsignacion.value;
    const valorConsignado = dom.formValorConsignado.value;
    const observaciones = dom.formObservaciones.value;

    if (!banco) {
      dom.modalErrorMsg.textContent = 'Debe seleccionar un Banco o Entidad.';
      dom.modalErrorMsg.style.display = 'block';
      return;
    }

    if (!comprobante.trim()) {
      dom.modalErrorMsg.textContent = 'El número de comprobante es obligatorio.';
      dom.modalErrorMsg.style.display = 'block';
      return;
    }

    const formData = new FormData();
    formData.append('usuario', usuario);
    formData.append('dia', dia);
    formData.append('operacion', operacion);
    formData.append('banco', banco);
    formData.append('entidad', banco);
    formData.append('cuenta', cuenta);
    formData.append('comprobante', comprobante);
    formData.append('fechaConsignacion', fechaConsignacion);
    formData.append('valorConsignado', valorConsignado);
    formData.append('observaciones', observaciones);

    if (dom.grupoValidadoContenedor && dom.grupoValidadoContenedor.style.display !== 'none' && !dom.formValidado.disabled) {
      formData.append('validado', dom.formValidado.checked ? 'SI' : 'NO');
    }

    if (archivoSoporteSeleccionado) {
      formData.append('foto', archivoSoporteSeleccionado);
    }

    dom.btnGuardarConsignacion.disabled = true;
    dom.btnGuardarTexto.innerHTML = '<span class="spinner"></span> Guardando...';

    try {
      const res = await fetch('/contabilidad/api/consignaciones', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar la consignación');
      }

      cerrarModalConsignacion();
      await cargarConsignaciones();
    } catch (err) {
      console.error('[contabilidad] Error guardando:', err);
      dom.modalErrorMsg.textContent = err.message;
      dom.modalErrorMsg.style.display = 'block';
    } finally {
      dom.btnGuardarConsignacion.disabled = false;
      dom.btnGuardarTexto.textContent = 'Guardar Consignación';
    }
  };

  // ── MODAL VISOR DE SOPORTE CON ZOOM Y ROTACIÓN ───────────
  function abrirVisorSoporte(item) {
    const url = resolverUrlSoporte(item.fotoConsignacion);
    if (!url) return;

    itemVisorActual = item;
    dom.visorTitulo.textContent = `Soporte Consignación — ${item.operacion} (${item.dia})`;
    dom.btnDescargarSoporte.href = url;

    // Actualizar controles de validación en el visor
    actualizarVisorValidacionUI(item);

    // Resetear zoom y rotación
    visorZoom = 1;
    visorRotacion = 0;

    dom.visorContent.innerHTML = '';
    const esPdf = url.match(/\.(pdf)$/i) || url.includes('/pdf');

    if (esPdf) {
      dom.visorToolbar.style.display = 'none';
      dom.visorContent.innerHTML = `<iframe src="${url}" style="width:100%; height:62vh; border:none; background:#fff; border-radius:6px;"></iframe>`;
    } else {
      dom.visorToolbar.style.display = 'flex';
      const img = document.createElement('img');
      img.id = 'visorImgTag';
      img.className = 'visor-img';
      img.src = url;
      img.alt = 'Comprobante';
      dom.visorContent.appendChild(img);
      actualizarTransformVisor();
    }

    dom.modalVisor.classList.add('active');
  }

  function actualizarVisorValidacionUI(item) {
    if (!dom.visorValidacionContenedor) return;
    if (!item) {
      dom.visorValidacionContenedor.style.display = 'none';
      return;
    }

    dom.visorValidacionContenedor.style.display = 'flex';
    const isValidado = item.validado === 'SI';
    const urlSoporte = resolverUrlSoporte(item.fotoConsignacion);

    // Botón eliminar soporte para roles autorizados
    if (estadoUsuario && estadoUsuario.puedeEliminarFoto && urlSoporte) {
      dom.btnVisorEliminarFoto.style.display = 'inline-flex';
    } else {
      dom.btnVisorEliminarFoto.style.display = 'none';
    }

    if (isValidado) {
      dom.visorValidadoBadge.style.display = 'inline-flex';
      dom.visorValidadoBadge.className = 'fase-badge green';
      dom.visorValidadoBadge.innerHTML = `<span class="fase-dot"></span> Validado por ${item.usuarioValida || 'Contabilidad'}`;
      if (estadoUsuario && estadoUsuario.puedeValidar) {
        dom.btnVisorValidar.style.display = 'inline-flex';
        dom.btnVisorValidar.className = 'btn-action secondary';
        dom.btnVisorValidar.innerHTML = '❌ Desvalidar';
        dom.btnVisorValidar.title = 'Quitar validación contable a este comprobante';
      } else {
        dom.btnVisorValidar.style.display = 'none';
      }
    } else {
      dom.visorValidadoBadge.style.display = 'inline-flex';
      dom.visorValidadoBadge.className = 'fase-badge red';
      dom.visorValidadoBadge.innerHTML = `<span class="fase-dot"></span> Pendiente de validación`;
      if (estadoUsuario && estadoUsuario.puedeValidar) {
        dom.btnVisorValidar.style.display = 'inline-flex';
        dom.btnVisorValidar.className = 'btn-action primary';
        dom.btnVisorValidar.innerHTML = '✅ Validar';
        dom.btnVisorValidar.title = 'Marcar esta consignación como validada';
      } else {
        dom.btnVisorValidar.style.display = 'none';
      }
    }

    // Botón editar desde el visor
    if (dom.btnVisorEditar) {
      const puedeEditar = (!isValidado) || (estadoUsuario && estadoUsuario.puedeValidar);
      dom.btnVisorEditar.style.display = puedeEditar ? 'inline-flex' : 'none';
    }
  }

  window.editarDesdeVisor = function () {
    if (!itemVisorActual) return;
    const item = itemVisorActual;
    cerrarVisor();
    abrirModalConsignacion(item);
  };

  window.eliminarFotoDesdeVisor = async function () {
    if (!itemVisorActual) return;
    if (!confirm(`¿Está seguro de que desea eliminar el soporte fotográfico de la consignación de ${itemVisorActual.operacion} (${itemVisorActual.dia})?`)) {
      return;
    }

    dom.btnVisorEliminarFoto.disabled = true;
    dom.btnVisorEliminarFoto.innerHTML = '<span class="spinner"></span> Eliminando...';

    try {
      const res = await fetch('/contabilidad/api/consignaciones/eliminar-foto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario,
          dia: itemVisorActual.dia,
          operacion: itemVisorActual.operacion,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al eliminar el soporte');
      }

      itemVisorActual.fotoConsignacion = null;
      const itemEnTodos = todosLosRegistros.find(r => r.dia === itemVisorActual.dia && r.operacion === itemVisorActual.operacion);
      if (itemEnTodos) {
        itemEnTodos.fotoConsignacion = null;
      }

      cerrarVisor();
      renderizarTabla();
      alert('Soporte eliminado con éxito.');
    } catch (err) {
      console.error('[contabilidad] Error en eliminarFotoDesdeVisor:', err);
      alert('Error: ' + err.message);
    } finally {
      dom.btnVisorEliminarFoto.disabled = false;
      dom.btnVisorEliminarFoto.innerHTML = '🗑️ Eliminar Soporte';
    }
  };

  window.toggleValidarDesdeVisor = async function () {
    if (!itemVisorActual) return;
    const nuevoEstado = (itemVisorActual.validado === 'SI') ? 'NO' : 'SI';
    dom.btnVisorValidar.disabled = true;
    dom.btnVisorValidar.innerHTML = '<span class="spinner"></span> Guardando...';

    try {
      const res = await fetch('/contabilidad/api/consignaciones/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario,
          dia: itemVisorActual.dia,
          operacion: itemVisorActual.operacion,
          validado: nuevoEstado,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al actualizar validación');
      }

      // Actualizar estado en memoria
      itemVisorActual.validado = data.validado;
      itemVisorActual.usuarioValida = data.usuarioValida;
      if (data.validado === 'SI') {
        itemVisorActual.fechaValidacion = new Date().toISOString().slice(0, 19).replace('T', ' ');
      } else {
        itemVisorActual.fechaValidacion = '';
      }

      // Actualizar visor UI
      actualizarVisorValidacionUI(itemVisorActual);

      // Actualizar lista principal en memoria y re-renderizar tabla
      const itemEnTodos = todosLosRegistros.find(r => r.dia === itemVisorActual.dia && r.operacion === itemVisorActual.operacion);
      if (itemEnTodos) {
        itemEnTodos.validado = itemVisorActual.validado;
        itemEnTodos.usuarioValida = itemVisorActual.usuarioValida;
        itemEnTodos.fechaValidacion = itemVisorActual.fechaValidacion;
      }

      renderizarTabla();
    } catch (err) {
      console.error('[contabilidad] Error en toggleValidarDesdeVisor:', err);
      alert('Error: ' + err.message);
    } finally {
      dom.btnVisorValidar.disabled = false;
      actualizarVisorValidacionUI(itemVisorActual);
    }
  };

  function actualizarTransformVisor() {
    const img = document.getElementById('visorImgTag');
    if (img) {
      img.style.transform = `scale(${visorZoom}) rotate(${visorRotacion}deg)`;
    }
  }

  window.zoomVisor = function (delta) {
    visorZoom = Math.max(0.5, Math.min(3.5, Math.round((visorZoom + delta) * 100) / 100));
    actualizarTransformVisor();
  };

  window.rotarVisor = function (deg) {
    visorRotacion = (visorRotacion + deg) % 360;
    actualizarTransformVisor();
  };

  window.resetVisor = function () {
    visorZoom = 1;
    visorRotacion = 0;
    actualizarTransformVisor();
  };

  window.cerrarVisor = function () {
    dom.modalVisor.classList.remove('active');
    dom.visorContent.innerHTML = '';
    itemVisorActual = null;
  };

  // ── MODAL DE SERVICIOS ASOCIADOS (RÉPLICA LINKTOFILTEREDVIEW) ──
  window.abrirModalServiciosAsociados = async function (item) {
    dom.serviciosAsociadosSubtitulo.textContent = `${item.operacion} — ${formatearFechaLegible(item.dia)}`;
    dom.serviciosAsociadosTotalPago.textContent = formatearMoneda(item.totalEfectivo);
    dom.tbodyServiciosAsociados.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:24px; color:var(--text-muted);"><span class="spinner" style="border-color:var(--text-muted); border-top-color:var(--accent);"></span> Cargando servicios asociados...</td></tr>`;

    dom.modalServiciosAsociados.classList.add('active');

    try {
      const res = await fetch(`/contabilidad/api/servicios-asociados?usuario=${encodeURIComponent(usuario)}&dia=${encodeURIComponent(item.dia)}&operacion=${encodeURIComponent(item.operacion)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al cargar servicios asociados');
      }
      const servicios = await res.json();

      if (!servicios.length) {
        dom.tbodyServiciosAsociados.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:24px; color:var(--text-muted);">No se encontraron servicios en efectivo registrados para este día.</td></tr>`;
        return;
      }

      const fragment = document.createDocumentFragment();
      servicios.forEach(s => {
        const tr = document.createElement('tr');
        const retTot = (s.retefuente || 0) + (s.reteiva || 0) + (s.reteica || 0);

        tr.style.cursor = 'pointer';
        tr.title = 'Abrir detalle del servicio en Facturación (nueva pestaña)';
        tr.onclick = () => {
          window.open(`/facturacion?tab=servicios&usuario=${encodeURIComponent(usuario)}&idservicio=${encodeURIComponent(s.idServicio)}`, '_blank');
        };

        tr.innerHTML = `
          <td><code>${s.idServicio || '-'}</code></td>
          <td>${s.consecutivoRecibo || s.idRecibo || '-'}</td>
          <td>${s.horaInicio || '-'}</td>
          <td><strong style="color:var(--text);">${s.cliente || s.razonSocial || '-'}</strong></td>
          <td>${s.actividad || '-'}</td>
          <td>${s.placa || s.vehiculo || s.proveedor || '-'}</td>
          <td style="text-align:right;">${s.cantidad || 0}</td>
          <td style="text-align:right;">${formatearMoneda(s.valorUnitario)}</td>
          <td style="text-align:right; font-weight:600;">${formatearMoneda(s.valorBase)}</td>
          <td style="text-align:right; color:var(--text-muted);">${formatearMoneda(s.iva)}</td>
          <td style="text-align:right; color:#ef4444;">${retTot > 0 ? '-' + formatearMoneda(retTot) : '$ 0'}</td>
          <td style="text-align:right; font-weight:700; color:var(--accent);">${formatearMoneda(s.totalPago)}</td>
        `;
        fragment.appendChild(tr);
      });

      dom.tbodyServiciosAsociados.innerHTML = '';
      dom.tbodyServiciosAsociados.appendChild(fragment);

    } catch (err) {
      console.error('[contabilidad] Error en abrirModalServiciosAsociados:', err);
      dom.tbodyServiciosAsociados.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:24px; color:#ef4444;">${err.message}</td></tr>`;
    }
  };

  window.cerrarModalServiciosAsociados = function () {
    dom.modalServiciosAsociados.classList.remove('active');
  };

  document.addEventListener('DOMContentLoaded', inicializar);

})();
