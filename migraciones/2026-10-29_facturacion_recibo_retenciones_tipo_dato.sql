-- Facturación:
--   1. Quién puede aplicar retenciones (ve la sección Retenciones: Aplica Retefuente / ReteIVA /
--      ReteICA) en el formulario del recibo (Config_Parametros facturacion / Recibos). A los demás
--      no les aparece y el sistema las sigue calculando automáticamente.
--   2. Tipo de dato de los campos Etapa y Muelle por operación (Config_Servicios.tipo_dato):
--      'Número' = el formulario de servicio muestra teclado numérico y solo acepta números;
--      vacío o 'Texto' = texto libre (como siempre).
--   3. Campos que se pueden editar con el servicio en verde (Config_Servicios.editable_validado):
--      1 = quien no tiene permiso de editar validados puede cambiar ese campo aunque el servicio
--      (o su recibo) esté en verde; 0 = bloqueado en verde (como siempre).
-- Se puede ejecutar más de una vez.

-- La fila se creó primero como "Roles que ven las retenciones..."; se renombra si existe.
UPDATE Config_Parametros
SET Concepto = 'Roles que pueden aplicar retenciones en el formulario del recibo',
    Descripcion = 'Roles que ven y pueden aplicar la sección Retenciones (Aplica Retefuente, ReteIVA y ReteICA) al crear o editar un recibo. A los demás no les aparece y las retenciones se calculan automáticamente. Si se deja vacío, nadie la ve.'
WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que ven las retenciones en el formulario del recibo'
  AND NOT EXISTS (SELECT 1 FROM (SELECT Concepto FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que pueden aplicar retenciones en el formulario del recibo') AS ya);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que pueden aplicar retenciones en el formulario del recibo', 'Rol', 'Facturación, Sistema',
       'Roles que ven y pueden aplicar la sección Retenciones (Aplica Retefuente, ReteIVA y ReteICA) al crear o editar un recibo. A los demás no les aparece y las retenciones se calculan automáticamente. Si se deja vacío, nadie la ve.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que pueden aplicar retenciones en el formulario del recibo');

SET @col_tipo_dato = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Config_Servicios' AND COLUMN_NAME = 'tipo_dato'
);
SET @sql_tipo_dato = IF(@col_tipo_dato = 0,
  'ALTER TABLE `Config_Servicios` ADD COLUMN `tipo_dato` VARCHAR(20) NULL AFTER `valor_defecto`',
  'SELECT 1'
);
PREPARE stmt_td FROM @sql_tipo_dato;
EXECUTE stmt_td;
DEALLOCATE PREPARE stmt_td;

SET @col_editable_validado = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Config_Servicios' AND COLUMN_NAME = 'editable_validado'
);
SET @sql_editable_validado = IF(@col_editable_validado = 0,
  'ALTER TABLE `Config_Servicios` ADD COLUMN `editable_validado` TINYINT(1) NOT NULL DEFAULT 0 AFTER `obligatorio`',
  'SELECT 1'
);
PREPARE stmt_ev FROM @sql_editable_validado;
EXECUTE stmt_ev;
DEALLOCATE PREPARE stmt_ev;

-- Verificación
SELECT Concepto, Parametro FROM Config_Parametros
WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto LIKE '%retenciones en el formulario del recibo';
SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Config_Servicios' AND COLUMN_NAME IN ('tipo_dato', 'editable_validado');
