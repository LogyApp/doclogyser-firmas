-- Borrado de filas de Config_Parametros que ya no usa el código. Aprobado por William el 2026-11-26.
--   * talenthub / Aspirantes / 'Aviso al aspirante al pasar a En proceso' (valor actual 0):
--     el enlace del portal ya no se envía automáticamente al pasar a "En proceso".
--   * CloudDocs / Trabajadores / 'Roles que pueden validar documentos' (valor actual Archivo, Sistema, Asistencial):
--     se quitó el semáforo de validación de Todo, Validar Cap y Duplicados.
-- Se puede ejecutar más de una vez. Ejecutar cada bloque por separado en HiSQL.

-- Bloque 1: respaldo
CREATE TABLE IF NOT EXISTS `backup_config_parametros_sin_uso_20261126` AS
SELECT * FROM Config_Parametros
WHERE (Modulo = 'talenthub' AND Seccion = 'Aspirantes' AND Concepto = 'Aviso al aspirante al pasar a En proceso')
   OR (Modulo = 'CloudDocs' AND Seccion = 'Trabajadores' AND Concepto = 'Roles que pueden validar documentos');

-- Bloque 2: revisar el respaldo (debe dar 2)
SELECT COUNT(*) AS respaldadas FROM `backup_config_parametros_sin_uso_20261126`;

-- Bloque 3: borrado (solo si el bloque 2 dio 2)
DELETE FROM Config_Parametros
WHERE (Modulo = 'talenthub' AND Seccion = 'Aspirantes' AND Concepto = 'Aviso al aspirante al pasar a En proceso')
   OR (Modulo = 'CloudDocs' AND Seccion = 'Trabajadores' AND Concepto = 'Roles que pueden validar documentos');
