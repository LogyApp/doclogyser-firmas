const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../services/db');
const { computarAccesoFacturacion } = require('../services/accesoFacturacion');
const { obtenerConfigServiciosMasivo, puedeDepurarMaestros, puedeGestionarMaestros, puedeEditarRetenciones } = require('../services/configFacturacion');
const { subirFotoServicio } = require('../services/storage');
const { obtenerTipoDocumentoConfig, registrarDocGeneral } = require('../services/documentRegistry');

const uploadServicio = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Solo estos roles pueden crear/editar/bloquear Clientes Crédito (otros roles con acceso a la
// sección 'Clientes_credito' solo pueden consultar vía GET /api/clientes-credito).
// Quién gestiona Clientes Crédito: Config_Parametros facturacion / Clientes_credito
const { puedeGestionarClientesCredito } = require('../services/configBloqueo');
const configServicios = require('../services/configServicios');
// Celda de la carga masiva que corresponde a cada campo de Config_Servicios (bodyKey)
const CELDA_MASIVO_POR_CAMPO = {
  area: 'area', actividad: 'actividad', vehiculo: 'vehiculo', unidad: 'unidad', remolque: 'remolque',
  manifiesto: 'manifiesto', origen: 'origen', destino: 'destino', cantidad: 'cantidad',
  valorUnitario: 'valorUnitario', observaciones: 'observaciones',
};

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
    // Subpestañas de la pestaña Clientes: cada una con su Sección en Maestro_Menu (facturacion)
    const accesoMaestroClientes = await computarAccesoFacturacion(usuario, 'Clientes');
    const accesoProveedor = await computarAccesoFacturacion(usuario, 'Proveedor');
    const accesoTransportadora = await computarAccesoFacturacion(usuario, 'Transportadora');
    const accesoPlacas = await computarAccesoFacturacion(usuario, 'Placas');
    const accesoPestanaClientes = accesoMaestroClientes || accesoClientes || accesoProveedor
      || accesoTransportadora || accesoPlacas;
    const accesoAjustes = await computarAccesoFacturacion(usuario, 'Ajustes_Servicios');

    if (!accesoServicios && !accesoRecibos && !accesoBloqueo && !accesoPestanaClientes) {
      return res.status(403).send(paginaError('Usuario no autorizado para el módulo de Facturación'));
    }

    const base = accesoServicios || accesoRecibos || accesoBloqueo || accesoPestanaClientes;
    const cfgServiciosMasivo = await obtenerConfigServiciosMasivo(base.rol);
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
      sinFiltro: base.sinFiltro,
      operacion: base.operacion,
      regionalesFiltro: Object.keys(base.opsPorRegional).sort(),
      opsPorRegional: base.opsPorRegional,
      quincenaActual,
      serviciosMasivo: cfgServiciosMasivo,
      puedeGestionarClientesCredito: await puedeGestionarClientesCredito(base.rol),
      clientesMaestros: {
        puedeDepurar: await puedeDepurarMaestros(base.rol),
        puedeGestionar: await puedeGestionarMaestros(base.rol),
        puedeEditarRetenciones: await puedeEditarRetenciones(base.rol)
      }, // Config_Parametros (facturacion / Clientes)
      tabs: {
        servicios: resumenAcceso(accesoServicios),
        recibos: resumenAcceso(accesoRecibos || accesoServicios),
        bloqueo: resumenAcceso(accesoBloqueo),
        clientes_credito: resumenAcceso(accesoClientes),
        tickets: resumenAcceso(accesoTickets),
        clientes: resumenAcceso(accesoMaestroClientes),
        proveedores: resumenAcceso(accesoProveedor),
        transportadoras: resumenAcceso(accesoTransportadora),
        placas: resumenAcceso(accesoPlacas),
        ajustes: resumenAcceso(accesoAjustes),
      },
      // Pestaña Ajustes Servicios (Config_Servicios): permisos de Config_Parametros
      ajustesServicios: accesoAjustes ? await configServicios.permisosAjustesServicios(base.rol) : null,
      camposServicios: configServicios.CAMPOS,
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

    const [colDesde] = await pool.query("SHOW COLUMNS FROM Bloqueo_Nomina LIKE 'Desde'");
    const [rows] = await pool.execute(`
      SELECT b.ID AS id, b.Operación AS operacion, b.Quincena AS quincena,
             ${colDesde.length ? "DATE_FORMAT(b.Desde, '%Y-%m-%d %H:%i')" : 'NULL'} AS desde,
             DATE_FORMAT(b.Hasta, '%Y-%m-%d %H:%i') AS hasta,
             b.Año AS anio, b.Datos AS datos, b.Forma_Pago AS formaPago, b.Condición AS condicion,
             b.Usuario AS usuario, DATE_FORMAT(b.Fecha_Registro, '%Y-%m-%d %H:%i:%s') AS fechaRegistro, b.Modulo AS modulo,
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
    if (!(await puedeGestionarClientesCredito(acceso.rol))) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para agregar clientes crédito' });
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
    if (!(await puedeGestionarClientesCredito(acceso.rol))) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para modificar el bloqueo' });
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
    if (!(await puedeGestionarClientesCredito(acceso.rol))) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para editar clientes crédito' });
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
    if (!(await puedeGestionarClientesCredito(acceso.rol))) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para eliminar clientes crédito' });
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

// ── GET /api/maestro-clientes (Listado completo de Maestro_Clientes) ───────
router.get('/api/maestro-clientes', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [rows] = await pool.query(`
      SELECT
        \`Solicitar Actualización\` AS solicitarActualizacion,
        \`Código\` AS codigo,
        \`Razón social\` AS razonSocial,
        \`RTICA\` AS rtica,
        \`RTIVA\` AS rtiva,
        \`RTSERVIC\` AS rtservic,
        DATE_FORMAT(\`Fecha última venta\`, '%Y-%m-%d') AS fechaUltimaVenta,
        \`Depto/Estado\` AS deptoEstado,
        \`Ciudad\` AS ciudad,
        \`Dirección 1\` AS direccion1,
        \`Telefono\` AS telefono,
        \`Desc. condicion de pago\` AS condicionPago,
        \`Correo F.E.\` AS correoFE,
        \`Buscar Cliente\` AS buscarCliente,
        \`Usuario\` AS usuario,
        DATE_FORMAT(\`Fecha Registro\`, '%Y-%m-%d %H:%i:%s') AS fechaRegistro,
        \`Documento\` AS documento,
        \`Observaciones\` AS observaciones
      FROM Maestro_Clientes
      ORDER BY \`Fecha Registro\` DESC, \`Razón social\` ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/maestro-clientes:', err);
    res.status(500).json([]);
  }
});

// ── GET /api/maestro-clientes/contexto-operacion (Ubicación por Operación del usuario) ──
router.get('/api/maestro-clientes/contexto-operacion', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const userOp = String(acceso.operacion || '').split(',')[0].trim();
    let opZona = null, opCC = null, opDir = userOp;

    if (userOp) {
      const [rows] = await pool.execute(
        'SELECT `OPERACIÓN` as operacion, REGIONAL as regional, ZONA as zona, `C.C.` as cc, DIRECCION as direccion FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
        [userOp]
      );
      if (rows.length) {
        opZona = rows[0].zona || rows[0].regional || null;
        opCC = rows[0].cc || null;
        opDir = rows[0].operacion || rows[0].direccion || userOp;
      }
    }

    res.json({
      operacion: userOp,
      deptoEstado: opZona,
      ciudad: opCC,
      direccion1: opDir,
      puedeEditarRetenciones: await puedeEditarRetenciones(acceso.rol)
    });
  } catch (err) {
    console.error('[facturacion] GET /api/maestro-clientes/contexto-operacion:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/maestro-clientes (Agregar Cliente) ───────────────────────────
router.post('/api/maestro-clientes', uploadServicio.single('documento'), async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!(await puedeGestionarMaestros(acceso.rol))) {
      return res.status(403).json({ error: 'No autorizado para crear clientes.' });
    }

    const codigoRaw = String(req.body.codigo || '').replace(/[^0-9]/g, '');
    const codigo = Number(codigoRaw);
    if (!codigo || codigo <= 0) {
      return res.status(400).json({ error: 'El Código (NIT) es obligatorio y debe ser numérico mayor a 0.' });
    }

    const [existe] = await pool.execute('SELECT `Código` FROM Maestro_Clientes WHERE `Código` = ? LIMIT 1', [codigo]);
    if (existe.length) {
      return res.status(400).json({ error: `Ya existe un cliente con el código ${codigo}.` });
    }

    const razonSocial = String(req.body.razonSocial || '').trim().toUpperCase();
    if (!razonSocial) return res.status(400).json({ error: 'La Razón Social es obligatoria.' });

    const telefono = String(req.body.telefono || '').trim();
    if (!telefono) return res.status(400).json({ error: 'El Teléfono es obligatorio.' });

    const correoFE = String(req.body.correoFE || '').trim();
    if (!correoFE) return res.status(400).json({ error: 'El Correo F.E. es obligatorio.' });

    const observaciones = req.body.observaciones ? String(req.body.observaciones).trim() : null;

    // Retenciones: solo si tiene permiso Facturación o Sistema
    const puedeRet = await puedeEditarRetenciones(acceso.rol);
    const rtica = (puedeRet && req.body.rtica) ? String(req.body.rtica).trim() : null;
    const rtiva = (puedeRet && req.body.rtiva) ? String(req.body.rtiva).trim() : null;
    const rtservic = (puedeRet && req.body.rtservic) ? String(req.body.rtservic).trim() : null;

    // Ubicación por Operación del usuario
    const userOp = String(acceso.operacion || '').split(',')[0].trim();
    let deptoEstado = null, ciudad = null, direccion1 = userOp || '';
    if (userOp) {
      const [opRows] = await pool.execute(
        'SELECT ZONA, `C.C.`, `OPERACIÓN`, DIRECCION FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
        [userOp]
      );
      if (opRows.length) {
        deptoEstado = opRows[0].ZONA || null;
        ciudad = opRows[0]['C.C.'] || null;
        direccion1 = opRows[0]['OPERACIÓN'] || opRows[0].DIRECCION || userOp;
      }
    }
    if (req.body.deptoEstado) deptoEstado = String(req.body.deptoEstado).trim();
    if (req.body.ciudad) ciudad = String(req.body.ciudad).trim();
    if (req.body.direccion1) direccion1 = String(req.body.direccion1).trim();

    const buscarCliente = `${codigo} ** ${razonSocial}`;
    const usuarioVal = acceso.usuarioNombre || usuario;
    const ahoraBogota = formatearAhoraBogota();

    // Documento opcional (Rut Cliente) subido a talenthub_central
    let documentoPath = null;
    if (req.file && req.file.buffer) {
      const ext = path.extname(req.file.originalname) || '.pdf';
      const timestamp = ahoraBogota.replace(/[^0-9]/g, '').slice(8, 14) || Date.now().toString().slice(-6);
      const nombreArchivo = `Clientes_Images/${codigo}.Documento.${timestamp}${ext}`;
      try {
        const { storage } = require('../services/storage');
        const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'talenthub_central';
        const file = storage.bucket(BUCKET_NAME).file(nombreArchivo);
        await file.save(req.file.buffer, {
          contentType: req.file.mimetype || 'application/octet-stream'
        });
        documentoPath = nombreArchivo;
      } catch (storageErr) {
        console.warn('[facturacion] Error guardando archivo de Rut Cliente en storage:', storageErr.message);
        documentoPath = nombreArchivo;
      }
    }

    await pool.execute(
      `INSERT INTO Maestro_Clientes (
        \`Solicitar Actualización\`, \`Código\`, \`Raz\u00f3n social\`,
        \`RTICA\`, \`RTIVA\`, \`RTSERVIC\`,
        \`Fecha última venta\`, \`Depto/Estado\`, \`Ciudad\`, \`Dirección 1\`,
        \`Telefono\`, \`Desc. condicion de pago\`, \`Correo F.E.\`,
        \`Buscar Cliente\`, \`Usuario\`, \`Fecha Registro\`, \`Documento\`, \`Observaciones\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'NUEVO', codigo, razonSocial,
        rtica, rtiva, rtservic,
        null, deptoEstado, ciudad, direccion1,
        telefono, 'CONTADO', correoFE,
        buscarCliente, usuarioVal, ahoraBogota, documentoPath, observaciones
      ]
    );

    res.json({
      ok: true,
      codigo,
      razonSocial,
      telefono,
      correoFE,
      deptoEstado,
      ciudad,
      direccion1,
      buscarCliente,
      documento: documentoPath,
      usuario: usuarioVal,
      fechaRegistro: ahoraBogota
    });
  } catch (err) {
    console.error('[facturacion] POST /api/maestro-clientes:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT/POST /api/maestro-clientes/:codigo (Editar Cliente) ─────────────────
async function handleActualizarCliente(req, res) {
  try {
    const { usuario } = req.query;
    const codigo = Number(req.params.codigo || req.body.codigo);
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    if (!codigo) return res.status(400).json({ error: 'Código de cliente obligatorio' });

    if (!(await puedeGestionarMaestros(acceso.rol))) {
      return res.status(403).json({ error: 'No autorizado para editar clientes.' });
    }

    const razonSocial = String(req.body.razonSocial || '').trim().toUpperCase();
    if (!razonSocial) return res.status(400).json({ error: 'La Razón Social es obligatoria.' });
    const telefono = String(req.body.telefono || '').trim();
    if (!telefono) return res.status(400).json({ error: 'El Teléfono es obligatorio.' });
    const correoFE = String(req.body.correoFE || '').trim();
    if (!correoFE) return res.status(400).json({ error: 'El Correo F.E. es obligatorio.' });

    const puedeRet = await puedeEditarRetenciones(acceso.rol);
    const buscarCliente = `${codigo} ** ${razonSocial}`;
    const observaciones = req.body.observaciones !== undefined ? (req.body.observaciones ? String(req.body.observaciones).trim() : null) : null;

    if (puedeRet) {
      const rtica = req.body.rtica !== undefined ? (req.body.rtica ? String(req.body.rtica).trim() : null) : null;
      const rtiva = req.body.rtiva !== undefined ? (req.body.rtiva ? String(req.body.rtiva).trim() : null) : null;
      const rtservic = req.body.rtservic !== undefined ? (req.body.rtservic ? String(req.body.rtservic).trim() : null) : null;

      await pool.execute(
        `UPDATE Maestro_Clientes
         SET \`Raz\u00f3n social\` = ?, \`Telefono\` = ?, \`Correo F.E.\` = ?,
             \`Buscar Cliente\` = ?, \`RTICA\` = ?, \`RTIVA\` = ?, \`RTSERVIC\` = ?, \`Observaciones\` = ?
         WHERE \`Código\` = ?`,
        [razonSocial, telefono, correoFE, buscarCliente, rtica, rtiva, rtservic, observaciones, codigo]
      );
    } else {
      await pool.execute(
        `UPDATE Maestro_Clientes
         SET \`Raz\u00f3n social\` = ?, \`Telefono\` = ?, \`Correo F.E.\` = ?,
             \`Buscar Cliente\` = ?, \`Observaciones\` = ?
         WHERE \`Código\` = ?`,
        [razonSocial, telefono, correoFE, buscarCliente, observaciones, codigo]
      );
    }

    res.json({ ok: true, codigo, razonSocial, telefono, correoFE, buscarCliente });
  } catch (err) {
    console.error('[facturacion] UPDATE maestro-clientes:', err);
    res.status(500).json({ error: err.message });
  }
}
router.put('/api/maestro-clientes/:codigo', handleActualizarCliente);
router.post('/api/maestro-clientes/actualizar', handleActualizarCliente);

// ── GET /api/maestro-transportadoras (Listado de Maestro_Transportadora) ───
router.get('/api/maestro-transportadoras', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [[rows], [counts]] = await Promise.all([
      pool.query(`
        SELECT
          ID AS id,
          Transportadora AS transportadora,
          Usuario AS usuario,
          DATE_FORMAT(\`Fecha Ingreso\`, '%Y-%m-%d %H:%i:%s') AS fechaIngreso
        FROM Maestro_Transportadora
        ORDER BY \`Fecha Ingreso\` DESC, Transportadora ASC
      `),
      pool.query(`
        SELECT Transportadora AS id, COUNT(*) AS cnt
        FROM Dynamic_Servicios
        WHERE Transportadora IS NOT NULL AND Transportadora != ''
        GROUP BY Transportadora
      `)
    ]);

    const countMap = new Map(counts.map(c => [String(c.id), Number(c.cnt) || 0]));
    res.json(rows.map(r => ({
      ...r,
      totalServicios: countMap.get(String(r.id)) || 0
    })));
  } catch (err) {
    console.error('[facturacion] GET /api/maestro-transportadoras:', err);
    res.status(500).json([]);
  }
});

// ── PUT/POST /api/maestro-transportadoras/:id (Editar Transportadora) ──────
async function handleActualizarTransportadora(req, res) {
  try {
    const { usuario } = req.query;
    const id = req.params.id || req.body.id;
    const { transportadora } = req.body;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    if (!(await puedeGestionarMaestros(acceso.rol))) {
      return res.status(403).json({ error: 'No autorizado para editar transportadoras.' });
    }

    if (!id) return res.status(400).json({ error: 'ID es obligatorio' });
    const nuevoNombre = String(transportadora || '').trim();
    if (!nuevoNombre) return res.status(400).json({ error: 'El nombre de la transportadora es obligatorio' });

    const [result] = await pool.execute(
      'UPDATE Maestro_Transportadora SET Transportadora = ? WHERE ID = ?',
      [nuevoNombre, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Transportadora no encontrada' });
    }

    res.json({ ok: true, id, transportadora: nuevoNombre });
  } catch (err) {
    console.error('[facturacion] UPDATE maestro-transportadoras:', err);
    res.status(500).json({ error: err.message });
  }
}
router.put('/api/maestro-transportadoras/:id', handleActualizarTransportadora);
router.post('/api/maestro-transportadoras/actualizar', handleActualizarTransportadora);

// ── POST /api/maestro-transportadoras/unificar-duplicados ──────────────────
router.post('/api/maestro-transportadoras/unificar-duplicados', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    let grupos = Array.isArray(req.body.grupos) ? req.body.grupos : [];
    if (!grupos.length && req.body.idConservar && Array.isArray(req.body.idsEliminar)) {
      grupos = [{ idConservar: req.body.idConservar, idsEliminar: req.body.idsEliminar }];
    }
    if (!grupos.length) {
      return res.status(400).json({ error: 'No se recibieron grupos de duplicados para unificar' });
    }

    await conn.beginTransaction();
    let serviciosReasignados = 0;
    let registrosEliminados = 0;
    let gruposProcesados = 0;

    for (const g of grupos) {
      const idConservar = String(g.idConservar || '').trim();
      const idsEliminar = (Array.isArray(g.idsEliminar) ? g.idsEliminar : [])
        .map(x => String(x || '').trim())
        .filter(x => x && x !== idConservar);

      if (!idConservar || !idsEliminar.length) continue;

      const [existe] = await conn.query('SELECT ID FROM Maestro_Transportadora WHERE ID = ? LIMIT 1', [idConservar]);
      if (!existe.length) continue;

      const [updResult] = await conn.query(
        'UPDATE Dynamic_Servicios SET Transportadora = ? WHERE Transportadora IN (?)',
        [idConservar, idsEliminar]
      );
      serviciosReasignados += (updResult.affectedRows || 0);

      const [delResult] = await conn.query(
        'DELETE FROM Maestro_Transportadora WHERE ID IN (?) AND ID != ?',
        [idsEliminar, idConservar]
      );
      registrosEliminados += (delResult.affectedRows || 0);
      gruposProcesados++;
    }

    await conn.commit();
    res.json({ ok: true, gruposProcesados, serviciosReasignados, registrosEliminados });
  } catch (err) {
    await conn.rollback();
    console.error('[facturacion] POST /api/maestro-transportadoras/unificar-duplicados:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ── POST /api/maestro-transportadoras/convertir-mayusculas (depurar maestros, Config_Parametros) ──
router.post('/api/maestro-transportadoras/convertir-mayusculas', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!(await puedeDepurarMaestros(acceso.rol))) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para esta acción provisional' });
    }

    const [result] = await pool.query(
      'UPDATE Maestro_Transportadora SET Transportadora = UPPER(TRIM(Transportadora)) WHERE Transportadora IS NOT NULL'
    );
    res.json({ ok: true, actualizados: result.changedRows ?? result.affectedRows ?? 0 });
  } catch (err) {
    console.error('[facturacion] POST /api/maestro-transportadoras/convertir-mayusculas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/maestro-transportadoras/eliminar-masivo (depurar maestros, Config_Parametros) ────────
router.post('/api/maestro-transportadoras/eliminar-masivo', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!(await puedeDepurarMaestros(acceso.rol))) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para eliminar transportadoras' });
    }

    const ids = (Array.isArray(req.body.ids) ? req.body.ids : [req.body.id])
      .map(x => String(x || '').trim())
      .filter(Boolean);

    if (!ids.length) return res.status(400).json({ error: 'No se recibieron IDs para eliminar' });

    await conn.beginTransaction();

    // 1. Dejar en blanco la columna Transportadora en Dynamic_Servicios (evita error del trigger logueo_servicios_update por Dato NOT NULL)
    const [upd] = await conn.query(
      'UPDATE Dynamic_Servicios SET Transportadora = "" WHERE Transportadora IN (?)',
      [ids]
    );

    // 2. Eliminar de Maestro_Transportadora
    const [del] = await conn.query(
      'DELETE FROM Maestro_Transportadora WHERE ID IN (?)',
      [ids]
    );

    await conn.commit();
    res.json({
      ok: true,
      eliminados: del.affectedRows || 0,
      serviciosDesvinculados: upd.affectedRows || 0
    });
  } catch (err) {
    await conn.rollback();
    console.error('[facturacion] POST /api/maestro-transportadoras/eliminar-masivo:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ── POST /api/maestro-transportadoras/eliminar-reemplazar (depurar maestros, Config_Parametros) ────
router.post('/api/maestro-transportadoras/eliminar-reemplazar', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!(await puedeDepurarMaestros(acceso.rol))) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para eliminar transportadoras' });
    }

    const idReemplazo = String(req.body.idReemplazo || '').trim();
    if (!idReemplazo) return res.status(400).json({ error: 'Se requiere el ID de reemplazo' });

    const idsEliminar = (Array.isArray(req.body.idsEliminar) ? req.body.idsEliminar : [req.body.idEliminar])
      .map(x => String(x || '').trim())
      .filter(x => x && x !== idReemplazo);

    if (!idsEliminar.length) return res.status(400).json({ error: 'No se recibieron IDs para eliminar' });

    const [destinoExiste] = await pool.query('SELECT ID, Transportadora FROM Maestro_Transportadora WHERE ID = ? LIMIT 1', [idReemplazo]);
    if (!destinoExiste.length) return res.status(400).json({ error: 'El registro de reemplazo no existe' });

    await conn.beginTransaction();

    // 1. Reasignar en Dynamic_Servicios al nuevo ID
    const [upd] = await conn.query(
      'UPDATE Dynamic_Servicios SET Transportadora = ? WHERE Transportadora IN (?)',
      [idReemplazo, idsEliminar]
    );

    // 2. Eliminar los registros sobrantes de Maestro_Transportadora
    const [del] = await conn.query(
      'DELETE FROM Maestro_Transportadora WHERE ID IN (?) AND ID != ?',
      [idsEliminar, idReemplazo]
    );

    await conn.commit();
    res.json({
      ok: true,
      eliminados: del.affectedRows || 0,
      idReemplazo,
      nombreReemplazo: destinoExiste[0].Transportadora,
      serviciosReasignados: upd.affectedRows || 0
    });
  } catch (err) {
    await conn.rollback();
    console.error('[facturacion] POST /api/maestro-transportadoras/eliminar-reemplazar:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ── GET /api/maestro-transportadoras/analisis-textos-servicios (depurar maestros, Config_Parametros)
router.get('/api/maestro-transportadoras/analisis-textos-servicios', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!(await puedeDepurarMaestros(acceso.rol))) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para consultar este análisis' });
    }

    const [orphans] = await pool.query(`
      SELECT ds.Transportadora AS texto, COUNT(*) AS cnt
      FROM Dynamic_Servicios ds
      LEFT JOIN Maestro_Transportadora mtId ON ds.Transportadora = mtId.ID
      WHERE mtId.ID IS NULL AND ds.Transportadora IS NOT NULL AND ds.Transportadora != ''
      GROUP BY ds.Transportadora
      ORDER BY cnt DESC
    `);

    const [allMt] = await pool.query('SELECT ID, Transportadora FROM Maestro_Transportadora');
    const nameMap = new Map();
    const idMap = new Map();
    allMt.forEach(m => {
      nameMap.set(String(m.Transportadora || '').trim().toUpperCase(), m);
      idMap.set(String(m.ID || '').trim().toLowerCase(), m);
    });

    const conCoincidencia = [];
    const sinCoincidencia = [];
    let filasAfectadas = 0;

    orphans.forEach(o => {
      const raw = String(o.texto || '');
      const clean = raw.replace(/[\r\n\t]/g, '').trim();
      const match = nameMap.get(clean.toUpperCase()) || idMap.get(clean.toLowerCase());

      if (match) {
        conCoincidencia.push({
          textoOriginal: raw,
          idDestino: match.ID,
          nombreDestino: match.Transportadora,
          filas: o.cnt
        });
        filasAfectadas += o.cnt;
      } else {
        sinCoincidencia.push({
          textoOriginal: raw,
          filas: o.cnt
        });
      }
    });

    res.json({
      totalHuerfanos: orphans.length,
      coincidenciasCount: conCoincidencia.length,
      sinCoincidenciasCount: sinCoincidencia.length,
      filasAfectadas,
      muestrasCoincidencia: conCoincidencia.slice(0, 50),
      muestrasSinCoincidencia: sinCoincidencia.slice(0, 50)
    });
  } catch (err) {
    console.error('[facturacion] GET /api/maestro-transportadoras/analisis-textos-servicios:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/maestro-transportadoras/ejecutar-normalizacion-textos (depurar maestros, Config_Parametros)
router.post('/api/maestro-transportadoras/ejecutar-normalizacion-textos', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!(await puedeDepurarMaestros(acceso.rol))) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para normalizar textos' });
    }

    const [orphans] = await pool.query(`
      SELECT ds.Transportadora AS texto
      FROM Dynamic_Servicios ds
      LEFT JOIN Maestro_Transportadora mtId ON ds.Transportadora = mtId.ID
      WHERE mtId.ID IS NULL AND ds.Transportadora IS NOT NULL AND ds.Transportadora != ''
      GROUP BY ds.Transportadora
    `);

    const [allMt] = await pool.query('SELECT ID, Transportadora FROM Maestro_Transportadora');
    const nameMap = new Map();
    const idMap = new Map();
    allMt.forEach(m => {
      nameMap.set(String(m.Transportadora || '').trim().toUpperCase(), m.ID);
      idMap.set(String(m.ID || '').trim().toLowerCase(), m.ID);
    });

    const pares = [];
    orphans.forEach(o => {
      const raw = String(o.texto || '');
      const clean = raw.replace(/[\r\n\t]/g, '').trim();
      const destId = nameMap.get(clean.toUpperCase()) || idMap.get(clean.toLowerCase());
      if (destId && destId !== raw) {
        pares.push({ textoOriginal: raw, idDestino: destId });
      }
    });

    let filasActualizadas = 0;
    for (let i = 0; i < pares.length; i += 50) {
      const chunk = pares.slice(i, i + 50);
      const results = await Promise.all(
        chunk.map(p => pool.query(
          'UPDATE Dynamic_Servicios SET Transportadora = ? WHERE Transportadora = ?',
          [p.idDestino, p.textoOriginal]
        ))
      );
      results.forEach(([r]) => {
        filasActualizadas += (r.affectedRows || 0);
      });
    }

    res.json({
      ok: true,
      valoresNormalizados: pares.length,
      filasActualizadas
    });
  } catch (err) {
    console.error('[facturacion] POST /api/maestro-transportadoras/ejecutar-normalizacion-textos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/maestro-transportadoras/:id/servicios ─────────────────────────
router.get('/api/maestro-transportadoras/:id/servicios', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { id } = req.params;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [rows] = await pool.query(`
      SELECT
        s.IdServicio AS idServicio,
        s.IdRecibo AS idRecibo,
        r.\`Consecutivo Recibo\` AS consecutivoRecibo,
        DATE_FORMAT(s.\`Hora Inicio\`, '%Y-%m-%d %H:%i') AS fechaServicio,
        r.\`Operación\` AS operacion,
        ar.AREA AS area,
        ca.Actividad AS actividad,
        mp.Placa AS placa,
        s.Vehiculo AS vehiculo,
        s.Cantidad AS cantidad,
        s.Unidad AS unidad,
        s.\`Valor Unitario\` AS valorUnitario,
        ROUND(COALESCE(s.Cantidad, 0) * COALESCE(s.\`Valor Unitario\`, 0)) AS subtotal,
        COALESCE(r.\`Cliente a Facturar\`, mc.\`Razón social\`) AS cliente,
        r.Nit AS nit,
        s.\`Forma De Pago\` AS formaDePago,
        s.Estado AS estado,
        s.Usuario AS usuario,
        DATE_FORMAT(s.Fecha, '%Y-%m-%d %H:%i:%s') AS fechaRegistro
      FROM Dynamic_Servicios s
      LEFT JOIN Dynamic_Recibos r ON s.IdRecibo = r.IdRecibo
      LEFT JOIN Config_Area ar ON s.Area = ar.ID
      LEFT JOIN Config_Actividad ca ON s.Actividad = ca.ID
      LEFT JOIN Maestro_Placas mp ON s.PL1 = mp.ID
      LEFT JOIN Maestro_Clientes mc ON r.Nit = mc.\`Código\`
      WHERE s.Transportadora = ?
      ORDER BY s.\`Hora Inicio\` DESC, s.IdServicio DESC
      LIMIT 500
    `, [id]);

    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/maestro-transportadoras/:id/servicios:', err);
    res.status(500).json([]);
  }
});

// ── GET /api/maestro-proveedores (Listado de Maestro_Proveedor) ────────────
router.get('/api/maestro-proveedores', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [[rows], [counts]] = await Promise.all([
      pool.query(`
        SELECT
          ID AS id,
          Proveedor AS proveedor,
          Usuario AS usuario,
          DATE_FORMAT(\`Fecha Ingreso\`, '%Y-%m-%d %H:%i:%s') AS fechaIngreso
        FROM Maestro_Proveedor
        ORDER BY \`Fecha Ingreso\` DESC, Proveedor ASC
      `),
      pool.query(`
        SELECT Proveedor AS id, COUNT(*) AS cnt
        FROM Dynamic_Servicios
        WHERE Proveedor IS NOT NULL AND Proveedor != ''
        GROUP BY Proveedor
      `)
    ]);

    const countMap = new Map(counts.map(c => [String(c.id), Number(c.cnt) || 0]));
    res.json(rows.map(r => ({
      ...r,
      totalServicios: countMap.get(String(r.id)) || 0
    })));
  } catch (err) {
    console.error('[facturacion] GET /api/maestro-proveedores:', err);
    res.status(500).json([]);
  }
});

// ── PUT/POST /api/maestro-proveedores/:id (Editar Proveedor) ───────────────
async function handleActualizarProveedor(req, res) {
  try {
    const { usuario } = req.query;
    const id = req.params.id || req.body.id;
    const { proveedor } = req.body;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    if (!(await puedeGestionarMaestros(acceso.rol))) {
      return res.status(403).json({ error: 'No autorizado para editar proveedores.' });
    }

    if (!id) return res.status(400).json({ error: 'ID es obligatorio' });
    const nuevoNombre = String(proveedor || '').trim();
    if (!nuevoNombre) return res.status(400).json({ error: 'El nombre del proveedor es obligatorio' });

    const [result] = await pool.execute(
      'UPDATE Maestro_Proveedor SET Proveedor = ? WHERE ID = ?',
      [nuevoNombre, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    res.json({ ok: true, id, proveedor: nuevoNombre });
  } catch (err) {
    console.error('[facturacion] UPDATE maestro-proveedores:', err);
    res.status(500).json({ error: err.message });
  }
}
router.put('/api/maestro-proveedores/:id', handleActualizarProveedor);
router.post('/api/maestro-proveedores/actualizar', handleActualizarProveedor);

// ── POST /api/maestro-proveedores/unificar-duplicados ──────────────────────
router.post('/api/maestro-proveedores/unificar-duplicados', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    let grupos = Array.isArray(req.body.grupos) ? req.body.grupos : [];
    if (!grupos.length && req.body.idConservar && Array.isArray(req.body.idsEliminar)) {
      grupos = [{ idConservar: req.body.idConservar, idsEliminar: req.body.idsEliminar }];
    }
    if (!grupos.length) {
      return res.status(400).json({ error: 'No se recibieron grupos de duplicados para unificar' });
    }

    await conn.beginTransaction();
    let serviciosReasignados = 0;
    let registrosEliminados = 0;
    let gruposProcesados = 0;

    for (const g of grupos) {
      const idConservar = String(g.idConservar || '').trim();
      const idsEliminar = (Array.isArray(g.idsEliminar) ? g.idsEliminar : [])
        .map(x => String(x || '').trim())
        .filter(x => x && x !== idConservar);

      if (!idConservar || !idsEliminar.length) continue;

      const [existe] = await conn.query('SELECT ID FROM Maestro_Proveedor WHERE ID = ? LIMIT 1', [idConservar]);
      if (!existe.length) continue;

      const [updResult] = await conn.query(
        'UPDATE Dynamic_Servicios SET Proveedor = ? WHERE Proveedor IN (?)',
        [idConservar, idsEliminar]
      );
      serviciosReasignados += (updResult.affectedRows || 0);

      const [delResult] = await conn.query(
        'DELETE FROM Maestro_Proveedor WHERE ID IN (?) AND ID != ?',
        [idsEliminar, idConservar]
      );
      registrosEliminados += (delResult.affectedRows || 0);
      gruposProcesados++;
    }

    await conn.commit();
    res.json({ ok: true, gruposProcesados, serviciosReasignados, registrosEliminados });
  } catch (err) {
    await conn.rollback();
    console.error('[facturacion] POST /api/maestro-proveedores/unificar-duplicados:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ── POST /api/maestro-proveedores/convertir-mayusculas (depurar maestros, Config_Parametros) ──────
router.post('/api/maestro-proveedores/convertir-mayusculas', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!(await puedeDepurarMaestros(acceso.rol))) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para esta acción provisional' });
    }

    const [result] = await pool.query(
      'UPDATE Maestro_Proveedor SET Proveedor = UPPER(TRIM(Proveedor)) WHERE Proveedor IS NOT NULL'
    );
    res.json({ ok: true, actualizados: result.changedRows ?? result.affectedRows ?? 0 });
  } catch (err) {
    console.error('[facturacion] POST /api/maestro-proveedores/convertir-mayusculas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/maestro-proveedores/eliminar-masivo (depurar maestros, Config_Parametros) ───────────
router.post('/api/maestro-proveedores/eliminar-masivo', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!(await puedeDepurarMaestros(acceso.rol))) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para eliminar proveedores' });
    }

    const ids = (Array.isArray(req.body.ids) ? req.body.ids : [req.body.id])
      .map(x => String(x || '').trim())
      .filter(Boolean);

    if (!ids.length) return res.status(400).json({ error: 'No se recibieron IDs para eliminar' });

    await conn.beginTransaction();

    // 1. Dejar en blanco la columna Proveedor en Dynamic_Servicios
    const [upd] = await conn.query(
      'UPDATE Dynamic_Servicios SET Proveedor = "" WHERE Proveedor IN (?)',
      [ids]
    );

    // 2. Eliminar de Maestro_Proveedor
    const [del] = await conn.query(
      'DELETE FROM Maestro_Proveedor WHERE ID IN (?)',
      [ids]
    );

    await conn.commit();
    res.json({
      ok: true,
      eliminados: del.affectedRows || 0,
      serviciosDesvinculados: upd.affectedRows || 0
    });
  } catch (err) {
    await conn.rollback();
    console.error('[facturacion] POST /api/maestro-proveedores/eliminar-masivo:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ── POST /api/maestro-proveedores/eliminar-reemplazar (depurar maestros, Config_Parametros) ───────
router.post('/api/maestro-proveedores/eliminar-reemplazar', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!(await puedeDepurarMaestros(acceso.rol))) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para eliminar proveedores' });
    }

    const idReemplazo = String(req.body.idReemplazo || '').trim();
    if (!idReemplazo) return res.status(400).json({ error: 'Se requiere el ID de reemplazo' });

    const idsEliminar = (Array.isArray(req.body.idsEliminar) ? req.body.idsEliminar : [req.body.idEliminar])
      .map(x => String(x || '').trim())
      .filter(x => x && x !== idReemplazo);

    if (!idsEliminar.length) return res.status(400).json({ error: 'No se recibieron IDs para eliminar' });

    const [destinoExiste] = await pool.query('SELECT ID, Proveedor FROM Maestro_Proveedor WHERE ID = ? LIMIT 1', [idReemplazo]);
    if (!destinoExiste.length) return res.status(400).json({ error: 'El registro de reemplazo no existe' });

    await conn.beginTransaction();

    // 1. Reasignar en Dynamic_Servicios al nuevo ID
    const [upd] = await conn.query(
      'UPDATE Dynamic_Servicios SET Proveedor = ? WHERE Proveedor IN (?)',
      [idReemplazo, idsEliminar]
    );

    // 2. Eliminar los registros sobrantes de Maestro_Proveedor
    const [del] = await conn.query(
      'DELETE FROM Maestro_Proveedor WHERE ID IN (?) AND ID != ?',
      [idsEliminar, idReemplazo]
    );

    await conn.commit();
    res.json({
      ok: true,
      eliminados: del.affectedRows || 0,
      idReemplazo,
      nombreReemplazo: destinoExiste[0].Proveedor,
      serviciosReasignados: upd.affectedRows || 0
    });
  } catch (err) {
    await conn.rollback();
    console.error('[facturacion] POST /api/maestro-proveedores/eliminar-reemplazar:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ── GET /api/maestro-proveedores/analisis-textos-servicios (depurar maestros, Config_Parametros) ──
router.get('/api/maestro-proveedores/analisis-textos-servicios', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!(await puedeDepurarMaestros(acceso.rol))) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para consultar este análisis' });
    }

    const [orphans] = await pool.query(`
      SELECT ds.Proveedor AS texto, COUNT(*) AS cnt
      FROM Dynamic_Servicios ds
      LEFT JOIN Maestro_Proveedor mpId ON ds.Proveedor = mpId.ID
      WHERE mpId.ID IS NULL AND ds.Proveedor IS NOT NULL AND ds.Proveedor != ''
      GROUP BY ds.Proveedor
      ORDER BY cnt DESC
    `);

    const [allMp] = await pool.query('SELECT ID, Proveedor FROM Maestro_Proveedor');
    const nameMap = new Map();
    const idMap = new Map();
    allMp.forEach(m => {
      nameMap.set(String(m.Proveedor || '').trim().toUpperCase(), m);
      idMap.set(String(m.ID || '').trim().toLowerCase(), m);
    });

    const conCoincidencia = [];
    const sinCoincidencia = [];
    let filasAfectadas = 0;

    orphans.forEach(o => {
      const raw = String(o.texto || '');
      const clean = raw.replace(/[\r\n\t]/g, '').trim();
      const match = nameMap.get(clean.toUpperCase()) || idMap.get(clean.toLowerCase());

      if (match) {
        conCoincidencia.push({
          textoOriginal: raw,
          idDestino: match.ID,
          nombreDestino: match.Proveedor,
          filas: o.cnt
        });
        filasAfectadas += o.cnt;
      } else {
        sinCoincidencia.push({
          textoOriginal: raw,
          filas: o.cnt
        });
      }
    });

    res.json({
      totalHuerfanos: orphans.length,
      coincidenciasCount: conCoincidencia.length,
      sinCoincidenciasCount: sinCoincidencia.length,
      filasAfectadas,
      muestrasCoincidencia: conCoincidencia.slice(0, 50),
      muestrasSinCoincidencia: sinCoincidencia.slice(0, 50)
    });
  } catch (err) {
    console.error('[facturacion] GET /api/maestro-proveedores/analisis-textos-servicios:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/maestro-proveedores/ejecutar-normalizacion-textos (depurar maestros, Config_Parametros)
router.post('/api/maestro-proveedores/ejecutar-normalizacion-textos', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!(await puedeDepurarMaestros(acceso.rol))) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para normalizar textos' });
    }

    const [orphans] = await pool.query(`
      SELECT ds.Proveedor AS texto
      FROM Dynamic_Servicios ds
      LEFT JOIN Maestro_Proveedor mpId ON ds.Proveedor = mpId.ID
      WHERE mpId.ID IS NULL AND ds.Proveedor IS NOT NULL AND ds.Proveedor != ''
      GROUP BY ds.Proveedor
    `);

    const [allMp] = await pool.query('SELECT ID, Proveedor FROM Maestro_Proveedor');
    const nameMap = new Map();
    const idMap = new Map();
    allMp.forEach(m => {
      nameMap.set(String(m.Proveedor || '').trim().toUpperCase(), m.ID);
      idMap.set(String(m.ID || '').trim().toLowerCase(), m.ID);
    });

    const pares = [];
    orphans.forEach(o => {
      const raw = String(o.texto || '');
      const clean = raw.replace(/[\r\n\t]/g, '').trim();
      const destId = nameMap.get(clean.toUpperCase()) || idMap.get(clean.toLowerCase());
      if (destId && destId !== raw) {
        pares.push({ textoOriginal: raw, idDestino: destId });
      }
    });

    let filasActualizadas = 0;
    for (let i = 0; i < pares.length; i += 50) {
      const chunk = pares.slice(i, i + 50);
      const results = await Promise.all(
        chunk.map(p => pool.query(
          'UPDATE Dynamic_Servicios SET Proveedor = ? WHERE Proveedor = ?',
          [p.idDestino, p.textoOriginal]
        ))
      );
      results.forEach(([r]) => {
        filasActualizadas += (r.affectedRows || 0);
      });
    }

    res.json({
      ok: true,
      valoresNormalizados: pares.length,
      filasActualizadas
    });
  } catch (err) {
    console.error('[facturacion] POST /api/maestro-proveedores/ejecutar-normalizacion-textos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/maestro-proveedores/:id/servicios ─────────────────────────────
router.get('/api/maestro-proveedores/:id/servicios', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { id } = req.params;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [rows] = await pool.query(`
      SELECT
        s.IdServicio AS idServicio,
        s.IdRecibo AS idRecibo,
        r.\`Consecutivo Recibo\` AS consecutivoRecibo,
        DATE_FORMAT(s.\`Hora Inicio\`, '%Y-%m-%d %H:%i') AS fechaServicio,
        r.\`Operación\` AS operacion,
        ar.AREA AS area,
        ca.Actividad AS actividad,
        mp.Placa AS placa,
        s.Vehiculo AS vehiculo,
        s.Cantidad AS cantidad,
        s.Unidad AS unidad,
        s.\`Valor Unitario\` AS valorUnitario,
        ROUND(COALESCE(s.Cantidad, 0) * COALESCE(s.\`Valor Unitario\`, 0)) AS subtotal,
        COALESCE(r.\`Cliente a Facturar\`, mc.\`Razón social\`) AS cliente,
        r.Nit AS nit,
        s.\`Forma De Pago\` AS formaDePago,
        s.Estado AS estado,
        s.Usuario AS usuario,
        DATE_FORMAT(s.Fecha, '%Y-%m-%d %H:%i:%s') AS fechaRegistro
      FROM Dynamic_Servicios s
      LEFT JOIN Dynamic_Recibos r ON s.IdRecibo = r.IdRecibo
      LEFT JOIN Config_Area ar ON s.Area = ar.ID
      LEFT JOIN Config_Actividad ca ON s.Actividad = ca.ID
      LEFT JOIN Maestro_Placas mp ON s.PL1 = mp.ID
      LEFT JOIN Maestro_Clientes mc ON r.Nit = mc.\`Código\`
      WHERE s.Proveedor = ?
      ORDER BY s.\`Hora Inicio\` DESC, s.IdServicio DESC
      LIMIT 500
    `, [id]);

    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/maestro-proveedores/:id/servicios:', err);
    res.status(500).json([]);
  }
});

// ── GET /api/maestro-placas (Listado de Maestro_Placas) ────────────────────
// ── Acceso a la pestaña Clientes (mismo criterio de los listados de maestros) ──
async function accesoMaestrosClientes(usuario) {
  return (await computarAccesoFacturacion(usuario, 'Clientes'))
    || (await computarAccesoFacturacion(usuario, 'Clientes_credito'))
    || (await computarAccesoFacturacion(usuario, 'Transportadora'))
    || (await computarAccesoFacturacion(usuario, 'Proveedor'))
    || (await computarAccesoFacturacion(usuario, 'Placas'))
    || (await computarAccesoFacturacion(usuario, 'Servicios'))
    || (await computarAccesoFacturacion(usuario, 'Recibos'));
}

// Texto de un maestro sin espacios repetidos y en mayúsculas (como lo guarda el botón Agregar).
function normalizarNombreMaestro(valor) {
  return String(valor || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

// ── POST /api/maestro-transportadoras y /api/maestro-proveedores (Agregar) ──
// Solo se escribe el nombre: no se permite duplicado (sin distinguir mayúsculas ni espacios),
// el ID es un UUID y Usuario/Fecha Ingreso se llenan con el usuario actual y la hora de Bogotá.
async function crearRegistroMaestro(req, res, { tabla, columna, etiqueta }) {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    if (!(await puedeGestionarMaestros(acceso.rol))) {
      return res.status(403).json({ error: `No autorizado para agregar ${etiqueta}.` });
    }

    const nombre = normalizarNombreMaestro(req.body.nombre);
    if (!nombre) return res.status(400).json({ error: `El nombre de ${etiqueta} es obligatorio.` });

    const [dup] = await pool.query(
      `SELECT ID AS id, \`${columna}\` AS nombre FROM ${tabla}
       WHERE REGEXP_REPLACE(UPPER(TRIM(\`${columna}\`)), '[[:space:]]+', ' ') = ? LIMIT 1`,
      [nombre]
    );
    if (dup.length) {
      return res.status(409).json({ error: `Ya existe ${etiqueta} "${dup[0].nombre}" (ID: ${dup[0].id}).`, existente: dup[0] });
    }

    const id = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO ${tabla} (ID, \`${columna}\`, Usuario, \`Fecha Ingreso\`) VALUES (?, ?, ?, ?)`,
      [id, nombre, acceso.usuarioId || usuario, formatearAhoraBogota()]
    );
    res.json({ ok: true, id, nombre });
  } catch (err) {
    console.error(`[facturacion] POST crear ${tabla}:`, err);
    res.status(500).json({ error: err.message });
  }
}
router.post('/api/maestro-transportadoras', (req, res) =>
  crearRegistroMaestro(req, res, { tabla: 'Maestro_Transportadora', columna: 'Transportadora', etiqueta: 'la transportadora' }));
router.post('/api/maestro-proveedores', (req, res) =>
  crearRegistroMaestro(req, res, { tabla: 'Maestro_Proveedor', columna: 'Proveedor', etiqueta: 'el proveedor' }));

// ══════════════════════════════════════════════════════════════════════════════
// ── SUBPESTAÑA PLACAS (Maestro_Placas; Dynamic_Servicios.PL1 guarda el ID) ────
// ══════════════════════════════════════════════════════════════════════════════

// Clave de duplicado: misma Placa (sin mayúsculas ni espacios) y mismo Nit; si no hay Nit,
// el mismo Cliente Crédito (placas de crédito antiguas sin Nit).
function claveDuplicadoPlaca(p) {
  const placa = String(p.placa || '').trim().toUpperCase();
  const nit = p.nit == null || p.nit === '' ? `CC:${String(p.clienteCredito || '').trim().toUpperCase()}` : String(p.nit);
  return `${placa}|${nit}`;
}

// ── GET /api/maestro-placas (Listado con cliente y conteo de servicios) ─────
router.get('/api/maestro-placas', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const [[rows], [counts]] = await Promise.all([
      pool.query(`
        SELECT
          mp.ID AS id,
          mp.Placa AS placa,
          mp.\`Tipo Cliente\` AS tipoCliente,
          mp.\`Cliente Credito\` AS clienteCredito,
          mp.Nit AS nit,
          mc.\`Razón social\` AS razonSocial,
          mp.Usuario AS usuario,
          DATE_FORMAT(mp.\`Fecha Registro\`, '%Y-%m-%d %H:%i:%s') AS fechaRegistro,
          mp.tipo_vehiculo AS tipoVehiculo,
          mp.empleado AS empleado
        FROM Maestro_Placas mp
        LEFT JOIN Maestro_Clientes mc ON mc.\`Código\` = mp.Nit
        ORDER BY mp.\`Fecha Registro\` DESC, mp.Placa ASC
      `),
      pool.query(`
        SELECT PL1 AS id, COUNT(*) AS cnt
        FROM Dynamic_Servicios
        WHERE PL1 IS NOT NULL AND PL1 != ''
        GROUP BY PL1
      `)
    ]);

    const countMap = new Map(counts.map(c => [String(c.id), Number(c.cnt) || 0]));
    res.json(rows.map(r => ({
      ...r,
      // Columna CLIENTE: "Código - Razón social" de Maestro_Clientes según el Nit de la placa
      cliente: r.nit == null ? '' : `${r.nit} - ${r.razonSocial ? String(r.razonSocial).trim() : '(no está en Maestro_Clientes)'}`,
      totalServicios: countMap.get(String(r.id)) || 0
    })));
  } catch (err) {
    console.error('[facturacion] GET /api/maestro-placas:', err);
    res.status(500).json([]);
  }
});

// ── GET /api/maestro-placas/clientes-credito (opciones del formulario Agregar) ─
router.get('/api/maestro-placas/clientes-credito', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!(await accesoMaestrosClientes(usuario))) return res.status(403).json({ error: 'No autorizado' });

    const [rows] = await pool.query(
      'SELECT `Cliente a Facturar` AS clienteAFacturar, Nit AS nit, Nombre AS nombre, Bloqueo AS bloqueo FROM Maestro_Clientes_Credito ORDER BY `Cliente a Facturar`'
    );
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/maestro-placas/clientes-credito:', err);
    res.status(500).json([]);
  }
});

// ── GET /api/maestro-placas/buscar-clientes?q= (Código o Razón social de Maestro_Clientes;
// la columna distingue mayúsculas, por eso se compara en mayúscula) ─
router.get('/api/maestro-placas/buscar-clientes', async (req, res) => {
  try {
    const { usuario, q } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!(await accesoMaestrosClientes(usuario))) return res.status(403).json({ error: 'No autorizado' });

    const texto = String(q || '').trim();
    if (texto.length < 2) return res.json([]);
    const qLike = `%${texto}%`;
    const [rows] = await pool.execute(
      `SELECT \`Código\` AS codigo, \`Razón social\` AS razonSocial
       FROM Maestro_Clientes
       WHERE UPPER(\`Razón social\`) LIKE UPPER(?) OR CAST(\`Código\` AS CHAR) LIKE ?
       ORDER BY \`Razón social\` ASC
       LIMIT 20`,
      [qLike, qLike]
    );
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/maestro-placas/buscar-clientes:', err);
    res.status(500).json([]);
  }
});

// ── POST /api/maestro-placas (Agregar) ───────────────────────────────────────
// body: { placa, tipoCliente: 'CONTADO'|'CREDITO', clienteCredito, nit }
// CREDITO exige Cliente Crédito y el Nit se toma de Maestro_Clientes_Credito; CONTADO usa el Nit
// opcional escogido de Maestro_Clientes. tipo_vehiculo y empleado quedan en NULL.
router.post('/api/maestro-placas', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const placa = String(req.body.placa || '').replace(/\s+/g, '').toUpperCase();
    const tipoCliente = String(req.body.tipoCliente || '').trim().toUpperCase();
    if (!placa) return res.status(400).json({ error: 'La Placa es obligatoria.' });
    if (!['CONTADO', 'CREDITO'].includes(tipoCliente)) return res.status(400).json({ error: 'Escoge el Tipo Cliente: CONTADO o CREDITO.' });

    let clienteCredito = null;
    let nit = null;
    if (tipoCliente === 'CREDITO') {
      const cc = String(req.body.clienteCredito || '').trim();
      if (!cc) return res.status(400).json({ error: 'Para CREDITO el Cliente Crédito es obligatorio.' });
      const [ccRows] = await pool.execute(
        'SELECT `Cliente a Facturar` AS clienteAFacturar, Nit AS nit FROM Maestro_Clientes_Credito WHERE `Cliente a Facturar` = ? LIMIT 1',
        [cc]
      );
      if (!ccRows.length) return res.status(400).json({ error: `El Cliente Crédito "${cc}" no existe en Maestro_Clientes_Credito.` });
      clienteCredito = ccRows[0].clienteAFacturar;
      nit = ccRows[0].nit == null ? null : Number(ccRows[0].nit);
    } else if (req.body.nit !== undefined && req.body.nit !== null && String(req.body.nit).trim() !== '') {
      const nitNum = Number(String(req.body.nit).replace(/[^0-9]/g, ''));
      if (!nitNum) return res.status(400).json({ error: 'El Nit no es válido.' });
      const [mc] = await pool.execute('SELECT `Código` FROM Maestro_Clientes WHERE `Código` = ? LIMIT 1', [nitNum]);
      if (!mc.length) return res.status(400).json({ error: `El Nit ${nitNum} no existe en Maestro_Clientes.` });
      nit = nitNum;
    }

    const [dup] = await pool.query(
      'SELECT ID AS id, Placa AS placa FROM Maestro_Placas WHERE UPPER(TRIM(Placa)) = ? AND Nit <=> ? AND (? IS NOT NULL OR `Cliente Credito` <=> ?) LIMIT 1',
      [placa, nit, nit, clienteCredito]
    );
    if (dup.length) {
      return res.status(409).json({ error: `Ya existe la placa ${dup[0].placa} con ese cliente (ID: ${dup[0].id}).`, existente: dup[0] });
    }

    const id = crypto.randomUUID();
    await pool.execute(
      'INSERT INTO Maestro_Placas (ID, Placa, `Tipo Cliente`, `Cliente Credito`, Nit, Usuario, `Fecha Registro`, tipo_vehiculo, empleado) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)',
      [id, placa, tipoCliente, clienteCredito, nit, acceso.usuarioId || usuario, formatearAhoraBogota()]
    );
    res.json({ ok: true, id, placa, tipoCliente, clienteCredito, nit });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe esa placa con ese Nit.' });
    console.error('[facturacion] POST /api/maestro-placas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT/POST /api/maestro-placas/:id (Editar Placa) ─────────────────────────
async function handleActualizarPlaca(req, res) {
  try {
    const { usuario } = req.query;
    const id = req.params.id || req.body.id;
    const { placa, tipoCliente } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await accesoMaestrosClientes(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    if (!id) return res.status(400).json({ error: 'ID es obligatorio' });

    if (!(await puedeGestionarMaestros(acceso.rol))) {
      return res.status(403).json({ error: 'No autorizado para editar placas.' });
    }

    const placaVal = String(placa || '').replace(/\s+/g, '').toUpperCase();
    if (!placaVal) return res.status(400).json({ error: 'La placa es obligatoria.' });

    const tipoClienteVal = String(tipoCliente || '').trim().toUpperCase();
    if (!['CONTADO', 'CREDITO'].includes(tipoClienteVal)) {
      return res.status(400).json({ error: 'Tipo Cliente debe ser CONTADO o CREDITO.' });
    }

    let clienteCredito = null;
    let nit = null;

    if (tipoClienteVal === 'CREDITO') {
      const cc = String(req.body.clienteCredito || '').trim();
      if (!cc) return res.status(400).json({ error: 'Para CREDITO el Cliente Crédito es obligatorio.' });
      const [ccRows] = await pool.execute(
        'SELECT `Cliente a Facturar` AS clienteAFacturar, Nit AS nit FROM Maestro_Clientes_Credito WHERE `Cliente a Facturar` = ? LIMIT 1',
        [cc]
      );
      if (!ccRows.length) return res.status(400).json({ error: `El Cliente Crédito "${cc}" no existe en Maestro_Clientes_Credito.` });
      clienteCredito = ccRows[0].clienteAFacturar;
      nit = ccRows[0].nit == null ? null : Number(ccRows[0].nit);
    } else if (req.body.nit !== undefined && req.body.nit !== null && String(req.body.nit).trim() !== '') {
      const nitNum = Number(String(req.body.nit).replace(/[^0-9]/g, ''));
      if (nitNum) {
        const [mc] = await pool.execute('SELECT `Código` FROM Maestro_Clientes WHERE `Código` = ? LIMIT 1', [nitNum]);
        if (mc.length) nit = nitNum;
      }
    }

    const [result] = await pool.execute(
      'UPDATE Maestro_Placas SET Placa = ?, `Tipo Cliente` = ?, `Cliente Credito` = ?, Nit = ? WHERE ID = ?',
      [placaVal, tipoClienteVal, clienteCredito, nit, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Placa no encontrada' });
    }

    res.json({ ok: true, id, placa: placaVal, tipoCliente: tipoClienteVal, clienteCredito, nit });
  } catch (err) {
    console.error('[facturacion] UPDATE maestro-placas:', err);
    res.status(500).json({ error: err.message });
  }
}
router.put('/api/maestro-placas/:id', handleActualizarPlaca);
router.post('/api/maestro-placas/actualizar', handleActualizarPlaca);

// Acceso + permiso de depurar maestros (Config_Parametros, facturacion / Clientes); si no, responde.
async function exigirDepuradorMaestros(req, res) {
  const { usuario } = req.query;
  if (!usuario) { res.status(400).json({ error: 'usuario requerido' }); return null; }
  const acceso = await accesoMaestrosClientes(usuario);
  if (!acceso) { res.status(403).json({ error: 'No autorizado' }); return null; }
  if (!(await puedeDepurarMaestros(acceso.rol))) {
    res.status(403).json({ error: 'Tu rol no tiene permiso para depurar los maestros de Clientes.' });
    return null;
  }
  return acceso;
}

// ── POST /api/maestro-placas/convertir-mayusculas (provisional) ──────────────
// La columna Placa distingue mayúsculas y (Placa, Nit) es único: solo se convierten las placas
// cuya versión en mayúscula no choca con otra; las que chocan son duplicados por unificar.
router.post('/api/maestro-placas/convertir-mayusculas', async (req, res) => {
  try {
    if (!(await exigirDepuradorMaestros(req, res))) return;

    const [rows] = await pool.query('SELECT ID AS id, Placa AS placa, Nit AS nit, `Cliente Credito` AS clienteCredito FROM Maestro_Placas WHERE Placa IS NOT NULL');
    const porClave = new Map();
    rows.forEach(r => {
      const k = claveDuplicadoPlaca(r);
      if (!porClave.has(k)) porClave.set(k, []);
      porClave.get(k).push(r);
    });

    const ids = [];
    let omitidas = 0;
    for (const grupo of porClave.values()) {
      const pendientes = grupo.filter(r => r.placa !== String(r.placa).trim().toUpperCase());
      if (!pendientes.length) continue;
      if (grupo.length > 1) { omitidas += pendientes.length; continue; } // duplicado: unificar primero
      ids.push(pendientes[0].id);
    }

    let actualizados = 0;
    for (let i = 0; i < ids.length; i += 1000) {
      const [r] = await pool.query('UPDATE Maestro_Placas SET Placa = UPPER(TRIM(Placa)) WHERE ID IN (?)', [ids.slice(i, i + 1000)]);
      actualizados += r.changedRows ?? r.affectedRows ?? 0;
    }
    res.json({ ok: true, actualizados, omitidasPorDuplicado: omitidas });
  } catch (err) {
    console.error('[facturacion] POST /api/maestro-placas/convertir-mayusculas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/maestro-placas/unificar-duplicados ────────────────────────────
// body: { grupos: [{ idConservar, idsEliminar }] }. Los servicios (PL1) de los eliminados pasan
// al conservado, que queda con la placa en mayúscula. Solo une placas con la misma clave.
router.post('/api/maestro-placas/unificar-duplicados', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    if (!(await exigirDepuradorMaestros(req, res))) return;
    const grupos = Array.isArray(req.body.grupos) ? req.body.grupos : [];
    if (!grupos.length) return res.status(400).json({ error: 'No se recibieron grupos de duplicados para unificar' });

    await conn.beginTransaction();
    let serviciosReasignados = 0, registrosEliminados = 0, gruposProcesados = 0, gruposOmitidos = 0;

    for (const g of grupos) {
      const idConservar = String(g.idConservar || '').trim();
      const idsEliminar = (Array.isArray(g.idsEliminar) ? g.idsEliminar : [])
        .map(x => String(x || '').trim()).filter(x => x && x !== idConservar);
      if (!idConservar || !idsEliminar.length) continue;

      const [filas] = await conn.query(
        'SELECT ID AS id, Placa AS placa, Nit AS nit, `Cliente Credito` AS clienteCredito FROM Maestro_Placas WHERE ID IN (?)',
        [[idConservar, ...idsEliminar]]
      );
      const conservar = filas.find(f => f.id === idConservar);
      const clave = conservar && claveDuplicadoPlaca(conservar);
      const validos = filas.filter(f => f.id !== idConservar && claveDuplicadoPlaca(f) === clave).map(f => f.id);
      if (!conservar || !validos.length) { gruposOmitidos++; continue; }

      const [upd] = await conn.query('UPDATE Dynamic_Servicios SET PL1 = ? WHERE PL1 IN (?)', [idConservar, validos]);
      const [del] = await conn.query('DELETE FROM Maestro_Placas WHERE ID IN (?)', [validos]);
      await conn.query('UPDATE Maestro_Placas SET Placa = UPPER(TRIM(Placa)) WHERE ID = ?', [idConservar]);
      serviciosReasignados += upd.affectedRows || 0;
      registrosEliminados += del.affectedRows || 0;
      gruposProcesados++;
    }

    await conn.commit();
    res.json({ ok: true, gruposProcesados, gruposOmitidos, serviciosReasignados, registrosEliminados });
  } catch (err) {
    await conn.rollback();
    console.error('[facturacion] POST /api/maestro-placas/unificar-duplicados:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ── POST /api/maestro-placas/eliminar-masivo ────────────────────────────────
// Los servicios asociados quedan con PL1 vacío ('' y no NULL: el trigger de auditoría de
// Dynamic_Servicios no acepta NULL) y luego se borra la placa.
router.post('/api/maestro-placas/eliminar-masivo', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    if (!(await exigirDepuradorMaestros(req, res))) return;
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : [req.body.id]).map(x => String(x || '').trim()).filter(Boolean);
    if (!ids.length) return res.status(400).json({ error: 'No se recibieron IDs para eliminar' });

    await conn.beginTransaction();
    const [upd] = await conn.query("UPDATE Dynamic_Servicios SET PL1 = '' WHERE PL1 IN (?)", [ids]);
    const [del] = await conn.query('DELETE FROM Maestro_Placas WHERE ID IN (?)', [ids]);
    await conn.commit();
    res.json({ ok: true, eliminados: del.affectedRows || 0, serviciosDesvinculados: upd.affectedRows || 0 });
  } catch (err) {
    await conn.rollback();
    console.error('[facturacion] POST /api/maestro-placas/eliminar-masivo:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ── POST /api/maestro-placas/eliminar-reemplazar ────────────────────────────
// body: { idReemplazo, idsEliminar }: los servicios pasan a otra placa (Placa + Nit) y se borran.
router.post('/api/maestro-placas/eliminar-reemplazar', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    if (!(await exigirDepuradorMaestros(req, res))) return;
    const idReemplazo = String(req.body.idReemplazo || '').trim();
    if (!idReemplazo) return res.status(400).json({ error: 'Se requiere la placa de reemplazo' });
    const idsEliminar = (Array.isArray(req.body.idsEliminar) ? req.body.idsEliminar : [req.body.idEliminar])
      .map(x => String(x || '').trim()).filter(x => x && x !== idReemplazo);
    if (!idsEliminar.length) return res.status(400).json({ error: 'No se recibieron IDs para eliminar' });

    const [destino] = await pool.query('SELECT ID, Placa, Nit FROM Maestro_Placas WHERE ID = ? LIMIT 1', [idReemplazo]);
    if (!destino.length) return res.status(400).json({ error: 'La placa de reemplazo no existe' });

    await conn.beginTransaction();
    const [upd] = await conn.query('UPDATE Dynamic_Servicios SET PL1 = ? WHERE PL1 IN (?)', [idReemplazo, idsEliminar]);
    const [del] = await conn.query('DELETE FROM Maestro_Placas WHERE ID IN (?) AND ID != ?', [idsEliminar, idReemplazo]);
    await conn.commit();
    res.json({
      ok: true,
      eliminados: del.affectedRows || 0,
      idReemplazo,
      nombreReemplazo: `${destino[0].Placa}${destino[0].Nit ? ' · ' + destino[0].Nit : ''}`,
      serviciosReasignados: upd.affectedRows || 0
    });
  } catch (err) {
    await conn.rollback();
    console.error('[facturacion] POST /api/maestro-placas/eliminar-reemplazar:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ── GET /api/maestro-placas/:id/servicios (servicios con PL1 = esa placa) ────
router.get('/api/maestro-placas/:id/servicios', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!(await accesoMaestrosClientes(usuario))) return res.status(403).json({ error: 'No autorizado' });

    const [rows] = await pool.query(`
      SELECT
        s.IdServicio AS idServicio,
        s.IdRecibo AS idRecibo,
        r.\`Consecutivo Recibo\` AS consecutivoRecibo,
        DATE_FORMAT(s.\`Hora Inicio\`, '%Y-%m-%d %H:%i') AS fechaServicio,
        r.\`Operación\` AS operacion,
        ar.AREA AS area,
        ca.Actividad AS actividad,
        mp.Placa AS placa,
        s.Vehiculo AS vehiculo,
        s.Cantidad AS cantidad,
        s.Unidad AS unidad,
        s.\`Valor Unitario\` AS valorUnitario,
        ROUND(COALESCE(s.Cantidad, 0) * COALESCE(s.\`Valor Unitario\`, 0)) AS subtotal,
        COALESCE(r.\`Cliente a Facturar\`, mc.\`Razón social\`) AS cliente,
        r.Nit AS nit,
        s.\`Forma De Pago\` AS formaDePago,
        s.Estado AS estado,
        s.Usuario AS usuario,
        DATE_FORMAT(s.Fecha, '%Y-%m-%d %H:%i:%s') AS fechaRegistro
      FROM Dynamic_Servicios s
      LEFT JOIN Dynamic_Recibos r ON s.IdRecibo = r.IdRecibo
      LEFT JOIN Config_Area ar ON s.Area = ar.ID
      LEFT JOIN Config_Actividad ca ON s.Actividad = ca.ID
      LEFT JOIN Maestro_Placas mp ON s.PL1 = mp.ID
      LEFT JOIN Maestro_Clientes mc ON r.Nit = mc.\`Código\`
      WHERE s.PL1 = ?
      ORDER BY s.\`Hora Inicio\` DESC, s.IdServicio DESC
      LIMIT 500
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/maestro-placas/:id/servicios:', err);
    res.status(500).json([]);
  }
});

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
      proveedor: 'COALESCE(mpr.Proveedor, s.Proveedor)',
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
        COALESCE(mpr.Proveedor, s.Proveedor) as proveedor,
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
      LEFT JOIN Maestro_Proveedor mpr ON s.Proveedor = mpr.ID
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

// ══════════════════════════════════════════════════════════════════════════════
// ── CARGA MASIVA DE SERVICIOS (Editor de Grid — Reemplazo de Plano Servicios V7)
// ══════════════════════════════════════════════════════════════════════════════

function normalizarClaveCatalogo(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function limpiarValorPlano(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (s === '' || s === '0' || s.toUpperCase() === 'NULL') return '';
  return s;
}

function parseNumeroPlano(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) && val !== 0 ? val : null;
  let s = String(val).replace(/\$/g, '').replace(/\s+/g, '').trim();
  if (!s || s === '0') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > -1) {
    const parts = s.split('.');
    if (parts.length > 2) {
      s = parts.join('');
    }
  }
  const num = parseFloat(s);
  if (!Number.isFinite(num) || num === 0) return null;
  return Math.round(num * 1000) / 1000;
}

// Convierte una fecha ("YYYY-MM-DD", "DD/MM/YYYY", "DD-MM-YYYY", con o sin hora) a "YYYY-MM-DD HH:MM:SS"
function parseFechaHoraPlano(rawValue, fallbackDateStr = null) {
  const s = limpiarValorPlano(rawValue);
  if (!s) return null;

  // Caso solo hora ("08:30", "8:30:00", "14:00") combinada con la fecha base
  const onlyTimeMatch = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap]\.?\s*m\.?))?$/i);
  if (onlyTimeMatch && fallbackDateStr) {
    const baseDate = fallbackDateStr.split(' ')[0];
    let hh = parseInt(onlyTimeMatch[1], 10);
    const mm = parseInt(onlyTimeMatch[2], 10);
    const ss = parseInt(onlyTimeMatch[3] || '0', 10);
    const ampm = (onlyTimeMatch[4] || '').toLowerCase().replace(/\./g, '').trim();
    if (ampm === 'pm' && hh < 12) hh += 12;
    if (ampm === 'am' && hh === 12) hh = 0;
    const pad = n => String(n).padStart(2, '0');
    return `${baseDate} ${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  }

  // Reemplazar T de datetime-local
  const norm = s.replace('T', ' ').trim();

  // Formato YYYY-MM-DD [HH:MM[:SS]]
  const isoMatch = norm.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap]\.?\s*m\.?))?)?$/i);
  if (isoMatch) {
    const y = isoMatch[1];
    const mo = String(isoMatch[2]).padStart(2, '0');
    const d = String(isoMatch[3]).padStart(2, '0');
    let hh = parseInt(isoMatch[4] || '0', 10);
    const mm = String(isoMatch[5] || '00').padStart(2, '0');
    const ss = String(isoMatch[6] || '00').padStart(2, '0');
    const ampm = (isoMatch[7] || '').toLowerCase().replace(/\./g, '').trim();
    if (ampm === 'pm' && hh < 12) hh += 12;
    if (ampm === 'am' && hh === 12) hh = 0;
    return `${y}-${mo}-${d} ${String(hh).padStart(2, '0')}:${mm}:${ss}`;
  }

  // Formato DD/MM/YYYY o DD-MM-YYYY [HH:MM[:SS]]
  const dmyMatch = norm.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap]\.?\s*m\.?))?)?$/i);
  if (dmyMatch) {
    const d = String(dmyMatch[1]).padStart(2, '0');
    const mo = String(dmyMatch[2]).padStart(2, '0');
    const y = dmyMatch[3];
    let hh = parseInt(dmyMatch[4] || '0', 10);
    const mm = String(dmyMatch[5] || '00').padStart(2, '0');
    const ss = String(dmyMatch[6] || '00').padStart(2, '0');
    const ampm = (dmyMatch[7] || '').toLowerCase().replace(/\./g, '').trim();
    if (ampm === 'pm' && hh < 12) hh += 12;
    if (ampm === 'am' && hh === 12) hh = 0;
    return `${y}-${mo}-${d} ${String(hh).padStart(2, '0')}:${mm}:${ss}`;
  }

  return null;
}

// Caché en memoria (TTL 5 min) de los catálogos pequeños para Carga Masiva
// (Operaciones, Áreas, Actividades, Vehículos, Unidades, Duraciones, Clientes Crédito).
// Maestro_Transportadora (~10.800 filas), Maestro_Proveedor (~7.300) y Maestro_Placas (~57.000)
// NO se descargan completos al navegador para no bloquear la UI; se validan por lote con índice.
let cachedMasivoLookupsBase = null;
let lastMasivoLookupsFetch = 0;

async function getMasivoLookupsBase() {
  const now = Date.now();
  if (cachedMasivoLookupsBase && (now - lastMasivoLookupsFetch < 300000)) {
    return cachedMasivoLookupsBase;
  }
  const [
    [opRows],
    [areaRows],
    [actRows],
    [vehRows],
    [uniRows],
    [durRows],
    [cliCredRows],
    [transpInitRows],
    [provInitRows],
    [placasInitRows]
  ] = await Promise.all([
    pool.query(
      "SELECT `OPERACIÓN` as operacion, REGIONAL as regional, ZONA as zona, `C.C.` as cc, `CODIGO CO SIESA` as codigoSiesa FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY `OPERACIÓN` ASC"
    ),
    pool.query(
      "SELECT ID as id, AREA as area, `OPERACIÓN` as operacion, OPERATIVO as operativo, ADMINISTRATIVO as administrativo FROM Config_Area ORDER BY `OPERACIÓN` ASC, AREA ASC"
    ),
    pool.query(
      "SELECT ID as id, Actividad as actividad, `Operación` as operacion FROM Config_Actividad ORDER BY `Operación` ASC, Actividad ASC"
    ),
    pool.query('SELECT Vehiculo as vehiculo FROM Config_Vehiculo ORDER BY Vehiculo ASC'),
    pool.query('SELECT Unidad as unidad FROM Config_Unidad ORDER BY Unidad ASC'),
    pool.query('SELECT `Duración` as duracion, CAST(Tiempo AS CHAR) as tiempo FROM `Config_Duración` ORDER BY Tiempo ASC'),
    pool.query('SELECT ID as id, Bloqueo as bloqueo, `Cliente a Facturar` as clienteAFacturar, Nit as nit, Nombre as nombre FROM Maestro_Clientes_Credito ORDER BY `Cliente a Facturar` ASC'),
    pool.query("SELECT ID as id, Transportadora as transportadora FROM Maestro_Transportadora WHERE Transportadora IS NOT NULL AND Transportadora <> '' ORDER BY Transportadora ASC LIMIT 50"),
    pool.query("SELECT ID as id, Proveedor as proveedor FROM Maestro_Proveedor WHERE Proveedor IS NOT NULL AND Proveedor <> '' ORDER BY Proveedor ASC LIMIT 50"),
    pool.query("SELECT ID as id, Placa as placa, `Tipo Cliente` as tipoCliente, `Cliente Credito` as clienteCredito, Nit as nit FROM Maestro_Placas WHERE Placa IS NOT NULL AND Placa <> '' ORDER BY `Fecha Registro` DESC LIMIT 50")
  ]);

  cachedMasivoLookupsBase = {
    opRows,
    areaRows,
    actRows,
    vehiculos: vehRows.map(r => r.vehiculo).filter(Boolean),
    unidades: uniRows.map(r => r.unidad).filter(Boolean),
    durRows,
    cliCredRows,
    transportadorasIniciales: transpInitRows,
    proveedoresIniciales: provInitRows,
    placasIniciales: placasInitRows
  };
  lastMasivoLookupsFetch = now;
  return cachedMasivoLookupsBase;
}

// Obtiene los Recibos que están en Amarillo o Pendiente (es decir, donde aún no todos sus
// servicios están en Verde: tienen al menos 1 servicio en Yellow/Red/NULL o tienen 0 servicios).
async function obtenerRecibosPendientesMasivo(acceso) {
  const [rNoVerdes, rSinServ] = await Promise.all([
    pool.query("SELECT DISTINCT IdRecibo FROM Dynamic_Servicios WHERE Estado IN ('Yellow', 'Red') OR Estado IS NULL").then(([r]) => r),
    pool.query("SELECT dr.IdRecibo FROM Dynamic_Recibos dr LEFT JOIN Dynamic_Servicios ds ON ds.IdRecibo = dr.IdRecibo WHERE ds.IdServicio IS NULL AND dr.`Consecutivo Recibo` IS NOT NULL").then(([r]) => r)
  ]);

  const setNoVerdes = new Set(rNoVerdes.map(x => x.IdRecibo).filter(Boolean));
  const setSinServ = new Set(rSinServ.map(x => x.IdRecibo).filter(Boolean));
  const ids = [...new Set([...setNoVerdes, ...setSinServ])];
  if (!ids.length) return [];

  const whereParts = ["IdRecibo IN (?)", "`Consecutivo Recibo` IS NOT NULL", "`Consecutivo Recibo` <> ''"];
  const params = [ids];

  if (!acceso.sinFiltro) {
    const ops = acceso.operacionesFiltro || [];
    if (!ops.length) return [];
    whereParts.push("`Operación` IN (?)");
    params.push(ops);
  }

  const [rows] = await pool.query(
    `SELECT IdRecibo as idRecibo, \`Consecutivo Recibo\` as consecutivo,
            \`Operación\` as operacion, Modalidad as modalidad,
            \`Cliente a Facturar\` as clienteAFacturar, Nit as nit,
            Telefono as telefono, Email as email
     FROM Dynamic_Recibos
     WHERE ${whereParts.join(' AND ')}
     ORDER BY Fecha DESC`,
    params
  );

  return rows.map(r => ({
    idRecibo: r.idRecibo,
    consecutivo: String(r.consecutivo || '').trim(),
    operacion: r.operacion || '',
    modalidad: (r.modalidad || '').toUpperCase(),
    clienteAFacturar: r.clienteAFacturar || '',
    nit: r.nit || null,
    telefono: r.telefono != null ? String(r.telefono).trim() : '',
    email: r.email ? String(r.email).trim() : '',
    estado: setSinServ.has(r.idRecibo) ? 'Red' : 'Yellow',
    todosEnVerde: false
  }));
}

// ── GET /api/servicios/masivo-lookups ─────────────────────────────────────────
router.get('/api/servicios/masivo-lookups', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Servicios')
                || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const cfg = await obtenerConfigServiciosMasivo(acceso.rol);
    if (!cfg.puedeCargaMasiva) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para usar la Carga Masiva de Servicios.' });
    }

    const [base, impuestos, recibosPendientes] = await Promise.all([
      getMasivoLookupsBase(),
      getImpuestos(),
      obtenerRecibosPendientesMasivo(acceso)
    ]);

    const operacionesPermitidas = acceso.sinFiltro
      ? base.opRows
      : base.opRows.filter(r => (acceso.operacionesFiltro || []).includes(r.operacion));

    res.json({
      usuarioRegistro: acceso.usuarioId || usuario,
      limites: cfg.limites,
      operaciones: operacionesPermitidas,
      areas: base.areaRows,
      actividades: base.actRows,
      vehiculos: base.vehiculos,
      unidades: base.unidades,
      duraciones: base.durRows,
      clientesCredito: base.cliCredRows,
      transportadorasIniciales: base.transportadorasIniciales || [],
      proveedoresIniciales: base.proveedoresIniciales || [],
      placasIniciales: base.placasIniciales || [],
      recibosPendientes,
      impuestos: {
        iva: impuestos.iva,
        reteFuente: impuestos.reteFuente,
        reteIva: impuestos.reteIva,
        reteFuenteValorBase: impuestos.reteFuenteValorBase,
        reteIvaValorBase: impuestos.reteIvaValorBase,
        reteIcaMap: impuestos.reteIcaMap,
        reteIcaValorBaseMap: impuestos.reteIcaValorBaseMap
      }
    });
  } catch (err) {
    console.error('[facturacion] GET /api/servicios/masivo-lookups:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/servicios/masivo-validar-lote ───────────────────────────────────
// Resuelve en lote (usando los índices de cada tabla) NITs (Maestro_Clientes),
// Placas (Maestro_Placas), Consecutivos Recibo (Dynamic_Recibos + estado de servicios),
// Transportadoras (Maestro_Transportadora) y Proveedores (Maestro_Proveedor).
router.post('/api/servicios/masivo-validar-lote', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Servicios')
                || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const cfg = await obtenerConfigServiciosMasivo(acceso.rol);
    if (!cfg.puedeCargaMasiva) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para usar la Carga Masiva de Servicios.' });
    }

    const body = req.body || {};
    const rawNits = Array.isArray(body.nits) ? body.nits : [];
    const rawPlacas = Array.isArray(body.placas) ? body.placas : [];
    const rawConsecutivos = Array.isArray(body.consecutivos) ? body.consecutivos : [];
    const rawTransportadoras = Array.isArray(body.transportadoras) ? body.transportadoras : [];
    const rawProveedores = Array.isArray(body.proveedores) ? body.proveedores : [];

    const nitsLimpios = [...new Set(
      rawNits
        .map(n => parseInt(String(n || '').replace(/[^0-9]/g, ''), 10))
        .filter(n => Number.isFinite(n) && n > 0)
    )].slice(0, 500);

    const placasLimpias = [...new Set(
      rawPlacas
        .map(p => String(p || '').trim().toUpperCase())
        .filter(Boolean)
    )].slice(0, 500);

    const consecutivosLimpios = [...new Set(
      rawConsecutivos
        .map(c => String(c || '').trim())
        .filter(Boolean)
    )].slice(0, 500);

    const transportadorasLimpias = [...new Set(
      rawTransportadoras
        .map(t => String(t || '').trim())
        .filter(Boolean)
    )].slice(0, 500);

    const proveedoresLimpios = [...new Set(
      rawProveedores
        .map(p => String(p || '').trim().toUpperCase())
        .filter(Boolean)
    )].slice(0, 500);

    const [clientesRows, placasRows, recibosRows, transpRows, provRows] = await Promise.all([
      nitsLimpios.length
        ? pool.query(
            `SELECT \`Código\` as codigo, \`Razón social\` as razonSocial, Telefono as telefono,
                    \`Correo F.E.\` as correoFE, RTSERVIC as rtservic, RTIVA as rtiva, RTICA as rtica
             FROM Maestro_Clientes
             WHERE \`Código\` IN (?)`,
            [nitsLimpios]
          ).then(([r]) => r)
        : Promise.resolve([]),
      placasLimpias.length
        ? pool.query(
            `SELECT ID as id, Placa as placa, \`Tipo Cliente\` as tipoCliente,
                    \`Cliente Credito\` as clienteCredito, Nit as nit
             FROM Maestro_Placas
             WHERE Placa IN (?)`,
            [placasLimpias]
          ).then(([r]) => r)
        : Promise.resolve([]),
      consecutivosLimpios.length
        ? pool.query(
            `SELECT dr.IdRecibo as idRecibo, dr.\`Consecutivo Recibo\` as consecutivo,
                    dr.\`Operación\` as operacion, dr.\`Cliente a Facturar\` as clienteAFacturar,
                    dr.Modalidad as modalidad, dr.Nit as nit, dr.Telefono as telefono, dr.Email as email,
                    COUNT(ds.IdServicio) as totalServicios,
                    SUM(CASE WHEN ds.Estado = 'Green' THEN 1 ELSE 0 END) as serviciosVerdes,
                    SUM(CASE WHEN ds.Estado = 'Yellow' THEN 1 ELSE 0 END) as serviciosAmarillos
             FROM Dynamic_Recibos dr
             LEFT JOIN Dynamic_Servicios ds ON ds.IdRecibo = dr.IdRecibo
             WHERE dr.\`Consecutivo Recibo\` IN (?)
             GROUP BY dr.IdRecibo`,
            [consecutivosLimpios]
          ).then(([r]) => r)
        : Promise.resolve([]),
      transportadorasLimpias.length
        ? pool.query(
            `SELECT ID as id, Transportadora as transportadora
             FROM Maestro_Transportadora
             WHERE Transportadora IN (?)`,
            [transportadorasLimpias]
          ).then(([r]) => r)
        : Promise.resolve([]),
      proveedoresLimpios.length
        ? pool.query(
            `SELECT ID as id, Proveedor as proveedor
             FROM Maestro_Proveedor
             WHERE Proveedor IN (?)`,
            [proveedoresLimpios]
          ).then(([r]) => r)
        : Promise.resolve([])
    ]);

    const clientesPorNit = {};
    clientesRows.forEach(c => {
      clientesPorNit[String(c.codigo)] = {
        codigo: c.codigo,
        razonSocial: (c.razonSocial || '').trim(),
        telefono: c.telefono ? String(c.telefono).trim() : '',
        correoFE: (c.correoFE || '').trim(),
        rtservic: c.rtservic || '',
        rtiva: c.rtiva || '',
        rtica: c.rtica || ''
      };
    });

    const placasPorNombre = {};
    placasRows.forEach(p => {
      const key = String(p.placa || '').trim().toUpperCase();
      if (key && !placasPorNombre[key]) {
        placasPorNombre[key] = {
          id: p.id,
          placa: key,
          tipoCliente: p.tipoCliente || '',
          clienteCredito: p.clienteCredito || '',
          nit: p.nit || null
        };
      }
    });

    const recibosPorConsecutivo = {};
    recibosRows.forEach(r => {
      const key = String(r.consecutivo || '').trim();
      if (key && !recibosPorConsecutivo[key]) {
        const totalS = Number(r.totalServicios) || 0;
        const verdesS = Number(r.serviciosVerdes) || 0;
        const amarillosS = Number(r.serviciosAmarillos) || 0;
        const todosEnVerde = totalS > 0 && verdesS === totalS;
        recibosPorConsecutivo[key] = {
          idRecibo: r.idRecibo,
          consecutivo: key,
          operacion: r.operacion || '',
          clienteAFacturar: r.clienteAFacturar || '',
          modalidad: (r.modalidad || '').toUpperCase(),
          nit: r.nit || null,
          telefono: r.telefono != null ? String(r.telefono).trim() : '',
          email: r.email ? String(r.email).trim() : '',
          estado: todosEnVerde ? 'Green' : (amarillosS > 0 ? 'Yellow' : 'Red'),
          todosEnVerde
        };
      }
    });

    const transportadorasPorNombre = {};
    transpRows.forEach(t => {
      const key = normalizarClaveCatalogo(t.transportadora);
      if (key && !transportadorasPorNombre[key]) {
        transportadorasPorNombre[key] = {
          id: t.id,
          transportadora: String(t.transportadora || '').trim()
        };
      }
    });

    const proveedoresPorNombre = {};
    provRows.forEach(p => {
      const key = normalizarClaveCatalogo(p.proveedor);
      if (key && !proveedoresPorNombre[key]) {
        proveedoresPorNombre[key] = {
          id: p.id,
          proveedor: String(p.proveedor || '').trim().toUpperCase()
        };
      }
    });

    res.json({
      clientesPorNit,
      placasPorNombre,
      recibosPorConsecutivo,
      transportadorasPorNombre,
      proveedoresPorNombre
    });
  } catch (err) {
    console.error('[facturacion] POST /api/servicios/masivo-validar-lote:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/servicios/guardar-masivo ────────────────────────────────────────
// Ejecuta en una única transacción MySQL el flujo completo de los 5 planos:
// 1) Maestro_Transportadora -> 2) Maestro_Proveedor -> 3) Maestro_Placas
// -> 4) Dynamic_Recibos -> 5) Dynamic_Servicios.
router.post('/api/servicios/guardar-masivo', async (req, res) => {
  let conn = null;
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoFacturacion(usuario, 'Servicios')
                || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const cfg = await obtenerConfigServiciosMasivo(acceso.rol);
    if (!cfg.puedeCargaMasiva) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para usar la Carga Masiva de Servicios.' });
    }

    const filasRaw = Array.isArray(req.body && req.body.filas) ? req.body.filas : [];
    const filasActivas = filasRaw.filter(f => {
      if (!f || typeof f !== 'object') return false;
      return Boolean(
        limpiarValorPlano(f.reciboNuevo) ||
        limpiarValorPlano(f.consecutivoRecibo) ||
        limpiarValorPlano(f.operacion) ||
        limpiarValorPlano(f.actividad) ||
        limpiarValorPlano(f.placa) ||
        limpiarValorPlano(f.cantidad) ||
        limpiarValorPlano(f.valorUnitario)
      );
    });

    if (!filasActivas.length) {
      return res.status(400).json({ error: 'No hay filas con datos para importar.' });
    }

    if (filasActivas.length > cfg.limites.servicios) {
      return res.status(400).json({
        error: `La carga tiene ${filasActivas.length} servicios y supera el límite máximo permitido (${cfg.limites.servicios}).`
      });
    }

    const [base, impuestos] = await Promise.all([
      getMasivoLookupsBase(),
      getImpuestos()
    ]);
    const { opRows, areaRows, actRows, durRows, cliCredRows } = base;

    const opMap = new Map();
    opRows.forEach(r => {
      opMap.set(normalizarClaveCatalogo(r.operacion), {
        operacion: r.operacion,
        zona: r.zona ? String(r.zona).trim() : null,
        cc: r.cc ? String(r.cc).trim() : null,
        codigoSiesa: r.codigoSiesa != null ? String(r.codigoSiesa).trim() : ''
      });
    });

    const cliCredMap = new Map();
    cliCredRows.forEach(r => {
      cliCredMap.set(normalizarClaveCatalogo(r.clienteAFacturar), {
        clienteAFacturar: r.clienteAFacturar,
        nit: r.nit ? parseInt(r.nit, 10) : null
      });
    });

    const duracionPorTiempo = new Map();
    durRows.forEach(r => {
      if (r.tiempo) {
        const t = String(r.tiempo).trim();
        duracionPorTiempo.set(t, r.duracion);
        if (t.length === 8 && t.startsWith('0')) {
          duracionPorTiempo.set(t.slice(1), r.duracion);
        }
      }
    });

    // Recolectar solo los valores usados en este lote para consultarlos por índice
    const nitsParaBuscar = new Set();
    const placasParaBuscar = new Set();
    const transpParaBuscar = new Set();
    const provParaBuscar = new Set();
    const consecutivosParaBuscar = new Set();

    filasActivas.forEach(f => {
      const nitStr = limpiarValorPlano(f.nit).replace(/[^0-9]/g, '');
      if (nitStr) {
        const n = parseInt(nitStr, 10);
        if (Number.isFinite(n) && n > 0) nitsParaBuscar.add(n);
      }
      const pl = limpiarValorPlano(f.placa).toUpperCase();
      if (pl) placasParaBuscar.add(pl);
      const tr = limpiarValorPlano(f.transportadora);
      if (tr) transpParaBuscar.add(tr);
      const pr = limpiarValorPlano(f.proveedor).toUpperCase();
      if (pr) provParaBuscar.add(pr);
      const cons = limpiarValorPlano(f.consecutivoRecibo);
      if (cons) consecutivosParaBuscar.add(cons);
    });

    const [clientesRows, placasExistRows, transpRows, provRows, recibosExistRows] = await Promise.all([
      nitsParaBuscar.size
        ? pool.query(
            'SELECT `Código` as codigo, `Razón social` as razonSocial, Telefono as telefono, `Correo F.E.` as correoFE, RTSERVIC as rtservic, RTIVA as rtiva, RTICA as rtica FROM Maestro_Clientes WHERE `Código` IN (?)',
            [[...nitsParaBuscar]]
          ).then(([r]) => r)
        : Promise.resolve([]),
      placasParaBuscar.size
        ? pool.query(
            'SELECT ID as id, Placa as placa FROM Maestro_Placas WHERE Placa IN (?)',
            [[...placasParaBuscar]]
          ).then(([r]) => r)
        : Promise.resolve([]),
      transpParaBuscar.size
        ? pool.query(
            'SELECT ID as id, Transportadora as transportadora FROM Maestro_Transportadora WHERE Transportadora IN (?)',
            [[...transpParaBuscar]]
          ).then(([r]) => r)
        : Promise.resolve([]),
      provParaBuscar.size
        ? pool.query(
            'SELECT ID as id, Proveedor as proveedor FROM Maestro_Proveedor WHERE Proveedor IN (?)',
            [[...provParaBuscar]]
          ).then(([r]) => r)
        : Promise.resolve([]),
      consecutivosParaBuscar.size
        ? pool.query(
            `SELECT dr.IdRecibo as idRecibo, dr.\`Consecutivo Recibo\` as consecutivo,
                    dr.\`Operación\` as operacion, dr.\`Cliente a Facturar\` as clienteAFacturar,
                    dr.Modalidad as modalidad, dr.Nit as nit,
                    COUNT(ds.IdServicio) as totalServicios,
                    SUM(CASE WHEN ds.Estado = 'Green' THEN 1 ELSE 0 END) as serviciosVerdes
             FROM Dynamic_Recibos dr
             LEFT JOIN Dynamic_Servicios ds ON ds.IdRecibo = dr.IdRecibo
             WHERE dr.\`Consecutivo Recibo\` IN (?)
             GROUP BY dr.IdRecibo`,
            [[...consecutivosParaBuscar]]
          ).then(([r]) => r)
        : Promise.resolve([])
    ]);

    const transpMap = new Map();
    transpRows.forEach(r => {
      const k = normalizarClaveCatalogo(r.transportadora);
      if (k && !transpMap.has(k)) transpMap.set(k, { id: r.id, transportadora: r.transportadora.trim() });
    });

    const provMap = new Map();
    provRows.forEach(r => {
      const k = normalizarClaveCatalogo(r.proveedor);
      if (k && !provMap.has(k)) provMap.set(k, { id: r.id, proveedor: r.proveedor.trim().toUpperCase() });
    });

    const clientesMap = new Map();
    clientesRows.forEach(c => {
      clientesMap.set(Number(c.codigo), {
        codigo: Number(c.codigo),
        razonSocial: (c.razonSocial || '').trim(),
        telefono: c.telefono != null && String(c.telefono).trim() !== '0' ? String(c.telefono).trim() : '',
        correoFE: (c.correoFE || '').trim(),
        RTSERVIC: c.rtservic || '',
        RTIVA: c.rtiva || '',
        RTICA: c.rtica || ''
      });
    });

    // Si algún recibo existente trae Nit y no estaba en nitsParaBuscar, cargar también sus flags de Maestro_Clientes
    const nitsExtraRecibos = recibosExistRows
      .map(r => r.nit ? Number(r.nit) : null)
      .filter(n => n && !clientesMap.has(n));
    if (nitsExtraRecibos.length > 0) {
      const [extraCliRows] = await pool.query(
        'SELECT `Código` as codigo, `Razón social` as razonSocial, Telefono as telefono, `Correo F.E.` as correoFE, RTSERVIC as rtservic, RTIVA as rtiva, RTICA as rtica FROM Maestro_Clientes WHERE `Código` IN (?)',
        [[...new Set(nitsExtraRecibos)]]
      );
      extraCliRows.forEach(c => {
        clientesMap.set(Number(c.codigo), {
          codigo: Number(c.codigo),
          razonSocial: (c.razonSocial || '').trim(),
          telefono: c.telefono != null && String(c.telefono).trim() !== '0' ? String(c.telefono).trim() : '',
          correoFE: (c.correoFE || '').trim(),
          RTSERVIC: c.rtservic || '',
          RTIVA: c.rtiva || '',
          RTICA: c.rtica || ''
        });
      });
    }

    const placasMap = new Map();
    placasExistRows.forEach(p => {
      const k = String(p.placa || '').trim().toUpperCase();
      if (k && !placasMap.has(k)) placasMap.set(k, { id: p.id, placa: k });
    });

    const recibosExistentesMap = new Map();
    recibosExistRows.forEach(r => {
      const k = String(r.consecutivo || '').trim();
      if (k && !recibosExistentesMap.has(k)) {
        const totalS = Number(r.totalServicios) || 0;
        const verdesS = Number(r.serviciosVerdes) || 0;
        recibosExistentesMap.set(k, {
          idRecibo: r.idRecibo,
          consecutivo: k,
          operacion: r.operacion || '',
          clienteAFacturar: r.clienteAFacturar || '',
          modalidad: (r.modalidad || '').toUpperCase(),
          nit: r.nit || null,
          todosEnVerde: totalS > 0 && verdesS === totalS
        });
      }
    });

    const usuarioVal = acceso.usuarioId || usuario;
    const ahoraBogota = formatearAhoraBogota();

    // Procesar y validar fila por fila
    const datosProcesados = [];
    const ajustesPorOperacion = new Map(); // Config_Servicios resuelto por Operación + Modalidad
    for (let idx = 0; idx < filasActivas.length; idx++) {
      const f = filasActivas[idx];
      const numFila = idx + 1;

      const consecutivoReciboRaw = limpiarValorPlano(f.consecutivoRecibo);
      const reciboNuevoRaw = consecutivoReciboRaw ? '' : limpiarValorPlano(f.reciboNuevo);
      const opRaw = limpiarValorPlano(f.operacion);

      if (!consecutivoReciboRaw && !reciboNuevoRaw) {
        return res.status(400).json({
          error: `Fila ${numFila}: Debe indicar el "N° Recibo Nuevo" (1, 2, 3...) o seleccionar un "Consecutivo Recibo" existente.`
        });
      }
      if (!opRaw) {
        return res.status(400).json({
          error: `Fila ${numFila}: La columna "Operación" es obligatoria en todas las filas.`
        });
      }

      const opInfo = opMap.get(normalizarClaveCatalogo(opRaw));
      if (!opInfo) {
        return res.status(400).json({
          error: `Fila ${numFila}: La Operación "${opRaw}" no existe o está inactiva en Maestro_Operaciones.`
        });
      }
      if (!acceso.sinFiltro && !(acceso.operacionesFiltro || []).includes(opInfo.operacion)) {
        return res.status(403).json({
          error: `Fila ${numFila}: No tiene permiso para cargar servicios en la Operación "${opInfo.operacion}".`
        });
      }

      // Forma de Pago: 1, 2 (Contado/Recaudo) o 3 (Crédito)
      const fpRaw = limpiarValorPlano(f.formaDePago);
      const formaDePago = fpRaw ? parseInt(fpRaw, 10) : null;
      if (!formaDePago || ![1, 2, 3].includes(formaDePago)) {
        return res.status(400).json({
          error: `Fila ${numFila}: Forma de Pago inválida ("${fpRaw}"). Debe ser 1 (Efectivo), 2 (Transferencia) o 3 (Crédito).`
        });
      }

      let reciboNuevoGrupo = null;
      let reciboExistenteInfo = null;

      if (consecutivoReciboRaw) {
        reciboExistenteInfo = recibosExistentesMap.get(consecutivoReciboRaw);
        if (!reciboExistenteInfo) {
          return res.status(400).json({
            error: `Fila ${numFila}: El Consecutivo Recibo "${consecutivoReciboRaw}" no existe en la base de datos.`
          });
        }
        if (reciboExistenteInfo.todosEnVerde) {
          return res.status(400).json({
            error: `Fila ${numFila}: El Consecutivo Recibo "${consecutivoReciboRaw}" ya tiene todos sus servicios en Verde (completado) y no admite nuevos servicios.`
          });
        }
        if (normalizarClaveCatalogo(reciboExistenteInfo.operacion) !== normalizarClaveCatalogo(opInfo.operacion)) {
          return res.status(400).json({
            error: `Fila ${numFila}: El Consecutivo Recibo "${consecutivoReciboRaw}" pertenece a la operación "${reciboExistenteInfo.operacion}", no a "${opInfo.operacion}".`
          });
        }
        // Regla: si el recibo es RECAUDO, Forma de Pago solo puede ser 1 o 2; si es CREDITO, solo 3
        if (reciboExistenteInfo.modalidad === 'RECAUDO' && ![1, 2].includes(formaDePago)) {
          return res.status(400).json({
            error: `Fila ${numFila}: El Consecutivo Recibo "${consecutivoReciboRaw}" es RECAUDO; los servicios solo pueden tener Forma de Pago 1 (Efectivo) o 2 (Transferencia).`
          });
        }
        if (reciboExistenteInfo.modalidad === 'CREDITO' && formaDePago !== 3) {
          return res.status(400).json({
            error: `Fila ${numFila}: El Consecutivo Recibo "${consecutivoReciboRaw}" es CREDITO; los servicios solo pueden tener Forma de Pago 3 (Crédito).`
          });
        }
      } else {
        const numGrupo = parseInt(reciboNuevoRaw, 10);
        if (!Number.isFinite(numGrupo) || numGrupo <= 0 || String(numGrupo) !== reciboNuevoRaw.replace(/^0+/, '')) {
          return res.status(400).json({
            error: `Fila ${numFila}: "N° Recibo Nuevo" debe ser un número entero positivo (1, 2, 3...). Valor recibido: "${reciboNuevoRaw}".`
          });
        }
        reciboNuevoGrupo = String(numGrupo);
      }

      // Ajustes de la operación (Config_Servicios): las celdas vacías toman el valor por defecto
      const modalidadFila = formaDePago === 3 ? 'CREDITO' : 'RECAUDO';
      const claveAjustes = `${opInfo.operacion}|${modalidadFila}`;
      if (!ajustesPorOperacion.has(claveAjustes)) {
        ajustesPorOperacion.set(claveAjustes, await configServicios.resolverConfig({
          seccion: 'Servicio', operacion: opInfo.operacion, modalidad: modalidadFila, rol: acceso.rol
        }));
      }
      const ajustesFila = ajustesPorOperacion.get(claveAjustes);
      Object.values(ajustesFila).forEach((c) => {
        const celda = CELDA_MASIVO_POR_CAMPO[c.bodyKey];
        if (celda && c.defecto && !limpiarValorPlano(f[celda])) f[celda] = c.defecto;
      });

      // Fecha base
      const fechaParsed = parseFechaHoraPlano(f.fecha);
      const fechaSoloDia = (fechaParsed ? fechaParsed : ahoraBogota).split(' ')[0];
      const fechaBaseMedianoche = `${fechaSoloDia} 00:00:00`;

      // Hora Inicio y Hora Final: se diligencian como solo Hora; internamente el sistema les agrega la Fecha de la fila.
      // Si vienen vacías, por defecto se asigna 12:00 a.m. (00:00:00) a 1:00 a.m. (01:00:00) -> 1 Hora
      const horaInicioInput = limpiarValorPlano(f.horaInicio);
      const horaFinalInput = limpiarValorPlano(f.horaFinal);
      let horaInicioMysql = fechaBaseMedianoche;
      let horaFinalMysql = null;

      if (horaInicioInput) {
        const parsedInicio = parseFechaHoraPlano(horaInicioInput, fechaBaseMedianoche);
        if (!parsedInicio) {
          return res.status(400).json({
            error: `Fila ${numFila}: Formato inválido en Hora Inicio ("${horaInicioInput}").`
          });
        }
        horaInicioMysql = `${fechaSoloDia} ${parsedInicio.split(' ')[1] || '00:00:00'}`;

        if (horaFinalInput) {
          const parsedFinal = parseFechaHoraPlano(horaFinalInput, fechaBaseMedianoche);
          if (!parsedFinal) {
            return res.status(400).json({
              error: `Fila ${numFila}: Formato inválido en Hora Final ("${horaFinalInput}").`
            });
          }
          const finalConFechaFila = `${fechaSoloDia} ${parsedFinal.split(' ')[1] || '00:00:00'}`;
          let inicioMs = mysqlDateTimeToMs(horaInicioMysql);
          let finalMs = mysqlDateTimeToMs(finalConFechaFila);
          if (finalMs < inicioMs) {
            finalMs += 24 * 3600 * 1000;
          }
          horaFinalMysql = msToMysqlDateTime(finalMs);
        } else {
          horaFinalMysql = msToMysqlDateTime(mysqlDateTimeToMs(horaInicioMysql) + 3600 * 1000);
        }
      } else {
        horaInicioMysql = fechaBaseMedianoche;
        if (horaFinalInput) {
          const parsedFinal = parseFechaHoraPlano(horaFinalInput, fechaBaseMedianoche);
          if (!parsedFinal) {
            return res.status(400).json({
              error: `Fila ${numFila}: Formato inválido en Hora Final ("${horaFinalInput}").`
            });
          }
          const finalConFechaFila = `${fechaSoloDia} ${parsedFinal.split(' ')[1] || '00:00:00'}`;
          let inicioMs = mysqlDateTimeToMs(horaInicioMysql);
          let finalMs = mysqlDateTimeToMs(finalConFechaFila);
          if (finalMs < inicioMs) {
            finalMs += 24 * 3600 * 1000;
          }
          horaFinalMysql = msToMysqlDateTime(finalMs);
        } else {
          horaFinalMysql = `${fechaSoloDia} 01:00:00`;
        }
      }

      const diffMs = Math.max(0, mysqlDateTimeToMs(horaFinalMysql) - mysqlDateTimeToMs(horaInicioMysql));
      const totalHora = msToHHMMSS(diffMs);
      const duracion = duracionPorTiempo.get(totalHora) || (totalHora === '01:00:00' ? '1 Hora' : 'Otro');

      // Area (E): filtrar Config_Area por OPERACIÓN y OPERATIVO = 'V'.
      // Si hay 1 sola área operativa para esa Operación se prellena automáticamente; si hay más de 1 es obligatorio escogerla.
      const areaInput = limpiarValorPlano(f.area);
      const areasOperativasDeOp = areaRows.filter(
        a => normalizarClaveCatalogo(a.operacion) === normalizarClaveCatalogo(opInfo.operacion) &&
             String(a.operativo || '').toUpperCase() === 'V'
      );
      let areaMatch = null;
      if (!areaInput) {
        if (areasOperativasDeOp.length === 1) {
          areaMatch = areasOperativasDeOp[0];
        } else if (areasOperativasDeOp.length > 1) {
          return res.status(400).json({
            error: `Fila ${numFila}: La Operación "${opInfo.operacion}" tiene ${areasOperativasDeOp.length} áreas operativas disponibles; es obligatorio seleccionar el Área.`
          });
        } else {
          const todasDeOp = areaRows.filter(a => normalizarClaveCatalogo(a.operacion) === normalizarClaveCatalogo(opInfo.operacion));
          if (todasDeOp.length === 1) areaMatch = todasDeOp[0];
        }
      } else {
        areaMatch = areasOperativasDeOp.find(a =>
          normalizarClaveCatalogo(a.area) === normalizarClaveCatalogo(areaInput) ||
          String(a.id) === areaInput
        );
        if (!areaMatch) {
          const todasDeOp = areaRows.filter(a => normalizarClaveCatalogo(a.operacion) === normalizarClaveCatalogo(opInfo.operacion));
          areaMatch = todasDeOp.find(a =>
            normalizarClaveCatalogo(a.area) === normalizarClaveCatalogo(areaInput) ||
            String(a.id) === areaInput
          );
        }
      }
      if (!areaMatch) {
        return res.status(400).json({
          error: `Fila ${numFila}: El Área "${areaInput || '(Vacía)'}" no es válida para la Operación "${opInfo.operacion}".`
        });
      }

      // Actividad (J)
      const actInput = limpiarValorPlano(f.actividad);
      if (!actInput) {
        return res.status(400).json({
          error: `Fila ${numFila}: La Actividad es obligatoria.`
        });
      }
      const actsDeOp = actRows.filter(a => normalizarClaveCatalogo(a.operacion) === normalizarClaveCatalogo(opInfo.operacion));
      const actMatch = actsDeOp.find(a =>
        normalizarClaveCatalogo(a.actividad) === normalizarClaveCatalogo(actInput) ||
        String(a.id) === actInput
      );
      if (!actMatch) {
        return res.status(400).json({
          error: `Fila ${numFila}: La Actividad "${actInput}" no existe para la Operación "${opInfo.operacion}".`
        });
      }

      // Cliente a Facturar y NIT
      let clienteFactInput = limpiarValorPlano(f.clienteAFacturar).toUpperCase();
      if (!clienteFactInput && reciboExistenteInfo && reciboExistenteInfo.clienteAFacturar) {
        clienteFactInput = reciboExistenteInfo.clienteAFacturar.toUpperCase();
      }
      let clienteAFacturarReal = '';
      if (formaDePago === 3) {
        if (!clienteFactInput) {
          return res.status(400).json({
            error: `Fila ${numFila}: "Cliente a Facturar" es obligatorio cuando Forma de Pago es 3 (Crédito).`
          });
        }
        const ccMatch = cliCredMap.get(normalizarClaveCatalogo(clienteFactInput));
        clienteAFacturarReal = ccMatch ? ccMatch.clienteAFacturar : clienteFactInput;
      }

      const nitCleanStr = limpiarValorPlano(f.nit).replace(/[^0-9]/g, '');
      const nitNum = nitCleanStr ? parseInt(nitCleanStr, 10) : (reciboExistenteInfo ? reciboExistenteInfo.nit : null);
      const clienteInfo = (nitNum && clientesMap.get(nitNum)) || null;

      const nombresInput = limpiarValorPlano(f.nombres);
      const telInput = limpiarValorPlano(f.telefono);
      const emailInput = limpiarValorPlano(f.email);

      let clienteNuevoPendiente = false;
      let clienteModificado = false;
      let nombresResuelto = '';
      let telefonoResuelto = '';
      let emailResuelto = '';

      if (formaDePago !== 3 && nitCleanStr && nitNum) {
        if (!clienteInfo) {
          // NIT no existe en Maestro_Clientes -> es obligatorio Nombres, Teléfono y Email
          if (!nombresInput || !telInput || !emailInput) {
            return res.status(400).json({
              error: `Fila ${numFila}: El NIT "${nitNum}" no existe en Maestro_Clientes. Es obligatorio diligenciar Nombres (Cliente), Teléfono y Email para registrarlo.`
            });
          }
          clienteNuevoPendiente = true;
          nombresResuelto = nombresInput;
          telefonoResuelto = telInput;
          emailResuelto = emailInput;
        } else {
          nombresResuelto = nombresInput || clienteInfo.razonSocial || '';
          telefonoResuelto = telInput || clienteInfo.telefono || '';
          emailResuelto = emailInput || clienteInfo.correoFE || '';

          const cambioNom = Boolean(nombresInput && normalizarClaveCatalogo(nombresInput) !== normalizarClaveCatalogo(clienteInfo.razonSocial));
          const cambioTel = Boolean(telInput && telInput !== String(clienteInfo.telefono || '').trim());
          const cambioEmail = Boolean(emailInput && emailInput.toLowerCase() !== String(clienteInfo.correoFE || '').trim().toLowerCase());
          if (cambioNom || cambioTel || cambioEmail) {
            clienteModificado = true;
          }
        }
      } else {
        nombresResuelto = nombresInput || (clienteInfo ? clienteInfo.razonSocial : '') || '';
        telefonoResuelto = telInput || (clienteInfo ? clienteInfo.telefono : '') || '';
        emailResuelto = emailInput || (clienteInfo ? clienteInfo.correoFE : '') || '';
      }

      let idNit = null;
      if (formaDePago === 3) {
        const ccMatch = cliCredMap.get(normalizarClaveCatalogo(clienteAFacturarReal));
        idNit = (ccMatch && ccMatch.nit) ? ccMatch.nit : null;
      } else {
        idNit = clienteInfo ? clienteInfo.codigo : (nitNum || null);
      }

      const origen = limpiarValorPlano(f.origen) || null;
      const destino = limpiarValorPlano(f.destino) || null;
      const observacionesManual = limpiarValorPlano(f.observaciones) || null;

      const transportadoraTexto = limpiarValorPlano(f.transportadora);
      const proveedorTexto = limpiarValorPlano(f.proveedor).toUpperCase();
      const placaTexto = limpiarValorPlano(f.placa).toUpperCase();

      const cantidad = parseNumeroPlano(f.cantidad);
      const valorUnitario = parseNumeroPlano(f.valorUnitario);
      if (cantidad !== null && valorUnitario !== null && (cantidad * valorUnitario) > 3000000) {
        return res.status(400).json({
          error: `Fila ${numFila}: El Valor Base (Cantidad x Valor Unitario) supera el tope de $3.000.000.`
        });
      }

      // Ajustes de la operación: obligatorios y datos habilitados (solo las columnas de la carga)
      const camposFila = {
        area: String(areaMatch.id), actividad: String(actMatch.id), duracion,
        transportadora: transportadoraTexto, proveedor: proveedorTexto, pl1: placaTexto,
        vehiculo: limpiarValorPlano(f.vehiculo), unidad: limpiarValorPlano(f.unidad), remolque: limpiarValorPlano(f.remolque),
        manifiesto: limpiarValorPlano(f.manifiesto), origen: origen || '', destino: destino || '',
        cantidad: cantidad === null ? '' : String(cantidad), valorUnitario: valorUnitario === null ? '' : String(valorUnitario),
        observaciones: observacionesManual || '',
      };
      const errorAjustes = await configServicios.aplicarConfig({
        seccion: 'Servicio', operacion: opInfo.operacion, modalidad: modalidadFila, rol: acceso.rol,
        body: camposFila, crear: false, config: ajustesFila, soloPresentes: true, prefijo: `Fila ${numFila}: `
      });
      if (errorAjustes) return res.status(400).json({ error: errorAjustes });

      datosProcesados.push({
        numFila,
        reciboNuevoGrupo,
        consecutivoReciboExistente: consecutivoReciboRaw || null,
        idReciboExistente: reciboExistenteInfo ? reciboExistenteInfo.idRecibo : null,
        operacion: opInfo.operacion,
        opZona: opInfo.zona || null,
        opCC: opInfo.cc || null,
        fechaDia: fechaSoloDia,
        fechaMysql: fechaBaseMedianoche,
        formaDePago,
        origen,
        destino,
        transportadoraTexto,
        proveedorTexto,
        clienteAFacturar: formaDePago === 3 ? clienteAFacturarReal : null,
        vehiculo: limpiarValorPlano(f.vehiculo) || null,
        placaTexto,
        actividadId: Number(actMatch.id),
        manifiesto: limpiarValorPlano(f.manifiesto) || null,
        remolque: limpiarValorPlano(f.remolque) || null,
        unidad: limpiarValorPlano(f.unidad) || null,
        cantidad,
        valorUnitario,
        horaInicioMysql,
        horaFinalMysql,
        duracion,
        totalHora,
        areaId: Number(areaMatch.id),
        observaciones: observacionesManual,
        nitInput: nitNum,
        idNit,
        nombres: nombresResuelto || null,
        telefono: telefonoResuelto || null,
        email: emailResuelto || null,
        clienteNuevoPendiente,
        clienteModificado
      });
    }

    // Validar consistencia de las filas agrupadas bajo un mismo N° Recibo Nuevo
    const gruposReciboNuevoMap = new Map(); // grupoStr -> [filas]
    for (const d of datosProcesados) {
      if (!d.reciboNuevoGrupo) continue;
      if (!gruposReciboNuevoMap.has(d.reciboNuevoGrupo)) {
        gruposReciboNuevoMap.set(d.reciboNuevoGrupo, []);
      }
      gruposReciboNuevoMap.get(d.reciboNuevoGrupo).push(d);
    }

    for (const [grupo, filasGrupo] of gruposReciboNuevoMap.entries()) {
      const primera = filasGrupo[0];
      const modalidadPrimera = primera.formaDePago === 3 ? 'CREDITO' : 'RECAUDO';
      for (let i = 1; i < filasGrupo.length; i++) {
        const actual = filasGrupo[i];
        const modalidadActual = actual.formaDePago === 3 ? 'CREDITO' : 'RECAUDO';
        if (normalizarClaveCatalogo(actual.operacion) !== normalizarClaveCatalogo(primera.operacion)) {
          return res.status(400).json({
            error: `El Recibo Nuevo #${grupo} tiene servicios con distinta Operación (Fila ${primera.numFila}: "${primera.operacion}" vs Fila ${actual.numFila}: "${actual.operacion}"). Todos los servicios de un mismo recibo deben pertenecer a la misma Operación.`
          });
        }
        if (modalidadActual !== modalidadPrimera) {
          return res.status(400).json({
            error: `El Recibo Nuevo #${grupo} mezcla servicios de modalidad ${modalidadPrimera} (Fila ${primera.numFila}) y ${modalidadActual} (Fila ${actual.numFila}). Si el recibo es RECAUDO los servicios solo pueden ser 1 o 2; si es CREDITO solo pueden ser 3.`
          });
        }
        if (modalidadPrimera === 'CREDITO' && normalizarClaveCatalogo(actual.clienteAFacturar) !== normalizarClaveCatalogo(primera.clienteAFacturar)) {
          return res.status(400).json({
            error: `El Recibo Nuevo #${grupo} tiene distintos Clientes a Facturar (Fila ${primera.numFila}: "${primera.clienteAFacturar}" vs Fila ${actual.numFila}: "${actual.clienteAFacturar}").`
          });
        }
      }
    }

    // ── 3.1 Plano Transportadora (nuevas transportadoras que no están en Maestro_Transportadora)
    const nuevasTransportadorasNombres = [];
    const seenTransp = new Set();
    datosProcesados.forEach(d => {
      if (!d.transportadoraTexto) return;
      const key = normalizarClaveCatalogo(d.transportadoraTexto);
      if (!transpMap.has(key) && !seenTransp.has(key)) {
        seenTransp.add(key);
        nuevasTransportadorasNombres.push(d.transportadoraTexto);
      }
    });
    nuevasTransportadorasNombres.sort((a, b) => a.localeCompare(b, 'es'));

    if (nuevasTransportadorasNombres.length > cfg.limites.transportadoras) {
      return res.status(400).json({
        error: `Se detectaron ${nuevasTransportadorasNombres.length} transportadoras nuevas (máximo permitido: ${cfg.limites.transportadoras}).`
      });
    }

    const planoTransportadoras = nuevasTransportadorasNombres.map(nombre => {
      const id = generarId8Hex();
      transpMap.set(normalizarClaveCatalogo(nombre), { id, transportadora: nombre });
      return { id, transportadora: nombre, usuario: usuarioVal, fechaIngreso: ahoraBogota };
    });

    // ── 3.2 Plano Proveedor (nuevos proveedores en MAYÚSCULAS que no están en Maestro_Proveedor)
    const nuevosProveedoresNombres = [];
    const seenProv = new Set();
    datosProcesados.forEach(d => {
      if (!d.proveedorTexto) return;
      const key = normalizarClaveCatalogo(d.proveedorTexto);
      if (!provMap.has(key) && !seenProv.has(key)) {
        seenProv.add(key);
        nuevosProveedoresNombres.push(d.proveedorTexto);
      }
    });
    nuevosProveedoresNombres.sort((a, b) => a.localeCompare(b, 'es'));

    if (nuevosProveedoresNombres.length > cfg.limites.proveedores) {
      return res.status(400).json({
        error: `Se detectaron ${nuevosProveedoresNombres.length} proveedores nuevos (máximo permitido: ${cfg.limites.proveedores}).`
      });
    }

    const planoProveedores = nuevosProveedoresNombres.map(nombreUpper => {
      const id = generarId8Hex();
      provMap.set(normalizarClaveCatalogo(nombreUpper), { id, proveedor: nombreUpper });
      return { id, proveedor: nombreUpper, usuario: usuarioVal, fechaIngreso: ahoraBogota };
    });

    // ── 3.3 Plano Placas (placas nuevas que no están en Maestro_Placas)
    const nuevasPlacasCodigos = [];
    const seenPlacas = new Set();
    datosProcesados.forEach(d => {
      if (!d.placaTexto) return;
      const key = d.placaTexto.toUpperCase();
      if (!placasMap.has(key) && !seenPlacas.has(key)) {
        seenPlacas.add(key);
        nuevasPlacasCodigos.push(key);
      }
    });
    nuevasPlacasCodigos.sort((a, b) => a.localeCompare(b, 'es'));

    if (nuevasPlacasCodigos.length > cfg.limites.placas) {
      return res.status(400).json({
        error: `Se detectaron ${nuevasPlacasCodigos.length} placas nuevas (máximo permitido: ${cfg.limites.placas}).`
      });
    }

    const planoPlacas = nuevasPlacasCodigos.map(placaKey => {
      const primeraFila = datosProcesados.find(d => d.placaTexto === placaKey);
      const fp = primeraFila ? primeraFila.formaDePago : null;
      const tipoCliente = (fp === 1 || fp === 2) ? 'CONTADO' : (fp === 3 ? 'CREDITO' : null);
      const clienteCredito = (tipoCliente === 'CREDITO' && primeraFila) ? (primeraFila.clienteAFacturar || null) : null;
      const nitCandidato = primeraFila ? primeraFila.idNit : null;
      const nitFinal = (nitCandidato && String(nitCandidato) !== '222222222222') ? Number(nitCandidato) : null;
      const id = generarId8Hex();
      placasMap.set(placaKey, { id, placa: placaKey });
      return {
        id,
        placa: placaKey,
        tipoCliente,
        clienteCredito,
        nit: nitFinal,
        usuario: usuarioVal,
        fechaRegistro: ahoraBogota
      };
    });

    // ── 3.3b Plano Clientes Nuevos y Clientes Actualizados (Maestro_Clientes)
    const planoClientesNuevos = [];
    const seenClientesNuevos = new Set();
    const planoClientesActualizar = [];
    const seenClientesActualizar = new Set();

    datosProcesados.forEach(d => {
      if (d.formaDePago === 3 || !d.nitInput) return;
      const nitKey = Number(d.nitInput);
      if (d.clienteNuevoPendiente && !seenClientesNuevos.has(nitKey)) {
        seenClientesNuevos.add(nitKey);
        const razonSocial = d.nombres || '';
        const buscarCliente = `${nitKey} ** ${razonSocial}`;
        planoClientesNuevos.push({
          solicitarActualizacion: 'NUEVO',
          codigo: nitKey,
          razonSocial,
          rtica: null,
          rtiva: null,
          rtservic: null,
          fechaUltimaVenta: d.fechaDia,
          deptoEstado: d.opZona || null,
          ciudad: d.opCC || null,
          direccion1: d.operacion,
          telefono: d.telefono || null,
          condicionPago: 'CONTADO',
          correoFE: d.email || null,
          buscarCliente,
          usuario: usuarioVal,
          fechaRegistro: ahoraBogota,
          documento: null,
          observaciones: 'Registrado por plano de servicios'
        });
        clientesMap.set(nitKey, {
          codigo: nitKey,
          razonSocial,
          telefono: d.telefono || '',
          correoFE: d.email || '',
          RTSERVIC: '',
          RTIVA: '',
          RTICA: ''
        });
      } else if (d.clienteModificado && !seenClientesActualizar.has(nitKey)) {
        seenClientesActualizar.add(nitKey);
        const razonSocial = d.nombres || '';
        const buscarCliente = `${nitKey} ** ${razonSocial}`;
        planoClientesActualizar.push({
          codigo: nitKey,
          razonSocial,
          telefono: d.telefono || null,
          correoFE: d.email || null,
          buscarCliente
        });
      }
    });

    // ── 3.4 Plano Recibos (1 fila por cada N° Recibo Nuevo distinto)
    const gruposOrdenados = [...gruposReciboNuevoMap.keys()].sort((a, b) => Number(a) - Number(b));
    if (gruposOrdenados.length > cfg.limites.recibos) {
      return res.status(400).json({
        error: `Se generaron ${gruposOrdenados.length} recibos nuevos (máximo permitido: ${cfg.limites.recibos}).`
      });
    }

    const mapaGrupoReciboId = new Map(); // grupoStr -> idRecibo
    const planoRecibos = gruposOrdenados.map(grupo => {
      const filasGrupo = gruposReciboNuevoMap.get(grupo);
      const primeraFila = filasGrupo[0];
      const idRecibo = generarPackedUUID();
      mapaGrupoReciboId.set(grupo, idRecibo);

      const esCredito = primeraFila.formaDePago === 3;
      const filaConNit = filasGrupo.find(x => x.idNit) || primeraFila;
      const nitRecibo = esCredito ? null : (filaConNit.idNit ? Number(filaConNit.idNit) : null);
      const telNum = filaConNit.telefono ? parseInt(String(filaConNit.telefono).replace(/[^0-9]/g, ''), 10) : null;

      const subtotalGrupo = filasGrupo.reduce((acc, fila) => {
        const c = Number(fila.cantidad) || 0;
        const v = Number(fila.valorUnitario) || 0;
        return acc + Math.round(c * v);
      }, 0);

      // Calcular Retefuente, ReteIVA y ReteICA automáticamente según Maestro_Clientes y Config_Impuestos
      const clienteFlags = (nitRecibo && clientesMap.get(nitRecibo)) || {};
      const retencionesSugeridas = esCredito
        ? { retefuente: null, reteiva: null, reteica: null }
        : sugerirRetenciones(
            { nit: nitRecibo, operacion: primeraFila.operacion, subtotal: subtotalGrupo },
            clienteFlags,
            impuestos
          );

      return {
        grupo,
        idRecibo,
        consecutivoRecibo: null, // Se asigna automáticamente por el trigger bi_dynamic_recibos_autoconsec
        operacion: primeraFila.operacion,
        usuario: usuarioVal,
        fecha: ahoraBogota,
        clienteAFacturar: esCredito ? (primeraFila.clienteAFacturar || null) : null,
        categoria: null,
        clientePorPlaca: null,
        placa: primeraFila.placaTexto || null,
        nit: Number.isFinite(nitRecibo) ? nitRecibo : null,
        telefono: Number.isFinite(telNum) && telNum > 0 ? telNum : null,
        email: filaConNit.email || null,
        retefuente: retencionesSugeridas.retefuente === 'V' ? 'V' : null,
        reteiva: retencionesSugeridas.reteiva === 'V' ? 'V' : null,
        reteica: retencionesSugeridas.reteica === 'V' ? 'V' : null,
        modalidad: esCredito ? 'CREDITO' : 'RECAUDO',
        observaciones: primeraFila.observaciones || null
      };
    });

    // ── Ejecutar inserción transaccional en orden:
    // 1) Transportadora -> 2) Proveedor -> 3) Placas -> 4) Recibos -> 5) Servicios
    conn = await pool.getConnection();
    await conn.beginTransaction();

    for (const t of planoTransportadoras) {
      await conn.execute(
        'INSERT INTO Maestro_Transportadora (ID, Transportadora, Usuario, `Fecha Ingreso`) VALUES (?, ?, ?, ?)',
        [t.id, t.transportadora, t.usuario, t.fechaIngreso]
      );
    }

    for (const p of planoProveedores) {
      await conn.execute(
        'INSERT INTO Maestro_Proveedor (ID, Proveedor, Usuario, `Fecha Ingreso`) VALUES (?, ?, ?, ?)',
        [p.id, p.proveedor, p.usuario, p.fechaIngreso]
      );
    }

    for (const pl of planoPlacas) {
      await conn.execute(
        'INSERT INTO Maestro_Placas (ID, Placa, `Tipo Cliente`, `Cliente Credito`, Nit, Usuario, `Fecha Registro`) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [pl.id, pl.placa, pl.tipoCliente, pl.clienteCredito, pl.nit, pl.usuario, pl.fechaRegistro]
      );
    }

    for (const cNuevo of planoClientesNuevos) {
      await conn.execute(
        `INSERT INTO Maestro_Clientes (
          \`Solicitar Actualización\`, \`Código\`, \`Razón social\`,
          \`RTICA\`, \`RTIVA\`, \`RTSERVIC\`,
          \`Fecha última venta\`, \`Depto/Estado\`, \`Ciudad\`, \`Dirección 1\`,
          \`Telefono\`, \`Desc. condicion de pago\`, \`Correo F.E.\`,
          \`Buscar Cliente\`, \`Usuario\`, \`Fecha Registro\`, \`Documento\`, \`Observaciones\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cNuevo.solicitarActualizacion, cNuevo.codigo, cNuevo.razonSocial,
          cNuevo.rtica, cNuevo.rtiva, cNuevo.rtservic,
          cNuevo.fechaUltimaVenta, cNuevo.deptoEstado, cNuevo.ciudad, cNuevo.direccion1,
          cNuevo.telefono, cNuevo.condicionPago, cNuevo.correoFE,
          cNuevo.buscarCliente, cNuevo.usuario, cNuevo.fechaRegistro, cNuevo.documento, cNuevo.observaciones
        ]
      );
    }

    for (const cUpd of planoClientesActualizar) {
      await conn.execute(
        `UPDATE Maestro_Clientes
         SET \`Razón social\` = ?,
             \`Telefono\` = ?,
             \`Correo F.E.\` = ?,
             \`Buscar Cliente\` = ?
         WHERE \`Código\` = ?`,
        [cUpd.razonSocial, cUpd.telefono, cUpd.correoFE, cUpd.buscarCliente, cUpd.codigo]
      );
    }

    for (const rec of planoRecibos) {
      await conn.execute(
        `INSERT INTO Dynamic_Recibos (
          \`IdRecibo\`, \`Consecutivo Recibo\`, \`Operación\`, \`Usuario\`,
          \`Fecha\`, \`Cliente a Facturar\`, \`Categoria\`, \`Cliente por Placa\`,
          \`Placa\`, \`Nit\`, \`Telefono\`, \`Email\`,
          \`Retefuente\`, \`ReteIVA\`, \`ReteICA\`,
          \`Modalidad\`, \`Observaciones\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          rec.idRecibo, rec.consecutivoRecibo, rec.operacion, rec.usuario,
          rec.fecha, rec.clienteAFacturar, rec.categoria, rec.clientePorPlaca,
          rec.placa, rec.nit, rec.telefono, rec.email,
          rec.retefuente, rec.reteiva, rec.reteica,
          rec.modalidad, rec.observaciones
        ]
      );
    }

    // Consultar los Consecutivos asignados por el trigger bi_dynamic_recibos_autoconsec a los recibos nuevos
    const mapaIdReciboAConsecutivo = new Map();
    if (planoRecibos.length > 0) {
      const idsNuevos = planoRecibos.map(r => r.idRecibo);
      const [consAsignados] = await conn.query(
        'SELECT IdRecibo as idRecibo, `Consecutivo Recibo` as consecutivo FROM Dynamic_Recibos WHERE IdRecibo IN (?)',
        [idsNuevos]
      );
      consAsignados.forEach(c => {
        if (c.consecutivo) mapaIdReciboAConsecutivo.set(c.idRecibo, String(c.consecutivo).trim());
      });
    }

    // ── 3.5 Plano Servicios (1 fila por cada fila de Datos)
    const planoServicios = datosProcesados.map(d => {
      const idServicio = generarPackedUUID();
      const idRecibo = d.idReciboExistente || mapaGrupoReciboId.get(d.reciboNuevoGrupo);
      const esFormaPago1 = Number(d.formaDePago) === 1;
      const estado = esFormaPago1 ? 'Green' : 'Yellow';
      const edicion = esFormaPago1 ? 'Completado' : 'Pendiente';
      const transpObj = d.transportadoraTexto ? transpMap.get(normalizarClaveCatalogo(d.transportadoraTexto)) : null;
      const provObj = d.proveedorTexto ? provMap.get(normalizarClaveCatalogo(d.proveedorTexto)) : null;
      const placaObj = d.placaTexto ? placasMap.get(d.placaTexto.toUpperCase()) : null;

      return {
        idServicio,
        idRecibo,
        estado,
        usuario: usuarioVal,
        area: d.areaId,
        fecha: ahoraBogota,
        transportadora: transpObj ? transpObj.id : null,
        proveedor: provObj ? provObj.id : null,
        proveedorTexto: d.proveedorTexto || null,
        actividad: d.actividadId,
        vehiculo: d.vehiculo || null,
        remolque: d.remolque || null,
        pl1: placaObj ? placaObj.id : null,
        unidad: d.unidad || null,
        cantidad: d.cantidad,
        valorUnitario: d.valorUnitario,
        origen: d.origen || null,
        destino: d.destino || null,
        manifiesto: d.manifiesto || null,
        fotoDocumento: null,
        etapa: null,
        muelle: null,
        horaInicio: d.horaInicioMysql,
        horaFinal: d.horaFinalMysql,
        duracion: d.duracion || 'Otro',
        totalHora: d.totalHora,
        grupoDtjo: d.horaInicioMysql ? 'GRUPAL' : null,
        auxiliares: null,
        notas: 'Registro cargado mediante Plano Grid',
        fotoEvidencia: null,
        formaDePago: d.formaDePago,
        fotoTransferencia: null,
        fechaTransferencia: null,
        observaciones: d.observaciones || null,
        telefono: d.telefono || null,
        firmaRecibido: null,
        edicion
      };
    });

    for (let i = 0; i < planoServicios.length; i++) {
      const s = planoServicios[i];
      await conn.execute(
        `INSERT INTO Dynamic_Servicios (
          \`IdServicio\`, \`IdRecibo\`, \`Estado\`, \`Usuario\`, \`Area\`, \`Fecha\`,
          \`Transportadora\`, \`Proveedor\`, \`Proveedor Texto\`, \`Actividad\`,
          \`Vehiculo\`, \`Remolque\`, \`PL1\`, \`Unidad\`, \`Cantidad\`, \`Valor Unitario\`,
          \`Origen\`, \`Destino\`, \`Manifiesto\`, \`Foto Documento\`, \`Etapa\`, \`Muelle\`,
          \`Hora Inicio\`, \`Hora Final\`, \`Duración\`, \`Total Hora\`, \`Grupo Dtjo\`,
          \`Auxiliares\`, \`Notas\`, \`Foto Evidencia\`, \`Forma De Pago\`,
          \`Foto Transferencia\`, \`Fecha Transferencia\`, \`Observaciones\`,
          \`Telefono\`, \`Firma_Recibido\`, \`Edición\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          s.idServicio, s.idRecibo, s.estado, s.usuario, s.area, s.fecha,
          s.transportadora, s.proveedor, s.proveedorTexto, s.actividad,
          s.vehiculo, s.remolque, s.pl1, s.unidad, s.cantidad, s.valorUnitario,
          s.origen, s.destino, s.manifiesto, s.fotoDocumento, s.etapa, s.muelle,
          s.horaInicio, s.horaFinal, s.duracion, s.totalHora, s.grupoDtjo,
          s.auxiliares, s.notas, s.fotoEvidencia, s.formaDePago,
          s.fotoTransferencia, s.fechaTransferencia, s.observaciones,
          s.telefono, s.firmaRecibido, s.edicion
        ]
      );
    }

    // Si se agregaron servicios a Recibos Existentes de modalidad RECAUDO, recalcular sus retenciones
    // según el nuevo subtotal acumulado y el NIT (existente o suministrado en el grid) con Config_Impuestos.
    const idsRecibosExistUsados = [...new Set(datosProcesados.map(d => d.idReciboExistente).filter(Boolean))];
    for (const idRecExist of idsRecibosExistUsados) {
      const filasDeRecExist = datosProcesados.filter(d => d.idReciboExistente === idRecExist);
      const primeraFilaRec = filasDeRecExist[0];
      if (!primeraFilaRec || primeraFilaRec.formaDePago === 3) continue; // Solo RECAUDO

      const [subRows] = await conn.execute(
        'SELECT SUM(COALESCE(Cantidad, 0) * COALESCE(`Valor Unitario`, 0)) as subtotal FROM Dynamic_Servicios WHERE IdRecibo = ?',
        [idRecExist]
      );
      const subtotalTotalRec = Number(subRows[0] && subRows[0].subtotal) || 0;
      const filaConNit = filasDeRecExist.find(x => x.idNit) || primeraFilaRec;
      const nitEfectivo = filaConNit.idNit ? Number(filaConNit.idNit) : null;

      if (nitEfectivo) {
        const clienteFlags = clientesMap.get(nitEfectivo) || {};
        const retSug = sugerirRetenciones(
          { nit: nitEfectivo, operacion: primeraFilaRec.operacion, subtotal: subtotalTotalRec },
          clienteFlags,
          impuestos
        );
        const telNum = filaConNit.telefono ? parseInt(String(filaConNit.telefono).replace(/[^0-9]/g, ''), 10) : null;
        await conn.execute(
          `UPDATE Dynamic_Recibos
           SET Nit = COALESCE(Nit, ?),
               Telefono = COALESCE(Telefono, ?),
               Email = COALESCE(Email, ?),
               Retefuente = ?,
               ReteIVA = ?,
               ReteICA = ?
           WHERE IdRecibo = ?`,
          [
            nitEfectivo,
            Number.isFinite(telNum) && telNum > 0 ? telNum : null,
            filaConNit.email || null,
            retSug.retefuente === 'V' ? 'V' : null,
            retSug.reteiva === 'V' ? 'V' : null,
            retSug.reteica === 'V' ? 'V' : null,
            idRecExist
          ]
        );
      }
    }

    await conn.commit();
    conn.release();
    conn = null;

    if (planoTransportadoras.length || planoProveedores.length || planoPlacas.length) {
      cachedMasivoLookupsBase = null;
    }

    const recibosExistentesUsadosSet = new Set(
      datosProcesados.map(d => d.consecutivoReciboExistente).filter(Boolean)
    );

    res.json({
      ok: true,
      resumen: {
        transportadorasCreadas: planoTransportadoras.length,
        proveedoresCreados: planoProveedores.length,
        placasCreadas: planoPlacas.length,
        clientesCreados: planoClientesNuevos.length,
        clientesActualizados: planoClientesActualizar.length,
        recibosCreados: planoRecibos.length,
        consecutivosCreados: [...mapaIdReciboAConsecutivo.values()],
        recibosExistentesUsados: recibosExistentesUsadosSet.size,
        serviciosCreados: planoServicios.length
      }
    });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
      try { conn.release(); } catch (_) {}
    }
    console.error('[facturacion] POST /api/servicios/guardar-masivo:', err);
    res.status(500).json({ error: `Error al guardar el lote: ${err.message}` });
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
    const provIds = [...new Set(aggRows.map(a => a.proveedor_latest).filter(Boolean))];
    const placaIds = [...new Set(aggRows.map(a => a.PL1_latest).filter(Boolean))];

    const [areas] = areaIds.length > 0 ? await pool.query('SELECT ID, AREA FROM Config_Area WHERE ID IN (?)', [areaIds]) : [[]];
    const [transps] = transpIds.length > 0 ? await pool.query('SELECT ID, Transportadora FROM Maestro_Transportadora WHERE ID IN (?)', [transpIds]) : [[]];
    const [provs] = provIds.length > 0 ? await pool.query('SELECT ID, Proveedor FROM Maestro_Proveedor WHERE ID IN (?)', [provIds]) : [[]];
    const [placas] = placaIds.length > 0 ? await pool.query('SELECT ID, Placa FROM Maestro_Placas WHERE ID IN (?)', [placaIds]) : [[]];

    const areaMap = Object.fromEntries(areas.map(a => [a.ID, a.AREA]));
    const transpMap = Object.fromEntries(transps.map(t => [t.ID, t.Transportadora]));
    const provMap = Object.fromEntries(provs.map(p => [p.ID, p.Proveedor]));
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
        proveedor: provMap[agg.proveedor_latest] || agg.proveedor_latest || '',
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

    // Ajustes de la operación (Config_Servicios): valores por defecto, obligatorios y habilitados
    // Cada modalidad revisa solo sus campos; Categoría depende del cliente y la maneja el formulario.
    const camposRecibo = (modalidad === 'CREDITO') ? { clienteAFacturar, observaciones } : { telefono, email, observaciones };
    const errorAjustes = await configServicios.aplicarConfig({
      seccion: 'Recibo', operacion, modalidad, rol: acceso.rol, body: camposRecibo, crear: true, soloPresentes: true
    });
    if (errorAjustes) return res.status(400).json({ error: errorAjustes });
    if (modalidad === 'CREDITO') clienteAFacturar = camposRecibo.clienteAFacturar;
    else ({ telefono, email } = camposRecibo);
    observaciones = camposRecibo.observaciones;

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

    // Ajustes de la operación (Config_Servicios): obligatorios y datos habilitados
    const errorAjustes = await configServicios.aplicarConfig({
      seccion: 'Recibo', operacion: operacionFinal, modalidad: modalidadFinal, rol: acceso.rol, crear: false, soloPresentes: true,
      body: (modalidadFinal === 'CREDITO')
        ? { clienteAFacturar: clienteAFacturarFinal, observaciones: observacionesFinal }
        : { telefono: telefonoFinal, email: emailFinal, observaciones: observacionesFinal },
      anteriores: {
        clienteAFacturar: existente['Cliente a Facturar'], categoria: existente.Categoria, telefono: existente.Telefono,
        email: existente.Email, observaciones: existente.Observaciones,
      },
    });
    if (errorAjustes) return res.status(400).json({ error: errorAjustes });

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

    // Lista desplegable del formulario de servicio: sin texto muestra las primeras; primero
    // las que empiezan por lo escrito y luego las que lo contienen.
    const texto = (q || '').trim();
    const [rows] = await pool.execute(
      'SELECT ID as id, Transportadora as transportadora FROM Maestro_Transportadora WHERE Transportadora LIKE ? ORDER BY (Transportadora LIKE ?) DESC, Transportadora ASC LIMIT 50',
      [`%${texto}%`, `${texto}%`]
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

    // Lista desplegable del formulario de servicio (mismo criterio que transportadoras)
    const texto = (q || '').trim();
    const [rows] = await pool.execute(
      'SELECT ID as id, Proveedor as proveedor FROM Maestro_Proveedor WHERE Proveedor LIKE ? ORDER BY (Proveedor LIKE ?) DESC, Proveedor ASC LIMIT 50',
      [`%${texto}%`, `${texto}%`]
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

    // Lista desplegable del formulario de servicio (mismo criterio que transportadoras)
    const texto = (q || '').trim().toUpperCase();
    const [rows] = await pool.execute(
      `SELECT mp.ID as id, mp.Placa as placa, mp.\`Tipo Cliente\` as tipoCliente,
              mp.\`Cliente Credito\` as clienteCredito, mp.Nit as nit, mc.\`Razón social\` as razonSocial
       FROM Maestro_Placas mp
       LEFT JOIN Maestro_Clientes mc ON mc.\`Código\` = mp.Nit
       WHERE mp.Placa LIKE ?
       ORDER BY (mp.Placa LIKE ?) DESC, mp.Placa ASC, mp.\`Fecha Registro\` DESC
       LIMIT 50`,
      [`%${texto}%`, `${texto}%`]
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
    const { placa, idRecibo, nit, modalidad, clienteAFacturar } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Servicios') || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    if (!placa || !placa.trim()) return res.status(400).json({ error: 'La Placa es obligatoria.' });

    // Servicio de un recibo que aún no se ha guardado (formulario Agregar Recibo): la
    // Modalidad y el Cliente a Facturar llegan del formulario en vez del recibo.
    let contexto;
    if (idRecibo) {
      contexto = await obtenerContextoRecibo(idRecibo);
      if (!contexto) return res.status(404).json({ error: 'Recibo no encontrado' });
    } else {
      const modalidadForm = String(modalidad || '').toUpperCase();
      if (!['RECAUDO', 'CREDITO'].includes(modalidadForm)) return res.status(400).json({ error: 'idRecibo o Modalidad requerido' });
      contexto = { modalidad: modalidadForm, clienteAFacturar: clienteAFacturar || null };
    }

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
      // Trabajadores activos de la Operación del recibo
      "SELECT DISTINCT Trabajador as trabajador FROM `Maestro_Segmentación` WHERE Estado = 'Activo' AND `Operación` = ? AND Trabajador LIKE ? ORDER BY Trabajador ASC LIMIT 300",
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

    // Ajustes de la operación (Config_Servicios): valores por defecto, obligatorios y habilitados
    const configServ = await configServicios.resolverConfig({ seccion: 'Servicio', operacion: contexto.operacion, modalidad: contexto.modalidad, rol: acceso.rol });
    const errorAjustes = await configServicios.aplicarConfig({
      seccion: 'Servicio', operacion: contexto.operacion, modalidad: contexto.modalidad, rol: acceso.rol, body, crear: true, config: configServ,
      archivos: { fotoDocumento: !!files.fotoDocumento?.[0], fotoEvidencia: !!files.fotoEvidencia?.[0] },
    });
    if (errorAjustes) return res.status(400).json({ error: errorAjustes });

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

    // Manifiesto y Teléfono son de CREDITO, salvo que la operación los muestre también en RECAUDO
    const manifiesto = (contexto.modalidad === 'CREDITO' || configServicios.visibleEnConfig(configServ, 'Manifiesto')) ? ((body.manifiesto || '').trim() || null) : null;
    const telefonoServicio = (contexto.modalidad === 'CREDITO' || configServicios.visibleEnConfig(configServ, 'Telefono')) ? ((body.telefono || '').trim() || null) : null;
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

    // Ajustes de la operación (Config_Servicios): obligatorios y habilitados; se aceptan los
    // valores que el servicio ya tenía guardados aunque hoy no estén habilitados.
    const anterioresServ = {};
    configServicios.CAMPOS.Servicio.forEach((c) => { anterioresServ[c.bodyKey] = existente[c.columna]; });
    const configServ = await configServicios.resolverConfig({ seccion: 'Servicio', operacion: contexto.operacion, modalidad: contexto.modalidad, rol: acceso.rol });
    const errorAjustes = await configServicios.aplicarConfig({
      seccion: 'Servicio', operacion: contexto.operacion, modalidad: contexto.modalidad, rol: acceso.rol, body,
      anteriores: anterioresServ, crear: false, config: configServ,
      archivos: { fotoDocumento: !!files.fotoDocumento?.[0], fotoEvidencia: !!files.fotoEvidencia?.[0] },
    });
    if (errorAjustes) return res.status(400).json({ error: errorAjustes });

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

    const manifiesto = (contexto.modalidad === 'CREDITO' || configServicios.visibleEnConfig(configServ, 'Manifiesto'))
      ? ((typeof body.manifiesto !== 'undefined') ? ((body.manifiesto || '').trim() || null) : existente.Manifiesto)
      : null;
    const telefonoServicio = (contexto.modalidad === 'CREDITO' || configServicios.visibleEnConfig(configServ, 'Telefono'))
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

// ══════════════════════════════════════════════════════════════════════════
// AJUSTES DE SERVICIOS POR OPERACIÓN (Config_Servicios)
// ══════════════════════════════════════════════════════════════════════════

// ── GET /api/config-servicios (reglas del formulario de Recibo o Servicio) ─────
// Las usa el formulario al escoger Operación y Modalidad; ya considera el rol del usuario.
router.get('/api/config-servicios', async (req, res) => {
  try {
    const { usuario, seccion, operacion, modalidad } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Servicios') || await computarAccesoFacturacion(usuario, 'Recibos');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    if (!configServicios.SECCIONES.includes(seccion)) return res.status(400).json({ error: 'Sección inválida' });
    res.json(await configServicios.resolverConfig({ seccion, operacion, modalidad, rol: acceso.rol }));
  } catch (err) {
    console.error('[facturacion] GET /api/config-servicios:', err);
    res.status(500).json({});
  }
});

// ── GET /api/clientes-a-facturar (lista del formulario de Recibo CREDITO) ──
router.get('/api/clientes-a-facturar', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoFacturacion(usuario, 'Recibos') || await computarAccesoFacturacion(usuario, 'Servicios');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    res.json((await configServicios.opcionesCatalogo('clienteCredito')).map((o) => o.valor));
  } catch (err) {
    console.error('[facturacion] GET /api/clientes-a-facturar:', err);
    res.status(500).json([]);
  }
});

// Acceso a la pestaña Ajustes Servicios (Maestro_Menu) + permisos (Config_Parametros)
async function accesoAjustesServicios(req, res, accion) {
  const { usuario } = req.query;
  if (!usuario) { res.status(400).json({ error: 'usuario requerido' }); return null; }
  const acceso = await computarAccesoFacturacion(usuario, 'Ajustes_Servicios');
  if (!acceso) { res.status(403).json({ error: 'No autorizado para Ajustes Servicios' }); return null; }
  const permisos = await configServicios.permisosAjustesServicios(acceso.rol);
  if (accion && !permisos[accion]) {
    res.status(403).json({ error: accion === 'eliminar' ? 'Su rol no puede eliminar ajustes de servicios.' : 'Su rol no puede crear ni editar ajustes de servicios.' });
    return null;
  }
  return { ...acceso, permisos };
}

// Valida y normaliza una fila de Config_Servicios que llega del formulario de la pestaña.
function leerAjusteServicio(body) {
  const seccion = String(body.seccion || '').trim();
  if (!configServicios.SECCIONES.includes(seccion)) return { error: 'La Sección debe ser Recibo o Servicio.' };
  const campo = configServicios.campoDe(seccion, body.columna_origen);
  if (!campo) return { error: 'El campo escogido no se puede ajustar.' };
  const modalidad = String(body.modalidad || '').trim().toUpperCase();
  if (modalidad && !configServicios.MODALIDADES.includes(modalidad)) return { error: 'La Modalidad debe ser RECAUDO, CREDITO o vacía.' };
  const operacion = String(body.operacion || '').trim();
  const limpiarLista = (v) => configServicios.lista(Array.isArray(v) ? v.join(',') : v).join(', ');
  const habilitados = campo.tipo === 'lista' ? limpiarLista(body.datos_habilitados) : '';
  if (habilitados && !operacion && ['area', 'actividad'].includes(campo.catalogo)) {
    return { error: 'Área y Actividad dependen de la Operación: para limitar sus datos escoja una Operación.' };
  }
  const defecto = (campo.tipo === 'lista' || campo.tipo === 'texto') ? String(body.valor_defecto || '').trim() : '';
  if (defecto && habilitados && !configServicios.lista(habilitados).some((h) => configServicios.normalizar(h) === configServicios.normalizar(defecto))) {
    return { error: 'El valor por defecto debe estar entre los datos habilitados.' };
  }
  const orden = String(body.orden ?? '').trim();
  if (orden && !/^-?\d+$/.test(orden)) return { error: 'El Orden debe ser un número entero.' };
  return {
    fila: {
      seccion,
      operacion,
      modalidad,
      columna_origen: campo.columna,
      etiqueta_columna: String(body.etiqueta_columna || '').trim().slice(0, 100) || null,
      datos_habilitados: habilitados || null,
      valor_defecto: defecto.slice(0, 255) || null,
      visible: Number(body.visible) === 0 ? 0 : 1,
      obligatorio: Number(body.obligatorio) === 1 ? 1 : 0,
      rol: limpiarLista(body.rol) || null,
      orden: orden ? parseInt(orden, 10) : null,
    },
  };
}

function textoAjuste(f) {
  return `${f.seccion} / ${f.operacion || 'Todas'} / ${f.modalidad || 'Ambas'} / ${f.columna_origen}`;
}

// ── GET /api/ajustes-servicios (listado de Config_Servicios) ────────────────
router.get('/api/ajustes-servicios', async (req, res) => {
  try {
    if (!(await accesoAjustesServicios(req, res))) return;
    const [rows] = await pool.query(
      `SELECT id, seccion, operacion, modalidad, columna_origen, etiqueta_columna, datos_habilitados, valor_defecto,
              visible, obligatorio, rol, orden, usuario, DATE_FORMAT(fecha_registro, '%Y-%m-%d %H:%i') AS fecha_registro
       FROM Config_Servicios ORDER BY operacion, seccion, modalidad, COALESCE(orden, 999), columna_origen`
    );
    res.json(rows);
  } catch (err) {
    console.error('[facturacion] GET /api/ajustes-servicios:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/ajustes-servicios/opciones (operaciones, roles y catálogo de un campo) ──
router.get('/api/ajustes-servicios/opciones', async (req, res) => {
  try {
    if (!(await accesoAjustesServicios(req, res))) return;
    const { seccion, columna, operacion } = req.query;
    if (seccion && columna) {
      const campo = configServicios.campoDe(seccion, columna);
      const opciones = campo && campo.tipo === 'lista' ? await configServicios.opcionesCatalogo(campo.catalogo, operacion) : [];
      return res.json({ opciones });
    }
    const [ops] = await pool.query("SELECT `OPERACIÓN` AS operacion FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY `OPERACIÓN`");
    const [roles] = await pool.query(
      "SELECT Rol AS rol FROM Config_Rol WHERE Rol IS NOT NULL AND Rol <> '' UNION SELECT DISTINCT Rol FROM Maestro_Usuarios WHERE Rol IS NOT NULL AND Rol <> '' ORDER BY rol"
    );
    res.json({ operaciones: ops.map((o) => o.operacion), roles: [...new Set(roles.map((r) => String(r.rol).trim()))] });
  } catch (err) {
    console.error('[facturacion] GET /api/ajustes-servicios/opciones:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/ajustes-servicios (crear) y PUT /api/ajustes-servicios/:id (editar) ──
async function guardarAjusteServicio(req, res, id) {
  try {
    const acceso = await accesoAjustesServicios(req, res, 'editar');
    if (!acceso) return;
    const { fila, error } = leerAjusteServicio(req.body || {});
    if (error) return res.status(400).json({ error });
    const usuarioVal = acceso.usuarioId || req.query.usuario;
    const valores = [fila.seccion, fila.operacion, fila.modalidad, fila.columna_origen, fila.etiqueta_columna, fila.datos_habilitados,
      fila.valor_defecto, fila.visible, fila.obligatorio, fila.rol, fila.orden, usuarioVal, formatearAhoraBogota()];
    if (id) {
      const [r] = await pool.execute(
        `UPDATE Config_Servicios SET seccion = ?, operacion = ?, modalidad = ?, columna_origen = ?, etiqueta_columna = ?,
           datos_habilitados = ?, valor_defecto = ?, visible = ?, obligatorio = ?, rol = ?, orden = ?, usuario = ?, fecha_registro = ?
         WHERE id = ?`,
        [...valores, id]
      );
      if (!r.affectedRows) return res.status(404).json({ error: 'Ajuste no encontrado.' });
    } else {
      const [r] = await pool.execute(
        `INSERT INTO Config_Servicios (seccion, operacion, modalidad, columna_origen, etiqueta_columna, datos_habilitados,
           valor_defecto, visible, obligatorio, rol, orden, usuario, fecha_registro)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        valores
      );
      id = r.insertId;
    }
    console.log(`[facturacion] ${usuarioVal} ${req.params.id ? 'editó' : 'creó'} ajuste de servicios #${id}: ${textoAjuste(fila)}`);
    res.json({ ok: true, id });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un ajuste para ese campo con la misma Sección, Operación y Modalidad. Edítelo en lugar de crear otro.' });
    }
    console.error('[facturacion] guardar ajuste de servicios:', err);
    res.status(500).json({ error: err.message });
  }
}
router.post('/api/ajustes-servicios', (req, res) => guardarAjusteServicio(req, res, null));
router.put('/api/ajustes-servicios/:id', (req, res) => guardarAjusteServicio(req, res, parseInt(req.params.id, 10) || -1));

// ── DELETE /api/ajustes-servicios/:id ──────────────────────────────────────
router.delete('/api/ajustes-servicios/:id', async (req, res) => {
  try {
    const acceso = await accesoAjustesServicios(req, res, 'eliminar');
    if (!acceso) return;
    const id = parseInt(req.params.id, 10);
    const [filas] = await pool.execute('SELECT * FROM Config_Servicios WHERE id = ?', [id]);
    if (!filas.length) return res.status(404).json({ error: 'Ajuste no encontrado.' });
    await pool.execute('DELETE FROM Config_Servicios WHERE id = ?', [id]);
    console.log(`[facturacion] ${acceso.usuarioId || req.query.usuario} eliminó ajuste de servicios #${id}: ${textoAjuste(filas[0])}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[facturacion] DELETE /api/ajustes-servicios/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/ajustes-servicios/copiar (copiar los ajustes de una operación a otra) ──
// Área y Actividad guardan IDs que son propios de cada operación: se copian sus reglas
// (visible, obligatorio, etiqueta, rol) pero sin datos habilitados ni valor por defecto.
router.post('/api/ajustes-servicios/copiar', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const acceso = await accesoAjustesServicios(req, res, 'editar');
    if (!acceso) return;
    const desde = String(req.body?.desde || '').trim();
    const hacia = String(req.body?.hacia || '').trim();
    const sobrescribir = !!req.body?.sobrescribir;
    if (!desde || !hacia) return res.status(400).json({ error: 'Escoja la operación de origen y la de destino.' });
    if (desde === hacia) return res.status(400).json({ error: 'La operación de origen y la de destino deben ser distintas.' });

    const [origen] = await conn.execute('SELECT * FROM Config_Servicios WHERE operacion = ?', [desde]);
    if (!origen.length) return res.status(400).json({ error: `La operación ${desde} no tiene ajustes para copiar.` });

    const usuarioVal = acceso.usuarioId || req.query.usuario;
    const ahora = formatearAhoraBogota();
    let copiados = 0, omitidos = 0;
    await conn.beginTransaction();
    for (const f of origen) {
      const campo = configServicios.campoDe(f.seccion, f.columna_origen);
      const propioDeOperacion = campo && ['area', 'actividad'].includes(campo.catalogo);
      const datos = [f.etiqueta_columna, propioDeOperacion ? null : f.datos_habilitados, propioDeOperacion ? null : f.valor_defecto,
        f.visible, f.obligatorio, f.rol, f.orden, usuarioVal, ahora];
      const [existe] = await conn.execute(
        'SELECT id FROM Config_Servicios WHERE seccion = ? AND operacion = ? AND modalidad = ? AND columna_origen = ?',
        [f.seccion, hacia, f.modalidad, f.columna_origen]
      );
      if (existe.length && !sobrescribir) { omitidos++; continue; }
      if (existe.length) {
        await conn.execute(
          `UPDATE Config_Servicios SET etiqueta_columna = ?, datos_habilitados = ?, valor_defecto = ?, visible = ?, obligatorio = ?,
             rol = ?, orden = ?, usuario = ?, fecha_registro = ? WHERE id = ?`,
          [...datos, existe[0].id]
        );
      } else {
        await conn.execute(
          `INSERT INTO Config_Servicios (seccion, operacion, modalidad, columna_origen, etiqueta_columna, datos_habilitados,
             valor_defecto, visible, obligatorio, rol, orden, usuario, fecha_registro)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [f.seccion, hacia, f.modalidad, f.columna_origen, ...datos]
        );
      }
      copiados++;
    }
    await conn.commit();
    console.log(`[facturacion] ${usuarioVal} copió ajustes de servicios de ${desde} a ${hacia}: ${copiados} copiados, ${omitidos} omitidos`);
    res.json({ ok: true, copiados, omitidos });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('[facturacion] POST /api/ajustes-servicios/copiar:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
