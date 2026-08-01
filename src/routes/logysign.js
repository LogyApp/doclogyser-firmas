const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../services/db');
const { storage, obtenerFirmaBase64Reciente } = require('../services/storage');
const { transporter } = require('../services/email');

const upload = multer({ storage: multer.memoryStorage() });

// Preventively check and add firmas_coordenadas column if not exists
(async () => {
  try {
    await pool.execute(`
      ALTER TABLE Dynamic_Logysign 
      ADD COLUMN firmas_coordenadas TEXT NULL
    `);
    console.log('[logysign] Column firmas_coordenadas verified/added successfully.');
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.error('[logysign] Error checking column firmas_coordenadas:', e);
    }
  }
})();

// Helper to resolve CC emails list
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

// ═════ SERVIR INTERFAZ CREADOR (form.html) ═════
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

    const pathTemplate = path.join(__dirname, '../views/logysign/form.html');
    const html = fs.readFileSync(pathTemplate, 'utf8');

    const config = JSON.stringify({
      usuarioId: uRows[0].ID,
      usuarioNombre: uRows[0].Nombre,
      usuarioRol: uRows[0].Rol || ''
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[logysign] Error serving form page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// ═════ SERVIR INTERFAZ FIRMA TRABAJADOR (sign.html) ═════
router.get('/sign/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const [rows] = await pool.execute(
      `SELECT dl.*, cdt.Documento AS nombre_documento 
       FROM Dynamic_Logysign dl
       LEFT JOIN Config_Doc_Trabajador cdt ON dl.id_config_doc = cdt.Id
       WHERE dl.token = ? AND dl.estado = "PENDIENTE"`,
      [token]
    );
    if (!rows.length) {
      return res.status(404).send('<h2>Error: Enlace de firma inválido, ya utilizado o expirado</h2>');
    }

    const logysign = rows[0];
    if (logysign.token_expira && new Date() > new Date(logysign.token_expira)) {
      return res.status(410).send('<h2>Error: El enlace de firma ha expirado</h2>');
    }

    const pathTemplate = path.join(__dirname, '../views/logysign/sign.html');
    const html = fs.readFileSync(pathTemplate, 'utf8');

    const config = JSON.stringify({
      logysignId: logysign.id,
      token: logysign.token,
      identificacion: logysign.identificacion,
      nombreTrabajador: logysign.nombre_trabajador,
      emailTrabajador: logysign.email_trabajador,
      prefijo: logysign.prefijo,
      nombreDocumento: logysign.nombre_documento || logysign.prefijo,
      originalPdfUrl: `/logysign/api/pdf/${logysign.id}`,
      idConfigDoc: logysign.id_config_doc,
      firmasCoordenadas: logysign.firmas_coordenadas,
      firmaX: logysign.firma_x,
      firmaY: logysign.firma_y,
      firmaW: logysign.firma_w,
      firmaH: logysign.firma_h,
      firmaPage: logysign.firma_page
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[logysign] Error serving sign page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// ═════ API: SERVIR PDF TEMPORAL ORIGINAL DESDE GCS ═════
router.get('/api/pdf/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT original_pdf_url FROM Dynamic_Logysign WHERE id = ?',
      [id]
    );
    if (!rows.length) {
      return res.status(404).send('PDF no encontrado');
    }

    const { original_pdf_url } = rows[0];
    const parsedUrl = new URL(original_pdf_url);
    const pathInBucket = parsedUrl.pathname.replace(/^\/[^\/]+\//, ''); // strip bucket name
    
    const bucketName = process.env.BUCKET_PDFS || 'talenthub_central';
    const originalPdfFile = storage.bucket(bucketName).file(pathInBucket);
    
    const [pdfBuffer] = await originalPdfFile.download();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[logysign] Error proxying PDF:', err);
    res.status(500).send('Error al descargar el PDF de la nube');
  }
});

// ═════ API: SERVIR PDF FIRMADO FINAL DESDE GCS ═════
router.get('/api/signed-pdf/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT Doc FROM Maestro_docTrabajador WHERE id = ?',
      [`logysign-${id}`]
    );
    if (!rows.length) {
      return res.status(404).send('PDF firmado no encontrado');
    }

    const { Doc } = rows[0];
    const parsedUrl = new URL(Doc);
    const pathInBucket = parsedUrl.pathname.replace(/^\/[^\/]+\//, ''); // strip bucket name
    
    const bucketName = process.env.BUCKET_PDFS || 'talenthub_central';
    const signedPdfFile = storage.bucket(bucketName).file(pathInBucket);
    
    const [pdfBuffer] = await signedPdfFile.download();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[logysign] Error proxying signed PDF:', err);
    res.status(500).send('Error al descargar el PDF firmado');
  }
});

// ═════ API: AUTOCOMPLETADO TRABAJADORES ═════
router.get('/api/search-trabajadores', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const [rows] = await pool.execute(
      'SELECT DISTINCT Trabajador FROM Maestro_Segmentación WHERE Trabajador LIKE ? LIMIT 30',
      [`%${q.toUpperCase()}%`]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: DATOS TRABAJADOR ═════
router.get('/api/vinculacion', async (req, res) => {
  try {
    const { trabajador } = req.query;
    if (!trabajador) {
      return res.status(400).json({ error: 'Trabajador requerido' });
    }

    const [vRows] = await pool.execute(
      'SELECT Regional, `Operación` AS operacion, Cargo, `Fecha de Ingreso` AS fecha_ingreso, Estado FROM `Maestro_Vinculación` WHERE Trabajador = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [trabajador]
    );

    const [sRows] = await pool.execute(
      'SELECT Identificación AS identificacion, Celular, Email FROM Maestro_Segmentación WHERE Trabajador = ? LIMIT 1',
      [trabajador]
    );

    res.json({
      vinculacion: vRows[0] || null,
      segmentacion: sRows[0] || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: CONFIGURACIÓN DOCUMENTOS ═════
router.get('/api/config-docs', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT Id, Prefijo, Documento, Clasificacion FROM Config_Doc_Trabajador ORDER BY Clasificacion, Documento'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: OBTENER FIRMA RECIENTE ═════
router.get('/api/firma-reciente/:identificacion', async (req, res) => {
  try {
    const { identificacion } = req.params;
    const base64 = await obtenerFirmaBase64Reciente(identificacion);
    res.json({ base64 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: ENVIAR FLUJO DE FIRMA ═════
router.post('/api/enviar', upload.single('file'), async (req, res) => {
  try {
    const {
      usuarioId,
      trabajador,
      identificacion,
      emailTrabajador,
      celularTrabajador,
      regional,
      operacion,
      cargo,
      fechaIngreso,
      estadoTrabajador,
      idConfigDoc,
      prefijo,
      firmaX,
      firmaY,
      firmaW,
      firmaH,
      firmaPage,
      firmasCoordenadas
    } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Debe cargar un archivo PDF' });
    }

    // 1. Update celular/email in Maestro_Segmentación
    await pool.execute(
      'UPDATE Maestro_Segmentación SET Celular = ?, Email = ? WHERE Identificación = ?',
      [celularTrabajador, emailTrabajador, identificacion]
    );

    // 2. Upload original PDF as a temporary file to GCS
    const uuid = uuidv4();
    const cleanUuid = uuid.replace(/-/g, '');
    const originalPdfName = `${identificacion}/pending_${cleanUuid}.pdf`;
    const bucketName = process.env.BUCKET_PDFS || 'talenthub_central';
    const file = storage.bucket(bucketName).file(originalPdfName);
    
    await file.save(req.file.buffer, { contentType: 'application/pdf' });
    const originalPdfUrl = `https://storage.googleapis.com/${bucketName}/${originalPdfName}`;

    // 3. Create long safe token and expiry
    const token = uuidv4();
    const tokenExpira = new Date();
    tokenExpira.setDate(tokenExpira.getDate() + 30); // 30 days expiration

    const cleanFechaIngreso = (fechaIngreso && typeof fechaIngreso === 'string') 
      ? fechaIngreso.split('T')[0] 
      : null;

    // 4. Save metadata in Dynamic_Logysign
    await pool.execute(
      `INSERT INTO Dynamic_Logysign 
       (id, token, token_expira, identificacion, nombre_trabajador, email_trabajador, 
        regional, operacion, cargo, fecha_ingreso, id_config_doc, prefijo, 
        original_pdf_url, firma_x, firma_y, firma_w, firma_h, firma_page, 
        usuario_creador, estado, firmas_coordenadas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)`,
      [
        uuid,
        token,
        tokenExpira,
        identificacion,
        trabajador,
        emailTrabajador,
        regional || null,
        operacion || null,
        cargo || null,
        cleanFechaIngreso,
        idConfigDoc,
        prefijo || null,
        originalPdfUrl,
        firmaX,
        firmaY,
        firmaW,
        firmaH,
        firmaPage,
        usuarioId,
        firmasCoordenadas || null
      ]
    );

    // 5. Get CC list
    const ccEmails = await obtenerCcEmails(usuarioId, regional, operacion, idConfigDoc);

    // Get Documento name
    const [cRows] = await pool.execute(
      'SELECT Documento FROM Config_Doc_Trabajador WHERE Id = ?',
      [idConfigDoc]
    );
    const nombreDocumento = cRows.length ? cRows[0].Documento : (prefijo || 'Documento');

    // 6. Send email to worker
    const scheme = req.secure ? 'https' : 'http';
    const host = req.get('host');
    const linkFirma = `${scheme}://${host}/logysign/sign/${token}`;

    const mailBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #edf2f7;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.05)">
        <div style="background:#000b59;padding:20px;border-top-left-radius:8px;border-top-right-radius:8px;text-align:center">
          <h2 style="color:#ffffff;margin:0;font-size:1.5rem">LOG&SER — Firma de Documento</h2>
        </div>
        <div style="padding:24px;background:#ffffff">
          <p style="font-size:1.05rem;color:#2d3748">Hola <strong>${trabajador}</strong>,</p>
          <p style="color:#4a5568;line-height:1.6">Se ha generado un documento oficial que requiere su firma digital. Por favor haga clic en el siguiente enlace para revisarlo y firmarlo de forma segura:</p>
          
          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:0.9rem">
            <tr style="background:#f7fafc"><td style="padding:10px;font-weight:bold;color:#4a5568;width:35%">Trabajador</td><td style="padding:10px">${trabajador} (${identificacion})</td></tr>
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

    await transporter.sendMail({
      from: `"LOG&SER Gestión Documental" <${process.env.EMAIL_FROM || 'noreply@logyser.com'}>`,
      to: emailTrabajador,
      cc: ccEmails.length ? ccEmails.join(', ') : undefined,
      subject: `LOG&SER: Documento pendiente de firma (${nombreDocumento}) — ${trabajador}`,
      html: mailBody
    });

    res.json({ success: true, logysignId: uuid });
  } catch (err) {
    console.error('[logysign] Error en /api/enviar:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: FIRMAR (Incrustar firma, subir a talenthub, crear registro, notificar) ═════
router.post('/api/firmar', async (req, res) => {
  try {
    const { token, firmaBase64, usarFirmaReciente } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token requerido' });
    }

    // 1. Fetch Dynamic_Logysign record
    const [dRows] = await pool.execute(
      `SELECT dl.*, cdt.Documento AS nombre_documento 
       FROM Dynamic_Logysign dl
       LEFT JOIN Config_Doc_Trabajador cdt ON dl.id_config_doc = cdt.Id
       WHERE dl.token = ? AND dl.estado = "PENDIENTE"`,
      [token]
    );
    if (!dRows.length) {
      return res.status(404).json({ error: 'El documento no existe, ya fue firmado o el enlace expiró' });
    }

    const logysign = dRows[0];
    let signatureBuffer;

    if (usarFirmaReciente) {
      // Download the most recent signature from firmas-images
      const bucketFirmas = storage.bucket(process.env.BUCKET_FIRMAS || 'firmas-images');
      const [files] = await bucketFirmas.getFiles({ prefix: `${logysign.identificacion}/` });
      
      const filesSorted = files
        .filter(f => f.name.endsWith('.png'))
        .sort((a, b) => {
          const ta = new Date(a.metadata?.timeCreated || 0).getTime();
          const tb = new Date(b.metadata?.timeCreated || 0).getTime();
          return tb - ta;
        });

      if (!filesSorted.length) {
        return res.status(400).json({ error: 'No se encontró una firma previa para este trabajador.' });
      }
      
      const [buf] = await filesSorted[0].download();
      signatureBuffer = buf;
    } else {
      // Decode custom drawn signature
      if (!firmaBase64) {
        return res.status(400).json({ error: 'Debe dibujar y registrar una firma.' });
      }
      const match = firmaBase64.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ error: 'Formato de imagen de firma inválido.' });
      }
      signatureBuffer = Buffer.from(match[2], 'base64');

      // Save new signature to firmas-images so it becomes the latest for future requests
      const timestampFirma = Date.now();
      const signatureName = `${logysign.identificacion}/firma_${timestampFirma}.png`;
      const fileFirma = storage.bucket(process.env.BUCKET_FIRMAS || 'firmas-images').file(signatureName);
      await fileFirma.save(signatureBuffer, { contentType: 'image/png' });
    }

    // 2. Download original PDF
    const bucketPdfs = storage.bucket(process.env.BUCKET_PDFS || 'talenthub_central');
    const parsedUrl = new URL(logysign.original_pdf_url);
    const pathInBucket = parsedUrl.pathname.replace(/^\/[^\/]+\//, ''); // strip bucket name
    const originalPdfFile = bucketPdfs.file(pathInBucket);
    const [originalPdfBuffer] = await originalPdfFile.download();

    // 3. Overlay signature on PDF using pdf-lib
    const { PDFDocument } = require('pdf-lib');
    const pdfDoc = await PDFDocument.load(originalPdfBuffer);
    const signatureImage = await pdfDoc.embedPng(signatureBuffer);
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
      // Legacy single box fallback
      boxes = [{
        page: logysign.firma_page,
        x: logysign.firma_x,
        y: logysign.firma_y,
        w: logysign.firma_w,
        h: logysign.firma_h
      }];
    }

    // Embed each box
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

        targetPage.drawImage(signatureImage, {
          x: pdfX,
          y: pdfY,
          width: pdfW,
          height: pdfH,
        });
      }
    }

    const signedPdfBytes = await pdfDoc.save();

    // 4. Upload signed PDF
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
      'UPDATE Dynamic_Logysign SET estado = "FIRMADO" WHERE token = ?',
      [token]
    );

    // 6. Get worker current vinculación status for record
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
       VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, 'Cargado desde el modulo logysign', NULL, NULL, NULL, ?)`,
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

    // 8. Get final CC notification emails list
    const ccEmails = await obtenerCcEmails(logysign.usuario_creador, logysign.regional, logysign.operacion, logysign.id_config_doc);

    const scheme = req.secure ? 'https' : 'http';
    const host = req.get('host');
    const finalPdfProxyUrl = `${scheme}://${host}/logysign/api/signed-pdf/${logysign.id}`;

    // 9. Send email notification
    const mailBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #edf2f7;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.05)">
        <div style="background:#27ae60;padding:20px;border-top-left-radius:8px;border-top-right-radius:8px;text-align:center">
          <h2 style="color:#ffffff;margin:0;font-size:1.5rem">LOG&SER — Documento Firmado Completado</h2>
        </div>
        <div style="padding:24px;background:#ffffff">
          <p style="font-size:1.05rem;color:#2d3748">Hola,</p>
          <p style="color:#4a5568;line-height:1.6">Se informa que el colaborador <strong>${logysign.nombre_trabajador}</strong> ha completado exitosamente la firma del documento.</p>
          
          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:0.9rem">
            <tr style="background:#f7fafc"><td style="padding:10px;font-weight:bold;color:#4a5568;width:35%">Trabajador</td><td style="padding:10px">${logysign.nombre_trabajador} (${logysign.identificacion})</td></tr>
            <tr><td style="padding:10px;font-weight:bold;color:#4a5568">Documento</td><td style="padding:10px">${logysign.nombre_documento || logysign.prefijo}</td></tr>
            <tr style="background:#f7fafc"><td style="padding:10px;font-weight:bold;color:#4a5568">Fecha Firma</td><td style="padding:10px">${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</td></tr>
          </table>

          <div style="text-align:center;margin:32px 0">
            <a href="${finalPdfProxyUrl}" target="_blank" style="background:#27ae60;color:#ffffff;padding:14px 28px;text-decoration:none;font-weight:bold;border-radius:6px;display:inline-block;box-shadow:0 4px 6px rgba(39,174,96,0.15)">Ver Documento Firmado</a>
          </div>
        </div>
        <div style="background:#f7fafc;padding:16px;border-bottom-left-radius:8px;border-bottom-right-radius:8px;text-align:center;border-top:1px solid #edf2f7">
          <p style="font-size:0.8rem;color:#a0aec0;margin:0">Este es un correo automático. Por favor no responda directamente a este mensaje.</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"LOG&SER Gestión Documental" <${process.env.EMAIL_FROM || 'noreply@logyser.com'}>`,
      to: ccEmails.join(', '),
      subject: `LOG&SER: Documento firmado completado (${logysign.nombre_documento || logysign.prefijo}) — ${logysign.nombre_trabajador}`,
      html: mailBody
    });

    // 10. Clean up temporary PDF file
    try {
      await originalPdfFile.delete();
    } catch (e) {
      console.warn(`[logysign] No se pudo eliminar el PDF temporal original: ${pathInBucket}`, e.message);
    }

    res.json({ success: true, pdfUrl: `/logysign/api/signed-pdf/${logysign.id}` });
  } catch (err) {
    console.error('[logysign] Error en /api/firmar:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
