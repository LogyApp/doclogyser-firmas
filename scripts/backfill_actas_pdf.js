const pool = require('../src/services/db');
const { regenerarPDFActa } = require('../src/services/actas');

const CONCURRENCY = 4; // 4 concurrent workers para renderizado y subida segura

async function main() {
  console.log('=== INICIANDO BACKFILL DE ACTAS FIRMADAS SIN PDF ===\n');

  const [rows] = await pool.execute(
    `SELECT IdActa, identificacion, Categoria, Url_Firma, Url_Acta
     FROM Dynamic_Actas
     WHERE Estado = 'Firmada' AND (Url_Acta IS NULL OR Url_Acta = '')
     ORDER BY IdActa ASC`
  );

  const total = rows.length;
  console.log(`Total de actas pendientes a procesar: ${total}\n`);

  if (total === 0) {
    console.log('No hay actas pendientes por procesar. Finalizado.');
    process.exit(0);
  }

  const startTime = Date.now();
  let completed = 0;
  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const errors = [];

  let currentIndex = 0;

  async function worker(workerId) {
    while (currentIndex < rows.length) {
      const idx = currentIndex++;
      const row = rows[idx];

      try {
        const res = await regenerarPDFActa(row.IdActa, { force: false });
        completed++;
        if (res.skipped) {
          skippedCount++;
          console.log(`[${completed}/${total}] [W${workerId}] Acta #${row.IdActa} (Doc: ${row.identificacion}) -> OMITIDA (Ya tenía PDF)`);
        } else {
          successCount++;
          console.log(`[${completed}/${total}] [W${workerId}] Acta #${row.IdActa} (Doc: ${row.identificacion}, ${row.Categoria}) -> OK: ${res.urlActa}`);
        }
      } catch (err) {
        completed++;
        errorCount++;
        errors.push({ idActa: row.IdActa, identificacion: row.identificacion, error: err.message });
        console.error(`[${completed}/${total}] [W${workerId}] Acta #${row.IdActa} -> ERROR: ${err.message}`);
      }
    }
  }

  const workers = [];
  for (let i = 1; i <= CONCURRENCY; i++) {
    workers.push(worker(i));
  }

  await Promise.all(workers);

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  const durationMin = (durationSec / 60).toFixed(1);

  console.log('\n=== RESUMEN DE EJECUCIÓN ===');
  console.log(`Total procesadas: ${completed}/${total}`);
  console.log(`Exitosas:         ${successCount}`);
  console.log(`Omitidas:         ${skippedCount}`);
  console.log(`Errores:          ${errorCount}`);
  console.log(`Tiempo total:     ${durationSec}s (~${durationMin} min)`);

  if (errors.length > 0) {
    console.log('\nDetalle de errores:');
    errors.forEach(e => console.log(` - Acta #${e.idActa} (Doc: ${e.identificacion}): ${e.error}`));
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Error fatal en el proceso:', err);
  process.exit(1);
});
