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
  notificarFirmaPruebaConsumo
} = require('../services/email');
const {
  crearNotificacionPruebaConsumoSST,
  obtenerNotificacionesUsuario,
  marcarNotificacionesLeidas,
  marcarTodasLeidas
} = require('../services/notificacionesService');
const { obtenerPlantilla, reemplazarVariables } = require('../services/plantilla');
const { generarPDF, generarPDFDesdeHTML } = require('../services/renderer');
const { LOGO_BASE64 } = require('../services/assets');
const { computarAccesoSst } = require('../services/accesoSst');
const { rolPuedeSst, permisosSstDelRol } = require('../services/configSst');

const router = express.Router();

const HTML_INDEX_PATH = path.join(__dirname, '../views/pruebaconsumo/index.html');
const HTML_FORM_PATH  = path.join(__dirname, '../views/formpruebaconsumo/form.html');
const HTML_SIGN_PATH  = path.join(__dirname, '../views/pruebaconsumo/firmar.html');

const SECCION_MENU_SST = 'Prueba de Consumo';

function formatTimestamp() {
  const date = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yy}${mm}${dd}${hh}${ss}`;
}

function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fechaHoraBogotaTexto(d = new Date()) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

const TEXTO_FIRMA_ADMINISTRATIVA = 'Documento generado administrativamente sin firma física';

// Arma el PDF del consentimiento con la plantilla 'pruebaconsumo' (Maestro_Plantillas) y lo sube.
// Lo usan la firma del trabajador, la generación administrativa y la regeneración.
// firmaSrc: URL o imagen base64 de la firma; null = generado sin firma.
// La plantilla moderna es un documento HTML completo (como Capacitación SST); la anterior era un
// fragmento que se envuelve con generarPDF. Se llenan las variables de las dos.
async function armarPdfPrueba(c, firmaSrc) {
  const fechaFmt = c.fecha
    ? new Date(c.fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const plantilla = await obtenerPlantilla('pruebaconsumo');
  const html = String(plantilla.contenido_html || '');
  const documentoCompleto = /^\s*(<!DOCTYPE|<html)/i.test(html);

  let nombreRegistra = c.usuario || '';
  if (c.usuario) {
    const [uRows] = await pool.execute('SELECT Nombre FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [c.usuario]).catch(() => [[]]);
    if (uRows.length && uRows[0].Nombre) nombreRegistra = uRows[0].Nombre;
  }

  const datos = {
    // Diseño moderno
    logo_src:              LOGO_BASE64,
    id_prueba:             esc(c.idprueba || '—'),
    nombre_registra:       esc(nombreRegistra) || '—',
    fecha_generacion:      fechaHoraBogotaTexto(),
    firma_trabajador_html: firmaSrc
      ? `<img src="${esc(firmaSrc)}" class="sig-img" alt="Firma">`
      : `<span class="firma-nota">${TEXTO_FIRMA_ADMINISTRATIVA}</span>`,
    // Diseño anterior
    firma_trabajador: firmaSrc
      ? `<img src="${firmaSrc}" style="height:80px;display:block;margin-bottom:4px">`
      : `<div style="border:1.5px solid #ccc;border-radius:4px;padding:8px 10px;color:#888;font-size:.78rem;display:inline-block;width:220px;text-align:center;line-height:1.4;margin-bottom:4px">${TEXTO_FIRMA_ADMINISTRATIVA}</div>`,
    // Comunes
    ciudad:            esc(c.ciudad) || '—',
    fecha:             esc(fechaFmt) || '—',
    nombre_trabajador: esc(String(c.nombre_trabajador || '').toUpperCase()),
    identificacion:    esc(c.identificacion),
    cliente:           esc(c.cliente) || '—',
    cargo:             esc(c.cargo) || '—',
  };

  const htmlFinal = reemplazarVariables(html, datos);
  const pdfBuffer = documentoCompleto
    ? await generarPDFDesdeHTML(htmlFinal, { margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' } })
    : await generarPDF(htmlFinal);
  return subirPDFPruebaConsumo(c.identificacion, formatTimestamp(), pdfBuffer);
}

// Regenera el PDF de una prueba ya generada con sus datos actuales y la plantilla vigente,
// conservando la firma con la que se generó (si no tenía, la nota de generación administrativa).
// Reemplaza el documento en Maestro_docTrabajador.
async function regenerarPdfPrueba(c) {
  const urlDoc = await armarPdfPrueba(c, c.url_firma || null);
  await pool.execute('UPDATE Dynamic_pruebaconsumo SET url_doc = ? WHERE idprueba = ?', [urlDoc, c.idprueba]);
  let reemplazado = 0;
  if (c.url_doc) {
    const [upd] = await pool.execute(
      "UPDATE Maestro_docTrabajador SET Doc = ? WHERE Identificación = ? AND Prefijo = 'CPC' AND Doc = ?",
      [urlDoc, String(c.identificacion), c.url_doc]
    );
    reemplazado = upd.affectedRows;
  }
  if (!reemplazado) await registrarDocumentoTrabajador(c.identificacion, urlDoc, c.usuario, 19, 'CPC');
  return urlDoc;
}

function hoyBogotaStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
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


// Acceso gobernado por Maestro_Menu (sst, Sección "Prueba de Consumo"), igual
// que Nómina/Facturación/Cloud Docs vía su propio Maestro_Menu_<Módulo>.
// La escritura (crear/responder/eliminar/reenviar enlace) queda limitada
// aparte a los roles de Config_Parametros (sst / pestaña) donde corresponda — ver configSst.js.
async function computarAccesoCPC(usuarioId) {
  const acceso = await computarAccesoSst(usuarioId, SECCION_MENU_SST);
  if (!acceso) return null;

  // Prellenado de ciudad basado en C.C. de la Operación del usuario
  acceso.ciudad = '';
  if (acceso.operacion) {
    const [ccRows] = await pool.execute(
      'SELECT `C.C.` FROM Maestro_Operaciones WHERE OPERACIÓN = ? LIMIT 1',
      [acceso.operacion]
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

// ═════ REDIRECCIÓN A SST HUB O FORMULARIO ═════
router.get('/', async (req, res) => {
  try {
    const isForm = (req.baseUrl || '').toLowerCase().includes('/formpruebaconsumo');
    if (!isForm) {
      const q = new URLSearchParams(req.query);
      if (!q.has('tab')) q.set('tab', 'pruebaconsumo');
      return res.redirect(302, `/sst?${q.toString()}`);
    }

    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const acceso = await computarAccesoCPC(usuario);
    if (!acceso) {
      return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');
    }

    const html = fs.readFileSync(HTML_FORM_PATH, 'utf8');

    const config = JSON.stringify({
      ...acceso,
      regionalesFiltro: Object.keys(acceso.opsPorRegional),
      permisosSst: await permisosSstDelRol(acceso.rol), // Config_Parametros (sst)
      initialView: 'formulario',
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

    // Se retira el bloqueo de 48 horas para que el documento pueda ser firmado por el trabajador
    // y permanezca en estado Sin firmar (pendiente) hasta su firma.

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
    console.error('[pruebaconsumo] GET /api/contacto:', err);
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
    console.error('[pruebaconsumo] POST /api/actualizar-contacto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/conteos-filtros ═════
router.get('/api/conteos-filtros', async (req, res) => {
  try {
    const { usuario, trabajador, fechaDesde, fechaHasta, regional, operacion, estado } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoCPC(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const baseConds = [];
    const baseParams = [];

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json({ regionales: {}, operaciones: {} });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      baseConds.push(`(v.Operación IN (${ph}) OR a.usuario = ?)`);
      baseParams.push(...acceso.operacionesFiltro, usuario);
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

    // Consulta consolidada para Regionales y Operaciones
    const combConds = [...baseConds, ...sharedConds];
    const combParams = [...baseParams, ...sharedParams];
    const combWhere = combConds.length ? `WHERE ${combConds.join(' AND ')}` : '';

    const [combRows] = await pool.execute(
      `SELECT v.Regional, v.Operación AS operacion, COUNT(*) AS total
       FROM Dynamic_pruebaconsumo a
       LEFT JOIN \`Maestro_Vinculación\` v ON a.identificacion = v.Identificación AND v.Estado = 'Activo'
       ${combWhere}
       GROUP BY v.Regional, v.Operación`,
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
    console.error('[pruebaconsumo] GET /api/conteos-filtros:', err);
    res.status(500).json({ error: err.message });
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
        a.fecha_registro,
        a.token_firma,
        v.Regional AS regional,
        v.\`Operación\` AS operacion,
        u.Nombre AS nombre_creador,
        seg.Celular AS celular_trabajador
       FROM Dynamic_pruebaconsumo a
       LEFT JOIN (
         SELECT t1.Identificación, t1.Regional, t1.\`Operación\`
         FROM Maestro_Vinculación t1
         INNER JOIN (
           SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS MaxFecha
           FROM Maestro_Vinculación
           GROUP BY Identificación
         ) t2 ON t1.Identificación = t2.Identificación AND t1.\`Fecha de Ingreso\` = t2.MaxFecha
       ) v ON a.identificacion = v.Identificación
       LEFT JOIN Maestro_Usuarios u ON a.usuario = u.ID
       LEFT JOIN \`Maestro_Segmentación\` seg ON a.identificacion = seg.Identificación
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
      `SELECT a.*, u.Nombre AS nombre_creador, seg.Celular AS celular_trabajador,
              v.Regional AS regional, v.\`Operación\` AS operacion
       FROM Dynamic_pruebaconsumo a
       LEFT JOIN Maestro_Usuarios u ON a.usuario = u.ID
       LEFT JOIN Maestro_Segmentación seg ON a.identificacion = seg.Identificación
       LEFT JOIN (
         SELECT t1.Identificación, t1.Regional, t1.\`Operación\`
         FROM Maestro_Vinculación t1
         INNER JOIN (
           SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS MaxFecha
           FROM Maestro_Vinculación
           GROUP BY Identificación
         ) t2 ON t1.Identificación = t2.Identificación AND t1.\`Fecha de Ingreso\` = t2.MaxFecha
       ) v ON a.identificacion = v.Identificación
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
    const accesoAccion = await computarAccesoCPC(req.body.usuario || req.query.usuario);
    if (!accesoAccion) {
      return res.status(403).json({ error: 'No autorizado para editar la prueba de consumo.' });
    }

    if (!ciudad || !fecha || !cliente) {
      return res.status(400).json({ error: 'Ciudad, fecha y cliente son obligatorios.' });
    }
    if (String(fecha).slice(0, 10) > hoyBogotaStr()) {
      return res.status(400).json({ error: 'La fecha de la prueba no puede ser superior a hoy.' });
    }

    const [[prueba]] = await pool.execute(
      'SELECT * FROM Dynamic_pruebaconsumo WHERE idprueba = ?',
      [id]
    );
    if (!prueba) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    // Con PDF ya generado: solo los roles de Config_Parametros (sst / Prueba de Consumo), y se regenera
    const estaGenerado = !!prueba.url_doc;
    if (!(await rolPuedeSst(accesoAccion.rol, SECCION_MENU_SST, estaGenerado ? 'editarFirmado' : 'crear'))) {
      return res.status(403).json({
        error: estaGenerado
          ? 'Tu rol no tiene permiso para editar y regenerar el PDF de una prueba de consumo ya firmada.'
          : 'No autorizado para editar la prueba de consumo.',
      });
    }

    const nuevaFecha = String(fecha).slice(0, 10);
    const nuevasObs = observaciones === undefined ? prueba.observaciones : (observaciones || '');
    await pool.execute(
      `UPDATE Dynamic_pruebaconsumo
       SET ciudad = ?, fecha = ?, cliente = ?, observaciones = ?
       WHERE idprueba = ?`,
      [ciudad, nuevaFecha, cliente, nuevasObs, id]
    );

    let urlDoc = prueba.url_doc;
    if (estaGenerado) {
      urlDoc = await regenerarPdfPrueba({ ...prueba, ciudad, fecha: nuevaFecha, cliente, observaciones: nuevasObs });
    }

    res.json({ ok: true, url_doc: urlDoc });
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

    const accesoCrear = await computarAccesoSst(usuario, SECCION_MENU_SST);
    if (!accesoCrear || !(await rolPuedeSst(accesoCrear.rol, SECCION_MENU_SST, 'crear'))) {
      return res.status(403).json({ error: 'No autorizado para crear pruebas de consumo.' });
    }

    // Limpieza de nombre si contiene identificación
    let cleanNombreTrabajador = nombre_trabajador || '';
    if (cleanNombreTrabajador.includes(' ** ')) {
      cleanNombreTrabajador = cleanNombreTrabajador.split(' ** ')[1] || cleanNombreTrabajador;
    }
    cleanNombreTrabajador = cleanNombreTrabajador.trim();

    const idprueba = uuidv4();
    const tokenFirma = crypto.randomBytes(32).toString('hex');
    const tokenExpira = null; // Sin vencimiento: permanece abierto hasta que se firme

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
      notificarFirmaPruebaConsumo({
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

// ═════ API: POST /api/crear-masivo ═════
router.post('/api/crear-masivo', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      fecha,
      identificaciones,
      ciudad,
      cliente,
      observaciones,
      usuario,
      enviar_correo
    } = req.body;

    if (!fecha || !identificaciones || !identificaciones.length || !ciudad || !cliente || !usuario) {
      return res.status(400).json({ error: 'Todos los campos obligatorios deben ser diligenciados' });
    }

    const accesoCrearMasivo = await computarAccesoSst(usuario, SECCION_MENU_SST);
    if (!accesoCrearMasivo || !(await rolPuedeSst(accesoCrearMasivo.rol, SECCION_MENU_SST, 'crear'))) {
      return res.status(403).json({ error: 'No autorizado para crear pruebas de consumo.' });
    }

    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('host');
    const resultados = [];

    await conn.beginTransaction();

    for (const identificacion of identificaciones) {
      // Get worker name and cargo
      const [vinRows] = await conn.execute(
        `SELECT Trabajador, Cargo 
         FROM \`Maestro_Vinculación\` 
         WHERE Identificación = ? 
         ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
        [identificacion]
      );
      if (!vinRows.length) continue;

      const trabajadorNombre = vinRows[0].Trabajador;
      const cargo = vinRows[0].Cargo;

      // Limpieza de nombre si contiene identificación
      let cleanNombreTrabajador = trabajadorNombre || '';
      if (cleanNombreTrabajador.includes(' ** ')) {
        cleanNombreTrabajador = cleanNombreTrabajador.split(' ** ')[1] || cleanNombreTrabajador;
      }
      cleanNombreTrabajador = cleanNombreTrabajador.trim();

      const idprueba = uuidv4();
      const tokenFirma = crypto.randomBytes(32).toString('hex');
      const tokenExpira = null; // Sin vencimiento: permanece abierto hasta que se firme

      await conn.execute(
        `INSERT INTO Dynamic_pruebaconsumo 
         (idprueba, fecha, identificacion, nombre_trabajador, cargo, ciudad, cliente,
          firma_trabajador, url_firma, url_doc, token_firma, token_expira, observaciones, usuario)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?)`,
        [
          idprueba,
          fecha,
          identificacion,
          cleanNombreTrabajador,
          cargo || '',
          ciudad,
          cliente,
          tokenFirma,
          tokenExpira,
          observaciones || '',
          usuario
        ]
      );

      // Obtener email y celular para notificación
      const [segRows] = await conn.execute('SELECT Email, Celular FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1', [identificacion]);
      const [usuRows] = await conn.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);

      const emailTrabajador = segRows.length ? segRows[0].Email : null;
      const celular = segRows.length ? segRows[0].Celular : null;
      const emailUsuario = usuRows.length ? usuRows[0].Email : null;

      const urlFirma = `${protocol}://${host}/pruebaconsumo/firmar?item=${idprueba}`;

      resultados.push({
        identificacion,
        trabajador: cleanNombreTrabajador,
        celular,
        email: emailTrabajador,
        urlFirma
      });

      if (enviar_correo && emailTrabajador) {
        notificarFirmaPruebaConsumo({
          email: emailTrabajador,
          nombreTrabajador: cleanNombreTrabajador,
          cliente,
          urlFirma,
          emailUsuario
        }).catch(e => console.error('[pruebaconsumo] Error enviando correo masivo al trabajador:', e.message));
      }
    }

    await conn.commit();
    res.json({ ok: true, resultados });
  } catch (err) {
    await conn.rollback();
    console.error('[pruebaconsumo] POST /api/crear-masivo:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
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

    // Renderizar y guardar el PDF
    const urlDoc = await armarPdfPrueba(c, urlFirma);

    // Actualizar base de datos
    await pool.execute(
      `UPDATE Dynamic_pruebaconsumo 
       SET firma_trabajador = ?, url_firma = ?, url_doc = ?, token_firma = NULL, token_expira = NULL 
       WHERE idprueba = ?`,
      [firma_base64, urlFirma, urlDoc, idprueba]
    );

    // Registrar en Maestro_docTrabajador
    await registrarDocumentoTrabajador(c.identificacion, urlDoc, c.usuario, 19, 'CPC');

    // Crear notificación interna en Maestro_notificaciones para analistas y líderes SST
    crearNotificacionPruebaConsumoSST(pool, {
      idprueba,
      identificacion: c.identificacion,
      cliente: c.cliente,
      url_doc: urlDoc
    }).catch(e => console.error('[pruebaconsumo] Error creando notificación interna:', e.message));

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
    // Firma prellenada (GCS) o, si no hay, nota de que se generó sin firma
    const firmaGcs = await obtenerFirmaBase64Reciente(c.identificacion).catch(() => null);
    const urlDoc = await armarPdfPrueba(c, firmaGcs || null);

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

// ═════ API: POST /api/prueba/:id/regenerar-pdf ═════
// Rehace el PDF ya generado con la plantilla vigente (Maestro_Plantillas) y la misma firma.
router.post('/api/prueba/:id/regenerar-pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const acceso = await computarAccesoCPC(req.body.usuario || req.query.usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, 'editarFirmado'))) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para regenerar el PDF de una prueba de consumo firmada.' });
    }

    const [rows] = await pool.execute('SELECT * FROM Dynamic_pruebaconsumo WHERE idprueba = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Consentimiento no encontrado' });
    if (!rows[0].url_doc) return res.status(400).json({ error: 'Esta prueba aún no tiene el PDF generado.' });

    const urlDoc = await regenerarPdfPrueba(rows[0]);
    res.json({ ok: true, idprueba: id, url_doc: urlDoc });
  } catch (err) {
    console.error('[pruebaconsumo] POST /api/prueba/:id/regenerar-pdf:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/prueba/:id/regenerar-token ═════
router.post('/api/prueba/:id/regenerar-token', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;

    const acceso = await computarAccesoCPC(usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, 'crear'))) {
      return res.status(403).json({ error: 'No autorizado para regenerar el enlace.' });
    }

    const [rows] = await pool.execute(
      'SELECT * FROM Dynamic_pruebaconsumo WHERE idprueba = ?',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Consentimiento no encontrado' });
    }

    const c = rows[0];
    if (c.url_doc) {
      return res.status(400).json({ error: 'El consentimiento ya está generado y firmado.' });
    }

    // Force generate new token (permanece abierto sin expiración)
    const token = crypto.randomBytes(32).toString('hex');
    await pool.execute(
      'UPDATE Dynamic_pruebaconsumo SET token_firma = ?, token_expira = NULL WHERE idprueba = ?',
      [token, id]
    );

    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('host');
    const urlFirma = `${protocol}://${host}/pruebaconsumo/firmar?item=${id}`;

    res.json({ ok: true, urlFirma, token, token_expira: null });
  } catch (err) {
    console.error('[pruebaconsumo] POST /api/prueba/:id/regenerar-token:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/prueba/:id/enviar-enlace (WHATSAPP/EMAIL) ═════
router.post('/api/prueba/:id/enviar-enlace', async (req, res) => {
  try {
    const { id } = req.params;
    const { canal } = req.body; // 'email' o 'whatsapp'
    const accesoAccion = await computarAccesoCPC(req.body.usuario || req.query.usuario);
    if (!accesoAccion || !(await rolPuedeSst(accesoAccion.rol, SECCION_MENU_SST, 'crear'))) {
      return res.status(403).json({ error: 'No autorizado para enviar el enlace.' });
    }

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

    // Si no tiene token, generarlo (sin plazo de vencimiento)
    let token = c.token_firma;
    if (!token) {
      token = crypto.randomBytes(32).toString('hex');
      await pool.execute(
        'UPDATE Dynamic_pruebaconsumo SET token_firma = ?, token_expira = NULL WHERE idprueba = ?',
        [token, id]
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
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autenticado o no autorizado' });
    }

    // 1. Verificar si existe la prueba y su estado de firma
    const [rows] = await pool.execute(
      'SELECT usuario, identificacion, url_doc, firma_trabajador FROM Dynamic_pruebaconsumo WHERE idprueba = ? LIMIT 1',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Consentimiento no encontrado' });
    }
    const pc = rows[0];

    // 2. Firmado o con PDF: solo los roles de Config_Parametros (sst / Prueba de Consumo); se quita
    //    también su documento de Maestro_docTrabajador
    if (pc.url_doc || pc.firma_trabajador) {
      if (!(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, 'eliminarFirmado'))) {
        return res.status(403).json({ error: 'Tu rol no tiene permiso para eliminar una prueba de consumo ya firmada.' });
      }
      if (pc.url_doc) {
        await pool.execute(
          "DELETE FROM Maestro_docTrabajador WHERE Identificación = ? AND Prefijo = 'CPC' AND Doc = ?",
          [String(pc.identificacion), pc.url_doc]
        );
      }
      await pool.execute('DELETE FROM Dynamic_pruebaconsumo WHERE idprueba = ?', [id]);
      return res.json({ ok: true, idprueba: id });
    }

    // 3. Rol Sistema puede eliminar cualquier registro no firmado; los demás solo si fue creado por su propio usuario
    // Rol con permiso de eliminar en la pestaña (Config_Parametros, sst / pestaña)
    if (!(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, 'eliminar'))) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para eliminar estos registros.' });
    }

    const esSistema = acceso.rol === 'Sistema';
    const creador = String(pc.usuario || '').trim().toLowerCase();
    const usuSolicitante = String(usuario).trim().toLowerCase();
    const nombreSolicitante = String(acceso.usuarioNombre || '').trim().toLowerCase();
    const esPropio = creador && (creador === usuSolicitante || creador === nombreSolicitante);

    if (!esSistema && !esPropio) {
      return res.status(403).json({ error: 'Solo puedes eliminar registros creados por tu propio usuario.' });
    }

    await pool.execute('DELETE FROM Dynamic_pruebaconsumo WHERE idprueba = ?', [id]);
    res.json({ ok: true, idprueba: id });
  } catch (err) {
    console.error('[pruebaconsumo] DELETE /api/prueba/:id:', err);
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
      modulo: 'pruebaconsumo',
      limit
    });

    res.json(data);
  } catch (err) {
    console.error('[pruebaconsumo] GET /api/notificaciones:', err);
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
    console.error('[pruebaconsumo] POST /api/notificaciones/marcar-leidas:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/notificaciones/marcar-todas-leidas', async (req, res) => {
  try {
    const { usuario } = req.body;
    if (!usuario) return res.status(400).json({ error: 'Parámetro usuario requerido' });

    const result = await marcarTodasLeidas(pool, {
      usuarioId: usuario,
      modulo: 'pruebaconsumo'
    });

    res.json(result);
  } catch (err) {
    console.error('[pruebaconsumo] POST /api/notificaciones/marcar-todas-leidas:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
