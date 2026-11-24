const pool = require('./db');
const P = require('./plantillaAsistencia');
const { reglasHabilitadas, validarNovedadRango } = require('./reglasAsistencia');
const {
  obtenerParametrosAsistencia,
  registrarAsistenciaDiaria,
  registrarNovedadPorRango,
  registrarNovedadDia
} = require('./asistenciaService');

// ── Registro rápido de asistencia y novedades (antes se hacía con un INSERT manual) ──
// Una cédula + una novedad + un día o rango, para resolver tickets. La operación y el área de
// cada día salen de la vinculación vigente ese día (con traslados y reingresos, igual que la
// plantilla), y se guarda con las mismas funciones de "Ingresar Evento": cabecera en
// Dynamic_Registro_Asistencia, reglas de plantilla, reemplazo de rellenos automáticos.
// Quién puede usarlo: Config_Parametros nomina / Asistencia / Roles_Registro_Rapido (por defecto Sistema).

const MAX_DIAS = 31;
const NOVEDADES_EXCLUIDAS = ['Apoyo a Otra Operación']; // necesita la operación apoyada: se registra con "Ingresar Evento"

function normalizar(valor) {
  return String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

async function puedeRegistroRapido(rol) {
  const cfg = await obtenerParametrosAsistencia();
  return (cfg.rolesRegistroRapido || ['Sistema']).map(normalizar).includes(normalizar(rol));
}

/** Catálogo completo de Config_Asistencia: incapacidades y, para Roles_Ver_Novedades_Sistema, las de Sistema. */
async function catalogoRegistroRapido(rol) {
  const cfg = await obtenerParametrosAsistencia();
  const veSistema = (cfg.rolesVerNovedadesSistema || ['Sistema']).map(normalizar).includes(normalizar(rol));
  const [rows] = await pool.query(
    `SELECT Novedad AS novedad, \`Prefijo Novedad\` AS prefijo, Evento AS evento, Color AS color,
            UPPER(TRIM(COALESCE(\`Fecha Final\`, ''))) = 'SI' AS esRango
       FROM Config_Asistencia
      ORDER BY FIELD(Evento, 'Asistencia', 'Novedad', 'Incapacidad', 'Sistema'), Novedad`
  );
  return rows
    .filter(r => !NOVEDADES_EXCLUIDAS.includes(r.novedad) && (veSistema || r.evento !== 'Sistema'))
    .map(r => ({ ...r, esRango: !!r.esRango, usaHorario: r.evento === 'Asistencia' }));
}

/** Datos del ticket en Dynamic_Tickets (null si no existe). */
async function buscarTicket(ticket) {
  const t = String(ticket || '').trim();
  if (!t) return null;
  const [rows] = await pool.query(
    `SELECT Ticket AS ticket, \`Operación\` AS operacion, solicitante, modulo, motivo, Estado AS estado,
            LEFT(descripcion, 300) AS descripcion, identificaciones,
            DATE_FORMAT(fecha_registro, '%Y-%m-%d %H:%i') AS fecha
       FROM Dynamic_Tickets WHERE Ticket = ? LIMIT 1`,
    [t]
  );
  return rows[0] || null;
}

/**
 * Operación y área del colaborador en cada día del rango, según Maestro_Vinculación y traslados.
 * Devuelve tramos consecutivos con la misma operación/área y los días en que no estaba vinculado.
 */
async function resolverColaborador(identificacion, desde, hasta) {
  const id = Number(identificacion);
  const persona = (await P.cargarTramos({ desde, hasta, identificaciones: [id] })).get(String(id));
  const tramos = [];
  const sinVinculacion = [];
  for (const dia of P.diasEntre(desde, hasta)) {
    const t = persona ? P.tramoDelDia(persona, dia) : null;
    if (!t || t.sinDias) { sinVinculacion.push(dia); continue; }
    const area = t.area != null ? String(t.area) : '';
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.operacion === t.operacion && ultimo.area === area && P.sumarDias(ultimo.hasta, 1) === dia) {
      ultimo.hasta = dia;
    } else {
      tramos.push({ operacion: t.operacion, area, cargo: t.cargo, desde: dia, hasta: dia });
    }
  }
  const areas = [...new Set(tramos.map(t => t.area).filter(Boolean))];
  if (areas.length) {
    const [aRows] = await pool.query('SELECT ID, AREA FROM Config_Area WHERE ID IN (?)', [areas]);
    const nombres = new Map(aRows.map(a => [String(a.ID), a.AREA]));
    tramos.forEach(t => { t.areaNombre = nombres.get(t.area) || t.area; });
  }
  let nombre = persona ? persona.nombre : null;
  let estado = null;
  const [vRows] = await pool.query(
    "SELECT Trabajador, Estado FROM `Maestro_Vinculación` WHERE `Identificación` = ? ORDER BY (Estado = 'Activo') DESC, `Fecha de Ingreso` DESC LIMIT 1",
    [id]
  );
  if (vRows.length) {
    nombre = nombre || P.nombreDeTrabajador(vRows[0].Trabajador);
    estado = vRows[0].Estado;
  }
  return { identificacion: id, nombre, estado, existe: vRows.length > 0, tramos, sinVinculacion };
}

/** Texto de Observaciones: "Ticket <n>" + nota, máx. 255 caracteres (tamaño de la columna). */
function textoObservaciones(ticket, nota) {
  const partes = [`Ticket ${String(ticket).trim()}`];
  if (nota && String(nota).trim()) partes.push(String(nota).trim());
  return partes.join(' - ').slice(0, 255);
}

function errorValidacion(msg) {
  return Object.assign(new Error(msg), { validacion: true });
}

/**
 * Guarda la asistencia o novedad. Cada tramo (o día, si la novedad es de un solo día) se guarda
 * en su propia transacción; se devuelve qué quedó guardado y qué no, con el motivo.
 */
async function registrarRapido({ identificacion, novedad, desde, hasta, horaEntrada, horaSalida, ticket, nota, usuario, rol }) {
  if (!/^\d{3,12}$/.test(String(identificacion || '').trim())) throw errorValidacion('Escriba una cédula válida.');
  if (!P.FECHA_RE.test(desde || '')) throw errorValidacion('Escoja el día.');
  hasta = P.FECHA_RE.test(hasta || '') ? hasta : desde;
  if (hasta < desde) throw errorValidacion('La fecha final debe ser igual o posterior a la inicial.');
  if (P.diasEntre(desde, hasta).length > MAX_DIAS) throw errorValidacion(`Máximo ${MAX_DIAS} días por registro.`);
  if (!String(ticket || '').trim()) throw errorValidacion('Indique el ticket con el que se solicita el registro.');

  const item = (await catalogoRegistroRapido(rol)).find(n => n.novedad === novedad);
  if (!item) throw errorValidacion('Escoja una novedad de la lista.');
  if (item.usaHorario && (!horaEntrada || !horaSalida)) throw errorValidacion('Indique la hora de llegada y de salida.');

  const colab = await resolverColaborador(identificacion, desde, hasta);
  if (!colab.existe) throw errorValidacion(`La cédula ${identificacion} no está en Maestro_Vinculación.`);
  if (!colab.tramos.length) throw errorValidacion(`${colab.nombre || identificacion} no estaba vinculado en esas fechas.`);

  const observaciones = textoObservaciones(ticket, nota);
  const comunes = { usuario, rol, observaciones };
  const guardados = [];
  const errores = colab.sinVinculacion.length
    ? [{ dias: colab.sinVinculacion, error: 'No estaba vinculado ese día; no se registró.' }]
    : [];
  const intentar = async (operacion, diaIni, diaFin, fn) => {
    try {
      const r = await fn();
      guardados.push({ operacion, desde: diaIni, hasta: diaFin, idRegistro: r.idRegistro, avisos: r.avisos || [] });
    } catch (err) {
      if (!err.validacion) console.error('[registroRapidoAsistencia]', err);
      errores.push({ operacion, desde: diaIni, hasta: diaFin, error: err.message });
    }
  };

  for (const t of colab.tramos) {
    const base = { ...comunes, operacion: t.operacion, area: t.area || null };
    if (item.evento === 'Asistencia') {
      for (const dia of P.diasEntre(t.desde, t.hasta)) {
        await intentar(t.operacion, dia, dia, () => registrarAsistenciaDiaria({
          ...base, novedad: item.novedad, prefijoNovedad: item.prefijo, dia,
          horaEntrada, horaSalida, trabajadoresIds: [String(colab.identificacion)]
        }));
      }
    } else if (item.evento === 'Incapacidad' || item.esRango) {
      // Las incapacidades se guardan como "Incapacidad" con su tipo (igual que el formulario)
      const esInc = item.evento === 'Incapacidad';
      await intentar(t.operacion, t.desde, t.hasta, () => registrarNovedadPorRango({
        ...base, trabajadorIdentificacion: String(colab.identificacion),
        novedad: esInc ? 'Incapacidad' : item.novedad, tipoIncapacidad: esInc ? item.novedad : null,
        prefijoNovedad: item.prefijo, diaInicio: t.desde, diaFin: t.hasta
      }));
    } else {
      for (const dia of P.diasEntre(t.desde, t.hasta)) {
        await intentar(t.operacion, dia, dia, async () => {
          // registrarNovedadDia no aplica las reglas de plantilla; se validan aquí (un registro por persona y día)
          if (await reglasHabilitadas()) {
            const errs = await validarNovedadRango({ operacion: t.operacion, identificacion: colab.identificacion, nombre: colab.nombre, desde: dia, hasta: dia });
            if (errs.length) throw errorValidacion(errs.join(' '));
          }
          return registrarNovedadDia({
            ...base, trabajadoresIds: [String(colab.identificacion)],
            novedad: item.novedad, prefijoNovedad: item.prefijo, dia
          });
        });
      }
    }
  }

  console.log(`[registroRapidoAsistencia] ${usuario} · ${colab.identificacion} · ${item.novedad} · ${desde}..${hasta} · ${observaciones}: ${guardados.length} guardado(s), ${errores.length} con error`);
  return { colaborador: { identificacion: colab.identificacion, nombre: colab.nombre }, novedad: item.novedad, guardados, errores };
}

module.exports = { puedeRegistroRapido, catalogoRegistroRapido, buscarTicket, resolverColaborador, registrarRapido };
