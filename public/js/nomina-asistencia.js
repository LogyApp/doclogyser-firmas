/**
 * Módulo de Asistencia y Novedades para Nómina (LogyApp)
 * Gestiona filtros con conteos interactivos (Año, Quincena, Día, Regional, Operación, Novedad),
 * catálogo dinámico con códigos de color de Config_Asistencia adaptados a modo claro/oscuro,
 * selección interactiva de Operación (chips si < 5, select si >= 5),
 * selección obligatoria de Área (Config_Area donde ADMINISTRATIVO='V') para habilitar colaboradores,
 * soporte para apoyo a otra operación restringido a operaciones de la misma regional,
 * dropzones para soporte/incapacidades con cámara y drag&drop,
 * y permisos por rol para registrar días futuros, editar/eliminar registros en estado Yellow o sin importar estado.
 */

const _asisState = {
  cargado: false,
  registros: [],
  total: 0,
  pagina: 1,
  limite: 50,
  totalPaginas: 1,
  novedades: [],
  incapacidades: [],
  novedadesMap: {},
  incapacidadesMap: {},
  metricas: null,
  operaciones: [],
  areasDiaria: [],
  areasNovedad: [],
  areaSeleccionadaDiaria: null,
  areaSeleccionadaNovedad: null,
  operacionSeleccionadaDiaria: null,
  operacionSeleccionadaNovedad: null,
  trabajadoresOperacion: [],
  trabajadoresNovedad: [],
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
    const info = _asisState.novedadesMap[nov] || _asisState.incapacidadesMap[nov];
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

// ══════════════════════════════════════════════════════════════════════════
// INICIALIZACIÓN DE LA PESTAÑA
// ══════════════════════════════════════════════════════════════════════════

async function initAsistenciaNomina() {
  const cfg = obtenerConfigAsistencia();

  let ops = (cfg.operacionesFiltro || []).slice();
  const opsPorReg = cfg.opsPorRegional || {};
  if (!ops.length && Object.keys(opsPorReg).length) {
    const setOps = new Set();
    Object.values(opsPorReg).forEach(list => (list || []).forEach(o => setOps.add(o)));
    ops = Array.from(setOps);
  }
  ops.sort((a, b) => a.localeCompare(b, 'es'));
  _asisState.operaciones = ops;
  const regionales = Object.keys(opsPorReg).sort((a, b) => a.localeCompare(b, 'es'));

  // 1. Selector de Regional en Filtros
  const selFiltroReg = document.getElementById('asisFilterRegional');
  if (selFiltroReg && regionales.length) {
    let regOpts = '<option value="">Todas las regionales</option>';
    regionales.forEach(r => {
      regOpts += `<option value="${esc(r)}">${esc(r)}</option>`;
    });
    selFiltroReg.innerHTML = regOpts;
  }

  // 2. Selector de Operación en Filtros
  const selFiltroOp = document.getElementById('asisFilterOperacion');
  if (selFiltroOp) {
    let opOpts = '<option value="">Todas las operaciones</option>';
    ops.forEach(op => {
      opOpts += `<option value="${esc(op)}">${esc(op)}</option>`;
    });
    selFiltroOp.innerHTML = opOpts;
  }

  // 3. Renderizar selectores de Operación interactivos en modal (chips o select)
  renderizarSelectorOperacionModal('diaria');
  renderizarSelectorOperacionModal('novedad');

  // 4. Fechas por defecto y bloqueo de días futuros según permisos
  const hoyCol = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })).toLocaleDateString('en-CA');
  const inputDiaDiaria = document.getElementById('asisModalDiaDiaria');
  const inputDiaInicio = document.getElementById('asisModalDiaInicio');
  const inputDiaFin = document.getElementById('asisModalDiaFin');

  if (inputDiaDiaria && !inputDiaDiaria.value) inputDiaDiaria.value = hoyCol;
  if (inputDiaInicio && !inputDiaInicio.value) inputDiaInicio.value = hoyCol;
  if (inputDiaFin && !inputDiaFin.value) inputDiaFin.value = hoyCol;

  if (!cfg.puedeRegistrarDiasFuturos) {
    if (inputDiaDiaria) inputDiaDiaria.setAttribute('max', hoyCol);
    if (inputDiaInicio) inputDiaInicio.setAttribute('max', hoyCol);
    // inputDiaFin no tiene max: permite extender novedad hacia el futuro si inició hoy o antes
  }

  // 5. Cargar catálogo de novedades e incapacidades
  await cargarCatalogoNovedades();

  // 6. Montar dropzones de evidencias
  montarZonasArchivoAsistencia();

  // 7. Cargar métricas y registros iniciales
  await cargarMetricasAsistencia();
  await fetchAsistenciaData();
}

// ══════════════════════════════════════════════════════════════════════════
// SELECTORES INTERACTIVOS DE OPERACIÓN (BOTONES SI < 5, SELECT SI >= 5)
// ══════════════════════════════════════════════════════════════════════════

function renderizarSelectorOperacionModal(tipo) {
  const cfg = obtenerConfigAsistencia();
  const containerId = tipo === 'diaria' ? 'asisModalOpDiariaContainer' : 'asisModalOpNovedadContainer';
  const hiddenId = tipo === 'diaria' ? 'asisModalOpDiaria' : 'asisModalOpNovedad';
  const container = document.getElementById(containerId);
  const hiddenInput = document.getElementById(hiddenId);
  if (!container) return;

  const ops = (_asisState.operaciones || []).slice();

  // Si tiene < 5 operaciones y no es sinFiltro (acceso 2 y 3) -> Visual de botones
  const esModoBotones = !cfg.sinFiltro && ops.length < 5;

  if (esModoBotones) {
    container.innerHTML = `
      <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
        ${ops.map(op => `
          <button type="button" class="asis-op-btn" data-op="${esc(op)}" onclick="seleccionarOperacionModal('${tipo}', '${esc(op)}')">
            ${esc(op)}
          </button>
        `).join('')}
      </div>
    `;
  } else {
    container.innerHTML = `
      <select class="filtro-field" style="width:100%; max-width:320px; padding:6px 10px; border:1px solid var(--border); border-radius:6px;" onchange="seleccionarOperacionModal('${tipo}', this.value)">
        <option value="">Seleccione una operación...</option>
        ${ops.map(op => `<option value="${esc(op)}">${esc(op)}</option>`).join('')}
      </select>
    `;
  }

  // Si solo tiene acceso a una operación, debe aparecer ya escogida
  if (ops.length === 1) {
    seleccionarOperacionModal(tipo, ops[0]);
  }
}

async function seleccionarOperacionModal(tipo, operacion) {
  const hiddenId = tipo === 'diaria' ? 'asisModalOpDiaria' : 'asisModalOpNovedad';
  const containerId = tipo === 'diaria' ? 'asisModalOpDiariaContainer' : 'asisModalOpNovedadContainer';
  const hiddenInput = document.getElementById(hiddenId);
  const container = document.getElementById(containerId);

  if (hiddenInput) hiddenInput.value = operacion || '';

  // Actualizar estilo visual activo si es modo botones
  if (container) {
    container.querySelectorAll('.asis-op-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-op') === String(operacion));
    });
    const sel = container.querySelector('select');
    if (sel && sel.value !== operacion) {
      sel.value = operacion || '';
    }
  }

  if (tipo === 'diaria') {
    _asisState.operacionSeleccionadaDiaria = operacion || null;

    // Actualizar lista de operaciones de apoyo (mismo regional que la operación base)
    actualizarOperacionesApoyoRegional(operacion);

    // Limpiar trabajadores seleccionados
    _asisState.trabajadoresSeleccionados.clear();
    actualizarChipsSeleccionados();

    // Cargar áreas de la operación seleccionada
    await cargarAreasOperacion(operacion, 'diaria');
  } else {
    _asisState.operacionSeleccionadaNovedad = operacion || null;
    _asisState.areaSeleccionadaNovedad = null;
    _asisState.trabajadoresNovedad = [];

    const hiddenColab = document.getElementById('asisModalIdTrabajadorNovedad');
    if (hiddenColab) hiddenColab.value = '';

    const colabContainer = document.getElementById('asisModalColabNovedadContainer');
    if (colabContainer) {
      colabContainer.innerHTML = '<span style="font-size:.8rem; color:var(--text-muted); font-style:italic;">Seleccione primero una operación y un área para cargar los colaboradores.</span>';
    }

    await cargarAreasOperacion(operacion, 'novedad');
  }
}

/**
 * Filtra las operaciones disponibles para apoyo: solo las de la misma Regional que la operación base
 */
function actualizarOperacionesApoyoRegional(opBase) {
  const selOpApoya = document.getElementById('asisModalOpApoya');
  const chkApoyo = document.getElementById('asisModalChkApoyo');
  const wrapApoyo = document.getElementById('asisWrapOpApoya');

  if (chkApoyo) chkApoyo.checked = false;
  if (wrapApoyo) wrapApoyo.style.display = 'none';
  if (!selOpApoya) return;

  if (!opBase) {
    selOpApoya.innerHTML = '<option value="">Seleccione primero la operación base...</option>';
    return;
  }

  const cfg = obtenerConfigAsistencia();
  let regionalBase = '';

  for (const [reg, ops] of Object.entries(cfg.opsPorRegional || {})) {
    if (ops.includes(opBase)) {
      regionalBase = reg;
      break;
    }
  }

  // Operaciones de la misma regional excluyendo la operación base
  let opsMismaRegional = [];
  if (regionalBase && cfg.opsPorRegional && cfg.opsPorRegional[regionalBase]) {
    opsMismaRegional = cfg.opsPorRegional[regionalBase].filter(o => o !== opBase);
  }

  // Si el usuario no tiene sinFiltro, intersectar con sus operaciones permitidas
  if (!cfg.sinFiltro && cfg.operacionesFiltro && cfg.operacionesFiltro.length) {
    opsMismaRegional = opsMismaRegional.filter(o => cfg.operacionesFiltro.includes(o));
  }

  opsMismaRegional.sort((a, b) => a.localeCompare(b, 'es'));

  if (!opsMismaRegional.length) {
    selOpApoya.innerHTML = '<option value="">No hay otras operaciones en la misma regional</option>';
    return;
  }

  let opts = '<option value="">Escoge la operación que apoya...</option>';
  opsMismaRegional.forEach(o => {
    opts += `<option value="${esc(o)}">${esc(o)}</option>`;
  });
  selOpApoya.innerHTML = opts;
}

// ══════════════════════════════════════════════════════════════════════════
// CATÁLOGO DE NOVEDADES E INCAPACIDADES
// ══════════════════════════════════════════════════════════════════════════

async function cargarCatalogoNovedades() {
  try {
    const r = await fetch(`/nomina/api/asistencia/novedades?usuario=${encodeURIComponent(usuario)}`);
    const data = await r.json();
    if (data.ok) {
      _asisState.novedades = data.novedades || [];
      _asisState.incapacidades = data.incapacidades || [];
      _asisState.novedadesMap = {};
      _asisState.incapacidadesMap = {};

      _asisState.novedades.forEach(n => {
        _asisState.novedadesMap[n.novedad] = n;
      });
      _asisState.incapacidades.forEach(inc => {
        _asisState.incapacidadesMap[inc.novedad] = inc;
      });

      // Llenar selector del modal Novedad (solo novedades, sin "Asistencia")
      const selNovModal = document.getElementById('asisModalNovedad');
      if (selNovModal) {
        let opts = '<option value="">Seleccione el tipo de novedad...</option>';
        _asisState.novedades.forEach(n => {
          opts += `<option value="${esc(n.novedad)}" data-prefijo="${esc(n.prefijoNovedad)}" data-rango="${n.esRangoFechas ? '1' : '0'}" data-soporte="${n.requiereSoporte ? '1' : '0'}" data-tipodoc="${n.tipoDocumento}" data-descsop="${esc(n.descripcionSoporte || '')}">${esc(n.novedad)}</option>`;
        });
        selNovModal.innerHTML = opts;
      }

      // Llenar selector de Tipo de Incapacidad
      const selIncModal = document.getElementById('asisModalTipoInc');
      if (selIncModal) {
        let opts = '<option value="">Seleccione incapacidad...</option>';
        _asisState.incapacidades.forEach(inc => {
          opts += `<option value="${esc(inc.novedad)}" data-prefijo="${esc(inc.prefijoNovedad)}" data-tipodoc="${inc.tipoDocumento}" data-descsop="${esc(inc.descripcionSoporte || '')}">${esc(inc.novedad)}</option>`;
        });
        selIncModal.innerHTML = opts;
      }

      // Llenar selector del modal de Edición
      const selNovEdit = document.getElementById('asisEditNovedad');
      if (selNovEdit) {
        let opts = '<option value="Asistencia" data-prefijo="SI">Asistencia</option>';
        _asisState.novedades.forEach(n => {
          opts += `<option value="${esc(n.novedad)}" data-prefijo="${esc(n.prefijoNovedad)}">${esc(n.novedad)}</option>`;
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

function seleccionarAreaModal(tipo, areaId, areaNombre) {
  const hiddenId = tipo === 'diaria' ? 'asisModalAreaDiaria' : 'asisModalAreaNovedad';
  const containerId = tipo === 'diaria' ? 'asisModalAreaDiariaContainer' : 'asisModalAreaNovedadContainer';
  const hiddenInput = document.getElementById(hiddenId);
  const container = document.getElementById(containerId);

  if (hiddenInput) hiddenInput.value = areaId || '';

  if (tipo === 'diaria') {
    _asisState.areaSeleccionadaDiaria = areaId ? { id: areaId, nombre: areaNombre } : null;
    if (container) {
      container.querySelectorAll('.asis-area-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-area-id') === String(areaId));
      });
      const sel = container.querySelector('select');
      if (sel && sel.value !== String(areaId)) sel.value = areaId || '';
    }
    cargarTrabajadoresDiaria();
  } else {
    _asisState.areaSeleccionadaNovedad = areaId ? { id: areaId, nombre: areaNombre } : null;
    if (container) {
      container.querySelectorAll('.asis-area-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-area-id') === String(areaId));
      });
      const sel = container.querySelector('select');
      if (sel && sel.value !== String(areaId)) sel.value = areaId || '';
    }
    cargarTrabajadoresNovedad();
  }
}

// ══════════════════════════════════════════════════════════════════════════
// MANEJO DE APOYO DE OTRA OPERACIÓN (ASISTENCIA DIARIA)
// ══════════════════════════════════════════════════════════════════════════

function onToggleApoyoOperacion() {
  const chk = document.getElementById('asisModalChkApoyo');
  const wrap = document.getElementById('asisWrapOpApoya');
  const selOpApoya = document.getElementById('asisModalOpApoya');

  // Seguridad: deseleccionar y vaciar colaboradores elegidos si cambia de opinión
  _asisState.trabajadoresSeleccionados.clear();
  actualizarChipsSeleccionados();

  if (wrap && chk) {
    wrap.style.display = chk.checked ? 'block' : 'none';
  }

  if (chk && chk.checked) {
    if (selOpApoya && selOpApoya.value) {
      cargarTrabajadoresDiaria();
    } else {
      const container = document.getElementById('asisListaTrabajadoresCheckboxes');
      if (container) {
        container.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:.84rem;">Escoja la operación que apoya para cargar sus colaboradores activos.</div>';
      }
    }
  } else {
    cargarTrabajadoresDiaria();
  }
}

function onOpApoyaChange() {
  _asisState.trabajadoresSeleccionados.clear();
  actualizarChipsSeleccionados();
  cargarTrabajadoresDiaria();
}

// Cargar colaboradores activos según Operación y Área seleccionada (Modo Diaria)
async function cargarTrabajadoresDiaria() {
  const chkApoyo = document.getElementById('asisModalChkApoyo');
  const esApoyo = Boolean(chkApoyo && chkApoyo.checked);

  let op = '';
  let area = '';

  if (esApoyo) {
    op = document.getElementById('asisModalOpApoya')?.value || '';
    area = ''; // Para apoyo a otra operación no se restringe por área
  } else {
    op = document.getElementById('asisModalOpDiaria')?.value || '';
    area = document.getElementById('asisModalAreaDiaria')?.value || '';
  }

  const container = document.getElementById('asisListaTrabajadoresCheckboxes');
  const searchInput = document.getElementById('asisBuscarColaboradorDiaria');
  if (searchInput) searchInput.value = '';

  _asisState.trabajadoresSeleccionados.clear();
  actualizarChipsSeleccionados();

  if (!op || (!esApoyo && !area)) {
    if (container) {
      container.innerHTML = esApoyo
        ? '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:.84rem;">Escoja la operación que apoya para cargar sus colaboradores activos.</div>'
        : '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:.84rem;">Seleccione una operación y un área para cargar los colaboradores activos.</div>';
    }
    _asisState.trabajadoresOperacion = [];
    return;
  }

  if (container) container.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:.84rem;">Cargando colaboradores de Maestro_Vinculación...</div>';

  try {
    const qs = new URLSearchParams({
      usuario,
      operacion: op,
      area: area,
      esApoyo: esApoyo ? 'true' : 'false',
      tipoEvento: 'Asistencia'
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

// Filtrar listado de colaboradores en vivo (insensible a mayúsculas/minúsculas)
function filtrarColaboradoresDiaria() {
  const q = (document.getElementById('asisBuscarColaboradorDiaria')?.value || '').toLowerCase().trim();
  if (!q) {
    renderCheckboxesTrabajadores(_asisState.trabajadoresOperacion);
    return;
  }
  const filtrados = _asisState.trabajadoresOperacion.filter(t => 
    (t.nombreCompleto || t.trabajador || '').toLowerCase().includes(q) || 
    String(t.identificacion || '').toLowerCase().includes(q)
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
        <input type="checkbox" value="${t.identificacion}" ${isChecked ? 'checked' : ''} onchange="toggleTrabajadorSeleccionado('${t.identificacion}')" style="width:16px; height:16px; cursor:pointer;">
        <div style="flex:1;">
          <div style="font-weight:700; font-size:.84rem; color:var(--text);">${esc(t.nombreCompleto || t.trabajador || '')} ${badgeRetirado}</div>
          <div style="font-size:.74rem; color:var(--text-muted);">Cédula: ${esc(t.identificacion)} · Cargo: ${esc(t.cargo || 'Operativo')}</div>
        </div>
      </label>
    `;
  }).join('');
}

function toggleTrabajadorSeleccionado(identificacion) {
  const idStr = String(identificacion);
  if (_asisState.trabajadoresSeleccionados.has(idStr)) {
    _asisState.trabajadoresSeleccionados.delete(idStr);
  } else {
    const t = _asisState.trabajadoresOperacion.find(x => String(x.identificacion) === idStr);
    if (t) _asisState.trabajadoresSeleccionados.set(idStr, t);
  }
  actualizarChipsSeleccionados();
}

function seleccionarTodosTrabajadores(marcar = true) {
  if (marcar) {
    _asisState.trabajadoresOperacion.forEach(t => _asisState.trabajadoresSeleccionados.set(String(t.identificacion), t));
  } else {
    _asisState.trabajadoresSeleccionados.clear();
  }
  filtrarColaboradoresDiaria();
  actualizarChipsSeleccionados();
}

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
        <button type="button" onclick="removerChipSeleccionado('${t.identificacion}')" style="background:none; border:none; cursor:pointer; padding:0; line-height:1; font-weight:bold; color:inherit; font-size:12px;">✕</button>
      </span>
    `);
  });
  container.innerHTML = chips.join('');
}

function removerChipSeleccionado(identificacion) {
  _asisState.trabajadoresSeleccionados.delete(String(identificacion));
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

    let opsPermitidas = _asisState.operaciones || [];
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
  const regSel = document.getElementById('asisFilterRegional');
  const opSel = document.getElementById('asisFilterOperacion');
  const regVal = regSel ? regSel.value : '';
  const cfg = obtenerConfigAsistencia();
  const opsPorReg = cfg.opsPorRegional || {};

  let opsDisponibles = [];
  if (regVal && opsPorReg[regVal]) {
    opsDisponibles = opsPorReg[regVal].slice();
  } else {
    opsDisponibles = (_asisState.operaciones || []).slice();
  }
  opsDisponibles.sort((a, b) => a.localeCompare(b, 'es'));

  if (opSel) {
    let opOpts = '<option value="">Todas las operaciones</option>';
    opsDisponibles.forEach(op => {
      opOpts += `<option value="${esc(op)}">${esc(op)}</option>`;
    });
    opSel.innerHTML = opOpts;
    opSel.value = '';
  }
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

  if (tbody) tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding:30px; color:var(--text-muted);">Cargando registros de asistencia...</td></tr>';
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

    await asegurarAreasOperaciones(_asisState.registros);
    renderTablaAsistencias(_asisState.registros);
  } catch (err) {
    console.error('[asistencia] Error fetchAsistenciaData:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:20px; color:#ef4444;">Error al cargar datos: ${esc(err.message)}</td></tr>`;
  }
}

// Función para limpiar el nombre del colaborador (elimina "Identificación ** " si viene de segmentación)
function limpiarNombreColaborador(str) {
  if (!str) return '';
  const partes = String(str).split('**');
  return (partes[partes.length - 1] || '').trim();
}

// Renderizar filas de la tabla (Columna Día con círculo indicador de Estado)
async function asegurarAreasOperaciones(registros) {
  const ops = [...new Set((registros || []).map(r => r.operacion).filter(Boolean))];
  const opsPorCargar = ops.filter(op => !_areasOperacionEditCache[op]);
  if (opsPorCargar.length > 0) {
    await Promise.all(opsPorCargar.map(async (op) => {
      try {
        const r = await fetch(`/nomina/api/asistencia/areas?usuario=${encodeURIComponent(usuario)}&operacion=${encodeURIComponent(op)}`);
        const data = await r.json();
        _areasOperacionEditCache[op] = data.areas || [];
      } catch (e) {
        console.warn('[asistencia] Error precargando áreas para', op, e);
        _areasOperacionEditCache[op] = [];
      }
    }));
  }
}

// ── Control de selección masiva para eliminación ──────────────────────────────
function toggleSelectAllAsistencias(checked) {
  const chks = document.querySelectorAll('.asis-chk-fila');
  chks.forEach(c => { c.checked = checked; });
  actualizarBarraAccionesLote();
}

function onAsisFilaCheckChange() {
  const chks = document.querySelectorAll('.asis-chk-fila');
  const todos = Array.from(chks).every(c => c.checked);
  const alguno = Array.from(chks).some(c => c.checked);
  const chkAll = document.getElementById('asisChkSelectAll');
  if (chkAll) {
    chkAll.checked = chks.length > 0 && todos;
    chkAll.indeterminate = alguno && !todos;
  }
  actualizarBarraAccionesLote();
}

function actualizarBarraAccionesLote() {
  const chks = document.querySelectorAll('.asis-chk-fila:checked');
  const count = chks.length;
  const barra = document.getElementById('asisBarraAccionesLote');
  const lbl = document.getElementById('asisContadorLote');
  if (barra) barra.style.display = count > 0 ? 'inline-flex' : 'none';
  if (lbl) lbl.textContent = `${count} seleccionado${count === 1 ? '' : 's'}`;
}

async function eliminarAsistenciasSeleccionadas() {
  const chks = document.querySelectorAll('.asis-chk-fila:checked');
  const ids = Array.from(chks).map(c => c.value);
  if (!ids.length) {
    alert('No hay registros seleccionados para eliminar.');
    return;
  }

  if (!confirm(`¿Está seguro de que desea eliminar los ${ids.length} registro(s) seleccionados? Esta acción no se puede deshacer.`)) {
    return;
  }

  try {
    const r = await fetch('/nomina/api/asistencia/eliminar-lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const data = await r.json();
    if (!r.ok || !data.ok) {
      throw new Error(data.error || 'Error al eliminar registros');
    }

    alert(`Se eliminaron con éxito ${data.eliminados} registro(s).`);
    const chkAll = document.getElementById('asisChkSelectAll');
    if (chkAll) { chkAll.checked = false; chkAll.indeterminate = false; }
    actualizarBarraAccionesLote();
    await fetchAsistenciaData();
  } catch (err) {
    console.error('[asistencia] Error eliminarAsistenciasSeleccionadas:', err);
    alert(`Error al eliminar: ${err.message}`);
  }
}

async function cambiarAreaApoyoInline(selectEl, idAsistencia, operacion, areaDefecto) {
  const nuevoAreaId = selectEl.value || areaDefecto || null;
  const prevValue = selectEl.getAttribute('data-prev') || '';
  selectEl.disabled = true;
  selectEl.style.boxShadow = '0 0 0 2px var(--accent)';

  try {
    const r = await fetch(`/nomina/api/asistencia/${encodeURIComponent(idAsistencia)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario,
        novedad: 'Asistencia',
        disponible1: nuevoAreaId
      })
    });
    const data = await r.json();
    if (!r.ok || !data.ok) {
      throw new Error(data.error || 'Error al actualizar área apoyo');
    }

    // Actualizar datos locales en memoria
    const reg = _asisState.registros.find(x => String(x.idAsistencia) === String(idAsistencia));
    if (reg) {
      reg.disponible1 = nuevoAreaId;
      const areasOp = _areasOperacionEditCache[operacion] || [];
      const matchArea = areasOp.find(a => String(a.id) === String(nuevoAreaId));
      reg.areaApoyoNombre = matchArea ? matchArea.area : (nuevoAreaId || null);
    }
    selectEl.setAttribute('data-prev', nuevoAreaId);

    // Feedback visual breve en verde
    selectEl.style.boxShadow = '0 0 0 2px #16a34a';
    setTimeout(() => {
      selectEl.style.boxShadow = '';
      selectEl.disabled = false;
    }, 500);
  } catch (err) {
    console.error('[asistencia] Error cambiarAreaApoyoInline:', err);
    alert(`No se pudo cambiar el Área Apoyo: ${err.message}`);
    selectEl.value = prevValue;
    selectEl.style.boxShadow = '0 0 0 2px #ef4444';
    setTimeout(() => {
      selectEl.style.boxShadow = '';
      selectEl.disabled = false;
    }, 1000);
  }
}

// Renderizar filas de la tabla (Columna Día con círculo indicador de Estado)
function renderTablaAsistencias(registros) {
  const tbody = document.getElementById('asistenciaBody');
  if (!tbody) return;

  const cfg = obtenerConfigAsistencia();
  const puedeTodos = !!cfg.puedeEditarTodosEstados;
  const puedeYellow = !!cfg.puedeEditarYellow;
  const puedeEliminar = puedeTodos || puedeYellow;

  const thAcciones = document.getElementById('asisThAcciones');
  if (thAcciones) {
    thAcciones.style.display = puedeEliminar ? '' : 'none';
  }
  const chkAll = document.getElementById('asisChkSelectAll');
  if (chkAll) { chkAll.checked = false; chkAll.indeterminate = false; }
  actualizarBarraAccionesLote();

  tbody.innerHTML = registros.map(r => {
    const estado = r.estado || 'Yellow';
    const esGreen = estado.toLowerCase() === 'green';
    const dotColor = esGreen ? '#16a34a' : '#eab308';
    const dotTitle = esGreen ? 'Bloqueado por Nómina (Solo lectura)' : 'Editable según permisos';
    const dotHtml = `<span style="display:inline-block; width:9px; height:9px; border-radius:50%; background-color:${dotColor}; margin-right:6px; box-shadow:0 0 2px rgba(0,0,0,0.2);" title="${dotTitle}"></span>`;

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
      soportes.push(`<a href="${esc(r.urlSoporte)}" target="_blank" rel="noopener noreferrer" class="btn-icon-circle" title="Ver Soporte" onclick="event.stopPropagation()" style="color:#0284c7; background:rgba(2,132,199,0.1);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg></a>`);
    }
    if (r.urlIncapacidad) {
      soportes.push(`<a href="${esc(r.urlIncapacidad)}" target="_blank" rel="noopener noreferrer" class="btn-icon-circle" title="Ver Incapacidad" onclick="event.stopPropagation()" style="color:#d97706; background:rgba(245,158,11,0.1);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg></a>`);
    }
    if (r.urlHistoriaClinica) {
      soportes.push(`<a href="${esc(r.urlHistoriaClinica)}" target="_blank" rel="noopener noreferrer" class="btn-icon-circle" title="Ver Historia Clínica" onclick="event.stopPropagation()" style="color:#dc2626; background:rgba(239,68,68,0.1);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg></a>`);
    }
    const soportesHtml = soportes.length ? `<div style="display:flex; gap:6px;">${soportes.join('')}</div>` : '<span style="color:var(--text-muted); font-size:.78rem;">-</span>';

    // Permisos de edición y eliminación
    const esYellow = !esGreen;
    const esAsistencia = (r.novedad || '').trim().toLowerCase() === 'asistencia';

    // Edición: Sistema y Nómina pueden todo. Demás roles solo si está en Yellow.
    const puedeEditarFila = puedeTodos || (puedeYellow && esYellow);

    // Eliminación: Sistema y Nómina pueden todo. Demás roles solo si está en Yellow Y la novedad es diferente a Asistencia.
    const puedeEliminarFila = puedeTodos || (puedeYellow && esYellow && !esAsistencia);

    // Columna ACCIONES al principio (con checkbox para lote y botón individual)
    let tdAcciones = '';
    if (puedeEliminar) {
      tdAcciones = `
        <td style="text-align:center;" onclick="event.stopPropagation()">
          <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
            ${puedeEliminarFila ? `
              <input type="checkbox" class="asis-chk-fila" value="${esc(r.idAsistencia)}" onchange="onAsisFilaCheckChange()" onclick="event.stopPropagation()" style="cursor:pointer;">
              <button type="button" class="btn-icon-circle" title="Eliminar registro" onclick="event.stopPropagation(); eliminarAsistenciaRegistro('${esc(r.idAsistencia)}')" style="color:#ef4444; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); padding:4px; border-radius:4px; cursor:pointer;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            ` : '<span style="color:var(--text-muted); font-size:.78rem;">-</span>'}
          </div>
        </td>
      `;
    }

    // Columna ÁREA APOYO (editable inline si es Asistencia y tiene permisos de edición, sin opción "Sin Apoyo")
    let tdAreaApoyo = '';
    const areasOp = _areasOperacionEditCache[r.operacion] || [];
    const valApoyoEfectivo = String(r.disponible1 || r.area || '');
    if (esAsistencia && puedeEditarFila) {
      tdAreaApoyo = `
        <td onclick="event.stopPropagation()" style="font-size:.82rem;">
          <select class="asis-inline-area-apoyo" data-prev="${esc(valApoyoEfectivo)}" onchange="cambiarAreaApoyoInline(this, '${esc(r.idAsistencia)}', '${esc(r.operacion)}', '${esc(r.area || '')}')" onclick="event.stopPropagation()" style="width:100%; min-width:130px; max-width:160px; padding:3px 6px; font-size:.78rem; border:1px solid var(--border); border-radius:4px; background:var(--bg-elevated); color:var(--text); cursor:pointer;">
            ${areasOp.map(a => `<option value="${a.id}" ${valApoyoEfectivo === String(a.id) ? 'selected' : ''}>${esc(a.area)}</option>`).join('')}
          </select>
        </td>
      `;
    } else {
      tdAreaApoyo = `<td style="font-size:.82rem;">${esc(r.areaApoyoNombre || r.disponible1 || r.areaNombre || r.area || '-')}</td>`;
    }

    return `
      <tr class="cesantias-table-row" style="${puedeEditarFila ? 'cursor:pointer;' : ''}" ${puedeEditarFila ? `onclick="abrirModalEditarAsistencia('${esc(r.idAsistencia)}')"` : ''}>
        ${tdAcciones}
        <td style="font-weight:600; font-size:.82rem; white-space:nowrap;">${dotHtml}${esc(r.dia)}</td>
        <td style="font-size:.82rem; white-space:nowrap;">${esc(r.quincena || '-')}</td>
        <td style="font-size:.82rem;">${esc(r.operacion || '-')}</td>
        <td style="font-size:.82rem;">${esc(r.areaNombre || r.area || '-')}</td>
        ${tdAreaApoyo}
        <td>
          <div style="font-weight:700; font-size:.84rem; color:var(--text);">${esc(limpiarNombreColaborador(r.trabajador || r.nombre || ''))}</div>
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
      </tr>
    `;
  }).join('');
}// ══════════════════════════════════════════════════════════════════════════
// MODAL DE REGISTRO INTERACTIVO (INGRESAR EVENTO)
// ══════════════════════════════════════════════════════════════════════════

function abrirModalRegistroAsistencia(modo = 'diaria') {
  const modal = document.getElementById('modalRegistroAsistenciaOverlay');
  if (!modal) return;

  renderizarSelectorOperacionModal('diaria');
  renderizarSelectorOperacionModal('novedad');
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
  if (apoyoChk && !opApoya) {
    alert('Por favor escoja la operación que apoya.');
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
// MODO NOVEDAD: CARGA Y SELECCIÓN DE UN SOLO COLABORADOR (SEGÚN OPERACIÓN Y ÁREA)
// ══════════════════════════════════════════════════════════════════════════

async function cargarTrabajadoresNovedad() {
  const op = document.getElementById('asisModalOpNovedad')?.value || '';
  const area = document.getElementById('asisModalAreaNovedad')?.value || '';
  const container = document.getElementById('asisModalColabNovedadContainer');
  const hiddenInput = document.getElementById('asisModalIdTrabajadorNovedad');
  if (hiddenInput) hiddenInput.value = '';

  if (!op || !area) {
    if (container) {
      container.innerHTML = '<span style="font-size:.8rem; color:var(--text-muted); font-style:italic;">Seleccione primero una operación y un área para cargar los colaboradores.</span>';
    }
    _asisState.trabajadoresNovedad = [];
    return;
  }

  if (container) {
    container.innerHTML = '<span style="font-size:.8rem; color:var(--text-muted);">Cargando colaboradores de Maestro_Vinculación...</span>';
  }

  try {
    const qs = new URLSearchParams({
      usuario,
      operacion: op,
      area: area,
      tipoEvento: 'Novedad'
    });
    const r = await fetch(`/nomina/api/asistencia/trabajadores?${qs.toString()}`);
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.error || 'Error al cargar trabajadores');

    const lista = data.trabajadores || [];
    _asisState.trabajadoresNovedad = lista;

    if (!lista.length) {
      container.innerHTML = '<span style="font-size:.82rem; color:var(--text-muted); font-style:italic;">No se encontraron colaboradores en esta operación y área.</span>';
      return;
    }

    renderSelectorColaboradorNovedad(lista);
  } catch (err) {
    console.error('[asistencia] Error cargarTrabajadoresNovedad:', err);
    if (container) {
      container.innerHTML = `<span style="font-size:.82rem; color:#ef4444;">Error al cargar colaboradores: ${esc(err.message)}</span>`;
    }
  }
}

function renderSelectorColaboradorNovedad(lista) {
  const container = document.getElementById('asisModalColabNovedadContainer');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:6px;">
      <input type="search" id="asisModalFiltroColabNovedad" placeholder="🔍 Filtrar colaborador en esta lista (${lista.length} disponibles)..." oninput="filtrarSelectColaboradorNovedad(this.value)" style="width:100%; padding:6px 10px; font-size:.82rem; border:1px solid var(--border); border-radius:6px;">
      <select id="asisModalSelectColabNovedad" size="5" style="width:100%; border:1px solid var(--border); border-radius:6px; padding:4px; font-size:.84rem; background:var(--bg-elevated); color:var(--text);" onchange="onSeleccionarColaboradorNovedad(this.value)">
        <option value="" disabled selected style="font-style:italic; padding:4px;">-- Seleccione exactamente un colaborador --</option>
        ${lista.map(t => `<option value="${t.identificacion}" data-nombre="${esc(t.nombreCompleto)}" data-trabajador="${esc(t.trabajador || '')}" style="padding:4px 6px;">${esc(t.nombreCompleto)} — C.C. ${t.identificacion}${t.cargo ? ' (' + esc(t.cargo) + ')' : ''}</option>`).join('')}
      </select>
      <div id="asisBadgeColabSeleccionado" style="display:none; margin-top:4px; padding:6px 10px; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); color:#059669; border-radius:6px; font-size:.82rem; font-weight:600;"></div>
    </div>
  `;
}

function filtrarSelectColaboradorNovedad(q) {
  const sel = document.getElementById('asisModalSelectColabNovedad');
  if (!sel) return;
  const term = (q || '').toLowerCase().trim();
  const options = sel.querySelectorAll('option');
  options.forEach((opt, idx) => {
    if (idx === 0) return; // disabled header
    const txt = (opt.textContent || '').toLowerCase();
    opt.style.display = (!term || txt.includes(term)) ? '' : 'none';
  });
}

function onSeleccionarColaboradorNovedad(val) {
  const hiddenInput = document.getElementById('asisModalIdTrabajadorNovedad');
  const badge = document.getElementById('asisBadgeColabSeleccionado');
  const sel = document.getElementById('asisModalSelectColabNovedad');

  if (hiddenInput) hiddenInput.value = val || '';

  if (badge) {
    if (val && sel) {
      const opt = sel.options[sel.selectedIndex];
      const nombre = opt?.getAttribute('data-nombre') || opt?.text || '';
      badge.textContent = `✓ Seleccionado: ${nombre}`;
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// BÚSQUEDA Y SELECCIÓN DE DIAGNÓSTICO CIE-10 (CONFIG_DIAGNOSTICO)
// ══════════════════════════════════════════════════════════════════════════

let _timerBusquedaDiag = null;

function onBuscarDiagnosticoModal(modo) {
  clearTimeout(_timerBusquedaDiag);
  const inputId = modo === 'crear' ? 'asisModalBuscarDiag' : 'asisEditBuscarDiag';
  const dropId = modo === 'crear' ? 'asisResultadosDiag' : 'asisEditResultadosDiag';
  const hiddenCodId = modo === 'crear' ? 'asisModalCodDiag' : 'asisEditCodDiag';
  const hiddenDiagId = modo === 'crear' ? 'asisModalDiag' : 'asisEditDiag';

  const input = document.getElementById(inputId);
  const drop = document.getElementById(dropId);
  const hiddenCod = document.getElementById(hiddenCodId);
  const hiddenDiag = document.getElementById(hiddenDiagId);

  const q = (input?.value || '').trim();

  if (!q || q.length < 2) {
    if (drop) { drop.innerHTML = ''; drop.style.display = 'none'; }
    if (hiddenCod) hiddenCod.value = '';
    if (hiddenDiag) hiddenDiag.value = '';
    return;
  }

  _timerBusquedaDiag = setTimeout(async () => {
    try {
      if (drop) {
        drop.innerHTML = '<div style="padding:8px 12px; font-size:.82rem; color:var(--text-muted);">Buscando diagnósticos CIE-10...</div>';
        drop.style.display = 'block';
      }
      const r = await fetch(`/nomina/api/asistencia/diagnosticos?usuario=${encodeURIComponent(usuario)}&q=${encodeURIComponent(q)}`);
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'Error al buscar diagnóstico');

      const items = data.diagnosticos || [];
      if (!items.length) {
        drop.innerHTML = '<div style="padding:8px 12px; font-size:.82rem; color:var(--text-muted); font-style:italic;">No se encontraron diagnósticos que coincidan.</div>';
        drop.style.display = 'block';
        return;
      }

      drop.innerHTML = items.map(d => `
        <div style="padding:7px 10px; font-size:.82rem; cursor:pointer; border-bottom:1px solid var(--border); display:flex; gap:8px; align-items:baseline;"
             onmouseover="this.style.background='var(--accent-soft, rgba(0,0,0,0.05))'"
             onmouseout="this.style.background=''"
             onclick="seleccionarDiagnosticoModal('${modo}', '${esc(d.cod)}', '${esc(d.descripcion)}')">
          <strong style="color:var(--accent); min-width:48px;">${esc(d.cod)}</strong>
          <span style="color:var(--text);">${esc(d.descripcion)}</span>
        </div>
      `).join('');
      drop.style.display = 'block';
    } catch (err) {
      console.error('[asistencia] Error en onBuscarDiagnosticoModal:', err);
      if (drop) {
        drop.innerHTML = `<div style="padding:8px 12px; font-size:.82rem; color:#ef4444;">${esc(err.message)}</div>`;
        drop.style.display = 'block';
      }
    }
  }, 220);
}

function seleccionarDiagnosticoModal(modo, cod, descripcion) {
  const inputId = modo === 'crear' ? 'asisModalBuscarDiag' : 'asisEditBuscarDiag';
  const dropId = modo === 'crear' ? 'asisResultadosDiag' : 'asisEditResultadosDiag';
  const hiddenCodId = modo === 'crear' ? 'asisModalCodDiag' : 'asisEditCodDiag';
  const hiddenDiagId = modo === 'crear' ? 'asisModalDiag' : 'asisEditDiag';

  const input = document.getElementById(inputId);
  const drop = document.getElementById(dropId);
  const hiddenCod = document.getElementById(hiddenCodId);
  const hiddenDiag = document.getElementById(hiddenDiagId);

  if (hiddenCod) hiddenCod.value = cod || '';
  if (hiddenDiag) hiddenDiag.value = descripcion || '';
  if (input) input.value = cod ? `${cod} - ${descripcion}` : '';
  if (drop) { drop.innerHTML = ''; drop.style.display = 'none'; }
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
    badge.textContent = 'Fecha fin debe ser posterior o igual a inicio';
    badge.style.color = '#ef4444';
  } else {
    badge.textContent = `${diff} día(s)`;
    badge.style.color = 'var(--text)';
  }

  // Si es Incapacidad, evaluar obligatoriedad de Historia Clínica si días >= 3
  const novedad = document.getElementById('asisModalNovedad')?.value || '';
  const esIncapacidad = novedad === 'Incapacidad' || novedad.toLowerCase().includes('incapacidad');
  if (esIncapacidad) {
    const badgeReq = document.getElementById('asisReqHistoriaBadge');
    if (badgeReq) {
      if (diff >= 3) {
        badgeReq.innerHTML = '<span style="color:#ef4444; font-weight:700;">(Obligatorio por ser >= 3 días) *</span>';
      } else {
        badgeReq.innerHTML = '<span style="color:var(--text-muted); font-weight:normal;">(Opcional por ser < 3 días)</span>';
      }
    }
  }
}

function onTipoNovedadModalChange() {
  const sel = document.getElementById('asisModalNovedad');
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  const novedad = sel.value;
  const esIncapacidad = novedad === 'Incapacidad' || novedad.toLowerCase().includes('incapacidad');
  const esRango = opt?.getAttribute('data-rango') === '1';
  const requiereSoporte = opt?.getAttribute('data-soporte') === '1';
  const tipoDoc = Number(opt?.getAttribute('data-tipodoc') || 0);
  const descSoporte = opt?.getAttribute('data-descsop') || '';

  // 1. Visibilidad de Fecha Final
  const wrapDiaFin = document.getElementById('asisWrapDiaFin');
  const inputDiaInicio = document.getElementById('asisModalDiaInicio');
  const inputDiaFin = document.getElementById('asisModalDiaFin');

  if (wrapDiaFin) {
    if (esRango) {
      wrapDiaFin.style.display = 'block';
    } else {
      wrapDiaFin.style.display = 'none';
      if (inputDiaInicio && inputDiaFin) {
        inputDiaFin.value = inputDiaInicio.value;
      }
    }
  }
  calcularDiasNovedad();

  // 2. Visibilidad de Incapacidad vs Soporte
  const secIncapacidad = document.getElementById('asisSecIncapacidad');
  const secSoporte = document.getElementById('asisSecSoporte');
  const labelSoporte = document.getElementById('asisLabelSoporte');

  if (esIncapacidad) {
    if (secIncapacidad) secIncapacidad.style.display = 'block';
    if (secSoporte) secSoporte.style.display = 'none';
  } else {
    if (secIncapacidad) secIncapacidad.style.display = 'none';
    if (requiereSoporte || tipoDoc !== 0) {
      if (secSoporte) secSoporte.style.display = 'block';
      if (labelSoporte) {
        labelSoporte.textContent = (descSoporte || 'Adjuntar Documento de Soporte (PDF o Foto)') + ' *';
      }
    } else {
      if (secSoporte) secSoporte.style.display = 'none';
    }
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
  const optNov = novedadSel?.options[novedadSel?.selectedIndex];
  const prefijoNovedad = optNov?.getAttribute('data-prefijo') || 'NOV';
  const esRango = optNov?.getAttribute('data-rango') === '1';
  const requiereSoporte = optNov?.getAttribute('data-soporte') === '1';
  const tipoDoc = Number(optNov?.getAttribute('data-tipodoc') || 0);

  const diaInicio = document.getElementById('asisModalDiaInicio')?.value;
  let diaFin = document.getElementById('asisModalDiaFin')?.value;
  if (!esRango) {
    diaFin = diaInicio;
  }

  const codDiag = document.getElementById('asisModalCodDiag')?.value;
  const diag = document.getElementById('asisModalDiag')?.value;
  const tipoIncSel = document.getElementById('asisModalTipoInc');
  const tipoInc = tipoIncSel?.value;
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
  if (!diaInicio) {
    alert('Por favor ingrese la fecha de inicio.');
    return;
  }
  if (esRango && !diaFin) {
    alert('Por favor ingrese la fecha de fin.');
    return;
  }

  const d1 = new Date(diaInicio + 'T12:00:00Z');
  const d2 = new Date(diaFin + 'T12:00:00Z');
  const diasTotales = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  if (diasTotales <= 0) {
    alert('La fecha final debe ser igual o posterior a la fecha de inicio.');
    return;
  }

  const esIncapacidad = novedad === 'Incapacidad' || novedad.toLowerCase().includes('incapacidad');

  const fileSoporte = document.getElementById('asisFileSoporte')?.files[0];
  const fileInc = document.getElementById('asisFileIncapacidad')?.files[0];
  const fileHC = document.getElementById('asisFileHistoria')?.files[0];

  // Validaciones estrictas de archivos
  if (esIncapacidad) {
    if (!tipoInc) {
      alert('Por favor seleccione el Tipo de Incapacidad.');
      return;
    }
    if (!fileInc) {
      alert('Es obligatorio adjuntar el documento PDF de la incapacidad.');
      return;
    }
    if (diasTotales >= 3 && !fileHC) {
      alert('Para incapacidades iguales o superiores a 3 días, es obligatorio adjuntar la Historia Clínica.');
      return;
    }
  } else if (requiereSoporte || tipoDoc !== 0) {
    if (!fileSoporte) {
      alert('Es obligatorio adjuntar el documento de soporte PDF.');
      return;
    }
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

  if (fileSoporte) formData.append('soporte', fileSoporte);
  if (fileInc) formData.append('incapacidad', fileInc);
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

const _areasOperacionEditCache = {};

async function cargarAreasParaEdicion(operacion, idSeleccionado, areaOrigenDefecto) {
  const sel = document.getElementById('asisEditAreaApoyo');
  if (!sel) return;
  sel.innerHTML = '<option value="">Cargando áreas...</option>';

  let areas = _areasOperacionEditCache[operacion];
  if (!areas) {
    try {
      const r = await fetch(`/nomina/api/asistencia/areas?usuario=${encodeURIComponent(usuario)}&operacion=${encodeURIComponent(operacion)}`);
      const data = await r.json();
      areas = data.areas || [];
      _areasOperacionEditCache[operacion] = areas;
    } catch (e) {
      console.error('[asistencia] Error cargando áreas para edición:', e);
      areas = [];
    }
  }

  sel.innerHTML = areas.map(a => `<option value="${a.id}">${esc(a.area)}</option>`).join('');

  const targetVal = String(idSeleccionado || areaOrigenDefecto || '');
  if (targetVal) {
    sel.value = targetVal;
  }
}

function abrirModalEditarAsistencia(idAsistencia) {
  const reg = _asisState.registros.find(r => String(r.idAsistencia) === String(idAsistencia));
  if (!reg) return;

  const modal = document.getElementById('modalEditarAsistenciaOverlay');
  if (!modal) return;

  const errBox = document.getElementById('asisEditModalError');
  if (errBox) errBox.style.display = 'none';

  document.getElementById('asisEditIdAsistencia').value = reg.idAsistencia;
  document.getElementById('asisEditColaborador').value = `${reg.cedula || ''} - ${limpiarNombreColaborador(reg.trabajador || reg.nombre || '')}`;
  document.getElementById('asisEditDia').value = reg.dia || '';
  document.getElementById('asisEditOperacion').value = reg.operacion || '';

  const inputAreaOrigen = document.getElementById('asisEditAreaOrigen');
  if (inputAreaOrigen) {
    inputAreaOrigen.value = reg.areaNombre || reg.area || '';
  }

  document.getElementById('asisEditNovedad').value = reg.novedad || 'Asistencia';
  document.getElementById('asisEditHoraEntrada').value = reg.horaLlegada || '';
  document.getElementById('asisEditHoraSalida').value = reg.horaSalida || '';
  document.getElementById('asisEditCodDiag').value = reg.codDiagnostico || '';
  document.getElementById('asisEditDiag').value = reg.diagnostico || '';

  const inputBuscarDiag = document.getElementById('asisEditBuscarDiag');
  if (inputBuscarDiag) {
    if (reg.codDiagnostico || reg.diagnostico) {
      inputBuscarDiag.value = [reg.codDiagnostico, reg.diagnostico].filter(Boolean).join(' - ');
    } else {
      inputBuscarDiag.value = '';
    }
  }

  document.getElementById('asisEditObs').value = reg.observaciones || '';

  // Cargar áreas de la operación para Área Apoyo
  cargarAreasParaEdicion(reg.operacion, reg.disponible1, reg.area);

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
  const wrapHorario = document.getElementById('asisEditWrapHorario');
  const wrapDiag = document.getElementById('asisEditWrapDiag');
  const selAreaApoyo = document.getElementById('asisEditAreaApoyo');
  const hintAreaApoyo = document.getElementById('asisEditAreaApoyoHint');

  const esAsistencia = nov === 'Asistencia';
  const esIncapacidad = nov.toLowerCase().includes('incapacidad');

  if (wrapHorario) wrapHorario.style.display = esAsistencia ? 'contents' : 'none';
  if (wrapDiag) wrapDiag.style.display = esIncapacidad ? 'block' : 'none';

  if (selAreaApoyo) {
    selAreaApoyo.disabled = !esAsistencia;
    selAreaApoyo.style.opacity = esAsistencia ? '1' : '0.6';
  }
  if (hintAreaApoyo) {
    hintAreaApoyo.style.display = esAsistencia ? 'none' : 'block';
  }
}

async function guardarEdicionAsistencia() {
  const btn = document.getElementById('asisBtnGuardarEdicion');
  const errBox = document.getElementById('asisEditModalError');
  if (errBox) errBox.style.display = 'none';

  const idAsistencia = document.getElementById('asisEditIdAsistencia')?.value;
  const dia = document.getElementById('asisEditDia')?.value;
  const novedad = document.getElementById('asisEditNovedad')?.value;
  const horaEntrada = document.getElementById('asisEditHoraEntrada')?.value || null;
  const horaSalida = document.getElementById('asisEditHoraSalida')?.value || null;
  const codDiagnostico = document.getElementById('asisEditCodDiag')?.value || null;
  const diagnostico = document.getElementById('asisEditDiag')?.value || null;
  const observaciones = document.getElementById('asisEditObs')?.value || '';

  const esAsistencia = novedad === 'Asistencia';
  let areaApoyo = null;
  if (esAsistencia) {
    const regOrig = _asisState.registros.find(x => String(x.idAsistencia) === String(idAsistencia));
    areaApoyo = document.getElementById('asisEditAreaApoyo')?.value || regOrig?.area || null;
  }

  if (!idAsistencia || !dia || !novedad) {
    alert('Faltan campos obligatorios para actualizar el registro.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Guardando cambios...';
  }

  try {
    const r = await fetch(`/nomina/api/asistencia/${idAsistencia}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario,
        dia,
        novedad,
        horaEntrada,
        horaSalida,
        disponible1: esAsistencia ? areaApoyo : undefined,
        codDiagnostico,
        diagnostico,
        observaciones
      })
    });
    const data = await r.json();

    if (!r.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo actualizar el registro');
    }

    alert('Registro actualizado con éxito.');
    cerrarModalEditarAsistencia();
    await fetchAsistenciaData();
  } catch (err) {
    console.error('[asistencia] Error guardarEdicionAsistencia:', err);
    if (errBox) {
      errBox.textContent = err.message || 'Error al actualizar el registro';
      errBox.style.display = 'block';
    } else {
      alert(`Error: ${err.message}`);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Guardar Cambios';
    }
  }
}

async function eliminarAsistenciaRegistro(idAsistencia) {
  if (!confirm('¿Está seguro de que desea eliminar este registro de asistencia/novedad? Esta acción no se puede deshacer.')) {
    return;
  }

  try {
    const r = await fetch(`/nomina/api/asistencia/${idAsistencia}?usuario=${encodeURIComponent(usuario)}`, {
      method: 'DELETE'
    });
    const data = await r.json();

    if (!r.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo eliminar el registro.');
    }

    alert('Registro eliminado con éxito.');
    await onAsistenciaFiltroChange();
  } catch (err) {
    console.error('[asistencia] Error eliminarAsistenciaRegistro:', err);
    alert(`Error al eliminar: ${err.message}`);
  }
}

// Cerrar listas flotantes de diagnósticos al hacer clic por fuera
document.addEventListener('click', e => {
  const dropCrear = document.getElementById('asisResultadosDiag');
  if (dropCrear && !e.target.closest('#asisModalBuscarDiag') && !e.target.closest('#asisResultadosDiag')) {
    dropCrear.style.display = 'none';
  }
  const dropEdit = document.getElementById('asisEditResultadosDiag');
  if (dropEdit && !e.target.closest('#asisEditBuscarDiag') && !e.target.closest('#asisEditResultadosDiag')) {
    dropEdit.style.display = 'none';
  }
});

// Inicialización automática cuando la pestaña se activa
window.addEventListener('DOMContentLoaded', () => {
  if (window.location.search.includes('tab=asistenciaynovedades') || window.location.search.includes('tab=asistencia')) {
    initAsistenciaNomina();
  }
});
