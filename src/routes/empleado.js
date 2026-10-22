const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');
const {
  buscarTrabajadorCesantias,
  obtenerFondosCesantias,
  obtenerMotivosCesantias,
  obtenerLimitesCesantias,
} = require('../services/cesantiasService');
const {
  obtenerLimitesInspeccion,
  obtenerResumenPlantillasInspeccion,
  obtenerPlantillaInspeccion,
  listarVehiculosHabitualesColaborador,
  buscarPlacasEnMaestro,
  listarInspeccionesColaborador,
  calcularEstadisticasMesColaborador,
  crearInspeccionVehiculo,
  generarFormatoBlancoPDF,
} = require('../services/inspeccionesVehiculoService');

const router = express.Router();
const HTML_INDEX_PATH = path.join(__dirname, '../views/empleado/index.html');

function limpiarNombre(nombre) {
  if (!nombre) return '';
  const partes = String(nombre).split(' ** ');
  return (partes.length > 1 ? partes[1] : nombre).trim();
}

function construirUrlTalenthub(docPath) {
  if (!docPath) return null;
  if (docPath.startsWith('http://') || docPath.startsWith('https://')) return docPath;
  return `https://storage.googleapis.com/talenthub_central/${docPath.replace(/^\/+/, '')}`;
}

/**
 * Busca la vinculación más relevante para una identificación (priorizando Activo y más reciente).
 */
async function buscarVinculacionPorIdentificacion(identificacion) {
  const idLimpio = String(identificacion || '').replace(/[^0-9A-Za-z-]/g, '').trim();
  if (!idLimpio) return null;

  const [rows] = await pool.execute(
    `SELECT
       \`Id Vinculación\` AS idVinculacion,
       \`Identificación\` AS identificacion,
       Trabajador AS trabajador,
       Cargo AS cargo,
       \`Operación\` AS operacion,
       Regional AS regional,
       Estado AS estado,
       DATE_FORMAT(\`Fecha de Ingreso\`, '%Y-%m-%d') AS fechaIngreso,
       DATE_FORMAT(\`Fecha de Retiro\`, '%Y-%m-%d') AS fechaRetiro
     FROM \`Maestro_Vinculación\`
     WHERE \`Identificación\` = ?
     ORDER BY (Estado = 'Activo') DESC, \`Fecha de Ingreso\` DESC, \`Id Vinculación\` DESC
     LIMIT 1`,
    [idLimpio]
  );

  if (!rows.length) return null;
  const r = rows[0];
  return {
    idVinculacion: r.idVinculacion,
    identificacion: String(r.identificacion),
    nombre: limpiarNombre(r.trabajador),
    trabajadorCompleto: r.trabajador,
    cargo: r.cargo || '—',
    operacion: r.operacion || '—',
    regional: r.regional || '—',
    estado: r.estado || '—',
    fechaIngreso: r.fechaIngreso || null,
    fechaRetiro: r.fechaRetiro || null,
  };
}

/**
 * Obtiene toda la información del portal del colaborador a partir de su Id Vinculación.
 */
async function obtenerDatosPortalPorVinculacion(idVinculacion) {
  const idVinc = String(idVinculacion || '').trim();
  if (!idVinc) return null;

  const [vinRows] = await pool.execute(
    `SELECT
       \`Id Vinculación\` AS idVinculacion,
       \`Identificación\` AS identificacion,
       Trabajador AS trabajador,
       Cargo AS cargo,
       \`Operación\` AS operacion,
       Regional AS regional,
       Estado AS estado,
       DATE_FORMAT(\`Fecha de Ingreso\`, '%Y-%m-%d') AS fechaIngreso,
       DATE_FORMAT(\`Fecha de Retiro\`, '%Y-%m-%d') AS fechaRetiro
     FROM \`Maestro_Vinculación\`
     WHERE \`Id Vinculación\` = ?
     LIMIT 1`,
    [idVinc]
  );

  if (!vinRows.length) return null;
  const vin = vinRows[0];
  const identificacion = String(vin.identificacion);

  // Consultar datos en Maestro_Segmentación
  const [segRows] = await pool.execute(
    `SELECT
       Trabajador,
       \`Operación\` AS Operacion,
       Estado,
       Celular,
       Email,
       \`Nombre Contacto de Emergencia\` AS nombreEmergencia,
       \`Telefono Contacto de Emergencia\` AS telefonoEmergencia,
       Camiseta,
       Numero,
       Pantalon,
       Botas,
       Banco,
       \`N° Cuenta Bancaria\` AS nCuentaBancaria,
       \`Cesantías\` AS fondoCesantias,
       DATE_FORMAT(\`Fecha de Actualización\`, '%Y-%m-%d %H:%i') AS fechaActualizacion
     FROM \`Maestro_Segmentación\`
     WHERE \`Identificación\` = ?
     LIMIT 1`,
    [identificacion]
  );
  const seg = segRows[0] || {};

  // Consultar historial de solicitudes de Cesantías del trabajador
  const [cesRows] = await pool.execute(
    `SELECT
       c.Id,
       c.identificacion,
       c.ciudad_solicitud,
       c.fondo_cesantias,
       c.monto_solicitado,
       c.motivo_retiro,
       m.tipo_retiro,
       m.motivo_retiro AS motivo_texto,
       IF(c.estado = 'cancelado', 'anulado', c.estado) AS estado,
       c.observaciones,
       DATE_FORMAT(c.fecha_registro, '%Y-%m-%d %H:%i') AS fecha_registro,
       DATE_FORMAT(c.fecha_validacion, '%Y-%m-%d %H:%i') AS fecha_validacion,
       DATE_FORMAT(c.fecha_gestion, '%Y-%m-%d %H:%i') AS fecha_gestion,
       DATE_FORMAT(c.fecha_tramite, '%Y-%m-%d %H:%i') AS fecha_tramite,
       pdf.Doc AS pdf_solicitud
     FROM Dynamic_Cesantias c
     LEFT JOIN Config_MotivoCesantias m ON c.motivo_retiro = m.Id
     LEFT JOIN (
       SELECT recurso, MAX(Doc) AS Doc
       FROM Maestro_docTrabajador
       WHERE TipoDocumento = '46' AND Observaciones = 'Formato de Solicitud de Retiro de Cesantías'
       GROUP BY recurso
     ) pdf ON c.Id = pdf.recurso
     WHERE c.identificacion = ?
     ORDER BY c.fecha_registro DESC
     LIMIT 50`,
    [identificacion]
  );

  const solicitudesCesantias = cesRows.map(r => ({
    ...r,
    pdf_solicitud: r.pdf_solicitud ? construirUrlTalenthub(r.pdf_solicitud) : null,
  }));

  // Datos prellenados para el formulario de cesantías (si está activo)
  let datosCesantiasForm = null;
  let errorCesantiasForm = null;
  try {
    datosCesantiasForm = await buscarTrabajadorCesantias(identificacion);
  } catch (err) {
    errorCesantiasForm = err.message;
  }

  // Firma registrada del colaborador (para cesantías e inspecciones)
  let firmaUrl = datosCesantiasForm ? datosCesantiasForm.firmaUrl : null;
  if (!firmaUrl) {
    try {
      const [fRows] = await pool.execute(
        `SELECT Doc FROM Maestro_docTrabajador
         WHERE Identificacion = ? AND TipoDocumento = '22'
         ORDER BY Fecha DESC LIMIT 1`,
        [identificacion]
      );
      if (fRows.length && fRows[0].Doc) {
        firmaUrl = construirUrlTalenthub(fRows[0].Doc);
      }
    } catch (_) { /* ignorar error de firma opcional */ }
  }

  // Consultar estadísticas e historial de inspecciones preoperacionales del colaborador
  const [inspeccionesStats, inspeccionesRecientes, limitesInspeccion, vehiculosHabituales] = await Promise.all([
    calcularEstadisticasMesColaborador(identificacion).catch(() => ({
      totalMonth: 0, aptoCount: 0, novedadCount: 0, noAptoCount: 0, uniqueVehicles: 0,
    })),
    listarInspeccionesColaborador(identificacion, 30).catch(() => []),
    obtenerLimitesInspeccion().catch(() => ({ maxFotos: 4 })),
    listarVehiculosHabitualesColaborador(identificacion, vin.idVinculacion, limpiarNombre(vin.trabajador || '')).catch(() => ({ placas: [], equipos: [] })),
  ]);

  return {
    idVinculacion: vin.idVinculacion,
    identificacion,
    nombre: limpiarNombre(vin.trabajador || seg.Trabajador || ''),
    trabajadorCompleto: vin.trabajador || seg.Trabajador || '',
    cargo: vin.cargo || '—',
    operacion: vin.operacion || seg.Operacion || '—',
    regional: vin.regional || '—',
    estado: vin.estado || seg.Estado || '—',
    fechaIngreso: vin.fechaIngreso || null,
    fechaRetiro: vin.fechaRetiro || null,
    firmaUrl: firmaUrl || null,
    datosPersonales: {
      trabajador: vin.trabajador || seg.Trabajador || '',
      operacion: seg.Operacion || vin.operacion || '',
      estado: seg.Estado || vin.estado || '',
      cargo: vin.cargo || '',
      fechaIngreso: vin.fechaIngreso || null,
      regional: vin.regional || '',
      celular: seg.Celular || '',
      email: seg.Email || '',
      nombreEmergencia: seg.nombreEmergencia || '',
      telefonoEmergencia: seg.telefonoEmergencia || '',
      camiseta: seg.Camiseta || '',
      numero: seg.Numero || '',
      pantalon: seg.Pantalon || '',
      botas: seg.Botas || '',
      banco: seg.Banco || '',
      nCuentaBancaria: seg.nCuentaBancaria || '',
      fondoCesantias: (seg.fondoCesantias || '').trim(),
      fechaActualizacion: seg.fechaActualizacion || null,
    },
    solicitudesCesantias,
    datosCesantiasForm,
    errorCesantiasForm,
    inspecciones: {
      stats: inspeccionesStats,
      recent: inspeccionesRecientes,
      templates: obtenerResumenPlantillasInspeccion(),
      maxFotos: limitesInspeccion.maxFotos || 4,
      vehiculosHabituales: vehiculosHabituales || { placas: [], equipos: [] },
    },
  };
}

// ── API: Validar Identificación y obtener Id Vinculación ─────────────────────
router.get('/api/ingresar/:identificacion', async (req, res) => {
  try {
    const vinc = await buscarVinculacionPorIdentificacion(req.params.identificacion);
    if (!vinc) {
      return res.status(404).json({
        ok: false,
        error: 'No encontramos una vinculación registrada con esa identificación. Verifica tu número de documento.',
      });
    }
    res.json({
      ok: true,
      idVinculacion: vinc.idVinculacion,
      identificacion: vinc.identificacion,
      nombre: vinc.nombre,
      cargo: vinc.cargo,
      operacion: vinc.operacion,
      estado: vinc.estado,
    });
  } catch (err) {
    console.error('[empleado] Error en GET /api/ingresar/:identificacion:', err);
    res.status(500).json({ ok: false, error: 'Error al consultar la identificación en el sistema.' });
  }
});

// ── API: Obtener todos los datos del portal por Id Vinculación ───────────────
router.get('/api/datos', async (req, res) => {
  try {
    const idVinculacion = req.query.idvinculacion || req.query.idVinculacion || '';
    if (!idVinculacion) {
      return res.status(400).json({ ok: false, error: 'El parámetro idvinculacion es requerido.' });
    }

    const portalData = await obtenerDatosPortalPorVinculacion(idVinculacion);
    if (!portalData) {
      return res.status(404).json({
        ok: false,
        error: `No se encontró la vinculación "${idVinculacion}".`,
      });
    }

    const [motivos, fondos, limites] = await Promise.all([
      obtenerMotivosCesantias().catch(() => []),
      obtenerFondosCesantias().catch(() => []),
      obtenerLimitesCesantias().catch(() => ({ maxSoporteMB: 15 })),
    ]);

    res.json({
      ok: true,
      colaborador: portalData,
      catalogosCesantias: {
        motivos,
        fondos,
        maxSoporteMB: limites.maxSoporteMB || 15,
      },
    });
  } catch (err) {
    console.error('[empleado] Error en GET /api/datos:', err);
    res.status(500).json({ ok: false, error: 'Error interno al cargar los datos del portal.' });
  }
});

// ── API Inspecciones: Buscar placas en Maestro_Placas (autocompletado) ────────
router.get('/api/inspecciones/placas', async (req, res) => {
  try {
    const lista = await buscarPlacasEnMaestro(req.query.q || '');
    res.json({ ok: true, placas: lista });
  } catch (err) {
    res.status(500).json({ ok: false, placas: [] });
  }
});

// ── API Inspecciones: Obtener plantilla completa por tipo/subtipo ─────────────
router.get('/api/inspecciones/plantilla', (req, res) => {
  try {
    const { type, subtype } = req.query;
    const template = obtenerPlantillaInspeccion(type, subtype);
    res.json({ ok: true, template });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Plantilla no encontrada.' });
  }
});

// ── API Inspecciones: Descargar formato en blanco en PDF ─────────────────────
router.get('/api/inspecciones/formato-blanco', async (req, res) => {
  try {
    const { type, subtype } = req.query;
    const { buffer, filename } = await generarFormatoBlancoPDF(type, subtype);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error('[empleado] Error generando formato en blanco de inspección:', err);
    res.status(400).json({ ok: false, error: err.message || 'No se pudo generar el formato en blanco.' });
  }
});

// ── API Inspecciones: Guardar inspección preoperacional y generar PDF ─────────
router.post('/api/inspecciones/guardar', async (req, res) => {
  try {
    const { idVinculacion } = req.body || {};
    if (!idVinculacion) {
      return res.status(400).json({ ok: false, error: 'Falta el Id de Vinculación del colaborador.' });
    }

    const portalData = await obtenerDatosPortalPorVinculacion(idVinculacion);
    if (!portalData) {
      return res.status(404).json({ ok: false, error: 'No se encontró la vinculación del colaborador.' });
    }

    const resultado = await crearInspeccionVehiculo(req.body, {
      idVinculacion: portalData.idVinculacion,
      identificacion: portalData.identificacion,
      nombre: portalData.nombre,
      cargo: portalData.cargo,
      regional: portalData.regional,
      operacion: portalData.operacion,
    });

    res.json(resultado);
  } catch (err) {
    console.error('[empleado] Error guardando inspección de vehículo:', err);
    res.status(400).json({ ok: false, error: err.message || 'Error al registrar la inspección.' });
  }
});

// ── Vista Principal: /empleado y /empleado/:tab ──────────────────────────────
router.get(['/', '/:tab'], async (req, res, next) => {
  try {
    const tabParam = (req.params.tab || '').toLowerCase();
    // Evitar interceptar subrutas estáticas o de API
    if (tabParam === 'api' || tabParam === 'formcesantias') {
      return next();
    }

    const tabsValidas = ['inicio', 'cesantias', 'actualizardatos', 'inspecciones'];
    const tabInicial = tabsValidas.includes(tabParam)
      ? tabParam
      : (tabsValidas.includes(String(req.query.tab || '').toLowerCase()) ? String(req.query.tab).toLowerCase() : 'inicio');

    const idVinculacion = String(req.query.idvinculacion || req.query.idVinculacion || '').trim();

    if (!fs.existsSync(HTML_INDEX_PATH)) {
      return res.status(500).send('<h2>Error: Plantilla de Mi Portal no encontrada</h2>');
    }

    const html = fs.readFileSync(HTML_INDEX_PATH, 'utf8');

    let initialConfig = {
      modo: 'login',
      idVinculacion: '',
      tabInicial,
      errorInicial: null,
      colaborador: null,
      catalogosCesantias: { motivos: [], fondos: [], maxSoporteMB: 15 },
    };

    if (idVinculacion) {
      const portalData = await obtenerDatosPortalPorVinculacion(idVinculacion);
      if (portalData) {
        const [motivos, fondos, limites] = await Promise.all([
          obtenerMotivosCesantias().catch(() => []),
          obtenerFondosCesantias().catch(() => []),
          obtenerLimitesCesantias().catch(() => ({ maxSoporteMB: 15 })),
        ]);
        initialConfig = {
          modo: 'portal',
          idVinculacion: portalData.idVinculacion,
          tabInicial,
          errorInicial: null,
          colaborador: portalData,
          catalogosCesantias: {
            motivos,
            fondos,
            maxSoporteMB: limites.maxSoporteMB || 15,
          },
        };
      } else {
        initialConfig = {
          modo: 'login',
          idVinculacion: '',
          tabInicial,
          errorInicial: `No se encontró ningún colaborador con el Id de Vinculación "${idVinculacion}". Por favor ingresa tu número de identificación.`,
          colaborador: null,
          catalogosCesantias: { motivos: [], fondos: [], maxSoporteMB: 15 },
        };
      }
    }

    const configJson = JSON.stringify(initialConfig).replace(/<\/script>/gi, '<\\/script>');
    res.send(html.replace('__CONFIG__', configJson));
  } catch (err) {
    console.error('[empleado] Error sirviendo vista de Mi Portal:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

module.exports = router;
