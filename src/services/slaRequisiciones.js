// Cálculo único del cumplimiento SLA de Requisiciones (tabla y detalle usan esta misma lógica).
//
// Reglas:
//  - El conteo inicia el día de la requisición si se registró antes de la hora de corte;
//    si fue después (en la tarde), inicia al día siguiente.
//  - Si el día de inicio es domingo o festivo (Maestro_Fechas.Estado = 'Festivo'),
//    se corre al siguiente día hábil.
//  - Desde el inicio se cuentan días calendario hasta la fecha de ingreso (o hasta hoy si está pendiente),
//    descontando los días en que la requisición estuvo SUSPENDIDA.
//  - Si la fecha de ingreso es anterior a la fecha de la requisición, el aspirante queda en "revisar".
const pool = require('./db');

const DIA_MS = 24 * 60 * 60 * 1000;
const CACHE_FESTIVOS_MS = 10 * 60 * 1000;
let _festivosCache = { set: null, cargado: 0 };

function hoyBogota() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

// 'YYYY-MM-DD' → número de día (UTC) para aritmética de fechas sin problemas de zona horaria
function aDia(ymd) {
  const [y, m, d] = String(ymd).substring(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DIA_MS;
}

function aYmd(dia) {
  return new Date(dia * DIA_MS).toISOString().substring(0, 10);
}

async function obtenerFestivos() {
  if (_festivosCache.set && Date.now() - _festivosCache.cargado < CACHE_FESTIVOS_MS) {
    return _festivosCache.set;
  }
  const [rows] = await pool.execute(
    "SELECT DATE_FORMAT(`Fecha`, '%Y-%m-%d') AS f FROM `Maestro_Fechas` WHERE `Estado` = 'Festivo'"
  );
  _festivosCache = { set: new Set(rows.map(r => r.f)), cargado: Date.now() };
  return _festivosCache.set;
}

function esDiaHabil(dia, festivos) {
  const domingo = new Date(dia * DIA_MS).getUTCDay() === 0;
  return !domingo && !festivos.has(aYmd(dia));
}

// fechaRequisicion: 'YYYY-MM-DD HH:mm' (hora Bogotá). horaCorte: 'HH:mm'.
function calcularInicioConteo(fechaRequisicion, horaCorte, festivos) {
  const str = String(fechaRequisicion || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(str)) return null;
  let dia = aDia(str);
  const hora = str.substring(11, 16);
  if (hora && hora >= horaCorte) dia += 1;
  // Tope de seguridad por si el calendario estuviera mal cargado
  for (let i = 0; i < 30 && !esDiaHabil(dia, festivos); i++) dia += 1;
  return dia;
}

// Días de suspensión que se cruzan con el intervalo [desde, hasta)
function diasSuspendidos(suspensiones, desde, hasta, hoy) {
  let total = 0;
  for (const s of suspensiones || []) {
    const ini = Math.max(aDia(s.inicio), desde);
    const fin = Math.min(s.fin ? aDia(s.fin) : hoy, hasta);
    if (fin > ini) total += fin - ini;
  }
  return total;
}

// Evalúa un aspirante. Devuelve { estado: 'cumple'|'nocumple'|'pendiente'|'revisar', dias, diasSuspendidos }
function evaluarAspirante({ fechaRequisicion, inicioConteo, fechaIngreso, suspensiones, limite, hoy }) {
  if (inicioConteo === null) return { estado: 'pendiente', dias: null, diasSuspendidos: 0 };
  const fechaReqDia = aDia(fechaRequisicion);

  if (fechaIngreso) {
    const ingreso = aDia(fechaIngreso);
    if (ingreso < fechaReqDia) {
      return { estado: 'revisar', dias: null, diasSuspendidos: 0 };
    }
    const susp = diasSuspendidos(suspensiones, inicioConteo, ingreso, hoy);
    const dias = Math.max(0, ingreso - inicioConteo - susp);
    return { estado: dias <= limite ? 'cumple' : 'nocumple', dias, diasSuspendidos: susp };
  }

  const susp = diasSuspendidos(suspensiones, inicioConteo, hoy, hoy);
  const dias = Math.max(0, hoy - inicioConteo - susp);
  return { estado: 'pendiente', dias, diasSuspendidos: susp };
}

// Resumen por requisición para la píldora semafórica
function resumirRequisicion(evaluaciones, umbrales) {
  const cnt = { cumple: 0, nocumple: 0, pendiente: 0, revisar: 0 };
  evaluaciones.forEach(e => { cnt[e.estado]++; });
  const total = evaluaciones.length;
  const pct = total > 0 ? Math.round((cnt.cumple / total) * 100) : 0;

  let nivel;
  if (total === 0) nivel = 'sin_candidatos';
  else if (cnt.cumple + cnt.nocumple === 0 && cnt.pendiente > 0) nivel = 'tramite';
  else if (pct >= umbrales.verde) nivel = 'verde';
  else if (pct >= umbrales.amarillo) nivel = 'amarillo';
  else nivel = 'rojo';

  return {
    total_aspirantes: total,
    aspirantes_cumple: cnt.cumple,
    aspirantes_nocumple: cnt.nocumple,
    aspirantes_pendientes: cnt.pendiente,
    aspirantes_revisar: cnt.revisar,
    sla_pct: pct,
    sla_nivel: nivel
  };
}

function leerConfigSla(paramsConfig) {
  const limite = parseInt(paramsConfig['Tiempo limite de Requisición']) || 8;
  const verde = parseInt(paramsConfig['Porcentaje semáforo verde SLA']);
  const amarillo = parseInt(paramsConfig['Porcentaje semáforo amarillo SLA']);
  const horaCorte = String(paramsConfig['Hora de corte inicio conteo SLA'] || '').trim();
  return {
    limite,
    horaCorte: /^\d{2}:\d{2}$/.test(horaCorte) ? horaCorte : '12:00',
    umbrales: {
      verde: Number.isFinite(verde) ? verde : 80,
      amarillo: Number.isFinite(amarillo) ? amarillo : 50
    }
  };
}

async function obtenerSuspensiones(idsRequisicion) {
  const mapa = new Map();
  if (!idsRequisicion.length) return mapa;
  const ph = idsRequisicion.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT IdRequisicion,
            DATE_FORMAT(fecha_inicio, '%Y-%m-%d') AS inicio,
            DATE_FORMAT(fecha_fin, '%Y-%m-%d') AS fin
     FROM \`Dynamic_Requisiciones_Suspension\`
     WHERE IdRequisicion IN (${ph})`,
    idsRequisicion
  );
  rows.forEach(r => {
    if (!mapa.has(r.IdRequisicion)) mapa.set(r.IdRequisicion, []);
    mapa.get(r.IdRequisicion).push({ inicio: r.inicio, fin: r.fin });
  });
  return mapa;
}

// requisiciones: [{ IdRequisicion, fechaRequisicion: 'YYYY-MM-DD HH:mm' }]
// aspirantesPorReq: Map(IdRequisicion → [{ fecha_ingreso: 'YYYY-MM-DD'|null, ... }])
// Devuelve Map(IdRequisicion → { inicioConteo, diasSuspendidosTotal, evaluaciones[], resumen })
async function calcularSlaRequisiciones(requisiciones, aspirantesPorReq, paramsConfig) {
  const cfg = leerConfigSla(paramsConfig);
  const festivos = await obtenerFestivos();
  const suspensionesPorReq = await obtenerSuspensiones(requisiciones.map(r => r.IdRequisicion));
  const hoy = aDia(hoyBogota());
  const resultado = new Map();

  for (const r of requisiciones) {
    const inicioConteo = calcularInicioConteo(r.fechaRequisicion, cfg.horaCorte, festivos);
    const suspensiones = suspensionesPorReq.get(r.IdRequisicion) || [];
    const evaluaciones = (aspirantesPorReq.get(r.IdRequisicion) || []).map(a => evaluarAspirante({
      fechaRequisicion: r.fechaRequisicion,
      inicioConteo,
      fechaIngreso: a.fecha_ingreso || null,
      suspensiones,
      limite: cfg.limite,
      hoy
    }));
    resultado.set(r.IdRequisicion, {
      inicioConteo: inicioConteo === null ? null : aYmd(inicioConteo),
      suspendidaActualmente: suspensiones.some(s => !s.fin),
      diasSuspendidosTotal: inicioConteo === null ? 0 : diasSuspendidos(suspensiones, inicioConteo, hoy, hoy),
      evaluaciones,
      resumen: resumirRequisicion(evaluaciones, cfg.umbrales)
    });
  }
  return { porRequisicion: resultado, config: cfg };
}

module.exports = {
  calcularSlaRequisiciones,
  leerConfigSla,
  // Exportadas para pruebas
  calcularInicioConteo,
  evaluarAspirante,
  resumirRequisicion,
  aDia,
  aYmd
};
