const express = require('express');
const pool = require('../services/db');
const { computarAccesoSST } = require('./sst');

const router = express.Router();

function normalizarNombreColumna(nombre) {
  return String(nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function citarIdentificador(nombre) {
  return `\`${String(nombre).replace(/`/g, '``')}\``;
}

router.get('/api/incapacidades', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'Parámetro ?usuario requerido' });

    const acceso = await computarAccesoSST(usuario);
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado para el módulo SST' });

    const [columnas] = await pool.query('SHOW COLUMNS FROM Dynamic_Asistencia');
    const encontrarColumna = (...nombres) => {
      const buscados = nombres.map(normalizarNombreColumna);
      const columna = columnas.find(c => buscados.includes(normalizarNombreColumna(c.Field)));
      return columna ? columna.Field : null;
    };

    const eventoCol = encontrarColumna('Evento', 'Novedad');
    const operacionCol = encontrarColumna('Operación', 'Operacion', 'Origen');
    const regionalCol = encontrarColumna('Regional');
    const fechaCol = encontrarColumna('Día', 'Dia', 'Fecha');
    const trabajadorCol = encontrarColumna('Trabajador', 'Nombre');
    const identificacionCol = encontrarColumna('Cédula', 'Cedula', 'Identificación', 'Identificacion');
    const diagnosticoCol = encontrarColumna('Cod Diagnostico', 'Código Diagnóstico', 'Codigo Diagnostico');
    const urlCol = encontrarColumna('Url Incapacidad');

    if (!eventoCol || !urlCol) {
      return res.status(500).json({ error: 'Dynamic_Asistencia no contiene las columnas Evento y Url Incapacidad requeridas' });
    }
    if (!acceso.sinFiltro && (!operacionCol || !acceso.operacionesFiltro.length)) return res.json([]);

    const opExpr = operacionCol ? `da.${citarIdentificador(operacionCol)}` : 'NULL';
    const regionalExpr = regionalCol
      ? `COALESCE(da.${citarIdentificador(regionalCol)}, mo.REGIONAL)`
      : (operacionCol ? 'mo.REGIONAL' : 'NULL');
    const joins = operacionCol
      ? `LEFT JOIN Maestro_Operaciones mo ON mo.OPERACIÓN = da.${citarIdentificador(operacionCol)}`
      : '';
    const where = [`da.${citarIdentificador(eventoCol)} LIKE ?`];
    const params = ['%Incapacidad%'];

    if (!acceso.sinFiltro) {
      where.push(`da.${citarIdentificador(operacionCol)} IN (${acceso.operacionesFiltro.map(() => '?').join(',')})`);
      params.push(...acceso.operacionesFiltro);
    }

    const [rows] = await pool.execute(`
      SELECT DISTINCT
        ${fechaCol ? `da.${citarIdentificador(fechaCol)}` : 'NULL'} AS sst_fecha,
        ${trabajadorCol ? `da.${citarIdentificador(trabajadorCol)}` : 'NULL'} AS sst_trabajador,
        ${identificacionCol ? `da.${citarIdentificador(identificacionCol)}` : 'NULL'} AS sst_identificacion,
        ${regionalExpr} AS sst_regional,
        ${opExpr} AS sst_operacion,
        da.${citarIdentificador(eventoCol)} AS sst_evento,
        ${diagnosticoCol ? `da.${citarIdentificador(diagnosticoCol)}` : 'NULL'} AS sst_cod_diagnostico,
        da.${citarIdentificador(urlCol)} AS sst_url
      FROM Dynamic_Asistencia da
      ${joins}
      WHERE ${where.join(' AND ')}
      ${fechaCol ? `ORDER BY da.${citarIdentificador(fechaCol)} DESC` : ''}
    `, params);

    res.json(rows);
  } catch (err) {
    console.error('[casosmedicos] Error en /api/incapacidades:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// API: GET /api/trabajadores-casos
// Devuelve trabajadores que tienen casos médicos, con métricas agrupadas
// ══════════════════════════════════════════════════════════════
router.get('/api/trabajadores-casos', async (req, res) => {
  try {
    const { usuario, trabajador, regional, operacion, estado, prioridad, tipoCaso, fechaDesde, fechaHasta } = req.query;

    if (!usuario) {
      return res.status(400).json({ error: 'Parámetro ?usuario requerido' });
    }

    const acceso = await computarAccesoSST(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado para el módulo SST' });
    }

    // Condiciones de filtrado sobre casos
    const caseConds = ['cm.deleted_at IS NULL'];
    const caseParams = [];

    if (estado) {
      const estId = (estado === 'ABIERTO' || estado === '1') ? 1 : (estado === 'CERRADO' || estado === '2') ? 2 : null;
      if (estId) {
        caseConds.push('cm.estado_general_id = ?');
        caseParams.push(estId);
      }
    }

    if (prioridad) {
      caseConds.push('cm.prioridad_id = ?');
      caseParams.push(prioridad);
    }

    if (tipoCaso) {
      caseConds.push('cm.tipo_caso_id = ?');
      caseParams.push(tipoCaso);
    }

    if (fechaDesde) {
      caseConds.push('cm.fecha_registro >= ?');
      caseParams.push(`${fechaDesde} 00:00:00`);
    }

    if (fechaHasta) {
      caseConds.push('cm.fecha_registro <= ?');
      caseParams.push(`${fechaHasta} 23:59:59`);
    }

    const caseWhere = caseConds.length ? `WHERE ${caseConds.join(' AND ')}` : '';

    // Subconsulta agrupada de casos por trabajador
    const subquery = `
      SELECT
        cm.identificacion,
        COUNT(cm.id) AS total_casos,
        SUM(CASE WHEN cm.estado_general_id = 1 THEN 1 ELSE 0 END) AS casos_abiertos,
        SUM(CASE WHEN cm.estado_general_id = 2 THEN 1 ELSE 0 END) AS casos_cerrados,
        MIN(cm.prioridad_id) AS min_prioridad_id,
        MAX(cm.fecha_registro) AS max_fecha_caso,
        MAX(cm.ultimo_seguimiento) AS max_ultimo_seguimiento,
        SUBSTRING_INDEX(GROUP_CONCAT(cm.regional_id ORDER BY cm.id DESC SEPARATOR '||'), '||', 1) AS ultima_regional,
        SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(cm.operacion, '') ORDER BY cm.id DESC SEPARATOR '||'), '||', 1) AS ultima_operacion,
        SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(cm.diagnostico, '') ORDER BY cm.id DESC SEPARATOR '||'), '||', 1) AS ultimo_diagnostico_cod,
        SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(cm.tipo_evento_id, '') ORDER BY cm.id DESC SEPARATOR '||'), '||', 1) AS ultimo_tipo_evento_id
      FROM Maestro_casosmedicos cm
      ${caseWhere}
      GROUP BY cm.identificacion
    `;

    // Consulta principal uniendo con datos de vinculación y segmentación
    const outerConds = [];
    const outerParams = [...caseParams];

    // Control de roles de acceso
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json([]);
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      outerConds.push(`(COALESCE(v.Operación, s.Operación, c.ultima_operacion) IN (${ph}))`);
      outerParams.push(...acceso.operacionesFiltro);
    }

    // Filtros de usuario en la UI
    if (trabajador) {
      outerConds.push('(c.identificacion LIKE ? OR v.Trabajador LIKE ? OR s.Trabajador LIKE ?)');
      const trWildcard = `%${trabajador.toUpperCase()}%`;
      outerParams.push(trWildcard, trWildcard, trWildcard);
    }

    if (regional) {
      outerConds.push('COALESCE(v.Regional, c.ultima_regional) = ?');
      outerParams.push(regional);
    }

    if (operacion) {
      outerConds.push('COALESCE(v.Operación, s.Operación, c.ultima_operacion) = ?');
      outerParams.push(operacion);
    }

    const outerWhere = outerConds.length ? `WHERE ${outerConds.join(' AND ')}` : '';

    const sql = `
      SELECT
        c.identificacion,
        c.total_casos,
        c.casos_abiertos,
        c.casos_cerrados,
        c.min_prioridad_id,
        c.max_fecha_caso,
        c.max_ultimo_seguimiento,
        c.ultimo_diagnostico_cod,
        c.ultimo_tipo_evento_id,
        COALESCE(v.Trabajador, s.Trabajador, c.identificacion) AS nombre_trabajador,
        COALESCE(v.Cargo, '—') AS cargo,
        COALESCE(v.Regional, c.ultima_regional) AS regional,
        COALESCE(v.Operación, s.Operación, c.ultima_operacion) AS operacion,
        COALESCE(v.Estado, s.Estado, 'Activo') AS estado_trabajador,
        v.Fecha_Ingreso AS fecha_ingreso,
        p.nombre AS prioridad_nombre,
        te.nombre AS ultimo_evento_nombre,
        diag.Descripción AS ultimo_diagnostico_desc
      FROM (${subquery}) c
      LEFT JOIN (
        SELECT Identificación, Trabajador, Cargo, Regional, \`Operación\`, Estado, \`Fecha de Ingreso\` AS Fecha_Ingreso,
               ROW_NUMBER() OVER(PARTITION BY Identificación ORDER BY \`Fecha de Ingreso\` DESC) as rn
        FROM \`Maestro_Vinculación\`
      ) v ON c.identificacion = v.Identificación AND v.rn = 1
      LEFT JOIN \`Maestro_Segmentación\` s ON c.identificacion = s.Identificación
      LEFT JOIN Config_Prioridad p ON c.min_prioridad_id = p.id
      LEFT JOIN Config_Tipo_Evento te ON c.ultimo_tipo_evento_id = te.id
      LEFT JOIN Config_Diagnostico diag ON c.ultimo_diagnostico_cod = diag.Cod
      ${outerWhere}
      ORDER BY c.max_fecha_caso DESC
    `;

    const [rows] = await pool.execute(sql, outerParams);
    res.json(rows);
  } catch (err) {
    console.error('[casosmedicos] Error en /api/trabajadores-casos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// API: GET /api/conteos-filtros
// Conteos dinámicos para los dropdowns de Regional y Operación
// ══════════════════════════════════════════════════════════════
router.get('/api/conteos-filtros', async (req, res) => {
  try {
    const { usuario, trabajador, regional, operacion, estado, prioridad, tipoCaso } = req.query;

    if (!usuario) {
      return res.status(400).json({ error: 'Parámetro ?usuario requerido' });
    }

    const acceso = await computarAccesoSST(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    // Base condiciones sobre Maestro_casosmedicos
    const baseConds = ['cm.deleted_at IS NULL'];
    const baseParams = [];

    if (estado) {
      const estId = (estado === 'ABIERTO' || estado === '1') ? 1 : (estado === 'CERRADO' || estado === '2') ? 2 : null;
      if (estId) {
        baseConds.push('cm.estado_general_id = ?');
        baseParams.push(estId);
      }
    }

    if (prioridad) {
      baseConds.push('cm.prioridad_id = ?');
      baseParams.push(prioridad);
    }

    if (tipoCaso) {
      baseConds.push('cm.tipo_caso_id = ?');
      baseParams.push(tipoCaso);
    }

    // Filtros de rol
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json({ regionales: {}, operaciones: {}, estados: { abiertos: 0, cerrados: 0 } });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      baseConds.push(`(COALESCE(cm.operacion, v.Operación, s.Operación) IN (${ph}))`);
      baseParams.push(...acceso.operacionesFiltro);
    }

    // Filtro trabajador compartido
    if (trabajador) {
      baseConds.push('(cm.identificacion LIKE ? OR v.Trabajador LIKE ? OR s.Trabajador LIKE ?)');
      const trWildcard = `%${trabajador.toUpperCase()}%`;
      baseParams.push(trWildcard, trWildcard, trWildcard);
    }

    // 1. Conteo por Regional (aplica operacion si está seleccionada, pero no regional)
    const regConds = [...baseConds];
    const regParams = [...baseParams];
    if (operacion) {
      regConds.push('COALESCE(cm.operacion, v.Operación, s.Operación) = ?');
      regParams.push(operacion);
    }
    const regWhere = regConds.length ? `WHERE ${regConds.join(' AND ')}` : '';

    const [regRows] = await pool.execute(`
      SELECT Regional, COUNT(DISTINCT identificacion) AS total
      FROM (
        SELECT cm.identificacion, COALESCE(v.Regional, cm.regional_id) AS Regional
        FROM Maestro_casosmedicos cm
        LEFT JOIN (
          SELECT Identificación, Regional, \`Operación\`, \`Fecha de Ingreso\`,
                 ROW_NUMBER() OVER(PARTITION BY Identificación ORDER BY \`Fecha de Ingreso\` DESC) as rn
          FROM \`Maestro_Vinculación\`
        ) v ON cm.identificacion = v.Identificación AND v.rn = 1
        LEFT JOIN \`Maestro_Segmentación\` s ON cm.identificacion = s.Identificación
        ${regWhere}
      ) t
      WHERE Regional IS NOT NULL AND Regional != ''
      GROUP BY Regional
    `, regParams);

    // 2. Conteo por Operación (aplica regional si está seleccionada, pero no operacion)
    const opConds = [...baseConds];
    const opParams = [...baseParams];
    if (regional) {
      opConds.push('COALESCE(v.Regional, cm.regional_id) = ?');
      opParams.push(regional);
    }
    const opWhere = opConds.length ? `WHERE ${opConds.join(' AND ')}` : '';

    const [opRows] = await pool.execute(`
      SELECT Operacion, COUNT(DISTINCT identificacion) AS total
      FROM (
        SELECT cm.identificacion, COALESCE(cm.operacion, v.Operación, s.Operación) AS Operacion
        FROM Maestro_casosmedicos cm
        LEFT JOIN (
          SELECT Identificación, Regional, \`Operación\`, \`Fecha de Ingreso\`,
                 ROW_NUMBER() OVER(PARTITION BY Identificación ORDER BY \`Fecha de Ingreso\` DESC) as rn
          FROM \`Maestro_Vinculación\`
        ) v ON cm.identificacion = v.Identificación AND v.rn = 1
        LEFT JOIN \`Maestro_Segmentación\` s ON cm.identificacion = s.Identificación
        ${opWhere}
      ) t
      WHERE Operacion IS NOT NULL AND Operacion != ''
      GROUP BY Operacion
    `, opParams);

    // 3. Conteo de Estados Abierto vs Cerrado
    const [estRows] = await pool.execute(`
      SELECT
        SUM(CASE WHEN cm.estado_general_id = 1 THEN 1 ELSE 0 END) AS abiertos,
        SUM(CASE WHEN cm.estado_general_id = 2 THEN 1 ELSE 0 END) AS cerrados
      FROM Maestro_casosmedicos cm
      LEFT JOIN (
        SELECT Identificación, Regional, \`Operación\`, \`Fecha de Ingreso\`,
               ROW_NUMBER() OVER(PARTITION BY Identificación ORDER BY \`Fecha de Ingreso\` DESC) as rn
        FROM \`Maestro_Vinculación\`
      ) v ON cm.identificacion = v.Identificación AND v.rn = 1
      LEFT JOIN \`Maestro_Segmentación\` s ON cm.identificacion = s.Identificación
      ${regWhere}
    `, regParams);

    const regionales = {};
    regRows.forEach(r => {
      if (r.Regional) regionales[r.Regional] = r.total;
    });

    const operaciones = {};
    opRows.forEach(o => {
      if (o.Operacion) operaciones[o.Operacion] = o.total;
    });

    const estados = {
      abiertos: (estRows[0] && Number(estRows[0].abiertos)) || 0,
      cerrados: (estRows[0] && Number(estRows[0].cerrados)) || 0
    };

    res.json({ regionales, operaciones, estados });
  } catch (err) {
    console.error('[casosmedicos] Error en /api/conteos-filtros:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// API: GET /api/casos-trabajador/:identificacion
// Devuelve todos los casos médicos individuales de un colaborador
// ══════════════════════════════════════════════════════════════
router.get('/api/casos-trabajador/:identificacion', async (req, res) => {
  try {
    const { identificacion } = req.params;
    if (!identificacion) {
      return res.status(400).json({ error: 'Cédula requerida' });
    }

    const sql = `
      SELECT
        cm.*,
        tc.nombre AS tipo_caso_nombre,
        eg.nombre AS estado_general_nombre,
        pr.nombre AS prioridad_nombre,
        te.nombre AS tipo_evento_nombre,
        tat.nombre AS tipo_accidente_transito_nombre,
        sn.nombre AS es_continuacion_nombre,
        diag.Descripción AS diagnostico_desc,
        u.Nombre AS usuario_nombre,
        padre.codigo_caso AS caso_anterior_codigo
      FROM Maestro_casosmedicos cm
      LEFT JOIN Config_Tipo_Caso tc ON cm.tipo_caso_id = tc.id
      LEFT JOIN Config_Estado_General eg ON cm.estado_general_id = eg.id
      LEFT JOIN Config_Prioridad pr ON cm.prioridad_id = pr.id
      LEFT JOIN Config_Tipo_Evento te ON cm.tipo_evento_id = te.id
      LEFT JOIN Config_Tipo_Accidente_Transito tat ON cm.tipo_accidente_transito_id = tat.id
      LEFT JOIN Config_Si_No sn ON cm.es_continuacion = sn.id
      LEFT JOIN Config_Diagnostico diag ON cm.diagnostico = diag.Cod
      LEFT JOIN Maestro_Usuarios u ON cm.usuario = u.ID
      LEFT JOIN Maestro_casosmedicos padre ON cm.caso_anterior_id = padre.id
      WHERE cm.identificacion = ? AND cm.deleted_at IS NULL
      ORDER BY cm.id DESC
    `;

    const [rows] = await pool.execute(sql, [identificacion]);

    // Anidar bitácoras asociadas a cada caso médico
    if (rows.length > 0) {
      const caseIds = rows.map(r => r.id);
      const ph = caseIds.map(() => '?').join(',');
      const [bitacoras] = await pool.execute(`
        SELECT
          b.idbitacora,
          b.idcaso,
          b.fecha_seguimiento,
          COALESCE(tc.tipo, b.tipo_contacto) AS tipo_contacto,
          b.tipo_contacto AS tipo_contacto_id,
          b.seguimiento_objetivo,
          b.compromiso_accion,
          b.fecha_compromiso,
          COALESCE(cr.resultado, b.resultado) AS resultado,
          b.resultado AS resultado_id,
          b.actividad_actual,
          b.usuario,
          b.fecha_registro,
          u.Nombre AS usuario_nombre
        FROM Maestro_bitacora_cmedicos b
        LEFT JOIN Config_Tipo_Contacto tc ON tc.id = CAST(b.tipo_contacto AS UNSIGNED)
        LEFT JOIN Config_Resultados cr ON cr.id = CAST(b.resultado AS UNSIGNED)
        LEFT JOIN Maestro_Usuarios u ON b.usuario = u.ID
        WHERE b.idcaso IN (${ph})
        ORDER BY b.fecha_seguimiento DESC, b.idbitacora DESC
      `, caseIds);

      const bitacorasMap = {};
      bitacoras.forEach(b => {
        if (!bitacorasMap[b.idcaso]) bitacorasMap[b.idcaso] = [];
        bitacorasMap[b.idcaso].push(b);
      });

      rows.forEach(r => {
        r.bitacoras = bitacorasMap[r.id] || [];
        r.total_bitacoras = r.bitacoras.length;
      });
    }

    res.json(rows);
  } catch (err) {
    console.error('[casosmedicos] Error en /api/casos-trabajador:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// API: GET /api/catalogos
// Devuelve los catálogos requeridos para el formulario de casos y bitácoras
// ══════════════════════════════════════════════════════════════
router.get('/api/catalogos', async (req, res) => {
  try {
    const [tiposCaso] = await pool.execute('SELECT id, nombre FROM Config_Tipo_Caso ORDER BY id');
    const [estados] = await pool.execute('SELECT id, nombre FROM Config_Estado_General ORDER BY id');
    const [prioridades] = await pool.execute('SELECT id, nombre FROM Config_Prioridad ORDER BY id');
    const [tiposEvento] = await pool.execute('SELECT id, nombre FROM Config_Tipo_Evento ORDER BY id');
    const [accidentesTransito] = await pool.execute('SELECT id, nombre FROM Config_Tipo_Accidente_Transito ORDER BY id');
    const [siNo] = await pool.execute('SELECT id, nombre, etiqueta FROM Config_Si_No ORDER BY id');
    const [regionales] = await pool.execute('SELECT Regional FROM Config_Regionales ORDER BY Regional');
    const [eps] = await pool.execute('SELECT EPS FROM Config_EPS ORDER BY EPS');
    const [afp] = await pool.execute('SELECT `Fondo de Pensión` AS Fondo FROM `Config_Pensión` ORDER BY `Fondo de Pensión`');
    const [tiposContacto] = await pool.execute('SELECT id, tipo FROM Config_Tipo_Contacto ORDER BY id');
    const [resultadosBitacora] = await pool.execute('SELECT id, resultado FROM Config_Resultados ORDER BY id');

    res.json({
      tiposCaso,
      estados,
      prioridades,
      tiposEvento,
      accidentesTransito,
      siNo,
      regionales: regionales.map(r => r.Regional),
      eps: eps.map(e => e.EPS),
      afp: afp.map(a => a.Fondo),
      tiposContacto,
      resultadosBitacora
    });
  } catch (err) {
    console.error('[casosmedicos] Error en /api/catalogos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// API: GET /api/diagnosticos
// Búsqueda autocompletable de diagnósticos CIE-10
// ══════════════════════════════════════════════════════════════
router.get('/api/diagnosticos', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json([]);
    }

    const term = `%${q.trim().toUpperCase()}%`;
    const [rows] = await pool.execute(
      'SELECT Cod, `Descripción` AS Descripcion FROM Config_Diagnostico WHERE Cod LIKE ? OR `Descripción` LIKE ? LIMIT 25',
      [term, term]
    );

    res.json(rows);
  } catch (err) {
    console.error('[casosmedicos] Error en /api/diagnosticos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// API: GET /api/trabajador-info/:identificacion
// Autocompletado de datos del trabajador para el formulario
// ══════════════════════════════════════════════════════════════
router.get('/api/trabajador-info/:identificacion', async (req, res) => {
  try {
    const { identificacion } = req.params;
    if (!identificacion) {
      return res.status(400).json({ error: 'Cédula requerida' });
    }

    const [vRows] = await pool.execute(
      `SELECT Identificación, Trabajador, Cargo, Regional, \`Operación\`, Estado, \`Fecha de Ingreso\` AS Fecha_Ingreso
       FROM \`Maestro_Vinculación\`
       WHERE Identificación = ?
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );

    const [sRows] = await pool.execute(
      `SELECT Identificación, Trabajador, \`Fecha Nacimiento\` AS Fecha_Nacimiento, EPS, Pensión, Celular, Email, \`Operación\`
       FROM \`Maestro_Segmentación\`
       WHERE Identificación = ?
       LIMIT 1`,
      [identificacion]
    );

    if (!vRows.length && !sRows.length) {
      return res.status(404).json({ error: 'Trabajador no encontrado' });
    }

    const vin = vRows[0] || {};
    const seg = sRows[0] || {};

    const fechaIngresoStr = vin.Fecha_Ingreso ? new Date(vin.Fecha_Ingreso).toISOString().slice(0, 10) : null;
    const fechaNacimientoStr = seg.Fecha_Nacimiento ? new Date(seg.Fecha_Nacimiento).toISOString().slice(0, 10) : null;

    // Calcular antigüedad en años
    let anosEmpresa = 0;
    if (fechaIngresoStr) {
      const fi = new Date(fechaIngresoStr);
      const hoy = new Date();
      anosEmpresa = Math.max(0, Math.floor((hoy - fi) / (1000 * 60 * 60 * 24 * 365.25)));
    }

    // Calcular edad
    let edad = 0;
    if (fechaNacimientoStr) {
      const fn = new Date(fechaNacimientoStr);
      const hoy = new Date();
      edad = Math.max(0, Math.floor((hoy - fn) / (1000 * 60 * 60 * 24 * 365.25)));
    }

    // Obtener casos previos del trabajador para selección de caso anterior
    const [casosPrevios] = await pool.execute(
      'SELECT id, codigo_caso, fecha_inicio, diagnostico FROM Maestro_casosmedicos WHERE identificacion = ? AND deleted_at IS NULL ORDER BY id DESC',
      [identificacion]
    );

    res.json({
      identificacion,
      nombre: vin.Trabajador || seg.Trabajador || '—',
      cargo: vin.Cargo || '—',
      regional: vin.Regional || '',
      operacion: vin['Operación'] || seg['Operación'] || '',
      estado: vin.Estado || 'Activo',
      fechaIngreso: fechaIngresoStr,
      anosEmpresa,
      fechaNacimiento: fechaNacimientoStr,
      edad,
      eps: seg.EPS || '',
      afp: seg.Pensión || '',
      celular: seg.Celular || '',
      email: seg.Email || '',
      casosPrevios
    });
  } catch (err) {
    console.error('[casosmedicos] Error en /api/trabajador-info:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// API: GET /api/search-trabajadores
// Autocompletado general para buscar cualquier trabajador
// ══════════════════════════════════════════════════════════════
router.get('/api/search-trabajadores', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json([]);
    }

    const term = `%${q.trim().toUpperCase()}%`;
    const [rows] = await pool.execute(
      `SELECT DISTINCT Identificación AS identificacion, Trabajador AS trabajador
       FROM \`Maestro_Segmentación\`
       WHERE Trabajador LIKE ? OR Identificación LIKE ?
       LIMIT 20`,
      [term, term]
    );

    res.json(rows);
  } catch (err) {
    console.error('[casosmedicos] Error en /api/search-trabajadores:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// API: POST /api/crear
// Registra un nuevo caso médico en Maestro_casosmedicos
// ══════════════════════════════════════════════════════════════
router.post('/api/crear', async (req, res) => {
  try {
    const {
      usuario,
      identificacion,
      tipo_caso_id,
      estado_general_id,
      prioridad_id,
      es_continuacion,
      caso_anterior_id,
      regional_id,
      operacion,
      fecha_ingreso,
      numero_anos_empresa,
      fecha_nacimiento,
      edad,
      eps_id,
      afp_id,
      diagnostico,
      tipo_evento_id,
      tipo_accidente_transito_id,
      fecha_evento,
      dias_incapacidad,
      pcl_porcentaje,
      recomendaciones,
      fecha_inicio,
      fecha_fin,
      actividad_actual,
      historial_anterior,
      responsable_sst,
      responsable_operacion,
      proxima_accion,
      fecha_compromiso,
      ultimo_seguimiento,
      estado_gestion,
      fecha_cierre,
      motivo_cierre
    } = req.body;

    if (!usuario) {
      return res.status(400).json({ error: 'Parámetro usuario requerido' });
    }

    const acceso = await computarAccesoSST(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado en el módulo SST' });
    }

    const ROLES_CREAR_CASO = ['Sistema', 'AdmSst', 'LiderSst'];
    if (!ROLES_CREAR_CASO.includes(acceso.rol)) {
      return res.status(403).json({
        error: `El rol '${acceso.rol}' no tiene permisos para crear casos médicos. Roles autorizados: Sistema, AdmSst y LiderSst.`
      });
    }

    if (!identificacion) {
      return res.status(400).json({ error: 'La identificación del trabajador es obligatoria' });
    }
    if (!tipo_caso_id) {
      return res.status(400).json({ error: 'El tipo de caso es obligatorio' });
    }
    if (!prioridad_id) {
      return res.status(400).json({ error: 'La prioridad es obligatoria' });
    }
    if (!tipo_evento_id) {
      return res.status(400).json({ error: 'El tipo de evento es obligatorio' });
    }
    if (!regional_id) {
      return res.status(400).json({ error: 'La regional es obligatoria' });
    }
    const [eventoRows] = await pool.execute('SELECT nombre FROM Config_Tipo_Evento WHERE id = ?', [tipo_evento_id]);
    const esSeguimientoEmo = eventoRows.some(row => String(row.nombre || '').trim().toUpperCase() === 'SEGUIMIENTO EMO');
    if (!fecha_ingreso) {
      return res.status(400).json({ error: 'La fecha de ingreso es obligatoria' });
    }
    if (!diagnostico && !esSeguimientoEmo) {
      return res.status(400).json({ error: 'El diagnóstico CIE-10 es obligatorio para este tipo de evento' });
    }

    // Regla de validación fecha_fin >= fecha_inicio
    if (fecha_inicio && fecha_fin) {
      if (new Date(fecha_fin) < new Date(fecha_inicio)) {
        return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la fecha de inicio' });
      }
    }

    // Generar consecutivo correlativo CM-XXXX
    const [maxCodeRows] = await pool.execute(`
      SELECT codigo_caso FROM Maestro_casosmedicos
      WHERE codigo_caso REGEXP '^CM-[0-9]+$'
      ORDER BY id DESC LIMIT 1
    `);

    let nextNum = 1;
    if (maxCodeRows.length && maxCodeRows[0].codigo_caso) {
      const match = maxCodeRows[0].codigo_caso.match(/^CM-(\d+)$/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    let codigo_caso = `CM-${String(nextNum).padStart(4, '0')}`;

    // Alertas automáticas iniciales
    let alertaVencimiento = 'SIN FECHA';
    if (fecha_fin) {
      const hoy = new Date();
      const ff = new Date(fecha_fin);
      const diffDays = Math.ceil((ff - hoy) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) alertaVencimiento = 'VENCIDO';
      else if (diffDays <= 7) alertaVencimiento = 'POR VENCER';
      else alertaVencimiento = 'VIGENTE';
    }

    let alertaSeguimiento = 'SIN SEGUIMIENTO';
    let diasSinSeguimiento = null;
    if (ultimo_seguimiento) {
      const hoy = new Date();
      const us = new Date(ultimo_seguimiento);
      diasSinSeguimiento = Math.max(0, Math.floor((hoy - us) / (1000 * 60 * 60 * 24)));
      if (diasSinSeguimiento <= 15) alertaSeguimiento = 'AL DÍA';
      else if (diasSinSeguimiento <= 30) alertaSeguimiento = 'PENDIENTE';
      else alertaSeguimiento = 'CRÍTICO';
    }

    const estadoGestionFinal = estado_gestion || 'REQUIERE ACCIÓN';
    const estadoGeneralFinal = estado_general_id || 1; // 1 = ABIERTO
    const esContinuacionFinal = es_continuacion || 2; // 2 = NO
    const casoAnteriorIdFinal = (Number(esContinuacionFinal) === 1 && caso_anterior_id) ? caso_anterior_id : null;
    const tipoAccidenteFinal = (Number(tipo_evento_id) === 4 && tipo_accidente_transito_id) ? tipo_accidente_transito_id : null;

    // Validar foreign keys opcionales para evitar rechazos por variaciones ortográficas
    let validRegionalId = regional_id;
    if (validRegionalId) {
      const [rRows] = await pool.execute('SELECT Regional FROM Config_Regionales WHERE Regional = ?', [validRegionalId]);
      if (!rRows.length) {
        const [rLike] = await pool.execute('SELECT Regional FROM Config_Regionales WHERE ? LIKE CONCAT("%", Regional, "%") OR Regional LIKE CONCAT("%", ?, "%") LIMIT 1', [validRegionalId, validRegionalId]);
        validRegionalId = rLike.length ? rLike[0].Regional : 'CENTRO';
      }
    } else {
      validRegionalId = 'CENTRO';
    }

    let validEpsId = eps_id || null;
    if (validEpsId) {
      const [epsRows] = await pool.execute('SELECT EPS FROM Config_EPS WHERE EPS = ?', [validEpsId]);
      if (!epsRows.length) validEpsId = null;
    }

    let validAfpId = afp_id || null;
    if (validAfpId) {
      const [afpRows] = await pool.execute('SELECT `Fondo de Pensión` FROM `Config_Pensión` WHERE `Fondo de Pensión` = ?', [validAfpId]);
      if (!afpRows.length) validAfpId = null;
    }

    let validUsuario = usuario || null;
    if (validUsuario) {
      const [uRows] = await pool.execute('SELECT ID FROM Maestro_Usuarios WHERE ID = ?', [validUsuario]);
      if (!uRows.length) validUsuario = null;
    }

    const insertSql = `
      INSERT INTO Maestro_casosmedicos
      (
        codigo_caso, es_continuacion, caso_anterior_id, identificacion, tipo_caso_id,
        estado_general_id, prioridad_id, regional_id, operacion, fecha_ingreso,
        numero_anos_empresa, fecha_nacimiento, edad, eps_id, afp_id,
        diagnostico, tipo_evento_id, tipo_accidente_transito_id, fecha_evento, dias_incapacidad,
        pcl_porcentaje, recomendaciones, fecha_inicio, fecha_fin, actividad_actual,
        historial_anterior, responsable_sst, responsable_operacion, proxima_accion, fecha_compromiso,
        ultimo_seguimiento, dias_sin_seguimiento, alerta_vencimiento, alerta_seguimiento, estado_gestion,
        fecha_cierre, motivo_cierre, usuario, fecha_registro, fecha_actualizacion
      )
      VALUES
      (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, NOW(), NOW()
      )
    `;

    const params = [
      codigo_caso,
      esContinuacionFinal,
      casoAnteriorIdFinal,
      identificacion,
      tipo_caso_id,
      estadoGeneralFinal,
      prioridad_id,
      validRegionalId,
      operacion || null,
      fecha_ingreso,
      numero_anos_empresa || null,
      fecha_nacimiento || null,
      edad || null,
      validEpsId,
      validAfpId,
      diagnostico || null,
      tipo_evento_id,
      tipoAccidenteFinal,
      fecha_evento || null,
      dias_incapacidad || null,
      pcl_porcentaje || null,
      recomendaciones || null,
      fecha_inicio || null,
      fecha_fin || null,
      actividad_actual || null,
      historial_anterior || null,
      responsable_sst || null,
      responsable_operacion || null,
      proxima_accion || null,
      fecha_compromiso || null,
      ultimo_seguimiento || null,
      diasSinSeguimiento,
      alertaVencimiento,
      alertaSeguimiento,
      estadoGestionFinal,
      fecha_cierre || null,
      motivo_cierre || null,
      validUsuario
    ];

    const [result] = await pool.execute(insertSql, params);

    // trg_casos_bi asigna NEW.codigo_caso = NULL, se actualiza post-insert con el ID autoincremental
    codigo_caso = `CM-${String(result.insertId).padStart(4, '0')}`;
    await pool.execute('UPDATE Maestro_casosmedicos SET codigo_caso = ? WHERE id = ?', [codigo_caso, result.insertId]);

    res.json({
      ok: true,
      id: result.insertId,
      codigo_caso,
      message: `Caso médico ${codigo_caso} registrado exitosamente`
    });
  } catch (err) {
    console.error('[casosmedicos] Error en /api/crear:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// API: DELETE /api/caso/:id
// Borrado lógico de un caso médico
// ══════════════════════════════════════════════════════════════
router.delete('/api/caso/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;

    if (!id || !usuario) {
      return res.status(400).json({ error: 'Parámetros incompletos' });
    }

    const acceso = await computarAccesoSST(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    // Verificar si existe el caso
    const [cRows] = await pool.execute('SELECT id, usuario FROM Maestro_casosmedicos WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!cRows.length) {
      return res.status(404).json({ error: 'Caso médico no encontrado' });
    }

    // Validación de permisos para eliminar: rol Sistema o creador
    const creador = String(cRows[0].usuario || '').trim().toLowerCase();
    const esAdmin = acceso.rol === 'Sistema' || acceso.rol === 'AdmSst' || acceso.rol === 'LiderSst';
    const esCreador = creador === String(usuario).trim().toLowerCase();

    if (!esAdmin && !esCreador) {
      return res.status(403).json({ error: 'No tienes permisos para eliminar este caso médico' });
    }

    await pool.execute('UPDATE Maestro_casosmedicos SET deleted_at = NOW() WHERE id = ?', [id]);
    res.json({ ok: true, message: 'Caso médico eliminado exitosamente' });
  } catch (err) {
    console.error('[casosmedicos] Error en DELETE /api/caso/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// API: GET /api/bitacoras/:idcaso
// Obtiene el historial de bitácora para un caso médico específico
// ══════════════════════════════════════════════════════════════
router.get('/api/bitacoras/:idcaso', async (req, res) => {
  try {
    const { idcaso } = req.params;
    if (!idcaso) {
      return res.status(400).json({ error: 'ID de caso médico requerido' });
    }

    const [rows] = await pool.execute(`
      SELECT
        b.idbitacora,
        b.idcaso,
        b.fecha_seguimiento,
        COALESCE(tc.tipo, b.tipo_contacto) AS tipo_contacto,
        b.tipo_contacto AS tipo_contacto_id,
        b.seguimiento_objetivo,
        b.compromiso_accion,
        b.fecha_compromiso,
        COALESCE(cr.resultado, b.resultado) AS resultado,
        b.resultado AS resultado_id,
        b.actividad_actual,
        b.usuario,
        b.fecha_registro,
        u.Nombre AS usuario_nombre
      FROM Maestro_bitacora_cmedicos b
      LEFT JOIN Config_Tipo_Contacto tc ON tc.id = CAST(b.tipo_contacto AS UNSIGNED)
      LEFT JOIN Config_Resultados cr ON cr.id = CAST(b.resultado AS UNSIGNED)
      LEFT JOIN Maestro_Usuarios u ON b.usuario = u.ID
      WHERE b.idcaso = ?
      ORDER BY b.fecha_seguimiento DESC, b.idbitacora DESC
    `, [idcaso]);

    res.json(rows);
  } catch (err) {
    console.error('[casosmedicos] Error en /api/bitacoras:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// API: POST /api/bitacora/crear
// Agrega un registro a la bitácora de un caso médico
// Roles permitidos: Sistema, AdmSst, LiderSst, AnaSst, AuxSst
// ══════════════════════════════════════════════════════════════
router.post('/api/bitacora/crear', async (req, res) => {
  try {
    const {
      usuario,
      idcaso,
      fecha_seguimiento,
      tipo_contacto,
      seguimiento_objetivo,
      compromiso_accion,
      fecha_compromiso,
      resultado,
      actividad_actual
    } = req.body;

    if (!usuario) {
      return res.status(400).json({ error: 'Parámetro usuario requerido' });
    }

    const acceso = await computarAccesoSST(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado en el módulo SST' });
    }

    const ROLES_CREAR_BITACORA = ['Sistema', 'AdmSst', 'LiderSst', 'AnaSst', 'AuxSst'];
    if (!ROLES_CREAR_BITACORA.includes(acceso.rol)) {
      return res.status(403).json({
        error: `El rol '${acceso.rol}' no tiene permisos para agregar bitácoras. Roles autorizados: Sistema, AdmSst, LiderSst, AnaSst y AuxSst.`
      });
    }

    if (!idcaso) {
      return res.status(400).json({ error: 'El ID del caso médico es obligatorio' });
    }
    if (!tipo_contacto) {
      return res.status(400).json({ error: 'El tipo de contacto es obligatorio' });
    }

    // Verificar que el caso existe y no está eliminado
    const [cRows] = await pool.execute('SELECT id, codigo_caso, ultimo_seguimiento FROM Maestro_casosmedicos WHERE id = ? AND deleted_at IS NULL', [idcaso]);
    if (!cRows.length) {
      return res.status(404).json({ error: 'Caso médico no encontrado' });
    }

    // Validar tipo_contacto contra Config_Tipo_Contacto
    const [tcRows] = await pool.execute('SELECT id FROM Config_Tipo_Contacto WHERE id = ?', [tipo_contacto]);
    if (!tcRows.length) {
      return res.status(400).json({ error: `Tipo de contacto no válido: ${tipo_contacto}` });
    }

    // Validar resultado contra Config_Resultados y guardar el identificador del catálogo.
    let validResultado = resultado || null;
    if (validResultado) {
      const [resRows] = await pool.execute('SELECT id FROM Config_Resultados WHERE id = ?', [validResultado]);
      if (!resRows.length) return res.status(400).json({ error: `Resultado no válido: ${validResultado}` });
    }

    // Validar usuario contra Maestro_Usuarios
    let validUsuario = usuario || null;
    if (validUsuario) {
      const [uRows] = await pool.execute('SELECT ID FROM Maestro_Usuarios WHERE ID = ?', [validUsuario]);
      if (!uRows.length) validUsuario = null;
    }

    const fechaSeg = fecha_seguimiento || new Date().toISOString().slice(0, 10);

    const insertSql = `
      INSERT INTO Maestro_bitacora_cmedicos
      (
        idcaso, fecha_seguimiento, tipo_contacto, seguimiento_objetivo,
        compromiso_accion, fecha_compromiso, resultado, actividad_actual,
        usuario, fecha_registro
      )
      VALUES
      (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, NOW()
      )
    `;

    const [resInsert] = await pool.execute(insertSql, [
      idcaso,
      fechaSeg,
      tipo_contacto,
      seguimiento_objetivo || null,
      compromiso_accion || null,
      fecha_compromiso || null,
      validResultado,
      actividad_actual || null,
      validUsuario
    ]);

    // Actualizar el caso médico padre para sincronizar último seguimiento y próximos compromisos
    await pool.execute(`
      UPDATE Maestro_casosmedicos
      SET
        ultimo_seguimiento = GREATEST(COALESCE(ultimo_seguimiento, '1970-01-01'), ?),
        proxima_accion = COALESCE(?, proxima_accion),
        fecha_compromiso = COALESCE(?, fecha_compromiso),
        actividad_actual = COALESCE(?, actividad_actual),
        fecha_actualizacion = NOW()
      WHERE id = ?
    `, [fechaSeg, compromiso_accion || null, fecha_compromiso || null, actividad_actual || null, idcaso]);

    res.json({
      ok: true,
      idbitacora: resInsert.insertId,
      message: 'Registro de bitácora agregado exitosamente'
    });
  } catch (err) {
    console.error('[casosmedicos] Error en /api/bitacora/crear:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// API: DELETE /api/bitacora/:id
// Elimina un registro de bitácora
// Roles permitidos: Sistema, AdmSst, LiderSst o el usuario creador
// ══════════════════════════════════════════════════════════════
router.delete('/api/bitacora/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;

    if (!id || !usuario) {
      return res.status(400).json({ error: 'Parámetros incompletos' });
    }

    const acceso = await computarAccesoSST(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const [bRows] = await pool.execute('SELECT idbitacora, idcaso, usuario FROM Maestro_bitacora_cmedicos WHERE idbitacora = ?', [id]);
    if (!bRows.length) {
      return res.status(404).json({ error: 'Registro de bitácora no encontrado' });
    }

    const creador = String(bRows[0].usuario || '').trim().toLowerCase();
    const esAdmin = acceso.rol === 'Sistema' || acceso.rol === 'AdmSst' || acceso.rol === 'LiderSst';
    const esCreador = creador === String(usuario).trim().toLowerCase();

    if (!esAdmin && !esCreador) {
      return res.status(403).json({ error: 'No tienes permisos para eliminar este registro de bitácora' });
    }

    await pool.execute('DELETE FROM Maestro_bitacora_cmedicos WHERE idbitacora = ?', [id]);

    res.json({ ok: true, message: 'Registro de bitácora eliminado exitosamente' });
  } catch (err) {
    console.error('[casosmedicos] Error en DELETE /api/bitacora/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
