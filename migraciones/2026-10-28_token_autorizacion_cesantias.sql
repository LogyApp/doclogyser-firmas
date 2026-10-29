-- Migración para añadir columnas de token de autorización de cesantías por retiro
-- Permite que el trabajador autorice formalmente el trámite de sus cesantías
-- mediante enlace único y temporal.

SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'Maestro_Vinculación' 
    AND COLUMN_NAME = 'token_aut_cesantias'
);

SET @sql1 := IF(@existe = 0, 'ALTER TABLE `Maestro_Vinculación` ADD COLUMN `token_aut_cesantias` VARCHAR(64) NULL AFTER `token_firma_crs_expira`', 'SELECT 1');
PREPARE stmt1 FROM @sql1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @sql2 := IF(@existe = 0, 'ALTER TABLE `Maestro_Vinculación` ADD COLUMN `token_aut_cesantias_expira` DATETIME NULL AFTER `token_aut_cesantias`', 'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
