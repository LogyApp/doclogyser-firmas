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

  // Variables de visor
  let visorZoom = 1;
  let visorRotacion = 0;
  let itemVisorActual = null;

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
        dom.tbodyTransferencias.innerHTML = `<tr><td colspan="15" style="text-align:center; padding:30px; color:#ef4444;">${err.message}</td></tr>`;
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
  }

  // Cargar datos desde el backend
  window.cargarTransferencias = async function (btnAnimar) {
    if (!dom.tbodyTransferencias) cachearDOM();
    if (!usuario) usuario = obtenerUsuario();

    if (btnAnimar) {
      btnAnimar.classList.add('girando');
      setTimeout(() => btnAnimar.classList.remove('girando'), 1200);
    }

    dom.tbodyTransferencias.innerHTML = `<tr><td colspan="15" style="text-align:center; padding:32px; color:var(--text-muted);"><span class="spinner" style="border-color:var(--text-muted); border-top-color:var(--accent);"></span> Cargando transferencias...</td></tr>`;

    const anio = dom.filtroTransfAnio ? dom.filtroTransfAnio.value : '';
    const quincena = dom.filtroTransfQuincena ? dom.filtroTransfQuincena.value : '';
    const dia = dom.filtroTransfDia ? dom.filtroTransfDia.value : '';
    const regional = dom.filtroTransfRegional ? dom.filtroTransfRegional.value : '';
    const operacion = obtenerOperacionSeleccionada();
    const fase = dom.filtroTransfFase ? dom.filtroTransfFase.value : '';

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
      aplicarFiltrosMemoria();

    } catch (err) {
      console.error('[transferencias] Error al cargar:', err);
      dom.tbodyTransferencias.innerHTML = `<tr><td colspan="15" style="text-align:center; padding:30px; color:#ef4444;">${err.message}</td></tr>`;
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
      if (fase !== 'TODAS' && r.fase.toLowerCase() !== fase.toLowerCase()) return false;

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

  function renderizarTabla() {
    if (!dom.tbodyTransferencias) return;
    if (!registrosFiltrados.length) {
      dom.tbodyTransferencias.innerHTML = `<tr><td colspan="15" style="text-align:center; padding:30px; color:var(--text-muted);">No se encontraron transferencias para los filtros seleccionados.</td></tr>`;
      return;
    }

    const fragment = document.createDocumentFragment();

    registrosFiltrados.forEach(item => {
      const tr = document.createElement('tr');
      const isGreen = item.fase === 'Green';
      const urlSoporte = item.urlSoporte || resolverUrlSoporte(item.fotoTransferencia);

      // Clic en fila: si tiene soporte abre el visor; si no, abre el servicio en Facturación
      tr.addEventListener('click', (e) => {
        if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.th-resize')) return;
        if (urlSoporte) {
          abrirVisorTransferencia(item);
        } else {
          window.open(`/facturacion?tab=servicios&usuario=${encodeURIComponent(usuario)}&idservicio=${encodeURIComponent(item.idServicio)}`, '_blank');
        }
      });

      // 1. Estado / Fase
      const tdFase = document.createElement('td');
      tdFase.innerHTML = `
        <span class="fase-badge ${isGreen ? 'green' : 'red'}" title="${isGreen ? 'Soporte de Transferencia Cargado' : 'Pendiente por Cargar Soporte'}">
          <span class="fase-dot"></span>
          ${isGreen ? 'Con Soporte' : 'Pendiente'}
        </span>
      `;
      tr.appendChild(tdFase);

      // 2. Día / Fecha
      const tdDia = document.createElement('td');
      tdDia.innerHTML = `<strong>${formatearFechaLegible(item.dia)}</strong><br><small style="color:var(--text-muted);">${item.dia}</small>`;
      tr.appendChild(tdDia);

      // 3. Operación
      const tdOp = document.createElement('td');
      tdOp.innerHTML = `<strong style="color:var(--text);">${item.operacion}</strong><br><small style="color:var(--text-muted);">${item.regional || ''}</small>`;
      tr.appendChild(tdOp);

      // 4. Recibo
      const tdRec = document.createElement('td');
      tdRec.innerHTML = `<code style="font-weight:700; color:var(--text);">${item.consecutivoRecibo}</code>`;
      tr.appendChild(tdRec);

      // 5. Cliente
      const tdCli = document.createElement('td');
      tdCli.style.maxWidth = '220px';
      tdCli.style.overflow = 'hidden';
      tdCli.style.textOverflow = 'ellipsis';
      tdCli.style.whiteSpace = 'nowrap';
      tdCli.title = item.cliente;
      tdCli.innerHTML = `<span style="font-weight:600;">${item.cliente || '-'}</span>`;
      tr.appendChild(tdCli);

      // 6. NIT
      const tdNit = document.createElement('td');
      tdNit.textContent = item.nit || '-';
      tr.appendChild(tdNit);

      // 7. Placa
      const tdPlaca = document.createElement('td');
      tdPlaca.style.textAlign = 'center';
      tdPlaca.innerHTML = item.placa && item.placa !== '-' ? `<span style="font-weight:700; background:rgba(37,99,235,0.08); padding:2px 6px; border-radius:4px; border:1px solid rgba(37,99,235,0.2);">${item.placa}</span>` : '-';
      tr.appendChild(tdPlaca);

      // 8. Área
      const tdArea = document.createElement('td');
      tdArea.style.textAlign = 'center';
      tdArea.textContent = item.area || '-';
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

      // 14. Soporte / Foto
      const tdSoporte = document.createElement('td');
      tdSoporte.style.textAlign = 'center';
      if (urlSoporte) {
        const btnVer = document.createElement('button');
        btnVer.type = 'button';
        btnVer.className = 'btn-action secondary';
        btnVer.style.padding = '3px 8px';
        btnVer.style.fontSize = '0.75rem';
        btnVer.title = 'Ver comprobante de transferencia';
        btnVer.innerHTML = '📷 Ver Soporte';
        btnVer.onclick = (e) => {
          e.stopPropagation();
          abrirVisorTransferencia(item);
        };
        tdSoporte.appendChild(btnVer);
      } else {
        tdSoporte.innerHTML = `<span style="color:#ef4444; font-size:0.75rem; font-weight:600;">⚠️ Sin foto</span>`;
      }
      tr.appendChild(tdSoporte);

      // 15. Acciones / Ver en Facturación
      const tdAcc = document.createElement('td');
      tdAcc.style.textAlign = 'center';
      const btnLink = document.createElement('a');
      btnLink.href = `/facturacion?tab=servicios&usuario=${encodeURIComponent(usuario)}&idservicio=${encodeURIComponent(item.idServicio)}`;
      btnLink.target = '_blank';
      btnLink.className = 'btn-action';
      btnLink.style.padding = '3px 7px';
      btnLink.style.fontSize = '0.75rem';
      btnLink.title = 'Abrir servicio en módulo de Facturación';
      btnLink.innerHTML = '🔗';
      btnLink.onclick = (e) => e.stopPropagation();
      tdAcc.appendChild(btnLink);
      tr.appendChild(tdAcc);

      fragment.appendChild(tr);
    });

    dom.tbodyTransferencias.innerHTML = '';
    dom.tbodyTransferencias.appendChild(fragment);
  }

  // ── MODAL VISOR DE SOPORTE PARA TRANSFERENCIAS ─────────────
  function abrirVisorTransferencia(item) {
    const url = item.urlSoporte || resolverUrlSoporte(item.fotoTransferencia);
    if (!url) return;

    itemVisorActual = item;
    dom.visorTitulo.textContent = `Soporte Transferencia — Recibo ${item.consecutivoRecibo} (${item.operacion} — ${item.dia})`;
    dom.btnDescargarSoporte.href = url;

    // Configurar botones del footer en el visor
    if (dom.visorValidacionContenedor) dom.visorValidacionContenedor.style.display = 'none';
    if (dom.btnVisorEditar) dom.btnVisorEditar.style.display = 'none';

    if (dom.btnVisorIrFacturacion) {
      dom.btnVisorIrFacturacion.href = `/facturacion?tab=servicios&usuario=${encodeURIComponent(usuario)}&idservicio=${encodeURIComponent(item.idServicio)}`;
      dom.btnVisorIrFacturacion.style.display = 'inline-flex';
    }

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
      img.alt = 'Comprobante de Transferencia';
      dom.visorContent.appendChild(img);
      actualizarTransformVisor();
    }

    dom.modalVisor.classList.add('active');
  }

  function actualizarTransformVisor() {
    const img = document.getElementById('visorImgTag');
    if (img) {
      img.style.transform = `scale(${visorZoom}) rotate(${visorRotacion}deg)`;
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
