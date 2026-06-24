const pool = require('./db');
const { obtenerPlantilla, reemplazarVariables } = require('./plantilla');
const { generarPDF } = require('./renderer');
const { subirPDFPruebaConsumo } = require('./storage');
const { randomUUID } = require('crypto');

async function registrarDocumentoTrabajador(identificacion, urlDoc, usuarioId, tipoDocumento, prefijo) {
  try {
    const [vinRows] = await pool.execute(
      `SELECT Regional, \`Operación\`, Identificación, Estado, \`Fecha de Ingreso\` 
       FROM \`Maestro_Vinculación\` 
       WHERE Identificación = ? 
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );

    const regional = vinRows.length ? vinRows[0].Regional : null;
    const operacion = vinRows.length ? vinRows[0]['Operación'] : null;
    const estado = vinRows.length ? vinRows[0].Estado : null;
    const fechaIngreso = vinRows.length ? vinRows[0]['Fecha de Ingreso'] : null;

    const docId = randomUUID();
    await pool.execute(
      `INSERT INTO Maestro_docTrabajador
       (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
        TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud, Justificacion_Solicitud, Usuario)
       VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?)`,
      [
        docId,
        regional,
        operacion,
        identificacion,
        estado,
        fechaIngreso,
        tipoDocumento,
        prefijo,
        urlDoc,
        usuarioId
      ]
    );
    console.log(`[cpcExpiryNotifier] [Maestro_docTrabajador] Registrado documento tipo ${tipoDocumento} (${prefijo}) para ${identificacion}`);
  } catch (err) {
    console.error(`[cpcExpiryNotifier] [Maestro_docTrabajador] Error registrando documento para ${identificacion}:`, err.message);
  }
}


const FIRMA_NO_FIRMO = `<div style="border:1.5px solid #ccc;border-radius:4px;padding:8px 10px;color:#888;font-size:.78rem;display:inline-block;width:220px;text-align:center;line-height:1.4;margin-bottom:4px">No firmó dentro del plazo de 48 horas</div>`;

function formatTimestamp() {
  const date = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yy}${mm}${dd}${hh}${ss}`;
}

async function verificarCPCExpirados() {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM \`Dynamic_pruebaconsumo\`
       WHERE token_firma IS NOT NULL
         AND token_expira IS NOT NULL
         AND token_expira < NOW()`
    );

    for (const r of rows) {
      try {
        const plantilla = await obtenerPlantilla('pruebaconsumo');
        
        // Formatear la fecha para la plantilla
        const fechaFmt = r.fecha 
          ? new Date(r.fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' })
          : '';
        
        const datos = {
          ciudad:            r.ciudad || '',
          fecha:             fechaFmt,
          nombre_trabajador: String(r.nombre_trabajador).toUpperCase(),
          identificacion:    String(r.identificacion),
          cliente:           r.cliente || '',
          cargo:             r.cargo || '',
          firma_trabajador:  FIRMA_NO_FIRMO,
        };

        const htmlFinal = reemplazarVariables(plantilla.contenido_html, datos);
        const pdfBuffer = await generarPDF(htmlFinal);
        
        const timestamp = formatTimestamp();
        const urlDoc    = await subirPDFPruebaConsumo(r.identificacion, timestamp, pdfBuffer);

        await pool.execute(
          'UPDATE `Dynamic_pruebaconsumo` SET url_doc = ?, token_firma = NULL, token_expira = NULL WHERE idprueba = ?',
          [urlDoc, r.idprueba]
        );

        await registrarDocumentoTrabajador(r.identificacion, urlDoc, r.usuario, 19, 'CPC');

        console.log(`[cpcExpiryNotifier] CPC auto-generado (expirado sin firma) para idprueba=${r.idprueba}`);
      } catch (err) {
        console.error(`[cpcExpiryNotifier] Error idprueba=${r.idprueba}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[cpcExpiryNotifier] Error general:', err.message);
  }
}

module.exports = { verificarCPCExpirados };
