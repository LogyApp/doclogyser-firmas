const pool = require('./db');
const { renderPDF } = require('./evsstPdfGenerator');
const { subirPDFEvaluacionSST } = require('./storage');
const { randomUUID } = require('crypto');

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
    console.log(`[evsstExpiryNotifier] [Maestro_docTrabajador] Registrado documento tipo ${tipoDocumento} (${prefijo}) para ${identificacion}`);
  } catch (err) {
    console.error(`[evsstExpiryNotifier] [Maestro_docTrabajador] Error registrando documento para ${identificacion}:`, err.message);
  }
}

async function verificarEVSSTExpirados() {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM \`Maestro_evaluacionsst\`
       WHERE token_firma IS NOT NULL
         AND token_expira IS NOT NULL
         AND token_expira < NOW()
         AND url_doc IS NULL`
    );

    for (const r of rows) {
      try {
        const [vinRows] = await pool.execute(
          `SELECT Trabajador, \`Id Vinculación\`
           FROM \`Maestro_Vinculación\`
           WHERE Identificación = ?
           ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
          [r.identificacion]
        );
        if (!vinRows.length) {
          console.error(`[evsstExpiryNotifier] Vinculación no encontrada para trabajador ${r.identificacion}`);
          continue;
        }
        const vin = vinRows[0];

        const [uRows] = await pool.execute(
          'SELECT Nombre FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
          [r.usuario]
        );
        const evaluadorNombre = uRows.length ? uRows[0].Nombre : r.usuario;

        const { obtenerUrlFirmaReciente } = require('./storage');
        const firmaUrl = await obtenerUrlFirmaReciente(r.identificacion).catch(() => null);

        r.puntaje = 0;
        r.resultado = 'NO APROBADO';
        r.firma_trabajador = firmaUrl || null;

        const pdfBuffer = await renderPDF(r, vin, evaluadorNombre);
        const timestamp = formatTimestamp();
        const urlDoc = await subirPDFEvaluacionSST(r.identificacion, timestamp, pdfBuffer);

        await pool.execute(
          `UPDATE \`Maestro_evaluacionsst\`
           SET url_doc = ?, puntaje = 0, resultado = 'NO APROBADO', token_firma = NULL, token_expira = NULL
           WHERE id_evaluacion = ?`,
          [urlDoc, r.id_evaluacion]
        );

        await registrarDocumentoTrabajador(r.identificacion, urlDoc, r.usuario, 73, 'EVSST');

        console.log(`[evsstExpiryNotifier] EVSST auto-generado (expirado sin firma) para id_evaluacion=${r.id_evaluacion}`);
      } catch (err) {
        console.error(`[evsstExpiryNotifier] Error id_evaluacion=${r.id_evaluacion}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[evsstExpiryNotifier] Error general:', err.message);
  }
}

module.exports = { verificarEVSSTExpirados };
