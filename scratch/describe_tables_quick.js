const db = require('../src/services/db');

(async () => {
  try {
    const [c1] = await db.query('DESCRIBE `Maestro_Segmentación`');
    console.log('Segmentacion:', c1.map(c => c.Field));
    const [c2] = await db.query('DESCRIBE `Maestro_Vinculación`');
    console.log('Vinculacion:', c2.map(c => c.Field));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
})();
