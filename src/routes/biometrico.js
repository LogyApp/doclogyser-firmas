const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');

const router = express.Router();
const HTML_PATH = path.join(__dirname, '../views/biometrico/index.html');

// Roles definidos en la solicitud
const FULL_ROLES = ['Juridica', 'Sistema', 'Control'];
const SST_ROLES = ['AdmSst', 'LiderSst'];
const ALLOWED_ROLES = [...FULL_ROLES, ...SST_ROLES];

// Middleware para autorizar y obtener datos del usuario administrador
async function verificarAcceso(req, res, next) {
  try {
    const usuarioId = req.query.usuario || req.body.usuario;
    if (!usuarioId) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const [uRows] = await pool.execute(
      'SELECT ID, Nombre, Rol FROM Maestro_Usuarios WHERE ID = ?',
      [usuarioId]
    );

    if (!uRows.length) {
      return res.status(403).send('<h2>Acceso denegado: Usuario no registrado</h2>');
    }

    const u = uRows[0];
    if (!ALLOWED_ROLES.includes(u.Rol)) {
      return res.status(403).send('<h2>Acceso denegado: Rol no autorizado</h2>');
    }

    req.usuarioInfo = {
      usuarioId: u.ID,
      usuarioNombre: u.Nombre || u.ID,
      rol: u.Rol,
      isSstOnly: SST_ROLES.includes(u.Rol)
    };

    next();
  } catch (err) {
    console.error('[biometrico] Error en autorización:', err);
    res.status(500).send('<h2>Error interno de autorización</h2>');
  }
}

// Middleware de API que retorna JSON en lugar de HTML para errores de auth
async function verificarAccesoAPI(req, res, next) {
  try {
    const usuarioId = req.query.usuario;
    if (!usuarioId) {
      return res.status(400).json({ error: 'Parámetro usuario requerido' });
    }

    const [uRows] = await pool.execute(
      'SELECT ID, Nombre, Rol FROM Maestro_Usuarios WHERE ID = ?',
      [usuarioId]
    );

    if (!uRows.length) {
      return res.status(403).json({ error: 'Usuario no registrado' });
    }

    const u = uRows[0];
    if (!ALLOWED_ROLES.includes(u.Rol)) {
      return res.status(403).json({ error: 'Rol no autorizado' });
    }

    req.usuarioInfo = {
      usuarioId: u.ID,
      usuarioNombre: u.Nombre || u.ID,
      rol: u.Rol,
      isSstOnly: SST_ROLES.includes(u.Rol)
    };

    next();
  } catch (err) {
    console.error('[biometrico API] Error en autorización:', err);
    res.status(500).json({ error: 'Error interno de servidor en autorización' });
  }
}

// Helper para construir las condiciones SQL en base al rol de SST o Full
function obtenerCondicionesClasificacion(isSstOnly) {
  let whereFirma = "area IN ('sst', 'coordinadores', 'auxiliares_administrativos')";
  let whereVinc = "v.Cargo IN ('AUXILIAR LOGISTICO', 'APRENDIZ')";

  if (isSstOnly) {
    whereFirma = "area = 'sst'";
    whereVinc = "1 = 0"; // Los auxiliares y aprendices no corresponden a SST
  }

  return { whereFirma, whereVinc };
}

// Servir la vista principal HTML
router.get('/', verificarAcceso, (req, res) => {
  try {
    if (!fs.existsSync(HTML_PATH)) {
      return res.status(404).send('<h2>Error: Vista del biométrico no encontrada</h2>');
    }
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const config = JSON.stringify(req.usuarioInfo).replace(/<\/script>/gi, '<\\/script>');
    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[biometrico] Error sirviendo la vista:', err);
    res.status(500).send('<h2>Error interno sirviendo la vista</h2>');
  }
});

// API: Listar trabajadores clasificados
router.get('/api/trabajadores', verificarAccesoAPI, async (req, res) => {
  try {
    const { isSstOnly } = req.usuarioInfo;
    const { whereFirma, whereVinc } = obtenerCondicionesClasificacion(isSstOnly);

    const query = `
      SELECT 
        Identificacion AS identificacion, 
        MAX(Trabajador) AS nombre, 
        MAX(cargo) AS cargo, 
        MAX(operacion) AS operacion, 
        MAX(regional) AS regional, 
        'firma_corporativa' AS origen,
        CASE 
          WHEN MAX(area) = 'sst' THEN 'sst'
          WHEN MAX(area) = 'coordinadores' THEN 'coordinadores'
          WHEN MAX(area) = 'auxiliares_administrativos' THEN 'auxiliares_administrativos'
          ELSE NULL
        END AS clasificacion
      FROM Maestro_firma_corporativa
      WHERE ${whereFirma}
      GROUP BY Identificacion

      UNION ALL

      SELECT 
        v.Identificación AS identificacion, 
        MAX(v.Trabajador) AS nombre, 
        MAX(v.Cargo) AS cargo, 
        MAX(v.\`Operación\`) AS operacion, 
        MAX(v.Regional) AS regional, 
        'vinculacion' AS origen,
        CASE 
          WHEN MAX(v.Cargo) = 'AUXILIAR LOGISTICO' THEN 'auxiliares_logisticos'
          WHEN MAX(v.Cargo) = 'APRENDIZ' THEN 'aprendices'
          ELSE NULL
        END AS clasificacion
      FROM Maestro_Vinculación v
      WHERE ${whereVinc}
        AND v.Identificación IS NOT NULL
        AND v.Identificación NOT IN (
          SELECT Identificacion FROM Maestro_firma_corporativa WHERE Identificacion IS NOT NULL
        )
      GROUP BY v.Identificación
      ORDER BY nombre ASC
    `;

    const [rows] = await pool.execute(query);
    res.json({ ok: true, trabajadores: rows });
  } catch (err) {
    console.error('[biometrico API] Error en trabajadores:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Historial de Marcaciones
router.get('/api/marcaciones', verificarAccesoAPI, async (req, res) => {
  try {
    const { isSstOnly } = req.usuarioInfo;
    const { whereFirma, whereVinc } = obtenerCondicionesClasificacion(isSstOnly);
    
    const { startDate, endDate, search, clasificacion } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Parámetros startDate y endDate requeridos' });
    }

    const startStr = `${startDate} 00:00:00`;
    const endStr = `${endDate} 23:59:59`;

    const params = [startStr, endStr];

    let filterSql = '';
    if (search) {
      filterSql += ' AND (m.identificacion LIKE ? OR m.trabajador LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (clasificacion) {
      filterSql += ' AND w.clasificacion = ?';
      params.push(clasificacion);
    }

    const query = `
      SELECT 
        m.id,
        m.identificacion,
        m.trabajador,
        m.tipo,
        m.score,
        m.latitud,
        m.longitud,
        m.precision_gps,
        m.es_manual,
        m.motivo,
        m.device_fingerprint,
        m.ip,
        m.fecha_hora,
        m.fecha_entrada,
        m.fecha_salida,
        m.es_manual_salida,
        m.motivo_salida,
        m.latitud_salida,
        m.longitud_salida,
        m.precision_gps_salida,
        w.clasificacion,
        w.cargo,
        w.operacion,
        w.regional
      FROM facial_marcaciones m
      INNER JOIN (
        SELECT 
          Identificacion AS identificacion, 
          CASE 
            WHEN MAX(area) = 'sst' THEN 'sst'
            WHEN MAX(area) = 'coordinadores' THEN 'coordinadores'
            WHEN MAX(area) = 'auxiliares_administrativos' THEN 'auxiliares_administrativos'
            ELSE NULL
          END AS clasificacion,
          MAX(cargo) AS cargo, 
          MAX(operacion) AS operacion, 
          MAX(regional) AS regional
        FROM Maestro_firma_corporativa
        WHERE ${whereFirma}
        GROUP BY Identificacion
        
        UNION ALL
        
        SELECT 
          v.Identificación AS identificacion, 
          CASE 
            WHEN MAX(v.Cargo) = 'AUXILIAR LOGISTICO' THEN 'auxiliares_logisticos'
            WHEN MAX(v.Cargo) = 'APRENDIZ' THEN 'aprendices'
            ELSE NULL
          END AS clasificacion,
          MAX(v.Cargo) AS cargo, 
          MAX(v.\`Operación\`) AS operacion, 
          MAX(v.Regional) AS regional
        FROM Maestro_Vinculación v
        WHERE ${whereVinc}
          AND v.Identificación IS NOT NULL
          AND v.Identificación NOT IN (
            SELECT Identificacion FROM Maestro_firma_corporativa WHERE Identificacion IS NOT NULL
          )
        GROUP BY v.Identificación
      ) w ON m.identificacion = w.identificacion
      WHERE m.fecha_hora >= ? AND m.fecha_hora <= ?
      ${filterSql}
      ORDER BY m.fecha_hora DESC
    `;

    const [rows] = await pool.execute(query, params);
    res.json({ ok: true, marcaciones: rows });
  } catch (err) {
    console.error('[biometrico API] Error en marcaciones:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Movimientos GPS
router.get('/api/movimientos', verificarAccesoAPI, async (req, res) => {
  try {
    const { isSstOnly } = req.usuarioInfo;
    const { whereFirma, whereVinc } = obtenerCondicionesClasificacion(isSstOnly);
    
    const { startDate, endDate, search, clasificacion } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Parámetros startDate y endDate requeridos' });
    }

    const startStr = `${startDate} 00:00:00`;
    const endStr = `${endDate} 23:59:59`;

    const params = [startStr, endStr];

    let filterSql = '';
    if (search) {
      filterSql += ' AND (mov.identificacion LIKE ? OR mov.trabajador LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (clasificacion) {
      filterSql += ' AND w.clasificacion = ?';
      params.push(clasificacion);
    }

    const query = `
      SELECT 
        mov.id,
        mov.identificacion,
        mov.trabajador,
        mov.tipo,
        mov.estado,
        mov.lat_inicio,
        mov.lng_inicio,
        mov.lat_destino,
        mov.lng_destino,
        mov.direccion_destino,
        mov.ruta_dist_km,
        mov.ruta_tiempo_min,
        mov.fecha_inicio,
        mov.fecha_fin,
        mov.duracion_min,
        mov.distancia_real_km,
        mov.desvio_max_km,
        mov.velocidad_max_kmh,
        mov.velocidad_prom_kmh,
        mov.total_waypoints,
        mov.llego_destino,
        mov.device_fingerprint,
        mov.ip,
        mov.requiere_regreso,
        mov.tiempo_en_destino_min,
        w.clasificacion,
        w.cargo,
        w.operacion,
        w.regional
      FROM facial_movimientos mov
      INNER JOIN (
        SELECT 
          Identificacion AS identificacion, 
          CASE 
            WHEN MAX(area) = 'sst' THEN 'sst'
            WHEN MAX(area) = 'coordinadores' THEN 'coordinadores'
            WHEN MAX(area) = 'auxiliares_administrativos' THEN 'auxiliares_administrativos'
            ELSE NULL
          END AS clasificacion,
          MAX(cargo) AS cargo, 
          MAX(operacion) AS operacion, 
          MAX(regional) AS regional
        FROM Maestro_firma_corporativa
        WHERE ${whereFirma}
        GROUP BY Identificacion
        
        UNION ALL
        
        SELECT 
          v.Identificación AS identificacion, 
          CASE 
            WHEN MAX(v.Cargo) = 'AUXILIAR LOGISTICO' THEN 'auxiliares_logisticos'
            WHEN MAX(v.Cargo) = 'APRENDIZ' THEN 'aprendices'
            ELSE NULL
          END AS clasificacion,
          MAX(v.Cargo) AS cargo, 
          MAX(v.\`Operación\`) AS operacion, 
          MAX(v.Regional) AS regional
        FROM Maestro_Vinculación v
        WHERE ${whereVinc}
          AND v.Identificación IS NOT NULL
          AND v.Identificación NOT IN (
            SELECT Identificacion FROM Maestro_firma_corporativa WHERE Identificacion IS NOT NULL
          )
        GROUP BY v.Identificación
      ) w ON mov.identificacion = w.identificacion
      WHERE mov.fecha_inicio >= ? AND mov.fecha_inicio <= ?
      ${filterSql}
      ORDER BY mov.fecha_inicio DESC
    `;

    const [rows] = await pool.execute(query, params);
    res.json({ ok: true, movimientos: rows });
  } catch (err) {
    console.error('[biometrico API] Error en movimientos:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Waypoints detallados de un movimiento
router.get('/api/movimientos/:id/waypoints', verificarAccesoAPI, async (req, res) => {
  try {
    const { isSstOnly } = req.usuarioInfo;
    const { whereFirma, whereVinc } = obtenerCondicionesClasificacion(isSstOnly);
    const movimientoId = req.params.id;

    const query = `
      SELECT wp.*
      FROM facial_movimientos_waypoints wp
      INNER JOIN facial_movimientos mov ON wp.movimiento_id = mov.id
      INNER JOIN (
        SELECT Identificacion AS identificacion
        FROM Maestro_firma_corporativa
        WHERE ${whereFirma}
        GROUP BY Identificacion
        
        UNION ALL
        
        SELECT v.Identificación AS identificacion
        FROM Maestro_Vinculación v
        WHERE ${whereVinc}
          AND v.Identificación IS NOT NULL
          AND v.Identificación NOT IN (
            SELECT Identificacion FROM Maestro_firma_corporativa WHERE Identificacion IS NOT NULL
          )
        GROUP BY v.Identificación
      ) w ON mov.identificacion = w.identificacion
      WHERE wp.movimiento_id = ?
      ORDER BY wp.secuencia ASC
    `;

    const [rows] = await pool.execute(query, [movimientoId]);
    res.json({ ok: true, waypoints: rows });
  } catch (err) {
    console.error('[biometrico API] Error en waypoints:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Jornadas Activas sin Salida
router.get('/api/sin-salida', verificarAccesoAPI, async (req, res) => {
  try {
    const { isSstOnly } = req.usuarioInfo;
    const { whereFirma, whereVinc } = obtenerCondicionesClasificacion(isSstOnly);
    const { date, search, clasificacion } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Parámetro date (YYYY-MM-DD) requerido' });
    }

    const startStr = `${date} 00:00:00`;
    const endStr = `${date} 23:59:59`;

    const params = [startStr, endStr];
    
    let filterSql = '';
    if (search) {
      filterSql += ' AND (m.identificacion LIKE ? OR m.trabajador LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (clasificacion) {
      filterSql += ' AND w.clasificacion = ?';
      params.push(clasificacion);
    }

    const query = `
      SELECT 
        m.id,
        m.identificacion,
        m.trabajador,
        m.tipo,
        m.score,
        m.latitud,
        m.longitud,
        m.precision_gps,
        m.es_manual,
        m.motivo,
        m.fecha_hora,
        m.fecha_entrada,
        w.clasificacion,
        w.cargo,
        w.operacion,
        w.regional
      FROM facial_marcaciones m
      INNER JOIN (
        SELECT 
          Identificacion AS identificacion, 
          CASE 
            WHEN MAX(area) = 'sst' THEN 'sst'
            WHEN MAX(area) = 'coordinadores' THEN 'coordinadores'
            WHEN MAX(area) = 'auxiliares_administrativos' THEN 'auxiliares_administrativos'
            ELSE NULL
          END AS clasificacion,
          MAX(cargo) AS cargo, 
          MAX(operacion) AS operacion, 
          MAX(regional) AS regional
        FROM Maestro_firma_corporativa
        WHERE ${whereFirma}
        GROUP BY Identificacion
        
        UNION ALL
        
        SELECT 
          v.Identificación AS identificacion, 
          CASE 
            WHEN MAX(v.Cargo) = 'AUXILIAR LOGISTICO' THEN 'auxiliares_logisticos'
            WHEN MAX(v.Cargo) = 'APRENDIZ' THEN 'aprendices'
            ELSE NULL
          END AS clasificacion,
          MAX(v.Cargo) AS cargo, 
          MAX(v.\`Operación\`) AS operacion, 
          MAX(v.Regional) AS regional
        FROM Maestro_Vinculación v
        WHERE ${whereVinc}
          AND v.Identificación IS NOT NULL
          AND v.Identificación NOT IN (
            SELECT Identificacion FROM Maestro_firma_corporativa WHERE Identificacion IS NOT NULL
          )
        GROUP BY v.Identificación
      ) w ON m.identificacion = w.identificacion
      WHERE m.tipo = 'ENTRADA'
        AND m.fecha_entrada >= ? AND m.fecha_entrada <= ?
        AND m.fecha_salida IS NULL
        ${filterSql}
      ORDER BY m.fecha_entrada DESC
    `;

    const [rows] = await pool.execute(query, params);
    res.json({ ok: true, trabajadores: rows });
  } catch (err) {
    console.error('[biometrico API] Error en turnos sin salida:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
