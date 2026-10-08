/**
 * Servicio Centralizado de Notificaciones (Maestro_notificaciones)
 * Soporta Evaluación SST, Capacitación SST, Prueba de Consumo y módulos futuros.
 */

const ROLES_SST_SIN_FILTRO = ['Sistema', 'AdmSst', 'LiderSst'];

/**
 * Obtiene la lista de usuarios SST que deben recibir la notificación según la operación/regional del trabajador.
 */
async function obtenerDestinatariosSST(pool, operacionTrabajador, regionalTrabajador) {
  try {
    const [users] = await pool.query(
      "SELECT ID, Nombre, Rol, Regional, Dispositivo, `Operación` FROM Maestro_Usuarios WHERE Rol IN ('AdmSst', 'AnaSst', 'AuxSst', 'LiderSst', 'Sistema')"
    );

    const destinatarios = [];

    for (const u of users) {
      if (ROLES_SST_SIN_FILTRO.includes(u.Rol)) {
        destinatarios.push(u.ID);
        continue;
      }
      if (u['Operación'] && operacionTrabajador && u['Operación'].toLowerCase().trim() === operacionTrabajador.toLowerCase().trim()) {
        destinatarios.push(u.ID);
        continue;
      }
      if (u.Regional && regionalTrabajador && u.Regional.toLowerCase().trim() === regionalTrabajador.toLowerCase().trim()) {
        destinatarios.push(u.ID);
        continue;
      }
    }

    return [...new Set(destinatarios)];
  } catch (err) {
    console.error('[notificacionesService] Error obteniendo destinatarios SST:', err);
    return ['Sistema'];
  }
}

/**
 * Crea las notificaciones correspondientes al completarse y firmarse una Evaluación SST.
 */
async function crearNotificacionEvaluacionSST(pool, { id_evaluacion, identificacion, tipo, resultado, puntaje, url_doc }) {
  try {
    // 1. Obtener detalles del colaborador (Nombre, Operación, Regional)
    const [vinRows] = await pool.execute(
      `SELECT Trabajador, Regional, \`Operación\`
       FROM \`Maestro_Vinculación\`
       WHERE Identificación = ?
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );

    const nombreCompleto = vinRows.length && vinRows[0].Trabajador ? vinRows[0].Trabajador : identificacion;
    const cleanNombre = nombreCompleto.includes(' ** ') ? nombreCompleto.split(' ** ')[1].trim() : nombreCompleto.trim();
    const operacion = vinRows.length ? vinRows[0]['Operación'] : null;
    const regional = vinRows.length ? vinRows[0].Regional : null;

    const scoreStr = puntaje != null ? `${puntaje}/13` : '—';
    const resStr = resultado || 'COMPLETADO';
    const subtipo = tipo || 'Inducción';
    const titulo = `Evaluación SST Firmada (${subtipo})`;
    const mensaje = `${cleanNombre} completó la evaluación con ${scoreStr} (${resStr})`;

    // 2. Destinatarios
    const recipients = await obtenerDestinatariosSST(pool, operacion, regional);

    // 3. Inserción para cada destinatario
    for (const userId of recipients) {
      // Evitar duplicados por id_evaluacion
      const [exists] = await pool.execute(
        "SELECT id FROM Maestro_notificaciones WHERE usuario_id = ? AND modulo = 'evaluacionsst' AND referencia_id = ? LIMIT 1",
        [userId, id_evaluacion]
      );
      if (exists.length > 0) continue;

      await pool.execute(
        `INSERT INTO Maestro_notificaciones
         (usuario_id, modulo, subtipo, referencia_id, identificacion_trabajador, nombre_trabajador,
          operacion, regional, titulo, mensaje, resultado, puntaje, url_doc, leido, fecha_creacion)
         VALUES (?, 'evaluacionsst', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())`,
        [
          userId,
          subtipo,
          id_evaluacion,
          identificacion,
          cleanNombre,
          operacion,
          regional,
          titulo,
          mensaje,
          resStr,
          scoreStr,
          url_doc
        ]
      );
    }

    console.log(`[notificacionesService] Creadas ${recipients.length} notificaciones para evaluación ${id_evaluacion}`);
  } catch (err) {
    console.error('[notificacionesService] Error creando notificación de Evaluación SST:', err);
  }
}

/**
 * Consulta las notificaciones de un usuario para un módulo específico.
 */
async function obtenerNotificacionesUsuario(pool, { usuarioId, modulo, limit = 50 }) {
  if (!usuarioId) return { notificaciones: [], totalNoLeidos: 0 };

  const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);

  // Lista de notificaciones
  const [rows] = await pool.execute(
    `SELECT id, usuario_id, modulo, subtipo, referencia_id, identificacion_trabajador,
            nombre_trabajador, operacion, regional, titulo, mensaje, resultado,
            puntaje, url_doc, leido, fecha_lectura,
            DATE_FORMAT(fecha_creacion, '%Y-%m-%d %H:%i:%s') AS fecha_creacion
     FROM Maestro_notificaciones
     WHERE usuario_id = ? AND modulo = ?
     ORDER BY fecha_creacion DESC, id DESC
     LIMIT ${parsedLimit}`,
    [usuarioId, modulo]
  );

  // Total no leídos
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS totalNoLeidos
     FROM Maestro_notificaciones
     WHERE usuario_id = ? AND modulo = ? AND leido = 0`,
    [usuarioId, modulo]
  );

  const totalNoLeidos = countRows.length ? countRows[0].totalNoLeidos : 0;

  return {
    notificaciones: rows,
    totalNoLeidos
  };
}

/**
 * Marca como leídas las notificaciones por array de IDs.
 */
async function marcarNotificacionesLeidas(pool, { usuarioId, ids }) {
  if (!usuarioId || !Array.isArray(ids) || !ids.length) return { ok: true, actualizados: 0 };

  const safeIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  if (!safeIds.length) return { ok: true, actualizados: 0 };

  const ph = safeIds.map(() => '?').join(',');
  const [result] = await pool.execute(
    `UPDATE Maestro_notificaciones
     SET leido = 1, fecha_lectura = NOW()
     WHERE usuario_id = ? AND id IN (${ph}) AND leido = 0`,
    [usuarioId, ...safeIds]
  );

  return { ok: true, actualizados: result.affectedRows };
}

/**
 * Marca todas las notificaciones como leídas para un usuario y módulo.
 */
async function marcarTodasLeidas(pool, { usuarioId, modulo }) {
  if (!usuarioId || !modulo) return { ok: false, error: 'Parámetros requeridos' };

  const [result] = await pool.execute(
    `UPDATE Maestro_notificaciones
     SET leido = 1, fecha_lectura = NOW()
     WHERE usuario_id = ? AND modulo = ? AND leido = 0`,
    [usuarioId, modulo]
  );

  return { ok: true, actualizados: result.affectedRows };
}

/**
 * Crea las notificaciones correspondientes al completarse y firmarse una Capacitación SST.
 */
async function crearNotificacionCapacitacionSST(pool, { id_capacitacion, identificacion, tema, resultado, puntaje, totalPreguntas, url_doc }) {
  try {
    // 1. Obtener detalles del colaborador (Nombre, Operación, Regional)
    const [vinRows] = await pool.execute(
      `SELECT Trabajador, Regional, \`Operación\`
       FROM \`Maestro_Vinculación\`
       WHERE Identificación = ?
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );

    const nombreCompleto = vinRows.length && vinRows[0].Trabajador ? vinRows[0].Trabajador : identificacion;
    const cleanNombre = nombreCompleto.includes(' ** ') ? nombreCompleto.split(' ** ')[1].trim() : nombreCompleto.trim();
    const operacion = vinRows.length ? vinRows[0]['Operación'] : null;
    const regional = vinRows.length ? vinRows[0].Regional : null;

    const scoreStr = puntaje != null && totalPreguntas ? `${puntaje}/${totalPreguntas}` : (puntaje != null ? `${puntaje}` : '—');
    const resStr = (resultado || 'COMPLETADO').toUpperCase();
    const subtipo = tema || 'Capacitación';
    const titulo = `Capacitación SST Firmada (${tema || 'Capacitación'})`;
    const mensaje = `${cleanNombre} completó la capacitación con ${scoreStr} (${resStr})`;

    // 2. Destinatarios SST
    const recipients = await obtenerDestinatariosSST(pool, operacion, regional);

    // 3. Inserción para cada destinatario
    for (const userId of recipients) {
      const [exists] = await pool.execute(
        "SELECT id FROM Maestro_notificaciones WHERE usuario_id = ? AND modulo = 'capacitacionsst' AND referencia_id = ? LIMIT 1",
        [userId, id_capacitacion]
      );
      if (exists.length > 0) continue;

      await pool.execute(
        `INSERT INTO Maestro_notificaciones
         (usuario_id, modulo, subtipo, referencia_id, identificacion_trabajador, nombre_trabajador,
          operacion, regional, titulo, mensaje, resultado, puntaje, url_doc, leido, fecha_creacion)
         VALUES (?, 'capacitacionsst', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())`,
        [
          userId,
          subtipo,
          id_capacitacion,
          identificacion,
          cleanNombre,
          operacion,
          regional,
          titulo,
          mensaje,
          resStr,
          scoreStr,
          url_doc
        ]
      );
    }

    console.log(`[notificacionesService] Creadas ${recipients.length} notificaciones para capacitación ${id_capacitacion}`);
  } catch (err) {
    console.error('[notificacionesService] Error creando notificación de Capacitación SST:', err);
  }
}

/**
 * Crea las notificaciones correspondientes al completarse y firmarse una Prueba de Consumo SST.
 */
async function crearNotificacionPruebaConsumoSST(pool, { idprueba, identificacion, cliente, url_doc }) {
  try {
    // 1. Obtener detalles del colaborador (Nombre, Operación, Regional)
    const [vinRows] = await pool.execute(
      `SELECT Trabajador, Regional, \`Operación\`
       FROM \`Maestro_Vinculación\`
       WHERE Identificación = ?
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );

    const nombreCompleto = vinRows.length && vinRows[0].Trabajador ? vinRows[0].Trabajador : identificacion;
    const cleanNombre = nombreCompleto.includes(' ** ') ? nombreCompleto.split(' ** ')[1].trim() : nombreCompleto.trim();
    const operacion = vinRows.length ? vinRows[0]['Operación'] : null;
    const regional = vinRows.length ? vinRows[0].Regional : null;

    const subtipo = cliente || 'Toxicología';
    const titulo = `Consentimiento de Toxicología Firmado (${subtipo})`;
    const mensaje = `${cleanNombre} firmó el consentimiento de prueba de toxicología (${subtipo})`;

    // 2. Destinatarios SST
    const recipients = await obtenerDestinatariosSST(pool, operacion, regional);

    // 3. Inserción para cada destinatario
    for (const userId of recipients) {
      const [exists] = await pool.execute(
        "SELECT id FROM Maestro_notificaciones WHERE usuario_id = ? AND modulo = 'pruebaconsumo' AND referencia_id = ? LIMIT 1",
        [userId, idprueba]
      );
      if (exists.length > 0) continue;

      await pool.execute(
        `INSERT INTO Maestro_notificaciones
         (usuario_id, modulo, subtipo, referencia_id, identificacion_trabajador, nombre_trabajador,
          operacion, regional, titulo, mensaje, resultado, puntaje, url_doc, leido, fecha_creacion)
         VALUES (?, 'pruebaconsumo', ?, ?, ?, ?, ?, ?, ?, ?, 'FIRMADO', NULL, ?, 0, NOW())`,
        [
          userId,
          subtipo,
          idprueba,
          identificacion,
          cleanNombre,
          operacion,
          regional,
          titulo,
          mensaje,
          url_doc
        ]
      );
    }

    console.log(`[notificacionesService] Creadas ${recipients.length} notificaciones para prueba de consumo ${idprueba}`);
  } catch (err) {
    console.error('[notificacionesService] Error creando notificación de Prueba de Consumo SST:', err);
  }
}

/**
 * Crea las notificaciones correspondientes cuando el trabajador firma un Compromiso SST.
 * Notifica al usuario creador del registro (para que firme como Analista) y a los roles SST pertinentes.
 */
async function crearNotificacionCompromisoSST(pool, { idcsst, identificacion, usuarioCreador, nombre_trabajador }) {
  try {
    // 1. Obtener detalles del colaborador (Nombre, Operación, Regional)
    const [vinRows] = await pool.execute(
      `SELECT Trabajador, Regional, \`Operación\`
       FROM \`Maestro_Vinculación\`
       WHERE Identificación = ?
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );

    const nombreCompleto = vinRows.length && vinRows[0].Trabajador 
      ? vinRows[0].Trabajador 
      : (nombre_trabajador || identificacion);
    const cleanNombre = nombreCompleto.includes(' ** ') 
      ? nombreCompleto.split(' ** ')[1].trim() 
      : nombreCompleto.trim();
    const operacion = vinRows.length ? vinRows[0]['Operación'] : null;
    const regional = vinRows.length ? vinRows[0].Regional : null;

    const subtipo = 'Normas de SST';
    const titulo = 'Trabajador Firmó Compromiso SST';
    const mensaje = `${cleanNombre} firmó el compromiso SST. Pendiente tu firma como Analista para generar el PDF.`;

    // 2. Destinatarios: Se notifica al usuario creador del registro
    const recipients = new Set();
    if (usuarioCreador) {
      recipients.add(usuarioCreador);
    }
    if (recipients.size === 0) {
      const fallbackRecipients = await obtenerDestinatariosSST(pool, operacion, regional);
      fallbackRecipients.forEach(u => recipients.add(u));
    }

    // 3. Inserción para cada destinatario
    for (const userId of recipients) {
      const [exists] = await pool.execute(
        "SELECT id FROM Maestro_notificaciones WHERE usuario_id = ? AND modulo = 'csst' AND referencia_id = ? LIMIT 1",
        [userId, idcsst]
      );
      if (exists.length > 0) continue;

      await pool.execute(
        `INSERT INTO Maestro_notificaciones
         (usuario_id, modulo, subtipo, referencia_id, identificacion_trabajador, nombre_trabajador,
          operacion, regional, titulo, mensaje, resultado, puntaje, url_doc, leido, fecha_creacion)
         VALUES (?, 'csst', ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE_FIRMA', NULL, NULL, 0, NOW())`,
        [
          userId,
          subtipo,
          idcsst,
          identificacion,
          cleanNombre,
          operacion,
          regional,
          titulo,
          mensaje
        ]
      );
    }

    console.log(`[notificacionesService] Creadas ${recipients.size} notificaciones para compromiso ${idcsst}`);
  } catch (err) {
    console.error('[notificacionesService] Error creando notificación de Compromiso SST:', err);
  }
}

module.exports = {
  crearNotificacionEvaluacionSST,
  crearNotificacionCapacitacionSST,
  crearNotificacionPruebaConsumoSST,
  crearNotificacionCompromisoSST,
  obtenerNotificacionesUsuario,
  marcarNotificacionesLeidas,
  marcarTodasLeidas
};

