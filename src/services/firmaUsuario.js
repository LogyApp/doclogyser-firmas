// Firma registrada de un usuario de LogyApp (Maestro_Usuarios) en el bucket de firmas.
// La carpeta es la cédula de su Colaborador (Maestro_Segmentación o Maestro_Vinculación) o, si no tiene
// (p. ej. el usuario Sistema), 'usuario_<ID>'. La usan Informes Disciplinarios (quien reporta) y ARO (SG-SST).
const pool = require('./db');
const { obtenerUrlFirmaReciente } = require('./storage');

async function claveFirmaUsuario(usuarioId) {
  const [[u]] = await pool.execute('SELECT Colaborador FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuarioId]);
  const colaborador = u && u.Colaborador ? String(u.Colaborador).trim() : '';
  if (colaborador) {
    const cedula = colaborador.split(' ** ')[0].replace(/\D/g, '');
    if (cedula) return cedula;
    let [[fila]] = await pool.execute('SELECT `Identificación` AS id FROM `Maestro_Segmentación` WHERE Trabajador = ? LIMIT 1', [colaborador]);
    if (!fila) [[fila]] = await pool.execute('SELECT `Identificación` AS id FROM `Maestro_Vinculación` WHERE Trabajador = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1', [colaborador]);
    if (fila && fila.id) return String(fila.id);
  }
  return `usuario_${String(usuarioId).replace(/[^A-Za-z0-9_-]+/g, '_')}`;
}

async function urlFirmaRegistrada(usuarioId) {
  return obtenerUrlFirmaReciente(await claveFirmaUsuario(usuarioId)).catch(() => null);
}

module.exports = { claveFirmaUsuario, urlFirmaRegistrada };
