/**
 * operacionesConRegistro.js
 * Operaciones que tienen servicios en efectivo (Forma De Pago = 1, modalidad Recaudo) o por
 * transferencia (Forma De Pago = 2) en los últimos meses. Sirve para que los filtros de las
 * pestañas Consignaciones y Transferencias muestren solo las operaciones que aplican (las demás
 * trabajan solo a crédito).
 *
 * Meses hacia atrás: Config_Parametros contabilidad / Filtros / "Meses para operaciones con registro"
 * (por defecto 12). El resultado se guarda en memoria 1 hora porque la consulta recorre muchos servicios.
 */

const pool = require('./db');

const CACHE_MS = 60 * 60 * 1000;
let cache = null; // { hasta, datos: { consignaciones: [], transferencias: [] } }
let enCurso = null;

async function mesesConfigurados() {
  try {
    const [rows] = await pool.query(
      "SELECT Parametro FROM Config_Parametros WHERE Modulo = 'contabilidad' AND Seccion = 'Filtros' AND Concepto = 'Meses para operaciones con registro' LIMIT 1"
    );
    const n = parseInt(rows[0] && rows[0].Parametro, 10);
    if (Number.isFinite(n) && n > 0 && n <= 60) return n;
  } catch (_) { /* sin fila: valor por defecto */ }
  return 12;
}

async function consultar() {
  const meses = await mesesConfigurados();
  const [rows] = await pool.query(
    `SELECT s.\`Forma De Pago\` AS fp, r.\`Operación\` AS operacion
       FROM Dynamic_Servicios s
       JOIN Dynamic_Recibos r ON r.IdRecibo = s.IdRecibo
      WHERE s.\`Hora Inicio\` >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
        AND (
          (s.\`Forma De Pago\` = 1 AND (r.Modalidad = 'RECAUDO' OR r.Modalidad IS NULL))
          OR s.\`Forma De Pago\` = 2
        )
        AND r.\`Operación\` IS NOT NULL AND r.\`Operación\` <> ''
      GROUP BY s.\`Forma De Pago\`, r.\`Operación\``,
    [meses]
  );
  const datos = { consignaciones: [], transferencias: [] };
  rows.forEach(row => {
    if (Number(row.fp) === 1) datos.consignaciones.push(row.operacion);
    else if (Number(row.fp) === 2) datos.transferencias.push(row.operacion);
  });
  return datos;
}

/** Devuelve { consignaciones: [...], transferencias: [...] } o null si no se pudo consultar. */
async function obtenerOperacionesConRegistro() {
  if (cache && cache.hasta > Date.now()) return cache.datos;
  if (!enCurso) {
    enCurso = consultar()
      .then(datos => { cache = { hasta: Date.now() + CACHE_MS, datos }; return datos; })
      .catch(err => { console.error('[contabilidad] operaciones con registro:', err.message); return cache ? cache.datos : null; })
      .finally(() => { enCurso = null; });
  }
  return enCurso;
}

module.exports = { obtenerOperacionesConRegistro };
