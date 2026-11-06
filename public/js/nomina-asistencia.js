/**
 * Módulo de Asistencia y Novedades para Nómina (LogyApp)
 * Gestiona filtros con conteos interactivos (Año, Quincena, Día, Regional, Operación, Novedad),
 * catálogo dinámico con códigos de color de Config_Asistencia adaptados a modo claro/oscuro,
 * selección obligatoria de Área (Config_Area donde ADMINISTRATIVO='V') para habilitar colaboradores,
 * dropzones para soporte/incapacidades con cámara y drag&drop,
 * y permisos por rol para editar/eliminar registros en estado Yellow o sin importar estado (Sistema, Nomina).
 */

const _asisState = {
  cargado: false,
  registros: [],
  total: 0,
  pagina: 1,
  limite: 50,
  totalPaginas: 1,
  novedades: [],
  novedadesMap: {},
  metricas: null,
  areasDiaria: [],
  areasNovedad: [],
  areaSeleccionadaDiaria: null,
  areaSeleccionadaNovedad: null,
  trabajadoresOperacion: [],
  trabajadoresSeleccionados: new Map(), // identificacion -> { identificacion, nombreCompleto, ... }
  modoRegistro: 'diaria', // 'diaria' | 'novedad'
  debounceTimer: null
};

// Íconos SVG para dropzones de evidencias
const ASIS_ICONO_SUBIR = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent); margin:0 auto 6px; display:block;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>`;
const ASIS_ICONO_CLIP = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>`;
const ASIS_ICONO_CAMARA = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`;

// Formato de números con separador de miles
function formatMiles(n) {
  return Number(n || 0).toLocaleString('es-CO');
}

// Obtener configuración del módulo
function obtenerConfigAsistencia() {
  return (window._cfg && window._cfg.tabs && window._cfg.tabs.asistencia)
    || (typeof tabs !== 'undefined' && tabs.asistencia)
    || (typeof _cfg !== 'undefined' && _cfg.tabs && _cfg.tabs.asistencia)
    || {};
}

// Cálculo de luminancia para contraste automático
function calcularLuminancia(hex) {
  if (!hex || typeof hex !== 'string' || hex[0] !== '#') return 255;
  let clean = hex.replace('#', '');
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000;
}

// Renderizar badge de novedad adaptativo a tema claro y oscuro
function renderBadgeNovedad(novedad, colorHex) {
  const nov = novedad || 'Asistencia';
  let hex = colorHex;
  if (!hex || hex.toUpperCase() === '#FFFFFF') {
    const info = _asisState.novedadesMap[nov];
    if (info && info.color) hex = info.color;
  }
  hex = hex || '#FFFFFF';

  const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'oscuro';
  const luma = calcularLuminancia(hex);

  let bg = hex;
  let text = '#0f172a';
  let border = 'rgba(0, 0, 0, 0.18)';
  let extraStyles = '';

  if (hex.toUpperCase() === '#FFFFFF') {
    if (isDarkTheme) {
      bg = 'rgba(255, 255, 255, 0.12)';
      text = '#f8fafc';
      border = 'rgba(255, 255, 255, 0.25)';
    } else {
      bg = '#f8fafc';
      text = '#1e293b';
      border = '#cbd5e1';
    }
  } else if (luma < 145) {
    text = '#ffffff';
    border = isDarkTheme ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.15)';
    extraStyles = 'text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);';
  } else {
    text = '#0f172a';
    border = isDarkTheme ? 'rgba(255, 255, 255, 0.28)' : 'rgba(0, 0, 0, 0.18)';
    extraStyles = 'font-weight: 700;';
  }

  return `<span style="display:inline-flex; align-items:center; padding:3px 9px; border-radius:6px; font-size:11.5px; line-height:1.2; background:${bg}; color:${text}; border:1px solid ${border}; white-space:nowrap; ${extraStyles}">${esc(nov)}</span>`;
}

// Renderizar badge de Estado
function renderBadgeEstado(estado) {
  const st = (estado || 'Yellow').trim();
  if (st.toLowerCase() === 'green') {
    return `<span style="display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:12px; font-size:.74rem; font-weight:700; background:rgba(34,197,94,0.15); color:#15803d; border:1px solid rgba(34,197,94,0.3);" title="Bloqueado por Nómina (Solo lectura)">🟢 Green</span>`;
  }
  return `<span style="display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:12px; font-size:.74rem; font-weight:700; background:rgba(234,179,8,0.15); color:#854d0e; border:1px solid rgba(234,179,8,0.3);" title="Editable según permisos">🟡 Yellow</span>`;
}

// ══════════════════════════════════════════════════════════════════════════
// INICIALIZACIÓN DE LA PESTAÑA
// ══════════════════════════════════════════════════════════════════════════

async function initAsistenciaNomina() {
  const cfg = obtenerConfigAsistencia();

  // 1. Poblar selectores de operaciones en los formularios del modal
  const selModalOpDiaria = document.getElementById('asisModalOpDiaria');
  const selModalOpNovedad = document.getElementById('asisModalOpNovedad');
  const selModalOpApoya = document.getElementById('asisModalOpApoya');
  const selFiltroOp = document.getElementById('asisFilterOperacion');
  const selFiltroReg = document.getElementById('asisFilterRegional');

  const ops = (cfg.operacionesFiltro || []).slice().sort((a, b) => a.localeCompare(b, 'es'));
  const opsPorReg = cfg.opsPorRegional || {};
  const regionales = Object.keys(opsPorReg).sort((a, b) => a.localeCompare(b, 'es'));

  // Poblar selector de Regional en filtros
  if (selFiltroReg && regionales.length) {
    let regOpts = '<option value="">Todas las regionales</option>';
    regionales.forEach(r => {
      regOpts += `<option value="${esc(r)}">${esc(r)}</option>`;
    });
    selFiltroReg.innerHTML = regOpts;
  }

  // Poblar selector de Operación en filtros
  if (selFiltroOp) {
    let opOpts = '<option value="">Todas las operaciones</option>';
    ops.forEach(op => {
      opOpts += `<option value="${esc(op)}">${esc(op)}</option>`;
    });
    selFiltroOp.innerHTML = opOpts;
  }

  // Poblar selectores en modal
  if (selModalOpDiaria) {
    let opOpts = '<option value="">Seleccione una operación...</option>';
    ops.forEach(op => {
      opOpts += `<option value="${esc(op)}">${esc(op)}</option>`;
    });
    selModalOpDiaria.innerHTML = opOpts;
  }
  if (selModalOpNovedad) {
    let opOpts = '<option value="">Seleccione una operación...</option>';
    ops.forEach(op => {
      opOpts += `<option value="${esc(op)}">${esc(op)}</option>`;
    });
    selModalOpNovedad.innerHTML = opOpts;
  }
  if (selModalOpApoya) {
    let opOpts = '<option value="">Seleccione operación destino...</option>';
    ops.forEach(op => {
      opOpts += `<option value="${esc(op)}">${esc(op)}</option>`;
    });
    selModalOpApoya.innerHTML = opOpts;
  }

  // Fecha por defecto en modal Diaria
  const inputDiaDiaria = document.getElementById('asisModalDiaDiaria');
  if (inputDiaDiaria && !inputDiaDiaria.value) {
    inputDiaDiaria.value = new Date().toLocaleDateString('en-CA');
  }

  // 2. Cargar catálogo de novedades para selector del modal y filtros
  await cargarCatalogoNovedades();

  // 3. Montar dropzones de evidencias
  montarZonasArchivoAsistencia();

  // 4. Cargar métricas y datos iniciales
  await cargarMetricasAsistencia();
  await fetchAsistenciaData();
}

// ══════════════════════════════════════════════════════════════════════════
// CATÁLOGO DE NOVEDADES
// ══════════════════════════════════════════════════════════════════════════

async function cargarCatalogoNovedades() {
  try {
    const r = await fetch(`/nomina/api/asistencia/novedades?usuario=${encodeURIComponent(usuario)}`);
    const data = await r.json();
    if (data.ok && data.novedades) {
      _asisState.novedades = data.novedades;
      _asisState.novedadesMap = {};
      data.novedades.forEach(n => {
        _asisState.novedadesMap[n.novedad] = n;
      });

      // Llenar selector del modal Novedad
      const selNovModal = document.getElementById('asisModalNovedad');
      if (selNovModal) {
        let opts = '<option value="">Seleccione el tipo de novedad...</option>';
        data.novedades.forEach(n => {
          opts += `<option value="${esc(n.novedad)}" data-prefijo="${esc(n.prefijo)}" data-color="${esc(n.color || '')}" data-soporte="${n.requiereSoporte ? '1' : '0'}" data-descsop="${esc(n.descripcionSoporte || '')}">${esc(n.novedad)}</option>`;
        });
        selNovModal.innerHTML = opts;
      }

      // Llenar selector del modal de Edición
      const selNovEdit = document.getElementById('asisEditNovedad');
      if (selNovEdit) {
        let opts = '';
        data.novedades.forEach(n => {
          opts += `<option value="${esc(n.novedad)}" data-prefijo="${esc(n.prefijo)}">${esc(n.novedad)}</option>`;
        });
        selNovEdit.innerHTML = opts;
      }
    }
  } catch (err) {
    console.warn('[asistencia] No se pudo cargar catálogo de novedades:', err);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// MANEJO Y SELECCIÓN DE ÁREAS (CONFIG_AREA donde ADMINISTRATIVO='V')
// ══════════════════════════════════════════════════════════════════════════

/**
 * Carga las áreas de la operación desde Config_Area (donde ADMINISTRATIVO = 'V')
 * Si <= 5: las renderiza en forma de botones
 * Si > 5: las renderiza en forma de selector desplegable
 */
async function cargarAreasOperacion(operacion, tipo = 'diaria') {
  const containerId = tipo === 'diaria' ? 'asisModalAreaDiariaContainer' : 'asisModalAreaNovedadContainer';
  const hiddenId = tipo === 'diaria' ? 'asisModalAreaDiaria' : 'asisModalAreaNovedad';
  const container = document.getElementById(containerId);
  const hiddenInput = document.getElementById(hiddenId);

  if (hiddenInput) hiddenInput.value = '';
  if (tipo === 'diaria') _asisState.areaSeleccionadaDiaria = null;
  else _asisState.areaSeleccionadaNovedad = null;

  if (!container) return;

  if (!operacion) {
    container.innerHTML = `<span style="font-size:.8rem; color:var(--text-muted); font-style:italic;">Seleccione primero una operación.</span>`;
    return;
  }

  container.innerHTML = `<span style="font-size:.8rem; color:var(--text-muted); font-style:italic;">Cargando áreas de ${esc(operacion)}...</span>`;

  try {
    const r = await fetch(`/nomina/api/asistencia/areas?usuario=${encodeURIComponent(usuario)}&operacion=${encodeURIComponent(operacion)}`);
    const data = await r.json();

    if (!r.ok || !data.ok) throw new Error(data.error || 'Error al obtener áreas');

    const areas = data.areas || [];
    if (tipo === 'diaria') _asisState.areasDiaria = areas;
    else _asisState.areasNovedad = areas;

    if (!areas.length) {
      container.innerHTML = `<span style="font-size:.8rem; color:var(--text-muted); font-style:italic;">No hay áreas configuradas para esta operación.</span>`;
      return;
    }

    if (areas.length <= 5) {
      // Mostrar en forma de botones
      container.innerHTML = `
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
          ${areas.map(a => `
            <button type="button" class="asis-area-btn" data-area-id="${a.id}" onclick="seleccionarAreaModal('${tipo}', '${a.id}', '${esc(a.area)}')">
              ${esc(a.area)}
            </button>
          `).join('')}
        </div>
      `;
    } else {
      // Mostrar en forma de lista desplegable
      container.innerHTML = `
        <select class="filtro-field" style="width:100%; max-width:320px; padding:6px 10px; border:1px solid var(--border); border-radius:6px;" onchange="seleccionarAreaModal('${tipo}', this.value, this.options[this.selectedIndex].text)">
          <option value="">Seleccione un área...</option>
          ${areas.map(a => `<option value="${a.id}">${esc(a.area)}</option>`).join('')}
        </select>
      `;
    }
  } catch (err) {
    console.error('[asistencia] Error al cargar áreas:', err);
    container.innerHTML = `<span style="font-size:.8rem; color:#ef4444;">Error cargando áreas: ${esc(err.message)}</span>`;
  }
}

// Seleccionar área en el modal (diaria o novedad)
function seleccionarAreaModal(tipo, areaId, areaNombre) {
  const hiddenId = tipo === 'diaria' ? 'asisModalAreaDiaria' : 'asisModalAreaNovedad';
  const containerId = tipo === 'diaria' ? 'asisModalAreaDiariaContainer' : 'asisModalAreaNovedadContainer';
  const hiddenInput = document.getElementById(hiddenId);
  const container = document.getElementById(containerId);

  if (hiddenInput) hiddenInput.value = areaId || '';

  if (tipo === 'diaria') {
    _asisState.areaSeleccionadaDiaria = areaId ? { id: areaId, nombre: areaNombre } : null;
    // Resaltar botón activo si está en modo botones
    if (container) {
      container.querySelectorAll('.asis-area-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-area-id') === String(areaId));
      });
    }
    // Habilitar y cargar colaboradores de esa operación y área
    cargarTrabajadoresDiaria();
  } else {
    _asisState.areaSeleccionadaNovedad = areaId ? { id: areaId, nombre: areaNombre } : null;
    if (container) {
      container.querySelectorAll('.asis-area-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-area-id') === String(areaId));
      });
    }
    // Habilitar buscador de colaborador en Novedad
    const searchColab = document.getElementById('asisModalBuscarColabNovedad');
    if (searchColab) {
      searchColab.disabled = !areaId;
      searchColab.title = areaId ? '' : 'Escoja primero operación y área';
      searchColab.value = '';
    }
    const hiddenColab = document.getElementById('asisModalIdTrabajadorNovedad');
    if (hiddenColab) hiddenColab.value = '';
    const badgeColab = document.getElementById('asisBadgeColabSeleccionado');
    if (badgeColab) badgeColab.style.display = 'none';
  }
}

// Al cambiar la operación en el formulario Diaria
async function onOpDiariaChange() {
  const op = document.getElementById('asisModalOpDiaria')?.value;
  const containerCheckboxes = document.getElementById('asisListaTrabajadoresCheckboxes');
  const searchInput = document.getElementById('asisBuscarColaboradorDiaria');
  if (searchInput) searchInput.value = '';

  _asisState.trabajadoresSeleccionados.clear();
  actualizarChipsSeleccionados();

  if (!op) {
    if (containerCheckboxes) containerCheckboxes.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:.84rem;">Seleccione una operación y un área para cargar los colaboradores.</div>';
    _asisState.trabajadoresOperacion = [];
    const areaContainer = document.getElementById('asisModalAreaDiariaContainer');
    if (areaContainer) areaContainer.innerHTML = '<span style="font-size:.8rem; color:var(--text-muted); font-style:italic;">Seleccione primero una operación.</span>';
    return;
  }

  // Cargar áreas
  if (containerCheckboxes) containerCheckboxes.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:.84rem;">Seleccione un área para cargar los colaboradores activos.</div>';
  await cargarAreasOperacion(op, 'diaria');
}

// Al cambiar la operación en el formulario Novedad
async function onOpNovedadChange() {
  const op = document.getElementById('asisModalOpNovedad')?.value;
  const searchColab = document.getElementById('asisModalBuscarColabNovedad');
  if (searchColab) {
    searchColab.disabled = true;
    searchColab.value = '';
  }
  const hiddenColab = document.getElementById('asisModalIdTrabajadorNovedad');
  if (hiddenColab) hiddenColab.value = '';
  const badgeColab = document.getElementById('asisBadgeColabSeleccionado');
  if (badgeColab) badgeColab.style.display = 'none';

  await cargarAreasOperacion(op, 'novedad');
}

// Cargar colaboradores activos según Operación y Área seleccionada (Modo Diaria)
async function cargarTrabajadoresDiaria() {
  const op = document.getElementById('asisModalOpDiaria')?.value;
  const area = document.getElementById('asisModalAreaDiaria')?.value;
  const container = document.getElementById('asisListaTrabajadoresCheckboxes');
  const searchInput = document.getElementById('asisBuscarColaboradorDiaria');
  if (searchInput) searchInput.value = '';

  _asisState.trabajadoresSeleccionados.clear();
  actualizarChipsSeleccionados();

  if (!op || !area) {
    if (container) container.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:.84rem;">Seleccione una operación y un área para cargar los colaboradores activos.</div>';
    _asisState.trabajadoresOperacion = [];
    return;
  }

  if (container) container.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:.84rem;">Cargando colaboradores de Maestro_Vinculación...</div>';

  try {
    const qs = new URLSearchParams({
      usuario,
      operacion: op,
      area: area
    });
    const r = await fetch(`/nomina/api/asistencia/trabajadores?${qs.toString()}`);
    const data = await r.json();
    if (r.ok && data.ok && data.trabajadores) {
      _asisState.trabajadoresOperacion = data.trabajadores;
      renderCheckboxesTrabajadores(data.trabajadores);
    } else {
      throw new Error(data.error || 'No se pudieron cargar los colaboradores');
    }
  } catch (err) {
    if (container) container.innerHTML = `<div style="padding:16px; text-align:center; color:#ef4444; font-size:.84rem;">${esc(err.message)}</div>`;
  }
}

// Filtrar listado de colaboradores en vivo
function filtrarColaboradoresDiaria() {
  const q = (document.getElementById('asisBuscarColaboradorDiaria')?.value || '').toLowerCase().trim();
  if (!q) {
    renderCheckboxesTrabajadores(_asisState.trabajadoresOperacion);
    return;
  }
  const filtrados = _asisState.trabajadoresOperacion.filter(t => 
    (t.nombreCompleto || t.trabajador || '').toLowerCase().includes(q) || 
    String(t.identificacion || '').includes(q)
  );
  renderCheckboxesTrabajadores(filtrados);
}

// Renderizar checkboxes de trabajadores
function renderCheckboxesTrabajadores(lista) {
  const container = document.getElementById('asisListaTrabajadoresCheckboxes');
  if (!container) return;

  if (!lista.length) {
    container.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:.84rem;">No se encontraron colaboradores para este filtro.</div>';
    return;
  }

  container.innerHTML = lista.map(t => {
    const isChecked = _asisState.trabajadoresSeleccionados.has(t.identificacion);
    const badgeRetirado = t.estado === 'Retirado' ? '<span style="font-size:10px; padding:1px 6px; border-radius:4px; background:#fee2e2; color:#b91c1c; font-weight:700; margin-left:6px;">RETIRADO</span>' : '';
    return `
      <label style="display:flex; align-items:center; gap:10px; padding:8px 12px; border-bottom:1px solid var(--border); cursor:pointer; user-select:none; transition:background .12s;" onmouseover="this.style.background='var(--bg-elevated)'" onmouseout="this.style.background='transparent'">
        <input type="checkbox" value="${t.identificacion}" ${isChecked ? 'checked' : ''} onchange="toggleTrabajadorSeleccionado(${t.identificacion})" style="width:16px; height:16px; cursor:pointer;">
        <div style="flex:1;">
          <div style="font-weight:700; font-size:.84rem; color:var(--text);">${esc(t.nombreCompleto || t.trabajador || '')} ${badgeRetirado}</div>
          <div style="font-size:.74rem; color:var(--text-muted);">Cédula: ${esc(t.identificacion)} · Cargo: ${esc(t.cargo || 'Operativo')}</div>
        </div>
      </label>
    `;
  }).join('');
}

// Toggle seleccionar un trabajador
function toggleTrabajadorSeleccionado(identificacion) {
  if (_asisState.trabajadoresSeleccionados.has(identificacion)) {
    _asisState.trabajadoresSeleccionados.delete(identificacion);
  } else {
    const t = _asisState.trabajadoresOperacion.find(x => x.identificacion === identificacion);
    if (t) _asisState.trabajadoresSeleccionados.set(identificacion, t);
  }
  actualizarChipsSeleccionados();
}

// Seleccionar todos / deseleccionar todos
function seleccionarTodosTrabajadores(marcar = true) {
  if (marcar) {
    _asisState.trabajadoresOperacion.forEach(t => _asisState.trabajadoresSeleccionados.set(t.identificacion, t));
  } else {
    _asisState.trabajadoresSeleccionados.clear();
  }
  filtrarColaboradoresDiaria();
  actualizarChipsSeleccionados();
}

// Actualizar chips visuales de seleccionados
function actualizarChipsSeleccionados() {
  const container = document.getElementById('asisChipsSeleccionados');
  const contador = document.getElementById('asisContadorSeleccionados');
  const count = _asisState.trabajadoresSeleccionados.size;

  if (contador) contador.textContent = `(${count} seleccionado${count === 1 ? '' : 's'})`;
  if (!container) return;

  if (count === 0) {
    container.innerHTML = '<span style="font-size:.78rem; color:var(--text-muted); font-style:italic;">Ningún colaborador seleccionado aún.</span>';
    return;
  }

  const chips = [];
  _asisState.trabajadoresSeleccionados.forEach(t => {
    const primerNombre = (t.nombreCompleto || t.trabajador || '').split(' ')[0] || '';
    chips.push(`
      <span style="display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:14px; background:var(--accent-soft, rgba(27,42,94,0.1)); color:var(--accent, #1B2A5E); font-size:.76rem; font-weight:700; border:1px solid rgba(27,42,94,0.2);">
        ${esc(primerNombre)} (${t.identificacion})
        <button type="button" onclick="removerChipSeleccionado(${t.identificacion})" style="background:none; border:none; cursor:pointer; padding:0; line-height:1; font-weight:bold; color:inherit; font-size:12px;">✕</button>
      </span>
    `);
  });
  container.innerHTML = chips.join('');
}

function removerChipSeleccionado(identificacion) {
  _asisState.trabajadoresSeleccionados.delete(identificacion);
  filtrarColaboradoresDiaria();
  actualizarChipsSeleccionados();
}

// ══════════════════════════════════════════════════════════════════════════
// DROPZONES PARA EVIDENCIAS Y SOPORTES (CÁMARA, DRAG & DROP, PDF, FOTO)
// ══════════════════════════════════════════════════════════════════════════

function montarZonasArchivoAsistencia() {
  document.querySelectorAll('.zona-archivo[data-input]').forEach(zona => {
    if (zona.dataset.montada) return;
    zona.dataset.montada = '1';
    const id = zona.dataset.input;
    const input = document.getElementById(id);
    if (!input) return;

    zona.innerHTML = `
      <div class="zona-archivo-caja" style="border:2px dashed var(--border); border-radius:8px; padding:12px; text-align:center; background:var(--bg-elevated); transition: border-color .15s, background-color .15s; cursor:pointer;">
        <div class="zona-archivo-placeholder">
          ${ASIS_ICONO_SUBIR}
          <div style="font-size:0.76rem; color: var(--text-muted); margin-bottom:8px;">Arrastra un PDF o foto aquí o elige una opción</div>
          <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
            <button type="button" class="zona-archivo-btn" data-accion="archivo">${ASIS_ICONO_CLIP} Elegir archivo</button>
            <button type="button" class="zona-archivo-btn" data-accion="camara">${ASIS_ICONO_CAMARA} Tomar foto</button>
          </div>
        </div>
        <div class="zona-archivo-preview" style="display:none;"></div>
      </div>`;

    const caja = zona.querySelector('.zona-archivo-caja');
    caja.addEventListener('click', e => {
      const btn = e.target.closest('[data-accion]');
      if (btn && btn.dataset.accion === 'camara') { e.stopPropagation(); tomarFotoAsistencia(id); return; }
      if (btn && btn.dataset.accion === 'quitar') { e.stopPropagation(); input.value = ''; actualizarZonaArchivoAsistencia(id); return; }
      if (e.target.closest('a')) return;
      input.click();
    });

    input.addEventListener('change', () => actualizarZonaArchivoAsistencia(id));

    ['dragenter', 'dragover'].forEach(evt => caja.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation();
      caja.style.borderColor = 'var(--accent)';
      caja.style.background = 'var(--accent-soft)';
    }));

    ['dragleave', 'drop'].forEach(evt => caja.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation();
      caja.style.borderColor = 'var(--border)';
      caja.style.background = 'var(--bg-elevated)';
    }));

    caja.addEventListener('drop', e => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file || !(file.type.startsWith('image/') || file.type === 'application/pdf')) return;
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      actualizarZonaArchivoAsistencia(id);
    });
  });
}

function actualizarZonaArchivoAsistencia(id) {
  const zona = document.querySelector(`.zona-archivo[data-input="${id}"]`);
  const input = document.getElementById(id);
  if (!zona || !input) return;

  const placeholder = zona.querySelector('.zona-archivo-placeholder');
  const preview = zona.querySelector('.zona-archivo-preview');
  if (!preview) return;

  const file = input.files && input.files[0];
  if (preview.dataset.url) { URL.revokeObjectURL(preview.dataset.url); delete preview.dataset.url; }

  if (!file) {
    preview.style.display = 'none';
    preview.innerHTML = '';
    placeholder.style.display = 'block';
    return;
  }

  placeholder.style.display = 'none';
  preview.style.display = 'block';
  const quitarBtn = '<button type="button" data-accion="quitar" style="margin-top:6px; font-size:0.72rem; color:#ef4444; background:none; border:none; cursor:pointer; text-decoration:underline; font-weight:600;">Quitar archivo</button>';

  if (file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file);
    preview.dataset.url = url;
    preview.innerHTML = `
      <img src="${url}" alt="Vista previa" style="max-width:100%; max-height:140px; border-radius:6px; object-fit:contain; border:1px solid var(--border);">
      <div style="font-size:0.74rem; color:var(--text-muted); margin-top:4px;">${esc(file.name)} (${(file.size / 1024).toFixed(1)} KB)</div>
      ${quitarBtn}
    `;
  } else {
    preview.innerHTML = `
      <div style="padding:10px 0;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#ef4444; margin:0 auto 4px; display:block;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
        <div style="font-weight:700; font-size:0.78rem; color:var(--text); word-break:break-all;">${esc(file.name)}</div>
        <div style="font-size:0.72rem; color:var(--text-muted);">${(file.size / 1024).toFixed(1)} KB</div>
        ${quitarBtn}
      </div>
    `;
  }
}

function tomarFotoAsistencia(idDestino) {
  const camara = document.getElementById('asis-foto-camara');
  if (!camara) return;
  camara.dataset.destino = idDestino;
  camara.value = '';
  camara.click();
}

function onFotoCamaraAsistencia(camara) {
  const foto = camara.files && camara.files[0];
  const destino = document.getElementById(camara.dataset.destino || '');
  if (!foto || !destino) return;
  try {
    const dt = new DataTransfer();
    dt.items.add(foto);
    destino.files = dt.files;
    destino.dispatchEvent(new Event('change', { bubbles: true }));
  } catch (e) {
    alert('Este navegador no permite transferir la captura directamente. Por favor use "Elegir archivo".');
  }
  camara.value = '';
}

// ══════════════════════════════════════════════════════════════════════════
// MÉTRICAS Y CONTEOS INTERACTIVOS (FILTROS)
// ══════════════════════════════════════════════════════════════════════════

async function cargarMetricasAsistencia() {
  const anio = document.getElementById('asisFilterAnio')?.value || '2026';
  const quincena = document.getElementById('asisFilterQuincena')?.value || '';
  const dia = quincena ? (document.getElementById('asisFilterDia')?.value || '') : '';
  const regional = document.getElementById('asisFilterRegional')?.value || '';
  const operacion = document.getElementById('asisFilterOperacion')?.value || '';
  const novedad = document.getElementById('asisFilterNovedad')?.value || '';
  const q = document.getElementById('asisFilterBuscar')?.value || '';

  const qs = new URLSearchParams({
    usuario,
    anio,
    quincena,
    dia,
    regional,
    operacion,
    novedad,
    busqueda: q
  });

  try {
    const r = await fetch(`/nomina/api/asistencia/metricas?${qs.toString()}`);
    const data = await r.json();

    if (r.ok && data.ok) {
      _asisState.metricas = data;
      actualizarSelectoresConMetricas(data);
    }
  } catch (err) {
    console.warn('[asistencia] Error al cargar métricas:', err);
  }
}

function actualizarSelectoresConMetricas(metricas) {
  if (!metricas) return;

  // 1. Selector Quincena
  const qSel = document.getElementById('asisFilterQuincena');
  if (qSel) {
    const curQ = qSel.value;
    const qList = metricas.quincenas || [];
    const totalQ = qList.reduce((acc, q) => acc + Number(q.totalCount || 0), 0);

    let qOpts = `<option value="">Todas las quincenas (${formatMiles(totalQ)})</option>`;
    qList.forEach(q => {
      qOpts += `<option value="${esc(q.quincena)}" ${curQ === q.quincena ? 'selected' : ''}>${esc(q.quincena)} (${formatMiles(q.totalCount)})</option>`;
    });
    if (curQ && !qList.some(q => q.quincena === curQ)) {
      qOpts += `<option value="${esc(curQ)}" selected>${esc(curQ)} (0)</option>`;
    }
    qSel.innerHTML = qOpts;
  }

  // 2. Selector Día (depende de Quincena)
  pintarFiltroDiaAsistencia(metricas.dias);

  // 3. Selector Regional y Operación
  const cfg = obtenerConfigAsistencia();
  const regSel = document.getElementById('asisFilterRegional');
  const opSel = document.getElementById('asisFilterOperacion');
  const regOps = metricas.regionalesOps || [];

  if (regSel) {
    const curReg = regSel.value;
    const regCountMap = {};
    let totalRegOps = 0;
    regOps.forEach(ro => {
      const r = ro.regional || 'SIN REGIONAL';
      regCountMap[r] = (regCountMap[r] || 0) + Number(ro.totalCount || 0);
      totalRegOps += Number(ro.totalCount || 0);
    });

    const listaRegionales = Object.keys(cfg.opsPorRegional || {}).sort((a, b) => a.localeCompare(b, 'es'));
    let regOpts = `<option value="">Todas las regionales (${formatMiles(totalRegOps)})</option>`;
    listaRegionales.forEach(r => {
      const c = regCountMap[r] || 0;
      regOpts += `<option value="${esc(r)}" ${curReg === r ? 'selected' : ''}>${esc(r)} (${formatMiles(c)})</option>`;
    });
    regSel.innerHTML = regOpts;
  }

  if (opSel) {
    const curOp = opSel.value;
    const curReg = regSel ? regSel.value : '';
    const opCountMap = {};
    let totalOps = 0;

    regOps.forEach(ro => {
      if (!curReg || ro.regional === curReg) {
        opCountMap[ro.operacion] = (opCountMap[ro.operacion] || 0) + Number(ro.totalCount || 0);
        totalOps += Number(ro.totalCount || 0);
      }
    });

    let opsPermitidas = cfg.operacionesFiltro || [];
    if (curReg && cfg.opsPorRegional && cfg.opsPorRegional[curReg]) {
      opsPermitidas = cfg.opsPorRegional[curReg];
    }
    opsPermitidas = opsPermitidas.slice().sort((a, b) => a.localeCompare(b, 'es'));

    let opOpts = `<option value="">Todas las operaciones (${formatMiles(totalOps)})</option>`;
    opsPermitidas.forEach(op => {
      const c = opCountMap[op] || 0;
      opOpts += `<option value="${esc(op)}" ${curOp === op ? 'selected' : ''}>${esc(op)} (${formatMiles(c)})</option>`;
    });
    opSel.innerHTML = opOpts;
  }

  // 4. Selector Novedades
  const novSel = document.getElementById('asisFilterNovedad');
  if (novSel) {
    const curNov = novSel.value;
    const novList = metricas.novedades || [];
    const totalNov = novList.reduce((acc, n) => acc + Number(n.totalCount || 0), 0);

    let novOpts = `<option value="">Todas las novedades (${formatMiles(totalNov)})</option>`;
    novList.forEach(n => {
      novOpts += `<option value="${esc(n.novedad)}" ${curNov === n.novedad ? 'selected' : ''}>${esc(n.novedad)} (${formatMiles(n.totalCount)})</option>`;
    });
    novSel.innerHTML = novOpts;
  }

  actualizarBadgeFiltrosAsistencia();
}

function pintarFiltroDiaAsistencia(dias) {
  const diaSel = document.getElementById('asisFilterDia');
  if (!diaSel) return;
  const hayQuincena = !!document.getElementById('asisFilterQuincena')?.value;
  const cur = hayQuincena ? diaSel.value : '';
  const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const lista = hayQuincena ? (dias || []) : [];
  const totalDias = lista.reduce((acc, d) => acc + Number(d.totalCount || 0), 0);

  let opts = `<option value="">Todos los días (${formatMiles(totalDias)})</option>`;
  lista.forEach(d => {
    const f = new Date(`${d.dia}T12:00:00`);
    const nombre = isNaN(f) ? d.dia : `${DIAS_SEMANA[f.getDay()]} ${f.getDate()} ${MESES_CORTOS[f.getMonth()]}`;
    opts += `<option value="${esc(d.dia)}" ${cur === d.dia ? 'selected' : ''}>${nombre} (${formatMiles(d.totalCount)})</option>`;
  });
  if (cur && !lista.some(d => d.dia === cur)) {
    opts += `<option value="${esc(cur)}" selected>${esc(cur)} (0)</option>`;
  }
  diaSel.innerHTML = opts;
  diaSel.disabled = !hayQuincena;
  diaSel.title = hayQuincena ? '' : 'Escoja primero una quincena';
}

// ══════════════════════════════════════════════════════════════════════════
// MANEJO DE EVENTOS EN FILTROS
// ══════════════════════════════════════════════════════════════════════════

function toggleFiltrosAsistencia() {
  const body = document.getElementById('asisFiltrosBody');
  const chevron = document.getElementById('asisFiltrosChevron');
  if (!body) return;
  const visible = body.style.display !== 'none';
  body.style.display = visible ? 'none' : 'block';
  if (chevron) chevron.textContent = visible ? '▸' : '▾';
}

function actualizarBadgeFiltrosAsistencia() {
  let activos = 0;
  const anio = document.getElementById('asisFilterAnio')?.value;
  if (anio && anio !== 'todos' && anio !== '2026') activos++;
  if (document.getElementById('asisFilterQuincena')?.value) activos++;
  if (document.getElementById('asisFilterDia')?.value) activos++;
  if (document.getElementById('asisFilterRegional')?.value) activos++;
  if (document.getElementById('asisFilterOperacion')?.value) activos++;
  if (document.getElementById('asisFilterNovedad')?.value) activos++;
  if (document.getElementById('asisFilterBuscar')?.value) activos++;
  const badge = document.getElementById('asisFiltrosBadge');
  if (badge) badge.textContent = String(activos);
}

function onQuincenaFiltroChangeAsistencia() {
  const diaSel = document.getElementById('asisFilterDia');
  if (diaSel) diaSel.value = '';
  onAsistenciaFiltroChange();
}

function onAsistenciaRegionalChange() {
  const opSel = document.getElementById('asisFilterOperacion');
  if (opSel) opSel.value = '';
  onAsistenciaFiltroChange();
}

async function onAsistenciaFiltroChange() {
  _asisState.pagina = 1;
  await cargarMetricasAsistencia();
  await fetchAsistenciaData();
}

async function limpiarFiltrosAsistencia() {
  const selAnio = document.getElementById('asisFilterAnio');
  if (selAnio) selAnio.value = '2026';
  const selQ = document.getElementById('asisFilterQuincena');
  if (selQ) selQ.value = '';
  const selDia = document.getElementById('asisFilterDia');
  if (selDia) {
    selDia.value = '';
    selDia.disabled = true;
    selDia.title = 'Escoja primero una quincena';
  }
  const selReg = document.getElementById('asisFilterRegional');
  if (selReg) selReg.value = '';
  const selOp = document.getElementById('asisFilterOperacion');
  if (selOp) selOp.value = '';
  const selNov = document.getElementById('asisFilterNovedad');
  if (selNov) selNov.value = '';
  const fBuscar = document.getElementById('asisFilterBuscar');
  if (fBuscar) fBuscar.value = '';

  await onAsistenciaFiltroChange();
}

function debounceAsistenciaBuscar() {
  clearTimeout(_asisState.debounceTimer);
  _asisState.debounceTimer = setTimeout(() => {
    onAsistenciaFiltroChange();
  }, 350);
}

function cambiarPaginaAsistencia(delta) {
  const nuevaPag = _asisState.pagina + delta;
  if (nuevaPag >= 1 && nuevaPag <= _asisState.totalPaginas) {
    _asisState.pagina = nuevaPag;
    fetchAsistenciaData();
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CONSULTA DE REGISTROS (TABLA)
// ══════════════════════════════════════════════════════════════════════════

async function fetchAsistenciaData() {
  const tbody = document.getElementById('asistenciaBody');
  const contador = document.getElementById('asisContador');
  const emptyState = document.getElementById('asisEmptyState');
  const pagBar = document.getElementById('asisPaginacion');

  if (tbody) tbody.innerHTML = '<tr><td colspan="14" style="text-align:center; padding:30px; color:var(--text-muted);">Cargando registros de asistencia...</td></tr>';
  if (emptyState) emptyState.style.display = 'none';

  const anio = document.getElementById('asisFilterAnio')?.value || '2026';
  const quincena = document.getElementById('asisFilterQuincena')?.value || '';
  const dia = quincena ? (document.getElementById('asisFilterDia')?.value || '') : '';
  const regional = document.getElementById('asisFilterRegional')?.value || '';
  const operacion = document.getElementById('asisFilterOperacion')?.value || '';
  const novedad = document.getElementById('asisFilterNovedad')?.value || '';
  const q = (document.getElementById('asisFilterBuscar')?.value || '').toLowerCase().trim();

  const qs = new URLSearchParams({
    usuario,
    anio,
    quincena,
    dia,
    regional,
    operacion,
    novedad,
    busqueda: q,
    pagina: _asisState.pagina,
    limite: _asisState.limite
  });

  try {
    const r = await fetch(`/nomina/api/asistencia/registros?${qs.toString()}`);
    const data = await r.json();

    if (!r.ok || !data.ok) {
      throw new Error(data.error || 'Error al consultar asistencias');
    }

    _asisState.cargado = true;
    _asisState.registros = data.registros || [];
    _asisState.total = data.total || 0;
    _asisState.totalPaginas = data.totalPaginas || 1;

    if (pagBar) {
      pagBar.style.display = _asisState.total > 0 ? 'flex' : 'none';
      const info = document.getElementById('asisInfoPagina');
      if (info) {
        const desde = ((_asisState.pagina - 1) * _asisState.limite) + 1;
        const hasta = Math.min(_asisState.pagina * _asisState.limite, _asisState.total);
        info.textContent = `Mostrando ${desde.toLocaleString('es-CO')} - ${hasta.toLocaleString('es-CO')} de ${_asisState.total.toLocaleString('es-CO')} registros`;
      }
      const pagAct = document.getElementById('asisPaginaActual');
      if (pagAct) pagAct.textContent = `${_asisState.pagina} / ${_asisState.totalPaginas}`;
      const btnAnt = document.getElementById('asisBtnAnterior');
      if (btnAnt) btnAnt.disabled = _asisState.pagina <= 1;
      const btnSig = document.getElementById('asisBtnSiguiente');
      if (btnSig) btnSig.disabled = _asisState.pagina >= _asisState.totalPaginas;
    }

    if (contador) {
      contador.textContent = `${_asisState.total.toLocaleString('es-CO')} registro(s) encontrados`;
    }

    if (!_asisState.registros.length) {
      if (tbody) tbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    renderTablaAsistencias(_asisState.registros);
  } catch (err) {
    console.error('[asistencia] Error fetchAsistenciaData:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="14" style="text-align:center; padding:20px; color:#ef4444;">Error al cargar datos: ${esc(err.message)}</td></tr>`;
  }
}

// Renderizar filas de la tabla
function renderTablaAsistencias(registros) {
  const tbody = document.getElementById('asistenciaBody');
  if (!tbody) return;

  const cfg = obtenerConfigAsistencia();
  const puedeTodos = !!cfg.puedeEditarTodosEstados;
  const puedeYellow = !!cfg.puedeEditarYellow;

  tbody.innerHTML = registros.map(r => {
    const estado = r.estado || 'Yellow';
    const badgeEstado = renderBadgeEstado(estado);
    const badgeNov = renderBadgeNovedad(r.novedad, r.color);

    let horarioTexto = '-';
    let tiempoTexto = '-';
    if (r.horaLlegada || r.horaSalida) {
      horarioTexto = `${esc(r.horaLlegada || '--:--')} - ${esc(r.horaSalida || '--:--')}`;
      tiempoTexto = r.tiempoLaborado ? `<strong>${esc(r.tiempoLaborado)}</strong>` : '-';
    }

    let obsTexto = '-';
    if (r.codDiagnostico || r.diagnostico) {
      obsTexto = `<div style="font-size:.78rem; font-weight:600; color:var(--text);">${esc(r.codDiagnostico || '')} ${esc(r.diagnostico || '')}</div>`;
    } else if (r.observaciones) {
      obsTexto = `<div style="font-size:.78rem; color:var(--text-muted);">${esc(r.observaciones)}</div>`;
    }

    const soportes = [];
    if (r.urlSoporte) {
      soportes.push(`<a href="${esc(r.urlSoporte)}" target="_blank" rel="noopener noreferrer" class="btn-icon-circle" title="Ver Soporte" style="color:#0284c7; background:rgba(2,132,199,0.1);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg></a>`);
    }
    if (r.urlIncapacidad) {
      soportes.push(`<a href="${esc(r.urlIncapacidad)}" target="_blank" rel="noopener noreferrer" class="btn-icon-circle" title="Ver Incapacidad" style="color:#d97706; background:rgba(245,158,11,0.1);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg></a>`);
    }
    if (r.urlHistoriaClinica) {
      soportes.push(`<a href="${esc(r.urlHistoriaClinica)}" target="_blank" rel="noopener noreferrer" class="btn-icon-circle" title="Ver Historia Clínica" style="color:#dc2626; background:rgba(239,68,68,0.1);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg></a>`);
    }
    const soportesHtml = soportes.length ? `<div style="display:flex; gap:6px;">${soportes.join('')}</div>` : '<span style="color:var(--text-muted); font-size:.78rem;">-</span>';

    // Permisos de edición y eliminación
    const puedeModificar = puedeTodos || (puedeYellow && estado === 'Yellow');
    let accionesHtml = '<span style="color:var(--text-muted); font-size:.78rem;">-</span>';
    if (puedeModificar) {
      accionesHtml = `
        <div style="display:flex; gap:6px; justify-content:center;">
          <button type="button" class="btn-icon-circle" title="Editar registro" onclick="abrirModalEditarAsistencia(${r.idAsistencia})" style="color:var(--accent); background:var(--bg-elevated); border:1px solid var(--border); padding:4px; border-radius:4px; cursor:pointer;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button type="button" class="btn-icon-circle" title="Eliminar registro" onclick="eliminarAsistenciaRegistro(${r.idAsistencia})" style="color:#ef4444; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); padding:4px; border-radius:4px; cursor:pointer;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;
    }

    return `
      <tr class="cesantias-table-row">
        <td style="white-space:nowrap;">${badgeEstado}</td>
        <td style="font-weight:600; font-size:.82rem; white-space:nowrap;">${esc(r.dia)}</td>
        <td style="font-size:.82rem; white-space:nowrap;">${esc(r.quincena || '-')}</td>
        <td style="font-size:.82rem; white-space:nowrap;">${esc(r.regional || '-')}</td>
        <td style="font-size:.82rem;">${esc(r.operacion || '-')}</td>
        <td style="font-size:.82rem;">${esc(r.areaNombre || r.area || '-')}</td>
        <td>
          <div style="font-weight:700; font-size:.84rem; color:var(--text);">${esc(r.trabajador || r.nombre || '')}</div>
          <div style="font-size:.74rem; color:var(--text-muted);">C.C. ${esc(r.cedula || '')}</div>
        </td>
        <td>${badgeNov}</td>
        <td style="font-size:.8rem; white-space:nowrap;">${horarioTexto}</td>
        <td style="font-size:.8rem; white-space:nowrap;">${tiempoTexto}</td>
        <td>${obsTexto}</td>
        <td>${soportesHtml}</td>
        <td>
          <div style="font-size:.78rem; font-weight:600;">${esc(r.usuario || '-')}</div>
          <div style="font-size:.72rem; color:var(--text-muted);">${esc(r.fechaRegistro || '')}</div>
        </td>
        <td style="text-align:center;">${accionesHtml}</td>
      </tr>
    `;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════
// MODAL DE REGISTRO INTERACTIVO (INGRESAR EVENTO)
// ══════════════════════════════════════════════════════════════════════════

function abrirModalRegistroAsistencia(modo = 'diaria') {
  const modal = document.getElementById('modalRegistroAsistenciaOverlay');
  if (!modal) return;

  setModoRegistroAsistencia(modo);
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function cerrarModalRegistroAsistencia() {
  const modal = document.getElementById('modalRegistroAsistenciaOverlay');
  if (!modal) return;

  modal.classList.remove('open');
  document.body.style.overflow = '';
}

function setModoRegistroAsistencia(modo) {
  _asisState.modoRegistro = modo;
  const btnTabDiaria = document.getElementById('asisTabBtnDiaria');
  const btnTabNovedad = document.getElementById('asisTabBtnNovedad');
  const formDiaria = document.getElementById('asisFormDiaria');
  const formNovedad = document.getElementById('asisFormNovedad');
  const titulo = document.getElementById('asisModalTitulo');
  const btnGuardarDiaria = document.getElementById('asisBtnGuardarDiaria');
  const btnGuardarNovedad = document.getElementById('asisBtnGuardarNovedad');

  if (modo === 'diaria') {
    if (btnTabDiaria) btnTabDiaria.classList.add('active');
    if (btnTabNovedad) btnTabNovedad.classList.remove('active');
    if (formDiaria) formDiaria.style.display = 'block';
    if (formNovedad) formNovedad.style.display = 'none';
    if (titulo) titulo.textContent = 'Registrar Asistencia';
    if (btnGuardarDiaria) btnGuardarDiaria.style.display = 'inline-block';
    if (btnGuardarNovedad) btnGuardarNovedad.style.display = 'none';
  } else {
    if (btnTabDiaria) btnTabDiaria.classList.remove('active');
    if (btnTabNovedad) btnTabNovedad.classList.add('active');
    if (formDiaria) formDiaria.style.display = 'none';
    if (formNovedad) formNovedad.style.display = 'block';
    if (titulo) titulo.textContent = 'Reportar Novedad';
    if (btnGuardarDiaria) btnGuardarDiaria.style.display = 'none';
    if (btnGuardarNovedad) btnGuardarNovedad.style.display = 'inline-block';
  }
}

function calcularTiempoEnVivo() {
  const hEnt = document.getElementById('asisModalHoraEntrada')?.value;
  const hSal = document.getElementById('asisModalHoraSalida')?.value;
  const badge = document.getElementById('asisBadgeTiempoLaborado');
  if (!badge) return;

  if (!hEnt || !hSal) {
    badge.textContent = '--:-- hrs';
    return;
  }

  const [h1, m1] = hEnt.split(':').map(Number);
  const [h2, m2] = hSal.split(':').map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60;

  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  badge.textContent = `${hh}h ${mm > 0 ? mm + 'm' : ''} laboradas`;
}

function onToggleApoyoOperacion() {
  const chk = document.getElementById('asisModalChkApoyo');
  const wrap = document.getElementById('asisWrapOpApoya');
  if (wrap && chk) {
    wrap.style.display = chk.checked ? 'block' : 'none';
  }
}

// Guardar Asistencia Diaria
async function guardarAsistenciaDiaria() {
  const btn = document.getElementById('asisBtnGuardarDiaria');
  const errorMsg = document.getElementById('asisModalErrorDiaria');
  if (errorMsg) errorMsg.style.display = 'none';

  const op = document.getElementById('asisModalOpDiaria')?.value;
  const area = document.getElementById('asisModalAreaDiaria')?.value || '';
  const dia = document.getElementById('asisModalDiaDiaria')?.value;
  const horaEntrada = document.getElementById('asisModalHoraEntrada')?.value;
  const horaSalida = document.getElementById('asisModalHoraSalida')?.value;
  const apoyoChk = document.getElementById('asisModalChkApoyo')?.checked;
  const opApoya = document.getElementById('asisModalOpApoya')?.value;
  const obs = document.getElementById('asisModalObsDiaria')?.value;

  if (!op) {
    alert('Por favor seleccione la operación.');
    return;
  }
  if (!area) {
    alert('Por favor seleccione el área.');
    return;
  }
  if (!dia) {
    alert('Por favor ingrese el día de asistencia.');
    return;
  }
  if (!_asisState.trabajadoresSeleccionados.size) {
    alert('Debe seleccionar al menos un colaborador de la lista.');
    return;
  }

  const ids = Array.from(_asisState.trabajadoresSeleccionados.keys());

  btn.disabled = true;
  btn.textContent = 'Guardando asistencia...';

  try {
    const payload = {
      usuario,
      operacion: op,
      area,
      novedad: 'Asistencia',
      prefijoNovedad: 'SI',
      dia,
      horaEntrada,
      horaSalida,
      trabajadoresIds: ids,
      apoyoOtraOperacion: apoyoChk ? 'SI' : 'NO',
      operacionApoya: apoyoChk ? opApoya : null,
      observaciones: obs
    };

    const r = await fetch('/nomina/api/asistencia/diaria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json();

    if (!r.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo guardar la asistencia.');
    }

    alert(`¡Asistencia guardada con éxito! Se registraron ${data.registrosInsertados} colaboradores en estado Yellow.`);
    cerrarModalRegistroAsistencia();
    await onAsistenciaFiltroChange();
  } catch (err) {
    console.error('[asistencia] Error guardarAsistenciaDiaria:', err);
    if (errorMsg) {
      errorMsg.textContent = err.message || 'Error al guardar la asistencia';
      errorMsg.style.display = 'block';
    } else {
      alert(`Error: ${err.message}`);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar Asistencia Diaria';
  }
}

// ══════════════════════════════════════════════════════════════════════════
// MODO NOVEDAD
// ══════════════════════════════════════════════════════════════════════════

let _timerBuscarColabNovedad = null;
function onBuscarColabNovedad() {
  clearTimeout(_timerBuscarColabNovedad);
  _timerBuscarColabNovedad = setTimeout(async () => {
    const q = (document.getElementById('asisModalBuscarColabNovedad')?.value || '').trim();
    const resultadosBox = document.getElementById('asisResultadosColabNovedad');
    const op = document.getElementById('asisModalOpNovedad')?.value || '';
    const area = document.getElementById('asisModalAreaNovedad')?.value || '';

    if (!q || q.length < 2) {
      if (resultadosBox) resultadosBox.style.display = 'none';
      return;
    }

    try {
      const qs = new URLSearchParams({
        usuario,
        operacion: op,
        area: area,
        q: q
      });
      const r = await fetch(`/nomina/api/asistencia/trabajadores?${qs.toString()}`);
      const data = await r.json();
      if (r.ok && data.ok && data.trabajadores && data.trabajadores.length) {
        resultadosBox.style.display = 'block';
        resultadosBox.innerHTML = data.trabajadores.slice(0, 10).map(t => `
          <div style="padding:8px 12px; border-bottom:1px solid var(--border); cursor:pointer; font-size:.82rem;" onmouseover="this.style.background='var(--bg-elevated)'" onmouseout="this.style.background='transparent'" onclick="seleccionarColaboradorNovedad(${t.identificacion}, '${esc(t.nombreCompleto || t.trabajador || '')}', '${esc(t.operacion)}')">
            <strong style="color:var(--text);">${esc(t.nombreCompleto || t.trabajador || '')}</strong>
            <div style="color:var(--text-muted); font-size:.74rem;">C.C. ${esc(t.identificacion)} · Sede: ${esc(t.operacion)} · Cargo: ${esc(t.cargo || 'Operativo')}</div>
          </div>
        `).join('');
      } else {
        resultadosBox.style.display = 'block';
        resultadosBox.innerHTML = '<div style="padding:10px; font-size:.8rem; color:var(--text-muted); text-align:center;">No se encontraron colaboradores.</div>';
      }
    } catch (e) {
      console.warn('[asistencia] Error buscando colaborador:', e);
    }
  }, 300);
}

function seleccionarColaboradorNovedad(identificacion, nombreCompleto, operacion) {
  const hiddenId = document.getElementById('asisModalIdTrabajadorNovedad');
  const searchInput = document.getElementById('asisModalBuscarColabNovedad');
  const resultadosBox = document.getElementById('asisResultadosColabNovedad');
  const badgeNombre = document.getElementById('asisBadgeColabSeleccionado');

  if (hiddenId) hiddenId.value = identificacion;
  if (searchInput) searchInput.value = `${identificacion} - ${nombreCompleto}`;
  if (resultadosBox) resultadosBox.style.display = 'none';
  if (badgeNombre) {
    badgeNombre.innerHTML = `Colaborador seleccionado: <strong>${esc(nombreCompleto)}</strong> (C.C. ${identificacion})`;
    badgeNombre.style.display = 'block';
  }
}

function calcularDiasNovedad() {
  const fIni = document.getElementById('asisModalDiaInicio')?.value;
  const fFin = document.getElementById('asisModalDiaFin')?.value;
  const badge = document.getElementById('asisBadgeDiasNovedad');
  if (!badge) return;

  if (!fIni || !fFin) {
    badge.textContent = '-';
    return;
  }

  const d1 = new Date(fIni + 'T12:00:00Z');
  const d2 = new Date(fFin + 'T12:00:00Z');
  const diff = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  if (diff <= 0) {
    badge.textContent = 'Fecha fin debe ser posterior a inicio';
    badge.style.color = '#ef4444';
  } else {
    badge.textContent = `${diff} día(s)`;
    badge.style.color = 'var(--text)';
  }
}

function onTipoNovedadModalChange() {
  const sel = document.getElementById('asisModalNovedad');
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  const novedad = sel.value;
  const esIncapacidad = novedad.toLowerCase().includes('incapacidad');
  const requiereSoporte = opt?.getAttribute('data-soporte') === '1';
  const descSoporte = opt?.getAttribute('data-descsop') || '';

  const secIncapacidad = document.getElementById('asisSecIncapacidad');
  if (secIncapacidad) secIncapacidad.style.display = esIncapacidad ? 'block' : 'none';

  const secSoporte = document.getElementById('asisSecSoporte');
  const descSopSpan = document.getElementById('asisDescSoporte');
  if (secSoporte) {
    secSoporte.style.display = (requiereSoporte || !esIncapacidad) ? 'block' : 'none';
    if (descSopSpan) descSopSpan.textContent = descSoporte ? `(${descSoporte})` : '';
  }
}

// Guardar Novedad por Rango de Fechas
async function guardarNovedadRango() {
  const btn = document.getElementById('asisBtnGuardarNovedad');
  const errorMsg = document.getElementById('asisModalErrorNovedad');
  if (errorMsg) errorMsg.style.display = 'none';

  const trabajadorId = document.getElementById('asisModalIdTrabajadorNovedad')?.value;
  const operacion = document.getElementById('asisModalOpNovedad')?.value;
  const area = document.getElementById('asisModalAreaNovedad')?.value || '';
  const novedadSel = document.getElementById('asisModalNovedad');
  const novedad = novedadSel?.value;
  const prefijoNovedad = novedadSel?.options[novedadSel?.selectedIndex]?.getAttribute('data-prefijo') || 'NOV';
  const diaInicio = document.getElementById('asisModalDiaInicio')?.value;
  const diaFin = document.getElementById('asisModalDiaFin')?.value;
  const codDiag = document.getElementById('asisModalCodDiag')?.value;
  const diag = document.getElementById('asisModalDiag')?.value;
  const tipoInc = document.getElementById('asisModalTipoInc')?.value;
  const obs = document.getElementById('asisModalObsNovedad')?.value;

  if (!operacion) {
    alert('Por favor seleccione la operación.');
    return;
  }
  if (!area) {
    alert('Por favor seleccione el área.');
    return;
  }
  if (!trabajadorId) {
    alert('Por favor busque y seleccione el colaborador.');
    return;
  }
  if (!novedad) {
    alert('Por favor seleccione el tipo de novedad.');
    return;
  }
  if (!diaInicio || !diaFin) {
    alert('Por favor ingrese la fecha de inicio y la fecha fin.');
    return;
  }

  const formData = new FormData();
  formData.append('usuario', usuario);
  formData.append('trabajadorIdentificacion', trabajadorId);
  formData.append('operacion', operacion || '');
  formData.append('area', area);
  formData.append('novedad', novedad);
  formData.append('prefijoNovedad', prefijoNovedad);
  formData.append('diaInicio', diaInicio);
  formData.append('diaFin', diaFin);
  if (codDiag) formData.append('codDiagnostico', codDiag);
  if (diag) formData.append('diagnostico', diag);
  if (tipoInc) formData.append('tipoIncapacidad', tipoInc);
  if (obs) formData.append('observaciones', obs);

  const fileSoporte = document.getElementById('asisFileSoporte')?.files[0];
  if (fileSoporte) formData.append('soporte', fileSoporte);
  const fileInc = document.getElementById('asisFileIncapacidad')?.files[0];
  if (fileInc) formData.append('incapacidad', fileInc);
  const fileHC = document.getElementById('asisFileHistoria')?.files[0];
  if (fileHC) formData.append('historiaClinica', fileHC);

  btn.disabled = true;
  btn.textContent = 'Guardando novedad...';

  try {
    const r = await fetch('/nomina/api/asistencia/novedad', {
      method: 'POST',
      body: formData
    });
    const data = await r.json();

    if (!r.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo guardar la novedad.');
    }

    alert(`¡Novedad registrada con éxito! Se crearon ${data.diasRegistrados} días en el historial.`);
    cerrarModalRegistroAsistencia();
    await onAsistenciaFiltroChange();
  } catch (err) {
    console.error('[asistencia] Error guardarNovedadRango:', err);
    if (errorMsg) {
      errorMsg.textContent = err.message || 'Error al guardar la novedad';
      errorMsg.style.display = 'block';
    } else {
      alert(`Error: ${err.message}`);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar Novedad';
  }
}

// ══════════════════════════════════════════════════════════════════════════
// EDICIÓN Y ELIMINACIÓN DE REGISTROS (MODAL EDITAR)
// ══════════════════════════════════════════════════════════════════════════

function abrirModalEditarAsistencia(idAsistencia) {
  const reg = _asisState.registros.find(r => r.idAsistencia === idAsistencia);
  if (!reg) return;

  const modal = document.getElementById('modalEditarAsistenciaOverlay');
  if (!modal) return;

  const errBox = document.getElementById('asisEditModalError');
  if (errBox) errBox.style.display = 'none';

  document.getElementById('asisEditIdAsistencia').value = reg.idAsistencia;
  document.getElementById('asisEditColaborador').value = `${reg.cedula || ''} - ${reg.trabajador || reg.nombre || ''}`;
  document.getElementById('asisEditDia').value = reg.dia || '';
  document.getElementById('asisEditOperacion').value = reg.operacion || '';
  document.getElementById('asisEditNovedad').value = reg.novedad || 'Asistencia';
  document.getElementById('asisEditHoraEntrada').value = reg.horaLlegada || '';
  document.getElementById('asisEditHoraSalida').value = reg.horaSalida || '';
  document.getElementById('asisEditCodDiag').value = reg.codDiagnostico || '';
  document.getElementById('asisEditDiag').value = reg.diagnostico || '';
  document.getElementById('asisEditObs').value = reg.observaciones || '';

  onEditTipoNovedadChange();

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function cerrarModalEditarAsistencia() {
  const modal = document.getElementById('modalEditarAsistenciaOverlay');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

function onEditTipoNovedadChange() {
  const nov = document.getElementById('asisEditNovedad')?.value || '';
  const wrapDiag = document.getElementById('asisEditWrapDiag');
  if (wrapDiag) {
    wrapDiag.style.display = nov.toLowerCase().includes('incapacidad') ? 'block' : 'none';
  }
}

async function guardarEdicionAsistencia() {
  const idAsistencia = document.getElementById('asisEditIdAsistencia')?.value;
  const btn = document.getElementById('asisBtnGuardarEdicion');
  const errBox = document.getElementById('asisEditModalError');
  if (errBox) errBox.style.display = 'none';

  const novedad = document.getElementById('asisEditNovedad')?.value;
  const horaEntrada = document.getElementById('asisEditHoraEntrada')?.value;
  const horaSalida = document.getElementById('asisEditHoraSalida')?.value;
  const codDiag = document.getElementById('asisEditCodDiag')?.value;
  const diag = document.getElementById('asisEditDiag')?.value;
  const obs = document.getElementById('asisEditObs')?.value;

  btn.disabled = true;
  btn.textContent = 'Guardando cambios...';

  try {
    const payload = {
      usuario,
      novedad,
      horaEntrada: horaEntrada || null,
      horaSalida: horaSalida || null,
      codDiagnostico: codDiag || null,
      diagnostico: diag || null,
      observaciones: obs || null
    };

    const r = await fetch(`/nomina/api/asistencia/${idAsistencia}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json();

    if (!r.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo actualizar el registro');
    }

    cerrarModalEditarAsistencia();
    await fetchAsistenciaData();
  } catch (err) {
    console.error('[asistencia] Error al editar:', err);
    if (errBox) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } else {
      alert(`Error: ${err.message}`);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar Cambios';
  }
}

async function eliminarAsistenciaRegistro(idAsistencia) {
  if (!confirm('¿Está seguro de que desea eliminar este registro de asistencia? Esta acción no se puede deshacer.')) {
    return;
  }

  try {
    const r = await fetch(`/nomina/api/asistencia/${idAsistencia}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario })
    });
    const data = await r.json();

    if (!r.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo eliminar el registro.');
    }

    await onAsistenciaFiltroChange();
  } catch (err) {
    console.error('[asistencia] Error al eliminar:', err);
    alert(`Error al eliminar: ${err.message}`);
  }
}

// Auto-inicialización cuando el DOM esté listo y el usuario tenga acceso a Asistencia
document.addEventListener('DOMContentLoaded', () => {
  const cfg = obtenerConfigAsistencia();
  if (cfg && (cfg.sinFiltro || (cfg.operacionesFiltro && cfg.operacionesFiltro.length))) {
    if (!_asisState.cargado) {
      initAsistenciaNomina();
    }
  }
});
