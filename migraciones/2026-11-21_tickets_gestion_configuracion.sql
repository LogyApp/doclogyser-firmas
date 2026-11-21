-- Tickets: se resuelven en Configuración › Tickets (cualquier módulo); el Directorio › Tickets
-- queda solo con los tickets de cada usuario. Se puede ejecutar más de una vez.

-- 1. Pestaña Tickets del módulo Configuración (solo Sistema)
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'configuracion', 'Tickets', 'Sistema', 1, 'Tickets', '/configuracion?tab=tickets', 3, '🎫',
       'Tickets de todos los módulos: pasarlos a Pendiente, Rechazado o Resuelto con la respuesta para quien lo puso.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'configuracion' AND Seccion = 'Tickets');

-- 2. Quién resuelve tickets de cualquier módulo
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'configuracion', 'Tickets', 'Roles que pueden resolver tickets', 'Rol', 'Sistema',
       'Roles que, en Configuración › Tickets, ven los tickets de todos los módulos y los pasan a Pendiente, Rechazado o Resuelto con la respuesta. Si se deja vacía, nadie los resuelve; si la fila no existe, solo Sistema.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'configuracion' AND Seccion = 'Tickets' AND Concepto = 'Roles que pueden resolver tickets');

-- 3. Descripción de la pestaña Tickets del Directorio (ahora solo los tickets del usuario)
UPDATE Maestro_Menu
   SET Descripcion = 'Tickets que puso el usuario desde cualquier módulo, con filtros. Los edita mientras estén En Proceso o Pendiente. Se resuelven en Configuración › Tickets.'
 WHERE Modulo = 'directorio' AND Seccion = 'Tickets';

-- 4. Filas que ya no usa el código (directorio / Tickets). Se borran con confirmación de William.
-- DELETE FROM Config_Parametros
--  WHERE Modulo = 'directorio' AND Seccion = 'Tickets'
--    AND Concepto IN ('Resolver tickets', 'Roles que ven todos los tickets');
