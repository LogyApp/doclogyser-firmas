const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const { obtenerPlantilla, preprocesarDatos, reemplazarVariables } = require('./plantilla');
const { generarPDF } = require('./renderer');
const { obtenerUrlFirmaReciente, subirPDFCertificadoRetiro } = require('./storage');

function fechaHoraBogota() {
  const b = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${b.getFullYear()}-${p(b.getMonth()+1)}-${p(b.getDate())} ${p(b.getHours())}:${p(b.getMinutes())}:${p(b.getSeconds())}`;
}

function toDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
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

async function resolverFirmaResponsable(usuarioId) {
  const vacio = { nombre: '', cargo: '', firmaHtml: `<div style="height:72px;border-bottom:1px solid #000;width:220px;margin-bottom:4px"></div>` };
  if (!usuarioId) return vacio;
  const [usuRows] = await pool.execute(
    'SELECT Nombre, Cargo, Colaborador FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
    [usuarioId]
  );
  if (!usuRows.length) return vacio;
  const usu = usuRows[0];
  let firmaHtml = vacio.firmaHtml;
  if (usu.Colaborador) {
    const [vinRows] = await pool.execute(
      'SELECT `Identificación` FROM `Maestro_Vinculación` WHERE Trabajador = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [usu.Colaborador]
    );
    if (vinRows.length) {
      const url = await obtenerUrlFirmaReciente(vinRows[0]['Identificación']).catch(() => null);
      if (url) firmaHtml = `<img src="${url}" style="height:80px;display:block;margin-bottom:4px">`;
    }
  }
  return {
    nombre:    limpiarNombre(usu.Colaborador || usu.Nombre).toUpperCase(),
    cargo:     usu.Cargo || '',
    firmaHtml,
  };
}

async function verificarCTExpirados() {
  try {
    const [rows] = await pool.execute(
      `SELECT v.\`Id Vinculación\`   AS idVinculacion,
              v.\`Identificación\`   AS identificacion,
              v.Trabajador, v.Cargo,
              v.Regional,
              v.\`Operación\`        AS operacion,
              v.\`Fecha de Ingreso\` AS fechaIngreso,
              v.\`Fecha de Retiro\`  AS fechaRetiro,
              v.Usuario,
              s.ARL, s.EPS, s.\`Pensión\` AS pension
       FROM \`Maestro_Vinculación\` v
       LEFT JOIN \`Maestro_Segmentación\` s ON s.\`Identificación\` = v.\`Identificación\`
       WHERE v.token_firma_ct IS NOT NULL
         AND v.token_firma_ct_expira IS NOT NULL
         AND v.token_firma_ct_expira < NOW()`
    );

    for (const r of rows) {
      try {
        const responsable = await resolverFirmaResponsable(r.Usuario);
        const plantilla   = await obtenerPlantilla('certificado_retiro');

        const datos = {
          nombre_trabajador:     limpiarNombre(r.Trabajador).toUpperCase(),
          identificacion:        String(r.identificacion),
          cargo:                 (r.Cargo || '').toUpperCase(),
          fecha_ingreso:         formatFechaCO(r.fechaIngreso),
          fecha_retiro:          formatFechaCO(r.fechaRetiro),
          arl:                   r.ARL     || '—',
          eps:                   r.EPS     || '—',
          pension:               r.pension || '—',
          fecha_expedicion:      formatFechaCO(new Date()),
          firma_html:            responsable.firmaHtml,
          nombre_firmante:       responsable.nombre,
          cargo_firmante:        responsable.cargo,
          firma_trabajador_html: FIRMA_NO_FIRMO,
        };

        const htmlFinal = reemplazarVariables(plantilla.contenido_html, preprocesarDatos(datos));
        const pdfBuffer = await generarPDF(htmlFinal);
        const urlDoc    = await subirPDFCertificadoRetiro(r.identificacion, r.idVinculacion, pdfBuffer);

        await pool.execute(
          `INSERT INTO Maestro_docTrabajador
           (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
            TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud,
            Justificacion_Solicitud, FechaRegistro, Usuario)
           VALUES (?, 'PEND', ?, ?, ?, 'Retirado', ?, '57', 'CT', ?, NULL, NULL, NULL, NULL, ?, ?)`,
          [uuidv4(), r.Regional || null, r.operacion || null,
           String(r.identificacion), toDateStr(r.fechaIngreso),
           urlDoc, fechaHoraBogota(), r.Usuario || 'sistema']
        );

        await pool.execute(
          'UPDATE `Maestro_Vinculación` SET token_firma_ct = NULL, token_firma_ct_expira = NULL WHERE `Id Vinculación` = ?',
          [r.idVinculacion]
        );

        console.log(`[ctExpiryNotifier] CT auto-generado (sin firma) para id=${r.idVinculacion}`);
      } catch (err) {
        console.error(`[ctExpiryNotifier] Error id=${r.idVinculacion}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[ctExpiryNotifier] Error general:', err.message);
  }
}

module.exports = { verificarCTExpirados };
