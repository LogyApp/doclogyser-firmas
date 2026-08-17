require('dotenv').config();
const pool = require('../src/services/db');

async function testFormCloudDocs() {
  console.log('1. Fetching a sample worker for autocomplete test...');
  const [workers] = await pool.execute('SELECT s.Trabajador, s.Identificación FROM Maestro_Segmentación s LIMIT 1');
  if (!workers.length) {
    console.error('No workers found to test!');
    return;
  }
  const worker = workers[0];
  console.log('Sample worker:', worker);

  console.log('\n2. Testing autocomplete query for:', worker.Trabajador.substring(0, 10));
  const searchTerm = `%${worker.Trabajador.substring(0, 10)}%`;
  const sql = `
    SELECT 
      s.Identificación AS identificacion,
      s.Trabajador AS trabajador,
      mv.Regional,
      mv.Operación AS operacion,
      mv.Estado,
      DATE_FORMAT(mv.max_fecha_ingreso, '%Y-%m-%d') AS fechaIngreso
    FROM Maestro_Segmentación s
    JOIN (
      SELECT v1.Identificación, v1.Regional, v1.Operación, v1.Estado, v1.\`Fecha de Ingreso\` AS max_fecha_ingreso
      FROM Maestro_Vinculación v1
      INNER JOIN (
        SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS max_fecha
        FROM Maestro_Vinculación
        GROUP BY Identificación
      ) v2 ON v1.Identificación = v2.Identificación AND v1.\`Fecha de Ingreso\` = v2.max_fecha
    ) mv ON s.Identificación = mv.Identificación
    WHERE (s.Trabajador COLLATE utf8mb4_general_ci LIKE ? OR CAST(s.Identificación AS CHAR) LIKE ?)
    LIMIT 5
  `;
  const [autoRows] = await pool.execute(sql, [searchTerm, searchTerm]);
  console.log('Autocomplete results count:', autoRows.length);
  if (autoRows.length > 0) {
    console.log('First result:', autoRows[0]);
  }

  console.log('\n3. Testing Document Types retrieval...');
  const [docTypesTrab] = await pool.execute(
    'SELECT Id, Documento, Prefijo FROM Config_Doc_Trabajador WHERE tipo_doc = ? LIMIT 3',
    ['Trabajador']
  );
  console.log('Worker doc types sample:', docTypesTrab);

  const [docTypesGen] = await pool.execute(
    'SELECT Id, Documento, Prefijo FROM Config_Doc_Trabajador WHERE tipo_doc = ? LIMIT 3',
    ['General']
  );
  console.log('General doc types sample:', docTypesGen);

  console.log('\n4. Checking Maestro_docEmpresa columns structure...');
  const [columns] = await pool.execute('DESCRIBE Maestro_docEmpresa');
  console.log('Maestro_docEmpresa columns:');
  columns.forEach(c => console.log(`- ${c.Field}: ${c.Type}`));

  console.log('\nAll test queries completed successfully!');
  process.exit(0);
}

testFormCloudDocs().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
