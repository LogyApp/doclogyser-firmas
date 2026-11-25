const pool = require('./db');

let cacheParams = { data: null, timestamp: 0 };
const TTL_PARAMS = 5 * 60 * 1000; // 5 minutos

const DEFAULTS_PARAMETROS = {
  Dias_Aviso_Oportuno: 2,
  Dias_Aviso_Alerta: 5,
  Dias_Fuga_Temprana: 60,
  Pct_Rotacion_Alerta: 5.0,
  Roles_Historico_Mes: 'Nomina,Directorth,Juridica,subgerente,Sistema',
};

async function obtenerParametrosReportes() {
  const ahora = Date.now();
  if (cacheParams.data && (ahora - cacheParams.timestamp) < TTL_PARAMS) {
    return cacheParams.data;
  }

  try {
    const [rows] = await pool.execute(
      "SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Reportes'"
    );
    const params = { ...DEFAULTS_PARAMETROS };
    rows.forEach(r => {
      const valStr = String(r.Parametro || '').trim();
      const num = parseFloat(valStr);
      if (!isNaN(num) && /^-?\d+(\.\d+)?$/.test(valStr)) {
        params[r.Concepto] = num;
      } else {
        params[r.Concepto] = valStr;
      }
    });
    cacheParams = { data: params, timestamp: ahora };
    return params;
  } catch (err) {
    console.error('[reportesNominaService] Error al cargar Config_Parametros:', err.message);
    return DEFAULTS_PARAMETROS;
  }
}

/**
 * Calcula las métricas de rotación, oportunidad, deserción temprana (<60d) y motivos por operación.
 * Aplica la política de privacidad según los permisos de acceso del usuario:
 * - Si es corporativo (sinFiltro): ve cantidades absolutas de todas las operaciones.
 * - Si tiene operaciones específicas: ve cantidades completas de su(s) operación(es) y
 *   solo porcentajes/benchmarks protegidos (***) de las demás.
 */
async function obtenerIndicadoresOperaciones({ fechaDesde, fechaHasta, acceso }) {
  if (!fechaDesde || !fechaHasta) {
    throw new Error('fechaDesde y fechaHasta son obligatorios (formato YYYY-MM-DD)');
  }

  const paramsConfig = await obtenerParametrosReportes();
  const diasFugaTemprana = paramsConfig.Dias_Fuga_Temprana || 60;
  const diasOportuno = paramsConfig.Dias_Aviso_Oportuno || 2;
  const diasAlerta = paramsConfig.Dias_Aviso_Alerta || 5;

  const [
    [retirosRows],
    [ingresosRows],
    [plantaRows],
    [motivosRows],
    [regionalesRows]
  ] = await Promise.all([
    // 1. Retiros del periodo
    pool.execute(`
      SELECT
        TRIM(\`Operación\`) AS operacion,
        TRIM(\`Regional\`)  AS regional,
        COUNT(*) AS total_retiros,
        SUM(CASE WHEN DATEDIFF(\`Fecha de Retiro\`, \`Fecha de Ingreso\`) < ? THEN 1 ELSE 0 END) AS retiros_tempranos,
        ROUND(AVG(DATEDIFF(\`Fecha de Retiro\`, \`Fecha de Ingreso\`)), 1) AS permanencia_media_dias,
        ROUND(AVG(GREATEST(0, DATEDIFF(CAST(\`Fecha Actualización\` AS DATE), \`Fecha de Retiro\`))), 1) AS retraso_aviso_medio_dias
      FROM \`Maestro_Vinculación\`
      WHERE \`Estado\` = 'Retirado'
        AND \`Fecha de Retiro\` BETWEEN ? AND ?
        AND \`Operación\` IS NOT NULL AND TRIM(\`Operación\`) != ''
      GROUP BY TRIM(\`Operación\`), TRIM(\`Regional\`)
    `, [diasFugaTemprana, fechaDesde, fechaHasta]),

    // 2. Ingresos del periodo
    pool.execute(`
      SELECT
        TRIM(\`Operación\`) AS operacion,
        COUNT(*) AS total_ingresos
      FROM \`Maestro_Vinculación\`
      WHERE \`Fecha de Ingreso\` BETWEEN ? AND ?
        AND \`Operación\` IS NOT NULL AND TRIM(\`Operación\`) != ''
      GROUP BY TRIM(\`Operación\`)
    `, [fechaDesde, fechaHasta]),

    // 3. Planta activa al inicio del periodo (Planta Inicial)
    pool.execute(`
      SELECT
        TRIM(\`Operación\`) AS operacion,
        COUNT(*) AS planta_activa
      FROM \`Maestro_Vinculación\`
      WHERE \`Fecha de Ingreso\` < ?
        AND (\`Fecha de Retiro\` IS NULL OR \`Fecha de Retiro\` >= ?)
        AND \`Operación\` IS NOT NULL AND TRIM(\`Operación\`) != ''
      GROUP BY TRIM(\`Operación\`)
    `, [fechaDesde, fechaDesde]),

    // 4. Motivos de retiro del periodo
    pool.execute(`
      SELECT
        TRIM(\`Operación\`) AS operacion,
        COALESCE(NULLIF(TRIM(\`Motivo del Retiro\`), ''), 'Sin especificar') AS motivo,
        COUNT(*) AS cantidad
      FROM \`Maestro_Vinculación\`
      WHERE \`Estado\` = 'Retirado'
        AND \`Fecha de Retiro\` BETWEEN ? AND ?
        AND \`Operación\` IS NOT NULL AND TRIM(\`Operación\`) != ''
      GROUP BY TRIM(\`Operación\`), COALESCE(NULLIF(TRIM(\`Motivo del Retiro\`), ''), 'Sin especificar')
      ORDER BY TRIM(\`Operación\`), cantidad DESC
    `, [fechaDesde, fechaHasta]),

    // 5. Catálogo de operaciones activas para incluir operaciones con 0 retiros
    pool.execute(`
      SELECT DISTINCT OPERACIÓN AS operacion, REGIONAL AS regional
      FROM Maestro_Operaciones
      WHERE REGIONAL != 'INACTIVO' AND OPERACIÓN IS NOT NULL AND TRIM(OPERACIÓN) != ''
      ORDER BY REGIONAL, OPERACIÓN
    `)
  ]);

  const mapIngresos = {};
  ingresosRows.forEach(i => { mapIngresos[i.operacion] = Number(i.total_ingresos || 0); });

  const mapPlanta = {};
  plantaRows.forEach(p => { mapPlanta[p.operacion] = Number(p.planta_activa || 0); });

  const mapMotivos = {};
  motivosRows.forEach(m => {
    (mapMotivos[m.operacion] = mapMotivos[m.operacion] || []).push({
      motivo: m.motivo,
      cantidad: Number(m.cantidad || 0)
    });
  });

  const mapRetiros = {};
  retirosRows.forEach(r => {
    mapRetiros[r.operacion] = {
      regional: r.regional,
      total_retiros: Number(r.total_retiros || 0),
      retiros_tempranos: Number(r.retiros_tempranos || 0),
      permanencia_media_dias: r.permanencia_media_dias !== null ? Number(r.permanencia_media_dias) : null,
      retraso_aviso_medio_dias: r.retraso_aviso_medio_dias !== null ? Number(r.retraso_aviso_medio_dias) : 0,
    };
  });

  // Operaciones permitidas para el usuario actual
  const esCorporativo = !!(acceso && acceso.sinFiltro);
  const opsFiltroUsuario = new Set(
    ((acceso && acceso.operacionesFiltro) || []).map(o => String(o).trim().toLowerCase())
  );

  // Unir todas las operaciones que tuvieron actividad o existen en catálogo
  const setOperaciones = new Set([
    ...Object.keys(mapRetiros),
    ...Object.keys(mapIngresos),
    ...Object.keys(mapPlanta)
  ]);

  const mapRegionalCatalogo = {};
  regionalesRows.forEach(r => { mapRegionalCatalogo[r.operacion] = r.regional; });

  const listaOperaciones = [];

  for (const op of setOperaciones) {
    const dataRet = mapRetiros[op] || {
      regional: mapRegionalCatalogo[op] || 'CENTRO',
      total_retiros: 0,
      retiros_tempranos: 0,
      permanencia_media_dias: null,
      retraso_aviso_medio_dias: 0
    };

    const regional = dataRet.regional || mapRegionalCatalogo[op] || 'CENTRO';
    const totalRetiros = dataRet.total_retiros;
    const totalIngresos = mapIngresos[op] || 0;
    const planta = mapPlanta[op] !== undefined ? mapPlanta[op] : 0;
    const balance = totalIngresos - totalRetiros;

    const pctRotacion = planta > 0 ? Number(((totalRetiros / planta) * 100).toFixed(1)) : 0;
    const pctIngreso = planta > 0 ? Number(((totalIngresos / planta) * 100).toFixed(1)) : 0;
    const pctTemprano = totalRetiros > 0 ? Number(((dataRet.retiros_tempranos / totalRetiros) * 100).toFixed(1)) : 0;

    const motivosList = mapMotivos[op] || [];
    const motivoPrincipal = motivosList.length > 0 ? motivosList[0].motivo : 'Sin retiros';

    // Determinar nivel de semáforo de aviso
    let semaforoAviso = 'verde';
    if (dataRet.retraso_aviso_medio_dias > diasAlerta) semaforoAviso = 'rojo';
    else if (dataRet.retraso_aviso_medio_dias > diasOportuno) semaforoAviso = 'amarillo';

    // Determinar nivel de alerta de fuga temprana
    let semaforoFuga = 'verde';
    if (pctTemprano > 30) semaforoFuga = 'rojo';
    else if (pctTemprano > 15) semaforoFuga = 'amarillo';

    // Verificación de permiso: ¿el usuario tiene acceso a ver los datos absolutos de esta operación?
    const esPropia = esCorporativo || opsFiltroUsuario.has(op.trim().toLowerCase());

    listaOperaciones.push({
      operacion: op,
      regional,
      esPropia,
      pctRotacion,
      pctIngreso,
      pctTemprano,
      retrasoAvisoMedioDias: dataRet.retraso_aviso_medio_dias,
      permanenciaMediaDias: dataRet.permanencia_media_dias,
      semaforoAviso,
      semaforoFuga,
      motivoPrincipal,
      // Cantidades exactas solo si es su propia operación o usuario corporativo
      planta: esPropia ? planta : null,
      retiros: esPropia ? totalRetiros : null,
      ingresos: esPropia ? totalIngresos : null,
      balance: esPropia ? balance : null,
      retirosTempranos: esPropia ? dataRet.retiros_tempranos : null,
      motivos: esPropia ? motivosList : motivosList.map(m => ({ motivo: m.motivo, porcentaje: totalRetiros > 0 ? Number(((m.cantidad / totalRetiros) * 100).toFixed(1)) : 0 }))
    });
  }

  // Orden inicial por mayor tasa de rotación
  listaOperaciones.sort((a, b) => b.pctRotacion - a.pctRotacion || (b.retiros || 0) - (a.retiros || 0));

  // Asignar posición en ranking
  listaOperaciones.forEach((op, index) => {
    op.ranking = index + 1;
  });

  // KPIs Globales (Consolidados)
  const totalOpsConRetiros = retirosRows.length;
  let sumaRotacion = 0;
  let sumaAviso = 0;
  let sumaRetirosTotal = 0;
  let sumaTempranosTotal = 0;
  let sumaIngresosTotal = 0;
  let sumaPlantaTotal = 0;

  for (const r of retirosRows) {
    const totR = Number(r.total_retiros || 0);
    const totT = Number(r.retiros_tempranos || 0);
    const av = Number(r.retraso_aviso_medio_dias || 0);
    sumaRetirosTotal += totR;
    sumaTempranosTotal += totT;
    sumaAviso += (av * totR);
  }

  Object.values(mapPlanta).forEach(p => { sumaPlantaTotal += p; });
  Object.values(mapIngresos).forEach(i => { sumaIngresosTotal += i; });

  const rotacionMediaGlobal = sumaPlantaTotal > 0 ? Number(((sumaRetirosTotal / sumaPlantaTotal) * 100).toFixed(1)) : 0;
  const tiempoAvisoMedioGlobal = sumaRetirosTotal > 0 ? Number((sumaAviso / sumaRetirosTotal).toFixed(1)) : 0;
  const pctFugaTempranaGlobal = sumaRetirosTotal > 0 ? Number(((sumaTempranosTotal / sumaRetirosTotal) * 100).toFixed(1)) : 0;

  // Operaciones destacadas para tarjetas resumen
  const opsConRetiros = listaOperaciones.filter(o => (o.retiros !== null ? o.retiros > 0 : true));
  const opMenorRotacion = [...listaOperaciones].filter(o => o.pctRotacion > 0).sort((a, b) => a.pctRotacion - b.pctRotacion)[0] || null;
  const opMasOportuna = [...opsConRetiros].sort((a, b) => a.retrasoAvisoMedioDias - b.retrasoAvisoMedioDias)[0] || null;
  const opMayorFuga = [...opsConRetiros].filter(o => o.pctTemprano > 0).sort((a, b) => b.pctTemprano - a.pctTemprano)[0] || null;

  const rolesHistoricoStr = paramsConfig.Roles_Historico_Mes || DEFAULTS_PARAMETROS.Roles_Historico_Mes;
  const rolesAutorizadosHistorico = new Set(
    rolesHistoricoStr.split(',').map(r => r.trim().toLowerCase()).filter(Boolean)
  );
  const rolUsuario = String(acceso?.rol || '').trim().toLowerCase();
  const puedeVerHistorico = esCorporativo || rolesAutorizadosHistorico.has(rolUsuario);

  return {
    kpisGlobales: {
      totalOperaciones: listaOperaciones.length,
      rotacionMediaGlobal,
      tiempoAvisoMedioGlobal,
      pctFugaTempranaGlobal,
      esCorporativo,
      puedeVerHistorico,
      // Solo corporativos ven totales exactos
      totalesCorporativos: esCorporativo ? {
        plantaTotal: sumaPlantaTotal,
        retirosTotal: sumaRetirosTotal,
        ingresosTotal: sumaIngresosTotal,
        balanceNeto: sumaIngresosTotal - sumaRetirosTotal,
        retirosTempranosTotal: sumaTempranosTotal,
      } : null,
      destacados: {
        menorRotacion: opMenorRotacion ? { operacion: opMenorRotacion.operacion, regional: opMenorRotacion.regional, pctRotacion: opMenorRotacion.pctRotacion } : null,
        masOportuna: opMasOportuna ? { operacion: opMasOportuna.operacion, regional: opMasOportuna.regional, diasAviso: opMasOportuna.retrasoAvisoMedioDias } : null,
        mayorFugaTemprana: opMayorFuga ? { operacion: opMayorFuga.operacion, regional: opMayorFuga.regional, pctTemprano: opMayorFuga.pctTemprano } : null,
      }
    },
    parametros: paramsConfig,
    operaciones: listaOperaciones
  };
}

/**
 * Agrupación de evolución histórica por mes (Enero a Diciembre) para el año dado.
 * Columnas: Mes, En Planta, Ingresos, Retiros, Retiros < 60 días, Tasa Rotación %, Balance Neto
 * Filtros opcionales: Regional, Operación.
 */
async function obtenerEvolucionMensual({ anio, regional, operacion, acceso }) {
  const anioNum = parseInt(anio, 10) || new Date().getFullYear();
  const esCorporativo = !!(acceso && acceso.sinFiltro);

  const paramsConfig = await obtenerParametrosReportes();
  const diasFugaTemprana = paramsConfig.Dias_Fuga_Temprana || 60;

  // Construir condiciones SQL según filtros y permisos
  const condsComunes = [];
  const paramsQuery = [];

  if (regional && regional.trim() !== '') {
    condsComunes.push('TRIM(`Regional`) = ?');
    paramsQuery.push(regional.trim());
  }

  if (operacion && operacion.trim() !== '') {
    condsComunes.push('TRIM(`Operación`) = ?');
    paramsQuery.push(operacion.trim());
  } else if (!esCorporativo) {
    const ops = (acceso && acceso.operacionesFiltro) || [];
    if (ops.length === 0) {
      condsComunes.push('1 = 0');
    } else {
      const ph = ops.map(() => '?').join(',');
      condsComunes.push(`TRIM(\`Operación\`) IN (${ph})`);
      paramsQuery.push(...ops);
    }
  }

  const whereFiltroExtra = condsComunes.length > 0 ? ` AND ${condsComunes.join(' AND ')}` : '';

  // 1. Retiros agrupados por mes
  const [retRows] = await pool.execute(`
    SELECT
      MONTH(\`Fecha de Retiro\`) AS mes,
      COUNT(*) AS total_retiros,
      SUM(CASE WHEN DATEDIFF(\`Fecha de Retiro\`, \`Fecha de Ingreso\`) < ? THEN 1 ELSE 0 END) AS retiros_tempranos
    FROM \`Maestro_Vinculación\`
    WHERE \`Estado\` = 'Retirado'
      AND YEAR(\`Fecha de Retiro\`) = ?
      ${whereFiltroExtra}
    GROUP BY MONTH(\`Fecha de Retiro\`)
  `, [diasFugaTemprana, anioNum, ...paramsQuery]);

  // 2. Ingresos agrupados por mes
  const [ingRows] = await pool.execute(`
    SELECT
      MONTH(\`Fecha de Ingreso\`) AS mes,
      COUNT(*) AS total_ingresos
    FROM \`Maestro_Vinculación\`
    WHERE YEAR(\`Fecha de Ingreso\`) = ?
      ${whereFiltroExtra}
    GROUP BY MONTH(\`Fecha de Ingreso\`)
  `, [anioNum, ...paramsQuery]);

  // 3. Catálogo de Regionales y Operaciones disponibles según el acceso del usuario
  const sqlCatalogo = esCorporativo
    ? "SELECT DISTINCT OPERACIÓN as operacion, REGIONAL as regional FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY REGIONAL, OPERACIÓN"
    : (acceso.operacionesFiltro?.length
      ? `SELECT DISTINCT OPERACIÓN as operacion, REGIONAL as regional FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' AND OPERACIÓN IN (${acceso.operacionesFiltro.map(() => '?').join(',')}) ORDER BY REGIONAL, OPERACIÓN`
      : "SELECT DISTINCT OPERACIÓN as operacion, REGIONAL as regional FROM Maestro_Operaciones WHERE 1=0");

  const [catalogoRows] = await pool.execute(
    sqlCatalogo,
    esCorporativo ? [] : (acceso.operacionesFiltro || [])
  );

  // 4. Planta activa mes a mes (corte fin de cada mes o fecha actual para el mes en curso)
  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;

  const mapRet = {};
  retRows.forEach(r => {
    mapRet[r.mes] = {
      retiros: Number(r.total_retiros || 0),
      tempranos: Number(r.retiros_tempranos || 0)
    };
  });

  const mapIng = {};
  ingRows.forEach(i => {
    mapIng[i.mes] = Number(i.total_ingresos || 0);
  });

  const plantaPromises = [];
  for (let m = 1; m <= 12; m++) {
    const esFuturo = (anioNum > anioActual) || (anioNum === anioActual && m > mesActual);
    if (esFuturo) continue;

    const ultimoDia = new Date(anioNum, m, 0).getDate();
    const fechaCorteFin = `${anioNum}-${String(m).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
    const fechaCorteIni = `${anioNum}-${String(m).padStart(2, '0')}-01`;

    plantaPromises.push(
      pool.execute(`
        SELECT COUNT(*) AS planta
        FROM \`Maestro_Vinculación\`
        WHERE \`Fecha de Ingreso\` < ?
          AND (\`Fecha de Retiro\` IS NULL OR \`Fecha de Retiro\` >= ?)
          ${whereFiltroExtra}
      `, [fechaCorteIni, fechaCorteIni, ...paramsQuery]).then(([res]) => ({
        mes: m,
        planta: Number(res[0]?.planta || 0)
      }))
    );
  }

  const plantaResultados = await Promise.all(plantaPromises);
  const mapPlanta = {};
  plantaResultados.forEach(p => { mapPlanta[p.mes] = p.planta; });

  const NOMBRES_MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const meses = [];
  let totIngresos = 0;
  let totRetiros = 0;
  let totTempranos = 0;

  for (let m = 1; m <= 12; m++) {
    const esFuturo = (anioNum > anioActual) || (anioNum === anioActual && m > mesActual);
    const esMesEnCurso = (anioNum === anioActual && m === mesActual);

    if (esFuturo) {
      meses.push({
        numMes: m,
        mes: NOMBRES_MESES[m - 1],
        esFuturo: true,
        esMesEnCurso: false,
        planta: null,
        ingresos: null,
        retiros: null,
        retirosTempranos: null,
        pctRotacion: null,
        pctFuga: null,
        balance: null
      });
      continue;
    }

    const p = mapPlanta[m] || 0;
    const r = mapRet[m]?.retiros || 0;
    const t = mapRet[m]?.tempranos || 0;
    const i = mapIng[m] || 0;
    const bal = i - r;
    const rotPct = p > 0 ? Number(((r / p) * 100).toFixed(1)) : 0;
    const fugPct = r > 0 ? Number(((t / r) * 100).toFixed(1)) : 0;

    totIngresos += i;
    totRetiros += r;
    totTempranos += t;

    meses.push({
      numMes: m,
      mes: NOMBRES_MESES[m - 1],
      esFuturo: false,
      esMesEnCurso,
      planta: p,
      ingresos: i,
      retiros: r,
      retirosTempranos: t,
      pctRotacion: rotPct,
      pctFuga: fugPct,
      balance: bal
    });
  }

  return {
    anio: anioNum,
    regional: regional || '',
    operacion: operacion || '',
    catalogo: catalogoRows,
    meses,
    totalesAnio: {
      totalIngresos: totIngresos,
      totalRetiros: totRetiros,
      totalTempranos: totTempranos,
      balanceNeto: totIngresos - totRetiros,
      pctFugaMedia: totRetiros > 0 ? Number(((totTempranos / totRetiros) * 100).toFixed(1)) : 0
    }
  };
}

module.exports = {
  obtenerParametrosReportes,
  obtenerIndicadoresOperaciones,
  obtenerEvolucionMensual
};
