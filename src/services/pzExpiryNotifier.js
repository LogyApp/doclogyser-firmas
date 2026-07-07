// Notificador de expiración del Paz y Salvo
// Escenario 1: el trabajador no firmó dentro de las 120 h → genera PDF con FIRMA_NO_FIRMO para todos
// Escenario 2: el trabajador firmó pero no todas las áreas lo hicieron en 120 h → genera con lo disponible

const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const { obtenerPlantilla, reemplazarVariables } = require('./plantilla');
const { generarPDF } = require('./renderer');
const { subirPDFPazYSalvo } = require('./storage');
const { generarFilasArticulosHTML, generarFirmasAreasHtml, NOMBRES_AREA } = require('./pazYSalvoService');

// ── Constantes ─────────────────────────────────────────────────────────────
const FIRMA_NO_FIRMO = `<div style="border:1.5px solid #ccc;border-radius:4px;padding:8px 10px;color:#888;font-size:.78rem;display:inline-block;width:220px;text-align:center;line-height:1.4;margin-bottom:4px">Documento soportado por correo electrónico – No firmó dentro del plazo</div>`;

// ── Helpers ────────────────────────────────────────────────────────────────
function limpiarNombre(trabajador) {
  if (!trabajador) return '';
  const partes = String(trabajador).split(' ** ');
  return (partes.length > 1 ? partes[1] : trabajador).trim();
}

function formatFechaCO(fecha) {
  if (!fecha) return '';
  const str = fecha instanceof Date 
    ? `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
    : String(fecha).slice(0, 10);
  const d = new Date(str + 'T12:00:00');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function fechaHoraBogota() {
  const b = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${b.getFullYear()}-${p(b.getMonth() + 1)}-${p(b.getDate())} ${p(b.getHours())}:${p(b.getMinutes())}:${p(b.getSeconds())}`;
}

function toDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
  return String(val).slice(0, 10);
}

/** Devuelve el HTML de firma: imagen si existe, o el texto "no firmó" */
function buildFirmaHtmlExpiry(url) {
  return url
    ? `<img src="${url}" style="height:80px;display:block;margin-bottom:4px">`
    : FIRMA_NO_FIRMO;
}

async function registrarDocTrabajador({ regional, operacion, identificacion, fechaIngreso,
  tipoDocumento, prefijo, doc, usuario }) {
  const id    = uuidv4();
  const ahora = fechaHoraBogota();
  await pool.execute(
    `INSERT INTO Maestro_docTrabajador
     (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
      TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud,
      Justificacion_Solicitud, FechaRegistro, Usuario)
     VALUES (?, 'PEND', ?, ?, ?, 'Retirado', ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
    [id, regional || null, operacion || null, identificacion,
     toDateStr(fechaIngreso), tipoDocumento, prefijo, doc, ahora, usuario || 'sistema']
  );
}

// ── Generación del PDF final ───────────────────────────────────────────────
async function generarPZPDF(pz, areasRequeridas) {
  const nombrePlantilla = pz.nivel_compromiso === 'alto' ? 'paz_y_salvo_alto' : 'paz_y_salvo_bajo';
  const plantilla = await obtenerPlantilla(nombrePlantilla);
  const articulos = typeof pz.articulos === 'string' ? JSON.parse(pz.articulos) : (pz.articulos || []);
  const nombreTrabajador = limpiarNombre(pz.Trabajador);
  const hoy = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });

  const datosPlantilla = {
    fecha_expedicion:       hoy,
    nombre_trabajador:      nombreTrabajador.toUpperCase(),
    identificacion:         String(pz.identificacion),
    cargo:                  pz.Cargo || '',
    operacion:              pz['Operación'] || '',
    fecha_retiro:           formatFechaCO(pz['Fecha de Retiro']),
    filas_articulos:        generarFilasArticulosHTML(articulos),
    firma_trabajador_html:  buildFirmaHtmlExpiry(pz.firma_trabajador_url),
    firma_responsable_html: buildFirmaHtmlExpiry(pz.firma_responsable_url),
    nombre_firmante:        pz.firma_responsable_nombre || '',
    cargo_firmante:         pz.firma_responsable_cargo || '',
    observaciones:          pz.observaciones || '',
    firma_nomina_html:      buildFirmaHtmlExpiry(pz.firma_nomina_url),
    firma_nomina_nombre:    pz.firma_nomina_nombre || '',
    firma_nomina_cargo:     pz.firma_nomina_cargo || '',
  };

  if (pz.nivel_compromiso === 'alto') {
    datosPlantilla.firmas_areas_html = `<table style="width:100%;border-collapse:collapse">${generarFirmasAreasHtml(pz, areasRequeridas)}</table>`;
  }

  const htmlFinal = reemplazarVariables(plantilla.contenido_html, datosPlantilla);
  return generarPDF(htmlFinal);
}

// ── Procesamiento de un registro PZ vencido ───────────────────────────────
async function procesarPZVencido(pz, areasRequeridas) {
  const pdfBuffer = await generarPZPDF(pz, areasRequeridas);
  const urlPdf = await subirPDFPazYSalvo(pz.identificacion, pz.id_vinculacion, pdfBuffer);
  const ahora = new Date();

  await pool.execute(
    `UPDATE Maestro_pazysalvo SET estado = 'completado', url_pdf_final = ?, fecha_completado = ?
     WHERE id = ?`,
    [urlPdf, ahora, pz.id]
  );

  // Actualizar o insertar en Maestro_docTrabajador
  const [docRows] = await pool.execute(
    `SELECT id FROM Maestro_docTrabajador
     WHERE Identificación = ? AND Prefijo = 'PZ' ORDER BY FechaRegistro DESC LIMIT 1`,
    [String(pz.identificacion)]
  );
  if (docRows.length) {
    await pool.execute(
      `UPDATE Maestro_docTrabajador SET Doc = ?, FechaRegistro = ? WHERE id = ?`,
      [urlPdf, fechaHoraBogota(), docRows[0].id]
    );
  } else {
    await registrarDocTrabajador({
      regional:      pz.Regional || null,
      operacion:     pz['Operación'] || null,
      identificacion: String(pz.identificacion),
      fechaIngreso:  pz['Fecha de Ingreso'],
      tipoDocumento: '59',
      prefijo:       'PZ',
      doc:           urlPdf,
      usuario:       pz.usuario_registro || 'sistema',
    });
  }

  console.log(`[pzExpiryNotifier] PZ auto-generado id=${pz.id} (${pz.nivel_compromiso})`);
  return urlPdf;
}

// ── Escenario 1: trabajador no firmó, token expirado ─────────────────────
async function procesarEsperandoTrabajador() {
  const [rows] = await pool.execute(
    `SELECT pz.*, v.Trabajador, v.Cargo, v.\`Operación\`, v.\`Fecha de Retiro\`,
            v.\`Fecha de Ingreso\`, v.Regional
     FROM Maestro_pazysalvo pz
     JOIN \`Maestro_Vinculación\` v ON v.\`Id Vinculación\` = pz.id_vinculacion
     WHERE pz.estado = 'esperando_trabajador'
       AND pz.token_trabajador_expira IS NOT NULL
       AND pz.token_trabajador_expira < NOW()`
  );

  for (const pz of rows) {
    try {
      const areasRequeridas = typeof pz.areas_requeridas === 'string'
        ? JSON.parse(pz.areas_requeridas) : (pz.areas_requeridas || []);
      await procesarPZVencido(pz, areasRequeridas);
    } catch (err) {
      console.error(`[pzExpiryNotifier] Error escenario1 id=${pz.id}:`, err.message);
    }
  }
}

// ── Escenario 2: áreas no firmaron a tiempo (120 h desde que firmó el trabajador)
async function procesarEsperandoAreas() {
  const [rows] = await pool.execute(
    `SELECT pz.*, v.Trabajador, v.Cargo, v.\`Operación\`, v.\`Fecha de Retiro\`,
            v.\`Fecha de Ingreso\`, v.Regional
     FROM Maestro_pazysalvo pz
     JOIN \`Maestro_Vinculación\` v ON v.\`Id Vinculación\` = pz.id_vinculacion
     WHERE pz.estado = 'esperando_areas'
       AND pz.fecha_firma_trabajador IS NOT NULL
       AND pz.fecha_firma_trabajador < DATE_SUB(NOW(), INTERVAL 120 HOUR)`
  );

  for (const pz of rows) {
    try {
      const areasRequeridas = typeof pz.areas_requeridas === 'string'
        ? JSON.parse(pz.areas_requeridas) : (pz.areas_requeridas || []);
      await procesarPZVencido(pz, areasRequeridas);
    } catch (err) {
      console.error(`[pzExpiryNotifier] Error escenario2 id=${pz.id}:`, err.message);
    }
  }
}

// ── Función principal exportada ────────────────────────────────────────────
async function verificarPZExpirados() {
  try {
    await procesarEsperandoTrabajador();
    await procesarEsperandoAreas();
  } catch (err) {
    console.error('[pzExpiryNotifier] Error general:', err.message);
  }
}

module.exports = { verificarPZExpirados };
