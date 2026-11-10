-- Migración para validación de consignaciones en Maestro_Consignaciones y Config_Parametros
-- Permite que los roles autorizados (Contabilidad, Sistema) puedan validar consignaciones.

-- 1. Columna Validado
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Consignaciones' AND COLUMN_NAME = 'Validado');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_Consignaciones ADD COLUMN `Validado` VARCHAR(2) NOT NULL DEFAULT ''NO'' COMMENT ''Indica si la consignación fue validada (SI/NO)''', 'SELECT ''Validado ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Columna Usuario_Valida
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Consignaciones' AND COLUMN_NAME = 'Usuario_Valida');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_Consignaciones ADD COLUMN `Usuario_Valida` VARCHAR(50) NULL COMMENT ''Usuario que realizó la validación''', 'SELECT ''Usuario_Valida ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Columna Fecha_Validacion
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Consignaciones' AND COLUMN_NAME = 'Fecha_Validacion');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_Consignaciones ADD COLUMN `Fecha_Validacion` DATETIME NULL COMMENT ''Fecha y hora de validación''', 'SELECT ''Fecha_Validacion ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Parámetro de roles que pueden validar consignaciones
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'contabilidad', 'Consignaciones', 'Roles que pueden validar consignaciones', '', 'Contabilidad, Sistema',
       'Roles autorizados para marcar como validada una consignación bancaria y editarla una vez validada.' FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'contabilidad'
    AND Seccion = 'Consignaciones'
    AND Concepto = 'Roles que pueden validar consignaciones'
);
