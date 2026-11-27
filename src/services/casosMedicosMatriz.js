// SST › Casos Médicos: lo que antes se llevaba en la "Matriz de casos médicos" (Excel de noviembre 2026).
// - Campos del caso: estado laboral, origen, concepto, examen post-incapacidad, adaptación del puesto
//   (Res. 1843/2025, 20 días hábiles), proceso de calificación, APT y observación administrativa.
// - Registros por caso: restricciones, compromisos (con historial de reprogramaciones), trámites de
//   calificación y revisiones (quincenal / comité mensual). Rutas en src/routes/casosmedicos.js,
//   pantalla en public/js/sst-casos-matriz.js.
// - Listas desplegables y parámetros en Config_Parametros (sst / Casos Medicos).
const pool = require('./db');
const { urlFirmaRegistrada } = require('./firmaUsuario');

const SECCION = 'Casos Medicos';
const P_DIAS_ADAPTACION = 'Días hábiles para implementar la adaptación del puesto';
const P_ROL_SST = 'Rol que firma como Líder SST en las actas de casos médicos';
const PREFIJO_LISTA = 'Lista de opciones: ';

// Opciones por defecto (las de la matriz) si la fila de Config_Parametros no existe o está vacía
const LISTAS = {
  area: ['Área', 'Administrativo, Operativo'],
  origen: ['Origen', 'Laboral, Común, En estudio, No definido'],
  estado_laboral: ['Estado laboral', 'Incapacitado, Activo en cargo, Reintegro con modificaciones, Reubicado temporal, Reubicado definitivo, Reconversión laboral, Ausente'],
  tipo_concepto: ['Tipo de concepto', 'Post-incapacidad, Reintegro/reincorporación, Seguimiento/control, Tratante, Recomendación externa'],
  estado_adaptacion: ['Estado de adaptación', 'Implementada, En trámite, Pendiente, No aplica'],
  proceso_calificacion: ['Proceso de calificación', 'No iniciado, En proceso, Origen calificado, PCL en trámite, PCL calificada, Controversia, Cerrado'],
  temporalidad: ['Temporalidad', 'Temporal, Permanente'],
  entidad: ['Entidad', 'EPS, ARL, AFP, Junta Regional, Junta Nacional, Medicina laboral, IPS, Otra'],
  estado_tramite: ['Estado del trámite', 'Radicado, En trámite, Calificada, Controversia, Cerrado'],
  origen_compromiso: ['Origen del compromiso', 'Acta de inicio, Revisión quincenal, Comité mensual, Gestión con jefe, Gestión EPS/ARL/AFP, Otro'],
  contraparte: ['Contraparte', 'Jefe inmediato, EPS, ARL, Medicina laboral, Talento Humano, Trabajador, Otro'],
  responsable_compromiso: ['Responsable del compromiso', 'Jefe inmediato, SST, Talento Humano, Trabajador'],
  motivo_reprogramacion: ['Motivo de reprogramación', 'Pendiente de gestión, Ajuste operativo, Nueva recomendación, Solicitud de EPS/ARL/Medicina laboral, Ausencia o incapacidad del trabajador, Otro'],
  tipo_revision: ['Tipo de revisión', 'Quincenal, Comité mensual'],
  tema_comite: ['Tema del comité', 'Seguimiento general, Cierre de caso, Reubicación, Proceso de calificación, Varios'],
  si_no: [null, 'Sí, No'],
  si_no_na: [null, 'Sí, No, N.A.'],
};

const lista = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

async function parametros() {
  try {
    const [rows] = await pool.execute("SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = ?", [SECCION]);
    return Object.fromEntries(rows.map(r => [r.Concepto, r.Parametro == null ? '' : String(r.Parametro)]));
  } catch (err) {
    console.error('[casosMedicosMatriz] No se pudieron leer los parámetros, se usan los valores por defecto:', err.message);
    return {};
  }
}

async function listas() {
  const p = await parametros();
  const res = {};
  Object.entries(LISTAS).forEach(([clave, [nombre, defecto]]) => {
    const valores = nombre ? lista(p[PREFIJO_LISTA + nombre]) : [];
    res[clave] = valores.length ? valores : lista(defecto);
  });
  return res;
}

// ── Días hábiles en Colombia (sin sábados, domingos ni festivos, Ley 51 de 1983) ──
function pascua(anio) {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anio, mes - 1, dia));
}
const iso = d => d.toISOString().slice(0, 10);
const sumar = (d, n) => new Date(d.getTime() + n * 864e5);
const alLunes = d => { const dow = d.getUTCDay(); return dow === 1 ? d : sumar(d, (8 - dow) % 7); };

const _festivos = {};
function festivosColombia(anio) {
  if (_festivos[anio]) return _festivos[anio];
  const f = (m, d) => new Date(Date.UTC(anio, m - 1, d));
  const p = pascua(anio);
  const dias = [
    f(1, 1), f(5, 1), f(7, 20), f(8, 7), f(12, 8), f(12, 25),
    sumar(p, -3), sumar(p, -2),
    ...[f(1, 6), f(3, 19), f(6, 29), f(8, 15), f(10, 12), f(11, 1), f(11, 11)].map(alLunes),
    alLunes(sumar(p, 39)), alLunes(sumar(p, 60)), alLunes(sumar(p, 68)),
  ];
  _festivos[anio] = new Set(dias.map(iso));
  return _festivos[anio];
}

function sumarDiasHabiles(fechaISO, dias) {
  if (!fechaISO || !/^\d{4}-\d{2}-\d{2}/.test(String(fechaISO))) return null;
  let d = new Date(`${String(fechaISO).slice(0, 10)}T00:00:00Z`);
  let n = 0;
  while (n < dias) {
    d = sumar(d, 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !festivosColombia(d.getUTCFullYear()).has(iso(d))) n++;
  }
  return iso(d);
}

async function fechaLimiteAdaptacion(fechaEvaluacion) {
  if (!fechaEvaluacion) return null;
  const dias = parseInt((await parametros())[P_DIAS_ADAPTACION], 10);
  return sumarDiasHabiles(fechaEvaluacion, Number.isFinite(dias) && dias > 0 ? dias : 20);
}

// ── Campos nuevos del caso (Maestro_casosmedicos) ──
// tipo: texto | fecha | sino | lista:<clave> | textoLargo. Los recibe /api/crear y PUT /api/caso/:id.
const CAMPOS_CASO = {
  area: 'lista:area', cargo: 'texto', origen: 'lista:origen', estado_laboral: 'lista:estado_laboral',
  fecha_inicio_incap: 'fecha', fecha_fin_incap: 'fecha',
  fecha_ultimo_concepto: 'fecha', tipo_concepto: 'lista:tipo_concepto',
  requiere_examen_postincap: 'sino', fecha_examen_postincap: 'fecha',
  adaptacion_implementada: 'sino', fecha_evaluacion_ocupacional: 'fecha', estado_adaptacion: 'lista:estado_adaptacion',
  proceso_calificacion: 'lista:proceso_calificacion',
  requiere_apt: 'sino', fecha_apt: 'fecha', apt_ubicacion: 'texto',
  observacion_administrativa: 'textoLargo',
};
const LARGO = { area: 30, cargo: 150, origen: 30, estado_laboral: 40, tipo_concepto: 40, estado_adaptacion: 40, proceso_calificacion: 30, apt_ubicacion: 500 };

function limpiarValor(tipo, valor, largo) {
  if (valor === undefined) return undefined;
  const s = valor == null ? '' : String(valor).trim();
  if (!s) return null;
  if (tipo === 'fecha') return /^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10)) ? s.slice(0, 10) : null;
  if (tipo === 'numero') { const n = Number(s.replace(',', '.')); return Number.isFinite(n) ? n : null; }
  if (tipo === 'sino' || tipo === 'sinona') return ['Sí', 'No', 'N.A.'].includes(s) ? s : (/^s[ií]$/i.test(s) ? 'Sí' : /^no$/i.test(s) ? 'No' : null);
  return largo ? s.slice(0, largo) : s;
}

// Valores de los campos de la matriz que vienen en el cuerpo (solo los presentes) + la fecha límite
async function camposCasoDesde(body) {
  const res = {};
  Object.entries(CAMPOS_CASO).forEach(([campo, tipo]) => {
    const v = limpiarValor(tipo.startsWith('lista') ? 'texto' : tipo, body[campo], LARGO[campo]);
    if (v !== undefined) res[campo] = v;
  });
  if (res.fecha_evaluacion_ocupacional !== undefined) res.fecha_limite_adaptacion = await fechaLimiteAdaptacion(res.fecha_evaluacion_ocupacional);
  return res;
}

// ── Registros por caso ──
// Cada campo: [etiqueta, tipo, lista?, largo?]. La pantalla arma los formularios y tablas con esta definición.
const ENTIDADES = {
  restricciones: {
    tabla: 'Maestro_cm_restricciones', titulo: 'Restricciones y recomendaciones', icono: '⛔',
    nota: 'Una fila por concepto o actualización. Registre solo la restricción funcional, nunca diagnósticos.',
    orden: 'COALESCE(fecha_inicio, fecha_concepto) DESC, id DESC',
    campos: {
      fecha_concepto: ['Fecha del concepto', 'fecha'],
      tipo_concepto: ['Tipo de concepto', 'lista', 'tipo_concepto', 40],
      descripcion: ['Restricción / recomendación funcional (sin diagnóstico)', 'textoLargo'],
      temporalidad: ['Temporalidad', 'lista', 'temporalidad', 20],
      fecha_inicio: ['Inicio', 'fecha'],
      fecha_fin: ['Fin (vacío si es indefinida)', 'fecha'],
      seguimiento_medico: ['¿Requiere control médico?', 'sino'],
      fecha_control_medico: ['Fecha control médico', 'fecha'],
      comunicada_jefe: ['¿Comunicada al jefe?', 'sino'],
      fecha_comunicacion: ['Fecha de comunicación', 'fecha'],
      implementada: ['¿Implementada?', 'sino'],
      fecha_implementacion: ['Fecha de implementación', 'fecha'],
      verificada_sst: ['¿Verificada por SST?', 'sino'],
      fecha_verificacion: ['Fecha de verificación', 'fecha'],
    },
    columnas: ['fecha_inicio', 'fecha_fin', 'tipo_concepto', 'descripcion', 'estado_vigencia', 'implementada'],
  },
  compromisos: {
    tabla: 'Maestro_cm_compromisos', titulo: 'Compromisos', icono: '🤝',
    nota: 'Al reprogramar se conserva la fecha inicial: la nueva fecha queda en el historial del compromiso.',
    orden: '(fecha_cumplimiento IS NOT NULL), COALESCE(fecha_vigente, fecha_inicial) DESC, id DESC',
    campos: {
      fecha_compromiso_registro: ['Fecha de registro', 'fecha'],
      origen: ['Origen del compromiso', 'lista', 'origen_compromiso', 60],
      contraparte: ['Contraparte', 'lista', 'contraparte', 60],
      compromiso: ['Compromiso', 'textoLargo'],
      responsable: ['Responsable', 'lista', 'responsable_compromiso', 60],
      fecha_inicial: ['Fecha compromiso inicial', 'fecha'],
      fecha_cumplimiento: ['Fecha real de cumplimiento', 'fecha'],
      evidencia: ['Evidencia / ubicación', 'texto', null, 500],
      observaciones: ['Observaciones', 'textoLargo'],
    },
    columnas: ['compromiso', 'responsable', 'fecha_inicial', 'fecha_vigente', 'estado', 'n_reprogramaciones'],
  },
  calificacion: {
    tabla: 'Maestro_cm_calificacion', titulo: 'Calificación (origen / PCL)', icono: '⚖️',
    nota: 'Trámites de origen, PCL o controversias ante EPS, ARL, AFP o Juntas.',
    orden: 'COALESCE(fecha_radicacion, fecha_dictamen) DESC, id DESC',
    campos: {
      entidad: ['Entidad gestora', 'lista', 'entidad', 40],
      tipo_tramite: ['Tipo de trámite', 'texto', null, 200],
      fecha_radicacion: ['Fecha de radicación', 'fecha'],
      radicado: ['Radicado', 'texto', null, 60],
      estado_tramite: ['Estado del trámite', 'lista', 'estado_tramite', 40],
      fecha_ultima_respuesta: ['Fecha última respuesta', 'fecha'],
      pendiente: ['Pendiente / requerimiento', 'texto', null, 500],
      responsable: ['Responsable', 'texto', null, 200],
      fecha_proxima_gestion: ['Próxima gestión', 'fecha'],
      calificacion_origen: ['Calificación de origen', 'lista', 'origen', 30],
      fecha_origen: ['Fecha calificación de origen', 'fecha'],
      pcl_porcentaje: ['% PCL', 'numero'],
      fecha_dictamen: ['Fecha del dictamen', 'fecha'],
      instancia: ['Instancia / controversia', 'texto', null, 100],
      estado_final: ['Estado final', 'lista', 'estado_tramite', 40],
      observacion: ['Observación administrativa', 'textoLargo'],
    },
    columnas: ['entidad', 'tipo_tramite', 'estado_tramite', 'pcl_porcentaje', 'fecha_dictamen', 'fecha_proxima_gestion'],
  },
  revisiones: {
    tabla: 'Maestro_cm_revisiones', titulo: 'Revisiones y comités', icono: '🗓️',
    nota: 'Revisión quincenal (solo por llamada a la operación) y comité mensual (acta mensual).',
    orden: 'fecha_revision DESC, id DESC',
    campos: {
      fecha_revision: ['Fecha', 'fecha'],
      tipo_revision: ['Tipo de revisión', 'lista', 'tipo_revision', 30],
      jefe_revisado: ['Jefe inmediato revisado', 'sinona'],
      eps_revisada: ['EPS revisada', 'sinona'],
      arl_revisada: ['ARL revisada', 'sinona'],
      medicina_laboral_revisada: ['Medicina laboral revisada', 'sinona'],
      tema_comite: ['Tema', 'lista', 'tema_comite', 60],
      acuerdos: ['Acuerdos y compromisos', 'textoLargo'],
      responsable: ['Responsable', 'texto', null, 200],
      evidencia: ['Evidencia / acta', 'texto', null, 500],
      observaciones: ['Observaciones', 'textoLargo'],
    },
    columnas: ['fecha_revision', 'tipo_revision', 'tema_comite', 'acuerdos', 'responsable'],
  },
};

// Definición que usa la pantalla (sin nombres de tabla)
function definicionPantalla() {
  return Object.fromEntries(Object.entries(ENTIDADES).map(([k, e]) => [k, {
    titulo: e.titulo, icono: e.icono, nota: e.nota, columnas: e.columnas,
    campos: Object.entries(e.campos).map(([nombre, [etiqueta, tipo, listaClave]]) => ({ nombre, etiqueta, tipo, lista: listaClave || null })),
  }]));
}

function datosEntidad(entidad, body) {
  const e = ENTIDADES[entidad];
  const res = {};
  Object.entries(e.campos).forEach(([campo, [, tipo, , largo]]) => {
    const v = limpiarValor(tipo === 'lista' || tipo === 'textoLargo' ? 'texto' : tipo, body[campo], largo);
    if (v !== undefined) res[campo] = v;
  });
  return res;
}

function hoyBogota() {
  return new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
}
// AAAA-MM-DD de una fecha de MySQL (objeto Date a medianoche de Bogotá) o de un texto
const f10 = v => {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : new Date(v.getTime() - 5 * 3600e3).toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

// Estados calculados (como las fórmulas de la matriz)
function estadoRestriccion(r, hoy = hoyBogota()) {
  const fin = f10(r.fecha_fin);
  if (!fin) return 'SIN FECHA FIN';
  if (fin < hoy) return 'VENCIDA';
  const dias = (new Date(fin) - new Date(hoy)) / 864e5;
  return dias <= 15 ? 'POR VENCER' : 'VIGENTE';
}
function estadoCompromiso(c, hoy = hoyBogota()) {
  if (c.fecha_cumplimiento) {
    const ini = f10(c.fecha_inicial);
    return !ini || f10(c.fecha_cumplimiento) <= ini ? 'Cumplido' : 'Cumplido (extemporáneo)';
  }
  const vig = f10(c.fecha_vigente || c.fecha_inicial);
  if (!vig) return 'Sin fecha';
  return vig < hoy ? 'Vencido' : 'Pendiente';
}

// Todos los registros de un caso, con sus estados calculados
async function registrosCaso(idcaso) {
  const res = {};
  for (const [k, e] of Object.entries(ENTIDADES)) {
    const [rows] = await pool.query(
      `SELECT x.*, u.Nombre AS usuario_nombre FROM ${e.tabla} x LEFT JOIN Maestro_Usuarios u ON u.ID = x.usuario
       WHERE x.idcaso = ? AND x.deleted_at IS NULL ORDER BY ${e.orden}`, [idcaso]);
    res[k] = rows;
  }
  const hoy = hoyBogota();
  res.restricciones.forEach(r => { r.estado_vigencia = estadoRestriccion(r, hoy); });
  if (res.compromisos.length) {
    const [rep] = await pool.query(
      `SELECT r.*, u.Nombre AS usuario_nombre FROM Maestro_cm_reprogramaciones r LEFT JOIN Maestro_Usuarios u ON u.ID = r.usuario
       WHERE r.idcompromiso IN (?) ORDER BY r.id`, [res.compromisos.map(c => c.id)]);
    res.compromisos.forEach(c => {
      c.reprogramaciones = rep.filter(r => r.idcompromiso === c.id);
      c.n_reprogramaciones = c.reprogramaciones.length;
      c.estado = estadoCompromiso(c, hoy);
    });
  }
  return res;
}

async function guardarRegistro(entidad, idcaso, idRegistro, body, usuario) {
  const e = ENTIDADES[entidad];
  const datos = datosEntidad(entidad, body);
  if (entidad === 'compromisos') {
    if (!idRegistro) datos.fecha_vigente = datos.fecha_inicial || null;
    else {
      // Con reprogramaciones la fecha inicial ya no cambia (es la base del cumplimiento oportuno)
      const [[n]] = await pool.query('SELECT COUNT(*) n FROM Maestro_cm_reprogramaciones WHERE idcompromiso = ?', [idRegistro]);
      if (n.n) delete datos.fecha_inicial;
      else if (datos.fecha_inicial !== undefined) datos.fecha_vigente = datos.fecha_inicial;
    }
  }
  if (entidad === 'restricciones' && datos.fecha_inicio && datos.fecha_fin && datos.fecha_fin < datos.fecha_inicio) {
    throw Object.assign(new Error('La fecha fin de la restricción no puede ser anterior a la de inicio'), { status: 400 });
  }
  if (idRegistro) {
    datos.fecha_actualizacion = new Date();
    const [r] = await pool.query(`UPDATE ${e.tabla} SET ? WHERE id = ? AND idcaso = ? AND deleted_at IS NULL`, [datos, idRegistro, idcaso]);
    if (!r.affectedRows) throw Object.assign(new Error('Registro no encontrado'), { status: 404 });
    return Number(idRegistro);
  }
  const [r] = await pool.query(`INSERT INTO ${e.tabla} SET ?`, [{ ...datos, idcaso, usuario: usuario || null }]);
  return r.insertId;
}

async function reprogramarCompromiso(idCompromiso, { fecha_nueva, motivo, autorizado_por, observaciones }, usuario) {
  const nueva = limpiarValor('fecha', fecha_nueva);
  if (!nueva) throw Object.assign(new Error('La nueva fecha es obligatoria'), { status: 400 });
  const [[c]] = await pool.query('SELECT id, idcaso, fecha_vigente, fecha_inicial, fecha_cumplimiento FROM Maestro_cm_compromisos WHERE id = ? AND deleted_at IS NULL', [idCompromiso]);
  if (!c) throw Object.assign(new Error('Compromiso no encontrado'), { status: 404 });
  if (c.fecha_cumplimiento) throw Object.assign(new Error('El compromiso ya está cumplido'), { status: 400 });
  await pool.query('INSERT INTO Maestro_cm_reprogramaciones SET ?', [{
    idcompromiso: c.id, fecha_anterior: c.fecha_vigente || c.fecha_inicial || null, fecha_nueva: nueva,
    motivo: limpiarValor('texto', motivo, 100), autorizado_por: limpiarValor('texto', autorizado_por, 200),
    observaciones: limpiarValor('texto', observaciones), usuario: usuario || null,
  }]);
  await pool.query('UPDATE Maestro_cm_compromisos SET fecha_vigente = ?, fecha_actualizacion = NOW() WHERE id = ?', [nueva, c.id]);
  return c.idcaso;
}

// Quien firma como Líder SST en las actas: primer usuario del rol configurado, con su firma registrada
async function firmanteSstActas() {
  const rol = String((await parametros())[P_ROL_SST] ?? 'LiderSst').trim();
  if (!rol) return { nombre: '', cargo: '', urlFirma: null };
  const [[u]] = await pool.execute('SELECT ID, Nombre, Colaborador, Cargo FROM Maestro_Usuarios WHERE Rol = ? ORDER BY ID LIMIT 1', [rol]);
  if (!u) return { nombre: '', cargo: '', urlFirma: null };
  const nombreColaborador = String(u.Colaborador || '').split(' ** ')[1];
  return {
    nombre: (nombreColaborador || u.Nombre || '').trim(),
    cargo: u.Cargo || 'Líder SST',
    urlFirma: await urlFirmaRegistrada(u.ID),
  };
}

module.exports = {
  ENTIDADES,
  CAMPOS_CASO,
  listas,
  definicionPantalla,
  camposCasoDesde,
  sumarDiasHabiles,
  festivosColombia,
  registrosCaso,
  guardarRegistro,
  reprogramarCompromiso,
  estadoRestriccion,
  estadoCompromiso,
  firmanteSstActas,
};
