-- SST > Incapacidades: índice para buscar las novedades de incapacidad por rango de días en
-- Dynamic_Asistencia (~527 mil filas). Sin él, la consulta del mes revisaba ~135 mil filas.
-- Se crea en línea (sin bloquear la tabla). Se puede ejecutar más de una vez.

SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Asistencia'
                  AND INDEX_NAME = 'idx_asistencia_novedad_dia');
SET @sql := IF(@existe = 0,
  'ALTER TABLE Dynamic_Asistencia ADD INDEX idx_asistencia_novedad_dia (Novedad, `Día`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''idx_asistencia_novedad_dia ya existe'' AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- Verificación
SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columnas
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Asistencia' AND INDEX_NAME = 'idx_asistencia_novedad_dia'
GROUP BY INDEX_NAME;
