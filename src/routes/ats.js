const express = require('express');
const path = require('path');
const fs = require('fs');
const pool = require('../services/db');
const { computarAccesoSst } = require('../services/accesoSst');
// resolverCoordinadorOperacionATS importado de atsService
const {
  resolverCoordinadorOperacionATS,
  obtenerFirmaUsuarioPorColaborador,
  obtenerConfigAts,
  listarRegistrosAts,
  obtenerDetalleAts,
  crearRegistroAts,
  actualizarRegistroAts,
  eliminarRegistroAts,
  firmarTrabajadorAts,
  firmarCoordinadorAts,
  firmarSstAts,
  generarPdfAts
} = require('../services/atsService');
const { enviarSolicitudesFirmaAts } = require('../services/atsNotificaciones');
const { obtenerFirmaBase64Reciente } = require('../services/storage');

function baseUrl(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function normalizar(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

// ¿El usuario que está en el panel es el coordinador o el responsable SST de este ATS?
function esFirmante(acceso, id, nombre) {
  const u = normalizar(acceso.usuarioId);
  const n = normalizar(acceso.usuarioNombre);
  return (!!u && normalizar(id) === u) || (!!n && normalizar(nombre) === n);
}

const router = express.Router();

const HTML_FORM_PATH = path.join(__dirname, '../views/ats/form.html');
const HTML_SIGN_PATH = path.join(__dirname, '../views/ats/firmar.html');

// Helper para verificar acceso al módulo SST / sección ATS
async function validarAccesoATS(req, res, accion = null) {
  const usuario = req.query.usuario || req.body?.usuario || req.headers['x-usuario'];
  if (!usuario) {
    res.status(401).json({ error: 'Parámetro usuario requerido' });
    return null;
  }
  const acceso = await computarAccesoSst(usuario, 'ATS');
  if (!acceso) {
    res.status(403).json({ error: 'Usuario no autorizado para la sección ATS (Maestro_Menu)' });
    return null;
  }

  const cfg = await obtenerConfigAts(acceso.rol);
  acceso.atsConfig = cfg;

  if (accion === 'crear' && !cfg.puedeRegistrar) {
    res.status(403).json({ error: 'Su rol no tiene permisos para crear o modificar ATS' });
    return null;
  }
  if (accion === 'eliminar' && !cfg.puedeEliminar) {
    res.status(403).json({ error: 'Su rol no tiene permisos para eliminar registros de ATS' });
    return null;
  }

  return acceso;
}

// ══════════════════════════════════════════════════════════════════════════
// VISTAS HTML
// ══════════════════════════════════════════════════════════════════════════

// Formulario de creación / edición de ATS
router.get(['/form', '/'], async (req, res, next) => {
  // Si es una petición a la raíz de /ats sin ser API, servir el form
  const isFormReq = req.path === '/form' || (req.baseUrl || '').toLowerCase().includes('form');
  if (!isFormReq && req.path !== '/') return next();

  if (fs.existsSync(HTML_FORM_PATH)) {
    return res.sendFile(HTML_FORM_PATH);
  }
  res.status(404).send('Plantilla form.html no encontrada');
});

// Pantalla pública de firma
router.get('/firmar', async (req, res) => {
  if (fs.existsSync(HTML_SIGN_PATH)) {
    return res.sendFile(HTML_SIGN_PATH);
  }
  res.status(404).send('Plantilla firmar.html no encontrada');
});

// ══════════════════════════════════════════════════════════════════════════
// ENDPOINTS DE CONSULTA Y LISTADO
// ══════════════════════════════════════════════════════════════════════════

// Listar ATS con filtros
router.get('/api/registros', async (req, res) => {
  try {
    const acceso = await validarAccesoATS(req, res);
    if (!acceso) return;

    const data = await listarRegistrosAts(acceso, req.query);
    res.json(data);
  } catch (err) {
    console.error('[ats] GET /api/registros error:', err);
    res.status(500).json({ error: err.message || 'Error consultando registros ATS' });
  }
});

// Detalle de un ATS
router.get('/api/registro/:id', async (req, res) => {
  try {
    const acceso = await validarAccesoATS(req, res);
    if (!acceso) return;

    const detalle = await obtenerDetalleAts(req.params.id, acceso);
    if (!detalle) {
      return res.status(404).json({ error: 'Registro ATS no encontrado o fuera de su alcance' });
    }
    detalle.firmaDirecta = {
      coordinador: esFirmante(acceso, detalle.coordinador_operacion_id, detalle.coordinador_operacion_nombre),
      sst: esFirmante(acceso, detalle.responsable_sst_id, detalle.responsable_sst_nombre),
    };
    res.json(detalle);
  } catch (err) {
    console.error('[ats] GET /api/registro/:id error:', err);
    res.status(500).json({ error: err.message || 'Error al obtener detalle de ATS' });
  }
});

// Consultar trabajadores activos de una operación para checklist del formulario
router.get('/api/trabajadores-por-operacion', async (req, res) => {
  try {
    const { regional, operacion } = req.query;
    if (!regional || !operacion) {
      return res.status(400).json({ error: 'Regional y Operación requeridos' });
    }

    const [rows] = await pool.execute(`
      SELECT
        v.\`Id Vinculación\` AS id_vinculacion,
        v.Trabajador AS nombre_trabajador,
        v.Identificación AS identificacion,
        v.Cargo AS cargo,
        v.Operación AS operacion,
        v.Regional AS regional,
        s.Celular AS celular,
        s.Email AS email
      FROM \`Maestro_Vinculación\` v
      LEFT JOIN \`Maestro_Segmentación\` s ON s.Identificación = v.Identificación
      WHERE v.Estado = 'Activo' AND v.Regional = ? AND v.Operación = ?
      ORDER BY v.Trabajador ASC
    `, [regional, operacion]);

    res.json(rows);
  } catch (err) {
    console.error('[ats] GET /api/trabajadores-por-operacion error:', err);
    res.status(500).json([]);
  }
});

// Búsqueda de trabajadores activos por nombre o cédula
router.get('/api/trabajadores-buscar', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);

    const term = `%${q.trim().toUpperCase()}%`;
    const [rows] = await pool.execute(`
      SELECT
        v.\`Id Vinculación\` AS id_vinculacion,
        v.Trabajador AS nombre_trabajador,
        v.Identificación AS identificacion,
        v.Cargo AS cargo,
        v.Operación AS operacion,
        v.Regional AS regional,
        s.Celular AS celular,
        s.Email AS email
      FROM \`Maestro_Vinculación\` v
      LEFT JOIN \`Maestro_Segmentación\` s ON s.Identificación = v.Identificación
      WHERE v.Estado = 'Activo' AND (v.Identificación LIKE ? OR v.Trabajador LIKE ?)
      LIMIT 30
    `, [term, term]);

    res.json(rows);
  } catch (err) {
    console.error('[ats] GET /api/trabajadores-buscar error:', err);
    res.status(500).json([]);
  }
});

// Sugerir coordinador para una operación según jerarquía de 3 pasos
router.get('/api/coordinador-sugerido', async (req, res) => {
  try {
    const { operacion } = req.query;
    if (!operacion) return res.json({ nombre: '', email: '', celular: '', step: 0 });

    const coordRes = await resolverCoordinadorOperacionATS(operacion);
    const nombre = coordRes ? coordRes.nombre : '';
    let celular = '';
    let email = '';
    let id = '';

    if (nombre) {
      const [uRows] = await pool.execute(
        'SELECT ID, Telefono, Email, Colaborador FROM Maestro_Usuarios WHERE Nombre = ? LIMIT 1',
        [nombre]
      );
      if (uRows.length) {
        id = uRows[0].ID;
        celular = uRows[0].Telefono || '';
        email = uRows[0].Email || '';

        // Buscar celular más reciente en Maestro_Segmentación si tiene Colaborador
        if (uRows[0].Colaborador) {
          try {
            const [seg] = await pool.execute(
              'SELECT Celular, Email FROM `Maestro_Segmentación` WHERE Trabajador = ? LIMIT 1',
              [uRows[0].Colaborador]
            );
            if (seg.length) {
              if (seg[0].Celular) celular = seg[0].Celular;
              if (!email && seg[0].Email) email = seg[0].Email;
            }
          } catch (_) {}
        }
      }
    }

    res.json({ id, nombre, celular, email, step: coordRes?.step || 0 });
  } catch (err) {
    console.error('[ats] GET /api/coordinador-sugerido error:', err);
    res.json({ nombre: '', email: '', celular: '', step: 0 });
  }
});

// Datos y alcance del usuario para el formulario ATS
router.get('/api/usuario-alcance', async (req, res) => {
  try {
    const id = req.query.id || req.query.usuario;
    if (!id) return res.status(400).json({ error: 'id requerido' });
    const acceso = await computarAccesoSst(id, 'ATS');
    if (!acceso) return res.status(403).json({ error: 'Sin acceso a ATS' });
    res.json({
      id: acceso.usuarioId,
      nombre: acceso.usuarioNombre,
      rol: acceso.rol,
      regional: acceso.regional,
      operacion: acceso.operacion,
      opsPorRegional: acceso.opsPorRegional || {},
      regionalesFiltro: Object.keys(acceso.opsPorRegional || {})
    });
  } catch (err) {
    console.error('[ats] GET /api/usuario-alcance error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// CRUD DE ATS
// ══════════════════════════════════════════════════════════════════════════

// Crear nuevo ATS
router.post('/api/registro', async (req, res) => {
  try {
    const acceso = await validarAccesoATS(req, res, 'crear');
    if (!acceso) return;

    const result = await crearRegistroAts(req.body, acceso);
    // Correo de solicitud de firma a trabajadores, coordinador y responsable SST
    try {
      result.correos = await enviarSolicitudesFirmaAts(result.id_ats, baseUrl(req));
    } catch (errMail) {
      console.error('[ats] Error enviando correos de firma:', errMail.message);
    }
    res.json(result);
  } catch (err) {
    console.error('[ats] POST /api/registro error:', err);
    res.status(400).json({ error: err.message || 'No fue posible registrar el ATS' });
  }
});

// Actualizar ATS
router.put('/api/registro/:id', async (req, res) => {
  try {
    const acceso = await validarAccesoATS(req, res, 'crear');
    if (!acceso) return;

    const result = await actualizarRegistroAts(req.params.id, req.body, acceso);
    // Correo solo a los trabajadores agregados en esta edición
    if (result.nuevosItems && result.nuevosItems.length) {
      try {
        result.correos = await enviarSolicitudesFirmaAts(req.params.id, baseUrl(req), { items: result.nuevosItems, coordinador: false, sst: false });
      } catch (errMail) {
        console.error('[ats] Error enviando correos de firma:', errMail.message);
      }
    }
    res.json(result);
  } catch (err) {
    console.error('[ats] PUT /api/registro/:id error:', err);
    res.status(400).json({ error: err.message || 'No fue posible actualizar el ATS' });
  }
});

// Eliminar ATS
router.delete('/api/registro/:id', async (req, res) => {
  try {
    const acceso = await validarAccesoATS(req, res, 'eliminar');
    if (!acceso) return;

    const result = await eliminarRegistroAts(req.params.id, acceso);
    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'No fue posible eliminar el ATS' });
    }
    res.json(result);
  } catch (err) {
    console.error('[ats] DELETE /api/registro/:id error:', err);
    res.status(500).json({ error: err.message || 'Error al eliminar el ATS' });
  }
});

// Generar (o regenerar y reemplazar) el PDF del ATS
router.post('/api/registro/:id/generar-pdf', async (req, res) => {
  try {
    const acceso = await validarAccesoATS(req, res);
    if (!acceso) return;

    const detalle = await obtenerDetalleAts(req.params.id, acceso);
    if (!detalle) {
      return res.status(404).json({ error: 'Registro ATS no encontrado o fuera de su alcance' });
    }

    // Quien no haya firmado aparece con la anotación de soporte por correo electrónico
    const result = await generarPdfAts(req.params.id, acceso);
    res.json(result);
  } catch (err) {
    console.error('[ats] POST /api/registro/:id/generar-pdf error:', err);
    res.status(400).json({ error: err.message || 'Error al generar el PDF del ATS' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// NOTIFICACIONES POR CORREO
// ══════════════════════════════════════════════════════════════════════════

// Reenviar correo de firma: un trabajador, el coordinador, el responsable SST o todos los pendientes.
// Cada envío queda con su fecha (soporte por correo en el PDF).
async function notificarAts(req, res, idAts, opciones, descripcion) {
  try {
    const acceso = await validarAccesoATS(req, res);
    if (!acceso) return;
    const detalle = await obtenerDetalleAts(idAts, acceso);
    if (!detalle) return res.status(404).json({ error: 'Registro ATS no encontrado o fuera de su alcance' });

    const r = await enviarSolicitudesFirmaAts(idAts, baseUrl(req), opciones);
    if (r.deshabilitado) return res.status(400).json({ error: 'Las notificaciones de correo de ATS están deshabilitadas (Config_Parametros).' });
    const enviados = r.trabajadores.enviados + (r.coordinador ? 1 : 0) + (r.sst ? 1 : 0);
    if (!enviados) {
      return res.status(400).json({ error: `No se envió ningún correo (${descripcion}: sin correo registrado o ya firmó).` });
    }
    const sinCorreo = r.trabajadores.sinCorreo + (r.coordinador === false ? 1 : 0) + (r.sst === false ? 1 : 0);
    res.json({ ok: true, enviados, sinCorreo, mensaje: `Correo enviado (${enviados})${sinCorreo ? ` · ${sinCorreo} sin correo registrado` : ''}` });
  } catch (err) {
    console.error('[ats] Error enviando correo de firma:', err);
    res.status(500).json({ error: err.message || 'Error al enviar correo' });
  }
}

router.post('/api/notificar-trabajador/:idItem', async (req, res) => {
  const [rows] = await pool.execute('SELECT id_ats FROM Dynamic_ats_trabajadores WHERE id_item = ?', [req.params.idItem]);
  if (!rows.length) return res.status(404).json({ error: 'Trabajador no encontrado' });
  return notificarAts(req, res, rows[0].id_ats, { items: [req.params.idItem], coordinador: false, sst: false }, 'trabajador');
});

router.post('/api/notificar-coordinador/:id', (req, res) =>
  notificarAts(req, res, req.params.id, { items: 'ninguno', coordinador: true, sst: false }, 'coordinador'));

router.post('/api/notificar-sst/:id', (req, res) =>
  notificarAts(req, res, req.params.id, { items: 'ninguno', coordinador: false, sst: true }, 'responsable SST'));

router.post('/api/registro/:id/notificar-pendientes', (req, res) =>
  notificarAts(req, res, req.params.id, { items: 'pendientes', coordinador: true, sst: true }, 'pendientes'));

// ══════════════════════════════════════════════════════════════════════════
// FIRMA PÚBLICA (TRABAJADOR, COORDINADOR, SST)
// ══════════════════════════════════════════════════════════════════════════

// Info para la pantalla de firma
router.get('/api/firmar-info', async (req, res) => {
  try {
    const { token, tipo } = req.query;
    if (!token) return res.status(400).json({ error: 'Token requerido' });

    if (tipo === 'coordinador') {
      const [rows] = await pool.execute(`
        SELECT
          a.id_ats, a.regional, a.operacion, a.muelle_ubicacion,
          DATE_FORMAT(a.vigencia_desde, '%d/%m/%Y') AS vigencia_desde,
          DATE_FORMAT(a.vigencia_hasta, '%d/%m/%Y') AS vigencia_hasta,
          a.coordinador_operacion_nombre AS nombre_firmante,
          a.fecha_firma_coordinador AS fecha_firma,
          'COORDINADOR' AS tipo_firmante
        FROM Dynamic_ats a
        WHERE a.token_coordinador = ?
      `, [token]);
      if (!rows.length) return res.status(404).json({ error: 'Token de coordinador no válido' });
      const [[c]] = await pool.execute('SELECT coordinador_operacion_id, coordinador_operacion_nombre FROM Dynamic_ats WHERE token_coordinador = ?', [token]);
      rows[0].firmaReciente = rows[0].fecha_firma ? null
        : await obtenerFirmaUsuarioPorColaborador(c.coordinador_operacion_id || c.coordinador_operacion_nombre).catch(() => null);
      return res.json(rows[0]);
    }

    if (tipo === 'sst') {
      const [rows] = await pool.execute(`
        SELECT
          a.id_ats, a.regional, a.operacion, a.muelle_ubicacion,
          DATE_FORMAT(a.vigencia_desde, '%d/%m/%Y') AS vigencia_desde,
          DATE_FORMAT(a.vigencia_hasta, '%d/%m/%Y') AS vigencia_hasta,
          a.responsable_sst_nombre AS nombre_firmante,
          a.fecha_firma_sst AS fecha_firma,
          'SST' AS tipo_firmante
        FROM Dynamic_ats a
        WHERE a.token_sst = ?
      `, [token]);
      if (!rows.length) return res.status(404).json({ error: 'Token de responsable SST no válido' });
      const [[r]] = await pool.execute('SELECT responsable_sst_id, responsable_sst_nombre FROM Dynamic_ats WHERE token_sst = ?', [token]);
      rows[0].firmaReciente = rows[0].fecha_firma ? null
        : await obtenerFirmaUsuarioPorColaborador(r.responsable_sst_id || r.responsable_sst_nombre).catch(() => null);
      return res.json(rows[0]);
    }

    // Por defecto: Trabajador
    const [tRows] = await pool.execute(`
      SELECT
        t.id_item,
        t.nombre_trabajador AS nombre_firmante,
        t.identificacion,
        t.cargo,
        t.estado_firma,
        t.fecha_firma,
        'TRABAJADOR' AS tipo_firmante,
        a.id_ats,
        a.regional,
        a.operacion,
        a.muelle_ubicacion,
        DATE_FORMAT(a.vigencia_desde, '%d/%m/%Y') AS vigencia_desde,
        DATE_FORMAT(a.vigencia_hasta, '%d/%m/%Y') AS vigencia_hasta
      FROM Dynamic_ats_trabajadores t
      JOIN Dynamic_ats a ON a.id_ats = t.id_ats
      WHERE t.token_firma = ?
    `, [token]);

    if (!tRows.length) return res.status(404).json({ error: 'Enlace de firma no encontrado o inválido' });
    tRows[0].firmaReciente = tRows[0].estado_firma === 'ACEPTADA' ? null
      : await obtenerFirmaBase64Reciente(tRows[0].identificacion).catch(() => null);
    res.json(tRows[0]);
  } catch (err) {
    console.error('[ats] GET /api/firmar-info error:', err);
    res.status(500).json({ error: err.message || 'Error al consultar datos de firma' });
  }
});

// Procesar firma trabajador
router.post('/api/firmar-trabajador', async (req, res) => {
  try {
    const { token, firmaBase64, aceptarExistente } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
    const result = await firmarTrabajadorAts(token, { firmaBase64, aceptarExistente }, ip);
    res.json(result);
  } catch (err) {
    console.error('[ats] POST /api/firmar-trabajador error:', err);
    res.status(400).json({ error: err.message || 'Error al procesar la firma' });
  }
});

// Procesar firma coordinador
router.post('/api/firmar-coordinador', async (req, res) => {
  try {
    const { token, firmaBase64, aceptarExistente } = req.body;
    if (!token) return res.status(400).json({ error: 'Enlace de firma no válido' });
    const result = await firmarCoordinadorAts(token, { firmaBase64: aceptarExistente ? null : firmaBase64 });
    res.json(result);
  } catch (err) {
    console.error('[ats] POST /api/firmar-coordinador error:', err);
    res.status(400).json({ error: err.message || 'Error al procesar firma de coordinador' });
  }
});

// Procesar firma SST
router.post('/api/firmar-sst', async (req, res) => {
  try {
    const { token, firmaBase64, aceptarExistente } = req.body;
    if (!token) return res.status(400).json({ error: 'Enlace de firma no válido' });
    const result = await firmarSstAts(token, { firmaBase64: aceptarExistente ? null : firmaBase64 });
    res.json(result);
  } catch (err) {
    console.error('[ats] POST /api/firmar-sst error:', err);
    res.status(400).json({ error: err.message || 'Error al procesar firma SST' });
  }
});

// Firma desde el panel de SST con la firma registrada: solo el propio coordinador o
// el propio responsable SST del ATS.
router.post('/api/registro/:id/firmar-directo', async (req, res) => {
  try {
    const acceso = await validarAccesoATS(req, res);
    if (!acceso) return;
    const detalle = await obtenerDetalleAts(req.params.id, acceso);
    if (!detalle) return res.status(404).json({ error: 'Registro ATS no encontrado o fuera de su alcance' });
    const tipo = String(req.query.tipo || (req.body || {}).tipo || '').toLowerCase();
    if (tipo === 'coordinador') {
      if (!esFirmante(acceso, detalle.coordinador_operacion_id, detalle.coordinador_operacion_nombre)) {
        return res.status(403).json({ error: 'Solo el coordinador de la operación puede firmar como coordinador.' });
      }
      return res.json(await firmarCoordinadorAts(detalle.id_ats, {}, { validadoComoFirmante: true }));
    }
    if (tipo === 'sst') {
      if (!esFirmante(acceso, detalle.responsable_sst_id, detalle.responsable_sst_nombre)) {
        return res.status(403).json({ error: 'Solo el responsable SST del ATS puede firmar como SST.' });
      }
      return res.json(await firmarSstAts(detalle.id_ats, {}, { validadoComoFirmante: true }));
    }
    res.status(400).json({ error: 'Tipo de firma inválido' });
  } catch (err) {
    console.error('[ats] POST /api/registro/:id/firmar-directo error:', err);
    res.status(400).json({ error: err.message || 'Error al registrar la firma' });
  }
});

module.exports = router;
