const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const pool = require('../services/db');
const { transporter } = require('../services/email');

// Helper to resolve CC emails list (same as logysign.js)
async function obtenerCcEmails(usuarioId, regional, operacion, idConfigDoc) {
  const ccList = [];
  
  // 1. Email of the initiating user
  const [uRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuarioId]);
  if (uRows.length && uRows[0].Email) {
    ccList.push(uRows[0].Email);
  }

  const omitirRolesLocales = (idConfigDoc === 18 || Number(idConfigDoc) === 18);

  if (!omitirRolesLocales) {
    // 2. AuxiliarR and CoordinadorR by Regional
    let foundRegionalCc = false;
    if (regional) {
      const [regRows] = await pool.execute(
        'SELECT Email FROM Maestro_Usuarios WHERE Regional = ? AND Rol IN ("AuxiliarR", "CoordinadorR")',
        [regional]
      );
      if (regRows.length) {
        regRows.forEach(r => { if (r.Email) ccList.push(r.Email); });
        foundRegionalCc = true;
      }
    }

    // 3. Fallback: Auxiliar and Coordinador by Operación
    if (!foundRegionalCc && operacion) {
      const [opRows] = await pool.execute(
        'SELECT Email FROM Maestro_Usuarios WHERE `Operación` = ? AND Rol IN ("Auxiliar", "Coordinador")',
        [operacion]
      );
      opRows.forEach(r => { if (r.Email) ccList.push(r.Email); });
    }
  }

  // 4. Fixed copies
  ccList.push('admin@logyser.com');
  if (idConfigDoc === 55 || Number(idConfigDoc) === 55) {
    ccList.push('retiros@logyser.com');
  }

  // Filter duplicate and empty emails
  return [...new Set(ccList.map(e => e.trim().toLowerCase()))].filter(Boolean);
}

// Servir la vista principal de registros
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const [uRows] = await pool.execute(
      'SELECT ID, Nombre, Rol FROM Maestro_Usuarios WHERE ID = ?',
      [usuario]
    );
    if (!uRows.length) {
      return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');
    }

    const pathTemplate = path.join(__dirname, '../views/logysign/registros.html');
    const html = fs.readFileSync(pathTemplate, 'utf8');

    const config = JSON.stringify({
      usuarioId: uRows[0].ID,
      usuarioNombre: uRows[0].Nombre,
      usuarioRol: uRows[0].Rol || ''
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[registrologysign] Error serving records page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// API: Obtener registros (Soporta rol de Sistema para ver todo, sino filtra por creador)
router.get('/api/registros', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'Usuario requerido' });
    }

    // Consultar rol
    const [uRows] = await pool.execute(
      'SELECT Rol FROM Maestro_Usuarios WHERE ID = ?',
      [usuario]
    );
    if (!uRows.length) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const rol = uRows[0].Rol || '';
    let query = '';
    let params = [];

    if (rol === 'Sistema') {
      // Sistema ve TODOS los registros
      query = `
        SELECT dl.*, cdt.Documento AS nombre_documento, mu.Nombre AS nombre_creador
        FROM Dynamic_Logysign dl
        LEFT JOIN Config_Doc_Trabajador cdt ON dl.id_config_doc = cdt.Id
        LEFT JOIN Maestro_Usuarios mu ON dl.usuario_creador = mu.ID
        ORDER BY dl.fecha_registro DESC
      `;
    } else {
      // Otros usuarios ven solo sus propios registros
      query = `
        SELECT dl.*, cdt.Documento AS nombre_documento, mu.Nombre AS nombre_creador
        FROM Dynamic_Logysign dl
        LEFT JOIN Config_Doc_Trabajador cdt ON dl.id_config_doc = cdt.Id
        LEFT JOIN Maestro_Usuarios mu ON dl.usuario_creador = mu.ID
        WHERE dl.usuario_creador = ?
        ORDER BY dl.fecha_registro DESC
      `;
      params = [usuario];
    }

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[registrologysign] Error fetching records:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Reenviar invitación por correo
router.post('/api/reenviar', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'ID de registro requerido' });
    }

    // Consultar detalles del registro
    const [rows] = await pool.execute(
      `SELECT dl.*, cdt.Documento AS nombre_documento 
       FROM Dynamic_Logysign dl
       LEFT JOIN Config_Doc_Trabajador cdt ON dl.id_config_doc = cdt.Id
       WHERE dl.id = ? AND dl.estado = 'PENDIENTE'`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'El registro no existe, ya fue firmado o el enlace expiró' });
    }

    const logysign = rows[0];

    // Resolver CC
    const ccEmails = await obtenerCcEmails(
      logysign.usuario_creador, 
      logysign.regional, 
      logysign.operacion, 
      logysign.id_config_doc
    );

    const scheme = req.secure ? 'https' : 'http';
    const host = req.get('host');
    const linkFirma = `${scheme}://${host}/logysign/sign/${logysign.token}`;

    const mailBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #edf2f7;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.05)">
        <div style="background:#000b59;padding:20px;border-top-left-radius:8px;border-top-right-radius:8px;text-align:center">
          <h2 style="color:#ffffff;margin:0;font-size:1.5rem">LOG&SER — Recordatorio de Firma</h2>
        </div>
        <div style="padding:24px;background:#ffffff">
          <p style="font-size:1.05rem;color:#2d3748">Hola <strong>${logysign.nombre_trabajador}</strong>,</p>
          <p style="color:#4a5568;line-height:1.6">Le recordamos que tiene un documento oficial pendiente que requiere su firma digital. Por favor haga clic en el siguiente enlace para revisarlo y firmarlo de forma segura:</p>
          
          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:0.9rem">
            <tr style="background:#f7fafc"><td style="padding:10px;font-weight:bold;color:#4a5568;width:35%">Trabajador</td><td style="padding:10px">${logysign.nombre_trabajador} (${logysign.identificacion})</td></tr>
            <tr><td style="padding:10px;font-weight:bold;color:#4a5568">Documento</td><td style="padding:10px">${logysign.nombre_documento || logysign.prefijo}</td></tr>
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

    await transporter.sendMail({
      from: `"LOG&SER Gestión Documental" <${process.env.EMAIL_FROM || 'noreply@logyser.com'}>`,
      to: logysign.email_trabajador,
      cc: ccEmails.length ? ccEmails.join(', ') : undefined,
      subject: `LOG&SER: RECORDATORIO — Documento pendiente de firma (${logysign.nombre_documento || logysign.prefijo})`,
      html: mailBody
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[registrologysign] Error sending reminder:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
