'use strict';

const pool = require('../services/db');
const { randomUUID } = require('crypto');

/**
 * Despacha una solicitud aprobada en una única transacción:
 *  1. Por cada ítem busca stock en Vista_Inventario (prioriza misma operación).
 *  2. INSERT Dynamic_Kardex  (TRANSFERENCIA, cantidad negativa = salida del origen).
 *  3. INSERT Kardex_Pendiente (Procesado = 1 si mismo regional, 0 si inter-regional).
 *  4. UPDATE Dynamic_Solicitudes: Estado = 'DESPACHADA' si todos los ítems
 *     tuvieron stock, 'PARCIAL' si alguno quedó sin stock.
 *
 * Todo ocurre en la misma transacción: si cualquier paso falla se hace rollback.
 * La deduplicación de entradas la maneja proc_CompletarTransferencia en la BD.
 *
 * @param {string} idSolicitud
 * @param {string} usuario  — ID del usuario que ejecuta el despacho
 * @returns {{ ok: boolean, idSolicitud: string, estado: 'DESPACHADA'|'PARCIAL' }}
 */
async function despacharSolicitud(idSolicitud, usuario) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    // FOR UPDATE bloquea la fila: impide que dos requests simultáneos
    // al mismo endpoint dupliquen movimientos en Dynamic_Kardex.
    const [[sol]] = await conn.execute(
      'SELECT `Operación`, Regional, Estado FROM Dynamic_Solicitudes WHERE IdSolicitud = ? LIMIT 1 FOR UPDATE',
      [idSolicitud]
    );
    if (!sol) throw new Error('Solicitud no encontrada');
    if (sol.Estado !== 'APROBADA') throw new Error(`Estado inválido para despacho: ${sol.Estado}`);

    const [items] = await conn.execute(
      `SELECT i.IdArticulo, i.Cantidad, a.Categoria, a.Costo
       FROM Dynamic_Solicitudes_Items i
       LEFT JOIN Dynamic_Articulos a ON a.Id = i.IdArticulo
       WHERE i.IdSolicitud = ?`,
      [idSolicitud]
    );
    if (!items.length) throw new Error('La solicitud no tiene ítems para despachar');

    let itemsSinStock = 0;

    for (const item of items) {
      const [[stock]] = await conn.execute(
        `SELECT Regional, Operacion, \`Stock Disponible\`
         FROM Vista_Inventario
         WHERE IdArticulo = ? AND Categoria = ? AND \`Stock Disponible\` > 0
         ORDER BY CASE WHEN Operacion = ? THEN 0 ELSE 1 END, \`Stock Disponible\` DESC
         LIMIT 1`,
        [item.IdArticulo, item.Categoria, sol['Operación']]
      );

      if (!stock) {
        itemsSinStock++;
        console.warn(`[kardex] Sin stock para artículo ${item.IdArticulo} en solicitud ${idSolicitud}`);
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
          sol['Operación'],
          item.Categoria,
          item.IdArticulo,
          -item.Cantidad,
          item.Costo || 0,
          usuario,
        ]
      );

      // Procesado = 1 → mismo regional (sin transferencia física), 0 → inter-regional
      const procesado = stock.Regional === sol.Regional ? 1 : 0;

      await conn.execute(
        'INSERT INTO Kardex_Pendiente (IdKardexOriginal, Procesado, Procesando) VALUES (?, ?, 0)',
        [idKardex, procesado]
      );
    }

    const estadoFinal = itemsSinStock > 0 ? 'PARCIAL' : 'DESPACHADA';

    await conn.execute(
      `UPDATE Dynamic_Solicitudes
       SET Estado = ?, Usuario = ?, \`Fecha_Actualización\` = NOW()
       WHERE IdSolicitud = ?`,
      [estadoFinal, usuario, idSolicitud]
    );

    await conn.commit();
    return { ok: true, idSolicitud, estado: estadoFinal };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { despacharSolicitud };
