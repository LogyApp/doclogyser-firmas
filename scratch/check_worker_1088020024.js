require('dotenv').config();
const pool = require('../src/services/db');

(async () => {
  const id = '1088020024';

  const [vin] = await pool.execute(
    'SELECT `Id Vinculación`, Identificación, Trabajador, Cargo, Estado, Regional, `Operación`, `Fecha de Ingreso`, `Fecha de Retiro` FROM `Maestro_Vinculación` WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC',
    [id]
  );
  console.log('=== Maestro_Vinculación ===');
  console.log(vin);

  const [dyn] = await pool.execute(
    'SELECT idcsst, identificaciontrabajador, nombre_trabajador, cargo_trabajador, identificacionanalista, nombre_analista, cargo_analista, fecha_registro, url_doc FROM Dynamic_compromisosst WHERE identificaciontrabajador = ? OR identificacionanalista = ? ORDER BY fecha_registro DESC',
    [id, id]
  );
  console.log('=== Dynamic_compromisosst ===');
  console.log(dyn);

  const [usu] = await pool.execute(
    'SELECT ID, Nombre, Rol, Colaborador FROM Maestro_Usuarios WHERE Colaborador LIKE ?',
    [`%${id}%`]
  );
  console.log('=== Maestro_Usuarios (si es analista/usuario) ===');
  console.log(usu);

  await pool.end();
})();
