const express = require('express');
const pool = require('../services/db');
const { obtenerPlantilla } = require('../services/plantilla');
const { generarToken } = require('../services/token');

const router = express.Router();

router.get('/token/:proceso/:id', async (req, res) => {
  try {
    const { proceso, id } = req.params;
    const plantilla = await obtenerPlantilla(proceso);
    await pool.execute(
      `UPDATE \`${plantilla.tabla_datos}\` SET estado_doc = 'validado' WHERE \`${plantilla.id_campo_fk}\` = ?`,
      [id]
    );
    const token = await generarToken(plantilla.tabla_datos, plantilla.id_campo_fk, id);
    const base = `${req.protocol}://${req.get('host')}`;
    const url = `${base}/doclogyser/${proceso}/${id}?token=${encodeURIComponent(token)}`;
    res.json({ token, url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
