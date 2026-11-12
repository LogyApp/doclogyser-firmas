-- Contabilidad › Transferencias: validación del soporte de transferencia de cada servicio.
-- Una vez validado, la Foto Transferencia ya no se puede cambiar (ni desde Contabilidad ni desde Facturación).
-- Se puede ejecutar más de una vez.

-- 1. Columna Validado Transferencia (SI / NO; vacío = NO)
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Servicios' AND COLUMN_NAME = 'Validado Transferencia');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_Servicios ADD COLUMN `Validado Transferencia` VARCHAR(2) NULL COMMENT ''Soporte de transferencia validado por Contabilidad (SI/NO)''', 'SELECT ''Validado Transferencia ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Columna Usuario Valida Transferencia
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Servicios' AND COLUMN_NAME = 'Usuario Valida Transferencia');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_Servicios ADD COLUMN `Usuario Valida Transferencia` VARCHAR(50) NULL COMMENT ''Usuario que validó el soporte de transferencia''', 'SELECT ''Usuario Valida Transferencia ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Columna Fecha Valida Transferencia
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Servicios' AND COLUMN_NAME = 'Fecha Valida Transferencia');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_Servicios ADD COLUMN `Fecha Valida Transferencia` DATETIME NULL COMMENT ''Fecha y hora (Bogotá) de la validación del soporte de transferencia''', 'SELECT ''Fecha Valida Transferencia ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Roles que pueden validar transferencias
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'contabilidad', 'Transferencias', 'Roles que pueden validar transferencias', 'Rol', 'Contabilidad, Sistema',
       'Roles que pueden validar (y quitar la validación, una a una o de forma masiva) el soporte de transferencia de los servicios en Contabilidad › Transferencias. Validado, la foto ya no se puede cambiar. Lista separada por coma; si no existe la fila se usa Contabilidad, Sistema.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'contabilidad' AND Seccion = 'Transferencias' AND Concepto = 'Roles que pueden validar transferencias'
);
