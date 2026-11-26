const pool = require('./db');
const { obtenerCondicionesRetiro, docTerminacionRequerido } = require('./configRetiro');
const configDocRetiros = require('./configClouddocsDocRetiros');

// ── Cloud Docs › Doc. Retiros › Faltantes por trabajador ─────────────────────
// Para cada trabajador retirado en el rango de fechas, calcula qué documentos de
// retiro le faltan en su vinculación (Identificación + Fecha de Ingreso).
//
// Documentos exigidos:
//   1. Legalización: la misma regla de configRetiro.obtenerPendientesLegalizacion
//      (terminación de contrato o carta de renuncia según el motivo, Certificado laboral
//      de retiro y Examen de egreso). El "Documento de Retiro" (Id 47) cubre la legalización.
//      Motivos con TerminaProceso o retiros con fecha de ingreso = fecha de retiro no exigen nada.
//   2. Según Config_condicion_retiros: TieneED → 56, TieneAR → 54, TienePZ → 59.
//   3. Config_Parametros CloudDocs / DocRetiros "Documentos adicionales obligatorios en Faltantes".
// Un documento en ERROR o DESACTUALIZADO cuenta como faltante.

const ID_DOC_RETIRO_LEGADO = '47';
const ID_CERT_LABORAL = '57';
const ID_EXAMEN_EGRESO = '58';
const POR_CONDICION = { TieneED: '56', TieneAR: '54', TienePZ: '59' };

function fechaTxt(f) {
  if (!f) return '';
  if (f instanceof Date) {
    const y = f.getFullYear(), m = String(f.getMonth() + 1).padStart(2, '0'), d = String(f.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(f).slice(0, 10);
}

async function faltantesPorTrabajador({ acceso, desde, hasta, regional, operacion, buscar }) {
  const dias = await configDocRetiros.diasFaltantes();
  const hoy = new Date();
  const inicio = new Date(hoy.getTime() - dias * 86400000);
  const fDesde = /^\d{4}-\d{2}-\d{2}$/.test(desde || '') ? desde : fechaTxt(inicio);
  const fHasta = /^\d{4}-\d{2}-\d{2}$/.test(hasta || '') ? hasta : fechaTxt(hoy);

  const conds = ["v.Estado = 'Retirado'", 'v.`Fecha de Retiro` BETWEEN ? AND ?'];
  const params = [fDesde, fHasta];
  if (!acceso.sinFiltro) {
    if (!acceso.operacionesFiltro.length) return { desde: fDesde, hasta: fHasta, filas: [] };
    conds.push(`v.\`Operación\` IN (${acceso.operacionesFiltro.map(() => '?').join(',')})`);
    params.push(...acceso.operacionesFiltro);
  }
  if (regional) { conds.push('v.Regional = ?'); params.push(regional); }
  if (operacion) { conds.push('v.`Operación` = ?'); params.push(operacion); }
  if (buscar) {
    conds.push('(v.Trabajador COLLATE utf8mb4_general_ci LIKE ? OR CAST(v.`Identificación` AS CHAR) LIKE ?)');
    params.push(`%${buscar}%`, `%${buscar}%`);
  }

  const [vincs] = await pool.execute(
    `SELECT v.\`Identificación\` AS identificacion, v.Trabajador AS trabajador, v.Cargo AS cargo,
            v.\`Operación\` AS operacion, v.Regional AS regional,
            DATE_FORMAT(v.\`Fecha de Ingreso\`, '%Y-%m-%d') AS fechaIngreso,
            DATE_FORMAT(v.\`Fecha de Retiro\`, '%Y-%m-%d') AS fechaRetiro,
            v.\`Motivo del Retiro\` AS motivo, v.\`Archivo Vinculación\` AS tipoRenuncia
     FROM Maestro_Vinculación v
     WHERE ${conds.join(' AND ')}
     ORDER BY v.\`Fecha de Retiro\` DESC, v.Trabajador
     LIMIT 5000`,
    params
  );
  if (!vincs.length) return { desde: fDesde, hasta: fHasta, filas: [] };

  const [condiciones, adicionales, [tipos]] = await Promise.all([
    obtenerCondicionesRetiro(),
    configDocRetiros.documentosAdicionales(),
    pool.execute('SELECT Id, Documento FROM Config_Doc_Trabajador')
  ]);
  const nombreDoc = {};
  tipos.forEach(t => { nombreDoc[String(t.Id)] = t.Documento; });

  // Documentos vigentes (no ERROR ni DESACTUALIZADO) de esas vinculaciones, en bloques
  const vigentes = new Map(); // "ident|fechaIngreso" → Set(TipoDocumento)
  const ids = [...new Set(vincs.map(v => String(v.identificacion)))];
  for (let i = 0; i < ids.length; i += 500) {
    const bloque = ids.slice(i, i + 500);
    const [docs] = await pool.execute(
      `SELECT \`Identificación\` AS identificacion, DATE_FORMAT(Fecha_Ingreso, '%Y-%m-%d') AS fechaIngreso, TipoDocumento
       FROM Maestro_docTrabajador
       WHERE \`Identificación\` IN (${bloque.map(() => '?').join(',')})
         AND COALESCE(\`Validación\`, '') NOT IN ('ERROR', 'DESACTUALIZADO')`,
      bloque
    );
    docs.forEach(d => {
      const k = `${d.identificacion}|${d.fechaIngreso}`;
      if (!vigentes.has(k)) vigentes.set(k, new Set());
      vigentes.get(k).add(String(d.TipoDocumento));
    });
  }

  const filas = vincs.map(v => {
    const cond = condiciones[v.motivo] || null;
    const tiene = vigentes.get(`${v.identificacion}|${v.fechaIngreso}`) || new Set();
    const requeridos = [];
    const sinRequisitos = !!(cond && cond.TerminaProceso) || (v.fechaIngreso && v.fechaIngreso === v.fechaRetiro);

    if (!sinRequisitos) {
      if (!tiene.has(ID_DOC_RETIRO_LEGADO)) {
        const term = v.motivo ? docTerminacionRequerido(v.motivo, cond, v.tipoRenuncia) : null;
        if (term) requeridos.push(String(term));
        requeridos.push(ID_CERT_LABORAL, ID_EXAMEN_EGRESO);
      }
      if (cond) {
        Object.entries(POR_CONDICION).forEach(([flag, id]) => { if (cond[flag]) requeridos.push(id); });
      }
      requeridos.push(...adicionales);
    }

    const unicos = [...new Set(requeridos)];
    const faltan = unicos.filter(id => !tiene.has(id));
    return {
      ...v,
      tipoRenuncia: undefined,
      requeridos: unicos.length,
      cargados: unicos.length - faltan.length,
      faltantes: faltan.map(id => nombreDoc[id] || `Documento ${id}`),
      sinMotivo: !String(v.motivo || '').trim()
    };
  });

  return { desde: fDesde, hasta: fHasta, filas };
}

module.exports = { faltantesPorTrabajador };
