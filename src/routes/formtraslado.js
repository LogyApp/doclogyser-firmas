const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../services/db');
const { notificarNuevoTraslado } = require('../services/email');

const router = express.Router();

const FORM_HTML = path.join(__dirname, '../views/formtraslado/form.html');

function fechaHoraBogota() {
  const bogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${bogota.getFullYear()}-${p(bogota.getMonth() + 1)}-${p(bogota.getDate())} ${p(bogota.getHours())}:${p(bogota.getMinutes())}:${p(bogota.getSeconds())}`;
}

router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).send(htmlError('Parámetro ?usuario requerido'));

    const [usuRows] = await pool.execute('SELECT ID, Nombre FROM Maestro_Usuarios WHERE ID = ?', [usuario]);
    if (!usuRows.length) return res.status(403).send(htmlError('Usuario no autorizado'));

    const usuarioNombre = usuRows[0].Nombre || usuario;

    const [trabRows] = await pool.execute(
      'SELECT DISTINCT Trabajador FROM `Maestro_Vinculación` WHERE Estado = ? ORDER BY Trabajador',
      ['Activo']
    );

    const [opRows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN"
    );

    const trabajadores = trabRows.map(r => r.Trabajador).filter(Boolean);
    const operaciones = opRows.map(r => r['OPERACIÓN']).filter(Boolean);

    const template = fs.readFileSync(FORM_HTML, 'utf8');
    const config = JSON.stringify({ usuario, usuarioNombre, trabajadores, operaciones })
      .replace(/<\/script>/gi, '<\\/script>');

    res.send(template.replace('__CONFIG__', config));
  } catch (err) {
    console.error(err);
    res.status(500).send(htmlError('Error interno del servidor'));
  }
});

router.post('/', async (req, res) => {
  try {
    const usuario = req.query.usuario || req.body.usuario;

    const [usuRows] = await pool.execute('SELECT ID, Email FROM Maestro_Usuarios WHERE ID = ?', [usuario]);
    if (!usuRows.length) return res.status(403).json({ ok: false, error: 'Usuario no autorizado' });

    const {
      Trabajador,
      Identificación: Identificacion,
      operacion_origen,
      operacion_destino,
      direccion_destino,
      fecha_traslado,
      hora_traslado,
      celular_trabajador,
      email_trabajador,
      observaciones,
    } = req.body;

    if (!Trabajador || !operacion_destino || !fecha_traslado) {
      return res.status(400).json({ ok: false, error: 'Campos obligatorios incompletos' });
    }

    const ahora = fechaHoraBogota();
    const idTraslado = uuidv4();

    await pool.execute(
      `INSERT INTO Dynamic_traslados_trabajador
       (IdTraslado, estado_doc, fecha_aviso, Identificación, Trabajador,
        operacion_origen, operacion_destino, direccion_destino,
        fecha_traslado, hora_traslado, celular_trabajador, email_trabajador,
        observaciones, Usuario, Fecha_Registro)
       VALUES (?, 'pendiente', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        idTraslado,
        ahora,
        Identificacion || null,
        Trabajador,
        operacion_origen || null,
        operacion_destino,
        direccion_destino || null,
        fecha_traslado,
        hora_traslado || null,
        celular_trabajador || null,
        email_trabajador || null,
        observaciones || null,
        usuario,
        ahora,
      ]
    );

    notificarNuevoTraslado({
      trabajador:       Trabajador,
      identificacion:   Identificacion || '',
      operacionOrigen:  operacion_origen || '',
      operacionDestino: operacion_destino,
      direccionDestino: direccion_destino || '',
      fechaTraslado:    fecha_traslado,
      horaTraslado:     hora_traslado || '',
      usuario,
      emailUsuario:     usuRows[0].Email || '',
      idTraslado,
    }).catch(e => console.error('Error enviando correo:', e.message));

    res.json({ ok: true, IdTraslado: idTraslado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/api/trabajador', async (req, res) => {
  try {
    const { nombre } = req.query;
    if (!nombre) return res.json({});

    const [vinRows] = await pool.execute(
      `SELECT Identificación, Operación FROM \`Maestro_Vinculación\`
       WHERE Trabajador = ?
       ORDER BY \`Fecha de Ingreso\` DESC
       LIMIT 1`,
      [nombre]
    );

    const [segRows] = await pool.execute(
      'SELECT Celular, Email FROM `Maestro_Segmentación` WHERE Trabajador = ? LIMIT 1',
      [nombre]
    );

    const vin = vinRows[0] || {};
    const seg = segRows[0] || {};

    res.json({
      Identificación: vin['Identificación'] || '',
      operacion_origen: vin['Operación'] || '',
      celular: seg['Celular'] || '',
      email: seg['Email'] || '',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({});
  }
});

router.get('/api/operacion', async (req, res) => {
  try {
    const { nombre } = req.query;
    if (!nombre) return res.json({});

    const [rows] = await pool.execute(
      'SELECT DIRECCION FROM Maestro_Operaciones WHERE OPERACIÓN = ? LIMIT 1',
      [nombre]
    );

    res.json({ direccion: (rows[0] || {})['DIRECCION'] || '' });
  } catch (err) {
    console.error(err);
    res.status(500).json({});
  }
});

function htmlError(mensaje) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f0f0}div{background:#fff;padding:2rem;border-radius:8px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.15);max-width:400px;width:90%}h2{color:#e74c3c;margin-top:0}p{color:#666;margin:0}</style></head><body><div><h2>Error</h2><p>${mensaje}</p></div></body></html>`;
}

module.exports = router;
