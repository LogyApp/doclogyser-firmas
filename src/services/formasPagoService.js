const pool = require('./db');

/**
 * Contabilidad › Formas de Pago (informe de la quincena por operación).
 *
 * Muestra cómo se reparte lo facturado entre Efectivo (1), Transferencia (2) y Crédito (3).
 * Todos ven el porcentaje de todas las operaciones; los valores en pesos solo salen del
 * servidor para las operaciones del alcance del usuario (Maestro_Menu contabilidad /
 * Formas_Pago: 1 = todas, 2 = su regional, 3 = su operación).
 *
 * Subtotal = Cantidad × Valor Unitario. Total = Subtotal + IVA − retenciones, con la misma
 * fórmula de las métricas de Facturación (Config_Impuestos), para que las cifras coincidan.
 * La fecha del servicio es `Hora Inicio`, igual que en Facturación.
 */

const FORMAS = [1, 2, 3]; // Efectivo, Transferencia, Crédito

function normalizar(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function hoyBogota() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

let cacheImpuestos = null;
let cacheImpuestosT = 0;
async function impuestos() {
  if (cacheImpuestos && Date.now() - cacheImpuestosT < 5 * 60 * 1000) return cacheImpuestos;
  const [rows] = await pool.query('SELECT Concepto, `Operación`, Porcentaje FROM Config_Impuestos');
  const reteIcaMap = {};
  rows.filter(r => r.Concepto === 'ReteICA' && r['Operación']).forEach(r => {
    reteIcaMap[String(r['Operación']).trim().toLowerCase()] = Number(r.Porcentaje) || 0;
  });
  cacheImpuestos = {
    iva: Number(rows.find(r => r.Concepto === 'IVA')?.Porcentaje) || 0.19,
    reteFuente: Number(rows.find(r => r.Concepto === 'ReteFuente')?.Porcentaje) || 0.04,
    reteIva: Number(rows.find(r => r.Concepto === 'ReteIVA')?.Porcentaje) || 0.15,
    reteIcaMap,
  };
  cacheImpuestosT = Date.now();
  return cacheImpuestos;
}

// Rango [inicio, fin) de una quincena de un año, según Maestro_Fechas
async function rangoQuincena(quincena, anio) {
  const [rows] = await pool.execute(
    `SELECT DATE_FORMAT(MIN(Fecha), '%Y-%m-%d') AS inicio, DATE_FORMAT(MAX(Fecha), '%Y-%m-%d') AS ultimo,
            DATE_FORMAT(DATE_ADD(MAX(Fecha), INTERVAL 1 DAY), '%Y-%m-%d') AS fin
       FROM Maestro_Fechas WHERE Quincena = ? AND Fecha >= ? AND Fecha < ?`,
    [quincena, `${anio}-01-01`, `${Number(anio) + 1}-01-01`]
  );
  const r = rows[0];
  return r && r.inicio ? { quincena, anio: String(anio), inicio: r.inicio, ultimo: r.ultimo, fin: r.fin } : null;
}

// Quincena anterior: la del día anterior al inicio de la quincena dada
async function quincenaAnterior(rango) {
  const [rows] = await pool.execute(
    `SELECT Quincena, YEAR(Fecha) AS anio FROM Maestro_Fechas
      WHERE Fecha = DATE_SUB(?, INTERVAL 1 DAY) LIMIT 1`,
    [rango.inicio]
  );
  if (!rows.length || !rows[0].Quincena) return null;
  return rangoQuincena(rows[0].Quincena, rows[0].anio);
}

async function quincenaDeHoy() {
  const hoy = hoyBogota();
  const [rows] = await pool.execute('SELECT Quincena FROM Maestro_Fechas WHERE Fecha = ? LIMIT 1', [hoy]);
  return { quincena: rows.length ? rows[0].Quincena : null, anio: hoy.slice(0, 4) };
}

// Sumas por operación, forma de pago (y día si porDia) de un rango
async function sumas(rango, porDia) {
  const imp = await impuestos();
  let reteIcaCase = 'CASE ';
  for (const [op, p] of Object.entries(imp.reteIcaMap)) {
    reteIcaCase += `WHEN LOWER(TRIM(r.\`Operación\`)) = ${pool.escape(op)} THEN ${Number(p)} `;
  }
  reteIcaCase += 'ELSE 0 END';
  const base = '(COALESCE(s.Cantidad, 0) * COALESCE(s.`Valor Unitario`, 0))';
  const iva = `(${base} * ${imp.iva})`;
  const total = `(${base} + ${iva}
    - (CASE WHEN r.Retefuente = 'V' THEN ${base} * ${imp.reteFuente} ELSE 0 END)
    - (CASE WHEN r.ReteIVA = 'V' THEN ${iva} * ${imp.reteIva} ELSE 0 END)
    - (CASE WHEN r.ReteICA = 'V' THEN ${base} * (${reteIcaCase}) ELSE 0 END))`;
  const dia = porDia ? ", DATE_FORMAT(s.`Hora Inicio`, '%Y-%m-%d') AS dia" : '';
  const [rows] = await pool.query(
    `SELECT r.\`Operación\` AS operacion, s.\`Forma De Pago\` AS fp${dia},
            COUNT(*) AS n, SUM(${base}) AS base, SUM(${total}) AS total
       FROM Dynamic_Servicios s
       JOIN Dynamic_Recibos r ON r.IdRecibo = s.IdRecibo
      WHERE s.\`Hora Inicio\` >= ? AND s.\`Hora Inicio\` < ? AND s.\`Forma De Pago\` IN (1, 2, 3)
      GROUP BY r.\`Operación\`, s.\`Forma De Pago\`${porDia ? ', dia' : ''}`,
    [`${rango.inicio} 00:00:00`, `${rango.fin} 00:00:00`]
  );
  return rows;
}

function vacio() {
  return { base: [0, 0, 0], total: [0, 0, 0], n: 0 };
}
function acumular(dest, fila) {
  const i = FORMAS.indexOf(Number(fila.fp));
  if (i < 0) return;
  dest.base[i] += Number(fila.base) || 0;
  dest.total[i] += Number(fila.total) || 0;
  dest.n += Number(fila.n) || 0;
}
function sumarEn(dest, src) {
  for (let i = 0; i < 3; i++) { dest.base[i] += src.base[i]; dest.total[i] += src.total[i]; }
  dest.n += src.n;
}
// Fracciones [efectivo, transferencia, crédito] sobre el total de cada medida (4 decimales)
function fracciones(v) {
  const f = arr => {
    const t = arr[0] + arr[1] + arr[2];
    return t > 0 ? arr.map(x => Math.round((x / t) * 10000) / 10000) : null;
  };
  return { base: f(v.base), total: f(v.total) };
}
function valoresRedondeados(v) {
  return { base: v.base.map(Math.round), total: v.total.map(Math.round), servicios: v.n };
}

async function obtenerInforme(filtros, acceso) {
  const deHoy = await quincenaDeHoy();
  const anio = /^\d{4}$/.test(String(filtros.anio || '')) ? String(filtros.anio) : deHoy.anio;
  const quincena = filtros.quincena || deHoy.quincena;
  if (!quincena) throw new Error('No se encontró la quincena actual en Maestro_Fechas.');
  const rango = await rangoQuincena(quincena, anio);
  if (!rango) throw new Error(`La quincena "${quincena}" no existe en Maestro_Fechas para ${anio}.`);
  const anterior = await quincenaAnterior(rango);

  const [filasActual, filasAnterior, [ops]] = await Promise.all([
    sumas(rango, true),
    anterior ? sumas(anterior, false) : Promise.resolve([]),
    pool.query("SELECT `OPERACIÓN` AS operacion, MAX(REGIONAL) AS regional FROM Maestro_Operaciones GROUP BY `OPERACIÓN`"),
  ]);

  const regionalDe = new Map(ops.map(o => [normalizar(o.operacion), o.regional]));
  const permitidas = new Set((acceso.operacionesFiltro || []).map(normalizar));
  const esPermitida = op => acceso.sinFiltro || permitidas.has(normalizar(op));

  // Agrupar por operación (y día)
  const porOp = new Map();
  const nodo = op => {
    const k = op || 'Sin operación';
    if (!porOp.has(k)) porOp.set(k, { operacion: k, actual: vacio(), anterior: vacio(), dias: new Map() });
    return porOp.get(k);
  };
  filasActual.forEach(f => {
    const n = nodo(f.operacion);
    acumular(n.actual, f);
    if (!n.dias.has(f.dia)) n.dias.set(f.dia, vacio());
    acumular(n.dias.get(f.dia), f);
  });
  filasAnterior.forEach(f => {
    if (!porOp.has(f.operacion || 'Sin operación')) return; // solo operaciones con datos en la quincena consultada
    acumular(nodo(f.operacion).anterior, f);
  });

  const regional = String(filtros.regional || '');
  const operacion = String(filtros.operacion || '');
  const todas = [...porOp.values()].map(n => ({ ...n, regional: regionalDe.get(normalizar(n.operacion)) || 'SIN REGIONAL' }));

  // Conteos de los filtros (cuántas operaciones hay en cada opción, con el otro filtro aplicado)
  const contar = (lista, campo) => {
    const m = new Map();
    lista.forEach(n => m.set(n[campo], (m.get(n[campo]) || 0) + 1));
    return [...m.entries()].map(([valor, n]) => ({ valor, n })).sort((a, b) => String(a.valor).localeCompare(String(b.valor), 'es'));
  };
  const facetas = {
    regional: contar(todas.filter(n => !operacion || n.operacion === operacion), 'regional'),
    operacion: contar(todas.filter(n => !regional || n.regional === regional), 'operacion'),
  };

  const filtradas = todas.filter(n => (!regional || n.regional === regional) && (!operacion || n.operacion === operacion));
  const todasPermitidas = filtradas.every(n => esPermitida(n.operacion));

  // Consolidado y días del conjunto filtrado
  const consolidado = vacio();
  const consolidadoAnt = vacio();
  const dias = new Map();
  for (let d = new Date(`${rango.inicio}T12:00:00`); d.toISOString().slice(0, 10) <= rango.ultimo; d.setDate(d.getDate() + 1)) {
    dias.set(d.toISOString().slice(0, 10), vacio());
  }
  filtradas.forEach(n => {
    sumarEn(consolidado, n.actual);
    sumarEn(consolidadoAnt, n.anterior);
    n.dias.forEach((v, dia) => { if (dias.has(dia)) sumarEn(dias.get(dia), v); });
  });

  return {
    ok: true,
    anio,
    quincena,
    desde: rango.inicio,
    hasta: rango.ultimo,
    anterior: anterior ? { quincena: anterior.quincena, anio: anterior.anio } : null,
    accesoCode: acceso.accesoCode,
    sinFiltro: Boolean(acceso.sinFiltro),
    misOperaciones: acceso.sinFiltro ? [] : (acceso.operacionesFiltro || []),
    facetas,
    resumen: {
      pct: fracciones(consolidado),
      pctAnterior: fracciones(consolidadoAnt),
      valores: todasPermitidas ? valoresRedondeados(consolidado) : null,
    },
    operaciones: filtradas.map(n => {
      const permitida = esPermitida(n.operacion);
      return {
        operacion: n.operacion,
        regional: n.regional,
        permitida,
        pct: fracciones(n.actual),
        pctAnterior: fracciones(n.anterior),
        valores: permitida ? valoresRedondeados(n.actual) : null,
      };
    }),
    dias: [...dias.entries()].map(([dia, v]) => ({
      dia,
      pct: fracciones(v),
      valores: todasPermitidas ? valoresRedondeados(v) : null,
    })),
  };
}

// Quincenas de un año (más recientes primero), para el selector
async function quincenasDelAnio(anio) {
  const [rows] = await pool.execute(
    `SELECT Quincena AS quincena FROM Maestro_Fechas WHERE Fecha >= ? AND Fecha < ?
      GROUP BY Quincena ORDER BY MAX(Fecha) DESC`,
    [`${anio}-01-01`, `${Number(anio) + 1}-01-01`]
  );
  return rows.map(r => r.quincena).filter(Boolean);
}

module.exports = { obtenerInforme, quincenasDelAnio, quincenaDeHoy };
