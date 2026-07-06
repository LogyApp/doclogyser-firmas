const fs = require('fs');
const path = require('path');
const { renderPDF } = require('../src/services/capacitacionPdfGenerator');

async function test() {
  try {
    console.log('Probando generación de PDF...');
    
    const mockEv = {
      fecha: new Date(),
      tema: 'Protección de Pies y Extremidades Inferiores, importancia del calzado de seguridad riesgos por caída de objetos, orden y aseo en áreas de trabajo y prevención de resbalones, tropezones y caídas',
      objetivo: 'Capacitar a los trabajadores sobre la importancia de la protección de los pies y extremidades inferiores, mediante la identificación de los riesgos presentes en las actividades laborales, el uso adecuado del calzado de seguridad y la adopción de prácticas seguras de orden y aseo, con el fin de prevenir accidentes por caída de objetos, resbalones, tropezones y caídas',
      identificacion: '1117517812',
      puntaje: 4,
      resultado: 'APROBADO',
      firma_trabajador: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' // 1x1 transparent png
    };

    const mockVin = {
      Trabajador: 'WILLIAM ORLANDO PAREDES LEAL'
    };

    const mockItems = [
      { pregunta: 1, descripcion_pregunta: '¿Cuál es la principal función del calzado de seguridad?', opcion: 'Proteger los pies de impactos, golpes y accidentes.', correcta: 'SI', seleccionada: 'SI' },
      { pregunta: 1, descripcion_pregunta: '¿Cuál es la principal función del calzado de seguridad?', opcion: 'Mejorar la apariencia del trabajador.', correcta: null, seleccionada: null },
      { pregunta: 2, descripcion_pregunta: '¿Qué riesgo puede generar la caída de objetos en el área de trabajo?', opcion: 'Lesiones graves en los pies.', correcta: 'SI', seleccionada: 'SI' },
      { pregunta: 2, descripcion_pregunta: '¿Qué riesgo puede generar la caída de objetos en el área de trabajo?', opcion: 'Pérdida de documentos.', correcta: null, seleccionada: null }
    ];

    const pdfBuffer = await renderPDF(mockEv, mockVin, 'Sistema', mockItems);
    
    const outputPath = path.join(__dirname, 'test_capacitacion.pdf');
    fs.writeFileSync(outputPath, pdfBuffer);
    
    console.log(`✓ PDF generado exitosamente en: ${outputPath}`);
  } catch (err) {
    console.error('Error generando PDF:', err);
  }
}

test();
