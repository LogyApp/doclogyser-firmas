const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pool = require('../services/db');
const { subirArchivoCloudDocs } = require('../services/storage');
const { computarAccesoCloudDocs } = require('../services/clouddocsAccess');
const {
  obtenerTipoDocumentoConfig,
  obtenerVinculacionReciente,
  registrarDocTrabajador,
  registrarDocGeneral,
} = require('../services/documentRegistry');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const HTML_FORM_PATH = path.join(__dirname, '../views/formclouddocs/form.html');

// Servir la interfaz del formulario
router.get('/', async (req, res) => {
  try {
    const { usuario, identificacion } = req.query;
    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const acceso = await computarAccesoCloudDocs(pool, usuario);
    if (!acceso) {
      return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');
    }

    const html = fs.readFileSync(HTML_FORM_PATH, 'utf8');
    const config = JSON.stringify({
      ...acceso,
      regionalesFiltro: Object.keys(acceso.opsPorRegional),
      prefillIdentificacion: identificacion ? String(identificacion).trim() : ''
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[formcloud-docs] Error serving page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// API: Autocomplete de trabajadores
router.get('/api/buscar-trabajadores', async (req, res) => {
  try {
    const { q, usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoCloudDocs(pool, usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!q || q.trim().length < 2) {
      return res.json([]);
    }

    const searchTerm = `%${q}%`;
    const sql = `
      SELECT 
        s.Identificación AS identificacion,
        s.Trabajador AS trabajador,
        mv.Cargo AS cargo,
        mv.Regional,
        mv.Operación AS operacion,
        mv.Estado,
        DATE_FORMAT(mv.max_fecha_ingreso, '%Y-%m-%d') AS fechaIngreso
      FROM Maestro_Segmentación s
      JOIN (
        SELECT v1.Identificación, v1.Cargo, v1.Regional, v1.Operación, v1.Estado, v1.\`Fecha de Ingreso\` AS max_fecha_ingreso
        FROM Maestro_Vinculación v1
        INNER JOIN (
          SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS max_fecha
          FROM Maestro_Vinculación
          GROUP BY Identificación
        ) v2 ON v1.Identificación = v2.Identificación AND v1.\`Fecha de Ingreso\` = v2.max_fecha
      ) mv ON s.Identificación = mv.Identificación
      WHERE (s.Trabajador COLLATE utf8mb4_general_ci LIKE ? OR CAST(s.Identificación AS CHAR) LIKE ?)
      LIMIT 15
    `;

    const [rows] = await pool.execute(sql, [searchTerm, searchTerm]);
    res.json(rows);
  } catch (err) {
    console.error('[formcloud-docs] buscar-trabajadores error:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Obtener tipos de documentos por tipo_doc
router.get('/api/tipos-documentos', async (req, res) => {
  try {
    const { tipo_doc, usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoCloudDocs(pool, usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!tipo_doc) return res.status(400).json({ error: 'tipo_doc requerido' });

    const [rows] = await pool.execute(
      'SELECT Id, Documento, Prefijo, Clasificacion FROM Config_Doc_Trabajador WHERE tipo_doc = ? ORDER BY Clasificacion, Documento ASC',
      [tipo_doc]
    );

    res.json(rows);
  } catch (err) {
    console.error('[formcloud-docs] tipos-documentos error:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Subir documento y guardar registro
router.post('/api/subir', upload.single('documento'), async (req, res) => {
  try {
    const { tipo_doc, tipo_documento_id, observaciones, usuario, identificacion, regional, operacion } = req.body;

    if (!tipo_doc || !tipo_documento_id || !usuario || !req.file) {
      return res.status(400).json({ error: 'Parámetros o archivo faltantes' });
    }

    const acceso = await computarAccesoCloudDocs(pool, usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const docConfig = await obtenerTipoDocumentoConfig(pool, tipo_documento_id);
    if (!docConfig) {
      return res.status(400).json({ error: 'Tipo de documento no válido' });
    }
    const { Prefijo } = docConfig;

    if (tipo_doc === 'Trabajador') {
      if (!identificacion) {
        return res.status(400).json({ error: 'Identificación de trabajador requerida' });
      }

      const vinculacion = await obtenerVinculacionReciente(pool, identificacion);
      if (!vinculacion) {
        return res.status(400).json({ error: 'El trabajador no tiene vinculaciones registradas' });
      }

      // Subir a GCS
      const fileUrl = await subirArchivoCloudDocs(
        identificacion,
        Prefijo,
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      await registrarDocTrabajador(pool, {
        identificacion,
        tipoDocumentoId: tipo_documento_id,
        prefijo: Prefijo,
        regional: vinculacion.Regional,
        operacion: vinculacion['Operación'] || vinculacion.Operación,
        estado: vinculacion.Estado,
        fechaIngreso: vinculacion.FechaIngreso,
        usuario: acceso.usuarioNombre,
        observaciones,
        url: fileUrl,
      });

    } else {
      // General / Empresa
      if (!regional || !operacion) {
        return res.status(400).json({ error: 'Regional y Operación requeridas para documentos generales' });
      }

      // Subir a GCS (general prefix)
      const fileUrl = await subirArchivoCloudDocs(
        null,
        Prefijo,
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      await registrarDocGeneral(pool, {
        tipoDocumentoId: tipo_documento_id,
        prefijo: Prefijo,
        regional,
        operacion,
        usuario: acceso.usuarioNombre,
        observaciones,
        url: fileUrl,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[formcloud-docs] error al subir documento:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
