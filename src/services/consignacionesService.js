const pool = require('./db');
const crypto = require('crypto');
const { subirComprobanteConsignacion } = require('./storage');

// Cache de impuestos (5 minutos)
let cachedImpuestos = null;
let lastImpuestosFetch = 0;

async function obtenerImpuestosConfig() {
  const now = Date.now();
  if (cachedImpuestos && (now - lastImpuestosFetch < 300000)) {
    return cachedImpuestos;
  }
  const [rows] = await pool.query('SELECT Concepto, `Operación`, `Valor Base`, Porcentaje FROM Config_Impuestos');
  const iva = rows.find(r => r.Concepto === 'IVA')?.Porcentaje || 0.19;
  const reteFuente = rows.find(r => r.Concepto === 'ReteFuente')?.Porcentaje || 0.04;
  const reteIva = rows.find(r => r.Concepto === 'ReteIVA')?.Porcentaje || 0.15;
  const reteIcaMap = {};
  rows.filter(r => r.Concepto === 'ReteICA' && r.Operación).forEach(r => {
    const key = r.Operación.trim().toLowerCase();
    reteIcaMap[key] = Number(r.Porcentaje);
  });
  cachedImpuestos = { iva, reteFuente, reteIva, reteIcaMap };
  lastImpuestosFetch = now;
  return cachedImpuestos;
}

// Lista de bancos oficiales
async function obtenerBancos() {
  const [rows] = await pool.query('SELECT DISTINCT Banco FROM Config_Bancos WHERE Banco IS NOT NULL AND Banco != "" ORDER BY Banco ASC');
  return rows.map(r => r.Banco);
}

// Lista de años disponibles
async function obtenerAnios() {
  const [rows] = await pool.query('SELECT DISTINCT YEAR(Fecha) as anio FROM Maestro_Fechas WHERE Fecha >= "2024-01-01" ORDER BY anio DESC');
  return rows.map(r => String(r.anio));
}

// Lista de quincenas de un año
async function obtenerQuincenasPorAnio(anio) {
  const anioNum = parseInt(anio, 10) || new Date().getFullYear();
  const [rows] = await pool.execute(
    `SELECT Quincena, MIN(DATE(Fecha)) as fecha_inicio, MAX(DATE(Fecha)) as fecha_fin
     FROM Maestro_Fechas
     WHERE YEAR(Fecha) = ?
     GROUP BY Quincena
     ORDER BY MAX(Fecha) DESC`,
    [anioNum]
  );
  return rows.map(r => ({
    quincena: r.Quincena,
    fechaInicio: r.fecha_inicio ? new Date(r.fecha_inicio).toISOString().slice(0, 10) : '',
    fechaFin: r.fecha_fin ? new Date(r.fecha_fin).toISOString().slice(0, 10) : '',
  }));
}

// Quincena actual de hoy (fecha de Bogotá: CURDATE() del servidor va en UTC y desde las 7 p. m.
// ya sería el día siguiente, lo que cambiaba de quincena el 15 y el último día del mes)
async function obtenerQuincenaActual() {
  const hoyBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const [rows] = await pool.query('SELECT Quincena, DATE(Fecha) as fecha FROM Maestro_Fechas WHERE Fecha = ? LIMIT 1', [hoyBogota]);
  if (rows.length && rows[0].Quincena) {
    return rows[0].Quincena;
  }
  const hoy = new Date(`${hoyBogota}T12:00:00`);
  const mesNom = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][hoy.getMonth()];
  const qNum = hoy.getDate() > 15 ? 'Q2' : 'Q1';
  return `${hoy.getMonth() + 1}. ${mesNom} ${qNum}`;
}

// Roles autorizados en Config_Parametros
async function obtenerRolesPermitidos(concepto, defaultRoles = 'Sistema, Contabilidad') {
  try {
    const [rows] = await pool.execute(
      'SELECT Parametro FROM Config_Parametros WHERE Modulo = "contabilidad" AND Seccion = "Consignaciones" AND Concepto = ? LIMIT 1',
      [concepto]
    );
    if (rows.length && rows[0].Parametro) {
      return rows[0].Parametro.split(',').map(r => r.trim().toLowerCase());
    }
  } catch (err) {
    console.warn(`[consignacionesService] Error leyendo parametro ${concepto}:`, err.message);
  }
  return defaultRoles.split(',').map(r => r.trim().toLowerCase());
}

/**
 * Determina si el rol del usuario puede validar o modificar consignaciones validadas.
 */
async function puedeValidarConsignaciones(rol) {
  if (!rol) return false;
  const roles = await obtenerRolesPermitidos('Roles que pueden validar consignaciones', 'Contabilidad, Sistema');
  return roles.includes(rol.toLowerCase().trim());
}

/**
 * Consulta y consolida consignaciones para un periodo y alcance de usuario.
 */
async function obtenerConsignaciones(filtros = {}, acceso) {
  const { anio, quincena, dia, regional, operacion, fase, busqueda } = filtros;

  const anioFiltro = parseInt(anio, 10) || new Date().getFullYear();

  // 1. Determinar rango de fechas
  let fechaInicio = null;
  let fechaFin = null;

  if (dia && dia.trim() !== '') {
    fechaInicio = dia.trim();
    fechaFin = dia.trim();
  } else if (quincena && quincena.trim() !== '') {
    const [qRows] = await pool.execute(
      'SELECT MIN(DATE(Fecha)) as fi, MAX(DATE(Fecha)) as ff FROM Maestro_Fechas WHERE Quincena = ? AND YEAR(Fecha) = ?',
      [quincena.trim(), anioFiltro]
    );
    if (qRows.length && qRows[0].fi) {
      fechaInicio = new Date(qRows[0].fi).toISOString().slice(0, 10);
      fechaFin = new Date(qRows[0].ff).toISOString().slice(0, 10);
    }
  } else if (anio && anio.trim() !== '') {
    fechaInicio = `${anioFiltro}-01-01`;
    fechaFin = `${anioFiltro}-12-31`;
  } else {
    // Quincena actual por defecto
    const qActual = await obtenerQuincenaActual();
    const [qRows] = await pool.execute(
      'SELECT MIN(DATE(Fecha)) as fi, MAX(DATE(Fecha)) as ff FROM Maestro_Fechas WHERE Quincena = ? AND YEAR(Fecha) = ?',
      [qActual, anioFiltro]
    );
    if (qRows.length && qRows[0].fi) {
      fechaInicio = new Date(qRows[0].fi).toISOString().slice(0, 10);
      fechaFin = new Date(qRows[0].ff).toISOString().slice(0, 10);
    }
  }

  // 2. Filtro de alcance por operaciones permitidas
  const opConditions = [];
  const queryParams = [];

  if (fechaInicio && fechaFin) {
    opConditions.push('ds.`Hora Inicio` >= ? AND ds.`Hora Inicio` <= ?');
    queryParams.push(`${fechaInicio} 00:00:00`, `${fechaFin} 23:59:59`);
  }

  if (!acceso.sinFiltro) {
    if (!acceso.operacionesFiltro || !acceso.operacionesFiltro.length) {
      return { registros: [], totales: { totalEfectivo: 0, totalConsignado: 0, saldoPendiente: 0, totalRegistros: 0, pendientesCount: 0, consignadasCount: 0 } };
    }
    const ph = acceso.operacionesFiltro.map(() => '?').join(',');
    opConditions.push(`dr.\`Operación\` IN (${ph})`);
    queryParams.push(...acceso.operacionesFiltro);
  }

  const whereServicios = opConditions.length ? `WHERE ${opConditions.join(' AND ')}` : '';

  // 3. Query agrupada de servicios en efectivo (Forma De Pago = 1, Modalidad RECAUDO)
  const sqlServicios = `
    SELECT 
      DATE(ds.\`Hora Inicio\`) as dia,
      dr.\`Operación\` as operacion,
      COALESCE(mo.REGIONAL, 'N/A') as regional,
      COUNT(ds.IdServicio) as total_servicios,
      ROUND(SUM(
        (ds.Cantidad * ds.\`Valor Unitario\`) * (1 + ci.iva_pct)
        - (CASE WHEN COALESCE(dr.Retefuente, '') = 'V' THEN (ds.Cantidad * ds.\`Valor Unitario\`) * ci.retefuente_pct ELSE 0 END)
        - (CASE WHEN COALESCE(dr.ReteIVA, '') = 'V' THEN ((ds.Cantidad * ds.\`Valor Unitario\`) * ci.iva_pct) * ci.reteiva_pct ELSE 0 END)
        - (CASE WHEN COALESCE(dr.ReteICA, '') = 'V' THEN (ds.Cantidad * ds.\`Valor Unitario\`) * COALESCE(rica.Porcentaje, 0) ELSE 0 END)
      )) as total_efectivo
    FROM Dynamic_Servicios ds
    JOIN Dynamic_Recibos dr ON ds.IdRecibo = dr.IdRecibo
    LEFT JOIN Maestro_Operaciones mo ON dr.\`Operación\` = mo.\`OPERACIÓN\`
    -- Mismos porcentajes de Config_Impuestos que Transferencias y Formas de Pago (antes fijos en el código)
    JOIN (
      SELECT
        COALESCE(MAX(CASE WHEN Concepto = 'IVA' THEN Porcentaje END), 0.19) AS iva_pct,
        COALESCE(MAX(CASE WHEN Concepto = 'ReteFuente' THEN Porcentaje END), 0.04) AS retefuente_pct,
        COALESCE(MAX(CASE WHEN Concepto = 'ReteIVA' THEN Porcentaje END), 0.15) AS reteiva_pct
      FROM Config_Impuestos
    ) ci ON 1 = 1
    LEFT JOIN (
      SELECT \`Operación\`, MAX(Porcentaje) as Porcentaje 
      FROM Config_Impuestos 
      WHERE Concepto LIKE '%ReteICA%' AND \`Operación\` IS NOT NULL AND \`Operación\` != ''
      GROUP BY \`Operación\`
    ) rica ON rica.\`Operación\` = dr.\`Operación\`
    ${whereServicios}
      ${whereServicios ? 'AND' : 'WHERE'} ds.\`Forma De Pago\` = 1
      AND (dr.Modalidad = 'RECAUDO' OR dr.Modalidad IS NULL)
    GROUP BY DATE(ds.\`Hora Inicio\`), dr.\`Operación\`, mo.REGIONAL
    ORDER BY dia DESC, operacion ASC
  `;

  const [serviciosRows] = await pool.execute(sqlServicios, queryParams);

  // 4. Query de Maestro_Consignaciones para el mismo rango y operaciones
  const mcConditions = [];
  const mcParams = [];

  if (fechaInicio && fechaFin) {
    mcConditions.push('mc.`Día` >= ? AND mc.`Día` <= ?');
    mcParams.push(fechaInicio, fechaFin);
  }

  if (!acceso.sinFiltro && acceso.operacionesFiltro && acceso.operacionesFiltro.length) {
    const ph = acceso.operacionesFiltro.map(() => '?').join(',');
    mcConditions.push(`mc.\`Operación\` IN (${ph})`);
    mcParams.push(...acceso.operacionesFiltro);
  }

  const whereMC = mcConditions.length ? `WHERE ${mcConditions.join(' AND ')}` : '';
  const sqlMC = `
    SELECT 
      mc.Id,
      DATE(mc.\`Día\`) as dia,
      mc.\`Operación\` as operacion,
      mc.Banco,
      mc.Entidad,
      mc.Cuenta,
      mc.Comprobante,
      DATE(mc.\`Fecha consignación\`) as fecha_consignacion,
      mc.\`Valor Consignado\` as valor_consignado,
      mc.\`Foto Consignación\` as foto_consignacion,
      mc.\`Url Consignación\` as url_consignacion,
      mc.Observaciones,
      mc.Usuario,
      mc.Fase,
      mc.Quincena,
      mc.Validado,
      mc.Usuario_Valida,
      mc.Fecha_Validacion
    FROM Maestro_Consignaciones mc
    ${whereMC}
  `;

  const [mcRows] = await pool.execute(sqlMC, mcParams);

  // 5. Mapear Maestro_Consignaciones por clave 'YYYY-MM-DD_operacion'
  const mcMap = new Map();
  mcRows.forEach(row => {
    const dStr = row.dia ? new Date(row.dia).toISOString().slice(0, 10) : '';
    const key = `${dStr}_${row.operacion}`;
    mcMap.set(key, row);
  });

  // 6. Fusionar datos (servicios reales + consignaciones registradas)
  const combinedMap = new Map();

  serviciosRows.forEach(sr => {
    const dStr = sr.dia ? new Date(sr.dia).toISOString().slice(0, 10) : '';
    const key = `${dStr}_${sr.operacion}`;
    const mc = mcMap.get(key);

    const totalEfectivo = Math.round(Number(sr.total_efectivo) || 0);
    const totalServicios = Number(sr.total_servicios) || 0;
    const valorConsignado = mc ? Math.round(Number(mc.valor_consignado) || 0) : 0;
    const comprobante = mc ? (mc.Comprobante || '') : '';
    const fase = (comprobante && comprobante.trim() !== '') ? 'Green' : 'Red';
    const saldoPendiente = Math.max(0, totalEfectivo - valorConsignado);
    const diferencia = valorConsignado - totalEfectivo;

    combinedMap.set(key, {
      id: mc ? mc.Id : null,
      dia: dStr,
      operacion: sr.operacion,
      regional: sr.regional || 'N/A',
      totalEfectivo,
      totalServicios,
      banco: mc ? (mc.Banco || mc.Entidad || '') : '',
      entidad: mc ? (mc.Entidad || '') : '',
      cuenta: mc ? (mc.Cuenta ? String(mc.Cuenta) : '') : '',
      comprobante,
      fechaConsignacion: mc && mc.fecha_consignacion ? new Date(mc.fecha_consignacion).toISOString().slice(0, 10) : '',
      valorConsignado,
      fotoConsignacion: mc ? (mc.foto_consignacion || mc.url_consignacion || '') : '',
      observaciones: mc ? (mc.Observaciones || '') : '',
      usuario: mc ? (mc.Usuario || '') : '',
      fase,
      validado: mc ? (mc.Validado || 'NO') : 'NO',
      usuarioValida: mc ? (mc.Usuario_Valida || '') : '',
      fechaValidacion: mc && mc.Fecha_Validacion ? new Date(mc.Fecha_Validacion).toISOString().slice(0, 19).replace('T', ' ') : '',
      saldoPendiente,
      diferencia,
      tieneServicios: true,
    });
  });

  // Agregar registros que estén en Maestro_Consignaciones pero sin servicios en ese rango.
  // Se omiten las filas vacías que creaba el trigger de AppSheet (sin comprobante, valor, foto ni
  // observaciones): si el servicio en efectivo se borró o cambió de forma de pago, no hay nada que mostrar.
  for (const [key, mc] of mcMap.entries()) {
    const vacia = !String(mc.Comprobante || '').trim() && !Number(mc.valor_consignado) &&
      !mc.foto_consignacion && !mc.url_consignacion && !String(mc.Observaciones || '').trim();
    if (!combinedMap.has(key) && !vacia) {
      const dStr = mc.dia ? new Date(mc.dia).toISOString().slice(0, 10) : '';
      const comprobante = mc.Comprobante || '';
      const fase = (comprobante && comprobante.trim() !== '') ? 'Green' : 'Red';
      const valorConsignado = Math.round(Number(mc.valor_consignado) || 0);

      combinedMap.set(key, {
        id: mc.Id,
        dia: dStr,
        operacion: mc.operacion,
        regional: 'N/A',
        totalEfectivo: 0,
        totalServicios: 0,
        banco: mc.Banco || mc.Entidad || '',
        entidad: mc.Entidad || '',
        cuenta: mc.Cuenta ? String(mc.Cuenta) : '',
        comprobante,
        fechaConsignacion: mc.fecha_consignacion ? new Date(mc.fecha_consignacion).toISOString().slice(0, 10) : '',
        valorConsignado,
        fotoConsignacion: mc.foto_consignacion || mc.url_consignacion || '',
        observaciones: mc.Observaciones || '',
        usuario: mc.Usuario || '',
        fase,
        validado: mc.Validado || 'NO',
        usuarioValida: mc.Usuario_Valida || '',
        fechaValidacion: mc.Fecha_Validacion ? new Date(mc.Fecha_Validacion).toISOString().slice(0, 19).replace('T', ' ') : '',
        saldoPendiente: 0,
        diferencia: valorConsignado,
        tieneServicios: false,
      });
    }
  }

  let registros = Array.from(combinedMap.values());

  // 7. Filtros opcionales en memoria
  if (regional && regional.trim() !== '' && regional !== 'TODAS') {
    const regUpper = regional.trim().toUpperCase();
    registros = registros.filter(r => (r.regional || '').toUpperCase() === regUpper);
  }

  if (operacion && operacion.trim() !== '' && operacion !== 'TODAS') {
    const opNorm = operacion.trim().toLowerCase();
    registros = registros.filter(r => (r.operacion || '').toLowerCase() === opNorm);
  }

  if (fase && fase.trim() !== '' && fase !== 'TODAS') {
    const fNorm = fase.trim().toLowerCase();
    registros = registros.filter(r => r.fase.toLowerCase() === fNorm);
  }

  if (busqueda && busqueda.trim() !== '') {
    const b = busqueda.trim().toLowerCase();
    registros = registros.filter(r =>
      (r.operacion && r.operacion.toLowerCase().includes(b)) ||
      (r.comprobante && r.comprobante.toLowerCase().includes(b)) ||
      (r.banco && r.banco.toLowerCase().includes(b)) ||
      (r.cuenta && r.cuenta.toLowerCase().includes(b)) ||
      (r.observaciones && r.observaciones.toLowerCase().includes(b)) ||
      (r.usuario && r.usuario.toLowerCase().includes(b))
    );
  }

  // Ordenar por fecha DESC, operación ASC
  registros.sort((a, b) => {
    const diaA = a.dia || '';
    const diaB = b.dia || '';
    if (diaA !== diaB) return diaB.localeCompare(diaA);
    const opA = a.operacion || '';
    const opB = b.operacion || '';
    return opA.localeCompare(opB);
  });

  // 8. Calcular totales consolidados
  let totalEfectivo = 0;
  let totalConsignado = 0;
  let saldoPendiente = 0;
  let pendientesCount = 0;
  let consignadasCount = 0;

  registros.forEach(r => {
    totalEfectivo += r.totalEfectivo;
    totalConsignado += r.valorConsignado;
    saldoPendiente += r.saldoPendiente;
    if (r.fase === 'Green') consignadasCount++;
    else pendientesCount++;
  });

  return {
    registros,
    totales: {
      totalEfectivo,
      totalConsignado,
      saldoPendiente,
      totalRegistros: registros.length,
      pendientesCount,
      consignadasCount,
    },
  };
}

/**
 * Guarda o actualiza una consignación en Maestro_Consignaciones.
 */
async function guardarConsignacion(data, acceso, file = null) {
  const { dia, operacion, banco, entidad, cuenta, comprobante, fechaConsignacion, valorConsignado, observaciones } = data;

  if (!dia || !operacion) {
    throw new Error('Día y Operación son requeridos para registrar la consignación.');
  }

  // Verificar si la operación está dentro del alcance del usuario
  if (!acceso.sinFiltro && !acceso.operacionesFiltro.includes(operacion)) {
    throw new Error(`No tiene permisos para modificar la operación ${operacion}.`);
  }

  // Buscar registro existente
  const [existing] = await pool.execute(
    'SELECT * FROM Maestro_Consignaciones WHERE `Día` = ? AND `Operación` = ? LIMIT 1',
    [dia, operacion]
  );

  const filaExistente = existing.length ? existing[0] : null;

  const puedeValidar = await puedeValidarConsignaciones(acceso.rol);

  // Si ya estaba validada, solo los roles autorizados (Contabilidad o Sistema) pueden modificarla
  if (filaExistente && filaExistente.Validado === 'SI') {
    if (!puedeValidar) {
      throw new Error('Esta consignación ya se encuentra validada. Solo Contabilidad o Sistema pueden modificarla.');
    }
  }

  let fotoUrl = filaExistente ? (filaExistente['Foto Consignación'] || filaExistente['Url Consignación'] || null) : null;

  // Si subieron un archivo nuevo, subir a GCS
  if (file && file.buffer) {
    const cleanOp = operacion.replace(/[^a-zA-Z0-9]/g, '');
    const idSoporte = `${dia}_${cleanOp}`;
    fotoUrl = await subirComprobanteConsignacion(idSoporte, file.buffer, file.originalname, file.mimetype);
  }

  const vConsignadoNum = (valorConsignado !== undefined && valorConsignado !== null && valorConsignado !== '')
    ? Math.round(parseFloat(String(valorConsignado).replace(/[^0-9.-]+/g, '')))
    : null;
  const cuentaNum = cuenta ? String(cuenta).trim().replace(/[^0-9]/g, '') : null;
  const usuarioNombre = acceso.usuarioNombre || acceso.usuarioId;
  const bancoFinal = banco || entidad || null;
  const entidadFinal = entidad || banco || null;

  // Determinar estado de validación
  let validadoFinal = filaExistente ? (filaExistente.Validado || 'NO') : 'NO';
  let usuarioValidaFinal = filaExistente ? filaExistente.Usuario_Valida : null;
  let fechaValidaFinal = filaExistente ? filaExistente.Fecha_Validacion : null;

  if (puedeValidar && data.validado !== undefined) {
    const marcarSi = (data.validado === 'SI' || data.validado === true || data.validado === '1');
    if (marcarSi) {
      validadoFinal = 'SI';
      usuarioValidaFinal = usuarioNombre;
      fechaValidaFinal = new Date();
    } else {
      validadoFinal = 'NO';
      usuarioValidaFinal = null;
      fechaValidaFinal = null;
    }
  }

  if (filaExistente) {
    await pool.execute(
      `UPDATE Maestro_Consignaciones
       SET Banco = ?, Entidad = ?, Cuenta = ?, Comprobante = ?, \`Fecha consignación\` = ?,
           \`Valor Consignado\` = ?, \`Foto Consignación\` = ?, \`Url Consignación\` = ?,
           Observaciones = ?, Usuario = ?, Validado = ?, Usuario_Valida = ?, Fecha_Validacion = ?
       WHERE \`Día\` = ? AND \`Operación\` = ?`,
      [
        bancoFinal,
        entidadFinal,
        cuentaNum ? BigInt(cuentaNum) : null,
        comprobante ? String(comprobante).trim() : null,
        fechaConsignacion || dia,
        vConsignadoNum,
        fotoUrl,
        fotoUrl,
        observaciones ? String(observaciones).trim() : null,
        usuarioNombre,
        validadoFinal,
        usuarioValidaFinal,
        fechaValidaFinal,
        dia,
        operacion,
      ]
    );
    return { ok: true, id: filaExistente.Id, accion: 'actualizado', fotoUrl, validado: validadoFinal };
  } else {
    const nuevoId = crypto.randomBytes(4).toString('hex');
    await pool.execute(
      `INSERT INTO Maestro_Consignaciones (
        Id, \`Día\`, \`Operación\`, Banco, Entidad, Cuenta, Comprobante,
        \`Fecha consignación\`, \`Valor Consignado\`, \`Foto Consignación\`, \`Url Consignación\`,
        Observaciones, Usuario, Validado, Usuario_Valida, Fecha_Validacion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nuevoId,
        dia,
        operacion,
        bancoFinal,
        entidadFinal,
        cuentaNum ? BigInt(cuentaNum) : null,
        comprobante ? String(comprobante).trim() : null,
        fechaConsignacion || dia,
        vConsignadoNum,
        fotoUrl,
        fotoUrl,
        observaciones ? String(observaciones).trim() : null,
        usuarioNombre,
        validadoFinal,
        usuarioValidaFinal,
        fechaValidaFinal,
      ]
    );
    return { ok: true, id: nuevoId, accion: 'creado', fotoUrl, validado: validadoFinal };
  }
}

/**
 * Consulta los servicios individuales en efectivo de un día y operación.
 */
async function obtenerServiciosAsociados(dia, operacion, acceso) {
  if (!dia || !operacion) return [];

  // Validar alcance
  if (!acceso.sinFiltro && !acceso.operacionesFiltro.includes(operacion)) {
    throw new Error(`No tiene permisos para ver servicios de ${operacion}.`);
  }

  const sql = `
    SELECT 
      ds.IdServicio as idServicio,
      ds.IdRecibo as idRecibo,
      dr.\`Consecutivo Recibo\` as consecutivoRecibo,
      DATE_FORMAT(ds.\`Hora Inicio\`, '%H:%i') as horaInicio,
      dr.\`Cliente a Facturar\` as cliente,
      dr.Nit as nit,
      mc.\`Razón social\` as razonSocial,
      COALESCE(ds.\`Proveedor Texto\`, ds.Proveedor) as proveedor,
      ds.Vehiculo as vehiculo,
      COALESCE(mp.Placa, ds.PL1, '-') as placa,
      cact.Actividad as actividad,
      ds.Cantidad as cantidad,
      ds.\`Valor Unitario\` as valorUnitario,
      ROUND(ds.Cantidad * ds.\`Valor Unitario\`) as valorBase,
      ROUND((ds.Cantidad * ds.\`Valor Unitario\`) * ci.iva_pct) as iva,
      ROUND(CASE WHEN COALESCE(dr.Retefuente, '') = 'V' THEN (ds.Cantidad * ds.\`Valor Unitario\`) * ci.retefuente_pct ELSE 0 END) as retefuente,
      ROUND(CASE WHEN COALESCE(dr.ReteIVA, '') = 'V' THEN ((ds.Cantidad * ds.\`Valor Unitario\`) * ci.iva_pct) * ci.reteiva_pct ELSE 0 END) as reteiva,
      ROUND(CASE WHEN COALESCE(dr.ReteICA, '') = 'V' THEN (ds.Cantidad * ds.\`Valor Unitario\`) * COALESCE(rica.Porcentaje, 0) ELSE 0 END) as reteica,
      ROUND(
        (ds.Cantidad * ds.\`Valor Unitario\`) * (1 + ci.iva_pct)
        - (CASE WHEN COALESCE(dr.Retefuente, '') = 'V' THEN (ds.Cantidad * ds.\`Valor Unitario\`) * ci.retefuente_pct ELSE 0 END)
        - (CASE WHEN COALESCE(dr.ReteIVA, '') = 'V' THEN ((ds.Cantidad * ds.\`Valor Unitario\`) * ci.iva_pct) * ci.reteiva_pct ELSE 0 END)
        - (CASE WHEN COALESCE(dr.ReteICA, '') = 'V' THEN (ds.Cantidad * ds.\`Valor Unitario\`) * COALESCE(rica.Porcentaje, 0) ELSE 0 END)
      ) as totalPago,
      ds.Estado as estado,
      ds.Usuario as usuario
    FROM Dynamic_Servicios ds
    JOIN Dynamic_Recibos dr ON ds.IdRecibo = dr.IdRecibo
    LEFT JOIN Maestro_Clientes mc ON dr.Nit = mc.Código
    LEFT JOIN Maestro_Placas mp ON ds.PL1 = mp.ID
    LEFT JOIN Config_Actividad cact ON ds.Actividad = cact.ID
    JOIN (
      SELECT
        COALESCE(MAX(CASE WHEN Concepto = 'IVA' THEN Porcentaje END), 0.19) AS iva_pct,
        COALESCE(MAX(CASE WHEN Concepto = 'ReteFuente' THEN Porcentaje END), 0.04) AS retefuente_pct,
        COALESCE(MAX(CASE WHEN Concepto = 'ReteIVA' THEN Porcentaje END), 0.15) AS reteiva_pct
      FROM Config_Impuestos
    ) ci ON 1 = 1
    LEFT JOIN (
      SELECT \`Operación\`, MAX(Porcentaje) as Porcentaje 
      FROM Config_Impuestos 
      WHERE Concepto LIKE '%ReteICA%' AND \`Operación\` IS NOT NULL AND \`Operación\` != ''
      GROUP BY \`Operación\`
    ) rica ON rica.\`Operación\` = dr.\`Operación\`
    WHERE ds.\`Forma De Pago\` = 1
      AND (dr.Modalidad = 'RECAUDO' OR dr.Modalidad IS NULL)
      -- Rango en vez de DATE(...) = ? para que use el índice de Hora Inicio (unas 18 veces más rápido)
      AND ds.\`Hora Inicio\` >= ? AND ds.\`Hora Inicio\` < DATE_ADD(?, INTERVAL 1 DAY)
      AND dr.\`Operación\` = ?
    ORDER BY ds.\`Hora Inicio\` ASC
  `;

  const [rows] = await pool.execute(sql, [dia, dia, operacion]);
  return rows;
}

/**
 * Valida o desvalida una consignación (Acción rápida desde visor o interfaz).
 */
async function alternarValidacion(dia, operacion, nuevoEstado, acceso) {
  const puedeVal = await puedeValidarConsignaciones(acceso.rol);
  if (!puedeVal) {
    throw new Error('No tiene permisos para validar o desvalidar consignaciones.');
  }
  if (!dia || !operacion) {
    throw new Error('Día y Operación requeridos.');
  }
  const [rows] = await pool.execute(
    'SELECT Id, Fase, Comprobante, Validado FROM Maestro_Consignaciones WHERE `Día` = ? AND `Operación` = ? LIMIT 1',
    [dia, operacion]
  );
  if (!rows.length || !rows[0].Comprobante) {
    throw new Error('No se puede validar una consignación que no tiene comprobante registrado.');
  }
  const usuarioNombre = acceso.usuarioNombre || acceso.usuarioId;
  const esValidado = (nuevoEstado === 'SI' || nuevoEstado === true || nuevoEstado === '1');
  if (esValidado) {
    await pool.execute(
      'UPDATE Maestro_Consignaciones SET Validado = ?, Usuario_Valida = ?, Fecha_Validacion = NOW() WHERE `Día` = ? AND `Operación` = ?',
      ['SI', usuarioNombre, dia, operacion]
    );
  } else {
    await pool.execute(
      'UPDATE Maestro_Consignaciones SET Validado = ?, Usuario_Valida = NULL, Fecha_Validacion = NULL WHERE `Día` = ? AND `Operación` = ?',
      ['NO', dia, operacion]
    );
  }
  return { ok: true, validado: esValidado ? 'SI' : 'NO', usuarioValida: esValidado ? usuarioNombre : null };
}

/**
 * Determina si el rol del usuario puede eliminar la foto/soporte de una consignación.
 */
async function puedeEliminarFotoConsignacion(rol) {
  if (!rol) return false;
  const roles = await obtenerRolesPermitidos('Roles que pueden eliminar foto de consignación', 'Contabilidad, Sistema');
  return roles.includes(rol.toLowerCase().trim());
}

/**
 * Elimina la foto o soporte bancario de una consignación en Maestro_Consignaciones.
 */
async function eliminarFotoConsignacion(dia, operacion, acceso) {
  const puedeEliminar = await puedeEliminarFotoConsignacion(acceso.rol);
  if (!puedeEliminar) {
    throw new Error('No tiene permisos para eliminar el soporte de consignación.');
  }
  if (!dia || !operacion) {
    throw new Error('Día y Operación requeridos.');
  }

  await pool.execute(
    'UPDATE Maestro_Consignaciones SET `Foto Consignación` = NULL, `Url Consignación` = NULL WHERE `Día` = ? AND `Operación` = ?',
    [dia, operacion]
  );

  return { ok: true };
}

module.exports = {
  obtenerImpuestosConfig,
  obtenerBancos,
  obtenerAnios,
  obtenerQuincenasPorAnio,
  obtenerQuincenaActual,
  obtenerConsignaciones,
  obtenerServiciosAsociados,
  guardarConsignacion,
  alternarValidacion,
  puedeValidarConsignaciones,
  puedeEliminarFotoConsignacion,
  eliminarFotoConsignacion,
};
