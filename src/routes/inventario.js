const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const pool = require('../services/db');
const { obtenerFirmaBase64Reciente, obtenerUrlFirmaReciente, subirFirma, subirPDFConfirmacionInventario, storage } = require('../services/storage');
const { notificarConfirmacionInventario, notificarTransferenciaDespachada, notificarTransferenciaRecibida, notificarActaFirma } = require('../services/email');
const { generarPDF } = require('../services/renderer');
const { computarAccesoInventario, agruparOperacionesPorRegional } = require('../services/accesoInventario');
const { registrarKardexActa, construirDatosPlantilla, obtenerContactoTrabajador } = require('../services/actas');
const { generarToken } = require('../services/token');
const { generarXlsx, encabezadoCsv, filaCsv, nombreArchivo } = require('../services/exportarReporte');
const {
  obtenerConfigPestanaInventario,
  mesConfirmacionPermitido,
  obtenerCategoriasConfirmacion,
  obtenerCondicionesCategoria,
  categoriaEsRecuperable,
  obtenerDestinatariosConfirmacion,
  obtenerConfigKardex,
  destinoTransferenciaPermitido,
  obtenerDestinatariosTransferencia,
  obtenerConfigPendiente,
  obtenerCopiaTransferenciaRecibida,
  obtenerConfigSolicitudes,
  obtenerConfigArticulos,
  obtenerConfigActas,
  obtenerConfigDotacion,
  horasVigenciaEnlaceActas,
  correoActasHabilitado,
  normalizarTexto,
} = require('../services/configInventario');

// ¿La categoría está dentro del acceso del rol? (sin restricción, o una de las categorías del
// acceso restringido 4/5/6, sin distinguir tildes)
function categoriaPermitidaParaRol(acceso, categoria) {
  if (!acceso.filtroCategorias) return true;
  return acceso.filtroCategorias.some((c) => normalizarTexto(c) === normalizarTexto(categoria));
}

// Acceso al gestor de imágenes de elementos (pestaña Artículos): usuario con la pestaña y rol en
// "Roles que pueden gestionar imágenes de elementos". Devuelve el texto del error o null.
async function validarGestorImagenes(usuario) {
  if (!usuario) return { status: 400, error: 'usuario es requerido' };
  const acceso = await computarAccesoInventario(usuario, 'ArtÍculos');
  if (!acceso) return { status: 403, error: 'Usuario no autorizado' };
  if (!(await obtenerConfigArticulos(acceso.rol)).puedeGestionarImagenes) {
    return { status: 403, error: 'Su rol no tiene permiso para gestionar las imágenes de los elementos.' };
  }
  return null;
}
const multer = require('multer');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const HTML_PATH = path.join(__dirname, '../views/inventario/index.html');

// Cache en memoria de los catálogos de /api/kardex-lookups (Artículos, Operaciones, Regionales,
// Categorías): son los mismos para todos los usuarios (el filtrado por acceso de cada uno se
// aplica después, en memoria), y antes se volvían a leer completos de la base de datos en cada
// apertura de la pestaña Kardex. 5 minutos de TTL, igual patrón que cachedImpuestos en facturacion.js.
let cachedLookupsBase = null;
let lastLookupsBaseFetch = 0;
async function getLookupsBase() {
  const now = Date.now();
  if (cachedLookupsBase && (now - lastLookupsBaseFetch < 300000)) {
    return cachedLookupsBase;
  }
  const [artRows] = await pool.execute('SELECT Id, Articulo, Categoria, Costo, Talla, Referencia FROM Dynamic_Articulos ORDER BY Articulo');
  const [opRows] = await pool.execute("SELECT DISTINCT `OPERACIÓN` AS operacion, REGIONAL AS regional FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY `OPERACIÓN`");
  const [regRows] = await pool.execute("SELECT DISTINCT Regional FROM Config_Regionales WHERE Operacion_Principal IS NOT NULL AND Operacion_Principal != '' ORDER BY Regional");
  const [catRows] = await pool.execute("SELECT DISTINCT Categoria FROM Config_Categoria_Inventario WHERE (Condicion != 'No aplica' OR Condicion IS NULL) AND Categoria IS NOT NULL ORDER BY Categoria");

  cachedLookupsBase = { artRows, opRows, regionales: regRows.map((r) => r.Regional), categorias: catRows.map((c) => c.Categoria) };
  lastLookupsBaseFetch = now;
  return cachedLookupsBase;
}

// Servir la interfaz HTML
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const acceso = await computarAccesoInventario(usuario);
    if (!acceso) {
      return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');
    }

    // Reglas de la pestaña Inventario (Config_Parametros, inventario / Inventario)
    const [cfgInventario, categoriasConfirmacion, condicionesCategoria, cfgKardex, todasCategorias] = await Promise.all([
      obtenerConfigPestanaInventario(acceso.rol),
      obtenerCategoriasConfirmacion(acceso.filtroCategorias),
      obtenerCondicionesCategoria(),
      obtenerConfigKardex(acceso.rol), // Reglas de la pestaña Kardex (inventario / Kardex)
      obtenerCategoriasConfirmacion(null),
    ]);
    // Reglas de la pestaña Solicitudes (inventario / Solicitudes)
    const cfgSolicitudes = await obtenerConfigSolicitudes(acceso.rol, todasCategorias);
    // Reglas de la pestaña Artículos (inventario / Artículos) y lista completa de categorías
    // (Config_Categoria_Inventario), que reemplaza la lista de respaldo que tenía la pantalla.
    const cfgArticulos = await obtenerConfigArticulos(acceso.rol);
    const cfgActas = await obtenerConfigActas(acceso.rol); // Reglas de la pestaña Actas (inventario / Actas)
    const cfgDotacion = await obtenerConfigDotacion(acceso.rol); // Reglas de la pestaña Dotación de Ley
    const [catRowsTodas] = await pool.execute('SELECT DISTINCT Categoria FROM Config_Categoria_Inventario WHERE Categoria IS NOT NULL ORDER BY Categoria');

    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const config = JSON.stringify({
      ...acceso,
      regionalesFiltro: Object.keys(acceso.opsPorRegional),
      inventario: { ...cfgInventario, categoriasConfirmacion, condicionesCategoria },
      kardex: cfgKardex,
      solicitudes: cfgSolicitudes,
      articulos: cfgArticulos,
      actas: cfgActas,
      dotacion: cfgDotacion,
      categoriasTodas: catRowsTodas.map((r) => r.Categoria),
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[inventario] Error sirviendo interfaz:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// API para devolver los datos filtrados
//
// OPTIMIZACIÓN (antes: 6 consultas en paralelo contra Vista_Inventario, una por el listado,
// cuatro por los contadores de cada filtro y una por las estadísticas). Vista_Inventario agrupa
// TODO Dynamic_Kardex+Dynamic_Articulos con HAVING, lo que obliga a MySQL a materializarla
// completa ANTES de poder aplicar cualquier WHERE de la consulta externa — medido en ~3.4s para
// la empresa completa sin filtro, y la vista se mandaba a ejecutar 6 veces por cada carga/filtro.
// Como el universo completo de filas de la vista es pequeño (unos pocos miles, no millones), la
// trajimos UNA sola vez (solo con el filtro de seguridad por rol) y replicamos exactamente la
// misma semántica de "conteo por faceta excluyendo su propio filtro" en memoria. Mismo resultado,
// una sola consulta a la base de datos en vez de seis.
router.get('/api/datos', async (req, res) => {
  try {
    const { usuario, regional, operacion, clasificacion, categoria, search } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const securityConds = [];
    const securityParams = [];

    // Restringir categorías si aplica (Acceso 4, 5, 6)
    if (acceso.filtroCategorias) {
      const ph = acceso.filtroCategorias.map(() => '?').join(',');
      securityConds.push(`\`Categoria\` IN (${ph})`);
      securityParams.push(...acceso.filtroCategorias);
    }

    // Security filter based on role/permissions
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json({ results: [], counts: { regionales: {}, operaciones: {}, clasificaciones: {}, categorias: {} } });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      securityConds.push(`\`Operacion\` IN (${ph})`);
      securityParams.push(...acceso.operacionesFiltro);
    }

    const securityWhere = securityConds.length ? `WHERE ${securityConds.join(' AND ')}` : '';

    // Única consulta a la base de datos: todo el universo accesible por el usuario (solo
    // filtro de seguridad, sin los filtros interactivos de la UI).
    const [base] = await pool.execute(`
      SELECT
        \`Regional\`,
        \`Operacion\` AS \`Operacion\`,
        \`Origen\` AS \`Origen\`,
        \`Imagen\` AS \`Imagen\`,
        \`IdArticulo\` AS \`IdArticulo\`,
        \`Articulo\` AS \`Articulo\`,
        \`Talla\` AS \`Talla\`,
        \`Referencia\` AS \`Referencia\`,
        \`Clasificación\` AS \`Clasificacion\`,
        \`Categoria\` AS \`Categoria\`,
        \`Stock Disponible\` AS \`StockDisponible\`,
        \`Valor Stock\` AS \`ValorStock\`,
        \`Observaciones\` AS \`Observaciones\`,
        \`Placa\` AS \`Placa\`
      FROM Vista_Inventario
      ${securityWhere}
    `, securityParams);

    // Predicados equivalentes a los filtros SQL originales, evaluados en memoria.
    const searchLower = search ? String(search).toLowerCase() : null;
    const matchReg = (r) => !regional || r.Regional === regional;
    const matchOp = (r) => !operacion || r.Operacion === operacion;
    const matchCls = (r) => !clasificacion || r.Clasificacion === clasificacion;
    const matchCat = (r) => !categoria || r.Categoria === categoria;
    const matchSearch = (r) => !searchLower ||
      (r.Articulo && String(r.Articulo).toLowerCase().includes(searchLower)) ||
      (r.Referencia && String(r.Referencia).toLowerCase().includes(searchLower));

    // Filas que cumplen TODOS los filtros activos (equivalente a listQuery/statsQuery originales).
    const allFiltered = base.filter((r) => matchReg(r) && matchOp(r) && matchCls(r) && matchCat(r) && matchSearch(r));

    const sumBy = (rows, keyFn) => {
      const acc = {};
      rows.forEach((r) => {
        const key = keyFn(r);
        if (key === null || key === undefined) return;
        acc[key] = (acc[key] || 0) + Number(r.StockDisponible || 0);
      });
      return acc;
    };

    // Cada faceta se calcula excluyendo su propio filtro (misma semántica que las 4 consultas
    // cReg/cOp/cCls/cCat originales), pero sobre los datos ya traídos en memoria.
    const regCounts = sumBy(base.filter((r) => matchOp(r) && matchCls(r) && matchCat(r) && matchSearch(r)), (r) => r.Regional);
    const opCounts = sumBy(base.filter((r) => matchReg(r) && matchCls(r) && matchCat(r) && matchSearch(r)), (r) => r.Operacion);
    const clsCounts = sumBy(base.filter((r) => matchReg(r) && matchOp(r) && matchCat(r) && matchSearch(r)), (r) => r.Clasificacion);
    const catCounts = sumBy(base.filter((r) => matchReg(r) && matchOp(r) && matchCls(r) && matchSearch(r)), (r) => r.Categoria);

    let totalStock = 0;
    let totalValue = 0;
    const distinctArticles = new Set();
    allFiltered.forEach((r) => {
      totalStock += Number(r.StockDisponible || 0);
      totalValue += Number(r.ValorStock || 0);
      distinctArticles.add(r.IdArticulo);
    });

    // Mismo orden y mismo límite de 500 filas que la consulta original.
    const results = allFiltered
      .slice()
      .sort((a, b) =>
        String(a.Regional).localeCompare(String(b.Regional)) ||
        String(a.Operacion).localeCompare(String(b.Operacion)) ||
        String(a.Articulo).localeCompare(String(b.Articulo))
      )
      .slice(0, 500);

    res.json({
      results,
      counts: {
        regionales: regCounts,
        operaciones: opCounts,
        clasificaciones: clsCounts,
        categorias: catCounts
      },
      stats: {
        distinctArticles: distinctArticles.size,
        totalStock,
        totalValue
      }
    });
  } catch (err) {
    console.error('[inventario] GET /api/datos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Reporte de la pestaña Inventario (ventana "Descargar reporte") ──────────
// Mismo alcance que la consulta (operaciones y categorías del rol, Sección 'Inventario').
// Modo: todo | regional | operacion. Excel hasta "Límite de filas reporte Excel - Inventario";
// si pasa, solo CSV hasta "Límite de filas reporte CSV - Inventario"
// (Config_Parametros, inventario / Inventario). Sin la fila → valores por defecto.
const LIMITES_REPORTE_DEFECTO = { excel: 10000, csv: 100000 };

// Límites de filas de un reporte del módulo: Config_Parametros (Modulo 'inventario',
// Seccion = pestaña), conceptos "Límite de filas reporte Excel/CSV - <pestaña>".
async function obtenerLimitesReporte(seccion) {
  const conceptoExcel = `Límite de filas reporte Excel - ${seccion}`;
  const conceptoCsv = `Límite de filas reporte CSV - ${seccion}`;
  const limites = { ...LIMITES_REPORTE_DEFECTO };
  try {
    const [rows] = await pool.execute(
      "SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = ? AND Concepto IN (?, ?)",
      [seccion, conceptoExcel, conceptoCsv]
    );
    rows.forEach((r) => {
      const n = parseInt(r.Parametro, 10);
      if (!(n > 0)) return;
      if (r.Concepto === conceptoExcel) limites.excel = n;
      if (r.Concepto === conceptoCsv) limites.csv = n;
    });
  } catch (err) {
    console.error(`[inventario] No se pudieron leer los límites del reporte de ${seccion}:`, err.message);
  }
  return limites;
}

function obtenerLimitesReporteInventario() {
  return obtenerLimitesReporte('Inventario');
}

// Devuelve { where, params, etiqueta }, { error } o null (el usuario no tiene operaciones).
function construirFiltroReporteInventario(acceso, query) {
  const conds = [];
  const params = [];
  if (acceso.filtroCategorias) {
    conds.push(`\`Categoria\` IN (${acceso.filtroCategorias.map(() => '?').join(',')})`);
    params.push(...acceso.filtroCategorias);
  }
  if (!acceso.sinFiltro) {
    if (!acceso.operacionesFiltro.length) return null;
    conds.push(`\`Operacion\` IN (${acceso.operacionesFiltro.map(() => '?').join(',')})`);
    params.push(...acceso.operacionesFiltro);
  }

  const modo = String(query.modo || 'todo').toLowerCase();
  let etiqueta = 'Todo';
  if (modo === 'regional') {
    const regional = String(query.regional || '').trim();
    if (!regional) return { error: 'Seleccione una regional.' };
    conds.push('`Regional` = ?'); params.push(regional);
    etiqueta = regional;
  } else if (modo === 'operacion') {
    const operacion = String(query.operacion || '').trim();
    if (!operacion) return { error: 'Seleccione una operación.' };
    conds.push('`Operacion` = ?'); params.push(operacion);
    etiqueta = operacion;
  } else if (modo !== 'todo') {
    return { error: 'Opción de reporte inválida.' };
  }

  return {
    where: conds.length ? `WHERE ${conds.join(' AND ')}` : '',
    params,
    etiqueta: etiqueta.replace(/[^\w\-ÁÉÍÓÚáéíóúÑñ ]+/g, '').trim().replace(/\s+/g, '_') || 'Reporte',
  };
}

async function contarFilasReporteInventario(filtro) {
  const [[row]] = await pool.execute(`SELECT COUNT(*) AS total FROM Vista_Inventario ${filtro.where}`, filtro.params);
  return Number(row.total || 0);
}

const COLUMNAS_REPORTE_INVENTARIO = [
  { titulo: 'Regional',         campo: 'Regional',        tipo: 'texto',  ancho: 16 },
  { titulo: 'Operación',        campo: 'Operacion',       tipo: 'texto',  ancho: 26 },
  { titulo: 'Id Artículo',      campo: 'IdArticulo',      tipo: 'numero', ancho: 12 },
  { titulo: 'Artículo',         campo: 'Articulo',        tipo: 'texto',  ancho: 34 },
  { titulo: 'Talla',            campo: 'Talla',           tipo: 'texto',  ancho: 10 },
  { titulo: 'Referencia',       campo: 'Referencia',      tipo: 'texto',  ancho: 26 },
  { titulo: 'Placa',            campo: 'Placa',           tipo: 'texto',  ancho: 14 },
  { titulo: 'Clasificación',    campo: 'Clasificacion',   tipo: 'texto',  ancho: 24 },
  { titulo: 'Categoría',        campo: 'Categoria',       tipo: 'texto',  ancho: 16 },
  { titulo: 'Stock Disponible', campo: 'StockDisponible', tipo: 'numero', ancho: 16 },
  { titulo: 'Valor Stock',      campo: 'ValorStock',      tipo: 'numero', ancho: 16 },
  { titulo: 'Observaciones',    campo: 'Observaciones',   tipo: 'texto',  ancho: 40 },
];

// GET /api/reporte-inventario/conteo — cuántas filas tendría y qué formatos se permiten
router.get('/api/reporte-inventario/conteo', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const filtro = construirFiltroReporteInventario(acceso, req.query);
    if (filtro && filtro.error) return res.status(400).json({ error: filtro.error });
    const limites = await obtenerLimitesReporteInventario();
    const total = filtro ? await contarFilasReporteInventario(filtro) : 0;
    res.json({
      ok: true,
      total,
      limites,
      permiteExcel: total > 0 && total <= limites.excel,
      permiteCsv: total > 0 && total <= limites.csv,
    });
  } catch (err) {
    console.error('[inventario] GET /api/reporte-inventario/conteo:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reporte-inventario?formato=xlsx|csv — descarga el reporte
router.get('/api/reporte-inventario', async (req, res) => {
  try {
    const { usuario } = req.query;
    const formato = String(req.query.formato || '').toLowerCase();
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!['xlsx', 'csv'].includes(formato)) return res.status(400).json({ error: 'Formato inválido. Use Excel o CSV.' });

    const acceso = await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const filtro = construirFiltroReporteInventario(acceso, req.query);
    if (filtro && filtro.error) return res.status(400).json({ error: filtro.error });
    const limites = await obtenerLimitesReporteInventario();
    const total = filtro ? await contarFilasReporteInventario(filtro) : 0;
    const fmt = (n) => Number(n).toLocaleString('es-CO');
    if (total === 0) return res.status(400).json({ error: 'No hay inventario para la opción seleccionada.' });
    if (formato === 'xlsx' && total > limites.excel) {
      return res.status(400).json({ error: `El reporte tiene ${fmt(total)} filas. En Excel se permiten hasta ${fmt(limites.excel)}; descárguelo en CSV.` });
    }
    if (total > limites.csv) {
      return res.status(400).json({ error: `El reporte tiene ${fmt(total)} filas y el máximo permitido es ${fmt(limites.csv)}. Elija una regional u operación.` });
    }

    // La vista es pequeña (unos miles de filas): se lee completa con el filtro y se ordena igual que la pestaña.
    const [filas] = await pool.execute(`
      SELECT \`Regional\`, \`Operacion\`, \`IdArticulo\`, \`Articulo\`, \`Talla\`, \`Referencia\`, \`Placa\`,
             \`Clasificación\` AS \`Clasificacion\`, \`Categoria\`,
             \`Stock Disponible\` AS \`StockDisponible\`, \`Valor Stock\` AS \`ValorStock\`, \`Observaciones\`
      FROM Vista_Inventario
      ${filtro.where}
      ORDER BY \`Regional\`, \`Operacion\`, \`Articulo\`
    `, filtro.params);

    const archivo = nombreArchivo(`Inventario_${filtro.etiqueta}`, formato);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(archivo)}"; filename*=UTF-8''${encodeURIComponent(archivo)}`);
    if (formato === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(generarXlsx({ hoja: 'Inventario', columnas: COLUMNAS_REPORTE_INVENTARIO, filas }));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(encabezadoCsv(COLUMNAS_REPORTE_INVENTARIO) + filas.map((f) => filaCsv(COLUMNAS_REPORTE_INVENTARIO, f)).join(''));
  } catch (err) {
    console.error('[inventario] GET /api/reporte-inventario:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
});

// API para actualizar la placa de un artículo
router.post('/api/placa', async (req, res) => {
  try {
    const { usuario, idArticulo, placa } = req.body;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }
    if (!idArticulo) {
      return res.status(400).json({ error: 'idArticulo es requerido' });
    }

    // Validar acceso del usuario
    const acceso = await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    // Rol con permiso ("Roles que pueden editar placa", Config_Parametros inventario / Inventario)
    const cfg = await obtenerConfigPestanaInventario(acceso.rol);
    if (!cfg.puedeEditarPlaca) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para editar la placa.' });
    }

    // La placa solo aplica a categorías con Condición 'Recuperable' (Config_Categoria_Inventario)
    const [[artPlaca]] = await pool.execute('SELECT Categoria FROM Dynamic_Articulos WHERE Id = ? LIMIT 1', [idArticulo]);
    if (!artPlaca) {
      return res.status(404).json({ error: 'Artículo no encontrado en la base de datos' });
    }
    if (!(await categoriaEsRecuperable(artPlaca.Categoria))) {
      return res.status(400).json({ error: 'La placa solo aplica para artículos de categorías Recuperables.' });
    }

    // Validar que placa sea solo números o vacía
    if (placa && placa.trim() !== '' && !/^\d+$/.test(placa)) {
      return res.status(400).json({ error: 'La placa solo debe contener números' });
    }

    // Actualizar placa en la base de datos
    const [result] = await pool.execute(
      'UPDATE Dynamic_Articulos SET Placa = ? WHERE Id = ?',
      [placa && placa.trim() !== '' ? placa.trim() : null, idArticulo]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Artículo no encontrado en la base de datos' });
    }

    res.json({ success: true, message: 'Placa actualizada con éxito' });
  } catch (err) {
    console.error('[inventario] POST /api/placa:', err);
    res.status(500).json({ error: err.message });
  }
});

// API para buscar la firma reciente del usuario
router.get('/api/firma-reciente', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario es requerido' });

    // Buscar Colaborador en Maestro_Usuarios
    const [uRows] = await pool.execute('SELECT Colaborador, Email FROM Maestro_Usuarios WHERE ID = ?', [usuario]);
    if (!uRows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    const colaborador = uRows[0].Colaborador;
    const email = uRows[0].Email;

    let identificacion = null;
    if (colaborador) {
      // Buscar Identificación en Maestro_Segmentación
      const [segRows] = await pool.execute('SELECT Identificación FROM Maestro_Segmentación WHERE TRIM(Trabajador) = TRIM(?) LIMIT 1', [colaborador]);
      if (segRows.length > 0) {
        identificacion = segRows[0].Identificación;
      } else if (colaborador.includes('**')) {
        // Fallback robusto: extraer ID del texto '12345 ** NOMBRE'
        identificacion = colaborador.split('**')[0].trim();
      }
    }

    if (!identificacion) {
      return res.json({ identificacion: null, email, firmaUrl: null, firmaBase64: null });
    }

    // Obtener firma reciente
    const url = await obtenerUrlFirmaReciente(identificacion);
    const base64 = await obtenerFirmaBase64Reciente(identificacion);

    res.json({
      identificacion,
      email,
      firmaUrl: url,
      firmaBase64: base64
    });
  } catch (err) {
    console.error('[inventario] GET /api/firma-reciente:', err);
    res.status(500).json({ error: err.message });
  }
});

// API para registrar confirmación de inventario (genera PDF y notifica por correo)
router.post('/api/confirmar', async (req, res) => {
  try {
    const { usuario, operacion, categoria, observaciones, mes, nuevaFirmaBase64 } = req.body;
    if (!usuario || !operacion || !categoria || !mes) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos (usuario, operacion, categoria, mes)' });
    }

    // Validar acceso del usuario
    const acceso = await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado para confirmar inventario.' });
    }

    // Si el rol tiene categorías restringidas, verificar que la categoría elegida esté permitida
    if (acceso.filtroCategorias && !acceso.filtroCategorias.some((c) => normalizarTexto(c) === normalizarTexto(categoria))) {
      // Se muestran sin repetir la misma categoría con y sin tilde
      const visibles = [];
      acceso.filtroCategorias.forEach((c) => { if (!visibles.some((v) => normalizarTexto(v) === normalizarTexto(c))) visibles.push(c); });
      return res.status(403).json({ error: `Su rol solo le permite confirmar las categorías: ${visibles.join(', ')}` });
    }

    // Mes permitido ("Mes inicial de confirmación de inventario" hasta hoy + "Meses hacia
    // adelante permitidos para confirmar", Config_Parametros inventario / Inventario)
    const cfgInv = await obtenerConfigPestanaInventario(acceso.rol);
    if (!mesConfirmacionPermitido(cfgInv, mes)) {
      return res.status(400).json({ error: 'El mes seleccionado no está habilitado para confirmar inventario.' });
    }

    // 1. Validar registro único por mes
    const [dupRows] = await pool.execute(
      'SELECT id FROM Maestro_Confirmacion WHERE operacion = ? AND categoria = ? AND mes = ? LIMIT 1',
      [operacion, categoria, mes]
    );
    if (dupRows.length > 0) {
      return res.status(400).json({ error: 'Ya se ha confirmado el inventario para esta operación, categoría y mes.' });
    }

    // 2. Obtener Colaborador y Email
    const [uRows] = await pool.execute('SELECT Colaborador, Email FROM Maestro_Usuarios WHERE ID = ?', [usuario]);
    if (!uRows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    const colaborador = uRows[0].Colaborador;
    const emailUsuario = uRows[0].Email;

    // 3. Obtener Identificación
    const [segRows] = await pool.execute('SELECT Identificación FROM Maestro_Segmentación WHERE Trabajador = ? LIMIT 1', [colaborador]);
    if (!segRows.length) {
      return res.status(400).json({ error: 'No se encontró la Identificación del colaborador para proceder con la firma.' });
    }
    const identificacion = segRows[0].Identificación;

    // 4. Manejo de firma
    let signatureUrl = '';
    let signatureBase64 = '';
    if (nuevaFirmaBase64 && nuevaFirmaBase64.trim() !== '') {
      const matches = nuevaFirmaBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      let buffer;
      if (matches && matches.length === 3) {
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(nuevaFirmaBase64, 'base64');
      }
      signatureUrl = await subirFirma(identificacion, buffer);
      signatureBase64 = nuevaFirmaBase64;
    } else {
      signatureUrl = await obtenerUrlFirmaReciente(identificacion);
      signatureBase64 = await obtenerFirmaBase64Reciente(identificacion);
    }

    if (!signatureUrl) {
      return res.status(400).json({ error: 'Se requiere una firma digital para confirmar el inventario. Por favor, dibuja una firma.' });
    }

    // 5. Consultar los artículos activos para el PDF
    const [items] = await pool.execute(
      `SELECT Articulo, Talla, Referencia, Imagen, \`Stock Disponible\` AS StockDisponible
       FROM Vista_Inventario
       WHERE Operacion = ? AND Categoria = ?`,
      [operacion, categoria]
    );

    // 6. Generar HTML y compilar a PDF con Puppeteer
    const formattedDate = new Date().toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    let itemsRowsHtml = '';
    if (items.length > 0) {
      items.forEach((item, idx) => {
        const imgHtml = item.Imagen
          ? `<img src="${item.Imagen}" style="width: 36px; height: 36px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;" alt="">`
          : `<span style="font-size: 1.2rem;">📦</span>`;
        itemsRowsHtml += `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${idx + 1}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${imgHtml}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${item.Articulo || '—'}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.Referencia || 'S/N'}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.StockDisponible || 0}</td>
          </tr>
        `;
      });
    } else {
      itemsRowsHtml = `
        <tr>
          <td colspan="5" style="border: 1px solid #ddd; padding: 12px; text-align: center; color: #777;">
            No se encontraron artículos en stock para este inventario.
          </td>
        </tr>
      `;
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 10px; color: #333;">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="width: 130px; vertical-align: middle;">
              <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height: 52px;" alt="LOG&SER">
            </td>
            <td style="text-align: center; font-size: 14pt; font-weight: bold; line-height: 1.5; color: #1e3c72; vertical-align: middle;">
              ACTA DE CONFIRMACIÓN DE INVENTARIO DE ${categoria.toUpperCase()}<br>
              SEDE: ${operacion.toUpperCase()}
            </td>
          </tr>
        </table>

        <div style="margin-bottom: 20px; font-size: 10pt; line-height: 1.6; background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px;">
          <strong>Fecha Registro:</strong> ${formattedDate}<br>
          <strong>Período (Mes):</strong> ${mes} (Mensual)<br>
          <strong>Responsable:</strong> ${colaborador} (C.C. ${identificacion})<br>
          <strong>Área:</strong> Inventario
          ${observaciones ? `<br><strong>Observaciones:</strong> ${observaciones}` : ''}
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 40px;">
          <thead>
            <tr style="background-color: #e2e8f0;">
              <th style="border: 1px solid #ddd; padding: 8px; width: 8%; text-align: center;">ÍTEM</th>
              <th style="border: 1px solid #ddd; padding: 8px; width: 10%; text-align: center;">IMAGEN</th>
              <th style="border: 1px solid #ddd; padding: 8px; width: 47%; text-align: left;">DESCRIPCIÓN DEL ARTÍCULO</th>
              <th style="border: 1px solid #ddd; padding: 8px; width: 20%; text-align: center;">SERIAL / IDENTIFICADOR</th>
              <th style="border: 1px solid #ddd; padding: 8px; width: 15%; text-align: center;">CANTIDAD</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRowsHtml}
          </tbody>
        </table>

        <div style="page-break-inside: avoid; margin-top: 50px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <div style="border-bottom: 1.5px solid #333; width: 300px; padding-bottom: 10px; margin-bottom: 8px;">
            <img src="${signatureBase64}" style="max-height: 80px; max-width: 250px; object-fit: contain;" alt="Firma">
          </div>
          <div style="font-size: 10pt; font-weight: bold; color: #1e3c72; text-transform: uppercase;">
            FIRMA RESPONSABLE DE SEDE
          </div>
          <div style="font-size: 9pt; color: #555; margin-top: 4px;">
            Nombre: ${colaborador}<br>
            C.C.: ${identificacion}
          </div>
        </div>
      </div>
    `;

    const pdfBuffer = await generarPDF(htmlContent, {
      margin: { top: '15mm', bottom: '20mm', left: '15mm', right: '15mm' }
    });

    // 7. Obtener Prefijo para TipoDocumento = 86 y generar nombre del archivo
    let prefijo = 'ACTINV';
    try {
      const [docRows] = await pool.execute(
        'SELECT Prefijo FROM Config_Doc_Trabajador WHERE Id = 86 LIMIT 1'
      );
      if (docRows.length && docRows[0].Prefijo) {
        prefijo = docRows[0].Prefijo.trim();
      }
    } catch (errPrefijo) {
      console.warn('[inventario] Error consultando Prefijo Id 86:', errPrefijo.message);
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const fileName = `${prefijo}.${timestamp}.pdf`;
    
    const pdfUrl = await subirPDFConfirmacionInventario(fileName, pdfBuffer);

    // 8. Insertar en Maestro_Confirmacion
    await pool.execute(
      `INSERT INTO Maestro_Confirmacion 
       (area, periodo, usuario, observaciones, operacion, categoria, mes, fecha_confirmacion, firma_url, pdf_url)
       VALUES ('Inventario', 'mensual', ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [usuario, observaciones || null, operacion, categoria, mes, signatureUrl, pdfUrl]
    );

    // 9. Obtener Regional de Maestro_Operaciones e insertar en Maestro_docEmpresa
    let regional = null;
    try {
      const [opRows] = await pool.execute(
        'SELECT `REGIONAL` FROM `Maestro_Operaciones` WHERE `OPERACIÓN` = ? LIMIT 1',
        [operacion]
      );
      if (opRows.length && opRows[0].REGIONAL) {
        regional = opRows[0].REGIONAL;
      }
    } catch (errOp) {
      console.warn('[inventario] Error consultando regional:', errOp.message);
    }

    const docEmpresaId = randomUUID();
    const obsClean = observaciones ? String(observaciones).substring(0, 512) : null;

    try {
      await pool.execute(
        `INSERT INTO \`Maestro_docEmpresa\` (
          \`id\`,
          \`Validación\`,
          \`Regional\`,
          \`Operación\`,
          \`TipoDocumento\`,
          \`Prefijo\`,
          \`Observaciones\`,
          \`Visualizar\`,
          \`Solicitud\`,
          \`Justificacion_Solicitud\`,
          \`FechaRegistro\`,
          \`Usuario\`,
          \`Url\`,
          \`Usuario_Solicitud\`,
          \`Estado_Solicitud\`
        ) VALUES (?, 'PEND', ?, ?, '86', ?, ?, NULL, NULL, NULL, NOW(), ?, ?, NULL, NULL)`,
        [
          docEmpresaId,
          regional,
          operacion,
          prefijo,
          obsClean,
          usuario,
          pdfUrl
        ]
      );
    } catch (errDocEmp) {
      console.error('[inventario] Error insertando en Maestro_docEmpresa:', errDocEmp);
    }

    // 9. Destinatarios por Rol según la Categoría ("Notificación confirmación inventario
    // <CATEGORÍA> - Para:", Config_Parametros inventario / Inventario). Quien confirma va en copia.
    // Correo en segundo plano: no detiene la respuesta.
    obtenerDestinatariosConfirmacion(categoria, operacion)
      .then(({ habilitado, para }) => {
        if (!habilitado) return;
        if (!para.length) {
          console.warn(`[inventario] Confirmación ${categoria} / ${operacion}: no hay destinatarios configurados para la categoría.`);
          return;
        }
        return notificarConfirmacionInventario({
          operacion,
          categoria,
          mes,
          usuarioNombre: colaborador,
          emailUsuario: emailUsuario,
          pdfUrl,
          destinatarios: para
        });
      })
      .catch(mailErr => console.error('[inventario] Error enviando correo de confirmación:', mailErr));

    res.json({ ok: true, pdfUrl });
  } catch (err) {
    console.error('[inventario] POST /api/confirmar:', err);
    res.status(500).json({ error: err.message });
  }
});

// API para obtener el historial de confirmaciones de inventario con filtros facetados
router.get('/api/confirmaciones', async (req, res) => {
  try {
    const { usuario, regional, operacion, periodo, categoria } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const securityConds = [];
    const securityParams = [];

    // Restringir categorías si aplica (Acceso 4, 5, 6)
    if (acceso.filtroCategorias) {
      const ph = acceso.filtroCategorias.map(() => '?').join(',');
      securityConds.push(`c.categoria IN (${ph})`);
      securityParams.push(...acceso.filtroCategorias);
    }

    // Filtrar según operaciones permitidas del rol
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json({ results: [], counts: { regionales: {}, operaciones: {}, periodos: {}, categorias: {} }, stats: { totalConfirmaciones: 0 } });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      securityConds.push(`c.operacion IN (${ph})`);
      securityParams.push(...acceso.operacionesFiltro);
    }

    const securityWhere = securityConds.length ? `WHERE ${securityConds.join(' AND ')}` : '';

    // OPTIMIZACIÓN: la subconsulta correlacionada para resolver el Regional (repetida en el
    // SELECT, el WHERE y el GROUP BY de distintas consultas) se reemplaza por un LEFT JOIN. Y los
    // 4 contadores de filtro + el conteo total, que antes eran 5 consultas secuenciales (sin
    // Promise.all), ahora se calculan en memoria a partir de una sola consulta.
    const [base] = await pool.execute(`
      SELECT
        c.id, c.area, c.periodo, c.usuario, u.Nombre AS usuarioNombre, c.observaciones, c.operacion,
        mo.REGIONAL AS regional, c.categoria, c.mes, c.fecha_confirmacion AS fechaConfirmacion,
        c.firma_url AS firmaUrl, c.pdf_url AS pdfUrl
      FROM Maestro_Confirmacion c
      LEFT JOIN Maestro_Usuarios u ON c.usuario = u.ID
      LEFT JOIN Maestro_Operaciones mo ON mo.OPERACIÓN = c.operacion
      ${securityWhere}
      ORDER BY c.fecha_confirmacion DESC
    `, securityParams);

    const matchReg = (r) => !regional || r.regional === regional;
    const matchOp = (r) => !operacion || r.operacion === operacion;
    const matchPer = (r) => !periodo || r.mes === periodo;
    const matchCat = (r) => !categoria || r.categoria === categoria;

    const allFiltered = base.filter((r) => matchReg(r) && matchOp(r) && matchPer(r) && matchCat(r));
    const results = allFiltered.slice(0, 500);

    const countBy = (rows, keyFn) => {
      const acc = {};
      rows.forEach((r) => {
        const key = keyFn(r);
        if (key === null || key === undefined) return;
        acc[key] = (acc[key] || 0) + 1;
      });
      return acc;
    };

    const regCounts = countBy(base.filter((r) => matchOp(r) && matchPer(r) && matchCat(r)), (r) => r.regional);
    const opCounts = countBy(base.filter((r) => matchReg(r) && matchPer(r) && matchCat(r)), (r) => r.operacion);
    const perCounts = countBy(base.filter((r) => matchReg(r) && matchOp(r) && matchCat(r)), (r) => r.mes);
    const catCounts = countBy(base.filter((r) => matchReg(r) && matchOp(r) && matchPer(r)), (r) => r.categoria);

    res.json({
      results,
      counts: {
        regionales: regCounts,
        operaciones: opCounts,
        periodos: perCounts,
        categorias: catCounts
      },
      stats: {
        totalConfirmaciones: allFiltered.length
      }
    });

  } catch (err) {
    console.error('[inventario] GET /api/confirmaciones:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ENDPOINTS DE KARDEX INTEGRADOS
// ==========================================

// Filtros de Kardex, compartidos por la pestaña y su reporte: alcance del rol (operaciones y
// categorías, Sección 'Kardex') + filtros de la pantalla. `mes` ('AAAA-MM') filtra por la
// Fecha de Movimiento. Devuelve null si el usuario no tiene operaciones, o { error }.
function construirFiltrosKardex(acceso, query) {
  const { regional, operacion, operacionDestino, categoria, tipoMovimiento, idArticulo, search, mes } = query;
  const securityConds = [];
  const securityParams = [];

  // Restringir categorías si aplica (Acceso 4, 5, 6)
  if (acceso.filtroCategorias) {
    const ph = acceso.filtroCategorias.map(() => '?').join(',');
    securityConds.push(`k.\`Categoria\` IN (${ph})`);
    securityParams.push(...acceso.filtroCategorias);
  }

  // Security filter based on role/permissions
  if (!acceso.sinFiltro) {
    if (!acceso.operacionesFiltro.length) return null;
    const ph = acceso.operacionesFiltro.map(() => '?').join(',');
    securityConds.push(`k.\`Operación\` IN (${ph})`);
    securityParams.push(...acceso.operacionesFiltro);
  }

  let fMes = null;
  if (mes) {
    const m = String(mes).match(/^(\d{4})-(\d{2})$/);
    const anio = m ? Number(m[1]) : 0;
    const numMes = m ? Number(m[2]) : 0;
    if (!m || numMes < 1 || numMes > 12) return { error: 'Mes inválido.' };
    const desde = `${m[1]}-${m[2]}-01`;
    const hasta = numMes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(numMes + 1).padStart(2, '0')}-01`;
    fMes = { cond: 'k.FechaMovimiento >= ? AND k.FechaMovimiento < ?', params: [desde, hasta] };
  }

  const like = search ? `%${search}%` : null;
  const filtros = {
    fReg: regional ? { cond: 'k.`Regional` = ?', params: [regional] } : null,
    fOp: operacion ? { cond: 'k.`Operación` = ?', params: [operacion] } : null,
    fOpDest: operacionDestino ? { cond: 'k.`OperaciónDestino` = ?', params: [operacionDestino] } : null,
    fCat: categoria ? { cond: 'k.`Categoria` = ?', params: [categoria] } : null,
    fMov: tipoMovimiento ? { cond: 'k.`TipoMovimiento` = ?', params: [tipoMovimiento] } : null,
    fIdArt: idArticulo ? { cond: 'k.`IdArticulo` = ?', params: [idArticulo] } : null,
    fSearch: search ? { cond: '(a.Articulo LIKE ? OR a.Referencia LIKE ? OR k.UsuarioAsignado LIKE ? OR k.Acta LIKE ? OR k.Observaciones LIKE ? OR k.UsuarioRegistro LIKE ?)', params: [like, like, like, like, like, like] } : null,
    fMes,
  };

  // Une el filtro de seguridad con los filtros indicados
  const buildKardexWhere = (filtersList) => {
    const c = [...securityConds];
    const p = [...securityParams];
    filtersList.forEach((f) => {
      if (f) {
        c.push(f.cond);
        p.push(...f.params);
      }
    });
    return { where: c.length ? `WHERE ${c.join(' AND ')}` : '', params: p };
  };

  return { securityConds, securityParams, filtros, buildKardexWhere };
}

router.get('/api/kardex/datos', async (req, res) => {
  try {
    const { usuario, regional, operacion, operacionDestino, categoria, tipoMovimiento, idArticulo, search, mes } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'Kardex');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const filtrosKardex = construirFiltrosKardex(acceso, req.query);
    if (!filtrosKardex) {
      return res.json({ results: [], counts: { regionales: {}, operaciones: {}, categorias: {}, movimientos: {}, meses: {} } });
    }
    if (filtrosKardex.error) return res.status(400).json({ error: filtrosKardex.error });
    const { securityConds, securityParams, buildKardexWhere } = filtrosKardex;
    const { fReg, fOp, fOpDest, fCat, fMov, fIdArt, fSearch, fMes } = filtrosKardex.filtros;

    // 1. Fetch filtered items (limit 500 rows for speed)
    const listFilter = buildKardexWhere([fReg, fOp, fOpDest, fCat, fMov, fIdArt, fSearch, fMes]);
    const listQuery = `
      SELECT
        k.IdKardex,
        k.FechaMovimiento,
        k.TipoMovimiento,
        k.Regional,
        k.\`Operación\` AS Operacion,
        k.\`OperaciónDestino\` AS OperacionDestino,
        k.Categoria,
        k.IdArticulo,
        a.Articulo,
        a.Referencia,
        a.Imagen,
        k.Cantidad,
        k.UsuarioAsignado,
        (SELECT v.Trabajador FROM \`Maestro_Vinculación\` v
         WHERE v.\`Identificación\` = k.UsuarioAsignado
         ORDER BY v.\`Fecha de Ingreso\` DESC LIMIT 1) AS TrabajadorAsignado,
        k.Acta,
        da.Url_Acta AS UrlActa,
        k.ValorUnitario,
        k.UsuarioRegistro,
        k.Observaciones,
        k.FechaRegistro,
        k.Kpendiente
      FROM Dynamic_Kardex k
      LEFT JOIN Dynamic_Articulos a ON k.IdArticulo = a.Id
      LEFT JOIN Dynamic_Actas da ON da.IdActa = k.Acta
      ${listFilter.where}
      ORDER BY k.FechaRegistro DESC
      LIMIT 500
    `;

    // OPTIMIZACIÓN: antes los 4 contadores de filtro + las estadísticas eran 5 consultas
    // independientes, cada una re-escaneando y re-uniendo Dynamic_Kardex con Dynamic_Articulos
    // desde cero. Ahora se traen en una sola consulta "liviana" (solo las columnas que hacen
    // falta para filtrar/agrupar) con el filtro de seguridad, y los 4 contadores + las
    // estadísticas se calculan en memoria replicando exactamente la misma semántica de "excluir
    // el propio filtro" que tenían las consultas originales.
    const securityWhereOnly = securityConds.length ? `WHERE ${securityConds.join(' AND ')}` : '';
    const [[facetBase], [results]] = await Promise.all([
      pool.execute(`
        SELECT
          k.Regional, k.\`Operación\` AS Operacion, k.\`OperaciónDestino\` AS OperacionDestino,
          k.Categoria, k.TipoMovimiento, k.IdArticulo, k.Cantidad,
          k.UsuarioAsignado, k.Acta, k.Observaciones, k.UsuarioRegistro,
          a.Articulo, a.Referencia,
          DATE_FORMAT(k.FechaMovimiento, '%Y-%m') AS Mes
        FROM Dynamic_Kardex k
        LEFT JOIN Dynamic_Articulos a ON k.IdArticulo = a.Id
        ${securityWhereOnly}
      `, securityParams),
      pool.execute(listQuery, listFilter.params)
    ]);

    // Los campos de texto en Dynamic_Kardex/Dynamic_Articulos usan collation _bin (sensible a
    // mayúsculas), igual que el `LIKE` original sin LOWER() — se replica tal cual con .includes().
    const matchReg = (r) => !regional || r.Regional === regional;
    const matchOp = (r) => !operacion || r.Operacion === operacion;
    const matchOpDest = (r) => !operacionDestino || r.OperacionDestino === operacionDestino;
    const matchCat = (r) => !categoria || r.Categoria === categoria;
    const matchMov = (r) => !tipoMovimiento || r.TipoMovimiento === tipoMovimiento;
    const matchIdArt = (r) => !idArticulo || String(r.IdArticulo) === String(idArticulo);
    const matchSearch = (r) => !search ||
      (r.Articulo && r.Articulo.includes(search)) ||
      (r.Referencia && r.Referencia.includes(search)) ||
      (r.UsuarioAsignado && r.UsuarioAsignado.includes(search)) ||
      (r.Acta && r.Acta.includes(search)) ||
      (r.Observaciones && r.Observaciones.includes(search)) ||
      (r.UsuarioRegistro && r.UsuarioRegistro.includes(search));
    const matchMes = (r) => !fMes || r.Mes === mes;

    const allFiltered = facetBase.filter((r) => matchReg(r) && matchOp(r) && matchOpDest(r) && matchCat(r) && matchMov(r) && matchIdArt(r) && matchSearch(r) && matchMes(r));

    const sumAbsBy = (rows, keyFn) => {
      const acc = {};
      rows.forEach((r) => {
        const key = keyFn(r);
        if (key === null || key === undefined) return;
        acc[key] = (acc[key] || 0) + Math.abs(Number(r.Cantidad || 0));
      });
      return acc;
    };

    const regCounts = sumAbsBy(facetBase.filter((r) => matchOp(r) && matchOpDest(r) && matchCat(r) && matchMov(r) && matchIdArt(r) && matchSearch(r) && matchMes(r)), (r) => r.Regional);
    const opCounts = sumAbsBy(facetBase.filter((r) => matchReg(r) && matchOpDest(r) && matchCat(r) && matchMov(r) && matchIdArt(r) && matchSearch(r) && matchMes(r)), (r) => r.Operacion);
    const catCounts = sumAbsBy(facetBase.filter((r) => matchReg(r) && matchOp(r) && matchOpDest(r) && matchMov(r) && matchIdArt(r) && matchSearch(r) && matchMes(r)), (r) => r.Categoria);
    const movCounts = sumAbsBy(facetBase.filter((r) => matchReg(r) && matchOp(r) && matchOpDest(r) && matchCat(r) && matchIdArt(r) && matchSearch(r) && matchMes(r)), (r) => r.TipoMovimiento);
    // Meses: cantidad de movimientos (no unidades) por mes de la Fecha de Movimiento
    const mesCounts = {};
    facetBase
      .filter((r) => matchReg(r) && matchOp(r) && matchOpDest(r) && matchCat(r) && matchMov(r) && matchIdArt(r) && matchSearch(r))
      .forEach((r) => { if (r.Mes) mesCounts[r.Mes] = (mesCounts[r.Mes] || 0) + 1; });

    let totalMov = 0;
    let totalEnt = 0;
    let totalSal = 0;
    allFiltered.forEach((r) => {
      totalMov += 1;
      const cant = Number(r.Cantidad || 0);
      if (cant > 0) totalEnt += 1;
      else if (cant < 0) totalSal += 1;
    });

    res.json({
      results,
      counts: {
        regionales: regCounts,
        operaciones: opCounts,
        categorias: catCounts,
        movimientos: movCounts,
        meses: mesCounts
      },
      stats: { totalMov, totalEnt, totalSal }
    });
  } catch (err) {
    console.error('[inventario] GET /api/kardex/datos error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Reporte de la pestaña Kardex (ícono de descarga) ──────────────────────
// Descarga exactamente lo que muestran los filtros de la pestaña (incluido el Mes por
// Fecha de Movimiento), dentro del alcance del rol. Excel hasta
// "Límite de filas reporte Excel - Kardex"; si pasa, solo CSV hasta
// "Límite de filas reporte CSV - Kardex" (Config_Parametros, inventario / Kardex).
const COLUMNAS_REPORTE_KARDEX = [
  { titulo: 'Id Kardex',          campo: 'IdKardex',           tipo: 'texto',     ancho: 34 },
  { titulo: 'Fecha Movimiento',   campo: 'FechaMovimiento',    tipo: 'fechaHora', ancho: 18 },
  { titulo: 'Tipo Movimiento',    campo: 'TipoMovimiento',     tipo: 'texto',     ancho: 16 },
  { titulo: 'Regional',           campo: 'Regional',           tipo: 'texto',     ancho: 16 },
  { titulo: 'Operación',          campo: 'Operacion',          tipo: 'texto',     ancho: 26 },
  { titulo: 'Operación Destino',  campo: 'OperacionDestino',   tipo: 'texto',     ancho: 26 },
  { titulo: 'Categoría',          campo: 'Categoria',          tipo: 'texto',     ancho: 16 },
  { titulo: 'Id Artículo',        campo: 'IdArticulo',         tipo: 'numero',    ancho: 12 },
  { titulo: 'Artículo',           campo: 'Articulo',           tipo: 'texto',     ancho: 34 },
  { titulo: 'Referencia',         campo: 'Referencia',         tipo: 'texto',     ancho: 24 },
  { titulo: 'Talla',              campo: 'Talla',              tipo: 'texto',     ancho: 10 },
  { titulo: 'Cantidad',           campo: 'Cantidad',           tipo: 'numero',    ancho: 11 },
  { titulo: 'Valor Unitario',     campo: 'ValorUnitario',      tipo: 'numero',    ancho: 14 },
  { titulo: 'Valor Total',        campo: 'ValorTotal',         tipo: 'numero',    ancho: 14 },
  { titulo: 'Asignado A (Identificación)', campo: 'UsuarioAsignado', tipo: 'texto', ancho: 18 },
  { titulo: 'Trabajador Asignado', campo: 'TrabajadorAsignado', tipo: 'texto',    ancho: 34 },
  { titulo: 'Acta',               campo: 'Acta',               tipo: 'texto',     ancho: 10 },
  { titulo: 'Observaciones',      campo: 'Observaciones',      tipo: 'texto',     ancho: 40 },
  { titulo: 'Usuario Registro',   campo: 'UsuarioRegistro',    tipo: 'texto',     ancho: 24 },
  { titulo: 'Fecha Registro',     campo: 'FechaRegistro',      tipo: 'fechaHora', ancho: 18 },
];

// "Identificación ** NOMBRE" → "NOMBRE"
function nombreTrabajadorKardex(trabajador) {
  const partes = String(trabajador || '').split(' ** ');
  return (partes.length > 1 ? partes[1] : trabajador || '').trim();
}

// Filtro del reporte: los mismos filtros de la pestaña. Devuelve { where, params, etiqueta }, { error } o null.
function construirFiltroReporteKardex(acceso, query) {
  const fk = construirFiltrosKardex(acceso, query);
  if (!fk || fk.error) return fk;
  const f = fk.filtros;
  const { where, params } = fk.buildKardexWhere([f.fReg, f.fOp, f.fOpDest, f.fCat, f.fMov, f.fIdArt, f.fSearch, f.fMes]);
  const partes = [query.mes, query.operacion || query.regional].filter(Boolean);
  const etiqueta = (partes.join('_') || 'Todo').replace(/[^\w\-ÁÉÍÓÚáéíóúÑñ ]+/g, '').trim().replace(/\s+/g, '_') || 'Reporte';
  return { where, params, etiqueta };
}

// El buscador filtra por campos del artículo, por eso el conteo también une Dynamic_Articulos.
async function contarFilasReporteKardex(filtro) {
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM Dynamic_Kardex k LEFT JOIN Dynamic_Articulos a ON k.IdArticulo = a.Id ${filtro.where}`,
    filtro.params
  );
  return Number(row.total || 0);
}

// GET /api/kardex/reporte/conteo — cuántas filas tendría y qué formatos se permiten
router.get('/api/kardex/reporte/conteo', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoInventario(usuario, 'Kardex');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const filtro = construirFiltroReporteKardex(acceso, req.query);
    if (filtro && filtro.error) return res.status(400).json({ error: filtro.error });
    const limites = await obtenerLimitesReporte('Kardex');
    const total = filtro ? await contarFilasReporteKardex(filtro) : 0;
    res.json({
      ok: true,
      total,
      limites,
      permiteExcel: total > 0 && total <= limites.excel,
      permiteCsv: total > 0 && total <= limites.csv,
    });
  } catch (err) {
    console.error('[inventario] GET /api/kardex/reporte/conteo:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/kardex/reporte?formato=xlsx|csv — descarga el reporte
router.get('/api/kardex/reporte', async (req, res) => {
  try {
    const { usuario } = req.query;
    const formato = String(req.query.formato || '').toLowerCase();
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!['xlsx', 'csv'].includes(formato)) return res.status(400).json({ error: 'Formato inválido. Use Excel o CSV.' });

    const acceso = await computarAccesoInventario(usuario, 'Kardex');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const filtro = construirFiltroReporteKardex(acceso, req.query);
    if (filtro && filtro.error) return res.status(400).json({ error: filtro.error });
    const limites = await obtenerLimitesReporte('Kardex');
    const total = filtro ? await contarFilasReporteKardex(filtro) : 0;
    const fmt = (n) => Number(n).toLocaleString('es-CO');
    if (total === 0) return res.status(400).json({ error: 'No hay movimientos con los filtros seleccionados.' });
    if (formato === 'xlsx' && total > limites.excel) {
      return res.status(400).json({ error: `El reporte tiene ${fmt(total)} filas. En Excel se permiten hasta ${fmt(limites.excel)}; descárguelo en CSV.` });
    }
    if (total > limites.csv) {
      return res.status(400).json({ error: `El reporte tiene ${fmt(total)} filas y el máximo permitido es ${fmt(limites.csv)}. Filtre por mes, regional u operación.` });
    }

    const sql = `
      SELECT
        k.IdKardex, k.FechaMovimiento, k.TipoMovimiento, k.Regional,
        k.\`Operación\` AS Operacion, k.\`OperaciónDestino\` AS OperacionDestino, k.Categoria,
        k.IdArticulo, a.Articulo, a.Referencia, a.Talla,
        k.Cantidad, k.ValorUnitario, (k.Cantidad * k.ValorUnitario) AS ValorTotal,
        k.UsuarioAsignado,
        (SELECT v.Trabajador FROM \`Maestro_Vinculación\` v
         WHERE v.\`Identificación\` = k.UsuarioAsignado
         ORDER BY v.\`Fecha de Ingreso\` DESC LIMIT 1) AS TrabajadorAsignado,
        k.Acta, k.Observaciones, k.UsuarioRegistro, k.FechaRegistro
      FROM Dynamic_Kardex k
      LEFT JOIN Dynamic_Articulos a ON k.IdArticulo = a.Id
      ${filtro.where}
      ORDER BY k.FechaMovimiento DESC, k.IdKardex DESC
    `;
    const prepararFila = (f) => ({ ...f, TrabajadorAsignado: nombreTrabajadorKardex(f.TrabajadorAsignado) });
    const archivo = nombreArchivo(`Kardex_${filtro.etiqueta}`, formato);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(archivo)}"; filename*=UTF-8''${encodeURIComponent(archivo)}`);

    if (formato === 'xlsx') {
      const [filas] = await pool.execute(sql, filtro.params);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(generarXlsx({ hoja: 'Kardex', columnas: COLUMNAS_REPORTE_KARDEX, filas: filas.map(prepararFila) }));
    }

    // CSV fila por fila (hasta 100.000), sin cargar todo en memoria; se detiene si el usuario cancela.
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.write(encabezadoCsv(COLUMNAS_REPORTE_KARDEX));
    const stream = pool.pool.query(sql, filtro.params).stream({ highWaterMark: 500 });
    let cancelado = false;
    req.on('close', () => { if (!res.writableEnded) { cancelado = true; stream.destroy(); } });
    stream.on('data', (fila) => {
      if (!res.write(filaCsv(COLUMNAS_REPORTE_KARDEX, prepararFila(fila)))) {
        stream.pause();
        res.once('drain', () => stream.resume());
      }
    });
    stream.on('end', () => res.end());
    stream.on('error', (err) => {
      if (!cancelado) console.error('[inventario] Error generando CSV de Kardex:', err.message);
      res.end();
    });
  } catch (err) {
    console.error('[inventario] GET /api/kardex/reporte:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
});

// API para devolver el historial de Kardex de un artículo específico
router.get('/api/kardex/articulo/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, regional, operacion } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'Kardex');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const conds = ['k.IdArticulo = ?'];
    const params = [id];

    // Filtro de seguridad por rol
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json([]);
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      conds.push(`k.\`Operación\` IN (${ph})`);
      params.push(...acceso.operacionesFiltro);
    }

    // Filtros adicionales por selección de UI
    if (regional) {
      conds.push('k.`Regional` = ?');
      params.push(regional);
    }
    if (operacion) {
      conds.push('k.`Operación` = ?');
      params.push(operacion);
    }

    const where = conds.join(' AND ');
    const query = `
      SELECT 
        k.IdKardex,
        k.FechaMovimiento,
        k.TipoMovimiento,
        k.Regional,
        k.\`Operación\` AS Operacion,
        k.\`OperaciónDestino\` AS OperacionDestino,
        k.Categoria,
        k.Cantidad,
        k.UsuarioAsignado,
        (SELECT v.Trabajador FROM \`Maestro_Vinculación\` v
         WHERE v.\`Identificación\` = k.UsuarioAsignado
         ORDER BY v.\`Fecha de Ingreso\` DESC LIMIT 1) AS TrabajadorAsignado,
        k.Acta,
        da.Url_Acta AS UrlActa,
        k.ValorUnitario,
        k.UsuarioRegistro,
        k.Observaciones,
        k.FechaRegistro
      FROM Dynamic_Kardex k
      LEFT JOIN Dynamic_Actas da ON da.IdActa = k.Acta
      WHERE ${where}
      ORDER BY k.FechaMovimiento DESC, k.FechaRegistro DESC
    `;

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[inventario] GET /api/kardex/articulo/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kardex/eliminar - Elimina uno o más registros de Kardex (sólo Inventario o Sistema)
router.post('/api/kardex/eliminar', async (req, res) => {
  try {
    const { usuario, ids } = req.body;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }
    if (!ids || !Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'ids (array) es requerido' });
    }

    // "Roles que pueden eliminar registros de Kardex" (Config_Parametros, inventario / Kardex)
    const acceso = await computarAccesoInventario(usuario, 'Kardex');
    if (!acceso || !(await obtenerConfigKardex(acceso.rol)).puedeEliminar) {
      return res.status(403).json({ error: 'No autorizado. Su rol no tiene permiso para eliminar registros de Kardex.' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const query = `DELETE FROM Dynamic_Kardex WHERE IdKardex IN (${placeholders})`;
    await pool.execute(query, ids);

    res.json({ success: true, message: `${ids.length} registro(s) eliminado(s) exitosamente.` });
  } catch (err) {
    console.error('[inventario] POST /api/kardex/eliminar error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kardex/editar - Edita un registro de Kardex (sólo Inventario o Sistema)
router.post('/api/kardex/editar', async (req, res) => {
  try {
    const {
      usuario,
      IdKardex,
      FechaMovimiento,
      TipoMovimiento,
      Regional,
      Operacion, // mapped to `Operación`
      OperacionDestino, // mapped to `OperaciónDestino`
      Categoria,
      IdArticulo,
      Cantidad,
      UsuarioAsignado,
      Acta,
      ValorUnitario,
      Observaciones,
      Kpendiente
    } = req.body;

    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }
    if (!IdKardex) {
      return res.status(400).json({ error: 'IdKardex es requerido' });
    }

    // "Roles que pueden editar registros de Kardex" (Config_Parametros, inventario / Kardex)
    const acceso = await computarAccesoInventario(usuario, 'Kardex');
    if (!acceso || !(await obtenerConfigKardex(acceso.rol)).puedeEditar) {
      return res.status(403).json({ error: 'No autorizado. Su rol no tiene permiso para editar registros de Kardex.' });
    }

    const kpendienteVal = Kpendiente ? String(Kpendiente).trim() : null;
    if (kpendienteVal) {
      const [[kp]] = await pool.execute('SELECT Id FROM Kardex_Pendiente WHERE Id = ? LIMIT 1', [kpendienteVal]);
      if (!kp) {
        return res.status(400).json({ error: `Kpendiente "${kpendienteVal}" no existe en Kardex_Pendiente.` });
      }
    }

    const query = `
      UPDATE Dynamic_Kardex
      SET
        FechaMovimiento = ?,
        TipoMovimiento = ?,
        Regional = ?,
        \`Operación\` = ?,
        \`OperaciónDestino\` = ?,
        Categoria = ?,
        IdArticulo = ?,
        Cantidad = ?,
        UsuarioAsignado = ?,
        Acta = ?,
        ValorUnitario = ?,
        Observaciones = ?,
        Kpendiente = ?
      WHERE IdKardex = ?
    `;

    const params = [
      FechaMovimiento,
      TipoMovimiento,
      Regional,
      Operacion,
      OperacionDestino || null,
      Categoria,
      parseInt(IdArticulo) || 0,
      parseInt(Cantidad) || 0,
      UsuarioAsignado || null,
      Acta || null,
      parseFloat(ValorUnitario) || 0,
      Observaciones || null,
      kpendienteVal,
      IdKardex
    ];

    await pool.execute(query, params);
    res.json({ success: true, message: 'Registro de Kardex actualizado exitosamente.' });
  } catch (err) {
    console.error('[inventario] POST /api/kardex/editar error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/kardex-pendiente-ids - lista liviana de Ids de Kardex_Pendiente sin procesar,
// para el autocompletado del campo Kpendiente en el modal de edición de Kardex.
router.get('/api/kardex-pendiente-ids', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoInventario(usuario, 'Kardex');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const [rows] = await pool.execute(
      `SELECT Id, OperacionDestino, Regional
       FROM Kardex_Pendiente
       WHERE Procesado = 0
       ORDER BY FechaDespacho DESC
       LIMIT 300`
    );
    res.json(rows);
  } catch (err) {
    console.error('[inventario] GET /api/kardex-pendiente-ids error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vinculacion/nombres - resuelve nombre de Trabajador para un lote de identificaciones
// (usado por el Editor de Grid de Kardex para mostrar informativamente el "Trabajador" de cada fila).
router.post('/api/vinculacion/nombres', async (req, res) => {
  try {
    const { identificaciones } = req.body;
    if (!Array.isArray(identificaciones) || !identificaciones.length) {
      return res.json({});
    }
    const limpias = [...new Set(identificaciones.map(id => String(id || '').trim()).filter(Boolean))].slice(0, 200);
    if (!limpias.length) return res.json({});

    const ph = limpias.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT TRIM(\`Identificación\`) AS identificacion, Trabajador
       FROM \`Maestro_Vinculación\`
       WHERE TRIM(\`Identificación\`) IN (${ph})
       ORDER BY \`Fecha de Ingreso\` DESC`,
      limpias
    );

    const nombres = {};
    for (const row of rows) {
      if (!(row.identificacion in nombres)) {
        nombres[row.identificacion] = row.Trabajador;
      }
    }
    res.json(nombres);
  } catch (err) {
    console.error('[inventario] POST /api/vinculacion/nombres error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PESTAÑA ARTICULOS: APIS
// ==========================================

// 1. GET /api/articulos/datos - Obtiene artículos con filtros y conteos facetados
router.get('/api/articulos/datos', async (req, res) => {
  try {
    const { usuario, categoria, clasificacion, search } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'ArtÍculos');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    // OPTIMIZACIÓN: la versión anterior traía Stock/KardexCount/ActasCount con 3 subconsultas
    // correlacionadas POR FILA, y además repetía esas mismas subconsultas sobre TODA la tabla de
    // artículos (sin límite) dos veces más solo para los contadores de los filtros — miles de
    // subconsultas por carga. Ahora Stock/KardexCount/ActasCount se calculan con un JOIN a tablas
    // derivadas (una sola pasada agregada sobre Dynamic_Kardex / Dynamic_Actas_Items), y los
    // contadores de filtro se calculan en memoria a partir de esa misma consulta.
    //
    // NOTA DE FIDELIDAD: igual que en el código original, los contadores de Categoría/Clasificación
    // NO aplican la restricción filtroCategorias (Acceso 4/5/6) — solo el listado la aplica. Se
    // conserva ese comportamiento tal cual para no alterar la lógica existente.
    const [base] = await pool.execute(`
      SELECT
        a.Id,
        a.Imagen,
        a.Elemento,
        a.Talla,
        a.Referencia,
        a.Articulo,
        a.Categoria,
        a.Proveedor,
        a.Costo,
        a.\`Fecha Registro\` AS fechaRegistro,
        a.Usuario,
        a.ClaseArticulo,
        a.Placa,
        cci.Condicion,
        IFNULL(ks.Stock, 0) AS Stock,
        IFNULL(ks.KardexCount, 0) AS KardexCount,
        IFNULL(ai.ActasCount, 0) AS ActasCount
      FROM Dynamic_Articulos a
      LEFT JOIN Config_Categoria_Inventario cci ON cci.Categoria = a.Categoria
      LEFT JOIN (SELECT IdArticulo, SUM(Cantidad) AS Stock, COUNT(*) AS KardexCount FROM Dynamic_Kardex GROUP BY IdArticulo) ks ON ks.IdArticulo = a.Id
      LEFT JOIN (SELECT IdArticulo, COUNT(DISTINCT IdActa) AS ActasCount FROM Dynamic_Actas_Items GROUP BY IdArticulo) ai ON ai.IdArticulo = a.Id
      ORDER BY a.Id DESC
    `);

    const searchLower = search ? String(search).toLowerCase() : null;
    const matchFiltroCategorias = (r) => !acceso.filtroCategorias || acceso.filtroCategorias.includes(r.Categoria);
    const matchCat = (r) => !categoria || r.Categoria === categoria;
    const matchCls = (r) => !clasificacion || r.ClaseArticulo === clasificacion;
    const matchSearch = (r) => !searchLower ||
      (r.Articulo && String(r.Articulo).toLowerCase().includes(searchLower)) ||
      (r.Referencia && String(r.Referencia).toLowerCase().includes(searchLower)) ||
      (r.Elemento && String(r.Elemento).toLowerCase().includes(searchLower)) ||
      String(r.Id).includes(searchLower);

    const results = base
      .filter((r) => matchFiltroCategorias(r) && matchCat(r) && matchCls(r) && matchSearch(r))
      .slice(0, 500);

    const sumStockBy = (rows, keyFn) => {
      const acc = {};
      rows.forEach((r) => {
        const key = keyFn(r);
        if (!key) return;
        acc[key] = (acc[key] || 0) + Number(r.Stock || 0);
      });
      return acc;
    };

    const catCounts = sumStockBy(base.filter((r) => matchCls(r) && matchSearch(r)), (r) => r.Categoria);
    const clsCounts = sumStockBy(base.filter((r) => matchCat(r) && matchSearch(r)), (r) => r.ClaseArticulo);

    res.json({
      results,
      counts: {
        categorias: catCounts,
        clasificaciones: clsCounts
      }
    });

  } catch (err) {
    console.error('[inventario] GET /api/articulos/datos:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. POST /api/articulos/guardar - Crear o Editar un Artículo (Solo Operación Administración)
router.post('/api/articulos/guardar', upload.single('imagenArchivo'), async (req, res) => {
  try {
    const { usuario, id, imagen, elemento, talla, referencia, categoria, proveedor, costo, claseArticulo, placa } = req.body;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }

    const cleanElemento = elemento ? elemento.trim().toUpperCase() : null;
    const cleanClase = claseArticulo ? claseArticulo.trim().toUpperCase() : null;

    const acceso = await computarAccesoInventario(usuario, 'ArtÍculos');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    // "Roles que pueden crear y editar artículos" (Config_Parametros, inventario / Artículos).
    // Antes: operación Administración o roles Auxiliar/AuxiliarR.
    if (!(await obtenerConfigArticulos(acceso.rol)).puedeCrearEditar) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para crear o editar artículos.' });
    }

    // Seguridad: un rol con acceso restringido (Acceso 4/5/6) solo gestiona artículos de sus
    // categorías, tanto la nueva como la que tenía el artículo al editarlo.
    if (acceso.filtroCategorias) {
      const categoriasARevisar = [categoria];
      if (id) {
        const [[actual]] = await pool.execute('SELECT Categoria FROM Dynamic_Articulos WHERE Id = ? LIMIT 1', [parseInt(id)]);
        if (actual) categoriasARevisar.push(actual.Categoria);
      }
      if (!categoriasARevisar.every((c) => categoriaPermitidaParaRol(acceso, c))) {
        return res.status(403).json({ error: 'Su rol solo puede gestionar artículos de sus categorías permitidas.' });
      }
    }

    // Placa solo aplica cuando la Condicion de la Categoria es 'Recuperable' (Config_Categoria_Inventario).
    // Se ignora cualquier valor recibido para otras condiciones, para que no sea bypasseable desde la API.
    let placaFinal = placa || null;
    if (placaFinal) {
      const [[catRow]] = await pool.execute(
        'SELECT Condicion FROM Config_Categoria_Inventario WHERE Categoria = ? LIMIT 1',
        [categoria || null]
      );
      if (!catRow || catRow.Condicion !== 'Recuperable') {
        placaFinal = null;
      }
    }

    let publicUrl = imagen || null;

    if (id && req.file) {
      const bucketName = 'logyser-recursos-corporativos';
      const prefix = 'image-articulos/';
      const ext = path.extname(req.file.originalname) || '.png';
      const fileName = `${id}${ext}`;
      const fullPath = `${prefix}${fileName}`;

      const gcsFile = storage.bucket(bucketName).file(fullPath);
      await gcsFile.save(req.file.buffer, {
        contentType: req.file.mimetype,
        public: true
      });
      publicUrl = `https://storage.googleapis.com/${bucketName}/${fullPath}`;
    }

    if (id) {
      // Editar
      const query = `
        UPDATE Dynamic_Articulos SET
          Imagen = ?,
          Elemento = ?,
          Talla = ?,
          Referencia = ?,
          Categoria = ?,
          Proveedor = ?,
          Costo = ?,
          ClaseArticulo = ?,
          Placa = ?
        WHERE Id = ?
      `;
      const params = [
        publicUrl,
        cleanElemento,
        talla || null,
        referencia || null,
        categoria || null,
        proveedor || null,
        costo ? parseFloat(costo) : null,
        cleanClase,
        placaFinal,
        parseInt(id)
      ];
      await pool.execute(query, params);
      cachedLookupsBase = null; // invalidar cache de kardex-lookups (cambió un Articulo)
      res.json({ success: true, message: 'Artículo actualizado exitosamente.', url: publicUrl });
    } else {
      // Crear
      const query = `
        INSERT INTO Dynamic_Articulos 
        (Imagen, Elemento, Talla, Referencia, Categoria, Proveedor, Costo, \`Fecha Registro\`, Usuario, ClaseArticulo, Placa)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)
      `;
      const params = [
        publicUrl,
        cleanElemento,
        talla || null,
        referencia || null,
        categoria || null,
        proveedor || null,
        costo ? parseFloat(costo) : null,
        acceso.usuarioNombre,
        cleanClase,
        placaFinal
      ];
      await pool.execute(query, params);
      cachedLookupsBase = null; // invalidar cache de kardex-lookups (nuevo Articulo)
      res.json({ success: true, message: 'Artículo creado exitosamente.' });
    }
  } catch (err) {
    console.error('[inventario] POST /api/articulos/guardar error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. POST /api/articulos/guardar-masivo - Guardar múltiples artículos a la vez (Solo Operación Administración)
router.post('/api/articulos/guardar-masivo', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { usuario, articulos } = req.body;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }
    if (!Array.isArray(articulos) || articulos.length === 0) {
      return res.status(400).json({ error: 'Debe enviar al menos un artículo para guardar' });
    }

    const acceso = await computarAccesoInventario(usuario, 'ArtÍculos');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    // "Roles que pueden crear y editar artículos" (Config_Parametros, inventario / Artículos).
    // Antes: operación Administración o roles Auxiliar/AuxiliarR.
    if (!(await obtenerConfigArticulos(acceso.rol)).puedeCrearEditar) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para crear o editar artículos.' });
    }

    // Seguridad: categorías del acceso restringido (Acceso 4/5/6)
    const fueraDeAlcance = articulos.findIndex((art) => !categoriaPermitidaParaRol(acceso, art.categoria));
    if (fueraDeAlcance >= 0) {
      return res.status(403).json({ error: `Fila ${fueraDeAlcance + 1}: su rol no puede crear artículos de la categoría "${articulos[fueraDeAlcance].categoria || ''}".` });
    }
    // Placa solo para categorías Recuperables (igual que el formulario individual)
    const condiciones = await obtenerCondicionesCategoria();

    await conn.beginTransaction();

    const insertQuery = `
      INSERT INTO Dynamic_Articulos
      (Imagen, Elemento, Talla, Referencia, Categoria, Proveedor, Costo, \`Fecha Registro\`, Usuario, ClaseArticulo, Placa)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)
    `;

    for (const art of articulos) {
      if (!art.elemento || !art.elemento.trim()) {
        throw new Error('El campo Elemento es obligatorio en todos los registros.');
      }

      const cleanElemento = art.elemento.trim().toUpperCase();
      const cleanClase = art.claseArticulo ? art.claseArticulo.trim().toUpperCase() : null;
      const placaPermitida = condiciones[normalizarTexto(art.categoria)] === 'Recuperable';

      const params = [
        art.imagen || null,
        cleanElemento,
        art.talla || null,
        art.referencia || null,
        art.categoria || null,
        art.proveedor || null,
        art.costo ? parseFloat(art.costo) : null,
        acceso.usuarioNombre,
        cleanClase,
        placaPermitida ? (art.placa || null) : null
      ];
      await conn.execute(insertQuery, params);
    }

    await conn.commit();
    cachedLookupsBase = null; // invalidar cache de kardex-lookups (alta masiva de Artículos)
    res.json({ success: true, message: `${articulos.length} artículos guardados exitosamente en la base de datos.` });

  } catch (err) {
    await conn.rollback();
    console.error('[inventario] POST /api/articulos/guardar-masivo error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// 4. POST /api/articulos/eliminar - Eliminar artículos de forma masiva (Solo Rol Inventario o Sistema)
router.post('/api/articulos/eliminar', async (req, res) => {
  try {
    const { usuario, ids } = req.body;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }
    if (!ids || !ids.length) {
      return res.status(400).json({ error: 'No se especificaron IDs para eliminar' });
    }

    const acceso = await computarAccesoInventario(usuario, 'ArtÍculos');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    // "Roles que pueden eliminar artículos" (Config_Parametros, inventario / Artículos)
    if (!(await obtenerConfigArticulos(acceso.rol)).puedeEliminar) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para eliminar artículos.' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const query = `DELETE FROM Dynamic_Articulos WHERE Id IN (${placeholders})`;
    await pool.execute(query, ids.map(id => parseInt(id)));

    cachedLookupsBase = null; // invalidar cache de kardex-lookups (Artículos eliminados)
    res.json({ success: true, message: `${ids.length} artículos eliminados exitosamente.` });
  } catch (err) {
    console.error('[inventario] POST /api/articulos/eliminar error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. GET /api/articulos/stock/:id - Obtiene el stock por regional/operación para la ventana emergente
router.get('/api/articulos/stock/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'ArtÍculos');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const query = `
      SELECT 
        \`Regional\` AS regional, 
        \`Operacion\` AS operacion, 
        \`Stock Disponible\` AS stock
      FROM Vista_Inventario
      WHERE IdArticulo = ? AND \`Stock Disponible\` > 0
      ORDER BY \`Regional\`, \`Operacion\`
    `;
    const [rows] = await pool.execute(query, [parseInt(id) || 0]);
    res.json(rows);
  } catch (err) {
    console.error('[inventario] GET /api/articulos/stock error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5b. GET /api/articulos/:id/actas - Actas de Entrega que han usado este artículo (Dynamic_Actas_Items)
router.get('/api/articulos/:id/actas', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'ArtÍculos');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const query = `
      SELECT DISTINCT da.IdActa, da.operacion AS Operacion, da.Fecha_Entrega AS FechaEntrega, da.Url_Acta AS UrlActa,
        da.identificacion AS Identificacion,
        COALESCE(
          (SELECT v.Trabajador FROM \`Maestro_Vinculación\` v WHERE v.\`Identificación\` = da.identificacion ORDER BY v.\`Fecha de Ingreso\` DESC LIMIT 1),
          (SELECT s.Trabajador FROM \`Maestro_Segmentación\` s WHERE s.\`Identificación\` = da.identificacion LIMIT 1)
        ) AS Trabajador
      FROM Dynamic_Actas_Items i
      JOIN Dynamic_Actas da ON da.IdActa = i.IdActa
      WHERE i.IdArticulo = ?
      ORDER BY da.Fecha_Entrega DESC
    `;
    const [rows] = await pool.execute(query, [parseInt(id) || 0]);
    res.json(rows);
  } catch (err) {
    console.error('[inventario] GET /api/articulos/:id/actas error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. GET /api/articulos/elementos - Obtiene los elementos únicos y sus imágenes
router.get('/api/articulos/elementos', async (req, res) => {
  try {
    // Seguridad: antes respondía sin usuario
    const errAcceso = await validarGestorImagenes(req.query.usuario);
    if (errAcceso) return res.status(errAcceso.status).json({ error: errAcceso.error });

    const [uniqueElements] = await pool.execute(`
      SELECT Elemento, COUNT(*) AS total, MAX(Categoria) AS Categoria, MAX(ClaseArticulo) AS ClaseArticulo
      FROM Dynamic_Articulos 
      GROUP BY Elemento 
      ORDER BY Elemento
    `);

    const [allImages] = await pool.execute(`
      SELECT Elemento, Imagen, \`Fecha Registro\` AS fechaRegistro 
      FROM Dynamic_Articulos 
      WHERE Imagen IS NOT NULL AND Imagen != ''
      ORDER BY Elemento, \`Fecha Registro\` DESC, Id DESC
    `);

    const elementImagesMap = {};
    allImages.forEach(row => {
      if (!elementImagesMap[row.Elemento]) {
        elementImagesMap[row.Elemento] = [];
      }
      elementImagesMap[row.Elemento].push({
        url: row.Imagen,
        fecha: row.fechaRegistro
      });
    });

    const results = uniqueElements.map(el => {
      const imagesList = elementImagesMap[el.Elemento] || [];
      const distinctUrls = [...new Set(imagesList.map(img => img.url))];
      
      let sugerencia = null;
      let tieneMultiplesUrls = distinctUrls.length > 1;

      if (imagesList.length > 0) {
        sugerencia = imagesList[0].url;
      }

      return {
        elemento: el.Elemento,
        total: el.total,
        categoria: el.Categoria || 'OTRO',
        claseArticulo: el.ClaseArticulo || 'OTRO',
        imagen: distinctUrls.length === 1 ? distinctUrls[0] : (sugerencia || null),
        tieneMultiplesUrls,
        distinctCount: distinctUrls.length,
        sugerencia
      };
    });

    res.json({ results });
  } catch (err) {
    console.error('[inventario] GET /api/articulos/elementos error:', err);
    res.status(500).json({ error: 'Error al obtener los elementos únicos' });
  }
});

// 7. POST /api/articulos/elementos/guardar-imagen - Sube una imagen a GCS y la asocia a todos los registros del Elemento
router.post('/api/articulos/elementos/guardar-imagen', upload.single('imagen'), async (req, res) => {
  try {
    const { elemento } = req.body;
    const file = req.file;

    // Seguridad: antes cualquiera podía cambiar la imagen de todos los artículos de un elemento
    const errAcceso = await validarGestorImagenes(req.body.usuario);
    if (errAcceso) return res.status(errAcceso.status).json({ error: errAcceso.error });

    if (!elemento || !elemento.trim()) {
      return res.status(400).json({ error: 'El nombre del elemento es requerido.' });
    }
    if (!file) {
      return res.status(400).json({ error: 'Debe cargar un archivo de imagen.' });
    }

    const bucketName = 'logyser-recursos-corporativos';
    const prefix = 'image-articulos/';
    const ext = path.extname(file.originalname) || '.png';
    const cleanElementoName = elemento.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    const timestamp = Date.now();
    const fileName = `${cleanElementoName}_${timestamp}${ext}`;
    const fullPath = `${prefix}${fileName}`;

    const gcsFile = storage.bucket(bucketName).file(fullPath);
    await gcsFile.save(file.buffer, {
      contentType: file.mimetype,
      public: true
    });

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${fullPath}`;

    // Actualizar todos los registros de ese elemento
    await pool.execute(
      'UPDATE Dynamic_Articulos SET Imagen = ? WHERE Elemento = ?',
      [publicUrl, elemento.trim()]
    );

    res.json({
      message: `Imagen subida y asociada a todos los registros de "${elemento.trim()}" exitosamente.`,
      url: publicUrl
    });
  } catch (err) {
    console.error('[inventario] POST /api/articulos/elementos/guardar-imagen error:', err);
    res.status(500).json({ error: 'Error al subir la imagen y asociar al elemento' });
  }
});

// 8. POST /api/articulos/elementos/aplicar-sugerencia - Aplica la imagen sugerida a todos los registros del Elemento
router.post('/api/articulos/elementos/aplicar-sugerencia', async (req, res) => {
  try {
    const { elemento } = req.body;

    // Seguridad: antes cualquiera podía aplicar la sugerencia a todos los artículos del elemento
    const errAcceso = await validarGestorImagenes(req.body.usuario);
    if (errAcceso) return res.status(errAcceso.status).json({ error: errAcceso.error });

    if (!elemento || !elemento.trim()) {
      return res.status(400).json({ error: 'El nombre del elemento es requerido.' });
    }

    const [rows] = await pool.execute(`
      SELECT Imagen FROM Dynamic_Articulos 
      WHERE Elemento = ? AND Imagen IS NOT NULL AND Imagen != ''
      ORDER BY \`Fecha Registro\` DESC, Id DESC
      LIMIT 1
    `, [elemento.trim()]);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No se encontraron imágenes registradas para este elemento.' });
    }

    const mostRecentUrl = rows[0].Imagen;

    await pool.execute(
      'UPDATE Dynamic_Articulos SET Imagen = ? WHERE Elemento = ?',
      [mostRecentUrl, elemento.trim()]
    );

    res.json({
      message: `Sugerencia aplicada: Se asignó la imagen más reciente a todos los registros de "${elemento.trim()}".`,
      url: mostRecentUrl
    });
  } catch (err) {
    console.error('[inventario] POST /api/articulos/elementos/aplicar-sugerencia error:', err);
    res.status(500).json({ error: 'Error al aplicar la sugerencia de imagen' });
  }
});

// GET /api/categorias - Obtiene todas las categorías de Config_Categoria_Inventario
router.get('/api/categorias', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT DISTINCT Categoria FROM Config_Categoria_Inventario WHERE Categoria IS NOT NULL ORDER BY Categoria');
    const categories = rows.map(r => r.Categoria);
    res.json({ categories });
  } catch (err) {
    console.error('[inventario] GET /api/categorias error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// KARDEX MASIVO & PENDIENTE POR RECIBIR ENDPOINTS
// ==========================================

// GET /api/kardex-lookups - returns articles, operations, regionals, categories
// Regional/Operación se filtran según el acceso de Kardex del Rol del usuario (computarAccesoInventario).
router.get('/api/kardex-lookups', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoInventario(usuario, 'Kardex');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const { artRows, opRows, regionales: todosRegionales, categorias } = await getLookupsBase();

    let operaciones = opRows;
    let regionales = todosRegionales;

    if (!acceso.sinFiltro) {
      const operacionesPermitidas = new Set(acceso.operacionesFiltro);
      operaciones = opRows.filter(o => operacionesPermitidas.has(o.operacion));
      const regionalesPermitidos = new Set(Object.keys(acceso.opsPorRegional));
      regionales = regionales.filter(r => regionalesPermitidos.has(r));
    }

    res.json({
      articulos: artRows,
      operaciones,
      regionales,
      // Lista completa (sin restringir por el acceso de origen del usuario), para poblar la
      // Operación Destino de una TRANSFERENCIA: cualquier usuario puede transferir a cualquier
      // operación de su misma Regional, aunque su acceso de origen esté limitado a una sola.
      operacionesTodas: opRows,
      categorias
    });
  } catch (err) {
    console.error('[inventario] GET /api/kardex-lookups error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// KARDEX MASIVO & PENDIENTE POR RECIBIR ENDPOINTS
// ==========================================

/**
 * Genera el PDF del Acta de Ingreso y verificación de inventario (Id 87 / INVREC),
 * lo sube a Google Cloud Storage y registra el documento en Maestro_docEmpresa.
 */
async function generarYGuardarActaRecepcionTransferencia({
  order,
  items,
  usuarioReceptor,
  colaboradorReceptor,
  identificacionReceptor,
  signatureBase64,
  observacionesGenerales
}) {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const fechaDespachoStr = order.FechaDespacho ? new Date(order.FechaDespacho).toLocaleDateString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '—';

  const fechaRecepcionStr = now.toLocaleDateString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // Consultar nombre del colaborador que despachó si es posible
  let colaboradorDespacha = order.UsuarioDespacha || '—';
  try {
    const [dRows] = await pool.execute(
      'SELECT Colaborador FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
      [order.UsuarioDespacha]
    );
    if (dRows.length && dRows[0].Colaborador) {
      colaboradorDespacha = `${dRows[0].Colaborador} (${order.UsuarioDespacha})`;
    }
  } catch (errDisp) {
    console.warn('[inventario] Error consultando despachador:', errDisp.message);
  }

  // Agrupar los artículos por UsuarioAsignado (el colaborador al que quedó asignado cada uno),
  // dando prioridad a esa columna sobre el orden plano de llegada. Sin asignación -> grupo aparte.
  const SIN_ASIGNAR_KEY = '__SIN_ASIGNAR__';
  const gruposMap = new Map();
  items.forEach(item => {
    const key = (item.UsuarioAsignado && String(item.UsuarioAsignado).trim()) || SIN_ASIGNAR_KEY;
    if (!gruposMap.has(key)) gruposMap.set(key, []);
    gruposMap.get(key).push(item);
  });

  // Resolver el nombre del trabajador por cada Identificación asignada (Maestro_Vinculación,
  // misma vinculación-más-reciente-gana que se usa en el resto del módulo).
  //
  // OPTIMIZACIÓN: antes esto era una consulta POR cada colaborador distinto (N+1, secuencial).
  // Ahora es una sola consulta con ROW_NUMBER() que trae la vinculación más reciente de todos
  // los colaboradores del lote de una vez.
  const nombresAsignados = {};
  const keysAsignados = Array.from(gruposMap.keys()).filter((key) => key !== SIN_ASIGNAR_KEY);
  if (keysAsignados.length) {
    try {
      const ph = keysAsignados.map(() => '?').join(',');
      const [vRows] = await pool.execute(
        `SELECT \`Identificación\`, Trabajador FROM (
           SELECT \`Identificación\`, Trabajador,
                  ROW_NUMBER() OVER (PARTITION BY \`Identificación\` ORDER BY \`Fecha de Ingreso\` DESC) AS rn
           FROM \`Maestro_Vinculación\`
           WHERE \`Identificación\` IN (${ph})
         ) t WHERE rn = 1`,
        keysAsignados
      );
      vRows.forEach((r) => { nombresAsignados[r['Identificación']] = r.Trabajador; });
    } catch (errNom) {
      console.warn('[inventario] Error resolviendo nombres de asignados:', errNom.message);
    }
    keysAsignados.forEach((key) => {
      if (!nombresAsignados[key]) nombresAsignados[key] = key;
    });
  }

  const gruposOrdenados = Array.from(gruposMap.keys()).sort((a, b) => {
    if (a === SIN_ASIGNAR_KEY) return 1;
    if (b === SIN_ASIGNAR_KEY) return -1;
    return String(nombresAsignados[a] || a).localeCompare(String(nombresAsignados[b] || b));
  });

  // Filas de la tabla de artículos, agrupadas por trabajador asignado
  let itemsRowsHtml = '';
  let totalUnidadesEnviadas = 0;
  let totalUnidadesRecibidas = 0;
  let totalUnidadesDevueltas = 0;
  let itemCounter = 0;

  gruposOrdenados.forEach(key => {
    const grupoLabel = key === SIN_ASIGNAR_KEY ? 'Sin trabajador asignado' : (nombresAsignados[key] || key);
    itemsRowsHtml += `
      <tr style="background-color: #dbeafe;">
        <td colspan="8" style="border: 1px solid #ddd; padding: 6px 8px; font-weight: bold; color: #1e3c72; font-size: 8.5pt;">👤 ${grupoLabel}</td>
      </tr>
    `;

    gruposMap.get(key).forEach(item => {
      itemCounter++;
      const cantEnviada = item.CantidadDespachada !== undefined ? Number(item.CantidadDespachada) : Math.abs(Number(item.Cantidad) || 0);
      const cantRecibida = item.CantidadRecibida !== undefined ? Number(item.CantidadRecibida) : cantEnviada;
      const cantDevuelta = item.CantidadDevuelta !== undefined ? Number(item.CantidadDevuelta) : Math.max(0, cantEnviada - cantRecibida);

      totalUnidadesEnviadas += cantEnviada;
      totalUnidadesRecibidas += cantRecibida;
      totalUnidadesDevueltas += cantDevuelta;

      const novedadItem = item.Novedad
        ? `<span style="color: #c2410c; font-weight: bold;">⚠️ ${item.Novedad}</span>`
        : (cantDevuelta > 0 ? `<span style="color: #dc2626; font-weight: bold;">⚠️ Incompleto (-${cantDevuelta})</span>` : '<span style="color: #16a34a;">Conforme</span>');

      const imgHtml = item.Imagen
        ? `<img src="${item.Imagen}" style="width: 36px; height: 36px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;" alt="">`
        : `<span style="font-size: 1.2rem;">📦</span>`;

      const devueltoHtml = cantDevuelta > 0
        ? `<span style="color: #dc2626; font-weight: bold;">-${cantDevuelta} (Retornado)</span>`
        : `<span style="color: #64748b;">0</span>`;

      itemsRowsHtml += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: middle;">${itemCounter}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: middle;">${imgHtml}</td>
          <td style="border: 1px solid #ddd; padding: 6px; vertical-align: middle;">
            <strong>${item.Articulo || 'Artículo'}</strong>
            ${item.Referencia && item.Referencia !== '—' ? `<br><span style="font-size: 8pt; color: #666;">Ref: ${item.Referencia}</span>` : ''}
            ${item.Talla && item.Talla !== '—' ? `<br><span style="font-size: 8pt; color: #666;">Talla: ${item.Talla}</span>` : ''}
          </td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: middle;">${item.Categoria || item.CategoriaArticulo || 'General'}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: middle; font-weight: bold;">${cantEnviada}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: middle; font-weight: bold; color: ${cantDevuelta > 0 ? '#ea580c' : '#16a34a'};">${cantRecibida}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: middle; font-size: 8.5pt;">${devueltoHtml}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: middle; font-size: 8.5pt;">${novedadItem}</td>
        </tr>
      `;
    });
  });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; padding: 10px; color: #333;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <tr>
          <td style="width: 130px; vertical-align: middle;">
            <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height: 50px;" alt="LOG&SER">
          </td>
          <td style="text-align: center; font-size: 13pt; font-weight: bold; line-height: 1.4; color: #1e3c72; vertical-align: middle;">
            ACTA DE INGRESO Y VERIFICACIÓN DE INVENTARIO<br>
            <span style="font-size: 10pt; color: #555; font-weight: normal;">TRANSFERENCIA DE INVENTARIO ENTRE SEDES</span>
          </td>
        </tr>
      </table>

      <div style="margin-bottom: 16px; font-size: 9.5pt; line-height: 1.6; background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 50%; padding-bottom: 4px;"><strong>No. Pedido / Transferencia:</strong> ${order.Id}</td>
            <td style="width: 50%; padding-bottom: 4px;"><strong>Regional:</strong> ${order.Regional || '—'}</td>
          </tr>
          <tr>
            <td style="padding-bottom: 4px;"><strong>Sede / Operación Origen:</strong> ${order.OperacionOrigen || '—'}</td>
            <td style="padding-bottom: 4px;"><strong>Sede / Operación Destino:</strong> ${order.OperacionDestino || '—'}</td>
          </tr>
          <tr>
            <td style="padding-bottom: 4px;"><strong>Fecha Despacho (Envío):</strong> ${fechaDespachoStr}</td>
            <td style="padding-bottom: 4px;"><strong>Fecha Recepción (Verificación):</strong> ${fechaRecepcionStr}</td>
          </tr>
          <tr>
            <td style="padding-bottom: 4px;"><strong>Despachado Por:</strong> ${colaboradorDespacha}</td>
            <td style="padding-bottom: 4px;"><strong>Recibido Por:</strong> ${colaboradorReceptor} (C.C. ${identificacionReceptor})</td>
          </tr>
          ${order.Observaciones ? `<tr><td colspan="2" style="padding-top: 4px;"><strong>Obs. Despacho:</strong> ${order.Observaciones}</td></tr>` : ''}
          ${observacionesGenerales ? `<tr><td colspan="2" style="padding-top: 4px; color: #c2410c;"><strong>Novedades / Observaciones de Recepción:</strong> ${observacionesGenerales}</td></tr>` : ''}
        </table>
      </div>

      <div style="margin-bottom: 8px; font-size: 10pt; font-weight: bold; color: #1e3c72;">
        ARTÍCULOS RECIBIDOS Y VERIFICADOS EN FÍSICO:
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #e2e8f0;">
            <th style="border: 1px solid #ddd; padding: 6px; width: 5%; text-align: center;">ÍTEM</th>
            <th style="border: 1px solid #ddd; padding: 6px; width: 8%; text-align: center;">IMAGEN</th>
            <th style="border: 1px solid #ddd; padding: 6px; width: 35%; text-align: left;">DESCRIPCIÓN DEL ARTÍCULO</th>
            <th style="border: 1px solid #ddd; padding: 6px; width: 12%; text-align: center;">CATEGORÍA</th>
            <th style="border: 1px solid #ddd; padding: 6px; width: 10%; text-align: center;">CANT. ENVIADA</th>
            <th style="border: 1px solid #ddd; padding: 6px; width: 10%; text-align: center;">CANT. RECIBIDA</th>
            <th style="border: 1px solid #ddd; padding: 6px; width: 10%; text-align: center;">DIF. RETORNADA</th>
            <th style="border: 1px solid #ddd; padding: 6px; width: 10%; text-align: center;">ESTADO / NOVEDAD</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml}
          <tr style="background-color: #f1f5f9; font-weight: bold;">
            <td colspan="4" style="border: 1px solid #ddd; padding: 6px; text-align: right;">TOTALES:</td>
            <td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${totalUnidadesEnviadas}</td>
            <td style="border: 1px solid #ddd; padding: 6px; text-align: center; color: #16a34a;">${totalUnidadesRecibidas}</td>
            <td style="border: 1px solid #ddd; padding: 6px; text-align: center; color: ${totalUnidadesDevueltas > 0 ? '#dc2626' : '#64748b'};">${totalUnidadesDevueltas}</td>
            <td style="border: 1px solid #ddd; padding: 6px;"></td>
          </tr>
        </tbody>
      </table>

      <div style="font-size: 8.5pt; color: #555; margin-bottom: 30px; text-align: justify; line-height: 1.4;">
        Certifico mediante la presente acta que he recibido y verificado físicamente el estado y cantidad de los elementos relacionados en esta transferencia de inventario para la operación destino, dejando constancia de las novedades u observaciones indicadas anteriormente.
      </div>

      <div style="page-break-inside: avoid; margin-top: 20px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div style="border-bottom: 1.5px solid #333; width: 280px; padding-bottom: 6px; margin-bottom: 6px;">
          ${signatureBase64 ? `<img src="${signatureBase64}" style="max-height: 70px; max-width: 240px; object-fit: contain;" alt="Firma">` : '<div style="height: 50px;"></div>'}
        </div>
        <div style="font-size: 9.5pt; font-weight: bold; color: #1e3c72; text-transform: uppercase;">
          FIRMA RESPONSABLE QUE RECIBE
        </div>
        <div style="font-size: 8.5pt; color: #555; margin-top: 2px;">
          Nombre: ${colaboradorReceptor}<br>
          C.C.: ${identificacionReceptor}
        </div>
      </div>
    </div>
  `;

  const pdfBuffer = await generarPDF(htmlContent, {
    margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
  });

  // Consultar Prefijo para TipoDocumento = 87
  let prefijo = 'INVREC';
  try {
    const [docRows] = await pool.execute(
      'SELECT Prefijo FROM Config_Doc_Trabajador WHERE Id = 87 LIMIT 1'
    );
    if (docRows.length && docRows[0].Prefijo) {
      prefijo = docRows[0].Prefijo.trim();
    }
  } catch (errPrefijo) {
    console.warn('[inventario] Error consultando Prefijo Id 87:', errPrefijo.message);
  }

  const fileName = `${prefijo}.${timestamp}.pdf`;
  const pdfUrl = await subirPDFConfirmacionInventario(fileName, pdfBuffer);

  // Obtener Regional de la OperacionDestino
  let regional = order.Regional || null;
  try {
    const [opRows] = await pool.execute(
      'SELECT `REGIONAL` FROM `Maestro_Operaciones` WHERE `OPERACIÓN` = ? LIMIT 1',
      [order.OperacionDestino]
    );
    if (opRows.length && opRows[0].REGIONAL) {
      regional = opRows[0].REGIONAL;
    }
  } catch (errOp) {
    console.warn('[inventario] Error consultando regional:', errOp.message);
  }

  // Insertar en Maestro_docEmpresa
  const docEmpresaId = randomUUID();
  const obsClean = observacionesGenerales ? String(observacionesGenerales).substring(0, 512) : (order.Observaciones ? String(order.Observaciones).substring(0, 512) : null);

  try {
    await pool.execute(
      `INSERT INTO \`Maestro_docEmpresa\` (
        \`id\`,
        \`Validación\`,
        \`Regional\`,
        \`Operación\`,
        \`TipoDocumento\`,
        \`Prefijo\`,
        \`Observaciones\`,
        \`Visualizar\`,
        \`Solicitud\`,
        \`Justificacion_Solicitud\`,
        \`FechaRegistro\`,
        \`Usuario\`,
        \`Url\`,
        \`Usuario_Solicitud\`,
        \`Estado_Solicitud\`
      ) VALUES (?, 'PEND', ?, ?, '87', ?, ?, NULL, NULL, NULL, NOW(), ?, ?, NULL, NULL)`,
      [
        docEmpresaId,
        regional,
        order.OperacionDestino,
        prefijo,
        obsClean,
        usuarioReceptor,
        pdfUrl
      ]
    );
  } catch (errDocEmp) {
    console.error('[inventario] Error insertando en Maestro_docEmpresa:', errDocEmp);
  }

  return { pdfUrl, fileName, prefijo };
}

// Valida en el servidor cada fila de "Agregar Kardex" (antes solo lo hacía la pantalla):
// tipo permitido, operación de origen dentro del alcance del rol (Maestro_Menu),
// categoría permitida si el rol es restringido, trabajador asignado solo con permiso y,
// en transferencias, que el destino esté permitido. Devuelve el texto del error o null.
async function validarMovimientosKardex(acceso, cfg, movimientos) {
  const { opRows } = await getLookupsBase();
  const regionalDe = new Map(opRows.map((o) => [normalizarTexto(o.operacion), o.regional]));
  const permitidas = new Set(acceso.operacionesFiltro.map(normalizarTexto));

  for (let i = 0; i < movimientos.length; i++) {
    const mov = movimientos[i] || {};
    const fila = `Fila ${i + 1}`;
    const tipo = String(mov.TipoMovimiento || '').trim().toUpperCase();
    const origen = String(mov.Operacion || '').trim();

    if (!cfg.tiposPermitidos.includes(tipo)) {
      return `${fila}: el tipo de movimiento "${mov.TipoMovimiento || ''}" no está permitido (${cfg.tiposPermitidos.join(', ')}).`;
    }
    if (!origen || !regionalDe.has(normalizarTexto(origen))) {
      return `${fila}: la operación "${origen}" no existe o está inactiva.`;
    }
    if (!acceso.sinFiltro && !permitidas.has(normalizarTexto(origen))) {
      return `${fila}: no tiene acceso a la operación "${origen}".`;
    }
    if (acceso.filtroCategorias && !acceso.filtroCategorias.some((c) => normalizarTexto(c) === normalizarTexto(mov.Categoria))) {
      return `${fila}: su rol no tiene permiso para la categoría "${mov.Categoria || ''}".`;
    }
    if (String(mov.UsuarioAsignado || '').trim() && !cfg.puedeAsignarTrabajador) {
      return `${fila}: su rol no tiene permiso para asignar trabajador.`;
    }
    if (tipo === 'TRANSFERENCIA') {
      const destino = String(mov.OperacionDestino || '').trim();
      if (!destino || !regionalDe.has(normalizarTexto(destino))) {
        return `${fila}: seleccione una Operación Destino válida para la transferencia.`;
      }
      if (normalizarTexto(destino) === normalizarTexto(origen)) {
        return `${fila}: la Operación Destino no puede ser igual a la de origen.`;
      }
      const regOrigen = regionalDe.get(normalizarTexto(origen));
      const regDestino = regionalDe.get(normalizarTexto(destino));
      if (!destinoTransferenciaPermitido(cfg, regOrigen, destino, regDestino)) {
        return `${fila}: solo puede transferir a operaciones de su misma regional (${regOrigen}) o a: ${cfg.destinosTodos.join(', ')}.`;
      }
    }
  }
  return null;
}

// POST /api/kardex/guardar-masivo - saves list of kardex rows and groups transfers under Kardex_Pendiente parent orders
router.post('/api/kardex/guardar-masivo', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { usuario, movimientos } = req.body;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }
    if (!Array.isArray(movimientos) || movimientos.length === 0) {
      return res.status(400).json({ error: 'Debe enviar al menos un movimiento' });
    }

    // Seguridad: acceso a Kardex y reglas de Config_Parametros (inventario / Kardex)
    const acceso = await computarAccesoInventario(usuario, 'Kardex');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado para registrar movimientos de Kardex.' });
    }
    const cfgKardex = await obtenerConfigKardex(acceso.rol);
    const errorValidacion = await validarMovimientosKardex(acceso, cfgKardex, movimientos);
    if (errorValidacion) {
      return res.status(400).json({ error: errorValidacion });
    }

    const [uRowsDespacha] = await conn.execute(
      'SELECT Colaborador, Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
      [usuario]
    );
    const usuarioColaborador = uRowsDespacha.length ? (uRowsDespacha[0].Colaborador || usuario) : usuario;
    const usuarioEmailDespacha = uRowsDespacha.length ? uRowsDespacha[0].Email : null;

    await conn.beginTransaction();

    // Group transfers by Operacion (Origen) + OperacionDestino
    const transferGroups = new Map();
    const nonTransferMovs = [];
    const transferenciasParaNotificar = [];

    for (const mov of movimientos) {
      if (mov.TipoMovimiento === 'TRANSFERENCIA') {
        const key = `${mov.Operacion || ''}|${mov.OperacionDestino || ''}`;
        if (!transferGroups.has(key)) {
          transferGroups.set(key, {
            operacionOrigen: mov.Operacion,
            operacionDestino: mov.OperacionDestino,
            regional: mov.Regional || null,
            fechaMovimiento: mov.FechaMovimiento || null,
            observaciones: mov.Observaciones || null,
            items: []
          });
        }
        transferGroups.get(key).items.push(mov);
      } else {
        nonTransferMovs.push(mov);
      }
    }

    // Process Transfer Groups
    for (const [key, group] of transferGroups.entries()) {
      const idKardexPendiente = `TR-${Date.now()}-${randomUUID().slice(0, 6)}`.toUpperCase();

      // Retrieve regional of OperacionDestino if not available
      let regional = group.regional;
      if (!regional) {
        const [[destOp]] = await conn.execute(
          'SELECT DISTINCT REGIONAL FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
          [group.operacionDestino]
        );
        regional = destOp?.REGIONAL || null;
      }

      let fechaInsert = group.fechaMovimiento ? new Date(group.fechaMovimiento) : new Date();
      if (isNaN(fechaInsert.getTime())) fechaInsert = new Date();

      // Insert parent record into Kardex_Pendiente
      await conn.execute(
        `INSERT INTO Kardex_Pendiente
         (Id, IdKardexOriginal, Procesado, Procesando, Novedad, OperacionOrigen, OperacionDestino, Regional, FechaDespacho, UsuarioDespacha, UsuarioRecibe, FechaRecibido, Estado, Observaciones, NovedadGeneral, Url_Acta, Firma_Url)
         VALUES (?, NULL, 0, 0, '', ?, ?, ?, ?, ?, NULL, NULL, 'PENDIENTE', ?, NULL, NULL, NULL)`,
        [
          idKardexPendiente,
          group.operacionOrigen,
          group.operacionDestino,
          regional,
          fechaInsert,
          usuario,
          group.observaciones
        ]
      );

      // Insert each transfer item into Dynamic_Kardex
      for (const mov of group.items) {
        const idKardex = randomUUID().replace(/-/g, '').toLowerCase();
        let qty = parseInt(mov.Cantidad);
        if (isNaN(qty)) throw new Error(`Cantidad inválida para artículo con ID ${mov.IdArticulo}`);
        qty = -Math.abs(qty); // Outgoing quantity from origin

        const idArticulo = parseInt(mov.IdArticulo);
        const valUnitario = mov.ValorUnitario ? parseFloat(mov.ValorUnitario) : 0;
        const obs = mov.Observaciones || null;
        const movFecha = mov.FechaMovimiento ? new Date(mov.FechaMovimiento) : fechaInsert;
        const usrAsignado = mov.UsuarioAsignado ? String(mov.UsuarioAsignado).trim() : null;

        // Dotación de Ley se despacha desde Administración sin stock físico previo:
        // se registra automáticamente la ENTRADA equivalente para que el trigger de
        // stock (trig_check_kardex_stock_after_insert) no rechace la salida por negativo.
        if (obs === 'Dotación de Ley') {
          const idKardexEntradaAuto = randomUUID().replace(/-/g, '').toLowerCase();
          await conn.execute(
            `INSERT INTO Dynamic_Kardex
             (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
              \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
              Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro, Kpendiente, Novedad)
             VALUES (?, ?, 'ENTRADA', ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, ?, ?, NOW(), NULL, NULL)`,
            [
              idKardexEntradaAuto,
              isNaN(movFecha.getTime()) ? fechaInsert : movFecha,
              regional,
              group.operacionOrigen,
              mov.Categoria || null,
              idArticulo,
              Math.abs(qty),
              valUnitario,
              usuario,
              'Ingreso automático para despacho de Dotación de Ley'
            ]
          );
        }

        await conn.execute(
          `INSERT INTO Dynamic_Kardex
           (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
            \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
            Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro, Kpendiente, Novedad)
           VALUES (?, ?, 'TRANSFERENCIA', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NOW(), ?, NULL)`,
          [
            idKardex,
            isNaN(movFecha.getTime()) ? fechaInsert : movFecha,
            regional,
            group.operacionOrigen,
            group.operacionDestino,
            mov.Categoria || null,
            idArticulo,
            qty,
            usrAsignado,
            valUnitario,
            usuario,
            obs,
            idKardexPendiente
          ]
        );
      }

      const categorias = [...new Set(group.items.map(mov => mov.Categoria).filter(Boolean))].join(', ') || 'General';
      transferenciasParaNotificar.push({
        operacionOrigen: group.operacionOrigen,
        operacionDestino: group.operacionDestino,
        regional,
        categorias
      });
    }

    // Process Non-transfer movements
    for (const mov of nonTransferMovs) {
      const idKardex = randomUUID().replace(/-/g, '').toLowerCase();
      const tipo = mov.TipoMovimiento;
      let qty = parseInt(mov.Cantidad);
      if (isNaN(qty)) throw new Error(`Cantidad inválida para artículo con ID ${mov.IdArticulo}`);

      const regional = mov.Regional || null;
      const operacion = mov.Operacion;
      const categoria = mov.Categoria || null;
      const idArticulo = parseInt(mov.IdArticulo);
      const valUnitario = mov.ValorUnitario ? parseFloat(mov.ValorUnitario) : 0;
      const obs = mov.Observaciones || null;
      const fechaMov = mov.FechaMovimiento || null;
      const usrAsignado = mov.UsuarioAsignado ? String(mov.UsuarioAsignado).trim() : null;

      let fechaInsert = fechaMov ? new Date(fechaMov) : new Date();
      if (isNaN(fechaInsert.getTime())) fechaInsert = new Date();

      await conn.execute(
        `INSERT INTO Dynamic_Kardex
         (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
          \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
          Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro, Kpendiente, Novedad)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, NOW(), NULL, NULL)`,
        [
          idKardex,
          fechaInsert,
          tipo,
          regional,
          operacion,
          categoria,
          idArticulo,
          qty,
          usrAsignado,
          valUnitario,
          usuario,
          obs
        ]
      );
    }

    await conn.commit();
    res.json({ message: 'Movimientos guardados exitosamente.' });

    // Notificar despacho de cada transferencia (en segundo plano, ya con la transacción confirmada).
    // Para: "Notificación transferencia despachada - Para:" (roles, según la Operación destino);
    // quien despacha va en copia.
    for (const t of transferenciasParaNotificar) {
      obtenerDestinatariosTransferencia(t.operacionDestino)
        .then(({ habilitado, para }) => {
          if (!habilitado) return;
          const copia = usuarioEmailDespacha && !para.some((c) => c.toLowerCase() === String(usuarioEmailDespacha).trim().toLowerCase())
            ? [usuarioEmailDespacha] : [];
          if (!para.length && !copia.length) return;
          return notificarTransferenciaDespachada({
            operacionOrigen: t.operacionOrigen,
            operacionDestino: t.operacionDestino,
            categoria: t.categorias,
            usuarioNombre: usuarioColaborador,
            destinatarios: para.length ? para : copia,
            copia: para.length ? copia : [],
          });
        })
        .catch(mailErr => console.error('[inventario] Error enviando correo de transferencia despachada:', mailErr));
    }
  } catch (err) {
    await conn.rollback();
    console.error('[inventario] POST /api/kardex/guardar-masivo error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/kardex-pendiente - pending transfers view grouped by transfer order
router.get('/api/kardex-pendiente', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'pendienteRecibir') || await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const securityConds = ['kp.Procesado = 0'];
    const securityParams = [];

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json({ results: [] });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      securityConds.push(`(kp.OperacionDestino IN (${ph}) OR (kp.OperacionDestino IS NULL AND k.\`OperaciónDestino\` IN (${ph})))`);
      securityParams.push(...acceso.operacionesFiltro, ...acceso.operacionesFiltro);
    }

    if (acceso.filtroCategorias) {
      const ph = acceso.filtroCategorias.map(() => '?').join(',');
      securityConds.push(`(k.Categoria IN (${ph}) OR k.Categoria IS NULL)`);
      securityParams.push(...acceso.filtroCategorias);
    }

    const query = `
      SELECT 
        kp.Id AS IdPedido,
        kp.IdKardexOriginal,
        kp.Procesado,
        kp.Procesando,
        kp.OperacionOrigen,
        kp.OperacionDestino,
        kp.Regional,
        kp.FechaDespacho,
        kp.UsuarioDespacha,
        kp.Estado,
        kp.Observaciones AS ObservacionesPedido,
        kp.NovedadGeneral,
        k.IdKardex,
        k.IdArticulo,
        k.FechaMovimiento,
        k.TipoMovimiento,
        k.Acta,
        k.Kpendiente,
        k.Regional AS RegionalKardex,
        k.\`Operación\` AS OpOrigenKardex,
        k.\`OperaciónDestino\` AS OpDestinoKardex,
        ABS(k.Cantidad) AS Cantidad,
        k.Cantidad AS CantidadReal,
        k.ValorUnitario,
        k.UsuarioRegistro,
        k.Observaciones AS ObservacionesItem,
        k.Novedad AS NovedadItem,
        k.UsuarioAsignado,
        -- Subconsulta (no JOIN): un trabajador con reingreso tiene varias filas en
        -- Maestro_Vinculación y el JOIN duplicaba los ítems del pedido.
        (SELECT mv.Trabajador FROM \`Maestro_Vinculación\` mv
          WHERE TRIM(mv.\`Identificación\`) = TRIM(k.UsuarioAsignado)
          ORDER BY mv.\`Fecha de Ingreso\` DESC LIMIT 1) AS NombreTrabajador,
        a.Articulo,
        a.Imagen,
        a.Categoria,
        a.Talla,
        a.Referencia
      FROM Kardex_Pendiente kp
      LEFT JOIN Dynamic_Kardex k ON (k.Kpendiente = kp.Id OR (kp.IdKardexOriginal IS NOT NULL AND k.IdKardex = kp.IdKardexOriginal))
      LEFT JOIN Dynamic_Articulos a ON a.Id = k.IdArticulo
      WHERE ${securityConds.join(' AND ')}
      ORDER BY kp.FechaDespacho DESC, k.FechaMovimiento DESC
    `;

    const [rows] = await pool.execute(query, securityParams);

    // Group rows into Orders
    const ordersMap = new Map();

    for (const row of rows) {
      const orderId = row.IdPedido || row.IdKardexOriginal;
      if (!ordersMap.has(orderId)) {
        ordersMap.set(orderId, {
          Id: orderId,
          IdKardexOriginal: row.IdKardexOriginal,
          Procesado: row.Procesado,
          Procesando: row.Procesando,
          OperacionOrigen: row.OperacionOrigen || row.OpOrigenKardex || '—',
          OperacionDestino: row.OperacionDestino || row.OpDestinoKardex || '—',
          Regional: row.Regional || row.RegionalKardex || '—',
          FechaDespacho: row.FechaDespacho || row.FechaMovimiento,
          UsuarioDespacha: row.UsuarioDespacha || row.UsuarioRegistro || '—',
          Estado: row.Estado || 'PENDIENTE',
          Observaciones: row.ObservacionesPedido || row.ObservacionesItem || '',
          NovedadGeneral: row.NovedadGeneral || '',
          items: []
        });
      }

      if (row.IdKardex || row.IdArticulo) {
        ordersMap.get(orderId).items.push({
          IdKardex: row.IdKardex || row.IdKardexOriginal,
          IdArticulo: row.IdArticulo,
          Articulo: row.Articulo || 'Artículo sin nombre',
          Imagen: row.Imagen || null,
          Categoria: row.Categoria || 'General',
          Talla: row.Talla || '—',
          Referencia: row.Referencia || '—',
          Cantidad: row.Cantidad || 0,
          ValorUnitario: row.ValorUnitario || 0,
          UsuarioRegistro: row.UsuarioRegistro,
          UsuarioAsignado: row.UsuarioAsignado || null,
          Trabajador: row.NombreTrabajador || null,
          Observaciones: row.ObservacionesItem || '',
          Novedad: row.NovedadItem || '',
          // Campos adicionales para poder editar el registro de Dynamic_Kardex desde el
          // mismo modal de edición que usa la pestaña Kardex.
          FechaMovimiento: row.FechaMovimiento,
          TipoMovimiento: row.TipoMovimiento,
          Regional: row.RegionalKardex,
          Operacion: row.OpOrigenKardex,
          OperacionDestino: row.OpDestinoKardex,
          CantidadReal: row.CantidadReal,
          Acta: row.Acta || null,
          Kpendiente: row.Kpendiente || null
        });
      }
    }

    const results = Array.from(ordersMap.values()).map(order => {
      const totalUnidades = order.items.reduce((sum, item) => sum + (Number(item.Cantidad) || 0), 0);
      return {
        ...order,
        totalArticulos: order.items.length,
        totalUnidades
      };
    });

    const cfgPendiente = await obtenerConfigPendiente(acceso.rol);
    res.json({ results, puedeEliminar: cfgPendiente.puedeEliminar, puedeGenerarActas: cfgPendiente.puedeGenerarActas });
  } catch (err) {
    console.error('[inventario] GET /api/kardex-pendiente error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Eliminación completa de pedidos pendientes por recibir ───────────────────
// "Puede eliminar registros pendientes por recibir" (Config_Parametros, inventario /
// Pendiente por recibir; roles separados por coma, sin distinguir mayúsculas ni tildes).
async function puedeEliminarPendientes(rol) {
  if (!rol) return false;
  return (await obtenerConfigPendiente(rol)).puedeEliminar;
}

/**
 * Identifica todos los registros de Dynamic_Kardex que generó un pedido de Kardex_Pendiente:
 *  1. Las TRANSFERENCIAS del pedido (Kpendiente = Id, o IdKardexOriginal en pedidos antiguos).
 *  2. La ENTRADA automática que se registra en el origen al despachar "Dotación de Ley"
 *     (guardar-masivo), que no queda ligada por Kpendiente: se empareja por artículo,
 *     operación, cantidad, usuario y hora de registro.
 *  3. La ENTRADA en Administración que crea la aprobación de una solicitud (pedidos SOL-),
 *     referenciada desde Dynamic_Solicitudes_Items.IdKardex.
 */
async function obtenerRegistrosRelacionadosPendiente(conn, kp, forUpdate = false) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [transferencias] = await conn.execute(
    `SELECT k.IdKardex, k.TipoMovimiento, k.FechaMovimiento, k.FechaRegistro, k.\`Operación\` AS Operacion,
            k.IdArticulo, k.Cantidad, k.UsuarioRegistro, k.Observaciones, k.Acta, a.Articulo
     FROM Dynamic_Kardex k
     LEFT JOIN Dynamic_Articulos a ON a.Id = k.IdArticulo
     WHERE k.Kpendiente = ? OR (? IS NOT NULL AND k.IdKardex = ?)${lock}`,
    [kp.Id, kp.IdKardexOriginal, kp.IdKardexOriginal]
  );

  const entradas = [];
  const itemsSolicitud = [];
  const usados = new Set(transferencias.map(t => t.IdKardex));

  for (const t of transferencias) {
    if (t.TipoMovimiento !== 'TRANSFERENCIA') continue;
    const cantidad = Math.abs(Number(t.Cantidad) || 0);

    if (t.Observaciones === 'Dotación de Ley') {
      const [cand] = await conn.execute(
        `SELECT k.IdKardex, k.TipoMovimiento, k.Cantidad, k.Observaciones, a.Articulo
         FROM Dynamic_Kardex k
         LEFT JOIN Dynamic_Articulos a ON a.Id = k.IdArticulo
         WHERE k.TipoMovimiento = 'ENTRADA'
           AND k.Observaciones = 'Ingreso automático para despacho de Dotación de Ley'
           AND k.Kpendiente IS NULL
           AND k.IdArticulo = ?
           AND k.\`Operación\` <=> ?
           AND k.Cantidad = ?
           AND k.UsuarioRegistro <=> ?
           AND ABS(TIMESTAMPDIFF(SECOND, k.FechaRegistro, ?)) <= 120
         ORDER BY ABS(TIMESTAMPDIFF(SECOND, k.FechaRegistro, ?))${lock}`,
        [t.IdArticulo, t.Operacion, cantidad, t.UsuarioRegistro, t.FechaRegistro, t.FechaRegistro]
      );
      const match = cand.find(c => !usados.has(c.IdKardex));
      if (match) {
        usados.add(match.IdKardex);
        entradas.push(match);
      }
    }

    if (String(kp.Id).startsWith('SOL-')) {
      const [cand] = await conn.execute(
        `SELECT k.IdKardex, k.TipoMovimiento, k.Cantidad, k.Observaciones, a.Articulo, i.IdElemento
         FROM Dynamic_Solicitudes_Items i
         JOIN Dynamic_Kardex k ON k.IdKardex = i.IdKardex
         LEFT JOIN Dynamic_Articulos a ON a.Id = k.IdArticulo
         WHERE k.TipoMovimiento = 'ENTRADA'
           AND k.IdArticulo = ?
           AND k.Cantidad = ?
           AND k.Observaciones <=> ?
           AND k.UsuarioRegistro <=> ?
           AND k.FechaMovimiento <=> ?${lock}`,
        [t.IdArticulo, cantidad, t.Observaciones, t.UsuarioRegistro, t.FechaMovimiento]
      );
      const match = cand.find(c => !usados.has(c.IdKardex));
      if (match) {
        usados.add(match.IdKardex);
        entradas.push(match);
        itemsSolicitud.push(match.IdElemento);
      }
    }
  }

  return { transferencias, entradas, itemsSolicitud };
}

async function cargarPedidoPendienteEliminable(usuario, id) {
  const acceso = await computarAccesoInventario(usuario, 'pendienteRecibir') || await computarAccesoInventario(usuario, 'Inventario');
  if (!acceso || !(await puedeEliminarPendientes(acceso.rol))) {
    return { status: 403, error: 'No autorizado para eliminar pedidos pendientes por recibir.' };
  }
  const [[kp]] = await pool.execute(
    'SELECT Id, IdKardexOriginal, Procesado, Procesando FROM Kardex_Pendiente WHERE Id = ? LIMIT 1',
    [id]
  );
  if (!kp) return { status: 404, error: 'Pedido no encontrado' };
  if (Number(kp.Procesado) === 1) return { status: 400, error: 'El pedido ya fue recibido; no se puede eliminar.' };
  if (Number(kp.Procesando) === 1) return { status: 409, error: 'El pedido se está recibiendo en este momento; intente más tarde.' };
  return { kp };
}

// GET /api/kardex-pendiente/:id/relacionados - vista previa de lo que se eliminará
router.get('/api/kardex-pendiente/:id/relacionados', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const r = await cargarPedidoPendienteEliminable(usuario, req.params.id);
    if (r.error) return res.status(r.status).json({ error: r.error });

    const { transferencias, entradas } = await obtenerRegistrosRelacionadosPendiente(pool, r.kp);
    const mapear = (x) => ({ IdKardex: x.IdKardex, TipoMovimiento: x.TipoMovimiento, Articulo: x.Articulo || 'Artículo sin nombre', Cantidad: x.Cantidad });
    res.json({ transferencias: transferencias.map(mapear), entradas: entradas.map(mapear) });
  } catch (err) {
    console.error('[inventario] GET /api/kardex-pendiente/:id/relacionados error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/kardex-pendiente/:id - elimina el pedido de Kardex_Pendiente junto con todos sus
// registros relacionados en Dynamic_Kardex, como si el pedido nunca se hubiera realizado.
router.delete('/api/kardex-pendiente/:id', async (req, res) => {
  const { id } = req.params;
  const { usuario } = req.query;
  if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

  let conn;
  try {
    const r = await cargarPedidoPendienteEliminable(usuario, id);
    if (r.error) return res.status(r.status).json({ error: r.error });

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Re-verificar estado dentro de la transacción (bloqueando la fila) por si se empezó a recibir.
    const [[kp]] = await conn.execute(
      'SELECT Id, IdKardexOriginal, Procesado, Procesando FROM Kardex_Pendiente WHERE Id = ? FOR UPDATE',
      [id]
    );
    if (!kp || Number(kp.Procesado) === 1 || Number(kp.Procesando) === 1) {
      await conn.rollback();
      return res.status(409).json({ error: 'El pedido cambió de estado; recargue la lista.' });
    }

    const { transferencias, entradas, itemsSolicitud } = await obtenerRegistrosRelacionadosPendiente(conn, kp, true);
    const idsKardex = [...transferencias, ...entradas].map(x => x.IdKardex);

    if (itemsSolicitud.length) {
      const ph = itemsSolicitud.map(() => '?').join(',');
      await conn.execute(`UPDATE Dynamic_Solicitudes_Items SET IdKardex = NULL WHERE IdElemento IN (${ph})`, itemsSolicitud);
    }
    if (idsKardex.length) {
      const ph = idsKardex.map(() => '?').join(',');
      await conn.execute(`DELETE FROM Dynamic_Kardex WHERE IdKardex IN (${ph})`, idsKardex);
    }
    await conn.execute('DELETE FROM Kardex_Pendiente WHERE Id = ?', [id]);

    await conn.commit();
    console.log(`[inventario] Pedido pendiente ${id} eliminado por ${usuario}: ${transferencias.length} transferencia(s), ${entradas.length} entrada(s) automática(s)`);
    res.json({
      success: true,
      message: 'Pedido eliminado correctamente.',
      eliminados: { transferencias: transferencias.length, entradas: entradas.length }
    });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch (_) { /* noop */ } }
    console.error('[inventario] DELETE /api/kardex-pendiente/:id error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// PATCH /api/kardex-pendiente/:id/novedad - register transfer novelty (order or item level)
router.patch('/api/kardex-pendiente/:id/novedad', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, novedad, idKardex } = req.body;

    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'pendienteRecibir') || await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    // Seguridad: el pedido debe existir, su operación destino debe estar en el alcance del rol
    // (Maestro_Menu) y, si es una novedad de artículo, el artículo debe ser del pedido.
    const [[pedido]] = await pool.execute(
      'SELECT Id, IdKardexOriginal, OperacionDestino, Procesado FROM Kardex_Pendiente WHERE Id = ? OR IdKardexOriginal = ? LIMIT 1',
      [id, id]
    );
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (Number(pedido.Procesado) === 1) {
      return res.status(400).json({ error: 'El pedido ya fue recibido; no se puede modificar la novedad.' });
    }

    let itemPedido = null;
    if (idKardex) {
      [[itemPedido]] = await pool.execute(
        `SELECT IdKardex, \`OperaciónDestino\` AS OperacionDestino FROM Dynamic_Kardex
         WHERE IdKardex = ? AND (Kpendiente = ? OR (? IS NOT NULL AND IdKardex = ?)) LIMIT 1`,
        [idKardex, pedido.Id, pedido.IdKardexOriginal, pedido.IdKardexOriginal]
      );
      if (!itemPedido) return res.status(404).json({ error: 'El artículo no pertenece a este pedido.' });
    }

    let operacionDestino = pedido.OperacionDestino || (itemPedido && itemPedido.OperacionDestino);
    if (!operacionDestino && pedido.IdKardexOriginal) {
      // Pedidos antiguos: el destino solo está en el registro original de Dynamic_Kardex
      const [[orig]] = await pool.execute('SELECT `OperaciónDestino` AS OperacionDestino FROM Dynamic_Kardex WHERE IdKardex = ? LIMIT 1', [pedido.IdKardexOriginal]);
      operacionDestino = orig && orig.OperacionDestino;
    }
    if (!acceso.sinFiltro && !acceso.operacionesFiltro.includes(operacionDestino)) {
      return res.status(403).json({ error: 'No tiene acceso a la operación destino de este pedido.' });
    }

    if (idKardex) {
      // Update item novelty in Dynamic_Kardex
      await pool.execute(
        'UPDATE Dynamic_Kardex SET Novedad = ? WHERE IdKardex = ?',
        [novedad || '', idKardex]
      );
    } else {
      // Update general novelty on Kardex_Pendiente
      await pool.execute(
        'UPDATE Kardex_Pendiente SET NovedadGeneral = ? WHERE Id = ?',
        [novedad || '', pedido.Id]
      );
    }

    res.json({ ok: true, message: 'Novedad registrada exitosamente.' });
  } catch (err) {
    console.error('[inventario] PATCH /api/kardex-pendiente/:id/novedad error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Correo de transferencia recibida (en segundo plano): Para = quien despachó; Copia = roles de
// "Notificación transferencia recibida - Copia:" + quien recibe (Config_Parametros, inventario /
// Pendiente por recibir). No detiene la respuesta si falla.
function enviarCorreoTransferenciaRecibida({ usuarioDespacha, emailReceptor, operacionOrigen, operacionDestino, categoria, colaboradorReceptor, pdfUrl }) {
  Promise.all([
    obtenerCopiaTransferenciaRecibida(),
    pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuarioDespacha]),
  ])
    .then(([{ habilitado, copia }, [rows]]) => {
      if (!habilitado) return;
      const emailDespacha = rows.length ? String(rows[0].Email || '').trim() : '';
      const vistos = new Set(emailDespacha ? [emailDespacha.toLowerCase()] : []);
      const cc = [...copia, emailReceptor].map((c) => String(c || '').trim()).filter((c) => {
        if (!c || vistos.has(c.toLowerCase())) return false;
        vistos.add(c.toLowerCase());
        return true;
      });
      if (!emailDespacha && !cc.length) return;
      return notificarTransferenciaRecibida({
        operacionOrigen,
        operacionDestino,
        categoria,
        colaboradorReceptor,
        pdfUrl,
        emailUsuarioDespacha: emailDespacha || cc.shift(),
        copia: cc,
      });
    })
    .catch((mailErr) => console.error('[inventario] Error enviando correo de transferencia recibida:', mailErr));
}

// POST /api/kardex-pendiente/recibir-orden - receive a transfer order with custom quantities, return diff to origin, signature and generate verification acta
router.post('/api/kardex-pendiente/recibir-orden', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      usuario,
      idPedido,
      cantidadesRecibidas, // { [idKardex]: number }
      novedadesItems, // { [idKardex]: "novedad..." }
      observacionesGenerales,
      firmaBase64,
      useRecentSignature,
      actasIdsKardex // array con los IdKardex seleccionados para generar acta de entrega
    } = req.body;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!idPedido) return res.status(400).json({ error: 'idPedido requerido' });

    const acceso = await computarAccesoInventario(usuario, 'pendienteRecibir') || await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    // "Roles que pueden generar actas de entrega al recibir" (Config_Parametros, inventario /
    // Pendiente por recibir). Se valida antes de tocar nada.
    if (Array.isArray(actasIdsKardex) && actasIdsKardex.length && !(await obtenerConfigPendiente(acceso.rol)).puedeGenerarActas) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para generar actas de entrega al recibir.' });
    }

    // Consultar información del receptor (Maestro_Usuarios y Maestro_Segmentación)
    const [uRows] = await conn.execute(
      'SELECT Colaborador, Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
      [usuario]
    );
    if (!uRows.length) return res.status(404).json({ error: 'Usuario receptor no encontrado' });

    const colaboradorReceptor = uRows[0].Colaborador || usuario;
    const emailReceptor = uRows[0].Email || null;
    let identificacionReceptor = usuario;
    try {
      const [segRows] = await conn.execute(
        'SELECT `Identificación` FROM `Maestro_Segmentación` WHERE TRIM(Trabajador) = TRIM(?) LIMIT 1',
        [colaboradorReceptor]
      );
      if (segRows.length && segRows[0].Identificación) {
        identificacionReceptor = segRows[0].Identificación;
      } else if (colaboradorReceptor.includes('**')) {
        identificacionReceptor = colaboradorReceptor.split('**')[0].trim();
      }
    } catch (errSeg) {
      console.warn('[inventario] Error consultando identificación en Maestro_Segmentación:', errSeg.message);
    }

    // Manejo de firma
    let signatureUrl = null;
    let signatureBase64 = null;

    if (firmaBase64 && firmaBase64.startsWith('data:image')) {
      signatureUrl = await subirFirma(identificacionReceptor, firmaBase64);
      signatureBase64 = firmaBase64;
    } else if (useRecentSignature) {
      signatureUrl = await obtenerUrlFirmaReciente(identificacionReceptor);
      signatureBase64 = await obtenerFirmaBase64Reciente(identificacionReceptor);
    }

    if (!signatureUrl || !signatureBase64) {
      return res.status(400).json({ error: 'Se requiere la firma digital del responsable que recibe.' });
    }

    await conn.beginTransaction();

    // 1. Obtener pedido pendiente y bloquear fila
    const [[order]] = await conn.execute(
      'SELECT * FROM Kardex_Pendiente WHERE (Id = ? OR IdKardexOriginal = ?) LIMIT 1 FOR UPDATE',
      [idPedido, idPedido]
    );

    if (!order) {
      throw new Error(`El pedido de transferencia ${idPedido} no existe.`);
    }
    if (order.Procesado) {
      throw new Error(`El pedido ${idPedido} ya fue recibido previamente.`);
    }

    // 2. Obtener los ítems transferidos
    const [items] = await conn.execute(
      `SELECT k.*, a.Articulo, a.Imagen, a.Categoria AS CategoriaArticulo, a.Talla, a.Referencia
       FROM Dynamic_Kardex k
       LEFT JOIN Dynamic_Articulos a ON a.Id = k.IdArticulo
       WHERE (k.Kpendiente = ? OR (k.IdKardex = ? AND k.TipoMovimiento = 'TRANSFERENCIA'))
         AND k.Cantidad < 0
       FOR UPDATE`,
      [order.Id, order.IdKardexOriginal || order.Id]
    );

    if (!items.length) {
      throw new Error(`No se encontraron artículos vinculados al pedido ${idPedido}.`);
    }

    const operacionDestino = order.OperacionDestino || items[0].OperaciónDestino;
    if (!acceso.sinFiltro && !acceso.operacionesFiltro.includes(operacionDestino)) {
      throw new Error(`No estás autorizado para recibir en la operación destino: ${operacionDestino}`);
    }

    // Regional de destino
    const [[destOp]] = await conn.execute(
      'SELECT DISTINCT REGIONAL FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
      [operacionDestino]
    );
    const destRegional = destOp?.REGIONAL || order.Regional || items[0].Regional;

    // Regional de origen (para devoluciones por faltantes)
    let origRegional = order.Regional || items[0].Regional;
    if (order.OperacionOrigen) {
      const [[origOp]] = await conn.execute(
        'SELECT DISTINCT REGIONAL FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
        [order.OperacionOrigen]
      );
      if (origOp?.REGIONAL) origRegional = origOp.REGIONAL;
    }

    // 3. Procesar cada ítem: entrada a destino y devolución automática a origen si hay diferencia
    const itemsParaActa = [];

    for (const item of items) {
      const novedadItem = (novedadesItems && novedadesItems[item.IdKardex]) 
        ? String(novedadesItems[item.IdKardex]).trim() 
        : (item.Novedad || '');

      if (novedadItem) {
        await conn.execute(
          'UPDATE Dynamic_Kardex SET Novedad = ? WHERE IdKardex = ?',
          [novedadItem, item.IdKardex]
        );
      }

      const cantDespachada = Math.abs(item.Cantidad);
      let cantRecibida = cantDespachada;
      if (cantidadesRecibidas && cantidadesRecibidas[item.IdKardex] !== undefined) {
        const parsed = parseInt(cantidadesRecibidas[item.IdKardex]);
        if (!isNaN(parsed) && parsed >= 0) {
          cantRecibida = Math.min(cantDespachada, parsed);
        }
      }
      const cantDevuelta = cantDespachada - cantRecibida;

      // Inserción en Destino (solo si cantRecibida > 0)
      if (cantRecibida > 0) {
        const newIdKardex = randomUUID().replace(/-/g, '').toLowerCase();
        const obsItem = novedadItem ? `RECEPCION TRANSFERENCIA - NOVEDAD: ${novedadItem}` : 'GENERADO POR EL SISTEMA - RECEPCION TRANSFERENCIA';
        const usrAsignado = item.UsuarioAsignado ? String(item.UsuarioAsignado).trim() : null;

        await conn.execute(
          `INSERT INTO Dynamic_Kardex
           (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
            \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
            Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro, Kpendiente, Novedad)
           VALUES (?, NOW(), 'ENTRADA', ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, NOW(), ?, ?)`,
          [
            newIdKardex,
            destRegional,
            operacionDestino,
            item.Categoria || item.CategoriaArticulo || 'General',
            item.IdArticulo,
            cantRecibida,
            usrAsignado,
            item.ValorUnitario || 0,
            usuario,
            obsItem,
            order.Id,
            novedadItem || null
          ]
        );
      }

      // Devolución automática al origen si hubo faltante (cantDevuelta > 0)
      if (cantDevuelta > 0) {
        const idKardexDev = randomUUID().replace(/-/g, '').toLowerCase();
        const obsDev = `DEVOLUCION AUTOMATICA POR NOVEDAD EN TRANSFERENCIA ${order.Id}${novedadItem ? ': ' + novedadItem : ''}`;
        const novedadDev = novedadItem ? `Devolución por novedad: ${novedadItem}` : `Devolución automática por faltante (${cantDevuelta} unds)`;

        await conn.execute(
          `INSERT INTO Dynamic_Kardex
           (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
            \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
            Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro, Kpendiente, Novedad)
           VALUES (?, NOW(), 'TRANSFERENCIA', ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, ?, ?, NOW(), ?, ?)`,
          [
            idKardexDev,
            origRegional,
            order.OperacionOrigen,
            item.Categoria || item.CategoriaArticulo || 'General',
            item.IdArticulo,
            cantDevuelta, // Entrada positiva al origen
            item.ValorUnitario || 0,
            usuario,
            obsDev,
            order.Id,
            novedadDev
          ]
        );
      }

      itemsParaActa.push({
        ...item,
        CantidadDespachada: cantDespachada,
        CantidadRecibida: cantRecibida,
        CantidadDevuelta: cantDevuelta,
        Novedad: novedadItem
      });
    }

    // 4. Actualizar Kardex_Pendiente
    await conn.execute(
      `UPDATE Kardex_Pendiente
       SET Estado = 'RECIBIDO',
           Procesado = 1,
           UsuarioRecibe = ?,
           FechaRecibido = NOW(),
           NovedadGeneral = ?,
           Firma_Url = ?
       WHERE Id = ?`,
      [
        usuario,
        observacionesGenerales || null,
        signatureUrl,
        order.Id
      ]
    );

    // 5. Generar PDF "Acta de Ingreso y verificación de inventario" y subir a Storage
    const orderParaActa = {
      ...order,
      OperacionDestino: operacionDestino,
      Regional: destRegional
    };

    const { pdfUrl } = await generarYGuardarActaRecepcionTransferencia({
      order: orderParaActa,
      items: itemsParaActa,
      usuarioReceptor: usuario,
      colaboradorReceptor,
      identificacionReceptor,
      signatureBase64,
      observacionesGenerales
    });

    // Guardar Url_Acta en Kardex_Pendiente
    await conn.execute(
      'UPDATE Kardex_Pendiente SET Url_Acta = ? WHERE Id = ?',
      [pdfUrl, order.Id]
    );

    // 6. Generar Actas de Entrega de Dotación para los ítems seleccionados con UsuarioAsignado
    const actasCreadas = [];
    const actasIdsSet = new Set(Array.isArray(actasIdsKardex) ? actasIdsKardex.map(String) : []);

    if (actasIdsSet.size > 0) {
      // Filtrar ítems recibidos con cantidad > 0, que tengan UsuarioAsignado y estén seleccionados
      const itemsSeleccionadosActa = itemsParaActa.filter(it =>
        actasIdsSet.has(String(it.IdKardex)) &&
        it.UsuarioAsignado &&
        String(it.UsuarioAsignado).trim() !== '' &&
        it.CantidadRecibida > 0
      );

      // Agrupar por UsuarioAsignado (identificación) y Categoria
      const gruposPorTrabajador = new Map();
      for (const it of itemsSeleccionadosActa) {
        const workerId = String(it.UsuarioAsignado).trim();
        const cat = it.Categoria || it.CategoriaArticulo || 'DOTACIÓN';
        const key = `${workerId}|${cat}`;
        if (!gruposPorTrabajador.has(key)) {
          gruposPorTrabajador.set(key, {
            workerId,
            categoria: cat,
            items: []
          });
        }
        gruposPorTrabajador.get(key).items.push({
          IdArticulo: it.IdArticulo,
          Cantidad: it.CantidadRecibida,
          Nota: it.Novedad || ''
        });
      }

      // Crear cada acta en Dynamic_Actas y Dynamic_Actas_Items, y generar descuento en Kardex
      for (const [key, grupo] of gruposPorTrabajador.entries()) {
        const obsActa = observacionesGenerales
          ? observacionesGenerales
          : `Acta generada automáticamente desde recepción de transferencia ${order.Id}`;

        const [resActa] = await conn.execute(
          `INSERT INTO Dynamic_Actas
           (identificacion, IdSolicitud, operacion, Fecha_Entrega, Categoria, Observaciones, Usuario, Estado)
           VALUES (?, NULL, ?, NOW(), ?, ?, ?, 'Pendiente')`,
          [
            parseInt(grupo.workerId) || grupo.workerId,
            operacionDestino,
            grupo.categoria,
            obsActa,
            usuario
          ]
        );
        const idActa = resActa.insertId;

        for (const itemActa of grupo.items) {
          await conn.execute(
            'INSERT INTO Dynamic_Actas_Items (IdActa, IdArticulo, Cantidad, Nota, Usuario) VALUES (?, ?, ?, ?, ?)',
            [idActa, itemActa.IdArticulo, itemActa.Cantidad, itemActa.Nota, usuario]
          );
        }

        const [[actaRow]] = await conn.execute('SELECT * FROM Dynamic_Actas WHERE IdActa = ?', [idActa]);
        await registrarKardexActa({ conn, acta: actaRow, items: grupo.items });

        actasCreadas.push({
          idActa,
          identificacion: grupo.workerId,
          categoria: grupo.categoria
        });
      }
    }

    await conn.commit();

    // Notificar por correo y generar tokens a los colaboradores para firmar sus actas de entrega (en segundo plano)
    if (actasCreadas.length > 0) {
      (async () => {
        for (const actaInfo of actasCreadas) {
          try {
            // Vigencia y correo según Config_Parametros (inventario / Actas)
            const token = await generarToken('Dynamic_Actas', 'IdActa', actaInfo.idActa, 'token_firma', 'token_expira', await horasVigenciaEnlaceActas());
            const contacto = await obtenerContactoTrabajador(parseInt(actaInfo.identificacion) || actaInfo.identificacion);
            if (contacto && contacto.email && (await correoActasHabilitado())) {
              const url = `${req.protocol}://${req.get('host')}/doclogyser/acta_entrega/${actaInfo.idActa}?token=${encodeURIComponent(token)}`;
              const { datos } = await construirDatosPlantilla(actaInfo.idActa, {});
              await notificarActaFirma({
                email: contacto.email,
                nombreTrabajador: datos.nombre_trabajador,
                categoria: actaInfo.categoria,
                urlFirma: url
              });
            }
          } catch (actaErr) {
            console.error(`[inventario] Error en flujo post-creación de acta #${actaInfo.idActa}:`, actaErr.message);
          }
        }
      })();
    }

    res.json({
      success: true,
      message: `Transferencia recibida exitosamente.${actasCreadas.length > 0 ? ` Se generaron ${actasCreadas.length} acta(s) de entrega de dotación.` : ''}`,
      pdfUrl,
      actasGeneradas: actasCreadas.length
    });

    // Notificar al usuario que despachó que su transferencia ya fue recibida (en segundo plano)
    const categoriaRecibida = [...new Set(itemsParaActa.map(it => it.Categoria || it.CategoriaArticulo).filter(Boolean))].join(', ') || 'General';
    enviarCorreoTransferenciaRecibida({
      usuarioDespacha: order.UsuarioDespacha,
      emailReceptor,
      operacionOrigen: order.OperacionOrigen,
      operacionDestino,
      categoria: categoriaRecibida,
      colaboradorReceptor,
      pdfUrl,
    });
  } catch (err) {
    await conn.rollback();
    console.error('[inventario] POST /api/kardex-pendiente/recibir-orden error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// POST /api/kardex-pendiente/recibir-masivo - massive reception of multiple transfer orders
router.post('/api/kardex-pendiente/recibir-masivo', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      usuario,
      ids,
      cantidadesRecibidas,
      novedadesItems,
      observacionesGenerales,
      firmaBase64,
      useRecentSignature
    } = req.body;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Debe seleccionar al menos un pedido para recibir' });
    }

    const acceso = await computarAccesoInventario(usuario, 'pendienteRecibir') || await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    // Consultar información del receptor (Maestro_Usuarios y Maestro_Segmentación)
    const [uRows] = await conn.execute(
      'SELECT Colaborador, Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
      [usuario]
    );
    if (!uRows.length) return res.status(404).json({ error: 'Usuario receptor no encontrado' });

    const colaboradorReceptor = uRows[0].Colaborador || usuario;
    let identificacionReceptor = usuario;
    try {
      const [segRows] = await conn.execute(
        'SELECT `Identificación` FROM `Maestro_Segmentación` WHERE TRIM(Trabajador) = TRIM(?) LIMIT 1',
        [colaboradorReceptor]
      );
      if (segRows.length && segRows[0].Identificación) {
        identificacionReceptor = segRows[0].Identificación;
      } else if (colaboradorReceptor.includes('**')) {
        identificacionReceptor = colaboradorReceptor.split('**')[0].trim();
      }
    } catch (errSeg) {
      console.warn('[inventario] Error consultando identificación en Maestro_Segmentación:', errSeg.message);
    }

    // Manejo de firma
    let signatureUrl = null;
    let signatureBase64 = null;

    if (firmaBase64 && firmaBase64.startsWith('data:image')) {
      signatureUrl = await subirFirma(identificacionReceptor, firmaBase64);
      signatureBase64 = firmaBase64;
    } else if (useRecentSignature) {
      signatureUrl = await obtenerUrlFirmaReciente(identificacionReceptor);
      signatureBase64 = await obtenerFirmaBase64Reciente(identificacionReceptor);
    }

    if (!signatureUrl || !signatureBase64) {
      return res.status(400).json({ error: 'Se requiere la firma digital del responsable que recibe.' });
    }

    await conn.beginTransaction();

    const pdfUrlsGeneradas = [];

    for (const idPedido of ids) {
      const [[order]] = await conn.execute(
        'SELECT * FROM Kardex_Pendiente WHERE (Id = ? OR IdKardexOriginal = ?) LIMIT 1 FOR UPDATE',
        [idPedido, idPedido]
      );

      if (!order || order.Procesado) continue;

      const [items] = await conn.execute(
        `SELECT k.*, a.Articulo, a.Imagen, a.Categoria AS CategoriaArticulo, a.Talla, a.Referencia
         FROM Dynamic_Kardex k
         LEFT JOIN Dynamic_Articulos a ON a.Id = k.IdArticulo
         WHERE (k.Kpendiente = ? OR (k.IdKardex = ? AND k.TipoMovimiento = 'TRANSFERENCIA'))
           AND k.Cantidad < 0
         FOR UPDATE`,
        [order.Id, order.IdKardexOriginal || order.Id]
      );

      if (!items.length) continue;

      const operacionDestino = order.OperacionDestino || items[0].OperaciónDestino;
      if (!acceso.sinFiltro && !acceso.operacionesFiltro.includes(operacionDestino)) {
        continue;
      }

      const [[destOp]] = await conn.execute(
        'SELECT DISTINCT REGIONAL FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
        [operacionDestino]
      );
      const destRegional = destOp?.REGIONAL || order.Regional || items[0].Regional;

      // Regional de origen (para devoluciones)
      let origRegional = order.Regional || items[0].Regional;
      if (order.OperacionOrigen) {
        const [[origOp]] = await conn.execute(
          'SELECT DISTINCT REGIONAL FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
          [order.OperacionOrigen]
        );
        if (origOp?.REGIONAL) origRegional = origOp.REGIONAL;
      }

      const itemsParaActa = [];

      for (const item of items) {
        const novedadItem = (novedadesItems && novedadesItems[item.IdKardex]) 
          ? String(novedadesItems[item.IdKardex]).trim() 
          : (item.Novedad || '');

        if (novedadItem) {
          await conn.execute(
            'UPDATE Dynamic_Kardex SET Novedad = ? WHERE IdKardex = ?',
            [novedadItem, item.IdKardex]
          );
        }

        const cantDespachada = Math.abs(item.Cantidad);
        let cantRecibida = cantDespachada;
        if (cantidadesRecibidas && cantidadesRecibidas[item.IdKardex] !== undefined) {
          const parsed = parseInt(cantidadesRecibidas[item.IdKardex]);
          if (!isNaN(parsed) && parsed >= 0) {
            cantRecibida = Math.min(cantDespachada, parsed);
          }
        }
        const cantDevuelta = cantDespachada - cantRecibida;

        // Inserción en Destino (si cantRecibida > 0)
        if (cantRecibida > 0) {
          const newIdKardex = randomUUID().replace(/-/g, '').toLowerCase();
          const obsItem = novedadItem ? `RECEPCION TRANSFERENCIA - NOVEDAD: ${novedadItem}` : 'GENERADO POR EL SISTEMA - RECEPCION TRANSFERENCIA';
          const usrAsignado = item.UsuarioAsignado ? String(item.UsuarioAsignado).trim() : null;

          await conn.execute(
            `INSERT INTO Dynamic_Kardex
             (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
              \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
              Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro, Kpendiente, Novedad)
             VALUES (?, NOW(), 'ENTRADA', ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, NOW(), ?, ?)`,
            [
              newIdKardex,
              destRegional,
              operacionDestino,
              item.Categoria || item.CategoriaArticulo || 'General',
              item.IdArticulo,
              cantRecibida,
              usrAsignado,
              item.ValorUnitario || 0,
              usuario,
              obsItem,
              order.Id,
              novedadItem || null
            ]
          );
        }

        // Devolución automática al origen si hubo faltante (cantDevuelta > 0)
        if (cantDevuelta > 0) {
          const idKardexDev = randomUUID().replace(/-/g, '').toLowerCase();
          const obsDev = `DEVOLUCION AUTOMATICA POR NOVEDAD EN TRANSFERENCIA ${order.Id}${novedadItem ? ': ' + novedadItem : ''}`;
          const novedadDev = novedadItem ? `Devolución por novedad: ${novedadItem}` : `Devolución automática por faltante (${cantDevuelta} unds)`;

          await conn.execute(
            `INSERT INTO Dynamic_Kardex
             (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
              \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
              Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro, Kpendiente, Novedad)
             VALUES (?, NOW(), 'TRANSFERENCIA', ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, ?, ?, NOW(), ?, ?)`,
            [
              idKardexDev,
              origRegional,
              order.OperacionOrigen,
              item.Categoria || item.CategoriaArticulo || 'General',
              item.IdArticulo,
              cantDevuelta,
              item.ValorUnitario || 0,
              usuario,
              obsDev,
              order.Id,
              novedadDev
            ]
          );
        }

        itemsParaActa.push({
          ...item,
          CantidadDespachada: cantDespachada,
          CantidadRecibida: cantRecibida,
          CantidadDevuelta: cantDevuelta,
          Novedad: novedadItem
        });
      }

      await conn.execute(
        `UPDATE Kardex_Pendiente
         SET Estado = 'RECIBIDO',
             Procesado = 1,
             UsuarioRecibe = ?,
             FechaRecibido = NOW(),
             NovedadGeneral = ?,
             Firma_Url = ?
         WHERE Id = ?`,
        [
          usuario,
          observacionesGenerales || null,
          signatureUrl,
          order.Id
        ]
      );

      const orderParaActa = {
        ...order,
        OperacionDestino: operacionDestino,
        Regional: destRegional
      };

      const { pdfUrl } = await generarYGuardarActaRecepcionTransferencia({
        order: orderParaActa,
        items: itemsParaActa,
        usuarioReceptor: usuario,
        colaboradorReceptor,
        identificacionReceptor,
        signatureBase64,
        observacionesGenerales
      });

      await conn.execute(
        'UPDATE Kardex_Pendiente SET Url_Acta = ? WHERE Id = ?',
        [pdfUrl, order.Id]
      );

      const categoriaRecibida = [...new Set(itemsParaActa.map(it => it.Categoria || it.CategoriaArticulo).filter(Boolean))].join(', ') || 'General';
      pdfUrlsGeneradas.push({
        idPedido: order.Id,
        pdfUrl,
        operacionOrigen: order.OperacionOrigen,
        operacionDestino,
        categoria: categoriaRecibida,
        usuarioDespacha: order.UsuarioDespacha
      });
    }

    await conn.commit();
    res.json({
      success: true,
      message: `${pdfUrlsGeneradas.length} pedidos de transferencia recibidos exitosamente y Actas generadas.`,
      actas: pdfUrlsGeneradas
    });

    // Notificar a cada usuario que despachó que su transferencia ya fue recibida (en segundo plano)
    for (const t of pdfUrlsGeneradas) {
      enviarCorreoTransferenciaRecibida({
        usuarioDespacha: t.usuarioDespacha,
        emailReceptor: uRows[0].Email || null,
        operacionOrigen: t.operacionOrigen,
        operacionDestino: t.operacionDestino,
        categoria: t.categoria,
        colaboradorReceptor,
        pdfUrl: t.pdfUrl,
      });
    }
  } catch (err) {
    await conn.rollback();
    console.error('[inventario] POST /api/kardex-pendiente/recibir-masivo error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/kardex-pendiente/historial - received transfers history
router.get('/api/kardex-pendiente/historial', async (req, res) => {
  try {
    const { usuario, regional, operacion, fechaInicio, fechaFin, search } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'pendienteRecibir') || await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const conds = ['kp.Procesado = 1'];
    const params = [];

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json({ results: [] });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      conds.push(`(kp.OperacionDestino IN (${ph}) OR (kp.OperacionDestino IS NULL AND k.\`OperaciónDestino\` IN (${ph})))`);
      params.push(...acceso.operacionesFiltro, ...acceso.operacionesFiltro);
    }

    if (acceso.filtroCategorias) {
      const ph = acceso.filtroCategorias.map(() => '?').join(',');
      conds.push(`(k.Categoria IN (${ph}) OR k.Categoria IS NULL)`);
      params.push(...acceso.filtroCategorias);
    }

    if (regional) {
      conds.push('kp.Regional = ?');
      params.push(regional);
    }

    if (operacion) {
      conds.push('kp.OperacionDestino = ?');
      params.push(operacion);
    }

    if (fechaInicio) {
      conds.push('DATE(kp.FechaRecibido) >= ?');
      params.push(fechaInicio);
    }

    if (fechaFin) {
      conds.push('DATE(kp.FechaRecibido) <= ?');
      params.push(fechaFin);
    }

    const query = `
      SELECT 
        kp.Id AS IdPedido,
        kp.IdKardexOriginal,
        kp.Procesado,
        kp.OperacionOrigen,
        kp.OperacionDestino,
        kp.Regional,
        kp.FechaDespacho,
        kp.UsuarioDespacha,
        kp.UsuarioRecibe,
        kp.FechaRecibido,
        kp.Estado,
        kp.Observaciones AS ObservacionesPedido,
        kp.NovedadGeneral,
        kp.Url_Acta,
        kp.Firma_Url,
        k.IdKardex,
        k.IdArticulo,
        k.TipoMovimiento,
        k.Regional AS RegionalKardex,
        k.\`Operación\` AS OpKardex,
        k.Cantidad,
        k.ValorUnitario,
        k.UsuarioRegistro,
        k.Observaciones AS ObservacionesItem,
        k.Novedad AS NovedadItem,
        a.Articulo,
        a.Imagen,
        a.Categoria,
        a.Talla,
        a.Referencia
      FROM Kardex_Pendiente kp
      LEFT JOIN Dynamic_Kardex k ON (k.Kpendiente = kp.Id OR (kp.IdKardexOriginal IS NOT NULL AND k.IdKardex = kp.IdKardexOriginal))
      LEFT JOIN Dynamic_Articulos a ON a.Id = k.IdArticulo
      WHERE ${conds.join(' AND ')}
      ORDER BY kp.FechaRecibido DESC, kp.FechaDespacho DESC
    `;

    const [rows] = await pool.execute(query, params);

    const ordersMap = new Map();

    for (const row of rows) {
      const orderId = row.IdPedido || row.IdKardexOriginal;
      if (!ordersMap.has(orderId)) {
        ordersMap.set(orderId, {
          Id: orderId,
          IdKardexOriginal: row.IdKardexOriginal,
          Procesado: row.Procesado,
          OperacionOrigen: row.OperacionOrigen || '—',
          OperacionDestino: row.OperacionDestino || '—',
          Regional: row.Regional || row.RegionalKardex || '—',
          FechaDespacho: row.FechaDespacho,
          FechaRecibido: row.FechaRecibido,
          UsuarioDespacha: row.UsuarioDespacha || '—',
          UsuarioRecibe: row.UsuarioRecibe || '—',
          Estado: row.Estado || 'RECIBIDO',
          Observaciones: row.ObservacionesPedido || '',
          NovedadGeneral: row.NovedadGeneral || '',
          Url_Acta: row.Url_Acta || null,
          Firma_Url: row.Firma_Url || null,
          itemsDespachados: [],
          itemsRecibidos: [],
          itemsDevueltos: []
        });
      }

      const ord = ordersMap.get(orderId);
      if (row.IdKardex || row.IdArticulo) {
        const itemObj = {
          IdKardex: row.IdKardex,
          IdArticulo: row.IdArticulo,
          Articulo: row.Articulo || 'Artículo sin nombre',
          Imagen: row.Imagen || null,
          Categoria: row.Categoria || 'General',
          Talla: row.Talla || '—',
          Referencia: row.Referencia || '—',
          Cantidad: Number(row.Cantidad) || 0,
          TipoMovimiento: row.TipoMovimiento,
          Operacion: row.OpKardex,
          Observaciones: row.ObservacionesItem || '',
          Novedad: row.NovedadItem || ''
        };

        if (row.Cantidad < 0) {
          ord.itemsDespachados.push(itemObj);
        } else if (row.TipoMovimiento === 'ENTRADA') {
          ord.itemsRecibidos.push(itemObj);
        } else if (row.TipoMovimiento === 'TRANSFERENCIA' && row.OpKardex === ord.OperacionOrigen) {
          ord.itemsDevueltos.push(itemObj);
        }
      }
    }

    let results = Array.from(ordersMap.values()).map(order => {
      const totalEnviadas = order.itemsDespachados.reduce((s, it) => s + Math.abs(it.Cantidad), 0);
      const totalRecibidas = order.itemsRecibidos.reduce((s, it) => s + Math.abs(it.Cantidad), 0);
      const totalDevueltas = order.itemsDevueltos.reduce((s, it) => s + Math.abs(it.Cantidad), 0);
      const totalArticulos = order.itemsDespachados.length || order.itemsRecibidos.length;

      return {
        ...order,
        totalArticulos,
        totalEnviadas,
        totalRecibidas,
        totalDevueltas
      };
    });

    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      results = results.filter(o => 
        (o.Id || '').toLowerCase().includes(s) ||
        (o.OperacionOrigen || '').toLowerCase().includes(s) ||
        (o.OperacionDestino || '').toLowerCase().includes(s) ||
        (o.UsuarioRecibe || '').toLowerCase().includes(s) ||
        (o.UsuarioDespacha || '').toLowerCase().includes(s) ||
        (o.Observaciones || '').toLowerCase().includes(s) ||
        (o.NovedadGeneral || '').toLowerCase().includes(s) ||
        o.itemsDespachados.some(it => (it.Articulo || '').toLowerCase().includes(s)) ||
        o.itemsRecibidos.some(it => (it.Articulo || '').toLowerCase().includes(s))
      );
    }

    res.json({ results, total: results.length });
  } catch (err) {
    console.error('[inventario] GET /api/kardex-pendiente/historial error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventario/ajustar - Manual inventory adjustment (saves AJUSTE to Kardex)
router.post('/api/inventario/ajustar', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { usuario, idArticulo, regional, operacion, nuevaCantidad, cantidadActual } = req.body;
    if (!usuario || !idArticulo || !operacion || nuevaCantidad === undefined || cantidadActual === undefined) {
      return res.status(400).json({ error: 'Campos requeridos incompletos.' });
    }

    const acceso = await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado.' });
    }

    // Rol con permiso ("Roles que pueden ajustar stock", Config_Parametros inventario / Inventario).
    // Las operaciones que puede ajustar las define Maestro_Menu (alcance del rol).
    const cfgAjuste = await obtenerConfigPestanaInventario(acceso.rol);
    if (!cfgAjuste.puedeAjustarStock) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para ajustar stock.' });
    }
    if (!acceso.sinFiltro && !acceso.operacionesFiltro.includes(operacion)) {
      return res.status(403).json({ error: 'No tiene acceso a la operación seleccionada.' });
    }

    const parsedNueva = parseInt(nuevaCantidad);
    const parsedActual = parseInt(cantidadActual);
    if (isNaN(parsedNueva) || isNaN(parsedActual)) {
      return res.status(400).json({ error: 'Cantidades inválidas.' });
    }

    const diff = parsedNueva - parsedActual;
    if (diff === 0) {
      return res.status(400).json({ error: 'La nueva cantidad es igual a la actual.' });
    }

    // 1. Fetch Costo and Categoria from Dynamic_Articulos
    const [[articulo]] = await conn.execute(
      'SELECT Costo, Categoria FROM Dynamic_Articulos WHERE Id = ? LIMIT 1',
      [idArticulo]
    );
    if (!articulo) {
      return res.status(404).json({ error: 'Artículo no encontrado en la base de datos.' });
    }

    const costo = articulo.Costo ? parseFloat(articulo.Costo) : 0;
    const categoria = articulo.Categoria || 'General';

    // 2. Insert AJUSTE movement into Dynamic_Kardex
    const idKardex = randomUUID().replace(/-/g, '').toLowerCase();
    
    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO Dynamic_Kardex
       (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
        \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
        Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro)
       VALUES (?, NOW(), 'AJUSTE', ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, ?, '-Ajuste manual-', NOW())`,
      [
        idKardex,
        regional || null,
        operacion,
        categoria,
        idArticulo,
        diff,
        costo,
        usuario
      ]
    );

    await conn.commit();
    res.json({ success: true, message: 'Ajuste guardado exitosamente.' });
  } catch (err) {
    await conn.rollback();
    console.error('[inventario] POST /api/inventario/ajustar error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ── Endpoints de Reportes / Dashboard de Inventario ──

// GET /api/reportes/resumen-operaciones
router.get('/api/reportes/resumen-operaciones', async (req, res) => {
  try {
    const { usuario, regional, operacion, categoria } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const securityConds = [];
    const securityParams = [];

    // Restricción por categorías si aplica (Acceso 4, 5, 6)
    if (acceso.filtroCategorias) {
      const ph = acceso.filtroCategorias.map(() => '?').join(',');
      securityConds.push(`\`Categoria\` IN (${ph})`);
      securityParams.push(...acceso.filtroCategorias);
    }

    // Restricción por rol de operaciones
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro || !acceso.operacionesFiltro.length) {
        return res.json({
          kpis: { totalStock: 0, totalValor: 0, totalOperaciones: 0, totalArticulos: 0, topOperacion: null },
          porOperacion: [],
          porCategoria: [],
          porRegional: [],
          topArticulos: []
        });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      securityConds.push(`\`Operacion\` IN (${ph})`);
      securityParams.push(...acceso.operacionesFiltro);
    }

    // Filtros dinámicos recibidos por query
    if (regional && regional.trim() !== '') {
      securityConds.push('`Regional` = ?');
      securityParams.push(regional.trim());
    }
    if (operacion && operacion.trim() !== '') {
      securityConds.push('`Operacion` = ?');
      securityParams.push(operacion.trim());
    }
    if (categoria && categoria.trim() !== '' && categoria.trim().toUpperCase() !== 'TODAS') {
      securityConds.push('`Categoria` = ?');
      securityParams.push(categoria.trim());
    }

    const whereClause = securityConds.length ? `WHERE ${securityConds.join(' AND ')}` : '';

    // OPTIMIZACIÓN: antes esto eran 5 consultas separadas contra Vista_Inventario (KPIs, por
    // Operación, por Categoría, por Regional, Top 10), cada una recalculando desde cero la
    // agregación completa de la vista (ver nota en GET /api/datos). Con una sola consulta y los
    // 5 desgloses calculados en memoria se obtiene exactamente el mismo resultado.
    const [rows] = await pool.execute(`
      SELECT
        \`Regional\`, \`Operacion\`, \`IdArticulo\`, \`Articulo\`, \`Referencia\`, \`Categoria\`,
        IFNULL(\`Stock Disponible\`, 0) AS StockDisponible,
        IFNULL(\`Valor Stock\`, 0) AS ValorStock
      FROM Vista_Inventario
      ${whereClause}
    `, securityParams);

    const operacionesSet = new Set();
    const articulosSet = new Set();
    let totalStock = 0;
    let totalValor = 0;

    const opMap = new Map();
    const catMap = new Map();
    const regMap = new Map();
    const artMap = new Map();

    rows.forEach((r) => {
      const stock = Number(r.StockDisponible || 0);
      const valor = Number(r.ValorStock || 0);
      const regionalKey = r.Regional || 'SIN REGIONAL';
      const categoriaKey = r.Categoria || 'OTRO';

      operacionesSet.add(r.Operacion);
      articulosSet.add(r.IdArticulo);
      totalStock += stock;
      totalValor += valor;

      const opKey = `${regionalKey}|||${r.Operacion}`;
      if (!opMap.has(opKey)) opMap.set(opKey, { Regional: regionalKey, Operacion: r.Operacion, articulos: new Set(), totalStock: 0, totalValor: 0 });
      const op = opMap.get(opKey);
      op.articulos.add(r.IdArticulo);
      op.totalStock += stock;
      op.totalValor += valor;

      if (!catMap.has(categoriaKey)) catMap.set(categoriaKey, { Categoria: categoriaKey, articulos: new Set(), totalStock: 0, totalValor: 0 });
      const cat = catMap.get(categoriaKey);
      cat.articulos.add(r.IdArticulo);
      cat.totalStock += stock;
      cat.totalValor += valor;

      if (!regMap.has(regionalKey)) regMap.set(regionalKey, { Regional: regionalKey, operaciones: new Set(), totalStock: 0, totalValor: 0 });
      const reg = regMap.get(regionalKey);
      reg.operaciones.add(r.Operacion);
      reg.totalStock += stock;
      reg.totalValor += valor;

      const artKey = `${r.IdArticulo}|||${r.Articulo}|||${r.Referencia}|||${r.Categoria}`;
      if (!artMap.has(artKey)) artMap.set(artKey, { IdArticulo: r.IdArticulo, Articulo: r.Articulo, Referencia: r.Referencia, Categoria: r.Categoria, totalStock: 0, totalValor: 0 });
      const art = artMap.get(artKey);
      art.totalStock += stock;
      art.totalValor += valor;
    });

    const porOperacion = Array.from(opMap.values())
      .map((e) => ({ Regional: e.Regional, Operacion: e.Operacion, articulosCount: e.articulos.size, totalStock: e.totalStock, totalValor: e.totalValor }))
      .sort((a, b) => b.totalStock - a.totalStock);
    const porCategoria = Array.from(catMap.values())
      .map((e) => ({ Categoria: e.Categoria, articulosCount: e.articulos.size, totalStock: e.totalStock, totalValor: e.totalValor }))
      .sort((a, b) => b.totalStock - a.totalStock);
    const porRegional = Array.from(regMap.values())
      .map((e) => ({ Regional: e.Regional, totalOperaciones: e.operaciones.size, totalStock: e.totalStock, totalValor: e.totalValor }))
      .sort((a, b) => b.totalStock - a.totalStock);
    const topArticulos = Array.from(artMap.values())
      .sort((a, b) => b.totalStock - a.totalStock)
      .slice(0, 10);

    const topOp = porOperacion.length ? porOperacion[0] : null;

    res.json({
      kpis: {
        totalOperaciones: operacionesSet.size,
        totalArticulos: articulosSet.size,
        totalStock,
        totalValor,
        topOperacion: topOp ? {
          Operacion: topOp.Operacion,
          Regional: topOp.Regional,
          totalStock: topOp.totalStock,
          totalValor: topOp.totalValor
        } : null
      },
      porOperacion,
      porCategoria,
      porRegional,
      topArticulos
    });

  } catch (err) {
    console.error('[inventario] Error en /api/reportes/resumen-operaciones:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reportes/detalle-operacion
router.get('/api/reportes/detalle-operacion', async (req, res) => {
  try {
    const { usuario, operacion, categoria } = req.query;
    if (!usuario || !operacion) {
      return res.status(400).json({ error: 'usuario y operacion son requeridos' });
    }

    const acceso = await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const securityConds = ['`Operacion` = ?'];
    const securityParams = [operacion.trim()];

    // Restricción por categorías si aplica
    if (acceso.filtroCategorias) {
      const ph = acceso.filtroCategorias.map(() => '?').join(',');
      securityConds.push(`\`Categoria\` IN (${ph})`);
      securityParams.push(...acceso.filtroCategorias);
    }

    // Restricción por rol de operaciones
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.includes(operacion.trim())) {
        return res.status(403).json({ error: 'No tienes permisos para ver esta operación' });
      }
    }

    if (categoria && categoria.trim() !== '' && categoria.trim().toUpperCase() !== 'TODAS') {
      securityConds.push('`Categoria` = ?');
      securityParams.push(categoria.trim());
    }

    const [items] = await pool.execute(`
      SELECT 
        \`Regional\`,
        \`Operacion\`,
        \`IdArticulo\`,
        \`Articulo\`,
        \`Talla\`,
        \`Referencia\`,
        \`Clasificación\` AS Clasificacion,
        \`Categoria\`,
        IFNULL(\`Stock Disponible\`, 0) AS StockDisponible,
        IFNULL(\`Valor Stock\`, 0) AS ValorStock,
        \`Imagen\`,
        \`Placa\`
      FROM Vista_Inventario
      WHERE ${securityConds.join(' AND ')}
      ORDER BY Categoria, Articulo
    `, securityParams);

    res.json({
      operacion,
      totalArticulos: items.length,
      items: items.map(it => ({
        ...it,
        StockDisponible: Number(it.StockDisponible || 0),
        ValorStock: Number(it.ValorStock || 0)
      }))
    });

  } catch (err) {
    console.error('[inventario] Error en /api/reportes/detalle-operacion:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── SUBMÓDULO: PARÁMETROS DE INVENTARIO (Config_Parametros) ────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/parametros
// Lista los parámetros del módulo de Inventario y roles de Config_Rol
router.get('/api/parametros', async (req, res) => {
  try {
    const { usuario, seccion } = req.query;
    const acceso = await computarAccesoInventario(usuario, 'Parametros');
    if (!acceso) {
      return res.status(403).json({ error: 'No autorizado para consultar parámetros de Inventario.' });
    }

    const tienePermiso = (acceso.secciones && acceso.secciones.map(s => s.toLowerCase()).includes('parametros')) ||
      ['sistema', 'inventario'].includes((acceso.rol || '').trim().toLowerCase());
    if (!tienePermiso) {
      return res.status(403).json({ error: 'Solo los roles autorizados (Sistema, Inventario) pueden ver los parámetros.' });
    }

    let sql = `SELECT id, Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion 
               FROM Config_Parametros 
               WHERE Modulo = 'inventario'`;
    const params = [];
    if (seccion && seccion.trim() !== '') {
      sql += ' AND LOWER(Seccion) = LOWER(?)';
      params.push(seccion.trim());
    }
    sql += ' ORDER BY Seccion ASC, Concepto ASC';

    const [rows] = await pool.execute(sql, params);
    const [roles] = await pool.execute('SELECT DISTINCT Rol FROM Config_Rol ORDER BY Rol ASC');

    res.json({
      ok: true,
      parametros: rows,
      roles: roles.map(r => r.Rol).filter(Boolean)
    });
  } catch (err) {
    console.error('[inventario] GET /api/parametros:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/parametros/:id
// Modifica un parámetro individual de Inventario (valor y descripción)
router.put('/api/parametros/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, parametro, descripcion } = req.body;
    const acceso = await computarAccesoInventario(usuario, 'Parametros');
    if (!acceso) {
      return res.status(403).json({ error: 'No autorizado para modificar parámetros de Inventario.' });
    }

    const tienePermiso = (acceso.secciones && acceso.secciones.map(s => s.toLowerCase()).includes('parametros')) ||
      ['sistema', 'inventario'].includes((acceso.rol || '').trim().toLowerCase());
    if (!tienePermiso) {
      return res.status(403).json({ error: 'Solo los roles autorizados (Sistema, Inventario) pueden modificar los parámetros.' });
    }

    const [rows] = await pool.execute(
      'SELECT id, Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion FROM Config_Parametros WHERE id = ? AND Modulo = ?',
      [id, 'inventario']
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Parámetro no encontrado en Inventario.' });
    }

    const row = rows[0];
    let finalParam = String(parametro == null ? '' : parametro).trim();

    // Validaciones según condición
    const condicionNorm = (row.Condicion || '').trim().toLowerCase();
    if (condicionNorm === 'porcentaje') {
      if (!/^(100|[1-9]?\d)$/.test(finalParam)) {
        return res.status(400).json({ error: `"${row.Concepto}" debe ser un número entero entre 0 y 100.` });
      }
    } else if (condicionNorm === 'hora') {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(finalParam)) {
        return res.status(400).json({ error: `"${row.Concepto}" debe ser una hora válida en formato HH:mm (por ejemplo 12:00).` });
      }
    } else if (condicionNorm === 'filas') {
      if (!(/^\d+$/.test(finalParam) && Number(finalParam) >= 1 && Number(finalParam) <= 1000000)) {
        return res.status(400).json({ error: `"${row.Concepto}" debe ser un número entero entre 1 y 1.000.000.` });
      }
    } else if (condicionNorm === 'número' || condicionNorm === 'numero') {
      if (!/^\d+$/.test(finalParam) || Number(finalParam) < 0) {
        return res.status(400).json({ error: `"${row.Concepto}" debe ser un número entero positivo.` });
      }
    } else if (condicionNorm === 'booleano') {
      if (!['0', '1', 'true', 'false'].includes(finalParam.toLowerCase())) {
        finalParam = finalParam === '1' || finalParam.toLowerCase() === 'true' ? '1' : '0';
      } else {
        finalParam = ['1', 'true'].includes(finalParam.toLowerCase()) ? '1' : '0';
      }
    } else if (condicionNorm === 'rol') {
      const dbRoles = (row.Parametro || '').split(',').map(s => s.trim());
      const hasSistema = dbRoles.some(r => r.toLowerCase() === 'sistema');
      if (hasSistema) {
        const newRoles = finalParam.split(',').map(s => s.trim()).filter(Boolean);
        if (!newRoles.some(r => r.toLowerCase() === 'sistema')) {
          newRoles.unshift('Sistema');
        }
        finalParam = newRoles.join(', ');
      }
    }

    const nuevaDesc = descripcion !== undefined ? String(descripcion).trim() : row.Descripcion;
    if (nuevaDesc && nuevaDesc.length > 500) {
      return res.status(400).json({ error: 'La descripción admite como máximo 500 caracteres.' });
    }

    await pool.execute(
      'UPDATE Config_Parametros SET Parametro = ?, Descripcion = ? WHERE id = ? AND Modulo = ?',
      [finalParam, nuevaDesc, id, 'inventario']
    );

    console.log(`[inventario-parametros] Parámetro id=${id} ("${row.Concepto}" - ${row.Seccion}) actualizado por ${acceso.usuarioId}: "${finalParam}"`);
    res.json({ ok: true, mensaje: 'Parámetro actualizado exitosamente.' });
  } catch (err) {
    console.error('[inventario] PUT /api/parametros/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// SECCIÓN TICKETS DE INVENTARIO (Dynamic_Tickets, modulo = 'Inventario')
// Roles autorizados para consultar y resolver: Inventario, Sistema
// ══════════════════════════════════════════════════════════════════════════════

const ESTADOS_TICKET_INVENTARIO = ['En Proceso', 'Pendiente', 'Resuelto', 'Rechazado'];

// GET /api/tickets
router.get('/api/tickets', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoInventario(usuario, 'Tickets');
    if (!acceso) return res.status(403).json({ error: 'No autorizado para consultar tickets de Inventario.' });

    const tienePermiso = (acceso.secciones && acceso.secciones.map(s => s.toLowerCase()).includes('tickets')) ||
      ['sistema', 'inventario'].includes((acceso.rol || '').trim().toLowerCase());
    if (!tienePermiso) {
      return res.status(403).json({ error: 'Solo los roles autorizados (Sistema, Inventario) pueden ver los tickets.' });
    }

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

    const whereClauses = [`t.modulo = 'Inventario'`];
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

    // Búsqueda libre
    if (q && q.trim()) {
      const qLike = `%${q.trim()}%`;
      whereClauses.push(`(
        t.Ticket LIKE ?
        OR t.solicitante LIKE ?
        OR t.descripcion LIKE ?
        OR t.motivo LIKE ?
      )`);
      params.push(qLike, qLike, qLike, qLike);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sortMap = {
      estado: 't.Estado',
      ticket: 't.Ticket',
      operacion: 't.`Operación`',
      fecha_registro: 't.fecha_registro',
      motivo: 't.motivo',
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
    console.error('[inventario] GET /api/tickets:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/metricas
router.get('/api/tickets/metricas', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoInventario(usuario, 'Tickets');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const { regional, operacion, q, estado } = req.query;

    const commonWhere = [`t.modulo = 'Inventario'`];
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
      commonWhere.push(`(t.Ticket LIKE ? OR t.solicitante LIKE ? OR t.descripcion LIKE ? OR t.motivo LIKE ?)`);
      commonParams.push(qLike, qLike, qLike, qLike);
    }

    // 1. Conteo por Estado
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
    console.error('[inventario] GET /api/tickets/metricas:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tickets/:ticket/estado (Gestionar / Resolver Ticket de Inventario)
router.post('/api/tickets/:ticket/estado', async (req, res) => {
  try {
    const { usuario } = req.query;
    const { ticket } = req.params;
    const { estado, observaciones } = req.body;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const acceso = await computarAccesoInventario(usuario, 'Tickets');
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });

    const tienePermiso = (acceso.secciones && acceso.secciones.map(s => s.toLowerCase()).includes('tickets')) ||
      ['sistema', 'inventario'].includes((acceso.rol || '').trim().toLowerCase());
    if (!tienePermiso) {
      return res.status(403).json({ error: 'Solo los roles Inventario y Sistema pueden resolver tickets.' });
    }

    if (!ticket) return res.status(400).json({ error: 'ticket requerido' });
    if (!estado || !ESTADOS_TICKET_INVENTARIO.includes(estado)) {
      return res.status(400).json({ error: 'estado inválido' });
    }

    const [existRows] = await pool.execute(
      'SELECT `Operación` as operacion FROM Dynamic_Tickets WHERE Ticket = ? AND modulo = ? LIMIT 1',
      [ticket, 'Inventario']
    );
    if (!existRows.length) return res.status(404).json({ error: 'Ticket no encontrado en Inventario.' });

    const finaliza = (estado === 'Resuelto' || estado === 'Rechazado');
    const obsVal = (observaciones || '').trim() || null;

    await pool.execute(
      `UPDATE Dynamic_Tickets SET Estado = ?, Observaciones = ?, fecha_finalizacion = ${finaliza ? 'NOW()' : 'NULL'} WHERE Ticket = ? AND modulo = ?`,
      [estado, obsVal, ticket, 'Inventario']
    );

    console.log(`[inventario-tickets] Ticket ${ticket} actualizado a estado "${estado}" por ${acceso.usuarioId}`);
    res.json({ ok: true, ticket, estado, observaciones: obsVal });
  } catch (err) {
    console.error('[inventario] POST /api/tickets/:ticket/estado:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

