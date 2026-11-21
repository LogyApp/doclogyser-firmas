-- Calificación de tickets (1 a 5 y comentarios) por parte de quien puso el ticket.
-- Al pasar un ticket a Resuelto o Rechazado se le genera un token: con él se califica desde el
-- enlace del correo (sin iniciar sesión) y el botón "Mis tickets" lo muestra pendiente por calificar.
-- La calificación queda en las columnas que ya existían: satisfaccion y sugerencia.
-- Se puede ejecutar más de una vez.

SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Tickets' AND COLUMN_NAME = 'token_calificacion'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE Dynamic_Tickets ADD COLUMN token_calificacion VARCHAR(64) NULL DEFAULT NULL',
  'SELECT "Columna token_calificacion ya existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Tickets' AND COLUMN_NAME = 'fecha_calificacion'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE Dynamic_Tickets ADD COLUMN fecha_calificacion DATETIME NULL DEFAULT NULL',
  'SELECT "Columna fecha_calificacion ya existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @existe := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Tickets' AND INDEX_NAME = 'idx_tk_token_calificacion'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE Dynamic_Tickets ADD INDEX idx_tk_token_calificacion (token_calificacion)',
  'SELECT "Indice idx_tk_token_calificacion ya existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'directorio', 'Tickets', 'Habilitar notificaciones de correo en Tickets', 'Booleano', '0',
       'Si es 1, al pasar un ticket a Resuelto o Rechazado se envía un correo a quien lo puso (Email de Maestro_Usuarios) para que califique la atención de 1 a 5. Con 0 no se envía el correo, pero el ticket igual queda pendiente por calificar en Mis tickets.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'directorio' AND Seccion = 'Tickets' AND Concepto = 'Habilitar notificaciones de correo en Tickets'
);
