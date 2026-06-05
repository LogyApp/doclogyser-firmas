const express = require('express');
const path = require('path');
const pool = require('../services/db');

const router = express.Router();
const INDEX_HTML = path.join(__dirname, '../views/reportes/index.html');

router.get('/', (req, res) => {
  res.sendFile(INDEX_HTML);
});

router.get('/api', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT `OPERACIÓN` AS nombre, Data_Studio AS url FROM Maestro_Operaciones WHERE Data_Studio IS NOT NULL ORDER BY `OPERACIÓN`'
    );
    res.json(rows);
  } catch (err) {
    console.error('[reportes] Error al consultar Maestro_Operaciones:', err.message);
    res.status(500).json({ error: 'Error al obtener reportes' });
  }
});

module.exports = router;
