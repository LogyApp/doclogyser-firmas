const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const { obtenerPlantilla, preprocesarDatos, reemplazarVariables } = require('./plantilla');
const { generarPDF } = require('./renderer');
const { obtenerUrlFirmaReciente, subirPDFAceptacionRenuncia } = require('./storage');

function fechaHoraBogota() {
  const b = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${b.getFullYear()}-${p(b.getMonth()+1)}-${p(b.getDate())} ${p(b.getHours())}:${p(b.getMinutes())}:${p(b.getSeconds())}`;
}

function toDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
  return String(val).slice(0, 10);
}

function limpiarNombre(trabajador) {
  if (!trabajador) return '';
  const partes = String(trabajador).split(' ** ');
  return (partes.length > 1 ? partes[1] : trabajador).trim();
}

function formatFechaCO(fecha) {
  if (!fecha) return '';
  const d = new Date(typeof fecha === 'string' ? fecha + 'T12:00:00' : fecha);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

const FIRMA_NO_FIRMO = `<div style="border:1.5px solid #ccc;border-radius:4px;padding:8px 10px;color:#888;font-size:.78rem;display:inline-block;width:220px;text-align:center;line-height:1.4;margin-bottom:4px">Documento soportado por correo electrónico – Trabajador no firmó dentro del plazo</div>`;

function buildFirmaHtml(url) {
  return url
    ? `<img src="${url}" style="height:80px;display:block;margin-bottom:4px">`
    : `<div style="height:72px;border-bottom:1px solid #000;width:220px;margin-bottom:4px"></div>`;
}

async function resolverFirmaResponsable(usuarioId) {
  if (!usuarioId) return { nombre: '', cargo: '', firmaHtml: buildFirmaHtml(null) };
  const [usuRows] = await pool.execute(
    'SELECT Nombre, Cargo, Colaborador FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
    [usuarioId]
  );
  if (!usuRows.length) return { nombre: '', cargo: '', firmaHtml: buildFirmaHtml(null) };
  const usu = usuRows[0];
  let firmaUrl = null;
  if (usu.Colaborador) {
    const [vinRows] = await pool.execute(
      'SELECT `Identificación` FROM `Maestro_Vinculación` WHERE Trabajador = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [usu.Colaborador]
    );
    if (vinRows.length) {
      firmaUrl = await obtenerUrlFirmaReciente(vinRows[0]['Identificación']).catch(() => null);
    }
  }
  return {
    nombre:   limpiarNombre(usu.Colaborador || usu.Nombre).toUpperCase(),
    cargo:    usu.Cargo || '',
    firmaHtml: buildFirmaHtml(firmaUrl),
  };
}

async function verificarARExpirados() {
  try {
    const [rows] = await pool.execute(
      `SELECT \`Id Vinculación\`       AS idVinculacion,
              \`Identificación\`       AS identificacion,
              Trabajador,
              \`Archivo Vinculación\`  AS tipoRenuncia,
              \`Fecha de Retiro\`      AS fechaRetiro,
              \`Fecha de Ingreso\`     AS fechaIngreso,
              ar_ciudad_regional       AS ciudadRegional,
              Regional, \`Operación\`  AS operacion,
              Usuario
       FROM \`Maestro_Vinculación\`
       WHERE token_firma_ar IS NOT NULL
         AND token_firma_ar_expira IS NOT NULL
         AND token_firma_ar_expira < NOW()`
    );

    for (const r of rows) {
      try {
        const responsable = await resolverFirmaResponsable(r.Usuario);
        const plantilla   = await obtenerPlantilla('aceptacion_renuncia');
        const tipo = r.tipoRenuncia || '';

        const datos = {
          nombre_trabajador:      limpiarNombre(r.Trabajador).toUpperCase(),
          identificacion:         String(r.identificacion),
          ciudad_regional:        r.ciudadRegional || '',
          fecha_expedicion:       formatFechaCO(new Date()),
          verbal_marca:           tipo === 'Verbal'  ? 'X' : '___',
          escrita_marca:          tipo === 'Escrita' ? 'X' : '___',
          fecha_retiro_texto:     formatFechaCO(r.fechaRetiro),
          firma_responsable_html: responsable.firmaHtml,
          nombre_firmante:        responsable.nombre,
          cargo_firmante:         responsable.cargo,
          firma_trabajador_html:  FIRMA_NO_FIRMO,
        };

        const htmlFinal = reemplazarVariables(plantilla.contenido_html, preprocesarDatos(datos));
        const pdfBuffer = await generarPDF(htmlFinal);
        const urlDoc    = await subirPDFAceptacionRenuncia(r.identificacion, r.idVinculacion, pdfBuffer);

        // Registrar documento AR en Maestro_docTrabajador
        await pool.execute(
          `INSERT INTO Maestro_docTrabajador
           (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
            TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud,
            Justificacion_Solicitud, FechaRegistro, Usuario)
           VALUES (?, 'PEND', ?, ?, ?, 'Retirado', ?, '54', 'AR', ?, NULL, NULL, NULL, NULL, ?, ?)`,
          [uuidv4(), r.Regional || null, r.operacion || null,
           String(r.identificacion), toDateStr(r.fechaIngreso),
           urlDoc, fechaHoraBogota(), r.Usuario || 'sistema']
        );

        // Limpiar token para no reprocesar
        await pool.execute(
          'UPDATE `Maestro_Vinculación` SET token_firma_ar = NULL, token_firma_ar_expira = NULL WHERE `Id Vinculación` = ?',
          [r.idVinculacion]
        );

        console.log(`[arExpiryNotifier] AR auto-generado (sin firma) para id=${r.idVinculacion}`);
      } catch (err) {
        console.error(`[arExpiryNotifier] Error id=${r.idVinculacion}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[arExpiryNotifier] Error general:', err.message);
  }
}

module.exports = { verificarARExpirados };
