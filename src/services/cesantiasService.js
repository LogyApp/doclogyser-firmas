const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const pool = require('./db');
const {
  subirSoporteCesantias,
  subirCedulaTrabajador,
  subirPDFCesantiasSolicitud,
  eliminarArchivoBucket,
  obtenerUrlFirmaReciente,
  obtenerFirmaBase64Reciente,
  subirFirma
} = require('./storage');
const { enviarNotificacionCesantias } = require('./email');
const { generarPDFDesdeHTML } = require('./renderer');
const { LOGO_BASE64 } = require('./assets');

// ── Helpers de Config_Parametros para Cesantías ─────────────────────────────
async function obtenerParametroCesantias(concepto) {
  const [rows] = await pool.execute(
    `SELECT Parametro FROM Config_Parametros 
     WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = ? 
     LIMIT 1`,
    [concepto]
  );
  if (!rows.length || !rows[0].Parametro) return null;
  return rows[0].Parametro;
}

async function obtenerRolesPermisoCesantias(concepto) {
  const param = await obtenerParametroCesantias(concepto);
  if (!param) return [];
  return param.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

async function verificarPermisoRolCesantias(rolUsuario, concepto) {
  if (!rolUsuario) return false;
  const roles = await obtenerRolesPermisoCesantias(concepto);
  const rolNorm = String(rolUsuario).trim().toLowerCase();
  return roles.includes(rolNorm);
}

async function obtenerOperacionesSinValidacion() {
  const param = await obtenerParametroCesantias('Operación no requiere Validacion');
  if (!param) return ['administracion'];
  return param.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

async function obtenerPermisosUsuarioCesantias(rolUsuario) {
  const [rows] = await pool.execute(
    `SELECT Concepto, Parametro FROM Config_Parametros 
     WHERE Modulo = 'nomina' AND Seccion = 'Cesantias'`
  );
  const paramMap = {};
  for (const r of rows) {
    paramMap[r.Concepto] = (r.Parametro || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  }

  const rolNorm = String(rolUsuario || '').trim().toLowerCase();
  const check = (concepto, fallbackRoles = []) => {
    const list = paramMap[concepto];
    if (list && list.length) {
      return list.includes(rolNorm);
    }
    return fallbackRoles.map(r => r.toLowerCase()).includes(rolNorm);
  };

  const opsSinVal = (paramMap['Operación no requiere Validacion'] || ['administracion']);

  return {
    puedeValidar: check('Puede validar registros de Cesantias', ['sistema', 'juridica', 'auxiliar', 'auxiliarr', 'coordinador', 'coordinadorr', 'nomina']),
    puedeAprobar: check('Puede aprobar registros de Cesantias', ['sistema', 'juridica']),
    puedeRechazar: check('Puede rechazar registros de Cesantias', ['sistema', 'juridica']),
    puedeAnular: check('Puede anular registros de Cesantias', ['sistema', 'juridica']),
    puedeEliminar: check('Puede eliminar registros de Cesantias', ['sistema']),
    puedeTramitar: ['nomina', 'sistema'].includes(rolNorm),
    operacionesSinValidacion: opsSinVal,
  };
}

function construirUrlTalenthub(docPath) {
  if (!docPath) return null;
  if (docPath.startsWith('http://') || docPath.startsWith('https://')) return docPath;
  return `https://storage.googleapis.com/talenthub_central/${docPath.replace(/^\/+/, '')}`;
}

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

// ── Búsqueda de Colaboradores para Autocompletado (por nombre o cédula) ──────
async function buscarColaboradoresCesantias(termino) {
  if (!termino || termino.trim().length < 2) return [];
  const q = `%${termino.trim()}%`;
  const [rows] = await pool.execute(
    `SELECT 
       v.Identificación AS identificacion,
       v.Trabajador AS trabajador,
       v.Cargo AS cargo,
       v.\`Operación\` AS operacion,
       v.Regional AS regional,
       v.Estado AS estado
     FROM \`Maestro_Vinculación\` v
     INNER JOIN (
       SELECT \`Identificación\`, MAX(\`Fecha de Ingreso\`) AS max_ingreso
       FROM \`Maestro_Vinculación\`
       GROUP BY \`Identificación\`
     ) m ON v.\`Identificación\` = m.\`Identificación\` AND v.\`Fecha de Ingreso\` = m.max_ingreso
     WHERE (v.\`Identificación\` LIKE ? OR v.\`Trabajador\` COLLATE utf8mb4_0900_ai_ci LIKE ?)
       AND v.Estado = 'Activo'
     ORDER BY v.\`Trabajador\` ASC
     LIMIT 25`,
    [q, q]
  );
  return rows.map(r => ({
    identificacion: String(r.identificacion),
    nombre: limpiarNombre(r.trabajador),
    trabajadorCompleto: r.trabajador,
    cargo: r.cargo || '—',
    operacion: r.operacion || '—',
    regional: r.regional || '—',
    estado: r.estado || 'Activo'
  }));
}

// ── Administradoras de Cesantías (Config_Cesantias sin 'NO COTIZA') ───────────
async function obtenerFondosCesantias() {
  const [rows] = await pool.execute(
    `SELECT DISTINCT \`Administradora de Cesantias\` AS fondo
     FROM Config_Cesantias
     WHERE \`Administradora de Cesantias\` IS NOT NULL
       AND \`Administradora de Cesantias\` != 'NO COTIZA'
       AND TRIM(\`Administradora de Cesantias\`) != ''
     ORDER BY 1 ASC`
  );
  return rows.map(r => r.fondo);
}

// ── Ciudad por Operación y Lista Desplegable por Zona ────────────────────────
async function obtenerCiudadYCiudadesPorOperacion(operacion) {
  if (!operacion) return { prellenar: '', zona: '', ciudades: [] };
  const [opRows] = await pool.execute(
    'SELECT `C.C.` AS cc, `ZONA` AS zona FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
    [operacion]
  );
  if (!opRows.length) return { prellenar: '', zona: '', ciudades: [] };
  const cc = opRows[0].cc || '';
  const zona = opRows[0].zona || '';
  let ciudades = [];
  if (zona) {
    const [ciuRows] = await pool.execute(
      'SELECT DISTINCT Ciudad FROM Config_Ciudades WHERE Departamento = ? ORDER BY Ciudad ASC',
      [zona]
    );
    ciudades = ciuRows.map(c => c.Ciudad).filter(Boolean);
  }
  if (cc && !ciudades.includes(cc)) {
    ciudades.unshift(cc);
  }
  return { prellenar: cc, zona, ciudades };
}

// ── Firma Previa de Bucket firmas-images ─────────────────────────────────────
async function obtenerFirmaPreviaTrabajador(identificacion) {
  if (!identificacion) return { tieneFirma: false, urlFirma: null };
  try {
    const url = await obtenerUrlFirmaReciente(identificacion);
    return { tieneFirma: !!url, urlFirma: url || null };
  } catch (err) {
    console.warn('[obtenerFirmaPreviaTrabajador] Error:', err.message);
    return { tieneFirma: false, urlFirma: null };
  }
}

// ── Cédula Previa en Maestro_docTrabajador (TipoDocumento 11) ─────────────────
async function buscarCedulaPreviaTrabajador(identificacion) {
  if (!identificacion) return { tieneCedulaPrevia: false, urlCedula: null, rawDoc: null, fecha: null };
  try {
    const [rows] = await pool.execute(
      `SELECT id, Doc, Prefijo, Observaciones, DATE_FORMAT(FechaRegistro, '%Y-%m-%d %H:%i') AS fecha
       FROM Maestro_docTrabajador
       WHERE \`Identificación\` = ? AND TipoDocumento = '11'
       ORDER BY FechaRegistro DESC LIMIT 1`,
      [identificacion]
    );
    if (!rows.length || !rows[0].Doc) {
      return { tieneCedulaPrevia: false, urlCedula: null, rawDoc: null, fecha: null };
    }
    const r = rows[0];
    return {
      tieneCedulaPrevia: true,
      urlCedula: construirUrlTalenthub(r.Doc),
      rawDoc: r.Doc,
      fecha: r.fecha || null,
    };
  } catch (err) {
    console.warn('[buscarCedulaPreviaTrabajador] Error:', err.message);
    return { tieneCedulaPrevia: false, urlCedula: null, rawDoc: null, fecha: null };
  }
}

// ── Req 13: Comprobar si existe solicitud activa en Dynamic_Cesantias ───────
async function verificarSolicitudActivaTrabajador(identificacion) {
  if (!identificacion) return { tieneSolicitudActiva: false, solicitud: null };
  const [rows] = await pool.execute(
    `SELECT Id, estado, monto_solicitado, fondo_cesantias, 
            DATE_FORMAT(fecha_registro, '%Y-%m-%d %H:%i') AS fecha_registro
     FROM Dynamic_Cesantias
     WHERE identificacion = ? 
       AND estado NOT IN ('tramitado', 'anulado', 'cancelado', 'rechazado')
     ORDER BY fecha_registro DESC 
     LIMIT 1`,
    [identificacion]
  );
  if (!rows.length) return { tieneSolicitudActiva: false, solicitud: null };
  return { tieneSolicitudActiva: true, solicitud: rows[0] };
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

  // Req 2: Validar que el registro más reciente tenga Estado = 'Activo'
  if (vin.Estado !== 'Activo') {
    const errorMsg = `El colaborador ${limpiarNombre(vin.Trabajador)} (${vin.Identificacion}) no se encuentra activo (Estado actual: "${vin.Estado}"). Solo se permite radicar cesantías a colaboradores con estado Activo.`;
    const err = new Error(errorMsg);
    err.status = 400;
    throw err;
  }

  // Req 13: Comprobar si ya existe solicitud activa en Dynamic_Cesantias
  const infoActiva = await verificarSolicitudActivaTrabajador(identificacion);

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

  // Operación -> C.C. para prellenar y ZONA -> Ciudades de Config_Ciudades
  let ciudadPrellenar = '';
  let zona = '';
  let ciudades = [];
  if (vin.Operacion) {
    const resOp = await obtenerCiudadYCiudadesPorOperacion(vin.Operacion);
    ciudadPrellenar = resOp.prellenar;
    zona = resOp.zona;
    ciudades = resOp.ciudades;
  }

  if (!ciudadPrellenar && vin.Regional) {
    const [ciuRows] = await pool.execute(
      'SELECT Ciudad FROM Config_Regionales WHERE Regional = ? LIMIT 1',
      [vin.Regional]
    );
    if (ciuRows.length && ciuRows[0].Ciudad) {
      ciudadPrellenar = ciuRows[0].Ciudad;
      if (!ciudades.includes(ciudadPrellenar)) ciudades.unshift(ciudadPrellenar);
    }
  }

  // Comprobar si existe firma previa en bucket
  const infoFirma = await obtenerFirmaPreviaTrabajador(identificacion);

  // Req 4: Comprobar si existe cédula previa (TipoDocumento 11) en Maestro_docTrabajador
  const cedulaPrevia = await buscarCedulaPreviaTrabajador(identificacion);

  return {
    identificacion: String(vin.Identificacion),
    nombre: limpiarNombre(vin.Trabajador),
    trabajadorCompleto: vin.Trabajador,
    cargo: vin.Cargo || '—',
    operacion: vin.Operacion || '—',
    regional: vin.Regional || '—',
    estado: vin.Estado || '—',
    fechaIngreso: vin.FechaIngreso || '—',
    telefono: seg.Telefono || '',
    email: seg.Email || '',
    fondoCesantias: (seg.Cesantias || '').trim(),
    ciudadPrellenar: ciudadPrellenar || 'BOGOTÁ D.C.',
    zona,
    ciudades,
    tieneFirmaPrevia: infoFirma.tieneFirma,
    firmaPreviaUrl: infoFirma.urlFirma,
    cedulaPrevia,
    solicitudActiva: infoActiva.tieneSolicitudActiva ? infoActiva.solicitud : null,
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
  if (acceso && acceso.sinFiltro === false) {
    if (!acceso.operacionesFiltro || !acceso.operacionesFiltro.length) {
      return {
        results: [],
        counts: { total: 0, pendiente: 0, validado: 0, aprobado: 0, tramitado: 0, rechazado: 0, devuelto: 0, anulado: 0 },
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

  if (filtros.estado && filtros.estado !== 'todos' && filtros.estado !== '') {
    if (filtros.estado === 'anulado') {
      conds.push("(c.estado = 'anulado' OR c.estado = 'cancelado')");
    } else {
      conds.push('c.estado = ?');
      params.push(filtros.estado);
    }
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
      IF(c.estado = 'cancelado', 'anulado', c.estado) AS estado,
      c.validado_por,
      DATE_FORMAT(c.fecha_validacion, '%Y-%m-%d %H:%i') AS fecha_validacion,
      c.gestionado_por,
      DATE_FORMAT(c.fecha_gestion, '%Y-%m-%d %H:%i') AS fecha_gestion,
      c.tramitado_por,
      DATE_FORMAT(c.fecha_tramite, '%Y-%m-%d %H:%i') AS fecha_tramite,
      c.observaciones,
      DATE_FORMAT(c.fecha_registro, '%Y-%m-%d %H:%i') AS fecha_registro,
      c.token_firma,
      (c.firma_trabajador IS NOT NULL) AS firmado,
      pdf.Doc AS pdf_solicitud
    FROM Dynamic_Cesantias c
    LEFT JOIN Config_MotivoCesantias m ON c.motivo_retiro = m.Id
    LEFT JOIN (
      SELECT recurso, MAX(Doc) AS Doc
      FROM Maestro_docTrabajador
      WHERE TipoDocumento = '46' AND Observaciones = 'Formato de Solicitud de Retiro de Cesantías'
      GROUP BY recurso
    ) pdf ON c.Id = pdf.recurso
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
  results.forEach(r => {
    if (r.trabajador) {
      r.trabajador = limpiarNombre(r.trabajador);
    }
    if (r.pdf_solicitud) {
      r.pdf_solicitud = construirUrlTalenthub(r.pdf_solicitud);
    }
  });

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
    anulado: 0,
  };
  countRows.forEach(r => {
    const st = r.estado === 'cancelado' ? 'anulado' : r.estado;
    if (counts[st] !== undefined) {
      counts[st] += r.cant;
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
    celular,
    email,
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
    usar_firma_previa,
    firma_base64,
    usar_cedula_previa,
    url_cedula_previa,
    raw_doc_cedula_previa,
    ip_cliente,
    labels_map,
  } = datos;

  if (!identificacion) throw new Error('Identificación requerida.');
  if (!monto_solicitado || Number(monto_solicitado) <= 0) throw new Error('Monto solicitado inválido.');
  if (!motivo_retiro) throw new Error('Motivo de retiro requerido.');

  // Obtener datos del colaborador
  const worker = await buscarTrabajadorCesantias(identificacion);
  if (!worker) throw new Error(`No se encontró trabajador con identificación ${identificacion} en Maestro_Vinculación.`);
  if (worker.estado !== 'Activo') throw new Error(`El colaborador con identificación ${identificacion} no registra estado Activo.`);

  // Req 13: Bloquear si ya existe una solicitud activa en Dynamic_Cesantias
  if (worker.solicitudActiva) {
    throw new Error(`El colaborador ${worker.nombre} (${identificacion}) ya registra una solicitud de cesantías en trámite (Radicado: ${worker.solicitudActiva.Id}, Estado: ${String(worker.solicitudActiva.estado).toUpperCase()}). No es posible radicar una nueva solicitud hasta que la actual finalice o sea anulada.`);
  }

  // Actualizar Teléfono (Celular) y Email en Maestro_Segmentación si se editaron
  if (celular || email) {
    try {
      await pool.execute(
        `UPDATE \`Maestro_Segmentación\`
         SET \`Celular\` = COALESCE(?, \`Celular\`),
             \`Email\` = COALESCE(?, \`Email\`),
             \`Fecha de Actualización\` = NOW(),
             \`Usuario\` = ?
         WHERE \`Identificación\` = ?`,
        [celular || null, email || null, usuario || 'sistema', identificacion]
      );
    } catch (eSeg) {
      console.warn('[crearSolicitudCesantias] Advertencia actualizando Maestro_Segmentación:', eSeg.message);
    }
  }

  // Obtener motivo de retiro
  const [motivos] = await pool.execute(
    'SELECT Id, tipo_retiro, motivo_retiro FROM Config_MotivoCesantias WHERE Id = ? LIMIT 1',
    [motivo_retiro]
  );
  if (!motivos.length) throw new Error('Motivo de retiro no válido.');
  const motivoInfo = motivos[0];

  // Resolver Firma del Trabajador: ¿Previa de firmas-images o Nueva del Canvas?
  let firmaFinalBase64 = null;
  const esFirmaPrevia = usar_firma_previa === true || usar_firma_previa === 'true' || usar_firma_previa === '1';

  if (esFirmaPrevia) {
    try {
      firmaFinalBase64 = await obtenerFirmaBase64Reciente(identificacion);
    } catch (eFirmaP) {
      console.warn('[crearSolicitudCesantias] Error obteniendo firma previa:', eFirmaP.message);
    }
  } else if (firma_base64) {
    firmaFinalBase64 = firma_base64;
    // Guardar también esta nueva firma en el bucket firmas-images para futuras solicitudes
    try {
      const match = firma_base64.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        const buf = Buffer.from(match[2], 'base64');
        await subirFirma(identificacion, buf);
      }
    } catch (eSubirFirma) {
      console.warn('[crearSolicitudCesantias] No se pudo guardar firma en bucket firmas-images:', eSubirFirma.message);
    }
  }

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
    ciudad_solicitud || worker.ciudadPrellenar || 'BOGOTÁ D.C.',
    fondo_cesantias || worker.fondoCesantias || '—',
    monto_solicitado,
    motivo_retiro,
    aplica_conyuge ? 1 : 0,
    institucion_educativa || null,
    programa_academico || null,
    semestre || null,
    nombre_beneficiario ? String(nombre_beneficiario).trim().toUpperCase() : null,
    identificacion_beneficiario || null,
    tokenFirma,
    firmaFinalBase64 || null,
    firmaFinalBase64 ? fechaActual : null,
    ip_cliente || null,
  ]);

  // Req 4: Si se seleccionó usar la cédula previa registrada (TipoDocumento 11, Prefijo CC)
  const esCedulaPrevia = usar_cedula_previa === true || usar_cedula_previa === 'true' || usar_cedula_previa === '1';
  if (esCedulaPrevia) {
    const docUrlCedula = url_cedula_previa || (worker.cedulaPrevia && worker.cedulaPrevia.urlCedula) || raw_doc_cedula_previa || (worker.cedulaPrevia && worker.cedulaPrevia.rawDoc);
    if (docUrlCedula) {
      const docId = uuidv4();
      await pool.execute(
        `INSERT INTO Maestro_docTrabajador (
          id, \`Validación\`, Regional, \`Operación\`, \`Identificación\`, Estado,
          Fecha_Ingreso, TipoDocumento, Prefijo, Doc, Observaciones,
          Visualizar, Solicitud, Justificacion_Solicitud, Usuario, recurso
        ) VALUES (?, 'PEND', ?, ?, ?, ?, ?, '11', 'CC', ?, 'Cédula de Ciudadanía', NULL, NULL, NULL, ?, ?)`,
        [
          docId,
          worker.regional || null,
          worker.operacion || null,
          identificacion,
          worker.estado || 'Activo',
          worker.fechaIngreso && worker.fechaIngreso !== '—' ? worker.fechaIngreso : null,
          docUrlCedula,
          usuario || 'sistema',
          radicadoId,
        ]
      );
    }
  }

  // Parsear mapa de etiquetas de soportes si se pasó
  let lMap = {};
  if (labels_map) {
    try {
      lMap = typeof labels_map === 'string' ? JSON.parse(labels_map) : labels_map;
    } catch (eJson) {
      lMap = {};
    }
  }

  // Guardar cada soporte documental individual en GCS y registrar en Maestro_docTrabajador
  if (files && files.length) {
    for (const f of files) {
      try {
        const esCedulaTrabajador = f.fieldname === 'soporte_cedula_trabajador' || f.fieldname === 'cedula_trabajador';
        let tipoDoc = '46';
        let prefijo = 'RCES';
        let obs = lMap[f.fieldname] || datos['label_' + f.fieldname] || f.fieldname;
        let urlBucket = '';

        if (esCedulaTrabajador) {
          tipoDoc = '11';
          prefijo = 'CC';
          obs = 'Cédula de Ciudadanía';
          urlBucket = await subirCedulaTrabajador(identificacion, f.buffer, f.originalname);
        } else {
          if (!obs || obs === 'soporte' || obs.startsWith('soporte_')) {
            obs = `${motivoInfo.motivo_retiro} - Soporte`;
          }
          urlBucket = await subirSoporteCesantias(identificacion, f.buffer, f.originalname);
        }

        const docId = uuidv4();
        await pool.execute(
          `INSERT INTO Maestro_docTrabajador (
            id, \`Validación\`, Regional, \`Operación\`, \`Identificación\`, Estado,
            Fecha_Ingreso, TipoDocumento, Prefijo, Doc, Observaciones,
            Visualizar, Solicitud, Justificacion_Solicitud, Usuario, recurso
          ) VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
          [
            docId,
            worker.regional || null,
            worker.operacion || null,
            identificacion,
            worker.estado || 'Activo',
            worker.fechaIngreso && worker.fechaIngreso !== '—' ? worker.fechaIngreso : null,
            tipoDoc,
            prefijo,
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

  // Si ya vino firmado por el colaborador, generamos el PDF automáticamente
  if (firmaFinalBase64) {
    try {
      await generarYGuardarPDFCesantias(radicadoId, usuario || 'sistema');
    } catch (errPdf) {
      console.error('[crearSolicitudCesantias] Error generando PDF firmado:', errPdf);
    }
  }

  // Notificación por correo: Radicación de solicitud en estado 'pendiente'
  try {
    enviarNotificacionCesantias({
      evento: 'pendiente',
      solicitud: {
        Id: radicadoId,
        monto_solicitado,
        fondo_cesantias,
        motivo_retiro,
        motivo_texto: motivoInfo.motivo_retiro,
        identificacion,
        email: email || worker.email,
        operacion: worker.operacion,
      },
      trabajador: worker,
      usuarioAccion: usuario || 'sistema',
    }).catch(errMail => {
      console.error('[crearSolicitudCesantias] Error al enviar notificación por correo:', errMail.message);
    });
  } catch (errDisparador) {
    console.warn('[crearSolicitudCesantias] Error disparando correo inicial:', errDisparador.message);
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
     WHERE recurso = ? AND TipoDocumento IN ('46', '11')
     ORDER BY FechaRegistro DESC`,
    [idCesantia]
  );

  const docsNormalizados = docs.map(d => ({
    ...d,
    Doc: construirUrlTalenthub(d.Doc) || d.Doc,
    Url: d.Url ? (construirUrlTalenthub(d.Url) || d.Url) : (construirUrlTalenthub(d.Doc) || d.Doc),
  }));

  return {
    solicitud: sol,
    trabajador: worker,
    documentos: docsNormalizados,
  };
}

// ── Transición de Estado ─────────────────────────────────────────────────────
async function actualizarEstadoCesantia(idCesantia, nuevoEstado, usuario, observaciones = '', rolUsuario = null) {
  let estadoNormalizado = nuevoEstado === 'cancelado' ? 'anulado' : nuevoEstado;
  const estadosValidos = ['pendiente', 'validado', 'aprobado', 'tramitado', 'rechazado', 'anulado', 'devuelto'];
  if (!estadosValidos.includes(estadoNormalizado)) {
    throw new Error(`Estado "${nuevoEstado}" no es válido.`);
  }

  // Resolver rol del usuario si no fue provisto directamente
  if (!rolUsuario && usuario) {
    const [uRows] = await pool.execute('SELECT Rol FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    if (uRows.length) rolUsuario = uRows[0].Rol;
  }

  // Req. 5, 6, 7, 8: Validar permisos contra Config_Parametros
  if (estadoNormalizado === 'validado') {
    const puedeValidar = await verificarPermisoRolCesantias(rolUsuario, 'Puede validar registros de Cesantias');
    if (!puedeValidar) throw new Error('No tienes permisos para validar solicitudes de Cesantías.');
  } else if (estadoNormalizado === 'aprobado') {
    const puedeAprobar = await verificarPermisoRolCesantias(rolUsuario, 'Puede aprobar registros de Cesantias');
    if (!puedeAprobar) throw new Error('No tienes permisos para aprobar solicitudes de Cesantías.');
  } else if (estadoNormalizado === 'rechazado') {
    const puedeRechazar = await verificarPermisoRolCesantias(rolUsuario, 'Puede rechazar registros de Cesantias');
    if (!puedeRechazar) throw new Error('No tienes permisos para rechazar solicitudes de Cesantías.');
  } else if (estadoNormalizado === 'anulado') {
    const puedeAnular = await verificarPermisoRolCesantias(rolUsuario, 'Puede anular registros de Cesantias');
    if (!puedeAnular) throw new Error('No tienes permisos para anular registros de Cesantías.');
  } else if (estadoNormalizado === 'tramitado') {
    const rolNorm = String(rolUsuario || '').trim().toLowerCase();
    if (!['nomina', 'sistema'].includes(rolNorm)) {
      throw new Error('Solo el área de Nómina puede tramitar solicitudes de Cesantías.');
    }
  }

  const [exist] = await pool.execute('SELECT Id, estado, identificacion, firma_trabajador FROM Dynamic_Cesantias WHERE Id = ? LIMIT 1', [idCesantia]);
  if (!exist.length) throw new Error('Solicitud no encontrada.');

  const fechaActual = fechaHoraBogota();
  let query = '';
  let params = [];

  if (estadoNormalizado === 'validado') {
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
  } else if (['aprobado', 'rechazado', 'anulado', 'devuelto'].includes(estadoNormalizado)) {
    query = `
      UPDATE Dynamic_Cesantias 
      SET estado = ?,
          gestionado_por = ?,
          fecha_gestion = ?,
          observaciones = IF(LENGTH(?) > 0, ?, observaciones),
          fecha_actualizacion = NOW()
      WHERE Id = ?
    `;
    params = [estadoNormalizado, usuario, fechaActual, observaciones, observaciones, idCesantia];
  } else if (estadoNormalizado === 'tramitado') {
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
    params = [estadoNormalizado, observaciones, observaciones, idCesantia];
  }

  await pool.execute(query, params);

  // Req. 6: Al rechazar debe agregar a la columna Observaciones de los registros en Maestro_docTrabajador la expresión " - Rechazado por "&[usuario]
  if (estadoNormalizado === 'rechazado') {
    try {
      await pool.execute(
        `UPDATE Maestro_docTrabajador 
         SET Observaciones = CONCAT(COALESCE(Observaciones, ''), ' - Rechazado por ', ?) 
         WHERE recurso = ?`,
        [usuario, idCesantia]
      );
    } catch (eRechazo) {
      console.warn('[actualizarEstadoCesantia] Advertencia al actualizar observaciones de rechazo en docs:', eRechazo.message);
    }
  }

  // Ejecutar tareas pesadas / secundarias en segundo plano para máxima respuesta al usuario
  setImmediate(async () => {
    // Req. 5: Al anular debe eliminarse los registros en Maestro_docTrabajador y eliminar los documentos en el bucket
    if (estadoNormalizado === 'anulado') {
      try {
        const [docsAnular] = await pool.execute(
          'SELECT id, Doc FROM Maestro_docTrabajador WHERE recurso = ?',
          [idCesantia]
        );
        for (const d of docsAnular) {
          if (d.Doc) {
            const [usados] = await pool.execute(
              'SELECT COUNT(*) AS c FROM Maestro_docTrabajador WHERE Doc = ? AND recurso != ?',
              [d.Doc, idCesantia]
            );
            if (!usados.length || usados[0].c === 0) {
              await eliminarArchivoBucket(d.Doc);
            }
          }
        }
        await pool.execute('DELETE FROM Maestro_docTrabajador WHERE recurso = ?', [idCesantia]);
      } catch (eAnulacion) {
        console.warn('[actualizarEstadoCesantia - background] Advertencia al limpiar soportes de anulación:', eAnulacion.message);
      }
    }

    // Si se aprueba y aún no se generó el PDF formal firmado (o se requiere actualizar), lo generamos
    if (estadoNormalizado === 'aprobado' && exist[0].firma_trabajador) {
      try {
        await generarYGuardarPDFCesantias(idCesantia, usuario);
      } catch (e) {
        console.warn('[actualizarEstadoCesantia - background] Advertencia al generar PDF en aprobación:', e.message);
      }
    }

    // Notificaciones por correo para validado, aprobado, tramitado, devuelto, rechazado
    if (['validado', 'aprobado', 'tramitado', 'devuelto', 'rechazado'].includes(estadoNormalizado)) {
      try {
        const detalle = await obtenerDetalleCesantia(idCesantia);
        if (detalle) {
          await enviarNotificacionCesantias({
            evento: estadoNormalizado,
            solicitud: detalle.solicitud,
            trabajador: detalle.trabajador || {},
            observaciones: observaciones || '',
            usuarioAccion: usuario,
          });
        }
      } catch (eDet) {
        console.warn('[actualizarEstadoCesantia - background] Error procesando correo de notificación:', eDet.message);
      }
    }
  });

  return { ok: true, estado: estadoNormalizado };
}

// ── Req. 4: Eliminar Registro de Cesantías ────────────────────────────────────
async function eliminarSolicitudCesantias(idCesantia, usuario, rolUsuario = null) {
  if (!rolUsuario && usuario) {
    const [uRows] = await pool.execute('SELECT Rol FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    if (uRows.length) rolUsuario = uRows[0].Rol;
  }

  const puedeEliminar = await verificarPermisoRolCesantias(rolUsuario, 'Puede eliminar registros de Cesantias');
  if (!puedeEliminar) {
    throw new Error('No tienes permisos para eliminar registros de Cesantías.');
  }

  const [exist] = await pool.execute('SELECT Id FROM Dynamic_Cesantias WHERE Id = ? LIMIT 1', [idCesantia]);
  if (!exist.length) throw new Error('Solicitud no encontrada.');

  // Obtener soportes y archivos en Maestro_docTrabajador
  const [docs] = await pool.execute(
    'SELECT id, Doc FROM Maestro_docTrabajador WHERE recurso = ?',
    [idCesantia]
  );

  for (const d of docs) {
    if (d.Doc) {
      const [usados] = await pool.execute(
        'SELECT COUNT(*) AS c FROM Maestro_docTrabajador WHERE Doc = ? AND recurso != ?',
        [d.Doc, idCesantia]
      );
      if (!usados.length || usados[0].c === 0) {
        await eliminarArchivoBucket(d.Doc);
      }
    }
  }

  // Eliminar filas en Maestro_docTrabajador
  await pool.execute('DELETE FROM Maestro_docTrabajador WHERE recurso = ?', [idCesantia]);

  // Eliminar fila en Dynamic_Cesantias
  await pool.execute('DELETE FROM Dynamic_Cesantias WHERE Id = ?', [idCesantia]);

  return { ok: true, id: idCesantia, mensaje: 'Registro de cesantía y sus soportes eliminados correctamente.' };
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
  if (!templateHtml.includes('data:image/png;base64') && !templateHtml.includes('data:image/jpeg;base64')) {
    templateHtml = templateHtml.replace(/<img[^>]+class="logo-img"[^>]*>/i, `<img src="${LOGO_BASE64}" alt="LOG&amp;SER" class="logo-img">`);
  }

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
  buscarColaboradoresCesantias,
  verificarSolicitudActivaTrabajador,
  obtenerFondosCesantias,
  obtenerCiudadYCiudadesPorOperacion,
  obtenerFirmaPreviaTrabajador,
  buscarCedulaPreviaTrabajador,
  obtenerMotivosCesantias,
  listarSolicitudesCesantias,
  crearSolicitudCesantias,
  obtenerDetalleCesantia,
  actualizarEstadoCesantia,
  eliminarSolicitudCesantias,
  obtenerPermisosUsuarioCesantias,
  verificarPermisoRolCesantias,
  obtenerOperacionesSinValidacion,
  registrarFirmaTrabajador,
  generarYGuardarPDFCesantias,
};
