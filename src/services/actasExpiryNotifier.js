const pool = require('./db');
const { obtenerPlantilla, reemplazarVariables } = require('./plantilla');
const { generarPDFDesdeHTML } = require('./renderer');
const { subirPDFActa } = require('./storage');
const {
  construirDatosPlantilla,
  resolverTipoDocumentoActa,
  registrarDocumentoTrabajadorActa,
} = require('./actas');

const URL_FIRMA_FALLBACK = 'https://storage.googleapis.com/logyser-recursos-corporativos/firmas-corporativas/Sin%20firma.png';
const FIRMA_EXPIRADA_HTML = `<div style="border:1.5px solid #ccc;border-radius:4px;padding:8px 10px;color:#888;font-size:.78rem;display:inline-block;width:260px;text-align:center;line-height:1.4;margin-bottom:4px">No firma, se soporta mediante correo electronico</div>`;

async function procesarActaExpirada(acta) {
  const idActa = acta.IdActa;
  const plantilla = await obtenerPlantilla('acta_entrega');

  const { datos } = await construirDatosPlantilla(idActa, { firmaHtml: FIRMA_EXPIRADA_HTML });
  const htmlFinal = reemplazarVariables(plantilla.contenido_html || '', datos);

  const pdfBuffer = await generarPDFDesdeHTML(htmlFinal);

  const { tipoDocumento, prefijo } = await resolverTipoDocumentoActa(acta.Categoria);
  const urlActa = await subirPDFActa(acta.identificacion, prefijo, idActa, pdfBuffer);

  await pool.execute(
    `UPDATE Dynamic_Actas
     SET Estado = 'Firmada',
         Url_Firma = ?,
         Url_Acta = ?,
         token_firma = NULL,
         token_expira = NULL
     WHERE IdActa = ?`,
    [URL_FIRMA_FALLBACK, urlActa, idActa]
  );

  // Registrar en Maestro_docTrabajador si no existe ya
  const [[docExistente]] = await pool.execute(
    'SELECT id FROM Maestro_docTrabajador WHERE Doc = ? LIMIT 1',
    [urlActa]
  );
  if (!docExistente) {
    await registrarDocumentoTrabajadorActa({ acta, tipoDocumento, prefijo, urlActa });
  }

  return urlActa;
}

async function verificarActasExpiradas() {
  try {
    const [rows] = await pool.execute(
      `SELECT IdActa, identificacion, Categoria, operacion, Usuario, Fecha_Registro, token_expira, Url_Evidencia
       FROM Dynamic_Actas
       WHERE Estado = 'Pendiente'
         AND (token_expira < NOW() OR (token_expira IS NULL AND Fecha_Registro < DATE_SUB(NOW(), INTERVAL 48 HOUR)))
       ORDER BY IdActa ASC`
    );

    if (!rows.length) return;

    console.log(`[actasExpiryNotifier] Encontradas ${rows.length} actas pendientes expiradas (> 48h)`);

    for (const acta of rows) {
      try {
        const urlActa = await procesarActaExpirada(acta);
        console.log(`[actasExpiryNotifier] Acta #${acta.IdActa} auto-generada tras 48h -> ${urlActa}`);
      } catch (err) {
        console.error(`[actasExpiryNotifier] Error procesando Acta #${acta.IdActa}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[actasExpiryNotifier] Error general:', err.message);
  }
}

module.exports = { verificarActasExpiradas, procesarActaExpirada };
