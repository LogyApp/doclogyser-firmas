require('dotenv').config();
const pool = require('../src/services/db');

async function test() {
  try {
    const [rows1] = await pool.execute(`
      SELECT Trabajador FROM Maestro_Segmentación 
      WHERE Trabajador LIKE '%london%' LIMIT 2
    `);
    console.log('Search for "london" returned:', rows1);

    const [rows2] = await pool.execute(`
      SELECT Trabajador FROM Maestro_Segmentación 
      WHERE Trabajador LIKE '%londoño%' LIMIT 2
    `);
    console.log('Search for "londoño" returned:', rows2);

    const [rows3] = await pool.execute(`
      SELECT Trabajador FROM Maestro_Segmentación 
      WHERE Trabajador COLLATE utf8mb4_general_ci LIKE '%london%' LIMIT 2
    `);
    console.log('Search for "london" COLLATE utf8mb4_general_ci returned:', rows3);

    const [rows4] = await pool.execute(`
      SELECT Trabajador FROM Maestro_Segmentación 
      WHERE Trabajador COLLATE utf8mb4_general_ci LIKE '%londoño%' LIMIT 2
    `);
    console.log('Search for "londoño" COLLATE utf8mb4_general_ci returned:', rows4);

    const [rows5] = await pool.execute(`
      SELECT Trabajador FROM Maestro_Segmentación 
      WHERE Trabajador COLLATE utf8mb4_general_ci LIKE '%londono%' LIMIT 2
    `);
    console.log('Search for "londono" COLLATE utf8mb4_general_ci returned:', rows5);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
test();
