-- Traslados: la Operación del trabajador en Maestro_Vinculación (Activos) cambia el DÍA del traslado,
-- no al firmar. Si el traslado se firma con fecha futura, la tarea aplicarTrasladosPendientes (app.js,
-- cada hora) hace el cambio cuando llega la fecha. Esta columna guarda cuándo se aplicó.
-- Los traslados ya generados se marcan como aplicados (con el código anterior la operación cambió al
-- firmar), para que la tarea no los vuelva a aplicar ni reemplace cambios posteriores.
-- No borra datos. Se puede ejecutar más de una vez.

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_traslados_trabajador'
                  AND COLUMN_NAME = 'fecha_aplicado_vinculacion');
SET @sql := IF(@existe = 0,
  'ALTER TABLE Dynamic_traslados_trabajador ADD COLUMN fecha_aplicado_vinculacion DATETIME NULL COMMENT ''Cuándo se cambió la Operación en Maestro_Vinculación (hora Colombia)''',
  'SELECT ''fecha_aplicado_vinculacion ya existe''');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- Traslados generados antes de este cambio: ya se aplicaron al firmar
UPDATE Dynamic_traslados_trabajador
   SET fecha_aplicado_vinculacion = Fecha_Registro
 WHERE estado_doc = 'generado' AND fecha_aplicado_vinculacion IS NULL;

SELECT estado_doc, COUNT(*) AS traslados, SUM(fecha_aplicado_vinculacion IS NULL) AS sin_aplicar
  FROM Dynamic_traslados_trabajador GROUP BY estado_doc;
