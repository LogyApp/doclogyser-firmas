const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../services/db');
const { subirEvidenciaTicket } = require('../services/storage');

const router = express.Router();
const uploadTicket = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ══════════════════════════════════════════════════════════════════════════
// Backend compartido del botón "+ Ticket" (Dynamic_Tickets), reusado por
// cualquier módulo que incluya public/js/ticket-boton.js — no hay una copia
// de esta lógica por módulo. El único endpoint específico de un módulo es
// GET /facturacion/api/tickets/recibos-recientes (Dynamic_Recibos es del
// dominio de Servicios/Facturación), que el widget llama aparte solo cuando
// el Módulo elegido es "Servicios".
//
// El ticket es una acción de bajo riesgo ("reportar una novedad"), no una
// consulta de datos sensibles: se exige que el usuario exista en
// Maestro_Usuarios, pero no se restringe por Sección/Rol de ningún módulo
// en particular, ni se limita a qué Operación puede reportar (ver detalle
// de esta decisión en el historial de commits).
// ══════════════════════════════════════════════════════════════════════════

// ── GET /api/modulos — valores únicos de Config_motivo_tickets.Modulo ──────
router.get('/api/modulos', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT DISTINCT Modulo FROM Config_motivo_tickets WHERE Modulo IS NOT NULL ORDER BY Modulo ASC'
    );
    res.json(rows.map(r => r.Modulo));
  } catch (err) {
    console.error('[tickets] GET /api/modulos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/motivos?modulo=X ───────────────────────────────────────────────
// Devuelve [] si ese módulo todavía no tiene catálogo cargado; el widget cae
// a un campo de texto libre en ese caso (varios módulos no tienen Motivo
// configurado todavía: Asistencia, Inventario, Nomina, Requisiciones,
// Sociodemografica, Tecnologia).
router.get('/api/motivos', async (req, res) => {
  try {
    const { modulo } = req.query;
    if (!modulo) return res.status(400).json({ error: 'modulo requerido' });
    const [rows] = await pool.execute(
      'SELECT Motivo FROM Config_motivo_tickets WHERE Modulo = ? AND Motivo IS NOT NULL ORDER BY Motivo ASC',
      [modulo]
    );
    res.json(rows.map(r => r.Motivo));
  } catch (err) {
    console.error('[tickets] GET /api/motivos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/usuario-info?usuario=X — teléfono para prellenar el formulario ─
router.get('/api/usuario-info', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const [rows] = await pool.execute('SELECT Telefono FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    if (!rows.length) return res.status(403).json({ error: 'Usuario no reconocido' });
    res.json({ telefono: rows[0].Telefono || '' });
  } catch (err) {
    console.error('[tickets] GET /api/usuario-info:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/crear — crea un ticket desde cualquier módulo con el botón ───
router.post('/api/crear', uploadTicket.single('evidencia'), async (req, res) => {
  try {
    const { usuario, modulo, operacion, motivo, idrecibo, descripcion, telefono } = req.body;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const [userRows] = await pool.execute('SELECT ID FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    if (!userRows.length) return res.status(403).json({ error: 'Usuario no reconocido' });

    if (!modulo || !operacion || !motivo || !motivo.trim() || !descripcion || !descripcion.trim()) {
      return res.status(400).json({ error: 'Módulo, Operación, Motivo y Descripción son obligatorios.' });
    }

    const [opRows] = await pool.execute(
      "SELECT 1 FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' LIMIT 1",
      [operacion]
    );
    if (!opRows.length) return res.status(400).json({ error: 'Operación inválida' });

    // idrecibo solo tiene sentido para el módulo Servicios (Dynamic_Recibos);
    // para cualquier otro módulo se ignora aunque llegue en el body.
    let idReciboVal = null;
    if (modulo === 'Servicios' && idrecibo && String(idrecibo).trim()) {
      const reciboLimpio = String(idrecibo).trim();
      const [reciboRows] = await pool.execute('SELECT IdRecibo FROM Dynamic_Recibos WHERE IdRecibo = ? LIMIT 1', [reciboLimpio]);
      if (!reciboRows.length) return res.status(400).json({ error: 'El recibo seleccionado no existe' });
      idReciboVal = reciboLimpio;
    }

    const ticket = crypto.randomUUID().slice(0, 8);

    let evidenciaUrl = '';
    if (req.file) {
      evidenciaUrl = await subirEvidenciaTicket(ticket, req.file.buffer, req.file.originalname, req.file.mimetype);
    }

    const telefonoVal = (telefono && String(telefono).trim())
      ? (parseInt(String(telefono).replace(/\D/g, ''), 10) || null)
      : null;

    await pool.execute(
      `INSERT INTO Dynamic_Tickets
       (Ticket, fecha_registro, \`Operación\`, solicitante, modulo, motivo, idrecibo, descripcion, Evidencia, telefono, Estado)
       VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, 'En Proceso')`,
      [ticket, operacion, usuario, modulo, motivo.trim(), idReciboVal, descripcion.trim(), evidenciaUrl, telefonoVal]
    );

    res.json({ ok: true, ticket });
  } catch (err) {
    console.error('[tickets] POST /api/crear:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
