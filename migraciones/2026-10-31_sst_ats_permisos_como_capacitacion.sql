-- SST > ATS: mismos permisos de Maestro_Menu que Capacitación SST.
--   Acceso 1: AdmSst, LiderSst, Sistema · Acceso 3: AuxSst · Acceso 4: AnaSst
-- Quita el acceso a ATS de Auxiliar, AuxiliarR, Coordinador y CoordinadorR, y AuxSst pasa del
-- acceso 2 (regional) al 3 (operación). Confirmado por William el 2026-10-31.
-- Respaldo de las filas anteriores: respaldos/2026-10-31_respaldo_maestro_menu_sst_ats.sql
-- Se puede ejecutar más de una vez (al final quedan las 3 filas iguales a Capacitación SST).

-- Acceso 1: igual al de Capacitación SST
UPDATE Maestro_Menu m
JOIN (SELECT Rol FROM Maestro_Menu WHERE Modulo = 'sst' AND Seccion = 'Capacitación SST' AND Acceso = 1 LIMIT 1) c
SET m.Rol = c.Rol
WHERE m.Modulo = 'sst' AND m.Seccion = 'ATS' AND m.Acceso = 1;

-- Se quitan las filas de ATS de los accesos 2 y 3 que no existen igual en Capacitación SST
DELETE FROM Maestro_Menu WHERE Modulo = 'sst' AND Seccion = 'ATS' AND Acceso IN (2, 3);

-- Acceso 3 y 4: se copian de Capacitación SST (con la etiqueta, url, orden e ícono de ATS)
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'sst', 'ATS', c.Rol, c.Acceso, 'ATS', '/sst?tab=ats', 10, '＋', 'Análisis de Trabajo Seguro (ATS) semanal.'
FROM Maestro_Menu c
WHERE c.Modulo = 'sst' AND c.Seccion = 'Capacitación SST' AND c.Acceso IN (3, 4)
  AND NOT EXISTS (SELECT 1 FROM (SELECT * FROM Maestro_Menu) a
                  WHERE a.Modulo = 'sst' AND a.Seccion = 'ATS' AND a.Acceso = c.Acceso);

-- La fila de acceso 4 que ya existía queda con el rol de Capacitación SST
UPDATE Maestro_Menu m
JOIN (SELECT Rol FROM Maestro_Menu WHERE Modulo = 'sst' AND Seccion = 'Capacitación SST' AND Acceso = 4 LIMIT 1) c
SET m.Rol = c.Rol
WHERE m.Modulo = 'sst' AND m.Seccion = 'ATS' AND m.Acceso = 4;

-- Verificación: ATS y Capacitación SST lado a lado
SELECT Seccion, Acceso, Rol FROM Maestro_Menu
WHERE Modulo = 'sst' AND Seccion IN ('ATS', 'Capacitación SST')
ORDER BY Acceso, Seccion;
