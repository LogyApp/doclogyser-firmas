// Calificación de tickets (Dynamic_Tickets.satisfaccion 1 a 5 y sugerencia) por parte de quien puso el ticket.
// Al pasar a Resuelto o Rechazado el ticket recibe un token: con él se califica desde el enlace del correo
// (sin iniciar sesión) y "Mis tickets" lo muestra pendiente. Solo vale la primera calificación.
// Lo usan los tres lugares donde se resuelven tickets: routes/tickets.js, facturacion.js e inventario.js.
const crypto = require('crypto');
const pool = require('./db');
const { notificarCalificacionTicket } = require('./email');

const CONCEPTO_CORREO = 'Habilitar notificaciones de correo en Tickets';
const ESTADOS_FINALES = ['Resuelto', 'Rechazado'];
const MAX_SUGERENCIA = 2000;

// Condición SQL de "pendiente por calificar" (alias t = Dynamic_Tickets)
const SQL_POR_CALIFICAR = "(t.token_calificacion IS NOT NULL AND t.satisfaccion IS NULL AND t.Estado IN ('Resuelto', 'Rechazado'))";

const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// Config_Parametros directorio / Tickets. Sin la fila no se envía correo.
async function correoHabilitado() {
  try {
    const [r] = await pool.execute(
      'SELECT Parametro FROM Config_Parametros WHERE Modulo = ? AND Seccion = ? AND Concepto = ? LIMIT 1',
      ['directorio', 'Tickets', CONCEPTO_CORREO]
    );
    return r.length > 0 && ['1', 'si', 'true', 'habilitado'].includes(norm(r[0].Parametro));
  } catch (err) {
    console.error('[calificacionTickets] No se pudo leer Config_Parametros:', err.message);
    return false;
  }
}

// "Arley Navas - 901" → "Arley Navas"
function nombreDelId(id) {
  return String(id || '').replace(/\s+-\s+\d+\s*$/, '').trim();
}

// Correo de quien puso el ticket: por su ID en Maestro_Usuarios y, si ese ID ya no existe porque cambió
// (p. ej. "Arley Navas - 901" ahora es "Arley Navas - 201"), por el nombre, solo si hay un único correo.
async function correoSolicitante(solicitante) {
  const id = String(solicitante || '').trim();
  if (!id) return null;
  const valido = (e) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim()) ? String(e).trim() : null);
  const [exacto] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [id]);
  if (exacto.length) return valido(exacto[0].Email);
  const nombre = nombreDelId(id);
  if (!nombre || nombre === id) return null;
  const [porNombre] = await pool.execute(
    "SELECT DISTINCT TRIM(Email) AS Email FROM Maestro_Usuarios WHERE ID LIKE ? AND Email IS NOT NULL AND TRIM(Email) <> ''",
    [`${nombre.replace(/[\\%_]/g, '\\$&')} - %`]
  );
  return porNombre.length === 1 ? valido(porNombre[0].Email) : null;
}

/**
 * Después de pasar un ticket a Resuelto o Rechazado: le asigna el token de calificación (si no lo tiene)
 * y, con el interruptor activo y si el solicitante tiene correo, le envía el enlace para calificar.
 * Si ya fue calificado no hace nada. No lanza errores: el cambio de estado ya quedó guardado.
 */
async function prepararCalificacionTicket(ticket, baseUrl) {
  try {
    const [rows] = await pool.execute(
      'SELECT Ticket, solicitante, modulo, motivo, Estado, Observaciones, satisfaccion, token_calificacion FROM Dynamic_Tickets WHERE Ticket = ? LIMIT 1',
      [ticket]
    );
    const t = rows[0];
    if (!t || !ESTADOS_FINALES.includes(t.Estado) || t.satisfaccion != null) return;

    let token = t.token_calificacion;
    if (!token) {
      token = crypto.randomBytes(24).toString('hex');
      const [r] = await pool.execute(
        'UPDATE Dynamic_Tickets SET token_calificacion = ? WHERE Ticket = ? AND token_calificacion IS NULL',
        [token, ticket]
      );
      if (!r.affectedRows) {
        const [otra] = await pool.execute('SELECT token_calificacion FROM Dynamic_Tickets WHERE Ticket = ? LIMIT 1', [ticket]);
        token = otra[0] && otra[0].token_calificacion;
      }
    }

    // El correo va en segundo plano para no demorar la respuesta de quien resuelve
    if (token) enviarCorreoCalificacion(t, `${baseUrl}/tickets/calificar?t=${token}`);
  } catch (err) {
    console.error(`[calificacionTickets] Ticket ${ticket}:`, err.message);
  }
}

async function enviarCorreoCalificacion(t, urlCalificar) {
  try {
    if (!(await correoHabilitado())) return;
    const email = await correoSolicitante(t.solicitante);
    if (!email) {
      console.log(`[calificacionTickets] Ticket ${t.Ticket}: ${t.solicitante} no tiene correo en Maestro_Usuarios, no se envía la calificación.`);
      return;
    }
    await notificarCalificacionTicket({
      email,
      nombre: nombreDelId(t.solicitante) || t.solicitante,
      ticket: t.Ticket,
      modulo: t.modulo,
      motivo: t.motivo,
      estado: t.Estado,
      observaciones: t.Observaciones,
      urlCalificar,
    });
  } catch (err) {
    console.error(`[calificacionTickets] Correo del ticket ${t.Ticket}:`, err.message);
  }
}

// Valida { satisfaccion, sugerencia } del formulario. Devuelve { error } o { satisfaccion, sugerencia }.
function validarCalificacion(body) {
  const satisfaccion = Number(body && body.satisfaccion);
  if (!Number.isInteger(satisfaccion) || satisfaccion < 1 || satisfaccion > 5) return { error: 'Escoge una calificación de 1 a 5 estrellas.' };
  const sugerencia = String((body && body.sugerencia) || '').trim();
  if (sugerencia.length > MAX_SUGERENCIA) return { error: `El comentario no puede superar ${MAX_SUGERENCIA} caracteres.` };
  return { satisfaccion, sugerencia: sugerencia || null };
}

// Guarda la calificación si el ticket sigue pendiente. `donde` es { token } o { ticket, solicitante }.
// Devuelve true si se guardó, false si ya estaba calificado o no aplica.
async function guardarCalificacion(donde, { satisfaccion, sugerencia }) {
  const filtro = donde.token ? 't.token_calificacion = ?' : 't.Ticket = ? AND t.solicitante = ?';
  const params = donde.token ? [donde.token] : [donde.ticket, donde.solicitante];
  const [r] = await pool.execute(
    `UPDATE Dynamic_Tickets t SET t.satisfaccion = ?, t.sugerencia = ?, t.fecha_calificacion = NOW()
      WHERE ${filtro} AND ${SQL_POR_CALIFICAR}`,
    [satisfaccion, sugerencia, ...params]
  );
  return r.affectedRows > 0;
}

module.exports = {
  SQL_POR_CALIFICAR,
  MAX_SUGERENCIA,
  prepararCalificacionTicket,
  validarCalificacion,
  guardarCalificacion,
};
