const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const pool = require('../services/db');
const { transporter, LOGO_HEADER_ATTACHMENT } = require('../services/email');
const { storage } = require('../services/storage');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const { obtenerCcEmails } = require('../services/logysignScheduler');
const { obtenerConfigLogysign, alcanceRegistros, rolEn, prefijoEn, diasMs, usuarioLogysign } = require('../services/configLogysign');
const { correoSolicitudFirma, enlaceDescuentoPendiente } = require('../services/logysignCorreos');
const { accesoSeccion } = require('../services/maestroMenu');
const { generarSoporteNoFirma, idDocSoporte } = require('../services/logysignSoporte');

// No firma y su soporte (como eliminar pendientes): quien creó el registro o 'Roles que pueden marcar No firma'
const puedeNoFirma = (cfg, rol, usuario, creador) => creador === usuario || rolEn(cfg.rolesNoFirma, rol);

// ── Config_Parametros (Modulo = 'CloudDocs', Seccion = 'LogySign') ──────────
// Roles que pueden eliminar registros ya FIRMADOS (borra PDF firmado, PDF original
// y la fila en Maestro_docTrabajador). Si la fila no existe, solo Sistema.
const CONCEPTO_ELIMINAR_FIRMADOS = 'Roles que pueden eliminar registros firmados';
const DEFAULT_ELIMINAR_FIRMADOS = 'Sistema';

function normalizarTexto(valor) {
  return String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

async function puedeEliminarFirmados(rol) {
  let lista = DEFAULT_ELIMINAR_FIRMADOS;
  try {
    const [rows] = await pool.execute(
      "SELECT Parametro FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = ? LIMIT 1",
      [CONCEPTO_ELIMINAR_FIRMADOS]
    );
    if (rows.length) lista = rows[0].Parametro == null ? '' : String(rows[0].Parametro);
  } catch (err) {
    console.error('[registrologysign] No se pudo leer el parámetro de eliminación, se usa el valor por defecto:', err.message);
  }
  const rolNorm = normalizarTexto(rol);
  return !!rolNorm && lista.split(',').map(normalizarTexto).includes(rolNorm);
}

// Borra un archivo de GCS a partir de su URL pública, salvo que otro registro de
// Maestro_docTrabajador o Dynamic_Logysign lo siga usando.
async function borrarArchivoGcs(url, { excluirDocId, excluirLogysignId }) {
  const gcsPrefix = 'https://storage.googleapis.com/';
  if (!url || !url.startsWith(gcsPrefix)) return;
  const [refDoc] = await pool.query(
    'SELECT id FROM Maestro_docTrabajador WHERE (Url = ? OR Doc = ?) AND id <> ? LIMIT 1',
    [url, url, excluirDocId || '']
  );
  const [refLog] = await pool.query(
    'SELECT id FROM Dynamic_Logysign WHERE original_pdf_url = ? AND id <> ? LIMIT 1',
    [url, excluirLogysignId || '']
  );
  if (refDoc.length || refLog.length) {
    console.log(`[registrologysign] Archivo ${url} no se borra: otro registro lo sigue usando.`);
    return;
  }
  const partes = url.substring(gcsPrefix.length).split('/');
  const file = storage.bucket(partes[0]).file(decodeURIComponent(partes.slice(1).join('/')));
  const [existe] = await file.exists();
  if (existe) {
    await file.delete();
    console.log(`[registrologysign] Archivo borrado de GCS: gs://${partes[0]}/${partes.slice(1).join('/')}`);
  }
}

// Servir la vista principal de registros
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const u = await usuarioLogysign(usuario);
    if (!u) {
      return res.status(403).send('<h2>Error: Usuario sin acceso a LogySign</h2>');
    }
    const uRows = [u];

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

// API: Parámetros de pantalla de Registros según el rol (Config_Parametros CloudDocs / LogySign).
// Los usan /registrologysign y la pestaña LogySign de Cloud Docs.
router.get('/api/parametros', async (req, res) => {
  try {
    const { usuario } = req.query;
    const u = await usuarioLogysign(usuario);
    if (!u) return res.status(403).json({ error: 'Usuario sin acceso a LogySign' });
    const rol = u.Rol || '';
    const cfg = await obtenerConfigLogysign();
    res.json({
      verCreador: alcanceRegistros(cfg, rol) !== 'propios',
      verCausa: rolEn(cfg.rolesCausa, rol),
      textoNoFirma: cfg.textoNoFirma,
      notificaciones: cfg.notificaciones,
      // Botón "Descuentos": quien tenga acceso a Cloud Docs › DescuentoNomina en Maestro_Menu
      verDescuentos: (await accesoSeccion('clouddocs', rol, 'DescuentoNomina')) != null,
    });
  } catch (err) {
    console.error('[registrologysign] Error en /api/parametros:', err);
    res.status(500).json({ error: err.message });
  }
});

// Estado que se muestra: un PENDIENTE con el enlace vencido se ve como VENCIDO
function estadoVista(r) {
  if (r.estado === 'PENDIENTE' && r.token_expira && new Date(r.token_expira) < new Date()) return 'VENCIDO';
  return r.estado;
}

// API: Obtener registros. Alcance por Config_Parametros CloudDocs / LogySign: 'Roles que ven todos
// los registros' (Sistema); 'Roles que ven los Documentos de Ingreso' (Contratación, Archivo,
// Asistencial) ven esa clasificación más lo que crearon; el resto, solo lo que crearon.
router.get('/api/registros', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'Usuario requerido' });
    }

    const u = await usuarioLogysign(usuario);
    if (!u) {
      return res.status(403).json({ error: 'Usuario sin acceso a LogySign' });
    }

    const rol = u.Rol || '';
    const cfg = await obtenerConfigLogysign();
    const alcance = alcanceRegistros(cfg, rol);
    let where = '';
    let params = [];
    if (alcance === 'ingreso') {
      where = 'WHERE cdt.Clasificacion LIKE ? OR dl.usuario_creador = ?';
      params = [`%${cfg.clasificacionIngreso}%`, usuario];
    } else if (alcance === 'propios') {
      where = 'WHERE dl.usuario_creador = ?';
      params = [usuario];
    }

    const [rows] = await pool.execute(
      `SELECT dl.*, cdt.Documento AS nombre_documento, mu.Nombre AS nombre_creador, s.Celular AS celular_trabajador,
              dn.id_descuento AS auto_id_descuento, dn.token_firma AS auto_token_firma, dn.url_doc AS auto_url_doc,
              sop.id AS soporte_id
       FROM Dynamic_Logysign dl
       LEFT JOIN Config_Doc_Trabajador cdt ON dl.id_config_doc = cdt.Id
       LEFT JOIN Maestro_Usuarios mu ON dl.usuario_creador = mu.ID
       LEFT JOIN Maestro_Segmentación s ON dl.identificacion = s.Identificación
       LEFT JOIN Dynamic_descuentonomina dn ON dl.id_descuento_auto = dn.id_descuento
       LEFT JOIN Maestro_docTrabajador sop ON sop.id = CONCAT('logysign-nf-', dl.id)
       ${where}
       ORDER BY dl.fecha_registro DESC`,
      params
    );
    // puede_eliminar (Config_Parametros CloudDocs / LogySign): los FIRMADOS, 'Roles que pueden eliminar
    // registros firmados'; los demás, quien los creó o 'Roles que pueden eliminar registros pendientes'.
    const eliminaFirmados = await puedeEliminarFirmados(rol);
    const eliminaPendientes = rolEn(cfg.rolesEliminarPendientes, rol);
    rows.forEach(r => {
      r.puede_eliminar = r.estado === 'FIRMADO' ? eliminaFirmados : (eliminaPendientes || r.usuario_creador === usuario);
      r.no_firma = !!r.no_firma_fecha;
      r.estado_vista = r.estado === 'FIRMADO' && r.no_firma ? 'NO_FIRMA' : estadoVista(r);
      r.puede_no_firma = puedeNoFirma(cfg, rol, usuario, r.usuario_creador);
      r.soporte_existe = !!r.soporte_id;
      r.causa_editable = prefijoEn(cfg.docsCausaEditable, r.prefijo);
      // El mensaje de WhatsApp lleva los dos enlaces si la Autorización de Descuento sigue sin firmar
      r.con_descuento = !!(r.auto_id_descuento && !r.auto_url_doc);
    });
    res.json(rows);
  } catch (err) {
    console.error('[registrologysign] Error fetching records:', err);
    res.status(500).json({ error: err.message });
  }
});

// ¿El usuario puede ver este registro? Debe tener acceso a LogySign (Maestro_Menu) y el registro
// estar en su alcance, la misma regla que /api/registros. Devuelve el registro (con sus
// coordenadas y el rol del usuario en .rolUsuario) o null.
async function obtenerRegistroVisible(usuario, id) {
  const u = await usuarioLogysign(usuario);
  if (!u) return null;
  const rol = u.Rol || '';
  const cfg = await obtenerConfigLogysign();
  const alcance = alcanceRegistros(cfg, rol);
  const [rows] = await pool.execute(
    `SELECT dl.id, dl.estado, dl.identificacion, dl.prefijo, dl.usuario_creador, dl.original_pdf_url,
            dl.firmas_coordenadas, dl.firma_page, dl.firma_x, dl.firma_y, dl.firma_w, dl.firma_h,
            cdt.Clasificacion
     FROM Dynamic_Logysign dl
     LEFT JOIN Config_Doc_Trabajador cdt ON dl.id_config_doc = cdt.Id
     WHERE dl.id = ?`,
    [id]
  );
  if (!rows.length) return null;
  const reg = { ...rows[0], rolUsuario: rol };
  if (alcance === 'todo') return reg;
  if (reg.usuario_creador === usuario) return reg;
  if (alcance === 'ingreso' && String(reg.Clasificacion || '').includes(cfg.clasificacionIngreso)) return reg;
  return null;
}

const SIN_PERMISO_REGISTRO = 'Registro no encontrado o sin permiso para gestionarlo';

// API: Vista previa de un documento pendiente de firma: el PDF que se subió con el/los
// cuadro(s) de firma marcados donde firmará el trabajador. No guarda nada.
router.get('/api/vista-previa/:id', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).send('Usuario requerido');

    const reg = await obtenerRegistroVisible(usuario, req.params.id);
    if (!reg) return res.status(404).send('Documento no encontrado o sin permiso para verlo');
    if (!reg.original_pdf_url) return res.status(404).send('El registro no tiene documento cargado');

    const bucketName = process.env.BUCKET_PDFS || 'talenthub_central';
    const pathInBucket = new URL(reg.original_pdf_url).pathname.replace(/^\/[^\/]+\//, ''); // sin el nombre del bucket
    const [pdfBuffer] = await storage.bucket(bucketName).file(pathInBucket).download();

    // Cuadros de firma: mismas coordenadas y misma conversión que al firmar (logysign /api/firmar)
    let boxes = [];
    if (reg.firmas_coordenadas) {
      try { boxes = JSON.parse(reg.firmas_coordenadas); } catch { boxes = []; }
    }
    if (!Array.isArray(boxes) || !boxes.length) {
      boxes = reg.firma_page ? [{ page: reg.firma_page, x: reg.firma_x, y: reg.firma_y, w: reg.firma_w, h: reg.firma_h }] : [];
    }

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const fuente = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();
    const azul = rgb(0.106, 0.165, 0.369); // #1B2A5E
    for (const box of boxes) {
      const pageIdx = Math.min(Number(box.page), pages.length) - 1;
      if (!(pageIdx >= 0)) continue;
      const page = pages[pageIdx];
      const { width: pw, height: ph } = page.getSize();
      const x = Number(box.x) * pw;
      const y = (1 - Number(box.y) - Number(box.h)) * ph;
      const w = Number(box.w) * pw;
      const h = Number(box.h) * ph;
      page.drawRectangle({
        x, y, width: w, height: h,
        color: azul, opacity: 0.07,
        borderColor: azul, borderWidth: 1.2, borderOpacity: 0.9, borderDashArray: [4, 3],
      });
      const texto = 'Firma del trabajador';
      const size = Math.max(5, Math.min(10, h * 0.28, (w * 0.9) / (fuente.widthOfTextAtSize(texto, 1) || 1)));
      page.drawText(texto, {
        x: x + (w - fuente.widthOfTextAtSize(texto, size)) / 2,
        y: y + (h - size) / 2,
        size, font: fuente, color: azul, opacity: 0.85,
      });
    }

    const salida = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Vista_previa_${reg.identificacion}.${reg.prefijo || 'documento'}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(salida));
  } catch (err) {
    console.error('[registrologysign] Error generando vista previa:', err);
    res.status(500).send('Error al generar la vista previa del documento');
  }
});

// API: Reenviar invitación por correo. Renueva el plazo del enlace de firma (y el de la
// Autorización de Descuento que lo acompaña, si sigue sin firmar), así que también sirve
// para reactivar un enlace vencido. Si las notificaciones de correo de LogySign están
// apagadas, solo renueva el enlace para compartirlo por WhatsApp o copiarlo.
router.post('/api/reenviar', async (req, res) => {
  try {
    const { id, usuario } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'ID de registro requerido' });
    }
    if (!(await obtenerRegistroVisible(usuario, id))) {
      return res.status(403).json({ error: SIN_PERMISO_REGISTRO });
    }

    const [rows] = await pool.execute(
      `SELECT dl.*, cdt.Documento AS nombre_documento
       FROM Dynamic_Logysign dl
       LEFT JOIN Config_Doc_Trabajador cdt ON dl.id_config_doc = cdt.Id
       WHERE dl.id = ? AND dl.estado = 'PENDIENTE'`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'El registro no existe o ya fue firmado' });
    }

    const logysign = rows[0];
    const cfg = await obtenerConfigLogysign();
    const nuevaExpira = new Date(Date.now() + diasMs(cfg.diasEnlace));
    // ultimo_recordatorio: el recordatorio automático vuelve a contar los días desde este reenvío
    await pool.execute('UPDATE Dynamic_Logysign SET token_expira = ?, ultimo_recordatorio = NOW() WHERE id = ?', [nuevaExpira, id]);
    if (logysign.id_descuento_auto) {
      await pool.execute(
        "UPDATE Dynamic_descuentonomina SET token_expira = ? WHERE id_descuento = ? AND (url_doc IS NULL OR url_doc = '')",
        [new Date(Date.now() + diasMs(cfg.diasDescuento)), logysign.id_descuento_auto]
      );
    }

    if (!cfg.notificaciones) {
      return res.json({
        success: true,
        correoEnviado: false,
        token_expira: nuevaExpira,
        mensaje: 'Enlace renovado. Las notificaciones de correo de LogySign están deshabilitadas: compártalo por WhatsApp o copiando el enlace.',
      });
    }

    const ccEmails = await obtenerCcEmails(
      logysign.usuario_creador,
      logysign.identificacion,
      logysign.id_config_doc
    );

    const baseUrl = `${req.secure ? 'https' : 'http'}://${req.get('host')}`;
    const correo = correoSolicitudFirma({
      nombreTrabajador: logysign.nombre_trabajador,
      identificacion: logysign.identificacion,
      nombreDocumento: logysign.nombre_documento || logysign.prefijo,
      cargo: logysign.cargo,
      operacion: logysign.operacion,
      linkFirma: `${baseUrl}/logysign/sign/${logysign.token}`,
      linkDescuento: await enlaceDescuentoPendiente(baseUrl, logysign.id_descuento_auto),
      recordatorio: true,
    });

    await transporter.sendMail({
      from: `"LOG&SER Gestión Documental" <${process.env.EMAIL_FROM || 'noreply@logyser.com'}>`,
      to: logysign.email_trabajador,
      cc: ccEmails.length ? ccEmails.join(', ') : undefined,
      subject: correo.subject,
      html: correo.html,
      attachments: [LOGO_HEADER_ATTACHMENT],
    });

    res.json({ success: true, correoEnviado: true, token_expira: nuevaExpira });
  } catch (err) {
    console.error('[registrologysign] Error sending reminder:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Actualizar causa de un registro
router.post('/api/update-causa', async (req, res) => {
  try {
    const { id, causa, usuario } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'ID de registro requerido' });
    }
    if (!(await obtenerRegistroVisible(usuario, id))) {
      return res.status(403).json({ error: SIN_PERMISO_REGISTRO });
    }

    const [lRows] = await pool.execute('SELECT id_config_doc, prefijo FROM Dynamic_Logysign WHERE id = ?', [id]);
    if (!lRows.length) {
      return res.status(404).json({ error: 'El registro no existe' });
    }
    const idConfigDoc = lRows[0].id_config_doc;
    const cleanCausa = causa ? causa.trim() : null;

    // Si la causa es nueva y el documento está en 'Documentos que piden Causa', se guarda en Config_Motivos_Documento
    const cfg = await obtenerConfigLogysign();
    if (prefijoEn(cfg.docsCausa, lRows[0].prefijo) && cleanCausa) {
      const [mRows] = await pool.execute(
        'SELECT id FROM Config_Motivos_Documento WHERE id_config_doc = ? AND LOWER(motivo) = ?',
        [idConfigDoc, cleanCausa.toLowerCase()]
      );
      if (!mRows.length) {
        await pool.execute(
          'INSERT INTO Config_Motivos_Documento (id_config_doc, motivo) VALUES (?, ?)',
          [idConfigDoc, cleanCausa]
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

    // Solo quien ve al menos un registro de LogySign de ese trabajador
    const [delTrabajador] = await pool.execute('SELECT id FROM Dynamic_Logysign WHERE identificacion = ?', [identificacion]);
    let visible = false;
    for (const r of delTrabajador) {
      if (await obtenerRegistroVisible(usuario, r.id)) { visible = true; break; }
    }
    if (!visible) {
      return res.status(403).json({ error: 'Sin permiso para actualizar el contacto de este trabajador' });
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

// API: Eliminar registro (debe estar en el alcance del usuario). Los FIRMADOS solo los roles de
// 'Roles que pueden eliminar registros firmados' (por defecto Sistema); los demás, quien los creó o
// 'Roles que pueden eliminar registros pendientes' (por defecto Sistema).
// Borra todo rastro: PDF firmado y PDF original en el bucket, la fila de
// Maestro_docTrabajador (logysign-<id>) y la de Dynamic_Logysign.
router.delete('/api/eliminar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;
    if (!id || !usuario) {
      return res.status(400).json({ error: 'Parámetros incompletos' });
    }

    const registro = await obtenerRegistroVisible(usuario, id);
    if (!registro) {
      return res.status(403).json({ error: SIN_PERMISO_REGISTRO });
    }

    if (registro.estado === 'FIRMADO') {
      if (!(await puedeEliminarFirmados(registro.rolUsuario))) {
        return res.status(403).json({ error: 'Solo el rol autorizado puede eliminar un registro que ya fue firmado' });
      }
    } else {
      const cfg = await obtenerConfigLogysign();
      if (registro.usuario_creador !== usuario && !rolEn(cfg.rolesEliminarPendientes, registro.rolUsuario)) {
        return res.status(403).json({ error: 'Solo quien creó el registro o un rol autorizado puede eliminarlo' });
      }
    }

    const docId = `logysign-${id}`;
    const [docRows] = await pool.execute(
      'SELECT Doc, Url FROM Maestro_docTrabajador WHERE id = ?',
      [docId]
    );

    // 1. Archivos del bucket primero: si alguno falla no se toca la base y se puede reintentar.
    const urls = new Set([registro.original_pdf_url]);
    docRows.forEach(d => { urls.add(d.Doc); urls.add(d.Url); });
    for (const url of urls) {
      await borrarArchivoGcs(url, { excluirDocId: docId, excluirLogysignId: id });
    }

    // 2. Filas en la base de datos
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM Maestro_docTrabajador WHERE id = ?', [docId]);
      await conn.execute('DELETE FROM Dynamic_Logysign WHERE id = ?', [id]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    console.log(`[registrologysign] Registro ${id} (${registro.estado}) eliminado por ${usuario}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[registrologysign] Error deleting record:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Procesar como "No Firma" (Soporte Correo)
router.post('/api/no-firma', async (req, res) => {
  try {
    const { id, anotacion, usuario } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'ID de registro requerido' });
    }
    // Quien creó el registro o 'Roles que pueden marcar No firma' (Config_Parametros CloudDocs / LogySign)
    const visible = await obtenerRegistroVisible(usuario, id);
    if (!visible) {
      return res.status(403).json({ error: SIN_PERMISO_REGISTRO });
    }
    if (!puedeNoFirma(await obtenerConfigLogysign(), visible.rolUsuario, usuario, visible.usuario_creador)) {
      return res.status(403).json({ error: 'Solo quien creó el registro o un rol autorizado puede marcarlo como No firma' });
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

    const textToDraw = anotacion || (await obtenerConfigLogysign()).textoNoFirma;
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
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const timestampStr = `${yyyy}${mm}${dd}${hh}${min}${ss}`;

    const finalPdfName = `${logysign.identificacion}/${logysign.identificacion}.${logysign.prefijo}.${timestampStr}.pdf`;
    const finalPdfFile = bucketPdfs.file(finalPdfName);
    
    await finalPdfFile.save(Buffer.from(signedPdfBytes), { contentType: 'application/pdf' });
    const finalPdfUrl = `https://storage.googleapis.com/${bucketPdfs.name}/${finalPdfName}`;

    // 5-7. Estado FIRMADO y registro en Cloud Docs juntos (si algo falla sigue PENDIENTE)
    const [vRows] = await pool.execute(
      'SELECT Estado FROM `Maestro_Vinculación` WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [logysign.identificacion]
    );
    const estadoTrabajador = vRows.length ? vRows[0].Estado : 'Activo';
    const docTrabajadorId = `logysign-${logysign.id}`;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [claim] = await conn.execute(
        `UPDATE Dynamic_Logysign SET estado = "FIRMADO", no_firma_fecha = NOW(), no_firma_usuario = ?, no_firma_anotacion = ?
         WHERE id = ? AND estado = "PENDIENTE"`,
        [usuario, String(textToDraw).slice(0, 500), id]
      );
      if (!claim.affectedRows) {
        await conn.rollback();
        return res.status(409).json({ error: 'Este documento ya fue firmado o cerrado.' });
      }
      await conn.execute(
        `INSERT INTO Maestro_docTrabajador
         (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
          TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud, Justificacion_Solicitud, Usuario, FechaRegistro)
         VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, 'El trabajador no firma (soporte correo electrónico)', NULL, NULL, NULL, ?, NOW())`,
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
      await conn.commit();
    } catch (errTx) {
      await conn.rollback().catch(() => {});
      await finalPdfFile.delete().catch(() => {});
      throw errTx;
    } finally {
      conn.release();
    }

    // Soporte de solicitud de firma digital: si falla, el No firma ya quedó y se puede regenerar desde Registros
    let soporte = false;
    try {
      await generarSoporteNoFirma(id, usuario);
      soporte = true;
    } catch (errSop) {
      console.error(`[registrologysign] No se pudo generar el soporte de No firma de ${id}:`, errSop.message);
    }

    res.json({ success: true, finalPdfUrl, soporte });
  } catch (err) {
    console.error('[registrologysign] Error in /api/no-firma:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Ver el soporte de solicitud de firma digital de un registro cerrado como No firma
router.get('/api/soporte/:id', async (req, res) => {
  try {
    const reg = await obtenerRegistroVisible(req.query.usuario, req.params.id);
    if (!reg) return res.status(404).send('Registro no encontrado o sin permiso para verlo');
    const [rows] = await pool.execute('SELECT Doc FROM Maestro_docTrabajador WHERE id = ?', [idDocSoporte(req.params.id)]);
    if (!rows.length || !rows[0].Doc) return res.status(404).send('<h2>Este registro aún no tiene soporte. Use Regenerar soporte.</h2>');
    const partes = new URL(rows[0].Doc).pathname.replace(/^\//, '').split('/');
    const [pdf] = await storage.bucket(partes[0]).file(decodeURIComponent(partes.slice(1).join('/'))).download();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Soporte_no_firma_${reg.identificacion}.${reg.prefijo}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('[registrologysign] Error mostrando soporte:', err);
    res.status(500).send('Error al abrir el soporte');
  }
});

// API: Generar o regenerar el soporte (registros cerrados como No firma, también los anteriores a
// este soporte). Mismo permiso que No firma: quien creó el registro o 'Roles que pueden marcar No firma'.
router.post('/api/soporte/:id/regenerar', async (req, res) => {
  try {
    const { usuario } = req.body;
    const reg = await obtenerRegistroVisible(usuario, req.params.id);
    if (!reg) return res.status(403).json({ error: SIN_PERMISO_REGISTRO });
    if (!puedeNoFirma(await obtenerConfigLogysign(), reg.rolUsuario, usuario, reg.usuario_creador)) {
      return res.status(403).json({ error: 'Solo quien creó el registro o un rol autorizado puede generar el soporte' });
    }
    const { url } = await generarSoporteNoFirma(req.params.id, usuario);
    res.json({ ok: true, url });
  } catch (err) {
    console.error('[registrologysign] Error regenerando soporte:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
