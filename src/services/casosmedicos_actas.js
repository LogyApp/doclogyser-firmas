const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const { transporter, EMAIL_FROM, FOOTER, encabezadoLogo, LOGO_HEADER_ATTACHMENT, COLOR_ENCABEZADO_AZUL } = require('./email');
const { LOGO_BASE64 } = require('./assets');
const { obtenerPlantilla, reemplazarVariables, firmaConFecha } = require('./plantilla');
const { generarPDFDesdeHTML } = require('./renderer');
const { subirPDFActa } = require('./storage');
const { firmanteSstActas, estadoCompromiso } = require('./casosMedicosMatriz');

function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fechaHoraBogotaTexto(d = new Date()) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

function formatFechaLarga(fecha) {
  if (!fecha) return '—';
  const d = new Date(fecha);
  if (isNaN(d)) return String(fecha);
  return d.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatFechaCorta(fecha) {
  if (!fecha) return '—';
  const d = new Date(fecha);
  if (isNaN(d)) return String(fecha);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function recortar(texto, max) {
  const s = String(texto || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max).replace(/\s+\S*$/, '').replace(/[\s.,;:]+$/, '')}…` : s;
}

// Bloque de firma: imagen con "Firmado: dd/mm/aaaa hh:mm" debajo, o el aviso si aún no firma
function bloqueFirma(src, fecha, aviso) {
  return src
    ? firmaConFecha(`<img src="${esc(src)}" class="sig-img" style="max-height:60px;max-width:200px;display:block;margin:0 auto;" alt="Firma"/>`, fecha)
    : `<span class="firma-nota">${aviso}</span>`;
}

// Restricciones vigentes o sin fecha fin del caso (tabla de la matriz); si no hay, las recomendaciones del caso
async function htmlRestricciones(caso) {
  const [rows] = await pool.execute(
    `SELECT tipo_concepto, descripcion, temporalidad, fecha_inicio, fecha_fin FROM Maestro_cm_restricciones
     WHERE idcaso = ? AND deleted_at IS NULL AND (fecha_fin IS NULL OR fecha_fin >= CURDATE() OR ? = 2)
     ORDER BY COALESCE(fecha_inicio, fecha_concepto) DESC, id DESC LIMIT 6`,
    [caso.id, Number(caso.estado_general_id)]
  );
  if (!rows.length) return `<p class="statement-text">${esc(caso.recomendaciones || 'Ninguna registrada.')}</p>`;
  return `<table class="mini-table"><tr><th style="width:16%">Vigencia</th><th>Restricción / recomendación funcional</th><th style="width:15%">Tipo</th></tr>${rows.map(r => `
    <tr><td>${r.fecha_inicio ? formatFechaCorta(r.fecha_inicio) : '—'}<br>${r.fecha_fin ? `al ${formatFechaCorta(r.fecha_fin)}` : esc(r.temporalidad || 'Sin fecha fin')}</td>
    <td>${esc(r.descripcion || '—')}</td><td>${esc(r.tipo_concepto || '—')}</td></tr>`).join('')}</table>`;
}

// Compromisos del caso (como la sección 5 del acta de la matriz) y su % de cumplimiento
async function htmlCompromisos(caso) {
  const [rows] = await pool.execute(
    `SELECT compromiso, responsable, fecha_inicial, fecha_vigente, fecha_cumplimiento FROM Maestro_cm_compromisos
     WHERE idcaso = ? AND deleted_at IS NULL ORDER BY COALESCE(fecha_vigente, fecha_inicial), id`, [caso.id]);
  const total = rows.length;
  const cumplidos = rows.filter(r => r.fecha_cumplimiento).length;
  if (!total) return { html: '<p class="statement-text">Sin compromisos registrados.</p>', resumen: 'Sin compromisos registrados' };
  // En el acta (una hoja) van los 6 más recientes; el resumen cuenta todos
  const lista = rows.slice(-6).map(r => {
    const estado = estadoCompromiso(r);
    return `<tr><td>${esc(r.compromiso || '—')}</td><td>${esc(r.responsable || '—')}</td>
      <td>${formatFechaCorta(r.fecha_vigente || r.fecha_inicial)}</td><td>${esc(estado)}</td></tr>`;
  }).join('');
  return {
    html: `<table class="mini-table"><tr><th>Compromiso</th><th style="width:16%">Responsable</th><th style="width:13%">Fecha vigente</th><th style="width:15%">Estado</th></tr>${lista}</table>`,
    resumen: `${total} registrado${total === 1 ? '' : 's'} · ${cumplidos} cumplido${cumplidos === 1 ? '' : 's'} · ${Math.round((cumplidos / total) * 100)}% de cumplimiento${total > 6 ? ' (se muestran los 6 más recientes)' : ''}`,
  };
}

// opciones.firmaHtml: firma del trabajador ya armada (vista para firmar: ''); sin ella se usa la guardada.
async function construirDatosPlantillaCasoMedico(idCaso, proceso, opciones = {}) {
  const sql = `
    SELECT
      cm.*,
      tc.nombre AS tipo_caso_nombre,
      eg.nombre AS estado_general_nombre,
      pr.nombre AS prioridad_nombre,
      te.nombre AS tipo_evento_nombre,
      u.Nombre AS usuario_nombre
    FROM Maestro_casosmedicos cm
    LEFT JOIN Config_Tipo_Caso tc ON cm.tipo_caso_id = tc.id
    LEFT JOIN Config_Estado_General eg ON cm.estado_general_id = eg.id
    LEFT JOIN Config_Prioridad pr ON cm.prioridad_id = pr.id
    LEFT JOIN Config_Tipo_Evento te ON cm.tipo_evento_id = te.id
    LEFT JOIN Maestro_Usuarios u ON cm.usuario = u.ID
    WHERE cm.id = ?
    LIMIT 1
  `;
  const [[caso]] = await pool.execute(sql, [idCaso]);
  if (!caso) throw new Error('Caso médico no encontrado');

  const [[vinc]] = await pool.execute(
    `SELECT Trabajador, Cargo, Regional, \`Operación\`, Estado, \`Fecha de Ingreso\`
     FROM \`Maestro_Vinculación\`
     WHERE Identificación = ?
     ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
    [caso.identificacion]
  );

  const [[seg]] = await pool.execute(
    'SELECT Trabajador, EPS, Pensión, Celular, Email FROM `Maestro_Segmentación` WHERE Identificación = ? LIMIT 1',
    [caso.identificacion]
  );

  const trabajadorRaw = (vinc && vinc.Trabajador) || (seg && seg.Trabajador) || '';
  const partes = trabajadorRaw.split(' ** ');
  const nombreTrabajador = partes.length > 1 ? partes[1].trim() : (trabajadorRaw || String(caso.identificacion));

  const cargo = (vinc && vinc.Cargo) || caso.cargo || '—';
  const regional = caso.regional_id || (vinc && vinc.Regional) || 'CENTRO';
  const operacion = caso.operacion || (vinc && vinc['Operación']) || '—';
  const fechaIngreso = caso.fecha_ingreso ? formatFechaCorta(caso.fecha_ingreso) : (vinc && vinc['Fecha de Ingreso'] ? formatFechaCorta(vinc['Fecha de Ingreso']) : '—');

  const eps = caso.eps_id || (seg && seg.EPS) || '—';
  const afp = caso.afp_id || (seg && seg.Pensión) || '—';

  let periodoRecomendaciones = 'Sin definir';
  if (caso.fecha_inicio && caso.fecha_fin) {
    periodoRecomendaciones = `${formatFechaCorta(caso.fecha_inicio)} al ${formatFechaCorta(caso.fecha_fin)}`;
  } else if (caso.fecha_inicio) {
    periodoRecomendaciones = `Desde ${formatFechaCorta(caso.fecha_inicio)}`;
  }

  // Textos escapados: los escribe el usuario y van dentro del HTML de la plantilla
  const datosTexto = {
    codigo_caso: caso.codigo_caso || `CM-${String(caso.id).padStart(4, '0')}`,
    nombre_trabajador: nombreTrabajador,
    identificacion: caso.identificacion,
    cargo,
    regional,
    operacion,
    fecha_ingreso: fechaIngreso,
    eps,
    afp,
    tipo_caso: caso.tipo_caso_nombre || 'General',
    tipo_evento: caso.tipo_evento_nombre || 'Común',
    fecha_evento: formatFechaCorta(caso.fecha_evento),
    dias_incapacidad: caso.dias_incapacidad != null ? String(caso.dias_incapacidad) : '0',
    pcl_porcentaje: caso.pcl_porcentaje != null ? `${caso.pcl_porcentaje}%` : '0%',
    periodo_recomendaciones: periodoRecomendaciones,
    // Sin diagnóstico: el acta solo lleva la restricción funcional (Res. 1843/2025, Ley 1581 de 2012)
    recomendaciones: caso.recomendaciones || 'Ninguna registrada.',
    responsable_sst: caso.responsable_sst || 'Área de Seguridad y Salud en el Trabajo',
    responsable_operacion: caso.responsable_operacion || '—',
    jefe_inmediato: caso.responsable_operacion || '—',
    area: caso.area || '—',
    origen: caso.origen || '—',
    estado_laboral: caso.estado_laboral || '—',
    tipo_concepto: caso.tipo_concepto || '—',
    fecha_ultimo_concepto: formatFechaCorta(caso.fecha_ultimo_concepto),
    incapacidad: [
      caso.fecha_inicio_incap ? `${formatFechaCorta(caso.fecha_inicio_incap)}${caso.fecha_fin_incap ? ` al ${formatFechaCorta(caso.fecha_fin_incap)}` : ''}` : '',
      Number(caso.dias_incapacidad) > 0 ? `${caso.dias_incapacidad} días acumulados` : '',
    ].filter(Boolean).join(' · ') || '—',
    adaptacion: [caso.adaptacion_implementada ? `Implementada: ${caso.adaptacion_implementada}` : '', caso.estado_adaptacion || '',
      caso.fecha_limite_adaptacion ? `límite ${formatFechaCorta(caso.fecha_limite_adaptacion)}` : ''].filter(Boolean).join(' · ') || '—',
    proceso_calificacion: caso.proceso_calificacion || '—',
    // Corta: el acta es de una hoja y la observación completa queda en el expediente
    observacion_administrativa: recortar(caso.observacion_administrativa, 400) || 'Sin observaciones.',
    actividad_actual: caso.actividad_actual || 'Labor asignada',
    fecha_cierre: formatFechaCorta(caso.fecha_cierre || new Date()),
    motivo_cierre: caso.motivo_cierre || 'Finalización satisfactoria y reintegro laboral',
    usuario_registro: caso.usuario_nombre || caso.usuario || 'SST',
    usuario_cierre: caso.usuario_nombre || caso.usuario || 'SST',
    fecha_registro: formatFechaLarga(caso.fecha_registro || new Date()),
  };
  const datos = Object.fromEntries(Object.entries(datosTexto).map(([k, v]) => [k, esc(v)]));

  // Firmas: trabajador, jefe inmediato (cada uno con su enlace) y Líder SST (firma registrada)
  const tipo = proceso === 'acta_cierre_cm' ? 'cierre' : 'apertura';
  const firmaTrab = caso[`firma_${tipo}`] || caso[`url_firma_${tipo}`];
  const fechaTrab = caso[`fecha_firma_${tipo}`];
  const fechaJefe = caso[`fecha_firma_jefe_${tipo}`];
  const sst = await firmanteSstActas();
  const fechaSst = [fechaTrab, fechaJefe].filter(Boolean).map(f => new Date(f)).sort((a, b) => a - b).pop() || null;
  const compromisos = await htmlCompromisos(caso);

  Object.assign(datos, {
    firma_trabajador: opciones.firmaHtml !== undefined ? opciones.firmaHtml : (firmaTrab ? bloqueFirma(firmaTrab, fechaTrab) : ''),
    firma_jefe: bloqueFirma(caso[`firma_jefe_${tipo}`], fechaJefe, 'Firma pendiente'),
    firma_sst: (firmaTrab || caso[`firma_jefe_${tipo}`]) && sst.urlFirma ? bloqueFirma(sst.urlFirma, fechaSst) : `<span class="firma-nota">${sst.urlFirma ? 'Se firma con el acta' : 'Sin firma registrada'}</span>`,
    nombre_sst: esc(sst.nombre || caso.responsable_sst || 'Líder SST'),
    cargo_sst: esc(sst.cargo || 'Líder SST'),
    restricciones_html: await htmlRestricciones(caso),
    compromisos_html: compromisos.html,
    compromisos_resumen: esc(compromisos.resumen),
    // Diseño moderno
    logo_src: LOGO_BASE64,
    fecha_generacion: fechaHoraBogotaTexto(),
    // Si Maestro_Plantillas no tiene código, versión o fecha del formato, queda en blanco
    codigo_formato: '',
    version_formato: '',
    fecha_formato: '',
  });

  return { caso, datos };
}

async function registrarDocumentoTrabajadorCasoMedico({ caso, tipoDocumento, prefijo, urlActa, usuario, tipoActa }) {
  const [[vinc]] = await pool.execute(
    'SELECT Estado, `Fecha de Ingreso`, Regional, `Operación` FROM `Maestro_Vinculación` WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
    [caso.identificacion]
  );
  const estadoVinc = vinc ? vinc.Estado : 'Activo';
  const fechaIngreso = vinc ? vinc['Fecha de Ingreso'] : (caso.fecha_ingreso || null);
  const regionalFinal = caso.regional_id || (vinc && vinc.Regional) || 'CENTRO';
  const operacionFinal = caso.operacion || (vinc && vinc['Operación']) || '';

  const tipoTexto = (tipoActa === 'cierre' || prefijo === 'ACCM') ? 'cierre' : 'apertura';
  const observaciones = `Acta de ${tipoTexto} caso médico ${caso.codigo_caso || '#' + caso.id}`;

  await pool.execute(
    `INSERT INTO Maestro_docTrabajador
     (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
      TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud,
      Justificacion_Solicitud, FechaRegistro, Usuario, Usuario_Solicitud, Estado_Solicitud)
     VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NOW(), ?, NULL, NULL)`,
    [
      uuidv4(),
      regionalFinal,
      operacionFinal,
      caso.identificacion,
      estadoVinc,
      fechaIngreso,
      String(tipoDocumento),
      prefijo,
      urlActa,
      observaciones,
      usuario || caso.usuario || 'SST',
    ]
  );
}

// Genera el PDF del acta con las firmas guardadas y lo deja en la misma ruta del bucket (reemplaza el
// anterior). La primera vez lo registra en Maestro_docTrabajador (doc 94 apertura / 95 cierre).
async function generarPdfActaCasoMedico(idCaso, tipo, { usuario } = {}) {
  const esApertura = tipo === 'apertura';
  const proc = esApertura ? 'acta_apertura_cm' : 'acta_cierre_cm';
  const plantilla = await obtenerPlantilla(proc);
  const { caso, datos } = await construirDatosPlantillaCasoMedico(idCaso, proc);
  const pdf = await generarPDFDesdeHTML(reemplazarVariables(plantilla.contenido_html || '', datos));
  const prefijo = esApertura ? 'AACM' : 'ACCM';
  const urlActa = await subirPDFActa(caso.identificacion, prefijo, idCaso, pdf);
  const colUrl = esApertura ? 'url_acta_apertura' : 'url_acta_cierre';
  if (!caso[colUrl]) {
    await pool.execute(`UPDATE Maestro_casosmedicos SET ${colUrl} = ? WHERE id = ?`, [urlActa, idCaso]);
    await registrarDocumentoTrabajadorCasoMedico({
      caso, tipoDocumento: esApertura ? '94' : '95', prefijo, urlActa, usuario: usuario || caso.usuario, tipoActa: tipo,
    });
  }
  return urlActa;
}

async function notificarActaCasoMedico({ email, nombreTrabajador, tipoActa, codigoCaso, urlFirma }) {
  if (!email || !urlFirma) return false;

  const titulo = tipoActa === 'cierre' ? 'Acta de Cierre de Caso Médico' : 'Acta de Apertura de Caso Médico';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
${encabezadoLogo(COLOR_ENCABEZADO_AZUL)}
      <div style="padding:28px 24px;color:#222;line-height:1.6">
        <h2 style="color:#1B2A5E;margin-top:0;font-size:1.15rem">${titulo}</h2>
        <p>Hola <strong>${nombreTrabajador}</strong>,</p>
        <p>El área de <strong>Seguridad y Salud en el Trabajo (SST)</strong> ha emitido el documento correspondiente a tu caso médico <strong>${codigoCaso}</strong>.</p>
        <p>Por favor ingresa al siguiente enlace para revisar y firmar digitalmente el acta:</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${urlFirma}" style="background:#F15A22;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;letter-spacing:.3px">
            Firmar Documento
          </a>
        </div>
        <p style="font-size:0.83rem;color:#777">
          Este enlace es personal e intransferible y tiene una vigencia de 48 horas.
        </p>
      </div>
      ${FOOTER}
    </div>
  `;

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: email,
    subject: `Firma requerida: ${titulo} (${codigoCaso})`,
    html,
    attachments: [LOGO_HEADER_ATTACHMENT],
  });

  return true;
}

module.exports = {
  construirDatosPlantillaCasoMedico,
  registrarDocumentoTrabajadorCasoMedico,
  generarPdfActaCasoMedico,
  notificarActaCasoMedico,
  formatFechaCorta,
  formatFechaLarga,
};
