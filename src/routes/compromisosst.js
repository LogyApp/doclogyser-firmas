const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const pool = require('../services/db');
const {
  subirFirma,
  subirPDFCompromisoSST,
  obtenerFirmaBase64Reciente
} = require('../services/storage');
const {
  enviarCorreoFirmaTrabajadorSST,
  enviarNotificacionTrabajadorFirmoSST,
  enviarCorreoFirmaLiderSST,
  enviarNotificacionCompletadoSST
} = require('../services/email');
const {
  crearNotificacionCompromisoSST,
  obtenerNotificacionesUsuario,
  marcarNotificacionesLeidas,
  marcarTodasLeidas
} = require('../services/notificacionesService');
const { obtenerPlantilla, reemplazarVariables, firmaConFecha } = require('../services/plantilla');
const { generarPDF, generarPDFDesdeHTML } = require('../services/renderer');
const { LOGO_BASE64 } = require('../services/assets');
const { computarAccesoSst } = require('../services/accesoSst');
const { rolPuedeSst, permisosSstDelRol } = require('../services/configSst');

const router = express.Router();

const HTML_INDEX_PATH = path.join(__dirname, '../views/compromisosst/index.html');
const HTML_FORM_PATH  = path.join(__dirname, '../views/formcompromisosst/form.html');
const HTML_SIGN_TRAB_PATH  = path.join(__dirname, '../views/compromisosst/firmar_trabajador.html');
const HTML_SIGN_LIDER_PATH  = path.join(__dirname, '../views/compromisosst/firmar_lider.html');

const SECCION_MENU_SST = 'Compromiso SST';

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
    console.log(`[CSST] [Maestro_docTrabajador] Registrado documento tipo ${tipoDocumento} (${prefijo}) para ${identificacion}`);
  } catch (err) {
    console.error(`[CSST] [Maestro_docTrabajador] Error registrando documento para ${identificacion}:`, err.message);
  }
}

async function obtenerIdentificacionPorUsuarioORol(usuarioId, rol) {
  try {
    let query = '';
    let param = '';
    if (usuarioId) {
      query = 'SELECT Colaborador FROM Maestro_Usuarios WHERE ID = ? LIMIT 1';
      param = usuarioId;
    } else if (rol) {
      query = 'SELECT Colaborador FROM Maestro_Usuarios WHERE Rol = ? LIMIT 1';
      param = rol;
    } else {
      return null;
    }

    const [uRows] = await pool.execute(query, [param]);
    if (!uRows.length || !uRows[0].Colaborador) return null;

    const colaborador = uRows[0].Colaborador;
    const [vRows] = await pool.execute(
      `SELECT Identificación FROM \`Maestro_Vinculación\` 
       WHERE Trabajador = ? 
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [colaborador]
    );
    return vRows.length ? vRows[0].Identificación : null;
  } catch (e) {
    console.error('[compromisosst] Error en obtenerIdentificacionPorUsuarioORol:', e.message);
    return null;
  }
}

const NOMBRE_LIDER_SST_DEFECTO = 'YULIED ECHAVARRÍA VASCO';

function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fechaHoraBogotaTexto(d = new Date()) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

function hoyBogotaStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

// 'AAAA-MM-DD' de un DATE de MySQL (Date o texto)
function fechaIso(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(valor);
  const m = String(valor).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

// Fecha en que se generó el PDF según el nombre del archivo (<cc>.CSST.<aammdd...>.pdf),
// para compromisos que no tienen fecha_documento.
function fechaDesdeUrlDoc(urlDoc) {
  const m = String(urlDoc || '').match(/\.CSST\.(\d{2})(\d{2})(\d{2})\d*\.pdf$/i);
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : null;
}

function fechaDocumentoCompromiso(c) {
  return fechaIso(c.fecha_documento) || fechaDesdeUrlDoc(c.url_doc) || hoyBogotaStr();
}

async function nombreLiderSstPorDefecto() {
  const [rows] = await pool.execute("SELECT Nombre FROM Maestro_Usuarios WHERE Rol = 'LiderSst' LIMIT 1").catch(() => [[]]);
  return rows.length && rows[0].Nombre ? rows[0].Nombre : NOMBRE_LIDER_SST_DEFECTO;
}

// Arma el PDF del compromiso con la plantilla 'compromisosst' (Maestro_Plantillas) y lo sube.
// c: fila de Dynamic_compromisosst con las firmas (url_firma_*) y nombres con que se genera.
// Lo usan las firmas del Analista y del Líder SST, la edición y la regeneración.
// La plantilla moderna (con {{logo_src}}) es un documento completo con su propio margen; la
// anterior se envuelve con generarPDF. Se llenan las variables de las dos.
async function armarPdfCompromiso(c) {
  const plantilla = await obtenerPlantilla('compromisosst');
  const html = String(plantilla.contenido_html || '');
  const disenoModerno = html.includes('{{logo_src}}');

  const fechaDoc = fechaDocumentoCompromiso(c);
  const fechaFmt = new Date(`${fechaDoc}T12:00:00-05:00`).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });

  const [vinRows] = await pool.execute(
    'SELECT Regional, `Operación` FROM Maestro_Vinculación WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
    [c.identificaciontrabajador]
  );
  const opTrabajador = vinRows.length ? `${vinRows[0]['Operación']} (${vinRows[0].Regional})` : 'LOG&SER S.A.S.';
  const nombreLider = c.nombre_lidersst || await nombreLiderSstPorDefecto();

  // Cada firma lleva debajo su fecha de firma (fecha_firma_*), como en LogySign
  const firmaModerna = (url, fecha) => (url ? firmaConFecha(`<img src="${esc(url)}" class="sig-img" alt="Firma">`, fecha) : '<span class="firma-nota">Sin firma</span>');
  const firmaAnterior = (url, fecha) => (url ? firmaConFecha(`<img src="${url}" style="height:70px;display:block;margin:0 auto">`, fecha) : '');

  const datos = {
    // Diseño moderno
    logo_src:            LOGO_BASE64,
    id_compromiso:       esc(c.idcsst),
    cargo:               esc(c.cargo_trabajador) || '—',
    cargo_analista:      esc(c.cargo_analista) || '—',
    fecha_generacion:    fechaHoraBogotaTexto(),
    firma_trabajador_html: firmaModerna(c.url_firma_trabajador, c.fecha_firma_trabajador),
    firma_analista_html:   firmaModerna(c.url_firma_analista, c.fecha_firma_analista),
    firma_lidersst_html:   firmaModerna(c.url_firma_lidersst, c.fecha_firma_lidersst),
    // Diseño anterior
    firma_trabajador:    firmaAnterior(c.url_firma_trabajador, c.fecha_firma_trabajador),
    firma_analista:      firmaAnterior(c.url_firma_analista, c.fecha_firma_analista),
    firma_lidersst:      firmaAnterior(c.url_firma_lidersst, c.fecha_firma_lidersst),
    // Comunes
    fecha:               esc(fechaFmt),
    nombre_trabajador:   esc(String(c.nombre_trabajador || '').toUpperCase()),
    identificacion:      esc(c.identificaciontrabajador),
    operacion:           esc(opTrabajador),
    nombre_analista:     esc(c.nombre_analista) || '—',
    nombre_lidersst:     esc(nombreLider),
  };

  const htmlFinal = reemplazarVariables(html, datos);
  const pdfBuffer = disenoModerno
    ? await generarPDFDesdeHTML(htmlFinal, { margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' } })
    : await generarPDF(htmlFinal, { margin: { top: '7mm', bottom: '7mm', left: '7mm', right: '7mm' } });
  return subirPDFCompromisoSST(c.identificaciontrabajador, formatTimestamp(), pdfBuffer);
}

// Regenera el PDF de un compromiso ya generado con sus datos actuales y la plantilla vigente,
// conservando las firmas y la fecha del documento. Reemplaza el documento en
// Maestro_docTrabajador y en la notificación de la campana.
async function regenerarPdfCompromiso(c) {
  const fechaDoc = fechaDocumentoCompromiso(c);
  const urlDoc = await armarPdfCompromiso({ ...c, fecha_documento: fechaDoc });
  await pool.execute(
    'UPDATE Dynamic_compromisosst SET url_doc = ?, fecha_documento = ? WHERE idcsst = ?',
    [urlDoc, fechaDoc, c.idcsst]
  );
  let reemplazado = 0;
  if (c.url_doc) {
    const [upd] = await pool.execute(
      "UPDATE Maestro_docTrabajador SET Doc = ? WHERE Identificación = ? AND Prefijo = 'CSST' AND Doc = ?",
      [urlDoc, String(c.identificaciontrabajador), c.url_doc]
    );
    reemplazado = upd.affectedRows;
  }
  if (!reemplazado) await registrarDocumentoTrabajador(c.identificaciontrabajador, urlDoc, c.usuario, 72, 'CSST');
  pool.execute(
    "UPDATE Maestro_notificaciones SET url_doc = ? WHERE modulo = 'csst' AND referencia_id = ? AND url_doc IS NOT NULL",
    [urlDoc, c.idcsst]
  ).catch(e => console.error('[compromisosst] Error actualizando notificación CSST:', e.message));
  return urlDoc;
}

// Acceso gobernado por Maestro_Menu (sst, Sección "Compromiso SST"), igual
// que Nómina/Facturación/Cloud Docs vía su propio Maestro_Menu_<Módulo>.
// La escritura (crear/firmar/eliminar) queda limitada aparte a
// los roles de Config_Parametros (sst / pestaña) donde corresponda — ver configSst.js.
async function computarAccesoCSST(usuarioId) {
  return computarAccesoSst(usuarioId, SECCION_MENU_SST);
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
    const isForm = (req.baseUrl || '').toLowerCase().includes('/formcompromisosst');
    if (!isForm) {
      const q = new URLSearchParams(req.query);
      if (!q.has('tab')) q.set('tab', 'compromiso');
      return res.redirect(302, `/sst?${q.toString()}`);
    }

    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const acceso = await computarAccesoCSST(usuario);
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
    console.error('[compromisosst] Error serving page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// ═════ VISTA DE FIRMA TRABAJADOR ═════
router.get('/firmar-trabajador', async (req, res) => {
  try {
    const { item, token } = req.query;
    if (!item || !token) {
      return res.status(400).send('<h2>Error: Parámetros item y token requeridos</h2>');
    }

    const [rows] = await pool.execute(
      'SELECT * FROM Dynamic_compromisosst WHERE idcsst = ? AND token_trabajador = ?',
      [item, token]
    );

    if (!rows.length) {
      return res.status(404).send('<h2>Error: Enlace de firma inválido o no encontrado</h2>');
    }

    const c = rows[0];
    if (c.token_trabajador_expira && new Date(c.token_trabajador_expira) < new Date()) {
      return res.status(400).send('<h2>Este enlace de firma ha expirado (plazo de 48 horas superado).</h2>');
    }

    const tieneFirmaGcs = await obtenerFirmaBase64Reciente(c.identificaciontrabajador).catch(() => null);
    const config = JSON.stringify({
      idcsst: c.idcsst,
      token: token,
      identificacion: c.identificaciontrabajador,
      nombre_trabajador: c.nombre_trabajador,
      cargo: c.cargo_trabajador,
      firmaBase64: tieneFirmaGcs
    }).replace(/<\/script>/gi, '<\\/script>');

    const html = fs.readFileSync(HTML_SIGN_TRAB_PATH, 'utf8');
    res.send(html.replace('__CONFIG_FIRMA__', config));
  } catch (err) {
    console.error('[compromisosst] Error serving worker sign page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// ═════ VISTA DE FIRMA LÍDER SST ═════
router.get('/firmar-lider', async (req, res) => {
  try {
    const { item, token } = req.query;
    if (!item || !token) {
      return res.status(400).send('<h2>Error: Parámetros item y token requeridos</h2>');
    }

    const [rows] = await pool.execute(
      'SELECT * FROM Dynamic_compromisosst WHERE idcsst = ? AND token_lidersst = ?',
      [item, token]
    );

    if (!rows.length) {
      return res.status(404).send('<h2>Error: Enlace de firma inválido o vencido</h2>');
    }

    const c = rows[0];
    const liderCC = await obtenerIdentificacionPorUsuarioORol(null, 'LiderSst');
    const tieneFirmaGcs = liderCC ? await obtenerFirmaBase64Reciente(liderCC).catch(() => null) : null;
    
    const config = JSON.stringify({
      idcsst: c.idcsst,
      token: token,
      nombre_trabajador: c.nombre_trabajador,
      nombre_analista: c.nombre_analista,
      firmaBase64: tieneFirmaGcs
    }).replace(/<\/script>/gi, '<\\/script>');

    const html = fs.readFileSync(HTML_SIGN_LIDER_PATH, 'utf8');
    res.send(html.replace('__CONFIG_FIRMA__', config));
  } catch (err) {
    console.error('[compromisosst] Error serving leader sign page:', err);
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
    console.error('[compromisosst] GET /api/clientes:', err);
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
    console.error('[compromisosst] GET /api/trabajadores-por-operacion:', err);
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
    console.error('[compromisosst] GET /api/contacto:', err);
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
    console.error('[compromisosst] POST /api/actualizar-contacto:', err);
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

    const acceso = await computarAccesoCSST(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    // Filtros de control de acceso (base)
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

    // Filtros dinámicos compartidos (trabajador, fechas, estado de firmas)
    const sharedConds = [];
    const sharedParams = [];

    if (trabajador) {
      sharedConds.push('a.nombre_trabajador LIKE ?');
      sharedParams.push(`%${trabajador.toUpperCase()}%`);
    }
    if (fechaDesde) {
      sharedConds.push('a.fecha_registro >= ?');
      sharedParams.push(fechaDesde);
    }
    if (fechaHasta) {
      sharedConds.push('a.fecha_registro <= ?');
      sharedParams.push(fechaHasta);
    }
    if (estado) {
      if (estado === 'VERDE' || estado === 'COMPLETADO') {
        sharedConds.push('a.firma_lidersst IS NOT NULL');
      } else if (estado === 'AMARILLO' || estado === 'PEND_ANALISTA') {
        sharedConds.push('a.firma_trabajador IS NOT NULL AND a.firma_analista IS NULL');
      } else if (estado === 'ROJO' || estado === 'PEND_TRAB') {
        sharedConds.push('a.firma_trabajador IS NULL');
      } else if (estado === 'PEND_LIDER') {
        sharedConds.push('a.firma_analista IS NOT NULL AND a.firma_lidersst IS NULL');
      }
    }

    // Consulta consolidada para Regionales y Operaciones
    const combConds = [...baseConds, ...sharedConds];
    const combParams = [...baseParams, ...sharedParams];
    const combWhere = combConds.length ? `WHERE ${combConds.join(' AND ')}` : '';

    const [combRows] = await pool.execute(
      `SELECT v.Regional, v.Operación AS operacion, COUNT(*) AS total
       FROM Dynamic_compromisosst a
       JOIN \`Maestro_Vinculación\` v ON a.identificaciontrabajador = v.Identificación AND v.Estado = 'Activo'
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
    console.error('[compromisosst] GET /api/conteos-filtros:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/compromisos ═════
router.get('/api/compromisos', async (req, res) => {
  try {
    const { usuario, trabajador, fechaDesde, fechaHasta, regional, operacion } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoCSST(usuario);
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
      conds.push('a.fecha_registro >= ?');
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      conds.push('a.fecha_registro <= ?');
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
        a.idcsst,
        a.identificaciontrabajador,
        a.nombre_trabajador,
        a.cargo_trabajador,
        a.nombre_analista,
        IF(a.firma_trabajador IS NOT NULL, 1, NULL) AS firma_trabajador,
        IF(a.firma_analista IS NOT NULL, 1, NULL) AS firma_analista,
        IF(a.firma_lidersst IS NOT NULL, 1, NULL) AS firma_lidersst,
        a.url_doc,
        a.usuario,
        a.fecha_registro,
        seg.Celular AS celular_trabajador
       FROM Dynamic_compromisosst a
       LEFT JOIN \`Maestro_Vinculación\` v ON a.identificaciontrabajador = v.Identificación AND v.Estado = 'Activo'
       LEFT JOIN \`Maestro_Segmentación\` seg ON a.identificaciontrabajador = seg.Identificación
       ${where}
       ORDER BY a.fecha_registro DESC
       LIMIT 500`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error('[compromisosst] GET /api/compromisos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/compromiso/:id ═════
router.get('/api/compromiso/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;

    const [[c]] = await pool.execute(
      `SELECT a.*, u.Nombre AS nombre_creador, seg.Celular AS celular_trabajador
       FROM Dynamic_compromisosst a
       LEFT JOIN Maestro_Usuarios u ON a.usuario = u.ID
       LEFT JOIN Maestro_Segmentación seg ON a.identificaciontrabajador = seg.Identificación
       WHERE a.idcsst = ?`,
      [id]
    );

    if (!c) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    // Resolving signatures
    const tieneFirmaTrab = !!c.firma_trabajador;
    const tieneFirmaAna = !!c.firma_analista;

    let estado = 'ROJO'; // No signatures
    if (tieneFirmaTrab && !tieneFirmaAna) {
      estado = 'AMARILLO';
    } else if (tieneFirmaTrab && tieneFirmaAna) {
      estado = 'VERDE';
    }

    // Query signature of the logged-in user if passed
    let firmaUsuarioBase64 = null;
    if (usuario) {
      const userCC = await obtenerIdentificacionPorUsuarioORol(usuario, null);
      if (userCC) {
        firmaUsuarioBase64 = await obtenerFirmaBase64Reciente(userCC).catch(() => null);
      }
    }

    res.json({
      ...c,
      estado,
      tiene_firma_trabajador: tieneFirmaTrab,
      tiene_firma_analista: tieneFirmaAna,
      tiene_firma_lidersst: !!c.firma_lidersst,
      firma_usuario_base64: firmaUsuarioBase64
    });
  } catch (err) {
    console.error('[compromisosst] GET /api/compromiso/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/crear ═════
router.post('/api/crear', async (req, res) => {
  try {
    const {
      identificaciontrabajador,
      nombre_trabajador,
      cargo_trabajador,
      observaciones,
      usuario,
      enviar_correo
    } = req.body;

    if (!identificaciontrabajador || !nombre_trabajador || !cargo_trabajador || !usuario) {
      return res.status(400).json({ error: 'Todos los campos obligatorios deben ser diligenciados' });
    }

    const accesoCrear = await computarAccesoSst(usuario, SECCION_MENU_SST);
    if (!accesoCrear || !(await rolPuedeSst(accesoCrear.rol, SECCION_MENU_SST, 'crear'))) {
      return res.status(403).json({ error: 'No autorizado para crear compromisos SST.' });
    }

    // Limpieza de nombre del trabajador
    let cleanNombreTrabajador = nombre_trabajador || '';
    if (cleanNombreTrabajador.includes(' ** ')) {
      cleanNombreTrabajador = cleanNombreTrabajador.split(' ** ')[1] || cleanNombreTrabajador;
    }
    cleanNombreTrabajador = cleanNombreTrabajador.trim();

    // Resolving Analyst metadata
    const [userRows] = await pool.execute('SELECT Colaborador, Nombre FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    let analystCC = '';
    let analystName = '';
    let analystCargo = '';
    
    if (userRows.length) {
      const u = userRows[0];
      const colaborador = u.Colaborador || '';
      let parsedCC = '';
      if (colaborador.includes(' ** ')) {
        parsedCC = colaborador.split(' ** ')[0].trim();
      }

      let vinRows = [];
      if (parsedCC) {
        const [rows] = await pool.execute(
          `SELECT Identificación, Trabajador, Cargo 
           FROM \`Maestro_Vinculación\` 
           WHERE Identificación = ? 
           ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
          [parsedCC]
        );
        vinRows = rows;
      }

      if (!vinRows.length && colaborador) {
        // Fallback to name search
        const [rows] = await pool.execute(
          `SELECT Identificación, Trabajador, Cargo 
           FROM \`Maestro_Vinculación\` 
           WHERE Trabajador = ? 
           ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
          [colaborador]
        );
        vinRows = rows;
      }

      if (vinRows.length) {
        analystCC = vinRows[0].Identificación;
        analystName = vinRows[0].Trabajador;
        if (analystName.includes(' ** ')) {
          analystName = analystName.split(' ** ')[1];
        }
        analystCargo = vinRows[0].Cargo;
      } else {
        // Fallback for admin/system users not in Maestro_Vinculación
        analystCC = '0000000000';
        analystName = u.Nombre || usuario;
        analystCargo = 'SST ADMINISTRADOR/SISTEMA';
      }
    } else {
      analystCC = '0000000000';
      analystName = usuario;
      analystCargo = 'SST ADMINISTRADOR/SISTEMA';
    }

    const idcsst = uuidv4();
    const tokenTrab = crypto.randomBytes(32).toString('hex');
    const tokenTrabExp = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

    await pool.execute(
      `INSERT INTO Dynamic_compromisosst 
       (idcsst, identificaciontrabajador, nombre_trabajador, cargo_trabajador,
        identificacionanalista, nombre_analista, cargo_analista,
        firma_trabajador, url_firma_trabajador,
        firma_analista, url_firma_analista,
        firma_lidersst, url_firma_lidersst,
        url_doc, observaciones, token_trabajador, token_trabajador_expira, usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?)`,
      [
        idcsst,
        identificaciontrabajador,
        cleanNombreTrabajador,
        cargo_trabajador,
        analystCC,
        analystName,
        analystCargo,
        observaciones || '',
        tokenTrab,
        tokenTrabExp,
        usuario
      ]
    );

    // Enlace de firma trabajador
    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('host');
    const urlFirmaTrab = `${protocol}://${host}/compromisosst/firmar-trabajador?item=${idcsst}&token=${tokenTrab}`;

    if (enviar_correo) {
      const [segRows] = await pool.execute('SELECT Email FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1', [identificaciontrabajador]);
      const [usuRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
      const emailTrabajador = segRows.length ? segRows[0].Email : null;
      const emailUsuario = usuRows.length ? usuRows[0].Email : null;

      if (emailTrabajador) {
        enviarCorreoFirmaTrabajadorSST({
          email: emailTrabajador,
          nombreTrabajador: cleanNombreTrabajador,
          urlFirma: urlFirmaTrab,
          emailUsuario
        }).catch(e => console.error('[compromisosst] Error enviando correo al trabajador:', e.message));
      }
    }

    res.json({ ok: true, idcsst, urlFirmaTrab });
  } catch (err) {
    console.error('[compromisosst] POST /api/crear:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/crear-masivo ═════
router.post('/api/crear-masivo', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      identificaciones,
      observaciones,
      usuario,
      enviar_correo
    } = req.body;

    if (!identificaciones || !identificaciones.length || !usuario) {
      return res.status(400).json({ error: 'Todos los campos obligatorios deben ser diligenciados' });
    }

    const accesoCrearMasivo = await computarAccesoSst(usuario, SECCION_MENU_SST);
    if (!accesoCrearMasivo || !(await rolPuedeSst(accesoCrearMasivo.rol, SECCION_MENU_SST, 'crear'))) {
      return res.status(403).json({ error: 'No autorizado para crear compromisos SST.' });
    }

    // Resolving Analyst metadata
    const [userRows] = await conn.execute('SELECT Colaborador, Nombre FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    let analystCC = '0000000000';
    let analystName = usuario;
    let analystCargo = 'SST ADMINISTRADOR/SISTEMA';

    if (userRows.length) {
      const u = userRows[0];
      const colaborador = u.Colaborador || '';
      let parsedCC = '';
      if (colaborador.includes(' ** ')) {
        parsedCC = colaborador.split(' ** ')[0].trim();
      }

      let vinRows = [];
      if (parsedCC) {
        const [rows] = await conn.execute(
          `SELECT Identificación, Trabajador, Cargo 
           FROM \`Maestro_Vinculación\` 
           WHERE Identificación = ? 
           ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
          [parsedCC]
        );
        vinRows = rows;
      }

      if (!vinRows.length && colaborador) {
        const [rows] = await conn.execute(
          `SELECT Identificación, Trabajador, Cargo 
           FROM \`Maestro_Vinculación\` 
           WHERE Trabajador = ? 
           ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
          [colaborador]
        );
        vinRows = rows;
      }

      if (vinRows.length) {
        analystCC = vinRows[0].Identificación;
        analystName = vinRows[0].Trabajador;
        if (analystName.includes(' ** ')) {
          analystName = analystName.split(' ** ')[1];
        }
        analystCargo = vinRows[0].Cargo;
      } else {
        analystName = u.Nombre || usuario;
      }
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

      // Limpieza de nombre del trabajador
      let cleanNombreTrabajador = trabajadorNombre || '';
      if (cleanNombreTrabajador.includes(' ** ')) {
        cleanNombreTrabajador = cleanNombreTrabajador.split(' ** ')[1] || cleanNombreTrabajador;
      }
      cleanNombreTrabajador = cleanNombreTrabajador.trim();

      const idcsst = uuidv4();
      const tokenTrab = crypto.randomBytes(32).toString('hex');
      const tokenTrabExp = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

      await conn.execute(
        `INSERT INTO Dynamic_compromisosst 
         (idcsst, identificaciontrabajador, nombre_trabajador, cargo_trabajador,
          identificacionanalista, nombre_analista, cargo_analista,
          firma_trabajador, url_firma_trabajador,
          firma_analista, url_firma_analista,
          firma_lidersst, url_firma_lidersst,
          url_doc, observaciones, token_trabajador, token_trabajador_expira, usuario)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?)`,
        [
          idcsst,
          identificacion,
          cleanNombreTrabajador,
          cargo || '',
          analystCC,
          analystName,
          analystCargo,
          observaciones || '',
          tokenTrab,
          tokenTrabExp,
          usuario
        ]
      );

      // Obtener email y celular para notificación
      const [segRows] = await conn.execute('SELECT Email, Celular FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1', [identificacion]);
      const [usuRows] = await conn.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);

      const emailTrabajador = segRows.length ? segRows[0].Email : null;
      const celular = segRows.length ? segRows[0].Celular : null;
      const emailUsuario = usuRows.length ? usuRows[0].Email : null;

      const urlFirmaTrab = `${protocol}://${host}/compromisosst/firmar-trabajador?item=${idcsst}&token=${tokenTrab}`;

      resultados.push({
        identificacion,
        trabajador: cleanNombreTrabajador,
        celular,
        email: emailTrabajador,
        urlFirma: urlFirmaTrab
      });

      if (enviar_correo && emailTrabajador) {
        enviarCorreoFirmaTrabajadorSST({
          email: emailTrabajador,
          nombreTrabajador: cleanNombreTrabajador,
          urlFirma: urlFirmaTrab,
          emailUsuario
        }).catch(e => console.error('[compromisosst] Error enviando correo masivo al trabajador:', e.message));
      }
    }

    await conn.commit();
    res.json({ ok: true, resultados });
  } catch (err) {
    await conn.rollback();
    console.error('[compromisosst] POST /api/crear-masivo:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ═════ API: POST /api/firmar-trabajador ═════
router.post('/api/firmar-trabajador', async (req, res) => {
  try {
    const { idcsst, token, firma_base64 } = req.body;
    if (!idcsst || !token || !firma_base64) {
      return res.status(400).json({ error: 'idcsst, token y firma_base64 requeridos' });
    }

    const [rows] = await pool.execute(
      'SELECT * FROM Dynamic_compromisosst WHERE idcsst = ? AND token_trabajador = ?',
      [idcsst, token]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Registro de compromiso o token inválido' });
    }

    const c = rows[0];
    if (c.firma_trabajador) {
      return res.status(400).json({ error: 'El trabajador ya ha firmado anteriormente.' });
    }

    // Subir firma a GCS
    const buffer = Buffer.from(firma_base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const urlFirmaTrab = await subirFirma(c.identificaciontrabajador, buffer);

    await pool.execute(
      `UPDATE Dynamic_compromisosst 
       SET firma_trabajador = ?, url_firma_trabajador = ?, fecha_firma_trabajador = NOW(), token_trabajador = NULL, token_trabajador_expira = NULL
       WHERE idcsst = ?`,
      [firma_base64, urlFirmaTrab, idcsst]
    );

    // Notificar en la campana al usuario que creó el registro para que pueda firmar y generar el PDF
    crearNotificacionCompromisoSST(pool, {
      idcsst,
      identificacion: c.identificaciontrabajador,
      usuarioCreador: c.usuario,
      nombre_trabajador: c.nombre_trabajador
    }).catch(e => console.error('[compromisosst] Error creando notificación en campana:', e.message));

    res.json({ ok: true });
  } catch (err) {
    console.error('[compromisosst] POST /api/firmar-trabajador:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/firmar-analista ═════
router.post('/api/firmar-analista', async (req, res) => {
  try {
    const { idcsst, firma_base64, usuario } = req.body;
    if (!idcsst || !firma_base64) {
      return res.status(400).json({ error: 'idcsst y firma_base64 requeridos' });
    }

    if (!usuario) {
      return res.status(400).json({ error: 'Usuario requerido para firmar.' });
    }

    const acceso = await computarAccesoCSST(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado para firmar como Analista.' });
    }

    const [rows] = await pool.execute(
      'SELECT * FROM Dynamic_compromisosst WHERE idcsst = ?',
      [idcsst]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    const c = rows[0];
    if (!c.firma_trabajador) {
      return res.status(400).json({ error: 'El trabajador debe firmar antes del Analista SST.' });
    }
    if (c.firma_analista) {
      return res.status(400).json({ error: 'El Analista SST ya ha firmado anteriormente.' });
    }

    // Resolver datos del firmante actual (Plan B / Analista)
    const [userRows] = await pool.execute('SELECT Colaborador FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    let signerCC = '';
    let signerName = '';
    let signerCargo = '';
    if (userRows.length && userRows[0].Colaborador) {
      const colaborador = userRows[0].Colaborador;
      const [vinRows] = await pool.execute(
        `SELECT Identificación, Trabajador, Cargo 
         FROM \`Maestro_Vinculación\` 
         WHERE Trabajador = ? 
         ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
        [colaborador]
      );
      if (vinRows.length) {
        signerCC = vinRows[0].Identificación;
        signerName = vinRows[0].Trabajador;
        if (signerName.includes(' ** ')) {
          signerName = signerName.split(' ** ')[1];
        }
        signerCargo = vinRows[0].Cargo;
      }
    }

    const finalCC = signerCC || c.identificacionanalista;
    const finalName = signerName || c.nombre_analista;
    const finalCargo = signerCargo || c.cargo_analista;

    // Subir firma del Analista a GCS
    const buffer = Buffer.from(firma_base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const urlFirmaAna = await subirFirma(finalCC, buffer);

    // 1. Obtener el nombre del Líder SST de la tabla Maestro_Usuarios (Rol = 'LiderSst')
    const nombreLiderSst = await nombreLiderSstPorDefecto();

    // 2. Obtener firma del Líder SST en base64 y su URL
    const urlFirmaLider = 'https://storage.googleapis.com/firmas-images/1035427104/firmalidersst.png';
    const firmaLiderBase64 = await obtenerFirmaBase64Reciente('1035427104').catch(() => null) || 'FIRMADO_LIDER_AUTOMATICO';

    // 3. Generar PDF del compromiso inmediatamente
    const fechaDoc = hoyBogotaStr();
    const fechaFirma = new Date(); // la del Líder SST se pone en el mismo momento
    const urlDoc = await armarPdfCompromiso({
      ...c,
      nombre_analista: finalName,
      cargo_analista: finalCargo,
      url_firma_analista: urlFirmaAna,
      url_firma_lidersst: urlFirmaLider,
      nombre_lidersst: nombreLiderSst,
      fecha_firma_analista: fechaFirma,
      fecha_firma_lidersst: fechaFirma,
      fecha_documento: fechaDoc,
    });

    // 4. Actualizar registro en la base de datos (con firmas de Analista y Líder, y url_doc)
    await pool.execute(
      `UPDATE Dynamic_compromisosst
       SET firma_analista = ?, url_firma_analista = ?, fecha_firma_analista = ?,
           identificacionanalista = ?, nombre_analista = ?, cargo_analista = ?,
           firma_lidersst = ?, url_firma_lidersst = ?, fecha_firma_lidersst = ?, nombre_lidersst = ?, url_doc = ?, fecha_documento = ?,
           token_lidersst = NULL, token_lidersst_expira = NULL
       WHERE idcsst = ?`,
      [
        firma_base64,
        urlFirmaAna,
        fechaFirma,
        finalCC,
        finalName,
        finalCargo,
        firmaLiderBase64,
        urlFirmaLider,
        fechaFirma,
        nombreLiderSst,
        urlDoc,
        fechaDoc,
        idcsst
      ]
    );

    // 5. Registrar en Maestro_docTrabajador (Tipo 72, Prefijo CSST)
    await registrarDocumentoTrabajador(c.identificaciontrabajador, urlDoc, c.usuario, 72, 'CSST');

    // 6. Actualizar notificación en la campana con el PDF final generado
    pool.execute(
      `UPDATE Maestro_notificaciones 
       SET resultado = 'COMPLETADO', url_doc = ?, titulo = 'Compromiso SST Completado' 
       WHERE modulo = 'csst' AND referencia_id = ?`,
      [urlDoc, idcsst]
    ).catch(e => console.error('[compromisosst] Error actualizando notificación CSST:', e.message));



    res.json({ ok: true, urlDoc });
  } catch (err) {
    console.error('[compromisosst] POST /api/firmar-analista:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/firmar-lider ═════
router.post('/api/firmar-lider', async (req, res) => {
  try {
    const { idcsst, token, firma_base64 } = req.body;
    if (!idcsst || !token || !firma_base64) {
      return res.status(400).json({ error: 'idcsst, token y firma_base64 requeridos' });
    }

    const [rows] = await pool.execute(
      'SELECT * FROM Dynamic_compromisosst WHERE idcsst = ? AND token_lidersst = ?',
      [idcsst, token]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Registro de compromiso o token de líder SST inválido' });
    }

    const c = rows[0];
    if (c.firma_lidersst) {
      return res.status(400).json({ error: 'El Líder SST ya ha firmado anteriormente.' });
    }

    // Buscar nombre del Líder SST en Maestro_firma_corporativa
    const [[liderRow]] = await pool.execute(
      "SELECT nombre FROM Maestro_firma_corporativa WHERE email = 'sst.nacional@logyser.com' LIMIT 1"
    );
    const nombreLiderSst = liderRow ? liderRow.nombre : NOMBRE_LIDER_SST_DEFECTO;

    // Subir firma de la Líder SST a GCS
    const buffer = Buffer.from(firma_base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const urlFirmaLider = await subirFirma('1035427104', buffer); // C.C. Líder

    // ═════ GENERACIÓN DE PDF COMPROMISO ═════
    const fechaDoc = hoyBogotaStr();
    const fechaFirma = new Date();
    const urlDoc = await armarPdfCompromiso({
      ...c,
      url_firma_lidersst: urlFirmaLider,
      nombre_lidersst: nombreLiderSst,
      fecha_firma_lidersst: fechaFirma,
      fecha_documento: fechaDoc,
    });

    // Actualizar registro en base de datos
    await pool.execute(
      `UPDATE Dynamic_compromisosst
       SET firma_lidersst = ?, url_firma_lidersst = ?, fecha_firma_lidersst = ?, nombre_lidersst = ?, url_doc = ?, fecha_documento = ?,
           token_lidersst = NULL, token_lidersst_expira = NULL
       WHERE idcsst = ?`,
      [firma_base64, urlFirmaLider, fechaFirma, nombreLiderSst, urlDoc, fechaDoc, idcsst]
    );

    // Registrar en Maestro_docTrabajador (Tipo 72, Prefijo CSST)
    await registrarDocumentoTrabajador(c.identificaciontrabajador, urlDoc, c.usuario, 72, 'CSST');

    // Actualizar notificación en la campana con el PDF final generado
    pool.execute(
      `UPDATE Maestro_notificaciones 
       SET resultado = 'COMPLETADO', url_doc = ?, titulo = 'Compromiso SST Completado' 
       WHERE modulo = 'csst' AND referencia_id = ?`,
      [urlDoc, idcsst]
    ).catch(e => console.error('[compromisosst] Error actualizando notificación CSST:', e.message));

    res.json({ ok: true, urlDoc });
  } catch (err) {
    console.error('[compromisosst] POST /api/firmar-lider:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/firmar-lider-directo ═════
router.post('/api/firmar-lider-directo', async (req, res) => {
  try {
    const { idcsst, firma_base64, usuario } = req.body;
    if (!idcsst || !firma_base64 || !usuario) {
      return res.status(400).json({ error: 'idcsst, firma_base64 y usuario requeridos' });
    }

    const acceso = await computarAccesoCSST(usuario);
    if (!acceso || !['LiderSst', 'AdmSst', 'Sistema'].includes(acceso.rol)) {
      return res.status(403).json({ error: 'Usuario no autorizado para firmar como Líder SST.' });
    }

    const [rows] = await pool.execute(
      'SELECT * FROM Dynamic_compromisosst WHERE idcsst = ?',
      [idcsst]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Registro de compromiso no encontrado' });
    }

    const c = rows[0];
    if (!c.firma_analista) {
      return res.status(400).json({ error: 'El Analista SST debe firmar antes del Líder SST.' });
    }
    if (c.firma_lidersst) {
      return res.status(400).json({ error: 'El Líder SST ya ha firmado anteriormente.' });
    }

    let nombreLiderSst = NOMBRE_LIDER_SST_DEFECTO;
    if (acceso.rol === 'LiderSst' || acceso.rol === 'AdmSst') {
      nombreLiderSst = acceso.usuarioNombre;
    } else {
      const [[liderRow]] = await pool.execute(
        "SELECT nombre FROM Maestro_firma_corporativa WHERE email = 'sst.nacional@logyser.com' LIMIT 1"
      );
      if (liderRow) nombreLiderSst = liderRow.nombre;
    }

    // Subir firma de la Líder SST a GCS
    const buffer = Buffer.from(firma_base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const signerCC = await obtenerIdentificacionPorUsuarioORol(usuario, null);
    const finalCC = signerCC || '1035427104';
    const urlFirmaLider = await subirFirma(finalCC, buffer);

    // ═════ GENERACIÓN DE PDF COMPROMISO ═════
    const fechaDoc = hoyBogotaStr();
    const fechaFirma = new Date();
    const urlDoc = await armarPdfCompromiso({
      ...c,
      url_firma_lidersst: urlFirmaLider,
      nombre_lidersst: nombreLiderSst,
      fecha_firma_lidersst: fechaFirma,
      fecha_documento: fechaDoc,
    });

    // Actualizar registro en base de datos
    await pool.execute(
      `UPDATE Dynamic_compromisosst
       SET firma_lidersst = ?, url_firma_lidersst = ?, fecha_firma_lidersst = ?, nombre_lidersst = ?, url_doc = ?, fecha_documento = ?,
           token_lidersst = NULL, token_lidersst_expira = NULL
       WHERE idcsst = ?`,
      [firma_base64, urlFirmaLider, fechaFirma, nombreLiderSst, urlDoc, fechaDoc, idcsst]
    );

    // Registrar en Maestro_docTrabajador (Tipo 72, Prefijo CSST)
    await registrarDocumentoTrabajador(c.identificaciontrabajador, urlDoc, c.usuario, 72, 'CSST');

    // Notificar al Analista SST que el proceso concluyó
    const [usuRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [c.usuario]);
    const emailUsuario = usuRows.length ? usuRows[0].Email : null;
    if (emailUsuario) {
      await enviarNotificacionCompletadoSST({
        emailUsuario,
        nombreTrabajador: c.nombre_trabajador,
        identificacion: c.identificaciontrabajador,
        urlDoc
      }).catch(e => console.error('[compromisosst] Error enviando correo de completado al Analista SST:', e.message));
    }

    res.json({ ok: true, urlDoc });
  } catch (err) {
    console.error('[compromisosst] POST /api/firmar-lider-directo:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: PUT /api/compromiso/:id ═════
// Edita cargo, fecha del documento y observaciones. Con el PDF ya generado solo los roles de
// Config_Parametros (sst / Compromiso SST, editarFirmado), y se regenera con las mismas firmas.
router.put('/api/compromiso/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { cargo_trabajador, fecha_documento, observaciones } = req.body;
    const acceso = await computarAccesoCSST(req.body.usuario || req.query.usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'No autorizado para editar el compromiso.' });
    }

    const [[c]] = await pool.execute('SELECT * FROM Dynamic_compromisosst WHERE idcsst = ?', [id]);
    if (!c) return res.status(404).json({ error: 'Compromiso no encontrado' });

    const estaGenerado = !!c.url_doc;
    if (!(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, estaGenerado ? 'editarFirmado' : 'crear'))) {
      return res.status(403).json({
        error: estaGenerado
          ? 'Tu rol no tiene permiso para editar y regenerar el PDF de un compromiso ya firmado.'
          : 'No autorizado para editar el compromiso.',
      });
    }

    const nuevoCargo = String(cargo_trabajador == null ? c.cargo_trabajador || '' : cargo_trabajador).trim();
    if (!nuevoCargo) return res.status(400).json({ error: 'El cargo es obligatorio.' });

    // La fecha del documento solo aplica cuando ya hay PDF (es la fecha que se imprime)
    let nuevaFecha = fechaIso(c.fecha_documento);
    if (estaGenerado) {
      nuevaFecha = fecha_documento ? String(fecha_documento).slice(0, 10) : fechaDocumentoCompromiso(c);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha)) return res.status(400).json({ error: 'Fecha del documento inválida.' });
      if (nuevaFecha > hoyBogotaStr()) return res.status(400).json({ error: 'La fecha del documento no puede ser superior a hoy.' });
    }
    const nuevasObs = observaciones === undefined ? c.observaciones : (observaciones || '');

    await pool.execute(
      'UPDATE Dynamic_compromisosst SET cargo_trabajador = ?, fecha_documento = ?, observaciones = ? WHERE idcsst = ?',
      [nuevoCargo, nuevaFecha, nuevasObs, id]
    );

    let urlDoc = c.url_doc;
    if (estaGenerado) {
      urlDoc = await regenerarPdfCompromiso({ ...c, cargo_trabajador: nuevoCargo, fecha_documento: nuevaFecha, observaciones: nuevasObs });
    }

    res.json({ ok: true, url_doc: urlDoc });
  } catch (err) {
    console.error('[compromisosst] PUT /api/compromiso/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/compromiso/:id/regenerar-pdf ═════
// Rehace el PDF ya generado con la plantilla vigente (Maestro_Plantillas) y las mismas firmas.
router.post('/api/compromiso/:id/regenerar-pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const acceso = await computarAccesoCSST(req.body.usuario || req.query.usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, 'editarFirmado'))) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para regenerar el PDF de un compromiso firmado.' });
    }

    const [rows] = await pool.execute('SELECT * FROM Dynamic_compromisosst WHERE idcsst = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Compromiso no encontrado' });
    if (!rows[0].url_doc) return res.status(400).json({ error: 'Este compromiso aún no tiene el PDF generado.' });

    const urlDoc = await regenerarPdfCompromiso(rows[0]);
    res.json({ ok: true, idcsst: id, url_doc: urlDoc });
  } catch (err) {
    console.error('[compromisosst] POST /api/compromiso/:id/regenerar-pdf:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/compromiso/:id/regenerar-token ═════
router.post('/api/compromiso/:id/regenerar-token', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;

    const acceso = await computarAccesoCSST(usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, 'crear'))) {
      return res.status(403).json({ error: 'No autorizado para regenerar el enlace.' });
    }

    const [rows] = await pool.execute(
      'SELECT * FROM Dynamic_compromisosst WHERE idcsst = ?',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Compromiso no encontrado' });
    }

    const c = rows[0];
    if (c.firma_trabajador) {
      return res.status(400).json({ error: 'El compromiso ya ha sido firmado por el trabajador.' });
    }

    // Generar nuevo token y extender expira a 48h
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await pool.execute(
      'UPDATE Dynamic_compromisosst SET token_trabajador = ?, token_trabajador_expira = ? WHERE idcsst = ?',
      [token, expira, id]
    );

    res.json({ ok: true, token, token_trabajador_expira: expira });
  } catch (err) {
    console.error('[compromisosst] POST /api/compromiso/:id/regenerar-token:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/compromiso/:id/enviar-enlace ═════
router.post('/api/compromiso/:id/enviar-enlace', async (req, res) => {
  try {
    const { id } = req.params;
    const { canal } = req.body;
    const accesoAccion = await computarAccesoCSST(req.body.usuario || req.query.usuario);
    if (!accesoAccion || !(await rolPuedeSst(accesoAccion.rol, SECCION_MENU_SST, 'crear'))) {
      return res.status(403).json({ error: 'No autorizado para enviar el enlace.' });
    }

    const [rows] = await pool.execute(
      'SELECT * FROM Dynamic_compromisosst WHERE idcsst = ?',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Compromiso no encontrado' });
    }

    const c = rows[0];
    if (c.firma_trabajador) {
      return res.status(400).json({ error: 'El trabajador ya ha firmado.' });
    }

    let token = c.token_trabajador;
    let expira = c.token_trabajador_expira;
    if (!token || !expira || new Date(expira) < new Date()) {
      token = crypto.randomBytes(32).toString('hex');
      expira = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await pool.execute(
        'UPDATE Dynamic_compromisosst SET token_trabajador = ?, token_trabajador_expira = ? WHERE idcsst = ?',
        [token, expira, id]
      );
    }

    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('host');
    const urlFirma = `${protocol}://${host}/compromisosst/firmar-trabajador?item=${id}&token=${token}`;

    if (canal === 'email') {
      const [segRows] = await pool.execute('SELECT Email FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1', [c.identificaciontrabajador]);
      const [usuRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [c.usuario]);

      const emailTrabajador = segRows.length ? segRows[0].Email : null;
      const emailUsuario = usuRows.length ? usuRows[0].Email : null;

      if (!emailTrabajador) {
        return res.status(400).json({ error: 'No se encontró correo electrónico para el trabajador' });
      }

      await enviarCorreoFirmaTrabajadorSST({
        email: emailTrabajador,
        nombreTrabajador: c.nombre_trabajador,
        urlFirma,
        emailUsuario
      });

      return res.json({ ok: true, mensaje: 'Enlace enviado al correo del trabajador' });
    }

    res.json({ ok: true, urlFirma });
  } catch (err) {
    console.error('[compromisosst] POST /api/compromiso/:id/enviar-enlace:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: DELETE /api/compromiso/:id ═════
router.delete('/api/compromiso/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;

    if (!usuario) {
      return res.status(400).json({ error: 'Parámetro usuario requerido' });
    }

    const acceso = await computarAccesoCSST(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autenticado o no autorizado' });
    }

    // 1. Verificar si existe el compromiso y su estado de firma
    const [rows] = await pool.execute(
      'SELECT identificaciontrabajador, usuario, url_doc, firma_trabajador, firma_analista, firma_lidersst FROM Dynamic_compromisosst WHERE idcsst = ? LIMIT 1',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Compromiso no encontrado' });
    }
    const c = rows[0];
    const estaFirmado = !!(c.url_doc || c.firma_trabajador || c.firma_analista || c.firma_lidersst);

    if (estaFirmado) {
      // 2a. Con firmas o PDF: solo los roles de "Roles que pueden eliminar compromisos SST firmados",
      //     y se quita también su documento de Maestro_docTrabajador
      if (!(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, 'eliminarFirmado'))) {
        return res.status(400).json({ error: 'No se puede eliminar un compromiso que ya cuenta con firmas o documento generado.' });
      }
      if (c.url_doc) {
        await pool.execute(
          "DELETE FROM Maestro_docTrabajador WHERE Identificación = ? AND Prefijo = 'CSST' AND Doc = ?",
          [String(c.identificaciontrabajador), c.url_doc]
        );
      }
    } else {
      // 2b. Sin firmar: rol con permiso de eliminar en la pestaña (Config_Parametros, sst / pestaña);
      //     Sistema elimina cualquiera, los demás solo los creados por su propio usuario
      if (!(await rolPuedeSst(acceso.rol, SECCION_MENU_SST, 'eliminar'))) {
        return res.status(403).json({ error: 'Tu rol no tiene permiso para eliminar estos registros.' });
      }

      const esSistema = acceso.rol === 'Sistema';
      const creador = String(c.usuario || '').trim().toLowerCase();
      const usuSolicitante = String(usuario).trim().toLowerCase();
      const nombreSolicitante = String(acceso.usuarioNombre || '').trim().toLowerCase();
      const esPropio = creador && (creador === usuSolicitante || creador === nombreSolicitante);

      if (!esSistema && !esPropio) {
        return res.status(403).json({ error: 'Solo puedes eliminar registros creados por tu propio usuario.' });
      }
    }

    await pool.execute('DELETE FROM Dynamic_compromisosst WHERE idcsst = ?', [id]);
    res.json({ ok: true, idcsst: id });
  } catch (err) {
    console.error('[compromisosst] DELETE /api/compromiso/:id:', err);
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
      modulo: 'csst',
      limit
    });

    res.json(data);
  } catch (err) {
    console.error('[compromisosst] GET /api/notificaciones:', err);
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
    console.error('[compromisosst] POST /api/notificaciones/marcar-leidas:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/notificaciones/marcar-todas-leidas', async (req, res) => {
  try {
    const { usuario } = req.body;
    if (!usuario) return res.status(400).json({ error: 'Parámetro usuario requerido' });

    const result = await marcarTodasLeidas(pool, {
      usuarioId: usuario,
      modulo: 'csst'
    });

    res.json(result);
  } catch (err) {
    console.error('[compromisosst] POST /api/notificaciones/marcar-todas-leidas:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
