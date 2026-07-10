const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Storage } = require('@google-cloud/storage');
const { GoogleAuth } = require('google-auth-library');
const pool = require('../services/db');
const { notificarBloqueoAspirante } = require('../services/email');

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
async function extractFieldsFromBuffer(fileBuffer, mimeType) {
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
    `SELECT a.identificacion, c.Prefijo 
     FROM Dynamic_hv_aspirante a 
     JOIN Config_Doc_Trabajador c ON c.Id = ? 
     WHERE a.id_aspirante = ?`,
    [id_config_doc, id_aspirante]
  );

  if (datos.length === 0) throw new Error('Datos no encontrados para el aspirante o documento');

  const { identificacion, Prefijo } = datos[0];
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
      pool.execute('SELECT primer_nombre, pdf_public_url, estado_proceso FROM Dynamic_hv_aspirante WHERE id_aspirante = ?', [uuid]),
      pool.execute('SELECT id_config_doc, estado, gcs_path FROM Dynamic_hv_documentos WHERE id_aspirante = ?', [uuid])
    ]);

    if (aspiranteRows.length === 0) {
      return res.status(404).send("Aspirante no encontrado");
    }

    const asp = aspiranteRows[0];
    const nombre = asp.primer_nombre || 'Aspirante';
    const pdfUrl = (asp.pdf_public_url || '').trim();

    const mapaDocs = {};
    cargados.forEach(c => {
      mapaDocs[c.id_config_doc] = { estado: c.estado, path: c.gcs_path };
    });

    res.send(generarHtmlPortal(uuid, nombre, docsAspirante, mapaDocs, pdfUrl, usuario, asp.estado_proceso));
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
  const docsFirmar = [
    { id: 2, nombre: "Acta condiciones" }, 
    { id: 7, nombre: "Análisis riesgo" }, 
    { id: 16, nombre: "Consentimiento H. Clínica" }, 
    { id: 19, nombre: "Consentimiento Prueba" }, 
    { id: 20, nombre: "Condiciones salud" }, 
    { id: 29, nombre: "Evaluación Inducción" }, 
    { id: 32, nombre: "Comprobante Inducción" }, 
    { id: 39, nombre: "Manual funciones" }, 
    { id: 48, fontName: "Normas seguridad" }, 
    { id: 49, nombre: "Tratamiento datos" }, 
    { id: 33, nombre: "Formatos Italcol" }
  ];

  // Fix: set name value for key 48 manually if misaligned
  docsFirmar.forEach(d => { if(d.id === 48) d.nombre = d.nombre || d.fontName; });

  try {
    const [[aspiranteRows], [cargados]] = await Promise.all([
      pool.execute(
        `SELECT primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, 
                identificacion, estado_proceso, IdRequisicion, pdf_public_url 
         FROM Dynamic_hv_aspirante WHERE id_aspirante = ?`, 
        [uuid]
      ),
      pool.execute('SELECT id_config_doc, estado, gcs_path FROM Dynamic_hv_documentos WHERE id_aspirante = ?', [uuid])
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
        'SELECT `Requisición`, `Operación`, \`Cargo Requerido\`, `Fecha Requisición`, `Regional` FROM Dynamic_Requisiciones WHERE IdRequisicion = ? LIMIT 1',
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

    const mapaDocs = {};
    cargados.forEach(c => { mapaDocs[c.id_config_doc] = { estado: c.estado, path: c.gcs_path }; });

    res.send(generarHtmlAdmin(
      uuid,
      { nombreCompleto, identificacion: a.identificacion, IdRequisicion: a.IdRequisicion, pdfUrl, requisicionInfo, regionalSugerida, operacionSugerida },
      docsAspiranteIds, nombresAsp, docsTecnicos, docsFirmar, mapaDocs, 
      a.estado_proceso === 'contratado',
      usuario
    ));
  } catch (error) {
    console.error("Error en Admin Panel:", error);
    res.status(500).send("Error interno al cargar el panel administrativo");
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

    // Llamar a Document AI
    let docAiResult;
    try {
      docAiResult = await extractFieldsFromBuffer(file.buffer, mimeType);
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
        ? 'El aspirante ya se encuentra en la Sociodemográfica, se reorganizarán los datos' 
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

function generarHtmlPortal(uuid, nombre, docs, mapaDocs, pdfUrl, usuario, estadoProceso) {
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
    </script>
  `;

  // Check if all documents are uploaded
  const allUploaded = docs.every(doc => mapaDocs[doc.id]);

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
      <div class="flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" class="h-24 w-auto object-contain">
        <div class="flex flex-col items-end gap-2">
          <a href="https://curriculum-compact-594761951101.europe-west1.run.app" target="_blank" class="text-blue-600 font-semibold text-sm hover:underline">
            📝 Revisar o Editar mi Hoja de Vida
          </a>
          ${pdfUrl ? `
          <a href="${pdfUrl}" target="_blank" class="text-slate-600 font-semibold text-sm hover:underline">
            📄 Ver PDF de mi Hoja de Vida
          </a>
          ` : ``}
        </div>
      </div>

      <div class="bg-white shadow-2xl rounded-3xl overflow-hidden border border-slate-100 p-8 md:p-12 mb-8">
        <h2 class="text-3xl font-black text-slate-800 mb-2 italic">¡Hola, ${nombre}!</h2>
        <p class="text-slate-500 mb-10 text-sm font-medium">
          Bienvenido al proceso de selección. Sube y gestiona los documentos requeridos a continuación. 
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
          ${docs.map(doc => {
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
          }).join('')}
        </div>
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
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Lugar de Nacimiento</label>
              <div id="lugar-nacimiento-container">
                <!-- Se inyecta dinámicamente -->
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
        })
        .catch(err => console.error('Error cargando ciudades:', err));

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
        
        showSpinner('Preparando y optimizando imagen...');

        compressImageIfNeeded(file).then(optimizedFile => {
          const formData = new FormData();
          formData.append('file', optimizedFile);
          formData.append('id_aspirante', currentFileState.id_aspirante);
          formData.append('id_config_doc', idConfigDoc);

          showSpinner('Analizando documento con Inteligencia Artificial...');

          fetch('/seleccion/api/classify-doc', {
            method: 'POST',
            body: formData
          })
        .then(res => res.json())
        .then(data => {
          hideSpinner();
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
            const paisNac = reg.pais_nacimiento || 'Colombia';
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
          hideSpinner();
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
          departamento_nacimiento: deptoNac
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
    </script>
    ${scriptFeedback}
  </body>
  </html>`;
}

function generarHtmlAdmin(uuid, asp, idsAsp, nombresAsp, docsTec, docsFir, mapa, bloqueado, usuario) {
  const renderFilaSeleccion = (doc) => {
    const data = mapa[doc.id];
    return `
    <div class="p-3 border-b border-slate-100 last:border-0">
      <div class="flex justify-between items-center mb-2">
        <span class="text-[11px] font-bold text-slate-700 uppercase">${doc.nombre}</span>
        ${data ? `
          <div class="flex gap-2">
            <a href="https://storage.googleapis.com/${BUCKET_ASPIRANTES}/${data.path}" target="_blank" class="text-[10px] text-blue-600 font-bold hover:underline">VER</a>
            ${!bloqueado ? `<button type="button" onclick="eliminar(${doc.id}, '${doc.nombre}')" class="text-[10px] text-red-400 font-bold italic">ELIMINAR</button>` : ''}
          </div>
        ` : '<span class="text-[10px] text-slate-300 italic">Pendiente</span>'}
      </div>
      ${!data && !bloqueado ? `
        <div class="relative border-2 border-dashed border-slate-200 rounded-lg p-2 hover:border-blue-400 transition-colors bg-slate-50">
          <input type="file" name="file_${doc.id}" accept=".pdf" 
                 onchange="this.parentElement.querySelector('.file-name').innerText = this.files[0].name; this.parentElement.classList.add('bg-blue-50', 'border-blue-400')"
                 class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
          <p class="text-[9px] text-center text-slate-400 file-name">Arrastra o haz clic para subir PDF</p>
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
      if (params.get('msg') === 'aprobado') alert('Documento aprobado con éxito');
      if (params.get('msg') === 'deleted') alert('Documento eliminado del sistema');
    </script>
  `;

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
        <div class="text-center md:text-right">
          <h1 class="text-xl font-black text-slate-800 uppercase leading-tight">${asp.nombreCompleto}</h1>
          <p class="text-xs text-slate-400 font-mono italic mb-2">C.C. ${asp.identificacion}</p>
          ${asp.requisicionInfo ? `<p class="bg-slate-100 text-[10px] py-1 px-3 rounded-full text-slate-600 inline-block font-bold">${asp.requisicionInfo}</p>` : ``}
          ${asp.pdfUrl ? `<p class="text-xs mt-2"><a class="text-blue-600 font-bold underline" href="${asp.pdfUrl}" target="_blank">VER HOJA DE VIDA (PDF)</a></p>` : ``}
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
          <div class="p-4 bg-purple-600 text-white font-bold text-xs tracking-widest uppercase text-center">3. Documentos para Firmas</div>
          <div class="p-2 h-[450px] overflow-y-auto">${docsFir.map(renderFilaSeleccion).join('')}</div>
          <div class="p-4 bg-white border-t border-slate-100">
            <button type="submit" class="w-full bg-purple-600 text-white py-3 rounded-2xl font-bold text-xs hover:bg-purple-700 transition-all shadow-md">
              CARGAR SECCIÓN FIRMAS
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

      document.getElementById('selectRegional').onchange = (e) => cargarOperaciones(e.target.value);

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
