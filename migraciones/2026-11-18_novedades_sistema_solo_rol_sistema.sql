-- Novedades con Evento = 'Sistema' en Config_Asistencia (Nuevo, Retirado, Traslado): las pone el
-- relleno automático (rellenoAsistencia.js) y solo el rol Sistema puede verlas y registrarlas a mano.
-- Antes: 'Nomina, Sistema'. Se puede ejecutar más de una vez.

UPDATE Config_Parametros
   SET Parametro = 'Sistema',
       Descripcion = 'Roles que pueden ver y registrar a mano las novedades con Evento = Sistema en Config_Asistencia (Nuevo, Retirado, Traslado). Esas novedades las pone el sistema según las fechas de ingreso, retiro y traslado; si se registran a mano y no coinciden con esas fechas, el relleno automático las borra. Vacío = solo Sistema.'
 WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Ver_Novedades_Sistema';

SELECT Concepto, Parametro FROM Config_Parametros
 WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Ver_Novedades_Sistema';
