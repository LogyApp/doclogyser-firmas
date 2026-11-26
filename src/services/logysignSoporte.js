const crypto = require('crypto');
const pool = require('./db');
const { storage } = require('./storage');
const { obtenerPlantilla, reemplazarVariables } = require('./plantilla');
const { generarPDF } = require('./renderer');
const { LOGO_BASE64 } = require('./assets');
const { obtenerConfigLogysign } = require('./configLogysign');

// ── Soporte de solicitud de firma digital (LogySign › No firma) ──
// Cuando un documento se cierra como No firma se genera un PDF de constancia (plantilla
// 'soporte_no_firma' de Maestro_Plantillas) y se registra en Maestro_docTrabajador con el documento
// de 'Documento de soporte de No firma' (Config_Parametros CloudDocs / LogySign, por defecto SSFD,
// Config_Doc_Trabajador 100). Su fila es 'logysign-nf-<id del registro>': regenerarlo la actualiza.
const PROCESO_PLANTILLA = 'soporte_no_firma';
const idDocSoporte = idRegistro => `logysign-nf-${idRegistro}`;

function esc(texto) {
  return String(texto == null ? '' : texto).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// dd/mm/aaaa hh:mm en hora de Bogotá
function fechaHora(valor) {
  if (!valor) return '—';
  const d = valor instanceof Date ? valor : new Date(valor);
  if (isNaN(d)) return '—';
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach(x => { p[x.type] = x.value; });
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

function marcaTiempo() {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
}

function rutaGcs(url) {
  const partes = new URL(url).pathname.replace(/^\//, '').split('/');
  return { bucket: partes[0], ruta: decodeURIComponent(partes.slice(1).join('/')) };
}

// Arma el PDF del soporte sin guardarlo. Devuelve { pdf, registro, docSoporte }.
async function armarSoporteNoFirma(idRegistro) {
  const [rows] = await pool.execute(
    `SELECT dl.*, cdt.Documento AS nombre_documento, mu.Nombre AS nombre_creador,
            nf.Nombre AS nombre_no_firma, s.Celular AS celular_trabajador
     FROM Dynamic_Logysign dl
     LEFT JOIN Config_Doc_Trabajador cdt ON cdt.Id = dl.id_config_doc
     LEFT JOIN Maestro_Usuarios mu ON mu.ID = dl.usuario_creador
     LEFT JOIN Maestro_Usuarios nf ON nf.ID = dl.no_firma_usuario
     LEFT JOIN Maestro_Segmentación s ON s.Identificación = dl.identificacion
     WHERE dl.id = ? AND dl.estado = 'FIRMADO' AND dl.no_firma_fecha IS NOT NULL`,
    [idRegistro]
  );
  if (!rows.length) throw new Error('El registro no está cerrado como No firma');
  const r = rows[0];

  const cfg = await obtenerConfigLogysign();
  const [docRows] = await pool.execute('SELECT Id, Prefijo FROM Config_Doc_Trabajador WHERE Prefijo = ? LIMIT 1', [cfg.docSoporte]);
  if (!docRows.length) throw new Error(`No existe el documento ${cfg.docSoporte} en Config_Doc_Trabajador`);
  const docSoporte = docRows[0];

  // Huella del documento que se envió al trabajador (el PDF original, sin anotación)
  let hash = 'No disponible';
  try {
    const { bucket, ruta } = rutaGcs(r.original_pdf_url);
    const [buf] = await storage.bucket(bucket).file(ruta).download();
    hash = crypto.createHash('sha256').update(buf).digest('hex');
  } catch (err) {
    console.warn(`[logysignSoporte] Sin huella del original de ${idRegistro}:`, err.message);
  }

  const plantilla = await obtenerPlantilla(PROCESO_PLANTILLA);
  const html = reemplazarVariables(plantilla.contenido_html, {
    logo_src: LOGO_BASE64,
    nombre_trabajador: esc(r.nombre_trabajador),
    identificacion: esc(r.identificacion),
    cargo: esc(r.cargo || '—'),
    operacion: esc(r.operacion || '—'),
    regional: esc(r.regional || '—'),
    nombre_documento: esc(r.nombre_documento || r.prefijo),
    prefijo: esc(r.prefijo),
    fila_causa: r.causa ? `<tr><td class="data-label">Causa</td><td class="data-val">${esc(r.causa)}</td></tr>` : '',
    fecha_registro: fechaHora(r.fecha_registro),
    fecha_envio: fechaHora(r.fecha_envio_programado || r.fecha_registro),
    email_trabajador: esc(r.email_trabajador || '—'),
    celular_trabajador: esc(r.celular_trabajador || '—'),
    token_expira: r.token_expira ? `Hasta ${fechaHora(r.token_expira)}` : '—',
    creador: esc(r.nombre_creador || r.usuario_creador || '—'),
    fecha_no_firma: fechaHora(r.no_firma_fecha),
    usuario_no_firma: esc(r.nombre_no_firma || r.no_firma_usuario || 'No registrado (cierre anterior a este soporte)'),
    anotacion: esc(r.no_firma_anotacion || 'No registrada (cierre anterior a este soporte); ver el documento en Cloud Docs'),
    id_registro: esc(r.id),
    hash_original: esc(hash),
    fecha_generacion: fechaHora(new Date()),
  });
  const pdf = await generarPDF(html);
  return { pdf, registro: r, docSoporte };
}

// Genera (o regenera) el soporte de un registro cerrado como No firma. Devuelve { url, docId }.
async function generarSoporteNoFirma(idRegistro, usuarioGenera) {
  const { pdf, registro: r, docSoporte } = await armarSoporteNoFirma(idRegistro);

  // Carpeta del trabajador en el bucket de documentos, con el nombre de siempre
  const bucket = storage.bucket(process.env.BUCKET_PDFS || 'talenthub_central');
  const nombre = `${r.identificacion}/${r.identificacion}.${docSoporte.Prefijo}.${marcaTiempo()}.pdf`;
  await bucket.file(nombre).save(Buffer.from(pdf), { contentType: 'application/pdf' });
  const url = `https://storage.googleapis.com/${bucket.name}/${nombre}`;

  const [vRows] = await pool.execute(
    'SELECT Estado FROM `Maestro_Vinculación` WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
    [r.identificacion]
  );
  const docId = idDocSoporte(r.id);
  // FechaRegistro explícita: el valor por defecto de la columna (convert_tz desde SYSTEM) resta 5 horas de más
  // porque la conexión ya trabaja en hora de Bogotá
  await pool.execute(
    `INSERT INTO Maestro_docTrabajador
     (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
      TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud, Justificacion_Solicitud, Usuario, FechaRegistro)
     VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NOW())
     ON DUPLICATE KEY UPDATE Doc = VALUES(Doc), Usuario = VALUES(Usuario), FechaRegistro = VALUES(FechaRegistro)`,
    [
      docId, r.regional, r.operacion, r.identificacion,
      vRows.length ? vRows[0].Estado : 'Activo', r.fecha_ingreso,
      String(docSoporte.Id), docSoporte.Prefijo, url,
      `Soporte de No firma de ${r.prefijo} (LogySign)`,
      usuarioGenera || r.no_firma_usuario || r.usuario_creador,
    ]
  );
  return { url, docId };
}

module.exports = { armarSoporteNoFirma, generarSoporteNoFirma, idDocSoporte };
