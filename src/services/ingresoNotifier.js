const pool = require('./db');
const { notificarIngreso } = require('./email');

const MARCA = '[NI]';

const CARGOS_NOTIFICAR = [
  'COORDINADOR LOGISTICO',
  'AUXILIAR ADMINISTRATIVO DE OPERACIÓN',
  'ANALISTA DE SST',
  'AUXILIAR ADMINISTRATIVO REGIONAL',
  'AUXILIAR SST',
  'ANALISTA DE NOMINA',
  'ASISTENTE CONTABLE',
  'COORDINADOR REGIONAL',
  'ANALISTA DE FACTURACIÓN',
  'ANALISTA DE TESORERIA',
  'ANALISTA Y CONTROL DE DATOS',
  'AUDITORA DE RECAUDO',
  'AUXILIAR DE ARCHIVO',
  'AUXILIAR FACTURACION',
  'CONTADOR',
  'COORDINADOR DE CALIDAD',
  'COORDINADOR DE NOMINA',
  'COORDINADOR DE SELECCIÓN',
  'DIRECTOR DE CALIDAD',
  'DIRECTOR SST',
  'DIRECTOR TALENTO HUMANO',
  'JEFE DE CUENTAS',
  'JEFE DE FACTURACION',
  'JEFE DE TECNOLOGIA',
  'RECEPCIONISTA',
  'SUBGERENTE DE OPERACIONES',
];

// Genera los placeholders (?,?,?...) para el IN de la query
const PLACEHOLDERS = CARGOS_NOTIFICAR.map(() => '?').join(',');

async function obtenerIngresosPendientes() {
  const [rows] = await pool.execute(
    `SELECT \`Id Vinculación\`            AS id,
            \`Identificación\`            AS identificacion,
            Trabajador,
            Cargo,
            \`Operación\`                 AS operacion,
            \`Fecha de Ingreso\`          AS fechaIngreso,
            \`Observaciones Vinculación\` AS observaciones
     FROM \`Maestro_Vinculación\`
     WHERE UPPER(TRIM(Cargo)) IN (${PLACEHOLDERS})
       AND (
             \`Observaciones Vinculación\` IS NULL
          OR \`Observaciones Vinculación\` NOT LIKE ?
       )`,
    [...CARGOS_NOTIFICAR, `%${MARCA}%`]
  );
  return rows;
}

async function marcarNotificado(idVinculacion) {
  await pool.execute(
    `UPDATE \`Maestro_Vinculación\`
     SET \`Observaciones Vinculación\` =
           LEFT(CONCAT(COALESCE(\`Observaciones Vinculación\`, ''), ?), 200)
     WHERE \`Id Vinculación\` = ?`,
    [` ${MARCA}`, idVinculacion]
  );
}

async function verificarIngresos() {
  try {
    const ingresos = await obtenerIngresosPendientes();

    if (ingresos.length > 0) {
      console.log(`[ingresoNotifier] ${ingresos.length} ingreso(s) pendiente(s) de notificar`);
    }

    for (const r of ingresos) {
      try {
        console.log(`[ingresoNotifier] Notificando ingreso id=${r.id} trabajador="${r.Trabajador}"`);

        await notificarIngreso({
          trabajador:    r.Trabajador,
          identificacion: r.identificacion,
          cargo:         r.Cargo,
          operacion:     r.operacion,
          fechaIngreso:  r.fechaIngreso,
        });

        await marcarNotificado(r.id);
        console.log(`[ingresoNotifier] OK — notificado y marcado id=${r.id}`);
      } catch (err) {
        // Sin marca → reintentará en el siguiente ciclo
        console.error(`[ingresoNotifier] ERROR id=${r.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[ingresoNotifier] Error general:', err.message);
  }
}

module.exports = { verificarIngresos };
