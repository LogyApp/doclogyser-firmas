-- CloudDocs: eliminación de índice redundante (2026-11-18).
-- El índice idx_mdt_tipo_fecharegistro (TipoDocumento, FechaRegistro) está cubierto por
-- idx_mdt_tipo_ident (TipoDocumento, Identificacion) e idx_mdt_fecharegistro (FechaRegistro).
-- Su eliminación alivia el overhead de inserción y actualización en Maestro_docTrabajador.
-- Idempotente: seguro para ejecutarse múltiples veces.

SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_docTrabajador' AND INDEX_NAME = 'idx_mdt_tipo_fecharegistro');
SET @sql := IF(@existe > 0, 'ALTER TABLE `Maestro_docTrabajador` DROP INDEX `idx_mdt_tipo_fecharegistro`', 'SELECT ''idx_mdt_tipo_fecharegistro no existe o ya fue eliminado''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
