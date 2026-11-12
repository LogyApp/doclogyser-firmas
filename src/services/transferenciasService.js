/**
 * transferenciasService.js
 * Servicio de backend para la pestaña Transferencias del módulo de Contabilidad.
 * Consulta registros de Dynamic_Servicios con Forma De Pago = 2 (Transferencias).
 */

const pool = require('./db');
const { subirFotoServicio } = require('./storage');
const { obtenerTipoDocumentoConfig } = require('./documentRegistry');

const TIPO_DOC_FOTO_TRANSFERENCIA = 92;
const CONCEPTO_VALIDAR = 'Roles que pueden validar transferencias';
const ROLES_VALIDAR_DEFECTO = 'Contabilidad, Sistema';

function normalizarTexto(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function ahoraBogota() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
}

// Las columnas de validación (migraciones/2026-11-11_transferencias_validacion.sql) pueden no existir
// todavía: mientras tanto la pestaña funciona igual, sin validar. Se prueba directamente sobre la tabla;
// cuando existen queda recordado, y si no, se vuelve a probar a los 30 segundos.
let columnasValidacion = { existe: false, revisado: 0, error: '' };
async function hayColumnasValidacion() {
  if (columnasValidacion.existe || Date.now() - columnasValidacion.revisado < 30 * 1000) return columnasValidacion.existe;
  try {
    await pool.query(
      'SELECT `Validado Transferencia`, `Usuario Valida Transferencia`, `Fecha Valida Transferencia` FROM Dynamic_Servicios LIMIT 0'
    );
    columnasValidacion = { existe: true, revisado: Date.now(), error: '' };
  } catch (e) {
    console.error('[transferencias] Columnas de validación no disponibles:', e.message);
    columnasValidacion = { existe: false, revisado: Date.now(), error: e.message };
  }
  return columnasValidacion.existe;
}

// Config_Parametros (contabilidad / Transferencias / Roles que pueden validar transferencias)
async function puedeValidarTransferencias(rol) {
  if (!rol) return false;
  let lista = ROLES_VALIDAR_DEFECTO;
  try {
    const [r] = await pool.execute(
      'SELECT Parametro FROM Config_Parametros WHERE Modulo = ? AND Seccion = ? AND Concepto = ? LIMIT 1',
      ['contabilidad', 'Transferencias', CONCEPTO_VALIDAR]
    );
    if (r.length) lista = r[0].Parametro == null ? '' : String(r[0].Parametro);
  } catch (e) {
    console.error('[transferencias] No se pudo leer Config_Parametros:', e.message);
  }
  const rolN = normalizarTexto(rol);
  return lista.split(',').some(x => normalizarTexto(x) === rolN);
}

function operacionPermitida(acceso, operacion) {
  if (acceso.sinFiltro) return true;
  const op = normalizarTexto(operacion);
  return (acceso.operacionesFiltro || []).some(o => normalizarTexto(o) === op);
}

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
  // Fecha de Bogotá (CURDATE() del servidor va en UTC) y Fecha = ? para usar el índice uq_fecha
  const hoyBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const [rows] = await pool.execute(
    'SELECT Quincena FROM Maestro_Fechas WHERE Fecha = ? LIMIT 1', [hoyBogota]
  );
  if (rows.length && rows[0].Quincena) {
    return rows[0].Quincena;
  }
  const d = new Date(`${hoyBogota}T12:00:00`);
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
  const conValidacion = await hayColumnasValidacion();
  const columnasVal = conValidacion
    ? "COALESCE(ds.`Validado Transferencia`, 'NO') AS validado, ds.`Usuario Valida Transferencia` AS usuario_valida, DATE_FORMAT(ds.`Fecha Valida Transferencia`, '%Y-%m-%d %H:%i') AS fecha_valida"
    : "'NO' AS validado, NULL AS usuario_valida, NULL AS fecha_valida";

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
      COALESCE(ca.AREA, ds.Area) AS area,
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
      ds.\`Valor Unitario\` AS valor_unitario,
      ${columnasVal}
    FROM Dynamic_Servicios ds
    LEFT JOIN Config_Area ca ON ca.ID = ds.Area
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
      validado: String(r.validado || 'NO').toUpperCase() === 'SI' ? 'SI' : 'NO',
      usuarioValida: r.usuario_valida || '',
      fechaValidacion: r.fecha_valida || '',
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
      (r.area && r.area.toLowerCase().includes(b)) ||
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
    validacionDisponible: conValidacion,
    motivoSinValidacion: conValidacion ? '' : 'Falta ejecutar la migración 2026-11-11_transferencias_validacion.sql (columnas de validación en Dynamic_Servicios).',
  };
}

// Servicio por transferencia con su operación (para revisar alcance y estado antes de cambiarlo)
async function obtenerServicioTransferencia(idServicio) {
  const conValidacion = await hayColumnasValidacion();
  const [rows] = await pool.execute(
    `SELECT ds.IdServicio, ds.\`Forma De Pago\` AS formaDePago, ds.\`Foto Transferencia\` AS foto,
            ${conValidacion ? "COALESCE(ds.`Validado Transferencia`, 'NO')" : "'NO'"} AS validado,
            dr.\`Operación\` AS operacion
     FROM Dynamic_Servicios ds
     LEFT JOIN Dynamic_Recibos dr ON dr.IdRecibo = ds.IdRecibo
     WHERE ds.IdServicio = ? LIMIT 1`,
    [idServicio]
  );
  return rows[0] || null;
}

/**
 * Valida o quita la validación del soporte de uno o varios servicios (validación masiva).
 * Solo cuenta los servicios por transferencia, con soporte y dentro del alcance del usuario.
 */
async function validarTransferencias(ids, validado, acceso) {
  if (!(await puedeValidarTransferencias(acceso.rol))) {
    throw new Error('No tiene permisos para validar transferencias.');
  }
  if (!(await hayColumnasValidacion())) {
    throw new Error('Falta ejecutar la migración 2026-11-11_transferencias_validacion.sql.');
  }
  const lista = [...new Set((Array.isArray(ids) ? ids : [ids]).map(x => String(x || '').trim()).filter(Boolean))];
  if (!lista.length) throw new Error('No se seleccionó ningún servicio.');
  if (lista.length > 2000) throw new Error('Máximo 2.000 servicios por vez.');
  const esValidado = validado === 'SI' || validado === true || validado === '1';

  const ph = lista.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT ds.IdServicio, ds.\`Foto Transferencia\` AS foto, dr.\`Operación\` AS operacion
     FROM Dynamic_Servicios ds
     LEFT JOIN Dynamic_Recibos dr ON dr.IdRecibo = ds.IdRecibo
     WHERE ds.\`Forma De Pago\` = 2 AND ds.IdServicio IN (${ph})`,
    lista
  );
  const aplicables = rows
    .filter(r => operacionPermitida(acceso, r.operacion) && resolverUrlFotoTransferencia(r.foto))
    .map(r => r.IdServicio);
  if (aplicables.length) {
    const ph2 = aplicables.map(() => '?').join(',');
    const usuario = acceso.usuarioId || acceso.usuarioNombre;
    if (esValidado) {
      await pool.query(
        `UPDATE Dynamic_Servicios SET \`Validado Transferencia\` = 'SI', \`Usuario Valida Transferencia\` = ?, \`Fecha Valida Transferencia\` = ?
         WHERE IdServicio IN (${ph2})`,
        [usuario, ahoraBogota(), ...aplicables]
      );
    } else {
      await pool.query(
        `UPDATE Dynamic_Servicios SET \`Validado Transferencia\` = 'NO', \`Usuario Valida Transferencia\` = NULL, \`Fecha Valida Transferencia\` = NULL
         WHERE IdServicio IN (${ph2})`,
        aplicables
      );
    }
  }
  return {
    ok: true,
    validado: esValidado ? 'SI' : 'NO',
    actualizados: aplicables,
    omitidos: lista.length - aplicables.length,
    usuarioValida: esValidado ? (acceso.usuarioId || acceso.usuarioNombre) : '',
    fechaValidacion: esValidado ? ahoraBogota().slice(0, 16) : '',
  };
}

/**
 * Sube o cambia la Foto Transferencia de un servicio desde Contabilidad (igual que en el formulario
 * del servicio: mismo nombre en el bucket y Fecha Transferencia). No se puede si ya está validada.
 */
async function guardarSoporteTransferencia(idServicio, file, fechaTransferencia, acceso) {
  if (!file) throw new Error('Adjunte la foto o el archivo de la transferencia.');
  const tipo = String(file.mimetype || '');
  if (!(tipo.startsWith('image/') || tipo === 'application/pdf')) throw new Error('El soporte debe ser una imagen o un PDF.');
  const s = await obtenerServicioTransferencia(idServicio);
  if (!s) throw new Error('Servicio no encontrado.');
  if (Number(s.formaDePago) !== 2) throw new Error('El servicio no es por Transferencia.');
  if (!operacionPermitida(acceso, s.operacion)) throw new Error('No tiene acceso a la operación de este servicio.');
  if (String(s.validado).toUpperCase() === 'SI') throw new Error('El soporte ya está validado por Contabilidad y no se puede cambiar.');

  const docConfig = await obtenerTipoDocumentoConfig(pool, TIPO_DOC_FOTO_TRANSFERENCIA);
  const prefijo = (docConfig && docConfig.Prefijo) || 'TRANSERV';
  const url = await subirFotoServicio(prefijo, idServicio, file.buffer, file.originalname, file.mimetype);
  const fecha = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(fechaTransferencia || ''))
    ? `${String(fechaTransferencia).slice(0, 10)} ${String(fechaTransferencia).slice(11, 16)}:00`
    : ahoraBogota();
  await pool.execute(
    'UPDATE Dynamic_Servicios SET `Foto Transferencia` = ?, `Fecha Transferencia` = ? WHERE IdServicio = ?',
    [url, fecha, idServicio]
  );
  return { ok: true, fotoTransferencia: url, fechaTransferencia: fecha };
}

module.exports = {
  resolverUrlFotoTransferencia,
  puedeValidarTransferencias,
  validarTransferencias,
  guardarSoporteTransferencia,
  transferenciaValidada: async (idServicio) => {
    const s = await obtenerServicioTransferencia(idServicio);
    return Boolean(s && String(s.validado).toUpperCase() === 'SI');
  },
  obtenerQuincenaActual,
  obtenerTransferencias,
};
