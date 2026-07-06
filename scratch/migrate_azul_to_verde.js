require('dotenv').config();
const pool = require('../src/services/db');
const { obtenerPlantilla, reemplazarVariables } = require('../src/services/plantilla');
const { generarPDF } = require('../src/services/renderer');
const {
  subirPDFCompromisoSST,
  obtenerFirmaBase64Reciente
} = require('../src/services/storage');

function formatTimestamp() {
  const date = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yy}${mm}${dd}${hh}${ss}`;
}

async function registrarDocumentoTrabajador(identificacion, urlDoc, usuarioId, tipoDocumento, prefijo) {
  const { v4: uuidv4 } = require('uuid');
  // First delete previous doc of this type for this worker to avoid duplicates
  await pool.execute(
    "DELETE FROM Maestro_docTrabajador WHERE Identificación = ? AND TipoDocumento = ? AND Prefijo = ?",
    [identificacion, tipoDocumento, prefijo]
  ).catch(e => console.error('Error deleting old doc:', e.message));

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

  const docId = uuidv4();
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
}

async function run() {
  try {
    // Seleccionar los registros que fueron migrados hoy para regenerar su PDF con los nuevos estilos y el nombre del trabajador
    const [rows] = await pool.execute(
      `SELECT * FROM Dynamic_compromisosst 
       WHERE url_firma_lidersst = 'https://storage.googleapis.com/firmas-images/1035427104/firmalidersst.png'`
    );

    console.log(`Se encontraron ${rows.length} registros para regenerar PDF.`);

    if (rows.length === 0) {
      console.log('No hay registros para regenerar.');
      return;
    }

    // Obtener nombre del Líder SST
    const [liderUserRows] = await pool.execute(
      "SELECT Nombre FROM Maestro_Usuarios WHERE Rol = 'LiderSst' LIMIT 1"
    );
    const nombreLiderSst = liderUserRows.length && liderUserRows[0].Nombre
      ? liderUserRows[0].Nombre
      : 'YULIED ECHAVARRÍA VASCO';

    const urlFirmaLider = 'https://storage.googleapis.com/firmas-images/1035427104/firmalidersst.png';
    const plantilla = await obtenerPlantilla('compromisosst');

    for (const c of rows) {
      console.log(`Regenerando PDF para el registro ${c.idcsst} (${c.nombre_trabajador})...`);

      const fechaFmt = new Date(c.fecha_registro || Date.now()).toLocaleDateString('es-CO', { 
        timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' 
      });

      // Obtener regional del trabajador para el PDF
      const [vinRows] = await pool.execute(
        'SELECT Regional, `Operación` FROM Maestro_Vinculación WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
        [c.identificaciontrabajador]
      );
      const opTrabajador = vinRows.length ? `${vinRows[0]['Operación']} (${vinRows[0].Regional})` : 'LOG&SER S.A.S.';

      const datos = {
        fecha:             fechaFmt,
        nombre_trabajador: String(c.nombre_trabajador).toUpperCase(),
        identificacion:    String(c.identificaciontrabajador),
        operacion:         opTrabajador,
        nombre_analista:   c.nombre_analista || '—',
        nombre_lidersst:   nombreLiderSst,
        firma_trabajador:  `<img src="${c.url_firma_trabajador}" style="height:70px;display:block;margin:0 auto">`,
        firma_analista:    `<img src="${c.url_firma_analista}" style="height:70px;display:block;margin:0 auto">`,
        firma_lidersst:    `<img src="${urlFirmaLider}" style="height:70px;display:block;margin:0 auto">`
      };

      const htmlFinal = reemplazarVariables(plantilla.contenido_html, datos);
      const pdfBuffer = await generarPDF(htmlFinal, {
        margin: { top: '7mm', bottom: '7mm', left: '7mm', right: '7mm' }
      });

      const timestamp = formatTimestamp();
      const urlDoc = await subirPDFCompromisoSST(c.identificaciontrabajador, timestamp, pdfBuffer);

      // Actualizar registro en base de datos
      await pool.execute(
        `UPDATE Dynamic_compromisosst 
         SET url_doc = ? 
         WHERE idcsst = ?`,
        [urlDoc, c.idcsst]
      );

      // Registrar en Maestro_docTrabajador (reemplazando el anterior)
      await registrarDocumentoTrabajador(c.identificaciontrabajador, urlDoc, c.usuario, 72, 'CSST');

      console.log(`Registro ${c.idcsst} regenerado con éxito. PDF: ${urlDoc}`);
    }

    console.log('Regeneración completada exitosamente.');
  } catch (err) {
    console.error('Error en la regeneración:', err);
  } finally {
    await pool.end();
  }
}

run();
