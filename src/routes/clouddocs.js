const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');
const { transporter } = require('../services/email');

const router = express.Router();

const HTML_INDEX_PATH = path.join(__dirname, '../views/clouddocs/index.html');

const ROLES_SIN_FILTRO = ['Sistema', 'AdmSst', 'LiderSst'];
const ROLES_REGIONAL = [];
const ROLES_DISPOSITIVO = ['AuxSst'];
const ROLES_MODALIDAD = ['AnaSst'];

// Helper to parse role permissions from Config_Rol
async function obtenerPermisosRol(rol) {
  if (!rol) return { doc_activo: [], doc_retirado: [], doc_general: [] };
  try {
    const [rows] = await pool.execute('SELECT doc_activo, doc_retirado, doc_general FROM Config_Rol WHERE Rol = ?', [rol]);
    if (!rows.length) return { doc_activo: [], doc_retirado: [], doc_general: [] };
    
    const parseIds = (val) => {
      if (!val) return [];
      if (val.trim().toLowerCase() === 'todo') return 'Todo';
      return val.split(',').map(s => s.trim()).filter(Boolean);
    };

    return {
      doc_activo: parseIds(rows[0].doc_activo),
      doc_retirado: parseIds(rows[0].doc_retirado),
      doc_general: parseIds(rows[0].doc_general)
    };
  } catch (err) {
    console.error('[cloud-docs] Error fetching role permissions:', err.message);
    return { doc_activo: [], doc_retirado: [], doc_general: [] };
  }
}

// Lógica de computación de acceso por regional y operación
async function computarAccesoCloudDocs(usuarioId) {
  if (!usuarioId) return null;

  const [uRows] = await pool.execute(
    'SELECT ID, Nombre, Rol, Regional, Dispositivo, `Operación`, Email FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );
  if (!uRows.length) return null;

  const usuario = uRows[0];
  const rol = usuario.Rol || '';

  const acceso = {
    usuarioId: usuario.ID,
    usuarioNombre: usuario.Nombre || usuario.ID,
    usuarioEmail: usuario.Email || '',
    rol,
    regional: usuario.Regional || '',
    dispositivo: usuario.Dispositivo || '',
    operacion: usuario['Operación'] || '',
    sinFiltro: ROLES_SIN_FILTRO.includes(rol),
    operacionesFiltro: [],
    opsPorRegional: {},
    permisos: await obtenerPermisosRol(rol)
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

// Construye la condición SQL según los permisos de Config_Rol para Trabajador
function construirFiltroRolTrabajador(permisos, tableAlias = 't') {
  const conds = [];
  if (permisos.doc_activo === 'Todo') {
    conds.push(`(${tableAlias}.Estado = 'Activo')`);
  } else if (Array.isArray(permisos.doc_activo) && permisos.doc_activo.length > 0) {
    const ph = permisos.doc_activo.map(id => `'${id}'`).join(',');
    conds.push(`(${tableAlias}.Estado = 'Activo' AND ${tableAlias}.TipoDocumento IN (${ph}))`);
  }

  if (permisos.doc_retirado === 'Todo') {
    conds.push(`(${tableAlias}.Estado = 'Retirado')`);
  } else if (Array.isArray(permisos.doc_retirado) && permisos.doc_retirado.length > 0) {
    const ph = permisos.doc_retirado.map(id => `'${id}'`).join(',');
    conds.push(`(${tableAlias}.Estado = 'Retirado' AND ${tableAlias}.TipoDocumento IN (${ph}))`);
  }

  if (conds.length === 0) return '0 = 1';
  return `(${conds.join(' OR ')})`;
}

// Construye la condición SQL según los permisos de Config_Rol para General (Empresa)
function construirFiltroRolGeneral(permisos, tableAlias = 'e') {
  if (permisos.doc_general === 'Todo') {
    return '1 = 1';
  } else if (Array.isArray(permisos.doc_general) && permisos.doc_general.length > 0) {
    const ph = permisos.doc_general.map(id => `'${id}'`).join(',');
    return `${tableAlias}.TipoDocumento IN (${ph})`;
  }
  return '0 = 1';
}

// Servir la interfaz
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const acceso = await computarAccesoCloudDocs(usuario);
    if (!acceso) {
      return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');
    }

    const html = fs.readFileSync(HTML_INDEX_PATH, 'utf8');
    const config = JSON.stringify({
      ...acceso,
      regionalesFiltro: Object.keys(acceso.opsPorRegional)
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[cloud-docs] Error serving page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// API: Listado de trabajadores (Vista Trabajador)
router.get('/api/trabajadores', async (req, res) => {
  try {
    const { usuario, buscar, regional, operacion } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoCloudDocs(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const conds = [];
    const params = [];

    // Filtros de acceso (segmentación regional/operación)
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) return res.json([]);
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      conds.push(`mv.Operación IN (${ph})`);
      params.push(...acceso.operacionesFiltro);
    }

    // Filtros dinámicos de UI
    if (buscar) {
      conds.push('(s.Trabajador LIKE ? OR s.Identificación LIKE ?)');
      params.push(`%${buscar}%`, `%${buscar}%`);
    }
    if (regional) {
      conds.push('mv.Regional = ?');
      params.push(regional);
    }
    if (operacion) {
      conds.push('mv.Operación = ?');
      params.push(operacion);
    }

    const roleFilter = construirFiltroRolTrabajador(acceso.permisos, 't');
    const whereClause = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const sql = `
      SELECT 
        s.Identificación AS identificacion,
        s.Trabajador AS trabajador,
        mv.Operación AS operacion,
        mv.Estado AS estado,
        DATE_FORMAT(mv.max_fecha_ingreso, '%Y-%m-%d') AS fechaIngreso,
        COALESCE(d.doc_count, 0) AS documentosCount
      FROM Maestro_Segmentación s
      JOIN (
        SELECT v1.Identificación, v1.Regional, v1.Operación, v1.Estado, v1.\`Fecha de Ingreso\` AS max_fecha_ingreso
        FROM Maestro_Vinculación v1
        INNER JOIN (
          SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS max_fecha
          FROM Maestro_Vinculación
          GROUP BY Identificación
        ) v2 ON v1.Identificación = v2.Identificación AND v1.\`Fecha de Ingreso\` = v2.max_fecha
      ) mv ON s.Identificación = mv.Identificación
      LEFT JOIN (
        SELECT Identificación, COUNT(*) AS doc_count
        FROM Maestro_docTrabajador t
        WHERE ${roleFilter}
        GROUP BY Identificación
      ) d ON s.Identificación = d.Identificación
      ${whereClause}
      ORDER BY s.Trabajador ASC
      LIMIT 1000
    `;

    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[cloud-docs] GET /api/trabajadores:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Documentos de un trabajador específico (Modal de Trabajador)
router.get('/api/trabajador/:id/documentos', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoCloudDocs(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    // Consultamos todos los documentos del trabajador
    const sql = `
      SELECT 
        t.id,
        t.TipoDocumento,
        t.Prefijo,
        c.Documento,
        DATE_FORMAT(t.FechaRegistro, '%Y-%m-%d %H:%i:%s') AS FechaRegistro,
        t.Usuario,
        t.Url,
        t.Solicitud,
        t.Justificacion_Solicitud,
        t.Estado
      FROM Maestro_docTrabajador t
      LEFT JOIN Config_Doc_Trabajador c ON t.TipoDocumento = CAST(c.Id AS CHAR)
      WHERE t.Identificación = ?
      ORDER BY t.FechaRegistro DESC
    `;

    const [rows] = await pool.execute(sql, [id]);

    // Aplicar permiso individual a cada registro
    const result = rows.map(r => {
      let permitido = false;
      const tipo = r.TipoDocumento;

      if (r.Estado === 'Activo') {
        if (acceso.permisos.doc_activo === 'Todo' || (Array.isArray(acceso.permisos.doc_activo) && acceso.permisos.doc_activo.includes(tipo))) {
          permitido = true;
        }
      } else if (r.Estado === 'Retirado') {
        if (acceso.permisos.doc_retirado === 'Todo' || (Array.isArray(acceso.permisos.doc_retirado) && acceso.permisos.doc_retirado.includes(tipo))) {
          permitido = true;
        }
      }

      return {
        ...r,
        permitido,
        // Protegemos el URL si no tiene permisos de ver
        Url: permitido ? r.Url : null
      };
    });

    res.json(result);
  } catch (err) {
    console.error('[cloud-docs] GET /api/trabajador/:id/documentos:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Listado de tipos de documentos (Vista Documentos)
router.get('/api/documentos', async (req, res) => {
  try {
    const { usuario, buscar } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoCloudDocs(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const sql = `
      SELECT 
        c.Id,
        c.Documento,
        c.Clasificacion,
        c.Prefijo,
        c.tipo_doc,
        COALESCE(t.trabajador_count, 0) AS Trabajadores
      FROM Config_Doc_Trabajador c
      LEFT JOIN (
        SELECT TipoDocumento, COUNT(DISTINCT Identificación) AS trabajador_count
        FROM Maestro_docTrabajador
        GROUP BY TipoDocumento
      ) t ON CAST(c.Id AS CHAR) = t.TipoDocumento
      ORDER BY c.Documento ASC
    `;

    const [rows] = await pool.execute(sql);

    // Filtrar por permisos del Rol
    const p = acceso.permisos;
    const filtered = rows.filter(r => {
      const id = String(r.Id);
      const allowedActive = p.doc_activo === 'Todo' || (Array.isArray(p.doc_activo) && p.doc_activo.includes(id));
      const allowedRetired = p.doc_retirado === 'Todo' || (Array.isArray(p.doc_retirado) && p.doc_retirado.includes(id));
      const allowedGeneral = p.doc_general === 'Todo' || (Array.isArray(p.doc_general) && p.doc_general.includes(id));
      
      // Debe ser permitido bajo al menos una condición
      return allowedActive || allowedRetired || allowedGeneral;
    });

    // Filtro de búsqueda textual si aplica
    const result = buscar 
      ? filtered.filter(f => f.Documento.toLowerCase().includes(buscar.toLowerCase()) || f.Prefijo.toLowerCase().includes(buscar.toLowerCase()))
      : filtered;

    res.json(result);
  } catch (err) {
    console.error('[cloud-docs] GET /api/documentos:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Registros específicos de un tipo de documento (Modal de Documentos)
router.get('/api/documento/:id/registros', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, regional, operacion } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoCloudDocs(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    // Consultamos el tipo de documento para saber si es de Trabajador o General
    const [cRows] = await pool.execute('SELECT tipo_doc, Documento FROM Config_Doc_Trabajador WHERE Id = ?', [id]);
    if (!cRows.length) return res.status(404).json({ error: 'Documento no encontrado en configuración' });

    const configDoc = cRows[0];
    let sql = '';
    const params = [];

    // Construir WHERE regional/operacion
    const conds = [];
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) return res.json([]);
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      conds.push(`t.Operación IN (${ph})`);
      params.push(...acceso.operacionesFiltro);
    }
    if (regional) {
      conds.push('t.Regional = ?');
      params.push(regional);
    }
    if (operacion) {
      conds.push('t.Operación = ?');
      params.push(operacion);
    }

    if (configDoc.tipo_doc === 'Trabajador') {
      conds.push('t.TipoDocumento = ?');
      params.push(id);
      const whereClause = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

      sql = `
        SELECT 
          t.id,
          t.Identificación,
          v.Trabajador AS TrabajadorNombre,
          t.Regional,
          t.Operación,
          t.Estado,
          DATE_FORMAT(t.FechaRegistro, '%Y-%m-%d %H:%i:%s') AS FechaRegistro,
          t.Usuario,
          t.Url,
          t.Solicitud,
          t.Justificacion_Solicitud,
          'Trabajador' AS tipo_registro
        FROM Maestro_docTrabajador t
        LEFT JOIN Maestro_Segmentación v ON t.Identificación = v.Identificación
        ${whereClause}
        ORDER BY t.FechaRegistro DESC
      `;
    } else {
      // General/Empresa
      conds.push('t.TipoDocumento = ?');
      params.push(id);
      const whereClause = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

      sql = `
        SELECT 
          t.id,
          NULL AS Identificación,
          NULL AS TrabajadorNombre,
          t.Regional,
          t.Operación,
          NULL AS Estado,
          DATE_FORMAT(t.FechaRegistro, '%Y-%m-%d %H:%i:%s') AS FechaRegistro,
          t.Usuario,
          t.Url,
          t.Solicitud,
          t.Justificacion_Solicitud,
          'General' AS tipo_registro
        FROM Maestro_docEmpresa t
        ${whereClause}
        ORDER BY t.FechaRegistro DESC
      `;
    }

    const [rows] = await pool.execute(sql, params);

    // Calcular indicador "permitido" para cada fila
    const p = acceso.permisos;
    const result = rows.map(r => {
      let permitido = false;
      if (r.tipo_registro === 'Trabajador') {
        if (r.Estado === 'Activo') {
          if (p.doc_activo === 'Todo' || (Array.isArray(p.doc_activo) && p.doc_activo.includes(id))) {
            permitido = true;
          }
        } else if (r.Estado === 'Retirado') {
          if (p.doc_retirado === 'Todo' || (Array.isArray(p.doc_retirado) && p.doc_retirado.includes(id))) {
            permitido = true;
          }
        }
      } else {
        // General
        if (p.doc_general === 'Todo' || (Array.isArray(p.doc_general) && p.doc_general.includes(id))) {
          permitido = true;
        }
      }

      return {
        ...r,
        permitido,
        Url: permitido ? r.Url : null
      };
    });

    res.json(result);
  } catch (err) {
    console.error('[cloud-docs] GET /api/documento/:id/registros:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Consolidado General (Vista Todo)
router.get('/api/todo', async (req, res) => {
  try {
    const { usuario, buscar, regional, operacion } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoCloudDocs(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    // Filtros de acceso (segmentación regional/operación)
    const condsTrab = [];
    const condsGen = [];
    const paramsTrab = [];
    const paramsGen = [];

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) return res.json([]);
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      condsTrab.push(`t.Operación IN (${ph})`);
      condsGen.push(`e.Operación IN (${ph})`);
      paramsTrab.push(...acceso.operacionesFiltro);
      paramsGen.push(...acceso.operacionesFiltro);
    }

    if (regional) {
      condsTrab.push('t.Regional = ?');
      condsGen.push('e.Regional = ?');
      paramsTrab.push(regional);
      paramsGen.push(regional);
    }
    if (operacion) {
      condsTrab.push('t.Operación = ?');
      condsGen.push('e.Operación = ?');
      paramsTrab.push(operacion);
      paramsGen.push(operacion);
    }

    // Filtro de búsqueda textual
    if (buscar) {
      condsTrab.push('(c.Documento LIKE ? OR t.Prefijo LIKE ? OR v.Trabajador LIKE ? OR t.Identificación LIKE ?)');
      paramsTrab.push(`%${buscar}%`, `%${buscar}%`, `%${buscar}%`, `%${buscar}%`);

      condsGen.push('(c.Documento LIKE ? OR e.Prefijo LIKE ?)');
      paramsGen.push(`%${buscar}%`, `%${buscar}%`);
    }

    // Aplicar filtros de roles (Config_Rol) en la base de datos para restringir visualización general
    const roleFilterTrab = construirFiltroRolTrabajador(acceso.permisos, 't');
    const roleFilterGen = construirFiltroRolGeneral(acceso.permisos, 'e');

    condsTrab.push(roleFilterTrab);
    condsGen.push(roleFilterGen);

    const whereTrab = condsTrab.length ? `WHERE ${condsTrab.join(' AND ')}` : '';
    const whereGen = condsGen.length ? `WHERE ${condsGen.join(' AND ')}` : '';

    const sql = `
      SELECT * FROM (
        SELECT 
          'Trabajador' AS tipo_registro,
          t.id,
          t.TipoDocumento,
          t.Prefijo,
          c.Documento,
          t.Identificación AS Identificacion,
          v.Trabajador AS TrabajadorNombre,
          t.Operación,
          t.Estado,
          DATE_FORMAT(t.Fecha_Ingreso, '%Y-%m-%d') AS FechaIngreso,
          DATE_FORMAT(t.FechaRegistro, '%Y-%m-%d %H:%i:%s') AS FechaRegistro,
          t.Usuario,
          t.Observaciones,
          t.Url,
          t.Solicitud,
          t.Justificacion_Solicitud
        FROM Maestro_docTrabajador t
        LEFT JOIN Config_Doc_Trabajador c ON t.TipoDocumento = CAST(c.Id AS CHAR)
        LEFT JOIN Maestro_Segmentación v ON t.Identificación = v.Identificación
        ${whereTrab}

        UNION ALL

        SELECT 
          'General' AS tipo_registro,
          e.id,
          e.TipoDocumento,
          e.Prefijo,
          c.Documento,
          NULL AS Identificacion,
          NULL AS TrabajadorNombre,
          e.Operación,
          NULL AS Estado,
          NULL AS FechaIngreso,
          DATE_FORMAT(e.FechaRegistro, '%Y-%m-%d %H:%i:%s') AS FechaRegistro,
          e.Usuario,
          e.Observaciones,
          e.Url,
          e.Solicitud,
          e.Justificacion_Solicitud
        FROM Maestro_docEmpresa e
        LEFT JOIN Config_Doc_Trabajador c ON e.TipoDocumento = CAST(c.Id AS CHAR)
        ${whereGen}
      ) combined
      ORDER BY combined.FechaRegistro DESC
      LIMIT 1000
    `;

    // Combinamos todos los parámetros
    const allParams = [...paramsTrab, ...paramsGen];
    const [rows] = await pool.execute(sql, allParams);

    // Calcular indicador "permitido"
    const p = acceso.permisos;
    const result = rows.map(r => {
      let permitido = false;
      const id = r.TipoDocumento;

      if (r.tipo_registro === 'Trabajador') {
        if (r.Estado === 'Activo') {
          if (p.doc_activo === 'Todo' || (Array.isArray(p.doc_activo) && p.doc_activo.includes(id))) {
            permitido = true;
          }
        } else if (r.Estado === 'Retirado') {
          if (p.doc_retirado === 'Todo' || (Array.isArray(p.doc_retirado) && p.doc_retirado.includes(id))) {
            permitido = true;
          }
        }
      } else {
        if (p.doc_general === 'Todo' || (Array.isArray(p.doc_general) && p.doc_general.includes(id))) {
          permitido = true;
        }
      }

      return {
        ...r,
        permitido,
        Url: permitido ? r.Url : null
      };
    });

    res.json(result);
  } catch (err) {
    console.error('[cloud-docs] GET /api/todo:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Solicitar acceso a un documento
router.post('/api/solicitar', async (req, res) => {
  try {
    const { id_documento, justificacion, usuario, tipo_registro } = req.body;
    if (!id_documento || !justificacion || !usuario || !tipo_registro) {
      return res.status(400).json({ error: 'Parámetros incompletos' });
    }

    // 1. Actualizar el registro en la base de datos
    let docInfo = null;
    if (tipo_registro === 'Trabajador') {
      await pool.execute(
        `UPDATE Maestro_docTrabajador 
         SET Solicitud = 'SI', Justificacion_Solicitud = ? 
         WHERE id = ?`,
        [justificacion, id_documento]
      );

      // Obtener metadatos para el correo
      const [rows] = await pool.execute(
        `SELECT t.Identificación, t.Prefijo, c.Documento, v.Trabajador
         FROM Maestro_docTrabajador t
         LEFT JOIN Config_Doc_Trabajador c ON t.TipoDocumento = CAST(c.Id AS CHAR)
         LEFT JOIN Maestro_Segmentación v ON t.Identificación = v.Identificación
         WHERE t.id = ?`,
        [id_documento]
      );
      if (rows.length) {
        docInfo = {
          tipo: 'Trabajador',
          prefijo: rows[0].Prefijo,
          documento: rows[0].Documento,
          trabajador: rows[0].Trabajador || rows[0].Identificación,
          identificacion: rows[0].Identificación
        };
      }
    } else {
      // General
      await pool.execute(
        `UPDATE Maestro_docEmpresa 
         SET Solicitud = 'SI', Justificacion_Solicitud = ? 
         WHERE id = ?`,
        [justificacion, id_documento]
      );

      // Obtener metadatos
      const [rows] = await pool.execute(
        `SELECT e.Prefijo, c.Documento
         FROM Maestro_docEmpresa e
         LEFT JOIN Config_Doc_Trabajador c ON e.TipoDocumento = CAST(c.Id AS CHAR)
         WHERE e.id = ?`,
        [id_documento]
      );
      if (rows.length) {
        docInfo = {
          tipo: 'General / Empresa',
          prefijo: rows[0].Prefijo,
          documento: rows[0].Documento,
          trabajador: 'N/A (Documento General de Empresa)',
          identificacion: 'N/A'
        };
      }
    }

    if (!docInfo) {
      docInfo = {
        tipo: tipo_registro,
        prefijo: 'N/A',
        documento: 'Documento ID: ' + id_documento,
        trabajador: 'N/A',
        identificacion: 'N/A'
      };
    }

    // 2. Consultar el email y nombre del usuario solicitante
    const [uRows] = await pool.execute(
      'SELECT Email, Nombre FROM Maestro_Usuarios WHERE ID = ?',
      [usuario]
    );
    const emailUsuario = uRows.length ? uRows[0].Email : null;
    const nombreUsuario = uRows.length ? uRows[0].Nombre : usuario;

    // 3. Enviar correo electrónico
    const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@logyser.com';
    const asunto = `Nueva Solicitud de Acceso a Documento: ${docInfo.documento}`;

    const cuerpo = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #edf2f7;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05)">
        <div style="background:#1e3c72;color:#ffffff;padding:20px;text-align:center">
          <h2 style="margin:0;font-size:1.4rem">LOG&SER Gestión Documental</h2>
          <p style="margin:5px 0 0;font-size:0.9rem;opacity:0.9">Solicitud de Acceso a Archivo Digital</p>
        </div>
        <div style="padding:24px;background:#ffffff">
          <p style="color:#333;font-size:1rem;margin-top:0">Se ha registrado una solicitud para visualizar un documento restringido:</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:0.9rem">
            <tr style="background:#f8fafc">
              <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#4a5568;width:35%">Solicitado por:</td>
              <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#2d3748">${nombreUsuario} (${usuario})</td>
            </tr>
            <tr>
              <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#4a5568">Tipo de Documento:</td>
              <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#2d3748">${docInfo.documento} (${docInfo.prefijo})</td>
            </tr>
            <tr style="background:#f8fafc">
              <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#4a5568">Tipo Registro:</td>
              <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#2d3748">${docInfo.tipo}</td>
            </tr>
            <tr>
              <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#4a5568">Trabajador:</td>
              <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#2d3748">${docInfo.trabajador}</td>
            </tr>
            <tr style="background:#f8fafc">
              <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#4a5568">Identificación:</td>
              <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#2d3748">${docInfo.identificacion}</td>
            </tr>
            <tr>
              <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#4a5568;vertical-align:top">Justificación:</td>
              <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#2d3748;line-height:1.4">${justificacion}</td>
            </tr>
          </table>
          <p style="color:#718096;font-size:0.8rem;margin-bottom:0">Por favor proceda a gestionar el acceso correspondiente.</p>
        </div>
        <div style="background:#edf2f7;padding:12px;text-align:center;font-size:0.75rem;color:#718096">
          © ${new Date().getFullYear()} LOG&SER S.A.S. — Todos los derechos reservados.
        </div>
      </div>
    `;

    const recipients = ['gestiondocumental@logyser.com'];
    const mailOptions = {
      from: `"LOG&SER Gestión Documental" <${EMAIL_FROM}>`,
      to: recipients.join(', '),
      subject: asunto,
      html: cuerpo
    };

    if (emailUsuario) {
      mailOptions.cc = emailUsuario;
    }

    await transporter.sendMail(mailOptions);

    res.json({ ok: true });
  } catch (err) {
    console.error('[cloud-docs] Error handling request:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
