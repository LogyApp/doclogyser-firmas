/**
 * contabilidad-transferencias.js
 * Lógica frontend para el módulo de Contabilidad — Pestaña Transferencias
 * Muestra servicios con Forma De Pago = 2, filtros interactivos y visor con zoom/giro.
 */

(function () {
  'use strict';

  // Base URL para archivos históricos de AppSheet (Servicios)
  const URL_APPSHEET_SERVICIOS = 'https://www.appsheet.com/template/gettablefileurl?appName=Control-661901843&tableName=Servicios&fileName=';

  function resolverUrlSoporte(ruta) {
    const r = String(ruta || '').trim();
    if (!r || /^unable to load/i.test(r) || /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(r)) return '';
    if (/^https?:\/\//i.test(r)) return r;
    if (/^gs:\/\//i.test(r)) return 'https://storage.googleapis.com/' + r.slice(5);
    return URL_APPSHEET_SERVICIOS + encodeURIComponent(r);
  }

  // Variables de estado
  let usuario = null;
  let estadoUsuario = null;
  let todosLosRegistros = [];
  let registrosFiltrados = [];
  let yaInicializado = false;
  let sortState = { col: 'dia', order: 'desc' };
  let validacionDisponible = false;   // existen las columnas de validación en Dynamic_Servicios
  const seleccion = new Set();        // IdServicio seleccionados para validar de forma masiva


  // DOM Elements
  const dom = {};

  function cachearDOM() {
    dom.kpiTransfTotal = document.getElementById('kpiTransfTotal');
    dom.kpiTransfMontoTotal = document.getElementById('kpiTransfMontoTotal');
    dom.kpiTransfConSoporte = document.getElementById('kpiTransfConSoporte');
    dom.kpiTransfPendientes = document.getElementById('kpiTransfPendientes');

    // Filtros
    dom.filtrosTransfToggle = document.getElementById('filtrosTransfToggle');
    dom.filtrosTransfChevron = document.getElementById('filtrosTransfChevron');
    dom.filtrosTransfBadge = document.getElementById('filtrosTransfBadge');
    dom.filtrosTransfBody = document.getElementById('filtrosTransfBody');
    dom.filtroTransfAnio = document.getElementById('filtroTransfAnio');
    dom.filtroTransfQuincena = document.getElementById('filtroTransfQuincena');
    dom.filtroTransfDia = document.getElementById('filtroTransfDia');
    dom.filtroTransfRegional = document.getElementById('filtroTransfRegional');
    dom.filtroTransfOperacion = document.getElementById('filtroTransfOperacion');
    dom.grupoSelectTransfOperacion = document.getElementById('grupoSelectTransfOperacion');
    dom.contenedorChipsTransfOperacion = document.getElementById('contenedorChipsTransfOperacion');
    dom.chipsTransfOperacionBar = document.getElementById('chipsTransfOperacionBar');
    dom.filtroTransfFase = document.getElementById('filtroTransfFase');
    dom.filtroTransfBusqueda = document.getElementById('filtroTransfBusqueda');
    dom.conteoTransfVisible = document.getElementById('conteoTransfVisible');
    dom.conteoTransfTotal = document.getElementById('conteoTransfTotal');

    // Tabla
    dom.tablaTransferencias = document.getElementById('tablaTransferencias');
    dom.tbodyTransferencias = document.getElementById('tbodyTransferencias');

    // Visor compartido
    dom.modalVisor = document.getElementById('modalVisor');
    dom.visorTitulo = document.getElementById('visorTitulo');
    dom.visorToolbar = document.getElementById('visorToolbar');
    dom.visorContent = document.getElementById('visorContent');
    dom.btnDescargarSoporte = document.getElementById('btnDescargarSoporte');
    dom.btnVisorIrFacturacion = document.getElementById('btnVisorIrFacturacion');
    dom.visorValidacionContenedor = document.getElementById('visorValidacionContenedor');
    dom.btnVisorEditar = document.getElementById('btnVisorEditar');
  }

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

  function obtenerUsuario() {
    const params = new URLSearchParams(window.location.search);
    return params.get('usuario') || localStorage.getItem('usuario_logyser');
  }

  // Alternar filtros plegables
  window.toggleFiltrosTransferencias = function () {
    if (!dom.filtrosTransfBody) return;
    const abierto = dom.filtrosTransfBody.style.display !== 'none';
    if (abierto) {
      dom.filtrosTransfBody.style.display = 'none';
      if (dom.filtrosTransfChevron) dom.filtrosTransfChevron.classList.remove('abierto');
    } else {
      dom.filtrosTransfBody.style.display = 'flex';
      if (dom.filtrosTransfChevron) dom.filtrosTransfChevron.classList.add('abierto');
    }
  };

  function actualizarBadgeFiltros() {
    if (!dom.filtrosTransfBadge) return;
    let activos = 0;
    if (dom.filtroTransfRegional && dom.filtroTransfRegional.value !== 'TODAS') activos++;
    if (obtenerOperacionSeleccionada() !== 'TODAS') activos++;
    if (dom.filtroTransfFase && dom.filtroTransfFase.value !== 'TODAS') activos++;
    if (dom.filtroTransfDia && dom.filtroTransfDia.value.trim() !== '') activos++;

    if (activos > 0) {
      dom.filtrosTransfBadge.textContent = activos;
      dom.filtrosTransfBadge.style.display = 'inline-flex';
    } else {
      dom.filtrosTransfBadge.style.display = 'none';
    }
  }

  function obtenerOperacionSeleccionada() {
    const ops = estadoUsuario ? (estadoUsuario.operaciones || []) : [];
    if (ops.length > 0 && ops.length <= 5 && dom.chipsTransfOperacionBar) {
      const active = dom.chipsTransfOperacionBar.querySelector('.op-chip.active');
      return active ? active.dataset.op : 'TODAS';
    }
    return dom.filtroTransfOperacion ? dom.filtroTransfOperacion.value : 'TODAS';
  }

  function seleccionarChipOperacion(opNombre) {
    if (!dom.chipsTransfOperacionBar) return;
    const chips = dom.chipsTransfOperacionBar.querySelectorAll('.op-chip');
    chips.forEach(c => {
      if (c.dataset.op === opNombre) c.classList.add('active');
      else c.classList.remove('active');
    });
    aplicarFiltrosMemoria();
  }

  // Inicialización de la pestaña Transferencias
  window.inicializarTransferenciasSiAplica = async function () {
    if (yaInicializado) return;
    yaInicializado = true;
    cachearDOM();

    usuario = obtenerUsuario();
    if (!usuario) return;

    try {
      // 1. Obtener estado si no está cargado
      const res = await fetch(`/contabilidad/api/estado?usuario=${encodeURIComponent(usuario)}&tab=transferencias`);
      if (!res.ok) throw new Error('Error al obtener estado');
      estadoUsuario = await res.json();

      // 2. Poblar selector de Años
      if (dom.filtroTransfAnio) {
        dom.filtroTransfAnio.innerHTML = '';
        (estadoUsuario.anios || [estadoUsuario.anioActual]).forEach(a => {
          const opt = document.createElement('option');
          opt.value = a;
          opt.textContent = a;
          if (a === estadoUsuario.anioActual) opt.selected = true;
          dom.filtroTransfAnio.appendChild(opt);
        });
      }

      // 3. Poblar Quincenas
      poblarQuincenas(estadoUsuario.quincenas || [], estadoUsuario.quincenaActual);

      // 4. Poblar Regionales
      if (dom.filtroTransfRegional) {
        dom.filtroTransfRegional.innerHTML = '';
        if (estadoUsuario.sinFiltro || (estadoUsuario.regionales && estadoUsuario.regionales.length > 1)) {
          dom.filtroTransfRegional.innerHTML = '<option value="TODAS">Todas las Regionales</option>';
          (estadoUsuario.regionales || []).forEach(r => {
            const opt = document.createElement('option');
            opt.value = r;
            opt.textContent = r;
            dom.filtroTransfRegional.appendChild(opt);
          });
          dom.filtroTransfRegional.parentElement.style.display = 'flex';
        } else if (estadoUsuario.regionales && estadoUsuario.regionales.length === 1) {
          const r = estadoUsuario.regionales[0];
          dom.filtroTransfRegional.innerHTML = `<option value="${r}">${r}</option>`;
          dom.filtroTransfRegional.disabled = true;
          dom.filtroTransfRegional.parentElement.style.display = 'flex';
        } else {
          dom.filtroTransfRegional.parentElement.style.display = 'none';
        }
      }

      // 5. Configurar Operaciones (Chips o Select)
      configurarOperaciones();

      // 6. Configurar eventos
      configurarEventos();

      // 7. Hacer tabla redimensionable y ordenable
      hacerTablaRedimensionable(dom.tablaTransferencias);
      configurarOrdenamientoTabla();

      // 8. Cargar datos iniciales
      await window.cargarTransferencias();

    } catch (err) {
      console.error('[transferencias] Error en inicializar:', err);
      if (dom.tbodyTransferencias) {
        dom.tbodyTransferencias.innerHTML = `<tr><td colspan="14" style="text-align:center; padding:30px; color:#ef4444;">${err.message}</td></tr>`;
      }
    }
  };

  function poblarQuincenas(listaQuincenas, seleccionada) {
    if (!dom.filtroTransfQuincena) return;
    dom.filtroTransfQuincena.innerHTML = '';
    listaQuincenas.forEach(qObj => {
      const opt = document.createElement('option');
      opt.value = qObj.quincena;
      opt.textContent = qObj.quincena;
      if (qObj.quincena === seleccionada) opt.selected = true;
      dom.filtroTransfQuincena.appendChild(opt);
    });
  }

  function configurarOperaciones() {
    const ops = estadoUsuario.operaciones || [];
    if (ops.length > 0 && ops.length <= 5) {
      if (dom.grupoSelectTransfOperacion) dom.grupoSelectTransfOperacion.style.display = 'none';
      if (dom.contenedorChipsTransfOperacion) dom.contenedorChipsTransfOperacion.style.display = 'flex';
      if (dom.chipsTransfOperacionBar) {
        dom.chipsTransfOperacionBar.innerHTML = '';
        const chipTodas = document.createElement('button');
        chipTodas.type = 'button';
        chipTodas.className = 'op-chip active';
        chipTodas.dataset.op = 'TODAS';
        chipTodas.textContent = 'Todas';
        chipTodas.onclick = () => seleccionarChipOperacion('TODAS');
        dom.chipsTransfOperacionBar.appendChild(chipTodas);

        ops.forEach(op => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'op-chip';
          chip.dataset.op = op;
          chip.textContent = op;
          chip.onclick = () => seleccionarChipOperacion(op);
          dom.chipsTransfOperacionBar.appendChild(chip);
        });
      }
    } else {
      if (dom.contenedorChipsTransfOperacion) dom.contenedorChipsTransfOperacion.style.display = 'none';
      if (dom.grupoSelectTransfOperacion) dom.grupoSelectTransfOperacion.style.display = 'flex';
      filtrarOperacionesPorRegional();
    }
  }

  function filtrarOperacionesPorRegional() {
    if (!dom.filtroTransfOperacion) return;
    const reg = dom.filtroTransfRegional ? dom.filtroTransfRegional.value : 'TODAS';
    const opsMap = estadoUsuario.opsPorRegional || {};

    let disponibles = [];
    if (reg === 'TODAS') {
      disponibles = estadoUsuario.operaciones || [];
    } else {
      disponibles = opsMap[reg] || [];
    }

    disponibles.sort((a, b) => a.localeCompare(b));
    dom.filtroTransfOperacion.innerHTML = '<option value="TODAS">Todas las Operaciones</option>';
    disponibles.forEach(op => {
      const opt = document.createElement('option');
      opt.value = op;
      opt.textContent = op;
      dom.filtroTransfOperacion.appendChild(opt);
    });
  }

  function configurarEventos() {
    if (dom.filtroTransfAnio) {
      dom.filtroTransfAnio.addEventListener('change', async () => {
        const anio = dom.filtroTransfAnio.value;
        try {
          const res = await fetch(`/contabilidad/api/quincenas?usuario=${encodeURIComponent(usuario)}&anio=${encodeURIComponent(anio)}`);
          const quincenas = await res.json();
          poblarQuincenas(quincenas, quincenas.length ? quincenas[0].quincena : '');
          await window.cargarTransferencias();
        } catch (e) {
          console.error(e);
        }
      });
    }

    if (dom.filtroTransfQuincena) {
      dom.filtroTransfQuincena.addEventListener('change', () => window.cargarTransferencias());
    }

    if (dom.filtroTransfDia) {
      dom.filtroTransfDia.addEventListener('change', () => {
        actualizarBadgeFiltros();
        window.cargarTransferencias();
      });
    }

    if (dom.filtroTransfRegional) {
      dom.filtroTransfRegional.addEventListener('change', () => {
        filtrarOperacionesPorRegional();
        actualizarBadgeFiltros();
        aplicarFiltrosMemoria();
      });
    }

    if (dom.filtroTransfOperacion) {
      dom.filtroTransfOperacion.addEventListener('change', () => {
        actualizarBadgeFiltros();
        aplicarFiltrosMemoria();
      });
    }

    if (dom.filtroTransfFase) {
      dom.filtroTransfFase.addEventListener('change', () => {
        actualizarBadgeFiltros();
        aplicarFiltrosMemoria();
      });
    }

    if (dom.filtroTransfBusqueda) {
      dom.filtroTransfBusqueda.addEventListener('input', () => aplicarFiltrosMemoria());
    }

    // Seleccionar / quitar todas las visibles con soporte
    const todas = document.getElementById('selTodasTransf');
    if (todas) {
      todas.addEventListener('click', (e) => e.stopPropagation());
      todas.addEventListener('change', () => {
        registrosFiltrados.filter(esSeleccionable).forEach(r => {
          if (todas.checked) seleccion.add(r.idServicio); else seleccion.delete(r.idServicio);
        });
        renderizarTabla();
      });
    }
  }

  // Cargar datos desde el backend
  window.cargarTransferencias = async function (btnAnimar) {
    if (!dom.tbodyTransferencias) cachearDOM();
    if (!usuario) usuario = obtenerUsuario();

    if (btnAnimar) {
      btnAnimar.classList.add('girando');
      setTimeout(() => btnAnimar.classList.remove('girando'), 1200);
    }

    dom.tbodyTransferencias.innerHTML = `<tr><td colspan="14" style="text-align:center; padding:32px; color:var(--text-muted);"><span class="spinner" style="border-color:var(--text-muted); border-top-color:var(--accent);"></span> Cargando transferencias...</td></tr>`;

    const anio = dom.filtroTransfAnio ? dom.filtroTransfAnio.value : '';
    const quincena = dom.filtroTransfQuincena ? dom.filtroTransfQuincena.value : '';
    const dia = dom.filtroTransfDia ? dom.filtroTransfDia.value : '';
    const regional = dom.filtroTransfRegional ? dom.filtroTransfRegional.value : '';
    const operacion = obtenerOperacionSeleccionada();
    // Validadas / sin validar se filtran aquí; al servidor solo van Green o Red
    const faseSel = dom.filtroTransfFase ? dom.filtroTransfFase.value : '';
    const fase = ['Green', 'Red'].includes(faseSel) ? faseSel : 'TODAS';

    const params = new URLSearchParams({
      usuario,
      anio,
      quincena,
      dia,
      regional,
      operacion,
      fase,
    });

    try {
      const res = await fetch(`/contabilidad/api/transferencias?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al consultar transferencias');
      }

      const data = await res.json();
      todosLosRegistros = data.registros || [];
      validacionDisponible = Boolean(data.validacionDisponible);
      aplicarFiltrosMemoria();

    } catch (err) {
      console.error('[transferencias] Error al cargar:', err);
      dom.tbodyTransferencias.innerHTML = `<tr><td colspan="14" style="text-align:center; padding:30px; color:#ef4444;">${err.message}</td></tr>`;
    }
  };

  function aplicarFiltrosMemoria() {
    const reg = dom.filtroTransfRegional ? dom.filtroTransfRegional.value : 'TODAS';
    const op = obtenerOperacionSeleccionada();
    const fase = dom.filtroTransfFase ? dom.filtroTransfFase.value : 'TODAS';
    const busqueda = dom.filtroTransfBusqueda ? dom.filtroTransfBusqueda.value.trim().toLowerCase() : '';

    registrosFiltrados = todosLosRegistros.filter(r => {
      if (reg !== 'TODAS' && (r.regional || '').toUpperCase() !== reg.toUpperCase()) return false;
      if (op !== 'TODAS' && (r.operacion || '').toLowerCase() !== op.toLowerCase()) return false;
      if (fase === 'VALIDADA') { if (r.validado !== 'SI') return false; }
      else if (fase === 'SIN_VALIDAR') { if (r.fase !== 'Green' || r.validado === 'SI') return false; }
      else if (fase !== 'TODAS' && r.fase.toLowerCase() !== fase.toLowerCase()) return false;

      if (busqueda) {
        const match =
          (r.consecutivoRecibo && r.consecutivoRecibo.toLowerCase().includes(busqueda)) ||
          (r.cliente && r.cliente.toLowerCase().includes(busqueda)) ||
          (r.placa && r.placa.toLowerCase().includes(busqueda)) ||
          (r.nit && r.nit.toLowerCase().includes(busqueda)) ||
          (r.operacion && r.operacion.toLowerCase().includes(busqueda)) ||
          (r.usuario && r.usuario.toLowerCase().includes(busqueda)) ||
          (r.actividad && r.actividad.toLowerCase().includes(busqueda)) ||
          (r.observaciones && r.observaciones.toLowerCase().includes(busqueda)) ||
          (r.area && String(r.area).toLowerCase().includes(busqueda)) ||
          (r.idServicio && r.idServicio.toLowerCase().includes(busqueda));
        if (!match) return false;
      }
      return true;
    });

    ordenarRegistrosFiltrados();
    actualizarKPIs();
    renderizarTabla();
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

  function actualizarKPIs() {
    let totValor = 0;
    let totConSoporte = 0;
    let totValorConSoporte = 0;
    let totPendientes = 0;
    let totValorPendiente = 0;

    registrosFiltrados.forEach(r => {
      totValor += (r.total || 0);
      if (r.fase === 'Green') {
        totConSoporte++;
        totValorConSoporte += (r.total || 0);
      } else {
        totPendientes++;
        totValorPendiente += (r.total || 0);
      }
    });

    if (dom.kpiTransfTotal) dom.kpiTransfTotal.textContent = registrosFiltrados.length.toLocaleString('es-CO');
    if (dom.kpiTransfMontoTotal) dom.kpiTransfMontoTotal.textContent = formatearMoneda(totValor);
    if (dom.kpiTransfConSoporte) dom.kpiTransfConSoporte.textContent = `${totConSoporte} (${formatearMoneda(totValorConSoporte)})`;
    if (dom.kpiTransfPendientes) dom.kpiTransfPendientes.textContent = `${totPendientes} (${formatearMoneda(totValorPendiente)})`;

    if (dom.conteoTransfVisible) dom.conteoTransfVisible.textContent = registrosFiltrados.length;
    if (dom.conteoTransfTotal) dom.conteoTransfTotal.textContent = todosLosRegistros.length;
  }

  function escHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function puedeValidarAqui() {
    return Boolean(estadoUsuario && estadoUsuario.puedeValidarTransferencias && validacionDisponible);
  }
  function urlDetalleServicio(item) {
    return `/facturacion?tab=servicios&usuario=${encodeURIComponent(usuario)}&idservicio=${encodeURIComponent(item.idServicio)}`;
  }
  function esSeleccionable(item) {
    return Boolean(item.urlSoporte || resolverUrlSoporte(item.fotoTransferencia));
  }

  function renderizarTabla() {
    if (!dom.tbodyTransferencias) return;
    const conSel = puedeValidarAqui();
    dom.tablaTransferencias.classList.toggle('sin-seleccion', !conSel);
    const thSel = dom.tablaTransferencias.querySelector('thead th.col-sel');
    if (thSel) thSel.style.display = conSel ? '' : 'none';
    // La selección solo conserva lo que sigue visible con los filtros
    const visibles = new Set(registrosFiltrados.map(r => r.idServicio));
    [...seleccion].forEach(id => { if (!visibles.has(id)) seleccion.delete(id); });

    if (!registrosFiltrados.length) {
      dom.tbodyTransferencias.innerHTML = `<tr><td colspan="14" style="text-align:center; padding:30px; color:var(--text-muted);">No se encontraron transferencias para los filtros seleccionados.</td></tr>`;
      actualizarBarraSeleccion();
      return;
    }

    const fragment = document.createDocumentFragment();

    registrosFiltrados.forEach(item => {
      const tr = document.createElement('tr');
      const isGreen = item.fase === 'Green';
      const isValidado = item.validado === 'SI';

      // Clic en el registro: ventana con el soporte (o para cargarlo si no tiene)
      tr.addEventListener('click', (e) => {
        if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.th-resize') || e.target.closest('.col-sel')) return;
        abrirModalTransf(item);
      });

      // 0. Selección para validar de forma masiva
      if (conSel) {
        const tdSel = document.createElement('td');
        tdSel.className = 'col-sel';
        if (esSeleccionable(item)) {
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.className = 'chk-sel';
          chk.checked = seleccion.has(item.idServicio);
          chk.title = 'Seleccionar para validar';
          chk.addEventListener('change', () => {
            if (chk.checked) seleccion.add(item.idServicio); else seleccion.delete(item.idServicio);
            actualizarBarraSeleccion();
          });
          tdSel.appendChild(chk);
        }
        tr.appendChild(tdSel);
      }

      // 1. Estado / Fase (+ Validado)
      const tdFase = document.createElement('td');
      tdFase.innerHTML = `
        <span class="fase-badge ${isGreen ? 'green' : 'red'}" title="${isGreen ? 'Soporte de Transferencia Cargado' : 'Pendiente por Cargar Soporte'}">
          <span class="fase-dot"></span>
          ${isGreen ? 'Con Soporte' : 'Pendiente'}
        </span>
        ${isValidado ? `<span class="badge-validado" title="Validado por ${escHtml(item.usuarioValida || 'Contabilidad')} ${item.fechaValidacion ? '(' + escHtml(item.fechaValidacion) + ')' : ''}">✓ Validado</span>` : ''}
      `;
      tr.appendChild(tdFase);

      // 2. Día / Fecha
      const tdDia = document.createElement('td');
      tdDia.innerHTML = `<strong>${formatearFechaLegible(item.dia)}</strong><br><small style="color:var(--text-muted);">${item.dia}</small>`;
      tr.appendChild(tdDia);

      // 3. Operación
      const tdOp = document.createElement('td');
      tdOp.innerHTML = `<strong style="color:var(--text);">${escHtml(item.operacion)}</strong><br><small style="color:var(--text-muted);">${escHtml(item.regional || '')}</small>`;
      tr.appendChild(tdOp);

      // 4. Recibo
      const tdRec = document.createElement('td');
      tdRec.innerHTML = `<code style="font-weight:700; color:var(--text);">${escHtml(item.consecutivoRecibo)}</code>`;
      tr.appendChild(tdRec);

      // 5. Cliente
      const tdCli = document.createElement('td');
      tdCli.style.maxWidth = '220px';
      tdCli.style.overflow = 'hidden';
      tdCli.style.textOverflow = 'ellipsis';
      tdCli.style.whiteSpace = 'nowrap';
      tdCli.title = item.cliente;
      tdCli.innerHTML = `<span style="font-weight:600;">${escHtml(item.cliente || '-')}</span>`;
      tr.appendChild(tdCli);

      // 6. NIT
      const tdNit = document.createElement('td');
      tdNit.textContent = item.nit || '-';
      tr.appendChild(tdNit);

      // 7. Placa
      const tdPlaca = document.createElement('td');
      tdPlaca.style.textAlign = 'center';
      tdPlaca.innerHTML = item.placa && item.placa !== '-' ? `<span style="font-weight:700; background:rgba(37,99,235,0.08); padding:2px 6px; border-radius:4px; border:1px solid rgba(37,99,235,0.2);">${escHtml(item.placa)}</span>` : '-';
      tr.appendChild(tdPlaca);

      // 8. Área (Config_Area.AREA por ID)
      const tdArea = document.createElement('td');
      tdArea.textContent = item.area || '-';
      tdArea.title = item.area || '';
      tr.appendChild(tdArea);

      // 9. Actividad
      const tdAct = document.createElement('td');
      tdAct.textContent = item.actividad || '-';
      tr.appendChild(tdAct);

      // 10. Fecha Transferencia
      const tdFechaTransf = document.createElement('td');
      tdFechaTransf.style.fontSize = '0.78rem';
      tdFechaTransf.textContent = item.fechaTransferencia ? item.fechaTransferencia : '-';
      tr.appendChild(tdFechaTransf);

      // 11. Total
      const tdTotal = document.createElement('td');
      tdTotal.style.textAlign = 'right';
      tdTotal.innerHTML = `<strong class="currency-text" style="color:var(--accent); font-weight:700;">${formatearMoneda(item.total)}</strong>`;
      tr.appendChild(tdTotal);

      // 12. Teléfono
      const tdTel = document.createElement('td');
      tdTel.textContent = item.telefono || '-';
      tr.appendChild(tdTel);

      // 13. Usuario
      const tdUsu = document.createElement('td');
      tdUsu.style.fontSize = '0.78rem';
      tdUsu.textContent = item.usuario || '-';
      tr.appendChild(tdUsu);

      fragment.appendChild(tr);
    });

    dom.tbodyTransferencias.innerHTML = '';
    dom.tbodyTransferencias.appendChild(fragment);
    actualizarBarraSeleccion();
  }

  // ── VALIDACIÓN MASIVA ──────────────────────────────────────
  function actualizarBarraSeleccion() {
    const barra = document.getElementById('barraMasivaTransf');
    const conteo = document.getElementById('selConteoTransf');
    const todas = document.getElementById('selTodasTransf');
    const seleccionables = registrosFiltrados.filter(esSeleccionable);
    if (conteo) conteo.textContent = seleccion.size.toLocaleString('es-CO');
    if (barra) barra.classList.toggle('visible', puedeValidarAqui() && seleccion.size > 0);
    if (todas) {
      todas.checked = seleccionables.length > 0 && seleccionables.every(r => seleccion.has(r.idServicio));
      todas.indeterminate = seleccion.size > 0 && !todas.checked;
    }
  }

  window.limpiarSeleccionTransf = function () {
    seleccion.clear();
    renderizarTabla();
  };

  async function enviarValidacion(ids, validado) {
    const res = await fetch('/contabilidad/api/transferencias/validar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, ids, validado }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo actualizar la validación.');
    const actualizados = new Set(data.actualizados || []);
    todosLosRegistros.forEach(r => {
      if (!actualizados.has(r.idServicio)) return;
      r.validado = data.validado;
      r.usuarioValida = data.usuarioValida || '';
      r.fechaValidacion = data.fechaValidacion || '';
    });
    return data;
  }

  window.validarTransferenciasMasivo = async function (validado) {
    const ids = [...seleccion];
    if (!ids.length) return;
    const accion = validado === 'SI' ? 'validar' : 'quitar la validación a';
    if (!confirm(`¿Desea ${accion} ${ids.length} transferencia(s) seleccionada(s)?`)) return;
    const barra = document.getElementById('barraMasivaTransf');
    barra.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try {
      const data = await enviarValidacion(ids, validado);
      seleccion.clear();
      aplicarFiltrosMemoria();
      const n = (data.actualizados || []).length;
      alert(`${n} transferencia(s) ${validado === 'SI' ? 'validada(s)' : 'sin validación'}${data.omitidos ? ` · ${data.omitidos} omitida(s) (sin soporte o fuera de su alcance)` : ''}.`);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      barra.querySelectorAll('button').forEach(b => { b.disabled = false; });
    }
  };

  // ── VENTANA DE LA TRANSFERENCIA: ver soporte, validar o cargar la foto ──
  let mtItem = null;
  let mtZoomNivel = 1;
  let mtGiro = 0;

  function ahoraDatetimeLocal() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date()).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
  }
  function aDatetimeLocal(v) {
    const m = String(v || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    return m ? `${m[1]}T${m[2]}` : '';
  }

  function abrirModalTransf(item) {
    mtItem = item;
    document.getElementById('mtTitulo').textContent = `Transferencia — Recibo ${item.consecutivoRecibo}`;
    document.getElementById('mtSubtitulo').textContent = `${item.operacion} · ${formatearFechaLegible(item.dia)}`;
    document.getElementById('mtCliente').textContent = `${item.cliente || '-'}${item.actividad && item.actividad !== '-' ? ' · ' + item.actividad : ''}`;
    document.getElementById('mtTotal').textContent = formatearMoneda(item.total);
    document.getElementById('mtVerServicio').href = urlDetalleServicio(item);
    document.getElementById('mtError').style.display = 'none';
    const url = item.urlSoporte || resolverUrlSoporte(item.fotoTransferencia);
    mtMostrarFormulario(!url);
    document.getElementById('modalTransf').classList.add('active');
  }

  function mtPintarSoporte(url) {
    mtZoomNivel = 1;
    mtGiro = 0;
    const cont = document.getElementById('mtContenido');
    cont.innerHTML = '';
    const esPdf = /\.pdf($|\?)/i.test(url) || url.includes('/pdf');
    document.getElementById('mtToolbar').style.display = esPdf ? 'none' : 'flex';
    if (esPdf) {
      cont.innerHTML = `<iframe src="${escHtml(url)}" style="width:100%; height:58vh; border:none; background:#fff; border-radius:6px;"></iframe>`;
    } else {
      const img = document.createElement('img');
      img.id = 'mtImg';
      img.className = 'visor-img';
      img.src = url;
      img.alt = 'Soporte de transferencia';
      cont.appendChild(img);
    }
  }

  // formulario = true: muestra la carga de la foto; false: muestra el soporte
  window.mtMostrarFormulario = function (formulario) {
    const item = mtItem;
    if (!item) return;
    const url = item.urlSoporte || resolverUrlSoporte(item.fotoTransferencia);
    const isValidado = item.validado === 'SI';
    const conSoporte = Boolean(url);
    if (formulario && isValidado) formulario = false; // validada: la foto ya no se cambia

    document.getElementById('mtVisor').style.display = (!formulario && conSoporte) ? 'block' : 'none';
    document.getElementById('mtForm').style.display = formulario ? 'block' : 'none';
    if (!formulario && conSoporte) mtPintarSoporte(url);
    if (formulario) {
      montarZonaArchivoTransf();
      const input = document.getElementById('mtFotoFile');
      input.value = '';
      actualizarZonaArchivoTransf();
      document.getElementById('mtFechaTransferencia').value = aDatetimeLocal(item.fechaTransferencia) || ahoraDatetimeLocal();
      document.getElementById('mtFotoActual').innerHTML = conSoporte
        ? `Soporte actual: <a href="${escHtml(url)}" target="_blank" rel="noopener">ver archivo</a> (se reemplaza en el servicio al guardar)`
        : 'El servicio aún no tiene soporte de transferencia.';
    }

    // Botones
    document.getElementById('mtBtnGuardar').style.display = formulario ? 'inline-flex' : 'none';
    document.getElementById('mtBtnCambiar').style.display = (!formulario && conSoporte && !isValidado) ? 'inline-flex' : 'none';
    const desc = document.getElementById('mtBtnDescargar');
    desc.style.display = (!formulario && conSoporte) ? 'inline-flex' : 'none';
    if (conSoporte) desc.href = url;

    // Validación (solo con soporte y para los roles autorizados)
    const badge = document.getElementById('mtValidadoBadge');
    const btnVal = document.getElementById('mtBtnValidar');
    if (conSoporte && validacionDisponible) {
      badge.style.display = 'inline-flex';
      badge.className = `fase-badge ${isValidado ? 'green' : 'red'}`;
      badge.innerHTML = isValidado
        ? `<span class="fase-dot"></span> Validado por ${escHtml(item.usuarioValida || 'Contabilidad')}${item.fechaValidacion ? ' · ' + escHtml(item.fechaValidacion) : ''}`
        : '<span class="fase-dot"></span> Pendiente de validación';
    } else {
      badge.style.display = 'none';
    }
    if (conSoporte && puedeValidarAqui() && !formulario) {
      btnVal.style.display = 'inline-flex';
      btnVal.className = isValidado ? 'btn-action secondary' : 'btn-action primary';
      btnVal.innerHTML = isValidado ? '❌ Quitar validación' : '✅ Validar';
    } else {
      btnVal.style.display = 'none';
    }
  };

  window.mtToggleValidar = async function () {
    if (!mtItem) return;
    const btn = document.getElementById('mtBtnValidar');
    const nuevo = mtItem.validado === 'SI' ? 'NO' : 'SI';
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Guardando...';
    try {
      const data = await enviarValidacion([mtItem.idServicio], nuevo);
      if (!(data.actualizados || []).length) throw new Error('No se pudo actualizar: el servicio no tiene soporte o está fuera de su alcance.');
      aplicarFiltrosMemoria();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      btn.disabled = false;
      window.mtMostrarFormulario(false);
    }
  };

  window.mtGuardarSoporte = async function () {
    if (!mtItem) return;
    const input = document.getElementById('mtFotoFile');
    const err = document.getElementById('mtError');
    const file = input.files && input.files[0];
    if (!file) {
      err.textContent = 'Adjunte la foto o el archivo de la transferencia.';
      err.style.display = 'block';
      return;
    }
    err.style.display = 'none';
    const btn = document.getElementById('mtBtnGuardar');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Guardando...';
    try {
      const fd = new FormData();
      fd.append('usuario', usuario);
      fd.append('idServicio', mtItem.idServicio);
      fd.append('fechaTransferencia', document.getElementById('mtFechaTransferencia').value);
      fd.append('foto', file);
      const res = await fetch('/contabilidad/api/transferencias/soporte', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el soporte.');
      const enLista = todosLosRegistros.find(r => r.idServicio === mtItem.idServicio) || mtItem;
      [enLista, mtItem].forEach(r => {
        r.fotoTransferencia = data.fotoTransferencia;
        r.urlSoporte = data.fotoTransferencia;
        r.fechaTransferencia = data.fechaTransferencia;
        r.fase = 'Green';
      });
      aplicarFiltrosMemoria();
      window.mtMostrarFormulario(false);
    } catch (e) {
      err.textContent = e.message;
      err.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Guardar soporte';
    }
  };

  function mtTransform() {
    const img = document.getElementById('mtImg');
    if (img) img.style.transform = `scale(${mtZoomNivel}) rotate(${mtGiro}deg)`;
  }
  window.mtZoom = function (d) { mtZoomNivel = Math.max(0.5, Math.min(3.5, Math.round((mtZoomNivel + d) * 100) / 100)); mtTransform(); };
  window.mtRotar = function (g) { mtGiro = (mtGiro + g) % 360; mtTransform(); };
  window.mtReset = function () { mtZoomNivel = 1; mtGiro = 0; mtTransform(); };
  window.cerrarModalTransf = function () {
    document.getElementById('modalTransf').classList.remove('active');
    document.getElementById('mtContenido').innerHTML = '';
    mtItem = null;
  };

  // Zona para adjuntar la foto: mismo diseño que el formulario del servicio en Facturación
  const ICONO_SUBIR = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="display:block; margin:0 auto 6px;"><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"></path><polyline points="7 9 12 4 17 9"></polyline><line x1="12" y1="4" x2="12" y2="16"></line></svg>';
  const ICONO_CLIP = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>';
  const ICONO_CAMARA = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>';

  function asignarArchivoTransf(file) {
    const input = document.getElementById('mtFotoFile');
    if (!file || !(file.type.startsWith('image/') || file.type === 'application/pdf')) return;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
    } catch (e) {
      alert('Este navegador no permite pasar la foto directamente. Use "Elegir archivo".');
      return;
    }
    actualizarZonaArchivoTransf();
  }

  function montarZonaArchivoTransf() {
    const zona = document.querySelector('.zona-archivo[data-input="mtFotoFile"]');
    const input = document.getElementById('mtFotoFile');
    const camara = document.getElementById('mtFotoCamara');
    if (!zona || !input || zona.dataset.montada) return;
    zona.dataset.montada = '1';
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
      if (btn && btn.dataset.accion === 'camara') { e.stopPropagation(); camara.value = ''; camara.click(); return; }
      if (btn && btn.dataset.accion === 'quitar') { e.stopPropagation(); input.value = ''; actualizarZonaArchivoTransf(); return; }
      if (e.target.closest('a')) return;
      input.click();
    });
    input.addEventListener('change', actualizarZonaArchivoTransf);
    camara.addEventListener('change', () => { asignarArchivoTransf(camara.files && camara.files[0]); camara.value = ''; });
    ['dragenter', 'dragover'].forEach(evt => caja.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation();
      caja.style.borderColor = 'var(--accent)';
    }));
    ['dragleave', 'drop'].forEach(evt => caja.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation();
      caja.style.borderColor = 'var(--border)';
    }));
    caja.addEventListener('drop', e => asignarArchivoTransf(e.dataTransfer.files && e.dataTransfer.files[0]));
  }

  function actualizarZonaArchivoTransf() {
    const zona = document.querySelector('.zona-archivo[data-input="mtFotoFile"]');
    const input = document.getElementById('mtFotoFile');
    if (!zona || !input) return;
    const placeholder = zona.querySelector('.zona-archivo-placeholder');
    const preview = zona.querySelector('.zona-archivo-preview');
    if (!preview) return;
    if (preview.dataset.url) { URL.revokeObjectURL(preview.dataset.url); delete preview.dataset.url; }
    const file = input.files && input.files[0];
    if (!file) { preview.style.display = 'none'; preview.innerHTML = ''; placeholder.style.display = 'block'; return; }
    placeholder.style.display = 'none';
    preview.style.display = 'block';
    const quitar = '<button type="button" data-accion="quitar" style="margin-top:6px; font-size:0.74rem; color:#ef4444; background:none; border:none; cursor:pointer; text-decoration:underline; font-weight:600;">Quitar archivo</button>';
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      preview.dataset.url = url;
      preview.innerHTML = `<img src="${url}" alt="Vista previa" style="max-width:100%; max-height:160px; border-radius:6px; display:block; margin:0 auto; box-shadow: 0 1px 3px rgba(0,0,0,0.15);">${quitar}`;
    } else {
      preview.innerHTML = `<div style="font-size:0.84rem; font-weight:700; color:var(--text); word-break:break-all;">📄 ${escHtml(file.name)}</div>${quitar}`;
    }
  }

  // Ordenamiento por columnas
  function configurarOrdenamientoTabla() {
    if (!dom.tablaTransferencias) return;
    dom.tablaTransferencias.querySelectorAll('thead th[data-sort]').forEach(th => {
      th.addEventListener('click', (e) => {
        if (e.target.classList.contains('th-resize')) return;
        const col = th.getAttribute('data-sort');
        if (sortState.col === col) {
          sortState.order = sortState.order === 'asc' ? 'desc' : 'asc';
        } else {
          sortState.col = col;
          sortState.order = 'asc';
        }

        dom.tablaTransferencias.querySelectorAll('thead th[data-sort]').forEach(h => {
          h.classList.remove('sort-asc', 'sort-desc');
        });
        th.classList.add(sortState.order === 'asc' ? 'sort-asc' : 'sort-desc');

        ordenarRegistrosFiltrados();
        renderizarTabla();
      });
    });
  }

  // Redimensionamiento de columnas (idéntico a Consignaciones y Facturación)
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

  // Si la pestaña al cargar es transferencias, inicializar automáticamente
  document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') || 'consignaciones';
    if (tab.toLowerCase() === 'transferencias') {
      window.inicializarTransferenciasSiAplica();
    }
  });

})();
