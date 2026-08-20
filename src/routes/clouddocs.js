const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');
const {
  computarAccesoCloudDocs,
  construirFiltroRolTrabajador,
  construirFiltroRolGeneral,
} = require('../services/clouddocsAccess');
const {
  crearSolicitudAcceso,
  gestionarSolicitudAcceso,
} = require('../services/clouddocsRequests');

const router = express.Router();

const HTML_INDEX_PATH = path.join(__dirname, '../views/clouddocs/index.html');

// Servir la interfaz
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const acceso = await computarAccesoCloudDocs(pool, usuario);
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
    const { usuario, buscar, regional, operacion, estado } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoCloudDocs(pool, usuario);
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
      conds.push('s.Trabajador COLLATE utf8mb4_general_ci LIKE ?');
      params.push(`%${buscar}%`);
    }
    if (regional) {
      conds.push('mv.Regional = ?');
      params.push(regional);
    }
    if (operacion) {
      conds.push('mv.Operación = ?');
      params.push(operacion);
    }
    if (estado) {
      conds.push('mv.Estado = ?');
      params.push(estado);
    }

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
        FROM Maestro_docTrabajador
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

    const acceso = await computarAccesoCloudDocs(pool, usuario);
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
        t.Observaciones,
        t.Solicitud,
        t.Justificacion_Solicitud,
        t.Estado,
        t.Visualizar
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

      if (r.Visualizar === 'OK') {
        permitido = true;
      } else if (r.Estado === 'Activo') {
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
    const { usuario, buscarTrabajador } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoCloudDocs(pool, usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    let sql = '';
    const params = [];

    if (buscarTrabajador) {
      sql = `
        SELECT 
          c.Id,
          c.Documento,
          c.Clasificacion,
          c.Prefijo,
          c.tipo_doc,
          COALESCE(t.trabajador_count, 0) AS Trabajadores
        FROM Config_Doc_Trabajador c
        INNER JOIN (
          SELECT TipoDocumento, COUNT(DISTINCT t.Identificación) AS trabajador_count
          FROM Maestro_docTrabajador t
          LEFT JOIN Maestro_Segmentación s ON t.Identificación = s.Identificación
          WHERE s.Trabajador COLLATE utf8mb4_general_ci LIKE ?
          GROUP BY TipoDocumento
        ) t ON CAST(c.Id AS CHAR) = t.TipoDocumento
        ORDER BY c.Documento ASC
      `;
      params.push(`%${buscarTrabajador}%`);
    } else {
      sql = `
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
    }

    const [rows] = await pool.execute(sql, params);

    // Filtrar por permisos del Rol
    const p = acceso.permisos;
    const filtered = rows.filter(r => {
      const id = String(r.Id);
      const allowedActive = p.doc_activo === 'Todo' || (Array.isArray(p.doc_activo) && p.doc_activo.includes(id));
      const allowedRetired = p.doc_retirado === 'Todo' || (Array.isArray(p.doc_retirado) && p.doc_retirado.includes(id));
      const allowedGeneral = p.doc_general === 'Todo' || (Array.isArray(p.doc_general) && p.doc_general.includes(id));
      
      return allowedActive || allowedRetired || allowedGeneral;
    });

    res.json(filtered);
  } catch (err) {
    console.error('[cloud-docs] GET /api/documentos:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Registros específicos de un tipo de documento (Modal de Documentos)
router.get('/api/documento/:id/registros', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, regional, operacion, buscarTrabajador } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoCloudDocs(pool, usuario);
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
    if (buscarTrabajador) {
      if (configDoc.tipo_doc === 'Trabajador') {
        conds.push('v.Trabajador COLLATE utf8mb4_general_ci LIKE ?');
        params.push(`%${buscarTrabajador}%`);
      } else {
        conds.push('0 = 1');
      }
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
          t.Visualizar,
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
          t.Visualizar,
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
    const { usuario, buscar, regional, operacion, tipoDocumento, estado, tipoRegistro } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoCloudDocs(pool, usuario);
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

    // Filtro de Tipo de Documento
    if (tipoDocumento) {
      condsTrab.push('t.TipoDocumento = ?');
      paramsTrab.push(tipoDocumento);

      condsGen.push('e.TipoDocumento = ?');
      paramsGen.push(tipoDocumento);
    }

    // Filtro de Estado
    if (estado) {
      condsTrab.push('t.Estado = ?');
      paramsTrab.push(estado);

      condsGen.push('0 = 1');
    }

    // Filtro de búsqueda textual (sólo por trabajador)
    if (buscar) {
      condsTrab.push('v.Trabajador COLLATE utf8mb4_general_ci LIKE ?');
      paramsTrab.push(`%${buscar}%`);

      condsGen.push('0 = 1');
    }

    // Aplicar filtros de roles (Config_Rol) en la base de datos para restringir visualización general
    const roleFilterTrab = construirFiltroRolTrabajador(acceso.permisos, 't');
    const roleFilterGen = construirFiltroRolGeneral(acceso.permisos, 'e');

    condsTrab.push(roleFilterTrab);
    condsGen.push(roleFilterGen);

    const whereTrab = condsTrab.length ? `WHERE ${condsTrab.join(' AND ')}` : '';
    const whereGen = condsGen.length ? `WHERE ${condsGen.join(' AND ')}` : '';

    const selectTrab = `
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
        t.Justificacion_Solicitud,
        t.Visualizar
      FROM Maestro_docTrabajador t
      LEFT JOIN Config_Doc_Trabajador c ON t.TipoDocumento = CAST(c.Id AS CHAR)
      LEFT JOIN Maestro_Segmentación v ON t.Identificación = v.Identificación
      ${whereTrab}
    `;

    const selectGen = `
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
        e.Justificacion_Solicitud,
        e.Visualizar
      FROM Maestro_docEmpresa e
      LEFT JOIN Config_Doc_Trabajador c ON e.TipoDocumento = CAST(c.Id AS CHAR)
      ${whereGen}
    `;

    let sql = '';
    let allParams = [];

    if (tipoRegistro === 'Trabajador') {
      sql = `SELECT * FROM (${selectTrab}) combined ORDER BY combined.FechaRegistro DESC LIMIT 1000`;
      allParams = paramsTrab;
    } else if (tipoRegistro === 'General') {
      sql = `SELECT * FROM (${selectGen}) combined ORDER BY combined.FechaRegistro DESC LIMIT 1000`;
      allParams = paramsGen;
    } else {
      sql = `
        SELECT * FROM (
          ${selectTrab}
          UNION ALL
          ${selectGen}
        ) combined
        ORDER BY combined.FechaRegistro DESC
        LIMIT 1000
      `;
      allParams = [...paramsTrab, ...paramsGen];
    }

    const [rows] = await pool.execute(sql, allParams);

    // Calcular indicador "permitido"
    const p = acceso.permisos;
    const result = rows.map(r => {
      let permitido = false;

      if (r.Visualizar === 'OK') {
        permitido = true;
      } else if (r.tipo_registro === 'Trabajador') {
        const id = r.TipoDocumento;
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
        const id = r.TipoDocumento;
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

// API: Obtener conteos dinámicos para los filtros (Faceted Search)
router.get('/api/conteos', async (req, res) => {
  try {
    const { usuario, activeTab, buscar, regional, operacion, estado, tipoDocumento, tipoRegistro, estadoSolicitud } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoCloudDocs(pool, usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const response = {
      regionales: {},
      operaciones: {},
      estados: {},
      tiposRegistro: {},
      estadosSolicitud: {},
      tiposDocumento: {}
    };

    if (activeTab === 'trabajador') {
      // 1. Regionales
      const regConds = [];
      const regParams = [];
      if (!acceso.sinFiltro) {
        regConds.push(`mv.Operación IN (${acceso.operacionesFiltro.map(()=>'?').join(',')})`);
        regParams.push(...acceso.operacionesFiltro);
      }
      if (buscar) {
        regConds.push('s.Trabajador COLLATE utf8mb4_general_ci LIKE ?');
        regParams.push(`%${buscar}%`);
      }
      if (estado) {
        regConds.push('mv.Estado = ?');
        regParams.push(estado);
      }
      if (operacion) {
        regConds.push('mv.Operación = ?');
        regParams.push(operacion);
      }
      const regWhere = regConds.length ? `WHERE ${regConds.join(' AND ')}` : '';
      const [regRows] = await pool.execute(
        `SELECT mv.Regional, COUNT(*) AS total
         FROM Maestro_Segmentación s
         JOIN (
           SELECT v1.Identificación, v1.Regional, v1.Operación, v1.Estado
           FROM Maestro_Vinculación v1
           INNER JOIN (
             SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS max_fecha
             FROM Maestro_Vinculación
             GROUP BY Identificación
           ) v2 ON v1.Identificación = v2.Identificación AND v1.\`Fecha de Ingreso\` = v2.max_fecha
         ) mv ON s.Identificación = mv.Identificación
         ${regWhere}
         GROUP BY mv.Regional`,
        regParams
      );
      regRows.forEach(r => { if (r.Regional) response.regionales[r.Regional] = r.total; });

      // 2. Operaciones
      const opConds = [];
      const opParams = [];
      if (!acceso.sinFiltro) {
        opConds.push(`mv.Operación IN (${acceso.operacionesFiltro.map(()=>'?').join(',')})`);
        opParams.push(...acceso.operacionesFiltro);
      }
      if (buscar) {
        opConds.push('s.Trabajador COLLATE utf8mb4_general_ci LIKE ?');
        opParams.push(`%${buscar}%`);
      }
      if (estado) {
        opConds.push('mv.Estado = ?');
        opParams.push(estado);
      }
      if (regional) {
        opConds.push('mv.Regional = ?');
        opParams.push(regional);
      }
      const opWhere = opConds.length ? `WHERE ${opConds.join(' AND ')}` : '';
      const [opRows] = await pool.execute(
        `SELECT mv.Operación, COUNT(*) AS total
         FROM Maestro_Segmentación s
         JOIN (
           SELECT v1.Identificación, v1.Regional, v1.Operación, v1.Estado
           FROM Maestro_Vinculación v1
           INNER JOIN (
             SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS max_fecha
             FROM Maestro_Vinculación
             GROUP BY Identificación
           ) v2 ON v1.Identificación = v2.Identificación AND v1.\`Fecha de Ingreso\` = v2.max_fecha
         ) mv ON s.Identificación = mv.Identificación
         ${opWhere}
         GROUP BY mv.Operación`,
        opParams
      );
      opRows.forEach(o => { if (o.Operación) response.operaciones[o.Operación] = o.total; });

      // 3. Estados
      const estConds = [];
      const estParams = [];
      if (!acceso.sinFiltro) {
        estConds.push(`mv.Operación IN (${acceso.operacionesFiltro.map(()=>'?').join(',')})`);
        estParams.push(...acceso.operacionesFiltro);
      }
      if (buscar) {
        estConds.push('s.Trabajador COLLATE utf8mb4_general_ci LIKE ?');
        estParams.push(`%${buscar}%`);
      }
      if (regional) {
        estConds.push('mv.Regional = ?');
        estParams.push(regional);
      }
      if (operacion) {
        estConds.push('mv.Operación = ?');
        estParams.push(operacion);
      }
      const estWhere = estConds.length ? `WHERE ${estConds.join(' AND ')}` : '';
      const [estRows] = await pool.execute(
        `SELECT mv.Estado, COUNT(*) AS total
         FROM Maestro_Segmentación s
         JOIN (
           SELECT v1.Identificación, v1.Regional, v1.Operación, v1.Estado
           FROM Maestro_Vinculación v1
           INNER JOIN (
             SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS max_fecha
             FROM Maestro_Vinculación
             GROUP BY Identificación
           ) v2 ON v1.Identificación = v2.Identificación AND v1.\`Fecha de Ingreso\` = v2.max_fecha
         ) mv ON s.Identificación = mv.Identificación
         ${estWhere}
         GROUP BY mv.Estado`,
        estParams
      );
      estRows.forEach(e => { if (e.Estado) response.estados[e.Estado] = e.total; });
    }

    else if (activeTab === 'documento') {
      // 1. Regionales
      const regConds = [];
      const regParams = [];
      if (!acceso.sinFiltro) {
        regConds.push(`t.Operación IN (${acceso.operacionesFiltro.map(()=>'?').join(',')})`);
        regParams.push(...acceso.operacionesFiltro);
      }
      if (buscar) {
        regConds.push('s.Trabajador COLLATE utf8mb4_general_ci LIKE ?');
        regParams.push(`%${buscar}%`);
      }
      if (operacion) {
        regConds.push('t.Operación = ?');
        regParams.push(operacion);
      }
      const regWhere = regConds.length ? `WHERE ${regConds.join(' AND ')}` : '';
      const [regRows] = await pool.execute(
        `SELECT t.Regional, COUNT(*) AS total
         FROM Maestro_docTrabajador t
         LEFT JOIN Maestro_Segmentación s ON t.Identificación = s.Identificación
         ${regWhere}
         GROUP BY t.Regional`,
        regParams
      );
      regRows.forEach(r => { if (r.Regional) response.regionales[r.Regional] = r.total; });

      // 2. Operaciones
      const opConds = [];
      const opParams = [];
      if (!acceso.sinFiltro) {
        opConds.push(`t.Operación IN (${acceso.operacionesFiltro.map(()=>'?').join(',')})`);
        opParams.push(...acceso.operacionesFiltro);
      }
      if (buscar) {
        opConds.push('s.Trabajador COLLATE utf8mb4_general_ci LIKE ?');
        opParams.push(`%${buscar}%`);
      }
      if (regional) {
        opConds.push('t.Regional = ?');
        opParams.push(regional);
      }
      const opWhere = opConds.length ? `WHERE ${opConds.join(' AND ')}` : '';
      const [opRows] = await pool.execute(
        `SELECT t.Operación, COUNT(*) AS total
         FROM Maestro_docTrabajador t
         LEFT JOIN Maestro_Segmentación s ON t.Identificación = s.Identificación
         ${opWhere}
         GROUP BY t.Operación`,
        opParams
      );
      opRows.forEach(o => { if (o.Operación) response.operaciones[o.Operación] = o.total; });
    }

    else if (activeTab === 'todo') {
      const buildFiltersTodoLocal = (buscarVal, regionalVal, operacionVal, tipoDocumentoVal, estadoVal, tipoRegistroVal) => {
        const cT = [];
        const pT = [];
        const cG = [];
        const pG = [];

        if (!acceso.sinFiltro) {
          cT.push(`t.Operación IN (${acceso.operacionesFiltro.map(()=>'?').join(',')})`);
          cG.push(`e.Operación IN (${acceso.operacionesFiltro.map(()=>'?').join(',')})`);
          pT.push(...acceso.operacionesFiltro);
          pG.push(...acceso.operacionesFiltro);
        }

        if (buscarVal) {
          cT.push('v.Trabajador COLLATE utf8mb4_general_ci LIKE ?');
          pT.push(`%${buscarVal}%`);
          cG.push('0 = 1');
        }

        if (regionalVal) {
          cT.push('t.Regional = ?'); pT.push(regionalVal);
          cG.push('e.Regional = ?'); pG.push(regionalVal);
        }

        if (operacionVal) {
          cT.push('t.Operación = ?'); pT.push(operacionVal);
          cG.push('e.Operación = ?'); pG.push(operacionVal);
        }

        if (tipoDocumentoVal) {
          cT.push('t.TipoDocumento = ?'); pT.push(tipoDocumentoVal);
          cG.push('e.TipoDocumento = ?'); pG.push(tipoDocumentoVal);
        }

        if (estadoVal) {
          cT.push('t.Estado = ?'); pT.push(estadoVal);
          cG.push('0 = 1');
        }

        cT.push(construirFiltroRolTrabajador(acceso.permisos, 't'));
        cG.push(construirFiltroRolGeneral(acceso.permisos, 'e'));

        return { cT, pT, cG, pG };
      };

      // 1. Regionales (Excluye Regional)
      const rF = buildFiltersTodoLocal(buscar, null, operacion, tipoDocumento, estado, tipoRegistro);
      if (tipoRegistro !== 'General') {
        const [rowsT] = await pool.execute(`
          SELECT t.Regional, COUNT(*) AS total FROM Maestro_docTrabajador t LEFT JOIN Maestro_Segmentación v ON t.Identificación = v.Identificación WHERE ${rF.cT.join(' AND ')} GROUP BY t.Regional
        `, rF.pT);
        rowsT.forEach(r => { if (r.Regional) response.regionales[r.Regional] = (response.regionales[r.Regional] || 0) + r.total; });
      }
      if (tipoRegistro !== 'Trabajador') {
        const [rowsG] = await pool.execute(`
          SELECT e.Regional, COUNT(*) AS total FROM Maestro_docEmpresa e WHERE ${rF.cG.join(' AND ')} GROUP BY e.Regional
        `, rF.pG);
        rowsG.forEach(r => { if (r.Regional) response.regionales[r.Regional] = (response.regionales[r.Regional] || 0) + r.total; });
      }

      // 2. Operaciones (Excluye Operación)
      const oF = buildFiltersTodoLocal(buscar, regional, null, tipoDocumento, estado, tipoRegistro);
      if (tipoRegistro !== 'General') {
        const [rowsT] = await pool.execute(`
          SELECT t.Operación, COUNT(*) AS total FROM Maestro_docTrabajador t LEFT JOIN Maestro_Segmentación v ON t.Identificación = v.Identificación WHERE ${oF.cT.join(' AND ')} GROUP BY t.Operación
        `, oF.pT);
        rowsT.forEach(r => { if (r.Operación) response.operaciones[r.Operación] = (response.operaciones[r.Operación] || 0) + r.total; });
      }
      if (tipoRegistro !== 'Trabajador') {
        const [rowsG] = await pool.execute(`
          SELECT e.Operación, COUNT(*) AS total FROM Maestro_docEmpresa e WHERE ${oF.cG.join(' AND ')} GROUP BY e.Operación
        `, oF.pG);
        rowsG.forEach(r => { if (r.Operación) response.operaciones[r.Operación] = (response.operaciones[r.Operación] || 0) + r.total; });
      }

      // 3. Estados (Excluye Estado, Trabajador sólo)
      const eF = buildFiltersTodoLocal(buscar, regional, operacion, tipoDocumento, null, tipoRegistro);
      if (tipoRegistro !== 'General') {
        const [rowsT] = await pool.execute(`
          SELECT t.Estado, COUNT(*) AS total FROM Maestro_docTrabajador t LEFT JOIN Maestro_Segmentación v ON t.Identificación = v.Identificación WHERE ${eF.cT.join(' AND ')} GROUP BY t.Estado
        `, eF.pT);
        rowsT.forEach(r => { if (r.Estado) response.estados[r.Estado] = r.total; });
      }

      // 4. Tipos Registro
      const trF = buildFiltersTodoLocal(buscar, regional, operacion, tipoDocumento, estado, null);
      if (tipoRegistro !== 'General') {
        const [rowsT] = await pool.execute(`
          SELECT COUNT(*) AS total FROM Maestro_docTrabajador t LEFT JOIN Maestro_Segmentación v ON t.Identificación = v.Identificación WHERE ${trF.cT.join(' AND ')}
        `, trF.pT);
        response.tiposRegistro['Trabajador'] = rowsT[0].total || 0;
      }
      if (tipoRegistro !== 'Trabajador') {
        const [rowsG] = await pool.execute(`
          SELECT COUNT(*) AS total FROM Maestro_docEmpresa e WHERE ${trF.cG.join(' AND ')}
        `, trF.pG);
        response.tiposRegistro['General'] = rowsG[0].total || 0;
      }

      // 5. Tipos Documento (Excluye TipoDocumento)
      const tdF = buildFiltersTodoLocal(buscar, regional, operacion, null, estado, tipoRegistro);
      if (tipoRegistro !== 'General') {
        const [rowsT] = await pool.execute(`
          SELECT t.TipoDocumento, COUNT(*) AS total FROM Maestro_docTrabajador t LEFT JOIN Maestro_Segmentación v ON t.Identificación = v.Identificación WHERE ${tdF.cT.join(' AND ')} GROUP BY t.TipoDocumento
        `, tdF.pT);
        rowsT.forEach(r => { if (r.TipoDocumento) response.tiposDocumento[r.TipoDocumento] = (response.tiposDocumento[r.TipoDocumento] || 0) + r.total; });
      }
      if (tipoRegistro !== 'Trabajador') {
        const [rowsG] = await pool.execute(`
          SELECT e.TipoDocumento, COUNT(*) AS total FROM Maestro_docEmpresa e WHERE ${tdF.cG.join(' AND ')} GROUP BY e.TipoDocumento
        `, tdF.pG);
        rowsG.forEach(r => { if (r.TipoDocumento) response.tiposDocumento[r.TipoDocumento] = (response.tiposDocumento[r.TipoDocumento] || 0) + r.total; });
      }
    }

    else if (activeTab === 'solicitudes') {
      const buildFiltersSolLocal = (buscarVal, regionalVal, operacionVal, estadoSolicitudVal) => {
        const cT = ["t.Solicitud = 'SI'"];
        const pT = [];
        const cG = ["e.Solicitud = 'SI'"];
        const pG = [];

        if (regionalVal) {
          cT.push('t.Regional = ?'); pT.push(regionalVal);
          cG.push('e.Regional = ?'); pG.push(regionalVal);
        }
        if (operacionVal) {
          cT.push('t.Operación = ?'); pT.push(operacionVal);
          cG.push('e.Operación = ?'); pG.push(operacionVal);
        }
        if (estadoSolicitudVal === 'Pendiente') {
          cT.push("(t.Estado_Solicitud = 'Pendiente' OR t.Estado_Solicitud IS NULL)");
          cG.push("(e.Estado_Solicitud = 'Pendiente' OR e.Estado_Solicitud IS NULL)");
        } else if (estadoSolicitudVal) {
          cT.push("t.Estado_Solicitud = ?"); pT.push(estadoSolicitudVal);
          cG.push("e.Estado_Solicitud = ?"); pG.push(estadoSolicitudVal);
        }
        if (buscarVal) {
          cT.push("(v.Trabajador COLLATE utf8mb4_general_ci LIKE ? OR t.Usuario_Solicitud COLLATE utf8mb4_general_ci LIKE ?)");
          pT.push(`%${buscarVal}%`, `%${buscarVal}%`);
          cG.push("e.Usuario_Solicitud COLLATE utf8mb4_general_ci LIKE ?");
          pG.push(`%${buscarVal}%`);
        }
        return { cT, pT, cG, pG };
      };

      // 1. Regionales
      const rF = buildFiltersSolLocal(buscar, null, operacion, estadoSolicitud);
      const [rowsTReg] = await pool.execute(`
        SELECT t.Regional, COUNT(*) AS total FROM Maestro_docTrabajador t LEFT JOIN Maestro_Segmentación v ON t.Identificación = v.Identificación WHERE ${rF.cT.join(' AND ')} GROUP BY t.Regional
      `, rF.pT);
      rowsTReg.forEach(r => { if (r.Regional) response.regionales[r.Regional] = (response.regionales[r.Regional] || 0) + r.total; });
      const [rowsGReg] = await pool.execute(`
        SELECT e.Regional, COUNT(*) AS total FROM Maestro_docEmpresa e WHERE ${rF.cG.join(' AND ')} GROUP BY e.Regional
      `, rF.pG);
      rowsGReg.forEach(r => { if (r.Regional) response.regionales[r.Regional] = (response.regionales[r.Regional] || 0) + r.total; });

      // 2. Operaciones
      const oF = buildFiltersSolLocal(buscar, regional, null, estadoSolicitud);
      const [rowsTOp] = await pool.execute(`
        SELECT t.Operación, COUNT(*) AS total FROM Maestro_docTrabajador t LEFT JOIN Maestro_Segmentación v ON t.Identificación = v.Identificación WHERE ${oF.cT.join(' AND ')} GROUP BY t.Operación
      `, oF.pT);
      rowsTOp.forEach(o => { if (o.Operación) response.operaciones[o.Operación] = (response.operaciones[o.Operación] || 0) + o.total; });
      const [rowsGOp] = await pool.execute(`
        SELECT e.Operación, COUNT(*) AS total FROM Maestro_docEmpresa e WHERE ${oF.cG.join(' AND ')} GROUP BY e.Operación
      `, oF.pG);
      rowsGOp.forEach(o => { if (o.Operación) response.operaciones[o.Operación] = (response.operaciones[o.Operación] || 0) + o.total; });

      // 3. Estados de Solicitud
      const estadosList = ['Pendiente', 'Autorizado', 'Rechazado', 'Revocado'];
      for (const est of estadosList) {
        const sF = buildFiltersSolLocal(buscar, regional, operacion, est);
        const [rowsT] = await pool.execute(`
          SELECT COUNT(*) AS total FROM Maestro_docTrabajador t LEFT JOIN Maestro_Segmentación v ON t.Identificación = v.Identificación WHERE ${sF.cT.join(' AND ')}
        `, sF.pT);
        const [rowsG] = await pool.execute(`
          SELECT COUNT(*) AS total FROM Maestro_docEmpresa e WHERE ${sF.cG.join(' AND ')}
        `, sF.pG);
        response.estadosSolicitud[est] = (rowsT[0].total || 0) + (rowsG[0].total || 0);
      }
    }

    res.json(response);
  } catch (err) {
    console.error('[cloud-docs] GET /api/conteos:', err);
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

    await crearSolicitudAcceso(pool, { id_documento, justificacion, usuario, tipo_registro });

    res.json({ ok: true });
  } catch (err) {
    console.error('[cloud-docs] Error handling request:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Listado de validaciones de carpetas (Solo para roles Archivo, Sistema y Asistencial)
router.get('/api/validarcap', async (req, res) => {
  try {
    const { usuario, buscar } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoCloudDocs(pool, usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (acceso.rol !== 'Archivo' && acceso.rol !== 'Sistema' && acceso.rol !== 'Asistencial') {
      return res.status(403).json({ error: 'Rol no autorizado para validar carpetas' });
    }

    let sql = `
      SELECT 
        c.IdCargue,
        c.Estado,
        c.Identificación AS identificacion,
        s.Trabajador AS trabajador,
        c.Usuario AS usuario,
        DATE_FORMAT(c.Fecha, '%Y-%m-%d %H:%i:%s') AS fecha
      FROM Maestro_ok_carpeta c
      LEFT JOIN Maestro_Segmentación s ON c.Identificación = s.Identificación
    `;
    const conds = [];
    const params = [];

    if (buscar) {
      conds.push('(s.Trabajador COLLATE utf8mb4_general_ci LIKE ? OR CAST(c.Identificación AS CHAR) LIKE ?)');
      params.push(`%${buscar}%`, `%${buscar}%`);
    }

    if (conds.length) {
      sql += ` WHERE ${conds.join(' AND ')}`;
    }

    sql += ` ORDER BY c.Fecha DESC LIMIT 1000`;

    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[cloud-docs] GET /api/validarcap:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Listado de solicitudes de acceso (Solo para roles Archivo, Sistema y Asistencial)
router.get('/api/solicitudes', async (req, res) => {
  try {
    const { usuario, regional, operacion, buscar, estadoSolicitud } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoCloudDocs(pool, usuario);
    if (!acceso) return res.status(403).json({ error: 'No unauthorized' });

    if (acceso.rol !== 'Archivo' && acceso.rol !== 'Sistema' && acceso.rol !== 'Asistencial') {
      return res.status(403).json({ error: 'Rol no autorizado para ver solicitudes' });
    }

    const condsTrab = ["t.Solicitud = 'SI'"];
    const condsGen = ["e.Solicitud = 'SI'"];
    const paramsTrab = [];
    const paramsGen = [];

    // Filtros de regional/operación en solicitudes
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

    // Filtro por Estado de Solicitud (Pendiente, Autorizado, Rechazado, Revocado)
    if (estadoSolicitud === 'Pendiente') {
      condsTrab.push("(t.Estado_Solicitud = 'Pendiente' OR t.Estado_Solicitud IS NULL)");
      condsGen.push("(e.Estado_Solicitud = 'Pendiente' OR e.Estado_Solicitud IS NULL)");
    } else if (estadoSolicitud) {
      condsTrab.push("t.Estado_Solicitud = ?");
      condsGen.push("e.Estado_Solicitud = ?");
      paramsTrab.push(estadoSolicitud);
      paramsGen.push(estadoSolicitud);
    }

    // Filtro de búsqueda por trabajador o solicitante
    if (buscar) {
      condsTrab.push("(v.Trabajador COLLATE utf8mb4_general_ci LIKE ? OR t.Usuario_Solicitud COLLATE utf8mb4_general_ci LIKE ?)");
      paramsTrab.push(`%${buscar}%`, `%${buscar}%`);

      condsGen.push("e.Usuario_Solicitud COLLATE utf8mb4_general_ci LIKE ?");
      paramsGen.push(`%${buscar}%`);
    }

    const whereTrab = `WHERE ${condsTrab.join(' AND ')}`;
    const whereGen = `WHERE ${condsGen.join(' AND ')}`;

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
          DATE_FORMAT(t.FechaRegistro, '%Y-%m-%d %H:%i:%s') AS FechaRegistro,
          t.Usuario,
          t.Observaciones,
          t.Url,
          t.Solicitud,
          t.Justificacion_Solicitud,
          t.Visualizar,
          t.Usuario_Solicitud,
          COALESCE(t.Estado_Solicitud, 'Pendiente') AS Estado_Solicitud
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
          DATE_FORMAT(e.FechaRegistro, '%Y-%m-%d %H:%i:%s') AS FechaRegistro,
          e.Usuario,
          e.Observaciones,
          e.Url,
          e.Solicitud,
          e.Justificacion_Solicitud,
          e.Visualizar,
          e.Usuario_Solicitud,
          COALESCE(e.Estado_Solicitud, 'Pendiente') AS Estado_Solicitud
        FROM Maestro_docEmpresa e
        LEFT JOIN Config_Doc_Trabajador c ON e.TipoDocumento = CAST(c.Id AS CHAR)
        ${whereGen}
      ) combined
      ORDER BY combined.FechaRegistro DESC
      LIMIT 1000
    `;

    const allParams = [...paramsTrab, ...paramsGen];
    const [rows] = await pool.execute(sql, allParams);
    res.json(rows);
  } catch (err) {
    console.error('[cloud-docs] GET /api/solicitudes:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Gestionar solicitud (Solo roles Archivo y Sistema)
router.post('/api/gestionar-solicitud', async (req, res) => {
  try {
    const { id_documento, tipo_registro, visualizar, observaciones, estado_solicitud, usuario_gestor } = req.body;
    if (!id_documento || !tipo_registro || !estado_solicitud || !usuario_gestor) {
      return res.status(400).json({ error: 'Parámetros incompletos' });
    }

    await gestionarSolicitudAcceso(pool, {
      id_documento,
      tipo_registro,
      visualizar,
      observaciones,
      estado_solicitud,
      usuario_gestor,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[cloud-docs] Error managing request:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

