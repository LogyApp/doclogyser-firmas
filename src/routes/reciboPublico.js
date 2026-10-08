const express = require('express');
const pool = require('../services/db');
const { subirFirmaServicio } = require('../services/storage');
const { formatDateTime, paginaPublicaError } = require('../views/reciboPublico/helpers');
const { renderRecibo } = require('../views/reciboPublico/recibo');
const { renderServicio } = require('../views/reciboPublico/servicio');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Vistas públicas (sin ?usuario= ni sesión interna) para que el cliente final
// vea su recibo/servicio desde el link que se envía por WhatsApp o correo, y
// para que el conductor firme la entrega. Portado desde el servicio standalone
// "recibo-recaudo" (antes en reciboprovisional.logyser.com) para que corra
// dentro del mismo proceso ya activo de doclogyser-firmas: así se evita el
// "cold start" del contenedor aparte (la demora de la primera carga que
// reportaron) reutilizando el pool de conexiones y el cliente de GCS que ya
// están calientes por el resto de la app.
// ─────────────────────────────────────────────────────────────────────────────

// Cache en memoria del recibo (datos de solo lectura, se repiten muchas veces
// cuando el mismo cliente reabre el link). TTL corto porque Bloqueo/Forma de
// Pago pueden cambiar durante el día.
const CACHE_TTL = 5 * 60 * 1000;
const reciboCache = new Map();

function cachePut(key, data) {
  reciboCache.set(key, { data, ts: Date.now() });
  if (reciboCache.size > 500) {
    const ahora = Date.now();
    for (const [k, v] of reciboCache) {
      if (ahora - v.ts > CACHE_TTL) reciboCache.delete(k);
    }
  }
}
function cacheGet(key) {
  const entry = reciboCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { reciboCache.delete(key); return null; }
  return entry.data;
}

// IDs reales son UUIDs cortos tipo AppSheet (letras/números/guiones, <= 40 chars).
// Validar el formato antes de tocar la base de datos evita gastar una consulta
// completa en basura obvia (bots, escaneos, copias mal hechas del link).
const ID_VALIDO = /^[A-Za-z0-9_-]{1,40}$/;

function idInvalido(valor) {
  return !valor || !ID_VALIDO.test(valor);
}

async function cargarDatosRecibo(idRecibo) {
  const [[reciboRows], [serviciosRows]] = await Promise.all([
    pool.execute(`
      SELECT
          r.IdRecibo,
          r.\`Consecutivo Recibo\`,
          r.Operación,
          r.Usuario,
          r.Fecha,
          r.Nit,
          r.Telefono,
          r.Email,
          r.Observaciones,
          r.Retefuente,
          r.ReteIVA,
          r.ReteICA,
          mc.\`Razón social\`        AS Nombres,
          v.retefuente,
          v.reteiva,
          v.reteica,
          v.total                   AS TotalVista,
          v.iva                     AS IvaVista
      FROM Dynamic_Recibos r
      LEFT JOIN Maestro_Clientes mc
          ON mc.\`Código\` = r.Nit
      LEFT JOIN vista_recibos_appsheet v
          ON v.idrecibo = r.IdRecibo
      WHERE r.IdRecibo = ?`,
      [idRecibo]
    ),
    pool.execute(`
      SELECT
          s.\`Proveedor Texto\`,
          s.Vehiculo,
          s.Unidad,
          s.Cantidad,
          s.\`Valor Unitario\`,
          s.\`Hora Inicio\`,
          s.\`Forma De Pago\`,
          ca.Actividad              AS ActividadNombre,
          mp.Placa                  AS PlacaReal,
          fp.\`Forma de Pago\`      AS FormaPagoNombre,
          carea.AREA                AS AreaNombre,
          mt.Transportadora         AS TransportadoraNombre,
          COALESCE(s.\`Proveedor Texto\`, mp2.Proveedor) AS ProveedorNombre
      FROM Dynamic_Servicios s
      LEFT JOIN Config_Actividad ca
          ON ca.ID = s.Actividad
      LEFT JOIN Maestro_Placas mp
          ON mp.ID = s.PL1
      LEFT JOIN Config_Forma_Pago fp
          ON fp.ID = s.\`Forma De Pago\`
      LEFT JOIN Config_Area carea
          ON carea.ID = s.Area
      LEFT JOIN Maestro_Transportadora mt
          ON mt.ID = s.Transportadora
      LEFT JOIN Maestro_Proveedor mp2
          ON mp2.ID = s.Proveedor
      WHERE s.IdRecibo = ?
      ORDER BY s.\`Hora Inicio\` ASC`,
      [idRecibo]
    )
  ]);

  if (reciboRows.length === 0) return null;
  const r = reciboRows[0];

  const serviciosFiltrados = serviciosRows.filter(s => {
    const fp = s['Forma De Pago'];
    const fpNombre = (s.FormaPagoNombre || '').toLowerCase();
    return fp && Number(fp) !== 0 && !fpNombre.includes('anulado');
  });

  const ultimoServicio = serviciosFiltrados.length > 0
    ? serviciosFiltrados[serviciosFiltrados.length - 1]
    : null;

  const fechasInicio = serviciosFiltrados
    .map(s => s['Hora Inicio'])
    .filter(f => f != null);
  const fechaMinimaServicio = fechasInicio.length > 0
    ? new Date(Math.min(...fechasInicio.map(f => new Date(f))))
    : (r.Fecha || new Date());

  const consecutivoFinal = (r['Consecutivo Recibo'] && r['Consecutivo Recibo'].trim() !== '')
    ? r['Consecutivo Recibo']
    : r.IdRecibo;

  return {
    r,
    serviciosRows: serviciosFiltrados,
    ultimoServicio,
    fechaMinimaServicio: fechaMinimaServicio.toLocaleString('es-CO'),
    hora: r.Fecha ? new Date(r.Fecha).toLocaleString('es-CO') : '',
    consecutivoFinal,
    subtotal: serviciosFiltrados.reduce((acc, s) => acc + ((s.Cantidad || 0) * (s['Valor Unitario'] || 0)), 0)
  };
}

async function responderRecibo(idRecibo, res) {
  if (idInvalido(idRecibo)) {
    const e = paginaPublicaError('Enlace de recibo inválido.', 400);
    return res.status(e.status).send(e.html);
  }

  const cached = cacheGet(idRecibo);
  if (cached) {
    res.set('Cache-Control', 'private, max-age=60');
    return res.send(renderRecibo(cached));
  }

  const templateData = await cargarDatosRecibo(idRecibo);
  if (!templateData) {
    const e = paginaPublicaError('Recibo no encontrado.', 404);
    return res.status(e.status).send(e.html);
  }

  cachePut(idRecibo, templateData);
  // PII del cliente (nombre, nit, teléfono) va en la página: cache solo privado,
  // nunca en proxys/CDN compartidos.
  res.set('Cache-Control', 'private, max-age=60');
  res.send(renderRecibo(templateData));
}

// ── GET /recibo/:idRecibo ───────────────────────────────────────────────────
router.get('/recibo/:idRecibo', async (req, res) => {
  try {
    await responderRecibo(req.params.idRecibo, res);
  } catch (error) {
    console.error('[reciboPublico] GET /recibo/:idRecibo', error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

// ── GET /consecutivo/:nro ───────────────────────────────────────────────────
// Acceso corto para personal interno que recuerda el "Consecutivo Recibo"
// visible al cliente en vez del IdRecibo (UUID). Renderiza directo (sin
// redirect) para no pagar una segunda vuelta de red innecesaria.
router.get('/consecutivo/:nro', async (req, res) => {
  try {
    const nroConsecutivo = req.params.nro;
    if (!nroConsecutivo) {
      const e = paginaPublicaError('Consecutivo inválido.', 400);
      return res.status(e.status).send(e.html);
    }

    const [rows] = await pool.execute(
      'SELECT IdRecibo FROM Dynamic_Recibos WHERE `Consecutivo Recibo` = ?',
      [nroConsecutivo]
    );

    if (rows.length === 0) {
      const e = paginaPublicaError('El número de consecutivo no existe.', 404);
      return res.status(e.status).send(e.html);
    }

    await responderRecibo(rows[0].IdRecibo, res);
  } catch (error) {
    console.error('[reciboPublico] GET /consecutivo/:nro', error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

// ── GET /servicio/:idServicio ───────────────────────────────────────────────
router.get('/servicio/:idServicio', async (req, res) => {
  try {
    const idServicio = req.params.idServicio;
    if (idInvalido(idServicio)) {
      const e = paginaPublicaError('Enlace de servicio inválido.', 400);
      return res.status(e.status).send(e.html);
    }

    const [rows] = await pool.execute(`
      SELECT
          s.IdServicio,
          s.IdRecibo,
          s.Estado,
          s.Usuario,
          s.Area,
          s.Fecha,
          s.Transportadora,
          s.Proveedor,
          s.\`Proveedor Texto\`,
          s.Actividad,
          s.Vehiculo,
          s.Remolque,
          s.PL1,
          s.Unidad,
          s.Cantidad,
          s.\`Valor Unitario\`,
          s.Origen,
          s.Destino,
          s.Manifiesto,
          s.\`Hora Inicio\`,
          s.\`Hora Final\`,
          s.\`Forma De Pago\`,
          s.Observaciones,
          s.Notas,
          s.Firma_Recibido,
          r.\`Consecutivo Recibo\`  AS ConsecutivoRecibo,
          r.Operación,
          r.\`Cliente a Facturar\`  AS ClienteAFacturar,
          r.Nit,
          r.Telefono,
          r.Email,
          mc.\`Razón social\`        AS NombreCliente,
          a.AREA                    AS NombreArea,
          t.Transportadora          AS NombreTransportadora,
          act.Actividad             AS NombreActividad,
          p.Placa                   AS NombrePlaca,
          (SELECT Porcentaje FROM Config_Impuestos
           WHERE Concepto = 'IVA' LIMIT 1) AS PorcentajeIva
      FROM Dynamic_Servicios s
      LEFT JOIN Dynamic_Recibos r   ON r.IdRecibo   = s.IdRecibo
      LEFT JOIN Maestro_Clientes mc ON mc.\`Código\` = r.Nit
      LEFT JOIN Config_Area a       ON a.ID          = s.Area
      LEFT JOIN Maestro_Transportadora t ON t.ID     = s.Transportadora
      LEFT JOIN Config_Actividad act ON act.ID       = s.Actividad
      LEFT JOIN Maestro_Placas p    ON p.ID          = s.PL1
      WHERE s.IdServicio = ?`,
      [idServicio]
    );

    if (rows.length === 0) {
      const e = paginaPublicaError('Servicio no encontrado.', 404);
      return res.status(e.status).send(e.html);
    }

    const d = rows[0];
    const subtotal = (d.Cantidad || 0) * (d['Valor Unitario'] || 0);
    const iva = subtotal * (d.PorcentajeIva || 0);
    const totalPago = subtotal + iva;

    const clienteMostrar = (d['Forma De Pago'] == 3)
      ? (d.ClienteAFacturar || d.NombreCliente || '')
      : (d.Nit ? String(d.Nit) : '');

    // No cachear: justo después de firmar, la página hace location.reload() y
    // necesita ver de inmediato la firma recién guardada, no una copia vieja.
    res.set('Cache-Control', 'no-store');
    res.send(renderServicio({
      d,
      subtotal,
      iva,
      totalPago,
      clienteMostrar,
      fechaPie: formatDateTime(d.Fecha),
      fechaCabecera: formatDateTime(d['Hora Inicio']),
      firmaGuardada: d.Firma_Recibido || null
    }));
  } catch (error) {
    console.error('[reciboPublico] GET /servicio/:idServicio', error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

// ── POST /guardar-firma ─────────────────────────────────────────────────────
router.post('/guardar-firma', async (req, res) => {
  try {
    const { idServicio, firmaB64 } = req.body || {};

    if (idInvalido(idServicio)) {
      return res.status(400).json({ error: 'idServicio inválido' });
    }
    if (!firmaB64 || typeof firmaB64 !== 'string' || !firmaB64.startsWith('data:image/png;base64,')) {
      return res.status(400).json({ error: 'Firma inválida: se esperaba una imagen PNG en base64' });
    }

    const base64Payload = firmaB64.slice('data:image/png;base64,'.length);
    const buffer = Buffer.from(base64Payload, 'base64');
    if (buffer.length === 0) {
      return res.status(400).json({ error: 'La firma está vacía' });
    }
    const MAX_FIRMA_BYTES = 2 * 1024 * 1024; // 2MB: muy por encima de lo que pesa una firma real de canvas
    if (buffer.length > MAX_FIRMA_BYTES) {
      return res.status(413).json({ error: 'La firma excede el tamaño permitido' });
    }

    // Idempotencia: evita que una firma ya guardada se sobrescriba por un
    // segundo POST directo (reintento, manipulación del request, etc). La UI
    // ya oculta el botón una vez firmado; esto lo protege también del lado servidor.
    const [existente] = await pool.execute(
      'SELECT Firma_Recibido FROM Dynamic_Servicios WHERE IdServicio = ? LIMIT 1',
      [idServicio]
    );
    if (existente.length === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    if (existente[0].Firma_Recibido && String(existente[0].Firma_Recibido).includes('http')) {
      return res.status(409).json({ error: 'Este servicio ya tiene una firma registrada' });
    }

    const urlFirma = await subirFirmaServicio(idServicio, buffer);

    await pool.execute(
      'UPDATE Dynamic_Servicios SET Firma_Recibido = ? WHERE IdServicio = ?',
      [urlFirma, idServicio]
    );

    res.json({ ok: true, success: true, url: urlFirma });
  } catch (error) {
    console.error('[reciboPublico] POST /guardar-firma', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
