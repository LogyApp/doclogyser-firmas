/**
 * transferenciasService.js
 * Servicio de backend para la pestaña Transferencias del módulo de Contabilidad.
 * Consulta registros de Dynamic_Servicios con Forma De Pago = 2 (Transferencias).
 */

const pool = require('./db');

// Base URL para archivos históricos de AppSheet (tabla Servicios)
const URL_APPSHEET_SERVICIOS = 'https://www.appsheet.com/template/gettablefileurl?appName=Control-661901843&tableName=Servicios&fileName=';

/**
 * Resuelve la URL completa de una Foto Transferencia de Dynamic_Servicios.
 * Soporta: URLs completas (https://), rutas de Cloud Storage (gs://) y rutas relativas de AppSheet.
 */
function resolverUrlFotoTransferencia(ruta) {
  const r = String(ruta || '').trim();
  if (!r || /^unable to load/i.test(r) || /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(r)) {
    return '';
  }
  if (/^https?:\/\//i.test(r)) {
    return r;
  }
  if (/^gs:\/\//i.test(r)) {
    return 'https://storage.googleapis.com/' + r.slice(5);
  }
  return URL_APPSHEET_SERVICIOS + encodeURIComponent(r);
}

/**
 * Obtiene la quincena actual basada en la fecha del sistema.
 */
async function obtenerQuincenaActual() {
  const [rows] = await pool.execute(
    'SELECT Quincena FROM Maestro_Fechas WHERE DATE(Fecha) = CURDATE() LIMIT 1'
  );
  if (rows.length && rows[0].Quincena) {
    return rows[0].Quincena;
  }
  const d = new Date();
  const mes = d.getMonth() + 1;
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const q = d.getDate() > 15 ? 'Q2' : 'Q1';
  return `${mes}. ${meses[d.getMonth()]} ${q}`;
}

/**
 * Consulta y consolida las transferencias electrónicas de Dynamic_Servicios (Forma De Pago = 2).
 */
async function obtenerTransferencias(filtros = {}, acceso) {
  const { anio, quincena, dia, regional, operacion, fase, busqueda } = filtros;
  const anioFiltro = parseInt(anio, 10) || new Date().getFullYear();

  // 1. Determinar rango de fechas
  let fechaInicio = null;
  let fechaFin = null;

  if (dia && dia.trim() !== '') {
    fechaInicio = dia.trim();
    fechaFin = dia.trim();
  } else if (quincena && quincena.trim() !== '' && quincena !== 'TODAS') {
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

  // 2. Construir condiciones WHERE para Dynamic_Servicios y Dynamic_Recibos
  const whereClauses = ['ds.`Forma De Pago` = 2'];
  const queryParams = [];

  if (fechaInicio && fechaFin) {
    whereClauses.push('ds.`Hora Inicio` >= ? AND ds.`Hora Inicio` <= ?');
    queryParams.push(`${fechaInicio} 00:00:00`, `${fechaFin} 23:59:59`);
  }

  // Alcance por usuario / operación
  if (!acceso.sinFiltro) {
    if (!acceso.operacionesFiltro || !acceso.operacionesFiltro.length) {
      return {
        registros: [],
        kpis: {
          totalTransferencias: 0,
          totalConSoporte: 0,
          totalPendientes: 0,
          totalValor: 0,
          totalValorConSoporte: 0,
          totalValorPendiente: 0,
        },
      };
    }
    const ph = acceso.operacionesFiltro.map(() => '?').join(',');
    whereClauses.push(`dr.\`Operación\` IN (${ph})`);
    queryParams.push(...acceso.operacionesFiltro);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // 3. Consulta principal optimizada
  const query = `
    SELECT 
      IF(COALESCE(ds.\`Foto Transferencia\`,'') = '', 'Red', 'Green') AS fase,
      CAST(ds.\`Hora Inicio\` AS DATE) AS dia,
      ds.\`Fecha Transferencia\` AS fecha_transferencia,
      COALESCE(dr.\`Consecutivo Recibo\`, '') AS consecutivo_recibo,
      ROUND((
        (COALESCE(ds.Cantidad, 0) * COALESCE(ds.\`Valor Unitario\`, 0))
        + (CASE WHEN COALESCE(ds.\`Forma De Pago\`, 0) IN (1, 2, 3) THEN (COALESCE(ds.Cantidad, 0) * COALESCE(ds.\`Valor Unitario\`, 0)) * COALESCE(ci.iva_pct, 0) ELSE 0 END)
        - (CASE WHEN COALESCE(ds.\`Forma De Pago\`, 0) IN (1, 2, 3) AND COALESCE(dr.Retefuente, 'N') = 'V' THEN (COALESCE(ds.Cantidad, 0) * COALESCE(ds.\`Valor Unitario\`, 0)) * COALESCE(ci.retefuente_pct, 0) ELSE 0 END)
        - (CASE WHEN COALESCE(ds.\`Forma De Pago\`, 0) IN (1, 2, 3) AND COALESCE(dr.ReteIVA, 'N') = 'V' THEN ((COALESCE(ds.Cantidad, 0) * COALESCE(ds.\`Valor Unitario\`, 0)) * COALESCE(ci.iva_pct, 0)) * COALESCE(ci.reteiva_pct, 0) ELSE 0 END)
        - (CASE WHEN COALESCE(ds.\`Forma De Pago\`, 0) IN (1, 2, 3) AND COALESCE(dr.ReteICA, 'N') = 'V' THEN (COALESCE(ds.Cantidad, 0) * COALESCE(ds.\`Valor Unitario\`, 0)) * COALESCE(rica.Porcentaje, ci.reteica_pct, 0) ELSE 0 END)
      ), 2) AS total,
      COALESCE(mpl.Placa, '') AS placa,
      ds.Area AS area,
      COALESCE(dr.\`Cliente a Facturar\`, mc.\`Razón social\`, '') AS cliente,
      dr.Nit AS nit,
      COALESCE(dr.Telefono, ds.Telefono, '') AS telefono,
      dr.\`Operación\` AS operacion,
      COALESCE(mo.REGIONAL, 'N/A') AS regional,
      ds.Observaciones AS observaciones,
      ds.Usuario AS usuario,
      ds.\`Foto Transferencia\` AS foto_transferencia,
      ds.IdServicio AS idservicio,
      ds.IdRecibo AS idrecibo,
      COALESCE(cact.Actividad, ds.Actividad, '') AS actividad,
      ds.Cantidad AS cantidad,
      ds.\`Valor Unitario\` AS valor_unitario
    FROM Dynamic_Servicios ds
    LEFT JOIN Dynamic_Recibos dr ON dr.IdRecibo = ds.IdRecibo
    LEFT JOIN Maestro_Clientes mc ON dr.Nit = mc.Código
    LEFT JOIN Maestro_Placas mpl ON mpl.ID = ds.PL1
    LEFT JOIN Maestro_Operaciones mo ON mo.\`OPERACIÓN\` = dr.\`Operación\`
    LEFT JOIN Config_Actividad cact ON ds.Actividad = cact.ID
    JOIN (
      SELECT 
        MAX(CASE WHEN Concepto = 'IVA' THEN Porcentaje END) AS iva_pct,
        MAX(CASE WHEN Concepto = 'ReteFuente' THEN Porcentaje END) AS retefuente_pct,
        MAX(CASE WHEN Concepto = 'ReteIVA' THEN Porcentaje END) AS reteiva_pct,
        MAX(CASE WHEN Concepto = 'ReteICA' AND (Operación IS NULL OR Operación = '') THEN Porcentaje END) AS reteica_pct
      FROM Config_Impuestos
    ) ci ON 1 = 1
    LEFT JOIN (
      SELECT Operación, MAX(Porcentaje) AS Porcentaje
      FROM Config_Impuestos
      WHERE Concepto LIKE '%ReteICA%'
      GROUP BY Operación
    ) rica ON rica.Operación = dr.\`Operación\`
    ${whereSql}
    ORDER BY ds.\`Hora Inicio\` DESC
  `;

  const [rawRows] = await pool.query(query, queryParams);

  // 4. Mapear filas procesadas
  let registros = rawRows.map(r => {
    const diaStr = r.dia ? new Date(r.dia).toISOString().slice(0, 10) : '';
    const foto = r.foto_transferencia || '';
    const urlSoporte = resolverUrlFotoTransferencia(foto);
    const faseCalculada = urlSoporte ? 'Green' : 'Red';

    return {
      idServicio: r.idservicio,
      idRecibo: r.idrecibo,
      fase: faseCalculada,
      dia: diaStr,
      fechaTransferencia: r.fecha_transferencia || '',
      consecutivoRecibo: r.consecutivo_recibo || '-',
      total: Math.round(Number(r.total) || 0),
      placa: r.placa || '-',
      area: r.area != null ? String(r.area) : '-',
      cliente: r.cliente || '-',
      nit: r.nit ? String(r.nit) : '-',
      telefono: r.telefono || '-',
      operacion: r.operacion || '-',
      regional: r.regional || 'N/A',
      observaciones: r.observaciones || '',
      usuario: r.usuario || '-',
      fotoTransferencia: foto,
      urlSoporte,
      actividad: r.actividad || '-',
      cantidad: Number(r.cantidad) || 0,
      valorUnitario: Math.round(Number(r.valor_unitario) || 0),
    };
  });

  // 5. Filtros adicionales en memoria si se especifican
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
      (r.consecutivoRecibo && r.consecutivoRecibo.toLowerCase().includes(b)) ||
      (r.cliente && r.cliente.toLowerCase().includes(b)) ||
      (r.placa && r.placa.toLowerCase().includes(b)) ||
      (r.nit && r.nit.toLowerCase().includes(b)) ||
      (r.operacion && r.operacion.toLowerCase().includes(b)) ||
      (r.usuario && r.usuario.toLowerCase().includes(b)) ||
      (r.actividad && r.actividad.toLowerCase().includes(b)) ||
      (r.observaciones && r.observaciones.toLowerCase().includes(b)) ||
      (r.idServicio && r.idServicio.toLowerCase().includes(b))
    );
  }

  // 6. Calcular KPIs
  let totalValor = 0;
  let totalValorConSoporte = 0;
  let totalValorPendiente = 0;
  let totalConSoporte = 0;
  let totalPendientes = 0;

  registros.forEach(r => {
    totalValor += r.total;
    if (r.fase === 'Green') {
      totalConSoporte++;
      totalValorConSoporte += r.total;
    } else {
      totalPendientes++;
      totalValorPendiente += r.total;
    }
  });

  const kpis = {
    totalTransferencias: registros.length,
    totalConSoporte,
    totalPendientes,
    totalValor,
    totalValorConSoporte,
    totalValorPendiente,
  };

  return {
    registros,
    kpis,
  };
}

module.exports = {
  resolverUrlFotoTransferencia,
  obtenerQuincenaActual,
  obtenerTransferencias,
};
