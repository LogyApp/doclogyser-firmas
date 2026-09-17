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
 * Genera las solicitudes en estado PENDIENTE (DOTACIÓN y EPP) con sus respectivos ítems
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
            'SELECT Camiseta, Pantalon, Botas FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1',
            [identificacion]
          );
          if (segRows.length > 0) {
            seg = segRows[0];
          }
        }

        // 3. Filtrar reglas configuradas en Maestro_Dotacion_Cargos para este binomio (Operación, Cargo)
        const cargoRules = rules.filter(r =>
          norm(r.Operacion) === norm(operacion) &&
          norm(r.Cargo) === norm(cargo)
        );

        if (cargoRules.length === 0) {
          console.log(`[solicitudesAutoIngreso] Sin reglas en Maestro_Dotacion_Cargos para Op="${operacion}", Cargo="${cargo}"`);
        }

        // Agrupar items a generar por Categoría ('DOTACIÓN', 'EPP', etc.)
        const itemsPorCategoria = {};

        for (const rule of cargoRules) {
          const catNorm = norm(rule.Categoria);
          // Normalizar categoría de destino (DOTACIÓN o EPP)
          const categoriaDestino = catNorm.includes('EPP') ? 'EPP' : 'DOTACIÓN';

          const clasifNorm = norm(rule.Clasificacion);
          const elemNorm = norm(rule.Elemento);

          // Determinar talla según la clasificación
          let tallaRequerida = null;
          if (['BUZO', 'POLO', 'CAMISETA', 'CAMISA', 'CHALECO', 'CHAQUETA'].includes(clasifNorm)) {
            tallaRequerida = norm(seg.Camiseta || '');
          } else if (['PANTALON', 'PANTALON', 'JEAN', 'BERMUDA'].includes(clasifNorm)) {
            tallaRequerida = norm(seg.Pantalon || '');
          } else if (['BOTAS', 'BOTA', 'CALZADO', 'ZAPATO', 'ZAPATOS'].includes(clasifNorm)) {
            tallaRequerida = norm(seg.Botas || '');
          }

          // Cantidad por defecto según la clasificación
          const cantidad = (['BUZO', 'POLO', 'CAMISETA', 'CAMISA', 'PANTALON', 'GORRO'].includes(clasifNorm)) ? 2 : 1;

          // Buscar artículo correspondiente en Dynamic_Articulos
          let matchArt = null;

          if (tallaRequerida !== null) {
            // Prenda/calzado con talla: si tiene talla requerida, buscar por elemento + talla
            if (tallaRequerida) {
              // 1. Preferir artículo genérico (sin referencia rotulada)
              matchArt = articles.find(a =>
                norm(a.Elemento) === elemNorm &&
                norm(a.Talla) === tallaRequerida &&
                (!a.Referencia || String(a.Referencia).trim() === '')
              );
              // 2. Si no hay sin referencia, cualquier artículo con esa talla y elemento
              if (!matchArt) {
                matchArt = articles.find(a =>
                  norm(a.Elemento) === elemNorm &&
                  norm(a.Talla) === tallaRequerida
                );
              }
            } else {
              // El colaborador no tiene registrada la talla: buscar artículo base por elemento sin referencia
              matchArt = articles.find(a =>
                norm(a.Elemento) === elemNorm &&
                (!a.Referencia || String(a.Referencia).trim() === '')
              ) || articles.find(a => norm(a.Elemento) === elemNorm);
            }
          } else if (clasifNorm === 'GUANTES') {
            // Guantes: priorizar talla 9 / 9.0 si está disponible
            matchArt = articles.find(a =>
              norm(a.Elemento) === elemNorm &&
              (norm(a.Talla) === '9' || norm(a.Talla) === '9.0')
            ) || articles.find(a => norm(a.Elemento) === elemNorm);
          } else {
            // Resto de elementos / EPP: buscar por Elemento (preferir sin referencia rotulada)
            matchArt = articles.find(a =>
              norm(a.Elemento) === elemNorm &&
              (!a.Referencia || String(a.Referencia).trim() === '')
            ) || articles.find(a => norm(a.Elemento) === elemNorm);
          }

          if (matchArt) {
            if (!itemsPorCategoria[categoriaDestino]) {
              itemsPorCategoria[categoriaDestino] = [];
            }
            itemsPorCategoria[categoriaDestino].push({
              idArticulo: matchArt.Id,
              cantidad,
              nota: 'Dotación inicial'
            });
          } else {
            console.warn(`[solicitudesAutoIngreso] No se encontró artículo para regla: ${rule.Elemento} (${rule.Clasificacion}) Talla="${tallaRequerida || ''}"`);
          }
        }

        let idSolDot = null;
        let idSolEpp = null;

        // Crear solicitudes en Dynamic_Solicitudes para cada categoría que contenga ítems
        for (const [categoria, items] of Object.entries(itemsPorCategoria)) {
          if (!items || items.length === 0) continue;

          const idSol = randomUUID();
          const obs = `AUTOMATICO: ${categoria === 'EPP' ? 'EPP' : 'Dotación'} Inicial ${String(vin.Trabajador || '').trim()}`.trim();

          await conn.execute(
            `INSERT INTO Dynamic_Solicitudes
             (IdSolicitud, FechaSolicitud, Estado, \`Operación\`, Regional, Prioridad, Categoria,
              \`Justificación\`, Imagen_Cotización, Monto_Estimado, AprobadoPor, FechaAprobacion,
              foto_guia, Observaciones, Usuario, Fecha_Actualización, usuario_actualiza, Aclaraciones)
             VALUES (?, NOW(), 'PENDIENTE', ?, ?, 'BAJA', ?,
              ?, NULL, NULL, NULL, NULL,
              NULL, ?, 'Sistema', NULL, NULL, NULL)`,
            [idSol, operacion, regional, categoria, identificacion, obs]
          );
          solicitudesCreadasCount++;

          if (categoria === 'EPP') {
            idSolEpp = idSol;
          } else {
            idSolDot = idSol;
          }

          // Insertar items correspondientes
          for (const it of items) {
            const idElem = randomUUID().replace(/-/g, '');
            await conn.execute(
              `INSERT INTO Dynamic_Solicitudes_Items
               (IdElemento, IdSolicitud, IdArticulo, Cantidad, CantidadDespachada, IdKardex, Nota, Fecha_Registro, Usuario, usuario_actualiza)
               VALUES (?, ?, ?, ?, 0, NULL, ?, NOW(), 'Sistema', NULL)`,
              [idElem, idSol, it.idArticulo, it.cantidad, it.nota]
            );
          }
        }

        // 4. Marcar registro como procesado en la tabla dedicada
        await conn.execute(
          `INSERT INTO \`Dynamic_AutoIngreso_Procesados\` (IdVinculacion, IdSolicitudDotacion, IdSolicitudEpp, FechaProcesado)
           VALUES (?, ?, ?, NOW())`,
          [vin.id, idSolDot, idSolEpp]
        );

        await conn.commit();
        procesadosCount++;
        const totalItems = Object.values(itemsPorCategoria).reduce((acc, itms) => acc + itms.length, 0);
        console.log(`[solicitudesAutoIngreso] OK id=${vin.id} trabajador="${vin.Trabajador}" -> Dotación=${idSolDot ? 'SI' : 'NO'}, EPP=${idSolEpp ? 'SI' : 'NO'} (Total items: ${totalItems})`);

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
