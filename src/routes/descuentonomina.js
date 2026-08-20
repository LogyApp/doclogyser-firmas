const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const pool = require('../services/db');
const {
  subirFirma,
  subirPDFDescuentoNomina,
  obtenerFirmaBase64Reciente
} = require('../services/storage');
const {
  notificarFirmaDescuentoNomina,
  notificarDescuentoNominaFirmada
} = require('../services/email');
const { obtenerPlantilla, reemplazarVariables } = require('../services/plantilla');
const { generarPDF } = require('../services/renderer');

const router = express.Router();

const HTML_INDEX_PATH = path.join(__dirname, '../views/descuentonomina/index.html');
const HTML_FORM_PATH  = path.join(__dirname, '../views/formdescuentonomina/form.html');
const HTML_SIGN_PATH  = path.join(__dirname, '../views/descuentonomina/firmar.html');

const ROLES_ACCESO = [
  'Sistema', 'Control', 'Nomina',
  'Contratación', 'Archivo', 'Asistencial',
  'AuxiliarR', 'CoordinadorR',
  'Auxiliar', 'Coordinador'
];
const ROLES_SIN_FILTRO = ['Sistema', 'Control', 'Nomina', 'Contratación', 'Archivo', 'Asistencial'];
const ROLES_REGIONAL = ['AuxiliarR', 'CoordinadorR'];
const ROLES_OPERACION = ['Auxiliar', 'Coordinador'];

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

async function computarAccesoDN(usuarioId) {
  if (!usuarioId) return null;

  const [uRows] = await pool.execute(
    'SELECT ID, Nombre, Rol, Regional, Dispositivo, `Operación` FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );
  if (!uRows.length) return null;

  const usuario = uRows[0];
  const rol = usuario.Rol || '';

  if (!ROLES_ACCESO.includes(rol)) return null;
  
  const acceso = {
    usuarioId: usuario.ID,
    usuarioNombre: usuario.Nombre || usuario.ID,
    rol,
    regional: usuario.Regional || '',
    dispositivo: usuario.Dispositivo || '',
    operacion: usuario['Operación'] || '',
    sinFiltro: ROLES_SIN_FILTRO.includes(rol),
    filtroSQL: [],
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
    acceso.filtroSQL = opRows.map(r => r.OPERACIÓN).filter(Boolean);
  } else if (ROLES_OPERACION.includes(rol)) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.operacion]
    );
    opRows = rows;
    if (opRows.length && !acceso.regional) {
      acceso.regional = opRows[0].REGIONAL;
    }
    acceso.filtroSQL = [acceso.operacion].filter(Boolean);
  } else {
    if (acceso.operacion) {
      const [rows] = await pool.execute(
        "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
        [acceso.operacion]
      );
      opRows = rows;
    }
    acceso.filtroSQL = opRows.map(r => r.OPERACIÓN).filter(Boolean);
  }

  // Agrupar por regional para los dropdowns
  const [allOps] = await pool.execute(
    "SELECT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY REGIONAL, OPERACIÓN"
  );
  acceso.opsPorRegional = agruparOperacionesPorRegional(allOps);
  acceso.operacionesFiltro = opRows.map((row) => row['OPERACIÓN'] || row['Operación']).filter(Boolean);

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

    const acceso = await computarAccesoDN(usuario);
    if (!acceso) {
      return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');
    }

    const initialView = (req.baseUrl || '').toLowerCase().includes('/formdescuentonomina')
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
    console.error('[descuentonomina] Error serving page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// ═════ VISTA DE FIRMA ═════
router.get('/firmar', async (req, res) => {
  try {
    const { item } = req.query;
    if (!item) {
      return res.status(400).send('<h2>Error: Código de documento ?item requerido</h2>');
    }

    const [rows] = await pool.execute(
      'SELECT * FROM Dynamic_descuentonomina WHERE id_descuento = ?',
      [item]
    );

    if (!rows.length) {
      return res.status(404).send('<h2>Error: Documento no encontrado</h2>');
    }

    const discount = rows[0];
    if (discount.url_doc) {
      return res.status(400).send('<h2>Este documento ya ha sido firmado o completado anteriormente.</h2>');
    }

    if (discount.token_expira && new Date(discount.token_expira) < new Date()) {
      return res.status(400).send('<h2>Este enlace de firma ha expirado (plazo de 48 horas superado).</h2>');
    }

    const tieneFirmaGcs = await obtenerFirmaBase64Reciente(discount.identificacion).catch(() => null);
    const config = JSON.stringify({
      id_descuento: discount.id_descuento,
      fecha: discount.fecha,
      identificacion: discount.identificacion,
      nombre_trabajador: discount.nombre_trabajador,
      cargo: discount.cargo,
      ciudad: discount.ciudad,
      tipo_descuento: discount.tipo_descuento,
      cuotas: discount.cuotas,
      valor: discount.valor,
      motivo: discount.motivo,
      firmaBase64: tieneFirmaGcs
    }).replace(/<\/script>/gi, '<\\/script>');

    const html = fs.readFileSync(HTML_SIGN_PATH, 'utf8');
    res.send(html.replace('__CONFIG_FIRMA__', config));
  } catch (err) {
    console.error('[descuentonomina] Error serving signing page:', err);
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
    console.error('[descuentonomina] Error fetching workers:', err);
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

    if (!rows.length) {
      return res.json({ email: '', celular: '' });
    }
    res.json({
      email: rows[0].Email || '',
      celular: rows[0].Celular || ''
    });
  } catch (err) {
    console.error('[descuentonomina] Error fetching contact:', err);
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
      'UPDATE Maestro_Segmentación SET Email = ?, Celular = ? WHERE Identificación = ?',
      [email || null, celular || null, identificacion]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[descuentonomina] Error updating contact:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/conteos-filtros ═════
router.get('/api/conteos-filtros', async (req, res) => {
  try {
    const { usuario, trabajador, fechaDesde, fechaHasta, regional, operacion, estado, tipoDescuento } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoDN(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no authorized' });
    }

    const baseConds = [];
    const baseParams = [];

    const ROLES_SOLO_ANTICIPADA = ['Contratación', 'Archivo', 'Asistencial'];
    if (ROLES_SOLO_ANTICIPADA.includes(acceso.rol)) {
      baseConds.push("a.tipo_descuento = 'Anticipada'");
    }

    if (!acceso.sinFiltro) {
      if (!acceso.filtroSQL.length) {
        return res.json({ regionales: {}, operaciones: {} });
      }
      const ph = acceso.filtroSQL.map(() => '?').join(',');
      baseConds.push(`v.Operación IN (${ph})`);
      baseParams.push(...acceso.filtroSQL);
    }

    const sharedConds = [];
    const sharedParams = [];

    if (trabajador) {
      sharedConds.push('a.nombre_trabajador LIKE ?');
      sharedParams.push(`%${trabajador.toUpperCase()}%`);
    }
    if (fechaDesde) {
      sharedConds.push('a.fecha >= ?');
      sharedParams.push(fechaDesde);
    }
    if (fechaHasta) {
      sharedConds.push('a.fecha <= ?');
      sharedParams.push(fechaHasta);
    }
    if (estado) {
      if (estado === 'ACEPTADA') {
        sharedConds.push('a.url_doc IS NOT NULL');
      } else if (estado === 'PENDIENTE') {
        sharedConds.push('a.url_doc IS NULL');
      }
    }
    if (tipoDescuento) {
      sharedConds.push('a.tipo_descuento = ?');
      sharedParams.push(tipoDescuento);
    }

    // 1. Regionales (Excluye regional)
    const regConds = [...baseConds, ...sharedConds];
    const regParams = [...baseParams, ...sharedParams];
    if (operacion) {
      regConds.push('v.Operación = ?');
      regParams.push(operacion);
    }
    const regWhere = regConds.length ? `WHERE ${regConds.join(' AND ')}` : '';

    const [regRows] = await pool.execute(
      `SELECT v.Regional, COUNT(*) AS total
       FROM Dynamic_descuentonomina a
       LEFT JOIN \`Maestro_Vinculación\` v ON a.identificacion = v.Identificación AND v.Estado = 'Activo'
       ${regWhere}
       GROUP BY v.Regional`,
      regParams
    );

    // 2. Operaciones (Excluye operacion)
    const opConds = [...baseConds, ...sharedConds];
    const opParams = [...baseParams, ...sharedParams];
    if (regional) {
      opConds.push('v.Regional = ?');
      opParams.push(regional);
    }
    const opWhere = opConds.length ? `WHERE ${opConds.join(' AND ')}` : '';

    const [opRows] = await pool.execute(
      `SELECT v.Operación AS operacion, COUNT(*) AS total
       FROM Dynamic_descuentonomina a
       LEFT JOIN \`Maestro_Vinculación\` v ON a.identificacion = v.Identificación AND v.Estado = 'Activo'
       ${opWhere}
       GROUP BY v.Operación`,
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
    console.error('[descuentonomina] GET /api/conteos-filtros:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/pruebas ═════
router.get('/api/pruebas', async (req, res) => {
  try {
    const { usuario, trabajador, fechaDesde, fechaHasta, regional, operacion, tipoDescuento, estado } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoDN(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const conds = [];
    const params = [];

    const ROLES_SOLO_ANTICIPADA = ['Contratación', 'Archivo', 'Asistencial'];
    if (ROLES_SOLO_ANTICIPADA.includes(acceso.rol)) {
      conds.push("a.tipo_descuento = 'Anticipada'");
    }

    if (!acceso.sinFiltro) {
      if (!acceso.filtroSQL.length) {
        return res.json([]);
      }
      const ph = acceso.filtroSQL.map(() => '?').join(',');
      conds.push(`v.Operación IN (${ph})`);
      params.push(...acceso.filtroSQL);
    }

    if (trabajador) {
      conds.push('a.nombre_trabajador LIKE ?');
      params.push(`%${trabajador.toUpperCase()}%`);
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
    if (tipoDescuento) {
      conds.push('a.tipo_descuento = ?');
      params.push(tipoDescuento);
    }
    if (estado) {
      if (estado === 'ACEPTADA') {
        conds.push('a.url_doc IS NOT NULL');
      } else if (estado === 'PENDIENTE') {
        conds.push('a.url_doc IS NULL');
      }
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT 
        a.id_descuento,
        a.fecha,
        a.identificacion,
        a.nombre_trabajador,
        a.cargo,
        a.ciudad,
        a.tipo_descuento,
        a.cuotas,
        a.valor,
        a.motivo,
        a.url_doc,
        a.usuario,
        a.fecha_registro,
        a.token_firma,
        seg.Celular AS celular_trabajador
       FROM Dynamic_descuentonomina a
       LEFT JOIN \`Maestro_Vinculación\` v ON a.identificacion = v.Identificación AND v.Estado = 'Activo'
       LEFT JOIN \`Maestro_Segmentación\` seg ON a.identificacion = seg.Identificación
       ${where}
       ORDER BY a.fecha_registro DESC
       LIMIT 500`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error('[descuentonomina] GET /api/pruebas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/prueba/:id ═════
router.get('/api/prueba/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;

    const acceso = await computarAccesoDN(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const [[discount]] = await pool.execute(
      `SELECT a.*, u.Nombre AS nombre_creador, seg.Celular AS celular_trabajador
       FROM Dynamic_descuentonomina a
       LEFT JOIN Maestro_Usuarios u ON a.usuario = u.ID
       LEFT JOIN Maestro_Segmentación seg ON a.identificacion = seg.Identificación
       WHERE a.id_descuento = ?`,
      [id]
    );

    if (!discount) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    const ROLES_SOLO_ANTICIPADA = ['Contratación', 'Archivo', 'Asistencial'];
    if (ROLES_SOLO_ANTICIPADA.includes(acceso.rol) && discount.tipo_descuento !== 'Anticipada') {
      return res.status(403).json({ error: 'No está autorizado para ver este tipo de descuento.' });
    }

    const tieneFirmaGcs = await obtenerFirmaBase64Reciente(discount.identificacion).catch(() => null);
    let estadoFirma = 'SIN_FIRMA';
    if (discount.firma_trabajador) {
      estadoFirma = 'ACEPTADA';
    } else if (tieneFirmaGcs) {
      estadoFirma = 'PREFILLED';
    }

    res.json({
      ...discount,
      tiene_firma: !!tieneFirmaGcs,
      estado_firma: estadoFirma
    });
  } catch (err) {
    console.error('[descuentonomina] GET /api/prueba/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: PUT /api/prueba/:id ═════
router.put('/api/prueba/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { ciudad, fecha, tipo_descuento, cuotas, valor, motivo, observaciones } = req.body;

    if (!ciudad || !fecha || !tipo_descuento) {
      return res.status(400).json({ error: 'Ciudad, fecha y Tipo de Descuento son obligatorios.' });
    }

    const [[discount]] = await pool.execute(
      'SELECT url_doc FROM Dynamic_descuentonomina WHERE id_descuento = ?',
      [id]
    );
    if (!discount) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    if (discount.url_doc) {
      return res.status(400).json({ error: 'No se puede editar un registro con documento PDF ya generado.' });
    }

    await pool.execute(
      `UPDATE Dynamic_descuentonomina 
       SET ciudad = ?, fecha = ?, tipo_descuento = ?, cuotas = ?, valor = ?, motivo = ?, observaciones = ? 
       WHERE id_descuento = ?`,
      [ciudad, fecha, tipo_descuento, cuotas || null, valor || null, motivo || null, observaciones || '', id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[descuentonomina] PUT /api/prueba/:id:', err);
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
      tipo_descuento,
      cuotas,
      valor,
      motivo,
      observaciones,
      usuario,
      enviar_correo
    } = req.body;

    if (!fecha || !identificacion || !nombre_trabajador || !cargo || !ciudad || !tipo_descuento || !usuario) {
      return res.status(400).json({ error: 'Todos los campos obligatorios deben ser diligenciados' });
    }

    if (tipo_descuento === 'Específica' && (!cuotas || !valor || !motivo)) {
      return res.status(400).json({ error: 'Cuotas, Valor y Motivo son obligatorios para el tipo de descuento Específica' });
    }

    let cleanNombreTrabajador = nombre_trabajador || '';
    if (cleanNombreTrabajador.includes(' ** ')) {
      cleanNombreTrabajador = cleanNombreTrabajador.split(' ** ')[1] || cleanNombreTrabajador;
    }
    cleanNombreTrabajador = cleanNombreTrabajador.trim();

    const id_descuento = uuidv4();
    const token_firma = crypto.randomBytes(32).toString('hex');
    const token_expira = new Date(Date.now() + 48 * 3600000); // 48h

    await pool.execute(
      `INSERT INTO Dynamic_descuentonomina 
       (id_descuento, fecha, identificacion, nombre_trabajador, cargo, ciudad, tipo_descuento, cuotas, valor, motivo, observaciones, token_firma, token_expira, usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_descuento,
        fecha,
        identificacion,
        cleanNombreTrabajador,
        cargo,
        ciudad,
        tipo_descuento,
        tipo_descuento === 'Específica' ? cuotas : null,
        tipo_descuento === 'Específica' ? valor : null,
        tipo_descuento === 'Específica' ? motivo : null,
        observaciones || '',
        token_firma,
        token_expira,
        usuario
      ]
    );

    const [trabRows] = await pool.execute('SELECT Email FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1', [identificacion]);
    const emailTrabajador = trabRows.length ? trabRows[0].Email : null;

    if (enviar_correo && emailTrabajador) {
      const urlFirma = `${req.protocol}://${req.get('host')}/descuentonomina/firmar?item=${id_descuento}&token=${token_firma}`;
      await notificarFirmaDescuentoNomina({
        email: emailTrabajador,
        nombreTrabajador: cleanNombreTrabajador,
        tipoDescuento: tipo_descuento,
        urlFirma,
        emailUsuario: null
      }).catch(e => console.error('[descuentonomina] Error enviando correo al trabajador:', e.message));
    }

    res.json({ ok: true, id_descuento, token_firma });
  } catch (err) {
    console.error('[descuentonomina] POST /api/crear:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/crear-masivo ═════
router.post('/api/crear-masivo', async (req, res) => {
  try {
    const { items, usuario } = req.body;
    if (!items || !Array.isArray(items) || !items.length || !usuario) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }

    const creados = [];
    const errores = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        if (!item.fecha || !item.identificacion || !item.nombre_trabajador || !item.cargo || !item.ciudad || !item.tipo_descuento) {
          throw new Error('Faltan campos obligatorios');
        }

        if (item.tipo_descuento === 'Específica' && (!item.cuotas || !item.valor || !item.motivo)) {
          throw new Error('Cuotas, Valor y Motivo son obligatorios para el tipo de descuento Específica');
        }

        let cleanNombre = item.nombre_trabajador || '';
        if (cleanNombre.includes(' ** ')) {
          cleanNombre = cleanNombre.split(' ** ')[1] || cleanNombre;
        }
        cleanNombre = cleanNombre.trim();

        const id_descuento = uuidv4();
        const token_firma = crypto.randomBytes(32).toString('hex');
        const token_expira = new Date(Date.now() + 48 * 3600000);

        await pool.execute(
          `INSERT INTO Dynamic_descuentonomina 
           (id_descuento, fecha, identificacion, nombre_trabajador, cargo, ciudad, tipo_descuento, cuotas, valor, motivo, observaciones, token_firma, token_expira, usuario)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id_descuento,
            item.fecha,
            item.identificacion,
            cleanNombre,
            item.cargo,
            item.ciudad,
            item.tipo_descuento,
            item.tipo_descuento === 'Específica' ? item.cuotas : null,
            item.tipo_descuento === 'Específica' ? item.valor : null,
            item.tipo_descuento === 'Específica' ? item.motivo : null,
            item.observaciones || '',
            token_firma,
            token_expira,
            usuario
          ]
        );

        creados.push({ identificacion: item.identificacion, id_descuento });
      } catch (err) {
        errores.push({ index: i, identificacion: item.identificacion, error: err.message });
      }
    }

    res.json({ ok: true, creados, errores });
  } catch (err) {
    console.error('[descuentonomina] POST /api/crear-masivo:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/firmar-asistente ═════
router.post('/api/firmar-asistente', async (req, res) => {
  try {
    const { id_descuento, firma_base64 } = req.body;
    if (!id_descuento || !firma_base64) {
      return res.status(400).json({ error: 'Falta id_descuento o firma_base64' });
    }

    const [[c]] = await pool.execute(
      'SELECT * FROM Dynamic_descuentonomina WHERE id_descuento = ?',
      [id_descuento]
    );
    if (!c) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    if (c.url_doc) {
      return res.status(400).json({ error: 'Este documento ya se encuentra firmado' });
    }

    // Subir la firma en GCS
    const buffer = Buffer.from(firma_base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const urlFirma = await subirFirma(c.identificacion, buffer);

    // Obtener plantilla HTML correspondiente
    const templateName = (c.tipo_descuento === 'Anticipada') ? 'descuento_anticipado' : 'descuento_especifico';
    const [plantillaRows] = await pool.execute(
      'SELECT contenido_html FROM Maestro_Plantillas WHERE nombre_proceso = ? LIMIT 1',
      [templateName]
    );

    if (!plantillaRows.length) {
      return res.status(500).json({ error: `Plantilla del proceso ${templateName} no configurada en la base de datos` });
    }
    const plantilla = plantillaRows[0];

    // Formatear fechas
    const dateObj = new Date(c.fecha);
    const diaVal = dateObj.getDate();
    const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesVal = mesesNombres[dateObj.getMonth()];
    const anioVal = dateObj.getFullYear();
    const fechaFmt = `${diaVal} de ${mesVal} de ${anioVal}`;

    let cleanNombre = String(c.nombre_trabajador || '');
    if (cleanNombre.includes(' ** ')) {
      cleanNombre = cleanNombre.split(' ** ')[1] || cleanNombre;
    }
    cleanNombre = cleanNombre.toUpperCase().trim();

    const datos = {
      ciudad:            c.ciudad || '',
      fecha:             fechaFmt,
      dia:               diaVal,
      mes:               mesVal,
      anio:              anioVal,
      nombre_trabajador: cleanNombre,
      identificacion:    String(c.identificacion),
      cargo:             c.cargo || '',
      tipo_descuento:    c.tipo_descuento,
      cuotas:            c.cuotas || '',
      valor:             c.valor || '',
      motivo:            c.motivo || '',
      firma_trabajador:  `<img src="${urlFirma}" style="height:80px;display:block;margin-bottom:4px">`
    };

    const htmlFinal = reemplazarVariables(plantilla.contenido_html, datos);
    const pdfBuffer = await generarPDF(htmlFinal);

    // Guardar PDF en el bucket
    const timestamp = formatTimestamp();
    const urlDoc = await subirPDFDescuentoNomina(c.identificacion, timestamp, pdfBuffer);

    // Actualizar base de datos
    await pool.execute(
      `UPDATE Dynamic_descuentonomina 
       SET firma_trabajador = ?, url_firma = ?, url_doc = ?, token_firma = NULL, token_expira = NULL 
       WHERE id_descuento = ?`,
      [firma_base64, urlFirma, urlDoc, id_descuento]
    );

    // Registrar en Maestro_docTrabajador (TipoDocumento: 21, Prefijo: DCTO)
    await registrarDocumentoTrabajador(c.identificacion, urlDoc, c.usuario, 21, 'DCTO');

    // Notificar al creador por correo
    const [usuRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [c.usuario]);
    const emailUsuario = usuRows.length ? usuRows[0].Email : null;

    if (emailUsuario) {
      await notificarDescuentoNominaFirmada({
        nombreTrabajador: c.nombre_trabajador,
        identificacion: c.identificacion,
        tipoDescuento: c.tipo_descuento,
        urlDoc,
        emailUsuario
      }).catch(e => console.error('[descuentonomina] Error enviando correo al creador:', e.message));
    }

    res.json({ ok: true, urlDoc });
  } catch (err) {
    console.error('[descuentonomina] POST /api/firmar-asistente:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/prueba/:id/generar-pdf (FORZAR) ═════
router.post('/api/prueba/:id/generar-pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const { force } = req.body;

    const [[c]] = await pool.execute(
      'SELECT * FROM Dynamic_descuentonomina WHERE id_descuento = ?',
      [id]
    );
    if (!c) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    if (c.url_doc && !force) {
      return res.status(400).json({ error: 'El PDF ya fue generado anteriormente para este registro.' });
    }

    const tieneFirmaGcs = await obtenerFirmaBase64Reciente(c.identificacion).catch(() => null);
    const firmaUsar = c.firma_trabajador || tieneFirmaGcs;

    if (!firmaUsar) {
      return res.status(400).json({ error: 'El trabajador no posee una firma digital registrada.' });
    }

    let urlFirma = c.url_firma;
    if (!urlFirma) {
      const buffer = Buffer.from(firmaUsar.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      urlFirma = await subirFirma(c.identificacion, buffer);
    }

    const templateName = (c.tipo_descuento === 'Anticipada') ? 'descuento_anticipado' : 'descuento_especifico';
    const [plantillaRows] = await pool.execute(
      'SELECT contenido_html FROM Maestro_Plantillas WHERE nombre_proceso = ? LIMIT 1',
      [templateName]
    );

    if (!plantillaRows.length) {
      return res.status(500).json({ error: `Plantilla del proceso ${templateName} no configurada en BD` });
    }
    const plantilla = plantillaRows[0];

    const dateObj = new Date(c.fecha);
    const diaVal = dateObj.getDate();
    const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesVal = mesesNombres[dateObj.getMonth()];
    const anioVal = dateObj.getFullYear();
    const fechaFmt = `${diaVal} de ${mesVal} de ${anioVal}`;

    let cleanNombre = String(c.nombre_trabajador || '');
    if (cleanNombre.includes(' ** ')) {
      cleanNombre = cleanNombre.split(' ** ')[1] || cleanNombre;
    }
    cleanNombre = cleanNombre.toUpperCase().trim();

    const datos = {
      ciudad:            c.ciudad || '',
      fecha:             fechaFmt,
      dia:               diaVal,
      mes:               mesVal,
      anio:              anioVal,
      nombre_trabajador: cleanNombre,
      identificacion:    String(c.identificacion),
      cargo:             c.cargo || '',
      tipo_descuento:    c.tipo_descuento,
      cuotas:            c.cuotas || '',
      valor:             c.valor || '',
      motivo:            c.motivo || '',
      firma_trabajador:  `<img src="${urlFirma}" style="height:80px;display:block;margin-bottom:4px">`
    };

    const htmlFinal = reemplazarVariables(plantilla.contenido_html, datos);
    const pdfBuffer = await generarPDF(htmlFinal);

    const timestamp = formatTimestamp();
    const urlDoc = await subirPDFDescuentoNomina(c.identificacion, timestamp, pdfBuffer);

    await pool.execute(
      `UPDATE Dynamic_descuentonomina 
       SET firma_trabajador = ?, url_firma = ?, url_doc = ?, token_firma = NULL, token_expira = NULL 
       WHERE id_descuento = ?`,
      [firmaUsar, urlFirma, urlDoc, id]
    );

    await registrarDocumentoTrabajador(c.identificacion, urlDoc, c.usuario, 21, 'DCTO');

    res.json({ ok: true, urlDoc });
  } catch (err) {
    console.error('[descuentonomina] POST /api/prueba/:id/generar-pdf:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/prueba/:id/regenerar-token ═════
router.post('/api/prueba/:id/regenerar-token', async (req, res) => {
  try {
    const { id } = req.params;

    const [[c]] = await pool.execute(
      'SELECT url_doc FROM Dynamic_descuentonomina WHERE id_descuento = ?',
      [id]
    );
    if (!c) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    if (c.url_doc) {
      return res.status(400).json({ error: 'Este documento ya se encuentra firmado' });
    }

    const token_firma = crypto.randomBytes(32).toString('hex');
    const token_expira = new Date(Date.now() + 48 * 3600000);

    await pool.execute(
      'UPDATE Dynamic_descuentonomina SET token_firma = ?, token_expira = ? WHERE id_descuento = ?',
      [token_firma, token_expira, id]
    );

    res.json({ ok: true, token_firma });
  } catch (err) {
    console.error('[descuentonomina] POST /api/prueba/:id/regenerar-token:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/prueba/:id/enviar-enlace ═════
router.post('/api/prueba/:id/enviar-enlace', async (req, res) => {
  try {
    const { id } = req.params;
    const { canal } = req.body; // 'email'

    const [[c]] = await pool.execute(
      'SELECT * FROM Dynamic_descuentonomina WHERE id_descuento = ?',
      [id]
    );
    if (!c) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    if (c.url_doc) {
      return res.status(400).json({ error: 'Este documento ya se encuentra firmado y generado.' });
    }

    if (!c.token_firma) {
      return res.status(400).json({ error: 'No existe token de firma activo' });
    }

    const [trabRows] = await pool.execute('SELECT Email FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1', [c.identificacion]);
    const emailTrabajador = trabRows.length ? trabRows[0].Email : null;

    if (!emailTrabajador) {
      return res.status(400).json({ error: 'El trabajador no posee un correo electrónico registrado.' });
    }

    const urlFirma = `${req.protocol}://${req.get('host')}/descuentonomina/firmar?item=${c.id_descuento}&token=${c.token_firma}`;

    if (canal === 'email') {
      await notificarFirmaDescuentoNomina({
        email: emailTrabajador,
        nombreTrabajador: c.nombre_trabajador,
        tipoDescuento: c.tipo_descuento,
        urlFirma,
        emailUsuario: null
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[descuentonomina] POST /api/prueba/:id/enviar-enlace:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: DELETE /api/prueba/:id ═════
router.delete('/api/prueba/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;

    const acceso = await computarAccesoDN(usuario);
    if (!acceso || acceso.rol !== 'Sistema') {
      return res.status(403).json({ error: 'No autorizado. Solo el rol Sistema puede eliminar registros.' });
    }

    const [[c]] = await pool.execute(
      'SELECT url_doc FROM Dynamic_descuentonomina WHERE id_descuento = ?',
      [id]
    );
    if (!c) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    if (c.url_doc) {
      return res.status(400).json({ error: 'No se puede eliminar un registro que ya ha sido firmado.' });
    }

    await pool.execute(
      'DELETE FROM Dynamic_descuentonomina WHERE id_descuento = ?',
      [id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[descuentonomina] DELETE /api/prueba/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
