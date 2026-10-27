// Cálculo único del cumplimiento SLA de Requisiciones (tabla y detalle usan esta misma lógica).
//
// Reglas:
//  - El conteo inicia el día de la requisición si se registró antes de la hora de corte (12:00 por defecto);
//    si fue después (en la tarde), pasa al día siguiente.
//  - Si el día cae en un día no habilitado en la lista de días de proceso (Config_Parametros)
//    o en un festivo (si no se deben sumar), avanza hasta el siguiente día de proceso hábil.
//  - El conteo de días de proceso acumula exclusivamente los días habilitados en la configuración,
//    descontando suspensiones y festivos (según el interruptor de festivos).
//  - Si la fecha de ingreso es anterior a la fecha de la requisición, el aspirante queda en "revisar".
const pool = require('./db');

const DIA_MS = 24 * 60 * 60 * 1000;
const CACHE_FESTIVOS_MS = 10 * 60 * 1000;
let _festivosCache = { set: null, cargado: 0 };

const DIAS_SEMANA_MAP = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado'
};

function normalizarDia(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parsearDiasPermitidos(raw) {
  if (!raw || typeof raw !== 'string') {
    return new Set(['lunes', 'martes', 'miercoles', 'jueves', 'viernes']);
  }
  const partes = raw.split(',').map(s => normalizarDia(s)).filter(Boolean);
  if (!partes.length) {
    return new Set(['lunes', 'martes', 'miercoles', 'jueves', 'viernes']);
  }
  return new Set(partes);
}

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

function esDiaDeProceso(dia, diasPermitidosSet, festivosSet, sumarFestivos) {
  const ymd = aYmd(dia);
  const esFestivo = festivosSet && festivosSet.has(ymd);

  // Si es festivo y la configuración indica NO sumarlos, no es día de proceso
  if (esFestivo && !sumarFestivos) {
    return false;
  }

  const diaSemanaNum = new Date(dia * DIA_MS).getUTCDay();
  const nombreDia = DIAS_SEMANA_MAP[diaSemanaNum];
  return diasPermitidosSet.has(nombreDia);
}

// Mantener por compatibilidad
function esDiaHabil(dia, festivos) {
  const domingo = new Date(dia * DIA_MS).getUTCDay() === 0;
  return !domingo && !festivos.has(aYmd(dia));
}

// fechaRequisicion: 'YYYY-MM-DD HH:mm' (hora Bogotá). horaCorte: 'HH:mm'.
function calcularInicioConteo(fechaRequisicion, horaCorte, diasPermitidosSet, festivosSet, sumarFestivos) {
  const str = String(fechaRequisicion || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(str)) return null;
  let dia = aDia(str);
  const hora = str.substring(11, 16);
  if (hora && hora >= (horaCorte || '12:00')) dia += 1;

  // Si no se pasaron conjuntos nuevos, recurrir al comportamiento base (para compatibilidad de tests antiguos)
  if (!diasPermitidosSet) {
    for (let i = 0; i < 30 && !esDiaHabil(dia, festivosSet || new Set()); i++) dia += 1;
    return dia;
  }

  // Avanzar hasta encontrar el primer día hábil según los días de proceso configurados
  for (let i = 0; i < 30 && !esDiaDeProceso(dia, diasPermitidosSet, festivosSet, sumarFestivos); i++) {
    dia += 1;
  }
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
function evaluarAspirante({ fechaRequisicion, inicioConteo, fechaIngreso, suspensiones, limite, diasPermitidosSet, festivosSet, sumarFestivos, hoy }) {
  if (inicioConteo === null) return { estado: 'pendiente', dias: null, diasSuspendidos: 0 };
  const fechaReqDia = aDia(fechaRequisicion);
  const fechaFin = fechaIngreso ? aDia(fechaIngreso) : hoy;

  if (fechaIngreso && fechaFin < fechaReqDia) {
    return { estado: 'revisar', dias: null, diasSuspendidos: 0 };
  }

  // Si no se proporcionó conjunto de días permitidos, usar resta de calendario clásica (compatibilidad)
  if (!diasPermitidosSet) {
    if (fechaIngreso) {
      const susp = diasSuspendidos(suspensiones, inicioConteo, fechaFin, hoy);
      const dias = Math.max(0, fechaFin - inicioConteo - susp);
      return { estado: dias <= limite ? 'cumple' : 'nocumple', dias, diasSuspendidos: susp };
    }
    const susp = diasSuspendidos(suspensiones, inicioConteo, hoy, hoy);
    const dias = Math.max(0, hoy - inicioConteo - susp);
    return { estado: 'pendiente', dias, diasSuspendidos: susp };
  }

  let diasProceso = 0;
  let suspTotal = 0;

  for (let d = inicioConteo; d < fechaFin; d++) {
    const estaSuspendido = (suspensiones || []).some(s => {
      const ini = aDia(s.inicio);
      const fin = s.fin ? aDia(s.fin) : (hoy + 1);
      return d >= ini && d < fin;
    });

    if (estaSuspendido) {
      suspTotal++;
    } else if (esDiaDeProceso(d, diasPermitidosSet, festivosSet, sumarFestivos)) {
      diasProceso++;
    }
  }

  if (fechaIngreso) {
    return {
      estado: diasProceso <= limite ? 'cumple' : 'nocumple',
      dias: diasProceso,
      diasSuspendidos: suspTotal
    };
  }

  return {
    estado: 'pendiente',
    dias: diasProceso,
    diasSuspendidos: suspTotal
  };
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

  // Días de la semana que se contabilizan
  const rawDias = paramsConfig['Conteo de Dias del proceso de Requisición'];
  const diasPermitidos = parsearDiasPermitidos(rawDias);

  // Interruptor para sumar festivos en el conteo de días (1: sí se suman, 0: se descuentan)
  const rawFestivos = paramsConfig['Tener en cuenta festivos en el conteo de dias del proceso'];
  const sumarFestivos = ['1', 'true', 'si', 'sí', 'habilitado'].includes(String(rawFestivos || '').toLowerCase().trim());

  return {
    limite,
    horaCorte: /^\d{2}:\d{2}$/.test(horaCorte) ? horaCorte : '12:00',
    diasPermitidos,
    sumarFestivos,
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
  const cfg = leerConfigSla(paramsConfig || {});
  const festivos = await obtenerFestivos();
  const suspensionesPorReq = await obtenerSuspensiones(requisiciones.map(r => r.IdRequisicion));
  const hoy = aDia(hoyBogota());
  const resultado = new Map();

  for (const r of requisiciones) {
    const inicioConteo = calcularInicioConteo(
      r.fechaRequisicion,
      cfg.horaCorte,
      cfg.diasPermitidos,
      festivos,
      cfg.sumarFestivos
    );
    const suspensiones = suspensionesPorReq.get(r.IdRequisicion) || [];
    const evaluaciones = (aspirantesPorReq.get(r.IdRequisicion) || []).map(a => evaluarAspirante({
      fechaRequisicion: r.fechaRequisicion,
      inicioConteo,
      fechaIngreso: a.fecha_ingreso || null,
      suspensiones,
      limite: cfg.limite,
      diasPermitidosSet: cfg.diasPermitidos,
      festivosSet: festivos,
      sumarFestivos: cfg.sumarFestivos,
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
  parsearDiasPermitidos,
  esDiaDeProceso,
  // Exportadas para pruebas
  calcularInicioConteo,
  evaluarAspirante,
  resumirRequisicion,
  aDia,
  aYmd
};
