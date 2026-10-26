const pool = require('./db');
const { randomUUID } = require('crypto');
const { LOGO_BASE64 } = require('./assets');
const { generarPDFDesdeHTML } = require('./renderer');
const { subirPDFAts, subirEvidenciaAts, obtenerFirmaBase64Reciente } = require('./storage');
// resolverCoordinadorOperacionATS se define localmente con jerarquia de 3 pasos
const { rolPuedeSst, autorizarAccionSst } = require('./configSst');
const {
  enviarEmailFirmaAtsTrabajador,
  enviarEmailFirmaAtsCoordinador,
  enviarEmailFirmaAtsSst
} = require('./email');

// 12 Pasos estándar según formato SST-F-036 v02
const PASOS_ESTANDAR_ATS = [
  {
    num: 1,
    paso: 'Llegada y aproximación del vehículo/carga al muelle.',
    peligros: 'Vehículo-peatón, reversa, puntos ciegos. Atropellamiento/choque.',
    controles: 'Controlar acceso y maniobra; mantener peatones fuera de trayectoria; coordinar señales.'
  },
  {
    num: 2,
    paso: 'Posicionamiento e inmovilización del vehículo.',
    peligros: 'Mal alineamiento o movimiento inesperado. Atrapamiento/caída de carga.',
    controles: 'Confirmar muelle, área despejada e inmovilización antes de iniciar.'
  },
  {
    num: 3,
    paso: 'Verificación de muelle, rampa/puente y área.',
    peligros: 'Bordes, desniveles, piso húmedo, obstáculos, iluminación. Caídas/pérdida de control.',
    controles: 'Verificar condición y capacidad del acceso; ruta despejada e iluminación suficiente.'
  },
  {
    num: 4,
    paso: 'Apertura de puertas y verificación inicial de carga.',
    peligros: 'Carga desplazada/inestable. Golpes o caída de objetos.',
    controles: 'Abrir controladamente fuera de la trayectoria; detener si la carga está inestable.'
  },
  {
    num: 5,
    paso: 'Preoperacional del estibador.',
    peligros: 'Fallas en horquillas, ruedas, timón, hidráulico, freno, controles, batería/alarma.',
    controles: 'Inspeccionar antes del uso; no utilizar equipo con defectos que afecten seguridad.'
  },
  {
    num: 6,
    paso: 'Verificación de pallet, peso, dimensiones y estabilidad.',
    peligros: 'Pallet deteriorado/capacidad insuficiente. Caída o volcamiento.',
    controles: 'Confirmar integridad, estabilidad, capacidad nominal y visibilidad antes de mover.'
  },
  {
    num: 7,
    paso: 'Toma y desplazamiento de la carga.',
    peligros: 'Atrapamiento, peatones, colisión, visibilidad limitada.',
    controles: 'Centrar horquillas; manos/pies alejados; ruta segura, velocidad controlada y distancia.'
  },
  {
    num: 8,
    paso: 'Operación estibador manual.',
    peligros: 'Sobreesfuerzo y atrapamiento con timón/ruedas.',
    controles: 'Controlar timón, conservar espacio y extremidades alejadas; no transportar personas.'
  },
  {
    num: 9,
    paso: 'Operación estibador eléctrico.',
    peligros: 'Movimiento inesperado, colisión, uso no autorizado.',
    controles: 'Solo personal autorizado/capacitado; comprobar controles, freno y dispositivos de seguridad.'
  },
  {
    num: 10,
    paso: 'Ingreso a vehículo y cargue/descargue.',
    peligros: 'Movimiento vehículo, borde muelle, acceso inseguro.',
    controles: 'Ingresar con vehículo inmovilizado y rampa/puente verificados; controlar bordes y personas.'
  },
  {
    num: 11,
    paso: 'Ubicación/descenso de mercancía.',
    peligros: 'Descenso sobre extremidades o carga inestable.',
    controles: 'Superficie estable; bajar lento; zona libre; comprobar estabilidad antes de retirar horquillas.'
  },
  {
    num: 12,
    paso: 'Cierre y liberación del muelle.',
    peligros: 'Equipo/riesgos residuales, salida prematura.',
    controles: 'Estacionar, bajar horquillas, retirar residuos, reportar novedades y liberar según procedimiento.'
  }
];

// Preoperacional Estibadores estándar
const ITEMS_ESTIBADOR_MANUAL = [
  '1. Capacidad/identificación legible y compatible.',
  '2. Horquillas sin daños/deformaciones.',
  '3. Ruedas/rodillos en buen estado.',
  '4. Timón/manija firme y controlable.',
  '5. Sistema hidráulico sin fugas; eleva/desciende controladamente.',
  '6. Estructura/uniones sin daños visibles.',
  '7. Equipo inspeccionado antes del uso.'
];

const ITEMS_ESTIBADOR_ELECTRICO = [
  '1. Capacidad/identificación legible y compatible.',
  '2. Horquillas y ruedas/rodillos en buen estado.',
  '3. Timón y mandos responden correctamente.',
  '4. Freno/control de parada operativo.',
  '5. Alarma/bocina y dispositivos de seguridad operativos.',
  '6. Batería/conexiones sin daños visibles y carga suficiente.',
  '7. Operador autorizado/capacitado y equipo inspeccionado.'
];

// Verificación EPP
const ITEMS_EPP = [
  '1. Calzado de seguridad en buen estado y correctamente usado.',
  '2. Guantes de protección adecuados al tipo de mercancía y riesgo de manipulación.',
  '3. Uniforme/ropa de trabajo requerida para la operación.',
  '4. Prenda de alta visibilidad cuando la evaluación del sitio/operación lo requiera.',
  '5. Protección visual cuando exista riesgo de proyección o condición definida por la evaluación.',
  '6. Protección auditiva/respiratoria u otro EPP cuando la evaluación específica lo determine.'
];

// Otras Herramientas
const ITEMS_HERRAMIENTAS = [
  '1. Gancho(s): estructura, punta, mango y unión en buen estado; sin fisuras, deformaciones ni elementos sueltos.',
  '2. Escalera(s): peldaños, largueros y zapatas en buen estado; limpia, estable y sin daños visibles.',
  '3. Martillo(s): cabeza firme, mango sin fisuras/roturas y superficie de golpe en buen estado.',
  '4. Sierra(s): hoja/disco, mango o guarda en buen estado; sin daños visibles y adecuada para la tarea.',
  '5. La herramienta seleccionada es adecuada para la tarea y se encuentra limpia y en condiciones seguras de uso.',
  '6. El trabajador conoce el uso seguro de la herramienta y la emplea únicamente para su función prevista.',
  '7. El área de uso está despejada y se controlan personas cercanas, puntos de golpe, corte, caída o atrapamiento.',
  '8. Los EPP requeridos según la herramienta y el riesgo están disponibles y se usan correctamente.'
];

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatFechaEsp(dateVal) {
  if (!dateVal) return '—';
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateVal)) {
    const [y, m, d] = dateVal.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const date = new Date(dateVal);
  if (isNaN(date)) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}


/**
 * Prellenado de Responsable Operación (Coordinador) según jerarquía de 3 pasos:
 * 1. Buscar Operación en Maestro_Usuarios para obtener Regional, y con esa Regional buscar Rol = 'CoordinadorR'.
 * 2. Si no hay CoordinadorR, buscar por columna Operación donde Rol = 'Coordinador'.
 * 3. Si no hay Coordinador, buscar en Maestro_Operaciones el valor de SOCIODEMOGRAFICA, y buscar en Maestro_Usuarios
 *    si Dispositivo contiene ese texto y Rol IN ('Coordinador', 'CoordinadorR').
 */
async function resolverCoordinadorOperacionATS(operacion) {
  if (!operacion || !operacion.trim()) return { nombre: '', step: 0 };
  const op = operacion.trim();

  try {
    // Paso 1: Buscar Operación en Maestro_Usuarios para obtener Regional, y con esa Regional buscar Rol = 'CoordinadorR'
    let [uRows] = await pool.execute(
      'SELECT DISTINCT Regional FROM Maestro_Usuarios WHERE `Operación` = ? AND Regional IS NOT NULL AND Regional <> ""',
      [op]
    );
    let regionales = uRows.map(r => String(r.Regional).trim()).filter(Boolean);
    if (!regionales.length) {
      const [opRows] = await pool.execute(
        'SELECT DISTINCT REGIONAL FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? AND REGIONAL IS NOT NULL AND REGIONAL <> ""',
        [op]
      );
      regionales = opRows.map(r => String(r.REGIONAL).trim()).filter(Boolean);
    }

    if (regionales.length) {
      const ph = regionales.map(() => '?').join(',');
      const [coordR] = await pool.execute(
        `SELECT Nombre FROM Maestro_Usuarios WHERE Regional IN (${ph}) AND Rol = 'CoordinadorR' AND Nombre IS NOT NULL AND Nombre <> '' ORDER BY ID ASC LIMIT 1`,
        regionales
      );
      if (coordR.length && coordR[0].Nombre) {
        return { nombre: coordR[0].Nombre.trim(), step: 1 };
      }
    }

    // Paso 2: Si no hay CoordinadorR, buscar por columna Operación donde Rol = 'Coordinador'
    const [coordDirect] = await pool.execute(
      'SELECT Nombre FROM Maestro_Usuarios WHERE `Operación` = ? AND Rol = "Coordinador" AND Nombre IS NOT NULL AND Nombre <> "" ORDER BY ID ASC LIMIT 1',
      [op]
    );
    if (coordDirect.length && coordDirect[0].Nombre) {
      return { nombre: coordDirect[0].Nombre.trim(), step: 2 };
    }

    // Paso 3: Si no hay rol de Coordinador, buscar por Operación en la columna OPERACIÓN de Maestro_Operaciones,
    // tomar el valor de SOCIODEMOGRAFICA, y buscar en Maestro_Usuarios si Dispositivo contiene ese texto y Rol IN ('Coordinador', 'CoordinadorR')
    const [opSocio] = await pool.execute(
      'SELECT SOCIODEMOGRAFICA FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
      [op]
    );
    const socio = opSocio.length ? String(opSocio[0].SOCIODEMOGRAFICA || '').trim() : '';
    if (socio) {
      const [disp] = await pool.execute(
        'SELECT Nombre FROM Maestro_Usuarios WHERE Rol IN ("Coordinador", "CoordinadorR") AND Dispositivo LIKE ? AND Nombre IS NOT NULL AND Nombre <> "" ORDER BY ID ASC LIMIT 1',
        [`%${socio}%`]
      );
      if (disp.length && disp[0].Nombre) {
        return { nombre: disp[0].Nombre.trim(), step: 3 };
      }
    }
  } catch (err) {
    console.warn('[atsService] Error resolviendo coordinador ATS:', err.message);
  }

  return { nombre: '', step: 0 };
}

/**
 * Obtener firma digital desde el bucket de firmas para un usuario (Coordinador o Responsable SST).
 * Flujo: Maestro_Usuarios (ID o Nombre) -> Colaborador -> Maestro_Segmentación (Trabajador) -> Identificación -> Bucket.
 */
async function obtenerFirmaUsuarioPorColaborador(usuarioIdONombre) {
  if (!usuarioIdONombre) return null;

  try {
    // 1. Buscar en Maestro_Usuarios
    const [uRows] = await pool.execute(
      'SELECT ID, Nombre, Colaborador FROM Maestro_Usuarios WHERE ID = ? OR Nombre = ? LIMIT 1',
      [usuarioIdONombre, usuarioIdONombre]
    );
    if (!uRows.length) return null;

    const colab = uRows[0].Colaborador;
    let ident = null;

    // 2. Si tiene Colaborador, buscar ese dato en la columna Trabajador de Maestro_Segmentación
    if (colab) {
      const [segRows] = await pool.execute(
        'SELECT `Identificación` FROM `Maestro_Segmentación` WHERE `Trabajador` = ? LIMIT 1',
        [colab]
      );
      if (segRows.length && segRows[0]['Identificación']) {
        ident = String(segRows[0]['Identificación']).trim();
      }
    }

    // Si no se encontró por Trabajador, verificar si Colaborador tiene 'CEDULA ** NOMBRE'
    if (!ident && colab && colab.includes(' ** ')) {
      const rawCed = colab.split(' ** ')[0].trim();
      if (/^\d+$/.test(rawCed)) ident = rawCed;
    }

    // 3. Con la Identificación, buscar en el bucket de firmas
    if (ident) {
      const firmaUrl = await obtenerFirmaBase64Reciente(ident);
      if (firmaUrl) return firmaUrl;
    }
  } catch (err) {
    console.warn(`[atsService] Error buscando firma para usuario ${usuarioIdONombre}:`, err.message);
  }

  return null;
}

function parseJsonSafe(val, fallback = null) {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch (_) {
    return fallback;
  }
}

/**
 * Consulta de permisos del rol en Config_Parametros
 */
async function obtenerConfigAts(rol) {
  return {
    puedeRegistrar: await rolPuedeSst(rol, 'ATS', 'crear'),
    puedeEliminar: await rolPuedeSst(rol, 'ATS', 'eliminar'),
  };
}

/**
 * Listado de registros ATS según alcance de usuario y filtros
 */
async function listarRegistrosAts(acceso, query = {}) {
  const params = [];
  const conditions = [];

  // 1. Alcance según Maestro_Menu
  if (!acceso.sinFiltro) {
    const ops = acceso.operacionesFiltro || [];
    if (ops.length > 0) {
      const ph = ops.map(() => '?').join(',');
      conditions.push(`a.operacion IN (${ph})`);
      params.push(...ops);
    } else {
      conditions.push('1 = 0');
    }
  }

  // 2. Filtro Regional
  if (query.regional && query.regional.trim()) {
    conditions.push('a.regional = ?');
    params.push(query.regional.trim());
  }

  // 3. Filtro Operación
  if (query.operacion && query.operacion.trim()) {
    conditions.push('a.operacion = ?');
    params.push(query.operacion.trim());
  }

  // 4. Filtro Estado
  if (query.estado && query.estado.trim()) {
    conditions.push('a.estado = ?');
    params.push(query.estado.trim());
  }

  // 5. Filtro Fechas de Vigencia
  if (query.fechaDesde) {
    conditions.push('a.vigencia_desde >= ?');
    params.push(query.fechaDesde);
  }
  if (query.fechaHasta) {
    conditions.push('a.vigencia_hasta <= ?');
    params.push(query.fechaHasta);
  }

  // 6. Búsqueda de texto
  if (query.busqueda && query.busqueda.trim()) {
    const term = `%${query.busqueda.trim()}%`;
    conditions.push(`(
      a.id_ats LIKE ? OR
      a.regional LIKE ? OR
      a.operacion LIKE ? OR
      a.muelle_ubicacion LIKE ? OR
      a.coordinador_operacion_nombre LIKE ? OR
      a.responsable_sst_nombre LIKE ?
    )`);
    params.push(term, term, term, term, term, term);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Conteos por estado
  const [countsRows] = await pool.execute(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN a.estado = 'completado' THEN 1 ELSE 0 END) AS completados,
      SUM(CASE WHEN a.estado = 'pendiente_trabajadores' THEN 1 ELSE 0 END) AS pend_trabajadores,
      SUM(CASE WHEN a.estado = 'pendiente_coordinador' THEN 1 ELSE 0 END) AS pend_coord,
      SUM(CASE WHEN a.estado = 'pendiente_sst' THEN 1 ELSE 0 END) AS pend_sst
    FROM Dynamic_ats a
    ${whereSql}
  `, params);

  const stats = {
    total: Number(countsRows[0]?.total || 0),
    completados: Number(countsRows[0]?.completados || 0),
    pend_trabajadores: Number(countsRows[0]?.pend_trabajadores || 0),
    pend_coord: Number(countsRows[0]?.pend_coord || 0),
    pend_sst: Number(countsRows[0]?.pend_sst || 0)
  };

  // Paginación y registros
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(query.limit, 10) || 25));
  const offset = (page - 1) * limit;

  const [rows] = await pool.execute(`
    SELECT
      a.id_ats,
      a.regional,
      a.operacion,
      a.muelle_ubicacion,
      DATE_FORMAT(a.vigencia_desde, '%Y-%m-%d') AS vigencia_desde,
      DATE_FORMAT(a.vigencia_hasta, '%Y-%m-%d') AS vigencia_hasta,
      a.turnos,
      a.horarios,
      a.coordinador_operacion_nombre,
      a.responsable_sst_nombre,
      a.estado,
      a.url_pdf,
      a.fecha_creacion,
      (SELECT COUNT(*) FROM Dynamic_ats_trabajadores t WHERE t.id_ats = a.id_ats) AS total_trabajadores,
      (SELECT COUNT(*) FROM Dynamic_ats_trabajadores t WHERE t.id_ats = a.id_ats AND t.estado_firma = 'ACEPTADA') AS trabajadores_firmados,
      (CASE WHEN a.fecha_firma_coordinador IS NOT NULL THEN 1 ELSE 0 END) AS coord_firmado,
      (CASE WHEN a.fecha_firma_sst IS NOT NULL THEN 1 ELSE 0 END) AS sst_firmado
    FROM Dynamic_ats a
    ${whereSql}
    ORDER BY a.id_ats DESC
    LIMIT ${limit} OFFSET ${offset}
  `, params);

  return {
    items: rows,
    stats,
    page,
    limit,
    total: stats.total,
    totalPages: Math.ceil(stats.total / limit)
  };
}

/**
 * Detalle completo de un ATS con sus trabajadores y evidencias
 */
async function obtenerDetalleAts(idAts, acceso = null) {
  const [rows] = await pool.execute(
    'SELECT * FROM Dynamic_ats WHERE id_ats = ?',
    [idAts]
  );
  if (!rows.length) return null;

  const ats = rows[0];

  // Si se provee acceso, verificar autorización de regional/operación
  if (acceso && !acceso.sinFiltro) {
    const ops = acceso.operacionesFiltro || [];
    if (!ops.includes(ats.operacion)) {
      return null;
    }
  }

  // Parsear campos JSON
  ats.pasos_analisis = parseJsonSafe(ats.pasos_analisis, PASOS_ESTANDAR_ATS);
  ats.preoperacional_estibadores = parseJsonSafe(ats.preoperacional_estibadores, {
    manual: ITEMS_ESTIBADOR_MANUAL.map(it => ({ item: it, cumple: 'S', obs: '' })),
    electrico: ITEMS_ESTIBADOR_ELECTRICO.map(it => ({ item: it, cumple: 'S', obs: '' })),
    obs_manual: '',
    obs_electrico: ''
  });
  ats.verificacion_epp = parseJsonSafe(ats.verificacion_epp, ITEMS_EPP.map(it => ({ item: it, cumple: 'S', obs: '' })));
  ats.otras_herramientas = parseJsonSafe(ats.otras_herramientas, ITEMS_HERRAMIENTAS.map(it => ({ item: it, cumple: 'S', obs: '' })));

  // Obtener trabajadores vinculados y enriquecer con celular/email de Maestro_Segmentación si falta
  const [trabajadores] = await pool.execute(`
    SELECT
      t.*,
      COALESCE(t.celular, s.Celular) AS celular,
      COALESCE(t.email, s.Email) AS email
    FROM Dynamic_ats_trabajadores t
    LEFT JOIN \`Maestro_Segmentación\` s ON s.Identificación = t.identificacion
    WHERE t.id_ats = ?
    ORDER BY t.id_item ASC
  `, [idAts]);

  // Obtener evidencias
  const [evidencias] = await pool.execute(
    'SELECT * FROM Dynamic_ats_evidencias WHERE id_ats = ? ORDER BY id_evidencia ASC',
    [idAts]
  );

  return {
    ...ats,
    trabajadores,
    evidencias
  };
}

/**
 * Crear nuevo registro ATS
 */
async function crearRegistroAts(payload, usuario) {
  const {
    regional,
    operacion,
    muelle_ubicacion,
    vigencia_desde,
    vigencia_hasta,
    turnos,
    horarios,
    coordinador_operacion_id,
    coordinador_operacion_nombre,
    coordinador_operacion_celular,
    coordinador_operacion_email,
    pasos_analisis,
    preoperacional_estibadores,
    verificacion_epp,
    otras_herramientas,
    herramienta_adicional_texto,
    observaciones_generales,
    trabajadores = [],
    evidencias = []
  } = payload;

  if (!regional || !operacion || !vigencia_desde || !vigencia_hasta) {
    throw new Error('Regional, Operación y Fechas de Vigencia son requeridos.');
  }

  // Resolver coordinador si no vino en el payload
  let coordNombre = coordinador_operacion_nombre;
  let coordId = coordinador_operacion_id || null;
  let coordCel = coordinador_operacion_celular || null;
  let coordMail = coordinador_operacion_email || null;

  if (!coordNombre) {
    try {
      const coordRes = await resolverCoordinadorOperacionATS(operacion);
      if (coordRes && coordRes.nombre) {
        coordNombre = coordRes.nombre;
        const [uRows] = await pool.execute(
          'SELECT ID, Telefono, Email, Colaborador FROM Maestro_Usuarios WHERE Nombre = ? LIMIT 1',
          [coordNombre]
        );
        if (uRows.length) {
          coordId = uRows[0].ID;
          coordCel = uRows[0].Telefono || null;
          coordMail = uRows[0].Email || null;

          if (uRows[0].Colaborador) {
            try {
              const [seg] = await pool.execute(
                'SELECT Celular, Email FROM `Maestro_Segmentación` WHERE Trabajador = ? LIMIT 1',
                [uRows[0].Colaborador]
              );
              if (seg.length) {
                if (seg[0].Celular) coordCel = seg[0].Celular;
                if (!coordMail && seg[0].Email) coordMail = seg[0].Email;
              }
            } catch (_) {}
          }
        }
      }
    } catch (_) {
      coordNombre = '';
    }
  }

  // Datos del responsable SST creador
  const sstId = usuario.usuarioId || usuario.ID || usuario.id || 'Sistema';
  const sstNombre = usuario.usuarioNombre || usuario.Nombre || usuario.nombre || sstId;
  let sstCel = usuario.celular || null;
  let sstMail = usuario.email || null;

  if (!sstCel || !sstMail) {
    try {
      const [sstRows] = await pool.execute(
        'SELECT Telefono, Email, Colaborador FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
        [sstId]
      );
      if (sstRows.length) {
        sstCel = sstRows[0].Telefono || null;
        sstMail = sstRows[0].Email || null;

        if (sstRows[0].Colaborador) {
          try {
            const [seg] = await pool.execute(
              'SELECT Celular, Email FROM `Maestro_Segmentación` WHERE Trabajador = ? LIMIT 1',
              [sstRows[0].Colaborador]
            );
            if (seg.length) {
              if (seg[0].Celular) sstCel = seg[0].Celular;
              if (!sstMail && seg[0].Email) sstMail = seg[0].Email;
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  const tokenCoordinador = randomUUID();
  const tokenSst = randomUUID();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [insertResult] = await conn.execute(`
      INSERT INTO Dynamic_ats (
        regional,
        operacion,
        muelle_ubicacion,
        vigencia_desde,
        vigencia_hasta,
        turnos,
        horarios,
        coordinador_operacion_id,
        coordinador_operacion_nombre,
        coordinador_operacion_celular,
        coordinador_operacion_email,
        token_coordinador,
        responsable_sst_id,
        responsable_sst_nombre,
        responsable_sst_celular,
        responsable_sst_email,
        token_sst,
        pasos_analisis,
        preoperacional_estibadores,
        verificacion_epp,
        otras_herramientas,
        herramienta_adicional_texto,
        observaciones_generales,
        estado,
        usuario_creacion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente_trabajadores', ?)
    `, [
      regional || null,
      operacion || null,
      muelle_ubicacion || '',
      vigencia_desde || null,
      vigencia_hasta || null,
      turnos || null,
      horarios || null,
      coordId || null,
      coordNombre || null,
      coordCel || null,
      coordMail || null,
      tokenCoordinador,
      sstId || null,
      sstNombre || null,
      sstCel || null,
      sstMail || null,
      tokenSst,
      JSON.stringify(pasos_analisis || PASOS_ESTANDAR_ATS),
      JSON.stringify(preoperacional_estibadores || {}),
      JSON.stringify(verificacion_epp || []),
      JSON.stringify(otras_herramientas || []),
      herramienta_adicional_texto || null,
      observaciones_generales || null,
      sstId || null
    ]);

    const idAts = insertResult.insertId;

    // Insertar trabajadores
    if (Array.isArray(trabajadores) && trabajadores.length > 0) {
      for (const t of trabajadores) {
        const tokenTrab = randomUUID();
        await conn.execute(`
          INSERT INTO Dynamic_ats_trabajadores (
            id_ats,
            id_vinculacion,
            identificacion,
            nombre_trabajador,
            cargo,
            operacion,
            celular,
            email,
            token_firma,
            estado_firma
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SIN_FIRMA')
        `, [
          idAts,
          t.id_vinculacion || null,
          String(t.identificacion || t.Identificación || '').trim(),
          String(t.nombre_trabajador || t.Trabajador || '').trim(),
          t.cargo || t.Cargo || null,
          t.operacion || t.Operación || operacion,
          t.celular || null,
          t.email || null,
          tokenTrab
        ]);
      }
    }

    // Insertar evidencias si se proporcionaron
    if (Array.isArray(evidencias) && evidencias.length > 0) {
      for (let i = 0; i < evidencias.length; i++) {
        const ev = evidencias[i];
        let urlEvidencia = ev.url_evidencia || ev.url || null;
        if (!urlEvidencia && ev.base64) {
          const buffer = Buffer.from(ev.base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
          urlEvidencia = await subirEvidenciaAts(idAts, i + 1, buffer, ev.contentType || 'image/jpeg');
        }
        if (urlEvidencia) {
          await conn.execute(`
            INSERT INTO Dynamic_ats_evidencias (
              id_ats,
              url_evidencia,
              nombre_archivo,
              usuario_subida
            ) VALUES (?, ?, ?, ?)
          `, [idAts, urlEvidencia, ev.nombre_archivo || `Evidencia_${i + 1}.jpg`, sstId]);
        }
      }
    }

    await conn.commit();
    return { ok: true, id_ats: idAts };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Actualizar datos de un ATS existente
 */
async function actualizarRegistroAts(idAts, payload, usuario) {
  const {
    muelle_ubicacion,
    vigencia_desde,
    vigencia_hasta,
    turnos,
    horarios,
    coordinador_operacion_nombre,
    pasos_analisis,
    preoperacional_estibadores,
    verificacion_epp,
    otras_herramientas,
    herramienta_adicional_texto,
    observaciones_generales,
    trabajadores,
    evidencias
  } = payload;

  const [rows] = await pool.execute('SELECT * FROM Dynamic_ats WHERE id_ats = ?', [idAts]);
  if (!rows.length) throw new Error('ATS no encontrado');
  const atsActual = rows[0];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(`
      UPDATE Dynamic_ats SET
        muelle_ubicacion = COALESCE(?, muelle_ubicacion),
        vigencia_desde = COALESCE(?, vigencia_desde),
        vigencia_hasta = COALESCE(?, vigencia_hasta),
        turnos = COALESCE(?, turnos),
        horarios = COALESCE(?, horarios),
        coordinador_operacion_nombre = COALESCE(?, coordinador_operacion_nombre),
        pasos_analisis = COALESCE(?, pasos_analisis),
        preoperacional_estibadores = COALESCE(?, preoperacional_estibadores),
        verificacion_epp = COALESCE(?, verificacion_epp),
        otras_herramientas = COALESCE(?, otras_herramientas),
        herramienta_adicional_texto = COALESCE(?, herramienta_adicional_texto),
        observaciones_generales = COALESCE(?, observaciones_generales)
      WHERE id_ats = ?
    `, [
      muelle_ubicacion || null,
      vigencia_desde || null,
      vigencia_hasta || null,
      turnos || null,
      horarios || null,
      coordinador_operacion_nombre || null,
      pasos_analisis ? JSON.stringify(pasos_analisis) : null,
      preoperacional_estibadores ? JSON.stringify(preoperacional_estibadores) : null,
      verificacion_epp ? JSON.stringify(verificacion_epp) : null,
      otras_herramientas ? JSON.stringify(otras_herramientas) : null,
      herramienta_adicional_texto || null,
      observaciones_generales || null,
      idAts
    ]);

    // Si se envían trabajadores nuevos, agregarlos conservando los existentes
    if (Array.isArray(trabajadores)) {
      const [existentes] = await conn.execute(
        'SELECT identificacion FROM Dynamic_ats_trabajadores WHERE id_ats = ?',
        [idAts]
      );
      const identsExistentes = new Set(existentes.map(e => String(e.identificacion).trim()));

      for (const t of trabajadores) {
        const iden = String(t.identificacion || t.Identificación || '').trim();
        if (!identsExistentes.has(iden)) {
          const tokenTrab = randomUUID();
          await conn.execute(`
            INSERT INTO Dynamic_ats_trabajadores (
              id_ats, id_vinculacion, identificacion, nombre_trabajador, cargo, operacion, celular, email, token_firma, estado_firma
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SIN_FIRMA')
          `, [
            idAts,
            t.id_vinculacion || null,
            iden,
            String(t.nombre_trabajador || t.Trabajador || '').trim(),
            t.cargo || t.Cargo || null,
            t.operacion || t.Operación || atsActual.operacion,
            t.celular || null,
            t.email || null,
            tokenTrab
          ]);
        }
      }
    }

    // Si se envían nuevas fotos de evidencia
    if (Array.isArray(evidencias)) {
      for (let i = 0; i < evidencias.length; i++) {
        const ev = evidencias[i];
        if (ev.base64 && !ev.url_evidencia) {
          const buffer = Buffer.from(ev.base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
          const url = await subirEvidenciaAts(idAts, Date.now(), buffer, ev.contentType || 'image/jpeg');
          await conn.execute(`
            INSERT INTO Dynamic_ats_evidencias (id_ats, url_evidencia, nombre_archivo, usuario_subida)
            VALUES (?, ?, ?, ?)
          `, [idAts, url, ev.nombre_archivo || `Evidencia_${i + 1}.jpg`, usuario.usuarioId || 'Sistema']);
        }
      }
    }

    await conn.commit();
    return { ok: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Eliminar registro ATS (solo roles autorizados en Config_Parametros)
 */
async function eliminarRegistroAts(idAts, acceso) {
  const [rows] = await pool.execute('SELECT * FROM Dynamic_ats WHERE id_ats = ?', [idAts]);
  if (!rows.length) return { ok: false, error: 'Registro no encontrado' };

  const ats = rows[0];
  if (!acceso.sinFiltro) {
    const ops = acceso.operacionesFiltro || [];
    if (!ops.includes(ats.operacion)) {
      return { ok: false, error: 'No autorizado para esta operación' };
    }
  }

  // Eliminar (las tablas secundarias tienen ON DELETE CASCADE)
  await pool.execute('DELETE FROM Dynamic_ats WHERE id_ats = ?', [idAts]);

  // Si tenía registro en Maestro_docEmpresa, actualizarlo o marcarlo
  if (ats.id_doc_empresa) {
    try {
      await pool.execute(
        "UPDATE Maestro_docEmpresa SET Observaciones = CONCAT(COALESCE(Observaciones, ''), ' [ANULADO / ATS ELIMINADO]') WHERE id = ?",
        [ats.id_doc_empresa]
      );
    } catch (_) {}
  }

  return { ok: true };
}

/**
 * Firma digital del trabajador
 */
async function firmarTrabajadorAts(token, { firmaBase64, aceptarExistente } = {}, reqIp = null) {
  if (!token) throw new Error('Token de firma requerido');

  const [rows] = await pool.execute(
    'SELECT * FROM Dynamic_ats_trabajadores WHERE token_firma = ?',
    [token]
  );
  if (!rows.length) throw new Error('Enlace de firma inválido o vencido');

  const trabajador = rows[0];
  if (trabajador.estado_firma === 'ACEPTADA') {
    return { ok: true, yaFirmado: true, mensaje: 'Ya registraste tu firma para este ATS.' };
  }

  let finalFirmaUrl = null;
  if (firmaBase64) {
    finalFirmaUrl = firmaBase64;
  } else if (aceptarExistente) {
    try {
      finalFirmaUrl = await obtenerFirmaBase64Reciente(trabajador.identificacion);
    } catch (_) {
      finalFirmaUrl = 'ACEPTADA';
    }
  }

  if (!finalFirmaUrl) {
    finalFirmaUrl = 'ACEPTADA';
  }

  await pool.execute(`
    UPDATE Dynamic_ats_trabajadores SET
      estado_firma = 'ACEPTADA',
      firma_url = ?,
      fecha_firma = NOW(),
      ip_firma = ?
    WHERE id_item = ?
  `, [finalFirmaUrl, reqIp, trabajador.id_item]);

  // Verificar si ya firmaron todos los trabajadores del ATS
  const [pendientes] = await pool.execute(
    "SELECT COUNT(*) AS total FROM Dynamic_ats_trabajadores WHERE id_ats = ? AND estado_firma != 'ACEPTADA'",
    [trabajador.id_ats]
  );
  if (Number(pendientes[0]?.total || 0) === 0) {
    await pool.execute(
      "UPDATE Dynamic_ats SET estado = 'pendiente_coordinador' WHERE id_ats = ? AND estado = 'pendiente_trabajadores'",
      [trabajador.id_ats]
    );
  }

  return { ok: true, trabajador: trabajador.nombre_trabajador };
}

/**
 * Firma del Coordinador de Operación
 */
async function firmarCoordinadorAts(tokenOrId, { firmaBase64 } = {}, usuario = null) {
  let [rows] = await pool.execute(
    'SELECT * FROM Dynamic_ats WHERE token_coordinador = ? OR id_ats = ?',
    [tokenOrId, tokenOrId]
  );
  if (!rows.length) throw new Error('Registro ATS no encontrado');

  const ats = rows[0];
  let finalFirma = firmaBase64 || null;

  if (!finalFirma || finalFirma === 'ACEPTADA') {
    const firmaBucket = await obtenerFirmaUsuarioPorColaborador(ats.coordinador_operacion_nombre || ats.coordinador_operacion_id);
    if (firmaBucket) {
      finalFirma = firmaBucket;
    } else {
      finalFirma = 'ACEPTADA';
    }
  }

  await pool.execute(`
    UPDATE Dynamic_ats SET
      fecha_firma_coordinador = NOW(),
      firma_coordinador_url = ?,
      estado = CASE WHEN fecha_firma_sst IS NOT NULL THEN 'completado' ELSE 'pendiente_sst' END
    WHERE id_ats = ?
  `, [finalFirma, ats.id_ats]);

  return { ok: true, firma_url: finalFirma };
}

/**
 * Firma del Responsable SST
 */
async function firmarSstAts(tokenOrId, { firmaBase64 } = {}, usuario = null) {
  let [rows] = await pool.execute(
    'SELECT * FROM Dynamic_ats WHERE token_sst = ? OR id_ats = ?',
    [tokenOrId, tokenOrId]
  );
  if (!rows.length) throw new Error('Registro ATS no encontrado');

  const ats = rows[0];
  let finalFirma = firmaBase64 || null;

  if (!finalFirma || finalFirma === 'ACEPTADA') {
    const firmaBucket = await obtenerFirmaUsuarioPorColaborador(ats.responsable_sst_nombre || ats.responsable_sst_id);
    if (firmaBucket) {
      finalFirma = firmaBucket;
    } else {
      finalFirma = 'ACEPTADA';
    }
  }

  await pool.execute(`
    UPDATE Dynamic_ats SET
      fecha_firma_sst = NOW(),
      firma_sst_url = ?,
      estado = 'completado'
    WHERE id_ats = ?
  `, [finalFirma, ats.id_ats]);

  return { ok: true, firma_url: finalFirma };
}

/**
 * Construir el HTML final y generar el PDF con las firmas listas que estén en el sistema
 */
async function generarPdfAts(idAts, usuario = null, force = false) {
  const detalle = await obtenerDetalleAts(idAts);
  if (!detalle) throw new Error(`ATS con ID ${idAts} no encontrado.`);

  // Validar que al menos haya UNA firma lista en el sistema
  const trabajadoresList = detalle.trabajadores || [];
  const trabFirmados = trabajadoresList.filter(t => t.estado_firma === 'ACEPTADA').length;
  const coordFirmadoCheck = !!detalle.fecha_firma_coordinador;
  const sstFirmadoCheck = !!detalle.fecha_firma_sst;
  const totalFirmas = trabFirmados + (coordFirmadoCheck ? 1 : 0) + (sstFirmadoCheck ? 1 : 0);

  if (totalFirmas === 0) {
    throw new Error('No hay ninguna firma lista en el sistema. Debe haber al menos una firma registrada para poder generar el PDF.');
  }

  // Si Coordinador o SST firmaron pero no tienen imagen en base64, buscar en el bucket
  if (coordFirmadoCheck && (!detalle.firma_coordinador_url || !detalle.firma_coordinador_url.startsWith('data:image'))) {
    const fBucket = await obtenerFirmaUsuarioPorColaborador(detalle.coordinador_operacion_nombre || detalle.coordinador_operacion_id);
    if (fBucket) {
      detalle.firma_coordinador_url = fBucket;
      await pool.execute('UPDATE Dynamic_ats SET firma_coordinador_url = ? WHERE id_ats = ?', [fBucket, idAts]);
    }
  }

  if (sstFirmadoCheck && (!detalle.firma_sst_url || !detalle.firma_sst_url.startsWith('data:image'))) {
    const fBucket = await obtenerFirmaUsuarioPorColaborador(detalle.responsable_sst_nombre || detalle.responsable_sst_id);
    if (fBucket) {
      detalle.firma_sst_url = fBucket;
      await pool.execute('UPDATE Dynamic_ats SET firma_sst_url = ? WHERE id_ats = ?', [fBucket, idAts]);
    }
  }

  // Normalizador de respuestas (Cumple / No Cumple / No Aplica)
  function normalizarBadge(val) {
    const s = String(val || '').trim().toUpperCase();
    if (s === 'CUMPLE' || s === 'S' || s === 'SI' || s === 'SÍ') {
      return { texto: 'Cumple', clase: 'badge-c' };
    }
    if (s === 'NO CUMPLE' || s === 'N' || s === 'NO') {
      return { texto: 'No Cumple', clase: 'badge-nc' };
    }
    if (s === 'NO APLICA' || s === 'NA' || s === 'N.A.' || s === 'N/A') {
      return { texto: 'No Aplica', clase: 'badge-na' };
    }
    return { texto: val || '—', clase: 'badge-na' };
  }

  // 1. Cargar plantilla desde Maestro_Plantillas
  let plantillaHtml = '';
  try {
    const [pRows] = await pool.execute(
      'SELECT contenido_html FROM Maestro_Plantillas WHERE LOWER(nombre_proceso) = ? AND activo = 1 LIMIT 1',
      ['ats_semanal']
    );
    if (pRows.length && pRows[0].contenido_html) {
      plantillaHtml = pRows[0].contenido_html;
      // Adecuar plantilla si contenía muelle_ubicacion o cabeceras anteriores
      plantillaHtml = plantillaHtml.replace(/<td><strong>Muelle \/ Ubicación:<\/strong>\s*\{\{muelle_ubicacion\}\}<\/td>/g, '');
      plantillaHtml = plantillaHtml.replace(/<td><strong>Ciudad \/ Operación:<\/strong>\s*\{\{ciudad_operacion\}\}<\/td>/g, '<td colspan="2"><strong>Ciudad / Operación:</strong> {{ciudad_operacion}}</td>');
      plantillaHtml = plantillaHtml.replace(/>S \/ N \/ NA</g, '>ESTADO<');
      plantillaHtml = plantillaHtml.replace(/>CUMPLE<\/th>/g, '>ESTADO</th>');
      plantillaHtml = plantillaHtml.replace(/3\. LISTA DE VERIFICACIÓN PREOPERACIONAL - MARCAR SÍ \/ NO \/ N\.A\./g, '3. LISTA DE VERIFICACIÓN PREOPERACIONAL');
    }
  } catch (errPlt) {
    console.warn('[atsService] No se pudo leer Maestro_Plantillas:', errPlt.message);
  }

  // 2. Renderizar filas de los 12 pasos
  const pasos = Array.isArray(detalle.pasos_analisis) ? detalle.pasos_analisis : PASOS_ESTANDAR_ATS;
  const filasPasosHtml = pasos.map((p, idx) => {
    const b = normalizarBadge(p.cumple);
    const obsVal = p.obs || '';
    return `
      <tr>
        <td class="text-center font-bold">${idx + 1}</td>
        <td>${escHtml(p.paso)}</td>
        <td style="color:#475569;">${escHtml(p.peligros)}</td>
        <td style="color:#334155;">${escHtml(p.controles)}</td>
        <td class="${b.clase}">${escHtml(b.texto)}</td>
        <td style="font-size:6.3pt; color:#475569;">${escHtml(obsVal)}</td>
      </tr>
    `;
  }).join('');

  // 3. Renderizar Preoperacional Estibador Manual y Eléctrico
  const prep = detalle.preoperacional_estibadores || {};
  const manualItems = prep.manual || ITEMS_ESTIBADOR_MANUAL.map(it => ({ item: it, cumple: 'S' }));
  const electricoItems = prep.electrico || ITEMS_ESTIBADOR_ELECTRICO.map(it => ({ item: it, cumple: 'S' }));

  const filasManualHtml = manualItems.map(it => {
    const b = normalizarBadge(it.cumple);
    return `
      <tr>
        <td style="width:75%; font-size:6.6pt;">${escHtml(it.item)}</td>
        <td class="${b.clase}" style="width:25%;">${escHtml(b.texto)}</td>
      </tr>
    `;
  }).join('');

  const filasElectricoHtml = electricoItems.map(it => {
    const b = normalizarBadge(it.cumple);
    return `
      <tr>
        <td style="width:75%; font-size:6.6pt;">${escHtml(it.item)}</td>
        <td class="${b.clase}" style="width:25%;">${escHtml(b.texto)}</td>
      </tr>
    `;
  }).join('');

  // 4. Renderizar EPP
  const eppItems = Array.isArray(detalle.verificacion_epp) ? detalle.verificacion_epp : ITEMS_EPP.map(it => ({ item: it, cumple: 'S', obs: '' }));
  const filasEppHtml = eppItems.map(it => {
    const b = normalizarBadge(it.cumple);
    return `
      <tr>
        <td>${escHtml(it.item)}</td>
        <td class="${b.clase}">${escHtml(b.texto)}</td>
        <td style="font-size:6.3pt; color:#475569;">${escHtml(it.obs || '')}</td>
      </tr>
    `;
  }).join('');

  // 5. Renderizar Herramientas
  const herrItems = Array.isArray(detalle.otras_herramientas) ? detalle.otras_herramientas : ITEMS_HERRAMIENTAS.map(it => ({ item: it, cumple: 'S', obs: '' }));
  const filasHerrHtml = herrItems.map(it => {
    const b = normalizarBadge(it.cumple);
    return `
      <tr>
        <td>${escHtml(it.item)}</td>
        <td class="${b.clase}">${escHtml(b.texto)}</td>
        <td style="font-size:6.3pt; color:#475569;">${escHtml(it.obs || '')}</td>
      </tr>
    `;
  }).join('');

  const herrAdicHtml = detalle.herramienta_adicional_texto ? `
    <tr>
      <td colspan="3" style="background:#f8fafc; font-size:6.6pt;">
        <strong>Herramienta adicional especificada:</strong> ${escHtml(detalle.herramienta_adicional_texto)}
      </td>
    </tr>
  ` : '';

  // 6. Renderizar Firmas de Trabajadores
  const trabajadores = detalle.trabajadores || [];
  const filasTrabajadoresHtml = trabajadores.length > 0 ? trabajadores.map((t, idx) => {
    let firmaContent = '';
    if (t.estado_firma === 'ACEPTADA') {
      const fechaFmt = formatFechaEsp(t.fecha_firma);
      if (t.firma_url && t.firma_url.startsWith('data:image')) {
        firmaContent = `<img src="${t.firma_url}" style="max-height:26px; max-width:110px; display:block; margin:0 auto;" /><div style="font-size:5.8pt; color:#15803d; text-align:center;">✓ ${fechaFmt}</div>`;
      } else {
        firmaContent = `<div style="font-size:6.5pt; color:#15803d; font-weight:700; text-align:center;">✓ FIRMADO DIGITALMENTE<br><span style="font-size:5.8pt; font-weight:normal; color:#475569;">${fechaFmt}</span></div>`;
      }
    } else {
      firmaContent = '<div style="font-size:6.3pt; color:#94a3b8; font-style:italic; text-align:center;">[Pendiente de firma]</div>';
    }

    return `
      <tr>
        <td class="text-center font-bold">${idx + 1}</td>
        <td>${escHtml(t.nombre_trabajador)}</td>
        <td>${escHtml(t.identificacion)}</td>
        <td>${escHtml(t.cargo || '—')} (${escHtml(t.operacion || detalle.operacion)})</td>
        <td>${firmaContent}</td>
      </tr>
    `;
  }).join('') : `
    <tr>
      <td colspan="5" class="text-center" style="color:#94a3b8; padding:8px; font-style:italic;">No se registraron trabajadores.</td>
    </tr>
  `;

  // 7. Cajas de Firmas de Coordinador y SST
  let coordFirmaBox = '';
  if (detalle.fecha_firma_coordinador) {
    const fCoord = formatFechaEsp(detalle.fecha_firma_coordinador);
    if (detalle.firma_coordinador_url && detalle.firma_coordinador_url.startsWith('data:image')) {
      coordFirmaBox = `
        <div style="margin-top:4px;">
          <img src="${detalle.firma_coordinador_url}" style="max-height:35px; max-width:140px; display:block;" />
          <div style="font-size:6pt; color:#15803d; font-weight:700;">✓ Firmado el ${fCoord}</div>
        </div>
      `;
    } else {
      coordFirmaBox = `
        <div style="margin-top:6px; border:1px solid #16a34a; background:#f0fdf4; padding:3px 6px; border-radius:3px; display:inline-block;">
          <span style="font-size:6.5pt; color:#15803d; font-weight:700;">✓ FIRMADO DIGITALMENTE</span>
          <div style="font-size:5.8pt; color:#475569;">Fecha: ${fCoord}</div>
        </div>
      `;
    }
  } else {
    coordFirmaBox = '<div style="margin-top:12px; font-size:6.6pt; color:#94a3b8; font-style:italic;">[Firma pendiente]</div>';
  }

  let sstFirmaBox = '';
  if (detalle.fecha_firma_sst) {
    const fSst = formatFechaEsp(detalle.fecha_firma_sst);
    if (detalle.firma_sst_url && detalle.firma_sst_url.startsWith('data:image')) {
      sstFirmaBox = `
        <div style="margin-top:4px;">
          <img src="${detalle.firma_sst_url}" style="max-height:35px; max-width:140px; display:block;" />
          <div style="font-size:6pt; color:#15803d; font-weight:700;">✓ Firmado el ${fSst}</div>
        </div>
      `;
    } else {
      sstFirmaBox = `
        <div style="margin-top:6px; border:1px solid #16a34a; background:#f0fdf4; padding:3px 6px; border-radius:3px; display:inline-block;">
          <span style="font-size:6.5pt; color:#15803d; font-weight:700;">✓ FIRMADO DIGITALMENTE</span>
          <div style="font-size:5.8pt; color:#475569;">Fecha: ${fSst}</div>
        </div>
      `;
    }
  } else {
    sstFirmaBox = '<div style="margin-top:12px; font-size:6.6pt; color:#94a3b8; font-style:italic;">[Firma pendiente]</div>';
  }

  // 8. Evidencias fotográficas
  let evidenciasHtml = '';
  const evidencias = detalle.evidencias || [];
  if (evidencias.length > 0) {
    const cells = evidencias.map((ev, i) => `
      <td style="width:50%; padding:6px; border:1px solid #cbd5e1; text-align:center; vertical-align:top;">
        <div style="font-size:7pt; font-weight:700; color:#475569; margin-bottom:3px;">Evidencia fotográfica #${i + 1}</div>
        <img src="${ev.url_evidencia}" style="max-width:240px; max-height:140px; object-fit:contain; border-radius:4px;" />
      </td>
    `);
    const rows = [];
    for (let i = 0; i < cells.length; i += 2) {
      const second = cells[i + 1] || '<td style="width:50%; padding:6px; border:1px solid #cbd5e1;"></td>';
      rows.push(`<tr>${cells[i]}${second}</tr>`);
    }
    evidenciasHtml = `
      <div style="margin-top:8px; page-break-inside:avoid;">
        <div class="sec-header">REGISTRO FOTOGRÁFICO DE EVIDENCIAS</div>
        <table style="width:100%; border-collapse:collapse;">
          ${rows.join('')}
        </table>
      </div>
    `;
  }

  // 9. Reemplazar variables en la plantilla o fallback
  let htmlFinal = plantillaHtml;
  if (!htmlFinal) {
    // Fallback completo idéntico si la BD no tuviese la plantilla cargada
    htmlFinal = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: legal portrait; margin: 6mm 8mm 6mm 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 7.3pt; margin: 0; padding: 0; line-height: 1.25; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 3px 5px; }
    .sec-header { background: #0A315D; color: #ffffff; font-size: 7.6pt; font-weight: 700; padding: 3.5px 6px; letter-spacing: 0.3px; }
    .text-center { text-align: center; }
    .font-bold { font-weight: 700; }
    .badge-c { background: #f0fdf4; color: #15803d; font-weight: 700; text-align: center; }
    .badge-nc { background: #fef2f2; color: #b91c1c; font-weight: 700; text-align: center; }
    .badge-na { background: #f1f5f9; color: #475569; font-weight: 700; text-align: center; }
  </style>
</head>
<body>
  <table style="margin-bottom: 4px;">
    <tr>
      <td style="width: 25%; text-align: center; padding: 4px; background: #ffffff;">{{logo}}</td>
      <td style="width: 55%; background: #0A315D; color: #ffffff; text-align: center; padding: 4px 8px;">
        <div style="font-size: 9pt; font-weight: 700;">ANÁLISIS DE TRABAJO SEGURO CARGUE Y DESCARGUE DE MERCANCÍAS</div>
        <div style="font-size: 7.8pt; color: #FFD0B3; font-weight: 700;">ANÁLISIS DE TRABAJO SEGURO (ATS) SEMANAL</div>
        <div style="font-size: 6.8pt; color: #dbeafe;">CARGUE Y DESCARGUE DE MERCANCÍAS EN MUELLES - ESTIBADOR MANUAL Y/O ELÉCTRICO</div>
      </td>
      <td style="width: 20%; padding: 3px 6px; font-size: 6.8pt; text-align: center; background: #f8fafc;">
        <div style="font-weight: 700; color: #0A315D;">SST-F-036</div>
        <div>Versión: 02</div>
        <div style="color: #64748b;">23/09/2026</div>
        <div style="margin-top: 2px; font-size: 6.2pt; color: #0A315D; font-weight: 700;">ID: #{{id_ats}}</div>
      </td>
    </tr>
  </table>
  <div class="sec-header">1. DATOS GENERALES Y VIGENCIA SEMANAL</div>
  <table style="margin-bottom: 4px; font-size: 7.2pt;">
    <tr><td colspan="2"><strong>Ciudad / Operación:</strong> {{ciudad_operacion}}</td></tr>
    <tr><td><strong>Vigencia desde:</strong> {{vigencia_desde}}</td><td><strong>Vigencia hasta:</strong> {{vigencia_hasta}}</td></tr>
    <tr><td><strong>Turno(s):</strong> {{turnos}}</td><td><strong>Horario(s):</strong> {{horarios}}</td></tr>
    <tr><td><strong>Responsable Operación:</strong> {{coordinador_nombre}}</td><td><strong>Responsable SST:</strong> {{responsable_sst_nombre}}</td></tr>
    <tr><td colspan="2" style="background:#fffbeb; color:#92400e; font-size:6.6pt; font-style:italic;"><strong>Vigencia semanal:</strong> aplica mientras la actividad, personal autorizado, equipos y condiciones se mantengan.</td></tr>
  </table>
  <div class="sec-header">2. ANÁLISIS DE LA TAREA - PASO A PASO</div>
  <table style="margin-bottom: 4px; font-size: 6.8pt;">
    <thead><tr style="background:#e2e8f0; color:#0f172a; font-weight:700;"><th style="width:4%;">No.</th><th style="width:24%;">PASO / ACTIVIDAD</th><th style="width:30%;">PELIGROS / CONSECUENCIAS</th><th style="width:26%;">CONTROLES REQUERIDOS</th><th style="width:10%; text-align:center;">ESTADO</th><th style="width:6%; text-align:center;">OBS.</th></tr></thead>
    <tbody>{{filas_analisis_pasos}}</tbody>
  </table>
  <div class="sec-header">3. LISTA DE VERIFICACIÓN PREOPERACIONAL</div>
  <table style="margin-bottom: 4px; font-size: 6.8pt;">
    <tr>
      <td style="width:50%; vertical-align:top; padding:0;"><div style="background:#1e3a8a; color:#fff; font-weight:700; padding:2px 5px; font-size:6.9pt; text-align:center;">ESTIBADOR MANUAL</div><table>{{filas_estibador_manual}}<tr><td colspan="2" style="font-size:6.5pt; background:#f8fafc;"><strong>Observaciones:</strong> {{obs_estibador_manual}}</td></tr></table></td>
      <td style="width:50%; vertical-align:top; padding:0;"><div style="background:#1e3a8a; color:#fff; font-weight:700; padding:2px 5px; font-size:6.9pt; text-align:center;">ESTIBADOR ELÉCTRICO</div><table>{{filas_estibador_electrico}}<tr><td colspan="2" style="font-size:6.5pt; background:#f8fafc;"><strong>Observaciones:</strong> {{obs_estibador_electrico}}</td></tr></table></td>
    </tr>
  </table>
  <div class="sec-header">4. VERIFICACIÓN DE EPP PARA LA ACTIVIDAD</div>
  <table style="margin-bottom: 4px; font-size: 6.8pt;">
    <thead><tr style="background:#e2e8f0; color:#0f172a; font-weight:700;"><th style="width:61%;">ITEM DE VERIFICACIÓN</th><th style="width:14%; text-align:center;">ESTADO</th><th style="width:25%;">OBSERVACIONES</th></tr></thead>
    <tbody>{{filas_epp}}</tbody>
  </table>
  <div class="sec-header">5. OTRAS HERRAMIENTAS A UTILIZAR</div>
  <table style="margin-bottom: 4px; font-size: 6.8pt;">
    <thead><tr style="background:#e2e8f0; color:#0f172a; font-weight:700;"><th style="width:61%;">ITEM DE VERIFICACIÓN</th><th style="width:14%; text-align:center;">ESTADO</th><th style="width:25%;">OBSERVACIONES</th></tr></thead>
    <tbody>{{filas_herramientas}}</tbody>
  </table>
  <div style="border:1.5px solid #dc2626; background:#fef2f2; color:#991b1b; padding:4px 8px; font-size:6.8pt; font-weight:700; margin-bottom:4px;">
    CRITERIO DE PARADA: falla del equipo, carga inestable, persona en zona de maniobra, vehículo no inmovilizado, acceso inseguro, EPP requerido no disponible o cualquier peligro no controlado obliga a detener la actividad hasta implementar y verificar controles.
  </div>
  <div class="sec-header">6. SOCIALIZACIÓN Y FIRMAS DEL PERSONAL CUBIERTO POR LA SEMANA</div>
  <table style="margin-bottom: 4px; font-size: 6.8pt;">
    <thead><tr style="background:#e2e8f0; color:#0f172a; font-weight:700;"><th style="width:5%;">No.</th><th style="width:35%;">NOMBRE COMPLETO</th><th style="width:18%;">CÉDULA</th><th style="width:22%;">CARGO / OPERACIÓN</th><th style="width:20%; text-align:center;">FIRMA</th></tr></thead>
    <tbody>{{filas_trabajadores}}</tbody>
  </table>
  <table style="margin-bottom: 4px; page-break-inside: avoid;">
    <tr>
      <td style="width:50%; vertical-align:top; padding:5px;"><div style="font-size:7pt; font-weight:700; color:#0A315D;">Coordinador Operación:</div><div style="font-size:7.2pt; font-weight:700; margin-top:2px;">{{coordinador_nombre}}</div>{{firma_coordinador_box}}</td>
      <td style="width:50%; vertical-align:top; padding:5px;"><div style="font-size:7pt; font-weight:700; color:#0A315D;">Responsable SST:</div><div style="font-size:7.2pt; font-weight:700; margin-top:2px;">{{responsable_sst_nombre}}</div>{{firma_sst_box}}</td>
    </tr>
  </table>
  <div style="font-size:6.3pt; color:#64748b; line-height:1.3;"><strong>Nota:</strong> la selección de EPP debe corresponder a la evaluación de riesgos del sitio. El preoperacional del equipo debe realizarse antes de su uso conforme al procedimiento interno y manual del fabricante.</div>
  {{seccion_evidencias}}
</body>
</html>`;
  }

  const logoImgTag = `<img src="${LOGO_BASE64}" style="max-height:44px; max-width:145px; object-fit:contain;" alt="LOG&amp;SER" />`;

  const replacements = {
    logo: logoImgTag,
    id_ats: detalle.id_ats,
    ciudad_operacion: `${escHtml(detalle.regional)} / ${escHtml(detalle.operacion)}`,
    muelle_ubicacion: escHtml(detalle.muelle_ubicacion),
    vigencia_desde: formatFechaEsp(detalle.vigencia_desde),
    vigencia_hasta: formatFechaEsp(detalle.vigencia_hasta),
    turnos: escHtml(detalle.turnos || 'Turno Completo'),
    horarios: escHtml(detalle.horarios || 'Rotativo'),
    coordinador_nombre: escHtml(detalle.coordinador_operacion_nombre || '—'),
    responsable_sst_nombre: escHtml(detalle.responsable_sst_nombre || '—'),
    filas_analisis_pasos: filasPasosHtml,
    filas_estibador_manual: filasManualHtml,
    obs_estibador_manual: escHtml(prep.obs_manual || 'Sin novedades.'),
    filas_estibador_electrico: filasElectricoHtml,
    obs_estibador_electrico: escHtml(prep.obs_electrico || 'Sin novedades.'),
    filas_epp: filasEppHtml,
    filas_herramientas: filasHerrHtml + herrAdicHtml,
    filas_trabajadores: filasTrabajadoresHtml,
    firma_coordinador_box: coordFirmaBox,
    firma_sst_box: sstFirmaBox,
    seccion_evidencias: evidenciasHtml
  };

  for (const [key, val] of Object.entries(replacements)) {
    const rx = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    htmlFinal = htmlFinal.replace(rx, val);
  }

  // 10. Generar PDF con renderer (Puppeteer)
  const pdfBuffer = await generarPDFDesdeHTML(htmlFinal, {
    format: 'Legal',
    printBackground: true,
    margin: { top: '6mm', bottom: '6mm', left: '8mm', right: '8mm' }
  });

  // 11. Subir a GCS en talenthub_central/general/
  const timestamp = Date.now();
  const nombreArchivo = `ATS_${detalle.id_ats}_${timestamp}.pdf`;
  const pdfUrl = await subirPDFAts(nombreArchivo, pdfBuffer);

  // 12. Registrar / actualizar en Maestro_docEmpresa (TipoDocumento = 98, Prefijo = 'ATS')
  let idDocEmpresa = detalle.id_doc_empresa;
  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();
  const obsDoc = `ATS Operación: ${detalle.operacion} · Vigencia: ${formatFechaEsp(detalle.vigencia_desde)} a ${formatFechaEsp(detalle.vigencia_hasta)}`;

  if (idDocEmpresa) {
    try {
      await pool.execute(`
        UPDATE Maestro_docEmpresa SET
          Url = ?,
          Observaciones = ?,
          FechaRegistro = NOW()
        WHERE id = ?
      `, [pdfUrl, obsDoc, idDocEmpresa]);
    } catch (eDocUpdate) {
      console.warn('[atsService] Error actualizando Maestro_docEmpresa:', eDocUpdate.message);
    }
  } else {
    idDocEmpresa = randomUUID();
    try {
      await pool.execute(`
        INSERT INTO Maestro_docEmpresa (
          id, TipoDocumento, Prefijo, Regional, \`Operación\`, FechaRegistro, Usuario, Observaciones, Url, \`Validación\`, Mes, \`Año\`
        ) VALUES (?, '98', 'ATS', ?, ?, NOW(), ?, ?, ?, 'PEND', ?, ?)
      `, [
        idDocEmpresa,
        detalle.regional,
        detalle.operacion,
        usuario?.usuarioId || detalle.usuario_creacion || 'Sistema',
        obsDoc,
        pdfUrl,
        mesActual,
        anioActual
      ]);
    } catch (eDocInsert) {
      console.error('[atsService] Error insertando en Maestro_docEmpresa:', eDocInsert.message);
    }
  }

  // 13. Guardar pdfUrl e id_doc_empresa en Dynamic_ats
  await pool.execute(`
    UPDATE Dynamic_ats SET
      url_pdf = ?,
      id_doc_empresa = ?
    WHERE id_ats = ?
  `, [pdfUrl, idDocEmpresa, idAts]);

  return {
    ok: true,
    url_pdf: pdfUrl,
    id_doc_empresa: idDocEmpresa
  };
}

module.exports = {
  resolverCoordinadorOperacionATS,
  obtenerFirmaUsuarioPorColaborador,
  PASOS_ESTANDAR_ATS,
  ITEMS_ESTIBADOR_MANUAL,
  ITEMS_ESTIBADOR_ELECTRICO,
  ITEMS_EPP,
  ITEMS_HERRAMIENTAS,
  obtenerConfigAts,
  listarRegistrosAts,
  obtenerDetalleAts,
  crearRegistroAts,
  actualizarRegistroAts,
  eliminarRegistroAts,
  firmarTrabajadorAts,
  firmarCoordinadorAts,
  firmarSstAts,
  generarPdfAts
};
