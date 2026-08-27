const pool = require('./db');
const { transporter } = require('./email');

// Helper to resolve CC emails list (shared with logysign router)
// Prioriza la Operación del trabajador (Maestro_Vinculación) y, solo si no hay
// Auxiliar/Coordinador/AuxiliarR/CoordinadorR asignado a esa Operación, cae a la Regional.
async function obtenerCcEmails(usuarioId, identificacion, idConfigDoc) {
  const ccList = [];
  try {
    // 1. Email of the initiating user
    const [uRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuarioId]);
    if (uRows.length && uRows[0].Email) {
      ccList.push(uRows[0].Email);
    }

    const omitirRolesLocales = (idConfigDoc === 18 || Number(idConfigDoc) === 18);

    if (!omitirRolesLocales && identificacion) {
      const [vinRows] = await pool.execute(
        'SELECT `Operación`, Regional FROM `Maestro_Vinculación` WHERE `Identificación` = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
        [identificacion]
      );
      const operacionTrabajador = vinRows.length ? vinRows[0]['Operación'] : null;
      const regionalTrabajador  = vinRows.length ? vinRows[0].Regional : null;

      // 2. Auxiliar, Coordinador, AuxiliarR y CoordinadorR por Operación del trabajador
      let foundOperacionCc = false;
      if (operacionTrabajador) {
        const [opRows] = await pool.execute(
          'SELECT Email FROM Maestro_Usuarios WHERE `Operación` = ? AND Rol IN ("Auxiliar", "Coordinador", "AuxiliarR", "CoordinadorR")',
          [operacionTrabajador]
        );
        if (opRows.length) {
          opRows.forEach(r => { if (r.Email) ccList.push(r.Email); });
          foundOperacionCc = true;
        }
      }

      // 3. Fallback: AuxiliarR y CoordinadorR por Regional del trabajador
      if (!foundOperacionCc && regionalTrabajador) {
        const [regRows] = await pool.execute(
          'SELECT Email FROM Maestro_Usuarios WHERE Regional = ? AND Rol IN ("AuxiliarR", "CoordinadorR")',
          [regionalTrabajador]
        );
        regRows.forEach(r => { if (r.Email) ccList.push(r.Email); });
      }
    }

    // 4. Fixed copies
    ccList.push('admin@logyser.com');
    const idConfigDocNum = Number(idConfigDoc);
    if ([55, 70, 76, 77].includes(idConfigDocNum)) {
      ccList.push('retiros@logyser.com');
    }
    if (idConfigDocNum === 40) {
      ccList.push('nomina@logyser.com');
      ccList.push('gestor.nomina@logyser.com');
      ccList.push('contratacionnacional@logyser.com');
    }
    if (idConfigDocNum === 42) {
      ccList.push('gestor.nomina@logyser.com');
    }
  } catch (err) {
    console.error('[logysignScheduler] Error fetching CC list:', err);
  }

  // Filter duplicate and empty emails
  return [...new Set(ccList.map(e => e.trim().toLowerCase()))].filter(Boolean);
}

/**
 * Checks for scheduled logysign documents that are due and sends their emails.
 */
async function verificarEnviosProgramados() {
  try {
    // Bogota is UTC-5, and connection time_zone is Bogotá (-05:00)
    // So NOW() returns Bogotá local time.
    // Query records in PROGRAMADO state whose scheduled time is reached
    const [rows] = await pool.execute(
      `SELECT * FROM \`Dynamic_Logysign\` 
       WHERE \`estado\` = 'PROGRAMADO' 
         AND \`fecha_envio_programado\` <= NOW()`
    );

    if (rows.length > 0) {
      console.log(`[logysignScheduler] Found ${rows.length} scheduled email(s) ready to send.`);
    }

    for (const doc of rows) {
      try {
        console.log(`[logysignScheduler] Sending scheduled email for doc id=${doc.id} worker="${doc.nombre_trabajador}"`);

        // Get CC emails
        const ccEmails = await obtenerCcEmails(doc.usuario_creador, doc.identificacion, doc.id_config_doc);

        // Get Documento name
        const [cRows] = await pool.execute(
          'SELECT Documento FROM Config_Doc_Trabajador WHERE Id = ?',
          [doc.id_config_doc]
        );
        const nombreDocumento = cRows.length ? cRows[0].Documento : (doc.prefijo || 'Documento');

        // Link to sign
        const linkFirma = `${doc.base_url}/logysign/sign/${doc.token}`;

        // Build mailBody
        const mailBody = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #edf2f7;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.05)">
            <div style="background:#000b59;padding:20px;border-top-left-radius:8px;border-top-right-radius:8px;text-align:center">
              <h2 style="color:#ffffff;margin:0;font-size:1.5rem">LOG&SER — Firma de Documento</h2>
            </div>
            <div style="padding:24px;background:#ffffff">
              <p style="font-size:1.05rem;color:#2d3748">Hola <strong>${doc.nombre_trabajador}</strong>,</p>
              <p style="color:#4a5568;line-height:1.6">Se ha generado un documento oficial que requiere su firma digital. Por favor haga clic en el siguiente enlace para revisarlo y firmarlo de forma segura:</p>
              
              <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:0.9rem">
                <tr style="background:#f7fafc"><td style="padding:10px;font-weight:bold;color:#4a5568;width:35%">Trabajador</td><td style="padding:10px">${doc.nombre_trabajador} (${doc.identificacion})</td></tr>
                <tr><td style="padding:10px;font-weight:bold;color:#4a5568">Documento</td><td style="padding:10px">${nombreDocumento}</td></tr>
              </table>

              <div style="text-align:center;margin:32px 0">
                <a href="${linkFirma}" target="_blank" style="background:#000b59;color:#ffffff;padding:14px 28px;text-decoration:none;font-weight:bold;border-radius:6px;display:inline-block;box-shadow:0 4px 6px rgba(0,11,89,0.15)">Ver y Firmar Documento</a>
              </div>
              
              <p style="font-size:0.85rem;color:#718096;line-height:1.4">Si el botón no funciona, copie y pegue este enlace en la barra de direcciones de su navegador:</p>
              <p style="font-size:0.85rem;color:#000b59;word-break:break-all">${linkFirma}</p>
            </div>
            <div style="background:#f7fafc;padding:16px;border-bottom-left-radius:8px;border-bottom-right-radius:8px;text-align:center;border-top:1px solid #edf2f7">
              <p style="font-size:0.8rem;color:#a0aec0;margin:0">Este es un correo automático. Por favor no responda directamente a este mensaje.</p>
            </div>
          </div>
        `;

        // Send email
        await transporter.sendMail({
          from: `"LOG&SER Gestión Documental" <${process.env.EMAIL_FROM || 'noreply@logyser.com'}>`,
          to: doc.email_trabajador,
          cc: ccEmails.length ? ccEmails.join(', ') : undefined,
          subject: `LOG&SER: Documento pendiente de firma (${nombreDocumento}) — ${doc.nombre_trabajador}`,
          html: mailBody
        });

        // Update state to PENDIENTE
        await pool.execute(
          "UPDATE `Dynamic_Logysign` SET `estado` = 'PENDIENTE' WHERE `id` = ?",
          [doc.id]
        );
        console.log(`[logysignScheduler] Successfully sent scheduled email for id=${doc.id} and updated status to PENDIENTE.`);
      } catch (innerErr) {
        console.error(`[logysignScheduler] Failed to send scheduled email for id=${doc.id}:`, innerErr);
      }
    }
  } catch (err) {
    console.error('[logysignScheduler] Error checking scheduled email delivery:', err);
  }
}

function iniciarProgramadorEnvios() {
  console.log('[logysignScheduler] Scheduled send checking interval started.');
  // Check every 1 minute
  setInterval(verificarEnviosProgramados, 60 * 1000);
}

module.exports = {
  obtenerCcEmails,
  verificarEnviosProgramados,
  iniciarProgramadorEnvios
};
