-- RESPALDO de las filas de Maestro_Menu (Modulo 'sst', Seccion 'ATS') antes de igualarlas a
-- Capacitación SST (generado el 2026-10-31). NO es una migración: solo se ejecuta si hay que
-- restaurar los permisos anteriores de ATS.

DELETE FROM Maestro_Menu WHERE Modulo = 'sst' AND Seccion = 'ATS';
INSERT INTO Maestro_Menu (ID, Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion) VALUES
  (239, 'sst', 'ATS', 'AdmSst, LiderSst, Sistema', 1, 'ATS', '/sst?tab=ats', 10, '＋', 'Análisis de Trabajo Seguro (ATS) semanal.'),
  (240, 'sst', 'ATS', 'AuxiliarR, CoordinadorR, AuxSst', 2, 'ATS', '/sst?tab=ats', 10, '＋', 'Análisis de Trabajo Seguro (ATS) semanal.'),
  (241, 'sst', 'ATS', 'Auxiliar, Coordinador', 3, 'ATS', '/sst?tab=ats', 10, '＋', 'Análisis de Trabajo Seguro (ATS) semanal.'),
  (242, 'sst', 'ATS', 'AnaSst', 4, 'ATS', '/sst?tab=ats', 10, '＋', 'Análisis de Trabajo Seguro (ATS) semanal.');
