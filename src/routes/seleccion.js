const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Storage } = require('@google-cloud/storage');
const { GoogleAuth } = require('google-auth-library');
const pool = require('../services/db');
const { notificarBloqueoAspirante, enviarCorreoPortalAspirante } = require('../services/email');
const {
  DOCS_FIRMA_SELECCION,
  obtenerDocsFirmaParaOperacion,
  obtenerDatosAspiranteParaFirma,
  generarHtmlVistaFirma,
  procesarFirmaDocumento
} = require('../services/seleccionFirmas');

// Multer in-memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Google Cloud Storage configuration
const storage = process.env.GCS_KEYFILE
  ? new Storage({ keyFilename: path.resolve(process.env.GCS_KEYFILE) })
  : new Storage();

const BUCKET_ASPIRANTES = process.env.BUCKET_ASPIRANTES || 'hojas_vida_logyser';
const BUCKET_EMPLEADOS = process.env.BUCKET_PDFS || 'talenthub_central';

function getBucketAspirantes() {
  return storage.bucket(BUCKET_ASPIRANTES);
}

function getBucketEmpleados() {
  return storage.bucket(BUCKET_EMPLEADOS);
}

// ─── Document AI Invocation ──────────────────────────────────────────────────
async function extractFieldsFromBuffer(fileBuffer, mimeType, pages = null) {
  const authOptions = { scopes: 'https://www.googleapis.com/auth/cloud-platform' };
  if (process.env.GCS_KEYFILE) {
    authOptions.keyFilename = path.resolve(process.env.GCS_KEYFILE);
  }
  const auth = new GoogleAuth(authOptions);
  const client = await auth.getClient();
  const credentials = await client.getAccessToken();

  const projectId = process.env.DOCAI_PROJECT_ID;
  const location = process.env.DOCAI_LOCATION || 'us';
  const processorId = process.env.DOCAI_PROCESSOR_ID;
  const url = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`;

  const base64Content = fileBuffer.toString('base64');
  const requestBody = {
    rawDocument: {
      content: base64Content,
      mimeType: mimeType,
    },
  };

  if (mimeType === 'application/pdf' && Array.isArray(pages) && pages.length > 0) {
    requestBody.processOptions = {
      individualPageSelector: {
        pages: pages
      }
    };
  }

  console.log(`[DocAI Selection] Invoking Document AI: ${url}`);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
  } catch (fetchErr) {
    console.warn(`[DocAI Selection] Regional fetch failed, retrying with global endpoint... Error: ${fetchErr.message}`);
    const fallbackUrl = `https://documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`;
    response = await fetch(fallbackUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[DocAI Selection] API Error:', errorText);
    throw new Error(`Document AI API error: ${errorText}`);
  }

  const data = await response.json();
  return data.document;
}

// ─── Normalization & Matching Helpers ─────────────────────────────────────────
const normalizeText = (text) =>
  (text ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const STOPWORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'a', 'al', 'por', 'con', 'para']);

function matchScore(candidate, extracted) {
  const words = normalizeText(candidate).split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
  if (words.length === 0) return 0;
  const extractedNorm = normalizeText(extracted);
  const matched = words.filter(w => extractedNorm.includes(w));
  return matched.length / words.length;
}

let cachedCiudades = null;
let cachedDocs = null;

async function getCachedCiudades() {
  if (cachedCiudades) return cachedCiudades;
  console.log('[Cache] Loading Config_Ciudades into cache...');
  const [rows] = await pool.execute('SELECT Ciudad, Departamento, Pais FROM Config_Ciudades');
  cachedCiudades = rows;
  return cachedCiudades;
}

async function getCachedDocs() {
  if (cachedDocs) return cachedDocs;
  console.log('[Cache] Loading Config_Doc_Trabajador into cache...');
  const [rows] = await pool.execute('SELECT Id, Prefijo, Documento FROM Config_Doc_Trabajador');
  cachedDocs = rows;
  return cachedDocs;
}

async function getPrefijo(docTitle) {
  const allRows = await getCachedDocs();
  const exactMatch = allRows.find(r => r.Documento && r.Documento.trim().toLowerCase() === docTitle.trim().toLowerCase());
  if (exactMatch) {
    return { idConfig: exactMatch.Id, prefijo: exactMatch.Prefijo, documento: exactMatch.Documento };
  }

  const THRESHOLD = 0.6;
  let best = null;
  let bestScore = 0;

  for (const row of allRows) {
    const score = matchScore(row.Documento, docTitle);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  if (best && bestScore >= THRESHOLD) {
    return { idConfig: best.Id, prefijo: best.Prefijo, documento: best.Documento };
  }
  return null;
}

async function matchCity(lugar) {
  if (!lugar) return null;
  const lugarNorm = normalizeText(lugar);
  const rows = await getCachedCiudades();
  return rows.find(r => normalizeText(r.Ciudad) === lugarNorm) || null;
}

async function matchBirthPlace(lugar) {
  if (!lugar) return null;
  const match = lugar.match(/^([^(]+)\s*(?:\(([^)]+)\))?$/);
  if (!match) return null;
  const city = match[1].trim();
  const dept = match[2] ? match[2].trim() : '';

  const cityNorm = normalizeText(city);
  const deptNorm = normalizeText(dept);

  const rows = await getCachedCiudades();
  
  if (dept) {
    const found = rows.find(r => normalizeText(r.Ciudad) === cityNorm && normalizeText(r.Departamento) === deptNorm);
    if (found) return found;
  }
  return rows.find(r => normalizeText(r.Ciudad) === cityNorm) || null;
}

function getMimeType(extension) {
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.tiff': 'image/tiff',
    '.bmp': 'image/bmp'
  };
  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
}

function splitNames(fullName) {
  if (!fullName) return { first: '', second: '' };
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', second: '' };
  const first = parts[0];
  const second = parts.slice(1).join(' ');
  return { first, second };
}

function normalizarFecha(str) {
  if (!str) return null;
  if (str instanceof Date || Object.prototype.toString.call(str) === '[object Date]') {
    if (isNaN(str.getTime())) return null;
    // Formato local YYYY-MM-DD
    const yyyy = str.getFullYear();
    const mm = String(str.getMonth() + 1).padStart(2, '0');
    const dd = String(str.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof str !== 'string') {
    str = String(str);
  }
  str = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // Limpiar horas (ej. 00:00:00) si vienen incluidas
  const cleanStr = str.split(/\s+/)[0];
  
  const parts = cleanStr.split(/[-/]/);
  if (parts.length === 3) {
    const p0 = parts[0].padStart(2, '0');
    let p1 = parts[1].toLowerCase();
    let p2 = parts[2];
    
    // Map Spanish month abbreviations/names
    const MESES = {
      ene: '01', enero: '01',
      feb: '02', febrero: '02',
      mar: '03', marzo: '03',
      abr: '04', abril: '04',
      may: '05', mayo: '05',
      jun: '06', junio: '06',
      jul: '07', julio: '07',
      ago: '08', agosto: '08',
      sep: '09', septiembre: '09',
      oct: '10', octubre: '10',
      nov: '11', noviembre: '11',
      dic: '12', diciembre: '12'
    };
    
    if (MESES[p1]) {
      p1 = MESES[p1];
    } else {
      p1 = p1.padStart(2, '0');
    }
    
    if (p2.length === 4) {
      // DD/MM/YYYY -> YYYY-MM-DD
      return `${p2}-${p1}-${p0}`;
    } else if (p0.length === 4) {
      // YYYY/MM/DD -> YYYY-MM-DD
      p2 = p2.padStart(2, '0');
      return `${p0}-${p1}-${p2}`;
    }
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    // Formato local YYYY-MM-DD
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

// Helper to save file to GCS and update DB
async function guardarArchivo(id_aspirante, id_config_doc, file) {
  const [datos] = await pool.execute(
    `SELECT a.identificacion, c.Prefijo, c.Documento 
     FROM Dynamic_hv_aspirante a 
     JOIN Config_Doc_Trabajador c ON c.Id = ? 
     WHERE a.id_aspirante = ?`,
    [id_config_doc, id_aspirante]
  );

  if (datos.length === 0) throw new Error('Datos no encontrados para el aspirante o documento');

  const { identificacion, Prefijo, Documento } = datos[0];
  const extension = path.extname(file.originalname);
  const nombreArchivo = `${identificacion}.${Prefijo}.${id_aspirante}${extension}`;
  const gcsPath = `${identificacion}/${nombreArchivo}`; 

  const bucket = getBucketAspirantes();
  const blob = bucket.file(gcsPath);
  
  await blob.save(file.buffer, { contentType: file.mimetype || 'application/pdf' });

  await pool.execute(
    `INSERT INTO Dynamic_hv_documentos (id_aspirante, id_config_doc, gcs_path, estado) 
     VALUES (?, ?, ?, 'Pendiente') 
     ON DUPLICATE KEY UPDATE gcs_path = VALUES(gcs_path), estado = VALUES(estado), fecha_actualizacion = CURRENT_TIMESTAMP`,
    [id_aspirante, id_config_doc, gcsPath]
  );

  // Background training collection for Document AI
  try {
    const { registrarEntrenamientoDocumentIA } = require('../services/documentAiTraining');
    registrarEntrenamientoDocumentIA(identificacion, Documento, file.buffer, file.mimetype);
  } catch (errDocAi) {
    console.warn('[DocAI Training] Call initialization failed:', errDocAi.message);
  }

  return nombreArchivo;
}

const router = express.Router();

// ══════════════════════════════════════════════════════════════
// Vistas (páginas HTML)
// ══════════════════════════════════════════════════════════════

// Portal del Aspirante
router.get('/portal/:uuid', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const { uuid } = req.params;
  const usuario = req.query.usuario || '';
  
  const docsAspirante = [
    { id: 11, nombre: "Copia de la cédula ampliada al 150%" },
    { id: 5,  nombre: "Antecedentes (Policía, Procuraduría, Contraloría)" },
    { id: 15, nombre: "Certificado de EPS" },
    { id: 3,  nombre: "ADRES (Si no tiene EPS)" },
    { id: 14, nombre: "Certificado de Pensión" },
    { id: 13, nombre: "Certificado de Estudio" },
    { id: 17, nombre: "Certificado Laboral" },
    { id: 10, nombre: "Certificación Bancaria" }
  ];

  try {
    const [ [aspiranteRows], [cargados] ] = await Promise.all([
      pool.execute('SELECT primer_nombre, pdf_public_url, estado_proceso, IdRequisicion FROM Dynamic_hv_aspirante WHERE id_aspirante = ?', [uuid]),
      pool.execute('SELECT id_config_doc, estado, gcs_path FROM Dynamic_hv_documentos WHERE id_aspirante = ?', [uuid])
    ]);

    if (aspiranteRows.length === 0) {
      return res.status(404).send("Aspirante no encontrado");
    }

    const asp = aspiranteRows[0];
    const nombre = asp.primer_nombre || 'Aspirante';
    const pdfUrl = (asp.pdf_public_url || '').trim();

    let operacionAspirante = '';
    const tieneRequisicion = !!(asp.IdRequisicion && String(asp.IdRequisicion).trim());
    if (tieneRequisicion) {
      const [reqRows] = await pool.execute(
        'SELECT `Operación` FROM Dynamic_Requisiciones WHERE IdRequisicion = ? LIMIT 1',
        [asp.IdRequisicion]
      );
      if (reqRows.length > 0) {
        operacionAspirante = (reqRows[0]['Operación'] || '').toString().trim();
      }
    }

    const docsFirmaFiltrados = obtenerDocsFirmaParaOperacion(operacionAspirante);

    const mapaDocs = {};
    cargados.forEach(c => {
      mapaDocs[c.id_config_doc] = { estado: c.estado, path: c.gcs_path };
    });

    res.send(generarHtmlPortal(uuid, nombre, docsAspirante, mapaDocs, pdfUrl, usuario, asp.estado_proceso, docsFirmaFiltrados, tieneRequisicion));
  } catch (error) {
    console.error("Error en Portal Aspirante:", error);
    res.status(500).send("Error interno al cargar el portal");
  }
});

// Panel Administrativo del Aspirante
router.get('/admin/:uuid', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const { uuid } = req.params;
  const usuario = req.query.usuario || '';

  const nombresAsp = { 11: "Cédula 150%", 5: "Antecedentes", 15: "EPS", 3: "ADRES", 14: "Pensión", 13: "Estudio", 17: "Cert. Laboral", 10: "Bancaria" };
  const docsAspiranteIds = [11, 5, 15, 3, 14, 13, 17, 10];
  const docsTecnicos = [
    { id: 24, nombre: "Examen médico" }, 
    { id: 28, nombre: "Estudio seguridad" }, 
    { id: 27, nombre: "Entrevista" }, 
    { id: 8, nombre: "Manipulación alimentos" }, 
    { id: 53, nombre: "Verificación referencias" }
  ];

  try {
    const [[aspiranteRows], [cargados], [todasRequisiciones]] = await Promise.all([
      pool.execute(
        `SELECT primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, 
                identificacion, estado_proceso, IdRequisicion, pdf_public_url,
                telefono, correo_electronico 
         FROM Dynamic_hv_aspirante WHERE id_aspirante = ?`, 
        [uuid]
      ),
      pool.execute('SELECT id_config_doc, estado, gcs_path FROM Dynamic_hv_documentos WHERE id_aspirante = ?', [uuid]),
      pool.execute(`
        SELECT IdRequisicion, \`Requisición\`, \`Operación\`, \`Cargo Requerido\`, \`N° Personas Requeridas\`, Estado 
        FROM Dynamic_Requisiciones 
        ORDER BY CASE WHEN LOWER(Estado) = 'en proceso' THEN 0 ELSE 1 END, \`Fecha Requisición\` DESC, IdRequisicion DESC
      `)
    ]);

    if (aspiranteRows.length === 0) return res.status(404).send("Aspirante no encontrado");
    
    const a = aspiranteRows[0];
    const pdfUrl = (a.pdf_public_url || '').trim();
    const nombreCompleto = [a.primer_nombre, a.segundo_nombre, a.primer_apellido, a.segundo_apellido]
                            .filter(n => n && n.trim() !== "").join(" ");

    let requisicionInfo = '';
    let regionalSugerida = '';
    let operacionSugerida = '';

    if (a.IdRequisicion) {
      const [reqRows] = await pool.execute(
        'SELECT `Requisición`, `Operación`, `Cargo Requerido`, `Fecha Requisición`, `Regional` FROM Dynamic_Requisiciones WHERE IdRequisicion = ? LIMIT 1',
        [a.IdRequisicion]
      );

      if (reqRows.length > 0) {
        const r = reqRows[0];
        regionalSugerida = (r['Regional'] || '').toString().trim();
        operacionSugerida = (r['Operación'] || '').toString().trim();
        const f = r['Fecha Requisición'];
        const fecStr = f instanceof Date ? f.toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : f;

        requisicionInfo = [r['Requisición'], r['Operación'], r['Cargo Requerido'], fecStr]
                          .filter(x => x).map(x => String(x).trim()).join(' | ');
      }
    }

    const docsFirmar = obtenerDocsFirmaParaOperacion(operacionSugerida);

    const mapaDocs = {};
    cargados.forEach(c => { mapaDocs[c.id_config_doc] = { estado: c.estado, path: c.gcs_path }; });

    res.send(generarHtmlAdmin(
      uuid,
      {
        nombreCompleto,
        identificacion: a.identificacion,
        IdRequisicion: a.IdRequisicion,
        pdfUrl,
        requisicionInfo,
        regionalSugerida,
        operacionSugerida,
        estadoProceso: a.estado_proceso,
        telefono: a.telefono || '',
        correoElectronico: a.correo_electronico || ''
      },
      docsAspiranteIds, nombresAsp, docsTecnicos, docsFirmar, mapaDocs, 
      a.estado_proceso === 'contratado',
      usuario,
      todasRequisiciones
    ));
  } catch (error) {
    console.error("Error en Admin Panel:", error);
    res.status(500).send("Error interno al cargar el panel administrativo");
  }
});

// ══════════════════════════════════════════════════════════════
// Rutas de Vinculación y Comunicación del Aspirante
// ══════════════════════════════════════════════════════════════

// Vincular o desvincular Requisición al aspirante desde el Admin Panel
router.post('/vincular-requisicion', async (req, res) => {
  const { id_aspirante, id_requisicion } = req.body;
  const usuario = req.query.usuario || req.body.usuario || '';
  try {
    if (!id_aspirante) {
      if (req.headers['content-type']?.includes('application/json')) {
        return res.status(400).json({ ok: false, error: 'Falta id_aspirante' });
      }
      return res.redirect(`/seleccion/admin/${id_aspirante}?usuario=${usuario}&msg=error&info=${encodeURIComponent('Falta id_aspirante')}`);
    }

    const valorIdReq = id_requisicion && String(id_requisicion).trim() !== '' ? String(id_requisicion).trim() : null;

    await pool.execute(
      'UPDATE Dynamic_hv_aspirante SET IdRequisicion = ? WHERE id_aspirante = ?',
      [valorIdReq, id_aspirante]
    );

    if (req.headers['content-type']?.includes('application/json')) {
      return res.json({ ok: true, mensaje: 'Requisición vinculada correctamente' });
    }

    res.redirect(`/seleccion/admin/${id_aspirante}?usuario=${usuario}&msg=success&info=${encodeURIComponent('Requisición vinculada con éxito')}`);
  } catch (error) {
    console.error('Error al vincular requisición:', error);
    if (req.headers['content-type']?.includes('application/json')) {
      return res.status(500).json({ ok: false, error: error.message });
    }
    res.status(500).send('Error al vincular requisición: ' + error.message);
  }
});

// Actualizar teléfono y correo del aspirante desde el Admin Panel
router.post('/actualizar-contacto', async (req, res) => {
  const { id_aspirante, telefono, correo_electronico } = req.body;
  try {
    if (!id_aspirante) {
      return res.status(400).json({ ok: false, error: 'Falta id_aspirante' });
    }
    await pool.execute(
      'UPDATE Dynamic_hv_aspirante SET telefono = ?, correo_electronico = ? WHERE id_aspirante = ?',
      [(telefono || '').trim(), (correo_electronico || '').trim(), id_aspirante]
    );
    res.json({ ok: true, mensaje: 'Datos de contacto actualizados correctamente' });
  } catch (error) {
    console.error('Error al actualizar contacto aspirante:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Enviar correo con enlace del portal al aspirante
router.post('/enviar-correo-portal', async (req, res) => {
  const { id_aspirante, correo } = req.body;
  try {
    if (!id_aspirante) {
      return res.status(400).json({ ok: false, error: 'Falta id_aspirante' });
    }

    const [rows] = await pool.execute(
      `SELECT primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, correo_electronico
       FROM Dynamic_hv_aspirante WHERE id_aspirante = ?`,
      [id_aspirante]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'Aspirante no encontrado' });
    }

    const a = rows[0];
    const destino = (correo || a.correo_electronico || '').trim();
    if (!destino) {
      return res.status(400).json({ ok: false, error: 'El aspirante no tiene un correo electrónico registrado' });
    }

    // Si enviaron un correo modificado, actualizarlo en la BD
    if (correo && correo.trim() !== (a.correo_electronico || '').trim()) {
      await pool.execute('UPDATE Dynamic_hv_aspirante SET correo_electronico = ? WHERE id_aspirante = ?', [destino, id_aspirante]);
    }

    const nombreCompleto = [a.primer_nombre, a.segundo_nombre, a.primer_apellido, a.segundo_apellido]
      .filter(n => n && n.trim() !== '').join(' ') || 'Aspirante';

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const portalUrl = `${baseUrl}/seleccion/portal/${id_aspirante}`;

    await enviarCorreoPortalAspirante({
      correo: destino,
      nombreAspirante: nombreCompleto,
      portalUrl
    });

    res.json({ ok: true, mensaje: `Correo de acceso enviado con éxito a ${destino}` });
  } catch (error) {
    console.error('Error al enviar correo del portal:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ══════════════════════════════════════════════════════════════
// Rutas de Firma Digital de Selección
// ══════════════════════════════════════════════════════════════

// Vista interactiva para firmar documento individual
router.get('/firmar/:uuid/:idConfigDoc', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const { uuid, idConfigDoc } = req.params;
  const usuario = req.query.usuario || '';

  try {
    const datos = await obtenerDatosAspiranteParaFirma(uuid, idConfigDoc);
    if (!datos) {
      return res.status(404).send('Aspirante no encontrado');
    }
    if (datos.aspirante.estado_proceso === 'bloqueado') {
      return res.redirect(`/seleccion/portal/${uuid}?usuario=${usuario}`);
    }

    const { reemplazarVariables } = require('../services/plantilla');
    const contenidoHtmlConVariables = reemplazarVariables(datos.contenidoHtml, {
      ...datos.variables,
      firma_colaborador: '<div style="color:#64748b;font-style:italic;font-size:11px;text-align:center;padding:12px 0;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:6px;">[Tu firma digital aparecerá aquí tras confirmar]</div>'
    });

    const html = generarHtmlVistaFirma({
      aspirante: datos.aspirante,
      docItem: datos.docItem,
      contenidoHtmlConVariables,
      firmaPrevia: datos.firmaPrevia,
      docActual: datos.docActual,
      usuario,
      bucketAspirantes: BUCKET_ASPIRANTES
    });

    res.send(html);
  } catch (err) {
    console.error('Error al cargar pantalla de firma:', err);
    res.status(500).send('Error interno al cargar la firma del documento: ' + err.message);
  }
});

// Procesar firma del documento y compilar PDF oficial con Puppeteer
router.post('/firmar/:uuid/:idConfigDoc', express.json({ limit: '10mb' }), async (req, res) => {
  const { uuid, idConfigDoc } = req.params;
  const { firma_base64, es_nueva_firma } = req.body;

  if (!firma_base64) {
    return res.status(400).json({ ok: false, error: 'Falta la imagen de la firma' });
  }

  try {
    const resultado = await procesarFirmaDocumento({
      idAspirante: uuid,
      idConfigDoc,
      firmaBase64: firma_base64,
      esNuevaFirma: !!es_nueva_firma,
      bucketAspirantes: BUCKET_ASPIRANTES
    });

    res.json(resultado);
  } catch (err) {
    console.error('Error al procesar firma de selección:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Cambiar estado del proceso del aspirante (Admin: Registro <-> En proceso)
router.post('/cambiar-estado-proceso', async (req, res) => {
  const { id_aspirante, nuevo_estado } = req.body;
  const usuario = req.query.usuario || req.body.usuario || '';

  try {
    const estadosValidos = ['Registro', 'En proceso'];
    if (!estadosValidos.includes(nuevo_estado)) {
      return res.status(400).send('Estado no permitido');
    }

    if (nuevo_estado === 'En proceso') {
      const [aspRows] = await pool.execute(
        'SELECT IdRequisicion FROM Dynamic_hv_aspirante WHERE id_aspirante = ?',
        [id_aspirante]
      );
      if (!aspRows.length || !aspRows[0].IdRequisicion) {
        return res.redirect(`/seleccion/admin/${id_aspirante}?usuario=${usuario}&msg=error&info=${encodeURIComponent('No es posible pasar a "En proceso": El aspirante no tiene una requisición vinculada.')}`);
      }
    }

    await pool.execute(
      'UPDATE Dynamic_hv_aspirante SET estado_proceso = ? WHERE id_aspirante = ? AND estado_proceso != "contratado"',
      [nuevo_estado, id_aspirante]
    );

    res.redirect(`/seleccion/admin/${id_aspirante}?usuario=${usuario}&msg=success&info=${encodeURIComponent('Estado del aspirante actualizado a ' + nuevo_estado)}`);
  } catch (error) {
    console.error('Error al cambiar estado proceso:', error);
    res.status(500).send('Error al cambiar el estado del aspirante: ' + error.message);
  }
});

// ══════════════════════════════════════════════════════════════
// Acciones sobre Documentos
// ══════════════════════════════════════════════════════════════

// Aprobar Documento Individual
router.post('/aprobar-doc', async (req, res) => {
  const { id_aspirante, id_config_doc } = req.body;
  const usuario = req.query.usuario || req.body.usuario || '';
  try {
    await pool.execute(
      "UPDATE Dynamic_hv_documentos SET estado = 'Aprobado' WHERE id_aspirante = ? AND id_config_doc = ?",
      [id_aspirante, id_config_doc]
    );
    res.redirect(`/seleccion/admin/${id_aspirante}?usuario=${usuario}&msg=aprobado`);
  } catch (error) {
    console.error("Error al aprobar documento:", error);
    res.status(500).send("Error al aprobar documento");
  }
});

// Aprobar Documentos en Lote
router.post('/aprobar-masivo', async (req, res) => {
  const { id_aspirante, ids_docs } = req.body;
  const usuario = req.query.usuario || req.body.usuario || '';
  try {
    const list = JSON.parse(ids_docs);
    if (list.length > 0) {
      const placeholders = list.map(() => '?').join(',');
      await pool.execute(
        `UPDATE Dynamic_hv_documentos SET estado = 'Aprobado' 
         WHERE id_aspirante = ? AND id_config_doc IN (${placeholders})`,
        [id_aspirante, ...list]
      );
    }
    res.redirect(`/seleccion/admin/${id_aspirante}?usuario=${usuario}&msg=aprobado`);
  } catch (error) {
    console.error("Error al aprobar lote de documentos:", error);
    res.status(500).send("Error al aprobar lote de documentos");
  }
});

// Eliminar Documento (Portal Aspirante)
router.post('/delete-doc', async (req, res) => {
  const { id_aspirante, id_config_doc } = req.body;
  const usuario = req.query.usuario || req.body.usuario || '';
  try {
    const [rows] = await pool.execute(
      'SELECT gcs_path FROM Dynamic_hv_documentos WHERE id_aspirante = ? AND id_config_doc = ?',
      [id_aspirante, id_config_doc]
    );

    if (rows.length > 0) {
      const filePath = rows[0].gcs_path;
      try {
        await getBucketAspirantes().file(filePath).delete();
      } catch (gcsError) {
        console.warn(`Archivo no encontrado en GCS (Portal): ${filePath}`);
      }

      await pool.execute(
        'DELETE FROM Dynamic_hv_documentos WHERE id_aspirante = ? AND id_config_doc = ?', 
        [id_aspirante, id_config_doc]
      );
      return res.redirect(`/seleccion/portal/${id_aspirante}?usuario=${usuario}&msg=deleted`);
    }
    res.redirect(`/seleccion/portal/${id_aspirante}?usuario=${usuario}`);
  } catch (error) {
    console.error("Error al eliminar documento (Portal):", error);
    res.status(500).send("Error al eliminar documento");
  }
});

// Eliminar Documento (Admin Panel)
router.post('/delete-doc-admin', async (req, res) => {
  const { id_aspirante, id_config_doc } = req.body;
  const usuario = req.query.usuario || req.body.usuario || '';
  try {
    const [rows] = await pool.execute(
      'SELECT gcs_path FROM Dynamic_hv_documentos WHERE id_aspirante = ? AND id_config_doc = ?',
      [id_aspirante, id_config_doc]
    );

    if (rows.length > 0) {
      const filePath = rows[0].gcs_path;
      try {
        await getBucketAspirantes().file(filePath).delete();
      } catch (gcsError) {
        console.warn(`Archivo no encontrado en GCS (Admin): ${filePath}`);
      }

      await pool.execute(
        'DELETE FROM Dynamic_hv_documentos WHERE id_aspirante = ? AND id_config_doc = ?', 
        [id_aspirante, id_config_doc]
      );
      return res.redirect(`/seleccion/admin/${id_aspirante}?usuario=${usuario}&msg=deleted`);
    }
    res.redirect(`/seleccion/admin/${id_aspirante}?usuario=${usuario}`);
  } catch (error) {
    console.error("Error al eliminar documento (Admin):", error);
    res.status(500).send("Error al eliminar documento");
  }
});

// ─── API Endpoints para Procesamiento Interactivo (Document AI) ───────────────

router.post('/api/classify-doc', upload.single('file'), async (req, res) => {
  try {
    const { id_aspirante, id_config_doc } = req.body;
    const file = req.file;
    if (!id_aspirante || !id_config_doc || !file) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    const idDoc = Number(id_config_doc);
    const extension = path.extname(file.originalname).toLowerCase();
    const mimeType = getMimeType(extension);

    // Guardar temporalmente en controldochv/
    const tempGcsPath = `controldochv/${id_aspirante}_${idDoc}_${Date.now()}${extension}`;
    const bucket = getBucketAspirantes();
    await bucket.file(tempGcsPath).save(file.buffer, { contentType: mimeType });

    // Omitir Document AI si no es Cédula (ID 11)
    if (idDoc !== 11) {
      const [configDocExpected] = await pool.execute('SELECT Documento FROM Config_Doc_Trabajador WHERE Id = ?', [idDoc]);
      const expectedDocName = configDocExpected.length > 0 ? configDocExpected[0].Documento : '';

      return res.json({
        status: 'success_other',
        tempGcsPath,
        extractedDoc: expectedDocName,
        extractedID: String(id_aspirante)
      });
    }

    // Determinar las páginas a procesar para acelerar la respuesta en PDFs (Solo Cédula)
    const targetPages = [1, 2];

    // Llamar a Document AI
    let docAiResult;
    try {
      docAiResult = await extractFieldsFromBuffer(file.buffer, mimeType, targetPages);
    } catch (err) {
      console.error('[Classify API] Document AI extraction failed:', err);
      return res.json({
        status: 'error_processing',
        message: 'No se pudo leer la información del documento mediante Inteligencia Artificial.',
        tempGcsPath
      });
    }

    const entities = docAiResult?.entities ?? [];
    const findEntity = (type) =>
      entities
        .find((e) => normalizeText(e.type) === normalizeText(type))
        ?.mentionText
        ?.trim() ?? null;

    let identificacion = findEntity('identificacion');
    if (identificacion) {
      identificacion = identificacion.replace(/[\.\s,]/g, '').trim();
    }
    const docTitle = findEntity('doc');

    // Obtener información del aspirante registrado
    const [aspRows] = await pool.execute('SELECT * FROM Dynamic_hv_aspirante WHERE id_aspirante = ?', [id_aspirante]);
    if (aspRows.length === 0) {
      return res.status(404).json({ error: 'Aspirante no encontrado' });
    }
    const asp = aspRows[0];

    // LÓGICA DE CÉDULA DE CIUDADANÍA
    if (idDoc === 11) {
      if (!identificacion) {
        return res.json({
          status: 'success_cedula',
          tempGcsPath,
          warning: 'No se pudo leer la identificación del documento. Por favor verifíquela manualmente.',
          data: {
            extracted: {
              identificacion: '',
              nombres: findEntity('nombres'),
              apellidos: findEntity('apellidos'),
              sexo: findEntity('sexo'),
              grupo_sanguineo: findEntity('grupo_sanguineo'),
              fecha_nacimiento: normalizarFecha(findEntity('fecha_nacimiento')) || normalizarFecha(asp.fecha_nacimiento),
              fecha_expedicion: normalizarFecha(findEntity('fecha_expedicion')) || normalizarFecha(asp.fecha_expedicion),
              lugar_expedicion: findEntity('lugar_expedicion'),
              lugar_nacimiento: findEntity('lugar_nacimiento')
            },
            registered: {
              identificacion: asp.identificacion,
              primer_nombre: asp.primer_nombre,
              segundo_nombre: asp.segundo_nombre,
              primer_apellido: asp.primer_apellido,
              segundo_apellido: asp.segundo_apellido,
              genero: asp.genero,
              rh: asp.rh,
              fecha_nacimiento: normalizarFecha(asp.fecha_nacimiento),
              fecha_expedicion: normalizarFecha(asp.fecha_expedicion),
              pais_nacimiento: asp.pais_nacimiento
            }
          }
        });
      }

      if (identificacion !== String(asp.identificacion)) {
        // Discrepancia de identificación crítica
        return res.json({
          status: 'mismatch_id',
          tempGcsPath,
          extractedID: identificacion,
          registeredID: String(asp.identificacion)
        });
      }

      // Si coincide el ID, preparar datos de comparación
      console.log(`[Classify API] Cédula dates pre-fallback — Extracted nacimiento: "${findEntity('fecha_nacimiento')}", expedicion: "${findEntity('fecha_expedicion')}"`);
      console.log(`[Classify API] Cédula dates pre-fallback — DB nacimiento: "${asp.fecha_nacimiento}", expedicion: "${asp.fecha_expedicion}"`);
      
      const rawNombres = findEntity('nombres');
      const rawApellidos = findEntity('apellidos');
      const rawSexo = findEntity('sexo');
      const rawRH = findEntity('grupo_sanguineo');
      const rawFNac = normalizarFecha(findEntity('fecha_nacimiento')) || normalizarFecha(asp.fecha_nacimiento);
      const rawFExp = normalizarFecha(findEntity('fecha_expedicion')) || normalizarFecha(asp.fecha_expedicion);
      
      console.log(`[Classify API] Cédula dates post-fallback — rawFNac: "${rawFNac}", rawFExp: "${rawFExp}"`);
      const rawLugarExp = findEntity('lugar_expedicion');
      const rawLugarNac = findEntity('lugar_nacimiento');

      // Buscar ciudades
      const matchExp = await matchCity(rawLugarExp);
      const matchNac = await matchBirthPlace(rawLugarNac);

      const parsedNac = rawLugarNac ? rawLugarNac.match(/^([^(]+)\s*(?:\(([^)]+)\))?$/) : null;
      const rawCiudadNac = parsedNac ? parsedNac[1].trim() : '';
      const rawDeptoNac = parsedNac && parsedNac[2] ? parsedNac[2].trim() : '';

      const respData = {
        extracted: {
          identificacion,
          nombres: rawNombres,
          apellidos: rawApellidos,
          sexo: rawSexo,
          grupo_sanguineo: rawRH,
          fecha_nacimiento: rawFNac,
          fecha_expedicion: rawFExp,
          lugar_expedicion: rawLugarExp,
          lugar_nacimiento: rawLugarNac,
          ciudad_expedicion: matchExp ? matchExp.Ciudad : rawLugarExp,
          departamento_expedicion: matchExp ? matchExp.Departamento : null,
          ciudad_nacimiento: matchNac ? matchNac.Ciudad : rawCiudadNac,
          departamento_nacimiento: matchNac ? matchNac.Departamento : rawDeptoNac
        },
        registered: {
          identificacion: asp.identificacion,
          primer_nombre: asp.primer_nombre,
          segundo_nombre: asp.segundo_nombre,
          primer_apellido: asp.primer_apellido,
          segundo_apellido: asp.segundo_apellido,
          genero: asp.genero,
          rh: asp.rh,
          fecha_nacimiento: normalizarFecha(asp.fecha_nacimiento),
          fecha_expedicion: normalizarFecha(asp.fecha_expedicion),
          ciudad_expedicion: asp.ciudad_expedicion,
          departamento_expedicion: asp.departamento_expedicion,
          ciudad_nacimiento: asp.ciudad_nacimiento,
          departamento_nacimiento: asp.departamento_nacimiento,
          pais_nacimiento: asp.pais_nacimiento
        }
      };

      return res.json({
        status: 'success_cedula',
        tempGcsPath,
        data: respData
      });
    }

    // LÓGICA DE OTROS DOCUMENTOS
    const [configDocExpected] = await pool.execute('SELECT Documento FROM Config_Doc_Trabajador WHERE Id = ?', [idDoc]);
    const expectedDocName = configDocExpected.length > 0 ? configDocExpected[0].Documento : '';

    // Solo validamos la identificación si la IA logra encontrar una
    if (identificacion && identificacion !== String(asp.identificacion)) {
      return res.json({
        status: 'mismatch_doc_id',
        tempGcsPath,
        extractedID: identificacion,
        registeredID: String(asp.identificacion),
        extractedDoc: expectedDocName
      });
    }

    // Si no hay discrepancia en la identificación o no se pudo extraer, se asume correcto
    return res.json({
      status: 'success_other',
      tempGcsPath,
      extractedDoc: expectedDocName,
      extractedID: identificacion || String(asp.identificacion)
    });

  } catch (err) {
    console.error('[Classify API] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/confirm-doc', async (req, res) => {
  try {
    const { id_aspirante, id_config_doc, temp_gcs_path, confirmed_data } = req.body;
    if (!id_aspirante || !id_config_doc || !temp_gcs_path) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    const idDoc = Number(id_config_doc);
    const extension = path.extname(temp_gcs_path).toLowerCase();

    // Obtener información del aspirante y el prefijo
    const [
      [aspRows], [configRows]
    ] = await Promise.all([
      pool.execute('SELECT identificacion FROM Dynamic_hv_aspirante WHERE id_aspirante = ?', [id_aspirante]),
      pool.execute('SELECT Prefijo FROM Config_Doc_Trabajador WHERE Id = ?', [idDoc])
    ]);

    if (aspRows.length === 0 || configRows.length === 0) {
      return res.status(404).json({ error: 'Aspirante o tipo de documento no encontrado' });
    }

    const { identificacion } = aspRows[0];
    const { Prefijo } = configRows[0];

    const destPath = `${identificacion}/${identificacion}.${Prefijo}.${id_aspirante}${extension}`;

    // Copiar archivo a la ruta definitiva y borrar el temporal
    const bucket = getBucketAspirantes();
    const tempFile = bucket.file(temp_gcs_path);
    const destFile = bucket.file(destPath);

    await tempFile.copy(destFile);
    await tempFile.delete().catch(err => console.warn('No se pudo borrar temporal:', err));

    // Si es Cédula y se enviaron datos confirmados, actualizar Dynamic_hv_aspirante
    if (idDoc === 11 && confirmed_data) {
      const data = typeof confirmed_data === 'string' ? JSON.parse(confirmed_data) : confirmed_data;
      const names = splitNames(data.nombres);
      const lastNames = splitNames(data.apellidos);

      await pool.execute(
        `UPDATE Dynamic_hv_aspirante 
         SET 
           primer_nombre = ?,
           segundo_nombre = ?,
           primer_apellido = ?,
           segundo_apellido = ?,
           genero = ?,
           rh = ?,
           fecha_nacimiento = ?,
           fecha_expedicion = ?,
           departamento_expedicion = ?,
           ciudad_expedicion = ?,
           pais_nacimiento = ?,
           departamento_nacimiento = ?,
           ciudad_nacimiento = ?
         WHERE id_aspirante = ?`,
        [
          names.first || null,
          names.second || null,
          lastNames.first || null,
          lastNames.second || null,
          data.sexo || null,
          data.grupo_sanguineo || null,
          data.fecha_nacimiento || null,
          data.fecha_expedicion || null,
          data.departamento_expedicion || null,
          data.ciudad_expedicion || null,
          data.pais_nacimiento || 'Colombia',
          data.departamento_nacimiento || null,
          data.ciudad_nacimiento || null,
          id_aspirante
        ]
      );
    }

    // Registrar en Dynamic_hv_documentos
    await pool.execute(
      `INSERT INTO Dynamic_hv_documentos (id_aspirante, id_config_doc, gcs_path, estado) 
       VALUES (?, ?, ?, 'Pendiente') 
       ON DUPLICATE KEY UPDATE gcs_path = VALUES(gcs_path), estado = VALUES(estado), fecha_actualizacion = CURRENT_TIMESTAMP`,
      [id_aspirante, idDoc, destPath]
    );

    res.json({ ok: true });

  } catch (err) {
    console.error('[Confirm API] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/block-process', async (req, res) => {
  try {
    const { id_aspirante, usuario, temp_gcs_path, extractedID, registeredID, only_delete_temp } = req.body;
    if (!id_aspirante) {
      return res.status(400).json({ error: 'Falta id_aspirante' });
    }

    // Borrar archivo temporal si existe
    if (temp_gcs_path) {
      await getBucketAspirantes().file(temp_gcs_path).delete().catch(() => {});
    }

    if (only_delete_temp) {
      return res.json({ ok: true });
    }

    // 1. Bloquear proceso
    await pool.execute(
      "UPDATE Dynamic_hv_aspirante SET estado_proceso = 'bloqueado' WHERE id_aspirante = ?",
      [id_aspirante]
    );

    // 2. Obtener datos del aspirante
    const [aspRows] = await pool.execute('SELECT primer_nombre, primer_apellido FROM Dynamic_hv_aspirante WHERE id_aspirante = ?', [id_aspirante]);
    const nombreAspirante = aspRows.length > 0 ? `${aspRows[0].primer_nombre} ${aspRows[0].primer_apellido}` : 'Aspirante';

    // 3. Obtener correo del usuario auditor
    let emailUsuario = null;
    if (usuario) {
      const [userRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
      if (userRows.length > 0) {
        emailUsuario = userRows[0].Email;
      }
    }

    // 4. Enviar correo de bloqueo
    await notificarBloqueoAspirante({
      emailUsuario,
      nombreAspirante,
      registeredID: registeredID || '',
      extractedID: extractedID || ''
    }).catch(mailErr => console.error('[Block API] Error sending block email:', mailErr));

    res.json({ ok: true });

  } catch (err) {
    console.error('[Block API] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cargar Múltiples Archivos
router.post('/upload-multiple', upload.any(), async (req, res) => {
  const { id_aspirante, origen } = req.body;
  const usuario = req.query.usuario || req.body.usuario || '';
  const archivos = req.files;
  
  const redirectPath = origen === 'admin' 
    ? `/seleccion/admin/${id_aspirante}?usuario=${usuario}` 
    : `/seleccion/portal/${id_aspirante}?usuario=${usuario}`;

  if (!archivos || archivos.length === 0) {
    return res.redirect(`${redirectPath}&msg=no_files`);
  }

  try {
    await Promise.all(archivos.map(file => {
      const id_config_doc = Number(file.fieldname.replace('file_', ''));
      return guardarArchivo(id_aspirante, id_config_doc, file);
    }));
    
    res.redirect(`${redirectPath}&msg=upload_success`);
  } catch (error) {
    console.error("Error en Carga Múltiple:", error);
    res.status(500).send("Error al procesar los archivos: " + error.message);
  }
});

// ══════════════════════════════════════════════════════════════
// APIs auxiliares
// ══════════════════════════════════════════════════════════════

router.get('/api/ciudades', async (req, res) => {
  try {
    const list = await getCachedCiudades();
    res.json(list);
  } catch (err) {
    console.error("Error API Ciudades:", err);
    res.status(500).json([]);
  }
});

router.get('/api/regionales', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT DISTINCT REGIONAL FROM Maestro_Operaciones WHERE REGIONAL IS NOT NULL AND REGIONAL != "INACTIVO" ORDER BY REGIONAL ASC'
    );
    res.json(rows.map(r => r.REGIONAL));
  } catch (error) {
    console.error("Error API Regionales:", error);
    res.status(500).json({ error: "No se pudieron cargar las regionales" });
  }
});

router.get('/api/operaciones/:regional', async (req, res) => {
  try {
    const { regional } = req.params;
    const [rows] = await pool.execute(
      'SELECT OPERACIÓN FROM Maestro_Operaciones WHERE REGIONAL = ? AND OPERACIÓN IS NOT NULL ORDER BY OPERACIÓN ASC', 
      [regional]
    );
    res.json(rows.map(r => r.OPERACIÓN));
  } catch (error) {
    console.error("Error API Operaciones:", error);
    res.status(500).json({ error: "No se pudieron cargar las operaciones" });
  }
});

// ══════════════════════════════════════════════════════════════
// Contratación y Finalización
// ══════════════════════════════════════════════════════════════

router.post('/finalizar-contratacion', async (req, res) => {
  const { id_aspirante, regional, operacion, fecha_ingreso } = req.body;
  const usuario = req.query.usuario || req.body.usuario || '';
  
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Obtener información base del aspirante
    const [aspRows] = await connection.query('SELECT * FROM Dynamic_hv_aspirante WHERE id_aspirante = ?', [id_aspirante]);
    if (aspRows.length === 0) throw new Error("Aspirante no encontrado");
    const a = aspRows[0];

    if (!a.IdRequisicion) {
      throw new Error("Es necesario que la hoja de vida esté vinculada a una requisición");
    }

    // 2. Buscar datos de usuario auditor si fue proporcionado
    let nombreUsuario = 'Sistema';
    if (usuario) {
      const [userRows] = await connection.query('SELECT Colaborador FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
      if (userRows.length > 0) {
        nombreUsuario = userRows[0].Colaborador;
      }
    }

    // 3. Consultas en paralelo para datos complementarios (Educación, Emergencia, Requisición, Siesa, TipoDoc)
    const [
      [eduRows], [emeRows], [reqRows], [opData], [tipoDocResult]
    ] = await Promise.all([
      connection.query('SELECT nivel_escolaridad FROM Dynamic_hv_educacion WHERE id_aspirante = ? ORDER BY ano DESC LIMIT 1', [id_aspirante]),
      connection.query('SELECT nombre_completo, telefono FROM Dynamic_hv_contacto_emergencia WHERE id_aspirante = ? LIMIT 1', [id_aspirante]),
      connection.query('SELECT `Cargo Requerido` FROM Dynamic_Requisiciones WHERE IdRequisicion = ? LIMIT 1', [a.IdRequisicion]),
      connection.query('SELECT `CODIGO CO SIESA` FROM Maestro_Operaciones WHERE OPERACIÓN = ?', [operacion]),
      connection.query('SELECT `Cod Identificación` FROM Config_Tipo_Identificación WHERE Descripción = ?', [a.tipo_documento])
    ]);

    const gradoEscolaridad = eduRows.length > 0 ? eduRows[0].nivel_escolaridad : null;
    const nombreEmergencia = emeRows.length > 0 ? emeRows[0].nombre_completo : null;
    const teleEmergencia = emeRows.length > 0 ? emeRows[0].telefono : null;
    const cargoRequerido = reqRows.length > 0 ? reqRows[0]['Cargo Requerido'] : null;
    const codSiesa = opData.length > 0 ? opData[0]['CODIGO CO SIESA'] : null;
    const codTipoDoc = tipoDocResult.length > 0 ? tipoDocResult[0]['Cod Identificación'] : 'CC';
    
    // Fecha Actualización (Bogotá -5)
    const fechaActualizacion = new Date(new Date().getTime() - (5 * 60 * 60 * 1000));
    const horaBogotaSQL = "CONVERT_TZ(NOW(),'SYSTEM','-05:00')";

    // Formatear Nombre del Trabajador: Identificación ** NOMBRES COMPLETOS
    const nombreTrabajador = `${a.identificacion} ** ${[a.primer_nombre, a.segundo_nombre, a.primer_apellido, a.segundo_apellido]
        .filter(n => n && n.trim() !== "").join(" ").toUpperCase()}`.replace(/\s+/g, ' ');

    // Lógica de Reingreso
    const [existeEnSocio] = await connection.query('SELECT Identificación FROM Maestro_Segmentación WHERE Identificación = ?', [a.identificacion]);
    const mensajeFinal = existeEnSocio.length > 0 
        ? 'Este es un reingreso, se insertará un nuevo registro, se recomienda validar en cuanto el sistema termine el proceso' 
        : 'Información enviada con éxito a la Sociodemográfica';

    // 4. INSERT/UPDATE Maestro_Segmentación (Auditoría con nombreUsuario)
    const sqlInsertSegmentacion = `
        INSERT INTO Maestro_Segmentación (
            \`Identificación\`, \`Condicion\`, \`Trabajador\`, \`Tipo de Documento\`, \`Cod. Tipo Doc\`,
            \`Primer Nombre\`, \`Segundo Nombre\`, \`Primer Apellido\`, \`Segundo Apellido\`, \`Género\`,
            \`RH\`, \`País Expedición\`, \`Departamento Expedición\`, \`Ciudad Expedición\`, \`Fecha Expedición\`,
            \`País Nacimiento\`, \`Departamento Nacimiento\`, \`Ciudad Nacimiento\`, \`Fecha Nacimiento\`,
            \`Pais Residencia\`, \`Departamento Residencia\`, \`Ciudad de Residencia\`, \`Dirección de Residencia\`,
            \`Celular\`, \`Email\`, \`Estado Civil\`, \`Grado Escolaridad\`, \`EPS\`, \`Radicacion EPS\`,
            \`Tipo afiliado\`, \`Pensión\`, \`Radicacion AFP\`, \`Cesantías\`, \`Caja de Compensación\`,
            \`Radicacion CCF\`, \`ARL\`, \`Riesgo ARL\`, \`Nombre Contacto de Emergencia\`, \`Telefono Contacto de Emergencia\`,
            \`Banco\`, \`N° Cuenta Bancaria\`, \`Chaqueta\`, \`Camiseta\`, \`Numero\`, \`Pantalon\`, \`Botas\`,
            \`Fecha_Ultima_Entrega\`, \`Observaciones dotacion\`, \`Estado\`, \`Centro de costos\`, \`Operación\`,
            \`Usuario\`, \`Fecha de Actualización\`
        ) VALUES (
            ?, ?, ?, ?, ?, 
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?
        ) ON DUPLICATE KEY UPDATE 
            \`Trabajador\` = VALUES(\`Trabajador\`),
            \`Estado\` = VALUES(\`Estado\`),
            \`Operación\` = VALUES(\`Operación\`),
            \`Centro de costos\` = VALUES(\`Centro de costos\`),
            \`Fecha de Actualización\` = VALUES(\`Fecha de Actualización\`),
            \`Usuario\` = VALUES(\`Usuario\`)
    `;

    const valuesSegmentacion = [
        a.identificacion, null, nombreTrabajador, a.tipo_documento, codTipoDoc,
        a.primer_nombre?.toUpperCase(), a.segundo_nombre?.toUpperCase(), a.primer_apellido?.toUpperCase(), a.segundo_apellido?.toUpperCase(), a.genero || null,
        a.rh, 'Colombia', a.departamento_expedicion, a.ciudad_expedicion, a.fecha_expedicion,
        a.pais_nacimiento || null, a.departamento_nacimiento || null, a.ciudad_nacimiento || null, a.fecha_nacimiento,
        'Colombia', a.departamento, a.ciudad, a.direccion_barrio,
        a.telefono, a.correo_electronico, a.estado_civil, gradoEscolaridad, a.eps, null,
        null, a.afp, null, null, null,
        null, 'Bolivar', null, nombreEmergencia, teleEmergencia,
        null, null, a.camisa_talla, a.camisa_talla, null, a.talla_pantalon, a.zapatos_talla,
        null, null, 'Activo', operacion, operacion,
        nombreUsuario, fechaActualizacion
    ];

    await connection.query(sqlInsertSegmentacion, valuesSegmentacion);

    // 5. Maestro_Vinculación
    await connection.query(`
        INSERT INTO Maestro_Vinculación 
        (\`Id Vinculación\`, Trabajador, Identificación, Regional, Operación, Cargo, \`Cod Siesa\`, \`Fecha de Ingreso\`, Estado, \`Fecha Actualización\`, Usuario)
        VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, 'Activo', ${horaBogotaSQL}, ?)
    `, [nombreTrabajador, a.identificacion, regional, operacion, cargoRequerido, codSiesa, fecha_ingreso, nombreUsuario]);

    // 6. Maestro_Examenes
    await connection.query(`
        INSERT INTO Maestro_Examenes 
        (\`Id Vinculación\`, Trabajador, Identificación, Operación, Estado, \`Fecha Actualización\`, Usuario)
        VALUES (UUID(), ?, ?, ?, 'Activo', ${horaBogotaSQL}, ?)
    `, [nombreTrabajador, a.identificacion, operacion, nombreUsuario]);

    // 7. Traslado de Archivos
    const [docs] = await connection.query(`
        SELECT d.*, c.Prefijo FROM Dynamic_hv_documentos d 
        JOIN Config_Doc_Trabajador c ON d.id_config_doc = c.Id WHERE d.id_aspirante = ?
    `, [id_aspirante]);
    
    const srcBucket = getBucketAspirantes();
    const destBucket = getBucketEmpleados();

    for (const doc of docs) {
      await srcBucket.file(doc.gcs_path).copy(destBucket.file(doc.gcs_path)).catch(e => console.error("Error GCS Copy:", e));

      await connection.query(`
        INSERT INTO Maestro_docTrabajador 
        (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso, TipoDocumento, Prefijo, Doc, Usuario)
        VALUES (UUID(), 'PEND', ?, ?, ?, 'Activo', ?, ?, ?, ?, ?)
      `, [regional, operacion, a.identificacion, fecha_ingreso, doc.id_config_doc, doc.Prefijo, doc.gcs_path, nombreUsuario]);
    }

    // 8. Bloquear proceso del aspirante y guardar el usuario creador en Dynamic_hv_aspirante
    await connection.query('UPDATE Dynamic_hv_aspirante SET estado_proceso = "contratado", Usuario = ? WHERE id_aspirante = ?', [nombreUsuario, id_aspirante]);

    await connection.commit();
    res.redirect(`/seleccion/admin/${id_aspirante}?usuario=${usuario}&msg=success&info=${encodeURIComponent(mensajeFinal)}`);

  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error en contratación:", error);
    res.status(500).send(`Error: ${error.message}`);
  } finally {
    if (connection) connection.release();
  }
});

// ══════════════════════════════════════════════════════════════
// Plantillas HTML Inline (Ajustadas para prefijo /seleccion y query params)
// ══════════════════════════════════════════════════════════════

function generarHtmlPortal(uuid, nombre, docs, mapaDocs, pdfUrl, usuario, estadoProceso, docsFirma = [], tieneRequisicion = false) {
  if (estadoProceso === 'bloqueado') {
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Proceso Bloqueado | Logyser</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Inter', sans-serif; }
      </style>
    </head>
    <body class="bg-slate-50 flex items-center justify-center min-h-screen p-6">
      <div class="max-w-md w-full bg-white shadow-2xl rounded-3xl p-8 border border-red-100 text-center">
        <div class="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m0-6V9m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        </div>
        <h2 class="text-2xl font-black text-slate-800 mb-4 uppercase italic">Proceso Bloqueado</h2>
        <p class="text-slate-600 mb-8 text-sm leading-relaxed">
          Tu proceso de selección ha sido bloqueado automáticamente por seguridad debido a que el número de identificación cargado en tu documento no coincide con el registrado inicialmente.
        </p>
        <div class="bg-red-50 text-red-800 p-4 rounded-2xl text-xs font-semibold mb-8 text-left leading-relaxed">
          ⚠️ Por favor vuelve a comenzar a diligenciar tu hoja de vida ingresando a <strong><a href="https://curriculum.logyser.com" class="underline hover:text-red-900">curriculum.logyser.com</a></strong>.
        </div>
        <p class="text-xs text-slate-400 font-medium">
          Si consideras que esto es un error, por favor ponte en contacto con tu coordinador de selección.
        </p>
      </div>
    </body>
    </html>
    `;
  }

  const scriptFeedback = `
    <script>
      const params = new URLSearchParams(window.location.search);
      if (params.get('msg') === 'deleted') alert('Documento eliminado correctamente.');
      if (params.get('msg') === 'uploaded') alert('Documento guardado y cargado correctamente.');
      if (params.get('msg') === 'firmado') alert('¡Documento firmado y generado con éxito!');
    </script>
  `;

  // Condición: Firmas activas solo si está En Proceso o Contratado Y tiene Requisición vinculada
  const estadoHabilitado = (estadoProceso === 'En proceso' || estadoProceso === 'contratado') && tieneRequisicion;
  const allUploaded = docs.every(doc => mapaDocs[doc.id]);
  const totalCargados = docs.filter(d => mapaDocs[d.id]).length;
  const totalFirmados = docsFirma.filter(d => mapaDocs[d.id] && mapaDocs[d.id].estado === 'Firmado').length;

  const renderDocSoporte = (doc) => {
    const data = mapaDocs[doc.id];
    const estaAprobado = data && data.estado === 'Aprobado';
    const estaCargado = data && !estaAprobado;
    
    const tieneCedula = !!mapaDocs[11];
    const esCedula = doc.id === 11;
    const estaBloqueado = !esCedula && !tieneCedula;

    return `
    <div class="flex flex-col md:flex-row md:items-center justify-between p-4 border ${estaAprobado ? 'border-green-200 bg-green-50' : (estaCargado ? 'border-blue-100 bg-blue-50/30' : 'border-slate-100 bg-white')} ${estaBloqueado ? 'opacity-50 select-none' : ''} rounded-2xl shadow-sm">
      <div class="flex items-center space-x-3 flex-1">
        <div class="${estaAprobado ? 'text-green-500' : (estaCargado ? 'text-blue-500' : 'text-slate-300')}">
          ${estaBloqueado ? 
            '<svg class="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>' : 
            '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>'
          }
        </div>
        <span class="text-sm font-semibold text-slate-700">${doc.nombre}</span>
      </div>
      <div class="flex items-center gap-2 mt-2 md:mt-0">
        ${estaBloqueado ? 
          '<span class="text-[10px] font-black text-slate-400 border border-slate-200 px-3 py-1 rounded-lg bg-white uppercase flex items-center gap-1">🔒 Cédula Requerida</span>' :
          (estaAprobado ? 
            '<span class="text-[10px] font-black text-green-600 border border-green-200 px-3 py-1 rounded-lg bg-white uppercase">Aprobado</span>' : 
            (estaCargado ? 
              `<a href="https://storage.googleapis.com/${BUCKET_ASPIRANTES}/${data.path}" target="_blank" class="text-xs font-bold text-blue-600 px-3 hover:underline">Ver</a>
               <button type="button" onclick="confirmarEliminar('${doc.id}', '${doc.nombre}')" class="text-xs font-bold text-red-400 hover:text-red-600 italic">Eliminar</button>` : 
              `<input type="file" accept=".pdf,.jpg,.jpeg,.png" onchange="uploadAndProcess('${doc.id}', this)" class="block w-full text-[11px] text-slate-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700 font-bold hover:file:bg-blue-100 uppercase">`
            )
          )
        }
      </div>
    </div>`;
  };

  const renderDocFirma = (doc, idx) => {
    const data = mapaDocs[doc.id];
    const estaFirmado = data && data.estado === 'Firmado';
    const estaCargado = data && !estaFirmado;

    return `
    <div class="flex flex-col md:flex-row md:items-center justify-between p-4 border ${estaFirmado ? 'border-emerald-200 bg-emerald-50/50' : (estaCargado ? 'border-blue-100 bg-blue-50/30' : 'border-slate-100 bg-white')} rounded-2xl shadow-xs transition-all hover:border-slate-200">
      <div class="flex items-center space-x-3 flex-1">
        <div class="w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${estaFirmado ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}">
          ${estaFirmado ? '✓' : (idx + 1)}
        </div>
        <div>
          <span class="text-sm font-bold text-slate-800 block">${doc.nombre}</span>
          <span class="text-[10px] font-semibold text-slate-400 font-mono">${doc.prefijo || ''}</span>
        </div>
      </div>

      <div class="flex items-center gap-2 mt-3 md:mt-0">
        ${estaFirmado ? `
          <span class="text-[10px] font-black text-emerald-700 bg-emerald-100 px-3 py-1 rounded-lg uppercase tracking-wide">✓ Firmado</span>
          <a href="https://storage.googleapis.com/${BUCKET_ASPIRANTES}/${data.path}" target="_blank" 
            class="text-xs font-extrabold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-all">
            Ver PDF ↗
          </a>
          <a href="/seleccion/firmar/${uuid}/${doc.id}?usuario=${usuario}" 
            class="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline">
            Volver a firmar
          </a>
        ` : (estaCargado ? `
          <span class="text-[10px] font-black text-blue-700 bg-blue-100 px-3 py-1 rounded-lg uppercase tracking-wide">Cargado</span>
          <a href="https://storage.googleapis.com/${BUCKET_ASPIRANTES}/${data.path}" target="_blank" 
            class="text-xs font-extrabold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-all">
            Ver ↗
          </a>
          <a href="/seleccion/firmar/${uuid}/${doc.id}?usuario=${usuario}" 
            class="text-xs font-black text-white bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-xl uppercase tracking-wider transition-all shadow-xs">
            Firmar Digitalmente →
          </a>
        ` : `
          <a href="/seleccion/firmar/${uuid}/${doc.id}?usuario=${usuario}" 
            class="text-xs font-black text-white bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-xl uppercase tracking-wider transition-all shadow-xs flex items-center gap-1.5">
            <span>✍️</span> Abrir y Firmar →
          </a>
        `)}
      </div>
    </div>`;
  };

  return `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Portal Aspirante | Logyser</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
      body { font-family: 'Inter', sans-serif; }
    </style>
  </head>
  <body class="bg-slate-50 p-4 md:p-8">
    <div class="max-w-3xl mx-auto">
      <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" class="h-20 w-auto object-contain">
        <div class="flex flex-col items-end gap-1.5">
          <a href="https://curriculum-compact-594761951101.europe-west1.run.app" target="_blank" class="text-blue-600 font-semibold text-xs md:text-sm hover:underline">
            📝 Revisar o Editar mi Hoja de Vida
          </a>
          ${pdfUrl ? `
          <a href="${pdfUrl}" target="_blank" class="text-slate-600 font-semibold text-xs md:text-sm hover:underline">
            📄 Ver PDF de mi Hoja de Vida
          </a>
          ` : ``}
        </div>
      </div>

      <!-- Saludo Superior Permanente -->
      <div class="bg-white shadow-xl rounded-3xl p-6 md:p-8 mb-6 border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 class="text-2xl md:text-3xl font-black text-slate-800 italic">¡Hola, ${nombre}!</h2>
          <p class="text-slate-500 text-xs md:text-sm font-medium mt-1">
            ${estadoHabilitado 
              ? 'Has avanzado a la fase de vinculación. Puedes gestionar tus documentos y firmas digitales en las secciones a continuación.' 
              : 'Bienvenido al proceso de selección. Sube y gestiona tus documentos de soporte requeridos.'}
          </p>
        </div>
        ${estadoHabilitado ? `
          <div class="flex items-center gap-2 self-start md:self-auto bg-purple-50 border border-purple-200 px-4 py-2 rounded-2xl shrink-0">
            <span class="w-2.5 h-2.5 rounded-full bg-purple-600 animate-pulse"></span>
            <span class="text-xs font-black text-purple-800 uppercase tracking-wide">Fase: En Proceso</span>
          </div>
        ` : `
          <div class="flex items-center gap-2 self-start md:self-auto bg-blue-50 border border-blue-200 px-4 py-2 rounded-2xl shrink-0">
            <span class="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
            <span class="text-xs font-black text-blue-800 uppercase tracking-wide">Fase: Registro Inicial</span>
          </div>
        `}
      </div>

      ${estadoHabilitado ? `
      <!-- Secciones agrupadas y plegables / desplegables en estado "En Proceso" -->
      
      <!-- Sección 1: Documentos de Soporte (Acordeón Plegable) -->
      <div class="bg-white shadow-xl rounded-3xl overflow-hidden border border-slate-100 mb-6 transition-all">
        <button type="button" onclick="toggleSeccion('secSoporte')" 
          class="w-full p-6 md:p-8 text-left bg-white hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 font-black text-sm flex items-center justify-center shrink-0">
              1
            </div>
            <div>
              <h3 class="text-lg md:text-xl font-black text-slate-800 uppercase italic tracking-tight">
                Documentos de Soporte
              </h3>
              <p class="text-xs text-slate-400 font-medium">Cédula, Antecedentes, EPS, Certificados laborales y bancarios</p>
            </div>
          </div>
          <div class="flex items-center gap-3 self-end sm:self-auto">
            <span class="text-xs font-black px-3.5 py-1.5 rounded-xl border ${totalCargados === docs.length ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}">
              ${totalCargados} de ${docs.length} cargados
            </span>
            <div id="secSoporteChevron" class="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center transition-transform duration-300">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </button>

        <div id="secSoporteContenido" class="hidden p-6 md:p-8 border-t border-slate-100 bg-slate-50/30">
          <p class="text-slate-500 mb-6 text-xs md:text-sm font-medium">
            Sube o actualiza los documentos de soporte requeridos. 
            <span class="text-red-500 block mt-1">Los documentos aprobados no podrán ser modificados. El sistema procesará cada documento con Inteligencia Artificial al subirlo.</span>
          </p>

          ${allUploaded ? `
          <div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-6 text-center">
            <div class="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>
            </div>
            <h4 class="text-sm font-bold text-slate-800">¡Documentos de Soporte Completados!</h4>
            <p class="text-[11px] text-slate-500">Has subido todos los documentos requeridos de esta sección.</p>
          </div>
          ` : ''}

          <div class="space-y-3">
            ${docs.map(renderDocSoporte).join('')}
          </div>
        </div>
      </div>

      <!-- Sección 2: Documentos para Firma Digital (Acordeón Plegable, Inicia Desplegado) -->
      <div class="bg-white shadow-xl rounded-3xl overflow-hidden border border-slate-100 mb-8 transition-all">
        <button type="button" onclick="toggleSeccion('secFirmas')" 
          class="w-full p-6 md:p-8 text-left bg-white hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 font-black text-sm flex items-center justify-center shrink-0">
              2
            </div>
            <div>
              <h3 class="text-lg md:text-xl font-black text-slate-800 uppercase italic tracking-tight flex items-center gap-2">
                Documentos para Firma Digital
                <span class="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse"></span>
              </h3>
              <p class="text-xs text-slate-400 font-medium">Contratos laborales, acuerdos de confidencialidad y autorizaciones</p>
            </div>
          </div>
          <div class="flex items-center gap-3 self-end sm:self-auto">
            <span class="text-xs font-black px-3.5 py-1.5 rounded-xl border ${totalFirmados === docsFirma.length ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-orange-50 text-orange-700 border-orange-200'}">
              ${totalFirmados} de ${docsFirma.length} firmados
            </span>
            <div id="secFirmasChevron" class="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center transition-transform duration-300 rotate-180">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </button>

        <div id="secFirmasContenido" class="p-6 md:p-8 border-t border-slate-100">
          <p class="text-slate-500 text-xs md:text-sm mb-6 font-medium">
            Por favor lee cuidadosamente y estampa tu firma digital en cada uno de los siguientes documentos obligatorios para formalizar tu vinculación.
          </p>

          <!-- Barra de Progreso -->
          <div class="w-full bg-slate-100 h-2.5 rounded-full mb-6 overflow-hidden">
            <div class="bg-orange-500 h-full rounded-full transition-all duration-500" 
              style="width: ${Math.round((totalFirmados / (docsFirma.length || 1)) * 100)}%"></div>
          </div>

          <div class="space-y-3">
            ${docsFirma.map(renderDocFirma).join('')}
          </div>
        </div>
      </div>
      ` : `
      <!-- Vista normal no plegable en fase de Registro -->
      <div class="bg-white shadow-2xl rounded-3xl overflow-hidden border border-slate-100 p-8 md:p-12 mb-8">
        <h3 class="text-xl font-black text-slate-800 mb-2 uppercase italic">Documentos Requeridos</h3>
        <p class="text-slate-500 mb-8 text-sm font-medium">
          Sube y gestiona los documentos requeridos a continuación. 
          <span class="text-red-500 block mt-1">Los documentos aprobados no podrán ser modificados. El sistema procesará cada documento con Inteligencia Artificial al subirlo.</span>
        </p>

        ${allUploaded ? `
        <div class="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 mb-8 text-center">
          <div class="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>
          </div>
          <h3 class="text-lg font-bold text-slate-800 mb-1">¡Documentos Completados!</h3>
          <p class="text-xs text-slate-500">Has subido todos los documentos requeridos. El equipo de Selección y Contratación los revisará a la brevedad.</p>
        </div>
        ` : ''}

        <div class="space-y-3">
          ${docs.map(renderDocSoporte).join('')}
        </div>
      </div>

      <!-- Card informativo cuando está en fase de Registro -->
      <div class="bg-white/80 border border-slate-200/80 rounded-3xl p-6 text-center mb-8 shadow-xs">
        <div class="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 mb-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
        </div>
        <h4 class="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">Fase 2: Documentos para Firma Digital (Pendiente de Activación)</h4>
        <p class="text-xs text-slate-500 max-w-lg mx-auto leading-relaxed">
          Una vez subas y el equipo de Selección valide tus documentos de soporte iniciales y se vincule tu requisición, tu estado pasará a <strong>'En Proceso'</strong> y se habilitará aquí la lista de contratos y formatos para firmar digitalmente.
        </p>
      </div>
      `}
    </div>
    </div>

    <!-- Spinner Overlay -->
    <div id="spinnerOverlay" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 hidden flex flex-col items-center justify-center text-white p-4">
      <div class="animate-spin rounded-full h-16 w-16 border-4 border-white border-t-transparent mb-4"></div>
      <p class="text-lg font-bold text-center" id="spinnerText">Procesando con Inteligencia Artificial...</p>
    </div>

    <!-- Mismatch ID Modal -->
    <div id="mismatchIdModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 hidden flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-red-100">
        <div class="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-6">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        </div>
        <h3 class="text-xl font-bold text-slate-800 mb-4">Discrepancia de Identificación</h3>
        <p class="text-sm text-slate-600 mb-6 leading-relaxed">
          La cédula que subiste contiene el número <strong id="mismatchExtID" class="text-red-600"></strong>, pero tu perfil está registrado con el número <strong id="mismatchRegID" class="text-slate-800"></strong>. ¿Cuál de estos es tu identificación correcta?
        </p>
        <div class="space-y-3">
          <button onclick="handleMismatchChoice('extracted')" class="w-full bg-red-600 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase hover:bg-red-700 transition-all text-left flex justify-between items-center">
            <span>El número de la cédula es correcto (Mi registro inicial tiene un error)</span>
            <span>➔</span>
          </button>
          <button onclick="handleMismatchChoice('registered')" class="w-full bg-slate-100 text-slate-700 font-bold py-3 px-4 rounded-xl text-xs uppercase hover:bg-slate-200 transition-all text-left flex justify-between items-center">
            <span>El registro inicial es el correcto (Cargué el documento equivocado)</span>
            <span>➔</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Mismatch Doc Modal -->
    <div id="mismatchDocModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 hidden flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-amber-100">
        <div class="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-6">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        </div>
        <h3 class="text-xl font-bold text-slate-800 mb-4">¿Es este el documento correcto?</h3>
        <p class="text-sm text-slate-600 mb-4 leading-relaxed">
          Nuestro asistente virtual (en fase de aprendizaje) estima que el documento cargado es de tipo <strong id="mismatchExtDoc" class="text-amber-600"></strong>, pero lo estás subiendo en el campo de <strong id="mismatchExpDoc" class="text-slate-800"></strong>. Por favor, verifica si corresponde.
        </p>
        <a id="mismatchDocPreviewLink" href="#" target="_blank" class="block text-center text-xs font-black text-blue-600 hover:text-blue-800 border border-blue-100 bg-blue-50/30 rounded-xl py-2 mb-6 transition-all uppercase">
          🔍 Ver Archivo Cargado
        </a>
        <div class="flex gap-3">
          <button onclick="closeModal('mismatchDocModal')" class="flex-1 bg-slate-100 text-slate-700 font-bold py-3 rounded-xl text-xs uppercase hover:bg-slate-200 transition-all">
            Subir otro archivo
          </button>
          <button onclick="confirmMismatchDocType()" class="flex-1 bg-amber-600 text-white font-bold py-3 rounded-xl text-xs uppercase hover:bg-amber-700 transition-all">
            Sí, es correcto
          </button>
        </div>
      </div>
    </div>

    <!-- Mismatch Doc ID Modal (Other documents) -->
    <div id="mismatchDocIdModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 hidden flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-amber-100">
        <div class="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-6">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        </div>
        <h3 class="text-xl font-bold text-slate-800 mb-4">Identificación Diferente</h3>
        <p class="text-sm text-slate-600 mb-4 leading-relaxed">
          El documento (<span id="mismatchDocIdName" class="font-bold text-slate-800"></span>) contiene la identificación <strong id="mismatchDocIdExt" class="text-amber-600"></strong>, la cual no coincide con tu perfil (<span id="mismatchDocIdReg" class="font-bold text-slate-800"></span>).
        </p>
        <a id="mismatchDocIdPreviewLink" href="#" target="_blank" class="block text-center text-xs font-black text-blue-600 hover:text-blue-800 border border-blue-100 bg-blue-50/30 rounded-xl py-2 mb-6 transition-all uppercase">
          🔍 Ver Archivo Cargado
        </a>
        <div class="flex gap-3">
          <button onclick="closeModal('mismatchDocIdModal')" class="flex-1 bg-slate-100 text-slate-700 font-bold py-3 rounded-xl text-xs uppercase hover:bg-slate-200 transition-all">
            Cancelar
          </button>
          <button onclick="confirmOtherDocMismatch()" class="flex-1 bg-amber-600 text-white font-bold py-3 rounded-xl text-xs uppercase hover:bg-amber-700 transition-all">
            Continuar de todas formas
          </button>
        </div>
      </div>
    </div>

    <!-- Cedula Confirm Modal -->
    <div id="cedulaConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 hidden flex items-center justify-center p-4 overflow-y-auto">
      <div class="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl border border-slate-100 my-8">
        <h3 class="text-2xl font-bold text-slate-800 mb-2 italic">Confirmar Datos Extraídos</h3>
        <p class="text-xs text-slate-500 mb-6">
          Por seguridad y precisión, la Inteligencia Artificial ha extraído los siguientes datos de tu Cédula. Confirma si son correctos para actualizar tu perfil:
        </p>
        
        <form id="cedulaConfirmForm" onsubmit="submitCedulaConfirmation(event)">
          <div class="space-y-4 max-h-[60vh] overflow-y-auto pr-2 mb-6">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nombres</label>
              <input type="text" id="confirm-nombres" required class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:border-blue-500">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Apellidos</label>
              <input type="text" id="confirm-apellidos" required class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:border-blue-500">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Género</label>
                <select id="confirm-sexo" required class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:border-blue-500">
                  <option value="MASCULINO">MASCULINO</option>
                  <option value="FEMENINO">FEMENINO</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">RH</label>
                <input type="text" id="confirm-rh" required class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:border-blue-500">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Fecha de Nacimiento</label>
                <input type="date" id="confirm-fecha-nacimiento" required class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:border-blue-500">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Fecha de Expedición</label>
                <input type="date" id="confirm-fecha-expedicion" required class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:border-blue-500">
              </div>
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Lugar de Expedición</label>
              <div class="grid grid-cols-2 gap-2">
                <select id="confirm-depto-expedicion" required class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:border-blue-500" onchange="actualizarCiudadesExp(this.value)">
                  <option value="">Departamento</option>
                </select>
                <select id="confirm-ciudad-expedicion" required class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:border-blue-500">
                  <option value="">Ciudad</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">País de Nacimiento</label>
                <select id="confirm-pais-nacimiento" required class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:border-blue-500" onchange="onPaisNacimientoChange(this.value)">
                  <option value="Colombia">Colombia</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Lugar de Nacimiento</label>
                <div id="lugar-nacimiento-container">
                  <!-- Se inyecta dinámicamente -->
                </div>
              </div>
            </div>
          </div>
          
          <div class="flex gap-4">
            <button type="button" onclick="closeModal('cedulaConfirmModal')" class="flex-1 bg-slate-100 text-slate-700 font-bold py-3 rounded-2xl text-xs uppercase hover:bg-slate-200 transition-all">
              Cancelar
            </button>
            <button type="submit" class="flex-1 bg-blue-600 text-white font-bold py-3 rounded-2xl text-xs uppercase hover:bg-blue-700 transition-all shadow-md">
              Confirmar y Guardar
            </button>
          </div>
        </form>
      </div>
    </div>

    <form id="deleteForm" action="/seleccion/delete-doc?usuario=${usuario}" method="POST" style="display:none;">
      <input type="hidden" name="id_aspirante" value="${uuid}">
      <input type="hidden" name="id_config_doc" id="delete_id_config_doc">
    </form>

    <script>
      let globalCiudades = [];
      let candidatePaisNacimiento = 'Colombia';

      // Cargar catálogo de ciudades desde memoria al iniciar el portal
      fetch('/seleccion/api/ciudades')
        .then(r => r.json())
        .then(data => {
          globalCiudades = data;
          populatePaisNacimientoDropdown();
        })
        .catch(err => console.error('Error cargando ciudades:', err));

      function populatePaisNacimientoDropdown() {
        const paisSelect = document.getElementById('confirm-pais-nacimiento');
        if (!paisSelect) return;
        
        const paises = [...new Set(globalCiudades.map(c => c.Pais).filter(Boolean))].sort();
        
        if (!paises.some(p => p.toLowerCase() === 'colombia')) {
          paises.unshift('Colombia');
        } else {
          const index = paises.findIndex(p => p.toLowerCase() === 'colombia');
          if (index > -1) {
            paises.splice(index, 1);
            paises.unshift('Colombia');
          }
        }
        
        paisSelect.innerHTML = '';
        paises.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p;
          opt.textContent = p;
          paisSelect.appendChild(opt);
        });
        
        paisSelect.value = 'Colombia';
      }

      function onPaisNacimientoChange(pais) {
        candidatePaisNacimiento = pais;
        initLugarNacimientoDropdowns('', '', pais);
      }

      function initLugarExpedicionDropdowns(selectedDepto, selectedCiudad) {
        const deptoSelect = document.getElementById('confirm-depto-expedicion');
        const colCiudades = globalCiudades.filter(c => (c.Pais || '').trim().toLowerCase() === 'colombia');
        const deptos = [...new Set(colCiudades.map(c => c.Departamento))].sort();
        
        deptoSelect.innerHTML = '<option value="">Seleccione Departamento</option>';
        deptos.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d;
          opt.textContent = d;
          deptoSelect.appendChild(opt);
        });
        
        if (selectedDepto) {
          deptoSelect.value = selectedDepto;
        }
        
        actualizarCiudadesExp(deptoSelect.value, selectedCiudad);
      }

      function actualizarCiudadesExp(depto, selectedCiudad) {
        const ciudadSelect = document.getElementById('confirm-ciudad-expedicion');
        ciudadSelect.innerHTML = '<option value="">Seleccione Ciudad</option>';
        if (!depto) return;
        
        const colCiudades = globalCiudades.filter(c => (c.Pais || '').trim().toLowerCase() === 'colombia' && c.Departamento === depto);
        const uniqueCiudades = [...new Set(colCiudades.map(c => c.Ciudad))].sort();
        
        uniqueCiudades.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c;
          opt.textContent = c;
          ciudadSelect.appendChild(opt);
        });
        
        if (selectedCiudad) {
          ciudadSelect.value = selectedCiudad;
        }
      }

      function initLugarNacimientoDropdowns(selectedDepto, selectedCiudad, paisNacimiento) {
        const container = document.getElementById('lugar-nacimiento-container');
        const targetPais = (paisNacimiento || 'colombia').trim().toLowerCase();
        candidatePaisNacimiento = targetPais;
        
        const paisCiudades = globalCiudades.filter(c => (c.Pais || '').trim().toLowerCase() === targetPais);
        
        if (paisCiudades.length > 0) {
          container.innerHTML = '<div class="grid grid-cols-2 gap-2">' +
            '<select id="confirm-depto-nacimiento" required class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:border-blue-500" onchange="actualizarCiudadesNac(this.value)">' +
              '<option value="">Departamento</option>' +
            '</select>' +
            '<select id="confirm-ciudad-nacimiento" required class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:border-blue-500">' +
              '<option value="">Ciudad</option>' +
            '</select>' +
          '</div>';
          
          const deptoSelect = document.getElementById('confirm-depto-nacimiento');
          const deptos = [...new Set(paisCiudades.map(c => c.Departamento))].sort();
          
          deptoSelect.innerHTML = '<option value="">Seleccione Departamento</option>';
          deptos.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            deptoSelect.appendChild(opt);
          });
          
          if (selectedDepto) {
            deptoSelect.value = selectedDepto;
          }
          
          actualizarCiudadesNac(deptoSelect.value, selectedCiudad, targetPais);
        } else {
          container.innerHTML = '<input type="text" id="confirm-lugar-nacimiento" required class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:border-blue-500" placeholder="Escriba lugar de nacimiento">';
          const txtInput = document.getElementById('confirm-lugar-nacimiento');
          txtInput.value = selectedCiudad || '';
        }
      }

      function actualizarCiudadesNac(depto, selectedCiudad, targetPais) {
        const ciudadSelect = document.getElementById('confirm-ciudad-nacimiento');
        if (!ciudadSelect) return;
        ciudadSelect.innerHTML = '<option value="">Seleccione Ciudad</option>';
        if (!depto) return;
        
        const pais = targetPais || candidatePaisNacimiento;
        const filtered = globalCiudades.filter(c => (c.Pais || '').trim().toLowerCase() === pais && c.Departamento === depto);
        const uniqueCiudades = [...new Set(filtered.map(c => c.Ciudad))].sort();
        
        uniqueCiudades.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c;
          opt.textContent = c;
          ciudadSelect.appendChild(opt);
        });
        
        if (selectedCiudad) {
          ciudadSelect.value = selectedCiudad;
        }
      }

      let currentFileState = {
        id_aspirante: '${uuid}',
        usuario: '${usuario}',
        id_config_doc: null,
        temp_gcs_path: null,
        extractedID: null,
        registeredID: null,
        extractedDoc: null,
        extracted_data: null
      };

      function openModal(id) {
        document.getElementById(id).classList.remove('hidden');
      }

      function closeModal(id) {
        document.getElementById(id).classList.add('hidden');
      }

      let spinnerInterval = null;
      function startDynamicSpinner(messages) {
        if (spinnerInterval) clearInterval(spinnerInterval);
        let index = 0;
        showSpinner(messages[0]);
        spinnerInterval = setInterval(() => {
          index = (index + 1) % messages.length;
          document.getElementById('spinnerText').innerText = messages[index];
        }, 2500);
      }

      function stopDynamicSpinner() {
        if (spinnerInterval) {
          clearInterval(spinnerInterval);
          spinnerInterval = null;
        }
        hideSpinner();
      }

      function showSpinner(text) {
        document.getElementById('spinnerText').innerText = text || 'Procesando con Inteligencia Artificial...';
        document.getElementById('spinnerOverlay').classList.remove('hidden');
      }

      function hideSpinner() {
        document.getElementById('spinnerOverlay').classList.add('hidden');
      }

      function confirmarEliminar(id, nombre) {
        if(confirm('¿Estás seguro de eliminar el documento: ' + nombre + '?')) {
          document.getElementById('delete_id_config_doc').value = id;
          document.getElementById('deleteForm').submit();
        }
      }

      function compressImageIfNeeded(file) {
        return new Promise((resolve) => {
          if (!file.type.startsWith('image/')) {
            return resolve(file);
          }
          const img = new Image();
          img.src = URL.createObjectURL(file);
          img.onload = () => {
            URL.revokeObjectURL(img.src);
            const MAX_WIDTH = 1600;
            const MAX_HEIGHT = 1600;
            let width = img.width;
            let height = img.height;

            if (width > MAX_WIDTH || height > MAX_HEIGHT) {
              if (width > height) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
              } else {
                width = Math.round((width * MAX_HEIGHT) / height);
                height = MAX_HEIGHT;
              }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
              if (!blob) return resolve(file);
              const compressedFile = new File([blob], file.name.substring(0, file.name.lastIndexOf('.')) + '.jpg', {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressedFile);
            }, 'image/jpeg', 0.7);
          };
          img.onerror = () => resolve(file);
        });
      }

      function uploadAndProcess(idConfigDoc, inputEl) {
        if (!inputEl.files || inputEl.files.length === 0) return;
        const file = inputEl.files[0];
        
        currentFileState.id_config_doc = idConfigDoc;
        
        if (idConfigDoc === 11) {
          const messages = [
            'Preparando y optimizando imagen de la Cédula...',
            'Subiendo archivo de forma segura al servidor...',
            'Invocando Inteligencia Artificial (Document AI)...',
            'Analizando y extrayendo datos (Nombres y Fechas)...',
            'Validando información con el sistema...',
            'Casi listo, finalizando análisis...'
          ];
          startDynamicSpinner(messages);
        } else {
          showSpinner('Cargando y guardando documento...');
        }

        compressImageIfNeeded(file).then(optimizedFile => {
          const formData = new FormData();
          formData.append('file', optimizedFile);
          formData.append('id_aspirante', currentFileState.id_aspirante);
          formData.append('id_config_doc', idConfigDoc);

          fetch('/seleccion/api/classify-doc', {
            method: 'POST',
            body: formData
          })
        .then(res => res.json())
        .then(data => {
          stopDynamicSpinner();
          if (data.error) {
            alert('Error: ' + data.error);
            inputEl.value = '';
            return;
          }

          currentFileState.temp_gcs_path = data.tempGcsPath;

          if (data.status === 'error_processing') {
            alert(data.message);
            confirmWithoutDocAI();
            return;
          }

          if (data.status === 'mismatch_id') {
            currentFileState.extractedID = data.extractedID;
            currentFileState.registeredID = data.registeredID;
            document.getElementById('mismatchExtID').innerText = data.extractedID;
            document.getElementById('mismatchRegID').innerText = data.registeredID;
            openModal('mismatchIdModal');
            inputEl.value = '';
            return;
          }

          if (data.status === 'mismatch_doc') {
            document.getElementById('mismatchExtDoc').innerText = data.extractedDoc;
            document.getElementById('mismatchExpDoc').innerText = data.expectedDoc;
            document.getElementById('mismatchDocPreviewLink').href = 'https://storage.googleapis.com/hojas_vida_logyser/' + data.tempGcsPath;
            openModal('mismatchDocModal');
            inputEl.value = '';
            return;
          }

          if (data.status === 'mismatch_doc_id') {
            currentFileState.extractedID = data.extractedID;
            currentFileState.registeredID = data.registeredID;
            currentFileState.extractedDoc = data.extractedDoc;
            document.getElementById('mismatchDocIdName').innerText = data.extractedDoc;
            document.getElementById('mismatchDocIdExt').innerText = data.extractedID;
            document.getElementById('mismatchDocIdReg').innerText = data.registeredID;
            document.getElementById('mismatchDocIdPreviewLink').href = 'https://storage.googleapis.com/hojas_vida_logyser/' + data.tempGcsPath;
            openModal('mismatchDocIdModal');
            inputEl.value = '';
            return;
          }

          if (data.status === 'success_cedula') {
            const ext = data.data.extracted;
            const reg = data.data.registered;
            
            document.getElementById('confirm-nombres').value = ext.nombres || [reg.primer_nombre, reg.segundo_nombre].filter(Boolean).join(' ');
            document.getElementById('confirm-apellidos').value = ext.apellidos || [reg.primer_apellido, reg.segundo_apellido].filter(Boolean).join(' ');
            document.getElementById('confirm-sexo').value = ext.sexo === 'FEMENINO' || reg.genero === 'FEMENINO' ? 'FEMENINO' : 'MASCULINO';
            document.getElementById('confirm-rh').value = ext.grupo_sanguineo || reg.rh || '';
            document.getElementById('confirm-fecha-nacimiento').value = ext.fecha_nacimiento || reg.fecha_nacimiento || '';
            document.getElementById('confirm-fecha-expedicion').value = ext.fecha_expedicion || reg.fecha_expedicion || '';
            
            // Lugar de expedición
            const deptoExp = ext.departamento_expedicion || reg.departamento_expedicion || '';
            const ciudadExp = ext.ciudad_expedicion || reg.ciudad_expedicion || '';
            initLugarExpedicionDropdowns(deptoExp, ciudadExp);

            // Lugar de nacimiento
            const deptoNac = ext.departamento_nacimiento || reg.departamento_nacimiento || '';
            const ciudadNac = ext.ciudad_nacimiento || reg.ciudad_nacimiento || '';
            const paisNac = reg.pais_nacimiento || ext.pais_nacimiento || 'Colombia';
            const selectPaisNac = document.getElementById('confirm-pais-nacimiento');
            if (selectPaisNac) {
              let hasOption = false;
              for (let i = 0; i < selectPaisNac.options.length; i++) {
                if (selectPaisNac.options[i].value.toLowerCase() === paisNac.toLowerCase()) {
                  hasOption = true;
                  selectPaisNac.value = selectPaisNac.options[i].value;
                  break;
                }
              }
              if (!hasOption) {
                const opt = document.createElement('option');
                opt.value = paisNac;
                opt.textContent = paisNac;
                selectPaisNac.appendChild(opt);
                selectPaisNac.value = paisNac;
              }
            }
            initLugarNacimientoDropdowns(deptoNac, ciudadNac, paisNac);

            currentFileState.extracted_data = ext;

            openModal('cedulaConfirmModal');
            return;
          }

          if (data.status === 'success_other') {
            confirmDocumentDirectly();
          }
        })
        .catch(err => {
          stopDynamicSpinner();
          console.error(err);
          alert('Error de conexión al subir archivo');
          inputEl.value = '';
        });
      });
      }

      function confirmWithoutDocAI() {
        if (confirm('¿Deseas guardar este archivo de todas formas de manera manual?')) {
          confirmDocumentDirectly();
        }
      }

      function confirmDocumentDirectly() {
        showSpinner('Guardando documento en el servidor...');
        fetch('/seleccion/api/confirm-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id_aspirante: currentFileState.id_aspirante,
            id_config_doc: currentFileState.id_config_doc,
            temp_gcs_path: currentFileState.temp_gcs_path
          })
        })
        .then(res => res.json())
        .then(data => {
          hideSpinner();
          if (data.ok) {
            window.location.href = '/seleccion/portal/' + currentFileState.id_aspirante + '?usuario=' + currentFileState.usuario + '&msg=uploaded';
          } else {
            alert('Error al confirmar: ' + data.error);
          }
        })
        .catch(err => {
          hideSpinner();
          console.error(err);
          alert('Error de red al confirmar');
        });
      }

      function confirmOtherDocMismatch() {
        closeModal('mismatchDocIdModal');
        confirmDocumentDirectly();
      }

      function confirmMismatchDocType() {
        closeModal('mismatchDocModal');
        confirmDocumentDirectly();
      }

      function handleMismatchChoice(choice) {
        closeModal('mismatchIdModal');
        if (choice === 'extracted') {
          showSpinner('Bloqueando proceso por discrepancia de identidad...');
          fetch('/seleccion/api/block-process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id_aspirante: currentFileState.id_aspirante,
              usuario: currentFileState.usuario,
              temp_gcs_path: currentFileState.temp_gcs_path,
              extractedID: currentFileState.extractedID,
              registeredID: currentFileState.registeredID
            })
          })
          .then(res => res.json())
          .then(data => {
            hideSpinner();
            window.location.href = '/seleccion/portal/' + currentFileState.id_aspirante + '?usuario=' + currentFileState.usuario + '&msg=blocked';
          })
          .catch(err => {
            hideSpinner();
            console.error(err);
            window.location.href = '/seleccion/portal/' + currentFileState.id_aspirante + '?usuario=' + currentFileState.usuario + '&msg=blocked';
          });
        } else {
          fetch('/seleccion/api/block-process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id_aspirante: currentFileState.id_aspirante,
              temp_gcs_path: currentFileState.temp_gcs_path,
              only_delete_temp: true
            })
          }).catch(console.error);
          alert('Por favor, selecciona e ingresa una copia del documento correcto correspondiente a tu ID registrado.');
        }
      }

      function submitCedulaConfirmation(event) {
        event.preventDefault();
        
        const deptoExp = document.getElementById('confirm-depto-expedicion').value;
        const ciudadExp = document.getElementById('confirm-ciudad-expedicion').value;
        
        let deptoNac = '';
        let ciudadNac = '';
        const selectDeptoNac = document.getElementById('confirm-depto-nacimiento');
        const selectCiudadNac = document.getElementById('confirm-ciudad-nacimiento');
        const inputLugarNac = document.getElementById('confirm-lugar-nacimiento');
        
        if (selectCiudadNac) {
          deptoNac = selectDeptoNac.value;
          ciudadNac = selectCiudadNac.value;
        } else if (inputLugarNac) {
          const rawLugarNac = inputLugarNac.value;
          const parsedNac = rawLugarNac.match(/^([^(]+)\s*(?:\(([^)]+)\))?$/);
          ciudadNac = parsedNac ? parsedNac[1].trim() : rawLugarNac;
          deptoNac = parsedNac && parsedNac[2] ? parsedNac[2].trim() : '';
        }

        const confirmedData = {
          nombres: document.getElementById('confirm-nombres').value,
          apellidos: document.getElementById('confirm-apellidos').value,
          sexo: document.getElementById('confirm-sexo').value,
          grupo_sanguineo: document.getElementById('confirm-rh').value,
          fecha_nacimiento: document.getElementById('confirm-fecha-nacimiento').value,
          fecha_expedicion: document.getElementById('confirm-fecha-expedicion').value,
          ciudad_expedicion: ciudadExp,
          departamento_expedicion: deptoExp,
          ciudad_nacimiento: ciudadNac,
          departamento_nacimiento: deptoNac,
          pais_nacimiento: document.getElementById('confirm-pais-nacimiento').value
        };

        closeModal('cedulaConfirmModal');
        showSpinner('Guardando datos confirmados de Cédula...');

        fetch('/seleccion/api/confirm-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id_aspirante: currentFileState.id_aspirante,
            id_config_doc: currentFileState.id_config_doc,
            temp_gcs_path: currentFileState.temp_gcs_path,
            confirmed_data: confirmedData
          })
        })
        .then(res => res.json())
        .then(data => {
          hideSpinner();
          if (data.ok) {
            window.location.href = '/seleccion/portal/' + currentFileState.id_aspirante + '?usuario=' + currentFileState.usuario + '&msg=uploaded';
          } else {
            alert('Error al confirmar cédula: ' + data.error);
          }
        })
        .catch(err => {
          hideSpinner();
          console.error(err);
          alert('Error de red al confirmar cédula');
        });
      }

      function toggleSeccion(secId) {
        const cont = document.getElementById(secId + 'Contenido');
        const chev = document.getElementById(secId + 'Chevron');
        if (!cont) return;
        if (cont.classList.contains('hidden')) {
          cont.classList.remove('hidden');
          if (chev) chev.classList.add('rotate-180');
        } else {
          cont.classList.add('hidden');
          if (chev) chev.classList.remove('rotate-180');
        }
      }
    </script>
    ${scriptFeedback}
  </body>
  </html>`;
}

function generarHtmlAdmin(uuid, asp, idsAsp, nombresAsp, docsTec, docsFir, mapa, bloqueado, usuario, requisiciones = []) {
  const reqsEnProceso = requisiciones.filter(r => (r.Estado || '').toString().trim().toLowerCase() === 'en proceso');
  const reqsOtras = requisiciones.filter(r => (r.Estado || '').toString().trim().toLowerCase() !== 'en proceso');

  const renderOpcionReq = (r) => {
    const isSelected = String(r.IdRequisicion) === String(asp.IdRequisicion);
    const nPersonas = (r['N° Personas Requeridas'] !== null && r['N° Personas Requeridas'] !== undefined) ? ` - ${r['N° Personas Requeridas']}` : '';
    const texto = `${r['Requisición'] || 'S/R'} - ${r['Operación'] || 'S/O'} - ${r['Cargo Requerido'] || 'S/C'}${nPersonas}`;
    return `<option value="${r.IdRequisicion}" ${isSelected ? 'selected' : ''}>${texto}</option>`;
  };

  const renderFilaSeleccion = (doc) => {
    const data = mapa[doc.id];
    const estaFirmado = data && data.estado === 'Firmado';
    return `
    <div class="p-3 border-b border-slate-100 last:border-0">
      <div class="flex justify-between items-center mb-2">
        <div class="flex items-center gap-1.5 flex-1 pr-2">
          <span class="text-[11px] font-bold text-slate-700 uppercase">${doc.nombre}</span>
          ${doc.prefijo ? `<span class="text-[9px] text-slate-400 font-mono font-bold">(${doc.prefijo})</span>` : ''}
        </div>
        ${data ? `
          <div class="flex items-center gap-1.5 shrink-0">
            ${estaFirmado 
              ? '<span class="text-[9px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md uppercase tracking-wider">✓ FIRMADO</span>' 
              : '<span class="text-[9px] font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md uppercase tracking-wider">CARGADO</span>'}
            <a href="https://storage.googleapis.com/${BUCKET_ASPIRANTES}/${data.path}" target="_blank" class="text-[10px] text-blue-600 font-bold hover:underline">VER</a>
            ${!bloqueado ? `<button type="button" onclick="eliminar(${doc.id}, '${doc.nombre}')" class="text-[10px] text-red-400 font-bold italic hover:text-red-600">ELIMINAR</button>` : ''}
          </div>
        ` : '<span class="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-bold italic shrink-0">Pendiente</span>'}
      </div>
      ${!data && !bloqueado ? `
        <div class="relative border-2 border-dashed border-slate-200 rounded-lg p-2 hover:border-blue-400 transition-colors bg-slate-50">
          <input type="file" name="file_${doc.id}" accept=".pdf" 
                 onchange="this.parentElement.querySelector('.file-name').innerText = this.files[0].name; this.parentElement.classList.add('bg-blue-50', 'border-blue-400')"
                 class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
          <p class="text-[9px] text-center text-slate-400 file-name">Arrastra o haz clic para subir PDF manual</p>
        </div>
      ` : ''}
    </div>`;
  };

  const scriptFeedback = `
    <script>
      const params = new URLSearchParams(window.location.search);
      if (params.get('msg') === 'success') {
        const info = params.get('info') || 'Proceso completado';
        alert(info);
      }
      if (params.get('msg') === 'error') {
        const info = params.get('info') || 'Ocurrió un error en la solicitud';
        alert('⚠️ ' + info);
      }
      if (params.get('msg') === 'aprobado') alert('Documento aprobado con éxito');
      if (params.get('msg') === 'deleted') alert('Documento eliminado del sistema');
    </script>
  `;

  const totalFirmados = docsFir.filter(d => mapa[d.id] && mapa[d.id].estado === 'Firmado').length;

  return `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gestión de Selección | Logyser</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;900&display=swap" rel="stylesheet">
    <style>
      body { font-family: 'Inter', sans-serif; }
      .interfaz-bloqueada { filter: grayscale(1); opacity: 0.7; }
      .interfaz-bloqueada button, .interfaz-bloqueada input, .interfaz-bloqueada select { 
        pointer-events: none !important; cursor: not-allowed; 
      }
      .interfaz-bloqueada a { 
        pointer-events: auto !important; cursor: pointer !important;
        color: #2563eb !important; text-decoration: underline;
      }
    </style>
  </head>
  <body class="bg-slate-100 p-4 md:p-6">
    <div class="max-w-7xl mx-auto ${bloqueado ? 'interfaz-bloqueada' : ''}">
      <div class="flex flex-col md:flex-row justify-between items-center mb-8 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 gap-4">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" class="h-16 w-auto object-contain">
        <div class="text-center md:text-right space-y-1">
          <div class="flex flex-wrap items-center justify-center md:justify-end gap-2 mb-1">
            <h1 class="text-xl font-black text-slate-800 uppercase leading-tight">${asp.nombreCompleto}</h1>
            ${asp.estadoProceso === 'En proceso' 
              ? '<span class="bg-purple-100 text-purple-800 font-black text-[10px] px-3 py-1 rounded-full uppercase tracking-wider border border-purple-200">En Proceso (Fase de Firmas)</span>' 
              : (asp.estadoProceso === 'contratado' 
                ? '<span class="bg-emerald-100 text-emerald-800 font-black text-[10px] px-3 py-1 rounded-full uppercase tracking-wider border border-emerald-200">✓ Contratado</span>'
                : (asp.estadoProceso === 'bloqueado'
                  ? '<span class="bg-red-100 text-red-800 font-black text-[10px] px-3 py-1 rounded-full uppercase tracking-wider border border-red-200">Bloqueado</span>'
                  : '<span class="bg-amber-100 text-amber-800 font-black text-[10px] px-3 py-1 rounded-full uppercase tracking-wider border border-amber-200">En Registro</span>'
                ))}
          </div>
          <p class="text-xs text-slate-400 font-mono italic">C.C. ${asp.identificacion}</p>
          ${asp.requisicionInfo ? `<p class="bg-slate-100 text-[10px] py-1 px-3 rounded-full text-slate-600 inline-block font-bold">${asp.requisicionInfo}</p>` : ``}
          ${asp.pdfUrl ? `<p class="text-xs mt-1"><a class="text-blue-600 font-bold underline" href="${asp.pdfUrl}" target="_blank">VER HOJA DE VIDA (PDF)</a></p>` : ``}
          
          <!-- Botón para avanzar o revertir estado En Proceso -->
          ${!bloqueado && asp.estadoProceso !== 'contratado' ? `
            <div class="pt-2 flex justify-center md:justify-end">
              ${asp.estadoProceso === 'Registro' ? `
                <button type="button" onclick="cambiarEstado('En proceso')" 
                  class="${asp.IdRequisicion ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm' : 'bg-slate-200 text-slate-400 cursor-not-allowed'} font-black text-[11px] uppercase tracking-wider py-2 px-4 rounded-xl transition-all inline-flex items-center gap-1.5"
                  title="${asp.IdRequisicion ? 'Habilitar Fase de Firmas' : 'Requiere una Requisición vinculada'}">
                  <span>✍️</span> Habilitar Fase de Firmas (Poner 'En Proceso')
                </button>
              ` : `
                <button type="button" onclick="cambiarEstado('Registro')" 
                  class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[10px] uppercase py-1.5 px-3 rounded-xl transition-all inline-flex items-center gap-1">
                  <span>↩</span> Regresar a estado 'Registro'
                </button>
              `}
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Barra de Vinculación de Requisición -->
      <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 mb-6">
        <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div class="flex-1">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label class="block text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <span>📋</span> Requisición Vinculada
              </label>
              ${asp.IdRequisicion ? `
                <span class="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full uppercase tracking-wider">
                  ✓ Requisición Vinculada
                </span>
              ` : `
                <span class="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full uppercase tracking-wider">
                  ⚠️ Sin Requisición (Requerida para Habilitar Fase de Firmas)
                </span>
              `}
            </div>
            <select id="selectRequisicionAspirante" 
                    class="w-full px-3.5 py-2.5 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:bg-white outline-none transition-all">
              <option value="">-- Seleccionar Requisición para Vincular --</option>
              ${reqsEnProceso.length > 0 ? `
                <optgroup label="Requisiciones Activas (En Proceso)">
                  ${reqsEnProceso.map(renderOpcionReq).join('')}
                </optgroup>
              ` : ''}
              ${reqsOtras.length > 0 ? `
                <optgroup label="Histórico de Requisiciones">
                  ${reqsOtras.map(renderOpcionReq).join('')}
                </optgroup>
              ` : ''}
            </select>
          </div>
          <div class="shrink-0 flex items-center gap-2">
            <button type="button" onclick="vincularRequisicion()" id="btnVincularReq"
                    class="w-full lg:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider px-6 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 h-[42px]">
              <span>🔗</span> Vincular Requisición
            </button>
            ${asp.IdRequisicion ? `
              <button type="button" onclick="desvincularRequisicion()" 
                      class="bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-200 text-xs font-bold px-3.5 rounded-xl transition-all h-[42px]"
                      title="Desvincular requisición de este aspirante">
                ✕
              </button>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Barra de Contacto y Acciones Rápidas del Aspirante -->
      <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 mb-8">
        <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <!-- Edición de Teléfono y Correo -->
          <div class="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-[11px] font-black text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <span>📱</span> Teléfono / WhatsApp
              </label>
              <input type="text" id="inputTelefono" value="${asp.telefono || ''}" placeholder="Ej: 3001234567" 
                     class="w-full px-3.5 py-2.5 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:bg-white outline-none transition-all">
            </div>
            <div>
              <label class="block text-[11px] font-black text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <span>✉️</span> Correo Electrónico
              </label>
              <input type="email" id="inputCorreo" value="${asp.correoElectronico || ''}" placeholder="aspirante@ejemplo.com" 
                     class="w-full px-3.5 py-2.5 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:bg-white outline-none transition-all">
            </div>
          </div>

          <!-- Botón Guardar Contacto -->
          <div class="shrink-0 flex items-center">
            <button type="button" onclick="guardarContacto()" id="btnGuardarContacto"
                    class="w-full lg:w-auto bg-slate-800 hover:bg-slate-900 text-white text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 h-[40px]">
              <span>💾</span> Guardar Contacto
            </button>
          </div>
        </div>

        <!-- Botones de Acción para Copiar Vínculo o Enviar -->
        <div class="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Acciones del Aspirante:</span>
          
          <!-- Botón a: Copiar Vínculo -->
          <button type="button" onclick="copiarVinculoPortal()" id="btnCopiarVinculo"
                  class="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-black px-4 py-2 rounded-xl transition-all inline-flex items-center gap-2 shadow-xs">
            <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
            <span id="txtCopiar">Copiar Vínculo</span>
          </button>

          <!-- Botón b: Enviar WhatsApp -->
          <button type="button" onclick="enviarWhatsAppPortal()" id="btnWhatsApp"
                  class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-4 py-2 rounded-xl transition-all inline-flex items-center gap-2 shadow-xs">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
            <span>Enviar a WhatsApp</span>
          </button>

          <!-- Botón c: Enviar al Correo -->
          <button type="button" onclick="enviarCorreoPortal()" id="btnEnviarCorreo"
                  class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black px-4 py-2 rounded-xl transition-all inline-flex items-center gap-2 shadow-xs">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
            <span id="txtCorreo">Enviar al Correo</span>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="p-4 bg-blue-600 text-white font-bold text-xs tracking-widest uppercase text-center">1. Validar Aspirante</div>
          <div class="p-4 space-y-3">
            ${idsAsp.map(id => {
              const d = mapa[id];
              const nombreDoc = nombresAsp[id];
              return `
              <div class="p-3 border rounded-2xl flex justify-between items-center ${d?.estado === 'Aprobado' ? 'bg-green-50 border-green-200' : 'bg-white border-slate-100'}">
                <div class="flex items-center gap-2">
                  ${d && d.estado !== 'Aprobado' ? `<input type="checkbox" class="doc-check w-4 h-4 rounded text-blue-600" value="${id}">` : ''}
                  <span class="text-[11px] font-bold text-slate-600">${nombreDoc}</span>
                </div>
                <div class="flex gap-2 items-center">
                  ${d ? `<a href="https://storage.googleapis.com/${BUCKET_ASPIRANTES}/${d.path}" target="_blank" class="text-[10px] font-bold text-blue-600 hover:underline">VER</a>` : ''}
                  ${d && d.estado !== 'Aprobado' && !bloqueado ? 
                    `<button type="button" onclick="eliminar(${id}, '${nombreDoc}')" class="text-[10px] text-red-400 italic font-bold">BORRAR</button>` 
                    : (d?.estado === 'Aprobado' ? '<span class="text-[10px] font-black text-green-600 uppercase">✓ APROBADO</span>' : '')
                  }
                </div>
              </div>`;
            }).join('')}
            <button onclick="aprobarMasivo()" class="w-full mt-4 bg-green-600 text-white py-3 rounded-xl text-[10px] font-black uppercase hover:bg-green-700 shadow-md">Aprobar Seleccionados</button>
          </div>
        </div>

        <form action="/seleccion/upload-multiple?usuario=${usuario}" method="POST" enctype="multipart/form-data" 
          class="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden h-fit">
          <input type="hidden" name="id_aspirante" value="${uuid}">
          <input type="hidden" name="origen" value="admin">
          <div class="p-4 bg-orange-500 text-white font-bold text-xs tracking-widest uppercase text-center">2. Documentos Técnicos</div>
          <div class="p-2">${docsTec.map(renderFilaSeleccion).join('')}</div>
          <div class="p-4">
            <button type="submit" class="w-full bg-orange-500 text-white py-3 rounded-2xl font-bold text-xs hover:bg-orange-600 transition-all shadow-md">
              CARGAR SECCIÓN TÉCNICA
            </button>
          </div>
        </form>

        <form action="/seleccion/upload-multiple?usuario=${usuario}" method="POST" enctype="multipart/form-data" 
          class="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <input type="hidden" name="id_aspirante" value="${uuid}">
          <input type="hidden" name="origen" value="admin">
          <div class="p-4 bg-purple-600 text-white font-bold text-xs tracking-widest uppercase flex items-center justify-between">
            <span>3. Documentos para Firmas</span>
            <span class="text-[10px] bg-purple-800 text-purple-100 font-extrabold px-2.5 py-0.5 rounded-full">
              ${totalFirmados} / ${docsFir.length} firmados
            </span>
          </div>
          <div class="p-2 h-[450px] overflow-y-auto">${docsFir.map(renderFilaSeleccion).join('')}</div>
          <div class="p-4 bg-white border-t border-slate-100">
            <button type="submit" class="w-full bg-purple-600 text-white py-3 rounded-2xl font-bold text-xs hover:bg-purple-700 transition-all shadow-md">
              CARGAR SECCIÓN FIRMAS (MANUAL)
            </button>
          </div>
        </form>
      </div>

      <div class="mt-12 text-center pb-20">
        <button onclick="prepararEnvio('${asp.IdRequisicion}')" class="bg-slate-800 text-white px-16 py-6 rounded-3xl font-black text-xl shadow-2xl hover:scale-105 active:scale-95 transition-all">
          FINALIZAR Y ENVIAR A SOCIODEMOGRÁFICA
        </button>
      </div>
    </div>

    <div id="modalContratacion" class="hidden fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
        <h3 class="text-xl font-black text-slate-800 mb-6 italic uppercase tracking-tighter border-b-2 border-slate-100 pb-2">Datos de Vinculación</h3>
        <form id="formFinal" action="/seleccion/finalizar-contratacion?usuario=${usuario}" method="POST">
          <input type="hidden" name="id_aspirante" value="${uuid}">
          <div class="mb-4">
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1 tracking-widest">Regional</label>
            <select id="selectRegional" name="regional" required class="w-full border-2 border-slate-100 rounded-xl p-3 focus:border-blue-500 outline-none bg-slate-50 font-bold text-slate-700">
              <option value="">Seleccione Regional</option>
            </select>
          </div>
          <div class="mb-4">
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1 tracking-widest">Operación</label>
            <select id="selectOperacion" name="operacion" required class="w-full border-2 border-slate-100 rounded-xl p-3 focus:border-blue-500 outline-none bg-slate-50 font-bold text-slate-700">
              <option value="">Seleccione Operación</option>
            </select>
          </div>
          <div class="mb-6">
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1 tracking-widest">Fecha de Ingreso</label>
            <input type="date" name="fecha_ingreso" required class="w-full border-2 border-slate-100 rounded-xl p-3 focus:border-blue-500 outline-none font-bold text-slate-700 bg-slate-50">
          </div>
          <div class="flex space-x-3">
            <button type="button" onclick="document.getElementById('modalContratacion').classList.add('hidden')" class="flex-1 text-slate-400 font-bold hover:text-slate-600">CANCELAR</button>
            <button type="submit" id="btnConfirmar" class="flex-1 bg-blue-600 text-white py-4 rounded-xl font-black uppercase shadow-lg hover:bg-blue-700 transition-all">
              CONFIRMAR
            </button>
          </div>
        </form>
      </div>
    </div>

    <script>
      const regionalSugerida = ${JSON.stringify(asp.regionalSugerida || '')};
      const operacionSugerida = ${JSON.stringify(asp.operacionSugerida || '')};
      const tieneRequisicion = ${!!(asp.IdRequisicion && String(asp.IdRequisicion).trim())};
      async function vincularRequisicion() {
        const idReq = document.getElementById('selectRequisicionAspirante').value;
        const btn = document.getElementById('btnVincularReq');
        const orig = btn.innerHTML;
        btn.innerHTML = '<span>⏳</span> Guardando...';
        btn.disabled = true;

        try {
          const res = await fetch('/seleccion/vincular-requisicion?usuario=${usuario}', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id_aspirante: '${uuid}',
              id_requisicion: idReq
            })
          });
          const data = await res.json();
          if (data.ok) {
            btn.innerHTML = '<span>✓</span> ¡Guardado!';
            window.location.reload();
          } else {
            alert('Error al vincular requisición: ' + (data.error || 'Error desconocido'));
            btn.innerHTML = orig;
            btn.disabled = false;
          }
        } catch (e) {
          alert('Error de conexión al vincular: ' + e.message);
          btn.innerHTML = orig;
          btn.disabled = false;
        }
      }

      async function desvincularRequisicion() {
        if (!confirm('¿Deseas desvincular la requisición de este aspirante?')) return;
        document.getElementById('selectRequisicionAspirante').value = '';
        await vincularRequisicion();
      }

      const portalUrl = window.location.origin + '/seleccion/portal/${uuid}';

      function copiarVinculoPortal() {
        navigator.clipboard.writeText(portalUrl).then(() => {
          const txt = document.getElementById('txtCopiar');
          const original = txt.innerText;
          txt.innerText = '¡Vínculo Copiado! ✓';
          setTimeout(() => { txt.innerText = original; }, 2500);
        }).catch(err => {
          prompt('Copia este enlace para el aspirante:', portalUrl);
        });
      }

      function enviarWhatsAppPortal() {
        let tel = (document.getElementById('inputTelefono').value || '').trim();
        if (!tel) {
          alert('Por favor digita primero el número de teléfono del aspirante.');
          document.getElementById('inputTelefono').focus();
          return;
        }
        tel = tel.replace(/\D/g, '');
        if (tel.length === 10 && tel.startsWith('3')) {
          tel = '57' + tel;
        }
        const nombreAsp = ${JSON.stringify(asp.nombreCompleto || 'Aspirante')};
        const mensaje = 'Hola ' + nombreAsp + ', te saludamos de LOG&SER S.A.S. Para continuar con tu proceso de selección y contratación, por favor ingresa a tu portal personal en el siguiente enlace: ' + portalUrl;
        window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(mensaje), '_blank');
      }

      async function guardarContacto() {
        const tel = (document.getElementById('inputTelefono').value || '').trim();
        const cor = (document.getElementById('inputCorreo').value || '').trim();
        const btn = document.getElementById('btnGuardarContacto');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span>⏳</span> Guardando...';
        btn.disabled = true;

        try {
          const res = await fetch('/seleccion/actualizar-contacto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id_aspirante: '${uuid}',
              telefono: tel,
              correo_electronico: cor
            })
          });
          const data = await res.json();
          if (data.ok) {
            btn.innerHTML = '<span>✓</span> ¡Guardado!';
            setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
          } else {
            alert('Error al guardar contacto: ' + (data.error || 'Error desconocido'));
            btn.innerHTML = originalText;
            btn.disabled = false;
          }
        } catch (e) {
          alert('Error de red al guardar: ' + e.message);
          btn.innerHTML = originalText;
          btn.disabled = false;
        }
      }

      async function enviarCorreoPortal() {
        const cor = (document.getElementById('inputCorreo').value || '').trim();
        if (!cor) {
          alert('Por favor digita primero el correo electrónico del aspirante.');
          document.getElementById('inputCorreo').focus();
          return;
        }

        if (!confirm('¿Deseas enviar el correo con el enlace del portal a: ' + cor + '?')) {
          return;
        }

        const btn = document.getElementById('btnEnviarCorreo');
        const txt = document.getElementById('txtCorreo');
        const origText = txt.innerText;
        txt.innerText = 'Enviando...';
        btn.disabled = true;

        try {
          const res = await fetch('/seleccion/enviar-correo-portal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id_aspirante: '${uuid}',
              correo: cor
            })
          });
          const data = await res.json();
          if (data.ok) {
            alert('✓ ' + data.mensaje);
          } else {
            alert('Error al enviar correo: ' + (data.error || 'Error desconocido'));
          }
        } catch (e) {
          alert('Error de conexión al enviar correo: ' + e.message);
        } finally {
          txt.innerText = origText;
          btn.disabled = false;
        }
      }

      function eliminar(id, nombre) {
        if(confirm('¿Deseas eliminar permanentemente el documento: ' + nombre + '?')) {
          const f = document.createElement('form'); f.method='POST'; f.action='/seleccion/delete-doc-admin?usuario=${usuario}';
          f.innerHTML = '<input type="hidden" name="id_aspirante" value="${uuid}"><input type="hidden" name="id_config_doc" value="'+id+'">';
          document.body.appendChild(f); f.submit();
        }
      }

      function aprobarMasivo() {
        const sel = Array.from(document.querySelectorAll('.doc-check:checked')).map(cb => cb.value);
        if (sel.length === 0) return alert('Por favor, selecciona al menos un documento para aprobar.');
        const f = document.createElement('form'); f.method='POST'; f.action='/seleccion/aprobar-masivo?usuario=${usuario}';
        f.innerHTML = '<input type="hidden" name="id_aspirante" value="${uuid}"><input type="hidden" name="ids_docs" value=\\''+JSON.stringify(sel)+'\\'>';
        document.body.appendChild(f); f.submit();
      }

      function prepararEnvio(idRequisicion) {
        if (!idRequisicion || idRequisicion === 'null' || idRequisicion === '') {
          alert('ERROR: Esta hoja de vida no está vinculada a ninguna requisición activa.');
          return;
        }
        if(confirm('¿Confirmas que deseas enviar los datos a la Sociodemográfica? Esta acción bloqueará ediciones posteriores.')) {
          document.getElementById('modalContratacion').classList.remove('hidden');
        }
      }

      async function cargarOperaciones(regional) {
        const selOp = document.getElementById('selectOperacion');
        selOp.innerHTML = '<option value="">Cargando...</option>';
        if (!regional) return selOp.innerHTML = '<option value="">Seleccione Operación</option>';

        try {
          const data = await fetch('/seleccion/api/operaciones/' + encodeURIComponent(regional)).then(r => r.json());
          selOp.innerHTML = '<option value="">Seleccione Operación</option>';
          data.forEach(op => selOp.add(new Option(op, op)));
          if (operacionSugerida) selOp.value = operacionSugerida;
        } catch(e) { selOp.innerHTML = '<option value="">Error al cargar</option>'; }
      }

      fetch('/seleccion/api/regionales')
        .then(r => r.json())
        .then(async (data) => {
          const selReg = document.getElementById('selectRegional');
          data.forEach(reg => selReg.add(new Option(reg, reg)));
          if (regionalSugerida) {
            selReg.value = regionalSugerida;
            await cargarOperaciones(regionalSugerida);
          }
        });

      function cambiarEstado(nuevoEstado) {
        if (nuevoEstado === 'En proceso' && !tieneRequisicion) {
          alert('⚠️ No es posible habilitar la fase de firmas: el aspirante debe tener una Requisición vinculada.');
          return;
        }
        const msg = nuevoEstado === 'En proceso' 
          ? '¿Deseas activar la fase de firmas? El aspirante podrá ver y firmar digitalmente los ' + ${docsFir.length} + ' documentos en su portal.'
          : '¿Deseas regresar el aspirante al estado Registro?';
        if (confirm(msg)) {
          const f = document.createElement('form'); f.method='POST'; f.action='/seleccion/cambiar-estado-proceso?usuario=${usuario}';
          f.innerHTML = '<input type="hidden" name="id_aspirante" value="${uuid}"><input type="hidden" name="nuevo_estado" value="'+nuevoEstado+'">';
          document.body.appendChild(f); f.submit();
        }
      }

      document.getElementById('formFinal').onsubmit = function() {
        const btn = document.getElementById('btnConfirmar');
        btn.innerText = 'PROCESANDO...';
        btn.disabled = true;
        btn.classList.add('opacity-50');
      };
    </script>
    ${scriptFeedback}
  </body>
  </html>`;
}

module.exports = router;
