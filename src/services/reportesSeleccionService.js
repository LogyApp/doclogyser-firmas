const pool = require('./db');
const {
  leerConfigSla,
  calcularInicioConteo,
  evaluarAspirante,
  aDia,
  aYmd
} = require('./slaRequisiciones');

/**
 * Obtiene parámetros de configuración para SLA y TalentHub desde Config_Parametros.
 */
async function obtenerParametrosTalenthub() {
  const [rows] = await pool.execute(
    'SELECT `Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ?',
    ['talenthub']
  );
  const mapa = {};
  for (const r of rows) {
    mapa[r.Concepto] = r.Parametro;
    mapa[`${r.Seccion}:${r.Concepto}`] = r.Parametro;
  }
  return mapa;
}

/**
 * Obtiene días festivos desde Maestro_Fechas.
 */
async function obtenerFestivos() {
  const [rows] = await pool.execute(
    "SELECT DATE_FORMAT(`Fecha`, '%Y-%m-%d') AS f FROM `Maestro_Fechas` WHERE `Estado` = 'Festivo' AND `Fecha` IS NOT NULL"
  );
  return new Set(rows.map(r => r.f).filter(Boolean));
}

/**
 * Obtiene periodos de suspensión de las requisiciones indicadas.
 */
async function obtenerSuspensiones(idsRequisicion) {
  const mapa = new Map();
  if (!idsRequisicion.length) return mapa;
  const ph = idsRequisicion.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT IdRequisicion,
            DATE_FORMAT(fecha_inicio, '%Y-%m-%d') AS inicio,
            DATE_FORMAT(fecha_fin, '%Y-%m-%d') AS fin
     FROM \`Dynamic_Requisiciones_Suspension\`
     WHERE IdRequisicion IN (${ph})`,
    idsRequisicion
  );
  rows.forEach(r => {
    if (!mapa.has(r.IdRequisicion)) mapa.set(r.IdRequisicion, []);
    mapa.get(r.IdRequisicion).push({ inicio: r.inicio, fin: r.fin });
  });
  return mapa;
}

/**
 * Fecha de hoy en Bogotá en formato YYYY-MM-DD.
 */
function hoyBogotaYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

/**
 * Calcula indicadores y métricas de cumplimiento de selección con base en datos reales:
 * - Dynamic_Requisiciones
 * - Dynamic_hv_aspirante
 * - Maestro_Segmentación (Sociodemográfica)
 * - Maestro_Vinculación
 */
async function obtenerReporteAnsSeleccion({ fechaDesde, fechaHasta, regional, operacion, responsable, acceso }) {
  const hoyStr = hoyBogotaYmd();
  const desde = fechaDesde || `${hoyStr.slice(0, 7)}-01`;
  const hasta = fechaHasta || hoyStr;

  const esCorporativo = !!(acceso && acceso.sinFiltro);
  const paramsConfig = await obtenerParametrosTalenthub();
  const cfg = leerConfigSla(paramsConfig);
  const festivos = await obtenerFestivos();

  // Condiciones de filtrado para Requisiciones
  const conds = ['r.`Fecha Requisición` >= ?', 'r.`Fecha Requisición` < DATE_ADD(?, INTERVAL 1 DAY)'];
  const paramsQuery = [desde, hasta];

  if (!esCorporativo) {
    const ops = (acceso && acceso.operacionesFiltro) || [];
    if (!ops.length) {
      conds.push('1 = 0');
    } else {
      conds.push(`TRIM(r.\`Operación\`) IN (${ops.map(() => '?').join(',')})`);
      paramsQuery.push(...ops);
    }
  }

  if (regional && regional.trim() !== '') {
    conds.push('TRIM(r.`Regional`) = ?');
    paramsQuery.push(regional.trim());
  }

  if (operacion && operacion.trim() !== '') {
    conds.push('TRIM(r.`Operación`) = ?');
    paramsQuery.push(operacion.trim());
  }

  if (responsable && responsable.trim() !== '') {
    conds.push('TRIM(r.`Responsable de Selección`) = ?');
    paramsQuery.push(responsable.trim());
  }

  // 1. Consultar Requisiciones del periodo
  const [reqRows] = await pool.execute(`
    SELECT 
      r.IdRequisicion,
      r.\`Requisición\` AS requisicion,
      DATE_FORMAT(r.\`Fecha Requisición\`, '%Y-%m-%d %H:%i') AS fechaRequisicion,
      DATE_FORMAT(r.\`Fecha Requisición\`, '%Y-%m-%d') AS fechaRequisicionCorta,
      UPPER(TRIM(r.\`Estado\`)) AS estado,
      COALESCE(NULLIF(TRIM(r.\`Responsable de Selección\`), ''), 'Sin Asignar') AS responsable,
      COALESCE(NULLIF(TRIM(r.\`Regional\`), ''), 'CENTRO') AS regional,
      COALESCE(NULLIF(TRIM(r.\`Operación\`), ''), 'Sin Operación') AS operacion,
      r.\`Cargo Requerido\` AS cargo,
      r.\`Solicitante\` AS solicitante,
      COALESCE(r.\`N° Personas Requeridas\`, 1) AS vacantes_req,
      DATE_FORMAT(r.\`Fecha de Finalización\`, '%Y-%m-%d') AS fecha_fin
    FROM \`Dynamic_Requisiciones\` r
    WHERE ${conds.join(' AND ')}
    ORDER BY r.\`Fecha Requisición\` DESC, r.IdRequisicion DESC
  `, paramsQuery);

  const reqIds = reqRows.map(r => r.IdRequisicion);
  const suspensionesMap = await obtenerSuspensiones(reqIds);

  // 2. Consultar Aspirantes vinculados a estas requisiciones
  const aspirantesPorReq = new Map();
  if (reqIds.length > 0) {
    const ph = reqIds.map(() => '?').join(',');
    const [aspRows] = await pool.execute(`
      SELECT 
        a.id_aspirante,
        a.IdRequisicion,
        a.identificacion,
        CONCAT_WS(' ', a.primer_nombre, a.segundo_nombre, a.primer_apellido, a.segundo_apellido) AS aspirante,
        LOWER(TRIM(a.estado_proceso)) AS estado_proceso,
        DATE_FORMAT(a.fecha_registro, '%Y-%m-%d %H:%i') AS fecha_registro_asp,
        DATE_FORMAT(a.fecha_actualizacion, '%Y-%m-%d %H:%i') AS fecha_act_asp,
        a.Usuario AS usuario_gestion,
        DATE_FORMAT(s.\`Fecha de Actualización\`, '%Y-%m-%d %H:%i') AS fecha_socio,
        COALESCE(NULLIF(TRIM(s.\`usuarioactualiza\`), ''), s.\`Usuario\`) AS usuario_socio,
        DATE_FORMAT(v.\`Fecha de Ingreso\`, '%Y-%m-%d') AS fecha_ingreso_laboral
      FROM \`Dynamic_hv_aspirante\` a
      LEFT JOIN \`Maestro_Segmentación\` s ON s.Identificación = a.identificacion
      LEFT JOIN \`Maestro_Vinculación\` v ON v.Identificación = a.identificacion
      WHERE a.IdRequisicion IN (${ph})
      ORDER BY a.fecha_registro ASC
    `, reqIds);

    aspRows.forEach(a => {
      if (!aspirantesPorReq.has(a.IdRequisicion)) {
        aspirantesPorReq.set(a.IdRequisicion, []);
      }
      aspirantesPorReq.get(a.IdRequisicion).push(a);
    });
  }

  // 3. Procesar y Evaluar SLA por Requisición
  const hoyDia = aDia(hoyStr);
  const requisicionesProcesadas = [];
  const mapResponsables = new Map();

  let sumaVacantesReqGlobal = 0;
  let sumaVacantesCubiertasGlobal = 0;
  let reqCumpleGlobal = 0;
  let reqNoCumpleGlobal = 0;
  let reqEnProcesoGlobal = 0;
  let sumaDiasGlobal = 0;
  let countDiasGlobal = 0;

  for (const r of reqRows) {
    const inicioConteo = calcularInicioConteo(
      r.fechaRequisicion,
      cfg.horaCorte,
      cfg.diasPermitidos,
      festivos,
      cfg.sumarFestivos
    );
    const suspensiones = suspensionesMap.get(r.IdRequisicion) || [];
    const aspirantes = aspirantesPorReq.get(r.IdRequisicion) || [];

    // Clasificar aspirantes
    const contratados = aspirantes.filter(a => a.estado_proceso === 'contratado');
    const enProceso = aspirantes.filter(a => a.estado_proceso === 'en proceso');

    // Evaluar cada aspirante contratado
    const evaluacionesAspirantes = contratados.map(a => {
      // Fecha en que llegó a sociodemográfica o fecha laboral
      const fechaFinAspirante = a.fecha_socio ? a.fecha_socio.slice(0, 10) : (a.fecha_ingreso_laboral || (a.fecha_act_asp ? a.fecha_act_asp.slice(0, 10) : null));
      const ev = evaluarAspirante({
        fechaRequisicion: r.fechaRequisicion,
        inicioConteo,
        fechaIngreso: fechaFinAspirante,
        suspensiones,
        limite: cfg.limite,
        diasPermitidosSet: cfg.diasPermitidos,
        festivosSet: festivos,
        sumarFestivos: cfg.sumarFestivos,
        hoy: hoyDia
      });
      return {
        id_aspirante: a.id_aspirante,
        identificacion: a.identificacion,
        aspirante: a.aspirante,
        fecha_socio: a.fecha_socio,
        usuario_socio: a.usuario_socio,
        fecha_ingreso_laboral: a.fecha_ingreso_laboral,
        dias: ev.dias,
        estadoSla: ev.estado
      };
    });

    // Calcular días de atención y estado SLA de la Requisición
    let diasProceso = null;
    let slaEstado = 'en_tiempo'; // 'cumple', 'nocumple', 'en_tiempo', 'vencido', 'suspendido', 'cancelado'

    const fechaCorteFin = r.fecha_fin || (contratados.length >= r.vacantes_req && contratados[contratados.length - 1]?.fecha_socio?.slice(0, 10));

    if (r.estado === 'FINALIZADO') {
      const fechaFinEval = fechaCorteFin || r.fechaRequisicionCorta;
      const evFin = evaluarAspirante({
        fechaRequisicion: r.fechaRequisicion,
        inicioConteo,
        fechaIngreso: fechaFinEval,
        suspensiones,
        limite: cfg.limite,
        diasPermitidosSet: cfg.diasPermitidos,
        festivosSet: festivos,
        sumarFestivos: cfg.sumarFestivos,
        hoy: hoyDia
      });
      diasProceso = evFin.dias;
      slaEstado = (diasProceso !== null && diasProceso <= cfg.limite) ? 'cumple' : 'nocumple';
    } else if (r.estado === 'CANCELADO') {
      slaEstado = 'cancelado';
      diasProceso = 0;
    } else if (r.estado === 'SUSPENDIDO') {
      slaEstado = 'suspendido';
      const evSusp = evaluarAspirante({
        fechaRequisicion: r.fechaRequisicion,
        inicioConteo,
        fechaIngreso: null,
        suspensiones,
        limite: cfg.limite,
        diasPermitidosSet: cfg.diasPermitidos,
        festivosSet: festivos,
        sumarFestivos: cfg.sumarFestivos,
        hoy: hoyDia
      });
      diasProceso = evSusp.dias;
    } else {
      // EN PROCESO
      const evProc = evaluarAspirante({
        fechaRequisicion: r.fechaRequisicion,
        inicioConteo,
        fechaIngreso: null,
        suspensiones,
        limite: cfg.limite,
        diasPermitidosSet: cfg.diasPermitidos,
        festivosSet: festivos,
        sumarFestivos: cfg.sumarFestivos,
        hoy: hoyDia
      });
      diasProceso = evProc.dias;
      slaEstado = (diasProceso !== null && diasProceso <= cfg.limite) ? 'en_tiempo' : 'vencido';
    }

    const vacReq = Number(r.vacantes_req || 0);
    const vacCub = contratados.length;
    const vacPend = Math.max(0, vacReq - vacCub);

    sumaVacantesReqGlobal += vacReq;
    sumaVacantesCubiertasGlobal += vacCub;

    if (r.estado === 'FINALIZADO') {
      if (slaEstado === 'cumple') reqCumpleGlobal++;
      else reqNoCumpleGlobal++;
      if (diasProceso !== null) {
        sumaDiasGlobal += diasProceso;
        countDiasGlobal++;
      }
    } else if (r.estado === 'EN PROCESO') {
      reqEnProcesoGlobal++;
    }

    // Agregar a tabla de Requisiciones
    requisicionesProcesadas.push({
      id: r.IdRequisicion,
      requisicion: r.requisicion,
      fechaRequisicion: r.fechaRequisicion,
      fechaRequisicionCorta: r.fechaRequisicionCorta,
      estado: r.estado,
      responsable: r.responsable,
      regional: r.regional,
      operacion: r.operacion,
      cargo: r.cargo,
      solicitante: r.solicitante,
      vacantesReq: vacReq,
      vacantesCubiertas: vacCub,
      vacantesPendientes: vacPend,
      fechaFin: r.fecha_fin,
      diasProceso,
      slaEstado,
      aspirantes: evaluacionesAspirantes,
      aspirantesEnProceso: enProceso.length
    });

    // Agregar agregados por Responsable
    const respKey = r.responsable;
    if (!mapResponsables.has(respKey)) {
      mapResponsables.set(respKey, {
        responsable: respKey,
        totalRequisiciones: 0,
        vacantesRequeridas: 0,
        vacantesCubiertas: 0,
        requisicionesFinalizadas: 0,
        cumpleTiempo: 0,
        fueraTiempo: 0,
        enProceso: 0,
        suspendidas: 0,
        canceladas: 0,
        diasSuma: 0,
        diasCount: 0
      });
    }

    const itemR = mapResponsables.get(respKey);
    itemR.totalRequisiciones++;
    itemR.vacantesRequeridas += vacReq;
    itemR.vacantesCubiertas += vacCub;

    if (r.estado === 'FINALIZADO') {
      itemR.requisicionesFinalizadas++;
      if (slaEstado === 'cumple') itemR.cumpleTiempo++;
      else itemR.fueraTiempo++;
      if (diasProceso !== null) {
        itemR.diasSuma += diasProceso;
        itemR.diasCount++;
      }
    } else if (r.estado === 'EN PROCESO') {
      itemR.enProceso++;
    } else if (r.estado === 'SUSPENDIDO') {
      itemR.suspendidas++;
    } else if (r.estado === 'CANCELADO') {
      itemR.canceladas++;
    }
  }

  // Generar lista de analistas/responsables
  const analistas = [...mapResponsables.values()].map(item => {
    const evaluados = item.cumpleTiempo + item.fueraTiempo;
    const pctCumplimiento = evaluados > 0 ? Number(((item.cumpleTiempo / evaluados) * 100).toFixed(1)) : 100.0;
    const pctCobertura = item.vacantesRequeridas > 0 ? Number(((item.vacantesCubiertas / item.vacantesRequeridas) * 100).toFixed(1)) : 0.0;
    const diasPromedio = item.diasCount > 0 ? Number((item.diasSuma / item.diasCount).toFixed(1)) : null;

    return {
      responsable: item.responsable,
      totalRequisiciones: item.totalRequisiciones,
      vacantesRequeridas: item.vacantesRequeridas,
      vacantesCubiertas: item.vacantesCubiertas,
      coberturaPct: pctCobertura,
      enProceso: item.enProceso,
      cumpleTiempo: item.cumpleTiempo,
      fueraTiempo: item.fueraTiempo,
      pctCumplimiento,
      diasPromedio
    };
  }).sort((a, b) => b.totalRequisiciones - a.totalRequisiciones || a.responsable.localeCompare(b.responsable, 'es'));

  // Catálogo disponible para filtros
  const regionalesSet = new Set();
  const operacionesSet = new Set();
  const responsablesSet = new Set();

  reqRows.forEach(r => {
    if (r.regional) regionalesSet.add(r.regional);
    if (r.operacion) operacionesSet.add(r.operacion);
    if (r.responsable) responsablesSet.add(r.responsable);
  });

  const evaluadosGlobal = reqCumpleGlobal + reqNoCumpleGlobal;
  const pctCumplimientoGlobal = evaluadosGlobal > 0 ? Number(((reqCumpleGlobal / evaluadosGlobal) * 100).toFixed(1)) : 100.0;
  const pctCoberturaGlobal = sumaVacantesReqGlobal > 0 ? Number(((sumaVacantesCubiertasGlobal / sumaVacantesReqGlobal) * 100).toFixed(1)) : 0.0;
  const diasPromedioGlobal = countDiasGlobal > 0 ? Number((sumaDiasGlobal / countDiasGlobal).toFixed(1)) : null;

  return {
    kpis: {
      totalRequisiciones: reqRows.length,
      vacantesRequeridas: sumaVacantesReqGlobal,
      vacantesCubiertas: sumaVacantesCubiertasGlobal,
      pctCoberturaGlobal,
      cumpleTiempo: reqCumpleGlobal,
      fueraTiempo: reqNoCumpleGlobal,
      pctCumplimientoGlobal,
      enProceso: reqEnProcesoGlobal,
      diasPromedioGlobal,
      limiteDiasSla: cfg.limite
    },
    filtros: {
      desde,
      hasta,
      regional: regional || '',
      operacion: operacion || '',
      responsable: responsable || ''
    },
    catalogo: {
      regionales: [...regionalesSet].sort(),
      operaciones: [...operacionesSet].sort(),
      responsables: [...responsablesSet].sort()
    },
    analistas,
    requisiciones: requisicionesProcesadas
  };
}

module.exports = {
  obtenerReporteAnsSeleccion,
  obtenerParametrosTalenthub,
  obtenerFestivos
};
