require('dotenv').config();
const pool = require('../src/services/db');

(async () => {
  const idcsst = 'd798dee6-1722-4d10-bbf8-89fe4cd4994f';

  const [vin] = await pool.execute(
    'SELECT Cargo FROM `Maestro_Vinculación` WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
    ['1088020024']
  );
  const cargoActual = vin[0].Cargo;
  console.log('Cargo actual en Maestro_Vinculación:', cargoActual);

  const [result] = await pool.execute(
    'UPDATE Dynamic_compromisosst SET cargo_trabajador = ? WHERE idcsst = ?',
    [cargoActual, idcsst]
  );
  console.log('Filas actualizadas:', result.affectedRows);

  const [check] = await pool.execute(
    'SELECT idcsst, nombre_trabajador, cargo_trabajador FROM Dynamic_compromisosst WHERE idcsst = ?',
    [idcsst]
  );
  console.log('Registro actualizado:', check);

  await pool.end();
})();
