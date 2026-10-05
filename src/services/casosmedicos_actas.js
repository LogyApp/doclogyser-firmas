const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const { transporter, EMAIL_FROM, HEADER, FOOTER } = require('./email');

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

async function construirDatosPlantillaCasoMedico(idCaso, proceso, { firmaHtml = '' } = {}) {
  const sql = `
    SELECT
      cm.*,
      tc.nombre AS tipo_caso_nombre,
      eg.nombre AS estado_general_nombre,
      pr.nombre AS prioridad_nombre,
      te.nombre AS tipo_evento_nombre,
      diag.Descripción AS diagnostico_desc,
      u.Nombre AS usuario_nombre
    FROM Maestro_casosmedicos cm
    LEFT JOIN Config_Tipo_Caso tc ON cm.tipo_caso_id = tc.id
    LEFT JOIN Config_Estado_General eg ON cm.estado_general_id = eg.id
    LEFT JOIN Config_Prioridad pr ON cm.prioridad_id = pr.id
    LEFT JOIN Config_Tipo_Evento te ON cm.tipo_evento_id = te.id
    LEFT JOIN Config_Diagnostico diag ON cm.diagnostico = diag.Cod
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

  const cargo = (vinc && vinc.Cargo) || '—';
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

  const datos = {
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
    diagnostico_cod: caso.diagnostico || '—',
    diagnostico_desc: caso.diagnostico_desc || (caso.diagnostico ? 'Diagnóstico médico' : 'Sin diagnóstico específico'),
    recomendaciones: caso.recomendaciones || 'Ninguna registrada.',
    responsable_sst: caso.responsable_sst || 'Área de Seguridad y Salud en el Trabajo',
    responsable_operacion: caso.responsable_operacion || '—',
    actividad_actual: caso.actividad_actual || 'Labor asignada',
    fecha_cierre: formatFechaCorta(caso.fecha_cierre || new Date()),
    motivo_cierre: caso.motivo_cierre || 'Finalización satisfactoria y reintegro laboral',
    usuario_registro: caso.usuario_nombre || caso.usuario || 'SST',
    usuario_cierre: caso.usuario_nombre || caso.usuario || 'SST',
    fecha_registro: formatFechaLarga(caso.fecha_registro || new Date()),
    firma_trabajador: firmaHtml,
  };

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

async function notificarActaCasoMedico({ email, nombreTrabajador, tipoActa, codigoCaso, urlFirma }) {
  if (!email || !urlFirma) return false;

  const titulo = tipoActa === 'cierre' ? 'Acta de Cierre de Caso Médico' : 'Acta de Apertura de Caso Médico';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
      ${HEADER}
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
  });

  return true;
}

module.exports = {
  construirDatosPlantillaCasoMedico,
  registrarDocumentoTrabajadorCasoMedico,
  notificarActaCasoMedico,
  formatFechaCorta,
  formatFechaLarga,
};
