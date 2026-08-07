const crypto = require('crypto');

async function obtenerTipoDocumentoConfig(pool, tipoDocumentoId) {
  const [rows] = await pool.execute(
    'SELECT Id, Documento, Prefijo, tipo_doc FROM Config_Doc_Trabajador WHERE Id = ?',
    [tipoDocumentoId]
  );

  return rows[0] || null;
}

async function obtenerVinculacionReciente(pool, identificacion) {
  const [rows] = await pool.execute(
    `SELECT v1.Regional, v1.Operación, v1.Estado, DATE_FORMAT(v1.\`Fecha de Ingreso\`, '%Y-%m-%d') AS FechaIngreso
     FROM Maestro_Vinculación v1
     INNER JOIN (
       SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS max_fecha
       FROM Maestro_Vinculación
       WHERE Identificación = ?
       GROUP BY Identificación
     ) v2 ON v1.Identificación = v2.Identificación AND v1.\`Fecha de Ingreso\` = v2.max_fecha`,
    [identificacion]
  );

  return rows[0] || null;
}

async function registrarDocTrabajador(pool, data) {
  const id = data.id || crypto.randomUUID();

  await pool.execute(
    `INSERT INTO Maestro_docTrabajador (
      id, Identificación, TipoDocumento, Prefijo, Regional, Operación, Estado, Fecha_Ingreso, FechaRegistro, Usuario, Observaciones, Doc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)`,
    [
      id,
      data.identificacion,
      String(data.tipoDocumentoId),
      data.prefijo,
      data.regional,
      data.operacion,
      data.estado,
      data.fechaIngreso,
      data.usuario,
      data.observaciones || null,
      data.url,
    ]
  );

  return id;
}

async function registrarDocGeneral(pool, data) {
  const id = data.id || crypto.randomUUID();

  await pool.execute(
    `INSERT INTO Maestro_docEmpresa (
      id, TipoDocumento, Prefijo, Regional, Operación, FechaRegistro, Usuario, Observaciones, Doc
    ) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?)`,
    [
      id,
      String(data.tipoDocumentoId),
      data.prefijo,
      data.regional,
      data.operacion,
      data.usuario,
      data.observaciones || null,
      data.url,
    ]
  );

  return id;
}

module.exports = {
  obtenerTipoDocumentoConfig,
  obtenerVinculacionReciente,
  registrarDocTrabajador,
  registrarDocGeneral,
};