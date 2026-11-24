-- Corrección de coordenadas y asistencia de Italcol Villavicencio:
-- 1. Respaldo de los registros de asistencia afectados antes de la modificación.
-- 2. Actualización de coordenadas reales en Maestro_Operaciones y facial_sedes (4.06665840, -73.53248760).
-- 3. Reasignación del Punto 36 de Maestro_Operaciones_Puntos a Italcol Villavicencio (planta Rancho Chicha).
-- 4. Corrección de asistencia del 23 y 24 de noviembre para los 3 trabajadores (de AOO a SI en Italcol Villavicencio).
-- 5. Eliminación de los 5 registros espurios de apoyo en Éxito Satelites (ya respaldados).
-- 6. Actualización de horas de entrada, salida y tiempo laborado según facial_marcaciones.
-- Idempotente.

-- 1. Tabla de respaldo de seguridad
CREATE TABLE IF NOT EXISTS `backup_asistencia_italcol_villavicencio_20261124` AS
SELECT * FROM Dynamic_Asistencia
 WHERE `Cédula` IN (1087185660, 1121823327, 1123142108)
   AND `Día` IN ('2026-11-23', '2026-11-24');

-- 2. Coordenadas reales de Italcol Villavicencio en Maestro_Operaciones
UPDATE Maestro_Operaciones
   SET LATITUD = '4.06665840',
       LONGITUD = '-73.53248760'
 WHERE `OPERACIÓN` = 'Italcol Villavicencio';

-- 3. Coordenadas en facial_sedes para la app móvil del biométrico
UPDATE facial_sedes
   SET latitud = 4.06665840,
       longitud = -73.53248760
 WHERE lugar = 'Italcol Villavicencio';

-- 4. Reasignar Punto 36 de Maestro_Operaciones_Puntos a Italcol Villavicencio
UPDATE Maestro_Operaciones_Puntos
   SET operacion = 'Italcol Villavicencio',
       nombre_punto = 'Italcol Villavicencio - Planta Rancho Chicha',
       observaciones = 'Corregido: Planta de Italcol Villavicencio en Rancho Chicha, no corresponde a Éxito Satelites'
 WHERE id = 36;

-- 5. Actualizar registros en Italcol Villavicencio de AOO a Asistencia (SI)
UPDATE Dynamic_Asistencia
   SET `Prefijo Novedad` = 'SI',
       Novedad = 'Asistencia',
       `Apoyo Otra Operación` = 'NO'
 WHERE `Cédula` IN (1087185660, 1121823327, 1123142108)
   AND `Día` IN ('2026-11-23', '2026-11-24')
   AND `Operación` = 'Italcol Villavicencio'
   AND `Prefijo Novedad` = 'AOO';

-- 6. Eliminar registros duplicados espurios en Éxito Satelites (respaldados en el paso 1)
DELETE FROM Dynamic_Asistencia
 WHERE `Cédula` IN (1087185660, 1121823327, 1123142108)
   AND `Día` IN ('2026-11-23', '2026-11-24')
   AND `Operación` = 'Éxito Satelites'
   AND `Apoyo Otra Operación` = 'SI';

-- 7. Rellenar horas de entrada, salida y tiempo laborado según facial_marcaciones:
-- Día 23 de noviembre:
UPDATE Dynamic_Asistencia
   SET `Hora Llegada` = '06:48:46',
       `Hora Salida` = '15:47:22',
       `Tiempo Laborado` = '08:58:36',
       `Operación a la que Apoya` = NULL,
       Observaciones = 'Biométrico | Entrada 06:48:46 | Salida 15:47:22'
 WHERE `Cédula` = 1087185660
   AND `Día` = '2026-11-23'
   AND `Operación` = 'Italcol Villavicencio';

UPDATE Dynamic_Asistencia
   SET `Hora Llegada` = '06:50:51',
       `Hora Salida` = '15:49:23',
       `Tiempo Laborado` = '08:58:32',
       `Operación a la que Apoya` = NULL,
       Observaciones = 'Biométrico | Entrada 06:50:51 | Salida 15:49:23'
 WHERE `Cédula` = 1121823327
   AND `Día` = '2026-11-23'
   AND `Operación` = 'Italcol Villavicencio';

UPDATE Dynamic_Asistencia
   SET `Hora Llegada` = '07:03:16',
       `Hora Salida` = '15:46:16',
       `Tiempo Laborado` = '08:43:00',
       `Operación a la que Apoya` = NULL,
       Observaciones = 'Biométrico | Entrada 07:03:16 | Salida 15:46:16'
 WHERE `Cédula` = 1123142108
   AND `Día` = '2026-11-23'
   AND `Operación` = 'Italcol Villavicencio';

-- Día 24 de noviembre (jornada en curso):
UPDATE Dynamic_Asistencia
   SET `Hora Llegada` = '06:47:46',
       `Operación a la que Apoya` = NULL,
       Observaciones = 'Biométrico | Entrada 06:47:46'
 WHERE `Cédula` = 1087185660
   AND `Día` = '2026-11-24'
   AND `Operación` = 'Italcol Villavicencio';

UPDATE Dynamic_Asistencia
   SET `Hora Llegada` = '07:04:52',
       `Operación a la que Apoya` = NULL,
       Observaciones = 'Biométrico | Entrada 07:04:52'
 WHERE `Cédula` = 1121823327
   AND `Día` = '2026-11-24'
   AND `Operación` = 'Italcol Villavicencio';

UPDATE Dynamic_Asistencia
   SET `Hora Llegada` = '07:25:31',
       `Operación a la que Apoya` = NULL
 WHERE `Cédula` = 1123142108
   AND `Día` = '2026-11-24'
   AND `Operación` = 'Italcol Villavicencio';
