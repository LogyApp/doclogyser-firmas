const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../services/db');
const { notificarNuevoTraslado } = require('../services/email');
const { computarAccesoNomina } = require('../services/accesoNomina');
const { obtenerParametrosTraslados, validarFechaTraslado } = require('../services/configTraslados');
const { hoyBogota } = require('../services/trasladoVinculacion');

const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

const router = express.Router();

const FORM_HTML = path.join(__dirname, '../views/formtraslado/form.html');

// Solo pueden registrar traslados los roles con la Sección 'Traslados' en
// Maestro_Menu (nomina), y solo de trabajadores activos de las operaciones que ven.
async function accesoTraslados(usuario) {
  return computarAccesoNomina(usuario, 'Traslados');
}

// Vinculación activa más reciente del trabajador, si está dentro del alcance.
async function trabajadorEnAlcance(acceso, nombre) {
  const [rows] = await pool.execute(
    `SELECT \`Identificación\`, \`Operación\`, Cargo FROM \`Maestro_Vinculación\`
     WHERE Trabajador = ? AND Estado = 'Activo'
     ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
    [nombre]
  );
  if (!rows.length) return null;
  const vin = rows[0];
  if (!acceso.sinFiltro && !acceso.operacionesFiltro.includes(vin['Operación'])) return null;
  return vin;
}

function fechaHoraBogota() {
  const bogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${bogota.getFullYear()}-${p(bogota.getMonth() + 1)}-${p(bogota.getDate())} ${p(bogota.getHours())}:${p(bogota.getMinutes())}:${p(bogota.getSeconds())}`;
}

router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).send(htmlError('Parámetro ?usuario requerido'));

    const acceso = await accesoTraslados(usuario);
    if (!acceso) return res.status(403).send(htmlError('Usuario no autorizado para registrar traslados'));

    const usuarioNombre = acceso.usuarioNombre || usuario;

    let trabRows = [];
    if (acceso.sinFiltro) {
      [trabRows] = await pool.execute(
        'SELECT DISTINCT Trabajador FROM `Maestro_Vinculación` WHERE Estado = ? ORDER BY Trabajador',
        ['Activo']
      );
    } else if (acceso.operacionesFiltro.length) {
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      [trabRows] = await pool.execute(
        `SELECT DISTINCT Trabajador FROM \`Maestro_Vinculación\` WHERE Estado = ? AND \`Operación\` IN (${ph}) ORDER BY Trabajador`,
        ['Activo', ...acceso.operacionesFiltro]
      );
    }

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

    const acceso = await accesoTraslados(usuario);
    if (!acceso) return res.status(403).json({ ok: false, error: 'Usuario no autorizado para registrar traslados' });
    const [usuRows] = await pool.execute('SELECT ID, Email FROM Maestro_Usuarios WHERE ID = ?', [usuario]);

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
    const vinTrabajador = await trabajadorEnAlcance(acceso, Trabajador);
    if (!vinTrabajador) {
      return res.status(403).json({ ok: false, error: 'El trabajador no está activo en las operaciones que usted gestiona' });
    }
    // El origen es la operación actual del trabajador en Activos (no lo que llegue del formulario)
    const origenReal = vinTrabajador['Operación'] || operacion_origen || null;
    const identificacionReal = vinTrabajador['Identificación'] || Identificacion || null;
    if (norm(origenReal) === norm(operacion_destino)) {
      return res.status(400).json({ ok: false, error: `El trabajador ya está en ${origenReal}: escoja una operación destino distinta.` });
    }
    const errorFecha = validarFechaTraslado(await obtenerParametrosTraslados(), String(fecha_traslado).slice(0, 10), hoyBogota());
    if (errorFecha) return res.status(400).json({ ok: false, error: errorFecha });

    const [abiertos] = await pool.execute(
      `SELECT operacion_destino, estado_doc, DATE_FORMAT(fecha_traslado, '%Y-%m-%d') AS fecha
         FROM Dynamic_traslados_trabajador
        WHERE \`Identificación\` = ? AND estado_doc IN ('pendiente','validado','revisar') LIMIT 1`,
      [identificacionReal]
    );
    if (abiertos.length) {
      const a = abiertos[0];
      return res.status(409).json({ ok: false, error: `El trabajador ya tiene un traslado en curso a ${a.operacion_destino} (${a.fecha}, estado ${a.estado_doc}). Termínelo o anúlelo antes de registrar otro.` });
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
        identificacionReal,
        Trabajador,
        origenReal,
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

    const cargo = vinTrabajador.Cargo || '';

    notificarNuevoTraslado({
      trabajador:       Trabajador,
      identificacion:   identificacionReal || '',
      operacionOrigen:  origenReal || '',
      operacionDestino: operacion_destino,
      direccionDestino: direccion_destino || '',
      fechaTraslado:    fecha_traslado,
      horaTraslado:     hora_traslado || '',
      observaciones:    observaciones || '',
      usuario,
      emailUsuario:     (usuRows[0] && usuRows[0].Email) || '',
      cargo,
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
    const { nombre, usuario } = req.query;
    if (!nombre) return res.json({});

    const acceso = await accesoTraslados(usuario);
    if (!acceso) return res.status(403).json({});
    const vin = await trabajadorEnAlcance(acceso, nombre);
    if (!vin) return res.status(403).json({});

    const [segRows] = await pool.execute(
      'SELECT Celular, Email FROM `Maestro_Segmentación` WHERE Trabajador = ? LIMIT 1',
      [nombre]
    );

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
