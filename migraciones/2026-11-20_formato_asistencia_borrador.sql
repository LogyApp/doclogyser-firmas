-- Agregar columna es_borrador a Dynamic_formato_asistencia
-- Permite guardar registros en modo borrador sin enviar correos a los asistentes,
-- para que puedan ser retomados y enviados posteriormente cuando el usuario lo decida.

SET @existe := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Dynamic_formato_asistencia'
    AND COLUMN_NAME = 'es_borrador'
);

SET @sql := IF(@existe = 0,
  'ALTER TABLE Dynamic_formato_asistencia ADD COLUMN es_borrador TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT "Columna es_borrador ya existe"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
