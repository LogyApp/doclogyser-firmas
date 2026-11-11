-- Directorio corporativo · pestaña "Tickets": todos los tickets (Dynamic_Tickets) de todos los
-- módulos, con filtros. Abierta a cualquier usuario registrado (Rol "Todos"). Quien puso el ticket
-- puede editarlo (lápiz) mientras esté En Proceso o Pendiente; los demás solo lo ven.
-- El botón 🎫 de cada módulo enlaza aquí para ver tickets de quincenas anteriores.
-- Se puede ejecutar más de una vez.

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'directorio', 'Tickets', 'Todos', 1, 'Tickets', '/directorio-corporativo?tab=tickets', 2, '🎫',
       'Todos los tickets de todos los módulos con filtros. Rol "Todos": lo ve cualquier usuario registrado; quien puso el ticket lo edita mientras esté En Proceso o Pendiente.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'directorio' AND Seccion = 'Tickets');
