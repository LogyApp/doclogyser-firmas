/**
 * nomina-control-quincena.js
 * Nómina › Asistencia y Novedades › Control de quincena.
 * Tablero por operación y día (¿quién falta por asistencia o novedad?) y planilla persona × día.
 * Datos: GET /nomina/api/asistencia/control (src/services/controlQuincena.js).
 */
const _cq = {
  fecha: null,          // cualquier día de la quincena consultada
  regional: '',
  datos: null,
  operacion: null,      // operación abierta en detalle
  detalle: null,
  soloPendientes: true,
  cargando: false
};

const CQ_ESTADOS = {
  ok:            { txt: 'Registrado',              clase: 'cq-ok' },
  relleno:       { txt: 'Nuevo / Retirado / Traslado', clase: 'cq-relleno' },
  pendiente:     { txt: 'Falta registrar',         clase: 'cq-pend' },
  falta_aoo:     { txt: 'Apoyó en otra operación: falta "Apoyo a Otra Operación"', clase: 'cq-pend' },
  falta_relleno: { txt: 'Falta Nuevo / Retirado / Traslado (botón Acomodar)', clase: 'cq-falta-rell' },
  duplicado:     { txt: 'Registro repetido',       clase: 'cq-alerta' },
  conflicto:     { txt: 'Registro que no corresponde', clase: 'cq-alerta' },
  futuro:        { txt: 'Día futuro',              clase: 'cq-futuro' }
};

function cqEsc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function cqHoy() { return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10); }
function cqSumarDias(iso, n) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function cqColorAvance(v) {
  if (v == null) return 'cq-na';
  if (v >= 100) return 'cq-a100';
  if (v >= 90) return 'cq-a90';
  if (v >= 70) return 'cq-a70';
  return 'cq-a0';
}
const CQ_DIAS_SEM = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
function cqCabeceraDia(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return `<span class="cq-dsem">${CQ_DIAS_SEM[d.getUTCDay()]}</span>${Number(iso.slice(8, 10))}`;
}

function switchAsisSubVista(vista) {
  document.getElementById('asisSubBtnRegistros').classList.toggle('active', vista === 'registros');
  document.getElementById('asisSubBtnControl').classList.toggle('active', vista === 'control');
  document.getElementById('asisVistaRegistros').style.display = vista === 'registros' ? 'block' : 'none';
  document.getElementById('asisVistaControl').style.display = vista === 'control' ? 'block' : 'none';
  if (vista === 'control' && !_cq.datos) iniciarControlQuincena();
}

function iniciarControlQuincena() {
  _cq.fecha = cqHoy();
  const cfg = typeof obtenerConfigAsistencia === 'function' ? obtenerConfigAsistencia() : {};
  const regionales = Object.keys(cfg.opsPorRegional || {}).sort((a, b) => a.localeCompare(b, 'es'));
  const sel = document.getElementById('cqRegional');
  if (sel) {
    sel.innerHTML = '<option value="">Todas las regionales</option>' + regionales.map(r => `<option value="${cqEsc(r)}">${cqEsc(r)}</option>`).join('');
    sel.style.display = regionales.length > 1 ? '' : 'none';
  }
  cargarControlQuincena();
}

function cqCambiarQuincena(delta) {
  const base = _cq.operacion && _cq.detalle ? _cq.detalle : _cq.datos;
  const q = base && base.quincena;
  if (!q) return;
  _cq.fecha = delta < 0 ? cqSumarDias(q.desde, -1) : cqSumarDias(q.hasta, 1);
  if (_cq.operacion) cqAbrirOperacion(_cq.operacion); else cargarControlQuincena();
}

function cqCambiarRegional() {
  _cq.regional = document.getElementById('cqRegional').value;
  cqVolverTablero();
}

async function cqPedir(params) {
  const qs = new URLSearchParams({ usuario, fecha: _cq.fecha, ...params });
  const r = await fetch(`/nomina/api/asistencia/control?${qs.toString()}`);
  const data = await r.json();
  if (!r.ok || !data.ok) throw new Error(data.error || 'No se pudo cargar el control de quincena');
  return data;
}

function cqEstadoCarga(msg, error = false) {
  const el = document.getElementById('cqContenido');
  el.innerHTML = `<div class="cq-vacio ${error ? 'cq-error' : ''}">${cqEsc(msg)}</div>`;
}

async function cargarControlQuincena() {
  _cq.operacion = null;
  cqEstadoCarga('Cargando…');
  try {
    _cq.datos = await cqPedir({ regional: _cq.regional });
    cqPintarCabecera(_cq.datos);
    cqPintarTablero(_cq.datos);
  } catch (err) {
    cqEstadoCarga(err.message, true);
  }
}

function cqPintarCabecera(d, op = null) {
  document.getElementById('cqQuincenaTxt').textContent = d.quincena.nombre;
  const futura = d.quincena.desde > d.hoy;
  document.getElementById('cqBtnSig').disabled = futura;
  const r = op ? op.resumen : d.resumen;
  const kpis = document.getElementById('cqKpis');
  if (!r) { kpis.innerHTML = ''; return; }
  kpis.innerHTML = `
    <div class="cq-kpi"><div class="cq-kpi-val ${cqColorAvance(r.avance)}-txt">${r.avance == null ? '—' : `${r.avance}%`}</div><div class="cq-kpi-lbl">Avance hasta hoy</div></div>
    ${op ? `<div class="cq-kpi"><div class="cq-kpi-val">${op.plantilla}</div><div class="cq-kpi-lbl">Personas en la quincena</div></div>`
         : `<div class="cq-kpi"><div class="cq-kpi-val">${d.resumen.operacionesAl100} / ${d.operaciones.length}</div><div class="cq-kpi-lbl">Operaciones al 100%</div></div>`}
    <div class="cq-kpi"><div class="cq-kpi-val ${r.pendientes ? 'cq-a0-txt' : ''}">${formatMiles(r.pendientes)}</div><div class="cq-kpi-lbl">Pendientes</div></div>
    <div class="cq-kpi"><div class="cq-kpi-val ${(r.duplicados + r.conflictos) ? 'cq-a70-txt' : ''}">${formatMiles(r.duplicados + r.conflictos)}</div><div class="cq-kpi-lbl">Repetidos o que no corresponden</div></div>`;
}

function cqPintarTablero(d) {
  const el = document.getElementById('cqContenido');
  if (!d.operaciones.length) { cqEstadoCarga('No hay operaciones para mostrar.'); return; }
  const ordenadas = d.operaciones.slice().sort((a, b) => (a.resumen.avance ?? 101) - (b.resumen.avance ?? 101) || a.operacion.localeCompare(b.operacion, 'es'));
  const cab = d.dias.map(x => `<th class="cq-th-dia ${x > d.hoy ? 'cq-col-fut' : ''}">${cqCabeceraDia(x)}</th>`).join('');
  const filas = ordenadas.map(o => {
    const celdas = o.porDia.map(c => {
      if (c.dia > d.hoy) return `<td class="cq-col-fut"></td>`;
      const alerta = c.duplicados + c.conflictos;
      const tip = `${c.dia}: ${c.esperados - c.pendientes} de ${c.esperados}` + (c.pendientes ? ` · faltan ${c.pendientes}` : '') + (alerta ? ` · ${alerta} con alerta` : '') + (c.apoyosRecibidos ? ` · ${c.apoyosRecibidos} apoyos recibidos` : '');
      return `<td class="cq-celda ${cqColorAvance(c.avance)}" title="${cqEsc(tip)}">${c.pendientes ? c.pendientes : '✓'}${alerta ? '<span class="cq-punto"></span>' : ''}</td>`;
    }).join('');
    return `<tr class="cq-fila-op" data-op="${cqEsc(o.operacion)}" onclick="cqAbrirOperacion(this.dataset.op)">
      <th class="cq-op"><div class="cq-op-nom">${cqEsc(o.operacion)}</div><div class="cq-op-sub">${cqEsc(o.regional)} · ${o.plantilla} personas</div></th>
      <td class="cq-total ${cqColorAvance(o.resumen.avance)}">${o.resumen.avance == null ? '—' : `${o.resumen.avance}%`}</td>
      ${celdas}
    </tr>`;
  }).join('');
  el.innerHTML = `
    <div class="cq-ayuda">Cada casilla muestra cuántas personas <b>faltan</b> por registrar asistencia o novedad ese día (✓ = completo). El punto naranja indica registros repetidos o que no corresponden. Toque una operación para ver quiénes son.</div>
    <div class="cq-tabla-wrap"><table class="cq-tabla">
      <thead><tr><th class="cq-op">Operación</th><th class="cq-total">Avance</th>${cab}</tr></thead>
      <tbody>${filas}</tbody>
    </table></div>`;
}

function cqVolverTablero() {
  _cq.operacion = null;
  _cq.detalle = null;
  cargarControlQuincena();
}

async function cqAbrirOperacion(operacion) {
  _cq.operacion = operacion;
  cqEstadoCarga('Cargando planilla…');
  try {
    const d = await cqPedir({ operacion, detalle: '1' });
    _cq.datos = _cq.datos && _cq.datos.quincena.desde === d.quincena.desde ? _cq.datos : null;
    _cq.detalle = d;
    const op = d.operaciones[0];
    if (!op) { cqEstadoCarga('No tiene acceso a esta operación.', true); return; }
    cqPintarCabecera(d, op);
    cqPintarDetalle(d, op);
  } catch (err) {
    cqEstadoCarga(err.message, true);
  }
}

function cqToggleSoloPendientes(chk) {
  _cq.soloPendientes = chk.checked;
  if (_cq.detalle) cqPintarDetalle(_cq.detalle, _cq.detalle.operaciones[0]);
}

function cqPintarDetalle(d, op) {
  const el = document.getElementById('cqContenido');
  const filas = (op.trabajadores || []).filter(t => !_cq.soloPendientes || t.pendientes || t.alertas);
  const cab = d.dias.map(x => `<th class="cq-th-dia ${x > d.hoy ? 'cq-col-fut' : ''}">${cqCabeceraDia(x)}</th>`).join('');
  const cuerpo = filas.map(t => {
    const celdas = t.celdas.map((c, i) => {
      const est = CQ_ESTADOS[c.estado] || {};
      const texto = c.estado === 'pendiente' || c.estado === 'falta_relleno' ? '—' : (c.codigo || '');
      const tip = `${d.dias[i]} · ${est.txt || ''}${c.detalle ? `: ${c.detalle}` : ''}`;
      return `<td class="cq-cod ${est.clase || ''}" title="${cqEsc(tip)}" onclick="cqVerCelda(this)" data-tip="${cqEsc(tip)}">${cqEsc(texto)}</td>`;
    }).join('');
    return `<tr>
      <th class="cq-op"><div class="cq-op-nom">${cqEsc(t.nombre)}</div><div class="cq-op-sub">${cqEsc(t.identificacion)}${t.cargo ? ` · ${cqEsc(t.cargo)}` : ''}</div></th>
      <td class="cq-total ${t.pendientes ? 'cq-a0' : (t.alertas ? 'cq-a70' : 'cq-a100')}">${t.pendientes ? `${t.pendientes} ${t.pendientes === 1 ? "falta" : "faltan"}` : (t.alertas ? `${t.alertas} alerta${t.alertas > 1 ? 's' : ''}` : '✓')}</td>
      ${celdas}
    </tr>`;
  }).join('');
  const ocultos = (op.trabajadores || []).length - filas.length;

  const apoyos = (op.apoyosRecibidos || []).map(a =>
    `<li><b>${cqEsc(a.nombre)}</b> (${cqEsc(a.identificacion)}) de ${cqEsc(a.desde || 'otra operación')}: ${a.dias.sort().map(x => Number(x.slice(8, 10))).join(', ')}</li>`).join('');
  const fuera = (op.fueraDePlantilla || []).map(f =>
    `<li><b>${cqEsc(f.nombre)}</b> (${cqEsc(f.identificacion)}) día ${Number(f.dia.slice(8, 10))}: ${cqEsc(f.codigo)}${f.opDia ? ` — ese día pertenecía a ${cqEsc(f.opDia)}` : ' — no está en la plantilla de esta operación'}</li>`).join('');

  el.innerHTML = `
    <div class="cq-det-hd">
      <button type="button" class="btn-reset cq-volver" onclick="cqVolverTablero()">‹ Todas las operaciones</button>
      <div class="cq-det-tit">${cqEsc(op.operacion)} <span class="cq-op-sub">${cqEsc(op.regional)}</span></div>
      <div class="cq-det-acc">
        <label class="cq-chk"><input type="checkbox" ${_cq.soloPendientes ? 'checked' : ''} onchange="cqToggleSoloPendientes(this)"> Solo con pendientes o alertas</label>
        <button type="button" class="btn-reset" onclick="cqAcomodar()" title="Pone o corrige Nuevo, Retirado y Traslado según las fechas de ingreso, retiro y traslado">Acomodar Nuevo / Retirado / Traslado</button>
        <button type="button" class="btn-guardar-ficha cq-btn-reg" onclick="abrirModalRegistroAsistencia('diaria')">+ Registrar</button>
      </div>
    </div>
    <div class="cq-leyenda">
      <span><i class="cq-ok"></i>Registrado</span><span><i class="cq-relleno"></i>Nuevo / Retirado / Traslado</span>
      <span><i class="cq-pend"></i>Falta registrar</span><span><i class="cq-falta-rell"></i>Falta relleno</span>
      <span><i class="cq-alerta"></i>Repetido o no corresponde</span>
    </div>
    <div id="cqTip" class="cq-tip" style="display:none"></div>
    ${filas.length ? `<div class="cq-tabla-wrap"><table class="cq-tabla cq-planilla">
      <thead><tr><th class="cq-op">Colaborador</th><th class="cq-total">Estado</th>${cab}</tr></thead>
      <tbody>${cuerpo}</tbody>
    </table></div>` : `<div class="cq-vacio">${op.trabajadores && op.trabajadores.length ? '¡Todo al día! Nadie tiene pendientes ni alertas en esta quincena.' : 'No hay personas en la plantilla de esta quincena.'}</div>`}
    ${ocultos > 0 ? `<div class="cq-nota">${ocultos} persona(s) al día no se muestran. Quite el filtro para verlas.</div>` : ''}
    ${apoyos ? `<div class="cq-bloque"><div class="cq-bloque-tit">Apoyos recibidos de otras operaciones</div><div class="cq-nota">Solo registran asistencia aquí; su descanso y novedades los pone su operación. No cuentan para el porcentaje.</div><ul>${apoyos}</ul></div>` : ''}
    ${fuera ? `<div class="cq-bloque cq-bloque-alerta"><div class="cq-bloque-tit">Registros en esta operación de personas que no le pertenecían ese día</div><ul>${fuera}</ul></div>` : ''}`;
}

function cqVerCelda(td) {
  const tip = document.getElementById('cqTip');
  if (!tip) return;
  tip.textContent = td.dataset.tip || '';
  tip.style.display = 'block';
}

async function cqAcomodar() {
  if (!_cq.operacion || !_cq.detalle) return;
  if (!confirm(`Se pondrán o corregirán los días de Nuevo, Retirado y Traslado de ${_cq.operacion} en la ${_cq.detalle.quincena.nombre}, según las fechas de ingreso, retiro y traslado. ¿Continuar?`)) return;
  try {
    const r = await fetch('/nomina/api/asistencia/control/acomodar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, operacion: _cq.operacion, fecha: _cq.detalle.quincena.desde })
    });
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.error || 'No se pudo acomodar');
    alert(`Listo: ${data.insertados} día(s) agregados y ${data.eliminados} corregidos.` +
      (data.conflictos ? `\n${data.conflictos} día(s) no se tocaron porque ya tienen un registro propio: revíselos en la planilla.` : ''));
    cqAbrirOperacion(_cq.operacion);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}
