const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');
const { randomUUID } = require('crypto');
const { notificarSolicitudCambioEstado } = require('../services/email');
const { despacharSolicitud, completarSolicitud } = require('../solicitudes/kardex.service');
const { storage } = require('../services/storage');
const multer = require('multer');
const {
  esAprobadorSolicitud,
  obtenerConfigSolicitudes,
  obtenerDestinatariosSolicitud,
  obtenerCategoriasRestringidas,
  normalizarTexto,
} = require('../services/configInventario');
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();
const HTML_PATH = path.join(__dirname, '../views/solicitudes/index.html');

// Reglas de Solicitudes en Config_Parametros (inventario / Solicitudes): aprobadores y
// correo por categoría, editar cerradas, eliminar, etc. Ver services/configInventario.js.
const SECCION_SOLICITUDES = 'Solicitudes';
const ESTADOS_PERMITIDOS_CAMBIO = ['PENDIENTE', 'APROBADA', 'PARCIAL', 'RECHAZADA', 'VALIDAR', 'COMPLETADA', 'CANCELADA'];


function agruparOperacionesPorRegional(rows) {
  const opsPorRegional = {};
  rows.forEach((row) => {
    const regional = row.REGIONAL || row.Regional || '';
    const operacion = row['OPERACIÓN'] || row['Operación'] || row.OPERACIÓN || row.Operacion;
    if (!regional || !operacion) return;
    if (!opsPorRegional[regional]) opsPorRegional[regional] = [];
    opsPorRegional[regional].push(operacion);
  });
  return opsPorRegional;
}

// Envía correo de notificación al solicitante y a los aprobadores según categoría.
// Fire-and-forget: no lanza excepciones.
async function _enviarEmailEstado(idSolicitud, estadoAnterior, estadoNuevo, quienCambioId) {
  try {
    const [[sol]] = await pool.execute(
      'SELECT *, `Operación` FROM Dynamic_Solicitudes WHERE IdSolicitud = ?',
      [idSolicitud]
    );
    if (!sol) return;

    const [[solicitanteRow]] = await pool.execute(
      'SELECT Nombre, Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
      [sol.Usuario]
    );

    // Solicitudes generadas automáticamente desde Maestro_Vinculación (Observaciones inicia con
    // "AUTOMATICO"): al pasar a PENDIENTE o APROBADA se notifica a "Notificación solicitud
    // automática - Para:" y a quien hizo el cambio — no a los roles de la categoría ni al solicitante.
    const esSolicitudAutomatica = String(sol.Observaciones || '').trim().toUpperCase().startsWith('AUTOMATICO');
    const modoAutomatico = esSolicitudAutomatica && ['PENDIENTE', 'APROBADA'].includes(estadoNuevo);
    const destinatarios = await obtenerDestinatariosSolicitud(sol.Categoria, { automatica: modoAutomatico });
    if (!destinatarios.habilitado) return; // "Habilitar notificaciones de correo en Solicitudes" = 0

    const [items] = await pool.execute(
      `SELECT i.Cantidad, a.Articulo
       FROM Dynamic_Solicitudes_Items i
       LEFT JOIN Dynamic_Articulos a ON a.Id = i.IdArticulo
       WHERE i.IdSolicitud = ?`,
      [idSolicitud]
    );

    let quienCambioNombre = quienCambioId;
    let quienCambioEmail = null;
    if (quienCambioId) {
      const [[whoRow]] = await pool.execute(
        'SELECT Nombre, Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
        [quienCambioId]
      );
      if (whoRow) {
        quienCambioEmail = whoRow.Email || null;
        if (quienCambioId !== sol.Usuario) quienCambioNombre = whoRow.Nombre || quienCambioId;
      }
    }

    // Roles de "Notificación solicitud <CATEGORÍA> - Para:" (Config_Parametros) + quien solicitó
    let emailsAprobadores = destinatarios.para;
    let emailSolicitante = solicitanteRow?.Email || null;

    if (modoAutomatico) {
      const emailsEspeciales = [...new Set([...destinatarios.para, quienCambioEmail].filter(Boolean))];
      if (estadoNuevo === 'PENDIENTE') {
        emailsAprobadores = emailsEspeciales;
        emailSolicitante = null;
      } else {
        emailsAprobadores = [];
        emailSolicitante = emailsEspeciales.join(', ');
      }
    }

    await notificarSolicitudCambioEstado({
      idSolicitud,
      operacion: sol['Operación'],
      regional: sol.Regional,
      categoria: sol.Categoria,
      prioridad: sol.Prioridad,
      estadoNuevo,
      estadoAnterior,
      fechaSolicitud: sol.FechaSolicitud,
      usuarioSolicitante: solicitanteRow?.Nombre || sol.Usuario,
      emailSolicitante,
      emailsAprobadores,
      items,
      observaciones: sol.Observaciones,
      quienCambio: quienCambioNombre,
    });
  } catch (err) {
    console.error('[solicitudes] Error enviando email cambio estado:', err);
  }
}

async function computarAccesoSolicitud(usuarioId) {
  if (!usuarioId) return null;

  const [uRows] = await pool.execute(
    'SELECT ID, Nombre, Rol, Regional, Dispositivo, `Operación` FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );
  if (!uRows.length) return null;

  const usuario = uRows[0];
  const rol = usuario.Rol || '';
  const regional = usuario.Regional || '';
  const dispositivo = usuario.Dispositivo || '';
  const operacion = usuario['Operación'] || '';

  // Acceso del rol en la pestaña Solicitudes (Maestro_Menu_Inventario, Sección 'Solicitudes').
  // Antes se tomaba la primera sección del rol, sin filtrar.
  const [menuRows] = await pool.execute(
    'SELECT Acceso FROM Maestro_Menu_Inventario WHERE Rol = ? AND `Sección` = ? LIMIT 1',
    [rol, SECCION_SOLICITUDES]
  );

  let accesoCode = null;
  if (menuRows.length > 0) {
    accesoCode = menuRows[0].Acceso;
  }

  const acceso = {
    usuarioId: usuario.ID,
    usuarioNombre: usuario.Nombre || usuario.ID,
    rol,
    regional,
    dispositivo,
    operacion,
    accesoCode,
    operacionesFiltro: []
  };

  // If there is an accesoCode, resolve the operations list for codes 3 and 6
  if (accesoCode === 3 || accesoCode === 6) {
    const tieneDispositivo = dispositivo && dispositivo.trim() !== '';
    if (tieneDispositivo) {
      const dispositivos = dispositivo.split(',').map(d => d.trim()).filter(Boolean);
      if (dispositivos.length) {
        const ph = dispositivos.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT DISTINCT OPERACIÓN FROM Maestro_Operaciones WHERE (SOCIODEMOGRAFICA IN (${ph}) OR MODALIDAD IN (${ph})) AND REGIONAL != 'INACTIVO'`,
          [...dispositivos, ...dispositivos]
        );
        acceso.operacionesFiltro = rows.map(r => r.OPERACIÓN).filter(Boolean);
      }
    } else if (operacion) {
      acceso.operacionesFiltro = [operacion];
    }
  }

  return acceso;
}

async function computarConfigCreacionSolicitud(usuarioId) {
  if (!usuarioId) return null;

  const [uRows] = await pool.execute(
    'SELECT ID, Nombre, Rol, Regional, Dispositivo, `Operación` FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );
  if (!uRows.length) return null;

  const usuario = uRows[0];
  const rol = usuario.Rol || '';
  const regional = usuario.Regional || '';
  const dispositivo = usuario.Dispositivo || '';
  const operacion = usuario['Operación'] || '';

  // Acceso del rol en la pestaña Solicitudes (Maestro_Menu_Inventario, Sección 'Solicitudes').
  // Antes se tomaba la primera sección del rol, sin filtrar.
  const [menuRows] = await pool.execute(
    'SELECT Acceso FROM Maestro_Menu_Inventario WHERE Rol = ? AND `Sección` = ? LIMIT 1',
    [rol, SECCION_SOLICITUDES]
  );

  let accesoCode = null;
  if (menuRows.length > 0) {
    accesoCode = menuRows[0].Acceso;
  }

  let opRows = [];
  if (accesoCode === 1 || accesoCode === 4) {
    // 1 y 4: adicionar solicitudes en todo
    const [rows] = await pool.execute(
      "SELECT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY REGIONAL, OPERACIÓN"
    );
    opRows = rows;
  } else if (accesoCode === 2 || accesoCode === 5) {
    // 2 y 5: adicionar solicitudes solo en la regional a la que pertenece
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [regional]
    );
    opRows = rows;
  } else if (accesoCode === 3 || accesoCode === 6) {
    // 3 y 6: adicionar solicitudes a las operaciones a las que indique la columna Dispositivo
    const tieneDispositivo = dispositivo && dispositivo.trim() !== '';
    if (tieneDispositivo) {
      const dispositivos = dispositivo.split(',').map(d => d.trim()).filter(Boolean);
      if (dispositivos.length) {
        const ph = dispositivos.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE (SOCIODEMOGRAFICA IN (${ph}) OR MODALIDAD IN (${ph})) AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN`,
          [...dispositivos, ...dispositivos]
        );
        opRows = rows;
      }
    } else if (operacion) {
      const [rows] = await pool.execute(
        "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
        [operacion]
      );
      opRows = rows;
    }
  } else {
    // Roles que no estén en la tabla: solo pueden adicionar solicitudes a la Operación a la que pertenecen
    if (operacion) {
      const [rows] = await pool.execute(
        "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
        [operacion]
      );
      opRows = rows;
    }
  }

  const opsPorRegional = agruparOperacionesPorRegional(opRows);
  return {
    rol,
    regional,
    operacion,
    opsPorRegional
  };
}

// ── Visibilidad de solicitudes según el acceso del rol (Maestro_Menu_Inventario, Solicitudes) ──
// 1 todo · 2 su regional · 3 sus operaciones/dispositivo · 4/5/6 igual que 1/2/3 pero solo
// las categorías del acceso restringido (Config_Parametros inventario / General), más lo
// que el propio usuario haya registrado. Sin acceso configurado: solo lo propio.
async function condicionesVisibilidadSolicitudes(acceso) {
  const code = acceso.accesoCode;
  const conds = [];
  const params = [];
  const restringidas = [4, 5, 6].includes(code) ? await obtenerCategoriasRestringidas() : [];
  const phCat = restringidas.map(() => '?').join(',');
  const ops = acceso.operacionesFiltro || [];
  const phOps = ops.map(() => '?').join(',');

  if (code === null || code === undefined) {
    conds.push('Usuario = ?'); params.push(acceso.usuarioId);
  } else if (code === 2) {
    conds.push('Regional = ?'); params.push(acceso.regional);
  } else if (code === 3) {
    if (ops.length) { conds.push(`\`Operación\` IN (${phOps})`); params.push(...ops); } else conds.push('1 = 0');
  } else if (code === 4) {
    conds.push(`(Categoria IN (${phCat}) OR Usuario = ?)`); params.push(...restringidas, acceso.usuarioId);
  } else if (code === 5) {
    conds.push(`( (Regional = ? AND Categoria IN (${phCat})) OR Usuario = ? )`); params.push(acceso.regional, ...restringidas, acceso.usuarioId);
  } else if (code === 6) {
    if (ops.length) {
      conds.push(`( (\`Operación\` IN (${phOps}) AND Categoria IN (${phCat})) OR Usuario = ? )`);
      params.push(...ops, ...restringidas, acceso.usuarioId);
    } else {
      conds.push('Usuario = ?'); params.push(acceso.usuarioId);
    }
  }
  // code === 1: sin condición (ve todo)
  return { conds, params };
}

// La misma regla para una sola solicitud (detalle, edición, cancelación).
async function puedeVerSolicitud(acceso, sol) {
  if (!acceso || !sol) return false;
  const propia = String(sol.Usuario || '') === String(acceso.usuarioId || '');
  const code = acceso.accesoCode;
  const enOps = (acceso.operacionesFiltro || []).some((o) => normalizarTexto(o) === normalizarTexto(sol['Operación']));
  const mismaRegional = normalizarTexto(sol.Regional) === normalizarTexto(acceso.regional);
  let catRestringida = false;
  if ([4, 5, 6].includes(code)) {
    const restringidas = await obtenerCategoriasRestringidas();
    catRestringida = restringidas.some((c) => normalizarTexto(c) === normalizarTexto(sol.Categoria));
  }
  if (code === null || code === undefined) return propia;
  if (code === 1) return true;
  if (code === 2) return mismaRegional;
  if (code === 3) return enOps;
  if (code === 4) return catRestringida || propia;
  if (code === 5) return (mismaRegional && catRestringida) || propia;
  if (code === 6) return (enOps && catRestringida) || propia;
  return propia;
}

// ¿Puede el usuario crear una solicitud en esta operación? (alcance de creación del rol)
async function operacionPermitidaParaCrear(usuario, operacion) {
  const cfg = await computarConfigCreacionSolicitud(usuario);
  if (!cfg) return false;
  return Object.values(cfg.opsPorRegional).some((ops) => ops.some((o) => normalizarTexto(o) === normalizarTexto(operacion)));
}

// ═════ SERVIR INTERFAZ (REDIRECCIÓN AL MÓDULO DE INVENTARIO) ═════
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const acceso = await computarAccesoSolicitud(usuario);
    if (!acceso) {
      return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');
    }

    const isForm = (req.originalUrl || '').toLowerCase().includes('/formsolicitud');
    const viewParam = isForm ? '&view=formulario' : '';
    res.redirect(`/inventario?usuario=${encodeURIComponent(usuario)}${viewParam}#solicitudes`);
  } catch (err) {
    console.error('[solicitudes] Error redirigiendo:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// ═════ API: GET /api/usuario ═════
router.get('/api/usuario', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id requerido' });

    const [rows] = await pool.execute(
      'SELECT ID, Nombre FROM Maestro_Usuarios WHERE ID = ?',
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({
      id: rows[0].ID,
      nombre: rows[0].Nombre,
      usuario: rows[0].ID,
    });
  } catch (err) {
    console.error('[solicitudes] GET /api/usuario:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/usuarios-buscar ═════
router.get('/api/usuarios-buscar', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    const [rows] = await pool.execute(
      'SELECT ID, Nombre FROM Maestro_Usuarios WHERE ID LIKE ? OR Nombre LIKE ? LIMIT 10',
      [`%${q}%`, `%${q}%`]
    );

    res.json(rows);
  } catch (err) {
    console.error('[solicitudes] GET /api/usuarios-buscar:', err);
    res.status(500).json([]);
  }
});

// ═════ API: GET /api/articulos ═════
router.get('/api/articulos', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT Id, Articulo, Elemento, Categoria, Referencia, Talla, Imagen, ClaseArticulo FROM Dynamic_Articulos ORDER BY Articulo'
    );

    res.json(rows);
  } catch (err) {
    console.error('[solicitudes] GET /api/articulos:', err);
    res.status(500).json([]);
  }
});

// ═════ API: GET /api/config-creacion ═════
router.get('/api/config-creacion', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const config = await computarConfigCreacionSolicitud(usuario);
    if (!config) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    res.json(config);
  } catch (err) {
    console.error('[solicitudes] GET /api/config-creacion:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/solicitudes ═════
router.get('/api/solicitudes', async (req, res) => {
  try {
    const { usuario, estado, regional, operacion, categoria, fechaDesde, fechaHasta } = req.query;

    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoSolicitud(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const conds = [];
    const params = [];

    // Enforce visibility filters based on accesoCode (Maestro_Menu_Inventario)
    const visibilidad = await condicionesVisibilidadSolicitudes(acceso);
    conds.push(...visibilidad.conds);
    params.push(...visibilidad.params);

    if (estado) { conds.push('Estado = ?'); params.push(estado); }
    if (regional) { conds.push('Regional = ?'); params.push(regional); }
    if (operacion) { conds.push('`Operación` = ?'); params.push(operacion); }
    if (categoria) { conds.push('Categoria = ?'); params.push(categoria); }
    if (fechaDesde) { conds.push('FechaSolicitud >= ?'); params.push(fechaDesde); }
    if (fechaHasta) {
      const hasta = fechaHasta.includes(':') ? fechaHasta : `${fechaHasta} 23:59:59`;
      conds.push('FechaSolicitud <= ?');
      params.push(hasta);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT * FROM Dynamic_Solicitudes ${where} ORDER BY FechaSolicitud DESC LIMIT 500`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error('[solicitudes] GET /api/solicitudes:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/conteos-filtros ═════
router.get('/api/conteos-filtros', async (req, res) => {
  try {
    const { usuario, estado, regional, operacion, categoria, fechaDesde, fechaHasta } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoSolicitud(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    // Filtros de control de acceso (base)
    const baseConds = [];
    const baseParams = [];

    // Visibilidad según el acceso del rol en la pestaña Solicitudes (Maestro_Menu_Inventario)
    const visibilidad = await condicionesVisibilidadSolicitudes(acceso);
    baseConds.push(...visibilidad.conds);
    baseParams.push(...visibilidad.params);

    // Filtros dinámicos compartidos (estado, categoría, fechas)
    const sharedConds = [];
    const sharedParams = [];

    if (estado) { sharedConds.push('Estado = ?'); sharedParams.push(estado); }
    if (categoria) { sharedConds.push('Categoria = ?'); sharedParams.push(categoria); }
    if (fechaDesde) { sharedConds.push('FechaSolicitud >= ?'); sharedParams.push(fechaDesde); }
    if (fechaHasta) {
      const hasta = fechaHasta.includes(':') ? fechaHasta : `${fechaHasta} 23:59:59`;
      sharedConds.push('FechaSolicitud <= ?');
      sharedParams.push(hasta);
    }

    // 1. Query para Regionales (aplica filtros compartidos y Operación, pero excluye Regional)
    const regConds = [...baseConds, ...sharedConds];
    const regParams = [...baseParams, ...sharedParams];
    if (operacion) {
      regConds.push('`Operación` = ?');
      regParams.push(operacion);
    }
    const regWhere = regConds.length ? `WHERE ${regConds.join(' AND ')}` : '';

    const [
      [regRows],
      [opRows]
    ] = await Promise.all([
      pool.execute(
        `SELECT Regional, COUNT(*) AS total FROM Dynamic_Solicitudes ${regWhere} GROUP BY Regional`,
        regParams
      ),
      pool.execute(
        `SELECT \`Operación\`, COUNT(*) AS total FROM Dynamic_Solicitudes ${opWhere} GROUP BY \`Operación\``,
        opParams
      )
    ]);

    const regionales = {};
    regRows.forEach(r => {
      if (r.Regional) regionales[r.Regional] = r.total;
    });

    const operaciones = {};
    opRows.forEach(o => {
      const key = o['Operación'];
      if (key) operaciones[key] = o.total;
    });

    res.json({ regionales, operaciones });
  } catch (err) {
    console.error('[solicitudes] GET /api/conteos-filtros:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/solicitudes ═════
router.post('/api/solicitudes', upload.single('cotizacionFile'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { operacion, regional, prioridad, categoria, justificacion, montoEstimado, observaciones, usuario, items } = req.body;
    // usuario = solicitante; usuarioActor = quien registra (permisos). Sin usuarioActor se usa usuario.
    const actor = req.body.usuarioActor || usuario;

    // Validar campos requeridos
    if (!operacion || !regional || !categoria || !prioridad) {
      return res.status(400).json({ error: 'Campos requeridos: operacion, regional, categoria, prioridad' });
    }

    // Seguridad: usuario válido y operación dentro de su alcance de creación
    // (Maestro_Menu_Inventario, Sección 'Solicitudes'). Antes no se validaba.
    const acceso = await computarAccesoSolicitud(actor);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado para crear solicitudes.' });
    }
    if (!(await operacionPermitidaParaCrear(actor, operacion))) {
      return res.status(403).json({ error: `No tiene permiso para crear solicitudes en la operación ${operacion}.` });
    }

    let itemsParsed = [];
    if (items) {
      itemsParsed = typeof items === 'string' ? JSON.parse(items) : items;
    }

    if (!Array.isArray(itemsParsed) || itemsParsed.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un artículo' });
    }

    let publicUrl = null;
    if (req.file) {
      // 1. Fetch prefix from Config_Doc_Trabajador where Id = 81
      const [docRows] = await pool.execute('SELECT Prefijo FROM Config_Doc_Trabajador WHERE Id = 81 LIMIT 1');
      const prefijo = docRows[0]?.Prefijo || 'COTSOL';

      // 2. Format current date & time
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

      // 3. Construct name
      const ext = path.extname(req.file.originalname) || '';
      const fileName = `${prefijo}.${dateStr}${ext}`;
      const bucketName = 'talenthub_central';
      const destPath = `general/${fileName}`;

      // 4. Save to GCS
      const gcsFile = storage.bucket(bucketName).file(destPath);
      await gcsFile.save(req.file.buffer, {
        contentType: req.file.mimetype,
        public: true
      });
      publicUrl = `https://storage.googleapis.com/${bucketName}/${destPath}`;
    }

    await conn.beginTransaction();

    // Crear solicitud
    const idSolicitud = randomUUID();
    await conn.execute(
      `INSERT INTO Dynamic_Solicitudes
       (IdSolicitud, \`Operación\`, Regional, Prioridad, Categoria,
        \`Justificación\`, Monto_Estimado, Observaciones, Usuario, Estado, FechaSolicitud, Imagen_Cotización)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'BORRADOR', NOW(), ?)`,
      [idSolicitud, operacion, regional, prioridad, categoria,
       justificacion || null, montoEstimado ? parseFloat(montoEstimado) : null,
       observaciones || null, usuario, publicUrl]
    );

    // Agregar items
    for (const item of itemsParsed) {
      const artId = item.IdArticulo || item.idArticulo;
      const qty = item.Cantidad || item.cantidad;
      const note = item.Nota || item.nota;

      if (!artId || !qty || qty <= 0) {
        throw new Error('Cada item requiere idArticulo y cantidad > 0');
      }

      const idElemento = randomUUID().replace(/-/g, '');
      await conn.execute(
        `INSERT INTO Dynamic_Solicitudes_Items
         (IdElemento, IdSolicitud, IdArticulo, Cantidad, Nota, Usuario)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [idElemento, idSolicitud, artId, qty, note || null, usuario]
      );
    }

    await conn.commit();
    res.status(201).json({ ok: true, idSolicitud });
  } catch (err) {
    await conn.rollback();
    console.error('[solicitudes] POST /api/solicitudes:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ═════ API: PUT /api/solicitud/:id ═════
router.put('/api/solicitud/:id', upload.single('cotizacionFile'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { operacion, regional, prioridad, categoria, justificacion, montoEstimado, observaciones, usuario, items, estado, imagenCotizacion, aclaraciones } = req.body;
    // usuario = solicitante (no cambia); usuarioActor = quien edita (permisos y usuario_actualiza)
    const actor = req.body.usuarioActor || usuario;

    // Verificar que existe y que el usuario tiene permiso para editar
    const [[solicitud]] = await pool.execute(
      'SELECT Estado, Categoria, Usuario, Regional, `Operación`, Imagen_Cotización FROM Dynamic_Solicitudes WHERE IdSolicitud = ?',
      [id]
    );

    if (!solicitud) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    // Seguridad: el usuario debe poder ver la solicitud (mismo alcance del listado)
    const acceso = await computarAccesoSolicitud(actor);
    if (!(await puedeVerSolicitud(acceso, solicitud))) {
      return res.status(403).json({ error: 'No tiene acceso a esta solicitud.' });
    }

    const estadoActual = solicitud.Estado;
    const stateUpper = (estadoActual || '').toUpperCase().trim();

    // Aprobadores por categoría y "Roles que pueden editar solicitudes cerradas"
    // (Config_Parametros, inventario / Solicitudes)
    const esAprobadorCat = await esAprobadorSolicitud(acceso.rol, solicitud.Categoria);
    const cfgSol = await obtenerConfigSolicitudes(acceso.rol);

    let isEditable = false;
    if (stateUpper === 'BORRADOR' || stateUpper === 'VALIDAR') {
      isEditable = true;
    } else if (stateUpper === 'PENDIENTE' || stateUpper === 'PARCIAL') {
      isEditable = esAprobadorCat;
    } else if (['APROBADA', 'COMPLETADA', 'RECHAZADA'].includes(stateUpper)) {
      isEditable = cfgSol.puedeEditarCerradas;
    }

    if (!isEditable) {
      return res.status(400).json({ error: 'No tiene permiso para editar esta solicitud en su estado actual' });
    }

    // Seguridad: editar no cambia el estado, salvo enviar un borrador o una solicitud
    // devuelta (VALIDAR) a PENDIENTE. Aprobar/rechazar va por PATCH /estado con su permiso.
    const estadoPedido = String(estado || '').trim().toUpperCase();
    if (estadoPedido && estadoPedido !== stateUpper &&
        !(estadoPedido === 'PENDIENTE' && ['BORRADOR', 'VALIDAR'].includes(stateUpper))) {
      return res.status(400).json({ error: `No se puede cambiar el estado de ${estadoActual} a ${estado} desde la edición.` });
    }

    // Validar campos
    if (!operacion || !regional || !categoria || !prioridad) {
      return res.status(400).json({ error: 'Campos requeridos: operacion, regional, categoria, prioridad' });
    }

    // Si cambia la operación, la nueva debe estar dentro de su alcance de creación
    if (normalizarTexto(operacion) !== normalizarTexto(solicitud['Operación']) && !(await operacionPermitidaParaCrear(actor, operacion))) {
      return res.status(403).json({ error: `No tiene permiso para registrar solicitudes en la operación ${operacion}.` });
    }

    let itemsParsed = [];
    if (items) {
      itemsParsed = typeof items === 'string' ? JSON.parse(items) : items;
    }

    if (!Array.isArray(itemsParsed) || itemsParsed.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un artículo' });
    }

    let publicUrl = imagenCotizacion || solicitud.Imagen_Cotización || null;
    if (req.file) {
      // 1. Fetch prefix from Config_Doc_Trabajador where Id = 81
      const [docRows] = await pool.execute('SELECT Prefijo FROM Config_Doc_Trabajador WHERE Id = 81 LIMIT 1');
      const prefijo = docRows[0]?.Prefijo || 'COTSOL';

      // 2. Format current date & time
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

      // 3. Construct name
      const ext = path.extname(req.file.originalname) || '';
      const fileName = `${prefijo}.${dateStr}${ext}`;
      const bucketName = 'talenthub_central';
      const destPath = `general/${fileName}`;

      // 4. Save to GCS
      const gcsFile = storage.bucket(bucketName).file(destPath);
      await gcsFile.save(req.file.buffer, {
        contentType: req.file.mimetype,
        public: true
      });
      publicUrl = `https://storage.googleapis.com/${bucketName}/${destPath}`;
    }

    await conn.beginTransaction();

    // Actualizar solicitud
    const nuevoEstado = estado || estadoActual || 'BORRADOR';
    await conn.execute(
      `UPDATE Dynamic_Solicitudes
       SET \`Operación\` = ?, Regional = ?, Prioridad = ?, Categoria = ?,
           \`Justificación\` = ?, Monto_Estimado = ?, Observaciones = ?,
           Estado = ?, usuario_actualiza = ?, \`Fecha_Actualización\` = NOW(),
           Imagen_Cotización = ?, Aclaraciones = ?
       WHERE IdSolicitud = ?`,
      [operacion, regional, prioridad, categoria, justificacion || null,
       montoEstimado ? parseFloat(montoEstimado) : null, observaciones || null, nuevoEstado, actor, publicUrl, aclaraciones || null, id]
    );

    // Eliminar items anteriores
    await conn.execute(
      'DELETE FROM Dynamic_Solicitudes_Items WHERE IdSolicitud = ?',
      [id]
    );

    // Agregar nuevos items
    for (const item of itemsParsed) {
      const artId = item.IdArticulo || item.idArticulo;
      const qty = item.Cantidad || item.cantidad;
      const note = item.Nota || item.nota;

      if (!artId || !qty || qty <= 0) {
        throw new Error('Cada item requiere IdArticulo y Cantidad > 0');
      }

      const idElemento = randomUUID().replace(/-/g, '');
      await conn.execute(
        `INSERT INTO Dynamic_Solicitudes_Items
         (IdElemento, IdSolicitud, IdArticulo, Cantidad, Nota, Usuario, usuario_actualiza)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [idElemento, id, artId, qty, note || null, solicitud.Usuario, actor]
      );
    }

    await conn.commit();

    // Email: solo cuando se promueve de BORRADOR a PENDIENTE
    if (estadoActual === 'BORRADOR' && nuevoEstado === 'PENDIENTE') {
      _enviarEmailEstado(id, 'BORRADOR', 'PENDIENTE', actor);
    }

    res.json({ ok: true, idSolicitud: id, estado: nuevoEstado });
  } catch (err) {
    await conn.rollback();
    console.error('[solicitudes] PUT /api/solicitud/:id:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ═════ API: GET /api/solicitud/:id ═════
router.get('/api/solicitud/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const [[solicitud]] = await pool.execute(
      'SELECT * FROM Dynamic_Solicitudes WHERE IdSolicitud = ?',
      [id]
    );

    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });

    // Seguridad: solo quien puede ver la solicitud en el listado ve su detalle
    const acceso = await computarAccesoSolicitud(usuario);
    if (!(await puedeVerSolicitud(acceso, solicitud))) {
      return res.status(403).json({ error: 'No tiene acceso a esta solicitud.' });
    }

    const [items] = await pool.execute(
      `SELECT i.*, a.Articulo, a.Referencia, a.Elemento, a.Talla, a.Categoria AS CategoriaArticulo
       FROM Dynamic_Solicitudes_Items i
       LEFT JOIN Dynamic_Articulos a ON a.Id = i.IdArticulo
       WHERE i.IdSolicitud = ?`,
      [id]
    );

    const [log] = await pool.execute(
      'SELECT * FROM Dynamic_Solicitudes_Log WHERE IdSolicitud = ?',
      [id]
    );

    const logNormalizado = (log || [])
      .map((row) => ({
        ...row,
        FechaCambio: row.FechaCambio || row.Fecha_Registro || row.FechaRegistro || row.Fecha || row.created_at || row.CreatedAt || null,
      }))
      .sort((a, b) => {
        const fechaA = a.FechaCambio ? new Date(a.FechaCambio).getTime() : 0;
        const fechaB = b.FechaCambio ? new Date(b.FechaCambio).getTime() : 0;
        return fechaB - fechaA;
      });

    res.json({ ...solicitud, items, log: logNormalizado });
  } catch (err) {
    console.error('[solicitudes] GET /api/solicitud/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: PATCH /api/solicitud/:id/estado ═════
router.patch('/api/solicitud/:id/estado', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { estado, usuario, observaciones, aclaraciones, items, justificacion } = req.body;

    if (!estado || !usuario) {
      return res.status(400).json({ error: 'estado y usuario requeridos' });
    }

    const [uRows] = await conn.execute(
      'SELECT Rol FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
      [usuario]
    );
    if (!uRows.length) {
      conn.release();
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }
    const rolUsuario = uRows[0].Rol || '';

    // Lock the row for update
    const [[solicitud]] = await conn.execute(
      'SELECT Categoria, Estado, `Operación`, Regional, Observaciones, `Justificación`, Usuario FROM Dynamic_Solicitudes WHERE IdSolicitud = ? LIMIT 1 FOR UPDATE',
      [id]
    );
    if (!solicitud) {
      conn.release();
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    const estadoAnterior = solicitud.Estado;
    let estadoFinal = estado;

    // Solo los estados que maneja el flujo
    if (!ESTADOS_PERMITIDOS_CAMBIO.includes(String(estado).trim().toUpperCase())) {
      conn.release();
      return res.status(400).json({ error: `Estado no permitido: ${estado}` });
    }

    // Permiso: "Roles aprobadores de solicitudes <CATEGORÍA>" (Config_Parametros, inventario /
    // Solicitudes). Se valida ANTES de cualquier cambio, incluido COMPLETADA (que registra
    // entradas en Kardex). Excepción: quien puede ver la solicitud puede anularla (CANCELADA)
    // mientras está en BORRADOR o VALIDAR, que es cuando la pantalla le muestra "Anular".
    const esAprobador = await esAprobadorSolicitud(rolUsuario, solicitud.Categoria);
    let autorizado = esAprobador;
    if (!autorizado && String(estado).toUpperCase() === 'CANCELADA'
        && ['BORRADOR', 'VALIDAR'].includes(String(solicitud.Estado || '').toUpperCase())) {
      autorizado = await puedeVerSolicitud(await computarAccesoSolicitud(usuario), solicitud);
    }
    if (!autorizado) {
      conn.release();
      return res.status(403).json({
        error: `El rol ${rolUsuario || 'N/A'} no tiene permiso para gestionar el estado en la categoría ${solicitud.Categoria || 'N/A'}`,
      });
    }

    if (estado === 'COMPLETADA') {
      conn.release();
      const resultado = await completarSolicitud(id, usuario);
      return res.json({ ok: true, idSolicitud: id, estado: resultado.estado });
    }

    await conn.beginTransaction();

    let fechaAprobacionVal = null;
    const now = new Date();

    if (['APROBADA', 'PARCIAL'].includes(estado)) {
      fechaAprobacionVal = now;
      await conn.execute(
        `UPDATE Dynamic_Solicitudes
         SET Estado = ?, usuario_actualiza = ?, AprobadoPor = ?,
             Observaciones = COALESCE(?, Observaciones),
             Justificación = COALESCE(?, Justificación),
             FechaAprobacion = ?, \`Fecha_Actualización\` = NOW(),
             Aclaraciones = NULL
         WHERE IdSolicitud = ?`,
        [estado, usuario, usuario, observaciones || null, justificacion || null, fechaAprobacionVal, id]
      );
    } else if (['RECHAZADA', 'VALIDAR'].includes(estado)) {
      if (!aclaraciones || !aclaraciones.trim()) {
        conn.release();
        return res.status(400).json({ error: 'Es obligatorio ingresar las aclaraciones/motivo para este estado.' });
      }
      await conn.execute(
        `UPDATE Dynamic_Solicitudes
         SET Estado = ?, usuario_actualiza = ?, Aclaraciones = ?, Observaciones = COALESCE(?, Observaciones),
             \`Fecha_Actualización\` = NOW()
         WHERE IdSolicitud = ?`,
        [estado, usuario, aclaraciones.trim(), observaciones || null, id]
      );
    } else {
      await conn.execute(
        `UPDATE Dynamic_Solicitudes
         SET Estado = ?, usuario_actualiza = ?, Observaciones = COALESCE(?, Observaciones),
             \`Fecha_Actualización\` = NOW()
         WHERE IdSolicitud = ?`,
        [estado, usuario, observaciones || null, id]
      );
    }

    let esAutomatico = false;
    let actaPrellenada = null;

    // Si pasa a APROBADA o PARCIAL, creamos los registros en Kardex
    if (['APROBADA', 'PARCIAL'].includes(estado)) {
      // 1. Si es APROBADA y se enviaron los items modificados/confirmados, actualizar Dynamic_Solicitudes_Items
      if (estado === 'APROBADA' && Array.isArray(items) && items.length > 0) {
        await conn.execute('DELETE FROM Dynamic_Solicitudes_Items WHERE IdSolicitud = ?', [id]);
        for (const it of items) {
          const artId = it.IdArticulo || it.idArticulo;
          const qty = parseInt(it.Cantidad || it.cantidad || 0);
          const note = it.Nota || it.nota || null;
          if (!artId || qty <= 0) continue;
          const idElemento = randomUUID().replace(/-/g, '');
          await conn.execute(
            `INSERT INTO Dynamic_Solicitudes_Items (IdElemento, IdSolicitud, IdArticulo, Cantidad, Nota, Usuario, usuario_actualiza)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [idElemento, id, artId, qty, note, solicitud.Usuario, usuario]
          );
        }
      } else if (estado === 'PARCIAL' && Array.isArray(items)) {
        for (const item of items) {
          const artId = item.IdArticulo || item.idArticulo;
          const qtyDesp = parseInt(item.CantidadDespachada || item.cantidadDespachada || 0);
          await conn.execute(
            `UPDATE Dynamic_Solicitudes_Items
             SET CantidadDespachada = ?
             WHERE IdSolicitud = ? AND IdArticulo = ?`,
            [qtyDesp, id, artId]
          );
        }
      }

      // 2. Si Observaciones empieza con AUTOMATICO, no debe modificar el Kardex
      const obsFinal = (observaciones !== undefined && observaciones !== null && String(observaciones).trim() !== '')
        ? String(observaciones).trim()
        : String(solicitud.Observaciones || '').trim();
      esAutomatico = obsFinal.toUpperCase().startsWith('AUTOMATICO');

      if (!esAutomatico) {
        // Verificar si ya se habían generado movimientos de Kardex para esta solicitud
        // (Para prevenir doble procesamiento)
        const [[hasKardex]] = await conn.execute(
          'SELECT IdKardex FROM Dynamic_Solicitudes_Items WHERE IdSolicitud = ? AND IdKardex IS NOT NULL LIMIT 1',
          [id]
        );

        if (!hasKardex) {
        // Obtener los artículos asociados de la solicitud con su Costo
        const [solItems] = await conn.execute(
          `SELECT i.IdArticulo, i.Cantidad, i.CantidadDespachada, a.Categoria, a.Costo
           FROM Dynamic_Solicitudes_Items i
           LEFT JOIN Dynamic_Articulos a ON a.Id = i.IdArticulo
           WHERE i.IdSolicitud = ?`,
          [id]
        );

        const opDest = (solicitud['Operación'] || '').trim();
        const opDestLower = opDest.toLowerCase();
        const necesitaTransferencia = opDestLower !== 'administracion' && opDestLower !== 'administración';

        // Cédula del colaborador destinatario (solo si Justificación trae una identificación
        // válida, como en las solicitudes automáticas generadas desde Maestro_Vinculación;
        // en solicitudes manuales Justificación suele ser un texto libre, no una cédula).
        const identificacionCandidata = String(justificacion || solicitud.Justificación || '').trim();
        const usuarioAsignadoKardex = /^\d{5,15}$/.test(identificacionCandidata) ? identificacionCandidata : null;

        // Un único pedido pendiente para toda la solicitud (agrupa todos sus ítems),
        // en vez de crear un Kardex_Pendiente separado por cada artículo. Se crea de forma
        // perezosa, con el primer ítem que realmente se transfiera, para no dejar pedidos
        // vacíos si ningún ítem termina con cantidad > 0.
        let idKardexPendiente = null;

        for (const item of solItems) {
          let qty = 0;
          if (estado === 'APROBADA') {
            qty = parseInt(item.Cantidad) || 0;
          } else if (estado === 'PARCIAL') {
            qty = parseInt(item.CantidadDespachada) || 0;
          }

          // Solo registrar movimientos si la cantidad aprobada/despachada es mayor a 0
          if (qty <= 0) continue;

          const costo = item.Costo || 0;
          const idKardexEntrada = randomUUID().replace(/-/g, '').toLowerCase();

          // A. Insertar ENTRADA en la operación de Administracion
          await conn.execute(
            `INSERT INTO Dynamic_Kardex
             (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
              \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
              Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro)
             VALUES (?, ?, 'ENTRADA', 'ANTIOQUIA', 'Administracion', NULL, ?, ?, ?, NULL, NULL, ?, ?, ?, NOW())`,
            [
              idKardexEntrada,
              fechaAprobacionVal,
              solicitud.Categoria || item.Categoria || null,
              item.IdArticulo,
              qty,
              costo,
              usuario,
              `Destinado a la operación ${solicitud['Operación']}`
            ]
          );

          // Guardar referencia del Kardex en la tabla de ítems de la solicitud
          await conn.execute(
            `UPDATE Dynamic_Solicitudes_Items
             SET IdKardex = ?
             WHERE IdSolicitud = ? AND IdArticulo = ?`,
            [idKardexEntrada, id, item.IdArticulo]
          );

          // B. Insertar TRANSFERENCIA (solo si la operación destino es diferente a Administracion/Administración)
          if (necesitaTransferencia) {
            if (!idKardexPendiente) {
              idKardexPendiente = `SOL-${Date.now()}-${randomUUID().slice(0, 6)}`.toUpperCase();
              await conn.execute(
                `INSERT INTO Kardex_Pendiente
                 (Id, IdKardexOriginal, Procesado, Procesando, Novedad, OperacionOrigen, OperacionDestino, Regional, FechaDespacho, UsuarioDespacha, Estado, Observaciones)
                 VALUES (?, NULL, 0, 0, '', 'Administracion', ?, 'ANTIOQUIA', ?, ?, 'PENDIENTE', ?)`,
                [idKardexPendiente, opDest, fechaAprobacionVal, usuario, `Destinado a la operación ${opDest}`]
              );
            }

            const idKardexTransferencia = randomUUID().replace(/-/g, '').toLowerCase();

            await conn.execute(
              `INSERT INTO Dynamic_Kardex
               (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
                \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
                Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro, Kpendiente)
               VALUES (?, ?, 'TRANSFERENCIA', 'ANTIOQUIA', 'Administracion', ?, ?, ?, ?, ?, NULL, ?, ?, ?, NOW(), ?)`,
              [
                idKardexTransferencia,
                fechaAprobacionVal,
                opDest,
                solicitud.Categoria || item.Categoria || null,
                item.IdArticulo,
                -qty, // Cantidad negativa para la salida de la transferencia
                usuarioAsignadoKardex,
                costo,
                usuario,
                `Destinado a la operación ${opDest}`,
                idKardexPendiente
              ]
            );
          }
        }
      }
    }

      // 3. Si es solicitud AUTOMATICA y fue APROBADA, estructurar datos para adelantar el Acta de Entrega
      if (estado === 'APROBADA' && esAutomatico) {
        const identificacionTrabajador = String(justificacion || solicitud.Justificación || '').trim();

        let vinTrabajador = null;
        if (identificacionTrabajador) {
          const [vRows] = await conn.execute(
            `SELECT Trabajador, Regional, \`Operación\` AS operacion, Cargo
             FROM \`Maestro_Vinculación\`
             WHERE Identificación = ?
             ORDER BY \`Fecha de Ingreso\` DESC
             LIMIT 1`,
            [identificacionTrabajador]
          );
          if (vRows.length > 0) {
            vinTrabajador = vRows[0];
          }
        }

        let segTrabajador = null;
        if (identificacionTrabajador) {
          const [sRows] = await conn.execute(
            `SELECT Email, Celular
             FROM \`Maestro_Segmentación\`
             WHERE \`Identificación\` = ?
             LIMIT 1`,
            [identificacionTrabajador]
          );
          if (sRows.length > 0) {
            segTrabajador = sRows[0];
          }
        }

        const [itemsAprobados] = await conn.execute(
          `SELECT i.IdArticulo, i.Cantidad, i.Nota,
                  a.Articulo, a.Referencia, a.Talla, a.Imagen, a.Categoria
           FROM Dynamic_Solicitudes_Items i
           LEFT JOIN Dynamic_Articulos a ON a.Id = i.IdArticulo
           WHERE i.IdSolicitud = ?`,
          [id]
        );

        const fechaEntregaCol = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Bogota',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date());

        actaPrellenada = {
          idSolicitud: id,
          identificacion: identificacionTrabajador,
          trabajador: vinTrabajador ? vinTrabajador.Trabajador : (solicitud.Observaciones || ''),
          email: segTrabajador ? (segTrabajador.Email || '') : '',
          celular: segTrabajador ? (segTrabajador.Celular || '') : '',
          regional: vinTrabajador ? vinTrabajador.Regional : (solicitud.Regional || ''),
          operacion: vinTrabajador ? vinTrabajador.operacion : (solicitud['Operación'] || ''),
          categoria: solicitud.Categoria || '',
          observaciones: `Acta generada mediante solicitud ${id}`,
          fechaEntrega: fechaEntregaCol,
          items: itemsAprobados.map(it => ({
            IdArticulo: it.IdArticulo,
            Articulo: it.Articulo || `Artículo #${it.IdArticulo}`,
            Referencia: it.Referencia || '',
            Talla: it.Talla || '',
            Imagen: it.Imagen || '',
            Cantidad: it.Cantidad,
            Nota: it.Nota || ''
          }))
        };
      }
    }

    await conn.commit();

    try {
      _enviarEmailEstado(id, estadoAnterior, estadoFinal, usuario);
    } catch (e) {
      console.error('Error enviando email:', e);
    }

    res.json({
      ok: true,
      idSolicitud: id,
      estado: estadoFinal,
      esAutomatico,
      actaPrellenada
    });
  } catch (err) {
    await conn.rollback();
    console.error('[solicitudes] PATCH /api/solicitud/:id/estado error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ═════ API: DELETE /api/solicitud/:id ═════
router.delete('/api/solicitud/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;

    if (!usuario) {
      return res.status(400).json({ error: 'Parámetro usuario requerido' });
    }

    // "Roles que pueden eliminar solicitudes" (Config_Parametros, inventario / Solicitudes)
    const acceso = await computarAccesoSolicitud(usuario);
    if (!acceso || !(await obtenerConfigSolicitudes(acceso.rol)).puedeEliminar) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para eliminar solicitudes.' });
    }

    // Verificar existencia
    const [[sol]] = await pool.execute(
      'SELECT Estado FROM Dynamic_Solicitudes WHERE IdSolicitud = ?',
      [id]
    );

    if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada' });

    // Eliminar items y solicitud
    await pool.execute('DELETE FROM Dynamic_Solicitudes_Items WHERE IdSolicitud = ?', [id]);
    await pool.execute('DELETE FROM Dynamic_Solicitudes WHERE IdSolicitud = ?', [id]);

    res.json({ ok: true, idSolicitud: id, eliminado: true });
  } catch (err) {
    console.error('[solicitudes] DELETE /api/solicitud/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/procesar-ingresos-automaticos ═════
// Permite ejecutar o forzar la creación de solicitudes automáticas para nuevos ingresos
const { verificarSolicitudesNuevosIngresos } = require('../services/solicitudesAutoIngresoService');
router.post('/api/procesar-ingresos-automaticos', async (req, res) => {
  try {
    // Seguridad: antes se podía ejecutar sin usuario. La tarea programada (app.js) llama al
    // servicio directamente, no a esta ruta, así que aquí siempre se exige un usuario válido.
    const { usuario } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoSolicitud(usuario);
    if (!acceso || acceso.accesoCode === null || acceso.accesoCode === undefined) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const resultado = await verificarSolicitudesNuevosIngresos();
    res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('[solicitudes] POST /api/procesar-ingresos-automaticos:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

