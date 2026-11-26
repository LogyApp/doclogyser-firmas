const path = require('path');
const { Storage } = require('@google-cloud/storage');
const pool = require('./db');
const { generarPDFDesdeHTML } = require('./renderer');

const storage = process.env.GCS_KEYFILE
  ? new Storage({ keyFilename: path.resolve(process.env.GCS_KEYFILE) })
  : new Storage();

const BUCKET_ASPIRANTES_DEFAULT = process.env.BUCKET_ASPIRANTES || 'hojas_vida_logyser';
const BUCKET_FIRMAS_DEFAULT = process.env.BUCKET_FIRMAS || 'firmas-images';

function escapeHtml(str = '') {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function siNo(valor) {
  if (valor === null || valor === undefined) return '';
  return valor == 1 || valor === true || valor === 'true' ? 'Sí' : 'No';
}

function toHtmlList(items, renderer) {
  if (!Array.isArray(items) || items.length === 0) return "<div class='small'>No registrado</div>";
  return items.map((it, i) => `<div class="list-item"><strong>${i + 1}.</strong> ${renderer(it)}</div>`).join('');
}

function replacePlaceholders(html, data) {
  let rendered = html;
  Object.entries(data).forEach(([k, v]) => {
    const re = new RegExp(`{{\\s*${k}\\s*}}`, 'g');
    rendered = rendered.replace(re, v != null ? String(v) : '');
  });
  return rendered;
}

/**
 * Regenera el PDF de la Hoja de Vida institucional de un aspirante usando la plantilla de Maestro_Plantillas.
 * Reemplaza el documento en GCS y actualiza Dynamic_hv_aspirante y Dynamic_hv_documentos.
 */
async function regenerarHojaVidaAspirante({ idAspirante, bucketAspirantes = BUCKET_ASPIRANTES_DEFAULT }) {
  if (!idAspirante) throw new Error('idAspirante es requerido');

  // 1. Consultar datos del aspirante
  const [aspRows] = await pool.execute(
    `SELECT * FROM Dynamic_hv_aspirante WHERE id_aspirante = ? LIMIT 1`,
    [idAspirante]
  );
  if (!aspRows.length) throw new Error(`Aspirante con ID ${idAspirante} no encontrado`);
  const asp = aspRows[0];
  const identificacion = String(asp.identificacion).trim();

  // 2. Consultar tablas dependientes
  const [
    [eduRows],
    [expRows],
    [famRows],
    [hijosRows],
    [refRows],
    [emergRows],
    [metasRows],
    [segRows]
  ] = await Promise.all([
    pool.execute(`SELECT * FROM Dynamic_hv_educacion WHERE id_aspirante = ? ORDER BY fecha_registro ASC, id_educacion ASC`, [idAspirante]),
    pool.execute(`SELECT * FROM Dynamic_hv_experiencia_laboral WHERE id_aspirante = ? ORDER BY fecha_registro ASC, id_experiencia ASC`, [idAspirante]),
    pool.execute(`SELECT * FROM Dynamic_hv_familiares WHERE id_aspirante = ? ORDER BY fecha_registro ASC, id_familiar ASC`, [idAspirante]),
    pool.execute(`SELECT * FROM Dynamic_Aspirante_Hijos WHERE id_aspirante = ? ORDER BY fecha_registro ASC, id_hijo ASC`, [idAspirante]),
    pool.execute(`SELECT * FROM Dynamic_hv_referencias WHERE id_aspirante = ? ORDER BY fecha_registro ASC, id_referencia ASC`, [idAspirante]),
    pool.execute(`SELECT * FROM Dynamic_hv_contacto_emergencia WHERE id_aspirante = ? LIMIT 1`, [idAspirante]),
    pool.execute(`SELECT * FROM Dynamic_hv_metas_personales WHERE id_aspirante = ? LIMIT 1`, [idAspirante]),
    pool.execute(`SELECT * FROM Dynamic_hv_seguridad WHERE id_aspirante = ? LIMIT 1`, [idAspirante])
  ]);

  const emerg = emergRows[0] || {};
  const metas = metasRows[0] || {};
  const seg = segRows[0] || {};

  // Formatear listas
  const EDUCACION_LIST = toHtmlList(
    eduRows,
    e => `${escapeHtml(e.institucion || '')} — ${escapeHtml(e.programa || '')} (${escapeHtml(e.modalidad || '-')}) ${e.ano ? `• ${escapeHtml(String(e.ano))}` : ''}`
  );

  const EXPERIENCIA_LIST = toHtmlList(
    expRows,
    ex => `<div><strong>${escapeHtml(ex.empresa || '-')}</strong> — ${escapeHtml(ex.cargo || '-')}<br><span class="muted">Año inicio: ${escapeHtml(String(ex.ano_experiencia || '-'))} • Tiempo: ${escapeHtml(ex.tiempo_laborado || '-')} • Salario: ${escapeHtml(ex.salario || '-')}</span><br><span class="muted">Motivo retiro: ${escapeHtml(ex.motivo_retiro || '-')}</span><br>${escapeHtml(ex.funciones || '-')}</div>`
  );

  const REFERENCIAS_LIST = toHtmlList(
    refRows,
    r => {
      const tipoRaw = (r.tipo_referencia || '').toLowerCase();
      const tipo = tipoRaw.includes('laboral') ? 'Referencia laboral'
        : tipoRaw.includes('familiar') ? 'Referencia familiar'
        : tipoRaw.includes('personal') ? 'Referencia personal'
        : 'Referencia';

      if (tipoRaw.includes('laboral')) {
        return `<div><strong>${escapeHtml(tipo)}:</strong> ${escapeHtml(r.empresa || '-')} — ${escapeHtml(r.jefe_inmediato || '-')} (${escapeHtml(r.telefono || '-')})</div>`;
      }
      const ocup = r.ocupacion ? ` • ${escapeHtml(r.ocupacion)}` : '';
      return `<div><strong>${escapeHtml(tipo)}:</strong> ${escapeHtml(r.nombre_completo || '-')} — ${escapeHtml(r.telefono || '-')}${ocup}</div>`;
    }
  );

  const todosFamiliares = [
    ...famRows,
    ...hijosRows.filter(h => h.nombre_completo).map(h => ({
      nombre_completo: h.nombre_completo,
      parentesco: 'Hijo(a)',
      edad: h.edad != null ? String(h.edad) : ''
    }))
  ];

  const FAMILIARES_LIST = toHtmlList(
    todosFamiliares,
    f => `${escapeHtml(f.nombre_completo || '')} — ${escapeHtml(f.parentesco || '')} • ${escapeHtml(String(f.edad || ''))}`
  );

  const CONTACTO_EMERGENCIA = emerg.nombre_completo
    ? `${escapeHtml(emerg.nombre_completo)} • ${escapeHtml(emerg.telefono || '')} • ${escapeHtml(emerg.correo_electronico || '')}`
    : '';

  const mCorto = (metas.meta_corto_plazo || '').trim();
  const mMediano = (metas.meta_mediano_plazo || '').trim();
  const mLargo = (metas.meta_largo_plazo || '').trim();
  const metasFilas = [];
  if (mCorto) metasFilas.push(`<div><strong>Corto plazo:</strong> ${escapeHtml(mCorto)}</div>`);
  if (mMediano) metasFilas.push(`<div><strong>Mediano plazo:</strong> ${escapeHtml(mMediano)}</div>`);
  if (mLargo) metasFilas.push(`<div><strong>Largo plazo:</strong> ${escapeHtml(mLargo)}</div>`);
  const METAS = metasFilas.length > 0 ? metasFilas.join('') : 'No registrado';

  // Firma
  let firmaUrl = asp.firma_url || '';
  if (!firmaUrl) {
    // Probar si existe en bucket firmas-images
    try {
      const bucketFirmas = storage.bucket(BUCKET_FIRMAS_DEFAULT);
      const fileFirma = bucketFirmas.file(`${identificacion}/firma.png`);
      const [exists] = await fileFirma.exists();
      if (exists) {
        firmaUrl = `https://storage.googleapis.com/${BUCKET_FIRMAS_DEFAULT}/${identificacion}/firma.png`;
      }
    } catch (e) {
      console.warn(`[hojaVidaService] No se pudo verificar firma en GCS: ${e.message}`);
    }
  }

  // 3. Consultar plantilla en Maestro_Plantillas
  let templateHtml = null;
  let codigoFormato = '';
  let versionFormato = '2';
  let fechaVersion = '26/11/2026';

  try {
    const [tplRows] = await pool.execute(
      `SELECT contenido_html, codigo_formato, version_formato, fecha_version
       FROM Maestro_Plantillas
       WHERE nombre_proceso = 'hoja_de_vida' AND activo = 1
       ORDER BY id_plantilla DESC LIMIT 1`
    );
    if (tplRows.length > 0 && tplRows[0].contenido_html) {
      templateHtml = tplRows[0].contenido_html;
      codigoFormato = tplRows[0].codigo_formato || '';
      versionFormato = tplRows[0].version_formato || '2';
      if (tplRows[0].fecha_version) {
        const d = new Date(tplRows[0].fecha_version);
        fechaVersion = !isNaN(d.getTime())
          ? d.toLocaleDateString('es-CO', { timeZone: 'UTC' })
          : String(tplRows[0].fecha_version);
      }
    }
  } catch (errTpl) {
    console.warn(`[hojaVidaService] Error leyendo Maestro_Plantillas: ${errTpl.message}`);
  }

  if (!templateHtml) {
    throw new Error('No se encontró una plantilla activa para hoja_de_vida en Maestro_Plantillas');
  }

  const ciudad_residencia = asp.ciudad_residencia || asp.ciudad || '';
  const departamento_residencia = asp.departamento_residencia || asp.departamento || '';

  const dataObjects = {
    NOMBRE_COMPLETO: `${escapeHtml(asp.primer_nombre || '')} ${escapeHtml(asp.primer_apellido || '')}`.trim(),
    TIPO_ID: escapeHtml(asp.tipo_documento || ''),
    IDENTIFICACION: escapeHtml(identificacion),
    CIUDAD_RESIDENCIA: escapeHtml([ciudad_residencia, departamento_residencia].filter(Boolean).join(' — ')),
    TELEFONO: escapeHtml(asp.telefono || ''),
    CORREO: escapeHtml(asp.correo_electronico || ''),
    DIRECCION: escapeHtml(asp.direccion_barrio || ''),
    FECHA_NACIMIENTO: escapeHtml(asp.fecha_nacimiento ? String(asp.fecha_nacimiento).split('T')[0] : ''),
    LUGAR_NACIMIENTO: escapeHtml([asp.ciudad_nacimiento, asp.departamento_nacimiento, asp.pais_nacimiento].filter(Boolean).join(' — ')),
    FECHA_EXPEDICION: escapeHtml(asp.fecha_expedicion ? String(asp.fecha_expedicion).split('T')[0] : ''),
    ESTADO_CIVIL: escapeHtml(asp.estado_civil || ''),
    EPS: escapeHtml(asp.eps || ''),
    AFP: escapeHtml(asp.afp || ''),
    RH: escapeHtml(asp.rh || ''),
    CAMISA_TALLA: escapeHtml(asp.camisa_talla || ''),
    TALLA_PANTALON: escapeHtml(asp.talla_pantalon || ''),
    ZAPATOS_TALLA: escapeHtml(asp.zapatos_talla || ''),
    PHOTO_URL: asp.foto_public_url || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    EDUCACION_LIST,
    EXPERIENCIA_LIST,
    REFERENCIAS_LIST,
    FAMILIARES_LIST,
    CONTACTO_EMERGENCIA,
    METAS,
    FECHA_GENERACION: new Date().toLocaleString('es-CO'),
    LOGO_URL: process.env.LOGO_PUBLIC_URL || 'https://storage.googleapis.com/logyser-recibo-public/logo.png',
    logo_src: process.env.LOGO_PUBLIC_URL || 'https://storage.googleapis.com/logyser-recibo-public/logo.png',
    CODIGO_FORMATO: codigoFormato,
    codigo_formato: codigoFormato,
    VERSION_FORMATO: versionFormato,
    version_formato: versionFormato,
    FECHA_VERSION: fechaVersion,
    fecha_formato: fechaVersion,
    SEG_LLAMADOS: siNo(seg.llamados_atencion),
    SEG_DETALLE_LLAMADOS: escapeHtml(seg.detalle_llamados || ''),
    SEG_ACCIDENTE: siNo(seg.accidente_laboral),
    SEG_DETALLE_ACCIDENTE: escapeHtml(seg.detalle_accidente || ''),
    SEG_ENFERMEDAD: siNo(seg.enfermedad_importante),
    SEG_DETALLE_ENFERMEDAD: escapeHtml(seg.detalle_enfermedad || ''),
    SEG_ALCOHOL: siNo(seg.consume_alcohol),
    SEG_FRECUENCIA: escapeHtml(seg.frecuencia_alcohol || ''),
    SEG_FAMILIAR: siNo(seg.familiar_en_empresa),
    SEG_DETALLE_FAMILIAR: escapeHtml(seg.detalle_familiar_empresa || ''),
    SEG_INFO_FALSA: siNo(seg.info_falsa),
    SEG_POLIGRAFO: siNo(seg.acepta_poligrafo),
    SEG_FORTALEZAS: escapeHtml(seg.fortalezas || ''),
    SEG_MEJORAR: escapeHtml(seg.aspectos_mejorar || ''),
    SEG_RESOLUCION: escapeHtml(seg.resolucion_problemas || ''),
    SEG_OBSERVACIONES: escapeHtml(seg.observaciones || ''),
    FIRMA_URL: firmaUrl
  };

  // 4. Renderizar HTML y generar PDF
  const html = replacePlaceholders(templateHtml, dataObjects);
  console.log(`[hojaVidaService] Generando PDF de Hoja de Vida para ${identificacion}...`);
  const pdfBuffer = await generarPDFDesdeHTML(html);

  // 5. Guardar en GCS
  const bucket = storage.bucket(bucketAspirantes);
  const destName = `${identificacion}/${identificacion}.HV.${idAspirante}.pdf`;
  const file = bucket.file(destName);

  await file.save(pdfBuffer, {
    contentType: 'application/pdf',
    metadata: {
      cacheControl: 'no-cache, no-store, max-age=0, must-revalidate',
      contentDisposition: `inline; filename="HV_${identificacion}.pdf"`
    },
    resumable: false
  });
  await file.makePublic().catch(() => {});

  const publicUrl = `https://storage.googleapis.com/${bucketAspirantes}/${destName}`;
  console.log(`[hojaVidaService] PDF guardado y hecho público: ${publicUrl}`);

  // 6. Actualizar BD
  await pool.execute(
    `UPDATE Dynamic_hv_aspirante SET pdf_gcs_path = ?, pdf_public_url = ? WHERE id_aspirante = ?`,
    [destName, publicUrl, idAspirante]
  );

  await pool.execute(
    `INSERT INTO Dynamic_hv_documentos
      (id_aspirante, id_config_doc, gcs_path, estado, fuente, observaciones)
     VALUES (?, 30, ?, 'Aprobado', 'Sistema', NULL)
     ON DUPLICATE KEY UPDATE
      gcs_path = VALUES(gcs_path),
      estado = 'Aprobado',
      fecha_actualizacion = CURRENT_TIMESTAMP`,
    [idAspirante, destName]
  );

  return { destName, publicUrl };
}

module.exports = {
  regenerarHojaVidaAspirante
};
