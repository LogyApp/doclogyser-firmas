-- Facturación: Unidad que se prellena en el servicio según la Actividad (Config_Actividad.Unidad_Defecto).
-- Reemplaza la fórmula de AppSheet de Pepsico Innova:
--   IF(OR([Actividad]=126,[Actividad]=127),"ESTIBA",IF([Actividad]=128,"CAJA",""))
-- Las actividades 126, 127 y 128 son de Pepsico Innova. Cualquier otra actividad puede tener
-- su unidad por defecto llenando esta columna. Vacía = no prellena nada.
-- Se puede ejecutar más de una vez.

SET @col_unidad_def = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Config_Actividad' AND COLUMN_NAME = 'Unidad_Defecto'
);
SET @sql_unidad_def = IF(@col_unidad_def = 0,
  'ALTER TABLE `Config_Actividad` ADD COLUMN `Unidad_Defecto` VARCHAR(50) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt_ud FROM @sql_unidad_def;
EXECUTE stmt_ud;
DEALLOCATE PREPARE stmt_ud;

UPDATE Config_Actividad SET Unidad_Defecto = 'ESTIBA'
WHERE ID IN (126, 127) AND `Operación` = 'Pepsico Innova' AND Unidad_Defecto IS NULL;

UPDATE Config_Actividad SET Unidad_Defecto = 'CAJA'
WHERE ID = 128 AND `Operación` = 'Pepsico Innova' AND Unidad_Defecto IS NULL;
