const { transporter } = require('./email');

const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@logyser.com';

function buildDocInfoFallback(tipoRegistro, idDocumento) {
  return {
    tipo: tipoRegistro,
    prefijo: 'N/A',
    documento: `Documento ID: ${idDocumento}`,
    trabajador: 'N/A',
    identificacion: 'N/A',
  };
}

async function obtenerCorreoUsuario(pool, usuarioId) {
  const [uRows] = await pool.execute(
    'SELECT Email, Nombre FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );

  return {
    email: uRows.length ? uRows[0].Email : null,
    nombre: uRows.length ? uRows[0].Nombre : usuarioId,
  };
}

async function crearSolicitudAcceso(pool, payload) {
  const { id_documento, justificacion, usuario, tipo_registro } = payload;

  if (!id_documento || !justificacion || !usuario || !tipo_registro) {
    throw new Error('Parámetros incompletos');
  }

  let docInfo = null;

  if (tipo_registro === 'Trabajador') {
    await pool.execute(
      `UPDATE Maestro_docTrabajador
       SET Solicitud = 'SI', Justificacion_Solicitud = ?, Usuario_Solicitud = ?, Estado_Solicitud = 'Pendiente'
       WHERE id = ?`,
      [justificacion, usuario, id_documento]
    );

    const [rows] = await pool.execute(
      `SELECT t.Identificación, t.Prefijo, c.Documento, v.Trabajador
       FROM Maestro_docTrabajador t
       LEFT JOIN Config_Doc_Trabajador c ON t.TipoDocumento = CAST(c.Id AS CHAR)
       LEFT JOIN Maestro_Segmentación v ON t.Identificación = v.Identificación
       WHERE t.id = ?`,
      [id_documento]
    );

    if (rows.length) {
      docInfo = {
        tipo: 'Trabajador',
        prefijo: rows[0].Prefijo,
        documento: rows[0].Documento,
        trabajador: rows[0].Trabajador || rows[0].Identificación,
        identificacion: rows[0].Identificación,
      };
    }
  } else {
    await pool.execute(
      `UPDATE Maestro_docEmpresa
       SET Solicitud = 'SI', Justificacion_Solicitud = ?, Usuario_Solicitud = ?, Estado_Solicitud = 'Pendiente'
       WHERE id = ?`,
      [justificacion, usuario, id_documento]
    );

    const [rows] = await pool.execute(
      `SELECT e.Prefijo, c.Documento
       FROM Maestro_docEmpresa e
       LEFT JOIN Config_Doc_Trabajador c ON e.TipoDocumento = CAST(c.Id AS CHAR)
       WHERE e.id = ?`,
      [id_documento]
    );

    if (rows.length) {
      docInfo = {
        tipo: 'General / Empresa',
        prefijo: rows[0].Prefijo,
        documento: rows[0].Documento,
        trabajador: 'N/A (Documento General de Empresa)',
        identificacion: 'N/A',
      };
    }
  }

  if (!docInfo) {
    docInfo = buildDocInfoFallback(tipo_registro, id_documento);
  }

  const { email: emailUsuario, nombre: nombreUsuario } = await obtenerCorreoUsuario(pool, usuario);
  const asunto = `Nueva Solicitud de Acceso a Documento: ${docInfo.documento}`;

  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #edf2f7;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05)">
      <div style="background:#1e3c72;color:#ffffff;padding:20px;text-align:center">
        <h2 style="margin:0;font-size:1.4rem">LOG&SER Gestión Documental</h2>
        <p style="margin:5px 0 0;font-size:0.9rem;opacity:0.9">Solicitud de Acceso a Archivo Digital</p>
      </div>
      <div style="padding:24px;background:#ffffff">
        <p style="color:#333;font-size:1rem;margin-top:0">Se ha registrado una solicitud para visualizar un documento restringido:</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:0.9rem">
          <tr style="background:#f8fafc">
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#4a5568;width:35%">Solicitado por:</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#2d3748">${nombreUsuario} (${usuario})</td>
          </tr>
          <tr>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#4a5568">Tipo de Documento:</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#2d3748">${docInfo.documento} (${docInfo.prefijo})</td>
          </tr>
          <tr style="background:#f8fafc">
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#4a5568">Tipo Registro:</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#2d3748">${docInfo.tipo}</td>
          </tr>
          <tr>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#4a5568">Trabajador:</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#2d3748">${docInfo.trabajador}</td>
          </tr>
          <tr style="background:#f8fafc">
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#4a5568">Identificación:</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#2d3748">${docInfo.identificacion}</td>
          </tr>
          <tr>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#4a5568;vertical-align:top">Justificación:</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#2d3748;line-height:1.4">${justificacion}</td>
          </tr>
        </table>
        <p style="color:#718096;font-size:0.8rem;margin-bottom:0">Por favor proceda a gestionar el acceso correspondiente.</p>
      </div>
      <div style="background:#edf2f7;padding:12px;text-align:center;font-size:0.75rem;color:#718096">
        © ${new Date().getFullYear()} LOG&SER S.A.S. — Todos los derechos reservados.
      </div>
    </div>
  `;

  const mailOptions = {
    from: `"LOG&SER Gestión Documental" <${EMAIL_FROM}>`,
    to: 'gestiondocumental@logyser.com',
    subject: asunto,
    html: cuerpo,
  };

  if (emailUsuario) {
    mailOptions.cc = emailUsuario;
  }

  await transporter.sendMail(mailOptions);
}

async function gestionarSolicitudAcceso(pool, payload) {
  const { id_documento, tipo_registro, visualizar, observaciones, estado_solicitud } = payload;

  if (!id_documento || !tipo_registro || !estado_solicitud) {
    throw new Error('Parámetros incompletos');
  }

  let requestDetails = null;

  if (tipo_registro === 'Trabajador') {
    const [rows] = await pool.execute(
      `SELECT t.Usuario_Solicitud, t.Prefijo, c.Documento, v.Trabajador
       FROM Maestro_docTrabajador t
       LEFT JOIN Config_Doc_Trabajador c ON t.TipoDocumento = CAST(c.Id AS CHAR)
       LEFT JOIN Maestro_Segmentación v ON t.Identificación = v.Identificación
       WHERE t.id = ?`,
      [id_documento]
    );

    if (rows.length) {
      requestDetails = {
        solicitante: rows[0].Usuario_Solicitud,
        prefijo: rows[0].Prefijo,
        documento: rows[0].Documento,
        detalle: `Trabajador: ${rows[0].Trabajador}`,
      };
    }
  } else {
    const [rows] = await pool.execute(
      `SELECT e.Usuario_Solicitud, e.Prefijo, c.Documento
       FROM Maestro_docEmpresa e
       LEFT JOIN Config_Doc_Trabajador c ON e.TipoDocumento = CAST(c.Id AS CHAR)
       WHERE e.id = ?`,
      [id_documento]
    );

    if (rows.length) {
      requestDetails = {
        solicitante: rows[0].Usuario_Solicitud,
        prefijo: rows[0].Prefijo,
        documento: rows[0].Documento,
        detalle: 'General de Empresa',
      };
    }
  }

  const vizValue = visualizar === 'OK' ? 'OK' : null;

  if (tipo_registro === 'Trabajador') {
    await pool.execute(
      `UPDATE Maestro_docTrabajador
       SET Visualizar = ?, Observaciones = ?, Estado_Solicitud = ?
       WHERE id = ?`,
      [vizValue, observaciones || null, estado_solicitud, id_documento]
    );
  } else {
    await pool.execute(
      `UPDATE Maestro_docEmpresa
       SET Visualizar = ?, Observaciones = ?, Estado_Solicitud = ?
       WHERE id = ?`,
      [vizValue, observaciones || null, estado_solicitud, id_documento]
    );
  }

  if (!requestDetails || !requestDetails.solicitante) return;

  const { email: emailUsuario, nombre: nombreUsuario } = await obtenerCorreoUsuario(pool, requestDetails.solicitante);
  if (!emailUsuario) return;

  const asunto = `Respuesta a tu Solicitud de Acceso: ${requestDetails.documento}`;
  const colorEstado = estado_solicitud === 'Autorizado' ? '#16a34a' : '#dc2626';

  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #edf2f7;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05)">
      <div style="background:#000b59;color:#ffffff;padding:20px;text-align:center">
        <h2 style="margin:0;font-size:1.4rem">LOG&SER Gestión Documental</h2>
        <p style="margin:5px 0 0;font-size:0.9rem;opacity:0.9">Resolución de Solicitud de Acceso</p>
      </div>
      <div style="padding:24px;background:#ffffff">
        <p style="color:#333;font-size:1rem;margin-top:0">Hola <strong>${nombreUsuario}</strong>,</p>
        <p style="color:#333;font-size:1rem">Tu solicitud de acceso para visualizar el siguiente documento restringido ha sido procesada:</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:0.9rem">
          <tr style="background:#f8fafc">
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#4a5568;width:35%">Documento:</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#2d3748">${requestDetails.documento} (${requestDetails.prefijo})</td>
          </tr>
          <tr>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#4a5568">Detalle:</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#2d3748">${requestDetails.detalle}</td>
          </tr>
          <tr style="background:#f8fafc">
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#4a5568">Estado Solicitud:</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:${colorEstado}">${estado_solicitud}</td>
          </tr>
          <tr>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#4a5568;vertical-align:top">Observaciones del Gestor:</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#2d3748;line-height:1.4">${observaciones || 'Sin observaciones adicionales'}</td>
          </tr>
        </table>
        ${estado_solicitud === 'Autorizado'
          ? '<p style="color:#16a34a;font-weight:bold;font-size:0.95rem">Ya puedes ingresar a la plataforma y visualizar el documento ("Ver PDF").</p>'
          : '<p style="color:#dc2626;font-weight:bold;font-size:0.95rem">La solicitud ha sido rechazada/revocada y no tienes acceso de visualización temporal.</p>'
        }
      </div>
      <div style="background:#edf2f7;padding:12px;text-align:center;font-size:0.75rem;color:#718096">
        © ${new Date().getFullYear()} LOG&SER S.A.S. — Todos los derechos reservados.
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"LOG&SER Gestión Documental" <${EMAIL_FROM}>`,
    to: emailUsuario,
    cc: ['gestiondocumental@logyser.com', 'admin@logyser.com'],
    subject: asunto,
    html: cuerpo,
  });
}

module.exports = {
  crearSolicitudAcceso,
  gestionarSolicitudAcceso,
};