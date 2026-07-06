require('dotenv').config();
const pool = require('../src/services/db');

async function test() {
  try {
    console.log('Querying Config_Doc_Trabajador...');
    const [configRows] = await pool.execute('DESCRIBE Config_Doc_Trabajador');
    console.log('Config_Doc_Trabajador Columns:', configRows.map(r => `${r.Field} (${r.Type})`));

    console.log('\nQuerying Maestro_Vinculación...');
    const [vincRows] = await pool.execute('DESCRIBE Maestro_Vinculación');
    console.log('Maestro_Vinculación Columns:', vincRows.map(r => `${r.Field} (${r.Type})`));

    console.log('\nQuerying Maestro_docTrabajador...');
    const [docRows] = await pool.execute('DESCRIBE Maestro_docTrabajador');
    console.log('Maestro_docTrabajador Columns:', docRows.map(r => `${r.Field} (${r.Type})`));

    console.log('\nSample from Config_Doc_Trabajador:');
    const [configSample] = await pool.execute('SELECT Id, Prefijo, Documento FROM Config_Doc_Trabajador LIMIT 3');
    console.log(configSample);

    console.log('\nSample from Maestro_Vinculación:');
    const [vincSample] = await pool.execute('SELECT `Id Vinculación`, `Identificación`, Regional, `Operación`, Estado, `Fecha de Ingreso` FROM Maestro_Vinculación LIMIT 1');
    console.log(vincSample);

    process.exit(0);
  } catch (err) {
    console.error('Error running test:', err);
    process.exit(1);
  }
}

test();
