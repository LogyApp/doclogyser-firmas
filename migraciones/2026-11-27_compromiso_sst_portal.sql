-- Habilitar Doc. SST desde Aspirantes y Cloud-Docs: el Compromiso SST se suma a los documentos del portal
-- (services/docSstPortal.js), como la Prueba de Consumo, el ARO, la EVIN, el INGE y la Declaración de Seguridad Vial.
-- id_aspirante: el compromiso habilitado para un aspirante; habilitado_portal: 1 si lo creó el portal (al
-- deshabilitarlo se borra), 0 si era un pendiente de SST que el portal reutilizó (solo sale del portal).
-- Solo agrega columnas e índice. Se puede ejecutar más de una vez.

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_compromisosst' AND COLUMN_NAME = 'id_aspirante');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_compromisosst ADD COLUMN id_aspirante varchar(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_compromisosst' AND COLUMN_NAME = 'habilitado_portal');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_compromisosst ADD COLUMN habilitado_portal tinyint(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_compromisosst' AND INDEX_NAME = 'idx_csst_id_aspirante');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_compromisosst ADD INDEX idx_csst_id_aspirante (id_aspirante)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
