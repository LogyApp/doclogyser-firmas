'use strict';

const pool = require('../services/db');
const { randomUUID } = require('crypto');

/**
 * Registra movimientos de salida (TRANSFERENCIA) en Dynamic_Kardex
 * para todos los ítems de una solicitud al momento de despacharla.
 *
 * Por cada ítem:
 *  1. Busca el stock disponible más cercano en Vista_Inventario,
 *     priorizando la misma operación de la solicitud.
 *  2. Inserta un registro de SALIDA (cantidad negativa) en Dynamic_Kardex.
 *  3. Inserta el pendiente en Kardex_Pendiente para que el SP lo procese.
 *     Procesado = 1 si el stock viene de la misma regional que la solicitud,
 *     0 si viene de otra regional (requiere transferencia física).
 *
 * La deduplicación la maneja proc_CompletarTransferencia; NO se verifica aquí.
 *
 * @param {string} idSolicitud
 * @param {string} operacionDestino  - `Operación` de la solicitud (destino)
 * @param {string} regionalDestino   - Regional de la solicitud (destino)
 * @param {string} usuario           - ID del usuario que despacha
 */
async function despacharSolicitud(idSolicitud, operacionDestino, regionalDestino, usuario) {
  const [items] = await pool.execute(
    `SELECT i.IdArticulo, i.Cantidad, a.Categoria, a.Costo
     FROM Dynamic_Solicitudes_Items i
     LEFT JOIN Dynamic_Articulos a ON a.Id = i.IdArticulo
     WHERE i.IdSolicitud = ?`,
    [idSolicitud]
  );

  if (!items.length) return;

  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    for (const item of items) {
      // Buscar stock disponible; priorizar misma operación de la solicitud
      const [[stock]] = await conn.execute(
        `SELECT Regional, Operacion, \`Stock Disponible\`
         FROM Vista_Inventario
         WHERE IdArticulo = ? AND Categoria = ? AND \`Stock Disponible\` > 0
         ORDER BY CASE WHEN Operacion = ? THEN 0 ELSE 1 END, \`Stock Disponible\` DESC
         LIMIT 1`,
        [item.IdArticulo, item.Categoria, operacionDestino]
      );

      if (!stock) {
        console.warn(`[kardex] Sin stock disponible para artículo ${item.IdArticulo}`);
        continue;
      }

      const idKardex = randomUUID().replace(/-/g, '').toLowerCase();

      await conn.execute(
        `INSERT INTO Dynamic_Kardex
         (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
          \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, ValorUnitario, UsuarioRegistro)
         VALUES (?, NOW(), 'TRANSFERENCIA', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          idKardex,
          stock.Regional,
          stock.Operacion,
          operacionDestino,
          item.Categoria,
          item.IdArticulo,
          -item.Cantidad,
          item.Costo || 0,
          usuario,
        ]
      );

      // Procesado = 1 si el stock ya está en la misma regional que la solicitud
      const procesado = stock.Regional === regionalDestino ? 1 : 0;

      await conn.execute(
        'INSERT INTO Kardex_Pendiente (IdKardexOriginal, Procesado, Procesando) VALUES (?, ?, 0)',
        [idKardex, procesado]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { despacharSolicitud };
