/**
 * consignacionesAtrasadasNotifier.js
 * Reporte diario (7:40 a. m., hora de Colombia) de consignaciones atrasadas.
 *
 * Regla: el efectivo de un día (servicios con Forma De Pago = 1, modalidad Recaudo) se consigna al día
 * siguiente. El día del envío (hoy) todavía se puede consignar lo de ayer, así que una operación está
 * ATRASADA si tiene días de antes de ayer (o anteriores) sin consignar. "Consignado" = la fila de
 * Maestro_Consignaciones de ese día y operación tiene Comprobante (igual que la fase verde de la pestaña).
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
const CORREOS_DEFECTO = 'auditoria.recaudo@logyser.com, asistente.contabilidad@logyser.com';

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
  };
}

/**
 * Días con efectivo por operación en [desde, hasta], con el total a consignar (misma fórmula de la pestaña
 * Consignaciones) y si ya tiene comprobante.
 */
async function consultarDias(desde, hasta) {
  const [rows] = await pool.execute(
    `SELECT x.dia, x.operacion, x.regional, x.servicios, x.total,
            COALESCE(TRIM(mc.Comprobante), '') <> '' AS consignado
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

    const filas = (await consultarDias(desde, ayer))
      .filter(f => Number(f.total) > 0 && !params.excluidas.has(normalizar(f.operacion)));

    // Agrupar por operación
    const ops = new Map();
    filas.forEach(f => {
      const dia = aFechaStr(f.dia);
      if (!ops.has(f.operacion)) ops.set(f.operacion, { operacion: f.operacion, regional: f.regional, atrasados: [], pendienteHoy: null });
      const op = ops.get(f.operacion);
      const consignado = Number(f.consignado) === 1;
      if (consignado) return;
      const item = { dia, servicios: Number(f.servicios) || 0, total: Math.round(Number(f.total) || 0) };
      if (dia <= limite) op.atrasados.push(item);
      else if (dia === ayer) op.pendienteHoy = item;
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

    // 2. Aviso informativo a cada operación atrasada
    for (const op of atrasadas) {
      try {
        const { para, copia } = await resolverDestinatariosOperacion(op.operacion, op.regional);
        if (!para.length) {
          console.warn(`[consignacionesAtrasadas] Sin responsables para Operación="${op.operacion}" — se omite`);
          continue;
        }
        await notificarConsignacionesAtrasadasOperacion({
          destinatarios: para.map(d => d.Email),
          copia,
          nombres: para.map(d => d.Nombre),
          operacion: op.operacion,
          fechaLimite: limite,
          dias: op.atrasados,
          totalAtrasado: op.totalAtrasado,
        });
        console.log(`[consignacionesAtrasadas] Aviso a ${para.map(d => d.Email).join(', ')}${copia.length ? ' (copia ' + copia.join(', ') + ')' : ''} — ${op.operacion}, ${op.atrasados.length} día(s)`);
      } catch (err) {
        console.error(`[consignacionesAtrasadas] Error notificando Operación="${op.operacion}":`, err.message);
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
        console.log(`[consignacionesAtrasadas] Triggering daily task at 7:40 AM Colombia time (${todayStr})`);
        await ejecutarReporteConsignacionesAtrasadas();
      }
    } catch (err) {
      console.error('[consignacionesAtrasadas] Error checking daily scheduler time:', err.message);
    }
  }, 30000);
}

module.exports = { ejecutarReporteConsignacionesAtrasadas, iniciarProgramadorConsignacionesAtrasadas };
