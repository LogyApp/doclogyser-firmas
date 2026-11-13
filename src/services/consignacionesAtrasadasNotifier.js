/**
 * consignacionesAtrasadasNotifier.js
 * Reporte diario (7:40 a. m., hora de Colombia) de consignaciones atrasadas.
 *
 * Regla: el efectivo de un día (servicios con Forma De Pago = 1, modalidad Recaudo) se consigna al día
 * siguiente. El día del envío (hoy) todavía se puede consignar lo de ayer, así que una operación está
 * ATRASADA si tiene días de antes de ayer (o anteriores) sin cubrir.
 *
 * Un día con comprobante en Maestro_Consignaciones está cubierto (igual que la fase verde de la pestaña).
 * Pero varias operaciones consignan varios días juntos y registran la consignación en el último día
 * (p. ej. Cedi Av 68 consigna el 26 lo del 20 al 26). Por eso, lo que una consignación trae de más sobre
 * el efectivo de su propio día cubre, en orden, los días anteriores sin comprobante (los más antiguos
 * primero). Nunca cubre días posteriores. Un día sin comprobante queda pendiente si lo que falta por
 * cubrir supera la tolerancia (redondeos al consignar). Las diferencias de un día con comprobante (se
 * consignó menos) no se arrastran: eso se revisa en la pestaña, no es atraso.
 *
 * Correos:
 *  1. Reporte general a Contabilidad (Config_Parametros contabilidad / Consignaciones
 *     "Correos que reciben el reporte de consignaciones atrasadas"), con copia a admin@logyser.com:
 *     operaciones atrasadas con sus días y valores, y las que están al día.
 *  2. Aviso informativo por Operación a sus Auxiliares y Coordinadores (copia: AuxiliarR y CoordinadorR de
 *     la Regional y admin@logyser.com), con el mismo método de Tomó Cargo y Forma de Pago pendiente.
 *
 * Parámetros (Config_Parametros contabilidad / Consignaciones; si la fila no existe se usa el valor por defecto):
 *  - "Habilitar notificaciones de correo en Consignaciones atrasadas" (1)
 *  - "Correos que reciben el reporte de consignaciones atrasadas" (auditoria.recaudo@ y asistente.contabilidad@)
 *  - "Días que revisa el reporte de consignaciones atrasadas" (30)
 *  - "Operaciones excluidas del reporte de consignaciones atrasadas" (ninguna)
 *  - "Diferencia en pesos que se tolera por día en consignaciones" (2000)
 */

const pool = require('./db');
const { notificarConsignacionesAtrasadasReporte, notificarConsignacionesAtrasadasOperacion } = require('./email');
const { resolverDestinatariosOperacion } = require('./configRetiro');

const MODULO = 'contabilidad';
const SECCION = 'Consignaciones';
const P_HABILITAR = 'Habilitar notificaciones de correo en Consignaciones atrasadas';
const P_CORREOS = 'Correos que reciben el reporte de consignaciones atrasadas';
const P_DIAS = 'Días que revisa el reporte de consignaciones atrasadas';
const P_EXCLUIDAS = 'Operaciones excluidas del reporte de consignaciones atrasadas';
const P_TOLERANCIA = 'Diferencia en pesos que se tolera por día en consignaciones';
const CORREOS_DEFECTO = 'auditoria.recaudo@logyser.com, asistente.contabilidad@logyser.com';

const { reclamarTareaDiaria, terminarTareaDiaria } = require('./tareaProgramadaUnica');
let lastRunDate = '';

function normalizar(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function lista(v) {
  return String(v || '').split(',').map(x => x.trim()).filter(Boolean);
}

function hoyBogotaStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

function sumarDias(fechaStr, dias) {
  const d = new Date(`${fechaStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function aFechaStr(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

async function leerParametros() {
  const [rows] = await pool.execute(
    'SELECT `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ?',
    [MODULO, SECCION]
  ).catch(() => [[]]);
  const valor = (concepto) => {
    const fila = rows.find(r => normalizar(r.Concepto) === normalizar(concepto));
    return fila ? String(fila.Parametro == null ? '' : fila.Parametro) : null;
  };
  const habilitar = valor(P_HABILITAR);
  const dias = parseInt(valor(P_DIAS), 10);
  return {
    habilitado: habilitar === null ? true : ['1', 'si', 'sí', 'true'].includes(normalizar(habilitar)),
    correos: lista(valor(P_CORREOS) ?? CORREOS_DEFECTO),
    dias: Number.isFinite(dias) && dias > 0 && dias <= 365 ? dias : 30,
    excluidas: new Set(lista(valor(P_EXCLUIDAS)).map(normalizar)),
    tolerancia: (() => { const t = Number(String(valor(P_TOLERANCIA) ?? '').replace(/[^\d.]/g, '')); return valor(P_TOLERANCIA) !== null && Number.isFinite(t) && t >= 0 ? t : 2000; })(),
  };
}

/**
 * Días con efectivo por operación en [desde, hasta], con el total a consignar (misma fórmula de la pestaña
 * Consignaciones) y si ya tiene comprobante.
 */
async function consultarDias(desde, hasta) {
  const [rows] = await pool.execute(
    `SELECT x.dia, x.operacion, x.regional, x.servicios, x.total,
            COALESCE(TRIM(mc.Comprobante), '') <> '' AS con_comprobante
       FROM (
         SELECT DATE(ds.\`Hora Inicio\`) AS dia,
                dr.\`Operación\` AS operacion,
                COALESCE(mo.REGIONAL, '') AS regional,
                COUNT(*) AS servicios,
                ROUND(SUM(
                  (ds.Cantidad * ds.\`Valor Unitario\`) * (1 + ci.iva_pct)
                  - (CASE WHEN COALESCE(dr.Retefuente, '') = 'V' THEN (ds.Cantidad * ds.\`Valor Unitario\`) * ci.retefuente_pct ELSE 0 END)
                  - (CASE WHEN COALESCE(dr.ReteIVA, '') = 'V' THEN ((ds.Cantidad * ds.\`Valor Unitario\`) * ci.iva_pct) * ci.reteiva_pct ELSE 0 END)
                  - (CASE WHEN COALESCE(dr.ReteICA, '') = 'V' THEN (ds.Cantidad * ds.\`Valor Unitario\`) * COALESCE(rica.Porcentaje, 0) ELSE 0 END)
                )) AS total
           FROM Dynamic_Servicios ds
           JOIN Dynamic_Recibos dr ON dr.IdRecibo = ds.IdRecibo
           LEFT JOIN Maestro_Operaciones mo ON mo.\`OPERACIÓN\` = dr.\`Operación\`
           JOIN (
             SELECT
               COALESCE(MAX(CASE WHEN Concepto = 'IVA' THEN Porcentaje END), 0.19) AS iva_pct,
               COALESCE(MAX(CASE WHEN Concepto = 'ReteFuente' THEN Porcentaje END), 0.04) AS retefuente_pct,
               COALESCE(MAX(CASE WHEN Concepto = 'ReteIVA' THEN Porcentaje END), 0.15) AS reteiva_pct
             FROM Config_Impuestos
           ) ci ON 1 = 1
           LEFT JOIN (
             SELECT \`Operación\`, MAX(Porcentaje) AS Porcentaje
               FROM Config_Impuestos
              WHERE Concepto LIKE '%ReteICA%' AND \`Operación\` IS NOT NULL AND \`Operación\` <> ''
              GROUP BY \`Operación\`
           ) rica ON rica.\`Operación\` = dr.\`Operación\`
          WHERE ds.\`Forma De Pago\` = 1
            AND (dr.Modalidad = 'RECAUDO' OR dr.Modalidad IS NULL)
            AND ds.\`Hora Inicio\` >= ? AND ds.\`Hora Inicio\` < DATE_ADD(?, INTERVAL 1 DAY)
            AND dr.\`Operación\` IS NOT NULL AND dr.\`Operación\` <> ''
          GROUP BY DATE(ds.\`Hora Inicio\`), dr.\`Operación\`, mo.REGIONAL
       ) x
       LEFT JOIN Maestro_Consignaciones mc ON mc.\`Día\` = x.dia AND mc.\`Operación\` = x.operacion
      ORDER BY x.operacion, x.dia`,
    [desde, hasta]
  );
  return rows;
}

/** Consignaciones con comprobante registradas entre desde y hoy (también en días sin servicios). */
async function consultarConsignaciones(desde, hoy) {
  const [rows] = await pool.execute(
    `SELECT DATE(\`Día\`) AS dia, \`Operación\` AS operacion, \`Valor Consignado\` AS valor
       FROM Maestro_Consignaciones
      WHERE \`Día\` >= ? AND \`Día\` <= ?
        AND COALESCE(TRIM(Comprobante), '') <> ''
      ORDER BY \`Día\``,
    [desde, hoy]
  );
  return rows;
}

/**
 * Aplica las consignaciones de una operación a sus días con efectivo (ver encabezado) y devuelve los días
 * que quedan con saldo: [{ dia, servicios, totalDia, total (pendiente) }].
 */
function calcularPendientes(dias, consignaciones, tolerancia) {
  const pend = dias.map(d => ({ ...d, saldo: d.conComprobante ? 0 : d.totalDia }));
  const eventos = [...consignaciones].sort((a, b) => a.dia.localeCompare(b.dia));
  for (const c of eventos) {
    if (c.valor === null) continue; // comprobante sin valor: cubre solo su propio día
    const propio = pend.find(d => d.dia === c.dia);
    let sobrante = c.valor - (propio ? propio.totalDia : 0);
    for (const d of pend) {
      if (sobrante <= 0 || d.dia >= c.dia) break;
      if (d.saldo <= 0) continue;
      const pago = Math.min(d.saldo, sobrante);
      d.saldo -= pago;
      sobrante -= pago;
    }
  }
  return pend
    .filter(d => d.saldo > tolerancia)
    .map(d => ({ dia: d.dia, servicios: d.servicios, totalDia: d.totalDia, total: Math.round(d.saldo) }));
}

async function ejecutarReporteConsignacionesAtrasadas() {
  console.log('[consignacionesAtrasadas] Iniciando revisión...');
  try {
    const params = await leerParametros();
    if (!params.habilitado) {
      console.log('[consignacionesAtrasadas] Notificaciones deshabilitadas en Config_Parametros — no se envía.');
      return;
    }

    const hoy = hoyBogotaStr();
    const ayer = sumarDias(hoy, -1);       // se puede consignar hoy: aún no es atraso
    const limite = sumarDias(hoy, -2);     // de este día hacia atrás, sin consignar = atrasado
    const desde = sumarDias(hoy, -params.dias);

    // Días hasta hoy: el efectivo de hoy y ayer solo sirve para saber cuánto de una consignación es de su
    // propio día; no se reportan (filtro por limite más abajo).
    const [filas, consignaciones] = await Promise.all([consultarDias(desde, hoy), consultarConsignaciones(desde, hoy)]);

    // Agrupar días y consignaciones por operación
    const ops = new Map();
    const opDe = (nombre, regional) => {
      const k = normalizar(nombre);
      if (!ops.has(k)) ops.set(k, { operacion: nombre, regional: regional || '', dias: [], consignaciones: [] });
      const o = ops.get(k);
      if (!o.regional && regional) o.regional = regional;
      return o;
    };
    filas.filter(f => Number(f.total) > 0 && !params.excluidas.has(normalizar(f.operacion))).forEach(f => {
      opDe(f.operacion, f.regional).dias.push({ dia: aFechaStr(f.dia), servicios: Number(f.servicios) || 0, totalDia: Math.round(Number(f.total) || 0), conComprobante: Number(f.con_comprobante) === 1 });
    });
    consignaciones.forEach(c => {
      const o = ops.get(normalizar(c.operacion));
      if (!o) return; // operación sin efectivo en el periodo (o excluida)
      const v = c.valor === null || c.valor === undefined || c.valor === '' ? null : Number(c.valor);
      o.consignaciones.push({ dia: aFechaStr(c.dia), valor: v === null || !Number.isFinite(v) || v <= 0 ? null : v });
    });

    ops.forEach(o => {
      const pendientes = calcularPendientes(o.dias, o.consignaciones, params.tolerancia);
      o.atrasados = pendientes.filter(d => d.dia <= limite);   // lo de ayer aún se puede consignar hoy
    });

    const atrasadas = [...ops.values()].filter(o => o.atrasados.length)
      .map(o => ({ ...o, totalAtrasado: o.atrasados.reduce((s, d) => s + d.total, 0), diaMasAntiguo: o.atrasados[0].dia }))
      .sort((a, b) => b.atrasados.length - a.atrasados.length || a.operacion.localeCompare(b.operacion));
    const alDia = [...ops.values()].filter(o => !o.atrasados.length).map(o => o.operacion).sort((a, b) => a.localeCompare(b));

    console.log(`[consignacionesAtrasadas] ${atrasadas.length} operación(es) atrasada(s), ${alDia.length} al día (desde ${desde} hasta ${limite}).`);

    // 1. Reporte general a Contabilidad
    if (params.correos.length) {
      await notificarConsignacionesAtrasadasReporte({
        destinatarios: params.correos, fechaReporte: hoy, fechaLimite: limite, desde, atrasadas, alDia,
      }).then(() => console.log(`[consignacionesAtrasadas] Reporte general enviado a ${params.correos.join(', ')}`))
        .catch(err => console.error('[consignacionesAtrasadas] Error enviando el reporte general:', err.message));
    }

    // 2. Aviso informativo a los responsables. Las operaciones con los mismos destinatarios van en un solo
    //    correo: así, si varias operaciones de una regional no tienen Auxiliar ni Coordinador y caen en los
    //    AuxiliarR/CoordinadorR de la regional, les llega un correo con todas y no uno por operación.
    const grupos = new Map();
    for (const op of atrasadas) {
      try {
        const { para, copia } = await resolverDestinatariosOperacion(op.operacion, op.regional);
        if (!para.length) {
          console.warn(`[consignacionesAtrasadas] Sin responsables para Operación="${op.operacion}" — se omite`);
          continue;
        }
        const clave = para.map(d => d.Email.toLowerCase()).sort().join(',') + '|' + copia.map(c => c.toLowerCase()).sort().join(',');
        if (!grupos.has(clave)) grupos.set(clave, { para, copia, regional: op.regional, operaciones: [] });
        grupos.get(clave).operaciones.push({ operacion: op.operacion, dias: op.atrasados, totalAtrasado: op.totalAtrasado });
      } catch (err) {
        console.error(`[consignacionesAtrasadas] Error resolviendo responsables de "${op.operacion}":`, err.message);
      }
    }
    for (const g of grupos.values()) {
      try {
        await notificarConsignacionesAtrasadasOperacion({
          destinatarios: g.para.map(d => d.Email),
          copia: g.copia,
          nombres: g.para.map(d => d.Nombre),
          regional: g.regional,
          operaciones: g.operaciones,
          fechaLimite: limite,
        });
        console.log(`[consignacionesAtrasadas] Aviso a ${g.para.map(d => d.Email).join(', ')}${g.copia.length ? ' (copia ' + g.copia.join(', ') + ')' : ''} — ${g.operaciones.map(o => `${o.operacion} (${o.dias.length} día(s))`).join(', ')}`);
      } catch (err) {
        console.error(`[consignacionesAtrasadas] Error notificando ${g.operaciones.map(o => o.operacion).join(', ')}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[consignacionesAtrasadas] Error general:', err.message);
  }
}

/** Revisa cada 30 segundos y envía a las 7:40 a. m. hora de Colombia (mismo patrón que tomoCargoNotifier.js). */
function iniciarProgramadorConsignacionesAtrasadas() {
  console.log('[consignacionesAtrasadas] Daily scheduler started.');
  setInterval(async () => {
    try {
      const nowColombia = new Date(Date.now() - 5 * 3600000);
      const todayStr = nowColombia.toISOString().slice(0, 10);
      if (nowColombia.getUTCHours() === 7 && nowColombia.getUTCMinutes() === 40 && lastRunDate !== todayStr) {
        lastRunDate = todayStr;
        if (!(await reclamarTareaDiaria('consignaciones_atrasadas', todayStr))) return;
        console.log(`[consignacionesAtrasadas] Triggering daily task at 7:40 AM Colombia time (${todayStr})`);
        await ejecutarReporteConsignacionesAtrasadas();
        await terminarTareaDiaria('consignaciones_atrasadas', todayStr, 'ok');
      }
    } catch (err) {
      console.error('[consignacionesAtrasadas] Error checking daily scheduler time:', err.message);
    }
  }, 30000);
}

module.exports = { ejecutarReporteConsignacionesAtrasadas, iniciarProgramadorConsignacionesAtrasadas, calcularPendientes };
