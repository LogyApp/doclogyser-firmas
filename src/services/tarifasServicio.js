const pool = require('./db');

// ── Valor Unitario del servicio según Maestro_Tarifas ─────────────────────────
// Reemplaza la fórmula de AppSheet. Se busca la tarifa de la Actividad y:
//   - si la Unidad es CUPO, del Vehículo; si no, de la Unidad;
//   - primero la del Proveedor del servicio, luego la de la Transportadora y por último la general.
// Proveedor y Transportadora en Maestro_Tarifas guardan el ID del maestro (vacío = tarifa general).
// Si no hay tarifa devuelve null y el Valor Unitario queda para escribirlo a mano.

function texto(valor) {
  return String(valor == null ? '' : valor).trim();
}

// { actividad, unidad, vehiculo, transportadora, proveedores: [IDs] } → { valor, idTarifa, criterio } | null
async function buscarTarifa({ actividad, unidad, vehiculo, transportadora, proveedores = [] }) {
  const act = texto(actividad);
  const uni = texto(unidad);
  if (!act || !uni) return null;
  const porVehiculo = uni.toUpperCase() === 'CUPO';
  const columna = porVehiculo ? 'Vehiculo' : 'Unidad';
  const valorClave = porVehiculo ? texto(vehiculo) : uni;
  if (!valorClave) return null;

  const consultar = async (filtro, params, criterio) => {
    const [rows] = await pool.query(
      `SELECT IdTarifa AS idTarifa, Valor AS valor FROM Maestro_Tarifas
       WHERE Actividad = ? AND \`${columna}\` = ? AND Valor IS NOT NULL ${filtro}
       ORDER BY \`Fecha de Registro\` DESC LIMIT 1`,
      [act, valorClave, ...params]
    );
    return rows.length ? { valor: Number(rows[0].valor), idTarifa: rows[0].idTarifa, criterio } : null;
  };

  for (const p of (proveedores || []).map(texto).filter(Boolean)) {
    const t = await consultar('AND Proveedor = ?', [p], 'proveedor');
    if (t) return t;
  }
  if (texto(transportadora)) {
    const t = await consultar('AND Transportadora = ?', [texto(transportadora)], 'transportadora');
    if (t) return t;
  }
  // General: primero las que no son de un proveedor ni de una transportadora
  const [rows] = await pool.query(
    `SELECT IdTarifa AS idTarifa, Valor AS valor FROM Maestro_Tarifas
     WHERE Actividad = ? AND \`${columna}\` = ? AND Valor IS NOT NULL
     ORDER BY (COALESCE(Proveedor, '') = '' AND COALESCE(Transportadora, '') = '') DESC, \`Fecha de Registro\` DESC LIMIT 1`,
    [act, valorClave]
  );
  return rows.length ? { valor: Number(rows[0].valor), idTarifa: rows[0].idTarifa, criterio: 'general' } : null;
}

module.exports = { buscarTarifa };
