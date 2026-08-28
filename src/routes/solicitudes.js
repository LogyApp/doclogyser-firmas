const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');
const { randomUUID } = require('crypto');
const { notificarSolicitudCambioEstado } = require('../services/email');
const { despacharSolicitud, completarSolicitud } = require('../solicitudes/kardex.service');
const { storage } = require('../services/storage');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();
const HTML_PATH = path.join(__dirname, '../views/solicitudes/index.html');

const ROLES_SIN_FILTRO = [
  'AdmSst', 'Archivo', 'Calidad', 'Contabilidad', 'Contratación', 'Control',
  'Cuentas', 'Facturación', 'Generalista', 'Juridica', 'Jurídica', 'Nomina', 'Nómina', 'LiderSst',
  'Selección', 'Selección Centro', 'Sistema', 'Administración', 'Administrador',
  'Dirección Hseq', 'Dirección Operaciones', 'Dirección RRHH', 'Gestor Nómina'
];
const ROLES_REGIONAL = ['AuxiliarR', 'CoordinadorR'];
const ROLES_DISPOSITIVO = ['Auxiliar', 'Coordinador', 'AuxSst'];
const ROLES_MODALIDAD = ['AnaSst'];

function normalizarCategoria(categoria) {
  return String(categoria || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function rolesPermitidosPorCategoria(categoria) {
  const cat = normalizarCategoria(categoria);
  if (cat === 'EPP') return ['AdmSst', 'LiderSst', 'Sistema'];
  if (cat === 'DOTACION') return ['Inventario', 'Cuentas', 'Sistema'];
  if (cat === 'TECNOLOGIA') return ['Control', 'Cuentas', 'Sistema'];
  return ['Sistema', 'Cuentas'];
}

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

    const rolesAprobadores = rolesPermitidosPorCategoria(sol.Categoria);
    const ph = rolesAprobadores.map(() => '?').join(',');
    const [aprobadoresRows] = await pool.execute(
      `SELECT Email FROM Maestro_Usuarios WHERE Rol IN (${ph}) AND Email IS NOT NULL AND Email != ''`,
      rolesAprobadores
    );

    const [items] = await pool.execute(
      `SELECT i.Cantidad, a.Articulo
       FROM Dynamic_Solicitudes_Items i
       LEFT JOIN Dynamic_Articulos a ON a.Id = i.IdArticulo
       WHERE i.IdSolicitud = ?`,
      [idSolicitud]
    );

    let quienCambioNombre = quienCambioId;
    if (quienCambioId && quienCambioId !== sol.Usuario) {
      const [[whoRow]] = await pool.execute(
        'SELECT Nombre FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
        [quienCambioId]
      );
      if (whoRow) quienCambioNombre = whoRow.Nombre || quienCambioId;
    }

    let emailsAprobadores = aprobadoresRows.map(r => r.Email).filter(Boolean);
    if (normalizarCategoria(sol.Categoria) === 'TECNOLOGIA') {
      emailsAprobadores = emailsAprobadores.filter(email => {
        const em = email.trim().toLowerCase();
        return em !== 'gerenciaoperaciones@logyser.com' && em !== 'directorrh@logyser.com';
      });
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
      emailSolicitante: solicitanteRow?.Email || null,
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

  // Query Maestro_Menu_Inventario for this role
  const [menuRows] = await pool.execute(
    'SELECT Acceso FROM Maestro_Menu_Inventario WHERE Rol = ? LIMIT 1',
    [rol]
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
      const [rows] = await pool.execute(
        "SELECT DISTINCT OPERACIÓN FROM Maestro_Operaciones WHERE (SOCIODEMOGRAFICA = ? OR MODALIDAD = ?) AND REGIONAL != 'INACTIVO'",
        [dispositivo, dispositivo]
      );
      acceso.operacionesFiltro = rows.map(r => r.OPERACIÓN).filter(Boolean);
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

  // Query Maestro_Menu_Inventario for this role
  const [menuRows] = await pool.execute(
    'SELECT Acceso FROM Maestro_Menu_Inventario WHERE Rol = ? LIMIT 1',
    [rol]
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
      const [rows] = await pool.execute(
        "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE (SOCIODEMOGRAFICA = ? OR MODALIDAD = ?) AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
        [dispositivo, dispositivo]
      );
      opRows = rows;
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
      'SELECT Id, Articulo, Categoria, Referencia, Talla, Imagen, ClaseArticulo FROM Dynamic_Articulos ORDER BY Articulo'
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
    const code = acceso.accesoCode;
    if (code === null || code === undefined) {
      // Para los roles que no estan en la tabla solo pueden ver lo que hayan hecho con su usuario
      conds.push('Usuario = ?');
      params.push(acceso.usuarioId);
    } else if (code === 1) {
      // 1: ver todo
    } else if (code === 2) {
      // 2: ver por regional
      conds.push('Regional = ?');
      params.push(acceso.regional);
    } else if (code === 3) {
      // 3: ver por columna Dispositivo (Si esta vacia entonces solo por operacion)
      if (acceso.operacionesFiltro.length > 0) {
        const ph = acceso.operacionesFiltro.map(() => '?').join(',');
        conds.push(`\`Operación\` IN (${ph})`);
        params.push(...acceso.operacionesFiltro);
      } else {
        conds.push('1 = 0');
      }
    } else if (code === 4) {
      // 4: ver todo con Dotación y EPP (Adicionando lo que el usuario haya registrado en otras categorias)
      conds.push('(Categoria IN (\'EPP\', \'DOTACION\', \'DOTACIÓN\') OR Usuario = ?)');
      params.push(acceso.usuarioId);
    } else if (code === 5) {
      // 5: ver por regional solo Dotación y EPP (Adicionando lo que el usuario haya registrado en otras categorias)
      conds.push('( (Regional = ? AND Categoria IN (\'EPP\', \'DOTACION\', \'DOTACIÓN\')) OR Usuario = ? )');
      params.push(acceso.regional, acceso.usuarioId);
    } else if (code === 6) {
      // 6: ver por Dispositivo (Adicionando lo que el usuario haya registrado en otras categorias)
      if (acceso.operacionesFiltro.length > 0) {
        const ph = acceso.operacionesFiltro.map(() => '?').join(',');
        conds.push(`( (\`Operación\` IN (${ph}) AND Categoria IN ('EPP', 'DOTACION', 'DOTACIÓN')) OR Usuario = ? )`);
        params.push(...acceso.operacionesFiltro, acceso.usuarioId);
      } else {
        conds.push('Usuario = ?');
        params.push(acceso.usuarioId);
      }
    }

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

    const code = acceso.accesoCode;
    if (code === null || code === undefined) {
      baseConds.push('Usuario = ?');
      baseParams.push(acceso.usuarioId);
    } else if (code === 1) {
      // 1: ver todo
    } else if (code === 2) {
      // 2: ver por regional
      baseConds.push('Regional = ?');
      baseParams.push(acceso.regional);
    } else if (code === 3) {
      // 3: ver por columna Dispositivo
      if (acceso.operacionesFiltro.length > 0) {
        const ph = acceso.operacionesFiltro.map(() => '?').join(',');
        baseConds.push(`\`Operación\` IN (${ph})`);
        baseParams.push(...acceso.operacionesFiltro);
      } else {
        baseConds.push('1 = 0');
      }
    } else if (code === 4) {
      // 4: ver todo con Dotación y EPP
      baseConds.push('(Categoria IN (\'EPP\', \'DOTACION\', \'DOTACIÓN\') OR Usuario = ?)');
      baseParams.push(acceso.usuarioId);
    } else if (code === 5) {
      // 5: ver por regional solo Dotación y EPP
      baseConds.push('( (Regional = ? AND Categoria IN (\'EPP\', \'DOTACION\', \'DOTACIÓN\')) OR Usuario = ? )');
      baseParams.push(acceso.regional, acceso.usuarioId);
    } else if (code === 6) {
      // 6: ver por Dispositivo
      if (acceso.operacionesFiltro.length > 0) {
        const ph = acceso.operacionesFiltro.map(() => '?').join(',');
        baseConds.push(`( (\`Operación\` IN (${ph}) AND Categoria IN ('EPP', 'DOTACION', 'DOTACIÓN')) OR Usuario = ? )`);
        baseParams.push(...acceso.operacionesFiltro, acceso.usuarioId);
      } else {
        baseConds.push('Usuario = ?');
        baseParams.push(acceso.usuarioId);
      }
    }

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

    const [regRows] = await pool.execute(
      `SELECT Regional, COUNT(*) AS total FROM Dynamic_Solicitudes ${regWhere} GROUP BY Regional`,
      regParams
    );

    // 2. Query para Operaciones (aplica filtros compartidos y Regional, pero excluye Operación)
    const opConds = [...baseConds, ...sharedConds];
    const opParams = [...baseParams, ...sharedParams];
    if (regional) {
      opConds.push('Regional = ?');
      opParams.push(regional);
    }
    const opWhere = opConds.length ? `WHERE ${opConds.join(' AND ')}` : '';

    const [opRows] = await pool.execute(
      `SELECT \`Operación\`, COUNT(*) AS total FROM Dynamic_Solicitudes ${opWhere} GROUP BY \`Operación\``,
      opParams
    );

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

    // Validar campos requeridos
    if (!operacion || !regional || !categoria || !prioridad) {
      return res.status(400).json({ error: 'Campos requeridos: operacion, regional, categoria, prioridad' });
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

    // Verificar que existe y que el usuario tiene permiso para editar
    const [[solicitud]] = await pool.execute(
      'SELECT Estado, Categoria, Usuario, Imagen_Cotización FROM Dynamic_Solicitudes WHERE IdSolicitud = ?',
      [id]
    );

    if (!solicitud) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    const estadoActual = solicitud.Estado;
    const [[usuarioRow]] = await pool.execute(
      'SELECT Rol FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
      [usuario]
    );
    const usuarioRol = usuarioRow?.Rol || '';

    // Determine if user has privileged roles for the category
    let esAprobadorCat = false;
    const catUpper = (solicitud.Categoria || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const stateUpper = (estadoActual || '').toUpperCase().trim();

    if (usuarioRol === 'Sistema') {
      esAprobadorCat = true;
    } else if (catUpper === 'EPP') {
      esAprobadorCat = ['AdmSst', 'LiderSst'].includes(usuarioRol);
    } else if (catUpper !== 'TECNOLOGIA') {
      esAprobadorCat = ['Inventario', 'Cuentas'].includes(usuarioRol);
    }

    let isEditable = false;
    if (stateUpper === 'BORRADOR' || stateUpper === 'VALIDAR') {
      isEditable = true;
    } else if (stateUpper === 'PENDIENTE' || stateUpper === 'PARCIAL') {
      isEditable = esAprobadorCat;
    } else if (['APROBADA', 'COMPLETADA', 'RECHAZADA'].includes(stateUpper)) {
      isEditable = (usuarioRol === 'Sistema');
    }

    if (!isEditable) {
      return res.status(400).json({ error: 'No tiene permiso para editar esta solicitud en su estado actual' });
    }

    // Validar campos
    if (!operacion || !regional || !categoria || !prioridad) {
      return res.status(400).json({ error: 'Campos requeridos: operacion, regional, categoria, prioridad' });
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
       montoEstimado ? parseFloat(montoEstimado) : null, observaciones || null, nuevoEstado, usuario, publicUrl, aclaraciones || null, id]
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
        [idElemento, id, artId, qty, note || null, solicitud.Usuario, usuario]
      );
    }

    await conn.commit();

    // Email: solo cuando se promueve de BORRADOR a PENDIENTE
    if (estadoActual === 'BORRADOR' && nuevoEstado === 'PENDIENTE') {
      _enviarEmailEstado(id, 'BORRADOR', 'PENDIENTE', usuario);
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

    const [[solicitud]] = await pool.execute(
      'SELECT * FROM Dynamic_Solicitudes WHERE IdSolicitud = ?',
      [id]
    );

    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });

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
    const { estado, usuario, observaciones, aclaraciones } = req.body;

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
      'SELECT Categoria, Estado, `Operación`, Regional FROM Dynamic_Solicitudes WHERE IdSolicitud = ? LIMIT 1 FOR UPDATE',
      [id]
    );
    if (!solicitud) {
      conn.release();
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    const estadoAnterior = solicitud.Estado;
    let estadoFinal = estado;

    if (estado === 'COMPLETADA') {
      conn.release();
      const resultado = await completarSolicitud(id, usuario);
      return res.json({ ok: true, idSolicitud: id, estado: resultado.estado });
    }

    const rolesPermitidos = rolesPermitidosPorCategoria(solicitud.Categoria);
    if (!rolesPermitidos.includes(rolUsuario) && rolUsuario !== 'Sistema') {
      conn.release();
      return res.status(403).json({
        error: `El rol ${rolUsuario || 'N/A'} no tiene permiso para gestionar el estado en la categoría ${solicitud.Categoria || 'N/A'}`,
      });
    }

    await conn.beginTransaction();

    let fechaAprobacionVal = null;
    const now = new Date();

    if (['APROBADA', 'PARCIAL'].includes(estado)) {
      fechaAprobacionVal = now;
      await conn.execute(
        `UPDATE Dynamic_Solicitudes
         SET Estado = ?, usuario_actualiza = ?, AprobadoPor = ?, Observaciones = COALESCE(?, Observaciones),
             FechaAprobacion = ?, \`Fecha_Actualización\` = NOW(),
             Aclaraciones = NULL
         WHERE IdSolicitud = ?`,
        [estado, usuario, usuario, observaciones || null, fechaAprobacionVal, id]
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

    // Si pasa a APROBADA o PARCIAL, creamos los registros en Kardex
    if (['APROBADA', 'PARCIAL'].includes(estado)) {
      // 1. Si es PARCIAL y se enviaron los items confirmados, actualizar CantidadDespachada
      if (estado === 'PARCIAL' && Array.isArray(req.body.items)) {
        for (const item of req.body.items) {
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

      // 2. Verificar si ya se habían generado movimientos de Kardex para esta solicitud
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
          const opDest = (solicitud['Operación'] || '').trim();
          const opDestLower = opDest.toLowerCase();
          if (opDestLower !== 'administracion' && opDestLower !== 'administración') {
            const idKardexTransferencia = randomUUID().replace(/-/g, '').toLowerCase();

            await conn.execute(
              `INSERT INTO Dynamic_Kardex
               (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
                \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
                Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro)
               VALUES (?, ?, 'TRANSFERENCIA', 'ANTIOQUIA', 'Administracion', ?, ?, ?, ?, NULL, NULL, ?, ?, ?, NOW())`,
              [
                idKardexTransferencia,
                fechaAprobacionVal,
                opDest,
                solicitud.Categoria || item.Categoria || null,
                item.IdArticulo,
                -qty, // Cantidad negativa para la salida de la transferencia
                costo,
                usuario,
                `Destinado a la operación ${opDest}`
              ]
            );

            // C. Crear registro en Kardex_Pendiente con Procesado = 0
            await conn.execute(
              `INSERT INTO Kardex_Pendiente (IdKardexOriginal, Procesado, Procesando, Novedad)
               VALUES (?, 0, 0, '')`,
              [idKardexTransferencia]
            );
          }
        }
      }
    }

    await conn.commit();

    try {
      _enviarEmailEstado(id, estadoAnterior, estadoFinal, usuario);
    } catch (e) {
      console.error('Error enviando email:', e);
    }

    res.json({ ok: true, idSolicitud: id, estado: estadoFinal });
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

    const acceso = await computarAccesoSolicitud(usuario);
    if (!acceso || acceso.rol !== 'Sistema') {
      return res.status(403).json({ error: 'Solo el rol de Sistema puede eliminar solicitudes.' });
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

module.exports = router;
