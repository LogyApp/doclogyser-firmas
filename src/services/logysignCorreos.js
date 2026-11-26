const pool = require('./db');
const { encabezadoLogo } = require('./email');

// Correo al trabajador con el enlace de firma de LogySign. Lo usan el envío inmediato
// (routes/logysign.js), el envío programado (logysignScheduler.js) y el reenvío
// (routes/registrologysign.js), para que los tres lleven el mismo contenido. Si el documento
// va con la Autorización de Descuento (linkDescuento), se arma el correo de ingreso con los dos enlaces.
function correoSolicitudFirma({ nombreTrabajador, identificacion, nombreDocumento, cargo, operacion, linkFirma, linkDescuento, recordatorio = false }) {
  const pie = `
            <div style="background:#f7fafc;padding:16px;border-bottom-left-radius:8px;border-bottom-right-radius:8px;text-align:center;border-top:1px solid #edf2f7">
              <p style="font-size:0.8rem;color:#a0aec0;margin:0">Este es un correo automático. Por favor no responda directamente a este mensaje.</p>
            </div>`;

  if (linkDescuento) {
    const subject = recordatorio
      ? `LOG&SER: RECORDATORIO — Documentos pendientes de ingreso (Contrato y Autorización Descuento) — ${nombreTrabajador}`
      : `LOG&SER: Documentos pendientes de ingreso (Contrato y Autorización Descuento) — ${nombreTrabajador}`;
    const saludo = recordatorio
      ? `<h2 style="color:#000b59;margin:0 0 12px;font-size:1.3rem">Recordatorio de Ingreso</h2>
              <p style="font-size:1.05rem;color:#2d3748">¡Hola <strong>${nombreTrabajador}</strong>!</p>
              <p style="color:#4a5568;line-height:1.6">Le recordamos que tiene documentos obligatorios pendientes de firma para completar su proceso de ingreso a Logyser. Por favor acceda a los siguientes enlaces para firmarlos de forma segura:</p>`
      : `<h2 style="color:#000b59;margin:0 0 12px;font-size:1.3rem">Proceso de Ingreso</h2>
              <p style="font-size:1.05rem;color:#2d3748">¡Hola <strong>${nombreTrabajador}</strong>!</p>
              <p style="color:#4a5568;line-height:1.6">Te saludamos desde el equipo de vinculación de Logyser. Nos da muchísimo gusto darte la bienvenida al equipo.</p>
              <p style="color:#4a5568;line-height:1.6">Para completar tu proceso de ingreso de forma rápida, por favor ingresa a los siguientes enlaces para revisar y firmar digitalmente tus documentos de ingreso obligatorios:</p>`;
    const html = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #edf2f7;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.05)">
${encabezadoLogo('#000b59')}
            <div style="padding:24px;background:#ffffff">
              ${saludo}

              <div style="margin:24px 0;border-left:4px solid #000b59;padding-left:16px">
                <p style="margin:0 0 8px 0;font-weight:bold;color:#2d3748">📄 1. Contrato de Trabajo:</p>
                <p style="margin:0 0 12px 0;font-size:0.9rem;color:#4a5568">(Por favor verifica que tus datos personales estén correctos y lee las condiciones antes de firmar).</p>
                <a href="${linkFirma}" target="_blank" style="background:#000b59;color:#ffffff;padding:8px 16px;text-decoration:none;font-weight:bold;border-radius:4px;display:inline-block;font-size:0.85rem">Firmar Contrato de Trabajo</a>
              </div>

              <div style="margin:24px 0;border-left:4px solid #000b59;padding-left:16px">
                <p style="margin:0 0 8px 0;font-weight:bold;color:#2d3748">📝 2. Autorización de Descuento por Nómina:</p>
                <p style="margin:0 0 12px 0;font-size:0.9rem;color:#4a5568">(Este formato es un requisito estándar de la compañía que se firma de manera preventiva para respaldar los activos y herramientas de trabajo frente a daños o pérdidas).</p>
                <a href="${linkDescuento}" target="_blank" style="background:#000b59;color:#ffffff;padding:8px 16px;text-decoration:none;font-weight:bold;border-radius:4px;display:inline-block;font-size:0.85rem">Firmar Autorización de Descuento</a>
              </div>

              <p style="color:#4a5568;line-height:1.6;font-size:0.95rem">Una vez firmes ambos documentos, el sistema enviará los respaldos directamente a nuestro soporte legal.</p>
              <p style="color:#4a5568;line-height:1.6;font-size:0.95rem">Por último, si deseas afiliar beneficiarios a la caja de compensación, dime qué beneficiario deseas afiliar y te indicaré los documentos que me debes enviar para su respectiva afiliación.</p>
              ${recordatorio ? '' : '<p style="color:#4a5568;line-height:1.6;font-weight:bold">¡Muchos éxitos en esta nueva etapa con nosotros!</p>'}
            </div>${pie}
          </div>
        `;
    return { subject, html };
  }

  const subject = recordatorio
    ? `LOG&SER: RECORDATORIO — Documento pendiente de firma (${nombreDocumento})`
    : `LOG&SER: Documento pendiente de firma (${nombreDocumento}) — ${nombreTrabajador}`;
  const html = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #edf2f7;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.05)">
${encabezadoLogo('#000b59')}
            <div style="padding:24px;background:#ffffff">
              <h2 style="color:#000b59;margin:0 0 12px;font-size:1.3rem">${recordatorio ? 'Recordatorio de Firma' : 'Firma de Documento'}</h2>
              <p style="font-size:1.05rem;color:#2d3748">Hola <strong>${nombreTrabajador}</strong>,</p>
              <p style="color:#4a5568;line-height:1.6">${recordatorio
                ? 'Le recordamos que tiene un documento oficial pendiente que requiere su firma digital.'
                : 'Se ha generado un documento oficial que requiere su firma digital.'} Por favor haga clic en el siguiente enlace para revisarlo y firmarlo de forma segura:</p>

              <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:0.9rem">
                <tr style="background:#f7fafc"><td style="padding:10px;font-weight:bold;color:#4a5568;width:35%">Trabajador</td><td style="padding:10px">${nombreTrabajador} (${identificacion})</td></tr>
                <tr><td style="padding:10px;font-weight:bold;color:#4a5568">Cargo</td><td style="padding:10px">${cargo || '—'}</td></tr>
                <tr style="background:#f7fafc"><td style="padding:10px;font-weight:bold;color:#4a5568">Operación</td><td style="padding:10px">${operacion || '—'}</td></tr>
                <tr><td style="padding:10px;font-weight:bold;color:#4a5568">Documento</td><td style="padding:10px">${nombreDocumento}</td></tr>
              </table>

              <div style="text-align:center;margin:32px 0">
                <a href="${linkFirma}" target="_blank" style="background:#000b59;color:#ffffff;padding:14px 28px;text-decoration:none;font-weight:bold;border-radius:6px;display:inline-block;box-shadow:0 4px 6px rgba(0,11,89,0.15)">Ver y Firmar Documento</a>
              </div>

              <p style="font-size:0.85rem;color:#718096;line-height:1.4">Si el botón no funciona, copie y pegue este enlace en la barra de direcciones de su navegador:</p>
              <p style="font-size:0.85rem;color:#000b59;word-break:break-all">${linkFirma}</p>
            </div>${pie}
          </div>
        `;
  return { subject, html };
}

// Enlace de la Autorización de Descuento que acompaña al documento (solo si sigue sin firmar)
async function enlaceDescuentoPendiente(baseUrl, idDescuento) {
  if (!idDescuento) return null;
  const [rows] = await pool.execute(
    'SELECT id_descuento, token_firma FROM Dynamic_descuentonomina WHERE id_descuento = ? AND (url_doc IS NULL OR url_doc = \'\')',
    [idDescuento]
  );
  if (!rows.length || !rows[0].token_firma) return null;
  return `${baseUrl}/descuentonomina/firmar?item=${rows[0].id_descuento}&token=${rows[0].token_firma}`;
}

module.exports = { correoSolicitudFirma, enlaceDescuentoPendiente };
