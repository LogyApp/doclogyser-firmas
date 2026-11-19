-- CloudDocs: optimización de índices (2026-11-18).
-- Agrega índices para acelerar filtros de Validación y Operación en Maestro_docTrabajador y Maestro_docEmpresa.
-- Idempotente: se puede ejecutar más de una vez.

-- 1. Índice en Validación para Maestro_docTrabajador (acelera facetas y filtros masivos de validación / retiros)
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_docTrabajador' AND INDEX_NAME = 'idx_mdt_validacion');
SET @sql := IF(@existe = 0, 'ALTER TABLE `Maestro_docTrabajador` ADD INDEX `idx_mdt_validacion` (`Validación`)', 'SELECT ''idx_mdt_validacion ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Índice en Operación + FechaRegistro para Maestro_docTrabajador (acelera consultas filtradas por operación)
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_docTrabajador' AND INDEX_NAME = 'idx_mdt_operacion_fecha');
SET @sql := IF(@existe = 0, 'ALTER TABLE `Maestro_docTrabajador` ADD INDEX `idx_mdt_operacion_fecha` (`Operación`, `FechaRegistro`)', 'SELECT ''idx_mdt_operacion_fecha ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Índice en Validación para Maestro_docEmpresa
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_docEmpresa' AND INDEX_NAME = 'idx_mde_validacion');
SET @sql := IF(@existe = 0, 'ALTER TABLE `Maestro_docEmpresa` ADD INDEX `idx_mde_validacion` (`Validación`)', 'SELECT ''idx_mde_validacion ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
