const express = require('express');
const multer = require('multer');
const pool = require('../services/db');
const { generarToken } = require('../services/token');
const { subirEvidenciaActa } = require('../services/storage');
const {
  calcularStockActa,
  calcularStockCategoria,
  resolverCondicionCategoria,
  registrarKardexActa,
  revertirKardexActa,
  construirDatosPlantilla,
} = require('../services/actas');
const { notificarActaFirma } = require('../services/email');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ── INTERRUPTOR DE ENVÍO DE CORREO PARA ACTAS ─────────────────────────────
// Activado: al guardar un Acta se genera el enlace de firma (48h) y se notifica
// automáticamente al correo registrado del trabajador.
const ENVIO_CORREO_ACTAS_ACTIVO = true;
// ───────────────────────────────────────────────────────────────────────

const SECCION = 'Actas';
const CATEGORIAS_RESTRINGIDAS = ['EPP', 'DOTACION', 'DOTACIÓN'];

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

async function obtenerContactoTrabajador(identificacion) {
  const [[row]] = await pool.execute(
    'SELECT Email, Celular FROM `Maestro_Segmentación` WHERE Identificación = ? LIMIT 1',
    [identificacion]
  );
  return { email: (row && row.Email) || '', celular: (row && row.Celular) || '' };
}

// Actualiza Email/Celular en Maestro_Segmentación (tabla maestra compartida del trabajador).
async function actualizarContactoTrabajador(identificacion, email, celular) {
  if (!identificacion) return;
  const sets = [];
  const params = [];
  if (email !== undefined && email !== null && email !== '') { sets.push('Email = ?'); params.push(email); }
  if (celular !== undefined && celular !== null && celular !== '') { sets.push('Celular = ?'); params.push(celular); }
  if (!sets.length) return;
  params.push(identificacion);
  await pool.execute(`UPDATE \`Maestro_Segmentación\` SET ${sets.join(', ')} WHERE Identificación = ?`, params);
}

async function computarAccesoActas(usuarioId) {
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

  const [menuRows] = await pool.execute(
    'SELECT Acceso FROM Maestro_Menu_Inventario WHERE Rol = ? AND `Sección` = ? LIMIT 1',
    [rol, SECCION]
  );
  if (!menuRows.length) return null; // Sin acceso a la pestaña de Actas

  const accesoCode = menuRows[0].Acceso;

  const acceso = {
    usuarioId: usuario.ID,
    usuarioNombre: usuario.Nombre || usuario.ID,
    rol,
    regional,
    dispositivo,
    operacion,
    accesoCode,
    operacionesFiltro: [],
  };

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

async function computarConfigCreacionActa(usuarioId) {
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

  const [menuRows] = await pool.execute(
    'SELECT Acceso FROM Maestro_Menu_Inventario WHERE Rol = ? AND `Sección` = ? LIMIT 1',
    [rol, SECCION]
  );
  const accesoCode = menuRows.length ? menuRows[0].Acceso : null;

  let opRows = [];
  if (accesoCode === 1 || accesoCode === 4) {
    const [rows] = await pool.execute(
      "SELECT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY REGIONAL, OPERACIÓN"
    );
    opRows = rows;
  } else if (accesoCode === 2 || accesoCode === 5) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [regional]
    );
    opRows = rows;
  } else if (accesoCode === 3 || accesoCode === 6) {
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
  } else if (operacion) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [operacion]
    );
    opRows = rows;
  }

  const opsPorRegional = agruparOperacionesPorRegional(opRows);
  const categoriasConds = [4, 5, 6].includes(accesoCode) ? CATEGORIAS_RESTRINGIDAS : null;

  return { rol, regional, operacion, opsPorRegional, categoriasRestringidas: categoriasConds };
}

// ═════ Redirección a la interfaz (pestaña Actas dentro del módulo de Inventario) ═════
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    const acceso = await computarAccesoActas(usuario);
    if (!acceso) return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');
    res.redirect(`/inventario?usuario=${encodeURIComponent(usuario)}#actas`);
  } catch (err) {
    console.error('[actas] Error redirigiendo:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// ═════ API: GET /api/categorias ═════
router.get('/api/categorias', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT Categoria FROM Config_Categoria_Inventario ORDER BY Categoria');
    res.json(rows.map(r => r.Categoria));
  } catch (err) {
    console.error('[actas] GET /api/categorias:', err);
    res.status(500).json([]);
  }
});

// ═════ API: GET /api/config-creacion ═════
router.get('/api/config-creacion', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const config = await computarConfigCreacionActa(usuario);
    if (!config) return res.status(403).json({ error: 'Usuario no autorizado' });
    res.json(config);
  } catch (err) {
    console.error('[actas] GET /api/config-creacion:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/trabajadores-buscar ═════
router.get('/api/trabajadores-buscar', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);

    const [rows] = await pool.execute(
      `SELECT Identificación, Trabajador, Regional, \`Operación\` FROM \`Maestro_Vinculación\`
       WHERE Estado = 'Activo' AND UPPER(Trabajador) LIKE UPPER(?)
       ORDER BY Trabajador LIMIT 15`,
      [`%${q.trim()}%`]
    );
    res.json(rows);
  } catch (err) {
    console.error('[actas] GET /api/trabajadores-buscar:', err);
    res.status(500).json([]);
  }
});

// ═════ API: GET /api/stock-categoria (stock por artículo para una Operación+Categoria) ═════
router.get('/api/stock-categoria', async (req, res) => {
  try {
    const { operacion, categoria } = req.query;
    if (!operacion || !categoria) return res.status(400).json({ error: 'operacion y categoria requeridos' });

    const condicion = await resolverCondicionCategoria(categoria);
    // Solo Condicion = 'Definitivo' mueve Kardex; para cualquier otra ni se muestra
    // el disponible ni se bloquea el ingreso de cantidad.
    const aplica = condicion === 'Definitivo';
    const bloquea = aplica;
    if (!aplica) return res.json({ aplica: false, bloquea: false, operacionPrincipal: null, stock: {} });

    const resultado = await calcularStockCategoria(operacion, categoria);
    res.json({ aplica: true, bloquea, ...resultado });
  } catch (err) {
    console.error('[actas] GET /api/stock-categoria:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/trabajador-contacto (Email/Celular desde Maestro_Segmentación) ═════
router.get('/api/trabajador-contacto', async (req, res) => {
  try {
    const { identificacion } = req.query;
    if (!identificacion) return res.status(400).json({ error: 'identificacion requerida' });
    const contacto = await obtenerContactoTrabajador(identificacion);
    res.json(contacto);
  } catch (err) {
    console.error('[actas] GET /api/trabajador-contacto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/actas (listado, control de acceso aplicado, filtro fino en cliente) ═════
router.get('/api/actas', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoActas(usuario);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const conds = [];
    const params = [];
    const code = acceso.accesoCode;

    if (code === null || code === undefined) {
      conds.push('da.Usuario = ?');
      params.push(acceso.usuarioId);
    } else if (code === 1) {
      // ver todo
    } else if (code === 2) {
      conds.push('(SELECT REGIONAL FROM Maestro_Operaciones o WHERE o.OPERACIÓN = da.operacion LIMIT 1) = ?');
      params.push(acceso.regional);
    } else if (code === 3) {
      if (acceso.operacionesFiltro.length > 0) {
        const ph = acceso.operacionesFiltro.map(() => '?').join(',');
        conds.push(`da.operacion IN (${ph})`);
        params.push(...acceso.operacionesFiltro);
      } else {
        conds.push('1 = 0');
      }
    } else if (code === 4) {
      conds.push("(da.Categoria IN ('EPP', 'DOTACION', 'DOTACIÓN') OR da.Usuario = ?)");
      params.push(acceso.usuarioId);
    } else if (code === 5) {
      conds.push("( ((SELECT REGIONAL FROM Maestro_Operaciones o WHERE o.OPERACIÓN = da.operacion LIMIT 1) = ? AND da.Categoria IN ('EPP', 'DOTACION', 'DOTACIÓN')) OR da.Usuario = ? )");
      params.push(acceso.regional, acceso.usuarioId);
    } else if (code === 6) {
      if (acceso.operacionesFiltro.length > 0) {
        const ph = acceso.operacionesFiltro.map(() => '?').join(',');
        conds.push(`( (da.operacion IN (${ph}) AND da.Categoria IN ('EPP', 'DOTACION', 'DOTACIÓN')) OR da.Usuario = ? )`);
        params.push(...acceso.operacionesFiltro, acceso.usuarioId);
      } else {
        conds.push('da.Usuario = ?');
        params.push(acceso.usuarioId);
      }
    }

    const { estado, regional, operacion, categoria, search, fechaInicio, fechaFin, sort, order, page, limit } = req.query;

    const fEstado = estado ? { cond: 'da.Estado = ?', params: [estado] } : null;
    const fRegional = regional ? { cond: 'mo.REGIONAL = ?', params: [regional] } : null;
    const fOperacion = operacion ? { cond: 'da.operacion = ?', params: [operacion] } : null;
    const fCategoria = categoria ? { cond: 'da.Categoria = ?', params: [categoria] } : null;
    const fFechaInicio = fechaInicio ? { cond: 'da.Fecha_Entrega >= ?', params: [fechaInicio] } : null;
    const fFechaFin = fechaFin ? { cond: 'da.Fecha_Entrega <= ?', params: [fechaFin] } : null;
    const searchParam = search ? `%${search.trim()}%` : null;
    const fSearch = search ? {
      cond: `(CAST(da.IdActa AS CHAR) LIKE ? OR
              da.identificacion LIKE ? OR
              UPPER(COALESCE(
                (SELECT v.Trabajador FROM \`Maestro_Vinculación\` v WHERE v.Identificación = da.identificacion ORDER BY v.\`Fecha de Ingreso\` DESC LIMIT 1),
                (SELECT s.Trabajador FROM \`Maestro_Segmentación\` s WHERE s.Identificación = da.identificacion LIMIT 1)
              )) LIKE UPPER(?) OR
              UPPER(da.operacion) LIKE UPPER(?) OR
              UPPER(mo.REGIONAL) LIKE UPPER(?) OR
              UPPER(da.Usuario) LIKE UPPER(?))`,
      params: [searchParam, searchParam, searchParam, searchParam, searchParam, searchParam]
    } : null;

    const buildActasCountWhere = (extraFilters) => {
      const c = [...conds];
      const p = [...params];
      extraFilters.forEach(f => { if (f) { c.push(f.cond); p.push(...f.params); } });
      return { where: c.length ? `WHERE ${c.join(' AND ')}` : '', params: p };
    };

    const FROM_JOIN = 'FROM Dynamic_Actas da LEFT JOIN Maestro_Operaciones mo ON mo.OPERACIÓN = da.operacion';

    // Ordenamiento dinámico seguro para permitir ver actas por fecha registro (por defecto DESC), fecha entrega, ID, etc.
    const ALLOWED_SORT_COLS = {
      IdActa: 'da.IdActa',
      Fecha_Entrega: 'da.Fecha_Entrega',
      Fecha_Registro: 'da.Fecha_Registro',
      Estado: 'da.Estado',
      Categoria: 'da.Categoria',
      operacion: 'da.operacion',
      Regional: 'mo.REGIONAL',
      Usuario: 'da.Usuario',
      Trabajador: 'COALESCE((SELECT v.Trabajador FROM `Maestro_Vinculación` v WHERE v.Identificación = da.identificacion ORDER BY v.`Fecha de Ingreso` DESC LIMIT 1), (SELECT s.Trabajador FROM `Maestro_Segmentación` s WHERE s.Identificación = da.identificacion LIMIT 1))'
    };

    const sortCol = ALLOWED_SORT_COLS[sort] || 'da.Fecha_Registro';
    const sortDir = (order || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const tieBreaker = sortCol === 'da.IdActa' ? '' : `, da.IdActa ${sortDir}`;
    const orderByClause = `ORDER BY ${sortCol} ${sortDir}${tieBreaker}`;

    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 500, 10), 2000);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (pageNum - 1) * pageSize;

    // 1. Preparar consultas de filas, conteos facetados y estadísticas consolidadas
    const listFilter = buildActasCountWhere([fEstado, fRegional, fOperacion, fCategoria, fFechaInicio, fFechaFin, fSearch]);
    const wTotal = buildActasCountWhere([fEstado, fRegional, fOperacion, fCategoria, fFechaInicio, fFechaFin, fSearch]);
    const wEstado = buildActasCountWhere([fRegional, fOperacion, fCategoria, fFechaInicio, fFechaFin, fSearch]);
    const wRegional = buildActasCountWhere([fEstado, fOperacion, fCategoria, fFechaInicio, fFechaFin, fSearch]);
    const wOperacion = buildActasCountWhere([fEstado, fRegional, fCategoria, fFechaInicio, fFechaFin, fSearch]);
    const wCategoria = buildActasCountWhere([fEstado, fRegional, fOperacion, fFechaInicio, fFechaFin, fSearch]);

    const [
      [rows],
      [[totalRow]],
      [estadoRows],
      [regionalRows],
      [operacionRows],
      [categoriaRows],
      [[statsRow]]
    ] = await Promise.all([
      pool.execute(
        `SELECT da.*,
          mo.REGIONAL AS Regional,
          COALESCE(
            (SELECT v.Trabajador FROM \`Maestro_Vinculación\` v WHERE v.Identificación = da.identificacion ORDER BY v.\`Fecha de Ingreso\` DESC LIMIT 1),
            (SELECT s.Trabajador FROM \`Maestro_Segmentación\` s WHERE s.Identificación = da.identificacion LIMIT 1)
          ) AS Trabajador,
          (SELECT COUNT(*) FROM Dynamic_Actas_Items i WHERE i.IdActa = da.IdActa) AS TotalItems
         ${FROM_JOIN}
         ${listFilter.where}
         ${orderByClause}
         LIMIT ${pageSize} OFFSET ${offset}`,
        listFilter.params
      ),
      pool.execute(`SELECT COUNT(*) AS total ${FROM_JOIN} ${wTotal.where}`, wTotal.params),
      pool.execute(`SELECT da.Estado AS k, COUNT(*) AS total ${FROM_JOIN} ${wEstado.where} GROUP BY da.Estado`, wEstado.params),
      pool.execute(`SELECT mo.REGIONAL AS k, COUNT(*) AS total ${FROM_JOIN} ${wRegional.where} GROUP BY mo.REGIONAL`, wRegional.params),
      pool.execute(`SELECT da.operacion AS k, COUNT(*) AS total ${FROM_JOIN} ${wOperacion.where} GROUP BY da.operacion`, wOperacion.params),
      pool.execute(`SELECT da.Categoria AS k, COUNT(*) AS total ${FROM_JOIN} ${wCategoria.where} GROUP BY da.Categoria`, wCategoria.params),
      pool.execute(
        `SELECT 
          COUNT(*) AS totalActas,
          SUM(CASE WHEN da.Estado = 'Firmada' THEN 1 ELSE 0 END) AS totalFirmadas,
          SUM(CASE WHEN da.Estado = 'Pendiente' THEN 1 ELSE 0 END) AS totalPendientes,
          SUM(CASE WHEN da.Estado = 'Anulada' THEN 1 ELSE 0 END) AS totalAnuladas
         ${FROM_JOIN}
         ${wEstado.where}`,
        wEstado.params
      )
    ]);

    const toMap = (dbRows) => {
      const map = {};
      dbRows.forEach(r => { if (r.k) map[r.k] = Number(r.total); });
      return map;
    };

    const totalCountVal = Number(totalRow.total || 0);

    const counts = {
      total: totalCountVal,
      porEstado: toMap(estadoRows),
      porRegional: toMap(regionalRows),
      porOperacion: toMap(operacionRows),
      porCategoria: toMap(categoriaRows),
    };

    const stats = {
      totalActas: Number(statsRow.totalActas || 0),
      totalFirmadas: Number(statsRow.totalFirmadas || 0),
      totalPendientes: Number(statsRow.totalPendientes || 0),
      totalAnuladas: Number(statsRow.totalAnuladas || 0),
    };

    res.json({
      results: rows,
      counts,
      stats,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total: totalCountVal,
        totalPages: Math.ceil(totalCountVal / pageSize) || 1
      }
    });
  } catch (err) {
    console.error('[actas] GET /api/actas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/acta/:id (detalle + items) ═════
router.get('/api/acta/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [[acta]] = await pool.execute('SELECT * FROM Dynamic_Actas WHERE IdActa = ?', [id]);
    if (!acta) return res.status(404).json({ error: 'Acta no encontrada' });

    const [[vinc]] = await pool.execute(
      'SELECT Trabajador FROM `Maestro_Vinculación` WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [acta.identificacion]
    );

    const contacto = await obtenerContactoTrabajador(acta.identificacion);

    const [items] = await pool.execute(
      `SELECT i.IdElemento, i.IdArticulo, i.Cantidad, i.Nota, a.Articulo, a.Referencia, a.Talla, a.Imagen
       FROM Dynamic_Actas_Items i
       LEFT JOIN Dynamic_Articulos a ON a.Id = i.IdArticulo
       WHERE i.IdActa = ?
       ORDER BY i.IdElemento`,
      [id]
    );

    res.json({
      ...acta,
      Trabajador: (vinc && vinc.Trabajador) || '',
      Email: contacto.email,
      Celular: contacto.celular,
      items,
    });
  } catch (err) {
    console.error('[actas] GET /api/acta/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/actas (crear, Estado inicial = Pendiente) ═════
router.post('/api/actas', upload.single('evidenciaFile'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { identificacion, operacion, categoria, fechaEntrega, observaciones, usuario, items, idSolicitud, email, celular } = req.body;

    if (!identificacion || !operacion || !categoria || !usuario) {
      return res.status(400).json({ error: 'Campos requeridos: identificacion, operacion, categoria, usuario' });
    }

    let itemsParsed = [];
    if (items) {
      itemsParsed = typeof items === 'string' ? JSON.parse(items) : items;
    }
    if (!Array.isArray(itemsParsed) || itemsParsed.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un artículo' });
    }
    itemsParsed = itemsParsed.map(item => ({
      IdArticulo: item.IdArticulo || item.idArticulo,
      Cantidad: item.Cantidad || item.cantidad,
      Nota: item.Nota || item.nota || null,
    }));
    for (const item of itemsParsed) {
      if (!item.IdArticulo || !item.Cantidad || item.Cantidad <= 0) {
        return res.status(400).json({ error: 'Cada artículo requiere IdArticulo y Cantidad > 0' });
      }
    }

    // Validar stock disponible: solo aplica (y solo mueve Kardex) si la Condicion es 'Definitivo'.
    // Cualquier otra condición permite registrar cualquier cantidad y no toca el inventario.
    const condicion = await resolverCondicionCategoria(categoria);
    if (condicion === 'Definitivo') {
      for (const item of itemsParsed) {
        const { disponible } = await calcularStockActa(operacion, item.IdArticulo);
        if (item.Cantidad > disponible) {
          return res.status(400).json({
            error: `Stock insuficiente para uno de los artículos (Disponible: ${disponible}, solicitado: ${item.Cantidad})`,
          });
        }
      }
    }

    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO Dynamic_Actas
       (identificacion, IdSolicitud, operacion, Fecha_Entrega, Categoria, Observaciones, Usuario, Estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Pendiente')`,
      [
        parseInt(identificacion),
        idSolicitud ? parseInt(idSolicitud) : null,
        operacion,
        fechaEntrega || null,
        categoria,
        observaciones || null,
        usuario,
      ]
    );
    const idActa = result.insertId;

    if (req.file) {
      const urlEvidencia = await subirEvidenciaActa(idActa, req.file.buffer, req.file.originalname, req.file.mimetype);
      await conn.execute('UPDATE Dynamic_Actas SET Url_Evidencia = ? WHERE IdActa = ?', [urlEvidencia, idActa]);
    }

    for (const item of itemsParsed) {
      await conn.execute(
        'INSERT INTO Dynamic_Actas_Items (IdActa, IdArticulo, Cantidad, Nota, Usuario) VALUES (?, ?, ?, ?, ?)',
        [idActa, item.IdArticulo, item.Cantidad, item.Nota, usuario]
      );
    }

    const [[actaRow]] = await conn.execute('SELECT * FROM Dynamic_Actas WHERE IdActa = ?', [idActa]);
    await registrarKardexActa({ conn, acta: actaRow, items: itemsParsed });

    await conn.commit();

    // Post-commit, en segundo plano: actualiza el contacto, genera el enlace de firma (48h)
    // y notifica por correo al trabajador si tiene correo registrado y el envío está activo.
    (async () => {
      try {
        if (email || celular) {
          await actualizarContactoTrabajador(parseInt(identificacion), email, celular);
        }
        const contacto = await obtenerContactoTrabajador(parseInt(identificacion));
        const emailDestino = (email && email.trim()) || contacto.email;
        if (!emailDestino || !ENVIO_CORREO_ACTAS_ACTIVO) return;

        const token = await generarToken('Dynamic_Actas', 'IdActa', idActa);
        const url = `${req.protocol}://${req.get('host')}/doclogyser/acta_entrega/${idActa}?token=${encodeURIComponent(token)}`;

        const { datos } = await construirDatosPlantilla(idActa, {});
        await notificarActaFirma({
          email: emailDestino,
          nombreTrabajador: datos.nombre_trabajador,
          categoria,
          urlFirma: url,
        });
      } catch (e) {
        console.error('[actas] Error en flujo post-creación (enlace/correo):', e.message);
      }
    })();

    res.status(201).json({ ok: true, idActa });
  } catch (err) {
    await conn.rollback();
    console.error('[actas] POST /api/actas:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ═════ API: PUT /api/acta/:id/items (edita los artículos de un Acta y reconcilia el Kardex) ═════
// Permitido si el Acta está Pendiente, o para cualquier Estado si el usuario tiene Rol = Sistema.
router.put('/api/acta/:id/items', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { usuario, items } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoActas(usuario);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const [[acta]] = await pool.execute('SELECT * FROM Dynamic_Actas WHERE IdActa = ?', [id]);
    if (!acta) return res.status(404).json({ error: 'Acta no encontrada' });

    if (acta.Estado !== 'Pendiente' && acceso.rol !== 'Sistema') {
      return res.status(403).json({ error: 'Solo se pueden editar los artículos de actas en estado Pendiente' });
    }

    let itemsParsed = Array.isArray(items) ? items : [];
    itemsParsed = itemsParsed.map(item => ({
      IdArticulo: item.IdArticulo || item.idArticulo,
      Cantidad: item.Cantidad || item.cantidad,
      Nota: item.Nota || item.nota || null,
    }));
    if (!itemsParsed.length) return res.status(400).json({ error: 'Debe incluir al menos un artículo' });
    for (const item of itemsParsed) {
      if (!item.IdArticulo || !item.Cantidad || item.Cantidad <= 0) {
        return res.status(400).json({ error: 'Cada artículo requiere IdArticulo y Cantidad > 0' });
      }
    }

    await conn.beginTransaction();

    // Revierte el Kardex e ítems previos de esta Acta ANTES de validar el stock, para que la
    // validación se haga sobre el escenario "sin esta Acta" (evita que el acta se autobloquee
    // por su propio movimiento anterior). calcularStockActa recibe `conn` para leer estos
    // cambios aún no confirmados dentro de la misma transacción.
    await conn.execute('DELETE FROM Dynamic_Kardex WHERE Acta = ?', [String(id)]);
    await conn.execute('DELETE FROM Dynamic_Actas_Items WHERE IdActa = ?', [id]);

    // Solo Condicion = 'Definitivo' bloquea por stock insuficiente y mueve Kardex; cualquier otra permite cualquier cantidad.
    const condicion = await resolverCondicionCategoria(acta.Categoria);
    if (condicion === 'Definitivo') {
      for (const item of itemsParsed) {
        const { disponible } = await calcularStockActa(acta.operacion, item.IdArticulo, conn);
        if (item.Cantidad > disponible) {
          await conn.rollback();
          return res.status(400).json({
            error: `Stock insuficiente para uno de los artículos (Disponible: ${disponible}, solicitado: ${item.Cantidad})`,
          });
        }
      }
    }

    for (const item of itemsParsed) {
      await conn.execute(
        'INSERT INTO Dynamic_Actas_Items (IdActa, IdArticulo, Cantidad, Nota, Usuario) VALUES (?, ?, ?, ?, ?)',
        [id, item.IdArticulo, item.Cantidad, item.Nota, usuario]
      );
    }

    await registrarKardexActa({ conn, acta, items: itemsParsed });

    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error('[actas] PUT /api/acta/:id/items:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ═════ API: POST /api/acta/:id/anular ═════
// Si la Categoria del Acta es Definitivo, revierte en el Kardex la salida de inventario que
// se generó al crearla (ver revertirKardexActa).
router.post('/api/acta/:id/anular', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { usuario } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoActas(usuario);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const [[acta]] = await pool.execute('SELECT * FROM Dynamic_Actas WHERE IdActa = ?', [id]);
    if (!acta) return res.status(404).json({ error: 'Acta no encontrada' });
    if (acta.Estado !== 'Pendiente') {
      return res.status(400).json({ error: 'Solo se pueden anular actas en estado Pendiente' });
    }

    await conn.beginTransaction();

    await revertirKardexActa({ conn, acta, usuarioAnula: usuario });

    await conn.execute(
      "UPDATE Dynamic_Actas SET Estado = 'Anulada', token_firma = NULL, token_expira = NULL WHERE IdActa = ?",
      [id]
    );

    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error('[actas] POST /api/acta/:id/anular:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ═════ API: POST /api/acta/:id/enlace (genera enlace de firma de 48h, sin correo) ═════
router.post('/api/acta/:id/enlace', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoActas(usuario);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const [[acta]] = await pool.execute('SELECT Estado FROM Dynamic_Actas WHERE IdActa = ?', [id]);
    if (!acta) return res.status(404).json({ error: 'Acta no encontrada' });
    if (acta.Estado !== 'Pendiente') {
      return res.status(400).json({ error: 'Solo se puede generar el enlace de firma para actas en estado Pendiente' });
    }

    const token = await generarToken('Dynamic_Actas', 'IdActa', id);
    const url = `${req.protocol}://${req.get('host')}/doclogyser/acta_entrega/${id}?token=${encodeURIComponent(token)}`;
    res.json({ ok: true, url });
  } catch (err) {
    console.error('[actas] POST /api/acta/:id/enlace:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/acta/:id/contacto (actualiza Email/Celular en Maestro_Segmentación) ═════
router.post('/api/acta/:id/contacto', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, email, celular } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoActas(usuario);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const [[acta]] = await pool.execute('SELECT identificacion FROM Dynamic_Actas WHERE IdActa = ?', [id]);
    if (!acta) return res.status(404).json({ error: 'Acta no encontrada' });

    await actualizarContactoTrabajador(acta.identificacion, email, celular);
    res.json({ ok: true });
  } catch (err) {
    console.error('[actas] POST /api/acta/:id/contacto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/acta/:id/correo (reenvía el enlace de firma por correo al trabajador) ═════
router.post('/api/acta/:id/correo', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, email, celular, url } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!url) return res.status(400).json({ error: 'Primero genera el enlace de firma' });

    const acceso = await computarAccesoActas(usuario);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const [[acta]] = await pool.execute('SELECT * FROM Dynamic_Actas WHERE IdActa = ?', [id]);
    if (!acta) return res.status(404).json({ error: 'Acta no encontrada' });
    if (acta.Estado !== 'Pendiente') {
      return res.status(400).json({ error: 'El acta ya no está pendiente de firma' });
    }

    await actualizarContactoTrabajador(acta.identificacion, email, celular);
    const contacto = await obtenerContactoTrabajador(acta.identificacion);
    const emailDestino = (email && email.trim()) || contacto.email;
    if (!emailDestino) {
      return res.status(400).json({ error: 'El trabajador no tiene correo registrado' });
    }

    if (!ENVIO_CORREO_ACTAS_ACTIVO) {
      return res.json({ ok: true, enviado: false, motivo: 'El envío de correo para Actas está desactivado temporalmente.' });
    }

    const { datos } = await construirDatosPlantilla(id, {});
    await notificarActaFirma({
      email: emailDestino,
      nombreTrabajador: datos.nombre_trabajador,
      categoria: acta.Categoria,
      urlFirma: url,
    });
    res.json({ ok: true, enviado: true });
  } catch (err) {
    console.error('[actas] POST /api/acta/:id/correo:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
