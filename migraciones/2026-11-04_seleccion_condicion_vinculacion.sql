-- Agrega la condición de la vinculación para marcar como "En Proceso" las nuevas
-- vinculaciones creadas al finalizar la contratación desde Selección.
-- Los registros existentes conservan Condicion NULL.

SET @c := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Maestro_Vinculación'
    AND COLUMN_NAME = 'Condicion'
);
SET @sql := IF(
  @c = 0,
  'ALTER TABLE `Maestro_Vinculación` ADD COLUMN `Condicion` ENUM(''En Proceso'',''Contratado'') NULL AFTER `Estado`',
  'SELECT 1'
);
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;
