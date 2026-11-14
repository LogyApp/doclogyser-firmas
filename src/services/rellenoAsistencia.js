/**
 * rellenoAsistencia.js
 * Relleno automático de la quincena en Dynamic_Asistencia con las novedades de sistema:
 *   - Nuevo (NVO):     días de la quincena antes de la Fecha de Ingreso.
 *   - Retirado (RET):  días de la quincena después de la Fecha de Retiro (solo con Estado = Retirado).
 *   - Traslado (TRAS): en la operación de origen, desde el día del traslado hasta el fin de la quincena;
 *                      en la de destino, desde el inicio de la quincena hasta el día anterior al traslado.
 * Así cada operación completa la quincena con las mismas personas con que la empezó.
 *
 * Reemplaza los triggers trg_MaestroVinculacion_AfterInsert (Nuevo) y
 * trg_MaestroVinculacion_AfterUpdate_Retiro (Retirado) y el relleno de Traslado que hacía la firma del
 * traslado. A diferencia de ellos, aquí se compara lo que debería haber con lo que hay: si corrigen una
 * fecha de ingreso, de retiro o de traslado, se borran los rellenos que sobran y se agregan los que faltan.
 *
 * Cuándo corre:
 *   - Al guardar una vinculación, un retiro o un traslado desde la app (programarRelleno).
 *   - Cada hora sobre la quincena actual y la anterior, para recoger cambios hechos por fuera de la app
 *     (AppSheet, HiSQL) — ver iniciarProgramadorRelleno.
 * Nunca toca días bloqueados por Nómina (Bloqueo_Nomina) ni registros en estado Green (ya aprobados).
 * Si la persona ya tiene un registro real ese día (asistencia o novedad), no se rellena encima: queda como
 * alerta en el reporte de Control de quincena.
 */
const crypto = require('crypto');
const pool = require('./db');
const P = require('./plantillaAsistencia');

const PREFIJOS_RELLENO = ['NVO', 'RET', 'TRAS'];
const NOVEDAD_POR_DEFECTO = { NVO: 'Nuevo', RET: 'Retirado', TRAS: 'Traslado' };
const CANDADO = 'relleno_asistencia';
const OBSERVACION = 'Relleno automático del sistema';

function idRelleno(prefijo, dia) {
  return `AUTO-${prefijo}-${dia.replace(/-/g, '')}-${crypto.randomBytes(5).toString('hex')}`;
}

async function nombresNovedad(conn) {
  const mapa = { ...NOVEDAD_POR_DEFECTO };
  try {
    const [rows] = await conn.query(
      'SELECT `Prefijo Novedad` AS p, Novedad AS n FROM Config_Asistencia WHERE `Prefijo Novedad` IN (?, ?, ?)',
      PREFIJOS_RELLENO
    );
    rows.forEach(r => { if (r.n) mapa[r.p] = r.n; });
  } catch (_) { /* se usan los nombres por defecto */ }
  return mapa;
}

/**
 * Rellenos esperados de una persona en las quincenas del rango.
 * @returns {Map<string, {dia, operacion, prefijo, area}>} clave "dia|operacion"
 */
function rellenosEsperados(persona, desde, hasta) {
  const esperados = new Map();
  for (let q = P.quincenaDe(desde); q.desde <= hasta; q = P.quincenaDe(P.sumarDias(q.hasta, 1))) {
    const dias = P.diasEntre(q.desde, q.hasta);
    const opDia = dias.map(d => P.operacionDelDia(persona, d));
    const operaciones = [...new Set(opDia.filter(Boolean))];
    for (const op of operaciones) {
      const idxPrimero = opDia.indexOf(op);
      const area = (persona.tramos.find(t => t.operacion === op) || {}).area || null;
      dias.forEach((d, i) => {
        if (opDia[i] === op) return;
        let prefijo;
        if (opDia[i]) prefijo = 'TRAS';            // estaba en otra operación
        else if (i < idxPrimero) prefijo = 'NVO';  // aún no había ingresado
        else prefijo = 'RET';                      // ya se había retirado
        esperados.set(`${d}|${op}`, { dia: d, operacion: op, prefijo, area });
      });
    }
  }
  return esperados;
}

/**
 * Sincroniza el relleno de las quincenas que tocan [desde, hasta].
 * @param {object} o { desde, hasta, identificaciones?: number[] (sin ellas: todas las personas) }
 *   soloSimular: calcula sin escribir y devuelve también el detalle (porInsertar, porBorrar)
 * @returns {object} { insertados, eliminados, conflictos: [{ identificacion, dia, operacion, prefijo, registro }] }
 */
async function sincronizarRelleno({ desde, hasta, identificaciones = null, soloSimular = false } = {}) {
  const ini = P.quincenaDe(desde).desde;
  const fin = P.quincenaDe(hasta).hasta;
  const ids = identificaciones ? [...new Set(identificaciones.map(Number).filter(Boolean))] : null;
  if (ids && !ids.length) return { insertados: 0, eliminados: 0, conflictos: [] };

  const conn = await pool.getConnection();
  let tengoCandado = false;
  try {
    const [[c]] = await conn.query('SELECT GET_LOCK(?, 30) AS ok', [CANDADO]);
    tengoCandado = Number(c.ok) === 1;
    if (!tengoCandado) throw new Error('Otro proceso está acomodando la asistencia; intente de nuevo en un momento.');

    const personas = await P.cargarTramos({ desde: ini, hasta: fin, identificaciones: ids }, conn);
    const bloqueoHasta = await P.cargarBloqueos(conn);
    const novedades = await nombresNovedad(conn);

    // Registros existentes de esas personas en el rango (rellenos y reales)
    const filtroIds = ids ? `AND da.\`Cédula\` IN (${ids.map(() => '?').join(',')})` : '';
    const [existentes] = await conn.query(
      `SELECT da.IdAsistencia AS id, da.\`Cédula\` AS cedula, DATE_FORMAT(da.\`Día\`, '%Y-%m-%d') AS dia,
              da.\`Operación\` AS operacion, da.Origen AS origen, da.\`Prefijo Novedad\` AS prefijo,
              da.\`Apoyo Otra Operación\` AS apoyo, da.Estado AS estado
         FROM Dynamic_Asistencia da
        WHERE da.\`Día\` BETWEEN ? AND ? ${filtroIds}
          AND EXISTS (SELECT 1 FROM \`Maestro_Vinculación\` v WHERE v.\`Identificación\` = da.\`Cédula\`)`,
      [ini, fin, ...(ids || [])]
    );

    const rellenosPorPersona = new Map();   // cedula -> Map("dia|op" -> [filas])
    const realesPorPersona = new Map();     // cedula -> Map("dia|op" -> fila)
    for (const r of existentes) {
      const k = String(r.cedula);
      const esRelleno = PREFIJOS_RELLENO.includes(String(r.prefijo || '').toUpperCase());
      if (esRelleno) {
        if (!rellenosPorPersona.has(k)) rellenosPorPersona.set(k, new Map());
        const m = rellenosPorPersona.get(k);
        const kk = `${r.dia}|${r.operacion}`;
        if (!m.has(kk)) m.set(kk, []);
        m.get(kk).push(r);
      } else {
        if (!realesPorPersona.has(k)) realesPorPersona.set(k, new Map());
        const m = realesPorPersona.get(k);
        // Un registro real cuenta para su operación (Operación y Origen, por los apoyos guardados al revés)
        m.set(`${r.dia}|${r.operacion}`, r);
        if (r.origen) m.set(`${r.dia}|${r.origen}`, r);
      }
    }

    const borrar = [];
    const insertar = [];
    const conflictos = [];
    const editable = (op, dia) => { const lim = bloqueoHasta(op); return !lim || dia > lim; };

    const cedulas = new Set([...personas.keys(), ...rellenosPorPersona.keys()]);
    for (const k of cedulas) {
      const persona = personas.get(k);
      const esperados = persona ? rellenosEsperados(persona, ini, fin) : new Map();
      const actuales = rellenosPorPersona.get(k) || new Map();
      const reales = realesPorPersona.get(k) || new Map();

      // Sobran: rellenos que ya no corresponden (o con otro prefijo, o repetidos)
      for (const [kk, filas] of actuales) {
        const esp = esperados.get(kk);
        filas.forEach((f, i) => {
          const sigue = esp && i === 0 && String(f.prefijo).toUpperCase() === esp.prefijo;
          if (!sigue && f.estado !== 'Green' && editable(f.operacion, f.dia)) borrar.push(f.id);
        });
      }
      // Faltan
      if (!persona) continue;
      for (const [kk, esp] of esperados) {
        const fila = (actuales.get(kk) || [])[0];
        if (fila && String(fila.prefijo).toUpperCase() === esp.prefijo) continue;
        if (fila && (fila.estado === 'Green' || !editable(esp.operacion, esp.dia))) continue;
        if (!editable(esp.operacion, esp.dia)) continue;
        const real = reales.get(kk);
        if (real) {
          conflictos.push({ identificacion: persona.identificacion, dia: esp.dia, operacion: esp.operacion, prefijo: esp.prefijo, registro: real.prefijo });
          continue;
        }
        insertar.push([
          idRelleno(esp.prefijo, esp.dia), idRelleno(esp.prefijo, esp.dia), esp.operacion,
          novedades[esp.prefijo], esp.prefijo, esp.dia, esp.area, persona.trabajador, persona.identificacion,
          (persona.nombre || '').slice(0, 100), 'NO', esp.operacion, 'Sistema', esp.area, 'Yellow', OBSERVACION
        ]);
      }
    }

    if (soloSimular) {
      const porId = new Map(existentes.map(r => [r.id, r]));
      return {
        insertados: insertar.length, eliminados: borrar.length, conflictos,
        porInsertar: insertar.map(f => ({ identificacion: f[8], dia: f[5], operacion: f[2], prefijo: f[4] })),
        porBorrar: borrar.map(id => { const r = porId.get(id); return { identificacion: r.cedula, dia: r.dia, operacion: r.operacion, prefijo: r.prefijo }; })
      };
    }
    for (let i = 0; i < borrar.length; i += 500) {
      const lote = borrar.slice(i, i + 500);
      await conn.query(`DELETE FROM Dynamic_Asistencia WHERE IdAsistencia IN (${lote.map(() => '?').join(',')})`, lote);
    }
    for (let i = 0; i < insertar.length; i += 500) {
      await conn.query(
        `INSERT INTO Dynamic_Asistencia (
           IdAsistencia, IdRegistro, \`Operación\`, Novedad, \`Prefijo Novedad\`, \`Día\`, Area, Trabajador,
           \`Cédula\`, Nombre, \`Apoyo Otra Operación\`, Origen, Usuario, Disponible1, Estado, Observaciones
         ) VALUES ?`,
        [insertar.slice(i, i + 500)]
      );
    }
    return { insertados: insertar.length, eliminados: borrar.length, conflictos };
  } finally {
    if (tengoCandado) await conn.query('SELECT RELEASE_LOCK(?)', [CANDADO]).catch(() => {});
    conn.release();
  }
}

/**
 * Acomoda el relleno de una persona después de un cambio en su vinculación, retiro o traslado.
 * Revisa desde la quincena anterior a hoy (o la de la fecha más antigua que cambió, hasta 4 quincenas
 * atrás) hasta la quincena de la fecha más lejana (retiros o traslados a futuro).
 * @param {number|string} identificacion
 * @param {string[]} fechas  fechas involucradas en el cambio (antes y después), AAAA-MM-DD
 */
async function acomodarPersona(identificacion, fechas = []) {
  const hoy = P.hoyColombia();
  const validas = (fechas || []).map(f => (f instanceof Date ? P.aIso(f) : String(f || '').slice(0, 10)))
    .filter(f => P.FECHA_RE.test(f));
  const anterior = P.quincenaDe(P.sumarDias(P.quincenaDe(hoy).desde, -1)).desde;
  const limite = P.sumarDias(hoy, -62);
  const desde = P.maxIso(limite, P.minIso(anterior, ...validas));
  const hasta = P.maxIso(hoy, ...validas);
  return sincronizarRelleno({ desde, hasta, identificaciones: [identificacion] });
}

/** Igual que acomodarPersona pero sin esperar ni romper el flujo que lo llama (solo deja log). */
function programarRelleno(identificacion, fechas = []) {
  if (!identificacion) return;
  setImmediate(() => {
    acomodarPersona(identificacion, fechas)
      .then(r => {
        if (r.insertados || r.eliminados || r.conflictos.length) {
          console.log(`[rellenoAsistencia] ${identificacion}: +${r.insertados} / -${r.eliminados}` +
            (r.conflictos.length ? ` (${r.conflictos.length} días con registro propio)` : ''));
        }
      })
      .catch(err => console.error(`[rellenoAsistencia] Error acomodando ${identificacion}:`, err.message));
  });
}

/**
 * Igual que programarRelleno, a partir del Id Vinculación (se leen la identificación y sus fechas).
 * @param {string} idVinculacion
 * @param {string[]} fechas  fechas anteriores al cambio (p. ej. la fecha de retiro que se corrigió)
 */
function programarRellenoVinculacion(idVinculacion, fechas = []) {
  if (!idVinculacion) return;
  pool.query(
    "SELECT `Identificación` AS id, DATE_FORMAT(`Fecha de Ingreso`, '%Y-%m-%d') AS fi, DATE_FORMAT(`Fecha de Retiro`, '%Y-%m-%d') AS fr FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ? LIMIT 1",
    [idVinculacion]
  ).then(([rows]) => {
    if (rows.length) programarRelleno(rows[0].id, [...fechas, rows[0].fi, rows[0].fr]);
  }).catch(err => console.error('[rellenoAsistencia] Error leyendo la vinculación', idVinculacion, err.message));
}

/** Quincena actual y anterior para todas las personas. */
async function sincronizarVentanaActual({ soloSimular = false } = {}) {
  const hoy = P.hoyColombia();
  const desde = P.quincenaDe(P.sumarDias(P.quincenaDe(hoy).desde, -1)).desde;
  return sincronizarRelleno({ desde, hasta: hoy, soloSimular });
}

/** Interruptor de la revisión periódica (Config_Parametros nomina / Asistencia). Sin la fila: apagada. */
async function revisionPeriodicaHabilitada() {
  try {
    const [rows] = await pool.query(
      "SELECT Parametro FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Relleno_Automatico_Periodico' LIMIT 1"
    );
    return rows.length > 0 && ['si', 'sí', 'true', '1'].includes(String(rows[0].Parametro || '').trim().toLowerCase());
  } catch (_) { return false; }
}

/**
 * Tarea en segundo plano (solo si Relleno_Automatico_Periodico = SI): cada hora (y 2 minutos después de arrancar) revisa la quincena actual y la
 * anterior. Varias instancias no chocan: el candado de MySQL deja pasar a una sola a la vez y la
 * sincronización solo cambia lo que falta o sobra.
 */
function iniciarProgramadorRelleno() {
  const correr = async () => {
    if (!(await revisionPeriodicaHabilitada())) return;
    return sincronizarVentanaActual().then(r => console.log(`[rellenoAsistencia] Revisión periódica: +${r.insertados} / -${r.eliminados}, ${r.conflictos.length} días con registro propio`))
    .catch(err => console.error('[rellenoAsistencia] Error en la revisión periódica:', err.message));
  };
  setTimeout(correr, 2 * 60 * 1000);
  setInterval(correr, 60 * 60 * 1000);
}

module.exports = {
  PREFIJOS_RELLENO, rellenosEsperados, sincronizarRelleno, acomodarPersona, programarRelleno, programarRellenoVinculacion,
  sincronizarVentanaActual, revisionPeriodicaHabilitada, iniciarProgramadorRelleno
};
