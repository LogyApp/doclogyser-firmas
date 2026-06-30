const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const pool    = require('../services/db');
const { subirFirma, obtenerFirmaBase64Reciente } = require('../services/storage');
const { notificarFirmaCapacitacionSST, notificarCapacitacionSSTCompletada } = require('../services/email');
const { renderPDF } = require('../services/capacitacionPdfGenerator');
const { subirPDFCapacitacionSST } = require('../services/storage');

const router = express.Router();

const HTML_INDEX_PATH = path.join(__dirname, '../views/capacitacionsst/index.html');
const HTML_FORM_PATH  = path.join(__dirname, '../views/formcapacitacionsst/form.html');
const HTML_SIGN_PATH  = path.join(__dirname, '../views/capacitacionsst/responder.html');
const HTML_ADMIN_PATH = path.join(__dirname, '../views/capacitacionsst/admin.html');

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

async function computarAccesoCAPSST(usuarioId) {
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

// ═════ SERVIR INTERFAZ ═════
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const acceso = await computarAccesoCAPSST(usuario);
    if (!acceso) {
      return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');
    }

    let initialView = 'listado';
    let pathTemplate = HTML_INDEX_PATH;

    const lowerBaseUrl = (req.baseUrl || '').toLowerCase();
    if (lowerBaseUrl.includes('/admin/capacitacionsst')) {
      if (!['LiderSst', 'Sistema'].includes(acceso.rol)) {
        return res.status(403).send('<h2>Error: Solo Líder SST o Sistema pueden acceder a este panel.</h2>');
      }
      initialView = 'admin';
      pathTemplate = HTML_ADMIN_PATH;
    } else if (lowerBaseUrl.includes('/formcapacitacionsst')) {
      initialView = 'formulario';
      pathTemplate = HTML_FORM_PATH;
    }

    const html = fs.readFileSync(pathTemplate, 'utf8');
    const config = JSON.stringify({
      ...acceso,
      regionalesFiltro: Object.keys(acceso.opsPorRegional),
      initialView,
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[capacitacionsst] Error serving page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// ═════ VISTA DE RESPUESTA DEL TRABAJADOR ═════
router.get('/responder', async (req, res) => {
  try {
    const { item } = req.query;
    if (!item) {
      return res.status(400).send('<h2>Error: Código de evaluación ?item requerido</h2>');
    }

    const [rows] = await pool.execute(
      'SELECT * FROM Maestro_capacitacionsst WHERE id_capacitacion = ?',
      [item]
    );

    if (!rows.length) {
      return res.status(404).send('<h2>Error: Evaluación de capacitación no encontrada</h2>');
    }

    const ev = rows[0];
    if (ev.url_doc) {
      return res.status(400).send('<h2>Esta capacitación ya ha sido completada y guardada anteriormente.</h2>');
    }

    if (ev.token_expira && new Date(ev.token_expira) < new Date()) {
      return res.status(400).send('<h2>Este enlace de respuesta ha expirado (plazo de 48 horas superado).</h2>');
    }

    // Obtener detalles del trabajador
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

    // Obtener evaluador
    const [uRows] = await pool.execute(
      'SELECT Nombre FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
      [ev.usuario]
    );
    const evaluadorNombre = uRows.length ? uRows[0].Nombre : ev.usuario;

    // Obtener las preguntas específicas asignadas a este registro
    const [items] = await pool.execute(
      'SELECT * FROM Maestro_capacitacionsst_items WHERE id_capacitacion = ? ORDER BY pregunta, id_capacitacion_item',
      [item]
    );

    // Agrupar preguntas para enviarlas estructuradas al frontend
    const preguntasMap = {};
    items.forEach(i => {
      if (!preguntasMap[i.pregunta]) {
        preguntasMap[i.pregunta] = {
          pregunta: i.pregunta,
          descripcion_pregunta: i.descripcion_pregunta,
          opciones: []
        };
      }
      preguntasMap[i.pregunta].opciones.push(i.opciones || i.opcion);
    });

    const preguntasList = Object.values(preguntasMap).sort((a, b) => a.pregunta - b.pregunta);

    const tieneFirmaGcs = await obtenerFirmaBase64Reciente(ev.identificacion).catch(() => null);

    const config = JSON.stringify({
      id_capacitacion: ev.id_capacitacion,
      fecha: ev.fecha,
      tema: ev.tema,
      objetivo: ev.objetivo,
      identificacion: ev.identificacion,
      nombre_trabajador: vin.Trabajador,
      evaluadorNombre: evaluadorNombre,
      preguntas: preguntasList,
      firmaBase64: tieneFirmaGcs
    }).replace(/<\/script>/gi, '<\\/script>');

    const html = fs.readFileSync(HTML_SIGN_PATH, 'utf8');
    res.send(html.replace('__CONFIG_RESPONDER__', config));
  } catch (err) {
    console.error('[capacitacionsst] Error serving responder page:', err);
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
    console.error('[capacitacionsst] GET /api/trabajadores-por-operacion:', err);
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
    console.error('[capacitacionsst] GET /api/contacto:', err);
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
    console.error('[capacitacionsst] POST /api/actualizar-contacto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/capacitaciones (Historial) ═════
router.get('/api/capacitaciones', async (req, res) => {
  try {
    const { usuario, trabajador, fechaDesde, fechaHasta, regional, operacion } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoCAPSST(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const conds = [];
    const params = [];

    if (!acceso.sinFiltro) {
      if (acceso.operacionesFiltro.length > 0) {
        conds.push(`vin.Operación IN (${acceso.operacionesFiltro.map(() => '?').join(',')})`);
        acceso.operacionesFiltro.forEach(op => params.push(op));
      } else {
        conds.push('1 = 0');
      }
    }

    if (regional) {
      conds.push('vin.Regional = ?');
      params.push(regional);
    }
    if (operacion) {
      conds.push('vin.Operación = ?');
      params.push(operacion);
    }
    if (trabajador) {
      conds.push('(c.identificacion LIKE ? OR vin.Trabajador LIKE ?)');
      params.push(`%${trabajador.toUpperCase()}%`, `%${trabajador.toUpperCase()}%`);
    }
    if (fechaDesde) {
      conds.push('c.fecha >= ?');
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      conds.push('c.fecha <= ?');
      params.push(fechaHasta);
    }

    const whereClause = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const query = `
      SELECT c.*, vin.Trabajador AS nombre_trabajador, vin.Cargo, vin.\`Operación\` AS operacion, vin.Regional,
             seg.Email AS email_trabajador, seg.Celular AS celular_trabajador,
             usu.Nombre AS nombre_evaluador
      FROM Maestro_capacitacionsst c
      LEFT JOIN (
        SELECT t1.Identificación, t1.Trabajador, t1.Cargo, t1.Regional, t1.\`Operación\`
        FROM Maestro_Vinculación t1
        INNER JOIN (
          SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS MaxFecha
          FROM Maestro_Vinculación
          GROUP BY Identificación
        ) t2 ON t1.Identificación = t2.Identificación AND t1.\`Fecha de Ingreso\` = t2.MaxFecha
      ) vin ON c.identificacion = vin.Identificación
      LEFT JOIN Maestro_Segmentación seg ON c.identificacion = seg.Identificación
      LEFT JOIN Maestro_Usuarios usu ON c.usuario = usu.ID
      ${whereClause}
      ORDER BY c.fecha_registro DESC
    `;

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[capacitacionsst] GET /api/capacitaciones:', err);
    res.status(500).json([]);
  }
});

// ═════ API: GET /api/capacitacion/:id (Detalle de un registro) ═════
router.get('/api/capacitacion/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [cRows] = await pool.execute(
      `SELECT c.*, usu.Nombre AS nombre_evaluador
       FROM Maestro_capacitacionsst c
       LEFT JOIN Maestro_Usuarios usu ON c.usuario = usu.ID
       WHERE c.id_capacitacion = ?`,
      [id]
    );

    if (!cRows.length) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    const c = cRows[0];

    const [items] = await pool.execute(
      'SELECT * FROM Maestro_capacitacionsst_items WHERE id_capacitacion = ? ORDER BY pregunta, id_capacitacion_item',
      [id]
    );

    res.json({
      ...c,
      items
    });
  } catch (err) {
    console.error('[capacitacionsst] GET /api/capacitacion/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/crear (Crear capacitación para un trabajador) ═════
router.post('/api/crear', async (req, res) => {
  try {
    const { fecha, identificacion, usuario, enviar_correo } = req.body;
    if (!fecha || !identificacion || !usuario) {
      return res.status(400).json({ error: 'fecha, identificacion y usuario requeridos' });
    }

    // 1. Obtener la plantilla activa
    const [pRows] = await pool.execute(
      'SELECT * FROM Maestro_capacitacionsst_plantilla WHERE activo = 1 LIMIT 1'
    );
    if (!pRows.length) {
      return res.status(400).json({ error: 'No hay ninguna plantilla de capacitación activa. Por favor cree una en el panel de administrador.' });
    }
    const p = pRows[0];

    // 2. Obtener los ítems de la plantilla activa
    const [pItems] = await pool.execute(
      'SELECT * FROM Maestro_capacitacionsst_plantilla_items WHERE id_plantilla = ? ORDER BY pregunta, id_item',
      [p.id_plantilla]
    );
    if (!pItems.length) {
      return res.status(400).json({ error: 'La plantilla activa no contiene preguntas.' });
    }

    const id_capacitacion = uuidv4();
    const tokenFirma = crypto.randomBytes(32).toString('hex');
    const tokenExpira = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

    // 3. Insertar el registro principal en Maestro_capacitacionsst
    await pool.execute(
      `INSERT INTO Maestro_capacitacionsst 
       (id_capacitacion, fecha, identificacion, usuario, tema, objetivo,
        firma_trabajador, url_doc, token_firma, token_expira, puntaje, resultado)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL)`,
      [
        id_capacitacion,
        fecha,
        identificacion,
        usuario,
        p.tema,
        p.objetivo,
        tokenFirma,
        tokenExpira
      ]
    );

    // 4. Copiar los ítems activos al registro de esta capacitación (para congelar esta versión)
    for (const item of pItems) {
      await pool.execute(
        `INSERT INTO Maestro_capacitacionsst_items (id_capacitacion, pregunta, descripcion_pregunta, opciones, Correcta, seleccionada)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        [id_capacitacion, item.pregunta, item.descripcion_pregunta, item.opcion, item.correcta]
      );
    }

    // 5. Enviar correo de notificación al trabajador
    const [segRows] = await pool.execute('SELECT Email FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1', [identificacion]);
    const [vinRows] = await pool.execute('SELECT Trabajador FROM Maestro_Vinculación WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1', [identificacion]);
    const [usuRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);

    const emailTrabajador = segRows.length ? segRows[0].Email : null;
    const trabajadorNombre = vinRows.length ? vinRows[0].Trabajador : identificacion;
    const emailUsuario = usuRows.length ? usuRows[0].Email : null;

    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('host');
    const urlFirma = `${protocol}://${host}/capacitacionsst/responder?item=${id_capacitacion}`;

    if (enviar_correo && emailTrabajador) {
      await notificarFirmaCapacitacionSST({
        email: emailTrabajador,
        nombreTrabajador: trabajadorNombre,
        tema: p.tema,
        urlFirma,
        emailUsuario
      }).catch(e => console.error('[capacitacionsst] Error enviando correo:', e.message));
    }

    res.json({ ok: true, id_capacitacion, urlFirma });
  } catch (err) {
    console.error('[capacitacionsst] POST /api/crear:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/responder/:id (Recibir respuestas y firma del trabajador) ═════
router.post('/api/responder/:id', async (req, res) => {
  try {
    const id_capacitacion = req.params.id;
    const { respuestas, firma } = req.body; // respuestas: { "1": "Mejorar la apariencia...", "2": "..." }

    if (!respuestas || !firma) {
      return res.status(400).json({ error: 'Las respuestas y la firma son obligatorias.' });
    }

    const [evRows] = await pool.execute(
      'SELECT * FROM Maestro_capacitacionsst WHERE id_capacitacion = ? LIMIT 1', [id_capacitacion]
    );
    if (!evRows.length) return res.status(404).json({ error: 'Evaluación de capacitación no encontrada.' });
    const ev = evRows[0];

    if (ev.url_doc) return res.status(400).json({ error: 'Esta evaluación ya fue respondida anteriormente.' });

    // 1. Obtener los ítems para esta capacitación
    const [items] = await pool.execute(
      'SELECT * FROM Maestro_capacitacionsst_items WHERE id_capacitacion = ?',
      [id_capacitacion]
    );

    // Calcular el puntaje obtenido y marcar las opciones seleccionadas
    const totalPreguntas = new Set(items.map(i => i.pregunta)).size;
    let score = 0;

    for (const qNum in respuestas) {
      const selectedOptionText = respuestas[qNum];
      
      // Actualizar la opción seleccionada en la base de datos
      await pool.execute(
        `UPDATE Maestro_capacitacionsst_items 
         SET seleccionada = 'SI' 
         WHERE id_capacitacion = ? AND pregunta = ? AND opciones = ?`,
        [id_capacitacion, parseInt(qNum), selectedOptionText]
      );

      // Comprobar si la opción seleccionada es la correcta
      const isCorrect = items.some(item => 
        item.pregunta === parseInt(qNum) && 
        item.opciones === selectedOptionText && 
        item.Correcta === 'SI'
      );
      if (isCorrect) score++;
    }

    // 2. Determinar el resultado: Aprobación con el 70% en promedio (usamos Math.round(total * 0.65))
    const puntajeAprobacion = Math.round(totalPreguntas * 0.65);
    const resultado = score >= puntajeAprobacion ? 'APROBADO' : 'NO APROBADO';

    // 3. Subir la firma del trabajador a GCS
    const base64Data = firma.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    const urlFirmaGcs = await subirFirma(ev.identificacion, buffer);

    // 4. Obtener ítems actualizados (con seleccionada = 'SI') para renderizar el PDF
    const [updatedItems] = await pool.execute(
      'SELECT * FROM Maestro_capacitacionsst_items WHERE id_capacitacion = ? ORDER BY pregunta, id_capacitacion_item',
      [id_capacitacion]
    );

    const tempEv = {
      ...ev,
      puntaje: score,
      resultado,
      firma_trabajador: urlFirmaGcs
    };

    // 5. Obtener vinculación para el PDF
    const [vinRows] = await pool.execute(
      `SELECT Trabajador, \`Id Vinculación\`, Regional, \`Operación\`, Estado, \`Fecha de Ingreso\`
       FROM \`Maestro_Vinculación\`
       WHERE Identificación = ?
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [ev.identificacion]
    );
    if (!vinRows.length) return res.status(404).json({ error: 'Vinculación del trabajador no encontrada.' });
    const vin = vinRows[0];

    const [uRows] = await pool.execute('SELECT Nombre FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [ev.usuario]);
    const evaluadorNombre = uRows.length ? uRows[0].Nombre : ev.usuario;

    // 6. Generar PDF y subirlo a GCS
    const pdfBuffer = await renderPDF(tempEv, vin, evaluadorNombre, updatedItems);
    const timestamp = formatTimestamp();
    const urlDoc = await subirPDFCapacitacionSST(ev.identificacion, timestamp, pdfBuffer);

    // 7. Actualizar registro principal en la base de datos
    await pool.execute(
      `UPDATE Maestro_capacitacionsst SET
         puntaje = ?, resultado = ?, firma_trabajador = ?, url_doc = ?, token_firma = NULL, token_expira = NULL
       WHERE id_capacitacion = ?`,
      [score, resultado, urlFirmaGcs, urlDoc, id_capacitacion]
    );

    // 8. Registrar documento en Maestro_docTrabajador (Tipo 74, Prefijo CAPSST)
    await registrarDocumentoTrabajador(ev.identificacion, urlDoc, ev.usuario, 74, 'CAPSST');

    // 9. Enviar correo de notificación de completado
    const [segRows] = await pool.execute('SELECT Email FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1', [ev.identificacion]);
    if (segRows.length && segRows[0].Email) {
      await notificarCapacitacionSSTCompletada({
        email: segRows[0].Email,
        nombreTrabajador: vin.Trabajador,
        tema: ev.tema,
        puntaje: score,
        totalPreguntas,
        resultado,
        urlDoc
      }).catch(e => console.error('[capacitacionsst] Error enviando correo de completado:', e.message));
    }

    res.json({ ok: true, urlDoc, resultado, score });
  } catch (err) {
    console.error('[capacitacionsst] POST /api/responder:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/reenviar-firma ═════
router.post('/api/reenviar-firma', async (req, res) => {
  try {
    const { id_capacitacion, canal } = req.body;
    if (!id_capacitacion) return res.status(400).json({ error: 'id_capacitacion requerido' });

    const [rows] = await pool.execute('SELECT * FROM Maestro_capacitacionsst WHERE id_capacitacion = ? LIMIT 1', [id_capacitacion]);
    if (!rows.length) return res.status(404).json({ error: 'Capacitación no encontrada' });
    const ev = rows[0];

    if (ev.url_doc) return res.status(400).json({ error: 'Esta evaluación ya fue completada' });

    const tokenFirma = crypto.randomBytes(32).toString('hex');
    const tokenExpira = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await pool.execute(
      'UPDATE Maestro_capacitacionsst SET token_firma = ?, token_expira = ? WHERE id_capacitacion = ?',
      [tokenFirma, tokenExpira, id_capacitacion]
    );

    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('host');
    const urlFirma = `${protocol}://${host}/capacitacionsst/responder?item=${id_capacitacion}`;

    const [segRows] = await pool.execute('SELECT Email FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1', [ev.identificacion]);
    const [vinRows] = await pool.execute('SELECT Trabajador FROM Maestro_Vinculación WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1', [ev.identificacion]);

    const emailTrabajador = segRows.length ? segRows[0].Email : null;
    const trabajadorNombre = vinRows.length ? vinRows[0].Trabajador : ev.identificacion;

    if (canal === 'email' && emailTrabajador) {
      await notificarFirmaCapacitacionSST({
        email: emailTrabajador,
        nombreTrabajador: trabajadorNombre,
        tema: ev.tema,
        urlFirma
      });
    }

    res.json({ ok: true, urlFirma });
  } catch (err) {
    console.error('[capacitacionsst] POST /api/reenviar-firma:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: DELETE /api/capacitacion/:id ═════
router.delete('/api/capacitacion/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;

    if (!usuario) {
      return res.status(400).json({ error: 'Parámetro usuario requerido' });
    }

    const acceso = await computarAccesoCAPSST(usuario);
    if (!acceso || !['AdmSst', 'LiderSst', 'Sistema'].includes(acceso.rol)) {
      return res.status(403).json({ error: 'No autorizado para eliminar registros de capacitación.' });
    }

    await pool.execute('DELETE FROM Maestro_capacitacionsst WHERE id_capacitacion = ?', [id]);
    res.json({ ok: true, id_capacitacion: id });
  } catch (err) {
    console.error('[capacitacionsst] DELETE /api/capacitacion/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API PLANTILLAS (ADMINISTRADOR) ═════

// GET /api/plantilla (Obtener la plantilla activa o una específica por ID)
router.get('/api/plantilla', async (req, res) => {
  try {
    const { id_plantilla } = req.query;
    let p;

    if (id_plantilla) {
      const [rows] = await pool.execute('SELECT * FROM Maestro_capacitacionsst_plantilla WHERE id_plantilla = ?', [id_plantilla]);
      if (!rows.length) return res.status(404).json({ error: 'Plantilla no encontrada.' });
      p = rows[0];
    } else {
      const [rows] = await pool.execute('SELECT * FROM Maestro_capacitacionsst_plantilla WHERE activo = 1 LIMIT 1');
      if (!rows.length) {
        return res.json({ id_plantilla: null, tema: '', objetivo: '', activo: 0, items: [] });
      }
      p = rows[0];
    }

    const [items] = await pool.execute(
      'SELECT * FROM Maestro_capacitacionsst_plantilla_items WHERE id_plantilla = ? ORDER BY pregunta, id_item',
      [p.id_plantilla]
    );

    res.json({
      ...p,
      items
    });
  } catch (err) {
    console.error('[capacitacionsst] GET /api/plantilla:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/plantilla/historial (Obtener todas las versiones de plantilla creadas)
router.get('/api/plantilla/historial', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id_plantilla, version, tema, activo, fecha_registro, usuario_creador FROM Maestro_capacitacionsst_plantilla ORDER BY version DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('[capacitacionsst] GET /api/plantilla/historial:', err);
    res.status(500).json([]);
  }
});

// POST /api/plantilla/activar (Activar una versión de plantilla específica)
router.post('/api/plantilla/activar', async (req, res) => {
  try {
    const { id_plantilla, usuario } = req.body;
    if (!id_plantilla || !usuario) {
      return res.status(400).json({ error: 'id_plantilla y usuario requeridos' });
    }

    const acceso = await computarAccesoCAPSST(usuario);
    if (!acceso || !['LiderSst', 'Sistema'].includes(acceso.rol)) {
      return res.status(403).json({ error: 'No autorizado para cambiar la plantilla activa.' });
    }

    // Desactivar todas
    await pool.execute('UPDATE Maestro_capacitacionsst_plantilla SET activo = 0');
    // Activar la seleccionada
    await pool.execute('UPDATE Maestro_capacitacionsst_plantilla SET activo = 1 WHERE id_plantilla = ?', [id_plantilla]);

    res.json({ ok: true });
  } catch (err) {
    console.error('[capacitacionsst] POST /api/plantilla/activar:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/plantilla/guardar (Crear una nueva versión de plantilla con sus preguntas)
router.post('/api/plantilla/guardar', async (req, res) => {
  try {
    const { tema, objetivo, preguntas, usuario } = req.body;
    if (!tema || !objetivo || !preguntas || !usuario) {
      return res.status(400).json({ error: 'tema, objetivo, preguntas y usuario requeridos' });
    }

    const acceso = await computarAccesoCAPSST(usuario);
    if (!acceso || !['LiderSst', 'Sistema'].includes(acceso.rol)) {
      return res.status(403).json({ error: 'No autorizado para guardar cambios en la plantilla.' });
    }

    // 1. Calcular el siguiente número de versión
    const [[vRow]] = await pool.execute('SELECT MAX(version) AS max_v FROM Maestro_capacitacionsst_plantilla');
    const nextVersion = (vRow ? vRow.max_v : 0) + 1;

    const id_plantilla = uuidv4();

    // 2. Desactivar todas y crear la nueva como activa (activo = 1)
    await pool.execute('UPDATE Maestro_capacitacionsst_plantilla SET activo = 0');
    await pool.execute(
      `INSERT INTO Maestro_capacitacionsst_plantilla (id_plantilla, version, tema, objetivo, activo, usuario_creador)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [id_plantilla, nextVersion, tema, objetivo, usuario]
    );

    // 3. Insertar las nuevas preguntas/opciones
    // preguntas: [ { pregunta: 1, descripcion_pregunta: "...", opciones: [ { opcion: "...", correcta: "SI"/null }, ... ] }, ... ]
    for (const q of preguntas) {
      const qNum = q.pregunta;
      const desc = q.descripcion_pregunta;

      for (const opt of q.opciones) {
        await pool.execute(
          `INSERT INTO Maestro_capacitacionsst_plantilla_items (id_plantilla, pregunta, descripcion_pregunta, opcion, correcta)
           VALUES (?, ?, ?, ?, ?)`,
          [id_plantilla, qNum, desc, opt.opcion, opt.correcta || null]
        );
      }
    }

    res.json({ ok: true, id_plantilla, version: nextVersion });
  } catch (err) {
    console.error('[capacitacionsst] POST /api/plantilla/guardar:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
