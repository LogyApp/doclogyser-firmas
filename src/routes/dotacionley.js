const express = require('express');
const path = require('path');
const pool = require('../services/db');

const router = express.Router();
const HTML_PATH = path.join(__dirname, '../views/dotacionley/index.html');

// ═════ Servir la Vista HTML ═════
router.get('/', (req, res) => {
  res.sendFile(HTML_PATH);
});

// ═════ API: Obtener Resumen (Regionales y Operaciones con conteo) ═════
router.get('/api/resumen', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT Regional, Operacion, COUNT(*) AS total
       FROM vista_dotacion_ley
       GROUP BY Regional, Operacion
       ORDER BY Regional, Operacion`
    );
    res.json(rows);
  } catch (err) {
    console.error('[dotacionley] GET /api/resumen:', err);
    res.status(500).json({ error: 'Error al consultar resumen de dotación' });
  }
});

// ═════ API: Obtener Trabajadores (Paginado y Filtrado) ═════
router.get('/api/trabajadores', async (req, res) => {
  try {
    const { regional, operacion, q, page = 1, limit = 50 } = req.query;

    let where = 'WHERE 1=1';
    const params = [];

    if (regional) {
      where += ' AND Regional = ?';
      params.push(regional);
    }
    if (operacion) {
      where += ' AND Operacion = ?';
      params.push(operacion);
    }
    if (q) {
      where += ' AND (Trabajador LIKE ? OR Identificacion LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }

    // 1. Obtener total de registros con el filtro actual
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM vista_dotacion_ley ${where}`,
      params
    );

    // 2. Obtener los registros paginados
    const safeLimit = parseInt(limit) || 50;
    const safeOffset = (parseInt(page) - 1) * safeLimit;

    const [rows] = await pool.execute(
      `SELECT * FROM vista_dotacion_ley ${where} 
       ORDER BY Trabajador ASC 
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params
    );

    res.json({
      total: parseInt(total),
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
      rows
    });
  } catch (err) {
    console.error('[dotacionley] GET /api/trabajadores:', err);
    res.status(500).json({ error: 'Error al consultar lista de trabajadores' });
  }
});

module.exports = router;
