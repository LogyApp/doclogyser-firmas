-- Directorio corporativo › Tickets: quién resuelve tickets (Pendiente / Rechazado / Resuelto con respuesta),
-- igual que el Rol Facturación en la pestaña Tickets de Facturación (src/routes/tickets.js).
-- Una fila por Rol: Condicion = Rol, Parametro = módulos cuyos tickets resuelve (separados por coma) o "Todos".
-- Quien resuelve también ve los tickets de esos módulos. Para dar el permiso a otro rol se agrega otra fila,
-- por ejemplo Condicion 'Nomina', Parametro 'Nomina, Asistencia'.
-- Solo agrega filas. Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'directorio', 'Tickets', 'Resolver tickets', 'Sistema', 'Todos',
       'Módulos cuyos tickets puede resolver el Rol de la Condición desde Directorio › Tickets (botón Gestionar: Pendiente, Rechazado o Resuelto con respuesta). Lista separada por coma (ej. Servicios, Asistencia) o Todos. Quien resuelve también ve los tickets de esos módulos. Una fila por Rol; si no hay ninguna fila, solo Sistema resuelve todos.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'directorio' AND Seccion = 'Tickets' AND Concepto = 'Resolver tickets' AND Condicion = 'Sistema');

SELECT Concepto, Condicion, Parametro FROM Config_Parametros
 WHERE Modulo = 'directorio' AND Seccion = 'Tickets';
