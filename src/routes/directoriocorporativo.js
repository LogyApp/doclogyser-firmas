const express = require('express');
const path = require('path');
const {
  listarColaboradoresDirectorio,
  buscarEmpleadoParaFirma,
  sincronizarConVinculacion
} = require('../services/firmaSyncService');

const router = express.Router();
const HTML_VIEW_PATH = path.join(__dirname, '../views/directoriocorporativo/index.html');

// 1. Vista principal del Directorio Corporativo
router.get('/', (req, res) => {
  res.sendFile(HTML_VIEW_PATH);
});

// 2. API: Obtener colaboradores y estadísticas para el directorio
router.get('/api/colaboradores', async (req, res) => {
  try {
    const lista = await listarColaboradoresDirectorio();

    // Calcular estadísticas de conteo
    const porArea = {};
    const porRegional = {};

    lista.forEach(c => {
      const a = (c.area || 'auxiliares_administrativos').toLowerCase();
      porArea[a] = (porArea[a] || 0) + 1;

      const r = (c.regional || 'GENERAL').toUpperCase();
      porRegional[r] = (porRegional[r] || 0) + 1;
    });

    res.json({
      ok: true,
      total: lista.length,
      estadisticas: {
        porArea,
        porRegional
      },
      colaboradores: lista
    });
  } catch (err) {
    console.error('[directoriocorporativo] Error al listar colaboradores:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 3. API: Detalle individual de colaborador
router.get('/api/colaborador/:id', async (req, res) => {
  try {
    const resultado = await buscarEmpleadoParaFirma(req.params.id);
    if (!resultado || !resultado.data) {
      return res.status(404).json({ ok: false, error: 'Colaborador no encontrado' });
    }
    res.json({ ok: true, colaborador: resultado.data });
  } catch (err) {
    console.error('[directoriocorporativo] Error al consultar colaborador:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 4. API: Sincronizar bajo demanda con Maestro_Vinculación
router.post('/api/sincronizar', async (req, res) => {
  try {
    const resultado = await sincronizarConVinculacion();
    res.json(resultado);
  } catch (err) {
    console.error('[directoriocorporativo] Error en sincronización:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
