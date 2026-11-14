/**
 * controlQuincena.js
 * Reporte "Control de quincena" (Nómina › Asistencia y Novedades): ¿cada operación está al 100%?
 *
 * Plantilla de la quincena de una operación = las personas que pertenecieron a ella al menos un día de
 * la quincena (plantillaAsistencia.js), sin los cargos excluidos de asistencia (Config_Parametros
 * nomina / Asistencia / Cargos_Excluidos_Asistencia). Cada una debe tener, cada día, exactamente un
 * registro en la operación:
 *   - los días en que pertenecía a la operación: su asistencia o novedad;
 *   - los demás días: Nuevo, Retirado o Traslado (los pone el sistema, rellenoAsistencia.js).
 * Quien llega de apoyo desde otra operación se muestra aparte y no cuenta para el porcentaje.
 *
 * Estados de una casilla (persona × día):
 *   ok         registro correcto
 *   pendiente  falta registrar (solo días hasta hoy)
 *   falta_aoo  trabajó como apoyo en otra operación pero aquí falta "Apoyo a Otra Operación"
 *   relleno    Nuevo / Retirado / Traslado correcto
 *   falta_relleno  día que no pertenecía y no tiene relleno (el sistema lo pone; botón Acomodar)
 *   duplicado  más de un registro ese día
 *   conflicto  registro que no corresponde (p. ej. asistencia en un día en que no pertenecía,
 *              o "Nuevo" en un día en que sí estaba vinculado)
 *   futuro     día posterior a hoy sin registro
 */
const pool = require('./db');
const P = require('./plantillaAsistencia');
const { clasificar, PREFIJOS_RELLENO } = require('./reglasAsistencia');

const NORMALIZAR = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

async function cargosExcluidos() {
  const porDefecto = ['APRENDIZ', 'AUXILIAR ADMINISTRATIVO DE OPERACIÓN', 'AUXILIAR ADMINISTRATIVO REGIONAL',
    'COORDINADOR LOGISTICO', 'COORDINADOR REGIONAL', 'AUXILIAR SST', 'ANALISTA DE SST'];
  let lista = porDefecto;
  try {
    const [rows] = await pool.query(
      "SELECT Parametro FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Cargos_Excluidos_Asistencia' LIMIT 1"
    );
    if (rows.length && rows[0].Parametro) lista = String(rows[0].Parametro).split(',');
  } catch (_) { /* por defecto */ }
  return new Set(lista.map(NORMALIZAR).filter(Boolean));
}

/** Operaciones activas visibles para el usuario, con su regional. */
async function operacionesVisibles(acceso, { regional = '', operacion = '' } = {}) {
  const [rows] = await pool.query(
    "SELECT `OPERACIÓN` AS operacion, REGIONAL AS regional FROM Maestro_Operaciones WHERE REGIONAL <> 'INACTIVO' AND `OPERACIÓN` <> 'Administracion' ORDER BY REGIONAL, `OPERACIÓN`"
  );
  return rows.filter(r =>
    (acceso.sinFiltro || (acceso.operacionesFiltro || []).includes(r.operacion)) &&
    (!regional || r.regional === regional) &&
    (!operacion || r.operacion === operacion)
  );
}

/**
 * @param {object} acceso   { sinFiltro, operacionesFiltro }
 * @param {object} filtro   { fecha (cualquier día de la quincena), regional, operacion, detalle: incluir planilla por persona }
 */
async function obtenerControlQuincena(acceso, { fecha, regional = '', operacion = '', detalle = false } = {}) {
  const hoy = P.hoyColombia();
  const q = P.quincenaDe(P.FECHA_RE.test(fecha || '') ? fecha : hoy);
  const dias = P.diasEntre(q.desde, q.hasta);
  const ops = await operacionesVisibles(acceso, { regional, operacion });
  const vacio = { quincena: q, hoy, dias, operaciones: [], resumen: null };
  if (!ops.length) return vacio;
  const nombresOps = ops.map(o => o.operacion);
  const setOps = new Set(nombresOps);
  const excluidos = await cargosExcluidos();

  // Personas que pasaron por estas operaciones en la quincena
  const personas = await P.cargarTramos({ desde: q.desde, hasta: q.hasta, operaciones: nombresOps });

  // Registros de la quincena de esas personas y los hechos en estas operaciones (apoyos recibidos)
  const ids = [...personas.keys()].map(Number);
  const phOps = nombresOps.map(() => '?').join(',');
  const condIds = ids.length ? `\`Cédula\` IN (${ids.map(() => '?').join(',')}) OR ` : '';
  const [registros] = await pool.query(
    `SELECT IdAsistencia AS id, \`Cédula\` AS cedula, Nombre AS nombre, Trabajador AS trabajador,
            DATE_FORMAT(\`Día\`, '%Y-%m-%d') AS dia, \`Operación\` AS operacion, Origen AS origen,
            \`Prefijo Novedad\` AS prefijo, Novedad AS novedad, \`Apoyo Otra Operación\` AS apoyo, Estado AS estado
       FROM Dynamic_Asistencia
      WHERE \`Día\` BETWEEN ? AND ? AND (${condIds}\`Operación\` IN (${phOps}) OR Origen IN (${phOps}))`,
    [q.desde, q.hasta, ...ids, ...nombresOps, ...nombresOps]
  );
  // Quienes vinieron de apoyo desde otras operaciones: también hace falta saber dónde pertenecían
  const otros = [...new Set(registros.map(r => String(r.cedula)).filter(c => !personas.has(c)))].map(Number).filter(Boolean);
  if (otros.length) {
    const extra = await P.cargarTramos({ desde: q.desde, hasta: q.hasta, identificaciones: otros });
    extra.forEach((v, k) => personas.set(k, Object.assign(v, { soloApoyo: true })));
  }
  const porPersonaDia = new Map();
  registros.forEach(r => {
    const k = `${r.cedula}|${r.dia}`;
    if (!porPersonaDia.has(k)) porPersonaDia.set(k, []);
    porPersonaDia.get(k).push(r);
  });

  // Plantilla de la quincena por operación
  const plantilla = new Map(nombresOps.map(o => [o, []]));
  for (const p of personas.values()) {
    const opsDeLaPersona = new Set();
    dias.forEach(d => {
      const t = P.tramoDelDia(p, d);
      if (t && setOps.has(t.operacion) && !excluidos.has(NORMALIZAR(t.cargo))) opsDeLaPersona.add(t.operacion);
    });
    opsDeLaPersona.forEach(o => plantilla.get(o).push(p));
  }

  const resultado = [];
  for (const o of ops) {
    const gente = plantilla.get(o.operacion) || [];
    const porDia = dias.map(d => ({ dia: d, esperados: 0, asistencia: 0, novedad: 0, relleno: 0, pendientes: 0, faltaAoo: 0, duplicados: 0, conflictos: 0, apoyosRecibidos: 0 }));
    const filas = [];
    const enPlantilla = new Set(gente.map(p => String(p.identificacion)));

    for (const p of gente) {
      const tramo = p.tramos.find(t => t.operacion === o.operacion) || p.tramos[0] || {};
      const celdas = [];
      dias.forEach((d, i) => {
        const c = porDia[i];
        const opDia = P.operacionDelDia(p, d);
        const propios = (porPersonaDia.get(`${p.identificacion}|${d}`) || []);
        const aqui = [];          // registros que cuentan para esta operación
        let apoyoEn = null;
        propios.forEach(r => {
          const cl = clasificar(r, opDia || o.operacion);
          if (cl.tipo === 'apoyo') { if (cl.lugar !== o.operacion) apoyoEn = cl.lugar; return; }
          if (cl.lugar === o.operacion || r.operacion === o.operacion || r.origen === o.operacion) aqui.push(r);
        });
        const pref = r => String(r.prefijo || '').toUpperCase();
        let estado;
        let codigo = aqui.length ? pref(aqui[0]) : '';
        let detalleTxt = aqui.length ? (aqui[0].novedad || codigo) : '';
        if (opDia === o.operacion) {
          c.esperados += 1;
          const reales = aqui.filter(r => !PREFIJOS_RELLENO.includes(pref(r)));
          if (aqui.length > 1) { estado = 'duplicado'; c.duplicados += 1; detalleTxt = aqui.map(r => r.novedad || pref(r)).join(' + '); }
          else if (reales.length === 1) {
            estado = 'ok';
            if (pref(reales[0]) === 'SI') c.asistencia += 1; else c.novedad += 1;
          } else if (aqui.length === 1) { estado = 'conflicto'; c.conflictos += 1; detalleTxt = `"${detalleTxt}" en un día en que sí estaba vinculado`; }
          else if (apoyoEn) { estado = 'falta_aoo'; c.faltaAoo += 1; c.pendientes += 1; codigo = 'AOO?'; detalleTxt = `Trabajó como apoyo en ${apoyoEn}: falta "Apoyo a Otra Operación"`; }
          else if (d > hoy) { estado = 'futuro'; c.esperados -= 1; }
          else { estado = 'pendiente'; c.pendientes += 1; }
        } else {
          // Día en que no pertenecía a esta operación: debe tener Nuevo / Retirado / Traslado
          c.esperados += 1;
          const rellenos = aqui.filter(r => PREFIJOS_RELLENO.includes(pref(r)));
          if (aqui.length > 1) { estado = 'duplicado'; c.duplicados += 1; detalleTxt = aqui.map(r => r.novedad || pref(r)).join(' + '); }
          else if (rellenos.length === 1) { estado = 'relleno'; c.relleno += 1; }
          else if (aqui.length === 1) { estado = 'conflicto'; c.conflictos += 1; detalleTxt = `${detalleTxt} en un día en que ${opDia ? `pertenecía a ${opDia}` : 'no estaba vinculado'}`; }
          else { estado = 'falta_relleno'; c.pendientes += 1; codigo = ''; detalleTxt = opDia ? `En ${opDia}: falta "Traslado"` : 'Falta "Nuevo" o "Retirado"'; }
        }
        celdas.push({ estado, codigo, detalle: detalleTxt });
      });
      if (detalle) {
        filas.push({
          identificacion: p.identificacion,
          nombre: p.nombre,
          cargo: tramo.cargo || '',
          celdas,
          pendientes: celdas.filter(x => ['pendiente', 'falta_aoo', 'falta_relleno'].includes(x.estado)).length,
          alertas: celdas.filter(x => ['duplicado', 'conflicto'].includes(x.estado)).length
        });
      }
    }

    // Apoyos recibidos (personas de otra operación que trabajaron aquí) y registros fuera de plantilla
    const apoyos = new Map();
    const fuera = [];
    registros.forEach(r => {
      if (enPlantilla.has(String(r.cedula))) return;
      const i = dias.indexOf(r.dia);
      if (i < 0) return;
      const persona = personas.get(String(r.cedula));
      const opDia = persona ? P.operacionDelDia(persona, r.dia) : null;
      const cl = clasificar(r, opDia);
      if (cl.tipo === 'apoyo' && cl.lugar === o.operacion) {
        porDia[i].apoyosRecibidos += 1;
        const k = String(r.cedula);
        if (!apoyos.has(k)) apoyos.set(k, { identificacion: r.cedula, nombre: (persona && persona.nombre) || r.nombre || P.nombreDeTrabajador(r.trabajador), desde: opDia, dias: [] });
        apoyos.get(k).dias.push(r.dia);
      } else if ((r.operacion === o.operacion || r.origen === o.operacion) && cl.tipo !== 'apoyo' && opDia !== o.operacion) {
        fuera.push({ identificacion: r.cedula, nombre: (persona && persona.nombre) || r.nombre || P.nombreDeTrabajador(r.trabajador), dia: r.dia, codigo: String(r.prefijo || ''), opDia });
      }
    });

    porDia.forEach(c => {
      c.avance = c.esperados ? Math.round(((c.esperados - c.pendientes) / c.esperados) * 1000) / 10 : null;
    });
    const hasta = porDia.filter(c => c.dia <= hoy);
    const tot = hasta.reduce((a, c) => ({
      esperados: a.esperados + c.esperados, pendientes: a.pendientes + c.pendientes,
      duplicados: a.duplicados + c.duplicados, conflictos: a.conflictos + c.conflictos, faltaAoo: a.faltaAoo + c.faltaAoo
    }), { esperados: 0, pendientes: 0, duplicados: 0, conflictos: 0, faltaAoo: 0 });

    resultado.push({
      operacion: o.operacion,
      regional: o.regional,
      plantilla: gente.length,
      porDia,
      resumen: { ...tot, avance: tot.esperados ? Math.round(((tot.esperados - tot.pendientes) / tot.esperados) * 1000) / 10 : null },
      trabajadores: detalle ? filas.sort((a, b) => (b.pendientes + b.alertas) - (a.pendientes + a.alertas) || a.nombre.localeCompare(b.nombre, 'es')) : undefined,
      apoyosRecibidos: detalle ? [...apoyos.values()] : undefined,
      fueraDePlantilla: detalle ? fuera.concat(registros
        .filter(r => (r.operacion === o.operacion || r.origen === o.operacion) && !personas.has(String(r.cedula)))
        .map(r => ({ identificacion: r.cedula, nombre: r.nombre || P.nombreDeTrabajador(r.trabajador), dia: r.dia, codigo: String(r.prefijo || ''), opDia: null }))) : undefined
    });
  }

  const totalGeneral = resultado.reduce((a, r) => ({
    esperados: a.esperados + r.resumen.esperados, pendientes: a.pendientes + r.resumen.pendientes,
    duplicados: a.duplicados + r.resumen.duplicados, conflictos: a.conflictos + r.resumen.conflictos
  }), { esperados: 0, pendientes: 0, duplicados: 0, conflictos: 0 });
  return {
    quincena: q, hoy, dias, operaciones: resultado,
    resumen: {
      ...totalGeneral,
      avance: totalGeneral.esperados ? Math.round(((totalGeneral.esperados - totalGeneral.pendientes) / totalGeneral.esperados) * 1000) / 10 : null,
      operacionesAl100: resultado.filter(r => r.resumen.pendientes === 0 && r.resumen.esperados > 0).length
    }
  };
}

module.exports = { obtenerControlQuincena };
