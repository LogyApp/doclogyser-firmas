-- Control de quincena de Asistencia (Nómina › Asistencia y Novedades › Control de quincena).
-- Interruptores en Config_Parametros (nomina / Asistencia):
--   Validar_Plantilla_Asistencia: reglas al registrar (reglasAsistencia.js): un registro por persona y día,
--     el destino solo registra la asistencia de quien llega de apoyo y el sistema pone
--     "Apoyo a Otra Operación" en el origen.
--   Relleno_Automatico_Periodico: revisión cada hora de Nuevo / Retirado / Traslado en la quincena actual
--     y la anterior (rellenoAsistencia.js). Queda en NO; se pasa a SI al quitar los triggers
--     (2026-11-14_asistencia_quitar_triggers.sql).
-- Solo agrega filas. Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Asistencia', 'Validar_Plantilla_Asistencia', 'General', 'SI',
       'SI = al registrar asistencia o novedades se valida: una sola fila por persona y día; no se registra en días en que la persona no pertenecía a la operación (antes del ingreso, después del retiro o del traslado); la operación destino solo registra Asistencia a quien llega de apoyo y el sistema pone "Apoyo a Otra Operación" en la operación de origen (reemplaza la asistencia que el origen haya puesto ese día). NO o vacío = sin estas validaciones.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Validar_Plantilla_Asistencia');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Asistencia', 'Relleno_Automatico_Periodico', 'General', 'NO',
       'SI = cada hora el sistema revisa la quincena actual y la anterior y pone o corrige los días de Nuevo, Retirado y Traslado según las fechas de ingreso, retiro y traslado (también los cambios hechos por fuera de la app). No toca días bloqueados por Nómina ni registros aprobados. NO = solo se acomoda al guardar una vinculación, retiro o traslado en la app, o con el botón Acomodar del Control de quincena.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Relleno_Automatico_Periodico');

SELECT Concepto, Parametro FROM Config_Parametros
 WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto IN ('Validar_Plantilla_Asistencia', 'Relleno_Automatico_Periodico');
