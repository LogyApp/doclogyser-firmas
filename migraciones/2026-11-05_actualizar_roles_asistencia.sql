-- Migración: Actualizar permisos de roles y URL para Asistencia y Novedades
-- Fecha: 2026-11-05

UPDATE Maestro_Menu
SET 
  Rol = 'Sistema, Nomina, Control, Juridica, Asistencial, Contratación, Directorth, LiderSst, AdmSst, Contabilidad, Generalista, Calidad',
  Url = '/nomina?tab=asistenciaynovedades',
  Etiqueta = 'Asistencia y Novedades'
WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Acceso = 1;

UPDATE Maestro_Menu
SET 
  Rol = 'AuxiliarR, CoordinadorR, AuxSst',
  Url = '/nomina?tab=asistenciaynovedades',
  Etiqueta = 'Asistencia y Novedades'
WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Acceso = 2;

UPDATE Maestro_Menu
SET 
  Rol = 'Auxiliar, Coordinador, Lider, Lider 1, Lider 2, Lider 3, AnaSst',
  Url = '/nomina?tab=asistenciaynovedades',
  Etiqueta = 'Asistencia y Novedades'
WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Acceso = 3;
