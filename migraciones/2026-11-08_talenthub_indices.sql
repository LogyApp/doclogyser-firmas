-- TalentHub: optimización de índices (2026-11-08).
-- Parte 1 agrega índices que faltan. Parte 2 quita índices duplicados o sin uso (no borra datos;
-- solo requiere confirmación de William). Se puede ejecutar más de una vez.

-- ===== Parte 1: índices nuevos =====

-- Aspirantes por requisición (SLA, vincular, conteos). Hoy recorre toda la tabla.
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_hv_aspirante' AND INDEX_NAME = 'idx_hv_aspirante_requisicion');
SET @sql := IF(@existe = 0, 'ALTER TABLE `Dynamic_hv_aspirante` ADD INDEX `idx_hv_aspirante_requisicion` (`IdRequisicion`)', 'SELECT ''idx_hv_aspirante_requisicion ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Orden y filtro por fecha de registro del listado de Aspirantes.
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_hv_aspirante' AND INDEX_NAME = 'idx_hv_aspirante_fecha_registro');
SET @sql := IF(@existe = 0, 'ALTER TABLE `Dynamic_hv_aspirante` ADD INDEX `idx_hv_aspirante_fecha_registro` (`fecha_registro`)', 'SELECT ''idx_hv_aspirante_fecha_registro ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Requisiciones por operación (roles con alcance por operación) ordenadas por fecha.
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Requisiciones' AND INDEX_NAME = 'idx_req_operacion_fecha');
SET @sql := IF(@existe = 0, 'ALTER TABLE `Dynamic_Requisiciones` ADD INDEX `idx_req_operacion_fecha` (`Operación`, `Fecha Requisición`)', 'SELECT ''idx_req_operacion_fecha ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Rango de fechas de una quincena (filtro de quincena y fecha desde por defecto).
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Fechas' AND INDEX_NAME = 'idx_fechas_anio_quincena');
SET @sql := IF(@existe = 0, 'ALTER TABLE `Maestro_Fechas` ADD INDEX `idx_fechas_anio_quincena` (`Año`, `Quincena`, `Fecha`)', 'SELECT ''idx_fechas_anio_quincena ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Perfil corporativo del usuario por identificación.
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_firma_corporativa' AND INDEX_NAME = 'idx_firma_corp_identificacion');
SET @sql := IF(@existe = 0, 'ALTER TABLE `Maestro_firma_corporativa` ADD INDEX `idx_firma_corp_identificacion` (`Identificacion`)', 'SELECT ''idx_firma_corp_identificacion ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ===== Parte 2: índices que sobran =====

-- Duplicado: el índice único `identificacion` ya cubre la misma columna.
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_hv_aspirante' AND INDEX_NAME = 'idx_identificacion');
SET @sql := IF(@existe > 0, 'ALTER TABLE `Dynamic_hv_aspirante` DROP INDEX `idx_identificacion`', 'SELECT ''idx_identificacion ya no existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Sin uso: ninguna consulta filtra por acepta_politica_privacidad (columna de sí/no).
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_hv_aspirante' AND INDEX_NAME = 'idx_hv_privacidad');
SET @sql := IF(@existe > 0, 'ALTER TABLE `Dynamic_hv_aspirante` DROP INDEX `idx_hv_privacidad`', 'SELECT ''idx_hv_privacidad ya no existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Duplicado: IdRequisicion ya es la llave primaria.
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Requisiciones' AND INDEX_NAME = 'idx_IdRequisicion_Requisiciones');
SET @sql := IF(@existe > 0, 'ALTER TABLE `Dynamic_Requisiciones` DROP INDEX `idx_IdRequisicion_Requisiciones`', 'SELECT ''idx_IdRequisicion_Requisiciones ya no existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Sin uso: Ciudad solo se busca con LIKE "%texto%", que no usa índices.
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Requisiciones' AND INDEX_NAME = 'idx_Ciudad_Requisiciones');
SET @sql := IF(@existe > 0, 'ALTER TABLE `Dynamic_Requisiciones` DROP INDEX `idx_Ciudad_Requisiciones`', 'SELECT ''idx_Ciudad_Requisiciones ya no existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Redundante: el índice único uq_asp_doc (id_aspirante, id_config_doc) empieza por la misma columna y sirve a la llave foránea.
SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_hv_documentos' AND INDEX_NAME = 'fk_doc_aspirante');
SET @sql := IF(@existe > 0, 'ALTER TABLE `Dynamic_hv_documentos` DROP INDEX `fk_doc_aspirante`', 'SELECT ''fk_doc_aspirante ya no existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
