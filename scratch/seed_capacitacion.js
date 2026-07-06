require('dotenv').config();
const pool = require('../src/services/db');
const { v4: uuidv4 } = require('uuid');

async function run() {
  try {
    console.log('Insertando plantilla inicial de capacitacionsst...');

    // Verificar si ya existe alguna plantilla activa
    const [existing] = await pool.execute('SELECT id_plantilla FROM Maestro_capacitacionsst_plantilla LIMIT 1');
    if (existing.length > 0) {
      console.log('Ya existe una plantilla en la base de datos. Saltando siembra inicial.');
      return;
    }

    const idPlantilla = uuidv4();
    const tema = 'Protección de Pies y Extremidades Inferiores, importancia del calzado de seguridad riesgos por caída de objetos, orden y aseo en áreas de trabajo y prevención de resbalones, tropezones y caídas';
    const objetivo = 'Capacitar a los trabajadores sobre la importancia de la protección de los pies y extremidades inferiores, mediante la identificación de los riesgos presentes en las actividades laborales, el uso adecuado del calzado de seguridad y la adopción de prácticas seguras de orden y aseo, con el fin de prevenir accidentes por caída de objetos, resbalones, tropezones y caídas';

    // Insertar la plantilla
    await pool.execute(
      `INSERT INTO Maestro_capacitacionsst_plantilla (id_plantilla, version, tema, objetivo, activo, usuario_creador)
       VALUES (?, 1, ?, ?, 1, 'Sistema')`,
      [idPlantilla, tema, objetivo]
    );

    // Preguntas e ítems
    const items = [
      // Pregunta 1
      { pregunta: 1, desc: '¿Cuál es la principal función del calzado de seguridad?', opcion: 'Mejorar la apariencia del trabajador.', correcta: null },
      { pregunta: 1, desc: '¿Cuál es la principal función del calzado de seguridad?', opcion: 'Proteger los pies de impactos, golpes y accidentes.', correcta: 'SI' },
      { pregunta: 1, desc: '¿Cuál es la principal función del calzado de seguridad?', opcion: 'Mantener los pies calientes.', correcta: null },
      { pregunta: 1, desc: '¿Cuál es la principal función del calzado de seguridad?', opcion: 'Facilitar el desplazamiento rápido.', correcta: null },

      // Pregunta 2
      { pregunta: 2, desc: '¿Qué riesgo puede generar la caída de objetos en el área de trabajo?', opcion: 'Daños en los equipos de oficina.', correcta: null },
      { pregunta: 2, desc: '¿Qué riesgo puede generar la caída de objetos en el área de trabajo?', opcion: 'Lesiones graves en los pies.', correcta: 'SI' },
      { pregunta: 2, desc: '¿Qué riesgo puede generar la caída de objetos en el área de trabajo?', opcion: 'Pérdida de documentos.', correcta: null },
      { pregunta: 2, desc: '¿Qué riesgo puede generar la caída de objetos en el área de trabajo?', opcion: 'Retrasos en la operación.', correcta: null },

      // Pregunta 3
      { pregunta: 3, desc: '¿Por qué es importante mantener el orden y aseo en las áreas de trabajo?', opcion: 'Para reducir riesgos y mejorar la productividad.', correcta: 'SI' },
      { pregunta: 3, desc: '¿Por qué es importante mantener el orden y aseo en las áreas de trabajo?', opcion: 'Para disminuir el número de trabajadores.', correcta: null },
      { pregunta: 3, desc: '¿Por qué es importante mantener el orden y aseo en las áreas de trabajo?', opcion: 'Para aumentar el ruido en la operación.', correcta: null },
      { pregunta: 3, desc: '¿Por qué es importante mantener el orden y aseo en las áreas de trabajo?', opcion: 'Para evitar inspecciones.', correcta: null },

      // Pregunta 4
      { pregunta: 4, desc: '¿Cuál de las siguientes situaciones puede provocar resbalones, tropezones y caídas?', opcion: 'Uso adecuado del EPP.', correcta: null },
      { pregunta: 4, desc: '¿Cuál de las siguientes situaciones puede provocar resbalones, tropezones y caídas?', opcion: 'Áreas limpias y organizadas.', correcta: null },
      { pregunta: 4, desc: '¿Cuál de las siguientes situaciones puede provocar resbalones, tropezones y caídas?', opcion: 'Pisos húmedos, obstáculos y cables sueltos.', correcta: 'SI' },
      { pregunta: 4, desc: '¿Cuál de las siguientes situaciones puede provocar resbalones, tropezones y caídas?', opcion: 'Señalización de seguridad.', correcta: null },

      // Pregunta 5
      { pregunta: 5, desc: '¿Qué acción ayuda a prevenir accidentes relacionados con la protección de los pies?', opcion: 'Ignorar los riesgos del área.', correcta: null },
      { pregunta: 5, desc: '¿Qué acción ayuda a prevenir accidentes relacionados con la protección de los pies?', opcion: 'Utilizar siempre el calzado de seguridad y mantener el área ordenada.', correcta: 'SI' },
      { pregunta: 5, desc: '¿Qué acción ayuda a prevenir accidentes relacionados con la protección de los pies?', opcion: 'Correr dentro de las instalaciones.', correcta: null },
      { pregunta: 5, desc: '¿Qué acción ayuda a prevenir accidentes relacionados con la protección de los pies?', opcion: 'Dejar herramientas y materiales en los pasillos.', correcta: null }
    ];

    for (const item of items) {
      await pool.execute(
        `INSERT INTO Maestro_capacitacionsst_plantilla_items (id_plantilla, pregunta, descripcion_pregunta, opcion, correcta)
         VALUES (?, ?, ?, ?, ?)`,
        [idPlantilla, item.pregunta, item.desc, item.opcion, item.correcta]
      );
    }

    console.log('✓ Plantilla inicial insertada con éxito.');
  } catch (err) {
    console.error('Error al sembrar plantilla inicial:', err);
  } finally {
    await pool.end();
  }
}

run();
