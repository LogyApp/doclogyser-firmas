// SST › Compromiso SST: datos de quien crea el compromiso (el "analista" que firma como responsable).
// Lo usan la creación individual y masiva (routes/compromisosst.js) y Habilitar Doc. SST (docSstPortal.js).
const pool = require('./db');

// Cédula, nombre y cargo del usuario según su vinculación (por la cédula de Colaborador "CC ** Nombre" o por el
// nombre). Usuarios sin vinculación (Sistema, administradores): 0000000000 y 'SST ADMINISTRADOR/SISTEMA'.
async function analistaCompromiso(usuario, conexion = pool) {
  const [userRows] = await conexion.execute('SELECT Colaborador, Nombre FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
  const analista = { cc: '0000000000', nombre: usuario, cargo: 'SST ADMINISTRADOR/SISTEMA' };
  if (!userRows.length) return analista;

  const u = userRows[0];
  const colaborador = u.Colaborador || '';
  const parsedCC = colaborador.includes(' ** ') ? colaborador.split(' ** ')[0].trim() : '';
  let vinRows = [];
  if (parsedCC) {
    [vinRows] = await conexion.execute(
      'SELECT Identificación, Trabajador, Cargo FROM `Maestro_Vinculación` WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [parsedCC]
    );
  }
  if (!vinRows.length && colaborador) {
    [vinRows] = await conexion.execute(
      'SELECT Identificación, Trabajador, Cargo FROM `Maestro_Vinculación` WHERE Trabajador = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [colaborador]
    );
  }
  if (!vinRows.length) return { ...analista, nombre: u.Nombre || usuario };

  const nombre = String(vinRows[0].Trabajador || '');
  return {
    cc: vinRows[0]['Identificación'],
    nombre: nombre.includes(' ** ') ? nombre.split(' ** ')[1] : nombre,
    cargo: vinRows[0].Cargo,
  };
}

module.exports = { analistaCompromiso };
