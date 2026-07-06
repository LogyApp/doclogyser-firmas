try {
  console.log('Probando importación de módulo de Participacion...');
  const router = require('../src/routes/participacion');
  console.log('✓ Módulo de Participacion importado correctamente.');
  process.exit(0);
} catch (err) {
  console.error('❌ Error durante la verificación:', err);
  process.exit(1);
}
