require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const pool = require('../src/services/db.js');

async function testFlow() {
  console.log('--- Testing Pruebaconsumo Flow ---');
  const idprueba = uuidv4();
  const testId = '1026136716'; // Diego Andres Perez Martinez (exists in the DB)
  
  try {
    // 1. Get worker details for operation
    console.log('1. Querying Maestro_Vinculación for worker regional/operacion...');
    const [workers] = await pool.execute(
      `SELECT DISTINCT Trabajador, Identificación AS identificacion, Cargo 
       FROM \`Maestro_Vinculación\` 
       WHERE Regional = 'Antioquia' AND \`Operación\` = 'PEPSICO' AND Estado = 'Activo'
       LIMIT 1`
    );
    console.log('Worker found:', workers[0]);

    // 2. Insert test pruebaconsumo record
    console.log('2. Inserting test pruebaconsumo record...');
    await pool.execute(
      `INSERT INTO Dynamic_pruebaconsumo 
       (idprueba, fecha, identificacion, nombre_trabajador, cargo, ciudad, cliente,
        firma_trabajador, url_firma, url_doc, token_firma, token_expira, observaciones, usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?)`,
      [
        idprueba,
        '2026-07-29',
        testId,
        'DIEGO ANDRES PEREZ MARTINEZ',
        'AUXILIAR LOGISTICO',
        'Medellín',
        'PEPSICO',
        'test-token-123',
        new Date(Date.now() + 48 * 60 * 60 * 1000),
        'Test observations',
        'Luisa Palacio - 901'
      ]
    );
    console.log('Insert successful, idprueba:', idprueba);

    // 3. Query the inserted record
    console.log('3. Querying inserted record...');
    const [rows] = await pool.execute('SELECT * FROM Dynamic_pruebaconsumo WHERE idprueba = ?', [idprueba]);
    console.log('Query result:', rows[0]);

    // 4. Delete the test record
    console.log('4. Deleting test record...');
    await pool.execute('DELETE FROM Dynamic_pruebaconsumo WHERE idprueba = ?', [idprueba]);
    console.log('Delete successful.');

    console.log('--- All Flow Tests Passed! ---');
  } catch (err) {
    console.error('Flow test failed:', err);
  } finally {
    process.exit(0);
  }
}

testFlow();
