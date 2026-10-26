const pool = require('./db');

// ── Producción: liquidación de destajo colectivo (pestaña Nómina · Producción) ──────────────
// Por cada Operación y Día:
//  1. Servicios (Dynamic_Servicios) con Forma De Pago 1, 2 o 3 cuyo día de Hora Inicio cae en el
//     rango; la Operación sale del recibo (Dynamic_Recibos). Valor = Cantidad × Valor Unitario,
//     salvo que Maestro_Tarifas tenga una tarifa GENERAL con valor_nomina > 0 para la misma
//     Operación + Actividad + Unidad (+ Vehiculo solo si la Unidad es CUPO): entonces se usa
//     valor_nomina como Valor Unitario.
//  2. Asistentes (Dynamic_Asistencia, Novedad 'Asistencia') cuya Area (ID de Config_Area) tiene
//     DTJO = 1.
//  3. Las áreas con GRUPAL = 1 de la operación forman una sola bolsa con todos los servicios de la
//     operación (menos los de áreas GRUPAL = 0) y se reparte entre todos sus asistentes. Cada área
//     con GRUPAL = 0 tiene su propia bolsa: solo sus servicios, solo sus asistentes.
//  4. Bolsa = valor de los servicios × ASIGNADO (fracción, ej. 0.77 = 77 %); se reparte por igual.
// Solo consulta: no escribe nada (Dynamic_Asistencia.Valor Destajo no se toca).

const FORMAS_PAGO = [1, 2, 3];
const MAX_DIAS_RANGO = 62;

function norm(v) {
  return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
}

function fechaISO(d) {
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(d || '').slice(0, 10);
}

async function cargarAreas() {
  const [rows] = await pool.query(
    'SELECT ID AS id, AREA AS area, `OPERACIÓN` AS operacion, DTJO AS dtjo, GRUPAL AS grupal, ASIGNADO AS asignado FROM Config_Area'
  );
  const porId = new Map();
  rows.forEach(r => porId.set(String(r.id), {
    ...r,
    dtjo: Number(r.dtjo) === 1,
    grupal: Number(r.grupal) === 1,
    asignado: Number(r.asignado) || 0,
  }));
  return porId;
}

// Tarifas GENERAL con valor_nomina > 0, por Operación|Actividad|Unidad(|Vehiculo si CUPO)
async function cargarTarifasNomina() {
  const [rows] = await pool.query(
    "SELECT `Operación` AS operacion, Actividad AS actividad, Unidad AS unidad, Vehiculo AS vehiculo, valor_nomina AS valorNomina FROM Maestro_Tarifas WHERE UPPER(TRIM(`Tipo de Cobro`)) = 'GENERAL' AND valor_nomina > 0"
  );
  const mapa = new Map();
  rows.forEach(t => mapa.set(claveTarifa(t.operacion, t.actividad, t.unidad, t.vehiculo), Number(t.valorNomina)));
  return mapa;
}

function claveTarifa(operacion, actividad, unidad, vehiculo) {
  const u = norm(unidad);
  return [norm(operacion), norm(actividad), u, u === 'CUPO' ? norm(vehiculo) : ''].join('|');
}

async function cargarRegionales() {
  const [rows] = await pool.query('SELECT `OPERACIÓN` AS operacion, REGIONAL AS regional FROM Maestro_Operaciones');
  const mapa = new Map();
  rows.forEach(r => mapa.set(norm(r.operacion), r.regional));
  return mapa;
}

// operaciones: lista de nombres permitidos, o null para todas.
async function calcularProduccion({ desde, hasta, operaciones = null, operacion = null }) {
  const filtroOps = operacion ? [operacion] : operaciones;
  if (Array.isArray(filtroOps) && !filtroOps.length) return [];

  const [areas, tarifas, regionales] = await Promise.all([cargarAreas(), cargarTarifasNomina(), cargarRegionales()]);

  // Solo operaciones con al menos un área de destajo
  const opsDestajo = new Set([...areas.values()].filter(a => a.dtjo).map(a => norm(a.operacion)));
  const opsConsulta = (filtroOps || [...new Set([...areas.values()].filter(a => a.dtjo).map(a => a.operacion))])
    .filter(op => opsDestajo.has(norm(op)));
  if (!opsConsulta.length) return [];

  const [asistentes] = await pool.query(
    `SELECT \`Operación\` AS operacion, Día AS dia, Area AS area, \`Cédula\` AS cedula,
            COALESCE(NULLIF(TRIM(Nombre), ''), Trabajador) AS nombre
     FROM Dynamic_Asistencia
     WHERE Novedad = 'Asistencia' AND Día BETWEEN ? AND ? AND \`Operación\` IN (?)`,
    [desde, hasta, opsConsulta]
  );

  const [servicios] = await pool.query(
    `SELECT s.IdServicio AS idServicio, r.\`Operación\` AS operacion, DATE(s.\`Hora Inicio\`) AS dia,
            s.Area AS area, s.Actividad AS actividad, s.Unidad AS unidad, s.Vehiculo AS vehiculo,
            s.Cantidad AS cantidad, s.\`Valor Unitario\` AS valorUnitario
     FROM Dynamic_Servicios s
     JOIN Dynamic_Recibos r ON r.IdRecibo = s.IdRecibo
     WHERE s.\`Hora Inicio\` >= ? AND s.\`Hora Inicio\` < DATE_ADD(?, INTERVAL 1 DAY)
       AND s.\`Forma De Pago\` IN (?) AND r.\`Operación\` IN (?)`,
    [desde, hasta, FORMAS_PAGO, opsConsulta]
  );

  // Agrupar por Operación + Día
  const dias = new Map();
  const grupoDe = (operacion, dia) => {
    const k = `${norm(operacion)}|${fechaISO(dia)}`;
    if (!dias.has(k)) dias.set(k, { operacion, dia: fechaISO(dia), servicios: [], asistentes: new Map() });
    return dias.get(k);
  };

  asistentes.forEach(a => {
    const area = areas.get(String(a.area));
    if (!area || !area.dtjo) return;
    const g = grupoDe(a.operacion, a.dia);
    const cedula = String(a.cedula);
    if (!g.asistentes.has(cedula)) g.asistentes.set(cedula, { cedula, nombre: a.nombre, area });
  });

  servicios.forEach(s => {
    const vNomina = tarifas.get(claveTarifa(s.operacion, s.actividad, s.unidad, s.vehiculo));
    const valorUnitario = vNomina > 0 ? vNomina : Number(s.valorUnitario) || 0;
    const valor = (Number(s.cantidad) || 0) * valorUnitario;
    grupoDe(s.operacion, s.dia).servicios.push({ ...s, valor, usaValorNomina: vNomina > 0 });
  });

  const resultado = [];
  for (const g of dias.values()) {
    const areasOp = [...areas.values()].filter(a => a.dtjo && norm(a.operacion) === norm(g.operacion));
    const grupales = areasOp.filter(a => a.grupal);
    const asignadoGrupal = grupales.length ? grupales.reduce((s, a) => s + a.asignado, 0) / grupales.length : 0;

    // Bolsas: 'GRUPAL' y una por cada área con GRUPAL = 0
    const bolsas = new Map();
    const bolsa = (clave, nombre, asignado) => {
      if (!bolsas.has(clave)) bolsas.set(clave, { clave, nombre, asignado, valorServicios: 0, bolsa: 0, servicios: 0, trabajadores: [] });
      return bolsas.get(clave);
    };
    if (grupales.length) bolsa('GRUPAL', grupales.map(a => a.area).join(', '), asignadoGrupal);

    let valorServicios = 0, valorSinRepartir = 0, serviciosValorNomina = 0;
    g.servicios.forEach(s => {
      valorServicios += s.valor;
      if (s.usaValorNomina) serviciosValorNomina++;
      const areaServ = areas.get(String(s.area));
      let b = null;
      let factor = 0;
      if (areaServ && areaServ.dtjo && !areaServ.grupal && norm(areaServ.operacion) === norm(g.operacion)) {
        b = bolsa(`AREA:${areaServ.id}`, areaServ.area, areaServ.asignado);
        factor = areaServ.asignado;
      } else if (grupales.length) {
        b = bolsas.get('GRUPAL');
        factor = areaServ && areaServ.grupal && areaServ.dtjo ? areaServ.asignado : asignadoGrupal;
      }
      if (!b) { valorSinRepartir += s.valor; return; }
      b.valorServicios += s.valor;
      b.bolsa += s.valor * factor;
      b.servicios++;
    });

    g.asistentes.forEach(t => {
      const b = t.area.grupal ? bolsas.get('GRUPAL') : bolsa(`AREA:${t.area.id}`, t.area.area, t.area.asignado);
      if (b) b.trabajadores.push(t);
    });

    const trabajadores = [];
    let valorDia = 0;
    bolsas.forEach(b => {
      if (!b.trabajadores.length) { valorSinRepartir += b.valorServicios; return; }
      valorDia += b.bolsa;
      const porTrabajador = b.bolsa / b.trabajadores.length;
      b.trabajadores.forEach(t => trabajadores.push({
        cedula: t.cedula,
        nombre: t.nombre,
        area: t.area.area,
        bolsa: b.clave === 'GRUPAL' ? 'Grupal' : `Área ${b.nombre}`,
        valor: Math.round(porTrabajador),
      }));
    });

    if (!trabajadores.length && !valorServicios) continue;
    trabajadores.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
    resultado.push({
      regional: regionales.get(norm(g.operacion)) || '',
      operacion: g.operacion,
      dia: g.dia,
      valorServicios: Math.round(valorServicios),
      valorDia: Math.round(valorDia),
      trabajadores: trabajadores.length,
      promedio: trabajadores.length ? Math.round(valorDia / trabajadores.length) : 0,
      servicios: g.servicios.length,
      serviciosValorNomina,
      valorSinRepartir: Math.round(valorSinRepartir),
      bolsas: [...bolsas.values()].map(b => ({
        nombre: b.clave === 'GRUPAL' ? `Grupal (${b.nombre})` : `Área ${b.nombre}`,
        asignado: b.asignado,
        valorServicios: Math.round(b.valorServicios),
        bolsa: Math.round(b.bolsa),
        servicios: b.servicios,
        trabajadores: b.trabajadores.length,
      })),
      detalle: trabajadores,
    });
  }

  resultado.sort((a, b) => b.dia.localeCompare(a.dia) || String(a.operacion).localeCompare(String(b.operacion), 'es'));
  return resultado;
}

module.exports = { calcularProduccion, MAX_DIAS_RANGO, FORMAS_PAGO };
