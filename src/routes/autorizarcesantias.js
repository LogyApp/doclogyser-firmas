const express = require('express');
const pool = require('../services/db');
const { validarTokenAutCesantias } = require('../services/token');
const { notificarAutorizacionCesantiasNomina } = require('../services/email');
const { obtenerUrlFirmaReciente } = require('../services/storage');
const { LOGO_BASE64 } = require('../services/assets');

const router = express.Router();

function fechaHoraBogota() {
  const b = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${b.getFullYear()}-${p(b.getMonth()+1)}-${p(b.getDate())} ${p(b.getHours())}:${p(b.getMinutes())}:${p(b.getSeconds())}`;
}

function limpiarNombre(trabajador) {
  if (!trabajador) return '';
  const partes = String(trabajador).split(' ** ');
  return (partes.length > 1 ? partes[1] : trabajador).trim();
}

async function resolverFondoCesantias(identificacion) {
  const [rows] = await pool.execute(
    'SELECT `Cesantías` FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1',
    [identificacion]
  );
  return rows.length && rows[0]['Cesantías'] ? rows[0]['Cesantías'].trim() : 'Fondo no especificado';
}

function paginaError(mensaje) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Enlace no disponible — LOG&SER</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f1f5f9;color:#334155}div{background:#fff;padding:2.5rem 2rem;border-radius:12px;text-align:center;box-shadow:0 4px 15px rgba(0,0,0,.08);max-width:440px;width:92%}h2{color:#e11d48;margin:0 0 10px;font-size:1.3rem}p{color:#64748b;margin:0 0 16px;line-height:1.5;font-size:.95rem}</style></head><body><div><h2>Enlace no disponible</h2><p>${mensaje}</p><p style="font-size:.82rem;color:#94a3b8">Si requiere asistencia, comuníquese con el área de Recursos Humanos: <a href="mailto:nomina@logyser.com" style="color:#0284c7">nomina@logyser.com</a></p></div></body></html>`;
}

// ── GET /:idVinculacion?token=... ──────────────────────────────────────────
router.get('/:idVinculacion', async (req, res) => {
  try {
    const idVinculacion = decodeURIComponent(req.params.idVinculacion);
    const { token } = req.query;

    if (!token) return res.status(401).send(paginaError('Token de acceso no proporcionado.'));

    const resultado = await validarTokenAutCesantias(token, idVinculacion);
    if (!resultado.valido) {
      const msg = resultado.motivo === 'expirado'
        ? 'El enlace ha expirado (validez de 120 horas). Comuníquese con Nómina o Recursos Humanos para gestionar su solicitud.'
        : 'El enlace no es válido o ya fue utilizado previamente.';
      return res.status(401).send(paginaError(msg));
    }

    const [vinRows] = await pool.execute(
      'SELECT * FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ? LIMIT 1',
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).send(paginaError('Registro de vinculación no encontrado.'));
    const vin = vinRows[0];
    const identificacion = String(vin['Identificación']);
    const nombreLimpio = limpiarNombre(vin.Trabajador);
    const fondoCesantias = await resolverFondoCesantias(identificacion);

    // Verificar si ya existe solicitud de cesantías por retiro activa
    const [existentes] = await pool.execute(
      `SELECT c.Id, c.estado, DATE_FORMAT(c.fecha_registro, '%d/%m/%Y %H:%i') AS fecha_fmt
       FROM Dynamic_Cesantias c
       LEFT JOIN Config_MotivoCesantias m ON c.motivo_retiro = m.Id
       WHERE c.identificacion = ? 
         AND (m.tipo_retiro = 'Retiro' OR c.estado IN ('pendiente','validado','aprobado','tramitado'))
         AND c.estado NOT IN ('anulado','rechazado','cancelado')
       ORDER BY c.fecha_registro DESC LIMIT 1`,
      [identificacion]
    );

    const yaAutorizado = existentes.length > 0;
    const infoExistente = yaAutorizado ? existentes[0] : null;

    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Autorización de Retiro de Cesantías — LOG&SER</title>
  <style>
    :root {
      --primary: #1B2A5E;
      --accent: #0284c7;
      --accent-hover: #0369a1;
      --bg: #f8fafc;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px 14px;
    }
    .container {
      background: var(--card);
      max-width: 580px;
      width: 100%;
      border-radius: 14px;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08), 0 8px 10px -6px rgba(0,0,0,0.04);
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #1B2A5E 0%, #1e3a8a 100%);
      color: #fff;
      padding: 26px 24px 22px;
      text-align: center;
    }
    .header img {
      height: 52px;
      margin-bottom: 14px;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));
    }
    .header h1 {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      margin-bottom: 4px;
    }
    .header p {
      font-size: 0.85rem;
      opacity: 0.9;
    }
    .content {
      padding: 28px 24px;
    }
    .badge {
      display: inline-block;
      background: #e0f2fe;
      color: #0369a1;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.78rem;
      font-weight: 700;
      margin-bottom: 18px;
    }
    .card-info {
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 20px;
      font-size: 0.88rem;
    }
    .card-info-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px dashed var(--border);
    }
    .card-info-row:last-child { border-bottom: none; }
    .card-label { color: var(--muted); font-weight: 500; }
    .card-val { font-weight: 600; text-align: right; }
    .auth-text-box {
      background: #fff;
      border-left: 4px solid var(--primary);
      padding: 16px 18px;
      border-radius: 0 8px 8px 0;
      background: #f1f5f9;
      margin-bottom: 22px;
      font-size: 0.92rem;
      line-height: 1.6;
      color: #1e293b;
    }
    .checkbox-wrap {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 24px;
      cursor: pointer;
      user-select: none;
    }
    .checkbox-wrap input {
      width: 20px;
      height: 20px;
      margin-top: 2px;
      accent-color: var(--accent);
      cursor: pointer;
    }
    .checkbox-label {
      font-size: 0.88rem;
      color: #334155;
      line-height: 1.45;
    }
    .btn-submit {
      width: 100%;
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 15px 20px;
      border-radius: 9px;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
    }
    .btn-submit:hover:not(:disabled) {
      background: var(--accent-hover);
    }
    .btn-submit:active:not(:disabled) {
      transform: scale(0.99);
    }
    .btn-submit:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }
    .footer {
      border-top: 1px solid var(--border);
      padding: 14px 24px;
      text-align: center;
      font-size: 0.75rem;
      color: var(--muted);
      background: #fafafa;
    }
    .success-box {
      text-align: center;
      padding: 30px 10px;
    }
    .success-icon {
      font-size: 3rem;
      margin-bottom: 12px;
      display: inline-block;
    }
    .success-box h3 {
      font-size: 1.3rem;
      color: var(--primary);
      margin-bottom: 10px;
    }
    .success-box p {
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.5;
      margin-bottom: 18px;
    }
    .radicado-pill {
      display: inline-block;
      background: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
      padding: 8px 18px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 1.1rem;
      letter-spacing: 0.5px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${LOGO_BASE64}" alt="LOG&SER">
      <h1>Autorización de Retiro de Cesantías</h1>
      <p>Gestión Documental y Liquidación Definitiva</p>
    </div>

    <div class="content" id="mainContent">
      ${yaAutorizado ? `
        <div class="success-box">
          <span class="success-icon">✅</span>
          <h3>Solicitud Ya Autorizada</h3>
          <p>Estimado/a <strong>${nombreLimpio}</strong>, usted ya confirmó previamente su autorización para el retiro de cesantías con el radicado:</p>
          <div class="radicado-pill">${infoExistente.Id}</div>
          <p>Estado actual: <strong>${infoExistente.estado.toUpperCase()}</strong> (Registrada el ${infoExistente.fecha_fmt})</p>
          <p style="font-size:0.83rem; margin-top:20px; color:#94a3b8;">
            El área de Nómina ya cuenta con su solicitud para adelantar el trámite de cobro o desembolso ante su fondo de cesantías.
          </p>
        </div>
      ` : `
        <div style="text-align:center;">
          <span class="badge">Terminación de Contrato Laboral</span>
        </div>

        <div class="card-info">
          <div class="card-info-row">
            <span class="card-label">Colaborador(a):</span>
            <span class="card-val">${nombreLimpio}</span>
          </div>
          <div class="card-info-row">
            <span class="card-label">Documento de Identidad:</span>
            <span class="card-val">C.C. ${identificacion}</span>
          </div>
          <div class="card-info-row">
            <span class="card-label">Cargo desempeñado:</span>
            <span class="card-val">${vin.Cargo || '—'}</span>
          </div>
          <div class="card-info-row">
            <span class="card-label">Fondo de Cesantías:</span>
            <span class="card-val" style="color:var(--accent); font-weight:700;">${fondoCesantias}</span>
          </div>
        </div>

        <div class="auth-text-box">
          <strong>Declaración y Autorización Expresa:</strong><br><br>
          Yo, <strong>${nombreLimpio}</strong>, identificado(a) con la Cédula de Ciudadanía No. <strong>${identificacion}</strong>,
          en calidad de extrabajador(a) de la compañía <strong>LOG&SER - Apoyo Logístico y Operativo S.A.S.</strong>,
          autorizo de manera libre, expresa e informada al área de Nómina para que tramite y solicite ante mi Fondo de Cesantías
          (<strong>${fondoCesantias}</strong>) el retiro y desembolso total de mis cesantías acumuladas por concepto de terminación
          de mi vínculo laboral.
        </div>

        <label class="checkbox-wrap">
          <input type="checkbox" id="chkAcepto" checked>
          <span class="checkbox-label">
            He leído detenidamente la información, confirmo que mis datos son correctos y autorizo a LOG&SER S.A.S. a tramitar mis cesantías ante el fondo.
          </span>
        </label>

        <button type="button" class="btn-submit" id="btnAutorizar" onclick="enviarAutorizacion()">
          ✓ Confirmar y Autorizar Retiro de Cesantías
        </button>

        <div id="msgError" style="display:none; background:#fef2f2; color:#b91c1c; padding:10px 14px; border-radius:8px; margin-top:14px; font-size:0.85rem; text-align:center;"></div>
      `}
    </div>

    <div class="footer">
      LOG&amp;SER S.A.S. · NIT 900.318.733-1 · Proceso Seguro de Firma y Autorización Digital
    </div>
  </div>

  <script>
    const token = ${JSON.stringify(token)};
    const idVinculacion = ${JSON.stringify(idVinculacion)};

    async function enviarAutorizacion() {
      const chk = document.getElementById('chkAcepto');
      const btn = document.getElementById('btnAutorizar');
      const errBox = document.getElementById('msgError');

      if (!chk || !chk.checked) {
        alert('Debe marcar la casilla aceptando la autorización.');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Procesando autorización...';
      errBox.style.display = 'none';

      try {
        const res = await fetch(window.location.pathname, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo registrar la autorización.');

        document.getElementById('mainContent').innerHTML = \`
          <div class="success-box">
            <span class="success-icon">🎉</span>
            <h3>¡Autorización Exitosa!</h3>
            <p>Su solicitud de retiro de cesantías ha sido registrada y formalizada bajo el radicado:</p>
            <div class="radicado-pill">\${data.radicado}</div>
            <p>
              El área de Nómina ha sido notificada automáticamente y procederá a radicar el trámite ante su fondo de cesantías.
            </p>
            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px 14px; font-size:0.85rem; color:#166534; margin-top:16px;">
              Una vez el fondo apruebe el desembolso, recibirá un correo con el comprobante y los detalles de entrega.
            </div>
          </div>
        \`;
      } catch (err) {
        btn.disabled = false;
        btn.textContent = '✓ Confirmar y Autorizar Retiro de Cesantías';
        errBox.textContent = err.message;
        errBox.style.display = 'block';
      }
    }
  </script>
</body>
</html>`);
  } catch (err) {
    console.error('[autorizarcesantias GET]', err);
    res.status(500).send(paginaError('Error interno del servidor. Por favor intente más tarde.'));
  }
});

// ── POST /:idVinculacion ──────────────────────────────────────────────────
router.post('/:idVinculacion', async (req, res) => {
  try {
    const idVinculacion = decodeURIComponent(req.params.idVinculacion);
    const { token } = req.body;

    if (!token) return res.status(401).json({ ok: false, error: 'Token no proporcionado' });

    const resultado = await validarTokenAutCesantias(token, idVinculacion);
    if (!resultado.valido) {
      return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
    }

    const [vinRows] = await pool.execute(
      'SELECT * FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ? LIMIT 1',
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
    const vin = vinRows[0];
    const identificacion = String(vin['Identificación']);
    const trabajador = limpiarNombre(vin.Trabajador);
    const fondoCesantias = await resolverFondoCesantias(identificacion);

    // Obtener ID del motivo de retiro para cesantías
    const [motRows] = await pool.execute(
      "SELECT Id FROM Config_MotivoCesantias WHERE tipo_retiro = 'Retiro' LIMIT 1"
    );
    const motivoRetiroId = motRows.length ? motRows[0].Id : 7;

    // Obtener firma digital previa del trabajador si existe en almacenamiento
    let urlFirmaTrabajador = null;
    try {
      urlFirmaTrabajador = await obtenerUrlFirmaReciente(identificacion);
    } catch {}

    // Generar radicado único CES-YYYYMMDD-HHMMSS
    const ahoraBogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const p = n => String(n).padStart(2, '0');
    const radicadoId = `CES-${ahoraBogota.getFullYear()}${p(ahoraBogota.getMonth()+1)}${p(ahoraBogota.getDate())}-${p(ahoraBogota.getHours())}${p(ahoraBogota.getMinutes())}${p(ahoraBogota.getSeconds())}`;
    const ahoraStr = fechaHoraBogota();

    // Crear registro en Dynamic_Cesantias en estado 'aprobado'
    await pool.execute(
      `INSERT INTO Dynamic_Cesantias (
        Id, identificacion, usuario, ciudad_solicitud, fondo_cesantias,
        monto_solicitado, motivo_retiro, aplica_conyuge,
        declaracion_aceptada, firma_trabajador, fecha_firma, ip_firma,
        estado, validado_por, fecha_validacion, gestionado_por, fecha_gestion,
        observaciones, fecha_registro, fecha_actualizacion
      ) VALUES (
        ?, ?, ?, ?, ?,
        0.00, ?, 0,
        1, ?, ?, ?,
        'aprobado', 'Autorización Trabajador', ?, 'Autorización Trabajador', ?,
        'Autorizado digitalmente por el extrabajador mediante enlace web.', ?, ?
      )`,
      [
        radicadoId,
        identificacion,
        vin.Usuario || 'trabajador',
        vin.Regional || 'Medellín',
        fondoCesantias,
        motivoRetiroId,
        urlFirmaTrabajador,
        ahoraStr,
        req.ip || req.connection?.remoteAddress || null,
        ahoraStr,
        ahoraStr,
        ahoraStr,
        ahoraStr
      ]
    );

    // Invalidar token de autorización
    await pool.execute(
      'UPDATE `Maestro_Vinculación` SET token_aut_cesantias = NULL, token_aut_cesantias_expira = NULL WHERE `Id Vinculación` = ?',
      [idVinculacion]
    );

    // Notificar a Nómina por correo electrónico
    let emailUsuario = null;
    if (vin.Usuario) {
      const [uRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [vin.Usuario]);
      emailUsuario = uRows[0]?.Email || null;
    }

    notificarAutorizacionCesantiasNomina({
      trabajador,
      identificacion,
      fondoCesantias,
      radicadoId,
      operacion: vin['Operación'],
      regional:  vin.Regional,
      emailUsuario,
    }).catch(errEmail => console.error('[autorizarcesantias-email-error]', errEmail.message));

    res.json({ ok: true, radicado: radicadoId });
  } catch (err) {
    console.error('[autorizarcesantias POST]', err);
    res.status(500).json({ ok: false, error: 'Error interno al registrar la autorización.' });
  }
});

module.exports = router;
