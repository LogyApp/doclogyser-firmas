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
// urlDoc: si el PDF ya quedó generado (firma registrada de quien lo creó), la notificación sale como completada
async function crearNotificacionCompromisoSST(pool, { idcsst, identificacion, usuarioCreador, nombre_trabajador, urlDoc = null }) {
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
    const titulo = urlDoc ? 'Compromiso SST Completado' : 'Trabajador Firmó Compromiso SST';
    const mensaje = urlDoc
      ? `${cleanNombre} firmó el compromiso SST. El PDF quedó generado con tu firma registrada.`
      : `${cleanNombre} firmó el compromiso SST. Pendiente tu firma como responsable para generar el PDF.`;
    const resultado = urlDoc ? 'COMPLETADO' : 'PENDIENTE_FIRMA';

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
         VALUES (?, 'csst', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, NOW())`,
        [
          userId,
          subtipo,
          idcsst,
          identificacion,
          cleanNombre,
          operacion,
          regional,
          titulo,
          mensaje,
          resultado,
          urlDoc
        ]
      );
    }

    console.log(`[notificacionesService] Creadas ${recipients.size} notificaciones para compromiso ${idcsst}`);
  } catch (err) {
    console.error('[notificacionesService] Error creando notificación de Compromiso SST:', err);
  }
}

/**
 * Notificación de la campanita de SST › Documentación Inicial (ARO, EVIN, INGE) cuando el trabajador firma.
 * La reciben los usuarios SST de la operación o regional del trabajador y quien generó el registro.
 * subtipo: 'ARO' | 'EVIN' | ...; referencia_id: id del registro en su tabla Dynamic_*.
 */
async function crearNotificacionDocInicialSST(pool, { subtipo, referencia_id, identificacion, nombre_trabajador, operacion, regional,
  titulo, mensaje, resultado, puntaje = null, url_doc = null, usuarioCreador = null }) {
  try {
    const recipients = new Set(await obtenerDestinatariosSST(pool, operacion, regional));
    if (usuarioCreador) recipients.add(usuarioCreador);
    for (const userId of recipients) {
      const [exists] = await pool.execute(
        "SELECT id FROM Maestro_notificaciones WHERE usuario_id = ? AND modulo = 'docinicial' AND referencia_id = ? LIMIT 1",
        [userId, referencia_id]
      );
      if (exists.length > 0) continue;
      await pool.execute(
        `INSERT INTO Maestro_notificaciones
         (usuario_id, modulo, subtipo, referencia_id, identificacion_trabajador, nombre_trabajador,
          operacion, regional, titulo, mensaje, resultado, puntaje, url_doc, leido, fecha_creacion)
         VALUES (?, 'docinicial', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())`,
        [userId, subtipo, referencia_id, identificacion, nombre_trabajador, operacion || null, regional || null,
          titulo, mensaje, resultado, puntaje, url_doc]
      );
    }
  } catch (err) {
    console.error('[notificacionesService] Error creando notificación de Documentación Inicial SST:', err);
  }
}

/**
 * Obtiene los destinatarios para notificaciones de Aspirantes.
 * Prioriza al Responsable de Selección asignado a la requisición (Maestro_Usuarios).
 * Si no hay responsable asignado o no se encuentra, notifica a los roles de Selección / Sistema.
 */
async function obtenerDestinatariosAspirante(pool, responsableNombre, operacion, regional) {
  try {
    const destinatarios = new Set();

    if (responsableNombre && String(responsableNombre).trim()) {
      const [uRows] = await pool.execute(
        'SELECT ID FROM Maestro_Usuarios WHERE TRIM(Nombre) = TRIM(?) LIMIT 1',
        [responsableNombre.trim()]
      );
      if (uRows.length && uRows[0].ID) {
        destinatarios.add(uRows[0].ID);
      }
    }

    // Si no tiene responsable individual asignado o no se encontró, notificar a roles de Selección
    if (destinatarios.size === 0) {
      const [users] = await pool.execute(
        "SELECT ID, Rol, `Operación`, Regional FROM Maestro_Usuarios WHERE Rol IN ('Selección', 'Seleccion', 'Selección Centro', 'Seleccion Centro', 'Sistema')"
      );
      for (const u of users) {
        if (u.Rol === 'Sistema') {
          destinatarios.add(u.ID);
          continue;
        }
        if (u['Operación'] && operacion && u['Operación'].toLowerCase().trim() === operacion.toLowerCase().trim()) {
          destinatarios.add(u.ID);
          continue;
        }
        if (u.Regional && regional && u.Regional.toLowerCase().trim() === regional.toLowerCase().trim()) {
          destinatarios.add(u.ID);
          continue;
        }
        destinatarios.add(u.ID);
      }
    }

    return [...destinatarios];
  } catch (err) {
    console.error('[notificacionesService] Error obteniendo destinatarios Aspirante:', err);
    return ['Sistema'];
  }
}

/**
 * Crea las notificaciones internas cuando un aspirante sube documentos de soporte en su portal.
 */
async function crearNotificacionCargaDocumentosAspirante(pool, { id_aspirante, cantidadDocs = 1, nombresDocs = '' }) {
  try {
    if (!id_aspirante) return;

    const [rows] = await pool.execute(
      `SELECT a.identificacion, a.primer_nombre, a.segundo_nombre, a.primer_apellido, a.segundo_apellido,
              r.\`Responsable de Selección\` AS responsable, r.\`Operación\` AS operacion, r.Regional AS regional,
              r.Requisición AS req_codigo, r.\`Cargo Requerido\` AS cargo
       FROM Dynamic_hv_aspirante a
       LEFT JOIN Dynamic_Requisiciones r ON r.IdRequisicion = a.IdRequisicion
       WHERE a.id_aspirante = ? LIMIT 1`,
      [id_aspirante]
    );

    if (!rows.length) return;
    const a = rows[0];
    const nombreCompleto = [a.primer_nombre, a.segundo_nombre, a.primer_apellido, a.segundo_apellido]
      .filter(n => n && String(n).trim()).join(' ').trim() || a.identificacion || 'Aspirante';

    const cleanNombre = nombreCompleto.includes(' ** ') ? nombreCompleto.split(' ** ')[1].trim() : nombreCompleto.trim();
    const operacion = a.operacion || null;
    const regional = a.regional || null;
    const cant = parseInt(cantidadDocs, 10) || 1;
    const titulo = cant > 1 ? `📄 ${cant} Documentos Cargados` : `📄 Documento Cargado`;
    const docInfo = nombresDocs ? ` (${nombresDocs})` : '';
    const reqInfo = a.req_codigo ? ` (Req. ${a.req_codigo})` : '';
    const mensaje = `${cleanNombre} cargó ${cant > 1 ? `${cant} documentos de soporte` : 'un documento de soporte'}${docInfo}${reqInfo}.`;

    const recipients = await obtenerDestinatariosAspirante(pool, a.responsable, operacion, regional);

    for (const userId of recipients) {
      // Si ya hay una notificación sin leer para este aspirante y usuario creada en los últimos 2 minutos, actualizarla para no saturar
      const [recent] = await pool.execute(
        `SELECT id FROM Maestro_notificaciones 
         WHERE usuario_id = ? AND modulo = 'aspirantes' AND subtipo = 'carga_documentos' 
           AND referencia_id = ? AND leido = 0 AND fecha_creacion >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
         ORDER BY id DESC LIMIT 1`,
        [userId, String(id_aspirante)]
      );

      if (recent.length > 0) {
        await pool.execute(
          `UPDATE Maestro_notificaciones 
           SET titulo = ?, mensaje = ?, fecha_creacion = NOW()
           WHERE id = ?`,
          [titulo, mensaje, recent[0].id]
        );
      } else {
        await pool.execute(
          `INSERT INTO Maestro_notificaciones
           (usuario_id, modulo, subtipo, referencia_id, identificacion_trabajador, nombre_trabajador,
            operacion, regional, titulo, mensaje, resultado, puntaje, url_doc, leido, fecha_creacion)
           VALUES (?, 'aspirantes', 'carga_documentos', ?, ?, ?, ?, ?, ?, ?, 'CARGADO', NULL, ?, 0, NOW())`,
          [
            userId,
            String(id_aspirante),
            a.identificacion,
            cleanNombre,
            operacion,
            regional,
            titulo,
            mensaje,
            `/seleccion/admin/${id_aspirante}`
          ]
        );
      }
    }

    console.log(`[notificacionesService] Creada(s) ${recipients.length} notificación(es) de carga de documentos para aspirante ${id_aspirante}`);
  } catch (err) {
    console.error('[notificacionesService] Error creando notificación de carga de documentos aspirante:', err);
  }
}

/**
 * Crea la notificación interna cuando un aspirante completa la firma digital de sus documentos.
 */
async function crearNotificacionFirmasCompletasAspirante(pool, { id_aspirante }) {
  try {
    if (!id_aspirante) return;

    const [rows] = await pool.execute(
      `SELECT a.identificacion, a.primer_nombre, a.segundo_nombre, a.primer_apellido, a.segundo_apellido,
              r.\`Responsable de Selección\` AS responsable, r.\`Operación\` AS operacion, r.Regional AS regional,
              r.Requisición AS req_codigo, r.\`Cargo Requerido\` AS cargo
       FROM Dynamic_hv_aspirante a
       LEFT JOIN Dynamic_Requisiciones r ON r.IdRequisicion = a.IdRequisicion
       WHERE a.id_aspirante = ? LIMIT 1`,
      [id_aspirante]
    );

    if (!rows.length) return;
    const a = rows[0];
    const nombreCompleto = [a.primer_nombre, a.segundo_nombre, a.primer_apellido, a.segundo_apellido]
      .filter(n => n && String(n).trim()).join(' ').trim() || a.identificacion || 'Aspirante';

    const cleanNombre = nombreCompleto.includes(' ** ') ? nombreCompleto.split(' ** ')[1].trim() : nombreCompleto.trim();
    const operacion = a.operacion || null;
    const regional = a.regional || null;
    const reqInfo = a.req_codigo ? ` (Req. ${a.req_codigo})` : '';
    const titulo = `✍️ Firmas Digitales Completadas`;
    const mensaje = `${cleanNombre} completó la firma digital de todos sus documentos de vinculación${reqInfo}.`;

    const recipients = await obtenerDestinatariosAspirante(pool, a.responsable, operacion, regional);

    for (const userId of recipients) {
      // Evitar duplicado si ya existe una no leída creada en la última hora
      const [exists] = await pool.execute(
        `SELECT id FROM Maestro_notificaciones 
         WHERE usuario_id = ? AND modulo = 'aspirantes' AND subtipo = 'firma_digital' 
           AND referencia_id = ? AND leido = 0 AND fecha_creacion >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
         LIMIT 1`,
        [userId, String(id_aspirante)]
      );

      if (exists.length > 0) continue;

      await pool.execute(
        `INSERT INTO Maestro_notificaciones
         (usuario_id, modulo, subtipo, referencia_id, identificacion_trabajador, nombre_trabajador,
          operacion, regional, titulo, mensaje, resultado, puntaje, url_doc, leido, fecha_creacion)
         VALUES (?, 'aspirantes', 'firma_digital', ?, ?, ?, ?, ?, ?, ?, 'FIRMADO', NULL, ?, 0, NOW())`,
        [
          userId,
          String(id_aspirante),
          a.identificacion,
          cleanNombre,
          operacion,
          regional,
          titulo,
          mensaje,
          `/seleccion/admin/${id_aspirante}`
        ]
      );
    }

    console.log(`[notificacionesService] Creada(s) ${recipients.length} notificación(es) de firmas completas para aspirante ${id_aspirante}`);
  } catch (err) {
    console.error('[notificacionesService] Error creando notificación de firmas completas aspirante:', err);
  }
}

module.exports = {
  crearNotificacionEvaluacionSST,
  crearNotificacionCapacitacionSST,
  crearNotificacionPruebaConsumoSST,
  crearNotificacionCompromisoSST,
  crearNotificacionDocInicialSST,
  crearNotificacionCargaDocumentosAspirante,
  crearNotificacionFirmasCompletasAspirante,
  obtenerNotificacionesUsuario,
  marcarNotificacionesLeidas,
  marcarTodasLeidas
};

