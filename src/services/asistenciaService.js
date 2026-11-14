const pool = require('./db');
const crypto = require('crypto');

// Meses en español para formato de IdRegistro y Quincena
const MESES_ABR = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const MESES_NOM = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

/**
 * Calcula la quincena estándar a partir de una fecha YYYY-MM-DD
 * Ejemplo: '2026-11-05' -> '11. Noviembre Q1'
 */
async function obtenerQuincenaFecha(fechaStr) {
  try {
    const [rows] = await pool.execute(
      'SELECT Quincena FROM Maestro_Fechas WHERE Fecha = ? LIMIT 1',
      [fechaStr]
    );
    if (rows.length && rows[0].Quincena) {
      return rows[0].Quincena;
    }
  } catch (e) {
    console.warn('[asistenciaService] Error consultando Maestro_Fechas:', e.message);
  }

  // Fallback si no está en Maestro_Fechas
  const d = new Date(fechaStr + 'T12:00:00Z');
  const mesNum = String(d.getUTCMonth() + 1).padStart(2, '0');
  const mesNom = MESES_NOM[d.getUTCMonth()];
  const q = d.getUTCDate() <= 15 ? 'Q1' : 'Q2';
  return `${mesNum}. ${mesNom} ${q}`;
}

/**
 * Genera un IdRegistro único compatible con el estándar existente
 * Ejemplo: 'SI - 05.NOV.2026 -ac148c09'
 */
function generarIdRegistro(prefijoNovedad, fechaStr) {
  const d = new Date(fechaStr + 'T12:00:00Z');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = MESES_ABR[d.getUTCMonth()];
  const anio = d.getUTCFullYear();
  const hex = crypto.randomBytes(4).toString('hex');
  const pref = (prefijoNovedad || 'ASI').toUpperCase();
  return `${pref} - ${dia}.${mes}.${anio} -${hex}`;
}

/**
 * Calcula la diferencia de tiempo entre dos horas HH:mm (formato TIME 'HH:MM:SS')
 * Soporta turnos que cruzan la medianoche (ej: 21:00 a 06:00 = 09:00:00)
 */
function calcularTiempoLaborado(horaEntrada, horaSalida) {
  if (!horaEntrada || !horaSalida) return null;
  const [h1, m1] = horaEntrada.split(':').map(Number);
  const [h2, m2] = horaSalida.split(':').map(Number);

  let mins1 = h1 * 60 + (m1 || 0);
  let mins2 = h2 * 60 + (m2 || 0);

  let diffMins = mins2 - mins1;
  if (diffMins < 0) {
    diffMins += 24 * 60; // Cruzó medianoche
  }

  const hDiff = Math.floor(diffMins / 60);
  const mDiff = diffMins % 60;
  return `${String(hDiff).padStart(2, '0')}:${String(mDiff).padStart(2, '0')}:00`;
}

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD en la zona horaria de Colombia
 */
function obtenerHoyColombia() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Obtiene el catálogo de novedades configuradas en Config_Asistencia
 */
async function obtenerCatalogoNovedades(rol = '') {
  const paramsCfg = await obtenerParametrosAsistencia();
  const rolNorm = (rol || '').toLowerCase().trim();
  const rolesVerSistema = (paramsCfg.rolesVerNovedadesSistema || ['Sistema', 'Nomina']).map(r => r.toLowerCase().trim());
  const puedeVerSistema = rolesVerSistema.includes(rolNorm);

  const [rows] = await pool.query(`
    SELECT 
      Id, 
      Novedad, 
      \`Prefijo Novedad\` AS prefijoNovedad, 
      \`Fecha Final\` AS requiereFechaFinal, 
      Evento, 
      TipoDocumento,
      Color AS color,
      Soporte AS requiereSoporte, 
      \`Descripción Soporte\` AS descripcionSoporte
    FROM Config_Asistencia
    ORDER BY Evento ASC, Novedad ASC
  `);

  const novedades = [];
  const incapacidades = [];

  rows.forEach(r => {
    const item = {
      id: r.Id,
      novedad: r.Novedad,
      prefijoNovedad: r.prefijoNovedad || '',
      esRangoFechas: String(r.requiereFechaFinal || '').trim().toUpperCase() === 'SI',
      evento: r.Evento || 'Novedad',
      tipoDocumento: Number(r.TipoDocumento || 0),
      color: r.color || '#FFFFFF',
      requiereSoporte: String(r.requiereSoporte || '').trim().toUpperCase() === 'SI' || Number(r.TipoDocumento || 0) !== 0,
      descripcionSoporte: r.descripcionSoporte || ''
    };

    if (item.evento === 'Incapacidad') {
      incapacidades.push(item);
    } else if (item.evento === 'Novedad') {
      novedades.push(item);
    } else if (item.evento === 'Sistema' && puedeVerSistema) {
      novedades.push(item);
    }
  });

  return { novedades, incapacidades };
}

/**
 * Obtiene los parámetros del módulo de Asistencia
 */
async function obtenerParametrosAsistencia() {
  const [rows] = await pool.query(
    "SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Asistencia'"
  );
  const config = {
    diasMaximosPasados: 15,
    diasMaximosFuturosNovedades: 30,
    rolesEditarEliminarYellow: ['Auxiliar', 'AuxiliarR', 'Coordinador', 'CoordinadorR'],
    rolesEditarEliminarTodosEstados: ['Sistema', 'Nomina'],
    rolesRegistrarRetirados: ['Sistema', 'Nomina'],
    rolesRegistrarDiasFuturos: ['Sistema', 'Nomina'],
    rolesVerNovedadesSistema: ['Sistema', 'Nomina'],
    cargosExcluidosAsistencia: [
      'APRENDIZ',
      'AUXILIAR ADMINISTRATIVO DE OPERACIÓN',
      'AUXILIAR ADMINISTRATIVO REGIONAL',
      'COORDINADOR LOGISTICO',
      'COORDINADOR REGIONAL',
      'AUXILIAR SST',
      'ANALISTA DE SST'
    ],
    rolesExencionCargosAsistencia: ['Sistema', 'Nomina']
  };
  for (const r of rows) {
    if (r.Concepto === 'Dias_Maximos_Pasados') {
      config.diasMaximosPasados = parseInt(r.Parametro, 10) || 15;
    }
    if (r.Concepto === 'Dias_Maximos_Futuros_Novedades') {
      config.diasMaximosFuturosNovedades = parseInt(r.Parametro, 10) || 30;
    }
    if (r.Concepto === 'Roles_Editar_Eliminar_Yellow') {
      config.rolesEditarEliminarYellow = (r.Parametro || '').split(',').map(s => s.trim()).filter(Boolean);
    }
    if (r.Concepto === 'Roles_Editar_Eliminar_Todos_Estados') {
      config.rolesEditarEliminarTodosEstados = (r.Parametro || '').split(',').map(s => s.trim()).filter(Boolean);
    }
    if (r.Concepto === 'Roles_Registrar_Retirados') {
      config.rolesRegistrarRetirados = (r.Parametro || '').split(',').map(s => s.trim()).filter(Boolean);
    }
    if (r.Concepto === 'Roles_Registrar_Dias_Futuros') {
      config.rolesRegistrarDiasFuturos = (r.Parametro || '').split(',').map(s => s.trim()).filter(Boolean);
    }
    if (r.Concepto === 'Roles_Ver_Novedades_Sistema') {
      config.rolesVerNovedadesSistema = (r.Parametro || '').split(',').map(s => s.trim()).filter(Boolean);
    }
    if (r.Concepto === 'Cargos_Excluidos_Asistencia') {
      config.cargosExcluidosAsistencia = (r.Parametro || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    }
    if (r.Concepto === 'Roles_Exencion_Cargos_Asistencia') {
      config.rolesExencionCargosAsistencia = (r.Parametro || '').split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return config;
}

/**
 * Valida si una fecha para una operación se encuentra bloqueada en Bloqueo_Nomina
 */
async function verificarBloqueoNomina(operacion, fecha, rol) {
  const paramsCfg = await obtenerParametrosAsistencia();
  const rolesSinBloqueo = (paramsCfg.rolesEditarEliminarTodosEstados || ['Sistema', 'Nomina'])
    .map(r => r.toLowerCase().trim());
  if (rolesSinBloqueo.includes((rol || '').toLowerCase().trim())) {
    return { bloqueado: false };
  }

  const [rows] = await pool.query(`
    SELECT bn.ID, bn.Quincena, bn.\`Año\`, bn.\`Condición\`, mf.maxFecha
    FROM Bloqueo_Nomina bn
    LEFT JOIN (
      SELECT Quincena, \`Año\`, MAX(DATE_FORMAT(Fecha, '%Y-%m-%d')) as maxFecha 
      FROM Maestro_Fechas 
      GROUP BY Quincena, \`Año\`
    ) mf ON bn.Quincena = mf.Quincena AND bn.\`Año\` = mf.\`Año\`
    WHERE bn.Modulo = 'Nomina'
      AND (bn.\`Datos\` IS NULL OR bn.\`Datos\` = '' OR bn.\`Datos\` = 'Asistencia')
      AND (bn.\`Operación\` = ? OR bn.\`Operación\` IS NULL)
    ORDER BY bn.ID DESC
    LIMIT 1
  `, [operacion]);

  if (rows.length && rows[0].Condición === 'Bloquear' && rows[0].maxFecha) {
    if (fecha <= rows[0].maxFecha) {
      return {
        bloqueado: true,
        maxFecha: rows[0].maxFecha,
        quincena: rows[0].Quincena,
        mensaje: `El período hasta el ${rows[0].maxFecha} (${rows[0].Quincena}) para la operación "${operacion}" se encuentra bloqueado por Nómina.`
      };
    }
  }

  return { bloqueado: false };
}

/**
 * Obtiene las áreas de Config_Area para la operación seleccionada (ADMINISTRATIVO = 'V')
 */
async function obtenerAreasOperacion(operacion) {
  if (!operacion) return [];
  const [rows] = await pool.query(
    "SELECT ID as id, AREA as area FROM Config_Area WHERE `OPERACIÓN` = ? AND ADMINISTRATIVO = 'V' ORDER BY AREA ASC",
    [operacion]
  );
  return rows;
}

/**
 * Busca trabajadores en Maestro_Vinculación filtrando por operación y área
 * Permite a roles autorizados (Sistema, Nómina) ver personas retiradas
 * Permite excluir cargos no aplicables a asistencia según configuración
 */
async function buscarTrabajadoresVinculacion({
  operacion = '',
  area = '',
  operacionesPermitidas = [],
  q = '',
  puedeVerRetirados = false,
  esApoyo = false,
  tipoEvento = 'Asistencia',
  puedeExcluirCargos = false,
  cargosExcluidos = []
}) {
  let sql = `
    SELECT 
      mv.\`Id Vinculación\` AS idVinculacion,
      mv.\`Identificación\` AS identificacion,
      COALESCE(ms.Trabajador, mv.Trabajador) AS trabajador,
      TRIM(SUBSTRING_INDEX(COALESCE(ms.Trabajador, mv.Trabajador, ''), '**', -1)) AS nombreCompleto,
      mv.\`Operación\` AS operacion,
      mv.Area AS area,
      mv.Cargo AS cargo,
      mv.Estado AS estado
    FROM \`Maestro_Vinculación\` mv
    LEFT JOIN \`Maestro_Segmentación\` ms ON mv.\`Identificación\` = ms.Identificación
    WHERE 1=1
  `;
  const params = [];

  if (operacion) {
    sql += ' AND mv.`Operación` = ?';
    params.push(operacion);
  } else if (operacionesPermitidas.length > 0) {
    sql += ` AND mv.\`Operación\` IN (${operacionesPermitidas.map(() => '?').join(',')})`;
    params.push(...operacionesPermitidas);
  }

  // Si no es apoyo a otra operación, se filtra por área
  if (area && !esApoyo) {
    sql += ' AND mv.Area = ?';
    params.push(area);
  }

  if (puedeVerRetirados) {
    sql += " AND mv.Estado IN ('Activo', 'Retirado')";
  } else {
    sql += " AND mv.Estado = 'Activo'";
  }

  // Exclusión de cargos administrativos en Asistencia directa (no aplica para Novedades ni Apoyo)
  if (tipoEvento === 'Asistencia' && !esApoyo && !puedeExcluirCargos && cargosExcluidos && cargosExcluidos.length) {
    sql += ` AND UPPER(TRIM(mv.Cargo)) NOT IN (${cargosExcluidos.map(() => '?').join(',')})`;
    params.push(...cargosExcluidos.map(c => c.trim().toUpperCase()));
  }

  if (q && q.trim()) {
    const qLike = `%${q.trim().toLowerCase()}%`;
    sql += ' AND (LOWER(COALESCE(ms.Trabajador, mv.Trabajador)) LIKE ? OR CAST(mv.Identificación AS CHAR) LIKE ?)';
    params.push(qLike, qLike);
  }

  sql += ' ORDER BY nombreCompleto ASC LIMIT 500';

  const [rows] = await pool.execute(sql, params);
  return rows;
}

// Alias para compatibilidad con llamadas anteriores
const buscarTrabajadoresSegmentacion = buscarTrabajadoresVinculacion;

/**
 * Inserta registro en Maestro_docTrabajador cuando se adjunta un PDF de soporte
 */
async function registrarDocumentoSoporte(conn, {
  idReferencia, regional, operacion, identificacion, estadoVinc, fechaIngresoVinc, tipoDoc, urlDoc, fechaReg, usuario, observaciones
}) {
  let prefijo = 'SOP';
  try {
    const [pRows] = await conn.execute(
      'SELECT Prefijo FROM Config_Doc_Trabajador WHERE Id = ? LIMIT 1',
      [tipoDoc]
    );
    if (pRows.length && pRows[0].Prefijo) {
      prefijo = pRows[0].Prefijo;
    }
  } catch (e) {
    console.warn('[asistenciaService] No se pudo obtener prefijo doc:', e.message);
  }

  await conn.execute(`
    INSERT INTO Maestro_docTrabajador (
      id, Validación, Regional, \`Operación\`, Identificación, 
      Estado, Fecha_Ingreso, TipoDocumento, Prefijo, Doc, 
      Observaciones, Visualizar, FechaRegistro, Usuario
    ) VALUES (
      UUID(), 'PEND', ?, ?, ?, 
      ?, ?, ?, ?, ?, 
      ?, 'SI', ?, ?
    )
  `, [
    regional || null,
    operacion || null,
    identificacion,
    estadoVinc || 'Activo',
    fechaIngresoVinc || null,
    tipoDoc,
    prefijo,
    urlDoc,
    observaciones || null,
    fechaReg,
    usuario
  ]);
}

/**
 * Registra asistencia diaria en lote (múltiples trabajadores en un solo día)
 */
async function registrarAsistenciaDiaria({
  operacion,
  area,
  novedad = 'Asistencia',
  prefijoNovedad = 'SI',
  dia,
  horaEntrada,
  horaSalida,
  trabajadoresIds = [], // Array de Identificación o string de Trabajador
  apoyoOtraOperacion = 'NO',
  operacionApoya = null,
  observaciones = null,
  usuario,
  rol = ''
}) {
  if (!operacion || !dia || !trabajadoresIds || !trabajadoresIds.length) {
    throw new Error('Faltan datos obligatorios para registrar la asistencia (operación, día o trabajadores).');
  }

  // Validación de permisos de fechas futuras
  const paramsCfg = await obtenerParametrosAsistencia();
  const puedeDiasFuturos = (paramsCfg.rolesRegistrarDiasFuturos || ['Sistema', 'Nomina'])
    .map(r => r.toLowerCase().trim())
    .includes((rol || '').toLowerCase().trim());
  const hoy = obtenerHoyColombia();
  if (!puedeDiasFuturos && dia > hoy) {
    throw new Error(`No tiene permisos para registrar asistencia en fechas futuras (${dia}).`);
  }

  // Validación de Bloqueo de Nómina
  const bloqueo = await verificarBloqueoNomina(operacion, dia, rol);
  if (bloqueo.bloqueado) {
    throw new Error(bloqueo.mensaje);
  }

  // Obtener quincena y tiempo laborado
  const quincena = await obtenerQuincenaFecha(dia);
  const tiempoLaborado = calcularTiempoLaborado(horaEntrada, horaSalida);
  const idRegistro = generarIdRegistro(prefijoNovedad, dia);
  const fechaRegistro = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));

  // Consultar datos de los trabajadores en Maestro_Segmentación
  const placeholders = trabajadoresIds.map(() => '?').join(',');
  const [trabRows] = await pool.query(`
    SELECT 
      Identificación AS identificacion,
      Trabajador AS trabajador,
      TRIM(REGEXP_REPLACE(CONCAT_WS(' ', 
        TRIM(\`Primer Nombre\`), 
        TRIM(IFNULL(\`Segundo Nombre\`, '')), 
        TRIM(\`Primer Apellido\`), 
        TRIM(IFNULL(\`Segundo Apellido\`, ''))
      ), '[[:space:]]+', ' ')) AS nombreCompleto,
      \`Operación\` AS operacion
    FROM Maestro_Segmentación
    WHERE Identificación IN (${placeholders}) OR Trabajador IN (${placeholders})
  `, [...trabajadoresIds, ...trabajadoresIds]);

  if (!trabRows.length) {
    throw new Error('No se encontraron los datos de los trabajadores seleccionados en Maestro_Segmentación.');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Cadena de nombres para la cabecera
    const listaNombresTrabajador = trabRows.map(t => t.trabajador).join(' , ');

    // 2. Insertar cabecera en Dynamic_Registro_Asistencia con Disponible = 1
    await conn.execute(`
      INSERT INTO Dynamic_Registro_Asistencia (
        IdRegistro, \`Operación\`, Area, Evento, Novedad, \`Apoyo de Otra Operación\`,
        Trabajador, Día, \`Hora Entrada\`, \`Hora Salida\`,
        \`Operación a la que apoya\`, Origen, \`Fecha Registro\`, Usuario, Disponible
      ) VALUES (
        ?, ?, ?, 'Asistencia', ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, 1
      )
    `, [
      idRegistro,
      apoyoOtraOperacion === 'SI' ? operacionApoya : null,
      area || null,
      novedad,
      apoyoOtraOperacion || 'NO',
      listaNombresTrabajador,
      dia,
      horaEntrada || null,
      horaSalida || null,
      apoyoOtraOperacion === 'SI' ? operacionApoya : null,
      operacion,
      fechaRegistro,
      usuario
    ]);

    // 3. Preparar Bulk Insert en Dynamic_Asistencia
    const rowsToInsert = [];
    trabRows.forEach((t, idx) => {
      const pos = idx + 1;
      const idAsistencia = `${idRegistro}_T${pos}`;
      const opEfectiva = apoyoOtraOperacion === 'SI' ? (operacionApoya || operacion) : operacion;

      rowsToInsert.push([
        idAsistencia,
        idRegistro,
        opEfectiva,
        novedad,
        prefijoNovedad,
        dia,
        area || null,
        t.trabajador,
        t.identificacion,
        t.nombreCompleto,
        horaEntrada || null,
        horaSalida || null,
        tiempoLaborado,
        null, // Valor Destajo
        apoyoOtraOperacion || 'NO',
        operacionApoya || null,
        operacion, // Origen
        fechaRegistro,
        usuario,
        areaFinal || null, // Disponible1 (por defecto igual a Area)
        'Yellow', // Estado
        observaciones || null
      ]);
    });

    // Inserción en lote en Dynamic_Asistencia
    await conn.query(`
      INSERT INTO Dynamic_Asistencia (
        IdAsistencia, IdRegistro, \`Operación\`, Novedad, \`Prefijo Novedad\`,
        Día, Area, Trabajador, Cédula, Nombre,
        \`Hora Llegada\`, \`Hora Salida\`, \`Tiempo Laborado\`, \`Valor Destajo\`,
        \`Apoyo Otra Operación\`, \`Operación a la que Apoya\`, Origen,
        \`Fecha Registro\`, Usuario, Disponible1, Estado, Observaciones
      ) VALUES ?
    `, [rowsToInsert]);

    await conn.commit();
    return {
      success: true,
      idRegistro,
      registrosInsertados: rowsToInsert.length
    };
  } catch (err) {
    await conn.rollback();
    console.error('[asistenciaService] Error en registrarAsistenciaDiaria:', err);
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Registra novedad por rango de fechas para un colaborador (incapacidad, vacaciones, etc.)
 */
async function registrarNovedadPorRango({
  trabajadorIdentificacion,
  operacion,
  area,
  novedad,
  prefijoNovedad,
  diaInicio,
  diaFin,
  codDiagnostico = null,
  diagnostico = null,
  tipoIncapacidad = null,
  urlSoporte = null,
  urlIncapacidad = null,
  urlHistoriaClinica = null,
  observaciones = null,
  usuario,
  rol = ''
}) {
  if (!trabajadorIdentificacion || !diaInicio || !diaFin || !novedad) {
    throw new Error('Faltan datos obligatorios para registrar la novedad (trabajador, fechas o novedad).');
  }

  // Validación de permisos de fechas futuras
  const paramsCfg = await obtenerParametrosAsistencia();
  const puedeDiasFuturos = (paramsCfg.rolesRegistrarDiasFuturos || ['Sistema', 'Nomina'])
    .map(r => r.toLowerCase().trim())
    .includes((rol || '').toLowerCase().trim());
  const hoy = obtenerHoyColombia();
  if (!puedeDiasFuturos && diaInicio > hoy) {
    throw new Error(`No tiene permisos para iniciar novedades en fechas futuras (${diaInicio}).`);
  }

  // Validación de Bloqueo de Nómina
  const bloqueo = await verificarBloqueoNomina(operacion, diaInicio, rol);
  if (bloqueo.bloqueado) {
    throw new Error(bloqueo.mensaje);
  }

  // Validar fechas
  const fInicio = new Date(diaInicio + 'T12:00:00Z');
  const fFin = new Date(diaFin + 'T12:00:00Z');
  const diffTime = fFin.getTime() - fInicio.getTime();
  let diasTotales = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  if (diasTotales <= 0) {
    throw new Error('La fecha final debe ser igual o posterior a la fecha inicial.');
  }
  if (diasTotales > 90) {
    diasTotales = 90; // Límite de seguridad
  }

  // Buscar trabajador
  const [tRows] = await pool.execute(`
    SELECT 
      Identificación AS identificacion,
      Trabajador AS trabajador,
      TRIM(REGEXP_REPLACE(CONCAT_WS(' ', 
        TRIM(\`Primer Nombre\`), 
        TRIM(IFNULL(\`Segundo Nombre\`, '')), 
        TRIM(\`Primer Apellido\`), 
        TRIM(IFNULL(\`Segundo Apellido\`, ''))
      ), '[[:space:]]+', ' ')) AS nombreCompleto,
      \`Operación\` AS operacion
    FROM Maestro_Segmentación
    WHERE Identificación = ? OR Trabajador = ?
    LIMIT 1
  `, [trabajadorIdentificacion, trabajadorIdentificacion]);

  if (!tRows.length) {
    throw new Error('No se encontró el trabajador en Maestro_Segmentación.');
  }
  const trab = tRows[0];
  const opFinal = operacion || trab.operacion;

  // Si es Incapacidad con sub-tipo, obtener prefijo de Config_Asistencia
  let prefijoEfectivo = prefijoNovedad || 'NOV';
  let tipoDocIncapacidad = '31';
  if ((novedad === 'Incapacidad' || novedad.toLowerCase().includes('incapacidad')) && tipoIncapacidad) {
    const [incRows] = await pool.query(
      "SELECT `Prefijo Novedad` AS prefijo, TipoDocumento FROM Config_Asistencia WHERE Novedad = ? AND Evento = 'Incapacidad' LIMIT 1",
      [tipoIncapacidad]
    );
    if (incRows.length && incRows[0].prefijo) {
      prefijoEfectivo = incRows[0].prefijo;
    }
    if (incRows.length && incRows[0].TipoDocumento) {
      tipoDocIncapacidad = String(incRows[0].TipoDocumento);
    }
  }
  const idRegistro = generarIdRegistro(prefijoEfectivo, diaInicio);
  const fechaRegistro = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Validar codDiagnostico contra Config_Diagnostico (Foreign Key)
    let codDiagValido = null;
    let diagValido = diagnostico ? diagnostico.substring(0, 300) : null;
    if (codDiagnostico && codDiagnostico.trim()) {
      const [cdRows] = await conn.execute('SELECT Cod, `Descripción` FROM Config_Diagnostico WHERE Cod = ? LIMIT 1', [codDiagnostico.trim().toUpperCase()]);
      if (cdRows.length) {
        codDiagValido = cdRows[0].Cod;
        if (!diagValido) diagValido = cdRows[0]['Descripción'] ? cdRows[0]['Descripción'].substring(0, 300) : null;
      }
    }

    let areaFinal = area;
    if (!areaFinal) {
      const [vRows] = await conn.execute(
        'SELECT Area FROM `Maestro_Vinculación` WHERE `Identificación` = ? LIMIT 1',
        [trab.identificacion]
      );
      if (vRows.length && vRows[0].Area) {
        areaFinal = String(vRows[0].Area);
      }
    }

    // 1. Insertar cabecera en Dynamic_Registro_Asistencia con Disponible = 1
    await conn.execute(`
      INSERT INTO Dynamic_Registro_Asistencia (
        IdRegistro, \`Operación\`, Area, Evento, Novedad, \`Apoyo de Otra Operación\`,
        Trabajador2, Día, \`Fecha Final\`, Incapacidad, \`Cod Diagnostico\`, Diagnostico,
        \`PDF Incapacidad\`, \`PDF Historia Clinica\`, \`PDF Soporte\`,
        Origen, \`Fecha Registro\`, Usuario, Disponible
      ) VALUES (
        ?, ?, ?, 'Novedad', ?, 'NO',
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, 1
      )
    `, [
      idRegistro,
      null, // En Dynamic_Registro_Asistencia la operacion principal es Origen; Operación solo se usa si hay apoyo
      areaFinal || null,
      novedad,
      trab.trabajador,
      diaInicio,
      diaFin,
      tipoIncapacidad || null,
      codDiagValido,
      diagnostico || null,
      urlIncapacidad || '',
      urlHistoriaClinica || '',
      urlSoporte || '',
      opFinal,
      fechaRegistro,
      usuario
    ]);


    // 2. Generar filas para cada día en Dynamic_Asistencia
    const rowsToInsert = [];
    let fechaCursor = new Date(fInicio);

    for (let d = 0; d < diasTotales; d++) {
      const diaStr = fechaCursor.toISOString().split('T')[0];
      const quincena = await obtenerQuincenaFecha(diaStr);
      const idAsistencia = `${idRegistro}_D${diasTotales - d}`;

      rowsToInsert.push([
        idAsistencia,
        idRegistro,
        opFinal,
        (novedad === 'Incapacidad' || novedad.toLowerCase().includes('incapacidad')) ? 'Incapacidad' : novedad,
        prefijoEfectivo,
        diaStr,
        areaFinal || null,
        trab.trabajador,
        trab.identificacion,
        trab.nombreCompleto,
        null, // Hora Llegada
        null, // Hora Salida
        null, // Tiempo Laborado
        null, // Valor Destajo
        'NO',
        null,
        codDiagValido,
        diagValido,
        observaciones || null,
        urlSoporte || null,
        urlIncapacidad || null,
        urlHistoriaClinica || null,
        opFinal, // Origen
        fechaRegistro,
        usuario,
        area || null, // Disponible1
        'Yellow',
        tipoIncapacidad || null
      ]);

      fechaCursor.setUTCDate(fechaCursor.getUTCDate() + 1);
    }

    // Inserción en lote en Dynamic_Asistencia
    await conn.query(`
      INSERT INTO Dynamic_Asistencia (
        IdAsistencia, IdRegistro, \`Operación\`, Novedad, \`Prefijo Novedad\`,
        Día, Area, Trabajador, Cédula, Nombre,
        \`Hora Llegada\`, \`Hora Salida\`, \`Tiempo Laborado\`, \`Valor Destajo\`,
        \`Apoyo Otra Operación\`, \`Operación a la que Apoya\`,
        \`Cod Diagnostico\`, Diagnostico, Observaciones,
        \`Archivo Soporte\`, \`Archivo Incapacidad\`, \`Archivo Historia Clinica\`,
        Origen, \`Fecha Registro\`, Usuario, Disponible1,
        Estado, \`Tipo Incapacidad\`
      ) VALUES ?
    `, [rowsToInsert]);

    // 3. Documentos en Maestro_docTrabajador si vienen archivos
    if (urlIncapacidad || urlHistoriaClinica || urlSoporte) {
      // Buscar regional y estado de vinculación
      const [opInfo] = await conn.execute('SELECT REGIONAL FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1', [opFinal]);
      const regional = opInfo.length ? opInfo[0].REGIONAL : null;

      const [vincInfo] = await conn.execute('SELECT Estado, `Fecha de Ingreso` FROM Maestro_Vinculación WHERE `Identificación` = ? LIMIT 1', [trab.identificacion]);
      const estadoVinc = vincInfo.length ? vincInfo[0].Estado : 'Activo';
      const fechaIngresoVinc = vincInfo.length ? vincInfo[0]['Fecha de Ingreso'] : null;

      if (urlIncapacidad) {
        await registrarDocumentoSoporte(conn, {
          idReferencia: idRegistro, regional, operacion: opFinal, identificacion: trab.identificacion,
          estadoVinc, fechaIngresoVinc, tipoDoc: tipoDocIncapacidad || '31', urlDoc: urlIncapacidad, fechaReg: fechaRegistro, usuario,
          observaciones: tipoIncapacidad || novedad
        });
      }
      if (urlHistoriaClinica) {
        await registrarDocumentoSoporte(conn, {
          idReferencia: idRegistro, regional, operacion: opFinal, identificacion: trab.identificacion,
          estadoVinc, fechaIngresoVinc, tipoDoc: '62', urlDoc: urlHistoriaClinica, fechaReg: fechaRegistro, usuario,
          observaciones: tipoIncapacidad || novedad
        });
      }
      if (urlSoporte) {
        let tipoDocSoporte = '41';
        try {
          const [caRows] = await conn.execute(
            'SELECT TipoDocumento FROM Config_Asistencia WHERE Novedad = ? LIMIT 1',
            [novedad]
          );
          if (caRows.length && caRows[0].TipoDocumento && Number(caRows[0].TipoDocumento) !== 0) {
            tipoDocSoporte = String(caRows[0].TipoDocumento);
          }
        } catch (eDoc) {
          console.warn('[asistenciaService] Error consultando TipoDocumento en Config_Asistencia:', eDoc.message);
        }

        await registrarDocumentoSoporte(conn, {
          idReferencia: idRegistro, regional, operacion: opFinal, identificacion: trab.identificacion,
          estadoVinc, fechaIngresoVinc, tipoDoc: tipoDocSoporte, urlDoc: urlSoporte, fechaReg: fechaRegistro, usuario,
          observaciones: novedad
        });
      }
    }

    await conn.commit();
    return {
      success: true,
      idRegistro,
      diasRegistrados: rowsToInsert.length
    };
  } catch (err) {
    await conn.rollback();
    console.error('[asistenciaService] Error en registrarNovedadPorRango:', err);
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Consulta el listado de asistencias y novedades con paginación y filtros
 */
async function listarAsistencias({
  operacionesPermitidas = [],
  operacion = '',
  regional = '',
  anio = '',
  quincena = '',
  dia = '',
  fechaInicio = '',
  fechaFin = '',
  novedad = '',
  busqueda = '',
  pagina = 1,
  limite = 50
}) {
  const page = Math.max(1, parseInt(pagina, 10) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(limite, 10) || 50));
  const offset = (page - 1) * limit;

  let whereClauses = ['1=1'];
  const params = [];

  // Filtro de seguridad por operaciones permitidas
  if (operacion) {
    whereClauses.push('da.`Operación` = ?');
    params.push(operacion);
  } else if (operacionesPermitidas && operacionesPermitidas.length > 0) {
    whereClauses.push(`da.\`Operación\` IN (${operacionesPermitidas.map(() => '?').join(',')})`);
    params.push(...operacionesPermitidas);
  }

  if (regional) {
    whereClauses.push('mo.REGIONAL = ?');
    params.push(regional);
  }

  if (anio && anio !== 'todos') {
    whereClauses.push('da.`Día` >= ? AND da.`Día` <= ?');
    params.push(`${anio}-01-01`, `${anio}-12-31`);
  }

  if (quincena) {
    whereClauses.push('da.Quincena = ?');
    params.push(quincena);
  }

  if (dia) {
    whereClauses.push('da.`Día` = ?');
    params.push(dia);
  }

  if (fechaInicio) {
    whereClauses.push('da.`Día` >= ?');
    params.push(fechaInicio);
  }
  if (fechaFin) {
    whereClauses.push('da.`Día` <= ?');
    params.push(fechaFin);
  }

  if (novedad) {
    whereClauses.push('da.Novedad = ?');
    params.push(novedad);
  }

  if (busqueda && busqueda.trim()) {
    const qLike = `%${busqueda.trim().toLowerCase()}%`;
    whereClauses.push('(LOWER(COALESCE(ms.Trabajador, da.Nombre, da.Trabajador, "")) LIKE ? OR CAST(da.Cédula AS CHAR) LIKE ?)');
    params.push(qLike, qLike);
  }

  const whereSql = whereClauses.join(' AND ');

  // Conteo total
  const [cRows] = await pool.execute(
    `SELECT COUNT(*) AS total 
     FROM Dynamic_Asistencia da 
     LEFT JOIN Maestro_Operaciones mo ON da.\`Operación\` = mo.OPERACIÓN 
     LEFT JOIN \`Maestro_Segmentación\` ms ON da.Cédula = ms.Identificación
     WHERE ${whereSql}`,
    params
  );
  const total = cRows[0].total;

  // Consulta de datos
  const [rows] = await pool.execute(`
    SELECT 
      da.IdAsistencia AS idAsistencia,
      da.IdRegistro AS idRegistro,
      da.Estado AS estado,
      da.\`Operación\` AS operacion,
      COALESCE(mo.REGIONAL, '') AS regional,
      da.Novedad AS novedad,
      da.\`Prefijo Novedad\` AS prefijoNovedad,
      COALESCE(ca.Color, '#FFFFFF') AS color,
      DATE_FORMAT(da.\`Día\`, '%Y-%m-%d') AS dia,
      da.Area AS area,
      COALESCE(carea.AREA, da.Area) AS areaNombre,
      da.Disponible1 AS disponible1,
      COALESCE(capoyo.AREA, da.Disponible1) AS areaApoyoNombre,
      TRIM(SUBSTRING_INDEX(COALESCE(ms.Trabajador, da.Nombre, da.Trabajador, ''), '**', -1)) AS trabajador,
      COALESCE(ms.Identificación, da.Cédula) AS cedula,
      TRIM(SUBSTRING_INDEX(COALESCE(ms.Trabajador, da.Nombre, da.Trabajador, ''), '**', -1)) AS nombre,
      TIME_FORMAT(da.\`Hora Llegada\`, '%H:%i') AS horaLlegada,
      TIME_FORMAT(da.\`Hora Salida\`, '%H:%i') AS horaSalida,
      TIME_FORMAT(da.\`Tiempo Laborado\`, '%H:%i') AS tiempoLaborado,
      da.\`Apoyo Otra Operación\` AS apoyoOtraOperacion,
      da.\`Operación a la que Apoya\` AS operacionApoya,
      da.\`Cod Diagnostico\` AS codDiagnostico,
      da.Diagnostico AS diagnostico,
      da.Observaciones AS observaciones,
      COALESCE(da.\`Url Soporte\`, da.\`Archivo Soporte\`) AS urlSoporte,
      COALESCE(da.\`Url Incapacidad\`, da.\`Archivo Incapacidad\`) AS urlIncapacidad,
      COALESCE(da.\`Url Historia Clinica\`, da.\`Archivo Historia Clinica\`) AS urlHistoriaClinica,
      DATE_FORMAT(da.\`Fecha Registro\`, '%Y-%m-%d %H:%i') AS fechaRegistro,
      da.Usuario AS usuario,
      da.Estado AS estado,
      da.Quincena AS quincena
    FROM Dynamic_Asistencia da
    LEFT JOIN Maestro_Operaciones mo ON da.\`Operación\` = mo.OPERACIÓN
    LEFT JOIN Config_Asistencia ca ON da.Novedad = ca.Novedad
    LEFT JOIN Maestro_Segmentación ms ON da.Cédula = ms.Identificación
    LEFT JOIN Config_Area carea ON da.Area = carea.ID
    LEFT JOIN Config_Area capoyo ON da.Disponible1 = capoyo.ID
    WHERE ${whereSql}
    ORDER BY da.\`Día\` DESC, da.\`Fecha Registro\` DESC, da.IdAsistencia DESC
    LIMIT ${limit} OFFSET ${offset}
  `, params);

  return {
    total,
    pagina: page,
    limite: limit,
    totalPaginas: Math.ceil(total / limit),
    registros: rows
  };
}

/**
 * Obtiene métricas y conteos interactivos para los filtros de Asistencia
 */
async function obtenerMetricasAsistencia({
  operacionesPermitidas = [],
  anio = '2026',
  quincena = '',
  dia = '',
  regional = '',
  operacion = '',
  novedad = '',
  busqueda = ''
}) {
  const commonWhere = ['1=1'];
  const commonParams = [];

  if (operacion) {
    commonWhere.push('da.`Operación` = ?');
    commonParams.push(operacion);
  } else if (operacionesPermitidas && operacionesPermitidas.length > 0) {
    commonWhere.push(`da.\`Operación\` IN (${operacionesPermitidas.map(() => '?').join(',')})`);
    commonParams.push(...operacionesPermitidas);
  }

  if (anio && anio !== 'todos') {
    commonWhere.push('da.`Día` >= ? AND da.`Día` <= ?');
    commonParams.push(`${anio}-01-01`, `${anio}-12-31`);
  }

  if (busqueda && busqueda.trim()) {
    const qLike = `%${busqueda.trim()}%`;
    commonWhere.push('(da.Nombre LIKE ? OR CAST(da.Cédula AS CHAR) LIKE ? OR da.Trabajador LIKE ?)');
    commonParams.push(qLike, qLike, qLike);
  }

  // 1. Quincenas del año seleccionado (no filtra por quincena, ni dia, ni novedad)
  const qWhere = [...commonWhere];
  const qParams = [...commonParams];
  if (regional) {
    qWhere.push('mo.REGIONAL = ?');
    qParams.push(regional);
  }
  const [quincenasRows] = await pool.query(`
    SELECT da.Quincena AS quincena, COUNT(*) AS totalCount
    FROM Dynamic_Asistencia da
    LEFT JOIN Maestro_Operaciones mo ON da.\`Operación\` = mo.OPERACIÓN
    WHERE ${qWhere.join(' AND ')} AND da.Quincena IS NOT NULL AND da.Quincena != ''
    GROUP BY da.Quincena
    ORDER BY MIN(da.\`Día\`) DESC
  `, qParams);

  // 2. Días de la quincena (si se especificó quincena)
  let diasRows = [];
  if (quincena) {
    const dWhere = [...commonWhere];
    const dParams = [...commonParams];
    dWhere.push('da.Quincena = ?');
    dParams.push(quincena);
    if (regional) {
      dWhere.push('mo.REGIONAL = ?');
      dParams.push(regional);
    }
    const [dRows] = await pool.query(`
      SELECT DATE_FORMAT(da.\`Día\`, '%Y-%m-%d') AS dia, COUNT(*) AS totalCount
      FROM Dynamic_Asistencia da
      LEFT JOIN Maestro_Operaciones mo ON da.\`Operación\` = mo.OPERACIÓN
      WHERE ${dWhere.join(' AND ')}
      GROUP BY da.\`Día\`
      ORDER BY da.\`Día\` DESC
    `, dParams);
    diasRows = dRows;
  }

  // 3. Regionales y Operaciones (filtra por quincena, dia, novedad)
  const roWhere = [...commonWhere];
  const roParams = [...commonParams];
  if (quincena) {
    roWhere.push('da.Quincena = ?');
    roParams.push(quincena);
  }
  if (dia) {
    roWhere.push('da.`Día` = ?');
    roParams.push(dia);
  }
  if (novedad) {
    roWhere.push('da.Novedad = ?');
    roParams.push(novedad);
  }
  const [regOpsRows] = await pool.query(`
    SELECT 
      COALESCE(mo.REGIONAL, 'SIN REGIONAL') AS regional,
      da.\`Operación\` AS operacion,
      COUNT(*) AS totalCount
    FROM Dynamic_Asistencia da
    LEFT JOIN Maestro_Operaciones mo ON da.\`Operación\` = mo.OPERACIÓN
    WHERE ${roWhere.join(' AND ')}
    GROUP BY mo.REGIONAL, da.\`Operación\`
    ORDER BY mo.REGIONAL, da.\`Operación\`
  `, roParams);

  // 4. Novedades (filtra por quincena, dia, regional, operacion)
  const novWhere = [...commonWhere];
  const novParams = [...commonParams];
  if (quincena) {
    novWhere.push('da.Quincena = ?');
    novParams.push(quincena);
  }
  if (dia) {
    novWhere.push('da.`Día` = ?');
    novParams.push(dia);
  }
  if (regional) {
    novWhere.push('mo.REGIONAL = ?');
    novParams.push(regional);
  }
  const [novRows] = await pool.query(`
    SELECT 
      da.Novedad AS novedad,
      COALESCE(ca.Color, '#FFFFFF') AS color,
      COUNT(*) AS totalCount
    FROM Dynamic_Asistencia da
    LEFT JOIN Maestro_Operaciones mo ON da.\`Operación\` = mo.OPERACIÓN
    LEFT JOIN Config_Asistencia ca ON da.Novedad = ca.Novedad
    WHERE ${novWhere.join(' AND ')}
    GROUP BY da.Novedad, ca.Color
    ORDER BY totalCount DESC
  `, novParams);

  // 5. Total registros con todos los filtros activos
  const totalWhere = [...roWhere];
  const totalParams = [...roParams];
  if (regional) {
    totalWhere.push('mo.REGIONAL = ?');
    totalParams.push(regional);
  }
  const [tRow] = await pool.query(`
    SELECT COUNT(*) AS total
    FROM Dynamic_Asistencia da
    LEFT JOIN Maestro_Operaciones mo ON da.\`Operación\` = mo.OPERACIÓN
    WHERE ${totalWhere.join(' AND ')}
  `, totalParams);

  return {
    total: tRow[0]?.total || 0,
    quincenas: quincenasRows,
    dias: diasRows,
    regionalesOps: regOpsRows,
    novedades: novRows
  };
}


/**
 * Elimina un registro de asistencia validando permisos y bloqueo
 */
async function eliminarRegistroAsistencia({ idAsistencia, usuario, rol, operacionesPermitidas = [], sinFiltro = false }) {
  const [rows] = await pool.query(
    'SELECT IdAsistencia, `Operación` as operacion, Novedad as novedad, DATE_FORMAT(`Día`, "%Y-%m-%d") as dia, Estado as estado FROM Dynamic_Asistencia WHERE IdAsistencia = ?',
    [idAsistencia]
  );
  if (!rows.length) throw new Error('El registro no existe.');
  const rec = rows[0];

  if (!sinFiltro && !operacionesPermitidas.includes(rec.operacion)) {
    throw new Error('No tienes permiso para operar en esta sede.');
  }

  const paramsCfg = await obtenerParametrosAsistencia();
  const rolNorm = (rol || '').toLowerCase().trim();
  const puedeTodos = paramsCfg.rolesEditarEliminarTodosEstados.map(r => r.toLowerCase().trim()).includes(rolNorm);
  const puedeYellow = paramsCfg.rolesEditarEliminarYellow.map(r => r.toLowerCase().trim()).includes(rolNorm);

  const esAsistencia = (rec.novedad || '').trim().toLowerCase() === 'asistencia';
  const esYellow = (rec.estado || '').toLowerCase() === 'yellow';

  if (!puedeTodos) {
    if (!esYellow || !puedeYellow) {
      throw new Error('Solo los roles de Nómina y Sistema pueden eliminar registros en este estado.');
    }
    if (esAsistencia) {
      throw new Error('Solo los roles de Nómina y Sistema pueden eliminar registros de Asistencia.');
    }
    const b = await verificarBloqueoNomina(rec.operacion, rec.dia, rol);
    if (b.bloqueado) throw new Error(b.mensaje);
  }

  await pool.query('DELETE FROM Dynamic_Asistencia WHERE IdAsistencia = ?', [idAsistencia]);
  return { ok: true, idAsistencia };
}

/**
 * Elimina registros de asistencia en lote validando permisos y bloqueo
 */
async function eliminarRegistrosAsistenciaLote({ idsAsistencia = [], usuario, rol, operacionesPermitidas = [], sinFiltro = false }) {
  if (!idsAsistencia || !Array.isArray(idsAsistencia) || !idsAsistencia.length) {
    throw new Error('No se enviaron registros para eliminar.');
  }

  const paramsCfg = await obtenerParametrosAsistencia();
  const rolNorm = (rol || '').toLowerCase().trim();
  const puedeTodos = paramsCfg.rolesEditarEliminarTodosEstados.map(r => r.toLowerCase().trim()).includes(rolNorm);
  const puedeYellow = paramsCfg.rolesEditarEliminarYellow.map(r => r.toLowerCase().trim()).includes(rolNorm);

  if (!puedeTodos && !puedeYellow) {
    throw new Error('Tu rol no tiene permiso para eliminar registros.');
  }

  const placeholders = idsAsistencia.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT IdAsistencia, \`Operación\` as operacion, Novedad as novedad, DATE_FORMAT(\`Día\`, "%Y-%m-%d") as dia, Estado as estado 
     FROM Dynamic_Asistencia 
     WHERE IdAsistencia IN (${placeholders})`,
    idsAsistencia
  );

  if (!rows.length) {
    throw new Error('No se encontraron los registros seleccionados.');
  }

  const eliminables = [];
  const noEliminables = [];

  for (const rec of rows) {
    if (!sinFiltro && !operacionesPermitidas.includes(rec.operacion)) {
      noEliminables.push(`${rec.IdAsistencia}: Sin permiso en sede`);
      continue;
    }
    const esAsistencia = (rec.novedad || '').trim().toLowerCase() === 'asistencia';
    const esYellow = (rec.estado || '').toLowerCase() === 'yellow';

    if (rec.estado === 'Green' && !puedeTodos) {
      noEliminables.push(`${rec.IdAsistencia}: Bloqueado en Green`);
      continue;
    }
    if (esYellow && !puedeTodos && esAsistencia) {
      noEliminables.push(`${rec.IdAsistencia}: Asistencia no eliminable para este rol`);
      continue;
    }
    if (!esYellow && !puedeTodos) {
      noEliminables.push(`${rec.IdAsistencia}: Estado no permitido`);
      continue;
    }

    if (!puedeTodos) {
      const b = await verificarBloqueoNomina(rec.operacion, rec.dia, rol);
      if (b.bloqueado) {
        noEliminables.push(`${rec.IdAsistencia}: Bloqueado por nómina`);
        continue;
      }
    }

    eliminables.push(rec.IdAsistencia);
  }

  if (!eliminables.length) {
    throw new Error(`Ningún registro pudo ser eliminado (${noEliminables.slice(0, 3).join(', ')})`);
  }

  const delPlaceholders = eliminables.map(() => '?').join(',');
  await pool.query(
    `DELETE FROM Dynamic_Asistencia WHERE IdAsistencia IN (${delPlaceholders})`,
    eliminables
  );

  return {
    ok: true,
    eliminados: eliminables.length,
    noEliminados: noEliminables.length,
    detallesNoEliminados: noEliminables
  };
}

/**
 * Edita un registro de asistencia validando permisos y bloqueo
 */
async function editarRegistroAsistencia({
  idAsistencia,
  usuario,
  rol,
  operacionesPermitidas = [],
  sinFiltro = false,
  horaEntrada,
  horaSalida,
  novedad,
  prefijoNovedad,
  area,
  disponible1,
  apoyoOtraOperacion,
  operacionApoya,
  tipoIncapacidad,
  codDiagnostico,
  diagnostico,
  observaciones
}) {
  const [rows] = await pool.query(
    'SELECT IdAsistencia, `Operación` as operacion, Area as area, Disponible1 as disponible1, Novedad as novedad, TIME_FORMAT(`Hora Llegada`, "%H:%i") as horaLlegada, TIME_FORMAT(`Hora Salida`, "%H:%i") as horaSalida, DATE_FORMAT(`Día`, "%Y-%m-%d") as dia, Estado as estado FROM Dynamic_Asistencia WHERE IdAsistencia = ?',
    [idAsistencia]
  );
  if (!rows.length) throw new Error('El registro no existe.');
  const rec = rows[0];

  if (!sinFiltro && !operacionesPermitidas.includes(rec.operacion)) {
    throw new Error('No tienes permiso para operar en esta sede.');
  }

  const paramsCfg = await obtenerParametrosAsistencia();
  const rolNorm = (rol || '').toLowerCase().trim();
  const puedeTodos = paramsCfg.rolesEditarEliminarTodosEstados.map(r => r.toLowerCase().trim()).includes(rolNorm);
  const puedeYellow = paramsCfg.rolesEditarEliminarYellow.map(r => r.toLowerCase().trim()).includes(rolNorm);
  const esYellow = (rec.estado || '').toLowerCase() === 'yellow';

  if (rec.estado === 'Green' && !puedeTodos) {
    throw new Error('Este registro está bloqueado en estado Green por Nómina y no puede ser editado.');
  }
  if (!esYellow && !puedeTodos) {
    throw new Error('No tiene permiso para editar registros en este estado.');
  }
  if (esYellow && !puedeYellow && !puedeTodos) {
    throw new Error('Tu rol no tiene permiso para editar registros en estado Yellow.');
  }

  if (!puedeTodos) {
    const b = await verificarBloqueoNomina(rec.operacion, rec.dia, rol);
    if (b.bloqueado) throw new Error(b.mensaje);
  }

  // Resolver prefijo de novedad si cambió la novedad
  let nuevoPrefijo = prefijoNovedad;
  if (novedad && !nuevoPrefijo) {
    const [pRows] = await pool.query('SELECT `Prefijo Novedad` as pref FROM Config_Asistencia WHERE Novedad = ? LIMIT 1', [novedad]);
    if (pRows.length && pRows[0].pref) nuevoPrefijo = pRows[0].pref;
  }

  // Diagnóstico CIE-10: resolver descripción desde Config_Diagnostico si se envía el código
  let diagFinal = diagnostico ? diagnostico.trim() : null;
  let codDiagFinal = codDiagnostico ? codDiagnostico.trim().toUpperCase() : null;
  if (codDiagFinal) {
    const [cdRows] = await pool.query('SELECT Cod, `Descripción` as descr FROM Config_Diagnostico WHERE Cod = ? LIMIT 1', [codDiagFinal]);
    if (cdRows.length) {
      codDiagFinal = cdRows[0].Cod;
      if (!diagFinal) diagFinal = cdRows[0].descr ? cdRows[0].descr.substring(0, 280) : null;
    }
  }

  // TODO: Cuando se retire AppSheet, eliminar la columna 'Diagnostico' de Dynamic_Asistencia y Dynamic_Registro_Asistencia
  // ya que el dato se resuelve únicamente mediante 'Cod Diagnostico' (JOIN con Config_Diagnostico.Cod).

  // Calcular tiempo laborado y limpiar horarios si la novedad deja de ser Asistencia
  const novFinal = novedad || rec.novedad;
  const esAsistencia = novFinal.toLowerCase() === 'asistencia';
  let horaEntradaFinal = null;
  let horaSalidaFinal = null;
  let tiempoLaborado = null;

  if (esAsistencia) {
    horaEntradaFinal = horaEntrada !== undefined ? (horaEntrada || null) : rec.horaLlegada;
    horaSalidaFinal = horaSalida !== undefined ? (horaSalida || null) : rec.horaSalida;
    if (horaEntradaFinal && horaSalidaFinal) {
      tiempoLaborado = calcularTiempoLaborado(horaEntradaFinal, horaSalidaFinal);
    }
  }

  const actualizarDisponible1 = esAsistencia && disponible1 !== undefined;
  const disponible1Final = actualizarDisponible1 ? (disponible1 || area || rec.area || null) : null;

  await pool.query(`
    UPDATE Dynamic_Asistencia SET
      \`Hora Llegada\` = ?,
      \`Hora Salida\` = ?,
      \`Tiempo Laborado\` = ?,
      Novedad = COALESCE(?, Novedad),
      \`Prefijo Novedad\` = COALESCE(?, \`Prefijo Novedad\`),
      Area = COALESCE(?, Area),
      Disponible1 = CASE WHEN ? = 1 THEN ? ELSE Disponible1 END,
      \`Apoyo Otra Operación\` = COALESCE(?, \`Apoyo Otra Operación\`),
      \`Operación a la que Apoya\` = ?,
      \`Tipo Incapacidad\` = ?,
      \`Cod Diagnostico\` = ?,
      Diagnostico = ?,
      Observaciones = ?
    WHERE IdAsistencia = ?
  `, [
    horaEntradaFinal,
    horaSalidaFinal,
    tiempoLaborado,
    novedad || null,
    nuevoPrefijo || null,
    area || null,
    actualizarDisponible1 ? 1 : 0,
    disponible1Final,
    apoyoOtraOperacion || null,
    operacionApoya || null,
    tipoIncapacidad || null,
    codDiagFinal,
    diagFinal,
    observaciones !== undefined ? observaciones : null,
    idAsistencia
  ]);

  return { ok: true, idAsistencia };
}

module.exports = {
  obtenerCatalogoNovedades,
  obtenerParametrosAsistencia,
  verificarBloqueoNomina,
  obtenerAreasOperacion,
  buscarTrabajadoresSegmentacion,
  buscarTrabajadoresVinculacion,
  registrarAsistenciaDiaria,
  registrarNovedadPorRango,
  editarRegistroAsistencia,
  eliminarRegistroAsistencia,
  eliminarRegistrosAsistenciaLote,
  listarAsistencias,
  obtenerMetricasAsistencia,
  calcularTiempoLaborado,
  obtenerQuincenaFecha
};
