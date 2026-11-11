-- Directorio corporativo › pestaña Tickets
-- 1) Maestro_Menu: la pestaña la ve cualquier usuario registrado (Rol "Todos").
-- 2) Config_Parametros: roles que ven los tickets de TODOS los usuarios. Los demás solo ven
--    los tickets que ellos mismos pusieron. Si la fila no existe, el código usa "Sistema".
-- Se puede ejecutar más de una vez.

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'directorio', 'Tickets', 'Todos', 1, 'Tickets', '/directorio-corporativo?tab=tickets', 2, '🎫',
       'Tickets de todos los módulos con filtros. Rol "Todos": cada usuario ve solo los tickets que puso (y los edita mientras estén En Proceso o Pendiente); los roles de Config_Parametros directorio / Tickets ven los de todos.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'directorio' AND Seccion = 'Tickets');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'directorio', 'Tickets', 'Roles que ven todos los tickets', 'Rol', 'Sistema',
       'Roles que, en Directorio corporativo › Tickets, ven los tickets de todos los usuarios y módulos. Los demás roles solo ven los tickets que ellos pusieron. Lista separada por coma. Si se deja vacío, nadie ve los de otros.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'directorio' AND Seccion = 'Tickets' AND Concepto = 'Roles que ven todos los tickets');
