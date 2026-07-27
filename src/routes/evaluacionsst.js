const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const pool    = require('../services/db');
const { subirFirma, obtenerFirmaBase64Reciente } = require('../services/storage');
const { notificarFirmaEvaluacionSST, notificarEvaluacionSSTCompletada } = require('../services/email');
const { renderPDF } = require('../services/evsstPdfGenerator');
const { subirPDFEvaluacionSST } = require('../services/storage');

const router = express.Router();

const HTML_INDEX_PATH = path.join(__dirname, '../views/evaluacionsst/index.html');
const HTML_FORM_PATH  = path.join(__dirname, '../views/formevaluacionsst/form.html');
const HTML_SIGN_PATH  = path.join(__dirname, '../views/evaluacionsst/responder.html');

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

async function registrarDocumentoTrabajador(identificacion, urlDoc, usuarioId, tipoDocumento, prefijo) {
  try {
    const [vinRows] = await pool.execute(
      `SELECT Regional, \`Operación\`, Identificación, Estado, \`Fecha de Ingreso\` 
       FROM \`Maestro_Vinculación\` 
       WHERE Identificación = ? 
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );

    const regional = vinRows.length ? vinRows[0].Regional : null;
    const operacion = vinRows.length ? vinRows[0]['Operación'] : null;
    const estado = vinRows.length ? vinRows[0].Estado : null;
    const fechaIngreso = vinRows.length ? vinRows[0]['Fecha de Ingreso'] : null;

    const docId = uuidv4();
    await pool.execute(
      `INSERT INTO Maestro_docTrabajador
       (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
        TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud, Justificacion_Solicitud, Usuario)
       VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?)`,
      [
        docId,
        regional,
        operacion,
        identificacion,
        estado,
        fechaIngreso,
        tipoDocumento,
        prefijo,
        urlDoc,
        usuarioId
      ]
    );
    console.log(`[Maestro_docTrabajador] Registrado documento tipo ${tipoDocumento} (${prefijo}) para ${identificacion}`);
  } catch (err) {
    console.error(`[Maestro_docTrabajador] Error registrando documento para ${identificacion}:`, err.message);
  }
}

async function computarAccesoEVSST(usuarioId) {
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
    usuarioId: usuario.ID,
    usuarioNombre: usuario.Nombre || usuario.ID,
    rol,
    regional: usuario.Regional || '',
    dispositivo: usuario.Dispositivo || '',
    operacion: usuario['Operación'] || '',
    sinFiltro: ROLES_SIN_FILTRO.includes(rol),
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

  // Agrupar operaciones por regional
  const map = {};
  opRows.forEach((row) => {
    const reg = row.REGIONAL || row.Regional;
    const op = row.OPERACIÓN || row.Operación;
    if (reg && op) {
      if (!map[reg]) map[reg] = [];
      map[reg].push(op);
    }
  });

  acceso.opsPorRegional = map;
  acceso.operacionesFiltro = opRows.map((row) => row['OPERACIÓN'] || row['Operación']).filter(Boolean);

  return acceso;
}

// ═════ SERVIR INTERFAZ (Dashboard o Formulario del Evaluador) ═════
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const acceso = await computarAccesoEVSST(usuario);
    if (!acceso) {
      return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');
    }

    const initialView = (req.baseUrl || '').toLowerCase().includes('/formevaluacionsst')
      ? 'formulario'
      : 'listado';

    const pathTemplate = initialView === 'formulario' ? HTML_FORM_PATH : HTML_INDEX_PATH;
    const html = fs.readFileSync(pathTemplate, 'utf8');

    const config = JSON.stringify({
      ...acceso,
      regionalesFiltro: Object.keys(acceso.opsPorRegional),
      initialView,
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[evaluacionsst] Error serving page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// ═════ VISTA DE RESPUESTA Y FIRMA DEL TRABAJADOR ═════
router.get('/responder', async (req, res) => {
  try {
    const { item } = req.query;
    if (!item) {
      return res.status(400).send('<h2>Error: Código de evaluación ?item requerido</h2>');
    }

    const [rows] = await pool.execute(
      'SELECT * FROM Maestro_evaluacionsst WHERE id_evaluacion = ?',
      [item]
    );

    if (!rows.length) {
      return res.status(404).send('<h2>Error: Evaluación no encontrada</h2>');
    }

    const ev = rows[0];
    if (ev.url_doc) {
      return res.status(400).send('<h2>Esta evaluación ya ha sido completada y guardada anteriormente.</h2>');
    }

    if (ev.token_expira && new Date(ev.token_expira) < new Date()) {
      return res.status(400).send('<h2>Este enlace de respuesta ha expirado (plazo de 48 horas superado).</h2>');
    }

    // Fetch worker details from Maestro_Vinculación
    const [vinRows] = await pool.execute(
      `SELECT Trabajador, \`Id Vinculación\`
       FROM \`Maestro_Vinculación\`
       WHERE Identificación = ?
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [ev.identificacion]
    );
    if (!vinRows.length) {
      return res.status(404).send('<h2>Error: Datos del trabajador no encontrados en vinculaciones.</h2>');
    }
    const vin = vinRows[0];

    // Fetch evaluator details
    const [uRows] = await pool.execute(
      'SELECT Nombre FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
      [ev.usuario]
    );
    const evaluadorNombre = uRows.length ? uRows[0].Nombre : ev.usuario;

    // Check if worker has recent signature in bucket
    const tieneFirmaGcs = await obtenerFirmaBase64Reciente(ev.identificacion).catch(() => null);

    const config = JSON.stringify({
      id_evaluacion: ev.id_evaluacion,
      fecha: ev.fecha,
      tipo: ev.tipo,
      identificacion: ev.identificacion,
      nombre_trabajador: vin.Trabajador,
      evaluadorNombre: evaluadorNombre,
      firmaBase64: tieneFirmaGcs
    }).replace(/<\/script>/gi, '<\\/script>');

    const html = fs.readFileSync(HTML_SIGN_PATH, 'utf8');
    res.send(html.replace('__CONFIG_RESPONDER__', config));
  } catch (err) {
    console.error('[evaluacionsst] Error serving responder page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// ═════ API: GET /api/trabajadores-por-operacion ═════
router.get('/api/trabajadores-por-operacion', async (req, res) => {
  try {
    const { regional, operacion } = req.query;
    if (!regional || !operacion) {
      return res.status(400).json({ error: 'regional y operacion requeridos' });
    }

    const [rows] = await pool.execute(
      `SELECT DISTINCT Trabajador, Identificación AS identificacion, Cargo 
       FROM \`Maestro_Vinculación\` 
       WHERE Regional = ? AND \`Operación\` = ? AND Estado = 'Activo'
       ORDER BY Trabajador`,
      [regional, operacion]
    );

    res.json(rows);
  } catch (err) {
    console.error('[evaluacionsst] GET /api/trabajadores-por-operacion:', err);
    res.status(500).json([]);
  }
});

// ═════ API: GET /api/contacto/:identificacion ═════
router.get('/api/contacto/:identificacion', async (req, res) => {
  try {
    const { identificacion } = req.params;
    const [rows] = await pool.execute(
      'SELECT Email, Celular FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1',
      [identificacion]
    );
    if (rows.length) {
      res.json(rows[0]);
    } else {
      res.json({ Email: null, Celular: null });
    }
  } catch (err) {
    console.error('[evaluacionsst] GET /api/contacto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/actualizar-contacto ═════
router.post('/api/actualizar-contacto', async (req, res) => {
  try {
    const { identificacion, email, celular } = req.body;
    if (!identificacion) {
      return res.status(400).json({ error: 'identificacion requerida' });
    }

    await pool.execute(
      `INSERT INTO Maestro_Segmentación (Identificación, Email, Celular)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE Email = VALUES(Email), Celular = VALUES(Celular)`,
      [identificacion, email || null, celular || null]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[evaluacionsst] POST /api/actualizar-contacto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/conteos-filtros ═════
router.get('/api/conteos-filtros', async (req, res) => {
  try {
    const { usuario, trabajador, fechaDesde, fechaHasta, regional, operacion, resultado } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoEVSST(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const baseConds = [];
    const baseParams = [];

    if (!acceso.sinFiltro) {
      if (acceso.operacionesFiltro.length > 0) {
        baseConds.push(`vin.Operación IN (${acceso.operacionesFiltro.map(() => '?').join(',')})`);
        acceso.operacionesFiltro.forEach(op => baseParams.push(op));
      } else {
        baseConds.push('1 = 0');
      }
    }

    const sharedConds = [];
    const sharedParams = [];

    if (trabajador) {
      sharedConds.push('(ev.identificacion LIKE ? OR vin.Trabajador LIKE ?)');
      sharedParams.push(`%${trabajador.toUpperCase()}%`, `%${trabajador.toUpperCase()}%`);
    }
    if (fechaDesde) {
      sharedConds.push('ev.fecha >= ?');
      sharedParams.push(fechaDesde);
    }
    if (fechaHasta) {
      sharedConds.push('ev.fecha <= ?');
      sharedParams.push(fechaHasta);
    }
    if (resultado) {
      if (resultado === 'PENDIENTE') {
        sharedConds.push('ev.url_doc IS NULL');
      } else if (resultado === 'APROBADO') {
        sharedConds.push('ev.url_doc IS NOT NULL AND ev.resultado = "APROBADO"');
      } else if (resultado === 'NO APROBADO') {
        sharedConds.push('ev.url_doc IS NOT NULL AND (ev.resultado IS NULL OR ev.resultado != "APROBADO")');
      }
    }

    // 1. Regionales (Excluye regional)
    const regConds = [...baseConds, ...sharedConds];
    const regParams = [...baseParams, ...sharedParams];
    if (operacion) {
      regConds.push('vin.Operación = ?');
      regParams.push(operacion);
    }
    const regWhere = regConds.length ? 'WHERE ' + regConds.join(' AND ') : '';

    const [regRows] = await pool.execute(
      `SELECT vin.Regional, COUNT(*) AS total
       FROM Maestro_evaluacionsst ev
       LEFT JOIN (
         SELECT t1.Identificación, t1.Regional, t1.\`Operación\`
         FROM Maestro_Vinculación t1
         INNER JOIN (
           SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS MaxFecha
           FROM Maestro_Vinculación
           GROUP BY Identificación
         ) t2 ON t1.Identificación = t2.Identificación AND t1.\`Fecha de Ingreso\` = t2.MaxFecha
       ) vin ON ev.identificacion = vin.Identificación
       ${regWhere}
       GROUP BY vin.Regional`,
      regParams
    );

    // 2. Operaciones (Excluye operacion)
    const opConds = [...baseConds, ...sharedConds];
    const opParams = [...baseParams, ...sharedParams];
    if (regional) {
      opConds.push('vin.Regional = ?');
      opParams.push(regional);
    }
    const opWhere = opConds.length ? 'WHERE ' + opConds.join(' AND ') : '';

    const [opRows] = await pool.execute(
      `SELECT vin.Operación AS operacion, COUNT(*) AS total
       FROM Maestro_evaluacionsst ev
       LEFT JOIN (
         SELECT t1.Identificación, t1.Regional, t1.\`Operación\`
         FROM Maestro_Vinculación t1
         INNER JOIN (
           SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS MaxFecha
           FROM Maestro_Vinculación
           GROUP BY Identificación
         ) t2 ON t1.Identificación = t2.Identificación AND t1.\`Fecha de Ingreso\` = t2.MaxFecha
       ) vin ON ev.identificacion = vin.Identificación
       ${opWhere}
       GROUP BY vin.Operación`,
      opParams
    );

    const regionales = {};
    regRows.forEach(r => {
      if (r.Regional) regionales[r.Regional] = r.total;
    });

    const operaciones = {};
    opRows.forEach(o => {
      if (o.operacion) operaciones[o.operacion] = o.total;
    });

    res.json({ regionales, operaciones });
  } catch (err) {
    console.error('[evaluacionsst] GET /api/conteos-filtros:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/evaluaciones ═════
router.get('/api/evaluaciones', async (req, res) => {
  try {
    const { usuario, trabajador, fechaDesde, fechaHasta, regional, operacion } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoEVSST(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const conds = [];
    const params = [];

    // Filter by user role permissions
    if (!acceso.sinFiltro) {
      if (acceso.operacionesFiltro.length > 0) {
        conds.push(`vin.Operación IN (${acceso.operacionesFiltro.map(() => '?').join(',')})`);
        acceso.operacionesFiltro.forEach(op => params.push(op));
      } else {
        conds.push('1 = 0'); // Block access if no operations allowed
      }
    }

    // Grid filters
    if (regional) {
      conds.push('vin.Regional = ?');
      params.push(regional);
    }
    if (operacion) {
      conds.push('vin.Operación = ?');
      params.push(operacion);
    }
    if (trabajador) {
      conds.push('(ev.identificacion LIKE ? OR vin.Trabajador LIKE ?)');
      params.push(`%${trabajador.toUpperCase()}%`, `%${trabajador.toUpperCase()}%`);
    }
    if (fechaDesde) {
      conds.push('ev.fecha >= ?');
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      conds.push('ev.fecha <= ?');
      params.push(fechaHasta);
    }

    const whereClause = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const query = `
      SELECT ev.*, vin.Trabajador AS nombre_trabajador, vin.Cargo, vin.\`Operación\` AS operacion, vin.Regional,
             seg.Email AS email_trabajador, seg.Celular AS celular_trabajador,
             usu.Nombre AS nombre_evaluador
      FROM Maestro_evaluacionsst ev
      LEFT JOIN (
        SELECT t1.Identificación, t1.Trabajador, t1.Cargo, t1.Regional, t1.\`Operación\`
        FROM Maestro_Vinculación t1
        INNER JOIN (
          SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS MaxFecha
          FROM Maestro_Vinculación
          GROUP BY Identificación
        ) t2 ON t1.Identificación = t2.Identificación AND t1.\`Fecha de Ingreso\` = t2.MaxFecha
      ) vin ON ev.identificacion = vin.Identificación
      LEFT JOIN Maestro_Segmentación seg ON ev.identificacion = seg.Identificación
      LEFT JOIN Maestro_Usuarios usu ON ev.usuario = usu.ID
      ${whereClause}
      ORDER BY ev.fecha_registro DESC
    `;

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[evaluacionsst] GET /api/evaluaciones:', err);
    res.status(500).json([]);
  }
});

// ═════ API: POST /api/crear ═════
router.post('/api/crear', async (req, res) => {
  try {
    const {
      fecha,
      identificacion,
      tipo,
      usuario,
      enviar_correo
    } = req.body;

    if (!fecha || !identificacion || !tipo || !usuario) {
      return res.status(400).json({ error: 'Todos los campos obligatorios deben ser diligenciados' });
    }

    const id_evaluacion = uuidv4();
    const tokenFirma = crypto.randomBytes(32).toString('hex');
    const tokenExpira = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    await pool.execute(
      `INSERT INTO Maestro_evaluacionsst 
       (id_evaluacion, fecha, identificacion, tipo, usuario,
        p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13,
        puntaje, resultado, firma_trabajador, url_doc, token_firma, token_expira)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      [
        id_evaluacion,
        fecha,
        identificacion,
        tipo,
        usuario,
        tokenFirma,
        tokenExpira
      ]
    );

    // Get contact info and URL
    const [segRows] = await pool.execute('SELECT Email FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1', [identificacion]);
    const [vinRows] = await pool.execute('SELECT Trabajador FROM Maestro_Vinculación WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1', [identificacion]);
    const [usuRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);

    const emailTrabajador = segRows.length ? segRows[0].Email : null;
    const trabajadorNombre = vinRows.length ? vinRows[0].Trabajador : identificacion;
    const emailUsuario = usuRows.length ? usuRows[0].Email : null;

    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('host');
    const urlFirma = `${protocol}://${host}/evaluacionsst/responder?item=${id_evaluacion}`;

    if (enviar_correo && emailTrabajador) {
      await notificarFirmaEvaluacionSST({
        email: emailTrabajador,
        nombreTrabajador: trabajadorNombre,
        tipo,
        urlFirma,
        emailUsuario
      }).catch(e => console.error('[evaluacionsst] Error sending email:', e.message));
    }

    res.json({ ok: true, id_evaluacion, urlFirma });
  } catch (err) {
    console.error('[evaluacionsst] POST /api/crear:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/responder/:id ═════
router.post('/api/responder/:id', async (req, res) => {
  try {
    const id_evaluacion = req.params.id;
    const { p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, firma } = req.body;

    if (!firma) {
      return res.status(400).json({ error: 'La firma es obligatoria' });
    }

    const [evRows] = await pool.execute(
      'SELECT * FROM Maestro_evaluacionsst WHERE id_evaluacion = ? LIMIT 1', [id_evaluacion]
    );
    if (!evRows.length) return res.status(404).json({ error: 'Evaluación no encontrada' });
    const ev = evRows[0];

    if (ev.url_doc) return res.status(400).json({ error: 'Esta evaluación ya fue respondida anteriormente' });

    // 1. Calculate Score
    const CORRECT_ANSWERS = {
      p1: 'Imagen 2',
      p2: 'c',
      p3: 'd',
      p4: 'a',
      p5: 'a',
      p6: 'a',
      p7: 'b',
      p8: 'a',
      // p9 is wildcard
      p10: 'a',
      p11: 'c',
      p12: 'b',
      p13: 'a'
    };

    let score = 0;
    if (p1 === CORRECT_ANSWERS.p1) score++;
    if (p2 === CORRECT_ANSWERS.p2) score++;
    if (p3 === CORRECT_ANSWERS.p3) score++;
    if (p4 === CORRECT_ANSWERS.p4) score++;
    if (p5 === CORRECT_ANSWERS.p5) score++;
    if (p6 === CORRECT_ANSWERS.p6) score++;
    if (p7 === CORRECT_ANSWERS.p7) score++;
    if (p8 === CORRECT_ANSWERS.p8) score++;
    
    // p9 is always correct (adds 1 point)
    score++;

    if (p10 === CORRECT_ANSWERS.p10) score++;
    if (p11 === CORRECT_ANSWERS.p11) score++;
    if (p12 === CORRECT_ANSWERS.p12) score++;
    if (p13 === CORRECT_ANSWERS.p13) score++;

    const resultado = score >= 10 ? 'APROBADO' : 'NO APROBADO';

    // 2. Save Signature to GCS
    const base64Data = firma.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    const urlFirmaGcs = await subirFirma(ev.identificacion, buffer);

    // Temp object for PDF rendering
    const tempEv = {
      ...ev,
      p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13,
      puntaje: score,
      resultado,
      firma_trabajador: urlFirmaGcs
    };

    // 3. Fetch details for PDF
    const [vinRows] = await pool.execute(
      `SELECT Trabajador, \`Id Vinculación\`, Regional, \`Operación\`, Estado, \`Fecha de Ingreso\`
       FROM \`Maestro_Vinculación\`
       WHERE Identificación = ?
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [ev.identificacion]
    );
    if (!vinRows.length) return res.status(404).json({ error: 'Vinculación no encontrada' });
    const vin = vinRows[0];

    const [uRows] = await pool.execute('SELECT Nombre FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [ev.usuario]);
    const evaluadorNombre = uRows.length ? uRows[0].Nombre : ev.usuario;

    // 4. Render and Upload PDF
    const pdfBuffer = await renderPDF(tempEv, vin, evaluadorNombre);
    const timestamp = formatTimestamp();
    const urlDoc = await subirPDFEvaluacionSST(ev.identificacion, timestamp, pdfBuffer);

    // 5. Update DB
    await pool.execute(
      `UPDATE Maestro_evaluacionsst SET
         p1 = ?, p2 = ?, p3 = ?, p4 = ?, p5 = ?, p6 = ?, p7 = ?, p8 = ?, p9 = ?, p10 = ?, p11 = ?, p12 = ?, p13 = ?,
         puntaje = ?, resultado = ?, firma_trabajador = ?, url_doc = ?, token_firma = NULL, token_expira = NULL
       WHERE id_evaluacion = ?`,
      [
        p1 || null, p2 || null, p3 || null, p4 || null, p5 || null, p6 || null, p7 || null, p8 || null,
        p9 ? (typeof p9 === 'string' ? p9 : JSON.stringify(p9)) : null,
        p10 || null, p11 || null, p12 || null, p13 || null,
        score, resultado, urlFirmaGcs, urlDoc, id_evaluacion
      ]
    );

    // 6. Register in docTrabajador
    await registrarDocumentoTrabajador(ev.identificacion, urlDoc, ev.usuario, 73, 'EVSST');

    // 7. Notify completion
    const [segRows] = await pool.execute('SELECT Email FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1', [ev.identificacion]);
    if (segRows.length && segRows[0].Email) {
      await notificarEvaluacionSSTCompletada({
        email: segRows[0].Email,
        nombreTrabajador: vin.Trabajador,
        tipo: ev.tipo,
        puntaje: score,
        resultado,
        urlDoc
      }).catch(e => console.error('[evaluacionsst] Error sending completed email:', e.message));
    }

    res.json({ ok: true, urlDoc, resultado, score });
  } catch (err) {
    console.error('[evaluacionsst] POST /api/responder:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/reenviar-firma ═════
router.post('/api/reenviar-firma', async (req, res) => {
  try {
    const { id_evaluacion, canal } = req.body;
    if (!id_evaluacion) return res.status(400).json({ error: 'id_evaluacion requerido' });

    const [rows] = await pool.execute('SELECT * FROM Maestro_evaluacionsst WHERE id_evaluacion = ? LIMIT 1', [id_evaluacion]);
    if (!rows.length) return res.status(404).json({ error: 'Evaluación no encontrada' });
    const ev = rows[0];

    if (ev.url_doc) return res.status(400).json({ error: 'Esta evaluación ya fue completada' });

    // Regenerate token and expiry to extend/refresh
    const tokenFirma = crypto.randomBytes(32).toString('hex');
    const tokenExpira = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await pool.execute(
      'UPDATE Maestro_evaluacionsst SET token_firma = ?, token_expira = ? WHERE id_evaluacion = ?',
      [tokenFirma, tokenExpira, id_evaluacion]
    );

    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('host');
    const urlFirma = `${protocol}://${host}/evaluacionsst/responder?item=${id_evaluacion}`;

    const [segRows] = await pool.execute('SELECT Email, Celular FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1', [ev.identificacion]);
    const [vinRows] = await pool.execute('SELECT Trabajador FROM Maestro_Vinculación WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1', [ev.identificacion]);

    const emailTrabajador = segRows.length ? segRows[0].Email : null;
    const trabajadorNombre = vinRows.length ? vinRows[0].Trabajador : ev.identificacion;

    if (canal === 'email' && emailTrabajador) {
      await notificarFirmaEvaluacionSST({
        email: emailTrabajador,
        nombreTrabajador: trabajadorNombre,
        tipo: ev.tipo,
        urlFirma
      });
    }

    res.json({ ok: true, urlFirma });
  } catch (err) {
    console.error('[evaluacionsst] POST /api/reenviar-firma:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: DELETE /api/evaluacion/:id ═════
router.delete('/api/evaluacion/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;

    if (!usuario) {
      return res.status(400).json({ error: 'Parámetro usuario requerido' });
    }

    const acceso = await computarAccesoEVSST(usuario);
    if (!acceso || !['AdmSst', 'LiderSst', 'Sistema'].includes(acceso.rol)) {
      return res.status(403).json({ error: 'No autorizado para eliminar registros de evaluación' });
    }

    await pool.execute('DELETE FROM Maestro_evaluacionsst WHERE id_evaluacion = ?', [id]);
    res.json({ ok: true, id_evaluacion: id });
  } catch (err) {
    console.error('[evaluacionsst] DELETE /api/evaluacion/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
