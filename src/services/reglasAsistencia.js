/**
 * reglasAsistencia.js
 * Reglas para que cada operación cuadre su quincena (ver plantillaAsistencia.js):
 *
 *   1. Una persona tiene un solo registro por día en su operación. Si ya tiene uno, se edita;
 *      no se crea otro.
 *   2. Apoyo a otra operación: la operación DESTINO registra solo la Asistencia (SI) de quien llega a
 *      apoyar. En la operación de ORIGEN el sistema pone "Apoyo a Otra Operación" (AOO); si el origen ya
 *      había puesto Asistencia ese día, se reemplaza por AOO (prima lo que registra el destino).
 *      Si el origen tiene otra novedad ese día (incapacidad, vacaciones, descanso...), no se deja
 *      registrar el apoyo: alguno de los dos está equivocado.
 *   3. El destino no registra novedades (descanso, incapacidad...) a quien llegó de apoyo: eso lo hace el
 *      origen. Tampoco se registra nada en días en que la persona no pertenecía a la operación
 *      (antes del ingreso, después del retiro o del traslado): esos días los llena el sistema.
 *   4. Si el origen registra Asistencia a alguien que ese día ya tiene Asistencia como apoyo en otra
 *      operación, se guarda como AOO (prima el destino).
 *
 * Interruptor: Config_Parametros nomina / Asistencia / Validar_Plantilla_Asistencia (SI/NO).
 * Sin la fila no se valida nada (comportamiento anterior).
 */
const pool = require('./db');
const P = require('./plantillaAsistencia');

const PREFIJOS_RELLENO = ['NVO', 'RET', 'TRAS'];
const NOMBRE_RELLENO = { NVO: 'Nuevo', RET: 'Retirado', TRAS: 'Traslado' };

async function reglasHabilitadas() {
  try {
    const [rows] = await pool.query(
      "SELECT Parametro FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Validar_Plantilla_Asistencia' LIMIT 1"
    );
    return rows.length > 0 && ['si', 'sí', 'true', '1'].includes(String(rows[0].Parametro || '').trim().toLowerCase());
  } catch (_) { return false; }
}

/**
 * Dónde cuenta un registro para una persona cuya operación ese día es opCasa.
 *   relleno:  NVO / RET / TRAS
 *   apoyo:    Asistencia como apoyo en otra operación (lugar = esa operación)
 *   casa:     registro en su propia operación
 *   otra:     registro en una operación que no es la suya y sin marca de apoyo
 * Los apoyos se guardaron de dos formas (AppSheet y la app web invierten Operación y Origen), por eso
 * se mira cuál de las dos es la operación de la persona.
 */
function clasificar(r, opCasa) {
  const pref = String(r.prefijo || '').toUpperCase();
  if (PREFIJOS_RELLENO.includes(pref)) return { tipo: 'relleno', lugar: r.operacion };
  const enCasa = !opCasa || r.operacion === opCasa || r.origen === opCasa;
  const apoyo = String(r.apoyo || '').toUpperCase() === 'SI';
  if (pref === 'SI' && apoyo) {
    const lugar = r.operacion === opCasa ? (r.origen || r.operacion) : r.operacion;
    if (opCasa && lugar !== opCasa) return { tipo: 'apoyo', lugar };
    return { tipo: 'casa', lugar: opCasa || r.operacion };
  }
  return enCasa ? { tipo: 'casa', lugar: opCasa || r.operacion } : { tipo: 'otra', lugar: r.operacion };
}

async function cargarRegistros(conn, cedulas, desde, hasta) {
  const ids = [...new Set(cedulas.map(Number).filter(Boolean))];
  const mapa = new Map();
  if (!ids.length) return mapa;
  const [rows] = await conn.query(
    `SELECT IdAsistencia AS id, \`Cédula\` AS cedula, DATE_FORMAT(\`Día\`, '%Y-%m-%d') AS dia,
            \`Operación\` AS operacion, Origen AS origen, \`Prefijo Novedad\` AS prefijo, Novedad AS novedad,
            \`Apoyo Otra Operación\` AS apoyo, Estado AS estado
       FROM Dynamic_Asistencia
      WHERE \`Día\` BETWEEN ? AND ? AND \`Cédula\` IN (${ids.map(() => '?').join(',')})`,
    [desde, hasta, ...ids]
  );
  rows.forEach(r => {
    const k = `${r.cedula}|${r.dia}`;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(r);
  });
  return mapa;
}

function nombreNovedad(r) {
  const pref = String(r.prefijo || '').toUpperCase();
  return NOMBRE_RELLENO[pref] || r.novedad || pref || 'un registro';
}

function textoRelleno(r) {
  const pref = String(r.prefijo || '').toUpperCase();
  if (pref === 'NVO') return 'figura como "Nuevo" (antes de su fecha de ingreso). Si la fecha de ingreso está mal, corríjala en Activos';
  if (pref === 'RET') return 'figura como "Retirado" (después de su fecha de retiro). Si la fecha de retiro está mal, corríjala en Retiros';
  return `figura como "Traslado" en ${r.operacion} (ese día pertenecía a otra operación)`;
}

/**
 * Valida un registro de Asistencia diaria y dice qué ajustes hacer en la operación de origen.
 * @param {object} o
 *   conn, operacion (la que registra), dia, trabajadores: [{ identificacion, nombre, area }],
 *   esApoyo (true: los trabajadores llegan de apoyo desde operacionApoya), operacionApoya, prefijo
 * @returns {object} { errores: string[], aooInsertar: [{ trabajador, opCasa, operacionApoyada }],
 *                    aooActualizar: [{ id, operacionApoyada }], convertirAAOO: Map(identificacion -> operacionApoyada) }
 */
async function validarAsistenciaDiaria({ conn = pool, operacion, dia, trabajadores, esApoyo, operacionApoya, prefijo = 'SI' }) {
  const res = { errores: [], aooInsertar: [], aooActualizar: [], convertirAAOO: new Map() };
  const ids = trabajadores.map(t => Number(t.identificacion));
  const personas = await P.cargarTramos({ desde: dia, hasta: dia, identificaciones: ids }, conn);
  const registros = await cargarRegistros(conn, ids, dia, dia);

  for (const t of trabajadores) {
    const nombre = t.nombre || t.identificacion;
    const persona = personas.get(String(Number(t.identificacion)));
    const opDia = persona ? P.operacionDelDia(persona, dia) : null;
    const filas = (registros.get(`${Number(t.identificacion)}|${dia}`) || []);

    if (esApoyo) {
      const opCasa = opDia || operacionApoya;
      if (persona && !opDia) {
        res.errores.push(`${nombre}: ese día no estaba vinculado (revise su fecha de ingreso o de retiro).`);
        continue;
      }
      if (opCasa === operacion) {
        res.errores.push(`${nombre}: ese día pertenece a ${operacion}; regístrelo como asistencia normal, no como apoyo.`);
        continue;
      }
      let ok = true;
      let filaCasa = null;
      for (const f of filas) {
        const c = clasificar(f, opCasa);
        if (c.tipo === 'apoyo') {
          res.errores.push(c.lugar === operacion
            ? `${nombre}: ya tiene la asistencia de apoyo de ese día en ${operacion}.`
            : `${nombre}: ese día ya está registrado como apoyo en ${c.lugar}.`);
          ok = false;
        } else if (c.tipo === 'relleno') {
          res.errores.push(`${nombre}: ese día ${textoRelleno(f)}.`);
          ok = false;
        } else if (c.tipo === 'otra') {
          res.errores.push(`${nombre}: ese día ya tiene ${nombreNovedad(f)} registrado en ${c.lugar}.`);
          ok = false;
        } else if (c.tipo === 'casa') {
          const pref = String(f.prefijo || '').toUpperCase();
          if (pref === 'SI' || pref === 'AOO') {
            if (!filaCasa) filaCasa = f;
            else { res.errores.push(`${nombre}: tiene registros repetidos ese día en ${opCasa}; corríjalos antes.`); ok = false; }
          } else {
            res.errores.push(`${nombre}: ese día tiene ${nombreNovedad(f)} registrado en ${opCasa}. Si de verdad vino a apoyar, ${opCasa} debe corregir su registro primero.`);
            ok = false;
          }
        }
      }
      if (!ok) continue;
      if (!filaCasa) res.aooInsertar.push({ trabajador: t, opCasa, operacionApoyada: operacion });
      else if (String(filaCasa.prefijo).toUpperCase() === 'SI') {
        if (filaCasa.estado === 'Green') { res.errores.push(`${nombre}: la asistencia de ese día en ${opCasa} ya fue aprobada por Nómina.`); continue; }
        res.aooActualizar.push({ id: filaCasa.id, operacionApoyada: operacion });
      }
    } else {
      if (persona && opDia !== operacion) {
        res.errores.push(opDia
          ? `${nombre}: ese día pertenecía a ${opDia}. Si vino a apoyar, márquelo como apoyo de otra operación.`
          : `${nombre}: ese día no estaba vinculado (revise su fecha de ingreso o de retiro).`);
        continue;
      }
      let apoyoEn = null;
      let ok = true;
      for (const f of filas) {
        const c = clasificar(f, opDia || operacion);
        if (c.tipo === 'apoyo') { apoyoEn = c.lugar; continue; }
        res.errores.push(c.tipo === 'relleno'
          ? `${nombre}: ese día ${textoRelleno(f)}.`
          : `${nombre}: ya tiene ${nombreNovedad(f)} registrado ese día${c.lugar !== operacion ? ` en ${c.lugar}` : ''}; edite ese registro en vez de crear otro.`);
        ok = false;
      }
      if (ok && apoyoEn) {
        if (String(prefijo || 'SI').toUpperCase() === 'SI') res.convertirAAOO.set(String(t.identificacion), apoyoEn);
        else res.errores.push(`${nombre}: ese día trabajó como apoyo en ${apoyoEn}; no se le puede registrar otra novedad.`);
      }
    }
  }
  return res;
}

/**
 * Valida una novedad por rango de fechas (o un día).
 * @returns {string[]} errores
 */
async function validarNovedadRango({ conn = pool, operacion, identificacion, nombre, desde, hasta }) {
  const errores = [];
  const persona = (await P.cargarTramos({ desde, hasta, identificaciones: [identificacion] }, conn)).get(String(Number(identificacion)));
  const registros = await cargarRegistros(conn, [identificacion], desde, hasta);
  const quien = nombre || identificacion;
  const fuera = [];
  const ocupados = [];
  for (const dia of P.diasEntre(desde, hasta)) {
    const opDia = persona ? P.operacionDelDia(persona, dia) : null;
    if (persona && opDia !== operacion) { fuera.push({ dia, opDia }); continue; }
    for (const f of registros.get(`${Number(identificacion)}|${dia}`) || []) {
      const c = clasificar(f, opDia || operacion);
      ocupados.push({ dia, texto: c.tipo === 'apoyo' ? `asistencia como apoyo en ${c.lugar}` : c.tipo === 'relleno' ? `"${nombreNovedad(f)}"` : nombreNovedad(f) });
    }
  }
  const fmt = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  if (fuera.length) {
    const otras = [...new Set(fuera.map(x => x.opDia).filter(Boolean))];
    errores.push(`${quien} no pertenecía a ${operacion} el ${fuera.slice(0, 6).map(x => fmt(x.dia)).join(', ')}${fuera.length > 6 ? '…' : ''}` +
      (otras.length ? ` (estaba en ${otras.join(', ')}; esa operación registra sus novedades).` : ' (no estaba vinculado esos días).'));
  }
  if (ocupados.length) {
    errores.push(`${quien} ya tiene registro: ${ocupados.slice(0, 6).map(x => `${fmt(x.dia)} ${x.texto}`).join('; ')}${ocupados.length > 6 ? '…' : ''}. Edite o elimine esos registros antes.`);
  }
  return errores;
}

module.exports = { reglasHabilitadas, clasificar, validarAsistenciaDiaria, validarNovedadRango, PREFIJOS_RELLENO };
