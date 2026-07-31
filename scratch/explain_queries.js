require('dotenv').config({ path: 'c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/.env' });
const pool = require('c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/src/services/db');
const fs = require('fs');

async function test() {
  try {
    const [cols1] = await pool.execute('DESCRIBE Config_Doc_Trabajador');
    const [cols2] = await pool.execute('DESCRIBE Maestro_docTrabajador');
    
    fs.writeFileSync('c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/scratch/describe_tables.txt', JSON.stringify({
      Config_Doc_Trabajador: cols1,
      Maestro_docTrabajador: cols2
    }, null, 2), 'utf8');
    console.log('Results written to scratch/describe_tables.txt');
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await pool.end();
  }
}

test();
