-- LogySign: recordatorio automático a los documentos pendientes y preselección de Jurídica.
-- 1. Dynamic_Logysign cuenta los recordatorios automáticos enviados y la fecha del último (también
--    la del último reenvío manual).
-- 2. Config_Parametros CloudDocs / LogySign: cada cuántos días, cuántos como máximo y en qué horario.
-- 3. Documento preseleccionado para Jurídica: Citación a Descargos (CDES), su documento más usado.
-- Solo agrega columnas y filas. Se puede ejecutar más de una vez.

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Logysign' AND COLUMN_NAME = 'recordatorios_enviados');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_Logysign ADD COLUMN recordatorios_enviados INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Logysign' AND COLUMN_NAME = 'ultimo_recordatorio');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_Logysign ADD COLUMN ultimo_recordatorio DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Días entre recordatorios automáticos', '', '3',
       'Días que deben pasar desde el envío (o desde el último recordatorio, automático o manual) para reenviar al trabajador el recordatorio de un documento pendiente con el enlace vigente. Va con copia a quien creó el registro. 0 o vacío: no se envían recordatorios automáticos.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Días entre recordatorios automáticos');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Máximo de recordatorios automáticos', '', '3',
       'Cantidad máxima de recordatorios automáticos por documento pendiente (los reenvíos manuales no cuentan). 0 o vacío: no se envían recordatorios automáticos.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Máximo de recordatorios automáticos');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Horario de recordatorios automáticos', '', '7-19',
       'Horas de Bogotá (inicio-fin, formato 24 h) en que se envían los recordatorios automáticos, por ejemplo 7-19 = de 7:00 a.m. a 7:00 p.m. Vacío o no válido: 7-19.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Horario de recordatorios automáticos');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Documento preseleccionado por rol - Juridica', 'Juridica', 'CDES',
       'Prefijo del documento que el formulario de LogySign deja seleccionado al abrir para el rol de Condicion (Jurídica: Citación a Descargos). Parametro vacío: no preselecciona nada para ese rol.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Documento preseleccionado por rol - Juridica');
