const pool = require('./db');
const P = require('./plantillaAsistencia');
const { reglasHabilitadas, validarNovedadRango } = require('./reglasAsistencia');
const {
  obtenerParametrosAsistencia,
  registrarAsistenciaDiaria,
  registrarNovedadPorRango,
  registrarNovedadDia
} = require('./asistenciaService');
const calificacion = require('./calificacionTickets');

// ── Registro rápido de asistencia y novedades (antes se hacía con un INSERT manual) ──
// Una o varias cédulas + una novedad + un día o rango, para resolver tickets. La operación y el área de
// cada día salen de la vinculación vigente ese día (con traslados y reingresos, igual que la
// plantilla), y se guarda con las mismas funciones de "Ingresar Evento": cabecera en
// Dynamic_Registro_Asistencia, reglas de plantilla, reemplazo de rellenos automáticos.
// Quién puede usarlo: Config_Parametros nomina / Asistencia / Roles_Registro_Rapido (por defecto Sistema).
// Opcionalmente responde el ticket con el resumen (solo "Roles que pueden resolver tickets").

const MAX_DIAS = 31;
const MAX_CEDULAS = 30;
const ESTADOS_TICKET = ['Resuelto', 'En Proceso', 'Pendiente']; // los de "Gestionar ticket", sin Rechazado
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

/** Cédulas escritas separadas por coma, espacio o línea (sin repetir). */
function parsearCedulas(texto) {
  return [...new Set(String(texto || '').split(/[^\d]+/).filter(c => /^\d{3,12}$/.test(c)))];
}

/**
 * Mismo parámetro del módulo de Tickets: Config_Parametros configuracion / Tickets /
 * "Roles que pueden resolver tickets" (por defecto Sistema).
 */
async function puedeResolverTickets(rol) {
  let lista = 'Sistema';
  try {
    const [r] = await pool.execute(
      'SELECT Parametro FROM Config_Parametros WHERE Modulo = ? AND Seccion = ? AND Concepto = ? LIMIT 1',
      ['configuracion', 'Tickets', 'Roles que pueden resolver tickets']
    );
    if (r.length) lista = r[0].Parametro == null ? '' : String(r[0].Parametro);
  } catch (err) {
    console.error('[registroRapidoAsistencia] No se pudo leer Roles que pueden resolver tickets, se usa Sistema:', err.message);
  }
  return !!normalizar(rol) && lista.split(',').map(normalizar).includes(normalizar(rol));
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
async function registrarColaborador({ identificacion, item, desde, hasta, horaEntrada, horaSalida, ticket, nota, usuario, rol }) {
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
  return { identificacion: colab.identificacion, nombre: colab.nombre, guardados, errores };
}

/** Resumen para quien puso el ticket: qué quedó registrado y qué no. */
function textoRespuestaTicket(novedad, colaboradores) {
  const fmt = d => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const rango = x => (x.dias ? x.dias.map(fmt).join(', ') : (x.desde === x.hasta ? fmt(x.desde) : `${fmt(x.desde)} al ${fmt(x.hasta)}`));
  const quien = c => `${c.nombre || c.identificacion} (${c.identificacion})`;
  const ok = [];
  const mal = [];
  colaboradores.forEach(c => {
    c.guardados.forEach(g => ok.push(`- ${quien(c)}: ${rango(g)} · ${g.operacion}`));
    c.errores.forEach(e => mal.push(`- ${quien(c)}${e.desde || e.dias ? `: ${rango(e)}` : ''} · ${e.error}`));
  });
  return [`Se registró "${novedad}" en Asistencia y Novedades:`, ...ok, ...(mal.length ? ['No se registró:', ...mal] : [])].join('\n');
}

/**
 * Agrega la respuesta al ticket (debajo de la que ya tenía) y cambia el estado, igual que
 * "Gestionar ticket": Resuelto deja fecha de finalización y envía el enlace para calificar.
 */
async function responderTicket({ ticket, estado, texto, baseUrl }) {
  const finaliza = estado === 'Resuelto';
  const [r] = await pool.execute(
    `UPDATE Dynamic_Tickets
        SET Estado = ?, Observaciones = CONCAT_WS('\n\n', NULLIF(TRIM(Observaciones), ''), ?),
            fecha_finalizacion = ${finaliza ? 'NOW()' : 'NULL'}
      WHERE Ticket = ?`,
    [estado, texto, ticket]
  );
  if (r.affectedRows && finaliza) await calificacion.prepararCalificacionTicket(ticket, baseUrl);
  return r.affectedRows > 0;
}

/**
 * Registra la novedad para una o varias cédulas (máx. MAX_CEDULAS); si una falla, las demás siguen.
 * Con respuesta.estado, al final responde el ticket con el mensaje escrito o, si está vacío, el resumen.
 */
async function registrarRapido({ identificaciones, novedad, desde, hasta, horaEntrada, horaSalida, ticket, nota, respuesta, baseUrl, usuario, rol }) {
  const cedulas = parsearCedulas(Array.isArray(identificaciones) ? identificaciones.join(',') : identificaciones);
  if (!cedulas.length) throw errorValidacion('Escriba al menos una cédula válida.');
  if (cedulas.length > MAX_CEDULAS) throw errorValidacion(`Máximo ${MAX_CEDULAS} cédulas por registro.`);
  if (!P.FECHA_RE.test(desde || '')) throw errorValidacion('Escoja el día.');
  hasta = P.FECHA_RE.test(hasta || '') ? hasta : desde;
  if (hasta < desde) throw errorValidacion('La fecha final debe ser igual o posterior a la inicial.');
  if (P.diasEntre(desde, hasta).length > MAX_DIAS) throw errorValidacion(`Máximo ${MAX_DIAS} días por registro.`);
  ticket = String(ticket || '').trim();
  if (!ticket) throw errorValidacion('Indique el ticket con el que se solicita el registro.');

  const item = (await catalogoRegistroRapido(rol)).find(n => n.novedad === novedad);
  if (!item) throw errorValidacion('Escoja una novedad de la lista.');
  if (item.usaHorario && (!horaEntrada || !horaSalida)) throw errorValidacion('Indique la hora de llegada y de salida.');

  const estadoTicket = respuesta && respuesta.estado ? String(respuesta.estado) : '';
  if (estadoTicket) {
    if (!ESTADOS_TICKET.includes(estadoTicket)) throw errorValidacion('Estado del ticket inválido.');
    if (!(await puedeResolverTickets(rol))) throw errorValidacion('Su rol no puede responder tickets.');
    if (!(await buscarTicket(ticket))) throw errorValidacion(`El ticket ${ticket} no existe; no se puede responder.`);
  }

  const colaboradores = [];
  for (const identificacion of cedulas) {
    try {
      colaboradores.push(await registrarColaborador({ identificacion, item, desde, hasta, horaEntrada, horaSalida, ticket, nota, usuario, rol }));
    } catch (err) {
      if (!err.validacion) console.error('[registroRapidoAsistencia]', err);
      colaboradores.push({ identificacion: Number(identificacion), nombre: null, guardados: [], errores: [{ error: err.message }] });
    }
  }

  // El ticket solo se responde si quedó algo guardado
  let ticketRespondido = false;
  if (estadoTicket && colaboradores.some(c => c.guardados.length)) {
    const texto = String(respuesta.texto || '').trim() || textoRespuestaTicket(item.novedad, colaboradores);
    try {
      ticketRespondido = await responderTicket({ ticket, estado: estadoTicket, texto, baseUrl });
    } catch (err) {
      console.error(`[registroRapidoAsistencia] No se pudo responder el ticket ${ticket}:`, err);
    }
  }
  return { novedad: item.novedad, ticket, colaboradores, ticketRespondido, estadoTicket };
}

module.exports = {
  MAX_CEDULAS, parsearCedulas, puedeRegistroRapido, puedeResolverTickets, catalogoRegistroRapido,
  buscarTicket, resolverColaborador, registrarRapido
};
