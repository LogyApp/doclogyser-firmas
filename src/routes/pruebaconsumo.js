const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const pool = require('../services/db');
const {
  subirFirma,
  subirPDFPruebaConsumo,
  obtenerFirmaBase64Reciente
} = require('../services/storage');
const {
  notificarFirmaPruebaConsumo,
  notificarPruebaConsumoFirmada
} = require('../services/email');
const { obtenerPlantilla, reemplazarVariables } = require('../services/plantilla');
const { generarPDF } = require('../services/renderer');

const router = express.Router();

const HTML_INDEX_PATH = path.join(__dirname, '../views/pruebaconsumo/index.html');
const HTML_FORM_PATH  = path.join(__dirname, '../views/formpruebaconsumo/form.html');
const HTML_SIGN_PATH  = path.join(__dirname, '../views/pruebaconsumo/firmar.html');

const ROLES_SIN_FILTRO = ['Sistema', 'AdmSst', 'LiderSst'];
const ROLES_REGIONAL = [];
const ROLES_DISPOSITIVO = ['AuxSst'];
const ROLES_MODALIDAD = ['AnaSst'];

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


async function computarAccesoCPC(usuarioId) {
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
    ciudad: '',
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

  acceso.opsPorRegional = agruparOperacionesPorRegional(opRows);
  acceso.operacionesFiltro = opRows.map((row) => row['OPERACIÓN'] || row['Operación']).filter(Boolean);

  // Prellenado de ciudad basado en C.C. de la Operación del usuario
  if (usuario['Operación']) {
    const [ccRows] = await pool.execute(
      'SELECT `C.C.` FROM Maestro_Operaciones WHERE OPERACIÓN = ? LIMIT 1',
      [usuario['Operación']]
    );
    if (ccRows.length) {
      acceso.ciudad = ccRows[0]['C.C.'] || '';
    }
  }

  return acceso;
}

function agruparOperacionesPorRegional(opRows) {
  const map = {};
  opRows.forEach((row) => {
    const reg = row.REGIONAL || row.Regional;
    const op = row.OPERACIÓN || row.Operación;
    if (reg && op) {
      if (!map[reg]) map[reg] = [];
      map[reg].push(op);
    }
  });
  return map;
}

// ═════ SERVIR INTERFAZ ═════
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const acceso = await computarAccesoCPC(usuario);
    if (!acceso) {
      return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');
    }

    const initialView = (req.baseUrl || '').toLowerCase().includes('/formpruebaconsumo')
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
    console.error('[pruebaconsumo] Error serving page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// ═════ VISTA DE FIRMA ═════
router.get('/firmar', async (req, res) => {
  try {
    const { item } = req.query;
    if (!item) {
      return res.status(400).send('<h2>Error: Código de consentimiento ?item requerido</h2>');
    }

    const [rows] = await pool.execute(
      'SELECT * FROM Dynamic_pruebaconsumo WHERE idprueba = ?',
      [item]
    );

    if (!rows.length) {
      return res.status(404).send('<h2>Error: Consentimiento no encontrado</h2>');
    }

    const consent = rows[0];
    if (consent.url_doc) {
      return res.status(400).send('<h2>Este consentimiento ya ha sido firmado o completado anteriormente.</h2>');
    }

    if (consent.token_expira && new Date(consent.token_expira) < new Date()) {
      return res.status(400).send('<h2>Este enlace de firma ha expirado (plazo de 48 horas superado).</h2>');
    }

    const tieneFirmaGcs = await obtenerFirmaBase64Reciente(consent.identificacion).catch(() => null);
    const config = JSON.stringify({
      idprueba: consent.idprueba,
      fecha: consent.fecha,
      identificacion: consent.identificacion,
      nombre_trabajador: consent.nombre_trabajador,
      cargo: consent.cargo,
      ciudad: consent.ciudad,
      cliente: consent.cliente,
      firmaBase64: tieneFirmaGcs
    }).replace(/<\/script>/gi, '<\\/script>');

    const html = fs.readFileSync(HTML_SIGN_PATH, 'utf8');
    res.send(html.replace('__CONFIG_FIRMA__', config));
  } catch (err) {
    console.error('[pruebaconsumo] Error serving signing page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// ═════ API: GET /api/clientes ═════
router.get('/api/clientes', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT DISTINCT `Cliente a Facturar` AS cliente FROM Maestro_Clientes_Credito WHERE `Cliente a Facturar` IS NOT NULL ORDER BY `Cliente a Facturar`'
    );
    res.json(rows.map(r => r.cliente));
  } catch (err) {
    console.error('[pruebaconsumo] GET /api/clientes:', err);
    res.status(500).json([]);
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
    console.error('[pruebaconsumo] GET /api/trabajadores-por-operacion:', err);
    res.status(500).json([]);
  }
});

// ═════ API: GET /api/pruebas ═════
router.get('/api/pruebas', async (req, res) => {
  try {
    const { usuario, trabajador, fechaDesde, fechaHasta, regional, operacion } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoCPC(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const conds = [];
    const params = [];

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json([]);
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      conds.push(`(v.Operación IN (${ph}) OR a.usuario = ?)`);
      params.push(...acceso.operacionesFiltro, usuario);
    }

    if (trabajador) {
      conds.push('a.nombre_trabajador LIKE ?');
      params.push(`%${trabajador}%`);
    }
    if (fechaDesde) {
      conds.push('a.fecha >= ?');
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      conds.push('a.fecha <= ?');
      params.push(fechaHasta);
    }
    if (regional) {
      conds.push('v.Regional = ?');
      params.push(regional);
    }
    if (operacion) {
      conds.push('v.Operación = ?');
      params.push(operacion);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT 
        a.idprueba,
        a.fecha,
        a.identificacion,
        a.nombre_trabajador,
        a.cargo,
        a.ciudad,
        a.cliente,
        a.url_doc,
        a.usuario,
        a.fecha_registro
       FROM Dynamic_pruebaconsumo a
       LEFT JOIN \`Maestro_Vinculación\` v ON a.identificacion = v.Identificación AND v.Estado = 'Activo'
       ${where}
       ORDER BY a.fecha_registro DESC
       LIMIT 500`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error('[pruebaconsumo] GET /api/pruebas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/prueba/:id ═════
router.get('/api/prueba/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [[prueba]] = await pool.execute(
      `SELECT a.*, u.Nombre AS nombre_creador
       FROM Dynamic_pruebaconsumo a
       LEFT JOIN Maestro_Usuarios u ON a.usuario = u.ID
       WHERE a.idprueba = ?`,
      [id]
    );

    if (!prueba) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    const tieneFirmaGcs = await obtenerFirmaBase64Reciente(prueba.identificacion).catch(() => null);
    let estadoFirma = 'SIN_FIRMA';
    if (prueba.firma_trabajador) {
      estadoFirma = 'ACEPTADA';
    } else if (tieneFirmaGcs) {
      estadoFirma = 'PREFILLED';
    }

    res.json({
      ...prueba,
      tiene_firma: !!tieneFirmaGcs,
      estado_firma: estadoFirma
    });
  } catch (err) {
    console.error('[pruebaconsumo] GET /api/prueba/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: PUT /api/prueba/:id ═════
router.put('/api/prueba/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { ciudad, fecha, cliente, observaciones } = req.body;

    if (!ciudad || !fecha || !cliente) {
      return res.status(400).json({ error: 'Ciudad, fecha y cliente son obligatorios.' });
    }

    const [[prueba]] = await pool.execute(
      'SELECT url_doc FROM Dynamic_pruebaconsumo WHERE idprueba = ?',
      [id]
    );
    if (!prueba) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    if (prueba.url_doc) {
      return res.status(400).json({ error: 'No se puede editar un registro con documento PDF ya generado.' });
    }

    await pool.execute(
      `UPDATE Dynamic_pruebaconsumo 
       SET ciudad = ?, fecha = ?, cliente = ?, observaciones = ? 
       WHERE idprueba = ?`,
      [ciudad, fecha, cliente, observaciones || '', id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[pruebaconsumo] PUT /api/prueba/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/crear ═════
router.post('/api/crear', async (req, res) => {
  try {
    const {
      fecha,
      identificacion,
      nombre_trabajador,
      cargo,
      ciudad,
      cliente,
      observaciones,
      usuario,
      enviar_correo
    } = req.body;

    if (!fecha || !identificacion || !nombre_trabajador || !cargo || !ciudad || !cliente || !usuario) {
      return res.status(400).json({ error: 'Todos los campos obligatorios deben ser diligenciados' });
    }

    // Limpieza de nombre si contiene identificación
    let cleanNombreTrabajador = nombre_trabajador || '';
    if (cleanNombreTrabajador.includes(' ** ')) {
      cleanNombreTrabajador = cleanNombreTrabajador.split(' ** ')[1] || cleanNombreTrabajador;
    }
    cleanNombreTrabajador = cleanNombreTrabajador.trim();

    const idprueba = uuidv4();
    const tokenFirma = crypto.randomBytes(32).toString('hex');
    const tokenExpira = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 horas de vigencia

    await pool.execute(
      `INSERT INTO Dynamic_pruebaconsumo 
       (idprueba, fecha, identificacion, nombre_trabajador, cargo, ciudad, cliente,
        firma_trabajador, url_firma, url_doc, token_firma, token_expira, observaciones, usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?)`,
      [
        idprueba,
        fecha,
        identificacion,
        cleanNombreTrabajador,
        cargo,
        ciudad,
        cliente,
        tokenFirma,
        tokenExpira,
        observaciones || '',
        usuario
      ]
    );

    // Obtener emails para notificación
    const [segRows] = await pool.execute('SELECT Email FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1', [identificacion]);
    const [usuRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);

    const emailTrabajador = segRows.length ? segRows[0].Email : null;
    const emailUsuario = usuRows.length ? usuRows[0].Email : null;

    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('host');
    const urlFirma = `${protocol}://${host}/pruebaconsumo/firmar?item=${idprueba}`;

    if (enviar_correo && emailTrabajador) {
      await notificarFirmaPruebaConsumo({
        email: emailTrabajador,
        nombreTrabajador: cleanNombreTrabajador,
        cliente,
        urlFirma,
        emailUsuario
      }).catch(e => console.error('[pruebaconsumo] Error enviando correo al trabajador:', e.message));
    }

    res.json({ ok: true, idprueba, urlFirma });
  } catch (err) {
    console.error('[pruebaconsumo] POST /api/crear:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/firmar-asistente ═════
router.post('/api/firmar-asistente', async (req, res) => {
  try {
    const { idprueba, firma_base64 } = req.body;
    if (!idprueba || !firma_base64) {
      return res.status(400).json({ error: 'idprueba y firma_base64 requeridos' });
    }

    const [rows] = await pool.execute(
      'SELECT * FROM Dynamic_pruebaconsumo WHERE idprueba = ?',
      [idprueba]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Consentimiento no encontrado' });
    }

    const c = rows[0];
    if (c.url_doc) {
      return res.status(400).json({ error: 'El documento ya ha sido firmado anteriormente.' });
    }

    // Subir la firma en GCS
    const buffer = Buffer.from(firma_base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const urlFirma = await subirFirma(c.identificacion, buffer);

    // Formatear fecha para el PDF
    const fechaFmt = c.fecha
      ? new Date(c.fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' })
      : '';

    // Renderizar PDF
    const plantilla = await obtenerPlantilla('pruebaconsumo');
    const datos = {
      ciudad:            c.ciudad || '',
      fecha:             fechaFmt,
      nombre_trabajador: String(c.nombre_trabajador).toUpperCase(),
      identificacion:    String(c.identificacion),
      cliente:           c.cliente || '',
      cargo:             c.cargo || '',
      firma_trabajador:  `<img src="${urlFirma}" style="height:80px;display:block;margin-bottom:4px">`
    };

    const htmlFinal = reemplazarVariables(plantilla.contenido_html, datos);
    const pdfBuffer = await generarPDF(htmlFinal);

    // Guardar PDF en el bucket
    const timestamp = formatTimestamp();
    const urlDoc = await subirPDFPruebaConsumo(c.identificacion, timestamp, pdfBuffer);

    // Actualizar base de datos
    await pool.execute(
      `UPDATE Dynamic_pruebaconsumo 
       SET firma_trabajador = ?, url_firma = ?, url_doc = ?, token_firma = NULL, token_expira = NULL 
       WHERE idprueba = ?`,
      [firma_base64, urlFirma, urlDoc, idprueba]
    );

    // Registrar en Maestro_docTrabajador
    await registrarDocumentoTrabajador(c.identificacion, urlDoc, c.usuario, 19, 'CPC');

    // Notificar al creador por correo
    const [usuRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [c.usuario]);
    const emailUsuario = usuRows.length ? usuRows[0].Email : null;

    if (emailUsuario) {
      await notificarPruebaConsumoFirmada({
        nombreTrabajador: c.nombre_trabajador,
        identificacion: c.identificacion,
        cliente: c.cliente,
        urlDoc,
        emailUsuario
      }).catch(e => console.error('[pruebaconsumo] Error enviando correo al creador:', e.message));
    }

    res.json({ ok: true, urlDoc });
  } catch (err) {
    console.error('[pruebaconsumo] POST /api/firmar-asistente:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/prueba/:id/generar-pdf (FORZAR) ═════
router.post('/api/prueba/:id/generar-pdf', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      'SELECT * FROM Dynamic_pruebaconsumo WHERE idprueba = ?',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Consentimiento no encontrado' });
    }

    const c = rows[0];
    if (c.url_doc) {
      return res.json({ ok: true, urlDoc: c.url_doc });
    }

    // Usar firma GCS prellenada o poner texto explicativo de que no firmó
    let firmaHtml = `<div style="border:1.5px solid #ccc;border-radius:4px;padding:8px 10px;color:#888;font-size:.78rem;display:inline-block;width:220px;text-align:center;line-height:1.4;margin-bottom:4px">Documento generado administrativamente sin firma física</div>`;
    const firmaGcs = await obtenerFirmaBase64Reciente(c.identificacion).catch(() => null);
    if (firmaGcs) {
      firmaHtml = `<img src="${firmaGcs}" style="height:80px;display:block;margin-bottom:4px">`;
    }

    const fechaFmt = c.fecha
      ? new Date(c.fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' })
      : '';

    const plantilla = await obtenerPlantilla('pruebaconsumo');
    const datos = {
      ciudad:            c.ciudad || '',
      fecha:             fechaFmt,
      nombre_trabajador: String(c.nombre_trabajador).toUpperCase(),
      identificacion:    String(c.identificacion),
      cliente:           c.cliente || '',
      cargo:             c.cargo || '',
      firma_trabajador:  firmaHtml
    };

    const htmlFinal = reemplazarVariables(plantilla.contenido_html, datos);
    const pdfBuffer = await generarPDF(htmlFinal);

    const timestamp = formatTimestamp();
    const urlDoc = await subirPDFPruebaConsumo(c.identificacion, timestamp, pdfBuffer);

    await pool.execute(
      `UPDATE Dynamic_pruebaconsumo 
       SET url_doc = ?, token_firma = NULL, token_expira = NULL 
       WHERE idprueba = ?`,
      [urlDoc, id]
    );

    // Registrar en Maestro_docTrabajador
    await registrarDocumentoTrabajador(c.identificacion, urlDoc, c.usuario, 19, 'CPC');

    res.json({ ok: true, urlDoc });
  } catch (err) {
    console.error('[pruebaconsumo] POST /api/prueba/:id/generar-pdf:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/prueba/:id/enviar-enlace (WHATSAPP/EMAIL) ═════
router.post('/api/prueba/:id/enviar-enlace', async (req, res) => {
  try {
    const { id } = req.params;
    const { canal } = req.body; // 'email' o 'whatsapp'

    const [rows] = await pool.execute(
      'SELECT * FROM Dynamic_pruebaconsumo WHERE idprueba = ?',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Consentimiento no encontrado' });
    }

    const c = rows[0];
    if (c.url_doc) {
      return res.status(400).json({ error: 'El documento ya está generado y firmado.' });
    }

    // Si expiró o es nulo el token, refrescarlo
    let token = c.token_firma;
    let expira = c.token_expira;
    if (!token || !expira || new Date(expira) < new Date()) {
      token = crypto.randomBytes(32).toString('hex');
      expira = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await pool.execute(
        'UPDATE Dynamic_pruebaconsumo SET token_firma = ?, token_expira = ? WHERE idprueba = ?',
        [token, expira, id]
      );
    }

    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('host');
    const urlFirma = `${protocol}://${host}/pruebaconsumo/firmar?item=${id}`;

    if (canal === 'email') {
      const [segRows] = await pool.execute('SELECT Email FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1', [c.identificacion]);
      const [usuRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [c.usuario]);

      const emailTrabajador = segRows.length ? segRows[0].Email : null;
      const emailUsuario = usuRows.length ? usuRows[0].Email : null;

      if (!emailTrabajador) {
        return res.status(400).json({ error: 'No se encontró correo electrónico para el trabajador' });
      }

      await notificarFirmaPruebaConsumo({
        email: emailTrabajador,
        nombreTrabajador: c.nombre_trabajador,
        cliente: c.cliente,
        urlFirma,
        emailUsuario
      });

      return res.json({ ok: true, mensaje: 'Enlace enviado al correo del trabajador' });
    }

    res.json({ ok: true, urlFirma });
  } catch (err) {
    console.error('[pruebaconsumo] POST /api/prueba/:id/enviar-enlace:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: DELETE /api/prueba/:id ═════
router.delete('/api/prueba/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;

    if (!usuario) {
      return res.status(400).json({ error: 'Parámetro usuario requerido' });
    }

    const acceso = await computarAccesoCPC(usuario);
    if (!acceso || !['AdmSst', 'LiderSst', 'Sistema'].includes(acceso.rol)) {
      return res.status(403).json({ error: 'No autorizado para eliminar registros de prueba de consumo' });
    }

    await pool.execute('DELETE FROM Dynamic_pruebaconsumo WHERE idprueba = ?', [id]);
    res.json({ ok: true, idprueba: id });
  } catch (err) {
    console.error('[pruebaconsumo] DELETE /api/prueba/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
