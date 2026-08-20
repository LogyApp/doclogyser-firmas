const express = require('express');
const router = express.Router();
const path = require('path');
const crypto = require('crypto');
const pool = require('../services/db');
const { computarAccesoCloudDocs } = require('../services/clouddocsAccess');

const HTML_FORM_PATH = path.join(__dirname, '../views/formvalidarcap/form.html');

// Serve the main form
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).send('usuario requerido');

    const acceso = await computarAccesoCloudDocs(pool, usuario);
    if (!acceso) return res.status(403).send('No autorizado');

    if (acceso.rol !== 'Archivo' && acceso.rol !== 'Sistema' && acceso.rol !== 'Asistencial') {
      return res.status(403).send('Rol no autorizado para validar carpetas');
    }

    res.sendFile(HTML_FORM_PATH);
  } catch (err) {
    console.error('[formvalidarcap] Error serving page:', err);
    res.status(500).send('Error interno del servidor');
  }
});

// API: Search workers for autocomplete
router.get('/api/buscar-trabajadores', async (req, res) => {
  try {
    const { q, usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoCloudDocs(pool, usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (acceso.rol !== 'Archivo' && acceso.rol !== 'Sistema' && acceso.rol !== 'Asistencial') {
      return res.status(403).json({ error: 'Rol no autorizado' });
    }

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
    console.error('[formvalidarcap] buscar-trabajadores error:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Create validation and replicate trigger logic
router.post('/api/validar', async (req, res) => {
  let conn;
  try {
    const { identificacion, estado, usuario } = req.body;
    if (!identificacion || !estado || !usuario) {
      return res.status(400).json({ error: 'Parámetros incompletos' });
    }

    const acceso = await computarAccesoCloudDocs(pool, usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (acceso.rol !== 'Archivo' && acceso.rol !== 'Sistema' && acceso.rol !== 'Asistencial') {
      return res.status(403).json({ error: 'Rol no autorizado' });
    }

    if (estado !== 'OK' && estado !== 'PEND') {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    // Generate parameters
    const idCargue = crypto.randomBytes(4).toString('hex');
    const validadorName = `${acceso.usuarioNombre} - ${acceso.usuarioId}`;
    
    // Get Colombia current datetime (GMT-5)
    const now = new Date();
    const offset = -5; // Colombia timezone offset in hours
    const colTime = new Date(now.getTime() + (offset * 3600000) + (now.getTimezoneOffset() * 60000));
    
    // Format to MySQL datetime string 'YYYY-MM-DD HH:MM:SS'
    const formattedDate = colTime.toISOString().slice(0, 19).replace('T', ' ');

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 1. Insert into Maestro_ok_carpeta
    await conn.execute(
      `INSERT INTO Maestro_ok_carpeta (IdCargue, Estado, Identificación, Usuario, Fecha)
       VALUES (?, ?, ?, ?, ?)`,
      [idCargue, estado, identificacion, validadorName, formattedDate]
    );

    // 2. Replicate tr_actualizar_validacion_trabajador trigger logic
    // Update Maestro_docTrabajador
    const [result] = await conn.execute(
      `UPDATE Maestro_docTrabajador
       SET 
           Validación = ?,
           Usuario = ?,
           FechaRegistro = ?
       WHERE Identificación = ?`,
      [estado, validadorName, formattedDate, identificacion]
    );

    await conn.commit();
    res.json({ ok: true, idCargue, affectedRows: result.affectedRows });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('[formvalidarcap] POST /api/validar error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
