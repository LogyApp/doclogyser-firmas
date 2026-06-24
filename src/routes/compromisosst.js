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
const { obtenerPlantilla, reemplazarVariables } = require('../services/plantilla');
const { generarPDF } = require('../services/renderer');

const router = express.Router();

const HTML_INDEX_PATH = path.join(__dirname, '../views/compromisosst/index.html');
const HTML_FORM_PATH  = path.join(__dirname, '../views/formcompromisosst/form.html');
const HTML_SIGN_TRAB_PATH  = path.join(__dirname, '../views/compromisosst/firmar_trabajador.html');
const HTML_SIGN_LIDER_PATH  = path.join(__dirname, '../views/compromisosst/firmar_lider.html');

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

async function computarAccesoCSST(usuarioId) {
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

  acceso.opsPorRegional = agruparOperacionesPorRegional(opRows);
  acceso.operacionesFiltro = opRows.map((row) => row['OPERACIÓN'] || row['Operación']).filter(Boolean);

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

    const acceso = await computarAccesoCSST(usuario);
    if (!acceso) {
      return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');
    }

    const initialView = (req.baseUrl || '').toLowerCase().includes('/formcompromisosst')
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
      params.push(`%${trabajador}%`);
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
        a.firma_trabajador,
        a.firma_analista,
        a.firma_lidersst,
        a.url_doc,
        a.usuario,
        a.fecha_registro
       FROM Dynamic_compromisosst a
       LEFT JOIN \`Maestro_Vinculación\` v ON a.identificaciontrabajador = v.Identificación AND v.Estado = 'Activo'
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
      `SELECT a.*, u.Nombre AS nombre_creador
       FROM Dynamic_compromisosst a
       LEFT JOIN Maestro_Usuarios u ON a.usuario = u.ID
       WHERE a.idcsst = ?`,
      [id]
    );

    if (!c) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    // Resolving signatures
    const tieneFirmaTrab = !!c.firma_trabajador;
    const tieneFirmaAna = !!c.firma_analista;
    const tieneFirmaLid = !!c.firma_lidersst;

    let estado = 'ROJO'; // No signatures
    if (tieneFirmaTrab && !tieneFirmaAna) {
      estado = 'AMARILLO';
    } else if (tieneFirmaTrab && tieneFirmaAna && !tieneFirmaLid) {
      estado = 'AZUL';
    } else if (tieneFirmaTrab && tieneFirmaAna && tieneFirmaLid) {
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
      tiene_firma_lidersst: tieneFirmaLid,
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

    // Limpieza de nombre del trabajador
    let cleanNombreTrabajador = nombre_trabajador || '';
    if (cleanNombreTrabajador.includes(' ** ')) {
      cleanNombreTrabajador = cleanNombreTrabajador.split(' ** ')[1] || cleanNombreTrabajador;
    }
    cleanNombreTrabajador = cleanNombreTrabajador.trim();

    // Resolving Analyst metadata
    const [userRows] = await pool.execute('SELECT Colaborador FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    let analystCC = '';
    let analystName = '';
    let analystCargo = '';
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
        analystCC = vinRows[0].Identificación;
        analystName = vinRows[0].Trabajador;
        if (analystName.includes(' ** ')) {
          analystName = analystName.split(' ** ')[1];
        }
        analystCargo = vinRows[0].Cargo;
      }
    }

    if (!analystCC) {
      return res.status(400).json({ error: 'No se pudo resolver la identificación del Analista SST logueado en Maestro_Vinculación.' });
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
        await enviarCorreoFirmaTrabajadorSST({
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
       SET firma_trabajador = ?, url_firma_trabajador = ?, token_trabajador = NULL, token_trabajador_expira = NULL 
       WHERE idcsst = ?`,
      [firma_base64, urlFirmaTrab, idcsst]
    );

    // Notificar al Analista SST (usuario creador)
    const [usuRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [c.usuario]);
    const emailUsuario = usuRows.length ? usuRows[0].Email : null;
    if (emailUsuario) {
      await enviarNotificacionTrabajadorFirmoSST({
        emailUsuario,
        nombreTrabajador: c.nombre_trabajador,
        identificacion: c.identificaciontrabajador
      }).catch(e => console.error('[compromisosst] Error enviando correo al Analista SST:', e.message));
    }

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

    if (usuario) {
      const acceso = await computarAccesoCSST(usuario);
      if (!acceso) {
        return res.status(403).json({ error: 'Usuario no autorizado para firmar como Analista.' });
      }
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

    // Subir firma del Analista a GCS
    const buffer = Buffer.from(firma_base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const urlFirmaAna = await subirFirma(c.identificacionanalista, buffer);

    // Generar token para Líder SST
    const tokenLider = crypto.randomBytes(32).toString('hex');
    const tokenLiderExp = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 horas para Líder

    await pool.execute(
      `UPDATE Dynamic_compromisosst 
       SET firma_analista = ?, url_firma_analista = ?, token_lidersst = ?, token_lidersst_expira = ? 
       WHERE idcsst = ?`,
      [firma_base64, urlFirmaAna, tokenLider, tokenLiderExp, idcsst]
    );

    // Notificar al Líder SST (sst.nacional@logyser.com)
    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('host');
    const urlFirmaLider = `${protocol}://${host}/compromisosst/firmar-lider?item=${idcsst}&token=${tokenLider}`;

    await enviarCorreoFirmaLiderSST({
      emailLider: 'sst.nacional@logyser.com',
      nombreTrabajador: c.nombre_trabajador,
      nombreAnalista: c.nombre_analista,
      urlFirma: urlFirmaLider
    }).catch(e => console.error('[compromisosst] Error enviando correo a Líder SST:', e.message));

    res.json({ ok: true });
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
    const nombreLiderSst = liderRow ? liderRow.nombre : 'YULIED ECHAVARRÍA VASCO';

    // Subir firma de la Líder SST a GCS
    const buffer = Buffer.from(firma_base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const urlFirmaLider = await subirFirma('1035427104', buffer); // C.C. Líder

    // ═════ GENERACIÓN DE PDF COMPROMISO ═════
    const plantilla = await obtenerPlantilla('compromisosst');
    const fechaFmt = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });
    
    // Obtener regional del trabajador para el PDF
    const [vinRows] = await pool.execute(
      'SELECT Regional, `Operación` FROM Maestro_Vinculación WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [c.identificaciontrabajador]
    );
    const opTrabajador = vinRows.length ? `${vinRows[0]['Operación']} (${vinRows[0].Regional})` : 'LOG&SER S.A.S.';

    const datos = {
      fecha:             fechaFmt,
      nombre_trabajador: String(c.nombre_trabajador).toUpperCase(),
      identificacion:    String(c.identificaciontrabajador),
      operacion:         opTrabajador,
      nombre_analista:   c.nombre_analista || '—',
      nombre_lidersst:   nombreLiderSst,
      firma_trabajador:  `<img src="${c.url_firma_trabajador}" style="height:70px;display:block;margin:0 auto">`,
      firma_analista:    `<img src="${c.url_firma_analista}" style="height:70px;display:block;margin:0 auto">`,
      firma_lidersst:    `<img src="${urlFirmaLider}" style="height:70px;display:block;margin:0 auto">`
    };

    const htmlFinal = reemplazarVariables(plantilla.contenido_html, datos);
    const pdfBuffer = await generarPDF(htmlFinal);

    // Guardar PDF en el bucket
    const timestamp = formatTimestamp();
    const urlDoc = await subirPDFCompromisoSST(c.identificaciontrabajador, timestamp, pdfBuffer);

    // Actualizar registro en base de datos
    await pool.execute(
      `UPDATE Dynamic_compromisosst 
       SET firma_lidersst = ?, url_firma_lidersst = ?, url_doc = ?, token_lidersst = NULL, token_lidersst_expira = NULL 
       WHERE idcsst = ?`,
      [firma_base64, urlFirmaLider, urlDoc, idcsst]
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

    let nombreLiderSst = 'YULIED ECHAVARRÍA VASCO';
    if (acceso.rol === 'LiderSst') {
      nombreLiderSst = acceso.usuarioNombre;
    } else {
      const [[liderRow]] = await pool.execute(
        "SELECT nombre FROM Maestro_firma_corporativa WHERE email = 'sst.nacional@logyser.com' LIMIT 1"
      );
      if (liderRow) nombreLiderSst = liderRow.nombre;
    }

    // Subir firma de la Líder SST a GCS
    const buffer = Buffer.from(firma_base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const urlFirmaLider = await subirFirma('1035427104', buffer); // C.C. Líder

    // ═════ GENERACIÓN DE PDF COMPROMISO ═════
    const plantilla = await obtenerPlantilla('compromisosst');
    const fechaFmt = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });
    
    // Obtener regional del trabajador para el PDF
    const [vinRows] = await pool.execute(
      'SELECT Regional, `Operación` FROM Maestro_Vinculación WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [c.identificaciontrabajador]
    );
    const opTrabajador = vinRows.length ? `${vinRows[0]['Operación']} (${vinRows[0].Regional})` : 'LOG&SER S.A.S.';

    const datos = {
      fecha:             fechaFmt,
      nombre_trabajador: String(c.nombre_trabajador).toUpperCase(),
      identificacion:    String(c.identificaciontrabajador),
      operacion:         opTrabajador,
      nombre_analista:   c.nombre_analista || '—',
      nombre_lidersst:   nombreLiderSst,
      firma_trabajador:  `<img src="${c.url_firma_trabajador}" style="height:70px;display:block;margin:0 auto">`,
      firma_analista:    `<img src="${c.url_firma_analista}" style="height:70px;display:block;margin:0 auto">`,
      firma_lidersst:    `<img src="${urlFirmaLider}" style="height:70px;display:block;margin:0 auto">`
    };

    const htmlFinal = reemplazarVariables(plantilla.contenido_html, datos);
    const pdfBuffer = await generarPDF(htmlFinal);

    // Guardar PDF en el bucket
    const timestamp = formatTimestamp();
    const urlDoc = await subirPDFCompromisoSST(c.identificaciontrabajador, timestamp, pdfBuffer);

    // Actualizar registro en base de datos
    await pool.execute(
      `UPDATE Dynamic_compromisosst 
       SET firma_lidersst = ?, url_firma_lidersst = ?, url_doc = ?, token_lidersst = NULL, token_lidersst_expira = NULL 
       WHERE idcsst = ?`,
      [firma_base64, urlFirmaLider, urlDoc, idcsst]
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

// ═════ API: POST /api/compromiso/:id/enviar-enlace ═════
router.post('/api/compromiso/:id/enviar-enlace', async (req, res) => {
  try {
    const { id } = req.params;
    const { canal } = req.body;

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

module.exports = router;
