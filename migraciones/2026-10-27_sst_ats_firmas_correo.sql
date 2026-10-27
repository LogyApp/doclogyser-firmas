-- SST > ATS: correo de solicitud de firma (con fecha de envío) y anotación de soporte por correo en el PDF.
-- Se puede ejecutar más de una vez. Solo agrega columnas y parámetros (no borra nada).

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_ats_trabajadores' AND COLUMN_NAME = 'fecha_envio_correo');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_ats_trabajadores ADD COLUMN fecha_envio_correo DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_ats' AND COLUMN_NAME = 'fecha_envio_correo_coordinador');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_ats ADD COLUMN fecha_envio_correo_coordinador DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_ats' AND COLUMN_NAME = 'fecha_envio_correo_sst');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_ats ADD COLUMN fecha_envio_correo_sst DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'ATS', 'Habilitar notificaciones de correo en ATS', 'Booleano', '1', '1 = al crear el ATS se envía el correo para firmar a los trabajadores, al coordinador y al responsable SST, y se permite reenviarlo. 0 = no se envían correos.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'ATS' AND Concepto = 'Habilitar notificaciones de correo en ATS');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'ATS', 'Anotación en el PDF para firmas pendientes de ATS', 'Texto', 'Soportado por correo electrónico', 'Texto que aparece en el PDF del ATS en lugar de la firma de quien no ha firmado (trabajadores, coordinador y responsable SST); se agrega la fecha del envío del correo.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'ATS' AND Concepto = 'Anotación en el PDF para firmas pendientes de ATS');

-- Verificación
SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'ATS' ORDER BY Concepto;
SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_NAME IN ('fecha_envio_correo', 'fecha_envio_correo_coordinador', 'fecha_envio_correo_sst')
  AND TABLE_NAME IN ('Dynamic_ats_trabajadores', 'Dynamic_ats');
