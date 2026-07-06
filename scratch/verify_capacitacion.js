try {
  console.log('Probando importación de modulos de Capacitación SST...');

  console.log('- Importando router...');
  const router = require('../src/routes/capacitacionsst');
  console.log('✓ Router importado correctamente.');

  console.log('- Importando generador de PDF...');
  const pdfGen = require('../src/services/capacitacionPdfGenerator');
  console.log('✓ Generador de PDF importado correctamente.');

  console.log('¡Todas las importaciones y sintaxis están correctas!');
  process.exit(0);
} catch (err) {
  console.error('❌ Error durante la verificación:', err);
  process.exit(1);
}
