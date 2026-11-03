-- Fecha de versión de las actas de Casos Médicos (SST-R-094 apertura y SST-R-095 cierre):
-- 01/11/2026, indicada por William. Se imprime en el encabezado ({{fecha_formato}}).
-- Se puede ejecutar más de una vez.

UPDATE Maestro_Plantillas SET fecha_version = '2026-11-01'
WHERE nombre_proceso IN ('acta_apertura_cm', 'acta_cierre_cm');

-- Verificación
SELECT nombre_proceso, codigo_formato, version_formato, DATE_FORMAT(fecha_version, '%d/%m/%Y') AS fecha_version
FROM Maestro_Plantillas WHERE nombre_proceso IN ('acta_apertura_cm', 'acta_cierre_cm');
