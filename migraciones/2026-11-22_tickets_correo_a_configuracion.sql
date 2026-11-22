-- Tickets: el interruptor del correo de calificación pasa de directorio / Tickets a configuracion / Tickets,
-- junto a los demás parámetros de tickets. Conserva el valor que tenga. Se puede ejecutar más de una vez.

UPDATE Config_Parametros
   SET Modulo = 'configuracion'
 WHERE Modulo = 'directorio' AND Seccion = 'Tickets'
   AND Concepto = 'Habilitar notificaciones de correo en Tickets'
   AND NOT EXISTS (
     SELECT 1 FROM (
       SELECT 1 FROM Config_Parametros
        WHERE Modulo = 'configuracion' AND Seccion = 'Tickets'
          AND Concepto = 'Habilitar notificaciones de correo en Tickets'
     ) ya
   );
