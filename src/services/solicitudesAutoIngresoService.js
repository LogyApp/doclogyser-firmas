const { randomUUID } = require('crypto');
const pool = require('./db');

function norm(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Obtiene los registros de Maestro_Vinculación que no han sido procesados para solicitudes automáticas.
 */
async function obtenerIngresosPendientes() {
  const [rows] = await pool.execute(
    `SELECT mv.\`Id Vinculación\`            AS id,
            mv.\`Identificación\`            AS identificacion,
            mv.Trabajador,
            mv.Cargo,
            mv.Regional,
            mv.\`Operación\`                 AS operacion,
            mv.\`Fecha de Ingreso\`          AS fechaIngreso,
            mv.\`Observaciones Vinculación\` AS observaciones
     FROM \`Maestro_Vinculación\` mv
     LEFT JOIN \`Dynamic_AutoIngreso_Procesados\` p ON p.IdVinculacion = mv.\`Id Vinculación\`
     WHERE p.IdVinculacion IS NULL
       -- Excluir trabajadores retirados o con marcas de notificación de retiro
       AND (mv.Estado IS NULL OR mv.Estado != 'Retirado')
       AND mv.\`Fecha de Retiro\` IS NULL
       AND (
            mv.\`Observaciones Vinculación\` IS NULL
         OR (
             mv.\`Observaciones Vinculación\` NOT LIKE '%[RN]%'
         AND mv.\`Observaciones Vinculación\` NOT LIKE '%Retiro notificado%'
         AND mv.\`Observaciones Vinculación\` NOT LIKE '%[NOTIF_%'
         )
       )
       -- Condición clave: Solo procesar registros que ya tengan Cargo asignado (no nulo ni vacío).
       -- Si el registro se crea inicialmente sin Cargo, no se procesa; se procesará automáticamente cuando se edite y se le asigne un Cargo.
       AND mv.Cargo IS NOT NULL
       AND TRIM(mv.Cargo) != ''
       -- Condición temporal: Solo procesar ingresos de Regional ANTIOQUIA
       AND UPPER(TRIM(COALESCE(mv.Regional, ''))) = 'ANTIOQUIA'
     ORDER BY mv.\`Fecha de Ingreso\` DESC`
  );
  return rows;
}

/**
 * Procesa todos los nuevos ingresos de Maestro_Vinculación:
 * Genera dos solicitudes en estado BORRADOR (DOTACIÓN y EPP) con sus respectivos ítems
 * de acuerdo a las reglas de Maestro_Dotacion_Cargos y Dynamic_Articulos.
 */
async function verificarSolicitudesNuevosIngresos() {
  try {
    const ingresos = await obtenerIngresosPendientes();

    if (!ingresos || ingresos.length === 0) {
      return { procesados: 0, solicitudesCreadas: 0 };
    }

    console.log(`[solicitudesAutoIngreso] ${ingresos.length} nuevo(s) ingreso(s) pendiente(s) de generar solicitudes`);

    // 1. Cargar reglas de dotación y catálogo de artículos
    const [rules] = await pool.execute(
      'SELECT Operacion, Cargo, Categoria, Clasificacion, Elemento FROM Maestro_Dotacion_Cargos'
    );

    const [articles] = await pool.execute(
      'SELECT Id, Articulo, Categoria, ClaseArticulo, Elemento, Talla, Referencia, Costo FROM Dynamic_Articulos'
    );

    let procesadosCount = 0;
    let solicitudesCreadasCount = 0;

    for (const vin of ingresos) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const identificacion = String(vin.identificacion || '').trim();
        const operacion = vin.operacion || '';
        const regional = vin.Regional || '';
        const cargo = String(vin.Cargo || '').trim();

        // Validar que tenga Cargo asignado
        if (!cargo) {
          conn.release();
          continue;
        }

        // Condición temporal: Solo procesar registros de Regional Antioquia
        if (norm(regional) !== 'ANTIOQUIA') {
          conn.release();
          continue;
        }

        // 2. Obtener tallas del colaborador desde Maestro_Segmentación
        let seg = {};
        if (identificacion) {
          const [segRows] = await conn.execute(
            'SELECT Camiseta, Numero, Pantalon, Botas FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1',
            [identificacion]
          );
          if (segRows.length > 0) {
            seg = segRows[0];
          }
        }

        // =============================================================
        // REGISTRO 1: Dynamic_Solicitudes (DOTACIÓN)
        // =============================================================
        const itemsDotacion = [];

        // Fila 1: BUZO (Cant: 2)
        const buzoRule = rules.find(r =>
          norm(r.Operacion) === norm(operacion) &&
          norm(r.Cargo) === norm(cargo) &&
          norm(r.Clasificacion) === 'BUZO'
        );
        if (buzoRule) {
          const tallaCamiseta = seg.Camiseta || '';
          const matchBuzo = articles.find(a =>
            norm(a.Elemento) === norm(buzoRule.Elemento) &&
            norm(a.Talla) === norm(tallaCamiseta) &&
            (!a.Referencia || String(a.Referencia).trim() === '')
          );
          if (matchBuzo) {
            itemsDotacion.push({
              idArticulo: matchBuzo.Id,
              cantidad: 2,
              nota: 'Dotación inicial'
            });
          }
        }

        // Fila 2: PANTALON (Cant: 2)
        const pantRule = rules.find(r =>
          norm(r.Operacion) === norm(operacion) &&
          norm(r.Cargo) === norm(cargo) &&
          norm(r.Clasificacion) === 'PANTALON'
        );
        if (pantRule) {
          const tallaPantalon = seg.Pantalon || seg.Camiseta || '';
          const matchPant = articles.find(a =>
            norm(a.Elemento) === norm(pantRule.Elemento) &&
            norm(a.Talla) === norm(tallaPantalon) &&
            (!a.Referencia || String(a.Referencia).trim() === '')
          );
          if (matchPant) {
            itemsDotacion.push({
              idArticulo: matchPant.Id,
              cantidad: 2,
              nota: 'Dotación inicial'
            });
          }
        }

        // Fila 3: BOTAS (Cant: 1)
        const botasRule = rules.find(r =>
          norm(r.Operacion) === norm(operacion) &&
          norm(r.Cargo) === norm(cargo) &&
          norm(r.Clasificacion) === 'BOTAS'
        );
        if (botasRule) {
          const tallaBotas = seg.Botas || seg.Camiseta || '';
          const matchBotas = articles.find(a =>
            norm(a.Elemento) === norm(botasRule.Elemento) &&
            norm(a.Talla) === norm(tallaBotas) &&
            (!a.Referencia || String(a.Referencia).trim() === '')
          );
          if (matchBotas) {
            itemsDotacion.push({
              idArticulo: matchBotas.Id,
              cantidad: 1,
              nota: 'Dotación inicial'
            });
          }
        }

        // Insertar solicitud de DOTACIÓN
        const idSolDot = randomUUID();
        const obsDotacion = `AUTOMATICO: Dotación Inicial ${String(vin.Trabajador || '').trim()}`.trim();
        await conn.execute(
          `INSERT INTO Dynamic_Solicitudes
           (IdSolicitud, FechaSolicitud, Estado, \`Operación\`, Regional, Prioridad, Categoria,
            \`Justificación\`, Imagen_Cotización, Monto_Estimado, AprobadoPor, FechaAprobacion,
            foto_guia, Observaciones, Usuario, Fecha_Actualización, usuario_actualiza, Aclaraciones)
           VALUES (?, NOW(), 'BORRADOR', ?, ?, 'BAJA', 'DOTACIÓN',
            ?, NULL, NULL, NULL, NULL,
            NULL, ?, 'Sistema', NULL, NULL, NULL)`,
          [idSolDot, operacion, regional, identificacion, obsDotacion]
        );
        solicitudesCreadasCount++;

        // Insertar items de DOTACIÓN correspondientes
        for (const it of itemsDotacion) {
          const idElem = randomUUID().replace(/-/g, '');
          await conn.execute(
            `INSERT INTO Dynamic_Solicitudes_Items
             (IdElemento, IdSolicitud, IdArticulo, Cantidad, CantidadDespachada, IdKardex, Nota, Fecha_Registro, Usuario, usuario_actualiza)
             VALUES (?, ?, ?, ?, 0, NULL, ?, NOW(), 'Sistema', NULL)`,
            [idElem, idSolDot, it.idArticulo, it.cantidad, it.nota]
          );
        }

        // =============================================================
        // REGISTRO 2: Dynamic_Solicitudes (EPP)
        // =============================================================
        const itemsEpp = [];

        // Fila 1: PORTACARNET (Cant: 1)
        const portaRule = rules.find(r =>
          norm(r.Operacion) === norm(operacion) &&
          norm(r.Cargo) === norm(cargo) &&
          norm(r.Clasificacion) === 'PORTACARNET'
        );
        if (portaRule) {
          const matchPorta = articles.find(a =>
            norm(a.Elemento) === norm(portaRule.Elemento)
          );
          if (matchPorta) {
            itemsEpp.push({
              idArticulo: matchPorta.Id,
              cantidad: 1,
              nota: 'Dotación inicial'
            });
          }
        }

        // Fila 2: GUANTES (Cant: 1, Talla 9)
        const guantesRule = rules.find(r =>
          norm(r.Operacion) === norm(operacion) &&
          norm(r.Cargo) === norm(cargo) &&
          norm(r.Clasificacion) === 'GUANTES'
        );
        if (guantesRule) {
          let matchGuantes = articles.find(a =>
            norm(a.Elemento) === norm(guantesRule.Elemento) &&
            (norm(a.Talla) === '9' || norm(a.Talla) === '9.0')
          );
          if (!matchGuantes) {
            matchGuantes = articles.find(a =>
              norm(a.Elemento) === norm(guantesRule.Elemento)
            );
          }
          if (matchGuantes) {
            itemsEpp.push({
              idArticulo: matchGuantes.Id,
              cantidad: 1,
              nota: 'Dotación inicial'
            });
          }
        }

        // Fila 3: GORRO (Cant: 2)
        const gorroRule = rules.find(r =>
          norm(r.Operacion) === norm(operacion) &&
          norm(r.Cargo) === norm(cargo) &&
          norm(r.Clasificacion) === 'GORRO'
        );
        if (gorroRule) {
          const matchGorro = articles.find(a =>
            norm(a.Elemento) === norm(gorroRule.Elemento)
          );
          if (matchGorro) {
            itemsEpp.push({
              idArticulo: matchGorro.Id,
              cantidad: 2,
              nota: 'Dotación inicial'
            });
          }
        }

        // Insertar solicitud de EPP
        const idSolEpp = randomUUID();
        const obsEpp = `AUTOMATICO: EPP Inicial ${String(vin.Trabajador || '').trim()}`.trim();
        await conn.execute(
          `INSERT INTO Dynamic_Solicitudes
           (IdSolicitud, FechaSolicitud, Estado, \`Operación\`, Regional, Prioridad, Categoria,
            \`Justificación\`, Imagen_Cotización, Monto_Estimado, AprobadoPor, FechaAprobacion,
            foto_guia, Observaciones, Usuario, Fecha_Actualización, usuario_actualiza, Aclaraciones)
           VALUES (?, NOW(), 'BORRADOR', ?, ?, 'BAJA', 'EPP',
            ?, NULL, NULL, NULL, NULL,
            NULL, ?, 'Sistema', NULL, NULL, NULL)`,
          [idSolEpp, operacion, regional, identificacion, obsEpp]
        );
        solicitudesCreadasCount++;

        // Insertar items de EPP correspondientes
        for (const it of itemsEpp) {
          const idElem = randomUUID().replace(/-/g, '');
          await conn.execute(
            `INSERT INTO Dynamic_Solicitudes_Items
             (IdElemento, IdSolicitud, IdArticulo, Cantidad, CantidadDespachada, IdKardex, Nota, Fecha_Registro, Usuario, usuario_actualiza)
             VALUES (?, ?, ?, ?, 0, NULL, ?, NOW(), 'Sistema', NULL)`,
            [idElem, idSolEpp, it.idArticulo, it.cantidad, it.nota]
          );
        }

        // 3. Marcar registro como procesado en la tabla dedicada (sin riesgo de truncamiento,
        // a diferencia de escribir una marca de texto en Observaciones Vinculación, columna
        // compartida con otros procesos que también la mutan: [NI], [RN], [NOTIF_...]).
        await conn.execute(
          `INSERT INTO \`Dynamic_AutoIngreso_Procesados\` (IdVinculacion, IdSolicitudDotacion, IdSolicitudEpp, FechaProcesado)
           VALUES (?, ?, ?, NOW())`,
          [vin.id, idSolDot, idSolEpp]
        );

        await conn.commit();
        procesadosCount++;
        console.log(`[solicitudesAutoIngreso] OK id=${vin.id} trabajador="${vin.Trabajador}" -> Dotación items=${itemsDotacion.length}, EPP items=${itemsEpp.length}`);

      } catch (err) {
        await conn.rollback();
        console.error(`[solicitudesAutoIngreso] ERROR al procesar id=${vin.id}:`, err.message);
      } finally {
        conn.release();
      }
    }

    return { procesados: procesadosCount, solicitudesCreadas: solicitudesCreadasCount };

  } catch (err) {
    console.error('[solicitudesAutoIngreso] Error general:', err.message);
    return { error: err.message };
  }
}

module.exports = {
  verificarSolicitudesNuevosIngresos,
  obtenerIngresosPendientes
};
