const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../services/db');
const { computarAccesoFacturacion } = require('../services/accesoFacturacion');

const router = express.Router();
const FACTURACION_HTML = path.join(__dirname, '../views/facturacion/index.html');

function paginaError(mensaje) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Error</title><style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f2f5;}div{background:#fff;padding:2rem;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);max-width:400px;text-align:center;}h2{color:#e53e3e;margin-top:0;}</style></head><body><div><h2>Error</h2><p>${mensaje}</p></div></body></html>`;
}

function resumenAcceso(acceso) {
  if (!acceso) return null;
  return {
    sinFiltro:        acceso.sinFiltro,
    regionalesFiltro: Object.keys(acceso.opsPorRegional).sort(),
    opsPorRegional:   acceso.opsPorRegional,
  };
}

// ── GET / (Cargar Interfaz de Facturación) ───────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).send(paginaError('Parámetro ?usuario requerido'));

    const accesoServicios = await computarAccesoFacturacion(usuario, 'Servicios');
    const accesoRecibos = await computarAccesoFacturacion(usuario, 'Recibos');
    const accesoBloqueo = await computarAccesoFacturacion(usuario, 'Bloqueo_datos');
    const accesoClientes = await computarAccesoFacturacion(usuario, 'Clientes_credito');

    if (!accesoServicios && !accesoRecibos && !accesoBloqueo && !accesoClientes) {
      return res.status(403).send(paginaError('Usuario no autorizado para el módulo de Facturación'));
    }

    const base = accesoServicios || accesoRecibos || accesoBloqueo || accesoClientes;
    const template = fs.readFileSync(FACTURACION_HTML, 'utf8');

    // Quincena actual de hoy
    let quincenaActual = '';
    try {
      const [fechaHoy] = await pool.query('SELECT Quincena FROM Maestro_Fechas WHERE Fecha = CURDATE() LIMIT 1');
      if (fechaHoy.length && fechaHoy[0].Quincena) {
        quincenaActual = fechaHoy[0].Quincena;
      }
    } catch (eFecha) {
      console.error('[facturacion] Error obteniendo quincena actual:', eFecha.message);
    }

    const config = JSON.stringify({
      usuario,
      usuarioNombre: base.usuarioNombre,
      rol: base.rol,
      regional: base.regional,
      operacion: base.operacion,
      regionalesFiltro: Object.keys(base.opsPorRegional).sort(),
      opsPorRegional: base.opsPorRegional,
      quincenaActual,
      tabs: {
        servicios: resumenAcceso(accesoServicios),
        recibos: resumenAcceso(accesoRecibos || accesoServicios),
        bloqueo: resumenAcceso(accesoBloqueo),
        clientes_credito: resumenAcceso(accesoClientes),
      }
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(template.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[facturacion GET /]', err);
    res.status(500).send(paginaError('Error interno del servidor'));
  }
});

// ── GET /api/bloqueos ─────────────────────────────────────────────────────
// En Facturación solo se muestran los registros donde Datos = 'Servicios'
router.get('/api/bloqueos', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Bloqueo_datos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [rows] = await pool.execute(`
      SELECT b.ID AS id, b.Operación AS operacion, b.Quincena AS quincena, b.Hasta AS hasta,
             b.Año AS anio, b.Datos AS datos, b.Forma_Pago AS formaPago, b.Condición AS condicion,
             b.Usuario AS usuario, b.Fecha_Registro AS fechaRegistro, b.Modulo AS modulo,
             COALESCE(b.Regional, o.REGIONAL) AS regional
      FROM Bloqueo_Nomina b
      LEFT JOIN Maestro_Operaciones o ON b.Operación = o.OPERACIÓN
      WHERE b.Datos = 'Servicios'
      ORDER BY b.Fecha_Registro DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/bloqueos:', err);
    res.status(500).json([]);
  }
});

// ── GET /api/clientes-credito ─────────────────────────────────────────────
router.get('/api/clientes-credito', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Clientes_credito');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [rows] = await pool.execute(
      "SELECT ID as id, Bloqueo as bloqueo, `Cliente a Facturar` as clienteAFacturar, Nit as nit, Nombre as nombre, Usuario as usuario, Fecha_Registro as fechaRegistro FROM Maestro_Clientes_Credito ORDER BY `Cliente a Facturar` ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/clientes-credito:', err);
    res.status(500).json([]);
  }
});

// ── POST /api/clientes-credito (Agregar Cliente Crédito) ───────────────────
router.post('/api/clientes-credito', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { clienteAFacturar, nit, nombre, bloqueo } = req.body;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Clientes_credito');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!clienteAFacturar || !clienteAFacturar.trim()) {
      return res.status(400).json({ error: 'El Cliente a Facturar es obligatorio.' });
    }

    const clienteUpper = clienteAFacturar.trim().toUpperCase();
    const nitVal = nit ? parseInt(nit) : null;
    const nombreVal = (nombre || '').trim() || null;
    const bloqueoVal = (bloqueo === 0 || bloqueo === '0') ? 0 : 1;
    const newId = crypto.randomUUID().slice(0, 8);
    const usuarioVal = acceso.usuarioNombre || usuario;

    await pool.execute(
      'INSERT INTO Maestro_Clientes_Credito (ID, Bloqueo, `Cliente a Facturar`, Nit, Nombre, Usuario, Fecha_Registro) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [newId, bloqueoVal, clienteUpper, nitVal, nombreVal, usuarioVal]
    );

    res.json({ ok: true, id: newId, clienteAFacturar: clienteUpper, nit: nitVal, nombre: nombreVal, bloqueo: bloqueoVal, usuario: usuarioVal });
  } catch (err) {
    console.error('[facturacion] POST /api/clientes-credito:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/clientes-credito/toggle (Alternar Bloqueo 1/0) ───────────────
router.post('/api/clientes-credito/toggle', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { id, nuevoEstado } = req.body;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Clientes_credito');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!id) return res.status(400).json({ error: 'ID es obligatorio' });

    let val = 1;
    if (typeof nuevoEstado !== 'undefined') {
      val = nuevoEstado ? 1 : 0;
      await pool.execute('UPDATE Maestro_Clientes_Credito SET Bloqueo = ? WHERE ID = ?', [val, id]);
    } else {
      await pool.execute('UPDATE Maestro_Clientes_Credito SET Bloqueo = IF(Bloqueo = 1, 0, 1) WHERE ID = ?', [id]);
      const [r] = await pool.execute('SELECT Bloqueo FROM Maestro_Clientes_Credito WHERE ID = ? LIMIT 1', [id]);
      val = r.length ? r[0].Bloqueo : 1;
    }

    res.json({ ok: true, id, bloqueo: val });
  } catch (err) {
    console.error('[facturacion] POST /api/clientes-credito/toggle:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/buscar-cliente (Buscar Nit en Maestro_Clientes) ───────────────
router.get('/api/buscar-cliente', async (req, res) => {
  try {
    const nit = req.query.nit || req.query.q;
    if (!nit) return res.status(400).json({ error: 'Parámetro nit requerido' });

    const cleanNit = parseInt(String(nit).replace(/[^0-9]/g, ''));
    if (isNaN(cleanNit)) return res.json({ encontrado: false });

    const [rows] = await pool.execute(
      'SELECT `Código` as codigo, `Razón social` as razonSocial FROM Maestro_Clientes WHERE `Código` = ? LIMIT 1',
      [cleanNit]
    );

    if (rows.length && rows[0].razonSocial) {
      return res.json({
        encontrado: true,
        codigo: rows[0].codigo,
        razonSocial: rows[0].razonSocial.trim()
      });
    }

    res.json({ encontrado: false });
  } catch (err) {
    console.error('[facturacion] GET /api/buscar-cliente:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/clientes-credito/info ─────────────────────────────────────────
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
    console.error('[facturacion] GET /api/clientes-credito/info:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT & POST /api/clientes-credito/actualizar (Editar Cliente Crédito) ────
async function handleActualizarCliente(req, res) {
  try {
    const { usuario } = req.query;
    const id = req.params.id || req.body.id;
    const { clienteAFacturar, nit, nombre, bloqueo } = req.body;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Clientes_credito');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!id) return res.status(400).json({ error: 'ID es obligatorio' });
    if (!clienteAFacturar || !clienteAFacturar.trim()) {
      return res.status(400).json({ error: 'El Cliente a Facturar es obligatorio.' });
    }

    const clienteUpper = clienteAFacturar.trim().toUpperCase();
    const nitVal = nit ? parseInt(nit) : null;
    const nombreVal = (nombre || '').trim() || null;
    const bloqueoVal = (bloqueo === 0 || bloqueo === '0') ? 0 : 1;
    const usuarioVal = acceso.usuarioNombre || usuario;

    await pool.execute(
      'UPDATE Maestro_Clientes_Credito SET `Cliente a Facturar` = ?, Nit = ?, Nombre = ?, Bloqueo = ?, Usuario = ? WHERE ID = ?',
      [clienteUpper, nitVal, nombreVal, bloqueoVal, usuarioVal, id]
    );

    res.json({ ok: true, id, clienteAFacturar: clienteUpper, nit: nitVal, nombre: nombreVal, bloqueo: bloqueoVal, usuario: usuarioVal });
  } catch (err) {
    console.error('[facturacion] UPDATE cliente-credito:', err);
    res.status(500).json({ error: err.message });
  }
}
router.put('/api/clientes-credito/:id', handleActualizarCliente);
router.post('/api/clientes-credito/actualizar', handleActualizarCliente);

// ── DELETE & POST /api/clientes-credito/eliminar (Eliminar Cliente Crédito) ─
async function handleEliminarCliente(req, res) {
  try {
    const { usuario } = req.query;
    const id = req.params.id || req.body.id;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Clientes_credito');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!id) return res.status(400).json({ error: 'ID es obligatorio' });

    const [result] = await pool.execute('DELETE FROM Maestro_Clientes_Credito WHERE ID = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json({ ok: true, id });
  } catch (err) {
    console.error('[facturacion] DELETE cliente-credito:', err);
    res.status(500).json({ error: err.message });
  }
}
router.delete('/api/clientes-credito/:id', handleEliminarCliente);
router.post('/api/clientes-credito/eliminar', handleEliminarCliente);

// ══════════════════════════════════════════════════════════════════════════════
// ── SECCIÓN SERVICIOS (Dynamic_Servicios) ────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

let cachedImpuestos = null;
let lastImpuestosFetch = 0;

async function getImpuestos() {
  const now = Date.now();
  if (cachedImpuestos && (now - lastImpuestosFetch < 300000)) {
    return cachedImpuestos;
  }
  const [rows] = await pool.query('SELECT Concepto, `Operación`, Porcentaje FROM Config_Impuestos');
  const iva = rows.find(r => r.Concepto === 'IVA')?.Porcentaje || 0.19;
  const reteFuente = rows.find(r => r.Concepto === 'ReteFuente')?.Porcentaje || 0.04;
  const reteIva = rows.find(r => r.Concepto === 'ReteIVA')?.Porcentaje || 0.15;
  const reteIcaMap = {};
  rows.filter(r => r.Concepto === 'ReteICA' && r.Operación).forEach(r => {
    reteIcaMap[r.Operación.trim().toLowerCase()] = Number(r.Porcentaje);
  });
  cachedImpuestos = { iva, reteFuente, reteIva, reteIcaMap, raw: rows };
  lastImpuestosFetch = now;
  return cachedImpuestos;
}

function calcularTotalesServicio(row, impuestos) {
  const cantidad = Number(row.cantidad) || 0;
  const valorUnitario = Number(row.valorUnitario) || 0;
  const valorBase = Math.round(cantidad * valorUnitario);

  const iva = Math.round(valorBase * (impuestos.iva || 0.19));

  const aplicaReteFuente = String(row.retefuente || '').trim().toUpperCase() === 'V';
  const valorReteFuente = aplicaReteFuente ? Math.round(valorBase * (impuestos.reteFuente || 0.04)) : 0;

  const aplicaReteIVA = String(row.reteIVA || '').trim().toUpperCase() === 'V';
  const valorReteIVA = aplicaReteIVA ? Math.round(iva * (impuestos.reteIva || 0.15)) : 0;

  const aplicaReteICA = String(row.reteICA || '').trim().toUpperCase() === 'V';
  let icaPorcentaje = 0;
  if (aplicaReteICA && row.operacion) {
    const opKey = String(row.operacion).trim().toLowerCase();
    icaPorcentaje = impuestos.reteIcaMap[opKey] || 0;
  }
  const valorReteICA = aplicaReteICA ? Math.round(valorBase * icaPorcentaje) : 0;

  const totalPago = valorBase + iva - valorReteFuente - valorReteIVA - valorReteICA;

  return {
    valorBase,
    iva,
    valorReteFuente,
    valorReteIVA,
    valorReteICA,
    totalPago,
    aplicaReteFuente,
    aplicaReteIVA,
    aplicaReteICA,
    porcentajes: {
      iva: impuestos.iva,
      reteFuente: impuestos.reteFuente,
      reteIva: impuestos.reteIva,
      reteIca: icaPorcentaje
    }
  };
}

// ── GET /api/servicios ────────────────────────────────────────────────────────
router.get('/api/servicios', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Servicios');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const {
      desde,
      hasta,
      formaDePago,
      anio,
      mes,
      quincena,
      regional,
      operacion,
      usuarioServicio,
      clienteAFacturar,
      q,
      sortCol,
      sortDir,
      limit = 500,
      offset = 0
    } = req.query;

    const whereClauses = [];
    const params = [];

    // Scope por rol
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro || !acceso.operacionesFiltro.length) {
        return res.json({ total: 0, rows: [] });
      }
      whereClauses.push(`r.\`Operación\` IN (${acceso.operacionesFiltro.map(() => '?').join(',')})`);
      params.push(...acceso.operacionesFiltro);
    }

    // Filtros de fecha Desde y Hasta (sobre Hora Inicio)
    if (desde) {
      whereClauses.push('s.`Hora Inicio` >= ?');
      params.push(desde.length <= 10 ? `${desde} 00:00:00` : desde);
    }
    if (hasta) {
      whereClauses.push('s.`Hora Inicio` <= ?');
      params.push(hasta.length <= 10 ? `${hasta} 23:59:59` : hasta);
    }

    // Año (default: 2026 si no se especifica y no hay filtro desde/hasta)
    const anioFiltro = (typeof anio === 'undefined' || anio === null || anio === '') ? (desde || hasta ? 'todos' : '2026') : anio;
    if (anioFiltro !== 'todos') {
      const anioNum = parseInt(anioFiltro, 10) || 2026;
      whereClauses.push('s.`Hora Inicio` >= ? AND s.`Hora Inicio` <= ?');
      params.push(`${anioNum}-01-01 00:00:00`, `${anioNum}-12-31 23:59:59`);
    }

    // Forma de Pago
    if (typeof formaDePago !== 'undefined' && formaDePago !== '' && formaDePago !== 'todas') {
      whereClauses.push('s.`Forma De Pago` = ?');
      params.push(parseInt(formaDePago, 10));
    }

    // Mes
    if (mes && mes !== 'todos') {
      whereClauses.push('MONTH(s.`Hora Inicio`) = ?');
      params.push(parseInt(mes, 10));
    }

    // Quincena
    if (quincena && quincena !== 'todas') {
      whereClauses.push('mf.Quincena = ?');
      params.push(quincena);
    }

    // Regional
    if (regional && regional !== 'todas') {
      whereClauses.push('mo.REGIONAL = ?');
      params.push(regional);
    }

    // Operación
    if (operacion && operacion !== 'todas') {
      whereClauses.push('r.`Operación` = ?');
      params.push(operacion);
    }

    // Usuario
    if (usuarioServicio && usuarioServicio !== 'todos') {
      whereClauses.push('s.Usuario = ?');
      params.push(usuarioServicio);
    }

    // Cliente a Facturar
    if (clienteAFacturar && clienteAFacturar !== 'todos') {
      whereClauses.push('r.`Cliente a Facturar` = ?');
      params.push(clienteAFacturar);
    }

    // Búsqueda libre
    if (q && q.trim()) {
      const qLike = `%${q.trim()}%`;
      whereClauses.push(`(
        s.IdServicio LIKE ? 
        OR s.IdRecibo LIKE ? 
        OR r.\`Consecutivo Recibo\` LIKE ?
        OR mp.Placa LIKE ? 
        OR r.Placa LIKE ? 
        OR mt.Transportadora LIKE ? 
        OR s.Proveedor LIKE ? 
        OR r.\`Cliente a Facturar\` LIKE ? 
        OR CAST(r.Nit AS CHAR) LIKE ? 
        OR mc.\`Razón social\` LIKE ?
      )`);
      for (let i = 0; i < 10; i++) params.push(qLike);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sortMap = {
      fechaServicio: 's.`Hora Inicio`',
      consecutivoRecibo: 'r.`Consecutivo Recibo`',
      estado: 's.Estado',
      cantidad: 's.Cantidad',
      valorUnitario: 's.`Valor Unitario`',
      actividad: 'ca.Actividad',
      unidad: 's.Unidad',
      placa: 'mp.Placa',
      vehiculo: 's.Vehiculo',
      clienteAFacturar: 'r.`Cliente a Facturar`',
      transportadora: 'mt.Transportadora',
      proveedor: 's.Proveedor',
      usuario: 's.Usuario',
      fechaRegistro: 's.Fecha',
      quincena: 'mf.Quincena'
    };

    const orderCol = sortMap[sortCol] || 's.Fecha';
    const orderDir = (String(sortDir || '').toUpperCase() === 'ASC') ? 'ASC' : 'DESC';
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 1000);
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

    const querySql = `
      SELECT 
        s.IdServicio as idServicio,
        s.IdRecibo as idRecibo,
        s.Estado as estado,
        s.\`Hora Inicio\` as fechaServicio,
        r.\`Consecutivo Recibo\` as consecutivoRecibo,
        s.Cantidad as cantidad,
        s.\`Valor Unitario\` as valorUnitario,
        ca.Actividad as actividad,
        s.Unidad as unidad,
        mp.Placa as placa,
        s.Vehiculo as vehiculo,
        r.\`Cliente a Facturar\` as clienteAFacturar,
        mt.Transportadora as transportadora,
        s.Proveedor as proveedor,
        s.Usuario as usuario,
        s.Fecha as fechaRegistro,
        mf.Quincena as quincena,
        r.Retefuente as retefuente,
        r.ReteIVA as reteIVA,
        r.ReteICA as reteICA,
        r.\`Operación\` as operacion,
        s.\`Forma De Pago\` as formaDePago
      FROM Dynamic_Servicios s
      LEFT JOIN Dynamic_Recibos r ON s.IdRecibo = r.IdRecibo
      LEFT JOIN Config_Actividad ca ON s.Actividad = ca.ID
      LEFT JOIN Maestro_Placas mp ON s.PL1 = mp.ID
      LEFT JOIN Maestro_Transportadora mt ON s.Transportadora = mt.ID
      LEFT JOIN Maestro_Fechas mf ON mf.Fecha = DATE(s.\`Hora Inicio\`)
      LEFT JOIN Maestro_Operaciones mo ON r.\`Operación\` = mo.OPERACIÓN
      LEFT JOIN Maestro_Clientes mc ON r.Nit = mc.\`Código\`
      ${whereSql}
      ORDER BY ${orderCol} ${orderDir}, s.IdServicio DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(querySql, [...params, limitNum, offsetNum]);
    const impuestos = await getImpuestos();

    const data = rows.map(r => {
      const calc = calcularTotalesServicio(r, impuestos);
      return {
        ...r,
        ...calc
      };
    });

    res.json({
      total: data.length,
      limit: limitNum,
      offset: offsetNum,
      rows: data
    });
  } catch (err) {
    console.error('[facturacion] GET /api/servicios:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/servicios/metricas ───────────────────────────────────────────────
router.get('/api/servicios/metricas', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Servicios');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const {
      desde,
      hasta,
      formaDePago,
      anio,
      regional,
      operacion,
      mes,
      quincena,
      usuarioServicio,
      clienteAFacturar,
      q
    } = req.query;

    const commonWhere = [];
    const commonParams = [];

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro || !acceso.operacionesFiltro.length) {
        return res.json({ formasDePago: [], regionalesOps: [], fechas: [], clientes: [], usuarios: [] });
      }
      commonWhere.push(`r.\`Operación\` IN (${acceso.operacionesFiltro.map(() => '?').join(',')})`);
      commonParams.push(...acceso.operacionesFiltro);
    }

    // Filtros de fecha Desde y Hasta (sobre Hora Inicio)
    if (desde) {
      commonWhere.push('s.`Hora Inicio` >= ?');
      commonParams.push(desde.length <= 10 ? `${desde} 00:00:00` : desde);
    }
    if (hasta) {
      commonWhere.push('s.`Hora Inicio` <= ?');
      commonParams.push(hasta.length <= 10 ? `${hasta} 23:59:59` : hasta);
    }

    // Año (default: 2026 si no se especifica y no hay filtro desde/hasta)
    const anioFiltro = (typeof anio === 'undefined' || anio === null || anio === '') ? (desde || hasta ? 'todos' : '2026') : anio;
    if (anioFiltro !== 'todos') {
      const anioNum = parseInt(anioFiltro, 10) || 2026;
      commonWhere.push('s.`Hora Inicio` >= ? AND s.`Hora Inicio` <= ?');
      commonParams.push(`${anioNum}-01-01 00:00:00`, `${anioNum}-12-31 23:59:59`);
    }

    if (regional && regional !== 'todas') {
      commonWhere.push('mo.REGIONAL = ?');
      commonParams.push(regional);
    }
    if (operacion && operacion !== 'todas') {
      commonWhere.push('r.`Operación` = ?');
      commonParams.push(operacion);
    }
    if (mes && mes !== 'todos') {
      commonWhere.push('MONTH(s.`Hora Inicio`) = ?');
      commonParams.push(parseInt(mes, 10));
    }
    let quincenaFiltro = null;
    if (quincena && quincena !== 'todas') {
      quincenaFiltro = quincena;
    }
    if (usuarioServicio && usuarioServicio !== 'todos') {
      commonWhere.push('s.Usuario = ?');
      commonParams.push(usuarioServicio);
    }
    if (clienteAFacturar && clienteAFacturar !== 'todos') {
      commonWhere.push('r.`Cliente a Facturar` = ?');
      commonParams.push(clienteAFacturar);
    }
    if (q && q.trim()) {
      const qLike = `%${q.trim()}%`;
      commonWhere.push(`(
        s.IdServicio LIKE ? 
        OR s.IdRecibo LIKE ? 
        OR r.\`Consecutivo Recibo\` LIKE ?
        OR s.Proveedor LIKE ? 
        OR r.\`Cliente a Facturar\` LIKE ? 
        OR CAST(r.Nit AS CHAR) LIKE ?
      )`);
      for (let i = 0; i < 6; i++) commonParams.push(qLike);
    }

    const impuestos = await getImpuestos();
    const ivaTax = impuestos.iva || 0.19;
    const reteFuenteTax = impuestos.reteFuente || 0.04;
    const reteIvaTax = impuestos.reteIva || 0.15;
    let reteIcaCaseSql = 'CASE ';
    for (const [op, p] of Object.entries(impuestos.reteIcaMap || {})) {
      reteIcaCaseSql += `WHEN LOWER(TRIM(r.\`Operación\`)) = ${pool.escape(op)} THEN ${Number(p)} `;
    }
    reteIcaCaseSql += 'ELSE 0 END';

    const vBaseSql = '(COALESCE(s.Cantidad, 0) * COALESCE(s.`Valor Unitario`, 0))';
    const ivaSql = `(${vBaseSql} * ${ivaTax})`;
    const reteFuenteSql = `(CASE WHEN r.Retefuente = 'V' THEN ${vBaseSql} * ${reteFuenteTax} ELSE 0 END)`;
    const reteIvaSql = `(CASE WHEN r.ReteIVA = 'V' THEN ${ivaSql} * ${reteIvaTax} ELSE 0 END)`;
    const reteIcaSql = `(CASE WHEN r.ReteICA = 'V' THEN ${vBaseSql} * (${reteIcaCaseSql}) ELSE 0 END)`;
    const totalPagoSql = `(${vBaseSql} + ${ivaSql} - ${reteFuenteSql} - ${reteIvaSql} - ${reteIcaSql})`;

    // 1. Agrupación Forma De Pago (no filtra por formaDePago pero sí por quincena si existe)
    const fpWhere = [...commonWhere];
    const fpParams = [...commonParams];
    if (quincenaFiltro) {
      fpWhere.push('mf.Quincena = ?');
      fpParams.push(quincenaFiltro);
    }
    const whereSqlFP = fpWhere.length ? `WHERE ${fpWhere.join(' AND ')}` : '';
    const [fpRows] = await pool.query(`
      SELECT 
        s.\`Forma De Pago\` as formaDePago,
        COUNT(*) as totalCount,
        ROUND(SUM(${vBaseSql})) as sumValorBase,
        ROUND(SUM(${totalPagoSql})) as sumTotalPago
      FROM Dynamic_Servicios s
      LEFT JOIN Dynamic_Recibos r ON s.IdRecibo = r.IdRecibo
      LEFT JOIN Maestro_Operaciones mo ON r.\`Operación\` = mo.OPERACIÓN
      LEFT JOIN Maestro_Fechas mf ON mf.Fecha = DATE(s.\`Hora Inicio\`)
      ${whereSqlFP}
      GROUP BY s.\`Forma De Pago\`
    `, fpParams);

    // 2. Agrupaciones para los demás filtros (SÍ incluye formaDePago y quincena)
    const dropdownWhere = [...commonWhere];
    const dropdownParams = [...commonParams];
    if (quincenaFiltro) {
      dropdownWhere.push('mf.Quincena = ?');
      dropdownParams.push(quincenaFiltro);
    }
    if (typeof formaDePago !== 'undefined' && formaDePago !== '' && formaDePago !== 'todas') {
      dropdownWhere.push('s.`Forma De Pago` = ?');
      dropdownParams.push(parseInt(formaDePago, 10));
    }
    const whereSqlDropdowns = dropdownWhere.length ? `WHERE ${dropdownWhere.join(' AND ')}` : '';

    // Agrupación Regionales & Operaciones
    const [opsRows] = await pool.query(`
      SELECT 
        COALESCE(mo.REGIONAL, 'SIN REGIONAL') as regional,
        r.\`Operación\` as operacion,
        COUNT(*) as totalCount,
        ROUND(SUM(${vBaseSql})) as sumValorBase,
        ROUND(SUM(${totalPagoSql})) as sumTotalPago
      FROM Dynamic_Servicios s
      LEFT JOIN Dynamic_Recibos r ON s.IdRecibo = r.IdRecibo
      LEFT JOIN Maestro_Operaciones mo ON r.\`Operación\` = mo.OPERACIÓN
      LEFT JOIN Maestro_Fechas mf ON mf.Fecha = DATE(s.\`Hora Inicio\`)
      ${whereSqlDropdowns}
      GROUP BY mo.REGIONAL, r.\`Operación\`
    `, dropdownParams);

    // Agrupación Meses & Quincenas (NO debe filtrar por mf.Quincena para mostrar todas las quincenas)
    const fechasWhere = [...commonWhere];
    const fechasParams = [...commonParams];
    if (typeof formaDePago !== 'undefined' && formaDePago !== '' && formaDePago !== 'todas') {
      fechasWhere.push('s.`Forma De Pago` = ?');
      fechasParams.push(parseInt(formaDePago, 10));
    }
    const whereSqlFechas = fechasWhere.length ? `WHERE ${fechasWhere.join(' AND ')}` : '';

    const [fechasRows] = await pool.query(`
      SELECT 
        MONTH(s.\`Hora Inicio\`) as mes,
        mf.Quincena as quincena,
        COUNT(*) as totalCount,
        ROUND(SUM(${vBaseSql})) as sumValorBase,
        ROUND(SUM(${totalPagoSql})) as sumTotalPago
      FROM Dynamic_Servicios s
      LEFT JOIN Dynamic_Recibos r ON s.IdRecibo = r.IdRecibo
      LEFT JOIN Maestro_Operaciones mo ON r.\`Operación\` = mo.OPERACIÓN
      LEFT JOIN Maestro_Fechas mf ON mf.Fecha = DATE(s.\`Hora Inicio\`)
      ${whereSqlFechas}
      GROUP BY MONTH(s.\`Hora Inicio\`), mf.Quincena
    `, fechasParams);

    // Clientes a Facturar (orden ascendente)
    const [cliRows] = await pool.query(`
      SELECT 
        r.\`Cliente a Facturar\` as cliente,
        COUNT(*) as totalCount,
        ROUND(SUM(${vBaseSql})) as sumValorBase,
        ROUND(SUM(${totalPagoSql})) as sumTotalPago
      FROM Dynamic_Servicios s
      LEFT JOIN Dynamic_Recibos r ON s.IdRecibo = r.IdRecibo
      LEFT JOIN Maestro_Operaciones mo ON r.\`Operación\` = mo.OPERACIÓN
      LEFT JOIN Maestro_Fechas mf ON mf.Fecha = DATE(s.\`Hora Inicio\`)
      ${whereSqlDropdowns} AND r.\`Cliente a Facturar\` IS NOT NULL AND r.\`Cliente a Facturar\` != ''
      GROUP BY r.\`Cliente a Facturar\`
      ORDER BY r.\`Cliente a Facturar\` ASC
    `, dropdownParams);

    // Usuarios
    const [userRows] = await pool.query(`
      SELECT 
        s.Usuario as usuario,
        COUNT(*) as totalCount,
        ROUND(SUM(${vBaseSql})) as sumValorBase,
        ROUND(SUM(${totalPagoSql})) as sumTotalPago
      FROM Dynamic_Servicios s
      LEFT JOIN Dynamic_Recibos r ON s.IdRecibo = r.IdRecibo
      LEFT JOIN Maestro_Operaciones mo ON r.\`Operación\` = mo.OPERACIÓN
      LEFT JOIN Maestro_Fechas mf ON mf.Fecha = DATE(s.\`Hora Inicio\`)
      ${whereSqlDropdowns} AND s.Usuario IS NOT NULL AND s.Usuario != ''
      GROUP BY s.Usuario
      ORDER BY totalCount DESC
      LIMIT 100
    `, dropdownParams);

    res.json({
      formasDePago: fpRows,
      regionalesOps: opsRows,
      fechas: fechasRows,
      clientes: cliRows,
      usuarios: userRows
    });
  } catch (err) {
    console.error('[facturacion] GET /api/servicios/metricas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/servicios/:idServicio ───────────────────────────────────────────
router.get('/api/servicios/:idServicio', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { idServicio } = req.params;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!idServicio) return res.status(400).json({ error: 'idServicio requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Servicios');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [rows] = await pool.query(`
      SELECT 
        s.*,
        r.\`Consecutivo Recibo\` as consecutivoRecibo,
        r.\`Operación\` as operacion,
        r.\`Cliente a Facturar\` as clienteAFacturar,
        r.Categoria as reciboCategoria,
        r.\`Cliente por Placa\` as clientePorPlaca,
        r.Placa as reciboPlaca,
        r.Nit as nit,
        r.Telefono as reciboTelefono,
        r.Email as email,
        r.Retefuente as retefuente,
        r.ReteIVA as reteIVA,
        r.ReteICA as reteICA,
        r.Modalidad as modalidad,
        r.Observaciones as reciboObservaciones,
        ca.Actividad as actividadNombre,
        mp.Placa as placaNombre,
        mt.Transportadora as transportadoraNombre,
        mf.Quincena as quincenaNombre,
        mo.REGIONAL as regionalNombre,
        mc.\`Razón social\` as razonSocial
      FROM Dynamic_Servicios s
      LEFT JOIN Dynamic_Recibos r ON s.IdRecibo = r.IdRecibo
      LEFT JOIN Config_Actividad ca ON s.Actividad = ca.ID
      LEFT JOIN Maestro_Placas mp ON s.PL1 = mp.ID
      LEFT JOIN Maestro_Transportadora mt ON s.Transportadora = mt.ID
      LEFT JOIN Maestro_Fechas mf ON mf.Fecha = DATE(s.\`Hora Inicio\`)
      LEFT JOIN Maestro_Operaciones mo ON r.\`Operación\` = mo.OPERACIÓN
      LEFT JOIN Maestro_Clientes mc ON r.Nit = mc.\`Código\`
      WHERE s.IdServicio = ?
      LIMIT 1
    `, [idServicio]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    const row = rows[0];

    if (!acceso.sinFiltro && acceso.operacionesFiltro && !acceso.operacionesFiltro.includes(row.operacion)) {
      return res.status(403).json({ error: 'No autorizado para ver este servicio' });
    }

    const impuestos = await getImpuestos();
    const calculos = calcularTotalesServicio({
      cantidad: row.Cantidad,
      valorUnitario: row['Valor Unitario'],
      retefuente: row.retefuente,
      reteIVA: row.reteIVA,
      reteICA: row.reteICA,
      operacion: row.operacion
    }, impuestos);

    res.json({
      idServicio: row.IdServicio,
      ...row,
      ...calculos
    });
  } catch (err) {
    console.error('[facturacion] GET /api/servicios/:idServicio:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── SECCIÓN RECIBOS (Dynamic_Recibos / vista_recibos_appsheet) ────────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/recibos ─────────────────────────────────────────────────────────
router.get('/api/recibos', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Recibos') 
                || await computarAccesoFacturacion(usuario, 'Servicios');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const {
      desde,
      hasta,
      modalidad,
      anio,
      mes,
      quincena,
      regional,
      operacion,
      usuarioRecibo,
      clienteAFacturar,
      q,
      sortCol,
      sortDir,
      limit = 500,
      offset = 0
    } = req.query;

    const whereClauses = [];
    const params = [];

    // Scope por rol
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro || !acceso.operacionesFiltro.length) {
        return res.json({ total: 0, rows: [] });
      }
      whereClauses.push(`dr.\`Operación\` IN (${acceso.operacionesFiltro.map(() => '?').join(',')})`);
      params.push(...acceso.operacionesFiltro);
    }

    // Modalidad ('RECAUDO', 'CREDITO')
    if (modalidad && modalidad !== 'todas') {
      whereClauses.push('dr.Modalidad = ?');
      params.push(modalidad);
    }

    // Filtros de fecha Desde y Hasta (sobre dr.Fecha)
    if (desde) {
      whereClauses.push('dr.Fecha >= ?');
      params.push(desde.length <= 10 ? `${desde} 00:00:00` : desde);
    }
    if (hasta) {
      whereClauses.push('dr.Fecha <= ?');
      params.push(hasta.length <= 10 ? `${hasta} 23:59:59` : hasta);
    }

    // Año (default: 2026 si no se especifica y no hay filtro desde/hasta)
    const anioFiltro = (typeof anio === 'undefined' || anio === null || anio === '') ? (desde || hasta ? 'todos' : '2026') : anio;
    if (anioFiltro !== 'todos') {
      const anioNum = parseInt(anioFiltro, 10) || 2026;
      whereClauses.push('dr.Fecha >= ? AND dr.Fecha <= ?');
      params.push(`${anioNum}-01-01 00:00:00`, `${anioNum}-12-31 23:59:59`);
    }

    // Mes
    if (mes && mes !== 'todos') {
      whereClauses.push('MONTH(dr.Fecha) = ?');
      params.push(parseInt(mes, 10));
    }

    // Quincena
    if (quincena && quincena !== 'todas') {
      whereClauses.push('mf.Quincena = ?');
      params.push(quincena);
    }

    // Regional
    if (regional && regional !== 'todas') {
      whereClauses.push('mo.REGIONAL = ?');
      params.push(regional);
    }

    // Operación
    if (operacion && operacion !== 'todas') {
      whereClauses.push('dr.`Operación` = ?');
      params.push(operacion);
    }

    // Usuario
    if (usuarioRecibo && usuarioRecibo !== 'todos') {
      whereClauses.push('dr.Usuario = ?');
      params.push(usuarioRecibo);
    }

    // Cliente a Facturar
    if (clienteAFacturar && clienteAFacturar !== 'todos') {
      whereClauses.push('dr.`Cliente a Facturar` = ?');
      params.push(clienteAFacturar);
    }

    // Búsqueda libre
    if (q && q.trim()) {
      const qLike = `%${q.trim()}%`;
      whereClauses.push(`(
        dr.IdRecibo LIKE ? 
        OR dr.\`Consecutivo Recibo\` LIKE ? 
        OR dr.Placa LIKE ? 
        OR dr.\`Cliente a Facturar\` LIKE ? 
        OR CAST(dr.Nit AS CHAR) LIKE ? 
        OR mc.\`Razón social\` LIKE ?
        OR dr.Usuario LIKE ?
      )`);
      for (let i = 0; i < 7; i++) params.push(qLike);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sortMap = {
      consecutivo_recibo: 'dr.`Consecutivo Recibo`',
      operacion: 'dr.`Operación`',
      regional: 'mo.REGIONAL',
      modalidad: 'dr.Modalidad',
      cliente_credito: 'dr.`Cliente a Facturar`',
      nit: 'dr.Nit',
      nombres: 'mc.`Razón social`',
      idrecibo: 'dr.IdRecibo',
      usuario: 'dr.Usuario',
      fecha_registro: 'dr.Fecha',
      quincena: 'mf.Quincena'
    };

    const orderCol = sortMap[sortCol] || 'dr.Fecha';
    const orderDir = (String(sortDir || '').toUpperCase() === 'ASC') ? 'ASC' : 'DESC';
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 1000);
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

    const queryRecibos = `
      SELECT 
        dr.IdRecibo,
        dr.\`Consecutivo Recibo\` as consecutivo_recibo,
        dr.\`Operación\` as operacion,
        dr.Fecha as fecha_registro,
        dr.\`Cliente a Facturar\` as cliente_credito,
        dr.Categoria as categoria_id,
        dr.Nit as nit,
        dr.Telefono as telefono,
        dr.Email as email,
        dr.Usuario as usuario,
        dr.Modalidad as modalidad,
        dr.Placa as recibo_placa,
        dr.Retefuente as retefuente_flag,
        dr.ReteIVA as reteiva_flag,
        dr.ReteICA as reteica_flag,
        mo.REGIONAL as regional,
        mc.\`Razón social\` as nombres,
        ccs.Categoria as categoria,
        mf.Quincena as quincena_nombre
      FROM Dynamic_Recibos dr
      LEFT JOIN Maestro_Operaciones mo ON mo.OPERACIÓN = dr.\`Operación\`
      LEFT JOIN Maestro_Clientes mc ON mc.\`Código\` = dr.Nit
      LEFT JOIN Config_Categoria_Serv ccs ON ccs.Id = dr.Categoria
      LEFT JOIN Maestro_Fechas mf ON mf.Fecha = DATE(dr.Fecha)
      ${whereSql}
      ORDER BY ${orderCol} ${orderDir}, dr.IdRecibo DESC
      LIMIT ? OFFSET ?
    `;

    const [recibos] = await pool.query(queryRecibos, [...params, limitNum, offsetNum]);

    if (!recibos.length) {
      return res.json({ total: 0, limit: limitNum, offset: offsetNum, rows: [] });
    }

    const idRecibos = recibos.map(r => r.IdRecibo);

    // Agregación de servicios para estos recibos
    const [aggRows] = await pool.query(`
      SELECT 
        ds.IdRecibo,
        MIN(ds.\`Hora Inicio\`) as fecha_servicio,
        MAX(ds.\`Hora Inicio\`) as max_hora,
        SUM(COALESCE(ds.Cantidad, 0) * COALESCE(ds.\`Valor Unitario\`, 0)) as subtotal,
        MAX(ds.Validacion) as max_validacion,
        SUBSTRING_INDEX(GROUP_CONCAT(ds.PL1 ORDER BY ds.\`Hora Inicio\` DESC, ds.IdServicio DESC SEPARATOR '|||'), '|||', 1) as PL1_latest,
        SUBSTRING_INDEX(GROUP_CONCAT(ds.Transportadora ORDER BY ds.\`Hora Inicio\` DESC, ds.IdServicio DESC SEPARATOR '|||'), '|||', 1) as transportadora_latest,
        SUBSTRING_INDEX(GROUP_CONCAT(ds.Proveedor ORDER BY ds.\`Hora Inicio\` DESC, ds.IdServicio DESC SEPARATOR '|||'), '|||', 1) as proveedor_latest,
        SUBSTRING_INDEX(GROUP_CONCAT(ds.Area ORDER BY ds.\`Hora Inicio\` DESC, ds.IdServicio DESC SEPARATOR '|||'), '|||', 1) as area_latest
      FROM Dynamic_Servicios ds
      WHERE ds.IdRecibo IN (?)
      GROUP BY ds.IdRecibo
    `, [idRecibos]);

    const areaIds = [...new Set(aggRows.map(a => a.area_latest).filter(Boolean))];
    const transpIds = [...new Set(aggRows.map(a => a.transportadora_latest).filter(Boolean))];
    const placaIds = [...new Set(aggRows.map(a => a.PL1_latest).filter(Boolean))];

    const [areas] = areaIds.length > 0 ? await pool.query('SELECT ID, AREA FROM Config_Area WHERE ID IN (?)', [areaIds]) : [[]];
    const [transps] = transpIds.length > 0 ? await pool.query('SELECT ID, Transportadora FROM Maestro_Transportadora WHERE ID IN (?)', [transpIds]) : [[]];
    const [placas] = placaIds.length > 0 ? await pool.query('SELECT ID, Placa FROM Maestro_Placas WHERE ID IN (?)', [placaIds]) : [[]];

    const areaMap = Object.fromEntries(areas.map(a => [a.ID, a.AREA]));
    const transpMap = Object.fromEntries(transps.map(t => [t.ID, t.Transportadora]));
    const placaMap = Object.fromEntries(placas.map(p => [p.ID, p.Placa]));
    const aggMap = Object.fromEntries(aggRows.map(a => [a.IdRecibo, a]));

    const impuestos = await getImpuestos();
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    const data = recibos.map(dr => {
      const agg = aggMap[dr.IdRecibo] || {};
      const maxVal = agg.max_validacion;
      const estado = maxVal === 2 ? 'Yellow' : maxVal === 1 ? 'Green' : 'Red';
      const subtotal = Math.round(Number(agg.subtotal || 0));
      const iva = Math.round(subtotal * (impuestos.iva || 0.19));
      const retefuente = dr.retefuente_flag === 'V' ? Math.round(subtotal * (impuestos.reteFuente || 0.04)) : 0;
      const reteiva = dr.reteiva_flag === 'V' ? Math.round(iva * (impuestos.reteIva || 0.15)) : 0;
      const opKey = String(dr.operacion || '').trim().toLowerCase();
      const icaRate = impuestos.reteIcaMap[opKey] || 0.007;
      const reteica = dr.reteica_flag === 'V' ? Math.round(subtotal * icaRate) : 0;
      const total = subtotal + iva - retefuente - reteiva - reteica;

      const maxHora = agg.max_hora ? new Date(agg.max_hora) : new Date(dr.fecha_registro);
      const monthNum = maxHora.getMonth() + 1;
      const day = maxHora.getDate();
      const quincena = dr.quincena_nombre || `${monthNum}. ${meses[monthNum - 1]} ${day > 15 ? 'Q2' : 'Q1'}`;

      return {
        estado,
        mes: `${monthNum}. ${meses[monthNum - 1]}`,
        quincena,
        dia: String(day).padStart(2, '0'),
        fecha_servicio: agg.fecha_servicio || dr.fecha_registro,
        regional: dr.regional || '',
        operacion: dr.operacion || '',
        idrecibo: dr.IdRecibo,
        consecutivo_recibo: dr.consecutivo_recibo || '',
        modalidad: dr.modalidad || '',
        area: areaMap[agg.area_latest] || agg.area_latest || '',
        transportadora: transpMap[agg.transportadora_latest] || agg.transportadora_latest || '',
        proveedor: agg.proveedor_latest || '',
        placa: placaMap[agg.PL1_latest] || dr.recibo_placa || '',
        subtotal,
        iva,
        retefuente,
        reteiva,
        reteica,
        total,
        cliente_credito: dr.cliente_credito || '',
        categoria: dr.categoria || '',
        nit: dr.nit || '',
        nombres: dr.nombres || '',
        telefono: dr.telefono || '',
        email: dr.email || '',
        usuario: dr.usuario || '',
        fecha_registro: dr.fecha_registro
      };
    });

    res.json({
      total: data.length,
      limit: limitNum,
      offset: offsetNum,
      rows: data
    });
  } catch (err) {
    console.error('[facturacion] GET /api/recibos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/recibos/metricas ────────────────────────────────────────────────
router.get('/api/recibos/metricas', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Recibos') 
                || await computarAccesoFacturacion(usuario, 'Servicios');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const {
      desde,
      hasta,
      modalidad,
      anio,
      regional,
      operacion,
      mes,
      quincena,
      usuarioRecibo,
      clienteAFacturar,
      q
    } = req.query;

    const commonWhere = [];
    const commonParams = [];

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro || !acceso.operacionesFiltro.length) {
        return res.json({ modalidades: [], regionalesOps: [], fechas: [], clientes: [], usuarios: [] });
      }
      commonWhere.push(`dr.\`Operación\` IN (${acceso.operacionesFiltro.map(() => '?').join(',')})`);
      commonParams.push(...acceso.operacionesFiltro);
    }

    if (desde) {
      commonWhere.push('dr.Fecha >= ?');
      commonParams.push(desde.length <= 10 ? `${desde} 00:00:00` : desde);
    }
    if (hasta) {
      commonWhere.push('dr.Fecha <= ?');
      commonParams.push(hasta.length <= 10 ? `${hasta} 23:59:59` : hasta);
    }

    const anioFiltro = (typeof anio === 'undefined' || anio === null || anio === '') ? (desde || hasta ? 'todos' : '2026') : anio;
    if (anioFiltro !== 'todos') {
      const anioNum = parseInt(anioFiltro, 10) || 2026;
      commonWhere.push('dr.Fecha >= ? AND dr.Fecha <= ?');
      commonParams.push(`${anioNum}-01-01 00:00:00`, `${anioNum}-12-31 23:59:59`);
    }

    if (regional && regional !== 'todas') {
      commonWhere.push('mo.REGIONAL = ?');
      commonParams.push(regional);
    }
    if (operacion && operacion !== 'todas') {
      commonWhere.push('dr.`Operación` = ?');
      commonParams.push(operacion);
    }
    if (mes && mes !== 'todos') {
      commonWhere.push('MONTH(dr.Fecha) = ?');
      commonParams.push(parseInt(mes, 10));
    }
    let quincenaFiltro = null;
    if (quincena && quincena !== 'todas') {
      quincenaFiltro = quincena;
    }
    if (usuarioRecibo && usuarioRecibo !== 'todos') {
      commonWhere.push('dr.Usuario = ?');
      commonParams.push(usuarioRecibo);
    }
    if (clienteAFacturar && clienteAFacturar !== 'todos') {
      commonWhere.push('dr.`Cliente a Facturar` = ?');
      commonParams.push(clienteAFacturar);
    }
    if (q && q.trim()) {
      const qLike = `%${q.trim()}%`;
      commonWhere.push(`(
        dr.IdRecibo LIKE ? 
        OR dr.\`Consecutivo Recibo\` LIKE ? 
        OR dr.Placa LIKE ? 
        OR dr.\`Cliente a Facturar\` LIKE ? 
        OR CAST(dr.Nit AS CHAR) LIKE ?
      )`);
      for (let i = 0; i < 5; i++) commonParams.push(qLike);
    }

    const impuestos = await getImpuestos();
    const ivaTax = impuestos.iva || 0.19;
    const reteFuenteTax = impuestos.reteFuente || 0.04;
    const reteIvaTax = impuestos.reteIva || 0.15;
    let reteIcaCaseSql = 'CASE ';
    for (const [op, p] of Object.entries(impuestos.reteIcaMap || {})) {
      reteIcaCaseSql += `WHEN LOWER(TRIM(dr.\`Operación\`)) = ${pool.escape(op)} THEN ${Number(p)} `;
    }
    reteIcaCaseSql += 'ELSE 0.007 END';

    const subtotalExpr = '(COALESCE(ds.Cantidad, 0) * COALESCE(ds.`Valor Unitario`, 0))';
    const ivaExpr = `(${subtotalExpr} * ${ivaTax})`;
    const rfExpr = `(CASE WHEN dr.Retefuente = 'V' THEN ${subtotalExpr} * ${reteFuenteTax} ELSE 0 END)`;
    const riExpr = `(CASE WHEN dr.ReteIVA = 'V' THEN ${ivaExpr} * ${reteIvaTax} ELSE 0 END)`;
    const rcExpr = `(CASE WHEN dr.ReteICA = 'V' THEN ${subtotalExpr} * (${reteIcaCaseSql}) ELSE 0 END)`;
    const totalExpr = `(${subtotalExpr} + ${ivaExpr} - ${rfExpr} - ${riExpr} - ${rcExpr})`;

    // 1. Agrupación por Modalidad (incluye quincena si existe)
    const modWhere = [...commonWhere];
    const modParams = [...commonParams];
    if (quincenaFiltro) {
      modWhere.push('mf.Quincena = ?');
      modParams.push(quincenaFiltro);
    }
    const whereSqlMod = modWhere.length ? `WHERE ${modWhere.join(' AND ')}` : '';
    const [modRows] = await pool.query(`
      SELECT 
        COALESCE(dr.Modalidad, 'SIN MODALIDAD') as modalidad,
        COUNT(DISTINCT dr.IdRecibo) as totalCount,
        ROUND(SUM(${subtotalExpr})) as sumSubtotal,
        ROUND(SUM(${totalExpr})) as sumTotal
      FROM Dynamic_Recibos dr
      LEFT JOIN Dynamic_Servicios ds ON ds.IdRecibo = dr.IdRecibo
      LEFT JOIN Maestro_Operaciones mo ON dr.\`Operación\` = mo.OPERACIÓN
      LEFT JOIN Maestro_Fechas mf ON mf.Fecha = DATE(dr.Fecha)
      ${whereSqlMod}
      GROUP BY dr.Modalidad
    `, modParams);

    // 2. Agrupaciones para desplegables (incluye quincena y modalidad)
    const dropdownWhere = [...commonWhere];
    const dropdownParams = [...commonParams];
    if (quincenaFiltro) {
      dropdownWhere.push('mf.Quincena = ?');
      dropdownParams.push(quincenaFiltro);
    }
    if (modalidad && modalidad !== 'todas') {
      dropdownWhere.push('dr.Modalidad = ?');
      dropdownParams.push(modalidad);
    }
    const whereSqlDropdowns = dropdownWhere.length ? `WHERE ${dropdownWhere.join(' AND ')}` : '';

    const [opsRows] = await pool.query(`
      SELECT 
        COALESCE(mo.REGIONAL, 'SIN REGIONAL') as regional,
        dr.\`Operación\` as operacion,
        COUNT(DISTINCT dr.IdRecibo) as totalCount,
        ROUND(SUM(${subtotalExpr})) as sumSubtotal,
        ROUND(SUM(${totalExpr})) as sumTotal
      FROM Dynamic_Recibos dr
      LEFT JOIN Dynamic_Servicios ds ON ds.IdRecibo = dr.IdRecibo
      LEFT JOIN Maestro_Operaciones mo ON dr.\`Operación\` = mo.OPERACIÓN
      LEFT JOIN Maestro_Fechas mf ON mf.Fecha = DATE(dr.Fecha)
      ${whereSqlDropdowns}
      GROUP BY mo.REGIONAL, dr.\`Operación\`
    `, dropdownParams);

    // Agrupación Meses & Quincenas (NO debe filtrar por mf.Quincena para mostrar todas las quincenas)
    const fechasWhere = [...commonWhere];
    const fechasParams = [...commonParams];
    if (modalidad && modalidad !== 'todas') {
      fechasWhere.push('dr.Modalidad = ?');
      fechasParams.push(modalidad);
    }
    const whereSqlFechas = fechasWhere.length ? `WHERE ${fechasWhere.join(' AND ')}` : '';

    const [fechasRows] = await pool.query(`
      SELECT 
        MONTH(dr.Fecha) as mes,
        mf.Quincena as quincena,
        COUNT(DISTINCT dr.IdRecibo) as totalCount,
        ROUND(SUM(${subtotalExpr})) as sumSubtotal,
        ROUND(SUM(${totalExpr})) as sumTotal
      FROM Dynamic_Recibos dr
      LEFT JOIN Dynamic_Servicios ds ON ds.IdRecibo = dr.IdRecibo
      LEFT JOIN Maestro_Operaciones mo ON dr.\`Operación\` = mo.OPERACIÓN
      LEFT JOIN Maestro_Fechas mf ON mf.Fecha = DATE(dr.Fecha)
      ${whereSqlFechas}
      GROUP BY MONTH(dr.Fecha), mf.Quincena
    `, fechasParams);

    const [cliRows] = await pool.query(`
      SELECT 
        dr.\`Cliente a Facturar\` as cliente,
        COUNT(DISTINCT dr.IdRecibo) as totalCount,
        ROUND(SUM(${subtotalExpr})) as sumSubtotal,
        ROUND(SUM(${totalExpr})) as sumTotal
      FROM Dynamic_Recibos dr
      LEFT JOIN Dynamic_Servicios ds ON ds.IdRecibo = dr.IdRecibo
      LEFT JOIN Maestro_Operaciones mo ON dr.\`Operación\` = mo.OPERACIÓN
      LEFT JOIN Maestro_Fechas mf ON mf.Fecha = DATE(dr.Fecha)
      ${whereSqlDropdowns} AND dr.\`Cliente a Facturar\` IS NOT NULL AND dr.\`Cliente a Facturar\` != ''
      GROUP BY dr.\`Cliente a Facturar\`
      ORDER BY dr.\`Cliente a Facturar\` ASC
    `, dropdownParams);

    const [userRows] = await pool.query(`
      SELECT 
        dr.Usuario as usuario,
        COUNT(DISTINCT dr.IdRecibo) as totalCount,
        ROUND(SUM(${subtotalExpr})) as sumSubtotal,
        ROUND(SUM(${totalExpr})) as sumTotal
      FROM Dynamic_Recibos dr
      LEFT JOIN Dynamic_Servicios ds ON ds.IdRecibo = dr.IdRecibo
      LEFT JOIN Maestro_Operaciones mo ON dr.\`Operación\` = mo.OPERACIÓN
      LEFT JOIN Maestro_Fechas mf ON mf.Fecha = DATE(dr.Fecha)
      ${whereSqlDropdowns} AND dr.Usuario IS NOT NULL AND dr.Usuario != ''
      GROUP BY dr.Usuario
      ORDER BY totalCount DESC
      LIMIT 100
    `, dropdownParams);

    res.json({
      modalidades: modRows,
      regionalesOps: opsRows,
      fechas: fechasRows,
      clientes: cliRows,
      usuarios: userRows
    });
  } catch (err) {
    console.error('[facturacion] GET /api/recibos/metricas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/recibos/:idRecibo ───────────────────────────────────────────────
router.get('/api/recibos/:idRecibo', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { idRecibo } = req.params;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!idRecibo) return res.status(400).json({ error: 'idRecibo requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Recibos') 
                || await computarAccesoFacturacion(usuario, 'Servicios');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [reciboRows] = await pool.query(`
      SELECT 
        dr.*,
        mo.REGIONAL as regionalNombre,
        mc.\`Razón social\` as razonSocial,
        ccs.Categoria as categoriaNombre
      FROM Dynamic_Recibos dr
      LEFT JOIN Maestro_Operaciones mo ON mo.OPERACIÓN = dr.\`Operación\`
      LEFT JOIN Maestro_Clientes mc ON mc.\`Código\` = dr.Nit
      LEFT JOIN Config_Categoria_Serv ccs ON ccs.Id = dr.Categoria
      WHERE dr.IdRecibo = ?
      LIMIT 1
    `, [idRecibo]);

    if (!reciboRows.length) {
      return res.status(404).json({ error: 'Recibo no encontrado' });
    }

    const recibo = reciboRows[0];

    if (!acceso.sinFiltro && acceso.operacionesFiltro && !acceso.operacionesFiltro.includes(recibo['Operación'])) {
      return res.status(403).json({ error: 'No autorizado para ver este recibo' });
    }

    const [servicios] = await pool.query(`
      SELECT 
        s.*,
        ca.Actividad as actividadNombre,
        mp.Placa as placaNombre,
        mt.Transportadora as transportadoraNombre
      FROM Dynamic_Servicios s
      LEFT JOIN Config_Actividad ca ON s.Actividad = ca.ID
      LEFT JOIN Maestro_Placas mp ON s.PL1 = mp.ID
      LEFT JOIN Maestro_Transportadora mt ON s.Transportadora = mt.ID
      WHERE s.IdRecibo = ?
      ORDER BY s.\`Hora Inicio\` ASC, s.IdServicio ASC
    `, [idRecibo]);

    const impuestos = await getImpuestos();
    let subtotalTotal = 0;
    let ivaTotal = 0;
    let rfTotal = 0;
    let riTotal = 0;
    let rcTotal = 0;

    const serviciosCalculados = servicios.map(s => {
      const calc = calcularTotalesServicio({
        cantidad: s.Cantidad,
        valorUnitario: s['Valor Unitario'],
        retefuente: recibo.Retefuente,
        reteIVA: recibo.ReteIVA,
        reteICA: recibo.ReteICA,
        operacion: recibo['Operación']
      }, impuestos);

      subtotalTotal += calc.valorBase;
      ivaTotal += calc.iva;
      rfTotal += calc.valorReteFuente;
      riTotal += calc.valorReteIVA;
      rcTotal += calc.valorReteICA;

      return {
        ...s,
        ...calc
      };
    });

    const granTotal = subtotalTotal + ivaTotal - rfTotal - riTotal - rcTotal;

    res.json({
      recibo,
      servicios: serviciosCalculados,
      totales: {
        subtotal: subtotalTotal,
        iva: ivaTotal,
        retefuente: rfTotal,
        reteiva: riTotal,
        reteica: rcTotal,
        total: granTotal
      }
    });
  } catch (err) {
    console.error('[facturacion] GET /api/recibos/:idRecibo:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
