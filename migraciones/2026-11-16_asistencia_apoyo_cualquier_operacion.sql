-- Asistencia y Novedades › Ingresar Evento: roles que pueden escoger cualquier operación en
-- "Apoyo a Otra Operación" (novedad) y en Asistencia con "Es apoyo de otra operación".
-- Los demás roles solo ven las operaciones de la misma regional (nomina-asistencia.js).
-- Solo agrega filas. Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Asistencia', 'Roles_Apoyo_Cualquier_Operacion', 'Roles', 'Nomina, Sistema',
       'Roles que, al ingresar un evento de "Apoyo a Otra Operación" o una Asistencia marcada como apoyo de otra operación, pueden escoger cualquier operación activa, sin limitarse a la regional de la operación escogida. Los demás roles solo ven las operaciones de la misma regional. Si se deja vacío, nadie tiene esta excepción.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Apoyo_Cualquier_Operacion');

SELECT Concepto, Condicion, Parametro FROM Config_Parametros
 WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Apoyo_Cualquier_Operacion';
