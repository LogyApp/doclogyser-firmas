const express = require('express');
const path = require('path');
const pool = require('../services/db');
const { computarAccesoInventario } = require('../services/accesoInventario');
const { notificarDotacionLey } = require('../services/email');

const router = express.Router();
const HTML_PATH = path.join(__dirname, '../views/dotacionley/index.html');

// ═════ Servir la Vista HTML ═════
router.get('/', (req, res) => {
  res.sendFile(HTML_PATH);
});

// ═════ API: Obtener Resumen (Regionales y Operaciones con conteo) ═════
// Filtrado según el acceso de la Sección 'DotacionLey' del Rol del usuario.
router.get('/api/resumen', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoInventario(usuario, 'DotacionLey');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    if (!acceso.sinFiltro && !acceso.operacionesFiltro.length) {
      return res.json([]);
    }

    let where = '';
    const params = [];
    if (!acceso.sinFiltro) {
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      where = `WHERE Operacion IN (${ph})`;
      params.push(...acceso.operacionesFiltro);
    }

    const [rows] = await pool.execute(
      `SELECT Regional, Operacion, COUNT(*) AS total
       FROM vista_dotacion_ley
       ${where}
       GROUP BY Regional, Operacion
       ORDER BY Regional, Operacion`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('[dotacionley] GET /api/resumen:', err);
    res.status(500).json({ error: 'Error al consultar resumen de dotación' });
  }
});

// ═════ API: Obtener Trabajadores (Paginado y Filtrado) ═════
// Filtrado según el acceso de la Sección 'DotacionLey' del Rol del usuario.
router.get('/api/trabajadores', async (req, res) => {
  try {
    const { usuario, regional, operacion, q, page = 1, limit = 50 } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoInventario(usuario, 'DotacionLey');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    if (!acceso.sinFiltro && !acceso.operacionesFiltro.length) {
      return res.json({ total: 0, page: parseInt(page), limit: parseInt(limit), pages: 1, rows: [] });
    }

    let where = 'WHERE 1=1';
    const params = [];

    if (!acceso.sinFiltro) {
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      where += ` AND Operacion IN (${ph})`;
      params.push(...acceso.operacionesFiltro);
    }

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

function construirTallas(row) {
  return {
    pantalon: row.Pantalon || '',
    botas: row.Botas || '',
    camiseta: row.Camiseta || '',
    numero: row.Cargo === 'AUXILIAR LOGISTICO' ? (row.Numero || '') : '',
  };
}

function nombreCorto(trabajador) {
  const partes = String(trabajador || '').split(' ** ');
  return partes.length > 1 ? partes[1].trim() : (trabajador || '');
}

// ═════ API: Enviar correo individual (columna Acciones) ═════
router.post('/api/enviar-correo', async (req, res) => {
  try {
    const { usuario, identificacion } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!identificacion) return res.status(400).json({ error: 'identificacion requerida' });

    const acceso = await computarAccesoInventario(usuario, 'DotacionLey');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const [[row]] = await pool.execute(
      'SELECT * FROM vista_dotacion_ley WHERE Identificacion = ? LIMIT 1',
      [identificacion]
    );
    if (!row) return res.status(404).json({ error: 'Colaborador no encontrado en el ámbito de dotación de ley' });

    if (!acceso.sinFiltro && !acceso.operacionesFiltro.includes(row.Operacion)) {
      return res.status(403).json({ error: 'No tienes acceso a este colaborador' });
    }

    if (!row.Email) {
      return res.status(400).json({ error: 'El colaborador no tiene correo electrónico registrado' });
    }

    await notificarDotacionLey({
      email: row.Email,
      nombreTrabajador: nombreCorto(row.Trabajador),
      tallas: construirTallas(row),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[dotacionley] POST /api/enviar-correo:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: Enviar correo masivo por Regional + Operación ═════
router.post('/api/enviar-correo-masivo', async (req, res) => {
  try {
    const { usuario, regional, operacion } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!regional || !operacion) return res.status(400).json({ error: 'regional y operacion requeridos' });

    const acceso = await computarAccesoInventario(usuario, 'DotacionLey');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    if (!acceso.sinFiltro) {
      const opsPermitidas = acceso.opsPorRegional[regional] || [];
      if (!opsPermitidas.includes(operacion)) {
        return res.status(403).json({ error: 'No tienes acceso a esta Regional/Operación' });
      }
    }

    const [rows] = await pool.execute(
      'SELECT * FROM vista_dotacion_ley WHERE Regional = ? AND Operacion = ?',
      [regional, operacion]
    );

    if (!rows.length) {
      return res.json({ ok: true, enviados: 0, sinCorreo: 0, total: 0 });
    }

    let enviados = 0;
    let sinCorreo = 0;
    for (const row of rows) {
      if (!row.Email) { sinCorreo++; continue; }
      try {
        await notificarDotacionLey({
          email: row.Email,
          nombreTrabajador: nombreCorto(row.Trabajador),
          tallas: construirTallas(row),
        });
        enviados++;
      } catch (e) {
        console.error('[dotacionley] Error enviando correo masivo a', row.Identificacion, ':', e.message);
      }
    }

    res.json({ ok: true, enviados, sinCorreo, total: rows.length });
  } catch (err) {
    console.error('[dotacionley] POST /api/enviar-correo-masivo:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
