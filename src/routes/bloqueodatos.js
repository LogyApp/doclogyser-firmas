const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');

const router = express.Router();

const HTML_INDEX_PATH = path.join(__dirname, '../views/bloqueodatos/index.html');
const HTML_FORM_PATH  = path.join(__dirname, '../views/formbloqueodatos/form.html');

async function computarAccesoBloqueo(usuarioId) {
  if (!usuarioId) return null;
  const [uRows] = await pool.execute(
    'SELECT ID, Nombre, Rol, Regional, `Operación` FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );
  if (!uRows.length) return null;
  const usuario = uRows[0];
  const rol = usuario.Rol || '';
  
  const ALLOWED_ROLES = ['Nomina', 'Facturación', 'Sistema'];
  if (!ALLOWED_ROLES.includes(rol)) return null;

  const [opRows] = await pool.execute(
    "SELECT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY REGIONAL, OPERACIÓN"
  );

  const opsPorRegional = {};
  opRows.forEach(row => {
    const reg = row.REGIONAL || row.Regional;
    const op = row.OPERACIÓN || row.Operación;
    if (reg && op) {
      if (!opsPorRegional[reg]) opsPorRegional[reg] = [];
      opsPorRegional[reg].push(op);
    }
  });

  return {
    usuarioId: usuario.ID,
    usuarioNombre: usuario.Nombre || usuario.ID,
    rol,
    regional: usuario.Regional || '',
    operacion: usuario['Operación'] || '',
    opsPorRegional
  };
}

// Servir la interfaz de listado o el formulario
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const acceso = await computarAccesoBloqueo(usuario);
    if (!acceso) {
      return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');
    }

    let initialView = 'listado';
    let pathTemplate = HTML_INDEX_PATH;

    const lowerBaseUrl = (req.baseUrl || '').toLowerCase();
    if (lowerBaseUrl.includes('/formbloqueodatos')) {
      initialView = 'formulario';
      pathTemplate = HTML_FORM_PATH;
    }

    const html = fs.readFileSync(pathTemplate, 'utf8');
    const config = JSON.stringify({
      ...acceso,
      regionalesFiltro: Object.keys(acceso.opsPorRegional),
      initialView,
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[bloqueodatos] Error serving page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// API: Obtener quincenas activas
router.get('/api/quincenas', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoBloqueo(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [qRows] = await pool.execute(
      "SELECT Quincena FROM Config_Quincenas WHERE Quincena != 'Todo' GROUP BY Quincena ORDER BY MAX(Id) DESC"
    );
    res.json(qRows.map(row => row.Quincena));
  } catch (err) {
    console.error('[bloqueodatos] GET /api/quincenas:', err);
    res.status(500).json([]);
  }
});

// API: Obtener listado de bloqueos
router.get('/api/bloqueos', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoBloqueo(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const selectQuery = `
      SELECT b.ID AS id, b.Operación AS operacion, b.Quincena AS quincena, b.Año AS anio, b.Datos AS datos, b.Forma_Pago AS formaPago, b.Condición AS condicion, b.Usuario AS usuario, b.Fecha_Registro AS fechaRegistro, b.Modulo AS modulo,
             COALESCE(b.Regional, o.REGIONAL) AS regional
      FROM Bloqueo_Nomina b
      LEFT JOIN Maestro_Operaciones o ON b.Operación = o.OPERACIÓN
      ORDER BY b.Fecha_Registro DESC
    `;
    const [rows] = await pool.execute(selectQuery);
    res.json(rows);
  } catch (err) {
    console.error('[bloqueodatos] GET /api/bloqueos:', err);
    res.status(500).json([]);
  }
});

// API: Crear un registro de bloqueo/desbloqueo y aplicar cambios
router.post('/api/crear', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { modulo, regional, operacion, quincena, datos, formaPago, condicion } = req.body;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoBloqueo(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    // Validaciones obligatorias
    if (!modulo) return res.status(400).json({ error: 'El módulo es obligatorio' });
    if (!regional) return res.status(400).json({ error: 'La regional es obligatoria' });
    if (!quincena) return res.status(400).json({ error: 'La quincena es obligatoria' });
    if (datos !== '' && datos !== 'Asistencia' && datos !== 'Servicios') {
      return res.status(400).json({ error: 'El campo Datos es inválido' });
    }
    if (!condicion || (condicion !== 'Bloquear' && condicion !== 'Desbloquear')) {
      return res.status(400).json({ error: 'La condición es inválida (debe ser Bloquear o Desbloquear)' });
    }

    // Resolver Año a partir de la quincena
    const [qRow] = await pool.execute(
      "SELECT `Año` FROM Config_Quincenas WHERE Quincena = ? LIMIT 1",
      [quincena]
    );
    const anio = qRow.length ? qRow[0].Año : new Date().getFullYear();

    // Obtener fecha límite de la quincena
    const [fRows] = await pool.execute(
      "SELECT DATE_ADD(MAX(Fecha), INTERVAL 1 DAY) AS fecha_limite FROM Maestro_Fechas WHERE Quincena = ?",
      [quincena]
    );
    if (!fRows.length || !fRows[0].fecha_limite) {
      return res.status(400).json({ error: 'No se encontró la fecha límite para la quincena especificada en Maestro_Fechas.' });
    }
    const fechaLimite = fRows[0].fecha_limite;

    // Determinar operaciones destino
    let targetOperations = [];
    if (operacion) {
      targetOperations = [operacion];
    } else {
      const [opRows] = await pool.execute(
        "SELECT OPERACIÓN FROM Maestro_Operaciones WHERE REGIONAL = ? AND REGIONAL != 'INACTIVO'",
        [regional]
      );
      targetOperations = opRows.map(row => row.OPERACIÓN || row.Operación).filter(Boolean);
    }

    if (targetOperations.length === 0) {
      return res.status(400).json({ error: 'No se encontraron operaciones asociadas al destino seleccionado.' });
    }

    // Ejecutar transacciones de actualización e inserción de log
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const estadoServicio = condicion === 'Bloquear' ? 'Green' : 'Yellow';
      const edicionServicio = condicion === 'Bloquear' ? 'Completado' : 'Pendiente';
      const estadoAsistencia = condicion === 'Bloquear' ? 'Green' : 'Yellow';

      // 1. Insertar el registro en la bitácora Bloqueo_Nomina
      await conn.execute(
        `INSERT INTO Bloqueo_Nomina (Operación, Regional, Quincena, Año, Datos, Forma_Pago, Condición, Usuario, Fecha_Registro, Modulo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
        [
          operacion || null,
          regional,
          quincena,
          anio,
          datos || null,
          formaPago ? parseInt(formaPago) : null,
          condicion,
          acceso.usuarioNombre,
          modulo
        ]
      );

      let affectedServicios = 0;
      let affectedAsistencia = 0;

      // 2. Ejecutar la actualización según el módulo
      if (modulo === 'Nomina') {
        const opPlaceholders = targetOperations.map(() => '?').join(',');

        // Caso A: Datos y Forma de Pago son nulos (Actualizar todo)
        if (!datos && !formaPago) {
          // Servicios
          const [rServ] = await conn.execute(
            `UPDATE Dynamic_Servicios ds
             JOIN Dynamic_Recibos dr ON dr.IdRecibo = ds.IdRecibo
             SET ds.Estado = ?, ds.Edición = ?
             WHERE dr.Operación IN (${opPlaceholders})
               AND ds.\`Forma De Pago\` IN (1, 2, 3)
               AND ds.\`Hora Inicio\` < ?`,
            [estadoServicio, edicionServicio, ...targetOperations, fechaLimite]
          );
          affectedServicios = rServ.affectedRows || 0;

          // Asistencia
          const [rAsis] = await conn.execute(
            `UPDATE Dynamic_Asistencia
             SET Estado = ?
             WHERE Origen IN (${opPlaceholders})
               AND Día < ?`,
            [estadoAsistencia, ...targetOperations, fechaLimite]
          );
          affectedAsistencia = rAsis.affectedRows || 0;
        }

        // Caso B: Solo Asistencia
        else if (datos === 'Asistencia') {
          const [rAsis] = await conn.execute(
            `UPDATE Dynamic_Asistencia
             SET Estado = ?
             WHERE Origen IN (${opPlaceholders})
               AND Día < ?`,
            [estadoAsistencia, ...targetOperations, fechaLimite]
          );
          affectedAsistencia = rAsis.affectedRows || 0;
        }

        // Caso C: Solo Servicios (todas las formas de pago 1, 2, 3)
        else if (datos === 'Servicios' && !formaPago) {
          const [rServ] = await conn.execute(
            `UPDATE Dynamic_Servicios ds
             JOIN Dynamic_Recibos dr ON dr.IdRecibo = ds.IdRecibo
             SET ds.Estado = ?, ds.Edición = ?
             WHERE dr.Operación IN (${opPlaceholders})
               AND ds.\`Forma De Pago\` IN (1, 2, 3)
               AND ds.\`Hora Inicio\` < ?`,
            [estadoServicio, edicionServicio, ...targetOperations, fechaLimite]
          );
          affectedServicios = rServ.affectedRows || 0;
        }

        // Caso D: Solo Servicios con forma de pago específica
        else if (datos === 'Servicios' && formaPago > 0) {
          const [rServ] = await conn.execute(
            `UPDATE Dynamic_Servicios ds
             JOIN Dynamic_Recibos dr ON dr.IdRecibo = ds.IdRecibo
             SET ds.Estado = ?, ds.Edición = ?
             WHERE dr.Operación IN (${opPlaceholders})
               AND ds.\`Forma De Pago\` = ?
               AND ds.\`Hora Inicio\` < ?`,
            [estadoServicio, edicionServicio, ...targetOperations, parseInt(formaPago), fechaLimite]
          );
          affectedServicios = rServ.affectedRows || 0;
        }
      } else if (modulo === 'Facturacion') {
        // Por ahora, lógica de facturación no definida; se creará el log únicamente.
        console.log('[bloqueodatos] Log creado para módulo de Facturación sin actualizaciones.');
      }

      await conn.commit();
      res.json({ ok: true, affectedServicios, affectedAsistencia });
    } catch (dbErr) {
      await conn.rollback();
      throw dbErr;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('[bloqueodatos] POST /api/crear:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
