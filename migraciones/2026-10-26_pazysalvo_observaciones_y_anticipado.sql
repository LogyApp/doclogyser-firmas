-- Migración: Columnas de observaciones de áreas al firmar Paz y Salvo y parámetros de anticipado / reenvío completado
-- Fecha: 2026-10-26
-- Idempotente: se puede ejecutar múltiples veces sin error.

-- 1. Agregar columnas observacion_<area> en Maestro_pazysalvo si no existen
SET @cols_pazysalvo = 'nomina,tecnologia,sst,facturacion,contabilidad,cuentas,gerencia';

-- observacion_nomina
SET @c_nom = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_pazysalvo' AND COLUMN_NAME = 'observacion_nomina');
SET @sql_nom = IF(@c_nom = 0, 'ALTER TABLE `Maestro_pazysalvo` ADD COLUMN `observacion_nomina` TEXT NULL', 'SELECT 1');
PREPARE stmt_nom FROM @sql_nom; EXECUTE stmt_nom; DEALLOCATE PREPARE stmt_nom;

-- observacion_tecnologia
SET @c_tec = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_pazysalvo' AND COLUMN_NAME = 'observacion_tecnologia');
SET @sql_tec = IF(@c_tec = 0, 'ALTER TABLE `Maestro_pazysalvo` ADD COLUMN `observacion_tecnologia` TEXT NULL', 'SELECT 1');
PREPARE stmt_tec FROM @sql_tec; EXECUTE stmt_tec; DEALLOCATE PREPARE stmt_tec;

-- observacion_sst
SET @c_sst = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_pazysalvo' AND COLUMN_NAME = 'observacion_sst');
SET @sql_sst = IF(@c_sst = 0, 'ALTER TABLE `Maestro_pazysalvo` ADD COLUMN `observacion_sst` TEXT NULL', 'SELECT 1');
PREPARE stmt_sst FROM @sql_sst; EXECUTE stmt_sst; DEALLOCATE PREPARE stmt_sst;

-- observacion_facturacion
SET @c_fac = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_pazysalvo' AND COLUMN_NAME = 'observacion_facturacion');
SET @sql_fac = IF(@c_fac = 0, 'ALTER TABLE `Maestro_pazysalvo` ADD COLUMN `observacion_facturacion` TEXT NULL', 'SELECT 1');
PREPARE stmt_fac FROM @sql_fac; EXECUTE stmt_fac; DEALLOCATE PREPARE stmt_fac;

-- observacion_contabilidad
SET @c_con = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_pazysalvo' AND COLUMN_NAME = 'observacion_contabilidad');
SET @sql_con = IF(@c_con = 0, 'ALTER TABLE `Maestro_pazysalvo` ADD COLUMN `observacion_contabilidad` TEXT NULL', 'SELECT 1');
PREPARE stmt_con FROM @sql_con; EXECUTE stmt_con; DEALLOCATE PREPARE stmt_con;

-- observacion_cuentas
SET @c_cue = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_pazysalvo' AND COLUMN_NAME = 'observacion_cuentas');
SET @sql_cue = IF(@c_cue = 0, 'ALTER TABLE `Maestro_pazysalvo` ADD COLUMN `observacion_cuentas` TEXT NULL', 'SELECT 1');
PREPARE stmt_cue FROM @sql_cue; EXECUTE stmt_cue; DEALLOCATE PREPARE stmt_cue;

-- observacion_gerencia
SET @c_ger = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_pazysalvo' AND COLUMN_NAME = 'observacion_gerencia');
SET @sql_ger = IF(@c_ger = 0, 'ALTER TABLE `Maestro_pazysalvo` ADD COLUMN `observacion_gerencia` TEXT NULL', 'SELECT 1');
PREPARE stmt_ger FROM @sql_ger; EXECUTE stmt_ger; DEALLOCATE PREPARE stmt_ger;

-- 2. Parámetros en Config_Parametros (nomina / Retiros)
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Retiros', 'Puede generar Paz y Salvo anticipadamente', 'Rol', 'Nomina, Sistema',
       'Roles que pueden cerrar y generar el PDF final del Paz y Salvo antes de cumplirse el plazo de 120 horas aunque falten firmas de áreas.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Puede generar Paz y Salvo anticipadamente'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Retiros', 'Puede reenviar Paz y Salvo completado a áreas pendientes', 'Rol', 'Nomina, Sistema',
       'Roles que pueden reenviar recordatorio y enlace de firma a las áreas pendientes después de que el Paz y Salvo ya ha sido completado y generado.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Puede reenviar Paz y Salvo completado a áreas pendientes'
);
