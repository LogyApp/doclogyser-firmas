-- Migración: Habilitar la pestaña "Asistencia y Novedades" en el módulo de Nómina (Maestro_Menu)
-- y configurar parámetros iniciales en Config_Parametros.
-- Fecha: 2026-11-05

-- 1. Pestaña en Maestro_Menu (Nómina)
-- Acceso 1 (General, ve todas las operaciones)
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
VALUES (
  'nomina',
  'Asistencia',
  'Asistencial, Contratación, Control, Juridica, Nomina, Sistema, LiderSst, Directorth',
  1,
  'Asistencia y Novedades',
  '/nomina?tab=asistencia',
  5,
  '⏱',
  'Registro de asistencia diaria por operación y reporte de novedades por fechas (incapacidades, descansos, permisos).'
)
ON DUPLICATE KEY UPDATE
  Etiqueta = VALUES(Etiqueta),
  Url = VALUES(Url),
  Orden = VALUES(Orden),
  Icono = VALUES(Icono),
  Descripcion = VALUES(Descripcion);

-- Acceso 2 (Regional, ve las operaciones de su Regional)
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
VALUES (
  'nomina',
  'Asistencia',
  'AuxiliarR, CoordinadorR',
  2,
  'Asistencia y Novedades',
  '/nomina?tab=asistencia',
  5,
  '⏱',
  'Registro de asistencia diaria y novedades para las operaciones de la regional asignada.'
)
ON DUPLICATE KEY UPDATE
  Etiqueta = VALUES(Etiqueta),
  Url = VALUES(Url),
  Orden = VALUES(Orden),
  Icono = VALUES(Icono),
  Descripcion = VALUES(Descripcion);

-- Acceso 3 (Operación, ve su operación o dispositivo)
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
VALUES (
  'nomina',
  'Asistencia',
  'Auxiliar, Coordinador',
  3,
  'Asistencia y Novedades',
  '/nomina?tab=asistencia',
  5,
  '⏱',
  'Registro de asistencia diaria y novedades para la operación local.'
)
ON DUPLICATE KEY UPDATE
  Etiqueta = VALUES(Etiqueta),
  Url = VALUES(Url),
  Orden = VALUES(Orden),
  Icono = VALUES(Icono),
  Descripcion = VALUES(Descripcion);

-- 2. Parámetros de configuración en Config_Parametros
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Asistencia', 'Dias_Maximos_Pasados', 'General', '15',
       'Número máximo de días hacia atrás permitidos para registrar asistencia o novedades en nómina.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Dias_Maximos_Pasados'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Asistencia', 'Dias_Maximos_Futuros_Novedades', 'General', '30',
       'Número máximo de días hacia el futuro permitidos para programar novedades como vacaciones o licencias.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Dias_Maximos_Futuros_Novedades'
);
