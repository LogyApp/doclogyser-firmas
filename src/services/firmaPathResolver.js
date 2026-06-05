const pool = require('./db');
const { obtenerUrlFirmaReciente } = require('./storage');

/**
 * Resuelve la ruta de firma para un usuario responsable que genera documentos.
 * Busca: Maestro_Usuarios (ID) -> Colaborador -> Maestro_Vinculación (Trabajador) -> Identificación
 */
async function resolverRutaFirmaResponsable(usuarioId) {
  try {
    const [usuRows] = await pool.execute(
      'SELECT Colaborador FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
      [usuarioId]
    );
    if (!usuRows.length || !usuRows[0].Colaborador) {
      console.warn('[resolverRutaFirmaResponsable] Usuario no encontrado o sin Colaborador:', usuarioId);
      return null;
    }

    const colaborador = usuRows[0].Colaborador;
    const [vinRows] = await pool.execute(
      'SELECT `Identificación` FROM `Maestro_Vinculación` WHERE Trabajador = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [colaborador]
    );
    if (!vinRows.length) {
      console.warn('[resolverRutaFirmaResponsable] Colaborador no encontrado en Maestro_Vinculación:', colaborador);
      return null;
    }

    const identificacion = vinRows[0]['Identificación'];
    return {
      identificacion: String(identificacion),
      urlFirma: await obtenerUrlFirmaReciente(String(identificacion)).catch(() => null),
    };
  } catch (err) {
    console.error('[resolverRutaFirmaResponsable]', err.message);
    return null;
  }
}

/**
 * Resuelve la ruta de firma para un trabajador retirado.
 * Usa directamente la Identificación de Maestro_Vinculación
 */
async function resolverRutaFirmaTrabajador(identificacion) {
  try {
    const id = String(identificacion);
    return {
      identificacion: id,
      urlFirma: await obtenerUrlFirmaReciente(id).catch(() => null),
    };
  } catch (err) {
    console.error('[resolverRutaFirmaTrabajador]', err.message);
    return null;
  }
}

/**
 * Resuelve la ruta de firma para un área que firma paz y salvo.
 * Busca: Maestro_Vinculación (Trabajador = Colaborador del área) -> Identificación
 */
async function resolverRutaFirmaArea(colaboradorArea) {
  try {
    if (!colaboradorArea) {
      console.warn('[resolverRutaFirmaArea] colaboradorArea está vacío');
      return null;
    }

    const [vinRows] = await pool.execute(
      'SELECT `Identificación` FROM `Maestro_Vinculación` WHERE Trabajador = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [colaboradorArea]
    );
    if (!vinRows.length) {
      console.warn('[resolverRutaFirmaArea] Colaborador no encontrado en Maestro_Vinculación:', colaboradorArea);
      return null;
    }

    const identificacion = vinRows[0]['Identificación'];
    return {
      identificacion: String(identificacion),
      urlFirma: await obtenerUrlFirmaReciente(String(identificacion)).catch(() => null),
    };
  } catch (err) {
    console.error('[resolverRutaFirmaArea]', err.message);
    return null;
  }
}

module.exports = {
  resolverRutaFirmaResponsable,
  resolverRutaFirmaTrabajador,
  resolverRutaFirmaArea,
};

