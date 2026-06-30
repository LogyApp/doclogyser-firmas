const express = require('express');
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const pool    = require('../services/db');
const { subirDocMovilidadTrabajador, subirDocMovilidadExterno } = require('../services/storage');
const { notificarMovilidadRegistrada } = require('../services/email');

const router = express.Router();

const HTML_INDEX_PATH = path.join(__dirname, '../views/movilidadyriesgo/index.html');
const HTML_FORM_PATH  = path.join(__dirname, '../views/formmovilidadyriesgo/form.html');

const ROLES_SIN_FILTRO  = ['Sistema', 'AdmSst', 'LiderSst'];
const ROLES_REGIONAL    = [];
const ROLES_DISPOSITIVO = ['AuxSst'];
const ROLES_MODALIDAD   = ['AnaSst'];

function formatTimestamp() {
  const date = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yy}${mm}${dd}${hh}${ss}`;
}

async function registrarDocumentoTrabajador(identificacion, urlDoc, usuarioId, tipoDocumento, prefijo, observaciones) {
  try {
    const [vinRows] = await pool.execute(
      `SELECT Regional, \`Operación\`, Identificación, Estado, \`Fecha de Ingreso\`
       FROM \`Maestro_Vinculación\`
       WHERE Identificación = ?
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );
    const regional    = vinRows.length ? vinRows[0].Regional           : null;
    const operacion   = vinRows.length ? vinRows[0]['Operación']       : null;
    const estado      = vinRows.length ? vinRows[0].Estado             : null;
    const fechaIngreso = vinRows.length ? vinRows[0]['Fecha de Ingreso'] : null;

    const docId = uuidv4();
    await pool.execute(
      `INSERT INTO Maestro_docTrabajador
       (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
        TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud, Justificacion_Solicitud, Usuario)
       VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`,
      [docId, regional, operacion, identificacion, estado, fechaIngreso,
       tipoDocumento, prefijo, urlDoc, observaciones, usuarioId]
    );
    console.log(`[MVR] docTrabajador registrado: ${prefijo}/${observaciones} para ${identificacion}`);
  } catch (err) {
    console.error(`[MVR] Error registrando docTrabajador para ${identificacion}:`, err.message);
  }
}

function agruparOperacionesPorRegional(opRows) {
  const map = {};
  opRows.forEach((row) => {
    const reg = row.REGIONAL || row.Regional;
    const op  = row['OPERACIÓN'] || row['Operación'];
    if (reg && op) {
      if (!map[reg]) map[reg] = [];
      map[reg].push(op);
    }
  });
  return map;
}

async function computarAccesoMVR(usuarioId) {
  if (!usuarioId) return null;

  const [uRows] = await pool.execute(
    'SELECT ID, Nombre, Rol, Regional, Dispositivo, `Operación` FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );
  if (!uRows.length) return null;

  const usuario = uRows[0];
  const rol = usuario.Rol || '';

  const ALLOWED_ROLES = ['AdmSst', 'AnaSst', 'AuxSst', 'LiderSst', 'Sistema'];
  if (!ALLOWED_ROLES.includes(rol)) return null;

  const acceso = {
    usuarioId:    usuario.ID,
    usuarioNombre: usuario.Nombre || usuario.ID,
    rol,
    regional:    usuario.Regional    || '',
    dispositivo: usuario.Dispositivo || '',
    operacion:   usuario['Operación'] || '',
    sinFiltro:   ROLES_SIN_FILTRO.includes(rol),
    operacionesFiltro: [],
    opsPorRegional: {},
  };

  let opRows = [];
  if (acceso.sinFiltro) {
    const [rows] = await pool.execute(
      "SELECT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY REGIONAL, OPERACIÓN"
    );
    opRows = rows;
  } else if (ROLES_REGIONAL.includes(rol)) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.regional]
    );
    opRows = rows;
  } else if (ROLES_DISPOSITIVO.includes(rol)) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE SOCIODEMOGRAFICA = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.dispositivo]
    );
    opRows = rows;
  } else if (ROLES_MODALIDAD.includes(rol)) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE MODALIDAD = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.dispositivo]
    );
    opRows = rows;
  } else if (acceso.operacion) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.operacion]
    );
    opRows = rows;
  }

  acceso.opsPorRegional     = agruparOperacionesPorRegional(opRows);
  acceso.operacionesFiltro  = opRows.map((r) => r['OPERACIÓN'] || r['Operación']).filter(Boolean);

  return acceso;
}

// ═════ SERVIR INTERFAZ ═════
router.get('/', async (req, res) => {
  try {
    const isForm = (req.baseUrl || '').toLowerCase().includes('/formmovilidadyriesgo');

    if (isForm) {
      const html = fs.readFileSync(HTML_FORM_PATH, 'utf8');
      const { identificacion, usuario } = req.query;
      const config = JSON.stringify({
        identificacion: identificacion || null,
        usuarioId:      usuario       || null,
        modoSoloId:    !identificacion,
      }).replace(/<\/script>/gi, '<\\/script>');
      return res.send(html.replace('__CONFIG__', config));
    }

    const { usuario } = req.query;
    if (!usuario) return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');

    const acceso = await computarAccesoMVR(usuario);
    if (!acceso) return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');

    const html = fs.readFileSync(HTML_INDEX_PATH, 'utf8');
    const config = JSON.stringify({
      ...acceso,
      regionalesFiltro: Object.keys(acceso.opsPorRegional),
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[movilidadyriesgo] Error serving page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// ═════ API: GET /api/prefill ═════
router.get('/api/prefill', async (req, res) => {
  try {
    const { identificacion } = req.query;
    if (!identificacion) return res.status(400).json({ error: 'identificacion requerida' });

    const [vinRows] = await pool.execute(
      `SELECT Trabajador, \`Operación\`, Cargo, Regional
       FROM \`Maestro_Vinculación\`
       WHERE Identificación = ?
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );

    const prefill = { es_trabajador: 0, nombre_completo: '', operacion_sede: '', cargo: '', regional: '', email: '', celular: '' };

    if (vinRows.length) {
      const vin = vinRows[0];
      prefill.es_trabajador  = 1;
      prefill.nombre_completo = vin.Trabajador      || '';
      prefill.operacion_sede  = vin['Operación']    || '';
      prefill.cargo           = vin.Cargo           || '';
      prefill.regional        = vin.Regional        || '';
    }

    const [segRows] = await pool.execute(
      'SELECT Email, Celular FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1',
      [identificacion]
    );
    if (segRows.length) {
      prefill.email   = segRows[0].Email  || '';
      prefill.celular = segRows[0].Celular || '';
    }

    const [existRows] = await pool.execute(
      'SELECT * FROM Maestro_movilidadyriesgosst WHERE identificacion = ? LIMIT 1',
      [identificacion]
    );

    res.json({ prefill, existente: existRows.length ? existRows[0] : null });
  } catch (err) {
    console.error('[movilidadyriesgo] GET /api/prefill:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/listado ═════
router.get('/api/listado', async (req, res) => {
  try {
    const { usuario, trabajador, regional, operacion, fechaDesde, fechaHasta, seDesplaza } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoMVR(usuario);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const conds  = [];
    const params = [];

    if (!acceso.sinFiltro) {
      if (acceso.operacionesFiltro.length > 0) {
        conds.push(`m.operacion_sede IN (${acceso.operacionesFiltro.map(() => '?').join(',')})`);
        acceso.operacionesFiltro.forEach(op => params.push(op));
      } else {
        conds.push('1 = 0');
      }
    }

    if (regional)    { conds.push('m.regional = ?');      params.push(regional); }
    if (operacion)   { conds.push('m.operacion_sede = ?'); params.push(operacion); }
    if (trabajador) {
      conds.push('(m.identificacion LIKE ? OR m.nombre_completo LIKE ?)');
      params.push(`%${trabajador}%`, `%${trabajador}%`);
    }
    if (fechaDesde)  { conds.push('DATE(m.fecha_registro) >= ?'); params.push(fechaDesde); }
    if (fechaHasta)  { conds.push('DATE(m.fecha_registro) <= ?'); params.push(fechaHasta); }
    if (seDesplaza)  { conds.push('m.se_desplaza = ?');           params.push(seDesplaza); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT m.* FROM Maestro_movilidadyriesgosst m ${where} ORDER BY m.fecha_registro DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error('[movilidadyriesgo] GET /api/listado:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/actualizar-contacto ═════
router.post('/api/actualizar-contacto', async (req, res) => {
  try {
    const { identificacion, email, celular } = req.body;
    if (!identificacion) return res.status(400).json({ error: 'identificacion requerida' });

    await pool.execute(
      `INSERT INTO Maestro_Segmentación (Identificación, Email, Celular)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE Email = VALUES(Email), Celular = VALUES(Celular)`,
      [identificacion, email || null, celular || null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[movilidadyriesgo] POST /api/actualizar-contacto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/guardar ═════
router.post('/api/guardar', async (req, res) => {
  try {
    const {
      identificacion, es_trabajador, nombre_completo, operacion_sede, cargo, regional,
      email, celular, se_desplaza, medio_transporte, gasto_cubierto, km_diario_promedio,
      tipo_movilidad, num_montacarguistas, placa,
      venc_licencia, venc_soat, venc_tecnomecanica,
      observaciones, usuario,
      doc_licencia, doc_soat, doc_tecnomecanica,
    } = req.body;

    if (!identificacion) return res.status(400).json({ error: 'identificacion requerida' });

    const ts           = formatTimestamp();
    const esTrabajador = parseInt(es_trabajador) === 1;
    const usuarioGuarda = usuario || identificacion;

    // Subir documentos a GCS
    let url_licencia      = null;
    let url_soat          = null;
    let url_tecnomecanica = null;

    if (doc_licencia?.base64) {
      const buf = Buffer.from(doc_licencia.base64.replace(/^data:.*;base64,/, ''), 'base64');
      const ct  = doc_licencia.contentType || 'application/pdf';
      url_licencia = esTrabajador
        ? await subirDocMovilidadTrabajador(identificacion, `licencia${ts}`, buf, ct)
        : await subirDocMovilidadExterno(identificacion, doc_licencia.filename || `licencia_${ts}.pdf`, buf, ct);
    }

    if (doc_soat?.base64) {
      const buf = Buffer.from(doc_soat.base64.replace(/^data:.*;base64,/, ''), 'base64');
      const ct  = doc_soat.contentType || 'application/pdf';
      url_soat = esTrabajador
        ? await subirDocMovilidadTrabajador(identificacion, `soat${ts}`, buf, ct)
        : await subirDocMovilidadExterno(identificacion, doc_soat.filename || `soat_${ts}.pdf`, buf, ct);
    }

    if (doc_tecnomecanica?.base64) {
      const buf = Buffer.from(doc_tecnomecanica.base64.replace(/^data:.*;base64,/, ''), 'base64');
      const ct  = doc_tecnomecanica.contentType || 'application/pdf';
      url_tecnomecanica = esTrabajador
        ? await subirDocMovilidadTrabajador(identificacion, `cda${ts}`, buf, ct)
        : await subirDocMovilidadExterno(identificacion, doc_tecnomecanica.filename || `cda_${ts}.pdf`, buf, ct);
    }

    // Upsert en Maestro_movilidadyriesgosst
    const idmovilidad = uuidv4();
    await pool.execute(
      `INSERT INTO Maestro_movilidadyriesgosst
       (idmovilidad, identificacion, es_trabajador, nombre_completo, operacion_sede, cargo, regional,
        email, celular, se_desplaza, medio_transporte, gasto_cubierto, km_diario_promedio,
        tipo_movilidad, num_montacarguistas, placa,
        venc_licencia, venc_soat, venc_tecnomecanica,
        observaciones, url_licencia, url_soat, url_tecnomecanica, usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         es_trabajador       = VALUES(es_trabajador),
         nombre_completo     = VALUES(nombre_completo),
         operacion_sede      = VALUES(operacion_sede),
         cargo               = VALUES(cargo),
         regional            = VALUES(regional),
         email               = VALUES(email),
         celular             = VALUES(celular),
         se_desplaza         = VALUES(se_desplaza),
         medio_transporte    = VALUES(medio_transporte),
         gasto_cubierto      = VALUES(gasto_cubierto),
         km_diario_promedio  = VALUES(km_diario_promedio),
         tipo_movilidad      = VALUES(tipo_movilidad),
         num_montacarguistas = VALUES(num_montacarguistas),
         placa               = VALUES(placa),
         venc_licencia       = VALUES(venc_licencia),
         venc_soat           = VALUES(venc_soat),
         venc_tecnomecanica  = VALUES(venc_tecnomecanica),
         observaciones       = VALUES(observaciones),
         url_licencia        = IF(VALUES(url_licencia)       IS NOT NULL, VALUES(url_licencia),       url_licencia),
         url_soat            = IF(VALUES(url_soat)           IS NOT NULL, VALUES(url_soat),           url_soat),
         url_tecnomecanica   = IF(VALUES(url_tecnomecanica)  IS NOT NULL, VALUES(url_tecnomecanica),  url_tecnomecanica),
         usuario             = VALUES(usuario)`,
      [
        idmovilidad, identificacion, esTrabajador ? 1 : 0,
        nombre_completo || '', operacion_sede || '', cargo || '', regional || '',
        email || null, celular || null,
        se_desplaza || 'No', medio_transporte || null, gasto_cubierto || null,
        km_diario_promedio ? parseFloat(km_diario_promedio) : null,
        tipo_movilidad || null,
        num_montacarguistas ? parseInt(num_montacarguistas) : null,
        placa || null,
        venc_licencia || null, venc_soat || null, venc_tecnomecanica || null,
        observaciones || null,
        url_licencia, url_soat, url_tecnomecanica,
        usuarioGuarda,
      ]
    );

    // Actualizar Maestro_Segmentación si es trabajador
    if (esTrabajador && (email || celular)) {
      await pool.execute(
        `INSERT INTO Maestro_Segmentación (Identificación, Email, Celular)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           Email   = IF(VALUES(Email)   IS NOT NULL, VALUES(Email),   Email),
           Celular = IF(VALUES(Celular) IS NOT NULL, VALUES(Celular), Celular)`,
        [identificacion, email || null, celular || null]
      );
    }

    // Registrar documentos en Maestro_docTrabajador
    if (esTrabajador) {
      if (url_licencia)      await registrarDocumentoTrabajador(identificacion, url_licencia,      usuarioGuarda, 41, 'OTROS', 'Licencia conducción');
      if (url_soat)          await registrarDocumentoTrabajador(identificacion, url_soat,          usuarioGuarda, 41, 'OTROS', 'Soat');
      if (url_tecnomecanica) await registrarDocumentoTrabajador(identificacion, url_tecnomecanica, usuarioGuarda, 41, 'OTROS', 'CDA');
    }

    // Obtener email del usuario que registró
    let emailNotificar = email || null;
    if (usuario && usuario !== identificacion) {
      const [usuRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
      if (usuRows.length && usuRows[0].Email) emailNotificar = usuRows[0].Email;
    }

    if (emailNotificar) {
      notificarMovilidadRegistrada({
        emailUsuario:   emailNotificar,
        nombreCompleto: nombre_completo || identificacion,
        identificacion,
        operacionSede:  operacion_sede || '',
        cargo:          cargo          || '',
        seDesplaza:     se_desplaza    || 'No',
        medioTransporte: medio_transporte || '',
      }).catch(e => console.error('[MVR] Error correo:', e.message));
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[movilidadyriesgo] POST /api/guardar:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: DELETE /api/registro/:idmovilidad ═════
router.delete('/api/registro/:idmovilidad', async (req, res) => {
  try {
    const { idmovilidad } = req.params;
    const { usuario }     = req.query;

    const acceso = await computarAccesoMVR(usuario);
    if (!acceso || !acceso.sinFiltro) {
      return res.status(403).json({ error: 'Sin permisos para eliminar' });
    }

    await pool.execute('DELETE FROM Maestro_movilidadyriesgosst WHERE idmovilidad = ?', [idmovilidad]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[movilidadyriesgo] DELETE /api/registro:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
