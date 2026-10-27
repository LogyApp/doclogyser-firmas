-- 2026-10-27: Pestaña Parámetros en el módulo de Inventario
-- Solo los roles Sistema e Inventario pueden acceder a esta pestaña (Acceso 1, Orden 10)

INSERT INTO Maestro_Menu (Modulo, Seccion, Etiqueta, Rol, Acceso, Orden, Icono, Url)
SELECT 'inventario', 'Parametros', 'Parámetros', 'Inventario, Sistema', 1, 10, '⚙', '/inventario?tab=parametros'
WHERE NOT EXISTS (
  SELECT 1 FROM Maestro_Menu WHERE Modulo = 'inventario' AND Seccion = 'Parametros' AND Acceso = 1
);
