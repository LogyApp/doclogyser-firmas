-- Acta de Conocimiento de Condiciones (ACTCON): fecha del formato físico TH-R-026 V2 (25/09/2025),
-- para que salga en el encabezado del PDF. Se puede ejecutar más de una vez.
UPDATE Maestro_Plantillas
SET fecha_version = '2025-09-25', version_formato = '2', codigo_formato = 'TH-R-026'
WHERE nombre_proceso = 'ACTCON'
  AND (fecha_version IS NULL OR fecha_version <> '2025-09-25' OR version_formato <> '2' OR codigo_formato <> 'TH-R-026');
