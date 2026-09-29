const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');

const router = express.Router();

const HTML_INDEX_PATH = path.join(__dirname, '../views/bloqueodatos/index.html');

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

// Servir la interfaz principal de bloqueodatos
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

    const lowerBaseUrl = (req.baseUrl || '').toLowerCase();
    if (lowerBaseUrl.includes('/formbloqueodatos')) {
      return res.redirect(`/bloqueodatos?usuario=${encodeURIComponent(usuario)}`);
    }

    const html = fs.readFileSync(HTML_INDEX_PATH, 'utf8');
    const config = JSON.stringify({
      ...acceso,
      regionalesFiltro: Object.keys(acceso.opsPorRegional),
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[bloqueodatos] Error serving page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// API: Obtener quincenas activas (del año actual)
router.get('/api/quincenas', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoBloqueo(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const currentYear = new Date().getFullYear();
    let [qRows] = await pool.execute(
      "SELECT Quincena FROM Config_Quincenas WHERE Quincena != 'Todo' AND `Año` = ? GROUP BY Quincena ORDER BY MIN(`Fecha Final`) ASC",
      [currentYear]
    );

    if (!qRows.length) {
      [qRows] = await pool.execute(
        "SELECT Quincena FROM Config_Quincenas WHERE Quincena != 'Todo' GROUP BY Quincena ORDER BY MAX(Id) DESC"
      );
    }

    res.json(qRows.map(row => row.Quincena));
  } catch (err) {
    console.error('[bloqueodatos] GET /api/quincenas:', err);
    res.status(500).json([]);
  }
});

// API: Obtener listado de bloqueos (incluyendo campo Hasta)
router.get('/api/bloqueos', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoBloqueo(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const selectQuery = `
      SELECT b.ID AS id, b.Operación AS operacion, b.Quincena AS quincena, b.Hasta AS hasta,
             b.Año AS anio, b.Datos AS datos, b.Forma_Pago AS formaPago, b.Condición AS condicion,
             b.Usuario AS usuario, b.Fecha_Registro AS fechaRegistro, b.Modulo AS modulo,
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

// API: Obtener información de clientes crédito preseleccionados e informe
router.get('/api/clientes-credito/info', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT ID as id, Bloqueo as bloqueo, `Cliente a Facturar` as clienteAFacturar, Nit as nit, Nombre as nombre FROM Maestro_Clientes_Credito ORDER BY `Cliente a Facturar` ASC'
    );
    const ones = rows.filter(r => r.bloqueo === 1).map(r => r.clienteAFacturar);
    const zeros = rows.filter(r => r.bloqueo === 0).map(r => r.clienteAFacturar);

    let infoText = '';
    if (ones.length > zeros.length) {
      infoText = zeros.length > 0 
        ? `Todos menos: ${zeros.join(', ')}`
        : 'Todos los clientes de crédito configurados';
    } else {
      infoText = ones.length > 0
        ? `Se bloquearán los clientes: ${ones.join(', ')}`
        : 'Ningún cliente preseleccionado para bloqueo';
    }

    res.json({
      total: rows.length,
      onesCount: ones.length,
      zerosCount: zeros.length,
      totalHabilitados: ones.length,
      totalExcluidos: zeros.length,
      ones,
      zeros,
      infoText,
      resumenTexto: infoText,
      clients: rows
    });
  } catch (err) {
    console.error('[bloqueodatos] GET /api/clientes-credito/info:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Crear un registro de bloqueo/desbloqueo y aplicar cambios
router.post('/api/crear', async (req, res) => {
  try {
    const { usuario } = req.query;
    const {
      modulo,
      regional,
      operacion,
      criterio, // 'Quincena' o 'Fecha' (para Facturación)
      quincena,
      hasta,
      formaPago,
      tipoClientes, // 'Todos', 'Preseleccionados', 'Manual'
      clientesManuales, // Array de strings cuando tipoClientes === 'Manual'
      condicion
    } = req.body;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoBloqueo(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!modulo) return res.status(400).json({ error: 'El módulo es obligatorio' });
    if (!condicion || (condicion !== 'Bloquear' && condicion !== 'Desbloquear')) {
      return res.status(400).json({ error: 'La condición debe ser Bloquear o Desbloquear' });
    }

    const currentYear = new Date().getFullYear();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      let affectedServicios = 0;
      let affectedAsistencia = 0;

      // ─────────────────────────────────────────────────────────────────
      // CASO 1: MÓDULO NÓMINA (SOLO ASISTENCIA)
      // ─────────────────────────────────────────────────────────────────
      if (modulo === 'Nomina') {
        if (!regional) return res.status(400).json({ error: 'La regional es obligatoria para Nómina' });
        if (!quincena) return res.status(400).json({ error: 'La quincena es obligatoria para Nómina' });

        // Resolver año de quincena
        const [qRow] = await conn.execute(
          "SELECT `Año` FROM Config_Quincenas WHERE Quincena = ? AND `Año` = ? LIMIT 1",
          [quincena, currentYear]
        );
        const anio = qRow.length ? qRow[0].Año : currentYear;

        // Fecha límite
        let [fRows] = await conn.execute(
          "SELECT DATE_ADD(MAX(Fecha), INTERVAL 1 DAY) AS fecha_limite FROM Maestro_Fechas WHERE Quincena = ? AND `Año` = ?",
          [quincena, anio]
        );
        if (!fRows.length || !fRows[0].fecha_limite) {
          const [fallbackRows] = await conn.execute(
            "SELECT DATE_ADD(MAX(Fecha), INTERVAL 1 DAY) AS fecha_limite FROM Maestro_Fechas WHERE Quincena = ?",
            [quincena]
          );
          fRows = fallbackRows;
        }
        if (!fRows.length || !fRows[0].fecha_limite) {
          throw new Error('No se encontró la fecha límite para la quincena especificada en Maestro_Fechas.');
        }
        const fechaLimite = fRows[0].fecha_limite;

        // Operaciones destino
        let targetOps = [];
        if (operacion) {
          targetOps = [operacion];
        } else {
          const [opRows] = await conn.execute(
            "SELECT OPERACIÓN FROM Maestro_Operaciones WHERE REGIONAL = ? AND REGIONAL != 'INACTIVO'",
            [regional]
          );
          targetOps = opRows.map(r => r.OPERACIÓN || r.Operación).filter(Boolean);
        }
        if (!targetOps.length) {
          throw new Error('No se encontraron operaciones asociadas a la regional seleccionada.');
        }

        const estadoAsistencia = condicion === 'Bloquear' ? 'Green' : 'Yellow';
        const tagObservacion = condicion === 'Bloquear' ? ' [Bloqueado por Nomina]' : ' [Desbloqueado por Nomina]';
        const tagDefault = condicion === 'Bloquear' ? '[Bloqueado por Nomina]' : '[Desbloqueado por Nomina]';

        // 1. Insertar log en Bloqueo_Nomina
        await conn.execute(
          `INSERT INTO Bloqueo_Nomina (Operación, Regional, Quincena, Hasta, Año, Datos, Forma_Pago, Condición, Usuario, Fecha_Registro, Modulo)
           VALUES (?, ?, ?, NULL, ?, 'Asistencia', NULL, ?, ?, NOW(), 'Nomina')`,
          [
            operacion || null,
            regional,
            quincena,
            anio,
            condicion,
            acceso.usuarioNombre
          ]
        );

        // 2. Actualizar Dynamic_Asistencia
        const opPh = targetOps.map(() => '?').join(',');
        const [rAsis] = await conn.execute(
          `UPDATE Dynamic_Asistencia
           SET Estado = ?,
               Observaciones = CASE
                 WHEN Observaciones IS NULL OR TRIM(Observaciones) = '' THEN ?
                 ELSE TRIM(CONCAT(
                   TRIM(REPLACE(REPLACE(Observaciones, '[Bloqueado por Nomina]', ''), '[Desbloqueado por Nomina]', '')),
                   ?
                 ))
               END
           WHERE Origen IN (${opPh})
             AND Día < ?`,
          [estadoAsistencia, tagDefault, tagObservacion, ...targetOps, fechaLimite]
        );
        affectedAsistencia = rAsis.affectedRows || 0;
      }

      // ─────────────────────────────────────────────────────────────────
      // CASO 2: MÓDULO FACTURACIÓN (SOLO SERVICIOS)
      // ─────────────────────────────────────────────────────────────────
      else if (modulo === 'Facturacion') {
        const crit = criterio === 'Fecha' ? 'Fecha' : 'Quincena';
        let fechaCorte = null;
        let anioRegistro = currentYear;
        let quincenaRegistro = null;
        let hastaRegistro = null;

        if (crit === 'Fecha') {
          if (!hasta) throw new Error('La fecha y hora límite es obligatoria para bloqueo por fecha.');
          fechaCorte = hasta.replace('T', ' ');
          if (fechaCorte.length === 16) fechaCorte += ':00'; // YYYY-MM-DD HH:mm:ss
          hastaRegistro = fechaCorte;
          anioRegistro = new Date(fechaCorte).getFullYear() || currentYear;
        } else {
          if (!quincena) throw new Error('La quincena es obligatoria para bloqueo por quincena.');
          quincenaRegistro = quincena;
          const [qRow] = await conn.execute(
            "SELECT `Año` FROM Config_Quincenas WHERE Quincena = ? AND `Año` = ? LIMIT 1",
            [quincena, currentYear]
          );
          anioRegistro = qRow.length ? qRow[0].Año : currentYear;

          let [fRows] = await conn.execute(
            "SELECT DATE_ADD(MAX(Fecha), INTERVAL 1 DAY) AS fecha_limite FROM Maestro_Fechas WHERE Quincena = ? AND `Año` = ?",
            [quincena, anioRegistro]
          );
          if (!fRows.length || !fRows[0].fecha_limite) {
            const [fallback] = await conn.execute(
              "SELECT DATE_ADD(MAX(Fecha), INTERVAL 1 DAY) AS fecha_limite FROM Maestro_Fechas WHERE Quincena = ?",
              [quincena]
            );
            fRows = fallback;
          }
          if (!fRows.length || !fRows[0].fecha_limite) {
            throw new Error('No se encontró la fecha límite para la quincena especificada en Maestro_Fechas.');
          }
          fechaCorte = fRows[0].fecha_limite;
        }

        const estadoServicio = condicion === 'Bloquear' ? 'Green' : 'Yellow';
        const edicionServicio = condicion === 'Bloquear' ? 'Completado' : 'Pendiente';
        const targetEstado = condicion === 'Bloquear' ? 'Yellow' : 'Green';
        const tagObservacion = condicion === 'Bloquear' ? ' [Bloqueado por Facturación]' : ' [Desbloqueado por Facturación]';
        const tagDefault = condicion === 'Bloquear' ? '[Bloqueado por Facturación]' : '[Desbloqueado por Facturación]';

        // 1. Insertar log en Bloqueo_Nomina
        await conn.execute(
          `INSERT INTO Bloqueo_Nomina (Operación, Regional, Quincena, Hasta, Año, Datos, Forma_Pago, Condición, Usuario, Fecha_Registro, Modulo)
           VALUES (?, ?, ?, ?, ?, 'Servicios', ?, ?, ?, NOW(), 'Facturacion')`,
          [
            operacion || null,
            regional || null,
            quincenaRegistro,
            hastaRegistro,
            anioRegistro,
            formaPago ? parseInt(formaPago) : (formaPago === '0' ? 0 : 3),
            condicion,
            acceso.usuarioNombre
          ]
        );

        // 2. Construir consulta dinámica para Dynamic_Servicios
        const whereClauses = [];
        const params = [estadoServicio, edicionServicio, tagDefault, tagObservacion];

        // Filtro de estado anterior
        if (condicion === 'Bloquear') {
          whereClauses.push("(ds.Estado = 'Yellow' OR ds.Estado IS NULL OR ds.Estado != 'Green')");
        } else {
          whereClauses.push("ds.Estado = 'Green'");
        }

        // Filtro de tiempo
        if (crit === 'Fecha') {
          whereClauses.push("ds.`Hora Inicio` <= ?");
          params.push(fechaCorte);
        } else {
          whereClauses.push("ds.`Hora Inicio` < ?");
          params.push(fechaCorte);
        }

        // Filtro Regional / Operación
        if (operacion) {
          whereClauses.push("dr.`Operación` = ?");
          params.push(operacion);
        } else if (regional) {
          whereClauses.push("dr.`Operación` IN (SELECT OPERACIÓN FROM Maestro_Operaciones WHERE REGIONAL = ? AND REGIONAL != 'INACTIVO')");
          params.push(regional);
        }

        // Filtro Forma de Pago
        const fp = formaPago ? parseInt(formaPago) : 3;
        if (fp > 0) {
          whereClauses.push("ds.`Forma De Pago` = ?");
          params.push(fp);
        } else {
          whereClauses.push("ds.`Forma De Pago` IN (1, 2, 3)");
        }

        // Filtro de Clientes cuando Forma de Pago es 3 (Crédito)
        if (fp === 3) {
          const tClientes = tipoClientes || 'Preseleccionados';
          if (tClientes === 'Preseleccionados') {
            whereClauses.push("dr.`Cliente a Facturar` IN (SELECT `Cliente a Facturar` FROM Maestro_Clientes_Credito WHERE Bloqueo = 1)");
          } else if (tClientes === 'Manual') {
            if (!clientesManuales || !Array.isArray(clientesManuales) || clientesManuales.length === 0) {
              throw new Error('Debe seleccionar al menos un cliente en la opción Manual.');
            }
            const cPh = clientesManuales.map(() => '?').join(',');
            whereClauses.push(`dr.\`Cliente a Facturar\` IN (${cPh})`);
            params.push(...clientesManuales);
          }
        }

        const updateSql = `
          UPDATE Dynamic_Servicios ds
          JOIN Dynamic_Recibos dr ON dr.IdRecibo = ds.IdRecibo
          SET ds.Estado = ?,
              ds.Edición = ?,
              ds.Observaciones = CASE
                WHEN ds.Observaciones IS NULL OR TRIM(ds.Observaciones) = '' THEN ?
                ELSE TRIM(CONCAT(
                  TRIM(REPLACE(REPLACE(ds.Observaciones, '[Bloqueado por Facturación]', ''), '[Desbloqueado por Facturación]', '')),
                  ?
                ))
              END
          WHERE ${whereClauses.join(' AND ')}
        `;

        const [rServ] = await conn.execute(updateSql, params);
        affectedServicios = rServ.affectedRows || 0;
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
