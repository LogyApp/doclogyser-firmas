const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../services/db');
const { computarAccesoFacturacion } = require('../services/accesoFacturacion');

const router = express.Router();
const FACTURACION_HTML = path.join(__dirname, '../views/facturacion/index.html');

function paginaError(mensaje) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Error</title><style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f2f5;}div{background:#fff;padding:2rem;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);max-width:400px;text-align:center;}h2{color:#e53e3e;margin-top:0;}</style></head><body><div><h2>Error</h2><p>${mensaje}</p></div></body></html>`;
}

function resumenAcceso(acceso) {
  if (!acceso) return null;
  return {
    sinFiltro:        acceso.sinFiltro,
    regionalesFiltro: Object.keys(acceso.opsPorRegional).sort(),
    opsPorRegional:   acceso.opsPorRegional,
  };
}

// ── GET / (Cargar Interfaz de Facturación) ───────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).send(paginaError('Parámetro ?usuario requerido'));

    const accesoBloqueo = await computarAccesoFacturacion(usuario, 'Bloqueo_datos');
    const accesoClientes = await computarAccesoFacturacion(usuario, 'Clientes_credito');

    if (!accesoBloqueo && !accesoClientes) {
      return res.status(403).send(paginaError('Usuario no autorizado para el módulo de Facturación'));
    }

    const base = accesoBloqueo || accesoClientes;
    const template = fs.readFileSync(FACTURACION_HTML, 'utf8');

    const config = JSON.stringify({
      usuario,
      usuarioNombre: base.usuarioNombre,
      rol: base.rol,
      regional: base.regional,
      operacion: base.operacion,
      regionalesFiltro: Object.keys(base.opsPorRegional).sort(),
      opsPorRegional: base.opsPorRegional,
      tabs: {
        bloqueo: resumenAcceso(accesoBloqueo),
        clientes_credito: resumenAcceso(accesoClientes),
      }
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(template.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[facturacion GET /]', err);
    res.status(500).send(paginaError('Error interno del servidor'));
  }
});

// ── GET /api/bloqueos ─────────────────────────────────────────────────────
// En Facturación solo se muestran los registros donde Datos = 'Servicios'
router.get('/api/bloqueos', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Bloqueo_datos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [rows] = await pool.execute(`
      SELECT b.ID AS id, b.Operación AS operacion, b.Quincena AS quincena, b.Hasta AS hasta,
             b.Año AS anio, b.Datos AS datos, b.Forma_Pago AS formaPago, b.Condición AS condicion,
             b.Usuario AS usuario, b.Fecha_Registro AS fechaRegistro, b.Modulo AS modulo,
             COALESCE(b.Regional, o.REGIONAL) AS regional
      FROM Bloqueo_Nomina b
      LEFT JOIN Maestro_Operaciones o ON b.Operación = o.OPERACIÓN
      WHERE b.Datos = 'Servicios'
      ORDER BY b.Fecha_Registro DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/bloqueos:', err);
    res.status(500).json([]);
  }
});

// ── GET /api/clientes-credito ─────────────────────────────────────────────
router.get('/api/clientes-credito', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Clientes_credito');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [rows] = await pool.execute(
      "SELECT ID as id, Bloqueo as bloqueo, `Cliente a Facturar` as clienteAFacturar, Nit as nit, Nombre as nombre FROM Maestro_Clientes_Credito ORDER BY `Cliente a Facturar` ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/clientes-credito:', err);
    res.status(500).json([]);
  }
});

// ── POST /api/clientes-credito (Agregar Cliente Crédito) ───────────────────
router.post('/api/clientes-credito', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { clienteAFacturar, nit, nombre, bloqueo } = req.body;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Clientes_credito');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!clienteAFacturar || !clienteAFacturar.trim()) {
      return res.status(400).json({ error: 'El Cliente a Facturar es obligatorio.' });
    }

    const clienteUpper = clienteAFacturar.trim().toUpperCase();
    const nitVal = nit ? parseInt(nit) : null;
    const nombreVal = (nombre || '').trim() || null;
    const bloqueoVal = (bloqueo === 0 || bloqueo === '0') ? 0 : 1;
    const newId = crypto.randomUUID().slice(0, 8);

    await pool.execute(
      'INSERT INTO Maestro_Clientes_Credito (ID, Bloqueo, `Cliente a Facturar`, Nit, Nombre) VALUES (?, ?, ?, ?, ?)',
      [newId, bloqueoVal, clienteUpper, nitVal, nombreVal]
    );

    res.json({ ok: true, id: newId, clienteAFacturar: clienteUpper, nit: nitVal, nombre: nombreVal, bloqueo: bloqueoVal });
  } catch (err) {
    console.error('[facturacion] POST /api/clientes-credito:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/clientes-credito/toggle (Alternar Bloqueo 1/0) ───────────────
router.post('/api/clientes-credito/toggle', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { id, nuevoEstado } = req.body;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Clientes_credito');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!id) return res.status(400).json({ error: 'ID es obligatorio' });

    let val = 1;
    if (typeof nuevoEstado !== 'undefined') {
      val = nuevoEstado ? 1 : 0;
      await pool.execute('UPDATE Maestro_Clientes_Credito SET Bloqueo = ? WHERE ID = ?', [val, id]);
    } else {
      await pool.execute('UPDATE Maestro_Clientes_Credito SET Bloqueo = IF(Bloqueo = 1, 0, 1) WHERE ID = ?', [id]);
      const [r] = await pool.execute('SELECT Bloqueo FROM Maestro_Clientes_Credito WHERE ID = ? LIMIT 1', [id]);
      val = r.length ? r[0].Bloqueo : 1;
    }

    res.json({ ok: true, id, bloqueo: val });
  } catch (err) {
    console.error('[facturacion] POST /api/clientes-credito/toggle:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/buscar-cliente (Buscar Nit en Maestro_Clientes) ───────────────
router.get('/api/buscar-cliente', async (req, res) => {
  try {
    const { nit } = req.query;
    if (!nit) return res.status(400).json({ error: 'Parámetro nit requerido' });

    const cleanNit = parseInt(String(nit).replace(/[^0-9]/g, ''));
    if (isNaN(cleanNit)) return res.json({ encontrado: false });

    const [rows] = await pool.execute(
      'SELECT `Código` as codigo, `Razón social` as razonSocial FROM Maestro_Clientes WHERE `Código` = ? LIMIT 1',
      [cleanNit]
    );

    if (rows.length && rows[0].razonSocial) {
      return res.json({
        encontrado: true,
        codigo: rows[0].codigo,
        razonSocial: rows[0].razonSocial.trim()
      });
    }

    res.json({ encontrado: false });
  } catch (err) {
    console.error('[facturacion] GET /api/buscar-cliente:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
