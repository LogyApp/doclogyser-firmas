const express = require('express');
const fs = require('fs');
const path = require('path');
const { computarAccesoSst } = require('../services/accesoSst');
const { permisosSstDelRol } = require('../services/configSst');
const {
  obtenerConfigInspeccionesSST,
  obtenerLimitesInspeccion,
  obtenerResumenPlantillasInspeccion,
  obtenerPlantillaInspeccion,
  buscarPlacasEnMaestro,
  crearInspeccionVehiculo,
  listarInspeccionesSST,
  obtenerDetalleInspeccionSST,
  eliminarInspeccionSST,
  buscarColaboradorPorIdentificacionSST,
  buscarColaboradoresSST,
  COLUMNAS_REPORTE_INSPECCIONES,
  contarFilasReporteInspecciones,
  obtenerFilasReporteInspecciones,
} = require('../services/inspeccionesVehiculoService');
const {
  generarXlsx,
  encabezadoCsv,
  filaCsv,
  nombreArchivo,
} = require('../services/exportarReporte');

const router = express.Router();
const HTML_INDEX_PATH = path.join(__dirname, '../views/sst/index.html');
const SECCION_INSPECCIONES_SST = 'Inspecciones_vehiculos';

// El acceso de los roles al módulo SST y a cada una de sus pestañas funciona
// exclusivamente con lo registrado en Maestro_Menu (Modulo 'sst'; igual que Nómina).
async function computarAccesoSST(usuarioId, seccionRequested = null) {
  const acceso = await computarAccesoSst(usuarioId, seccionRequested);
  if (!acceso) return null;

  const cfgInspecciones = await obtenerConfigInspeccionesSST(acceso.rol);
  acceso.inspeccionesConfig = cfgInspecciones;
  return acceso;
}

// ══════════════════════════════════════════════════════════════════════════════
// API — PESTAÑA INSPECCIONES VEHÍCULOS (MÓDULO SST, Sección: Inspecciones_vehiculos)
// ══════════════════════════════════════════════════════════════════════════════

// 1. Listado + conteos interactivos por faceta + estadísticas
router.get('/api/inspecciones/datos', async (req, res) => {
  try {
    const { usuario } = req.query;
    const acceso = await computarAccesoSST(usuario, SECCION_INSPECCIONES_SST);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado para Inspecciones de vehículos (Maestro_Menu)' });

    const data = await listarInspeccionesSST(acceso, req.query);
    res.json(data);
  } catch (err) {
    console.error('[sst] Error en GET /api/inspecciones/datos:', err);
    res.status(500).json({ error: 'Error al consultar inspecciones de vehículos' });
  }
});

// 2. Detalle completo de una inspección (incluyendo checklist y fotos)
router.get('/api/inspecciones/detalle/:id', async (req, res) => {
  try {
    const { usuario } = req.query;
    const acceso = await computarAccesoSST(usuario, SECCION_INSPECCIONES_SST);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const detalle = await obtenerDetalleInspeccionSST(req.params.id, acceso);
    if (!detalle) return res.status(404).json({ error: 'Inspección no encontrada' });

    res.json(detalle);
  } catch (err) {
    console.error('[sst] Error en GET /api/inspecciones/detalle/:id:', err);
    res.status(500).json({ error: 'Error al obtener el detalle de la inspección' });
  }
});

// 3. Conteo previo para el modal de descarga de reporte Excel / CSV (como en Kardex)
router.get('/api/inspecciones/reporte/conteo', async (req, res) => {
  try {
    const { usuario } = req.query;
    const acceso = await computarAccesoSST(usuario, SECCION_INSPECCIONES_SST);
    if (!acceso) return res.status(403).json({ ok: false, error: 'Usuario no autorizado' });

    const total = await contarFilasReporteInspecciones(acceso, req.query);
    const limites = acceso.inspeccionesConfig?.limitesReporte || { excel: 10000, csv: 100000 };
    res.json({
      ok: true,
      total,
      permiteExcel: total > 0 && total <= limites.excel,
      permiteCsv: total > 0 && total <= limites.csv,
      limites,
      limiteExcel: limites.excel,
      limiteCsv: limites.csv,
    });
  } catch (err) {
    console.error('[sst] Error en GET /api/inspecciones/reporte/conteo:', err);
    res.status(500).json({ ok: false, error: 'Error al contar registros para el reporte' });
  }
});

// 4. Descarga del reporte en Excel (.xlsx) o CSV (.csv)
router.get('/api/inspecciones/reporte', async (req, res) => {
  try {
    const { usuario } = req.query;
    const acceso = await computarAccesoSST(usuario, SECCION_INSPECCIONES_SST);
    if (!acceso) return res.status(403).send('No autorizado');

    const formato = String(req.query.formato || 'xlsx').toLowerCase() === 'csv' ? 'csv' : 'xlsx';
    const limites = acceso.inspeccionesConfig?.limitesReporte || { excel: 10000, csv: 100000 };

    const total = await contarFilasReporteInspecciones(acceso, req.query);
    if (total === 0) {
      return res.status(400).send('No hay registros con los filtros seleccionados.');
    }
    if (formato === 'xlsx' && total > limites.excel) {
      return res.status(400).send(
        `El reporte tiene ${total.toLocaleString('es-CO')} filas y supera el límite para Excel (${limites.excel.toLocaleString('es-CO')}). Descárgalo en CSV o acota los filtros.`
      );
    }
    if (total > limites.csv) {
      return res.status(400).send(
        `El reporte tiene ${total.toLocaleString('es-CO')} filas y supera el límite máximo (${limites.csv.toLocaleString('es-CO')}). Acota el rango de fechas u otros filtros.`
      );
    }

    const filas = await obtenerFilasReporteInspecciones(
      acceso,
      req.query,
      formato === 'xlsx' ? limites.excel : limites.csv
    );

    if (formato === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo('Reporte_Inspecciones_Vehiculos', 'csv')}"`);
      res.write(encabezadoCsv(COLUMNAS_REPORTE_INSPECCIONES));
      for (const r of filas) {
        res.write(filaCsv(COLUMNAS_REPORTE_INSPECCIONES, r));
      }
      return res.end();
    }

    const buffer = generarXlsx({
      hoja: 'Inspecciones Vehículos',
      columnas: COLUMNAS_REPORTE_INSPECCIONES,
      filas,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo('Reporte_Inspecciones_Vehiculos', 'xlsx')}"`);
    res.send(buffer);
  } catch (err) {
    console.error('[sst] Error en GET /api/inspecciones/reporte:', err);
    if (!res.headersSent) res.status(500).send('Error generando reporte: ' + err.message);
  }
});

// 5. Buscar trabajador por Identificación (cédula exacta) en Maestro_Vinculación
router.get('/api/inspecciones/trabajador/:identificacion', async (req, res) => {
  try {
    const { usuario } = req.query;
    const acceso = await computarAccesoSST(usuario, SECCION_INSPECCIONES_SST);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const info = await buscarColaboradorPorIdentificacionSST(req.params.identificacion, acceso);
    if (!info) {
      return res.status(404).json({ error: 'No se encontró ningún trabajador con esa identificación en Maestro_Vinculación.' });
    }
    if (info.fueraDeAlcance) {
      return res.status(403).json({
        error: `El trabajador ${info.colaborador.nombre} pertenece a la operación "${info.colaborador.operacion}" (${info.colaborador.regional}), que está fuera de su alcance de visualización.`,
      });
    }

    res.json(info);
  } catch (err) {
    console.error('[sst] Error en GET /api/inspecciones/trabajador/:identificacion:', err);
    res.status(500).json({ error: 'Error consultando datos del trabajador' });
  }
});

// 6. Autocompletado de trabajadores por nombre o cédula dentro del alcance del usuario
router.get('/api/inspecciones/buscar-trabajador', async (req, res) => {
  try {
    const { usuario, q } = req.query;
    const acceso = await computarAccesoSST(usuario, SECCION_INSPECCIONES_SST);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const items = await buscarColaboradoresSST(q, acceso);
    res.json({ items });
  } catch (err) {
    console.error('[sst] Error en GET /api/inspecciones/buscar-trabajador:', err);
    res.status(500).json({ items: [] });
  }
});

// 7. Obtener plantilla de preguntas para el medio de transporte seleccionado
router.get('/api/inspecciones/plantilla', async (req, res) => {
  try {
    const { usuario, type, subtype } = req.query;
    const acceso = await computarAccesoSST(usuario, SECCION_INSPECCIONES_SST);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const template = obtenerPlantillaInspeccion(type, subtype);
    res.json({ ok: true, template });
  } catch (err) {
    console.error('[sst] Error en GET /api/inspecciones/plantilla:', err);
    res.status(500).json({ error: 'No se pudo cargar la plantilla de inspección' });
  }
});

// 8. Autocompletar placas desde Maestro_Placas
router.get('/api/inspecciones/placas', async (req, res) => {
  try {
    const { usuario, q } = req.query;
    const acceso = await computarAccesoSST(usuario, SECCION_INSPECCIONES_SST);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const items = await buscarPlacasEnMaestro(q || '');
    res.json({ ok: true, items });
  } catch (err) {
    console.error('[sst] Error en GET /api/inspecciones/placas:', err);
    res.status(500).json({ error: 'Error consultando placas' });
  }
});

// 9. Guardar nueva inspección registrada desde SST
router.post('/api/inspecciones/guardar', async (req, res) => {
  try {
    const usuario = req.query.usuario || req.body?.usuario;
    const acceso = await computarAccesoSST(usuario, SECCION_INSPECCIONES_SST);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    if (!acceso.inspeccionesConfig?.puedeRegistrar) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para registrar inspecciones de vehículos en SST.' });
    }

    const identificacion = String(req.body?.identificacion || '').trim();
    if (!identificacion) {
      return res.status(400).json({ error: 'Debe indicar la identificación del trabajador.' });
    }

    const infoTrab = await buscarColaboradorPorIdentificacionSST(identificacion, acceso);
    if (!infoTrab) {
      return res.status(404).json({ error: 'Trabajador no encontrado en Maestro_Vinculación.' });
    }
    if (infoTrab.fueraDeAlcance) {
      return res.status(403).json({ error: 'El trabajador seleccionado está fuera de su alcance de operación.' });
    }

    const result = await crearInspeccionVehiculo(infoTrab.colaborador, req.body || {});
    res.json(result);
  } catch (err) {
    console.error('[sst] Error en POST /api/inspecciones/guardar:', err);
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message || 'No fue posible guardar la inspección.' });
  }
});

// 10. Eliminar inspección (según roles autorizados en Config_Parametros)
router.delete('/api/inspecciones/:id', async (req, res) => {
  try {
    const { usuario } = req.query;
    const acceso = await computarAccesoSST(usuario, SECCION_INSPECCIONES_SST);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    if (!acceso.inspeccionesConfig?.puedeEliminar) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para eliminar inspecciones.' });
    }

    const out = await eliminarInspeccionSST(req.params.id, acceso);
    if (!out.ok) return res.status(404).json({ error: out.error || 'No se pudo eliminar' });

    res.json({ ok: true });
  } catch (err) {
    console.error('[sst] Error en DELETE /api/inspecciones/:id:', err);
    res.status(500).json({ error: 'Error al eliminar la inspección' });
  }
});

// Servir la vista unificada de SST (soportando tanto /sst como /sst/:tab)
router.get(['/', '/:tab'], async (req, res) => {
  try {
    const { usuario } = req.query;
    const tabRuta = req.params.tab || null;

    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const acceso = await computarAccesoSST(usuario);
    if (!acceso) {
      return res.status(403).send('<h2>Error: Usuario no autorizado para el módulo SST (sin acceso configurado en Maestro_Menu)</h2>');
    }

    if (!fs.existsSync(HTML_INDEX_PATH)) {
      return res.status(500).send('<h2>Error: Plantilla de interfaz no encontrada</h2>');
    }

    const html = fs.readFileSync(HTML_INDEX_PATH, 'utf8');
    const limitesInspeccion = await obtenerLimitesInspeccion();

    const config = JSON.stringify({
      ...acceso,
      tabRuta,
      regionalesFiltro: Object.keys(acceso.opsPorRegional),
      inspeccionesPlantillas: obtenerResumenPlantillasInspeccion(),
      inspeccionesLimites: limitesInspeccion,
      permisosSst: await permisosSstDelRol(acceso.rol), // crear/eliminar/plantillas (Config_Parametros, sst)
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[sst] Error serving SST hub:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

router.computarAccesoSST = computarAccesoSST;
module.exports = router;
