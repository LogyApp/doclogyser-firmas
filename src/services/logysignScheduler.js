const pool = require('./db');
const { transporter, LOGO_HEADER_ATTACHMENT } = require('./email');
const { obtenerConfigLogysign, prefijoEn, diasMs, normalizar } = require('./configLogysign');
const { correoSolicitudFirma, enlaceDescuentoPendiente } = require('./logysignCorreos');

// Destinatarios en copia de los correos de LogySign (Config_Parametros CloudDocs / LogySign):
// 1. Quien envía el documento.
// 2. Los responsables de la Operación del trabajador ('Roles responsables de la Operación en copia');
//    si nadie tiene esa Operación, los de la SOCIODEMOGRAFICA de la operación (Dispositivo) y, si
//    tampoco, los de la Regional ('Roles en copia por Regional cuando la Operación no tiene responsables').
//    Se omite para 'Documentos que no copian a los responsables de la Operación' (por defecto CONT).
// 3. 'Copia por documento - …' (Condicion = prefijos): roles o correos escritos tal cual.
async function obtenerCcEmails(usuarioId, identificacion, idConfigDoc) {
  const ccList = [];
  try {
    // 1. Email of the initiating user
    const [uRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuarioId]);
    if (uRows.length && uRows[0].Email) {
      ccList.push(uRows[0].Email);
    }

    const cfg = await obtenerConfigLogysign();
    const [docRows] = await pool.execute('SELECT Prefijo FROM Config_Doc_Trabajador WHERE Id = ? LIMIT 1', [idConfigDoc]);
    const prefijoDoc = docRows.length ? docRows[0].Prefijo : '';
    const omitirRolesLocales = prefijoEn(cfg.docsSinResponsables, prefijoDoc);
    const deRol = (rows, roles) => rows.filter(r => r.Email && roles.includes(normalizar(r.Rol)));

    if (!omitirRolesLocales && identificacion) {
      const [vinRows] = await pool.execute(
        'SELECT `Operación`, Regional FROM `Maestro_Vinculación` WHERE `Identificación` = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
        [identificacion]
      );
      const operacionTrabajador = vinRows.length ? vinRows[0]['Operación'] : null;
      const regionalTrabajador  = vinRows.length ? vinRows[0].Regional : null;

      // 2. Responsables por Operación del trabajador
      let foundOperacionCc = false;
      if (operacionTrabajador && cfg.rolesResponsables.length) {
        const [opRows] = await pool.execute(
          'SELECT Rol, Email FROM Maestro_Usuarios WHERE `Operación` = ?',
          [operacionTrabajador]
        );
        const responsables = deRol(opRows, cfg.rolesResponsables);
        if (responsables.length) {
          responsables.forEach(r => ccList.push(r.Email));
          foundOperacionCc = true;
        }

        // 2b. Fallback por SOCIODEMOGRAFICA de Maestro_Operaciones -> Dispositivo en Maestro_Usuarios
        if (!foundOperacionCc) {
          const [moRows] = await pool.execute(
            'SELECT SOCIODEMOGRAFICA FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
            [operacionTrabajador]
          );
          const sociodemografica = moRows.length ? (moRows[0].SOCIODEMOGRAFICA || '').trim() : '';
          if (sociodemografica) {
            const [dispRows] = await pool.execute(
              `SELECT Rol, Email FROM Maestro_Usuarios
               WHERE LOWER(Dispositivo) LIKE ? AND Email IS NOT NULL AND Email <> ''`,
              [`%${sociodemografica.toLowerCase()}%`]
            );
            const porDispositivo = deRol(dispRows, cfg.rolesResponsables);
            if (porDispositivo.length) {
              porDispositivo.forEach(r => ccList.push(r.Email));
              foundOperacionCc = true;
            }
          }
        }
      }

      // 3. Fallback por Regional del trabajador
      if (!foundOperacionCc && regionalTrabajador && cfg.rolesRegional.length) {
        const [regRows] = await pool.execute(
          'SELECT Rol, Email FROM Maestro_Usuarios WHERE Regional = ?',
          [regionalTrabajador]
        );
        deRol(regRows, cfg.rolesRegional).forEach(r => ccList.push(r.Email));
      }
    }

    // 4. 'Copia por documento - …' (Condicion = prefijos). Cada valor es un Rol (Email de
    // Maestro_Usuarios) o un correo escrito tal cual, para los buzones sin rol (admin@, retiros@).
    const destinos = [];
    cfg.copiasDocumento
      .filter(c => prefijoEn(c.prefijos, prefijoDoc))
      .forEach(c => destinos.push(...c.destinos));
    const rolesCopia = destinos.filter(d => !d.includes('@')).map(normalizar);
    destinos.filter(d => d.includes('@')).forEach(e => ccList.push(e));
    if (rolesCopia.length) {
      const [rolRows] = await pool.execute(
        "SELECT Rol, Email FROM Maestro_Usuarios WHERE Email IS NOT NULL AND Email <> ''"
      );
      deRol(rolRows, rolesCopia).forEach(r => ccList.push(r.Email));
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
      let reclamado = false;
      try {
        // Se reclama el registro antes de enviar: si otro servidor ya lo tomó, affectedRows = 0 y no se
        // envía otra vez (hay dos servicios de Cloud Run revisando cada minuto). El plazo del enlace
        // empieza a contar desde el envío, no desde que se programó.
        const cfg = await obtenerConfigLogysign();
        const [claim] = await pool.execute(
          "UPDATE `Dynamic_Logysign` SET `estado` = 'PENDIENTE', `token_expira` = ? WHERE `id` = ? AND `estado` = 'PROGRAMADO'",
          [new Date(Date.now() + diasMs(cfg.diasEnlace)), doc.id]
        );
        if (!claim.affectedRows) continue;
        reclamado = true;

        if (!cfg.notificaciones) {
          // "Habilitar notificaciones de correo en LogySign" apagado: el enlace queda activo para
          // compartirlo por WhatsApp o copiarlo desde Registros, pero no se envía correo.
          console.log(`[logysignScheduler] id=${doc.id} pasa a PENDIENTE sin correo (notificaciones de LogySign deshabilitadas).`);
          continue;
        }
        console.log(`[logysignScheduler] Sending scheduled email for doc id=${doc.id} worker="${doc.nombre_trabajador}"`);

        // Get CC emails
        const ccEmails = await obtenerCcEmails(doc.usuario_creador, doc.identificacion, doc.id_config_doc);

        // Get Documento name
        const [cRows] = await pool.execute(
          'SELECT Documento FROM Config_Doc_Trabajador WHERE Id = ?',
          [doc.id_config_doc]
        );
        const nombreDocumento = cRows.length ? cRows[0].Documento : (doc.prefijo || 'Documento');

        // Enlaces de firma (el contrato programado también lleva su Autorización de Descuento)
        const linkFirma = `${doc.base_url}/logysign/sign/${doc.token}`;
        const linkDescuento = await enlaceDescuentoPendiente(doc.base_url, doc.id_descuento_auto);
        const correo = correoSolicitudFirma({
          nombreTrabajador: doc.nombre_trabajador,
          identificacion: doc.identificacion,
          nombreDocumento,
          linkFirma,
          linkDescuento,
        });

        await transporter.sendMail({
          from: `"LOG&SER Gestión Documental" <${process.env.EMAIL_FROM || 'noreply@logyser.com'}>`,
          to: doc.email_trabajador,
          cc: ccEmails.length ? ccEmails.join(', ') : undefined,
          subject: correo.subject,
          html: correo.html,
          attachments: [LOGO_HEADER_ATTACHMENT],
        });

        console.log(`[logysignScheduler] Successfully sent scheduled email for id=${doc.id} and updated status to PENDIENTE.`);
      } catch (innerErr) {
        console.error(`[logysignScheduler] Failed to send scheduled email for id=${doc.id}:`, innerErr);
        // Si falló el envío, vuelve a PROGRAMADO para reintentar en el próximo ciclo
        if (reclamado) {
          await pool.execute("UPDATE `Dynamic_Logysign` SET `estado` = 'PROGRAMADO' WHERE `id` = ? AND `estado` = 'PENDIENTE'", [doc.id]).catch(() => {});
        }
      }
    }
  } catch (err) {
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST') {
      console.warn(`[logysignScheduler] Conexión a BD temporalmente no disponible (${err.code}). Se reintentará en el próximo ciclo.`);
    } else {
      console.error('[logysignScheduler] Error checking scheduled email delivery:', err);
    }
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
