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

// Interceptor global para limpiar la identificación del trabajador (ej. "12345678 ** NOMBRE")
// de los asuntos y cuerpos de los correos electrónicos antes de ser enviados.
const originalSendMail = transporter.sendMail.bind(transporter);
transporter.sendMail = function (mailOptions, callback) {
  if (mailOptions) {
    const cleanRegex = /\b\d{5,15}\s+\*\*\s+([^<\r\n]+)\b/g;
    if (typeof mailOptions.subject === 'string') {
      mailOptions.subject = mailOptions.subject.replace(cleanRegex, '$1');
    }
    if (typeof mailOptions.html === 'string') {
      mailOptions.html = mailOptions.html.replace(cleanRegex, '$1');
    }
    if (typeof mailOptions.text === 'string') {
      mailOptions.text = mailOptions.text.replace(cleanRegex, '$1');
    }
  }
  return originalSendMail(mailOptions, callback);
};

const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@logyser.com';

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

const CARGOS_GESTION_CALIDAD = [
  'COORDINADOR LOGISTICO',
  'AUXILIAR ADMINISTRATIVO DE OPERACIÓN',
  'AUXILIAR ADMINISTRATIVO REGIONAL',
  'COORDINADOR REGIONAL',
];

function ccTraslado(emailUsuario, cargo) {
  const base = ['admin@logyser.com', emailUsuario];
  if (cargo && CARGOS_GESTION_CALIDAD.includes((cargo).trim().toUpperCase())) {
    base.push('gestioncalidad@logyser.com');
    base.push('directorrh@logyser.com');
  }
  return [...new Set(base.filter(Boolean))].join(', ');
}

async function notificarNuevoTraslado({ trabajador, identificacion, operacionOrigen, operacionDestino, direccionDestino, fechaTraslado, horaTraslado, usuario, emailUsuario, observaciones, cargo }) {
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
          ${observaciones ? `<tr><td style="padding:8px 12px;color:#888;vertical-align:top">Observaciones</td><td style="padding:8px 12px">${observaciones}</td></tr>` : ''}
        </table>
        <div style="margin-top:24px;padding:12px 16px;background:#fffbea;border-left:4px solid #f0d060;color:#7a6000;font-size:.88rem">
          Estado: <strong>Pendiente de revisión</strong>
        </div>
      </div>
      ${FOOTER}
    </div>`;

  await transporter.sendMail({
    from:    `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to:      'juridica@logyser.com',
    cc:      ccTraslado(emailUsuario, cargo),
    subject: asunto,
    html:    cuerpo,
  });
}

async function notificarFirmaTrabajador({ email, nombreCorto, operacionDestino, direccionDestino, fechaTraslado, horaTraslado, urlFirma, emailUsuario, cargo, ccExtra }) {
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

  const ccFirma = ['juridica@logyser.com', 'admin@logyser.com', emailUsuario, ...(Array.isArray(ccExtra) ? ccExtra : [])];
  if (cargo && CARGOS_GESTION_CALIDAD.includes((cargo).trim().toUpperCase())) {
    ccFirma.push('gestioncalidad@logyser.com');
    ccFirma.push('directorrh@logyser.com');
  }

  await transporter.sendMail({
    from:    `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to:      email,
    cc:      [...new Set(ccFirma.filter(Boolean))].join(', '),
    subject: asunto,
    html:    cuerpo,
  });
}

// ── Notificación de firma de Acta de Entrega ─────────────────────────────────

async function notificarActaFirma({ email, nombreTrabajador, categoria, urlFirma }) {
  const asunto = `Acta de entrega pendiente de firma — ${categoria}`;

  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:24px">
      <div style="border-top:5px solid #e67e22;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&SER">
      </div>
      <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:1.2rem">Hola, ${nombreTrabajador}</h2>
        <p style="color:#555;margin:0 0 24px;font-size:.95rem;line-height:1.6">
          Le informamos que tiene un <strong>Acta de entrega de ${categoria}</strong> pendiente de su firma digital.
          Por favor revise los detalles y firme a la brevedad.
        </p>
        <div style="text-align:center;margin-bottom:28px">
          <a href="${urlFirma}"
             style="display:inline-block;background:#e67e22;color:#fff;text-decoration:none;
                    padding:14px 36px;border-radius:7px;font-size:1rem;font-weight:700;letter-spacing:.3px">
            ✍️ Firmar Acta de Entrega
          </a>
        </div>
        <div style="background:#fffbea;border-left:4px solid #f0d060;padding:12px 16px;border-radius:0 4px 4px 0;font-size:.83rem;color:#7a6000;margin-bottom:24px">
          ⚠️ Este enlace tiene una validez de <strong>48 horas</strong>.
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

  await transporter.sendMail({
    from:    `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to:      email,
    subject: asunto,
    html:    cuerpo,
  });
}

// ── Notificación de Dotación de Ley (tallas registradas) ──────────────────────

async function notificarDotacionLey({ email, nombreTrabajador, tallas = {} }) {
  const asunto = 'Entrega de Dotación de Ley — Verifica tus tallas registradas';

  const filaTalla = (label, val) => val
    ? `<tr><td style="padding:6px 10px;color:#777;font-size:.85rem">${label}</td><td style="padding:6px 10px;font-weight:700;color:#1a1a2e;font-size:.85rem">${val}</td></tr>`
    : '';

  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:24px">
      ${HEADER}
      <div style="background:#fff;padding:32px 28px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:1.2rem">Hola, ${nombreTrabajador}</h2>
        <p style="color:#555;margin:0 0 20px;font-size:.95rem;line-height:1.6">
          Te informamos que en el mes actual te será entregada la <strong>dotación de ley</strong>,
          con las siguientes tallas registradas en nuestro sistema:
        </p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;background:#f8f9fb;border-radius:8px;overflow:hidden">
          ${filaTalla('Pantalón', tallas.pantalon)}
          ${filaTalla('Botas', tallas.botas)}
          ${filaTalla('Camisa / Camiseta', tallas.camiseta)}
          ${filaTalla('Número de Buzo', tallas.numero)}
        </table>
        <p style="color:#555;margin:0 0 20px;font-size:.9rem;line-height:1.6">
          Si alguna talla no corresponde, o si deseas actualizar tus datos bancarios y de contacto
          (celular y correo electrónico), por favor ingresa al siguiente enlace para modificarlos:
        </p>
        <div style="text-align:center;margin-bottom:8px">
          <a href="https://digital.logyser.com/actualizardatos"
             style="display:inline-block;background:#e67e22;color:#fff;text-decoration:none;
                    padding:14px 36px;border-radius:7px;font-size:1rem;font-weight:700;letter-spacing:.3px">
            Actualizar mis datos
          </a>
        </div>
      </div>
      ${FOOTER}
    </div>`;

  await transporter.sendMail({
    from:    `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to:      email,
    subject: asunto,
    html:    cuerpo,
  });
}

async function notificarDocumentoGenerado({ nombreTrabajador, operacionDestino, direccionDestino, fechaTraslado, horaTraslado, urlDoc, emailUsuario, cargo, ccExtra }) {
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

  const ccList = [
    'gestor.nomina@logyser.com',
    'admin@logyser.com',
    'seleccion@logyser.com',
    'contratacionnacional@logyser.com',
    'sstadmon@logyser.com',
    'logyserinventarios@gmail.com',
    'auxiliarcompras@logyser.com',
    emailUsuario,
    ...(Array.isArray(ccExtra) ? ccExtra : [])
  ];
  if (cargo && CARGOS_GESTION_CALIDAD.includes((cargo).trim().toUpperCase())) {
    ccList.push('gestioncalidad@logyser.com');
    ccList.push('directorrh@logyser.com');
  }

  await transporter.sendMail({
    from:    `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to:      'juridica@logyser.com, subgerenciaoperaciones@logyser.com',
    cc:      [...new Set(ccList.filter(Boolean))].join(', '),
    subject: asunto,
    html:    cuerpo,
  });
}

// ── Notificación de retiro ───────────────────────────────────────────────────

const CARGOS_ADMIN = [
  'AUXILIAR ADMINISTRATIVO DE OPERACIÓN',
  'AUXILIAR ADMINISTRATIVO REGIONAL',
  'COORDINADOR LOGISTICO',
  'COORDINADOR REGIONAL',
  'SUBGERENTE DE OPERACIONES',
];
const CARGOS_SST = ['ANALISTA DE SST', 'AUXILIAR SST'];

const CC_ADMIN = [
  'jefe.facturacion@logyser.com',
  'jefe.contabilidad@logyser.com',
  'gestioncalidad@logyser.com',
  'controlcuentas@logyser.com',
  'directorrh@logyser.com',
  'subgerenciaoperaciones@logyser.com',
  'administradorti@logyser.com',
  'nomina@logyser.com',
  'seleccion@logyser.com',
];
const CC_SST = ['sstadmon@logyser.com'];

const ID_RETIRO_EXCLUIDO = 1117517812;

async function notificarRetiro({
  trabajador, identificacion, cargo, operacion,
  fechaRetiro, motivoRetiro, registradoPor, emailRegistrador,
}) {
  if (Number(identificacion) === ID_RETIRO_EXCLUIDO) return;

  const cargoNorm = (cargo || '').trim().toUpperCase();
  const ccBase    = ['admin@logyser.com', emailRegistrador].filter(Boolean);
  const ccExtra   = CARGOS_ADMIN.includes(cargoNorm) ? CC_ADMIN
                  : CARGOS_SST.includes(cargoNorm)   ? CC_SST
                  : [];
  const cc = [...new Set([...ccBase, ...ccExtra])].join(', ');

  const asunto = `Retiro de personal — ${trabajador}`;

  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="border-top:5px solid #c0392b;background:#fff;padding:16px 24px;border-bottom:1px solid #eee">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:44px" alt="LOG&amp;SER">
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #eee">

        <div style="display:inline-block;background:#fdf0f0;border:1px solid #f5c6c6;
                    border-radius:6px;padding:6px 16px;margin-bottom:18px">
          <span style="color:#c0392b;font-weight:bold;font-size:.88rem">
            &#9679; RETIRO DE PERSONAL
          </span>
        </div>

        <h2 style="color:#1a1a2e;margin:0 0 6px">Retiro registrado en el sistema</h2>
        <p style="color:#555;margin:0 0 20px;font-size:.92rem;line-height:1.5">
          Se ha registrado la novedad de retiro de un colaborador.
          A continuación los datos del proceso:
        </p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:.93rem">
          <tr style="background:#f8f9fb">
            <td style="padding:9px 12px;color:#888;width:38%">Trabajador</td>
            <td style="padding:9px 12px;font-weight:bold">${trabajador}</td>
          </tr>
          <tr>
            <td style="padding:9px 12px;color:#888">Identificación</td>
            <td style="padding:9px 12px">${identificacion}</td>
          </tr>
          <tr style="background:#f8f9fb">
            <td style="padding:9px 12px;color:#888">Cargo</td>
            <td style="padding:9px 12px">${cargo || '—'}</td>
          </tr>
          <tr>
            <td style="padding:9px 12px;color:#888">Operación</td>
            <td style="padding:9px 12px">${operacion || '—'}</td>
          </tr>
          <tr style="background:#f8f9fb">
            <td style="padding:9px 12px;color:#888">Fecha de retiro</td>
            <td style="padding:9px 12px;font-weight:bold">${formatFecha(fechaRetiro)}</td>
          </tr>
          <tr>
            <td style="padding:9px 12px;color:#888">Motivo del retiro</td>
            <td style="padding:9px 12px;font-weight:bold;color:#c0392b">${motivoRetiro || '—'}</td>
          </tr>
          <tr style="background:#f8f9fb">
            <td style="padding:9px 12px;color:#888">Registrado por</td>
            <td style="padding:9px 12px">${registradoPor || '—'}</td>
          </tr>
        </table>

        <div style="padding:11px 16px;background:#fdf0f0;border-left:4px solid #c0392b;
                    border-radius:0 4px 4px 0;color:#7b241c;font-size:.88rem">
          Estado: <strong>Retirado</strong>
        </div>
      </div>
      ${FOOTER}
    </div>`;

  await transporter.sendMail({
    from:    `"LOG&SER Notificaciones" <${EMAIL_FROM}>`,
    to:      'retiros@logyser.com',
    cc,
    subject: asunto,
    html:    cuerpo,
  });
}

async function notificarFirmaRenuncia({ emailTrabajador, nombreTrabajador, urlFirma }) {
  const asunto = 'Aceptación de renuncia — Pendiente de su firma — LOG&SER';
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:24px">
      <div style="border-top:5px solid #c0392b;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&amp;SER">
      </div>
      <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:1.2rem">Hola, ${nombreTrabajador}</h2>
        <p style="color:#555;margin:0 0 24px;font-size:.95rem;line-height:1.6">
          Le informamos que tiene un <strong>documento de aceptación de renuncia</strong> pendiente de su firma digital.
          Por favor revise el documento y firme a la brevedad.
        </p>
        <div style="text-align:center;margin-bottom:28px">
          <a href="${urlFirma}"
             style="display:inline-block;background:#c0392b;color:#fff;text-decoration:none;
                    padding:14px 36px;border-radius:7px;font-size:1rem;font-weight:700;letter-spacing:.3px">
            ✍️ Revisar y firmar documento
          </a>
        </div>
        <div style="background:#fffbea;border-left:4px solid #f0d060;padding:12px 16px;border-radius:0 4px 4px 0;font-size:.83rem;color:#7a6000;margin-bottom:24px">
          ⚠️ Este enlace tiene una validez de <strong>48 horas</strong>. Si no puede acceder, comuníquese con el área de Recursos Humanos.
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

  await transporter.sendMail({
    from:    `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to:      emailTrabajador,
    subject: asunto,
    html:    cuerpo,
  });
}

async function notificarRenunciaFirmada({ nombreTrabajador, identificacion, urlDoc }) {
  const asunto = `Aceptación de renuncia firmada — ${nombreTrabajador}`;
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      ${HEADER}
      <div style="padding:24px;background:#fff;border:1px solid #eee">
        <div style="display:inline-block;background:#eafaf1;border:1px solid #6dcf9e;border-radius:6px;padding:8px 16px;margin-bottom:20px">
          <span style="color:#1a7a4a;font-weight:700;font-size:.9rem">✅ Documento firmado</span>
        </div>
        <h2 style="color:#1a1a2e;margin:0 0 8px">Aceptación de renuncia completada</h2>
        <p style="color:#555;margin:0 0 20px;line-height:1.6">
          El trabajador ha firmado digitalmente el documento de Aceptación de Renuncia.
          El PDF ya se encuentra disponible en la carpeta digital del empleado.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:.93rem;margin-bottom:24px">
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888;width:40%">Trabajador</td><td style="padding:8px 12px;font-weight:bold">${nombreTrabajador}</td></tr>
          <tr><td style="padding:8px 12px;color:#888">Identificación</td><td style="padding:8px 12px">${identificacion}</td></tr>
        </table>
        <div style="text-align:center;margin-bottom:20px">
          <a href="${urlDoc}"
             style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;
                    padding:12px 32px;border-radius:7px;font-size:.95rem;font-weight:700">
            📄 Ver documento firmado
          </a>
        </div>
      </div>
      ${FOOTER}
    </div>`;

  await transporter.sendMail({
    from:    `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to:      'retiros@logyser.com',
    cc:      'directorrh@logyser.com, gestor.nomina@logyser.com, admin@logyser.com',
    subject: asunto,
    html:    cuerpo,
  });
}

// ── Notificación de nuevo ingreso ────────────────────────────────────────────

// Grupo 1 (Config_Cargo_Laboral.Notificar = 1)
const DESTINATARIOS_INGRESO = [
  'nomina@logyser.com',
  'jefe.facturacion@logyser.com',
  'jefe.contabilidad@logyser.com',
  'administradorti@logyser.com',
  'subgerenciaoperaciones@logyser.com',
  'sst.nacional@logyser.com',
  'sstadmon@logyser.com',
  'seleccion@logyser.com',
  'auxiliarcompras@logyser.com',
  'controlcuentas@logyser.com',
  'directorrh@logyser.com',
  'gestioncalidad@logyser.com',
];

// Grupo 2 (Config_Cargo_Laboral.Notificar = 2)
const DESTINATARIOS_INGRESO_REDUCIDO = [
  'nomina@logyser.com',
  'administradorti@logyser.com',
  'subgerenciaoperaciones@logyser.com',
  'sst.nacional@logyser.com',
  'sstadmon@logyser.com',
  'seleccion@logyser.com',
  'directorrh@logyser.com',
  'gestioncalidad@logyser.com',
];

async function notificarIngreso({ trabajador, identificacion, cargo, operacion, fechaIngreso, destinatarios }) {
  const HEADER_VERDE = `
    <div style="border-top:5px solid #27ae60;background:#fff;padding:16px 24px;border-bottom:1px solid #eee">
      <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:44px" alt="LOG&amp;SER">
    </div>`;

  const asunto = `Nuevo ingreso de personal — ${trabajador}`;

  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      ${HEADER_VERDE}
      <div style="padding:24px;background:#fff;border:1px solid #eee">

        <div style="display:inline-block;background:#eafaf1;border:1px solid #a9dfbf;
                    border-radius:6px;padding:6px 16px;margin-bottom:18px">
          <span style="color:#1e8449;font-weight:bold;font-size:.88rem">
            &#9679; NUEVO INGRESO DE PERSONAL
          </span>
        </div>

        <h2 style="color:#1a1a2e;margin:0 0 6px">Nuevo colaborador registrado en el sistema</h2>
        <p style="color:#555;margin:0 0 20px;font-size:.92rem;line-height:1.5">
          Se ha registrado el ingreso de un nuevo colaborador.
          A continuación los datos del proceso:
        </p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:.93rem">
          <tr style="background:#f8f9fb">
            <td style="padding:9px 12px;color:#888;width:38%">Trabajador</td>
            <td style="padding:9px 12px;font-weight:bold">${trabajador}</td>
          </tr>
          <tr>
            <td style="padding:9px 12px;color:#888">Identificación</td>
            <td style="padding:9px 12px">${identificacion}</td>
          </tr>
          <tr style="background:#f8f9fb">
            <td style="padding:9px 12px;color:#888">Cargo</td>
            <td style="padding:9px 12px;font-weight:bold;color:#1e8449">${cargo || '—'}</td>
          </tr>
          <tr>
            <td style="padding:9px 12px;color:#888">Operación</td>
            <td style="padding:9px 12px">${operacion || '—'}</td>
          </tr>
          <tr style="background:#f8f9fb">
            <td style="padding:9px 12px;color:#888">Fecha de ingreso</td>
            <td style="padding:9px 12px;font-weight:bold">${formatFecha(fechaIngreso)}</td>
          </tr>
        </table>

        <div style="padding:14px 16px;background:#eafaf1;border-left:4px solid #27ae60;
                    border-radius:0 4px 4px 0;color:#1e6f3e;font-size:.9rem;line-height:1.6">
          <strong>&#128218; Recordatorio de capacitación</strong><br>
          Si corresponde según el cargo y área, recuerde programar la capacitación de inducción
          para este nuevo colaborador a la brevedad posible.
        </div>

      </div>
      ${FOOTER}
    </div>`;

  const destino = (destinatarios && destinatarios.length) ? destinatarios : DESTINATARIOS_INGRESO;

  await transporter.sendMail({
    from:    `"LOG&SER Notificaciones" <${EMAIL_FROM}>`,
    to:      destino.join(', '),
    subject: asunto,
    html:    cuerpo,
  });
}

// ── Paz y Salvo: notificación al trabajador ──────────────────────────────────

async function notificarPazYSalvoTrabajador({ emailTrabajador, celularTrabajador, trabajador, identificacion, cargo, operacion, urlFirma }) {
  const asunto = 'Paz y Salvo pendiente de firma — LOG&SER';

  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:24px">
      <div style="border-top:5px solid #c0392b;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&SER">
      </div>
      <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:1.2rem">Estimado/a ${trabajador.split(' ')[0]},</h2>
        <p style="color:#555;margin:0 0 24px;font-size:.95rem;line-height:1.6">
          Tiene un <strong>Paz y Salvo de retiro</strong> pendiente de su firma digital.
          Por favor revise el documento y fírmelo a la brevedad para completar su proceso de retiro.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:.9rem;margin-bottom:28px">
          <tr><td style="background:#f8f9fb;padding:10px 14px;color:#888;width:40%">Trabajador</td><td style="background:#f8f9fb;padding:10px 14px;font-weight:700">${trabajador}</td></tr>
          <tr><td style="padding:10px 14px;color:#888;border-top:1px solid #f0f0f0">Identificación</td><td style="padding:10px 14px;border-top:1px solid #f0f0f0">${identificacion}</td></tr>
          <tr><td style="background:#f8f9fb;padding:10px 14px;color:#888;border-top:1px solid #f0f0f0">Cargo</td><td style="background:#f8f9fb;padding:10px 14px;border-top:1px solid #f0f0f0">${cargo}</td></tr>
          <tr><td style="padding:10px 14px;color:#888;border-top:1px solid #f0f0f0">Operación</td><td style="padding:10px 14px;border-top:1px solid #f0f0f0">${operacion}</td></tr>
        </table>
        <div style="text-align:center;margin-bottom:28px">
          <a href="${urlFirma}"
             style="display:inline-block;background:#c0392b;color:#fff;text-decoration:none;
                    padding:14px 36px;border-radius:7px;font-size:1rem;font-weight:700;letter-spacing:.3px">
            ✍️ Revisar y firmar Paz y Salvo
          </a>
        </div>
        <div style="background:#fffbea;border-left:4px solid #f0d060;padding:12px 16px;border-radius:0 4px 4px 0;font-size:.83rem;color:#7a6000;margin-bottom:24px">
          ⚠️ Este enlace tiene una validez de <strong>120 horas</strong>. Si no puede acceder, comuníquese con el área de Recursos Humanos.
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

  await transporter.sendMail({
    from:    `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to:      emailTrabajador,
    subject: asunto,
    html:    cuerpo,
  });
}

// ── Paz y Salvo: notificación a área para firma ──────────────────────────────

const NOMBRES_AREA = {
  tecnologia:    'Tecnología',
  nomina:        'Nómina',
  sst:           'SST',
  facturacion:   'Facturación',
  contabilidad:  'Contabilidad',
  cuentas:       'Cuentas por Pagar',
  gerencia:      'Gerencia de Operaciones',
};

async function notificarAreaPazYSalvo({ area, destinatarios, trabajador, identificacion, cargo, operacion, urlFirma }) {
  const nombreArea = NOMBRES_AREA[area] || area;
  const asunto = `Paz y Salvo pendiente de validación — ${nombreArea} — ${trabajador}`;

  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:24px">
      <div style="border-top:5px solid #c0392b;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:44px" alt="LOG&SER">
      </div>
      <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <div style="display:inline-block;background:#fdf2f2;border:1px solid #e8b4b4;border-radius:6px;padding:6px 16px;margin-bottom:18px">
          <span style="color:#c0392b;font-weight:bold;font-size:.88rem">● PAZ Y SALVO — ${nombreArea.toUpperCase()}</span>
        </div>
        <h2 style="color:#1a1a2e;margin:0 0 8px">Validación de Paz y Salvo requerida</h2>
        <p style="color:#555;margin:0 0 24px;font-size:.95rem;line-height:1.6">
          El siguiente colaborador ha completado su proceso de retiro y requiere la validación de paz y salvo
          del área de <strong>${nombreArea}</strong>.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:.9rem;margin-bottom:28px">
          <tr><td style="background:#f8f9fb;padding:10px 14px;color:#888;width:40%">Trabajador</td><td style="background:#f8f9fb;padding:10px 14px;font-weight:700">${trabajador}</td></tr>
          <tr><td style="padding:10px 14px;color:#888;border-top:1px solid #f0f0f0">Identificación</td><td style="padding:10px 14px;border-top:1px solid #f0f0f0">${identificacion}</td></tr>
          <tr><td style="background:#f8f9fb;padding:10px 14px;color:#888;border-top:1px solid #f0f0f0">Cargo</td><td style="background:#f8f9fb;padding:10px 14px;border-top:1px solid #f0f0f0">${cargo}</td></tr>
          <tr><td style="padding:10px 14px;color:#888;border-top:1px solid #f0f0f0">Operación</td><td style="padding:10px 14px;border-top:1px solid #f0f0f0">${operacion}</td></tr>
        </table>
        <div style="text-align:center;margin-bottom:28px">
          <a href="${urlFirma}"
             style="display:inline-block;background:#c0392b;color:#fff;text-decoration:none;
                    padding:14px 36px;border-radius:7px;font-size:1rem;font-weight:700;letter-spacing:.3px">
            ✅ Validar y firmar Paz y Salvo
          </a>
        </div>
        <div style="background:#fffbea;border-left:4px solid #f0d060;padding:12px 16px;border-radius:0 4px 4px 0;font-size:.83rem;color:#7a6000;margin-bottom:24px">
          ⚠️ Este enlace tiene una validez de <strong>120 horas</strong>. Si no puede acceder, comuníquese con el área de Recursos Humanos.
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

  await transporter.sendMail({
    from:    `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to:      destinatarios.join(', '),
    subject: asunto,
    html:    cuerpo,
  });
}

// ── Paz y Salvo: notificación de completado ──────────────────────────────────

async function notificarPazYSalvoCompletado({ trabajador, identificacion, cargo, operacion, urlDoc }) {
  const asunto = `Paz y Salvo completado — ${trabajador}`;
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      ${HEADER}
      <div style="padding:24px;background:#fff;border:1px solid #eee">
        <div style="display:inline-block;background:#eafaf1;border:1px solid #6dcf9e;border-radius:6px;padding:8px 16px;margin-bottom:20px">
          <span style="color:#1a7a4a;font-weight:700;font-size:.9rem">✅ Paz y Salvo completado</span>
        </div>
        <h2 style="color:#1a1a2e;margin:0 0 8px">Paz y Salvo firmado por todas las partes</h2>
        <p style="color:#555;margin:0 0 20px;line-height:1.6">
          El documento de Paz y Salvo ha sido firmado por el trabajador y todas las áreas requeridas.
          El PDF final ya se encuentra disponible en la carpeta digital del empleado.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:.93rem;margin-bottom:24px">
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888;width:40%">Trabajador</td><td style="padding:8px 12px;font-weight:bold">${trabajador}</td></tr>
          <tr><td style="padding:8px 12px;color:#888">Identificación</td><td style="padding:8px 12px">${identificacion}</td></tr>
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888">Cargo</td><td style="padding:8px 12px">${cargo}</td></tr>
          <tr><td style="padding:8px 12px;color:#888">Operación</td><td style="padding:8px 12px">${operacion}</td></tr>
        </table>
        <div style="text-align:center;margin-bottom:20px">
          <a href="${urlDoc}"
             style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;
                    padding:12px 32px;border-radius:7px;font-size:.95rem;font-weight:700">
            📄 Ver Paz y Salvo final
          </a>
        </div>
      </div>
      ${FOOTER}
    </div>`;

  await transporter.sendMail({
    from:    `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to:      'retiros@logyser.com',
    cc:      'directorrh@logyser.com, gestor.nomina@logyser.com, admin@logyser.com',
    subject: asunto,
    html:    cuerpo,
  });
}

// ── Notificación unificada al trabajador (retiro) ───────────────────────────

async function notificarDocumentoRetiroTrabajador({
  emailTrabajador, nombreTrabajador, responsableNombre, responsableCargo,
  urlPZ, urlAR, urlCert, urlEMOE, urlCRS, urlEVR, urlTCR, urlED,
  motivoRetiro, tipoRenuncia, emailUsuario,
}) {
  const esRenuncia = motivoRetiro === 'Renuncia';
  const detalleMotivo = esRenuncia && tipoRenuncia
    ? `${motivoRetiro} (${tipoRenuncia})`
    : (motivoRetiro || 'No informado');
  const asunto = 'Documentación de retiro y proceso de liquidación — LOG&SER S.A.S.';

  // Lista de documentos (enlaces de firma)
  const docsItems = [
    urlCert  ? `<li>📄 <a href="${urlCert}" style="color:#1a5fa8">Certificado Laboral</a></li>`                               : '',
    urlEMOE  ? `<li>📄 <a href="${urlEMOE}" style="color:#1a5fa8">Autorización para Examen Médico de Egreso</a></li>`        : '',
    urlCRS   ? `<li>📄 <a href="${urlCRS}"  style="color:#1a5fa8">Autorización de retiro de cesantías</a></li>`              : '',
    (esRenuncia && urlAR) ? `<li>📄 <a href="${urlAR}" style="color:#1a5fa8">Aceptación de su renuncia</a></li>`             : '',
    (esRenuncia && urlTCR) ? `<li>📎 <a href="${urlTCR}" style="color:#1a5fa8">Carta de renuncia</a></li>`                   : '',
    (!esRenuncia && urlTCR) ? `<li>📎 <a href="${urlTCR}" style="color:#1a5fa8">Terminación de contrato</a></li>`           : '',
    urlED ? `<li>📎 <a href="${urlED}" style="color:#1a5fa8">Evaluación de desempeño</a></li>`                               : '',
  ].filter(Boolean).join('\n');

  // Bloque Paz y Salvo (solo si hay enlace)
  const bloquePZ = urlPZ ? `
        <p style="color:#555;margin:0 0 8px;font-size:.93rem;line-height:1.6">
          Adicionalmente, para proceder con el trámite de su liquidación, es indispensable que realice la
          <strong>firma digital del Paz y Salvo</strong>:
        </p>
        <div style="text-align:center;margin:18px 0">
          <a href="${urlPZ}" style="display:inline-block;background:#c0392b;color:#fff;text-decoration:none;padding:13px 32px;border-radius:7px;font-size:.97rem;font-weight:700">
            ✍️ Firmar Paz y Salvo
          </a>
        </div>
        <p style="color:#aaa;font-size:.75rem;margin:4px 0 16px;word-break:break-all">Si el botón no funciona: <span style="color:#1a5fa8">${urlPZ}</span></p>` : '';

  // Bloque Evaluación de retiro (solo si hay enlace)
  const bloqueEVR = urlEVR ? `
        <p style="color:#555;margin:16px 0 8px;font-size:.93rem;line-height:1.6">
          También le invitamos a diligenciar la <strong>Evaluación de Retiro</strong> (no requiere firma,
          solo completar el formulario). Su retroalimentación es muy valiosa para nosotros:
        </p>
        <div style="text-align:center;margin:14px 0">
          <a href="${urlEVR}" style="display:inline-block;background:#8e44ad;color:#fff;text-decoration:none;padding:11px 28px;border-radius:7px;font-size:.92rem;font-weight:700">
            📝 Diligenciar Evaluación de Retiro
          </a>
        </div>
        <p style="color:#aaa;font-size:.75rem;margin:4px 0 16px;word-break:break-all">Si el botón no funciona: <span style="color:#1a5fa8">${urlEVR}</span></p>` : '';

  const hayAcciones = urlPZ || urlEVR;
  const avisoVigencia = hayAcciones ? `
        <div style="background:#fffbea;border-left:4px solid #f0d060;padding:12px 16px;border-radius:0 4px 4px 0;font-size:.83rem;color:#7a6000;margin:16px 0">
          ⚠️ Los enlaces tienen una validez de <strong>120 horas</strong>. Si no puede acceder, comuníquese con el área de Recursos Humanos.
        </div>` : '';

  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:24px">
      <div style="border-top:5px solid #c0392b;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&SER">
      </div>
      <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <p style="color:#555;margin:0 0 6px;font-size:.95rem">Cordial saludo, <strong>${nombreTrabajador}</strong></p>
        <p style="color:#555;margin:0 0 18px;font-size:.93rem;line-height:1.6">
          Por medio del presente, en representación de <strong>LOG&SER - Apoyo Logístico y Operativo S.A.S.</strong>,
          le hacemos entrega de los documentos correspondientes a la finalización de su vínculo laboral:
        </p>
        <div style="background:#f8f9fb;border-left:4px solid #1a1a2e;padding:10px 14px;font-size:.88rem;color:#444;margin:0 0 16px">
          Motivo de retiro: <strong>${detalleMotivo}</strong>
        </div>
        <ul style="color:#333;font-size:.92rem;line-height:2;padding-left:18px;margin:0 0 18px">
          ${docsItems}
        </ul>
        ${bloquePZ}
        ${bloqueEVR}
        ${avisoVigencia}
        <p style="color:#555;font-size:.9rem;line-height:1.6;margin:0 0 4px">
          Le agradecemos el tiempo dedicado a nuestra organización.
          La gestión oportuna de estos documentos permitirá que el área administrativa avance sin contratiempos con su liquidación definitiva.
        </p>
        <p style="color:#555;font-size:.9rem;margin:0 0 20px">Quedamos atentos a cualquier inquietud que pueda surgir.</p>
        <p style="color:#888;font-size:.85rem;margin:0">Atentamente,</p>
        <p style="color:#1a1a2e;font-weight:700;font-size:.92rem;margin:4px 0 0">${responsableNombre || ''}</p>
        <p style="color:#888;font-size:.82rem;margin:2px 0 0">${responsableCargo || ''}</p>
        <p style="color:#888;font-size:.82rem;margin:2px 0 0">LOG&SER - Apoyo Logístico y Operativo S.A.S.</p>
      </div>
      <p style="text-align:center;color:#bbb;font-size:.75rem;margin-top:16px">
        Sistema de Gestión Documental — LOG&amp;SER S.A.S. · NIT 900.318.733-1
      </p>
    </div>`;

  const ccRetiro = ['retiros@logyser.com', 'admin@logyser.com', 'gestor.nomina@logyser.com', 'nomina@logyser.com', emailUsuario].filter(Boolean).join(', ');

  await transporter.sendMail({
    from:    `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to:      emailTrabajador,
    cc:      ccRetiro,
    subject: asunto,
    html:    cuerpo,
  });
}

// ── Notificación automática: todos los documentos de retiro firmados ───────
async function notificarDocumentosRetiroConcluidos({
  emailTrabajador, nombreTrabajador, urlCT, urlAR, urlEMOE, urlCRS,
}) {
  const asunto = `Sus documentos de retiro están listos — ${nombreTrabajador}`;

  const items = [
    urlCT   ? `<li style="margin-bottom:10px">📄 <a href="${urlCT}" style="color:#1a5fa8;font-weight:bold">Certificado Laboral de Retiro</a></li>` : '',
    urlAR   ? `<li style="margin-bottom:10px">📄 <a href="${urlAR}" style="color:#1a5fa8;font-weight:bold">Carta de Aceptación de Renuncia</a></li>` : '',
    urlEMOE ? `<li style="margin-bottom:10px">📄 <a href="${urlEMOE}" style="color:#1a5fa8;font-weight:bold">Autorización Examen Médico de Egreso</a></li>` : '',
    urlCRS  ? `<li style="margin-bottom:10px">📄 <a href="${urlCRS}" style="color:#1a5fa8;font-weight:bold">Autorización Retiro de Cesantías</a></li>` : '',
  ].filter(Boolean).join('\n');

  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:24px">
      <div style="border-top:5px solid #27ae60;background:#fff;padding:16px 24px;border-bottom:1px solid #eee">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:44px" alt="LOG&amp;SER">
      </div>
      <div style="background:#fff;padding:32px 28px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <div style="display:inline-block;background:#eafaf1;border:1px solid #6dcf9e;border-radius:6px;padding:8px 16px;margin-bottom:20px">
          <span style="color:#1a7a4a;font-weight:700;font-size:.9rem">✅ Proceso de firma completado</span>
        </div>
        <h2 style="color:#1a1a2e;margin:0 0 12px;font-size:1.2rem">Sus documentos de retiro están disponibles</h2>
        <p style="color:#555;margin:0 0 20px;font-size:.93rem;line-height:1.6">
          Estimado/a <strong>${nombreTrabajador}</strong>, le informamos que el proceso de firma de sus documentos de retiro
          ha sido completado exitosamente. A continuación puede acceder a sus documentos firmados:
        </p>
        <ul style="padding-left:18px;margin:0 0 24px;font-size:.92rem;line-height:1.5">
          ${items}
        </ul>
        <div style="background:#f8f9fb;border-left:4px solid #1a1a2e;padding:12px 16px;font-size:.85rem;color:#555;margin-bottom:20px">
          Su <strong>Paz y Salvo</strong> se tramitará por separado. Será notificado/a cuando esté disponible para su firma.
        </div>
        <p style="color:#888;font-size:.85rem;margin:0;line-height:1.6">
          Si tiene alguna inquietud, comuníquese con el área de Recursos Humanos.<br>
          Correo: <a href="mailto:retiros@logyser.com" style="color:#1a5fa8">retiros@logyser.com</a>
        </p>
      </div>
      <p style="text-align:center;color:#bbb;font-size:.75rem;margin-top:16px">
        Sistema de Gestión Documental — LOG&amp;SER S.A.S. · NIT 900.318.733-1
      </p>
    </div>`;

  await transporter.sendMail({
    from:    `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to:      emailTrabajador,
    cc:      'retiros@logyser.com',
    subject: asunto,
    html:    cuerpo,
  });
}

// ── Notificaciones de Solicitudes de Inventario ──────────────────────────────

const SOLICITUD_ESTADO_CFG = {
  PENDIENTE:  { color: '#d97706', bg: '#fffbea', borde: '#f0d060', icono: '⏳', etiqueta: 'Pendiente de aprobación' },
  APROBADA:   { color: '#16a34a', bg: '#eafaf1', borde: '#6dcf9e', icono: '✅', etiqueta: 'Aprobada' },
  DESPACHADA: { color: '#2563eb', bg: '#eef4ff', borde: '#93c5fd', icono: '📦', etiqueta: 'Despachada' },
  PARCIAL:    { color: '#ea580c', bg: '#fff4ef', borde: '#fdba74', icono: '📦', etiqueta: 'Despacho Parcial' },
  COMPLETADA: { color: '#15803d', bg: '#eafaf1', borde: '#6dcf9e', icono: '✔️', etiqueta: 'Completada' },
  RECHAZADA:  { color: '#dc2626', bg: '#fdf0f0', borde: '#f5c6c6', icono: '❌', etiqueta: 'Rechazada' },
  CANCELADA:  { color: '#991b1b', bg: '#fdf0f0', borde: '#f5c6c6', icono: '🚫', etiqueta: 'Cancelada' },
};

async function notificarSolicitudCambioEstado({
  idSolicitud,
  operacion,
  regional,
  categoria,
  prioridad,
  estadoNuevo,
  estadoAnterior,
  fechaSolicitud,
  usuarioSolicitante,
  emailSolicitante,
  emailsAprobadores = [],
  items = [],
  observaciones = null,
  quienCambio = null,
}) {
  const est = SOLICITUD_ESTADO_CFG[estadoNuevo] || { color: '#555', bg: '#f9f9f9', borde: '#ddd', icono: '•', etiqueta: estadoNuevo };
  const esParaAprobadores = estadoNuevo === 'PENDIENTE';

  const destinatarios = esParaAprobadores
    ? emailsAprobadores.filter(Boolean).join(', ')
    : (emailSolicitante || '');
  const copia = esParaAprobadores
    ? (emailSolicitante || '')
    : emailsAprobadores.filter(Boolean).join(', ');

  if (!destinatarios) return;

  const asunto = `[${estadoNuevo}] Solicitud de ${categoria} — ${operacion}`;

  const itemsHTML = items.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:.88rem;margin-top:8px">
        <thead><tr style="background:#f0ecfa">
          <th style="padding:7px 10px;text-align:left;color:#5b2c8d;font-weight:600;border-bottom:2px solid #d6c5f0">Artículo</th>
          <th style="padding:7px 10px;text-align:center;color:#5b2c8d;font-weight:600;border-bottom:2px solid #d6c5f0;width:80px">Cant.</th>
        </tr></thead>
        <tbody>${items.map((item, i) => `
          <tr style="background:${i % 2 === 0 ? '#fff' : '#f8f9fb'}">
            <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0">${item.Articulo || item.articulo || '—'}</td>
            <td style="padding:7px 10px;text-align:center;font-weight:bold;border-bottom:1px solid #f0f0f0">${item.Cantidad || item.cantidad || 0}</td>
          </tr>`).join('')}
        </tbody>
      </table>`
    : '<p style="color:#aaa;font-size:.85rem;font-style:italic;margin:4px 0">Sin artículos registrados</p>';

  const tituloPrincipal = esParaAprobadores
    ? `Solicitud de ${categoria} requiere tu aprobación`
    : `Tu solicitud de ${categoria} ha sido actualizada`;

  const descripcion = esParaAprobadores
    ? `Se ha registrado una nueva solicitud de <strong>${categoria}</strong> que requiere revisión y aprobación.`
    : `El estado ha cambiado de <strong>${estadoAnterior || '—'}</strong> a <strong style="color:${est.color}">${est.etiqueta}</strong>.`;

  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="border-top:5px solid #8e44ad;background:#fff;padding:16px 24px;border-bottom:1px solid #eee">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:44px" alt="LOG&amp;SER">
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #eee">

        <div style="display:inline-block;background:${est.bg};border:1px solid ${est.borde};
                    border-radius:6px;padding:6px 16px;margin-bottom:18px">
          <span style="color:${est.color};font-weight:bold;font-size:.88rem">
            ${est.icono} ${est.etiqueta.toUpperCase()}
          </span>
        </div>

        <h2 style="color:#1a1a2e;margin:0 0 6px">${tituloPrincipal}</h2>
        <p style="color:#555;margin:0 0 20px;font-size:.92rem;line-height:1.5">${descripcion}</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:.93rem">
          <tr style="background:#f8f9fb">
            <td style="padding:9px 12px;color:#888;width:38%">Operación</td>
            <td style="padding:9px 12px;font-weight:bold">${operacion}</td>
          </tr>
          <tr>
            <td style="padding:9px 12px;color:#888">Regional</td>
            <td style="padding:9px 12px">${regional}</td>
          </tr>
          <tr style="background:#f8f9fb">
            <td style="padding:9px 12px;color:#888">Categoría</td>
            <td style="padding:9px 12px">${categoria}</td>
          </tr>
          <tr>
            <td style="padding:9px 12px;color:#888">Prioridad</td>
            <td style="padding:9px 12px">${prioridad || '—'}</td>
          </tr>
          <tr style="background:#f8f9fb">
            <td style="padding:9px 12px;color:#888">Solicitante</td>
            <td style="padding:9px 12px">${usuarioSolicitante}</td>
          </tr>
          ${fechaSolicitud ? `<tr>
            <td style="padding:9px 12px;color:#888">Fecha solicitud</td>
            <td style="padding:9px 12px">${formatFecha(String(fechaSolicitud).slice(0, 10))}</td>
          </tr>` : ''}
          ${quienCambio && quienCambio !== usuarioSolicitante ? `<tr style="background:#f8f9fb">
            <td style="padding:9px 12px;color:#888">Gestionado por</td>
            <td style="padding:9px 12px">${quienCambio}</td>
          </tr>` : ''}
          ${observaciones ? `<tr>
            <td style="padding:9px 12px;color:#888;vertical-align:top">Observaciones</td>
            <td style="padding:9px 12px">${observaciones}</td>
          </tr>` : ''}
          <tr style="background:#f8f9fb">
            <td style="padding:9px 12px;color:#888">ID Solicitud</td>
            <td style="padding:9px 12px;font-size:.78rem;color:#8e44ad;word-break:break-all">${idSolicitud}</td>
          </tr>
        </table>

        <div style="margin-bottom:20px">
          <div style="font-weight:bold;color:#1a1a2e;font-size:.82rem;letter-spacing:1px;text-transform:uppercase;
                      padding-bottom:6px;margin-bottom:8px;border-bottom:2px solid #eef1ff">
            Artículos solicitados
          </div>
          ${itemsHTML}
        </div>

        <div style="padding:11px 16px;background:${est.bg};border-left:4px solid ${est.color};
                    border-radius:0 4px 4px 0;font-size:.88rem;color:${est.color}">
          Estado actual: <strong>${est.etiqueta}</strong>
        </div>
      </div>
      ${FOOTER}
    </div>`;

  const mailOpts = {
    from:    `"LOG&SER Inventario" <${EMAIL_FROM}>`,
    to:      destinatarios,
    subject: asunto,
    html:    cuerpo,
  };
  if (copia) mailOpts.cc = copia;

  await transporter.sendMail(mailOpts);
}

async function enviarEmailAsistencia({ email, trabajador, tema, fecha, lugar, urlDoc }) {
  const asunto = `Registro de Asistencia a Capacitación: ${tema}`;
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      ${HEADER}
      <div style="padding:24px;background:#fff;border:1px solid #eee">
        <h2 style="color:#1a1a2e;margin-top:0">Registro de Asistencia</h2>
        <p style="color:#555">Hola <strong>${trabajador}</strong>,</p>
        <p style="color:#555">Se ha registrado su asistencia a la capacitación sobre: <strong>${tema}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:.93rem">
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888;width:40%">Tema</td><td style="padding:8px 12px;font-weight:bold">${tema}</td></tr>
          <tr><td style="padding:8px 12px;color:#888">Fecha</td><td style="padding:8px 12px">${formatFecha(fecha)}</td></tr>
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888">Lugar</td><td style="padding:8px 12px">${lugar}</td></tr>
        </table>
        ${urlDoc ? `
        <div style="margin-top:24px;text-align:center">
          <a href="${urlDoc}" target="_blank" style="background:#8e44ad;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">Ver Documento de Asistencia</a>
        </div>` : ''}
      </div>
      ${FOOTER}
    </div>`;

  await transporter.sendMail({
    from: `"LOG&SER Gestión" <${EMAIL_FROM}>`,
    to: email,
    subject: asunto,
    html: cuerpo,
  });
}

async function notificarFirmaPruebaConsumo({ email, nombreTrabajador, cliente, urlFirma, emailUsuario }) {
  const asunto = 'Consentimiento Informado para Toma de Prueba de Toxicología — LOG&SER';
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:24px">
      <div style="border-top:5px solid #8e44ad;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&SER">
      </div>
      <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:1.2rem">Hola, ${nombreTrabajador}</h2>
        <p style="color:#555;margin:0 0 24px;font-size:.95rem;line-height:1.6">
          Le informamos que tiene un <strong>Consentimiento Informado para la Toma de Prueba de Toxicología</strong> (SST-F-02) pendiente de su firma digital.
          Por favor revise los detalles y proceda con la firma.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:.9rem;margin-bottom:28px">
          <tr style="background:#f8f9fb">
            <td style="padding:10px 14px;color:#888;width:40%">Cliente asociado</td>
            <td style="padding:10px 14px;font-weight:700;color:#1a1a2e">${cliente}</td>
          </tr>
        </table>
        <div style="text-align:center;margin-bottom:28px">
          <a href="${urlFirma}"
             style="display:inline-block;background:#8e44ad;color:#fff;text-decoration:none;
                    padding:14px 36px;border-radius:7px;font-size:1rem;font-weight:700;letter-spacing:.3px">
            ✍️ Firmar consentimiento ahora
          </a>
        </div>
        <div style="background:#fffbea;border-left:4px solid #f0d060;padding:12px 16px;border-radius:0 4px 4px 0;font-size:.83rem;color:#7a6000;margin-bottom:24px">
          ⚠️ Este enlace tiene una validez de <strong>48 horas</strong>.
        </div>
        <p style="color:#aaa;font-size:.78rem;margin:0;line-height:1.6">
          Si el botón no funciona, copie y pegue este enlace en su navegador:<br>
          <span style="color:#1a5fa8;word-break:break-all">${urlFirma}</span>
        </p>
      </div>
      <p style="text-align:center;color:#bbb;font-size:.75rem;margin-top:16px">
        Sistema de Gestión Documental — LOG&amp;SER S.A.S.
      </p>
    </div>`;

  await transporter.sendMail({
    from: `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to: email,
    cc: emailUsuario || undefined,
    subject: asunto,
    html: cuerpo,
  });
}

async function notificarPruebaConsumoFirmada({ nombreTrabajador, identificacion, cliente, urlDoc, emailUsuario }) {
  const asunto = `Consentimiento de Prueba de Toxicología Firmado — ${nombreTrabajador}`;
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="border-top:5px solid #8e44ad;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&SER">
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #eee;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <div style="display:inline-block;background:#eafaf1;border:1px solid #6dcf9e;border-radius:6px;padding:8px 16px;margin-bottom:20px">
          <span style="color:#1a7a4a;font-weight:700;font-size:.9rem">✅ Proceso completado</span>
        </div>
        <h2 style="color:#1a1a2e;margin:0 0 8px">Consentimiento Firmado Exitosamente</h2>
        <p style="color:#555;margin:0 0 20px;line-height:1.6">
          El trabajador ha firmado el consentimiento informado para la toma de prueba de toxicología (alcohol y sustancias psicoactivas).
          El documento final ya ha sido generado y cargado en el bucket.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:.93rem;margin-bottom:24px">
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888;width:40%">Trabajador</td><td style="padding:8px 12px;font-weight:bold">${nombreTrabajador}</td></tr>
          <tr><td style="padding:8px 12px;color:#888">Identificación</td><td style="padding:8px 12px">${identificacion}</td></tr>
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888">Cliente</td><td style="padding:8px 12px;font-weight:bold;color:#1a5fa8">${cliente}</td></tr>
        </table>
        <div style="text-align:center;margin-bottom:20px">
          <a href="${urlDoc}" target="_blank"
             style="display:inline-block;background:#8e44ad;color:#fff;text-decoration:none;
                    padding:12px 32px;border-radius:7px;font-size:.95rem;font-weight:700">
            📄 Ver consentimiento firmado
          </a>
        </div>
      </div>
      <p style="text-align:center;color:#bbb;font-size:.75rem;margin-top:16px">
        Sistema de Gestión Documental — LOG&amp;SER S.A.S.
      </p>
    </div>`;

  const ccList = ['admin@logyser.com', 'sstadmon@logyser.com'];

  await transporter.sendMail({
    from: `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to: emailUsuario,
    cc: ccList.join(', '),
    subject: asunto,
    html: cuerpo,
  });
}

async function notificarFirmaDescuentoNomina({ email, nombreTrabajador, tipoDescuento, urlFirma, emailUsuario }) {
  const asunto = 'Autorización de Descuento por Nómina — LOG&SER';
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:24px">
      <div style="border-top:5px solid #2980b9;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&SER">
      </div>
      <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:1.2rem">Hola, ${nombreTrabajador}</h2>
        <p style="color:#555;margin:0 0 24px;font-size:.95rem;line-height:1.6">
          Le informamos que tiene una <strong>Autorización de Descuento por Nómina (${tipoDescuento})</strong> pendiente de su firma digital.
          Por favor revise los detalles y proceda con la firma.
        </p>
        <div style="text-align:center;margin-bottom:28px">
          <a href="${urlFirma}"
             style="display:inline-block;background:#2980b9;color:#fff;text-decoration:none;
                    padding:14px 36px;border-radius:7px;font-size:1rem;font-weight:700;letter-spacing:.3px">
            ✍️ Firmar autorización ahora
          </a>
        </div>
        <div style="background:#fffbea;border-left:4px solid #f0d060;padding:12px 16px;border-radius:0 4px 4px 0;font-size:.83rem;color:#7a6000;margin-bottom:24px">
          ⚠️ Este enlace tiene una validez de <strong>48 horas</strong>.
        </div>
        <p style="color:#aaa;font-size:.78rem;margin:0;line-height:1.6">
          Si el botón no funciona, copie y pegue este enlace en su navegador:<br>
          <span style="color:#1a5fa8;word-break:break-all">${urlFirma}</span>
        </p>
      </div>
      <p style="text-align:center;color:#bbb;font-size:.75rem;margin-top:16px">
        Sistema de Gestión Documental — LOG&amp;SER S.A.S.
      </p>
    </div>`;

  await transporter.sendMail({
    from: `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to: email,
    cc: emailUsuario || undefined,
    subject: asunto,
    html: cuerpo,
  });
}

async function notificarDescuentoNominaFirmada({ nombreTrabajador, identificacion, tipoDescuento, urlDoc, emailUsuario }) {
  const asunto = `Autorización de Descuento por Nómina Firmado — ${nombreTrabajador}`;
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="border-top:5px solid #2980b9;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&SER">
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #eee;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <div style="display:inline-block;background:#eafaf1;border:1px solid #6dcf9e;border-radius:6px;padding:8px 16px;margin-bottom:20px">
          <span style="color:#1a7a4a;font-weight:700;font-size:.9rem">✅ Proceso completado</span>
        </div>
        <h2 style="color:#1a1a2e;margin:0 0 8px">Autorización Firmada Exitosamente</h2>
        <p style="color:#555;margin:0 0 20px;line-height:1.6">
          El trabajador ha firmado la autorización de descuento por nómina (${tipoDescuento}).
          El documento final ya ha sido generado y cargado en el bucket.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:.93rem;margin-bottom:24px">
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888;width:40%">Trabajador</td><td style="padding:8px 12px;font-weight:bold">${nombreTrabajador}</td></tr>
          <tr><td style="padding:8px 12px;color:#888">Identificación</td><td style="padding:8px 12px">${identificacion}</td></tr>
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888">Tipo de Descuento</td><td style="padding:8px 12px;font-weight:bold;color:#1a5fa8">${tipoDescuento}</td></tr>
        </table>
        <div style="text-align:center;margin-bottom:20px">
          <a href="${urlDoc}" target="_blank"
             style="display:inline-block;background:#2980b9;color:#fff;text-decoration:none;
                    padding:12px 32px;border-radius:7px;font-size:.95rem;font-weight:700">
            📄 Ver documento firmado
          </a>
        </div>
      </div>
      <p style="text-align:center;color:#bbb;font-size:.75rem;margin-top:16px">
        Sistema de Gestión Documental — LOG&amp;SER S.A.S.
      </p>
    </div>`;

  let mailTo = '';
  let ccList = [];

  if (String(tipoDescuento).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'especifica') {
    mailTo = 'nomina@logyser.com';
    ccList = ['gestor.nomina@logyser.com', 'admin@logyser.com'];
    if (emailUsuario) ccList.push(emailUsuario);
  } else {
    mailTo = 'contratacionnacional@logyser.com';
    ccList = ['admin@logyser.com', 'gestiondocumental@logyser.com'];
  }

  await transporter.sendMail({
    from: `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to: mailTo,
    cc: ccList.join(', '),
    subject: asunto,
    html: cuerpo,
  });
}

async function enviarCorreoFirmaTrabajadorSST({ email, nombreTrabajador, urlFirma, emailUsuario }) {
  const asunto = 'Compromiso de Cumplimiento de las Normas de SST — LOG&SER';
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:24px">
      <div style="border-top:5px solid #8e44ad;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&SER">
      </div>
      <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:1.2rem">Hola, ${nombreTrabajador}</h2>
        <p style="color:#555;margin:0 0 24px;font-size:.95rem;line-height:1.6">
          Le informamos que tiene un <strong>Compromiso de Cumplimiento de las Normas de Seguridad y Salud en el Trabajo</strong> (SST-F-005) pendiente de su firma digital.
          Por favor revise los detalles del documento y proceda con su firma.
        </p>
        <div style="text-align:center;margin-bottom:28px">
          <a href="${urlFirma}"
             style="display:inline-block;background:#8e44ad;color:#fff;text-decoration:none;
                    padding:14px 36px;border-radius:7px;font-size:1rem;font-weight:700;letter-spacing:.3px">
            ✍️ Firmar compromiso ahora
          </a>
        </div>
        <p style="color:#aaa;font-size:.78rem;margin:0;line-height:1.6">
          Si el botón no funciona, copie y pegue este enlace en su navegador:<br>
          <span style="color:#1a5fa8;word-break:break-all">${urlFirma}</span>
        </p>
      </div>
      <p style="text-align:center;color:#bbb;font-size:.75rem;margin-top:16px">
        Sistema de Gestión Documental — LOG&amp;SER S.A.S.
      </p>
    </div>`;

  await transporter.sendMail({
    from: `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to: email,
    cc: emailUsuario || undefined,
    subject: asunto,
    html: cuerpo,
  });
}

async function enviarNotificacionTrabajadorFirmoSST({ emailUsuario, nombreTrabajador, identificacion }) {
  const asunto = `Trabajador Firmó Compromiso SST — ${nombreTrabajador}`;
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="border-top:5px solid #8e44ad;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&SER">
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #eee;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <h2 style="color:#1a1a2e;margin:0 0 8px">Firma del Trabajador Registrada</h2>
        <p style="color:#555;margin:0 0 20px;line-height:1.6;font-size:.95rem">
          El trabajador <strong>${nombreTrabajador}</strong> (C.C. ${identificacion}) ha firmado digitalmente el <strong>Compromiso de Cumplimiento SST (SST-F-005)</strong>.
        </p>
        <p style="color:#555;margin:0 0 20px;line-height:1.6;font-size:.95rem">
          Por favor, ingrese al panel de administración de Compromisos SST para realizar su firma como Analista SST y avanzar con el flujo.
        </p>
      </div>
      <p style="text-align:center;color:#bbb;font-size:.75rem;margin-top:16px">
        Sistema de Gestión Documental — LOG&amp;SER S.A.S.
      </p>
    </div>`;

  await transporter.sendMail({
    from: `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to: emailUsuario,
    subject: asunto,
    html: cuerpo,
  });
}

async function enviarCorreoFirmaLiderSST({ emailLider, nombreTrabajador, nombreAnalista, urlDoc }) {
  const asunto = `Compromiso SST Firmado y Generado — ${nombreTrabajador}`;
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:24px">
      <div style="border-top:5px solid #8e44ad;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&SER">
      </div>
      <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:1.2rem">Estimado Líder SST,</h2>
        <p style="color:#555;margin:0 0 24px;font-size:.95rem;line-height:1.6">
          Se informa que el trabajador <strong>${nombreTrabajador}</strong> y la Analista SST <strong>${nombreAnalista}</strong> han firmado el <strong>Compromiso de Cumplimiento de las Normas de Seguridad y Salud en el Trabajo</strong> (SST-F-005).
        </p>
        <p style="color:#555;margin:0 0 24px;font-size:.95rem;line-height:1.6">
          El documento PDF ha sido generado exitosamente con las firmas correspondientes, incluyendo su firma digital autorizada. Puede visualizar el documento final en el siguiente enlace:
        </p>
        <div style="text-align:center;margin-bottom:28px">
          <a href="${urlDoc}" target="_blank"
             style="display:inline-block;background:#8e44ad;color:#fff;text-decoration:none;
                    padding:14px 36px;border-radius:7px;font-size:1rem;font-weight:700;letter-spacing:.3px">
            📄 Ver Compromiso Completado
          </a>
        </div>
      </div>
      <p style="text-align:center;color:#bbb;font-size:.75rem;margin-top:16px">
        Sistema de Gestión Documental — LOG&amp;SER S.A.S.
      </p>
    </div>`;

  await transporter.sendMail({
    from: `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to: emailLider,
    subject: asunto,
    html: cuerpo,
  });
}

async function enviarNotificacionCompletadoSST({ emailUsuario, nombreTrabajador, identificacion, urlDoc }) {
  const asunto = `Compromiso SST Completado y Guardado — ${nombreTrabajador}`;
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="border-top:5px solid #8e44ad;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&SER">
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #eee;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <div style="display:inline-block;background:#eafaf1;border:1px solid #6dcf9e;border-radius:6px;padding:8px 16px;margin-bottom:20px">
          <span style="color:#1a7a4a;font-weight:700;font-size:.9rem">✅ Proceso completado</span>
        </div>
        <h2 style="color:#1a1a2e;margin:0 0 8px">Compromiso SST Completado</h2>
        <p style="color:#555;margin:0 0 20px;line-height:1.6">
          El <strong>Compromiso de Cumplimiento de las Normas de SST (SST-F-005)</strong> para el trabajador <strong>${nombreTrabajador}</strong> (C.C. ${identificacion}) ha sido completamente firmado por todas las partes (Trabajador, Analista y Líder SST).
        </p>
        <p style="color:#555;margin:0 0 20px;line-height:1.6">
          El documento PDF final ha sido generado y guardado en la carpeta digital del empleado en el bucket.
        </p>
        <div style="text-align:center;margin-bottom:20px">
          <a href="${urlDoc}" target="_blank"
             style="display:inline-block;background:#8e44ad;color:#fff;text-decoration:none;
                    padding:12px 32px;border-radius:7px;font-size:.95rem;font-weight:700">
            📄 Ver compromiso completado
          </a>
        </div>
      </div>
      <p style="text-align:center;color:#bbb;font-size:.75rem;margin-top:16px">
        Sistema de Gestión Documental — LOG&amp;SER S.A.S.
      </p>
    </div>`;

  const ccList = ['admin@logyser.com', 'sstadmon@logyser.com'];

  await transporter.sendMail({
    from: `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to: emailUsuario,
    cc: ccList.join(', '),
    subject: asunto,
    html: cuerpo,
  });
}

async function notificarFirmaEvaluacionSST({ email, nombreTrabajador, tipo, urlFirma, emailUsuario }) {
  const asunto = `Evaluación de Inducción/Capacitación SST (${tipo}) — LOG&SER`;
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:24px">
      <div style="border-top:5px solid #1abc9c;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&SER">
      </div>
      <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:1.2rem">Hola, ${nombreTrabajador}</h2>
        <p style="color:#555;margin:0 0 24px;font-size:.95rem;line-height:1.6">
          Le informamos que tiene una <strong>Evaluación de Inducción/Capacitación SST (${tipo})</strong> pendiente de diligenciar y firmar digitalmente.
          Por favor, ingrese al enlace para responder las preguntas y registrar su firma.
        </p>
        <div style="text-align:center;margin-bottom:28px">
          <a href="${urlFirma}"
             style="display:inline-block;background:#1abc9c;color:#fff;text-decoration:none;
                    padding:14px 36px;border-radius:7px;font-size:1rem;font-weight:700;letter-spacing:.3px">
            ✍️ Responder y Firmar Evaluación
          </a>
        </div>
        <div style="background:#fffbea;border-left:4px solid #f0d060;padding:12px 16px;border-radius:0 4px 4px 0;font-size:.83rem;color:#7a6000;margin-bottom:24px">
          ⚠️ Este enlace tiene una validez de <strong>48 horas</strong>.
        </div>
        <p style="color:#aaa;font-size:.78rem;margin:0;line-height:1.6">
          Si el botón no funciona, copie y pegue este enlace en su navegador:<br>
          <span style="color:#1a5fa8;word-break:break-all">${urlFirma}</span>
        </p>
      </div>
      <p style="text-align:center;color:#bbb;font-size:.75rem;margin-top:16px">
        Sistema de Gestión Documental — LOG&amp;SER S.A.S.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"LOG&SER Gestión Documental" <${EMAIL_FROM}>`,
    to: email,
    subject: asunto,
    html: cuerpo,
  });
}

async function notificarEvaluacionSSTCompletada({ email, nombreTrabajador, tipo, puntaje, resultado, urlDoc, emailUsuario }) {
  const asunto = `Evaluación de Inducción/Capacitación SST (${tipo}) Completada — LOG&SER`;
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:24px">
      <div style="border-top:5px solid #2ecc71;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&SER">
      </div>
      <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:1.2rem">Hola, ${nombreTrabajador}</h2>
        <p style="color:#555;margin:0 0 24px;font-size:.95rem;line-height:1.6">
          Su <strong>Evaluación de Inducción/Capacitación SST (${tipo})</strong> ha sido calificada y completada.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:.9rem;margin-bottom:28px">
          <tr style="background:#f8f9fb;border-bottom:1px solid #eee">
            <td style="padding:10px 14px;color:#888;width:40%">Puntaje</td>
            <td style="padding:10px 14px;font-weight:700;color:#1a1a2e">${puntaje} / 13</td>
          </tr>
          <tr style="border-bottom:1px solid #eee">
            <td style="padding:10px 14px;color:#888">Resultado</td>
            <td style="padding:10px 14px;font-weight:700;color:${resultado === 'APROBADO' ? '#2ecc71' : '#e74c3c'}">${resultado}</td>
          </tr>
        </table>
        ${urlDoc ? `
        <div style="text-align:center;margin-bottom:28px">
          <a href="${urlDoc}" target="_blank"
             style="display:inline-block;background:#2ecc71;color:#fff;text-decoration:none;
                    padding:14px 36px;border-radius:7px;font-size:1rem;font-weight:700;letter-spacing:.3px">
            📄 Ver PDF de Evaluación
          </a>
        </div>
        ` : ''}
      </div>
      <p style="text-align:center;color:#bbb;font-size:.75rem;margin-top:16px">
        Sistema de Gestión Documental — LOG&amp;SER S.A.S.
      </p>
    </div>
  `;

  const ccList = ['admin@logyser.com', 'sstadmon@logyser.com'];

  await transporter.sendMail({
    from: `"LOG&SER Gestión Documental" <${EMAIL_FROM}>`,
    to: email,
    cc: ccList.join(', '),
    subject: asunto,
    html: cuerpo,
  });
}

async function notificarFirmaCapacitacionSST({ email, nombreTrabajador, tema, urlFirma, emailUsuario }) {
  const asunto = `Evaluación de Capacitación SST — ${nombreTrabajador}`;
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:24px">
      <div style="border-top:5px solid #1abc9c;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&SER">
      </div>
      <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:1.2rem">Hola, ${nombreTrabajador}</h2>
        <p style="color:#555;margin:0 0 24px;font-size:.95rem;line-height:1.6">
          Le informamos que tiene una <strong>Evaluación de Capacitación SST</strong> pendiente de realizar con el tema: <strong>${tema}</strong>.
          Por favor, ingrese al enlace para responder las preguntas y registrar su firma digital.
        </p>
        <div style="text-align:center;margin-bottom:28px">
          <a href="${urlFirma}"
             style="display:inline-block;background:#1abc9c;color:#fff;text-decoration:none;
                    padding:14px 36px;border-radius:7px;font-size:1rem;font-weight:700;letter-spacing:.3px">
            ✍️ Responder y Firmar Evaluación
          </a>
        </div>
        <div style="background:#fffbea;border-left:4px solid #f0d060;padding:12px 16px;border-radius:0 4px 4px 0;font-size:.83rem;color:#7a6000;margin-bottom:24px">
          ⚠️ Este enlace tiene una validez de <strong>48 horas</strong>.
        </div>
        <p style="color:#aaa;font-size:.78rem;margin:0;line-height:1.6">
          Si el botón no funciona, copie y pegue este enlace en su navegador:<br>
          <span style="color:#1a5fa8;word-break:break-all">${urlFirma}</span>
        </p>
      </div>
      <p style="text-align:center;color:#bbb;font-size:.75rem;margin-top:16px">
        Sistema de Gestión Documental — LOG&amp;SER S.A.S.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"LOG&SER Gestión Documental" <${EMAIL_FROM}>`,
    to: email,
    subject: asunto,
    html: cuerpo,
  });
}

async function notificarCapacitacionSSTCompletada({ email, nombreTrabajador, tema, puntaje, totalPreguntas, resultado, urlDoc, emailUsuario }) {
  const asunto = `Capacitación SST Completada — ${nombreTrabajador}`;
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:24px">
      <div style="border-top:5px solid #2ecc71;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&SER">
      </div>
      <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:1.2rem">Hola, ${nombreTrabajador}</h2>
        <p style="color:#555;margin:0 0 24px;font-size:.95rem;line-height:1.6">
          Su <strong>Evaluación de Capacitación SST</strong> (Tema: ${tema}) ha sido calificada y completada.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:.9rem;margin-bottom:28px">
          <tr style="background:#f8f9fb;border-bottom:1px solid #eee">
            <td style="padding:10px 14px;color:#888;width:40%">Puntaje</td>
            <td style="padding:10px 14px;font-weight:700;color:#1a1a2e">${puntaje} / ${totalPreguntas}</td>
          </tr>
          <tr style="border-bottom:1px solid #eee">
            <td style="padding:10px 14px;color:#888">Resultado</td>
            <td style="padding:10px 14px;font-weight:700;color:${resultado === 'APROBADO' ? '#2ecc71' : '#e74c3c'}">${resultado}</td>
          </tr>
        </table>
        ${urlDoc ? `
        <div style="text-align:center;margin-bottom:28px">
          <a href="${urlDoc}" target="_blank"
             style="display:inline-block;background:#2ecc71;color:#fff;text-decoration:none;
                    padding:14px 36px;border-radius:7px;font-size:1rem;font-weight:700;letter-spacing:.3px">
            📄 Ver PDF de Evaluación
          </a>
        </div>
        ` : ''}
      </div>
      <p style="text-align:center;color:#bbb;font-size:.75rem;margin-top:16px">
        Sistema de Gestión Documental — LOG&amp;SER S.A.S.
      </p>
    </div>
  `;

  const ccList = [emailUsuario].filter(Boolean);

  await transporter.sendMail({
    from: `"LOG&SER Gestión Documental" <${EMAIL_FROM}>`,
    to: email,
    cc: ccList.join(', '),
    subject: asunto,
    html: cuerpo,
  });
}

async function notificarMovilidadRegistrada({ emailUsuario, nombreCompleto, identificacion, operacionSede, cargo, seDesplaza, medioTransporte }) {
  const asunto = `Registro Movilidad y Riesgo Vial SST — ${nombreCompleto}`;
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f4f4f4;padding:24px">
      <div style="border-top:5px solid #f59e0b;background:#fff;padding:16px 24px;border-bottom:1px solid #eee;border-radius:8px 8px 0 0;text-align:right">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:48px" alt="LOG&SER">
      </div>
      <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <div style="display:inline-block;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:8px 16px;margin-bottom:20px">
          <span style="color:#92400e;font-weight:700;font-size:.9rem">✅ Registro completado</span>
        </div>
        <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:1.1rem">Registro de Movilidad y Riesgo Vial SST</h2>
        <p style="color:#555;margin:0 0 20px;font-size:.95rem;line-height:1.6">
          Se ha registrado/actualizado la información de movilidad y riesgo vial del siguiente trabajador:
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:.9rem;margin-bottom:24px">
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888;width:40%">Trabajador</td><td style="padding:8px 12px;font-weight:700">${nombreCompleto}</td></tr>
          <tr><td style="padding:8px 12px;color:#888">Identificación</td><td style="padding:8px 12px">${identificacion}</td></tr>
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888">Operación / Sede</td><td style="padding:8px 12px">${operacionSede || '—'}</td></tr>
          <tr><td style="padding:8px 12px;color:#888">Cargo</td><td style="padding:8px 12px">${cargo || '—'}</td></tr>
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888">¿Se desplaza?</td><td style="padding:8px 12px;font-weight:700;color:${seDesplaza === 'Sí' ? '#065f46' : '#991b1b'}">${seDesplaza}</td></tr>
          ${seDesplaza === 'Sí' ? `<tr><td style="padding:8px 12px;color:#888">Medio de transporte</td><td style="padding:8px 12px">${medioTransporte || '—'}</td></tr>` : ''}
        </table>
        <p style="color:#94a3b8;font-size:.8rem;margin:0">
          Este registro fue diligenciado a través del Sistema de Gestión Documental de LOG&amp;SER.
        </p>
      </div>
      <p style="text-align:center;color:#bbb;font-size:.75rem;margin-top:16px">
        Sistema de Gestión Documental — LOG&amp;SER S.A.S.
      </p>
    </div>`;

  const ccList = ['admin@logyser.com', 'sstadmon@logyser.com'];

  await transporter.sendMail({
    from: `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to: emailUsuario,
    cc: ccList.join(', '),
    subject: asunto,
    html: cuerpo,
  });
}

function cambioFilaHtml(label, valAntes, valDespues) {
  const a = valAntes || '—';
  const d = valDespues || '—';
  if (a === d) return '';
  return `
    <tr>
      <td style="border:1px solid #ddd;padding:8px"><strong>${label}</strong></td>
      <td style="border:1px solid #ddd;padding:8px;color:#c0392b">${a}</td>
      <td style="border:1px solid #ddd;padding:8px;color:#27ae60;font-weight:bold">${d}</td>
    </tr>
  `;
}

function cleanTrabajadorName(trabajador) {
  if (!trabajador) return '';
  if (typeof trabajador !== 'string') return trabajador;
  if (trabajador.includes(' ** ')) {
    return trabajador.split(' ** ')[1].trim();
  }
  return trabajador.trim();
}

async function notificarCambiosDotacion({ trabajador, identificacion, antes, despues }) {
  const nombreLimpio = cleanTrabajadorName(trabajador);
  const asunto = `Actualización de Datos de Dotación — ${nombreLimpio}`;
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      ${HEADER}
      <div style="padding:24px;background:#fff;border:1px solid #eee">
        <h3 style="color:#1a1a2e;margin-top:0">Actualización de Datos de Dotación</h3>
        <p>El trabajador <strong>${nombreLimpio}</strong> (Identificación: <strong>${identificacion}</strong>) ha actualizado sus tallas de dotación:</p>
        <table style="width:100%;border-collapse:collapse;margin-top:14px">
          <thead>
            <tr style="background:#f2f2f2">
              <th style="border:1px solid #ddd;padding:8px;text-align:left">Campo</th>
              <th style="border:1px solid #ddd;padding:8px;text-align:left">Antes</th>
              <th style="border:1px solid #ddd;padding:8px;text-align:left">Ahora</th>
            </tr>
          </thead>
          <tbody>
            ${cambioFilaHtml('Camiseta', antes.Camiseta, despues.Camiseta)}
            ${cambioFilaHtml('Número (Buzo)', antes.Numero, despues.Numero)}
            ${cambioFilaHtml('Pantalón', antes.Pantalon, despues.Pantalon)}
            ${cambioFilaHtml('Botas', antes.Botas, despues.Botas)}
          </tbody>
        </table>
      </div>
      ${FOOTER}
    </div>
  `;

  await transporter.sendMail({
    from: `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to: 'auxiliarcompras@logyser.com, logyserinventarios@gmail.com, admin@logyser.com',
    subject: asunto,
    html: cuerpo,
  });
}

async function notificarCambiosPersonales({ trabajador, identificacion, antes, despues }) {
  const nombreLimpio = cleanTrabajadorName(trabajador);
  const asunto = `Actualización de Datos Personales — ${nombreLimpio}`;
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      ${HEADER}
      <div style="padding:24px;background:#fff;border:1px solid #eee">
        <h3 style="color:#1a1a2e;margin-top:0">Actualización de Datos Personales</h3>
        <p>El trabajador <strong>${nombreLimpio}</strong> (Identificación: <strong>${identificacion}</strong>) ha actualizado sus datos personales:</p>
        <table style="width:100%;border-collapse:collapse;margin-top:14px">
          <thead>
            <tr style="background:#f2f2f2">
              <th style="border:1px solid #ddd;padding:8px;text-align:left">Campo</th>
              <th style="border:1px solid #ddd;padding:8px;text-align:left">Antes</th>
              <th style="border:1px solid #ddd;padding:8px;text-align:left">Ahora</th>
            </tr>
          </thead>
          <tbody>
            ${cambioFilaHtml('Celular', antes.Celular, despues.Celular)}
            ${cambioFilaHtml('Email', antes.Email, despues.Email)}
            ${cambioFilaHtml('Contacto de Emergencia', antes.nombreEmergencia, despues.nombreEmergencia)}
            ${cambioFilaHtml('Teléfono de Emergencia', antes.telefonoEmergencia, despues.telefonoEmergencia)}
          </tbody>
        </table>
      </div>
      ${FOOTER}
    </div>
  `;

  await transporter.sendMail({
    from: `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to: 'gestor.nomina@logyser.com, admin@logyser.com',
    subject: asunto,
    html: cuerpo,
  });
}

async function notificarCambiosBancos({ trabajador, identificacion, antes, despues, urlDoc }) {
  const nombreLimpio = cleanTrabajadorName(trabajador);
  const asunto = `Actualización de Datos Bancarios — ${nombreLimpio}`;
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      ${HEADER}
      <div style="padding:24px;background:#fff;border:1px solid #eee">
        <h3 style="color:#1a1a2e;margin-top:0">Actualización de Información Bancaria</h3>
        <p>El trabajador <strong>${nombreLimpio}</strong> (Identificación: <strong>${identificacion}</strong>) ha actualizado sus datos de cuenta bancaria:</p>
        <table style="width:100%;border-collapse:collapse;margin-top:14px">
          <thead>
            <tr style="background:#f2f2f2">
              <th style="border:1px solid #ddd;padding:8px;text-align:left">Campo</th>
              <th style="border:1px solid #ddd;padding:8px;text-align:left">Antes</th>
              <th style="border:1px solid #ddd;padding:8px;text-align:left">Ahora</th>
            </tr>
          </thead>
          <tbody>
            ${cambioFilaHtml('Banco', antes.Banco, despues.Banco)}
            ${cambioFilaHtml('N° Cuenta Bancaria', antes.nCuentaBancaria, despues.nCuentaBancaria)}
          </tbody>
        </table>
        ${urlDoc ? `
        <div style="margin-top:20px;text-align:center">
          <a href="${urlDoc}" target="_blank" style="background:#10b981;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Ver Certificación Bancaria</a>
        </div>
        ` : ''}
      </div>
      ${FOOTER}
    </div>
  `;

  await transporter.sendMail({
    from: `"LOG&SER Documentos" <${EMAIL_FROM}>`,
    to: 'contratacionnacional@logyser.com, gestor.nomina@logyser.com, admin@logyser.com',
    subject: asunto,
    html: cuerpo,
  });
}

async function notificarBloqueoAspirante({ emailUsuario, nombreAspirante, registeredID, extractedID }) {
  const asunto = `PROCESO BLOQUEADO — Aspirante con error de identificación`;
  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      ${HEADER}
      <div style="padding:24px;background:#fff;border:1px solid #eee">
        <h3 style="color:#c0392b;margin-top:0">Proceso de Selección Bloqueado</h3>
        <p>El aspirante cometió un error al digitar su número de identificación al registrarse en la plataforma y el proceso ha sido bloqueado automáticamente por seguridad.</p>
        <p><strong>Detalles del Aspirante:</strong></p>
        <table style="width:100%;border-collapse:collapse;margin-top:14px">
          <tr style="background:#f9f9f9">
            <td style="padding:8px;border:1px solid #ddd;font-weight:bold;width:40%">Nombre</td>
            <td style="padding:8px;border:1px solid #ddd">${nombreAspirante}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #ddd;font-weight:bold">Identificación Registrada</td>
            <td style="padding:8px;border:1px solid #ddd">${registeredID}</td>
          </tr>
          <tr style="background:#f9f9f9">
            <td style="padding:8px;border:1px solid #ddd;font-weight:bold">Cédula (Document AI)</td>
            <td style="padding:8px;border:1px solid #ddd;color:#c0392b;font-weight:bold">${extractedID}</td>
          </tr>
        </table>
        <p style="margin-top:20px;font-size:0.9rem;color:#555;line-height:1.6">
          <strong>Acción requerida:</strong> Se sugirió al aspirante volver a comenzar a diligenciar su hoja de vida en <strong>curriculum.logyser.com</strong>.
          Por favor, proceda a eliminar el registro errado de la base de datos.
        </p>
      </div>
      ${FOOTER}
    </div>
  `;

  const toEmails = ['seleccion@logyser.com', 'admin@logyser.com', 'contratacionnacional@logyser.com'];
  if (emailUsuario) {
    toEmails.push(emailUsuario);
  }

  await transporter.sendMail({
    from: `"LOG&SER Gestión Documental" <${EMAIL_FROM}>`,
    to: toEmails.join(', '),
    subject: asunto,
    html: cuerpo,
  });
}

async function notificarConfirmacionInventario({ operacion, categoria, mes, usuarioNombre, emailUsuario, pdfUrl, destinatarios }) {
  const asunto = `Confirmación de Inventario ${categoria} — ${operacion} — ${mes}`;

  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      ${HEADER}
      <div style="padding:24px;background:#fff;border:1px solid #eee">
        <h2 style="color:#1a1a2e;margin-top:0;border-bottom:2px solid #edf2f7;padding-bottom:12px;">Confirmación de Inventario Exitosa</h2>
        <p style="color:#555">Se ha registrado de forma oficial el acta de confirmación de inventario con los siguientes detalles:</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:.93rem">
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888;width:40%">Operación / Sede</td><td style="padding:8px 12px;font-weight:bold;color:#1a5fa8">${operacion}</td></tr>
          <tr><td style="padding:8px 12px;color:#888">Categoría</td><td style="padding:8px 12px;font-weight:bold">${categoria}</td></tr>
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888">Período (Mes)</td><td style="padding:8px 12px">${mes}</td></tr>
          <tr><td style="padding:8px 12px;color:#888">Confirmado por</td><td style="padding:8px 12px">${usuarioNombre}</td></tr>
          <tr style="background:#f8f9fb"><td style="padding:8px 12px;color:#888">Área</td><td style="padding:8px 12px">Inventario</td></tr>
          <tr><td style="padding:8px 12px;color:#888">Tipo Período</td><td style="padding:8px 12px">Mensual</td></tr>
        </table>
        <div style="margin-top:24px;text-align:center;">
          <a href="${pdfUrl}" target="_blank" style="display:inline-block;padding:12px 24px;background-color:#1e3c72;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:6px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">Ver Acta Firmada (PDF)</a>
        </div>
      </div>
      ${FOOTER}
    </div>`;

  await transporter.sendMail({
    from:    `"LOG&SER Inventarios" <${EMAIL_FROM}>`,
    to:      destinatarios.join(', '),
    cc:      emailUsuario || undefined,
    subject: asunto,
    html:    cuerpo,
  });
}

module.exports = {
  notificarConfirmacionInventario,
  notificarBloqueoAspirante,
  notificarNuevoTraslado,
  notificarFirmaTrabajador,
  notificarDocumentoGenerado,
  notificarRetiro,
  notificarFirmaRenuncia,
  notificarRenunciaFirmada,
  notificarIngreso,
  DESTINATARIOS_INGRESO_REDUCIDO,
  notificarAreaPazYSalvo,
  notificarPazYSalvoTrabajador,
  notificarPazYSalvoCompletado,
  notificarDocumentoRetiroTrabajador,
  notificarDocumentosRetiroConcluidos,
  notificarSolicitudCambioEstado,
  enviarEmailAsistencia,
  notificarFirmaPruebaConsumo,
  notificarPruebaConsumoFirmada,
  enviarCorreoFirmaTrabajadorSST,
  enviarNotificacionTrabajadorFirmoSST,
  enviarCorreoFirmaLiderSST,
  enviarNotificacionCompletadoSST,
  notificarFirmaEvaluacionSST,
  notificarEvaluacionSSTCompletada,
  notificarFirmaCapacitacionSST,
  notificarCapacitacionSSTCompletada,
  notificarCambiosDotacion,
  notificarCambiosPersonales,
  notificarCambiosBancos,
  transporter,
};

async function notificarReportePendientes(records) {
  const asunto = 'Reporte Diario de Servicios con Forma de Pago Pendiente (4) — LOG&SER';
  let cuerpo = '';

  if (!records || records.length === 0) {
    cuerpo = `
      <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;background:#f4f4f4;padding:24px">
        ${HEADER}
        <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
          <h2 style="color:#1a1a2e;margin-top:0">Reporte de Forma de Pago Pendiente</h2>
          <p style="color:#555">
            El proceso diario de actualización automática se ejecutó correctamente y <strong>no hay servicios pendientes</strong> de recaudo (Forma de Pago = 4) registrados en el sistema en este momento.
          </p>
        </div>
        ${FOOTER}
      </div>`;
  } else {
    const tableRows = records.map(r => `
      <tr>
        <td style="padding:8px; border:1px solid #ddd;">${r.IdServicio}</td>
        <td style="padding:8px; border:1px solid #ddd;">${r.IdRecibo || '—'}</td>
        <td style="padding:8px; border:1px solid #ddd; font-weight:bold; color:#d68910;">${r.Operacion || '—'}</td>
        <td style="padding:8px; border:1px solid #ddd;">${formatFecha(r.HoraInicio)}</td>
        <td style="padding:8px; border:1px solid #ddd;">${r.Usuario || '—'}</td>
      </tr>
    `).join('');

    cuerpo = `
      <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;background:#f4f4f4;padding:24px">
        ${HEADER}
        <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
          <h2 style="color:#1a1a2e;margin-top:0">Reporte de Servicios con Forma de Pago Pendiente</h2>
          <p style="color:#555">
            A continuación se detallan todos los registros que se encuentran en estado de pago <strong>Pendiente (Forma de Pago = 4)</strong>. 
          </p>
          <div style="margin:16px 0;padding:12px;background:#fffbea;border-left:4px solid #f0d060;font-size:.88rem;color:#7a6000">
            <strong>Nota de Contexto:</strong><br>
            • Los códigos de pago <strong>1 (Efectivo)</strong> y <strong>2 (Transferencia)</strong> corresponden a recaudos que deben recibirse el mismo día del servicio (cuyo recibo pasa a <strong>Verde</strong> al ser pagado).<br>
            • Si un servicio de días anteriores permanece en <strong>Amarillo</strong>, se actualiza automáticamente a <strong>Pendiente (4)</strong> para el respectivo seguimiento administrativo.
          </div>
          <p style="color:#555;font-weight:bold;margin-bottom:8px">
            Total de registros pendientes en el informe: ${records.length}
          </p>
          <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:.85rem;border:1px solid #ddd">
            <thead>
              <tr style="background:#f8f9fb">
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">ID Servicio</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">ID Recibo</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Operación</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Fecha</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Usuario</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
        ${FOOTER}
      </div>`;
  }

  await transporter.sendMail({
    from: `"LOG&SER Facturación" <${EMAIL_FROM}>`,
    to: [
      'jefe.facturacion@logyser.com',
      'facturacion.electronica@logyser.com',
      'auditoria.recaudo@logyser.com'
    ].join(', '),
    cc: 'admin@logyser.com',
    subject: asunto,
    html: cuerpo,
  });
}

async function notificarPendientesCoordinador({ email, nombreCoordinador, rol, scope, records }) {
  const isRegional = rol === 'CoordinadorR';
  const tipoScope = isRegional ? 'Regional' : 'Operación';
  const asunto = `Servicios con Forma de Pago Pendiente (4) — ${tipoScope}: ${scope} — LOG&SER`;

  const tableRows = records.map(r => `
    <tr>
      <td style="padding:8px; border:1px solid #ddd;">${r.IdServicio}</td>
      <td style="padding:8px; border:1px solid #ddd;">${r.IdRecibo || '—'}</td>
      <td style="padding:8px; border:1px solid #ddd; font-weight:bold; color:#d68910;">${r.Operacion || '—'}</td>
      <td style="padding:8px; border:1px solid #ddd;">${formatFecha(r.HoraInicio)}</td>
      <td style="padding:8px; border:1px solid #ddd;">${r.Usuario || '—'}</td>
    </tr>
  `).join('');

  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;background:#f4f4f4;padding:24px">
      ${HEADER}
      <div style="background:#fff;padding:32px 28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <h2 style="color:#1a1a2e;margin-top:0">Hola, ${nombreCoordinador}</h2>
        <p style="color:#555">
          Le informamos que tiene servicios en estado de pago <strong>Pendiente (Forma de Pago = 4)</strong> para su asignación (${tipoScope}: <strong>${scope}</strong>).
        </p>
        <div style="margin:16px 0;padding:12px;background:#fffbea;border-left:4px solid #f0d060;font-size:.88rem;color:#7a6000">
          <strong>Nota de Contexto:</strong><br>
          • Los códigos de pago <strong>1 (Efectivo)</strong> y <strong>2 (Transferencia)</strong> corresponden a recaudos que deben recibirse el mismo día del servicio (cuyo recibo pasa a <strong>Verde</strong> al ser pagado).<br>
          • Si un servicio de días anteriores permanece en <strong>Amarillo</strong>, se actualiza automáticamente a <strong>Pendiente (4)</strong> para el respectivo seguimiento administrativo.
        </div>
        <p style="color:#555;font-weight:bold;margin-bottom:8px">
          Total de registros pendientes en su área: ${records.length}
        </p>
        <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:.85rem;border:1px solid #ddd">
          <thead>
            <tr style="background:#f8f9fb">
              <th style="padding:8px; border:1px solid #ddd; text-align:left;">ID Servicio</th>
              <th style="padding:8px; border:1px solid #ddd; text-align:left;">ID Recibo</th>
              <th style="padding:8px; border:1px solid #ddd; text-align:left;">Operación</th>
              <th style="padding:8px; border:1px solid #ddd; text-align:left;">Fecha</th>
              <th style="padding:8px; border:1px solid #ddd; text-align:left;">Usuario</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
      ${FOOTER}
    </div>`;

  await transporter.sendMail({
    from: `"LOG&SER Facturación" <${EMAIL_FROM}>`,
    to: email,
    cc: 'admin@logyser.com',
    subject: asunto,
    html: cuerpo,
  });
}

module.exports = {
  notificarConfirmacionInventario,
  notificarBloqueoAspirante,
  notificarNuevoTraslado,
  notificarFirmaTrabajador,
  notificarActaFirma,
  notificarDotacionLey,
  notificarDocumentoGenerado,
  notificarRetiro,
  notificarFirmaRenuncia,
  notificarRenunciaFirmada,
  notificarIngreso,
  DESTINATARIOS_INGRESO_REDUCIDO,
  notificarAreaPazYSalvo,
  notificarPazYSalvoTrabajador,
  notificarPazYSalvoCompletado,
  notificarDocumentoRetiroTrabajador,
  notificarDocumentosRetiroConcluidos,
  notificarSolicitudCambioEstado,
  enviarEmailAsistencia,
  notificarFirmaPruebaConsumo,
  notificarPruebaConsumoFirmada,
  notificarFirmaDescuentoNomina,
  notificarDescuentoNominaFirmada,
  enviarCorreoFirmaTrabajadorSST,
  enviarNotificacionTrabajadorFirmoSST,
  enviarCorreoFirmaLiderSST,
  enviarNotificacionCompletadoSST,
  notificarFirmaEvaluacionSST,
  notificarEvaluacionSSTCompletada,
  notificarFirmaCapacitacionSST,
  notificarCapacitacionSSTCompletada,
  notificarMovilidadRegistrada,
  notificarCambiosDotacion,
  notificarCambiosPersonales,
  notificarCambiosBancos,
  notificarReportePendientes,
  notificarPendientesCoordinador,
  transporter,
};
