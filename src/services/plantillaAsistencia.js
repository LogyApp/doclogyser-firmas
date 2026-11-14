/**
 * plantillaAsistencia.js
 * ¿A qué operación pertenecía cada trabajador cada día? Es la base del relleno automático
 * (Nuevo / Retirado / Traslado, ver rellenoAsistencia.js) y del reporte "Control de quincena".
 *
 * No se usa el estado de hoy: se reconstruye la historia con
 *   - Maestro_Vinculación: Fecha de Ingreso y, si está Retirado, Fecha de Retiro (puede haber varias
 *     vinculaciones de la misma persona, una por cada contratación);
 *   - Dynamic_traslados_trabajador (firmados): antes de fecha_traslado la persona estaba en la
 *     operación de origen y desde ese día en la de destino.
 * El último tramo de cada vinculación usa la Operación de Maestro_Vinculación (la vigente).
 *
 * Las quincenas son del 1 al 15 y del 16 al último día del mes (igual que Dynamic_Asistencia.Quincena).
 */
const pool = require('./db');

// ── Fechas en texto AAAA-MM-DD ────────────────────────────────────────────────
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function aFecha(iso) { return new Date(`${iso}T12:00:00Z`); }
function aIso(d) { return d.toISOString().slice(0, 10); }
function sumarDias(iso, n) { const d = aFecha(iso); d.setUTCDate(d.getUTCDate() + n); return aIso(d); }
function hoyColombia() {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}
function finDeMes(iso) {
  const d = aFecha(iso);
  return aIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)));
}
/** { desde, hasta, nombre } de la quincena que contiene la fecha */
function quincenaDe(iso) {
  const dia = Number(iso.slice(8, 10));
  const mes = iso.slice(0, 7);
  const q1 = dia <= 15;
  const desde = q1 ? `${mes}-01` : `${mes}-16`;
  const hasta = q1 ? `${mes}-15` : finDeMes(iso);
  return { desde, hasta, nombre: nombreQuincena(iso), clave: `${mes}-${q1 ? 'Q1' : 'Q2'}` };
}
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
function nombreQuincena(iso) {
  const m = Number(iso.slice(5, 7));
  return `${m}. ${MESES[m - 1]} ${Number(iso.slice(8, 10)) > 15 ? 'Q2' : 'Q1'}`;
}
/** Lista de días [desde..hasta] */
function diasEntre(desde, hasta) {
  const out = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) out.push(d);
  return out;
}
function minIso(...xs) { return xs.filter(Boolean).sort()[0] || null; }
function maxIso(...xs) { const l = xs.filter(Boolean).sort(); return l.length ? l[l.length - 1] : null; }

function nombreDeTrabajador(trabajador) {
  const partes = String(trabajador || '').split('**');
  return (partes.length > 1 ? partes[1] : partes[0]).trim();
}

/**
 * Tramos de pertenencia por persona que tocan el rango [desde, hasta].
 * @param {object} filtro { desde, hasta, identificaciones?: number[], operaciones?: string[] }
 *   Con operaciones se traen las personas que pasaron por esas operaciones (como vinculación o como
 *   origen/destino de un traslado) y se devuelven TODOS sus tramos (para saber a dónde se fueron).
 * @returns {Map<string, Persona>} clave = identificación en texto
 *   Persona: { identificacion, trabajador, nombre, tramos: [{ operacion, desde, hasta|null, area, cargo, idVinculacion }],
 *              vinculaciones: [{ desde, hasta|null }] }
 */
async function cargarTramos({ desde, hasta, identificaciones = null, operaciones = null }, conn = pool) {
  if (!FECHA_RE.test(desde || '') || !FECHA_RE.test(hasta || '')) throw new Error('Rango de fechas inválido');

  const cond = [
    "v.`Fecha de Ingreso` IS NOT NULL",
    'v.`Fecha de Ingreso` <= ?',
    "NOT (v.Estado = 'Retirado' AND v.`Fecha de Retiro` IS NOT NULL AND v.`Fecha de Retiro` < ?)",
    "v.Estado IN ('Activo', 'Retirado')"
  ];
  const params = [hasta, desde];
  if (identificaciones && identificaciones.length) {
    cond.push(`v.\`Identificación\` IN (${identificaciones.map(() => '?').join(',')})`);
    params.push(...identificaciones.map(Number));
  } else if (operaciones && operaciones.length) {
    const ph = operaciones.map(() => '?').join(',');
    cond.push(`(v.\`Operación\` IN (${ph}) OR v.\`Identificación\` IN (
        SELECT t.\`Identificación\` FROM Dynamic_traslados_trabajador t
         WHERE t.estado_doc IN ('generado', 'validado') AND t.fecha_traslado > ?
           AND (t.operacion_origen IN (${ph}) OR t.operacion_destino IN (${ph}))))`);
    params.push(...operaciones, desde, ...operaciones, ...operaciones);
  }

  const [vincs] = await conn.query(
    `SELECT v.\`Id Vinculación\` AS idVinculacion, v.\`Identificación\` AS identificacion,
            COALESCE(s.Trabajador, v.Trabajador) AS trabajador, v.\`Operación\` AS operacion,
            v.Area AS area, v.Cargo AS cargo, v.Estado AS estado,
            DATE_FORMAT(v.\`Fecha de Ingreso\`, '%Y-%m-%d') AS ingreso,
            DATE_FORMAT(v.\`Fecha de Retiro\`, '%Y-%m-%d') AS retiro
       FROM \`Maestro_Vinculación\` v
       LEFT JOIN \`Maestro_Segmentación\` s ON s.\`Identificación\` = v.\`Identificación\`
      WHERE ${cond.join(' AND ')}
      ORDER BY v.\`Identificación\`, v.\`Fecha de Ingreso\``,
    params
  );
  if (!vincs.length) return new Map();

  const ids = [...new Set(vincs.map(v => Number(v.identificacion)))];
  const [trasl] = await conn.query(
    `SELECT \`Identificación\` AS identificacion, operacion_origen AS origen, operacion_destino AS destino,
            DATE_FORMAT(fecha_traslado, '%Y-%m-%d') AS fecha
       FROM Dynamic_traslados_trabajador
      WHERE estado_doc IN ('generado', 'validado') AND fecha_traslado IS NOT NULL
        AND \`Identificación\` IN (${ids.map(() => '?').join(',')})
      ORDER BY fecha_traslado, Fecha_Registro`,
    ids
  );
  const traslPorId = new Map();
  trasl.forEach(t => {
    const k = String(t.identificacion);
    if (!traslPorId.has(k)) traslPorId.set(k, []);
    traslPorId.get(k).push(t);
  });

  const personas = new Map();
  vincs.forEach((v, i) => {
    const sig = vincs[i + 1];
    v.siguienteIngreso = sig && String(sig.identificacion) === String(v.identificacion) ? sig.ingreso : null;
  });
  for (const v of vincs) {
    const k = String(v.identificacion);
    if (!personas.has(k)) {
      personas.set(k, {
        identificacion: Number(v.identificacion),
        trabajador: v.trabajador,
        nombre: nombreDeTrabajador(v.trabajador),
        tramos: [],
        vinculaciones: []
      });
    }
    const p = personas.get(k);
    const fin = v.estado === 'Retirado' && v.retiro ? v.retiro : null;
    p.vinculaciones.push({ desde: v.ingreso, hasta: fin, idVinculacion: v.idVinculacion });

    // Traslados de esta vinculación: después del ingreso y antes de la siguiente contratación.
    // Un traslado con fecha posterior al retiro (dato inconsistente) igual indica que hasta el retiro
    // estuvo en la operación de origen, porque la firma del traslado ya cambió la Operación.
    const propios = (traslPorId.get(k) || [])
      .filter(t => t.fecha > v.ingreso && (!v.siguienteIngreso || t.fecha <= v.siguienteIngreso));
    let inicio = v.ingreso;
    const base = { area: v.area, cargo: v.cargo, idVinculacion: v.idVinculacion };
    let opFinal = v.operacion;
    for (const t of propios) {
      if (t.fecha <= inicio) continue;
      if (fin && t.fecha > fin) { opFinal = t.origen; break; }
      p.tramos.push({ ...base, operacion: t.origen, desde: inicio, hasta: sumarDias(t.fecha, -1) });
      inicio = t.fecha;
    }
    p.tramos.push({ ...base, operacion: opFinal, desde: inicio, hasta: fin });
  }
  return personas;
}

/** Operación del trabajador ese día (o null si no estaba vinculado) */
function operacionDelDia(persona, dia) {
  const t = persona.tramos.find(x => x.desde <= dia && (!x.hasta || dia <= x.hasta));
  return t ? t.operacion : null;
}
function tramoDelDia(persona, dia) {
  return persona.tramos.find(x => x.desde <= dia && (!x.hasta || dia <= x.hasta)) || null;
}

/**
 * Último día bloqueado por Nómina para cada operación (Bloqueo_Nomina, misma regla que
 * asistenciaService.verificarBloqueoNomina): fila más reciente de la operación o general.
 * @returns {function(operacion): string|null}  fecha límite (inclusive) o null si no hay bloqueo
 */
async function cargarBloqueos(conn = pool) {
  let filas = [];
  try {
    [filas] = await conn.query(`
      SELECT bn.ID, bn.\`Operación\` AS operacion, bn.\`Condición\` AS condicion,
             (SELECT MAX(DATE_FORMAT(mf.Fecha, '%Y-%m-%d')) FROM Maestro_Fechas mf
               WHERE mf.Quincena = bn.Quincena AND mf.\`Año\` = bn.\`Año\`) AS maxFecha
        FROM Bloqueo_Nomina bn
       WHERE bn.Modulo = 'Nomina'
         AND (bn.\`Datos\` IS NULL OR bn.\`Datos\` = '' OR bn.\`Datos\` = 'Asistencia')
       ORDER BY bn.ID DESC`);
  } catch (err) {
    console.warn('[plantillaAsistencia] No se pudo leer Bloqueo_Nomina:', err.message);
  }
  const cache = new Map();
  return operacion => {
    if (cache.has(operacion)) return cache.get(operacion);
    const f = filas.find(x => x.operacion === operacion || x.operacion == null || x.operacion === '');
    const lim = f && f.condicion === 'Bloquear' && f.maxFecha ? f.maxFecha : null;
    cache.set(operacion, lim);
    return lim;
  };
}

module.exports = {
  FECHA_RE, aIso, sumarDias, hoyColombia, quincenaDe, nombreQuincena, diasEntre, minIso, maxIso,
  nombreDeTrabajador, cargarTramos, operacionDelDia, tramoDelDia, cargarBloqueos
};
