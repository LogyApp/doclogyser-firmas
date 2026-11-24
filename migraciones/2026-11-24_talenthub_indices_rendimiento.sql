-- TalentHub: optimización de índices para rendimiento y fluidez (2026-11-24).
-- Agrega índices estratégicos para Requisiciones, Aspirantes, Documentos, Evaluaciones de Retiro y Participación.
-- Idempotente (se puede ejecutar más de una vez sin error).

-- 1. Requisiciones: filtro por Estado con orden por Fecha Requisición
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Requisiciones' AND INDEX_NAME = 'idx_req_estado_fecha');
SET @sql := IF(@existe = 0, 'ALTER TABLE `Dynamic_Requisiciones` ADD INDEX `idx_req_estado_fecha` (`Estado`, `Fecha Requisición`)', 'SELECT ''idx_req_estado_fecha ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Requisiciones: filtro por Responsable de Selección
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Requisiciones' AND INDEX_NAME = 'idx_req_responsable');
SET @sql := IF(@existe = 0, 'ALTER TABLE `Dynamic_Requisiciones` ADD INDEX `idx_req_responsable` (`Responsable de Selección`)', 'SELECT ''idx_req_responsable ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Aspirantes: filtro por estado de proceso y orden por fecha de registro
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_hv_aspirante' AND INDEX_NAME = 'idx_hv_asp_estado_fecha');
SET @sql := IF(@existe = 0, 'ALTER TABLE `Dynamic_hv_aspirante` ADD INDEX `idx_hv_asp_estado_fecha` (`estado_proceso`, `fecha_registro`)', 'SELECT ''idx_hv_asp_estado_fecha ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Documentos de Aspirantes: conteo de aprobados/firmados por aspirante
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_hv_documentos' AND INDEX_NAME = 'idx_doc_asp_estado');
SET @sql := IF(@existe = 0, 'ALTER TABLE `Dynamic_hv_documentos` ADD INDEX `idx_doc_asp_estado` (`id_aspirante`, `estado`)', 'SELECT ''idx_doc_asp_estado ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. Registro Participación (items): agrupación de regional y operación por asistencia
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_formato_itemsAsistencia' AND INDEX_NAME = 'idx_itemsasist_asist_reg_op');
SET @sql := IF(@existe = 0, 'ALTER TABLE `Dynamic_formato_itemsAsistencia` ADD INDEX `idx_itemsasist_asist_reg_op` (`id_asistencia`, `regional`, `operacion`)', 'SELECT ''idx_itemsasist_asist_reg_op ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6. Entrevistas de Retiro: orden y filtros por fecha de registro
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_evaluacionretiro' AND INDEX_NAME = 'idx_evalretiro_fecha_reg');
SET @sql := IF(@existe = 0, 'ALTER TABLE `Maestro_evaluacionretiro` ADD INDEX `idx_evalretiro_fecha_reg` (`fecha_registro`)', 'SELECT ''idx_evalretiro_fecha_reg ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 7. Entrevistas de Retiro: filtro por fecha de entrevista
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_evaluacionretiro' AND INDEX_NAME = 'idx_evalretiro_fecha_ent');
SET @sql := IF(@existe = 0, 'ALTER TABLE `Maestro_evaluacionretiro` ADD INDEX `idx_evalretiro_fecha_ent` (`fecha_entrevista`)', 'SELECT ''idx_evalretiro_fecha_ent ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
