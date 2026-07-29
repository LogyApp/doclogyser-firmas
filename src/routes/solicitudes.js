const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');
const { randomUUID } = require('crypto');
const { notificarSolicitudCambioEstado } = require('../services/email');
const { despacharSolicitud } = require('../solicitudes/kardex.service');

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

// ═════ SERVIR INTERFAZ ═════
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

    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const initialView = (req.baseUrl || '').toLowerCase().includes('/formsolicitud')
      ? 'formulario'
      : 'listado';
    const config = JSON.stringify({
      ...acceso,
      regionalesFiltro: Object.keys(acceso.opsPorRegional),
      initialView,
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[solicitudes] Error sirviendo interfaz:', err);
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
      'SELECT Id, Articulo, Categoria, Referencia, Talla, Imagen FROM Dynamic_Articulos ORDER BY Articulo'
    );

    res.json(rows);
  } catch (err) {
    console.error('[solicitudes] GET /api/articulos:', err);
    res.status(500).json([]);
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

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json([]);
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      conds.push(`\`Operación\` IN (${ph})`);
      params.push(...acceso.operacionesFiltro);
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

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json({ regionales: {}, operaciones: {} });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      baseConds.push(`\`Operación\` IN (${ph})`);
      baseParams.push(...acceso.operacionesFiltro);
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
router.post('/api/solicitudes', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { operacion, regional, prioridad, categoria, justificacion, montoEstimado, observaciones, usuario, items } = req.body;

    // Validar campos requeridos
    if (!operacion || !regional || !categoria) {
      return res.status(400).json({ error: 'Campos requeridos: operacion, regional, categoria' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un artículo' });
    }

    await conn.beginTransaction();

    // Crear solicitud
    const idSolicitud = randomUUID();
    await conn.execute(
      `INSERT INTO Dynamic_Solicitudes
       (IdSolicitud, \`Operación\`, Regional, Prioridad, Categoria,
        \`Justificación\`, Monto_Estimado, Observaciones, Usuario, Estado, FechaSolicitud)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'BORRADOR', NOW())`,
      [idSolicitud, operacion, regional, prioridad || null, categoria,
       justificacion || null, montoEstimado || null,
       observaciones || null, usuario]
    );

    // Agregar items
    for (const item of items) {
      if (!item.idArticulo || !item.cantidad || item.cantidad <= 0) {
        throw new Error('Cada item requiere idArticulo y cantidad > 0');
      }

      const idElemento = randomUUID().replace(/-/g, '');
      await conn.execute(
        `INSERT INTO Dynamic_Solicitudes_Items
         (IdElemento, IdSolicitud, IdArticulo, Cantidad, Nota, Usuario)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [idElemento, idSolicitud, item.idArticulo, item.cantidad, item.nota || null, usuario]
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
router.put('/api/solicitud/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { operacion, regional, prioridad, categoria, justificacion, montoEstimado, observaciones, usuario, items, estado } = req.body;

    // Verificar que existe y que el usuario tiene permiso para editar
    const [[solicitud]] = await pool.execute(
      'SELECT Estado, Categoria FROM Dynamic_Solicitudes WHERE IdSolicitud = ?',
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
    const esAprobador = rolesPermitidosPorCategoria(solicitud.Categoria).includes(usuarioRol);

    if (estadoActual !== 'BORRADOR' && !(estadoActual === 'PENDIENTE' && esAprobador)) {
      return res.status(400).json({ error: 'No tiene permiso para editar esta solicitud en su estado actual' });
    }

    // Validar campos
    if (!operacion || !regional || !categoria) {
      return res.status(400).json({ error: 'Campos requeridos: operacion, regional, categoria' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un artículo' });
    }

    await conn.beginTransaction();

    // Actualizar solicitud
    const nuevoEstado = estadoActual === 'PENDIENTE' ? 'PENDIENTE' : (estado === 'PENDIENTE' ? 'PENDIENTE' : 'BORRADOR');
    await conn.execute(
      `UPDATE Dynamic_Solicitudes
       SET \`Operación\` = ?, Regional = ?, Prioridad = ?, Categoria = ?,
           \`Justificación\` = ?, Monto_Estimado = ?, Observaciones = ?,
           Usuario = ?, Estado = ?, \`Fecha_Actualización\` = NOW()
       WHERE IdSolicitud = ?`,
      [operacion, regional, prioridad || null, categoria, justificacion || null,
       montoEstimado || null, observaciones || null, usuario, nuevoEstado, id]
    );

    // Eliminar items anteriores
    await conn.execute(
      'DELETE FROM Dynamic_Solicitudes_Items WHERE IdSolicitud = ?',
      [id]
    );

    // Agregar nuevos items
    for (const item of items) {
      if (!item.IdArticulo || !item.Cantidad || item.Cantidad <= 0) {
        throw new Error('Cada item requiere IdArticulo y Cantidad > 0');
      }

      const idElemento = randomUUID().replace(/-/g, '');
      await conn.execute(
        `INSERT INTO Dynamic_Solicitudes_Items
         (IdElemento, IdSolicitud, IdArticulo, Cantidad, Nota, Usuario)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [idElemento, id, item.IdArticulo, item.Cantidad, item.Nota || null, usuario]
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
  try {
    const { id } = req.params;
    const { estado, usuario, observaciones } = req.body;

    if (!estado || !usuario) {
      return res.status(400).json({ error: 'estado y usuario requeridos' });
    }

    const [uRows] = await pool.execute(
      'SELECT Rol FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
      [usuario]
    );
    if (!uRows.length) {
      return res.status(403).json({ error: 'Usuario no autorizado para cambiar estado' });
    }

    const [[solicitud]] = await pool.execute(
      'SELECT Categoria, Estado, `Operación`, Regional FROM Dynamic_Solicitudes WHERE IdSolicitud = ? LIMIT 1',
      [id]
    );
    if (!solicitud) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    const rolUsuario = uRows[0].Rol || '';
    const rolesPermitidos = rolesPermitidosPorCategoria(solicitud.Categoria);
    if (!rolesPermitidos.includes(rolUsuario)) {
      return res.status(403).json({
        error: `El rol ${rolUsuario || 'N/A'} no tiene permiso para gestionar estado en la categoría ${solicitud.Categoria || 'N/A'}`,
      });
    }

    const estadoAnterior = solicitud.Estado;
    let estadoFinal = estado;

    if (['DESPACHADA', 'PARCIAL'].includes(estado)) {
      // Una sola transacción: kardex inserts + UPDATE estado (todo en kardex.service.js)
      const resultado = await despacharSolicitud(id, usuario);
      estadoFinal = resultado.estado;
    } else if (estado === 'APROBADA') {
      await pool.execute(
        `UPDATE Dynamic_Solicitudes
         SET Estado = ?, Usuario = ?, Observaciones = COALESCE(?, Observaciones),
             AprobadoPor = ?, FechaAprobacion = NOW(), \`Fecha_Actualización\` = NOW()
         WHERE IdSolicitud = ?`,
        [estado, usuario, observaciones || null, usuario, id]
      );
    } else {
      await pool.execute(
        `UPDATE Dynamic_Solicitudes
         SET Estado = ?, Usuario = ?, Observaciones = COALESCE(?, Observaciones),
             \`Fecha_Actualización\` = NOW()
         WHERE IdSolicitud = ?`,
        [estado, usuario, observaciones || null, id]
      );
    }

    // Email: notificar cambio de estado (fire and forget)
    _enviarEmailEstado(id, estadoAnterior, estadoFinal, usuario);

    res.json({ ok: true, idSolicitud: id, estado: estadoFinal });
  } catch (err) {
    console.error('[solicitudes] PATCH /api/solicitud/:id/estado:', err);
    res.status(500).json({ error: err.message });
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
