const nodemailer = require('nodemailer');

const authConfig = process.env.SMTP_USER
  ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
  : undefined;

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth:   authConfig,
});

const HEADER = `
  <div style="border-top:5px solid #e67e22;background:#fff;padding:16px 24px;border-bottom:1px solid #eee">
    <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:44px" alt="LOG&amp;SER">
  </div>`;

const FOOTER = `
  <div style="padding:14px 24px;background:#f8f9fb;font-size:.78rem;color:#aaa;text-align:center">
    Sistema de Gestión Documental — LOG&amp;SER S.A.S.
  </div>`;

function formatFecha(val) {
  if (!val) return '';
  const s = typeof val === 'string' ? val : val.toISOString();
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function buildCC(emailUsuario) {
  return ['directorrh@logyser.com', 'gestor.nomina@logyser.com', 'admin@logyser.com', emailUsuario]
    .filter(Boolean).join(', ');
}

async function notificarNuevoTraslado({ trabajador, identificacion, operacionOrigen, operacionDestino, direccionDestino, fechaTraslado, horaTraslado, usuario, emailUsuario }) {
  const asunto = `Nuevo traslado pendiente de revisión — ${trabajador}`;

  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      ${HEADER}
      <div style="padding:24px;background:#fff;border:1px solid #eee">
        <h2 style="color:#1a1a2e;margin-top:0">Nuevo traslado registrado</h2>
        <p style="color:#555">Se ha registrado un nuevo traslado que requiere revisión y validación.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:.93rem">
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888;width:40%">Trabajador</td><td style="padding:8px 12px;font-weight:bold">${trabajador}</td></tr>
          <tr><td style="padding:8px 12px;color:#888">Identificación</td><td style="padding:8px 12px">${identificacion}</td></tr>
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888">Operación origen</td><td style="padding:8px 12px">${operacionOrigen || '—'}</td></tr>
          <tr><td style="padding:8px 12px;color:#888">Operación destino</td><td style="padding:8px 12px;font-weight:bold;color:#1a5fa8">${operacionDestino}</td></tr>
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888">Dirección destino</td><td style="padding:8px 12px">${direccionDestino || '—'}</td></tr>
          <tr><td style="padding:8px 12px;color:#888">Fecha de traslado</td><td style="padding:8px 12px">${formatFecha(fechaTraslado)}${horaTraslado ? ' — ' + horaTraslado : ''}</td></tr>
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888">Registrado por</td><td style="padding:8px 12px">${usuario}</td></tr>
        </table>
        <div style="margin-top:24px;padding:12px 16px;background:#fffbea;border-left:4px solid #f0d060;color:#7a6000;font-size:.88rem">
          Estado: <strong>Pendiente de revisión</strong>
        </div>
      </div>
      ${FOOTER}
    </div>`;

  await transporter.sendMail({
    from:    `"LOG&SER Documentos" <noreply@logyser.com>`,
    to:      'juridica@logyser.com, subgerenciaoperaciones@logyser.com',
    cc:      buildCC(emailUsuario),
    subject: asunto,
    html:    cuerpo,
  });
}

async function notificarFirmaTrabajador({ email, nombreCorto, operacionDestino, direccionDestino, fechaTraslado, horaTraslado, urlFirma, emailUsuario }) {
  const asunto = 'Documento de traslado laboral pendiente de firma — LOG&SER';

  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:24px">
      <div style="border-top:5px solid #e67e22;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&SER">
      </div>
      <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:1.2rem">Hola, ${nombreCorto}</h2>
        <p style="color:#555;margin:0 0 24px;font-size:.95rem;line-height:1.6">
          Le informamos que tiene un <strong>documento de traslado laboral</strong> pendiente de su firma digital.
          Por favor revise los detalles y firme a la brevedad.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:.9rem;margin-bottom:28px">
          <tr>
            <td style="background:#f8f9fb;padding:10px 14px;color:#888;width:40%">Operación destino</td>
            <td style="background:#f8f9fb;padding:10px 14px;font-weight:700;color:#1a1a2e">${operacionDestino}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;color:#888;border-top:1px solid #f0f0f0">Dirección</td>
            <td style="padding:10px 14px;border-top:1px solid #f0f0f0">${direccionDestino || '—'}</td>
          </tr>
          <tr>
            <td style="background:#f8f9fb;padding:10px 14px;color:#888;border-top:1px solid #f0f0f0">Fecha de traslado</td>
            <td style="background:#f8f9fb;padding:10px 14px;border-top:1px solid #f0f0f0">${formatFecha(fechaTraslado)}${horaTraslado ? ' — ' + horaTraslado : ''}</td>
          </tr>
        </table>
        <div style="text-align:center;margin-bottom:28px">
          <a href="${urlFirma}"
             style="display:inline-block;background:#e67e22;color:#fff;text-decoration:none;
                    padding:14px 36px;border-radius:7px;font-size:1rem;font-weight:700;letter-spacing:.3px">
            ✍️ Firmar documento ahora
          </a>
        </div>
        <div style="background:#fffbea;border-left:4px solid #f0d060;padding:12px 16px;border-radius:0 4px 4px 0;font-size:.83rem;color:#7a6000;margin-bottom:24px">
          ⚠️ Este enlace tiene una validez de <strong>48 horas</strong>. Si no puede acceder, comuníquese con su coordinador.
        </div>
        <p style="color:#aaa;font-size:.78rem;margin:0;line-height:1.6">
          Si el botón no funciona, copie y pegue este enlace en su navegador:<br>
          <span style="color:#1a5fa8;word-break:break-all">${urlFirma}</span>
        </p>
      </div>
      <p style="text-align:center;color:#bbb;font-size:.75rem;margin-top:16px">
        Sistema de Gestión Documental — LOG&amp;SER S.A.S. · NIT 900.318.733-1
      </p>
    </div>`;

  const ccFirma = ['juridica@logyser.com', 'subgerenciaoperaciones@logyser.com',
    'directorrh@logyser.com', 'gestor.nomina@logyser.com', 'admin@logyser.com', emailUsuario]
    .filter(Boolean).join(', ');

  await transporter.sendMail({
    from:    `"LOG&SER Documentos" <noreply@logyser.com>`,
    to:      email,
    cc:      ccFirma,
    subject: asunto,
    html:    cuerpo,
  });
}

async function notificarDocumentoGenerado({ nombreTrabajador, operacionDestino, direccionDestino, fechaTraslado, horaTraslado, urlDoc, emailUsuario }) {
  const asunto = `Traslado firmado y completado — ${nombreTrabajador}`;

  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      ${HEADER}
      <div style="padding:24px;background:#fff;border:1px solid #eee">
        <div style="display:inline-block;background:#eafaf1;border:1px solid #6dcf9e;border-radius:6px;padding:8px 16px;margin-bottom:20px">
          <span style="color:#1a7a4a;font-weight:700;font-size:.9rem">✅ Proceso completado</span>
        </div>
        <h2 style="color:#1a1a2e;margin:0 0 8px">Traslado firmado exitosamente</h2>
        <p style="color:#555;margin:0 0 20px;line-height:1.6">
          El trabajador ha firmado el documento de traslado. El proceso ha concluido satisfactoriamente.
          El documento ya se encuentra disponible en la <strong>carpeta digital del empleado</strong>.
          Solo queda que el trabajador se presente en la hora y lugar indicado.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:.93rem;margin-bottom:24px">
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888;width:40%">Trabajador</td><td style="padding:8px 12px;font-weight:bold">${nombreTrabajador}</td></tr>
          <tr><td style="padding:8px 12px;color:#888">Operación destino</td><td style="padding:8px 12px;font-weight:bold;color:#1a5fa8">${operacionDestino}</td></tr>
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888">Dirección</td><td style="padding:8px 12px">${direccionDestino || '—'}</td></tr>
          <tr><td style="padding:8px 12px;color:#888">Fecha de presentación</td><td style="padding:8px 12px;font-weight:bold">${formatFecha(fechaTraslado)}${horaTraslado ? ' — ' + horaTraslado : ''}</td></tr>
        </table>
        <div style="text-align:center;margin-bottom:20px">
          <a href="${urlDoc}"
             style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;
                    padding:12px 32px;border-radius:7px;font-size:.95rem;font-weight:700">
            📄 Ver documento firmado
          </a>
        </div>
        <div style="background:#eaf3ff;border-left:4px solid #7ab3f0;padding:12px 16px;border-radius:0 4px 4px 0;font-size:.83rem;color:#1a5fa8">
          El documento PDF firmado está disponible en la carpeta digital del empleado en TalentHub.
        </div>
      </div>
      ${FOOTER}
    </div>`;

  const ccList = ['directorrh@logyser.com', 'gestor.nomina@logyser.com', 'admin@logyser.com', emailUsuario]
    .filter(Boolean).join(', ');

  await transporter.sendMail({
    from:    `"LOG&SER Documentos" <noreply@logyser.com>`,
    to:      'juridica@logyser.com, subgerenciaoperaciones@logyser.com',
    cc:      ccList,
    subject: asunto,
    html:    cuerpo,
  });
}

module.exports = { notificarNuevoTraslado, notificarFirmaTrabajador, notificarDocumentoGenerado };
