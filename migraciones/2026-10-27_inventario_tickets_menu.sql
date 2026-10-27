-- Migración: Agregar pestaña Tickets al módulo de Inventario en Maestro_Menu
-- Fecha: 2026-10-27
-- Autor: Asistente IA (solicitud de William)
-- Regla: Ubicar Tickets antes de Parámetros (Tickets = Orden 10, Parámetros = Orden 11)
-- Roles con acceso y resolución: Inventario, Sistema

-- 1. Actualizar el orden de Parámetros a 11 si tiene 10
UPDATE Maestro_Menu 
SET Orden = 11 
WHERE Modulo = 'inventario' AND Seccion = 'Parametros' AND Orden = 10;

-- 2. Insertar Tickets con Orden 10 si no existe
INSERT INTO Maestro_Menu (Modulo, Seccion, Etiqueta, Rol, Acceso, Orden, Icono, Url, Descripcion)
SELECT 'inventario', 'Tickets', 'Tickets', 'Inventario, Sistema', 1, 10, '🎫', '/inventario?tab=tickets', 'Tickets de soporte del módulo de Inventario.'
WHERE NOT EXISTS (
  SELECT 1 FROM Maestro_Menu WHERE Modulo = 'inventario' AND Seccion = 'Tickets'
);
