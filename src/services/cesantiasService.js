const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const pool = require('./db');
const { subirSoporteCesantias, subirPDFCesantiasSolicitud } = require('./storage');
const { generarPDFDesdeHTML } = require('./renderer');

function fechaHoraBogota() {
  const b = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${b.getFullYear()}-${p(b.getMonth() + 1)}-${p(b.getDate())} ${p(b.getHours())}:${p(b.getMinutes())}:${p(b.getSeconds())}`;
}

function formatearFechaCO(fecha) {
  if (!fecha) return '—';
  const str = fecha instanceof Date ? fecha.toISOString().slice(0, 10) : String(fecha).slice(0, 10);
  const d = new Date(str + 'T12:00:00');
  if (isNaN(d)) return str;
  return d.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function limpiarNombre(nombre) {
  if (!nombre) return '';
  const partes = String(nombre).split(' ** ');
  return (partes.length > 1 ? partes[1] : nombre).trim();
}

function formatearMoneda(val) {
  const num = Number(val) || 0;
  return num.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Buscar Datos del Trabajador ──────────────────────────────────────────────
async function buscarTrabajadorCesantias(identificacion) {
  if (!identificacion) return null;

  const [vinRows] = await pool.execute(
    `SELECT 
       Trabajador,
       \`Identificación\` AS Identificacion,
       Cargo,
       \`Operación\` AS Operacion,
       Regional,
       Estado,
       DATE_FORMAT(\`Fecha de Ingreso\`, '%Y-%m-%d') AS FechaIngreso,
       \`Id Vinculación\` AS IdVinculacion
     FROM \`Maestro_Vinculación\`
     WHERE \`Identificación\` = ?
     ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
    [identificacion]
  );

  if (!vinRows.length) return null;
  const vin = vinRows[0];

  const [segRows] = await pool.execute(
    `SELECT 
       \`Celular\` AS Telefono,
       \`Email\` AS Email,
       \`Cesantías\` AS Cesantias
     FROM \`Maestro_Segmentación\`
     WHERE \`Identificación\` = ? LIMIT 1`,
    [identificacion]
  );
  const seg = segRows[0] || {};

  let ciudad = '';
  if (vin.Regional) {
    const [ciuRows] = await pool.execute(
      'SELECT Ciudad FROM Config_Regionales WHERE Regional = ? LIMIT 1',
      [vin.Regional]
    );
    if (ciuRows.length && ciuRows[0].Ciudad) {
      ciudad = ciuRows[0].Ciudad;
    }
  }

  return {
    identificacion: String(vin.Identificacion),
    nombre: limpiarNombre(vin.Trabajador),
    cargo: vin.Cargo || '—',
    operacion: vin.Operacion || '—',
    regional: vin.Regional || '—',
    estado: vin.Estado || '—',
    fechaIngreso: vin.FechaIngreso || '—',
    telefono: seg.Telefono || '—',
    email: seg.Email || '—',
    fondoCesantias: seg.Cesantias || '—',
    ciudadSede: ciudad,
  };
}

// ── Catálogo de Motivos ──────────────────────────────────────────────────────
async function obtenerMotivosCesantias() {
  const [rows] = await pool.execute(
    'SELECT Id, tipo_retiro, motivo_retiro FROM Config_MotivoCesantias ORDER BY tipo_retiro, Id'
  );
  return rows;
}

// ── Listado de Solicitudes ───────────────────────────────────────────────────
async function listarSolicitudesCesantias(filtros = {}, acceso = {}) {
  const conds = [];
  const params = [];

  // Control de acceso por regional/operación
  if (acceso && !acceso.sinFiltro) {
    if (!acceso.operacionesFiltro || !acceso.operacionesFiltro.length) {
      return {
        results: [],
        counts: { total: 0, pendiente: 0, validado: 0, aprobado: 0, tramitado: 0, rechazado: 0, devuelto: 0, cancelado: 0 },
        regionales: [],
        operaciones: []
      };
    }
    const ph = acceso.operacionesFiltro.map(() => '?').join(',');
    conds.push(`v.\`Operación\` IN (${ph})`);
    params.push(...acceso.operacionesFiltro);
  }

  if (filtros.regional) {
    conds.push('v.`Regional` = ?');
    params.push(filtros.regional);
  }

  if (filtros.operacion) {
    conds.push('v.`Operación` = ?');
    params.push(filtros.operacion);
  }

  if (filtros.estado) {
    conds.push('c.estado = ?');
    params.push(filtros.estado);
  }

  if (filtros.motivo) {
    conds.push('c.motivo_retiro = ?');
    params.push(filtros.motivo);
  }

  if (filtros.busqueda) {
    const like = `%${filtros.busqueda}%`;
    conds.push(`(c.identificacion LIKE ? OR v.\`Trabajador\` LIKE ? OR c.Id LIKE ?)`);
    params.push(like, like, like);
  }

  if (filtros.fechaDesde) {
    conds.push('DATE(c.fecha_registro) >= ?');
    params.push(filtros.fechaDesde);
  }
  if (filtros.fechaHasta) {
    conds.push('DATE(c.fecha_registro) <= ?');
    params.push(filtros.fechaHasta);
  }

  const whereClause = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const query = `
    SELECT 
      c.Id,
      c.identificacion,
      v.\`Trabajador\` AS trabajador,
      v.\`Cargo\` AS cargo,
      v.\`Regional\` AS regional,
      v.\`Operación\` AS operacion,
      c.ciudad_solicitud,
      c.fondo_cesantias,
      c.monto_solicitado,
      c.motivo_retiro,
      m.tipo_retiro,
      m.motivo_retiro AS motivo_texto,
      c.aplica_conyuge,
      c.institucion_educativa,
      c.programa_academico,
      c.semestre,
      c.nombre_beneficiario,
      c.identificacion_beneficiario,
      c.estado,
      c.validado_por,
      DATE_FORMAT(c.fecha_validacion, '%Y-%m-%d %H:%i') AS fecha_validacion,
      c.gestionado_por,
      DATE_FORMAT(c.fecha_gestion, '%Y-%m-%d %H:%i') AS fecha_gestion,
      c.tramitado_por,
      DATE_FORMAT(c.fecha_tramite, '%Y-%m-%d %H:%i') AS fecha_tramite,
      c.observaciones,
      DATE_FORMAT(c.fecha_registro, '%Y-%m-%d %H:%i') AS fecha_registro,
      c.token_firma,
      (c.firma_trabajador IS NOT NULL) AS firmado
    FROM Dynamic_Cesantias c
    LEFT JOIN Config_MotivoCesantias m ON c.motivo_retiro = m.Id
    LEFT JOIN (
      SELECT 
        v1.\`Identificación\`, v1.\`Trabajador\`, v1.\`Cargo\`, v1.\`Regional\`, v1.\`Operación\`
      FROM \`Maestro_Vinculación\` v1
      INNER JOIN (
        SELECT \`Identificación\`, MAX(\`Fecha de Ingreso\`) AS max_ingreso
        FROM \`Maestro_Vinculación\`
        GROUP BY \`Identificación\`
      ) v2 ON v1.\`Identificación\` = v2.\`Identificación\` AND v1.\`Fecha de Ingreso\` = v2.max_ingreso
    ) v ON c.identificacion = v.\`Identificación\`
    ${whereClause}
    ORDER BY c.fecha_registro DESC
    LIMIT 500
  `;

  const [results] = await pool.execute(query, params);

  // Conteos por estado en base al filtro de seguridad
  const baseConds = [];
  const baseParams = [];
  if (acceso && !acceso.sinFiltro && acceso.operacionesFiltro && acceso.operacionesFiltro.length) {
    const ph = acceso.operacionesFiltro.map(() => '?').join(',');
    baseConds.push(`v.\`Operación\` IN (${ph})`);
    baseParams.push(...acceso.operacionesFiltro);
  }
  const baseWhere = baseConds.length ? `WHERE ${baseConds.join(' AND ')}` : '';

  const countQuery = `
    SELECT c.estado, COUNT(*) as cant
    FROM Dynamic_Cesantias c
    LEFT JOIN (
      SELECT v1.\`Identificación\`, v1.\`Operación\`
      FROM \`Maestro_Vinculación\` v1
      INNER JOIN (
        SELECT \`Identificación\`, MAX(\`Fecha de Ingreso\`) AS max_ingreso
        FROM \`Maestro_Vinculación\`
        GROUP BY \`Identificación\`
      ) v2 ON v1.\`Identificación\` = v2.\`Identificación\` AND v1.\`Fecha de Ingreso\` = v2.max_ingreso
    ) v ON c.identificacion = v.\`Identificación\`
    ${baseWhere}
    GROUP BY c.estado
  `;
  const [countRows] = await pool.execute(countQuery, baseParams);

  const counts = {
    total: 0,
    pendiente: 0,
    validado: 0,
    aprobado: 0,
    tramitado: 0,
    rechazado: 0,
    devuelto: 0,
    cancelado: 0,
  };
  countRows.forEach(r => {
    if (counts[r.estado] !== undefined) {
      counts[r.estado] = r.cant;
    }
    counts.total += r.cant;
  });

  return { results, counts };
}

// ── Crear Solicitud de Cesantías ─────────────────────────────────────────────
async function crearSolicitudCesantias(datos, files = []) {
  const {
    identificacion,
    usuario,
    ciudad_solicitud,
    fondo_cesantias,
    monto_solicitado,
    motivo_retiro,
    aplica_conyuge,
    institucion_educativa,
    programa_academico,
    semestre,
    nombre_beneficiario,
    identificacion_beneficiario,
    firma_base64,
    ip_cliente,
  } = datos;

  if (!identificacion) throw new Error('Identificación requerida.');
  if (!monto_solicitado || Number(monto_solicitado) <= 0) throw new Error('Monto solicitado inválido.');
  if (!motivo_retiro) throw new Error('Motivo de retiro requerido.');

  // Obtener datos del colaborador
  const worker = await buscarTrabajadorCesantias(identificacion);
  if (!worker) throw new Error(`No se encontró trabajador con identificación ${identificacion} en Maestro_Vinculación.`);

  // Obtener motivo de retiro
  const [motivos] = await pool.execute(
    'SELECT Id, tipo_retiro, motivo_retiro FROM Config_MotivoCesantias WHERE Id = ? LIMIT 1',
    [motivo_retiro]
  );
  if (!motivos.length) throw new Error('Motivo de retiro no válido.');
  const motivoInfo = motivos[0];

  // Generar ID único amigable de solicitud: CES-YYYYMMDD-HHMMSS
  const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  const radicadoId = `CES-${ahora.getFullYear()}${p(ahora.getMonth()+1)}${p(ahora.getDate())}-${p(ahora.getHours())}${p(ahora.getMinutes())}${p(ahora.getSeconds())}`;

  const tokenFirma = crypto.randomBytes(24).toString('hex');
  const fechaActual = fechaHoraBogota();

  const insertQuery = `
    INSERT INTO Dynamic_Cesantias (
      Id, identificacion, usuario, ciudad_solicitud, fondo_cesantias,
      monto_solicitado, motivo_retiro, aplica_conyuge,
      institucion_educativa, programa_academico, semestre,
      nombre_beneficiario, identificacion_beneficiario,
      declaracion_aceptada, token_firma, token_expira,
      firma_trabajador, fecha_firma, ip_firma,
      estado, fecha_registro, fecha_actualizacion
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      1, ?, DATE_ADD(NOW(), INTERVAL 30 DAY),
      ?, ?, ?,
      'pendiente', NOW(), NOW()
    )
  `;

  await pool.execute(insertQuery, [
    radicadoId,
    identificacion,
    usuario || 'sistema',
    ciudad_solicitud || worker.ciudadSede || 'BOGOTÁ D.C.',
    fondo_cesantias || worker.fondoCesantias || '—',
    monto_solicitado,
    motivo_retiro,
    aplica_conyuge ? 1 : 0,
    institucion_educativa || null,
    programa_academico || null,
    semestre || null,
    nombre_beneficiario || null,
    identificacion_beneficiario || null,
    tokenFirma,
    firma_base64 || null,
    firma_base64 ? fechaActual : null,
    ip_cliente || null,
  ]);

  // Guardar soportes documentales en GCS y registrar en Maestro_docTrabajador
  if (files && files.length) {
    for (const f of files) {
      try {
        const urlBucket = await subirSoporteCesantias(identificacion, f.buffer, f.originalname);
        const docId = uuidv4();
        const obs = `${motivoInfo.motivo_retiro}${f.fieldname ? ' - ' + f.fieldname : ''}`;

        await pool.execute(
          `INSERT INTO Maestro_docTrabajador (
            id, \`Validación\`, Regional, \`Operación\`, \`Identificación\`, Estado,
            Fecha_Ingreso, TipoDocumento, Prefijo, Doc, Observaciones,
            Visualizar, Solicitud, Justificacion_Solicitud, Usuario, recurso
          ) VALUES (?, 'PEND', ?, ?, ?, ?, ?, '46', 'RCES', ?, ?, NULL, NULL, NULL, ?, ?)`,
          [
            docId,
            worker.regional || null,
            worker.operacion || null,
            identificacion,
            worker.estado || 'Activo',
            worker.fechaIngreso && worker.fechaIngreso !== '—' ? worker.fechaIngreso : null,
            urlBucket,
            obs,
            usuario || 'sistema',
            radicadoId,
          ]
        );
      } catch (errUpload) {
        console.error(`[crearSolicitudCesantias] Error subiendo soporte ${f.originalname}:`, errUpload);
      }
    }
  }

  // Si ya vino con firma digital del trabajador, generamos el PDF automáticamente
  if (firma_base64) {
    try {
      await generarYGuardarPDFCesantias(radicadoId, usuario || 'sistema');
    } catch (errPdf) {
      console.error('[crearSolicitudCesantias] Error generando PDF firmado:', errPdf);
    }
  }

  return { id: radicadoId, tokenFirma };
}

// ── Detalle Completo de una Solicitud ─────────────────────────────────────────
async function obtenerDetalleCesantia(idCesantia) {
  const [rows] = await pool.execute(
    `SELECT 
       c.*,
       m.tipo_retiro,
       m.motivo_retiro AS motivo_texto,
       DATE_FORMAT(c.fecha_registro, '%Y-%m-%d %H:%i:%s') AS fecha_registro_fmt,
       DATE_FORMAT(c.fecha_firma, '%Y-%m-%d %H:%i:%s') AS fecha_firma_fmt,
       DATE_FORMAT(c.fecha_validacion, '%Y-%m-%d %H:%i:%s') AS fecha_validacion_fmt,
       DATE_FORMAT(c.fecha_gestion, '%Y-%m-%d %H:%i:%s') AS fecha_gestion_fmt,
       DATE_FORMAT(c.fecha_tramite, '%Y-%m-%d %H:%i:%s') AS fecha_tramite_fmt
     FROM Dynamic_Cesantias c
     LEFT JOIN Config_MotivoCesantias m ON c.motivo_retiro = m.Id
     WHERE c.Id = ? LIMIT 1`,
    [idCesantia]
  );

  if (!rows.length) return null;
  const sol = rows[0];

  const worker = await buscarTrabajadorCesantias(sol.identificacion);

  // Documentos en Maestro_docTrabajador asociados a esta solicitud
  const [docs] = await pool.execute(
    `SELECT 
       id, \`Validación\` AS validacion, Regional, \`Operación\` AS operacion,
       \`Identificación\` AS identificacion, Estado, Fecha_Ingreso, TipoDocumento,
       Prefijo, Doc, Observaciones, Url, FechaRegistro, Usuario, recurso
     FROM Maestro_docTrabajador
     WHERE recurso = ? AND TipoDocumento = '46'
     ORDER BY FechaRegistro DESC`,
    [idCesantia]
  );

  return {
    solicitud: sol,
    trabajador: worker,
    documentos: docs,
  };
}

// ── Transición de Estado ─────────────────────────────────────────────────────
async function actualizarEstadoCesantia(idCesantia, nuevoEstado, usuario, observaciones = '') {
  const estadosValidos = ['pendiente', 'validado', 'aprobado', 'tramitado', 'rechazado', 'cancelado', 'devuelto'];
  if (!estadosValidos.includes(nuevoEstado)) {
    throw new Error(`Estado "${nuevoEstado}" no es válido.`);
  }

  const [exist] = await pool.execute('SELECT Id, estado, identificacion, firma_trabajador FROM Dynamic_Cesantias WHERE Id = ? LIMIT 1', [idCesantia]);
  if (!exist.length) throw new Error('Solicitud no encontrada.');

  const fechaActual = fechaHoraBogota();
  let query = '';
  let params = [];

  if (nuevoEstado === 'validado') {
    query = `
      UPDATE Dynamic_Cesantias 
      SET estado = 'validado',
          validado_por = ?,
          fecha_validacion = ?,
          observaciones = IF(LENGTH(?) > 0, ?, observaciones),
          fecha_actualizacion = NOW()
      WHERE Id = ?
    `;
    params = [usuario, fechaActual, observaciones, observaciones, idCesantia];
  } else if (['aprobado', 'rechazado', 'cancelado', 'devuelto'].includes(nuevoEstado)) {
    query = `
      UPDATE Dynamic_Cesantias 
      SET estado = ?,
          gestionado_por = ?,
          fecha_gestion = ?,
          observaciones = IF(LENGTH(?) > 0, ?, observaciones),
          fecha_actualizacion = NOW()
      WHERE Id = ?
    `;
    params = [nuevoEstado, usuario, fechaActual, observaciones, observaciones, idCesantia];
  } else if (nuevoEstado === 'tramitado') {
    query = `
      UPDATE Dynamic_Cesantias 
      SET estado = 'tramitado',
          tramitado_por = ?,
          fecha_tramite = ?,
          observaciones = IF(LENGTH(?) > 0, ?, observaciones),
          fecha_actualizacion = NOW()
      WHERE Id = ?
    `;
    params = [usuario, fechaActual, observaciones, observaciones, idCesantia];
  } else {
    query = `
      UPDATE Dynamic_Cesantias 
      SET estado = ?,
          observaciones = IF(LENGTH(?) > 0, ?, observaciones),
          fecha_actualizacion = NOW()
      WHERE Id = ?
    `;
    params = [nuevoEstado, observaciones, observaciones, idCesantia];
  }

  await pool.execute(query, params);

  // Si se aprueba y aún no se generó el PDF formal firmado (o se requiere actualizar), lo generamos
  if (nuevoEstado === 'aprobado' && exist[0].firma_trabajador) {
    try {
      await generarYGuardarPDFCesantias(idCesantia, usuario);
    } catch (e) {
      console.warn('[actualizarEstadoCesantia] Advertencia al generar PDF en aprobación:', e.message);
    }
  }

  return { ok: true, estado: nuevoEstado };
}

// ── Firma del Trabajador ─────────────────────────────────────────────────────
async function registrarFirmaTrabajador(idCesantia, firmaBase64, ipCliente) {
  const fechaActual = fechaHoraBogota();
  await pool.execute(
    `UPDATE Dynamic_Cesantias 
     SET firma_trabajador = ?,
         fecha_firma = ?,
         ip_firma = ?,
         fecha_actualizacion = NOW()
     WHERE Id = ?`,
    [firmaBase64, fechaActual, ipCliente || null, idCesantia]
  );

  return await generarYGuardarPDFCesantias(idCesantia, 'trabajador');
}

// ── Generación y Almacenamiento del PDF ───────────────────────────────────────
async function generarYGuardarPDFCesantias(idCesantia, usuario = 'sistema') {
  const detalle = await obtenerDetalleCesantia(idCesantia);
  if (!detalle) throw new Error('Solicitud no encontrada.');

  const { solicitud: sol, trabajador: tra } = detalle;

  // Cargar plantilla desde Maestro_Plantillas
  const [pltRows] = await pool.execute(
    'SELECT contenido_html FROM Maestro_Plantillas WHERE nombre_proceso = ? AND activo = 1 LIMIT 1',
    ['solicitud_cesantias']
  );
  if (!pltRows.length) throw new Error('Plantilla "solicitud_cesantias" no encontrada en Maestro_Plantillas.');

  let templateHtml = pltRows[0].contenido_html;

  // Construcción de la sección específica según la modalidad
  let seccionEspecifica = '';
  const esVivienda = String(sol.tipo_retiro).trim().toLowerCase() === 'vivienda';

  if (esVivienda) {
    seccionEspecifica = `
      <section class="section-block">
        <div class="section-title">Detalle de la Modalidad — Vivienda</div>
        <table class="data-grid">
          <tr>
            <td class="data-label">Destino Específico:</td>
            <td class="data-val" colspan="3"><strong>${sol.motivo_texto || sol.motivo_retiro}</strong></td>
          </tr>
          <tr>
            <td class="data-label">Aplica Cónyuge / Compañero(a):</td>
            <td class="data-val" colspan="3">${sol.aplica_conyuge ? 'SÍ (Se adjunta documento de parentesco)' : 'NO (A nombre directo del trabajador)'}</td>
          </tr>
        </table>
        <div class="support-list">
          <div class="support-item">✓ Soportes de propiedad / compraventa / liberación de gravamen verificados en el expediente.</div>
          <div class="support-item">✓ Verificación de inversión conforme al Artículo 256 del C.S.T. y Decreto 1072 de 2015.</div>
        </div>
      </section>
    `;
  } else {
    seccionEspecifica = `
      <section class="section-block">
        <div class="section-title">Detalle de la Modalidad — Educación Superior</div>
        <table class="data-grid">
          <tr>
            <td class="data-label">Institución Educativa:</td>
            <td class="data-val"><strong>${sol.institucion_educativa || '—'}</strong></td>
            <td class="data-label">Programa Académico:</td>
            <td class="data-val"><strong>${sol.programa_academico || '—'}</strong></td>
          </tr>
          <tr>
            <td class="data-label">Semestre / Ciclo:</td>
            <td class="data-val">${sol.semestre || '—'}</td>
            <td class="data-label">Beneficiario:</td>
            <td class="data-val"><strong>${sol.nombre_beneficiario || tra.nombre}</strong> (C.C./T.I. ${sol.identificacion_beneficiario || tra.identificacion})</td>
          </tr>
        </table>
        <div class="support-list">
          <div class="support-item">✓ Certificado o recibo de matrícula de institución de educación superior reconocida por el MEN.</div>
          <div class="support-item">✓ Documentación que acredita el parentesco / vínculo familiar con el beneficiario.</div>
        </div>
      </section>
    `;
  }

  // Firma electrónica del trabajador HTML
  const firmaHtml = sol.firma_trabajador
    ? `<img src="${sol.firma_trabajador}" style="max-height: 70px; display: block; margin: 0 auto;">`
    : `<div style="height: 60px; line-height: 60px; color: #94a3b8; font-style: italic;">Pendiente de firma</div>`;

  const datosReemplazo = {
    id_solicitud: sol.Id,
    monto_solicitado: formatearMoneda(sol.monto_solicitado),
    fondo_cesantias: sol.fondo_cesantias || '—',
    tipo_retiro: sol.tipo_retiro || '—',
    motivo_retiro: sol.motivo_texto || '—',
    nombre_trabajador: tra.nombre,
    identificacion: tra.identificacion,
    cargo: tra.cargo,
    operacion: tra.operacion,
    regional: tra.regional,
    telefono: tra.telefono,
    email: tra.email,
    ciudad_solicitud: sol.ciudad_solicitud || tra.ciudadSede || 'BOGOTÁ D.C.',
    fecha_registro: formatearFechaCO(sol.fecha_registro),
    fecha_ingreso: formatearFechaCO(tra.fechaIngreso),
    seccion_especifica: seccionEspecifica,
    firma_trabajador_html: firmaHtml,
    fecha_firma: sol.fecha_firma ? formatearFechaCO(sol.fecha_firma) : 'Pendiente',
    ip_firma: sol.ip_firma || '—',
    token_firma: sol.token_firma ? `${sol.token_firma.slice(0, 8)}...` : '—',
  };

  // Reemplazo de variables {{key}}
  let htmlFinal = templateHtml;
  for (const [k, v] of Object.entries(datosReemplazo)) {
    const regex = new RegExp(`{{\\s*${k}\\s*}}`, 'g');
    htmlFinal = htmlFinal.replace(regex, String(v == null ? '' : v));
  }

  // Generar buffer PDF con Puppeteer
  const pdfBuffer = await generarPDFDesdeHTML(htmlFinal);

  // Subir a GCS en talenthub_central/[identificacion]/[identificacion].RCES.yyyymmddhhmmss.pdf
  const pdfUrl = await subirPDFCesantiasSolicitud(tra.identificacion, pdfBuffer);

  // Comprobar si ya existe un registro del formato de solicitud en Maestro_docTrabajador para actualizar o insertar
  const [docExistente] = await pool.execute(
    `SELECT id FROM Maestro_docTrabajador 
     WHERE recurso = ? AND TipoDocumento = '46' AND Observaciones = 'Formato de Solicitud de Retiro de Cesantías' 
     LIMIT 1`,
    [sol.Id]
  );

  if (docExistente.length) {
    await pool.execute(
      `UPDATE Maestro_docTrabajador SET Doc = ?, FechaRegistro = NOW(), Usuario = ? WHERE id = ?`,
      [pdfUrl, usuario, docExistente[0].id]
    );
  } else {
    const docId = uuidv4();
    await pool.execute(
      `INSERT INTO Maestro_docTrabajador (
        id, \`Validación\`, Regional, \`Operación\`, \`Identificación\`, Estado,
        Fecha_Ingreso, TipoDocumento, Prefijo, Doc, Observaciones,
        Visualizar, Solicitud, Justificacion_Solicitud, Usuario, recurso
      ) VALUES (?, 'PEND', ?, ?, ?, ?, ?, '46', 'RCES', ?, 'Formato de Solicitud de Retiro de Cesantías', NULL, NULL, NULL, ?, ?)`,
      [
        docId,
        tra.regional || null,
        tra.operacion || null,
        tra.identificacion,
        tra.estado || 'Activo',
        tra.fechaIngreso && tra.fechaIngreso !== '—' ? tra.fechaIngreso : null,
        pdfUrl,
        usuario,
        sol.Id,
      ]
    );
  }

  return { pdfUrl };
}

module.exports = {
  buscarTrabajadorCesantias,
  obtenerMotivosCesantias,
  listarSolicitudesCesantias,
  crearSolicitudCesantias,
  obtenerDetalleCesantia,
  actualizarEstadoCesantia,
  registrarFirmaTrabajador,
  generarYGuardarPDFCesantias,
};
