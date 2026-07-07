const express = require('express');
const path = require('path');
const multer = require('multer');
const { Storage } = require('@google-cloud/storage');
const pool = require('../services/db');

const router = express.Router();

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

// ══════════════════════════════════════════════════════════════
// Vistas (páginas HTML)
// ══════════════════════════════════════════════════════════════

// Portal del Aspirante
router.get('/portal/:uuid', async (req, res) => {
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
      pool.execute('SELECT primer_nombre, pdf_public_url FROM Dynamic_hv_aspirante WHERE id_aspirante = ?', [uuid]),
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

    res.send(generarHtmlPortal(uuid, nombre, docsAspirante, mapaDocs, pdfUrl, usuario));
  } catch (error) {
    console.error("Error en Portal Aspirante:", error);
    res.status(500).send("Error interno al cargar el portal");
  }
});

// Panel Administrativo del Aspirante
router.get('/admin/:uuid', async (req, res) => {
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
        a.primer_nombre?.toUpperCase(), a.segundo_nombre?.toUpperCase(), a.primer_apellido?.toUpperCase(), a.segundo_apellido?.toUpperCase(), null,
        a.rh, 'Colombia', a.departamento_expedicion, a.ciudad_expedicion, a.fecha_expedicion,
        null, null, null, a.fecha_nacimiento,
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

function generarHtmlPortal(uuid, nombre, docs, mapaDocs, pdfUrl, usuario) {
  const scriptFeedback = `
    <script>
      const params = new URLSearchParams(window.location.search);
      if (params.get('msg') === 'upload_success') alert('¡Documentos cargados con éxito!');
      if (params.get('msg') === 'deleted') alert('Documento eliminado correctamente.');
      if (params.get('msg') === 'no_files') alert('Por favor, selecciona al menos un archivo.');
    </script>
  `;

  return `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Portal Aspirante | Logyser</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
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

      <div class="bg-white shadow-2xl rounded-3xl overflow-hidden border border-slate-100">
        <form action="/seleccion/upload-multiple?usuario=${usuario}" method="POST" enctype="multipart/form-data" id="mainForm">
          <input type="hidden" name="id_aspirante" value="${uuid}">
          <input type="hidden" name="origen" value="portal">
          
          <div class="p-8 md:p-12">
            <h2 class="text-3xl font-bold text-slate-800 mb-2 italic">¡Hola, ${nombre}!</h2>
            <p class="text-slate-500 mb-10 text-sm font-medium">
              Bienvenido al proceso de selección. Gestiona los documentos requeridos a continuación. 
              <span class="text-red-500 block mt-1">Los documentos aprobados no podrán ser modificados.</span>
            </p>
            
            <div class="space-y-3">
              ${docs.map(doc => {
                const data = mapaDocs[doc.id];
                const estaAprobado = data && data.estado === 'Aprobado';
                const estaCargado = data && !estaAprobado;
                
                return `
                <div class="flex flex-col md:flex-row md:items-center justify-between p-4 border ${estaAprobado ? 'border-green-200 bg-green-50' : 'border-slate-100 bg-white'} rounded-2xl shadow-sm">
                  <div class="flex items-center space-x-3 flex-1">
                    <div class="${estaAprobado ? 'text-green-500' : (estaCargado ? 'text-blue-500' : 'text-slate-300')}">
                      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>
                    </div>
                    <span class="text-sm font-semibold text-slate-700">${doc.nombre}</span>
                  </div>
                  <div class="flex items-center gap-2 mt-2 md:mt-0">
                    ${estaAprobado ? 
                      '<span class="text-[10px] font-black text-green-600 border border-green-200 px-3 py-1 rounded-lg bg-white uppercase">Aprobado</span>' : 
                      (estaCargado ? 
                        `<a href="https://storage.googleapis.com/${BUCKET_ASPIRANTES}/${data.path}" target="_blank" class="text-xs font-bold text-blue-600 px-3 hover:underline">Ver</a>
                         <button type="button" onclick="confirmarEliminar('${doc.id}', '${doc.nombre}')" class="text-xs font-bold text-red-400 hover:text-red-600 italic">Eliminar</button>` : 
                        `<input type="file" name="file_${doc.id}" accept=".pdf" class="block w-full text-[11px] text-slate-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700 font-bold hover:file:bg-blue-100 uppercase">`
                      )
                    }
                  </div>
                </div>`;
              }).join('')}
            </div>
            <div class="mt-12">
              <button type="submit" id="btnSubmit" class="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-slate-900 transition-all uppercase tracking-wider">
                Cargar Documentos Seleccionados
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <form id="deleteForm" action="/seleccion/delete-doc?usuario=${usuario}" method="POST" style="display:none;">
      <input type="hidden" name="id_aspirante" value="${uuid}">
      <input type="hidden" name="id_config_doc" id="delete_id_config_doc">
    </form>

    <script>
      function confirmarEliminar(id, nombre) {
        if(confirm('¿Estás seguro de eliminar el documento: ' + nombre + '?')) {
          document.getElementById('delete_id_config_doc').value = id;
          document.getElementById('deleteForm').submit();
        }
      }

      document.getElementById('mainForm').onsubmit = function() {
        const inputs = document.querySelectorAll('input[type="file"]');
        let alguno = false;
        inputs.forEach(i => { if(i.files.length > 0) alguno = true; });

        if(!alguno) { 
          alert('Por favor, selecciona al menos un archivo para cargar.'); 
          return false; 
        }

        const btn = document.getElementById('btnSubmit');
        btn.innerText = 'ENVIANDO ARCHIVOS... POR FAVOR ESPERA';
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        return true;
      };
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
