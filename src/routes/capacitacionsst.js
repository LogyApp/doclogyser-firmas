const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const pool    = require('../services/db');
const { subirFirma, obtenerFirmaBase64Reciente } = require('../services/storage');
const { notificarFirmaCapacitacionSST, notificarCapacitacionSSTCompletada } = require('../services/email');
const {
  crearNotificacionCapacitacionSST,
  obtenerNotificacionesUsuario,
  marcarNotificacionesLeidas,
  marcarTodasLeidas
} = require('../services/notificacionesService');
const { renderPDF } = require('../services/capacitacionPdfGenerator');
const { subirPDFCapacitacionSST } = require('../services/storage');
const { computarAccesoSst } = require('../services/accesoSst');
const { rolPuedeSst, permisosSstDelRol } = require('../services/configSst');

const router = express.Router();

const HTML_INDEX_PATH = path.join(__dirname, '../views/capacitacionsst/index.html');
const HTML_FORM_PATH  = path.join(__dirname, '../views/formcapacitacionsst/form.html');
const HTML_SIGN_PATH  = path.join(__dirname, '../views/capacitacionsst/responder.html');
const HTML_ADMIN_PATH = path.join(__dirname, '../views/capacitacionsst/admin.html');

const SECCION_MENU_SST = 'Capacitación SST';

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

// Acceso gobernado por Maestro_Menu (sst, Sección "Capacitación SST"), igual
// que Nómina/Facturación/Cloud Docs vía su propio Maestro_Menu_<Módulo>.
// La escritura (crear/responder/eliminar/reenviar firma/plantillas) queda
// limitada aparte a los roles de Config_Parametros (sst / pestaña) donde corresponda — ver configSst.js.
async function computarAccesoCAPSST(usuarioId) {
  return computarAccesoSst(usuarioId, SECCION_MENU_SST);
}

function hoyBogotaStr() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function regenerarPdfCapacitacion(capActualizado, oldUrlDoc) {
  const [items] = await pool.execute(
    'SELECT * FROM Maestro_capacitacionsst_items WHERE id_capacitacion = ? ORDER BY pregunta, id_capacitacion_item',
    [capActualizado.id_capacitacion]
  );

  const [vinRows] = await pool.execute(
    `SELECT Trabajador, \`Id Vinculación\`, Regional, \`Operación\`, Estado, Cargo, \`Fecha de Ingreso\`
     FROM \`Maestro_Vinculación\`
     WHERE Identificación = ?
     ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
    [capActualizado.identificacion]
  );
  const vin = vinRows.length ? vinRows[0] : { Trabajador: capActualizado.identificacion };

  const [uRows] = await pool.execute(
    'SELECT Nombre FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
    [capActualizado.usuario]
  );
  const evaluadorNombre = uRows.length ? uRows[0].Nombre : capActualizado.usuario;

  const pdfBuffer = await renderPDF(capActualizado, vin, evaluadorNombre, items);
  const timestamp = formatTimestamp();
  const nuevoUrlDoc = await subirPDFCapacitacionSST(capActualizado.identificacion, timestamp, pdfBuffer);

  await pool.execute(
    'UPDATE Maestro_capacitacionsst SET url_doc = ? WHERE id_capacitacion = ?',
    [nuevoUrlDoc, capActualizado.id_capacitacion]
  );

  if (oldUrlDoc) {
    const [updRes] = await pool.execute(
      "UPDATE Maestro_docTrabajador SET Doc = ? WHERE Identificación = ? AND Prefijo = 'CAPSST' AND Doc = ?",
      [nuevoUrlDoc, capActualizado.identificacion, oldUrlDoc]
    );
    if (!updRes.affectedRows) {
      await registrarDocumentoTrabajador(capActualizado.identificacion, nuevoUrlDoc, capActualizado.usuario, 74, 'CAPSST');
    }
  } else {
    await registrarDocumentoTrabajador(capActualizado.identificacion, nuevoUrlDoc, capActualizado.usuario, 74, 'CAPSST');
  }

  return nuevoUrlDoc;
}

// ═════ REDIRECCIÓN A SST HUB O PANELES ESPECÍFICOS ═════
router.get('/', async (req, res) => {
  try {
    const lowerBaseUrl = (req.baseUrl || '').toLowerCase();
    const isSpecial = lowerBaseUrl.includes('/admin/capacitacionsst') || lowerBaseUrl.includes('/formcapacitacionsst');
    if (!isSpecial) {
      const q = new URLSearchParams(req.query);
      if (!q.has('tab')) q.set('tab', 'capacitacion');
      return res.redirect(302, `/sst?${q.toString()}`);
    }

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

    if (lowerBaseUrl.includes('/admin/capacitacionsst')) {
      if (!(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, 'plantillas'))) {
        return res.status(403).send('<h2>Error: Tu rol no tiene permiso para gestionar las plantillas de capacitación.</h2>');
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
      permisosSst: await permisosSstDelRol(acceso.rol), // Config_Parametros (sst)
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

// ═════ API: GET /api/conteos-filtros ═════
router.get('/api/conteos-filtros', async (req, res) => {
  try {
    const { usuario, trabajador, fechaDesde, fechaHasta, regional, operacion, resultado } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoCAPSST(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no authorized' });
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
      sharedConds.push('(c.identificacion LIKE ? OR vin.Trabajador LIKE ?)');
      sharedParams.push(`%${trabajador.toUpperCase()}%`, `%${trabajador.toUpperCase()}%`);
    }
    if (fechaDesde) {
      sharedConds.push('c.fecha >= ?');
      sharedParams.push(fechaDesde);
    }
    if (fechaHasta) {
      sharedConds.push('c.fecha <= ?');
      sharedParams.push(fechaHasta);
    }
    if (resultado) {
      if (resultado === 'PENDIENTE') {
        sharedConds.push('c.url_doc IS NULL');
      } else if (resultado === 'APROBADO') {
        sharedConds.push('c.url_doc IS NOT NULL AND c.resultado = "APROBADO"');
      } else if (resultado === 'NO APROBADO') {
        sharedConds.push('c.url_doc IS NOT NULL AND (c.resultado IS NULL OR c.resultado != "APROBADO")');
      }
    }

    // Consulta consolidada para Regionales y Operaciones
    const combConds = [...baseConds, ...sharedConds];
    const combParams = [...baseParams, ...sharedParams];
    const combWhere = combConds.length ? 'WHERE ' + combConds.join(' AND ') : '';

    const [combRows] = await pool.execute(
      `SELECT vin.Regional, vin.\`Operación\` AS operacion, COUNT(*) AS total
       FROM Maestro_capacitacionsst c
       LEFT JOIN (
         SELECT t1.Identificación, t1.Regional, t1.\`Operación\`, t1.Trabajador
         FROM Maestro_Vinculación t1
         INNER JOIN (
           SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS MaxFecha
           FROM Maestro_Vinculación
           GROUP BY Identificación
         ) t2 ON t1.Identificación = t2.Identificación AND t1.\`Fecha de Ingreso\` = t2.MaxFecha
       ) vin ON c.identificacion = vin.Identificación
       ${combWhere}
       GROUP BY vin.Regional, vin.\`Operación\``,
      combParams
    );

    const regionales = {};
    const operaciones = {};

    combRows.forEach(r => {
      if (!operacion || r.operacion === operacion) {
        if (r.Regional) {
          regionales[r.Regional] = (regionales[r.Regional] || 0) + r.total;
        }
      }
      if (!regional || r.Regional === regional) {
        if (r.operacion) {
          operaciones[r.operacion] = (operaciones[r.operacion] || 0) + r.total;
        }
      }
    });

    res.json({ regionales, operaciones });
  } catch (err) {
    console.error('[capacitacionsst] GET /api/conteos-filtros:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/capacitaciones (Historial) ═════
// Tope del listado (por encima del mes con más registros, ~3.100): la pestaña abre con el mes
// actual y para encontrar más se usan los filtros
// (como en Facturación). Evita mandar las 10 mil capacitaciones de una vez.
const LIMITE_LISTADO_CAPACITACIONES = 5000;

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
      SELECT c.id_capacitacion, c.fecha, c.identificacion, c.usuario, c.tema, c.url_doc, 
             c.token_firma, c.token_expira, c.puntaje, c.resultado, c.fecha_registro,
             vin.Trabajador AS nombre_trabajador, vin.Cargo, vin.\`Operación\` AS operacion, vin.Regional,
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
      LIMIT ${LIMITE_LISTADO_CAPACITACIONES}
    `;

    const [rows] = await pool.execute(query, params);

    // Preguntas por capacitación: solo de las filas que se devuelven (antes se contaban las
    // 200 mil respuestas en cada carga)
    const totales = new Map();
    if (rows.length) {
      const ids = rows.map(r => r.id_capacitacion);
      const [cnt] = await pool.query(
        `SELECT id_capacitacion, COUNT(DISTINCT pregunta) AS total
         FROM Maestro_capacitacionsst_items WHERE id_capacitacion IN (?) GROUP BY id_capacitacion`,
        [ids]
      );
      cnt.forEach(c => totales.set(c.id_capacitacion, Number(c.total) || 0));
    }

    const cleanedRows = rows.map(r => {
      r.total_preguntas = totales.get(r.id_capacitacion) || 0;
      if (r.nombre_trabajador && r.nombre_trabajador.includes('**')) {
        r.nombre_trabajador = r.nombre_trabajador.split('**').pop().trim();
      }
      return r;
    });
    res.json(cleanedRows);
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
      `SELECT c.*, usu.Nombre AS nombre_evaluador, vin.Trabajador AS nombre_trabajador
       FROM Maestro_capacitacionsst c
       LEFT JOIN Maestro_Usuarios usu ON c.usuario = usu.ID
       LEFT JOIN (
         SELECT t1.Identificación, t1.Trabajador
         FROM Maestro_Vinculación t1
         INNER JOIN (
           SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS MaxFecha
           FROM Maestro_Vinculación
           GROUP BY Identificación
         ) t2 ON t1.Identificación = t2.Identificación AND t1.\`Fecha de Ingreso\` = t2.MaxFecha
       ) vin ON c.identificacion = vin.Identificación
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
    const { fecha, identificacion, usuario, enviar_correo, id_plantilla } = req.body;
    if (!fecha || !identificacion || !usuario) {
      return res.status(400).json({ error: 'fecha, identificacion y usuario requeridos' });
    }
    if (String(fecha).slice(0, 10) > hoyBogotaStr()) {
      return res.status(400).json({ error: 'La fecha de la capacitación no puede ser superior a hoy.' });
    }

    const accesoCrear = await computarAccesoSst(usuario, SECCION_MENU_SST);
    if (!accesoCrear || !(await rolPuedeSst(accesoCrear.rol, SECCION_MENU_SST, 'crear'))) {
      return res.status(403).json({ error: 'No autorizado para crear capacitaciones.' });
    }

    // 1. Obtener la plantilla activa o específica
    let p;
    if (id_plantilla) {
      const [pRows] = await pool.execute(
        'SELECT * FROM Maestro_capacitacionsst_plantilla WHERE id_plantilla = ? LIMIT 1',
        [id_plantilla]
      );
      if (!pRows.length) {
        return res.status(400).json({ error: 'La versión de plantilla seleccionada no existe.' });
      }
      p = pRows[0];
    } else {
      const [pRows] = await pool.execute(
        'SELECT * FROM Maestro_capacitacionsst_plantilla WHERE activo = 1 LIMIT 1'
      );
      if (!pRows.length) {
        return res.status(400).json({ error: 'No hay ninguna plantilla de capacitación activa. Por favor cree una en el panel de administrador.' });
      }
      p = pRows[0];
    }

    // 2. Obtener los ítems de la plantilla activa o específica
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
      notificarFirmaCapacitacionSST({
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

// ═════ API: POST /api/crear-masivo (Crear capacitaciones en lote) ═════
router.post('/api/crear-masivo', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { fecha, identificaciones, usuario, enviar_correo, id_plantilla } = req.body;
    if (!fecha || !identificaciones || !Array.isArray(identificaciones) || !identificaciones.length || !usuario) {
      return res.status(400).json({ error: 'fecha, identificaciones (array) y usuario requeridos' });
    }
    if (String(fecha).slice(0, 10) > hoyBogotaStr()) {
      return res.status(400).json({ error: 'La fecha de la capacitación no puede ser superior a hoy.' });
    }

    const accesoCrearMasivo = await computarAccesoSst(usuario, SECCION_MENU_SST);
    if (!accesoCrearMasivo || !(await rolPuedeSst(accesoCrearMasivo.rol, SECCION_MENU_SST, 'crear'))) {
      return res.status(403).json({ error: 'No autorizado para crear capacitaciones.' });
    }

    // 1. Obtener la plantilla activa o específica
    let p;
    if (id_plantilla) {
      const [pRows] = await conn.execute(
        'SELECT * FROM Maestro_capacitacionsst_plantilla WHERE id_plantilla = ? LIMIT 1',
        [id_plantilla]
      );
      if (!pRows.length) {
        return res.status(400).json({ error: 'La versión de plantilla seleccionada no existe.' });
      }
      p = pRows[0];
    } else {
      const [pRows] = await conn.execute(
        'SELECT * FROM Maestro_capacitacionsst_plantilla WHERE activo = 1 LIMIT 1'
      );
      if (!pRows.length) {
        return res.status(400).json({ error: 'No hay ninguna plantilla de capacitación activa. Por favor cree una en el panel de administrador.' });
      }
      p = pRows[0];
    }

    // 2. Obtener los ítems de la plantilla activa o específica
    const [pItems] = await conn.execute(
      'SELECT * FROM Maestro_capacitacionsst_plantilla_items WHERE id_plantilla = ? ORDER BY pregunta, id_item',
      [p.id_plantilla]
    );
    if (!pItems.length) {
      return res.status(400).json({ error: 'La plantilla seleccionada no contiene preguntas.' });
    }

    const [usuRows] = await conn.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    const emailUsuario = usuRows.length ? usuRows[0].Email : null;

    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('host');

    await conn.beginTransaction();

    const resultados = [];

    for (const identificacion of identificaciones) {
      const [segRows] = await conn.execute(
        'SELECT Celular, Email FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1',
        [identificacion]
      );
      const [vinRows] = await conn.execute(
        'SELECT Trabajador FROM Maestro_Vinculación WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
        [identificacion]
      );

      const celular = segRows.length ? segRows[0].Celular : null;
      const emailTrabajador = segRows.length ? segRows[0].Email : null;
      const trabajadorNombre = vinRows.length ? vinRows[0].Trabajador : identificacion;

      const id_capacitacion = uuidv4();
      const tokenFirma = crypto.randomBytes(32).toString('hex');
      const tokenExpira = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

      // Insert main row
      await conn.execute(
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

      // Copy items
      for (const item of pItems) {
        await conn.execute(
          `INSERT INTO Maestro_capacitacionsst_items (id_capacitacion, pregunta, descripcion_pregunta, opciones, Correcta, seleccionada)
           VALUES (?, ?, ?, ?, ?, NULL)`,
          [id_capacitacion, item.pregunta, item.descripcion_pregunta, item.opcion, item.correcta]
        );
      }

      const urlFirma = `${protocol}://${host}/capacitacionsst/responder?item=${id_capacitacion}`;

      resultados.push({
        identificacion,
        trabajador: trabajadorNombre,
        celular,
        email: emailTrabajador,
        urlFirma
      });

      // Send email asynchronously after transaction commits
      if (enviar_correo && emailTrabajador) {
        notificarFirmaCapacitacionSST({
          email: emailTrabajador,
          nombreTrabajador: trabajadorNombre,
          tema: p.tema,
          urlFirma,
          emailUsuario
        }).catch(e => console.error('[capacitacionsst] Error enviando correo masivo:', e.message));
      }
    }

    await conn.commit();
    res.json({ ok: true, resultados });
  } catch (err) {
    await conn.rollback();
    console.error('[capacitacionsst] POST /api/crear-masivo:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
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

    const [uRows] = await pool.execute('SELECT Nombre, Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [ev.usuario]);
    const evaluadorNombre = uRows.length ? uRows[0].Nombre : ev.usuario;
    const emailUsuario = uRows.length ? uRows[0].Email : null;

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
      // Sin await: ya se guardó el resultado y el documento, el correo es secundario y no
      // debe hacer esperar al trabajador que está respondiendo la evaluación.
      notificarCapacitacionSSTCompletada({
        email: segRows[0].Email,
        nombreTrabajador: vin.Trabajador,
        tema: ev.tema,
        puntaje: score,
        totalPreguntas,
        resultado,
        urlDoc,
        emailUsuario
      }).catch(e => console.error('[capacitacionsst] Error enviando correo de completado:', e.message));
    }

    // 10. Crear notificación interna en Maestro_notificaciones para analistas y líderes SST
    crearNotificacionCapacitacionSST(pool, {
      id_capacitacion,
      identificacion: ev.identificacion,
      tema: ev.tema,
      resultado,
      puntaje: score,
      totalPreguntas,
      url_doc: urlDoc
    }).catch(e => console.error('[capacitacionsst] Error creando notificación interna:', e.message));

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
    const accesoAccion = await computarAccesoCAPSST(req.body.usuario || req.query.usuario);
    if (!accesoAccion || !(await rolPuedeSst(accesoAccion.rol, SECCION_MENU_SST, 'crear'))) {
      return res.status(403).json({ error: 'No autorizado para reenviar la firma.' });
    }

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

// ═════ API: PUT /api/capacitacion/:id (Editar y regenerar PDF) ═════
router.put('/api/capacitacion/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.body.usuario || req.query.usuario;
    const { fecha, tema } = req.body;

    if (!usuario) {
      return res.status(400).json({ error: 'Parámetro usuario requerido' });
    }
    if (!fecha) {
      return res.status(400).json({ error: 'La fecha de capacitación es obligatoria.' });
    }
    if (String(fecha).slice(0, 10) > hoyBogotaStr()) {
      return res.status(400).json({ error: 'La fecha de la capacitación no puede ser superior a hoy.' });
    }

    const acceso = await computarAccesoCAPSST(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autenticado o no autorizado' });
    }

    const [rows] = await pool.execute(
      'SELECT * FROM Maestro_capacitacionsst WHERE id_capacitacion = ? LIMIT 1',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Capacitación no encontrada' });
    }
    const cap = rows[0];
    const estaFirmado = !!(cap.url_doc || cap.firma_trabajador);

    if (estaFirmado) {
      if (!(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, 'editarFirmado'))) {
        return res.status(403).json({ error: 'Tu rol no tiene permiso para editar y regenerar el PDF de una capacitación ya firmada.' });
      }
    } else if (!(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, 'crear'))) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para editar capacitaciones.' });
    }

    const nuevoTema = tema ? String(tema).trim() : cap.tema;
    const nuevaFecha = String(fecha).slice(0, 10);

    await pool.execute(
      'UPDATE Maestro_capacitacionsst SET fecha = ?, tema = ? WHERE id_capacitacion = ?',
      [nuevaFecha, nuevoTema, id]
    );

    let urlDoc = cap.url_doc;
    if (estaFirmado) {
      const capActualizado = { ...cap, fecha: nuevaFecha, tema: nuevoTema };
      urlDoc = await regenerarPdfCapacitacion(capActualizado, cap.url_doc);
    }

    res.json({ ok: true, id_capacitacion: id, fecha: nuevaFecha, tema: nuevoTema, url_doc: urlDoc });
  } catch (err) {
    console.error('[capacitacionsst] PUT /api/capacitacion/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/capacitacion/:id/regenerar-pdf ═════
router.post('/api/capacitacion/:id/regenerar-pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.body.usuario || req.query.usuario;

    if (!usuario) {
      return res.status(400).json({ error: 'Parámetro usuario requerido' });
    }

    const acceso = await computarAccesoCAPSST(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autenticado o no autorizado' });
    }

    if (!(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, 'editarFirmado'))) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para regenerar el PDF de una capacitación firmada.' });
    }

    const [rows] = await pool.execute(
      'SELECT * FROM Maestro_capacitacionsst WHERE id_capacitacion = ? LIMIT 1',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Capacitación no encontrada' });
    }
    const cap = rows[0];

    if (!cap.url_doc && !cap.firma_trabajador) {
      return res.status(400).json({ error: 'Esta capacitación aún no ha sido respondida ni firmada.' });
    }

    const urlDoc = await regenerarPdfCapacitacion(cap, cap.url_doc);
    res.json({ ok: true, id_capacitacion: id, url_doc: urlDoc });
  } catch (err) {
    console.error('[capacitacionsst] POST /api/capacitacion/:id/regenerar-pdf:', err);
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
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autenticado o no autorizado' });
    }

    // 1. Verificar si existe la capacitación y su estado de firma
    const [rows] = await pool.execute(
      'SELECT identificacion, usuario, url_doc, firma_trabajador FROM Maestro_capacitacionsst WHERE id_capacitacion = ? LIMIT 1',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Capacitación no encontrada' });
    }
    const cap = rows[0];
    const estaFirmado = !!(cap.url_doc || cap.firma_trabajador);

    if (estaFirmado) {
      // 2a. Si ya está firmado/generado el PDF, solo los roles en "Roles que pueden eliminar capacitaciones firmadas en SST"
      if (!(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, 'eliminarFirmado'))) {
        return res.status(403).json({ error: 'No se puede eliminar un registro que ya ha sido firmado o completado.' });
      }
      if (cap.url_doc) {
        await pool.execute(
          "DELETE FROM Maestro_docTrabajador WHERE Identificación = ? AND Prefijo = 'CAPSST' AND Doc = ?",
          [cap.identificacion, cap.url_doc]
        );
      }
    } else {
      // 2b. Si NO está firmado, aplica "Roles que pueden eliminar capacitaciones en SST"
      if (!(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, 'eliminar'))) {
        return res.status(403).json({ error: 'Tu rol no tiene permiso para eliminar estos registros.' });
      }

      const esSistema = acceso.rol === 'Sistema';
      const creador = String(cap.usuario || '').trim().toLowerCase();
      const usuSolicitante = String(usuario).trim().toLowerCase();
      const nombreSolicitante = String(acceso.usuarioNombre || '').trim().toLowerCase();
      const esPropio = creador && (creador === usuSolicitante || creador === nombreSolicitante);

      if (!esSistema && !esPropio) {
        return res.status(403).json({ error: 'Solo puedes eliminar registros creados por tu propio usuario.' });
      }
    }

    await pool.execute('DELETE FROM Maestro_capacitacionsst_items WHERE id_capacitacion = ?', [id]);
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
      'SELECT id_plantilla, version, tema, activo, fecha_registro, usuario_creador, periodo FROM Maestro_capacitacionsst_plantilla ORDER BY version DESC'
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
    if (!acceso || !(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, 'plantillas'))) {
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

// POST /api/plantilla/guardar (Crear o Modificar una versión/cuestionario de plantilla)
router.post('/api/plantilla/guardar', async (req, res) => {
  try {
    const { tema, objetivo, preguntas, usuario, periodo, id_plantilla } = req.body;
    if (!tema || !objetivo || !preguntas || !usuario) {
      return res.status(400).json({ error: 'tema, objetivo, preguntas y usuario requeridos' });
    }

    const acceso = await computarAccesoCAPSST(usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, 'plantillas'))) {
      return res.status(403).json({ error: 'No autorizado para guardar cambios en la plantilla.' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (id_plantilla) {
        // 1. Modificar plantilla existente
        await conn.execute(
          `UPDATE Maestro_capacitacionsst_plantilla 
           SET tema = ?, objetivo = ?, periodo = ? 
           WHERE id_plantilla = ?`,
          [tema, objetivo, periodo || null, id_plantilla]
        );

        // 2. Eliminar preguntas antiguas
        await conn.execute(
          `DELETE FROM Maestro_capacitacionsst_plantilla_items WHERE id_plantilla = ?`,
          [id_plantilla]
        );

        // 3. Insertar preguntas nuevas
        for (const q of preguntas) {
          const qNum = q.pregunta;
          const desc = q.descripcion_pregunta;

          for (const opt of q.opciones) {
            await conn.execute(
              `INSERT INTO Maestro_capacitacionsst_plantilla_items (id_plantilla, pregunta, descripcion_pregunta, opcion, correcta)
               VALUES (?, ?, ?, ?, ?)`,
              [id_plantilla, qNum, desc, opt.opcion, opt.correcta || null]
            );
          }
        }

        await conn.commit();
        res.json({ ok: true, id_plantilla, modificado: true });
      } else {
        // Crear nueva plantilla
        // 1. Calcular el siguiente número de versión
        const [[vRow]] = await conn.execute('SELECT MAX(version) AS max_v FROM Maestro_capacitacionsst_plantilla');
        const nextVersion = (vRow ? vRow.max_v : 0) + 1;

        const new_id_plantilla = uuidv4();

        // 2. Desactivar todas y crear la nueva como activa (activo = 1)
        await conn.execute('UPDATE Maestro_capacitacionsst_plantilla SET activo = 0');
        await conn.execute(
          `INSERT INTO Maestro_capacitacionsst_plantilla (id_plantilla, version, tema, objetivo, activo, usuario_creador, periodo)
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
          [new_id_plantilla, nextVersion, tema, objetivo, usuario, periodo || null]
        );

        // 3. Insertar las preguntas/opciones
        for (const q of preguntas) {
          const qNum = q.pregunta;
          const desc = q.descripcion_pregunta;

          for (const opt of q.opciones) {
            await conn.execute(
              `INSERT INTO Maestro_capacitacionsst_plantilla_items (id_plantilla, pregunta, descripcion_pregunta, opcion, correcta)
               VALUES (?, ?, ?, ?, ?)`,
              [new_id_plantilla, qNum, desc, opt.opcion, opt.correcta || null]
            );
          }
        }

        await conn.commit();
        res.json({ ok: true, id_plantilla: new_id_plantilla, version: nextVersion });
      }
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('[capacitacionsst] POST /api/plantilla/guardar:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/plantilla/:id (Eliminar un cuestionario)
router.delete('/api/plantilla/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoCAPSST(usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, 'plantillas'))) {
      return res.status(403).json({ error: 'No autorizado para eliminar cuestionarios.' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Eliminar ítems de la plantilla
      await conn.execute('DELETE FROM Maestro_capacitacionsst_plantilla_items WHERE id_plantilla = ?', [id]);

      // 2. Eliminar la plantilla principal
      await conn.execute('DELETE FROM Maestro_capacitacionsst_plantilla WHERE id_plantilla = ?', [id]);

      await conn.commit();
      res.json({ ok: true });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: NOTIFICACIONES SST (CENTRALIZADAS) ═════
router.get('/api/notificaciones', async (req, res) => {
  try {
    const { usuario, limit } = req.query;
    if (!usuario) return res.status(400).json({ error: 'Parámetro usuario requerido' });

    const data = await obtenerNotificacionesUsuario(pool, {
      usuarioId: usuario,
      modulo: 'capacitacionsst',
      limit
    });

    res.json(data);
  } catch (err) {
    console.error('[capacitacionsst] GET /api/notificaciones:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/notificaciones/marcar-leidas', async (req, res) => {
  try {
    const { usuario, ids } = req.body;
    if (!usuario || !ids) return res.status(400).json({ error: 'usuario e ids requeridos' });

    const result = await marcarNotificacionesLeidas(pool, {
      usuarioId: usuario,
      ids
    });

    res.json(result);
  } catch (err) {
    console.error('[capacitacionsst] POST /api/notificaciones/marcar-leidas:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/notificaciones/marcar-todas-leidas', async (req, res) => {
  try {
    const { usuario } = req.body;
    if (!usuario) return res.status(400).json({ error: 'Parámetro usuario requerido' });

    const result = await marcarTodasLeidas(pool, {
      usuarioId: usuario,
      modulo: 'capacitacionsst'
    });

    res.json(result);
  } catch (err) {
    console.error('[capacitacionsst] POST /api/notificaciones/marcar-todas-leidas:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
