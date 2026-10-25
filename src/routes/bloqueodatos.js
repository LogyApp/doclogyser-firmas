const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');
const { computarAccesoNomina } = require('../services/accesoNomina');
const { computarAccesoFacturacion } = require('../services/accesoFacturacion');
const { obtenerPermisosBloqueo } = require('../services/configBloqueo');

const router = express.Router();

const HTML_INDEX_PATH = path.join(__dirname, '../views/bloqueodatos/index.html');

// ── Acceso ──────────────────────────────────────────────────────────────────
// Quién ve la pestaña y qué operaciones: Maestro_Menu (nomina / facturacion)
// (Sección 'Bloqueo_datos'). Quién puede bloquear o desbloquear: Config_Parametros
// (configBloqueo.js).
async function accesoPorModulo(usuarioId, moduloBloqueo) {
  if (moduloBloqueo === 'Nomina') return computarAccesoNomina(usuarioId, 'Bloqueo_datos');
  if (moduloBloqueo === 'Facturacion') return computarAccesoFacturacion(usuarioId, 'Bloqueo_datos');
  return null;
}

// Acceso a la pestaña en cualquiera de los dos módulos (para listados).
async function accesoAlguno(usuarioId) {
  if (!usuarioId) return null;
  return (await accesoPorModulo(usuarioId, 'Nomina')) || (await accesoPorModulo(usuarioId, 'Facturacion'));
}

function anioBogota() {
  return parseInt(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric' }).format(new Date()), 10);
}

// Rango de una quincena de un año: [inicio, limite) según Maestro_Fechas.
async function rangoQuincena(conn, quincena, anio) {
  const [rows] = await conn.execute(
    "SELECT DATE_FORMAT(MIN(Fecha), '%Y-%m-%d') AS inicio, DATE_FORMAT(DATE_ADD(MAX(Fecha), INTERVAL 1 DAY), '%Y-%m-%d') AS limite FROM Maestro_Fechas WHERE Quincena = ? AND `Año` = ?",
    [quincena, anio]
  );
  if (!rows.length || !rows[0].inicio || !rows[0].limite) {
    throw new ErrorUsuario(`No se encontraron las fechas de la quincena "${quincena}" del año ${anio} en Maestro_Fechas.`);
  }
  return rows[0];
}

class ErrorUsuario extends Error {}

// Operaciones a las que aplica el bloqueo, dentro del alcance del usuario.
// Devuelve null cuando no hay que filtrar (acceso general, sin regional ni operación).
function operacionesDestino(acceso, regional, operacion) {
  const ops = acceso.opsPorRegional || {};
  if (regional && !ops[regional]) throw new ErrorUsuario('No tiene acceso a la regional seleccionada.');
  if (!regional && !operacion && acceso.sinFiltro) return null;
  let destino = regional ? [...ops[regional]] : Object.values(ops).flat();
  if (operacion) {
    if (!destino.includes(operacion)) throw new ErrorUsuario('No tiene acceso a la operación seleccionada.');
    destino = [operacion];
  }
  if (!destino.length) throw new ErrorUsuario('No se encontraron operaciones dentro de su alcance.');
  return destino;
}

// "AAAA-MM-DDTHH:mm" → "AAAA-MM-DD HH:mm:ss"
function fechaHoraSql(valor) {
  const v = String(valor || '').trim().replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) return `${v}:00`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) return v;
  return null;
}

// La columna Bloqueo_Nomina.Desde se crea con la migración 2026-10-23; mientras
// no exista, el registro se guarda sin ella.
let _tieneColumnaDesde = false;
async function tieneColumnaDesde(conn) {
  if (_tieneColumnaDesde) return true;
  try {
    const [rows] = await conn.query("SHOW COLUMNS FROM Bloqueo_Nomina LIKE 'Desde'");
    _tieneColumnaDesde = rows.length > 0;
  } catch { _tieneColumnaDesde = false; }
  return _tieneColumnaDesde;
}

async function registrarBloqueo(conn, r) {
  const conDesde = await tieneColumnaDesde(conn);
  const cols = ['Operación', 'Regional', 'Quincena', 'Hasta', 'Año', 'Datos', 'Forma_Pago', 'Condición', 'Usuario', 'Modulo'];
  const vals = [r.operacion || null, r.regional || null, r.quincena || null, r.hasta || null, r.anio, r.datos, r.formaPago ?? null, r.condicion, r.usuario, r.modulo];
  if (conDesde) { cols.push('Desde'); vals.push(r.desde || null); }
  await conn.execute(
    `INSERT INTO Bloqueo_Nomina (${cols.map(c => `\`${c}\``).join(', ')}, Fecha_Registro) VALUES (${cols.map(() => '?').join(', ')}, NOW())`,
    vals
  );
}

// Ruta raíz deshabilitada: el módulo independiente ya no está disponible
router.get('/', (req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>Ruta no disponible — LOG&SER</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; }
        .card { background: #fff; padding: 36px 32px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); max-width: 480px; text-align: center; border: 1px solid #e2e8f0; }
        .icon { font-size: 2.8rem; margin-bottom: 12px; }
        h2 { color: #0f172a; margin: 0 0 10px 0; font-size: 1.25rem; font-weight: 700; }
        p { color: #64748b; font-size: 0.92rem; line-height: 1.5; margin: 0 0 20px 0; }
        .badge { display: inline-block; background: #fee2e2; color: #b91c1c; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; margin-bottom: 14px; letter-spacing: 0.5px; }
        .links { border-top: 1px solid #e2e8f0; padding-top: 18px; display: flex; flex-direction: column; gap: 8px; font-size: 0.85rem; color: #475569; text-align: left; background: #f8fafc; border-radius: 8px; padding: 14px; }
        .link-item code { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; color: #0f172a; word-break: break-all; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">🔒</div>
        <span class="badge">RUTA DESHABILITADA (404)</span>
        <h2>Módulo independiente no disponible</h2>
        <p>El módulo independiente de <strong>Bloqueo de Datos</strong> ha sido desactivado. Esta funcionalidad ahora opera exclusivamente de forma integrada dentro de:</p>
        <div class="links">
          <div class="link-item"><strong>Nómina (Asistencia):</strong><br><code>BASE_URL/nomina?usuario=ID&tab=bloqueo</code></div>
          <div class="link-item" style="margin-top:6px;"><strong>Facturación (Servicios):</strong><br><code>BASE_URL/facturacion?usuario=ID&tab=bloqueo</code></div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// API: Años disponibles (Maestro_Fechas), del más reciente al más antiguo
router.get('/api/anios', async (req, res) => {
  try {
    const acceso = await accesoAlguno(req.query.usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    const [rows] = await pool.execute(
      'SELECT DISTINCT `Año` AS anio FROM Maestro_Fechas WHERE `Año` IS NOT NULL AND `Año` <= ? ORDER BY `Año` DESC',
      [anioBogota()]
    );
    res.json({ actual: anioBogota(), anios: rows.map(r => Number(r.anio)) });
  } catch (err) {
    console.error('[bloqueodatos] GET /api/anios:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Quincenas de un año (por defecto el actual), en orden de fechas
router.get('/api/quincenas', async (req, res) => {
  try {
    const acceso = await accesoAlguno(req.query.usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    const anio = parseInt(req.query.anio, 10) || anioBogota();
    const [qRows] = await pool.execute(
      "SELECT Quincena FROM Maestro_Fechas WHERE `Año` = ? AND Quincena IS NOT NULL AND Quincena <> '' GROUP BY Quincena ORDER BY MIN(Fecha) ASC",
      [anio]
    );
    res.json(qRows.map(row => row.Quincena));
  } catch (err) {
    console.error('[bloqueodatos] GET /api/quincenas:', err);
    res.status(500).json([]);
  }
});

// API: Permisos del usuario para bloquear/desbloquear en un módulo
router.get('/api/permisos', async (req, res) => {
  try {
    const { usuario, modulo } = req.query;
    const acceso = await accesoPorModulo(usuario, modulo);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    res.json({ ok: true, ...(await obtenerPermisosBloqueo(modulo, acceso.rol)) });
  } catch (err) {
    console.error('[bloqueodatos] GET /api/permisos:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Historial de bloqueos (Nómina ve también los de Facturación)
router.get('/api/bloqueos', async (req, res) => {
  try {
    const acceso = await accesoAlguno(req.query.usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    const conDesde = await tieneColumnaDesde(pool);
    const [rows] = await pool.execute(`
      SELECT b.ID AS id, b.Operación AS operacion, b.Quincena AS quincena,
             ${conDesde ? "DATE_FORMAT(b.Desde, '%Y-%m-%d %H:%i')" : 'NULL'} AS desde,
             DATE_FORMAT(b.Hasta, '%Y-%m-%d %H:%i') AS hasta,
             b.Año AS anio, b.Datos AS datos, b.Forma_Pago AS formaPago, b.Condición AS condicion,
             b.Usuario AS usuario, DATE_FORMAT(b.Fecha_Registro, '%Y-%m-%d %H:%i:%s') AS fechaRegistro, b.Modulo AS modulo,
             COALESCE(b.Regional, o.REGIONAL) AS regional
      FROM Bloqueo_Nomina b
      LEFT JOIN Maestro_Operaciones o ON b.Operación = o.OPERACIÓN
      ORDER BY b.Fecha_Registro DESC
    `);
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
// Nómina → solo Asistencia (por quincena y año).
// Facturación → solo Servicios (por quincena y año, o entre dos fechas y horas).
router.post('/api/crear', async (req, res) => {
  const { usuario } = req.query;
  const {
    modulo, regional, operacion,
    criterio,       // 'Quincena' | 'Fecha' (Facturación)
    quincena, anio,
    desde, hasta,   // criterio 'Fecha'
    formaPago,      // 1 | 2 | 3 (Facturación)
    tipoClientes,   // 'Preseleccionados' | 'Todos' | 'Manual' (Crédito)
    clientesManuales,
    condicion,
  } = req.body || {};

  try {
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!['Nomina', 'Facturacion'].includes(modulo)) return res.status(400).json({ error: 'Módulo inválido.' });
    if (!['Bloquear', 'Desbloquear'].includes(condicion)) {
      return res.status(400).json({ error: 'La condición debe ser Bloquear o Desbloquear' });
    }

    const acceso = await accesoPorModulo(usuario, modulo);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    const permisos = await obtenerPermisosBloqueo(modulo, acceso.rol);
    if (condicion === 'Bloquear' ? !permisos.puedeBloquear : !permisos.puedeDesbloquear) {
      return res.status(403).json({ error: `Su rol no tiene permiso para ${condicion.toLowerCase()} en ${modulo === 'Nomina' ? 'Asistencia' : 'Servicios'}.` });
    }

    const anioNum = parseInt(anio, 10) || anioBogota();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      let affectedServicios = 0;
      let affectedAsistencia = 0;

      if (modulo === 'Nomina') {
        // ── NÓMINA: ASISTENCIA ────────────────────────────────────────────
        if (!regional) throw new ErrorUsuario('La regional es obligatoria para Nómina');
        if (!quincena) throw new ErrorUsuario('La quincena es obligatoria para Nómina');
        const { inicio, limite } = await rangoQuincena(conn, quincena, anioNum);
        const targetOps = operacionesDestino(acceso, regional, operacion);

        const estadoAsistencia = condicion === 'Bloquear' ? 'Green' : 'Yellow';
        const tagObservacion = condicion === 'Bloquear' ? ' [Bloqueado por Nomina]' : ' [Desbloqueado por Nomina]';
        const tagDefault = tagObservacion.trim();

        await registrarBloqueo(conn, {
          operacion, regional, quincena, anio: anioNum, datos: 'Asistencia',
          condicion, usuario: acceso.usuarioNombre, modulo: 'Nomina',
        });

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
             AND Día >= ? AND Día < ?`,
          [estadoAsistencia, tagDefault, tagObservacion, ...targetOps, inicio, limite]
        );
        affectedAsistencia = rAsis.affectedRows || 0;
      } else {
        // ── FACTURACIÓN: SERVICIOS ────────────────────────────────────────
        const crit = criterio === 'Fecha' ? 'Fecha' : 'Quincena';
        const fp = parseInt(formaPago, 10);
        if (!permisos.formasPago.includes(fp)) throw new ErrorUsuario('Seleccione una forma de pago válida.');
        const targetOps = operacionesDestino(acceso, regional, operacion);

        let desdeSql, hastaSql, opDesde, opHasta;
        const registro = {
          operacion, regional, datos: 'Servicios', formaPago: fp,
          condicion, usuario: acceso.usuarioNombre, modulo: 'Facturacion',
        };
        if (crit === 'Fecha') {
          desdeSql = fechaHoraSql(desde);
          hastaSql = fechaHoraSql(hasta);
          if (!desdeSql) throw new ErrorUsuario('La fecha y hora inicial es obligatoria para bloqueo por fecha.');
          if (!hastaSql) throw new ErrorUsuario('La fecha y hora final es obligatoria para bloqueo por fecha.');
          if (desdeSql > hastaSql) throw new ErrorUsuario('La fecha inicial no puede ser mayor que la fecha final.');
          opDesde = '>='; opHasta = '<=';
          Object.assign(registro, { desde: desdeSql, hasta: hastaSql, anio: parseInt(hastaSql.slice(0, 4), 10) });
        } else {
          if (!quincena) throw new ErrorUsuario('La quincena es obligatoria para bloqueo por quincena.');
          const { inicio, limite } = await rangoQuincena(conn, quincena, anioNum);
          desdeSql = inicio; hastaSql = limite;
          opDesde = '>='; opHasta = '<';
          Object.assign(registro, { quincena, anio: anioNum });
        }

        await registrarBloqueo(conn, registro);

        const estadoServicio = condicion === 'Bloquear' ? 'Green' : 'Yellow';
        const edicionServicio = condicion === 'Bloquear' ? 'Completado' : 'Pendiente';
        const tagObservacion = condicion === 'Bloquear' ? ' [Bloqueado por Facturación]' : ' [Desbloqueado por Facturación]';
        const tagDefault = tagObservacion.trim();

        const whereClauses = [
          condicion === 'Bloquear' ? "(ds.Estado IS NULL OR ds.Estado != 'Green')" : "ds.Estado = 'Green'",
          `ds.\`Hora Inicio\` ${opDesde} ?`,
          `ds.\`Hora Inicio\` ${opHasta} ?`,
          'ds.`Forma De Pago` = ?',
        ];
        const params = [estadoServicio, edicionServicio, tagDefault, tagObservacion, desdeSql, hastaSql, fp];

        if (targetOps) {
          whereClauses.push(`dr.\`Operación\` IN (${targetOps.map(() => '?').join(',')})`);
          params.push(...targetOps);
        }

        // Clientes, solo para Crédito
        if (fp === 3) {
          const tClientes = tipoClientes || 'Preseleccionados';
          if (tClientes === 'Preseleccionados') {
            whereClauses.push('dr.`Cliente a Facturar` IN (SELECT `Cliente a Facturar` FROM Maestro_Clientes_Credito WHERE Bloqueo = 1)');
          } else if (tClientes === 'Manual') {
            if (!Array.isArray(clientesManuales) || !clientesManuales.length) {
              throw new ErrorUsuario('Debe seleccionar al menos un cliente en la opción Manual.');
            }
            whereClauses.push(`dr.\`Cliente a Facturar\` IN (${clientesManuales.map(() => '?').join(',')})`);
            params.push(...clientesManuales);
          }
        }

        const [rServ] = await conn.execute(`
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
        `, params);
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
    if (err instanceof ErrorUsuario) return res.status(400).json({ error: err.message });
    console.error('[bloqueodatos] POST /api/crear:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
