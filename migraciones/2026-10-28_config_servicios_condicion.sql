-- Facturación / Ajustes Servicios: condición para mostrar un campo según un dato del recibo
-- (reemplaza el "Show_If" de AppSheet, por ejemplo [IdRecibo].[Cliente a Facturar]="COLTANQUES").
--   condicion_campo    dato del recibo que se revisa; por ahora 'Cliente a Facturar'. Vacío = sin condición.
--   condicion_valores  valores con los que el campo aparece, separados por coma. Si el recibo tiene
--                      otro valor, el campo no aparece, no es obligatorio y no toma valor por defecto.
-- Se puede ejecutar más de una vez.

SET @col_cond_campo = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Config_Servicios' AND COLUMN_NAME = 'condicion_campo'
);
SET @sql_cond_campo = IF(@col_cond_campo = 0,
  'ALTER TABLE `Config_Servicios` ADD COLUMN `condicion_campo` VARCHAR(64) NULL AFTER `rol`',
  'SELECT 1'
);
PREPARE stmt_cc FROM @sql_cond_campo;
EXECUTE stmt_cc;
DEALLOCATE PREPARE stmt_cc;

SET @col_cond_valores = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Config_Servicios' AND COLUMN_NAME = 'condicion_valores'
);
SET @sql_cond_valores = IF(@col_cond_valores = 0,
  'ALTER TABLE `Config_Servicios` ADD COLUMN `condicion_valores` TEXT NULL AFTER `condicion_campo`',
  'SELECT 1'
);
PREPARE stmt_cv FROM @sql_cond_valores;
EXECUTE stmt_cv;
DEALLOCATE PREPARE stmt_cv;
