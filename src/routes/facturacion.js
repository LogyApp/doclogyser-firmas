const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../services/db');
const { computarAccesoFacturacion } = require('../services/accesoFacturacion');
const { subirFotoServicio } = require('../services/storage');
const { obtenerTipoDocumentoConfig, registrarDocGeneral } = require('../services/documentRegistry');

const uploadServicio = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Solo estos roles pueden crear/editar/bloquear Clientes Crédito (otros roles con acceso a la
// sección 'Clientes_credito' solo pueden consultar vía GET /api/clientes-credito).
const ROLES_GESTION_CLIENTES_CREDITO = ['Facturación', 'Sistema'];

const router = express.Router();
const FACTURACION_HTML = path.join(__dirname, '../views/facturacion/index.html');

// Replica AppSheet UNIQUEID("PackedUUID"): 16 bytes aleatorios en base64 URL-safe sin
// padding = 22 caracteres. Los datos reales de Dynamic_Recibos/Dynamic_Servicios ya usan
// este formato (ej. "AR3xh4Jk21BiEDqwS5Opa1"), así que los IDs nuevos deben seguir el mismo patrón.
function generarPackedUUID() {
  return crypto.randomBytes(16).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Maestro_Transportadora / Maestro_Proveedor / Maestro_Placas usan IDs de 8 caracteres hex
// (ej. "0001a736"), distinto del PackedUUID de 22 caracteres de Recibos/Servicios.
function generarId8Hex() {
  return crypto.randomBytes(4).toString('hex');
}

// Hora actual en Bogotá como string 'YYYY-MM-DD HH:MM:SS', sin depender del huso horario
// del proceso de Node (el servidor puede correr en cualquier TZ).
function formatearAhoraBogota() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

// Convierte el valor de un <input type="datetime-local"> ("YYYY-MM-DDTHH:MM[:SS]") al
// formato MySQL "YYYY-MM-DD HH:MM:SS". El valor ya representa hora de Bogotá (lo captura
// el navegador del usuario), así que no se hace ninguna conversión de huso horario.
function datetimeLocalToMySQL(value) {
  if (!value) return null;
  const normalized = String(value).replace('T', ' ');
  return normalized.length === 16 ? `${normalized}:00` : normalized;
}

// Aritmética de fechas "ingenua" (sin zona horaria) usando Date.UTC solo como motor de
// cálculo — es la forma correcta y profesional de sumar/restar horas sin los problemas de
// comparación de solo-hora que tenía la fórmula original de AppSheet, y maneja de forma
// natural los servicios que cruzan la medianoche siempre que Hora Inicio/Hora Final traigan
// la fecha correcta (si Hora Final es al día siguiente, su fecha ya lo refleja).
function mysqlDateTimeToMs(str) {
  const [datePart, timePart] = String(str).split(' ');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi, s] = (timePart || '00:00:00').split(':').map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s || 0);
}

function msToMysqlDateTime(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function mysqlTimeToMs(timeStr) {
  const [h, m, s] = String(timeStr).split(':').map(Number);
  return ((h * 60 + m) * 60 + (s || 0)) * 1000;
}

function msToHHMMSS(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

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
    const accesoTickets = await computarAccesoFacturacion(usuario, 'Tickets');

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
        tickets: resumenAcceso(accesoTickets),
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
    if (!ROLES_GESTION_CLIENTES_CREDITO.includes(acceso.rol)) {
      return res.status(403).json({ error: 'Solo los roles Facturación y Sistema pueden agregar clientes crédito' });
    }

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
    if (!ROLES_GESTION_CLIENTES_CREDITO.includes(acceso.rol)) {
      return res.status(403).json({ error: 'Solo los roles Facturación y Sistema pueden modificar el bloqueo' });
    }

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
      `SELECT \`Código\` as codigo, \`Razón social\` as razonSocial, Telefono as telefono,
              \`Correo F.E.\` as correoFE, \`Desc. condicion de pago\` as condicionPago,
              RTSERVIC as rtservic, RTIVA as rtiva, RTICA as rtica
       FROM Maestro_Clientes WHERE \`Código\` = ? LIMIT 1`,
      [cleanNit]
    );

    if (rows.length && rows[0].razonSocial) {
      return res.json({
        encontrado: true,
        codigo: rows[0].codigo,
        razonSocial: rows[0].razonSocial.trim(),
        telefono: rows[0].telefono || '',
        correoFE: rows[0].correoFE || '',
        condicionPago: rows[0].condicionPago || '',
        rtservic: rows[0].rtservic || '',
        rtiva: rows[0].rtiva || '',
        rtica: rows[0].rtica || ''
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
    if (!ROLES_GESTION_CLIENTES_CREDITO.includes(acceso.rol)) {
      return res.status(403).json({ error: 'Solo los roles Facturación y Sistema pueden editar clientes crédito' });
    }

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
    if (!ROLES_GESTION_CLIENTES_CREDITO.includes(acceso.rol)) {
      return res.status(403).json({ error: 'Solo los roles Facturación y Sistema pueden eliminar clientes crédito' });
    }

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
  const [rows] = await pool.query('SELECT Concepto, `Operación`, `Valor Base`, Porcentaje FROM Config_Impuestos');
  const iva = rows.find(r => r.Concepto === 'IVA')?.Porcentaje || 0.19;
  const reteFuente = rows.find(r => r.Concepto === 'ReteFuente')?.Porcentaje || 0.04;
  const reteIva = rows.find(r => r.Concepto === 'ReteIVA')?.Porcentaje || 0.15;
  const reteFuenteValorBase = Number(rows.find(r => r.Concepto === 'ReteFuente')?.['Valor Base']) || 0;
  const reteIvaValorBase = Number(rows.find(r => r.Concepto === 'ReteIVA')?.['Valor Base']) || 0;
  const reteIcaMap = {};
  const reteIcaValorBaseMap = {};
  rows.filter(r => r.Concepto === 'ReteICA' && r.Operación).forEach(r => {
    const key = r.Operación.trim().toLowerCase();
    reteIcaMap[key] = Number(r.Porcentaje);
    reteIcaValorBaseMap[key] = Number(r['Valor Base']) || 0;
  });
  cachedImpuestos = {
    iva, reteFuente, reteIva,
    reteFuenteValorBase, reteIvaValorBase,
    reteIcaMap, reteIcaValorBaseMap,
    raw: rows
  };
  lastImpuestosFetch = now;
  return cachedImpuestos;
}

// NITs con retención obligatoria de Fuente/IVA sin importar el Subtotal ni el flag del cliente
// (regla fija heredada de la fórmula AppSheet del campo Retefuente/ReteIVA de Recibos).
const NITS_RETENCION_OBLIGATORIA = [860350940, 890204199];

// Replica las fórmulas AppSheet de Retefuente/ReteIVA/ReteICA de Dynamic_Recibos.
// clienteFlags = { RTSERVIC, RTIVA, RTICA } (columnas de Maestro_Clientes para ese Nit).
function sugerirRetenciones({ nit, operacion, subtotal }, clienteFlags, impuestos) {
  const nitNum = nit ? Number(nit) : null;
  const esObligatorio = nitNum && NITS_RETENCION_OBLIGATORIA.includes(nitNum);
  const sub = Number(subtotal) || 0;
  const flags = clienteFlags || {};

  const retefuente = (esObligatorio || (flags.RTSERVIC === 'V' && sub > impuestos.reteFuenteValorBase)) ? 'V' : '';
  const reteiva = (esObligatorio || (flags.RTIVA === 'V' && sub > impuestos.reteIvaValorBase)) ? 'V' : '';

  const opKey = String(operacion || '').trim().toLowerCase();
  const tieneReteIcaOperacion = Object.prototype.hasOwnProperty.call(impuestos.reteIcaMap, opKey);
  let reteica = '';
  if (tieneReteIcaOperacion) {
    const valorBaseIca = impuestos.reteIcaValorBaseMap[opKey] || 0;
    reteica = (flags.RTICA === 'V' && sub > valorBaseIca) ? 'V' : '';
  }

  return { retefuente, reteiva, reteica };
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

// ── GET /api/recibos/sugerir-retenciones (Retefuente/ReteIVA/ReteICA sugeridos) ──
// IMPORTANTE: debe ir antes de GET /api/recibos/:idRecibo, si no Express la
// interpreta como idRecibo="sugerir-retenciones".
router.get('/api/recibos/sugerir-retenciones', async (req, res) => {
  try {
    const { usuario, nit, operacion, subtotal } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Recibos')
                || await computarAccesoFacturacion(usuario, 'Servicios');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    let clienteFlags = {};
    if (nit) {
      const [rows] = await pool.execute(
        'SELECT RTSERVIC as rtservic, RTIVA as rtiva, RTICA as rtica FROM Maestro_Clientes WHERE `Código` = ? LIMIT 1',
        [parseInt(nit, 10)]
      );
      if (rows.length) {
        clienteFlags = { RTSERVIC: rows[0].rtservic, RTIVA: rows[0].rtiva, RTICA: rows[0].rtica };
      }
    }

    const impuestos = await getImpuestos();
    const sugerencia = sugerirRetenciones(
      { nit: nit ? parseInt(nit, 10) : null, operacion, subtotal: subtotal || 0 },
      clienteFlags,
      impuestos
    );
    res.json(sugerencia);
  } catch (err) {
    console.error('[facturacion] GET /api/recibos/sugerir-retenciones:', err);
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
        mc.\`Buscar Cliente\` as buscarCliente,
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
        ar.AREA as areaNombre,
        mp.Placa as placaNombre,
        mt.Transportadora as transportadoraNombre,
        (SELECT GROUP_CONCAT(mprov.Proveedor ORDER BY FIND_IN_SET(mprov.ID, s.Proveedor) SEPARATOR ', ')
         FROM Maestro_Proveedor mprov WHERE FIND_IN_SET(mprov.ID, s.Proveedor)) as proveedorNombres
      FROM Dynamic_Servicios s
      LEFT JOIN Config_Actividad ca ON s.Actividad = ca.ID
      LEFT JOIN Config_Area ar ON s.Area = ar.ID
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

// ══════════════════════════════════════════════════════════════════════════════
// ── CRUD DE RECIBOS (Agregar / Editar / Eliminar) ─────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// Roles con permiso para editar libremente (sin el bloqueo por Estado=Green) y
// para tocar ReteIVA/ReteICA, replicando la regla de negocio definida por el usuario.
const ROLES_EDICION_LIBRE_RECIBOS = ['Facturación', 'Sistema'];

// Estado agregado del recibo según la validación de sus Servicios (Dynamic_Servicios.Validacion:
// Green=1, Yellow=2, resto=0), igual lógica que ya usa GET /api/recibos.
async function obtenerEstadoRecibo(idRecibo) {
  const [rows] = await pool.query(
    'SELECT MAX(Validacion) as maxValidacion FROM Dynamic_Servicios WHERE IdRecibo = ?',
    [idRecibo]
  );
  const maxVal = rows.length ? rows[0].maxValidacion : null;
  return maxVal === 2 ? 'Yellow' : maxVal === 1 ? 'Green' : 'Red';
}

async function obtenerSubtotalRecibo(idRecibo) {
  const [rows] = await pool.query(
    'SELECT SUM(COALESCE(Cantidad,0) * COALESCE(`Valor Unitario`,0)) as subtotal FROM Dynamic_Servicios WHERE IdRecibo = ?',
    [idRecibo]
  );
  return Number(rows[0] && rows[0].subtotal) || 0;
}

async function obtenerFlagsCliente(nit) {
  if (!nit) return {};
  const [rows] = await pool.execute(
    'SELECT RTSERVIC as rtservic, RTIVA as rtiva, RTICA as rtica FROM Maestro_Clientes WHERE `Código` = ? LIMIT 1',
    [nit]
  );
  if (!rows.length) return {};
  return { RTSERVIC: rows[0].rtservic, RTIVA: rows[0].rtiva, RTICA: rows[0].rtica };
}

// Determina los valores finales de Retefuente/ReteIVA/ReteICA a guardar:
// - Facturación/Sistema: si envían un valor explícito, se respeta (override manual);
//   si no lo envían, se usa el auto-calculado.
// - Los demás roles: siempre se recalcula automáticamente, sin importar lo que hayan enviado.
async function resolverRetenciones({ rolPrivilegiado, payload, nit, operacion, subtotal }) {
  const clienteFlags = await obtenerFlagsCliente(nit);
  const impuestos = await getImpuestos();
  const sugerido = sugerirRetenciones({ nit, operacion, subtotal }, clienteFlags, impuestos);

  const resolverCampo = (payloadVal, sugeridoVal) => {
    if (rolPrivilegiado && typeof payloadVal !== 'undefined') {
      return payloadVal === 'V' ? 'V' : null;
    }
    return sugeridoVal === 'V' ? 'V' : null;
  };

  return {
    retefuente: resolverCampo(payload.retefuente, sugerido.retefuente),
    reteiva: resolverCampo(payload.reteiva, sugerido.reteiva),
    reteica: resolverCampo(payload.reteica, sugerido.reteica)
  };
}

// ── GET /api/clientes/buscar (búsqueda libre por Razón Social o Nit/Código) ─────
router.get('/api/clientes/buscar', async (req, res) => {
  try {
    const { usuario, q } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Recibos')
                || await computarAccesoFacturacion(usuario, 'Servicios');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!q || !q.trim() || q.trim().length < 2) return res.json([]);

    const qLike = `%${q.trim()}%`;
    const [rows] = await pool.execute(
      `SELECT \`Código\` as codigo, \`Razón social\` as razonSocial, Telefono as telefono,
              \`Correo F.E.\` as correoFE, \`Desc. condicion de pago\` as condicionPago,
              RTSERVIC as rtservic, RTIVA as rtiva, RTICA as rtica
       FROM Maestro_Clientes
       WHERE \`Buscar Cliente\` LIKE ? OR \`Razón social\` LIKE ? OR CAST(\`Código\` AS CHAR) LIKE ?
       ORDER BY \`Razón social\` ASC
       LIMIT 20`,
      [qLike, qLike, qLike]
    );
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/clientes/buscar:', err);
    res.status(500).json([]);
  }
});

// ── GET /api/recibos/:idRecibo/clientes-sugeridos (clientes sugeridos por la ──
// ── placa del servicio más reciente del recibo) ──────────────────────────────
router.get('/api/recibos/:idRecibo/clientes-sugeridos', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { idRecibo } = req.params;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Recibos')
                || await computarAccesoFacturacion(usuario, 'Servicios');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [servRows] = await pool.execute(
      'SELECT PL1 FROM Dynamic_Servicios WHERE IdRecibo = ? AND PL1 IS NOT NULL ORDER BY `Hora Inicio` DESC, IdServicio DESC LIMIT 1',
      [idRecibo]
    );
    if (!servRows.length) return res.json([]);

    const [placaRows] = await pool.execute('SELECT Placa FROM Maestro_Placas WHERE ID = ? LIMIT 1', [servRows[0].PL1]);
    if (!placaRows.length || !placaRows[0].Placa) return res.json([]);

    const [clientesRows] = await pool.execute(
      `SELECT DISTINCT mp.Nit as nit, mc.\`Razón social\` as razonSocial
       FROM Maestro_Placas mp
       LEFT JOIN Maestro_Clientes mc ON mc.\`Código\` = mp.Nit
       WHERE mp.Placa = ? AND mp.Nit IS NOT NULL`,
      [placaRows[0].Placa]
    );
    res.json({ placa: placaRows[0].Placa, clientes: clientesRows });
  } catch (err) {
    console.error('[facturacion] GET /api/recibos/:idRecibo/clientes-sugeridos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/categorias (Config_Categoria_Serv filtrado por Cliente a Facturar + Operación) ──
router.get('/api/categorias', async (req, res) => {
  try {
    const { usuario, clienteAFacturar, operacion } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Recibos')
                || await computarAccesoFacturacion(usuario, 'Servicios');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!clienteAFacturar || !operacion) return res.json([]);

    const [rows] = await pool.execute(
      'SELECT Id as id, Categoria as categoria FROM Config_Categoria_Serv WHERE `CLIENTE A FACTURAR` = ? AND `Operación` = ? ORDER BY Categoria ASC',
      [clienteAFacturar, operacion]
    );
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/categorias:', err);
    res.status(500).json([]);
  }
});

// ── POST /api/recibos (Agregar Recibo) ─────────────────────────────────────────
// El Nit del cliente RECAUDO no se puede asignar al crear: solo se habilita una vez
// el recibo tiene servicios registrados (ver regla en PUT más abajo).
router.post('/api/recibos', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Recibos')
                || await computarAccesoFacturacion(usuario, 'Servicios');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    let {
      operacion, modalidad, clienteAFacturar, categoria,
      telefono, email, retefuente, reteiva, reteica, observaciones
    } = req.body;

    if (!operacion) return res.status(400).json({ error: 'La Operación es obligatoria.' });
    if (!acceso.sinFiltro && (!acceso.operacionesFiltro || !acceso.operacionesFiltro.includes(operacion))) {
      return res.status(403).json({ error: 'No autorizado para registrar recibos en esa Operación.' });
    }

    modalidad = (modalidad || '').toUpperCase();
    if (!['RECAUDO', 'CREDITO'].includes(modalidad)) {
      return res.status(400).json({ error: 'La Modalidad debe ser RECAUDO o CREDITO.' });
    }

    if (modalidad === 'CREDITO') {
      if (!clienteAFacturar) return res.status(400).json({ error: 'El Cliente a Facturar es obligatorio para Modalidad CREDITO.' });
      // Teléfono/Email solo aplican para RECAUDO.
      telefono = null;
      email = null;
    } else {
      clienteAFacturar = null;
      categoria = null;
    }

    const rolPrivilegiado = ROLES_EDICION_LIBRE_RECIBOS.includes(acceso.rol);
    const retenciones = await resolverRetenciones({
      rolPrivilegiado,
      payload: { retefuente, reteiva, reteica },
      nit: null, operacion, subtotal: 0
    });

    const idRecibo = generarPackedUUID();
    const usuarioVal = acceso.usuarioId || usuario;

    await pool.execute(
      `INSERT INTO Dynamic_Recibos
        (IdRecibo, \`Operación\`, Usuario, Fecha, \`Cliente a Facturar\`, Categoria, Nit, Telefono, Email,
         Retefuente, ReteIVA, ReteICA, Modalidad, Observaciones)
       VALUES (?, ?, ?, NOW(), ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      [
        idRecibo, operacion, usuarioVal, clienteAFacturar, categoria,
        (telefono || '').trim() || null, (email || '').trim() || null,
        retenciones.retefuente, retenciones.reteiva, retenciones.reteica, modalidad, (observaciones || '').trim() || null
      ]
    );

    res.json({ ok: true, idRecibo });
  } catch (err) {
    console.error('[facturacion] POST /api/recibos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/recibos/:idRecibo (Editar Recibo) ──────────────────────────────────
router.put('/api/recibos/:idRecibo', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { idRecibo } = req.params;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!idRecibo) return res.status(400).json({ error: 'idRecibo requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Recibos')
                || await computarAccesoFacturacion(usuario, 'Servicios');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [existRows] = await pool.execute('SELECT * FROM Dynamic_Recibos WHERE IdRecibo = ? LIMIT 1', [idRecibo]);
    if (!existRows.length) return res.status(404).json({ error: 'Recibo no encontrado' });
    const existente = existRows[0];

    if (!acceso.sinFiltro && acceso.operacionesFiltro && !acceso.operacionesFiltro.includes(existente['Operación'])) {
      return res.status(403).json({ error: 'No autorizado para editar este recibo' });
    }

    const rolPrivilegiado = ROLES_EDICION_LIBRE_RECIBOS.includes(acceso.rol);
    if (!rolPrivilegiado) {
      const estadoActual = await obtenerEstadoRecibo(idRecibo);
      if (estadoActual === 'Green') {
        return res.status(403).json({ error: 'Este recibo ya fue validado (verde) y no puede editarse.' });
      }
    }

    const body = req.body || {};

    let operacionFinal = existente['Operación'];
    if (typeof body.operacion !== 'undefined' && body.operacion) {
      if (!acceso.sinFiltro && (!acceso.operacionesFiltro || !acceso.operacionesFiltro.includes(body.operacion))) {
        return res.status(403).json({ error: 'No autorizado para mover el recibo a esa Operación.' });
      }
      operacionFinal = body.operacion;
    }

    let modalidadFinal = existente.Modalidad;
    if (typeof body.modalidad !== 'undefined' && body.modalidad) {
      modalidadFinal = body.modalidad.toUpperCase();
      if (!['RECAUDO', 'CREDITO'].includes(modalidadFinal)) {
        return res.status(400).json({ error: 'La Modalidad debe ser RECAUDO o CREDITO.' });
      }
    }

    let clienteAFacturarFinal = existente['Cliente a Facturar'];
    let categoriaFinal = existente.Categoria;
    let nitFinal = existente.Nit;

    if (modalidadFinal === 'CREDITO') {
      if (typeof body.clienteAFacturar !== 'undefined') clienteAFacturarFinal = body.clienteAFacturar || null;
      if (!clienteAFacturarFinal) return res.status(400).json({ error: 'El Cliente a Facturar es obligatorio para Modalidad CREDITO.' });
      if (typeof body.categoria !== 'undefined') categoriaFinal = body.categoria || null;
      nitFinal = null;
    } else {
      clienteAFacturarFinal = null;
      categoriaFinal = null;
      // El Nit solo es editable si el recibo ya tiene servicios registrados.
      if (typeof body.nit !== 'undefined') {
        const [cntRows] = await pool.execute('SELECT COUNT(*) as total FROM Dynamic_Servicios WHERE IdRecibo = ?', [idRecibo]);
        if (!cntRows[0].total) {
          return res.status(400).json({ error: 'No se puede asignar el cliente hasta que el recibo tenga servicios registrados.' });
        }
        nitFinal = body.nit ? parseInt(body.nit, 10) : null;
      }
    }

    // Teléfono/Email solo aplican para RECAUDO.
    const telefonoFinal = (modalidadFinal !== 'RECAUDO') ? null
      : (typeof body.telefono !== 'undefined') ? ((body.telefono || '').trim() || null) : existente.Telefono;
    const emailFinal = (modalidadFinal !== 'RECAUDO') ? null
      : (typeof body.email !== 'undefined') ? ((body.email || '').trim() || null) : existente.Email;
    const observacionesFinal = (typeof body.observaciones !== 'undefined') ? ((body.observaciones || '').trim() || null) : existente.Observaciones;

    const subtotalActual = (modalidadFinal === 'RECAUDO') ? await obtenerSubtotalRecibo(idRecibo) : 0;
    const retenciones = await resolverRetenciones({
      rolPrivilegiado,
      payload: { retefuente: body.retefuente, reteiva: body.reteiva, reteica: body.reteica },
      nit: nitFinal, operacion: operacionFinal, subtotal: subtotalActual
    });

    await pool.execute(
      `UPDATE Dynamic_Recibos SET
        \`Operación\` = ?, Modalidad = ?, \`Cliente a Facturar\` = ?, Categoria = ?, Nit = ?,
        Telefono = ?, Email = ?, Retefuente = ?, ReteIVA = ?, ReteICA = ?, Observaciones = ?
       WHERE IdRecibo = ?`,
      [
        operacionFinal, modalidadFinal, clienteAFacturarFinal, categoriaFinal, nitFinal,
        telefonoFinal, emailFinal, retenciones.retefuente, retenciones.reteiva, retenciones.reteica, observacionesFinal,
        idRecibo
      ]
    );

    res.json({ ok: true, idRecibo });
  } catch (err) {
    console.error('[facturacion] PUT /api/recibos/:idRecibo:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/recibos/:idRecibo (Eliminar Recibo — solo Rol Sistema) ─────────
// ⚠️ Dynamic_Servicios.IdRecibo tiene FK ON DELETE CASCADE: elimina también los
// servicios asociados a este recibo.
router.delete('/api/recibos/:idRecibo', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { idRecibo } = req.params;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Recibos')
                || await computarAccesoFacturacion(usuario, 'Servicios');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (acceso.rol !== 'Sistema') {
      return res.status(403).json({ error: 'Solo el rol Sistema puede eliminar recibos.' });
    }

    const [existRows] = await pool.execute(
      'SELECT `Operación` as operacionActual FROM Dynamic_Recibos WHERE IdRecibo = ? LIMIT 1',
      [idRecibo]
    );
    if (!existRows.length) return res.status(404).json({ error: 'Recibo no encontrado' });

    if (!acceso.sinFiltro && acceso.operacionesFiltro && !acceso.operacionesFiltro.includes(existRows[0].operacionActual)) {
      return res.status(403).json({ error: 'No autorizado para eliminar este recibo' });
    }

    await pool.execute('DELETE FROM Dynamic_Recibos WHERE IdRecibo = ?', [idRecibo]);
    res.json({ ok: true, idRecibo });
  } catch (err) {
    console.error('[facturacion] DELETE /api/recibos/:idRecibo:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── CRUD DE SERVICIOS (Dynamic_Servicios) ─────────────────────────────────────
// Solo se agregan/editan desde el Recibo al que corresponden.
// ══════════════════════════════════════════════════════════════════════════════

const ROLES_EDITAR_IDRECIBO_SERVICIO = ['Sistema', 'Facturación', 'Auxiliar', 'AuxiliarR', 'Coordinador', 'CoordinadorR'];
const TIPO_DOC_FOTO_DOCUMENTO = 90;
const TIPO_DOC_FOTO_EVIDENCIA = 91;
const TIPO_DOC_FOTO_TRANSFERENCIA = 92;

async function obtenerContextoRecibo(idRecibo) {
  const [rows] = await pool.execute(
    'SELECT `Operación` as operacion, Modalidad as modalidad, `Cliente a Facturar` as clienteAFacturar, Nit as nit FROM Dynamic_Recibos WHERE IdRecibo = ? LIMIT 1',
    [idRecibo]
  );
  return rows[0] || null;
}

async function obtenerRegionalDeOperacion(operacion) {
  if (!operacion) return null;
  const [rows] = await pool.execute('SELECT REGIONAL FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1', [operacion]);
  return rows.length ? rows[0].REGIONAL : null;
}

// Sube la foto a GCS (talenthub_central/general/{Prefijo}.{IdServicio}.ext) y registra el
// documento en Maestro_docEmpresa, según la regla exacta dada para Foto Documento/Evidencia/Transferencia.
async function procesarFotoServicio(file, tipoDocumentoId, idServicio, contextoRecibo, acceso) {
  if (!file) return null;
  const docConfig = await obtenerTipoDocumentoConfig(pool, tipoDocumentoId);
  const prefijo = (docConfig && docConfig.Prefijo) || 'DOC';
  const url = await subirFotoServicio(prefijo, idServicio, file.buffer, file.originalname, file.mimetype);
  const regional = await obtenerRegionalDeOperacion(contextoRecibo.operacion);

  await registrarDocGeneral(pool, {
    tipoDocumentoId,
    prefijo,
    regional,
    operacion: contextoRecibo.operacion,
    usuario: acceso.usuarioId || acceso.usuarioNombre,
    observaciones: `Servicio ${idServicio}`,
    url,
  });

  return url;
}

// Calcula Hora Final (si Duración != 'Otro', Hora Inicio + Tiempo de Config_Duración) y
// Total Hora (diferencia HH:MM:SS), con aritmética de fecha completa — maneja de forma
// natural los servicios que cruzan la medianoche.
async function calcularHorasServicio({ horaInicioRaw, duracion, horaFinalRaw }) {
  const horaInicioStr = horaInicioRaw ? datetimeLocalToMySQL(horaInicioRaw) : formatearAhoraBogota();
  let horaFinalStr;

  if (duracion && duracion !== 'Otro') {
    const [durRows] = await pool.execute('SELECT Tiempo FROM `Config_Duración` WHERE `Duración` = ? LIMIT 1', [duracion]);
    if (durRows.length && durRows[0].Tiempo) {
      const inicioMs = mysqlDateTimeToMs(horaInicioStr);
      horaFinalStr = msToMysqlDateTime(inicioMs + mysqlTimeToMs(durRows[0].Tiempo));
    } else {
      horaFinalStr = horaInicioStr;
    }
  } else {
    horaFinalStr = horaFinalRaw ? datetimeLocalToMySQL(horaFinalRaw) : formatearAhoraBogota();
  }

  const totalHora = msToHHMMSS(mysqlDateTimeToMs(horaFinalStr) - mysqlDateTimeToMs(horaInicioStr));
  return { horaInicioStr, horaFinalStr, totalHora };
}

// Estado solo puede pasar a 'Green' si Cantidad, Valor Unitario y Forma De Pago tienen valor,
// y si Forma De Pago = 2 (Transferencia) además se exige Foto Transferencia.
function puedeMarcarGreen({ cantidad, valorUnitario, formaDePago, fotoTransferenciaUrl }) {
  if (cantidad === null || cantidad === undefined) return false;
  if (valorUnitario === null || valorUnitario === undefined) return false;
  if (!formaDePago) return false;
  if (Number(formaDePago) === 2 && !fotoTransferenciaUrl) return false;
  return true;
}

// ── Listas de apoyo para el formulario de Servicio ──────────────────────────────

router.get('/api/config/areas', async (req, res) => {
  try {
    const { usuario, operacion } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Servicios') || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    if (!operacion) return res.json([]);

    const [rows] = await pool.execute(
      "SELECT ID as id, AREA as area FROM Config_Area WHERE `OPERACIÓN` = ? AND OPERATIVO = 'V' ORDER BY AREA ASC",
      [operacion]
    );
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/config/areas:', err);
    res.status(500).json([]);
  }
});

router.get('/api/config/actividades', async (req, res) => {
  try {
    const { usuario, operacion } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Servicios') || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    if (!operacion) return res.json([]);

    const [rows] = await pool.execute(
      'SELECT ID as id, Actividad as actividad FROM Config_Actividad WHERE `Operación` = ? ORDER BY Actividad ASC',
      [operacion]
    );
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/config/actividades:', err);
    res.status(500).json([]);
  }
});

router.get('/api/config/vehiculos', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Servicios') || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [rows] = await pool.execute('SELECT Vehiculo as vehiculo FROM Config_Vehiculo ORDER BY Vehiculo ASC');
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/config/vehiculos:', err);
    res.status(500).json([]);
  }
});

router.get('/api/config/unidades', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Servicios') || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [rows] = await pool.execute('SELECT Unidad as unidad FROM Config_Unidad ORDER BY Unidad ASC');
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/config/unidades:', err);
    res.status(500).json([]);
  }
});

router.get('/api/config/duraciones', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Servicios') || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [rows] = await pool.execute('SELECT `Duración` as duracion, Tiempo as tiempo FROM `Config_Duración` ORDER BY Tiempo ASC');
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/config/duraciones:', err);
    res.status(500).json([]);
  }
});

// ── Transportadora: búsqueda + creación rápida ("+ Nuevo") ─────────────────────

router.get('/api/transportadoras/buscar', async (req, res) => {
  try {
    const { usuario, q } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Servicios') || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const qLike = `%${(q || '').trim()}%`;
    const [rows] = await pool.execute(
      'SELECT ID as id, Transportadora as transportadora FROM Maestro_Transportadora WHERE Transportadora LIKE ? ORDER BY Transportadora ASC LIMIT 25',
      [qLike]
    );
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/transportadoras/buscar:', err);
    res.status(500).json([]);
  }
});

router.post('/api/transportadoras', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { transportadora } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Servicios') || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    if (!transportadora || !transportadora.trim()) return res.status(400).json({ error: 'El nombre de la Transportadora es obligatorio.' });

    const id = generarId8Hex();
    await pool.execute(
      'INSERT INTO Maestro_Transportadora (ID, Transportadora, Usuario, `Fecha Ingreso`) VALUES (?, ?, ?, ?)',
      [id, transportadora.trim(), acceso.usuarioId || usuario, formatearAhoraBogota()]
    );
    res.json({ ok: true, id, transportadora: transportadora.trim() });
  } catch (err) {
    console.error('[facturacion] POST /api/transportadoras:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Proveedor: búsqueda (multi) + creación rápida ───────────────────────────────

router.get('/api/proveedores/buscar', async (req, res) => {
  try {
    const { usuario, q } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Servicios') || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const qLike = `%${(q || '').trim()}%`;
    const [rows] = await pool.execute(
      'SELECT ID as id, Proveedor as proveedor FROM Maestro_Proveedor WHERE Proveedor LIKE ? ORDER BY Proveedor ASC LIMIT 25',
      [qLike]
    );
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/proveedores/buscar:', err);
    res.status(500).json([]);
  }
});

router.post('/api/proveedores', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { proveedor } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Servicios') || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    if (!proveedor || !proveedor.trim()) return res.status(400).json({ error: 'El nombre del Proveedor es obligatorio.' });

    const id = generarId8Hex();
    await pool.execute(
      'INSERT INTO Maestro_Proveedor (ID, Proveedor, Usuario, `Fecha Ingreso`) VALUES (?, ?, ?, ?)',
      [id, proveedor.trim(), acceso.usuarioId || usuario, formatearAhoraBogota()]
    );
    res.json({ ok: true, id, proveedor: proveedor.trim() });
  } catch (err) {
    console.error('[facturacion] POST /api/proveedores:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Placas (PL1): búsqueda + creación rápida con lógica de Tipo Cliente ─────────

router.get('/api/placas/buscar', async (req, res) => {
  try {
    const { usuario, q } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Servicios') || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const qLike = `%${(q || '').trim().toUpperCase()}%`;
    const [rows] = await pool.execute(
      `SELECT mp.ID as id, mp.Placa as placa, mp.\`Tipo Cliente\` as tipoCliente,
              mp.\`Cliente Credito\` as clienteCredito, mp.Nit as nit, mc.\`Razón social\` as razonSocial
       FROM Maestro_Placas mp
       LEFT JOIN Maestro_Clientes mc ON mc.\`Código\` = mp.Nit
       WHERE mp.Placa LIKE ?
       ORDER BY mp.Placa ASC, mp.\`Fecha Registro\` DESC
       LIMIT 30`,
      [qLike]
    );
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/placas/buscar:', err);
    res.status(500).json([]);
  }
});

// body: { placa, idRecibo, nit } — Tipo Cliente y Cliente Credito se derivan de la
// Modalidad/Cliente a Facturar del Recibo indicado (regla exacta dada por el usuario).
router.post('/api/placas', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { placa, idRecibo, nit } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Servicios') || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    if (!placa || !placa.trim()) return res.status(400).json({ error: 'La Placa es obligatoria.' });
    if (!idRecibo) return res.status(400).json({ error: 'idRecibo requerido' });

    const contexto = await obtenerContextoRecibo(idRecibo);
    if (!contexto) return res.status(404).json({ error: 'Recibo no encontrado' });

    const tipoCliente = (contexto.modalidad === 'CREDITO') ? 'CREDITO' : 'CONTADO';
    const clienteCredito = (tipoCliente === 'CREDITO') ? contexto.clienteAFacturar : null;
    const nitVal = (tipoCliente === 'CONTADO' && nit) ? parseInt(nit, 10) : null;

    const id = generarId8Hex();
    await pool.execute(
      'INSERT INTO Maestro_Placas (ID, Placa, `Tipo Cliente`, `Cliente Credito`, Nit, Usuario, `Fecha Registro`) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, placa.trim().toUpperCase(), tipoCliente, clienteCredito, nitVal, acceso.usuarioId || usuario, formatearAhoraBogota()]
    );
    res.json({ ok: true, id, placa: placa.trim().toUpperCase(), tipoCliente, clienteCredito, nit: nitVal });
  } catch (err) {
    console.error('[facturacion] POST /api/placas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Auxiliares: búsqueda de trabajadores activos de la Operación del recibo ─────

router.get('/api/auxiliares/buscar', async (req, res) => {
  try {
    const { usuario, operacion, q } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Servicios') || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    if (!operacion) return res.json([]);

    const qLike = `%${(q || '').trim()}%`;
    const [rows] = await pool.execute(
      "SELECT DISTINCT Trabajador as trabajador FROM `Maestro_Vinculación` WHERE Estado = 'Activo' AND `Operación` = ? AND Trabajador LIKE ? ORDER BY Trabajador ASC LIMIT 30",
      [operacion, qLike]
    );
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/auxiliares/buscar:', err);
    res.status(500).json([]);
  }
});

// ── POST /api/recibos/:idRecibo/servicios (Agregar Servicio) ───────────────────
router.post('/api/recibos/:idRecibo/servicios', uploadServicio.fields([
  { name: 'fotoDocumento', maxCount: 1 },
  { name: 'fotoEvidencia', maxCount: 1 },
  { name: 'fotoTransferencia', maxCount: 1 }
]), async (req, res) => {
  try {
    const { usuario } = req.query;
    const { idRecibo } = req.params;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Servicios') || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const contexto = await obtenerContextoRecibo(idRecibo);
    if (!contexto) return res.status(404).json({ error: 'Recibo no encontrado' });

    if (!acceso.sinFiltro && acceso.operacionesFiltro && !acceso.operacionesFiltro.includes(contexto.operacion)) {
      return res.status(403).json({ error: 'No autorizado para agregar servicios en este recibo' });
    }

    const rolPrivilegiado = ROLES_EDICION_LIBRE_RECIBOS.includes(acceso.rol);
    if (!rolPrivilegiado) {
      const estadoRecibo = await obtenerEstadoRecibo(idRecibo);
      if (estadoRecibo === 'Green') {
        return res.status(403).json({ error: 'Este recibo ya fue validado (verde); no se pueden agregar más servicios.' });
      }
    }

    const body = req.body || {};
    const files = req.files || {};
    const idServicio = generarPackedUUID();

    const cantidad = (body.cantidad !== undefined && body.cantidad !== '') ? Math.round(parseFloat(body.cantidad) * 1000) / 1000 : null;
    const valorUnitario = (body.valorUnitario !== undefined && body.valorUnitario !== '') ? Math.round(parseFloat(body.valorUnitario) * 1000) / 1000 : null;
    if (cantidad !== null && valorUnitario !== null && (cantidad * valorUnitario) > 3000000) {
      return res.status(400).json({ error: 'El Valor Base (Cantidad x Valor Unitario) no puede superar $3.000.000.' });
    }

    let formaDePago;
    if (contexto.modalidad === 'CREDITO') {
      formaDePago = 3;
    } else {
      formaDePago = (body.formaDePago !== undefined && body.formaDePago !== '') ? parseInt(body.formaDePago, 10) : null;
      if (formaDePago !== null && ![1, 2].includes(formaDePago)) {
        return res.status(400).json({ error: 'Forma de Pago inválida para RECAUDO (debe ser 1=Efectivo o 2=Transferencia).' });
      }
    }

    const fotoDocumentoUrl = await procesarFotoServicio(files.fotoDocumento?.[0], TIPO_DOC_FOTO_DOCUMENTO, idServicio, contexto, acceso);
    const fotoEvidenciaUrl = await procesarFotoServicio(files.fotoEvidencia?.[0], TIPO_DOC_FOTO_EVIDENCIA, idServicio, contexto, acceso);
    const fotoTransferenciaUrl = (formaDePago === 2)
      ? await procesarFotoServicio(files.fotoTransferencia?.[0], TIPO_DOC_FOTO_TRANSFERENCIA, idServicio, contexto, acceso)
      : null;

    let estado = (body.estado || 'Yellow');
    if (!['Green', 'Yellow', 'Red'].includes(estado)) estado = 'Yellow';
    if (estado === 'Green' && !puedeMarcarGreen({ cantidad, valorUnitario, formaDePago, fotoTransferenciaUrl })) {
      return res.status(400).json({ error: 'Para marcar el servicio en Verde debe tener Cantidad, Valor Unitario y Forma de Pago; si la Forma de Pago es Transferencia, también la Foto de Transferencia.' });
    }
    const edicion = (estado === 'Green') ? 'Completado' : 'Pendiente';

    const { horaInicioStr, horaFinalStr, totalHora } = await calcularHorasServicio({
      horaInicioRaw: body.horaInicio,
      duracion: body.duracion,
      horaFinalRaw: body.horaFinal
    });

    const manifiesto = (contexto.modalidad === 'CREDITO') ? ((body.manifiesto || '').trim() || null) : null;
    const telefonoServicio = (contexto.modalidad === 'CREDITO') ? ((body.telefono || '').trim() || null) : null;
    const fechaTransferencia = (formaDePago === 2)
      ? (body.fechaTransferencia ? datetimeLocalToMySQL(body.fechaTransferencia) : formatearAhoraBogota())
      : null;

    await pool.execute(
      `INSERT INTO Dynamic_Servicios (
        IdServicio, IdRecibo, Estado, Usuario, Area, Fecha, Transportadora, Proveedor, Actividad,
        Vehiculo, Remolque, PL1, Unidad, Cantidad, \`Valor Unitario\`, Origen, Destino, Manifiesto,
        \`Foto Documento\`, Etapa, Muelle, \`Hora Inicio\`, \`Hora Final\`, \`Duración\`, \`Total Hora\`,
        \`Grupo Dtjo\`, Auxiliares, Notas, \`Foto Evidencia\`, \`Forma De Pago\`, \`Foto Transferencia\`,
        \`Fecha Transferencia\`, Observaciones, Telefono, \`Edición\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        idServicio, idRecibo, estado, acceso.usuarioId || usuario,
        body.area ? parseInt(body.area, 10) : null,
        formatearAhoraBogota(),
        body.transportadora || null,
        body.proveedor || null,
        body.actividad ? parseInt(body.actividad, 10) : null,
        body.vehiculo || null,
        (body.remolque || '').trim() || null,
        body.pl1 || null,
        body.unidad || null,
        cantidad, valorUnitario,
        (body.origen || '').trim() || null,
        (body.destino || '').trim() || null,
        manifiesto,
        fotoDocumentoUrl,
        (body.etapa || '').trim() || null,
        (body.muelle || '').trim() || null,
        horaInicioStr, horaFinalStr, body.duracion || null, totalHora,
        body.grupoDtjo || 'GRUPAL',
        (body.auxiliares || '').trim() || null,
        (body.notas || '').trim() || null,
        fotoEvidenciaUrl,
        formaDePago,
        fotoTransferenciaUrl,
        fechaTransferencia,
        (body.observaciones || '').trim() || null,
        telefonoServicio,
        edicion
      ]
    );

    res.json({ ok: true, idServicio });
  } catch (err) {
    console.error('[facturacion] POST /api/recibos/:idRecibo/servicios:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/servicios/:idServicio (Editar Servicio) ────────────────────────────
router.put('/api/servicios/:idServicio', uploadServicio.fields([
  { name: 'fotoDocumento', maxCount: 1 },
  { name: 'fotoEvidencia', maxCount: 1 },
  { name: 'fotoTransferencia', maxCount: 1 }
]), async (req, res) => {
  try {
    const { usuario } = req.query;
    const { idServicio } = req.params;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Servicios') || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [existRows] = await pool.execute('SELECT * FROM Dynamic_Servicios WHERE IdServicio = ? LIMIT 1', [idServicio]);
    if (!existRows.length) return res.status(404).json({ error: 'Servicio no encontrado' });
    const existente = existRows[0];

    let contexto = await obtenerContextoRecibo(existente.IdRecibo);
    if (!contexto) return res.status(404).json({ error: 'Recibo del servicio no encontrado' });

    if (!acceso.sinFiltro && acceso.operacionesFiltro && !acceso.operacionesFiltro.includes(contexto.operacion)) {
      return res.status(403).json({ error: 'No autorizado para editar este servicio' });
    }

    const rolPrivilegiado = ROLES_EDICION_LIBRE_RECIBOS.includes(acceso.rol);
    if (!rolPrivilegiado) {
      const estadoRecibo = await obtenerEstadoRecibo(existente.IdRecibo);
      if (estadoRecibo === 'Green') {
        return res.status(403).json({ error: 'Este recibo ya fue validado (verde) y no puede editarse.' });
      }
    }

    const body = req.body || {};
    const files = req.files || {};

    // Reasignar a otro Recibo: solo roles autorizados.
    let idReciboFinal = existente.IdRecibo;
    if (typeof body.idRecibo !== 'undefined' && body.idRecibo && body.idRecibo !== existente.IdRecibo) {
      if (!ROLES_EDITAR_IDRECIBO_SERVICIO.includes(acceso.rol)) {
        return res.status(403).json({ error: 'No tiene permiso para reasignar este servicio a otro recibo.' });
      }
      const nuevoContexto = await obtenerContextoRecibo(body.idRecibo);
      if (!nuevoContexto) return res.status(400).json({ error: 'El Recibo destino no existe.' });
      if (!acceso.sinFiltro && acceso.operacionesFiltro && !acceso.operacionesFiltro.includes(nuevoContexto.operacion)) {
        return res.status(403).json({ error: 'No autorizado para mover el servicio a ese Recibo.' });
      }
      idReciboFinal = body.idRecibo;
      contexto = nuevoContexto;
    }

    const cantidad = (typeof body.cantidad !== 'undefined')
      ? ((body.cantidad !== '') ? Math.round(parseFloat(body.cantidad) * 1000) / 1000 : null)
      : existente.Cantidad;
    const valorUnitario = (typeof body.valorUnitario !== 'undefined')
      ? ((body.valorUnitario !== '') ? Math.round(parseFloat(body.valorUnitario) * 1000) / 1000 : null)
      : existente['Valor Unitario'];
    if (cantidad !== null && valorUnitario !== null && (cantidad * valorUnitario) > 3000000) {
      return res.status(400).json({ error: 'El Valor Base (Cantidad x Valor Unitario) no puede superar $3.000.000.' });
    }

    let formaDePago;
    if (contexto.modalidad === 'CREDITO') {
      formaDePago = 3;
    } else if (typeof body.formaDePago !== 'undefined') {
      formaDePago = (body.formaDePago !== '') ? parseInt(body.formaDePago, 10) : null;
      if (formaDePago !== null && ![1, 2].includes(formaDePago)) {
        return res.status(400).json({ error: 'Forma de Pago inválida para RECAUDO (debe ser 1=Efectivo o 2=Transferencia).' });
      }
    } else {
      formaDePago = existente['Forma De Pago'];
    }

    const fotoDocumentoUrl = files.fotoDocumento?.[0]
      ? await procesarFotoServicio(files.fotoDocumento[0], TIPO_DOC_FOTO_DOCUMENTO, idServicio, contexto, acceso)
      : existente['Foto Documento'];
    const fotoEvidenciaUrl = files.fotoEvidencia?.[0]
      ? await procesarFotoServicio(files.fotoEvidencia[0], TIPO_DOC_FOTO_EVIDENCIA, idServicio, contexto, acceso)
      : existente['Foto Evidencia'];
    let fotoTransferenciaUrl = existente['Foto Transferencia'];
    if (formaDePago === 2 && files.fotoTransferencia?.[0]) {
      fotoTransferenciaUrl = await procesarFotoServicio(files.fotoTransferencia[0], TIPO_DOC_FOTO_TRANSFERENCIA, idServicio, contexto, acceso);
    } else if (formaDePago !== 2) {
      fotoTransferenciaUrl = null;
    }

    let estado = (typeof body.estado !== 'undefined') ? body.estado : existente.Estado;
    if (!['Green', 'Yellow', 'Red'].includes(estado)) estado = 'Yellow';
    if (estado === 'Green' && !puedeMarcarGreen({ cantidad, valorUnitario, formaDePago, fotoTransferenciaUrl })) {
      return res.status(400).json({ error: 'Para marcar el servicio en Verde debe tener Cantidad, Valor Unitario y Forma de Pago; si la Forma de Pago es Transferencia, también la Foto de Transferencia.' });
    }
    const edicion = (estado === 'Green') ? 'Completado' : 'Pendiente';

    const horaInicioRaw = (typeof body.horaInicio !== 'undefined') ? body.horaInicio : null;
    const horaFinalRaw = (typeof body.horaFinal !== 'undefined') ? body.horaFinal : null;
    const duracion = (typeof body.duracion !== 'undefined') ? body.duracion : existente['Duración'];
    let horaInicioStr = existente['Hora Inicio'];
    let horaFinalStr = existente['Hora Final'];
    let totalHora = existente['Total Hora'];
    if (typeof body.horaInicio !== 'undefined' || typeof body.duracion !== 'undefined' || typeof body.horaFinal !== 'undefined') {
      const calc = await calcularHorasServicio({
        horaInicioRaw: horaInicioRaw || (existente['Hora Inicio'] ? String(existente['Hora Inicio']).slice(0, 16).replace(' ', 'T') : null),
        duracion,
        horaFinalRaw: horaFinalRaw || (existente['Hora Final'] ? String(existente['Hora Final']).slice(0, 16).replace(' ', 'T') : null)
      });
      horaInicioStr = calc.horaInicioStr;
      horaFinalStr = calc.horaFinalStr;
      totalHora = calc.totalHora;
    }

    const manifiesto = (contexto.modalidad === 'CREDITO')
      ? ((typeof body.manifiesto !== 'undefined') ? ((body.manifiesto || '').trim() || null) : existente.Manifiesto)
      : null;
    const telefonoServicio = (contexto.modalidad === 'CREDITO')
      ? ((typeof body.telefono !== 'undefined') ? ((body.telefono || '').trim() || null) : existente.Telefono)
      : null;
    const fechaTransferencia = (formaDePago === 2)
      ? ((typeof body.fechaTransferencia !== 'undefined' && body.fechaTransferencia) ? datetimeLocalToMySQL(body.fechaTransferencia) : (existente['Fecha Transferencia'] || formatearAhoraBogota()))
      : null;

    // IMPORTANTE: `existente` trae las columnas con el nombre EXACTO de MySQL (ej. "Grupo Dtjo",
    // "Valor Unitario"), no el nombre camelCase del body — el segundo argumento debe ser ese
    // nombre real de columna, nunca el mismo que bodyKey.
    const campo = (bodyKey, dbKey, transform) => (typeof body[bodyKey] !== 'undefined') ? transform(body[bodyKey]) : existente[dbKey];

    await pool.execute(
      `UPDATE Dynamic_Servicios SET
        IdRecibo = ?, Estado = ?, Area = ?, Transportadora = ?, Proveedor = ?, Actividad = ?,
        Vehiculo = ?, Remolque = ?, PL1 = ?, Unidad = ?, Cantidad = ?, \`Valor Unitario\` = ?,
        Origen = ?, Destino = ?, Manifiesto = ?, \`Foto Documento\` = ?, Etapa = ?, Muelle = ?,
        \`Hora Inicio\` = ?, \`Hora Final\` = ?, \`Duración\` = ?, \`Total Hora\` = ?, \`Grupo Dtjo\` = ?,
        Auxiliares = ?, Notas = ?, \`Foto Evidencia\` = ?, \`Forma De Pago\` = ?, \`Foto Transferencia\` = ?,
        \`Fecha Transferencia\` = ?, Observaciones = ?, Telefono = ?, \`Edición\` = ?
      WHERE IdServicio = ?`,
      [
        idReciboFinal, estado,
        campo('area', 'Area', (v) => v ? parseInt(v, 10) : null),
        campo('transportadora', 'Transportadora', (v) => v || null),
        campo('proveedor', 'Proveedor', (v) => v || null),
        campo('actividad', 'Actividad', (v) => v ? parseInt(v, 10) : null),
        campo('vehiculo', 'Vehiculo', (v) => v || null),
        campo('remolque', 'Remolque', (v) => (v || '').trim() || null),
        campo('pl1', 'PL1', (v) => v || null),
        campo('unidad', 'Unidad', (v) => v || null),
        cantidad, valorUnitario,
        campo('origen', 'Origen', (v) => (v || '').trim() || null),
        campo('destino', 'Destino', (v) => (v || '').trim() || null),
        manifiesto,
        fotoDocumentoUrl,
        campo('etapa', 'Etapa', (v) => (v || '').trim() || null),
        campo('muelle', 'Muelle', (v) => (v || '').trim() || null),
        horaInicioStr, horaFinalStr, duracion || null, totalHora,
        campo('grupoDtjo', 'Grupo Dtjo', (v) => v || 'GRUPAL'),
        campo('auxiliares', 'Auxiliares', (v) => (v || '').trim() || null),
        campo('notas', 'Notas', (v) => (v || '').trim() || null),
        fotoEvidenciaUrl,
        formaDePago,
        fotoTransferenciaUrl,
        fechaTransferencia,
        campo('observaciones', 'Observaciones', (v) => (v || '').trim() || null),
        telefonoServicio,
        edicion,
        idServicio
      ]
    );

    res.json({ ok: true, idServicio });
  } catch (err) {
    console.error('[facturacion] PUT /api/servicios/:idServicio:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/servicios/:idServicio (solo Rol Sistema) ────────────────────────
router.delete('/api/servicios/:idServicio', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { idServicio } = req.params;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Servicios') || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    if (acceso.rol !== 'Sistema') return res.status(403).json({ error: 'Solo el rol Sistema puede eliminar servicios.' });

    const [existRows] = await pool.execute('SELECT IdRecibo FROM Dynamic_Servicios WHERE IdServicio = ? LIMIT 1', [idServicio]);
    if (!existRows.length) return res.status(404).json({ error: 'Servicio no encontrado' });

    const contexto = await obtenerContextoRecibo(existRows[0].IdRecibo);
    if (contexto && !acceso.sinFiltro && acceso.operacionesFiltro && !acceso.operacionesFiltro.includes(contexto.operacion)) {
      return res.status(403).json({ error: 'No autorizado para eliminar este servicio' });
    }

    await pool.execute('DELETE FROM Dynamic_Servicios WHERE IdServicio = ?', [idServicio]);
    res.json({ ok: true, idServicio });
  } catch (err) {
    console.error('[facturacion] DELETE /api/servicios/:idServicio:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── SECCIÓN TICKETS (Dynamic_Tickets) ─────────────────────────────────────────
// Solo se muestran los tickets donde modulo = 'Servicios'
// ══════════════════════════════════════════════════════════════════════════════

const ESTADOS_TICKET_VALIDOS = ['En Proceso', 'Pendiente', 'Resuelto', 'Rechazado'];

// Botón "+ Ticket": widget compartido entre módulos (public/js/ticket-boton.js),
// backend genérico en src/routes/tickets.js (POST /tickets/api/crear, etc.).
// El único endpoint que sigue viviendo aquí es este: la lista de recibos
// recientes es del dominio de Servicios/Facturación (Dynamic_Recibos), así
// que el widget lo llama aparte solo cuando el Módulo elegido es "Servicios".
//
// ── GET /api/tickets/recibos-recientes (selector manual cuando no hay Recibo/Servicio abierto) ──
router.get('/api/tickets/recibos-recientes', async (req, res) => {
  try {
    const { usuario, operacion } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!operacion) return res.status(400).json({ error: 'operacion requerida' });

    const acceso = await computarAccesoFacturacion(usuario, 'Servicios');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    if (!acceso.sinFiltro && !(acceso.operacionesFiltro || []).includes(operacion)) {
      return res.status(403).json({ error: 'No autorizado para esta operación' });
    }

    const [rows] = await pool.execute(
      `SELECT IdRecibo as idRecibo, \`Consecutivo Recibo\` as consecutivo
       FROM Dynamic_Recibos
       WHERE Operación = ? AND Fecha >= (NOW() - INTERVAL 30 DAY)
       ORDER BY Fecha DESC
       LIMIT 300`,
      [operacion]
    );
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/tickets/recibos-recientes:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tickets ──────────────────────────────────────────────────────────
router.get('/api/tickets', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Tickets');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const {
      estado,
      regional,
      operacion,
      q,
      sortCol,
      sortDir,
      limit = 500,
      offset = 0
    } = req.query;

    const whereClauses = [`t.modulo = 'Servicios'`];
    const params = [];

    // Scope por rol
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro || !acceso.operacionesFiltro.length) {
        return res.json({ total: 0, rows: [] });
      }
      whereClauses.push(`t.\`Operación\` IN (${acceso.operacionesFiltro.map(() => '?').join(',')})`);
      params.push(...acceso.operacionesFiltro);
    }

    // Estado (default: En Proceso)
    const estadoFiltro = (typeof estado === 'undefined' || estado === null || estado === '') ? 'En Proceso' : estado;
    if (estadoFiltro !== 'todos') {
      whereClauses.push('t.Estado = ?');
      params.push(estadoFiltro);
    }

    // Regional
    if (regional && regional !== 'todas') {
      whereClauses.push('mo.REGIONAL = ?');
      params.push(regional);
    }

    // Operación
    if (operacion && operacion !== 'todas') {
      whereClauses.push('t.`Operación` = ?');
      params.push(operacion);
    }

    // Búsqueda libre: Ticket, IdRecibo, Usuario (solicitante)
    if (q && q.trim()) {
      const qLike = `%${q.trim()}%`;
      whereClauses.push(`(
        t.Ticket LIKE ?
        OR t.idrecibo LIKE ?
        OR t.solicitante LIKE ?
      )`);
      params.push(qLike, qLike, qLike);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sortMap = {
      estado: 't.Estado',
      ticket: 't.Ticket',
      operacion: 't.`Operación`',
      fecha_registro: 't.fecha_registro',
      motivo: 't.motivo',
      idrecibo: 't.idrecibo',
      solicitante: 't.solicitante',
      fecha_finalizacion: 't.fecha_finalizacion'
    };

    const orderCol = sortMap[sortCol] || 't.fecha_registro';
    const orderDir = (String(sortDir || '').toUpperCase() === 'ASC') ? 'ASC' : 'DESC';
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 1000);
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

    const [rows] = await pool.query(`
      SELECT
        t.Ticket as ticket,
        t.fecha_registro as fechaRegistro,
        t.\`Operación\` as operacion,
        t.solicitante as solicitante,
        t.modulo as modulo,
        t.motivo as motivo,
        t.idrecibo as idrecibo,
        t.descripcion as descripcion,
        t.Evidencia as evidencia,
        t.telefono as telefono,
        t.Estado as estado,
        t.Observaciones as observaciones,
        t.fecha_finalizacion as fechaFinalizacion,
        t.satisfaccion as satisfaccion,
        t.sugerencia as sugerencia,
        mo.REGIONAL as regional
      FROM Dynamic_Tickets t
      LEFT JOIN Maestro_Operaciones mo ON mo.OPERACIÓN = t.\`Operación\`
      ${whereSql}
      ORDER BY ${orderCol} ${orderDir}, t.Ticket DESC
      LIMIT ? OFFSET ?
    `, [...params, limitNum, offsetNum]);

    res.json({ total: rows.length, limit: limitNum, offset: offsetNum, rows });
  } catch (err) {
    console.error('[facturacion] GET /api/tickets:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tickets/metricas ──────────────────────────────────────────────────
router.get('/api/tickets/metricas', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Tickets');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const { regional, operacion, q, estado } = req.query;

    const commonWhere = [`t.modulo = 'Servicios'`];
    const commonParams = [];

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro || !acceso.operacionesFiltro.length) {
        return res.json({ estados: [], regionalesOps: [] });
      }
      commonWhere.push(`t.\`Operación\` IN (${acceso.operacionesFiltro.map(() => '?').join(',')})`);
      commonParams.push(...acceso.operacionesFiltro);
    }

    if (regional && regional !== 'todas') {
      commonWhere.push('mo.REGIONAL = ?');
      commonParams.push(regional);
    }
    if (operacion && operacion !== 'todas') {
      commonWhere.push('t.`Operación` = ?');
      commonParams.push(operacion);
    }
    if (q && q.trim()) {
      const qLike = `%${q.trim()}%`;
      commonWhere.push(`(t.Ticket LIKE ? OR t.idrecibo LIKE ? OR t.solicitante LIKE ?)`);
      commonParams.push(qLike, qLike, qLike);
    }

    // 1. Conteo por Estado (no filtra por Estado para mostrar panorama del filtro principal)
    const whereSqlEstado = commonWhere.length ? `WHERE ${commonWhere.join(' AND ')}` : '';
    const [estadoRows] = await pool.query(`
      SELECT t.Estado as estado, COUNT(*) as totalCount
      FROM Dynamic_Tickets t
      LEFT JOIN Maestro_Operaciones mo ON mo.OPERACIÓN = t.\`Operación\`
      ${whereSqlEstado}
      GROUP BY t.Estado
    `, commonParams);

    // 2. Conteo por Regional / Operación (incluye el Estado seleccionado)
    const dropdownWhere = [...commonWhere];
    const dropdownParams = [...commonParams];
    const estadoFiltro = (typeof estado === 'undefined' || estado === null || estado === '') ? 'En Proceso' : estado;
    if (estadoFiltro !== 'todos') {
      dropdownWhere.push('t.Estado = ?');
      dropdownParams.push(estadoFiltro);
    }
    const whereSqlDropdowns = dropdownWhere.length ? `WHERE ${dropdownWhere.join(' AND ')}` : '';

    const [opsRows] = await pool.query(`
      SELECT COALESCE(mo.REGIONAL, 'SIN REGIONAL') as regional, t.\`Operación\` as operacion, COUNT(*) as totalCount
      FROM Dynamic_Tickets t
      LEFT JOIN Maestro_Operaciones mo ON mo.OPERACIÓN = t.\`Operación\`
      ${whereSqlDropdowns}
      GROUP BY mo.REGIONAL, t.\`Operación\`
    `, dropdownParams);

    res.json({ estados: estadoRows, regionalesOps: opsRows });
  } catch (err) {
    console.error('[facturacion] GET /api/tickets/metricas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tickets/:ticket/estado (Gestionar Ticket) ────────────────────────
router.post('/api/tickets/:ticket/estado', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { ticket } = req.params;
    const { estado, observaciones } = req.body;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Tickets');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!ticket) return res.status(400).json({ error: 'ticket requerido' });
    if (!estado || !ESTADOS_TICKET_VALIDOS.includes(estado)) {
      return res.status(400).json({ error: 'estado inválido' });
    }

    const [existRows] = await pool.execute(
      'SELECT `Operación` as operacion FROM Dynamic_Tickets WHERE Ticket = ? LIMIT 1',
      [ticket]
    );
    if (!existRows.length) return res.status(404).json({ error: 'Ticket no encontrado' });

    if (!acceso.sinFiltro && acceso.operacionesFiltro && !acceso.operacionesFiltro.includes(existRows[0].operacion)) {
      return res.status(403).json({ error: 'No autorizado para modificar este ticket' });
    }

    const finaliza = (estado === 'Resuelto' || estado === 'Rechazado');
    const obsVal = (observaciones || '').trim() || null;

    await pool.execute(
      `UPDATE Dynamic_Tickets SET Estado = ?, Observaciones = ?, fecha_finalizacion = ${finaliza ? 'NOW()' : 'NULL'} WHERE Ticket = ?`,
      [estado, obsVal, ticket]
    );

    res.json({ ok: true, ticket, estado, observaciones: obsVal });
  } catch (err) {
    console.error('[facturacion] POST /api/tickets/:ticket/estado:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
