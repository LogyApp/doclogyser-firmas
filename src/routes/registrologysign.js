const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const pool = require('../services/db');
const { transporter } = require('../services/email');

const { obtenerCcEmails } = require('../services/logysignScheduler');

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
        SELECT dl.*, cdt.Documento AS nombre_documento, mu.Nombre AS nombre_creador, s.Celular AS celular_trabajador,
               dn.id_descuento AS auto_id_descuento, dn.token_firma AS auto_token_firma, dn.url_doc AS auto_url_doc
        FROM Dynamic_Logysign dl
        LEFT JOIN Config_Doc_Trabajador cdt ON dl.id_config_doc = cdt.Id
        LEFT JOIN Maestro_Usuarios mu ON dl.usuario_creador = mu.ID
        LEFT JOIN Maestro_Segmentación s ON dl.identificacion = s.Identificación
        LEFT JOIN Dynamic_descuentonomina dn ON dl.id_descuento_auto = dn.id_descuento
        ORDER BY dl.fecha_registro DESC
      `;
    } else {
      // Otros usuarios ven solo sus propios registros
      query = `
        SELECT dl.*, cdt.Documento AS nombre_documento, mu.Nombre AS nombre_creador, s.Celular AS celular_trabajador,
               dn.id_descuento AS auto_id_descuento, dn.token_firma AS auto_token_firma, dn.url_doc AS auto_url_doc
        FROM Dynamic_Logysign dl
        LEFT JOIN Config_Doc_Trabajador cdt ON dl.id_config_doc = cdt.Id
        LEFT JOIN Maestro_Usuarios mu ON dl.usuario_creador = mu.ID
        LEFT JOIN Maestro_Segmentación s ON dl.identificacion = s.Identificación
        LEFT JOIN Dynamic_descuentonomina dn ON dl.id_descuento_auto = dn.id_descuento
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

    // Consultar detalles del registro (con join a descuentonomina)
    const [rows] = await pool.execute(
      `SELECT dl.*, cdt.Documento AS nombre_documento,
              dn.id_descuento AS auto_id_descuento, dn.token_firma AS auto_token_firma, dn.url_doc AS auto_url_doc
       FROM Dynamic_Logysign dl
       LEFT JOIN Config_Doc_Trabajador cdt ON dl.id_config_doc = cdt.Id
       LEFT JOIN Dynamic_descuentonomina dn ON dl.id_descuento_auto = dn.id_descuento
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

    let mailBody = '';
    let mailSubject = `LOG&SER: RECORDATORIO — Documento pendiente de firma (${logysign.nombre_documento || logysign.prefijo})`;

    if (Number(logysign.id_config_doc) === 18 && logysign.auto_id_descuento) {
      const linkFirmaDescuento = `${scheme}://${host}/descuentonomina/firmar?item=${logysign.auto_id_descuento}&token=${logysign.auto_token_firma}`;
      mailSubject = `LOG&SER: RECORDATORIO — Documentos pendientes de ingreso (Contrato y Autorización Descuento) — ${logysign.nombre_trabajador}`;
      mailBody = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #edf2f7;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.05)">
          <div style="background:#000b59;padding:20px;border-top-left-radius:8px;border-top-right-radius:8px;text-align:center">
            <h2 style="color:#ffffff;margin:0;font-size:1.5rem">LOG&SER — Recordatorio de Ingreso</h2>
          </div>
          <div style="padding:24px;background:#ffffff">
            <p style="font-size:1.05rem;color:#2d3748">¡Hola <strong>${logysign.nombre_trabajador}</strong>!</p>
            <p style="color:#4a5568;line-height:1.6">Le recordamos que tiene documentos obligatorios pendientes de firma para completar su proceso de ingreso a Logyser. Por favor acceda a los siguientes enlaces para firmarlos de forma segura:</p>
            
            <div style="margin:24px 0;border-left:4px solid #000b59;padding-left:16px">
              <p style="margin:0 0 8px 0;font-weight:bold;color:#2d3748">📄 1. Contrato de Trabajo:</p>
              <p style="margin:0 0 12px 0;font-size:0.9rem;color:#4a5568">(Por favor verifica que tus datos personales estén correctos y lee las condiciones antes de firmar).</p>
              <a href="${linkFirma}" target="_blank" style="background:#000b59;color:#ffffff;padding:8px 16px;text-decoration:none;font-weight:bold;border-radius:4px;display:inline-block;font-size:0.85rem">Firmar Contrato de Trabajo</a>
            </div>

            <div style="margin:24px 0;border-left:4px solid #000b59;padding-left:16px">
              <p style="margin:0 0 8px 0;font-weight:bold;color:#2d3748">📝 2. Autorización de Descuento por Nómina:</p>
              <p style="margin:0 0 12px 0;font-size:0.9rem;color:#4a5568">(Este formato es un requisito estándar de la compañía que se firma de manera preventiva para respaldar los activos y herramientas de trabajo frente a daños o pérdidas).</p>
              <a href="${linkFirmaDescuento}" target="_blank" style="background:#000b59;color:#ffffff;padding:8px 16px;text-decoration:none;font-weight:bold;border-radius:4px;display:inline-block;font-size:0.85rem">Firmar Autorización de Descuento</a>
            </div>

            <p style="color:#4a5568;line-height:1.6;font-size:0.95rem">Una vez firmes ambos documentos, el sistema enviará los respaldos directamente a nuestro soporte legal.</p>
            <p style="color:#4a5568;line-height:1.6;font-size:0.95rem">Por último, si deseas afiliar beneficiarios a la caja de compensación, dime qué beneficiario deseas afiliar y te indicaré los documentos que me debes enviar para su respectiva afiliación.</p>
          </div>
          <div style="background:#f7fafc;padding:16px;border-bottom-left-radius:8px;border-bottom-right-radius:8px;text-align:center;border-top:1px solid #edf2f7">
            <p style="font-size:0.8rem;color:#a0aec0;margin:0">Este es un correo automático. Por favor no responda directamente a este mensaje.</p>
          </div>
        </div>
      `;
    } else {
      mailBody = `
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
    }

    await transporter.sendMail({
      from: `"LOG&SER Gestión Documental" <${process.env.EMAIL_FROM || 'noreply@logyser.com'}>`,
      to: logysign.email_trabajador,
      cc: ccEmails.length ? ccEmails.join(', ') : undefined,
      subject: mailSubject,
      html: mailBody
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[registrologysign] Error sending reminder:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Actualizar causa de un registro
router.post('/api/update-causa', async (req, res) => {
  try {
    const { id, idConfigDoc, causa } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'ID de registro requerido' });
    }

    const cleanCausa = causa ? causa.trim() : null;

    // Si la causa es nueva y el documento es 55, guardarla en Config_Motivos_Documento
    if (Number(idConfigDoc) === 55 && cleanCausa) {
      const [mRows] = await pool.execute(
        'SELECT id FROM Config_Motivos_Documento WHERE id_config_doc = 55 AND LOWER(motivo) = ?',
        [cleanCausa.toLowerCase()]
      );
      if (!mRows.length) {
        await pool.execute(
          'INSERT INTO Config_Motivos_Documento (id_config_doc, motivo) VALUES (55, ?)',
          [cleanCausa]
        );
      }
    }

    // Actualizar causa en Dynamic_Logysign
    await pool.execute(
      'UPDATE Dynamic_Logysign SET causa = ? WHERE id = ?',
      [cleanCausa, id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[registrologysign] Error updating causa:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Actualizar contacto del colaborador
router.post('/api/actualizar-contacto', async (req, res) => {
  try {
    const { identificacion, email, celular, usuario } = req.body;
    if (!identificacion || !usuario) {
      return res.status(400).json({ error: 'Parámetros incompletos' });
    }

    // Verificar usuario
    const [uRows] = await pool.execute(
      'SELECT Rol FROM Maestro_Usuarios WHERE ID = ?',
      [usuario]
    );
    if (!uRows.length) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    // 1. Actualizar en Maestro_Segmentación
    await pool.execute(
      'UPDATE Maestro_Segmentación SET Celular = ?, Email = ? WHERE Identificación = ?',
      [celular || null, email || null, identificacion]
    );

    // 2. Actualizar en Dynamic_Logysign
    await pool.execute(
      'UPDATE Dynamic_Logysign SET email_trabajador = ? WHERE identificacion = ?',
      [email || '', identificacion]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[registrologysign] Error updating contact:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Eliminar registro (Solo para rol de Sistema si no está firmado)
router.delete('/api/eliminar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;
    if (!id || !usuario) {
      return res.status(400).json({ error: 'Parámetros incompletos' });
    }

    const [uRows] = await pool.execute(
      'SELECT Rol FROM Maestro_Usuarios WHERE ID = ?',
      [usuario]
    );
    if (!uRows.length || uRows[0].Rol !== 'Sistema') {
      return res.status(403).json({ error: 'No autorizado. Solo el rol Sistema puede eliminar registros.' });
    }

    // Verificar si el registro ya fue firmado
    const [logRows] = await pool.execute(
      'SELECT estado FROM Dynamic_Logysign WHERE id = ?',
      [id]
    );
    if (!logRows.length) {
      return res.status(404).json({ error: 'El registro no existe' });
    }

    if (logRows[0].estado === 'FIRMADO') {
      return res.status(400).json({ error: 'No se puede eliminar un registro que ya fue firmado' });
    }

    // Eliminar
    await pool.execute(
      'DELETE FROM Dynamic_Logysign WHERE id = ?',
      [id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[registrologysign] Error deleting record:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Procesar como "No Firma" (Soporte Correo)
router.post('/api/no-firma', async (req, res) => {
  try {
    const { id, anotacion } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'ID de registro requerido' });
    }

    // 1. Fetch Dynamic_Logysign record
    const [dRows] = await pool.execute(
      `SELECT dl.*, cdt.Documento AS nombre_documento 
       FROM Dynamic_Logysign dl
       LEFT JOIN Config_Doc_Trabajador cdt ON dl.id_config_doc = cdt.Id
       WHERE dl.id = ? AND dl.estado = "PENDIENTE"`,
      [id]
    );
    if (!dRows.length) {
      return res.status(404).json({ error: 'El registro no existe, ya fue firmado o el enlace expiró' });
    }

    const logysign = dRows[0];

    // 2. Download original PDF
    const { storage } = require('../services/storage');
    const bucketPdfs = storage.bucket(process.env.BUCKET_PDFS || 'talenthub_central');
    const parsedUrl = new URL(logysign.original_pdf_url);
    const pathInBucket = parsedUrl.pathname.replace(/^\/[^\/]+\//, ''); // strip bucket name
    const originalPdfFile = bucketPdfs.file(pathInBucket);
    const [originalPdfBuffer] = await originalPdfFile.download();

    // 3. Overlay annotation text on PDF using pdf-lib
    const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
    const pdfDoc = await PDFDocument.load(originalPdfBuffer);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    let boxes = [];
    if (logysign.firmas_coordenadas) {
      try {
        boxes = JSON.parse(logysign.firmas_coordenadas);
      } catch (err) {
        console.warn('[logysign] Error parsing firmas_coordenadas:', err.message);
      }
    }

    if (!Array.isArray(boxes) || boxes.length === 0) {
      boxes = [{
        page: logysign.firma_page || 1,
        x: logysign.firma_x || 0.5,
        y: logysign.firma_y || 0.8,
        w: logysign.firma_w || 0.2,
        h: logysign.firma_h || 0.1
      }];
    }

    const textToDraw = anotacion || 'El trabajador no firma,\nse soporta por correo electrónico';
    const textLines = textToDraw.split('\n');

    // Draw text in each signature box
    for (const box of boxes) {
      const pageIdx = Math.min(box.page, pages.length) - 1;
      if (pageIdx >= 0 && pageIdx < pages.length) {
        const targetPage = pages[pageIdx];
        const { width: pageWidth, height: pageHeight } = targetPage.getSize();

        // Transform relative coordinate system (top-left) to PDF points (bottom-left)
        const pdfX = box.x * pageWidth;
        const pdfY = (1 - box.y - box.h) * pageHeight;
        const pdfW = box.w * pageWidth;
        const pdfH = box.h * pageHeight;

        // Draw annotation lines inside the box bounds
        let currentY = pdfY + pdfH - 8;
        for (const line of textLines) {
          targetPage.drawText(line, {
            x: pdfX + 4,
            y: currentY,
            size: 6,
            font: helveticaFont,
            color: rgb(0.8, 0.1, 0.1),
          });
          currentY -= 8;
        }
      }
    }

    const signedPdfBytes = await pdfDoc.save();

    // 4. Upload finished PDF to talenthub_central
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const timestampStr = `${yyyy}${mm}${dd}${hh}${ss}`;

    const finalPdfName = `${logysign.identificacion}/${logysign.identificacion}.${logysign.prefijo}.${timestampStr}.pdf`;
    const finalPdfFile = bucketPdfs.file(finalPdfName);
    
    await finalPdfFile.save(Buffer.from(signedPdfBytes), { contentType: 'application/pdf' });
    const finalPdfUrl = `https://storage.googleapis.com/${bucketPdfs.name}/${finalPdfName}`;

    // 5. Update Dynamic_Logysign to FIRMADO
    await pool.execute(
      'UPDATE Dynamic_Logysign SET estado = "FIRMADO" WHERE id = ?',
      [id]
    );

    // 6. Get worker current status
    const [vRows] = await pool.execute(
      'SELECT Estado FROM `Maestro_Vinculación` WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [logysign.identificacion]
    );
    const estadoTrabajador = vRows.length ? vRows[0].Estado : 'Activo';

    // 7. Save entry in Maestro_docTrabajador
    const docTrabajadorId = `logysign-${logysign.id}`;
    await pool.execute(
      `INSERT INTO Maestro_docTrabajador
       (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
        TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud, Justificacion_Solicitud, Usuario)
       VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, 'El trabajador no firma (soporte correo electrónico)', NULL, NULL, NULL, ?)`,
      [
        docTrabajadorId,
        logysign.regional,
        logysign.operacion,
        logysign.identificacion,
        estadoTrabajador,
        logysign.fecha_ingreso,
        logysign.id_config_doc,
        logysign.prefijo,
        finalPdfUrl,
        logysign.usuario_creador
      ]
    );

    res.json({ success: true, finalPdfUrl });
  } catch (err) {
    console.error('[registrologysign] Error in /api/no-firma:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
