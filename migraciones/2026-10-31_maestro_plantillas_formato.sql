-- Maestro_Plantillas: código, versión y fecha del formato de cada documento, para que el
-- encabezado del PDF los tome de aquí ({{codigo_formato}}, {{version_formato}}, {{fecha_formato}})
-- en vez de tenerlos escritos dentro del HTML o en Config_Parametros.
--   codigo_formato  : código del formato (ej. F-SST-001)
--   version_formato : versión del formato que se imprime (ej. 03). No es la columna `version`,
--                     que numera las revisiones de la plantilla y elige la más reciente.
--   fecha_version   : fecha de esa versión del formato (se imprime dd/mm/aaaa)
-- Los valores salen de lo que hoy muestra cada plantilla (o Config_Parametros en las SST
-- modernas). Prueba de Consumo: SST-F-02, versión 03, 31/10/2026 (indicado por William).
-- Se puede ejecutar más de una vez.

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Plantillas' AND COLUMN_NAME = 'codigo_formato');
SET @sql := IF(@c = 0, 'ALTER TABLE Maestro_Plantillas ADD COLUMN codigo_formato VARCHAR(30) NULL AFTER nombre_proceso', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Plantillas' AND COLUMN_NAME = 'version_formato');
SET @sql := IF(@c = 0, 'ALTER TABLE Maestro_Plantillas ADD COLUMN version_formato VARCHAR(10) NULL AFTER codigo_formato', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Plantillas' AND COLUMN_NAME = 'fecha_version');
SET @sql := IF(@c = 0, 'ALTER TABLE Maestro_Plantillas ADD COLUMN fecha_version DATE NULL AFTER version_formato', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- SST (encabezado moderno)
UPDATE Maestro_Plantillas SET codigo_formato = 'F-SST-001', version_formato = '03', fecha_version = '2026-05-28' WHERE nombre_proceso = 'evaluacion_sst';
UPDATE Maestro_Plantillas SET codigo_formato = 'F-SST-002', version_formato = '02', fecha_version = '2026-05-28' WHERE nombre_proceso = 'capacitacion_sst';
UPDATE Maestro_Plantillas SET codigo_formato = 'SST-F-003', version_formato = '03', fecha_version = '2026-05-28' WHERE nombre_proceso = 'registro_asistencia';
UPDATE Maestro_Plantillas SET codigo_formato = 'SST-F-02',  version_formato = '03', fecha_version = '2026-10-31' WHERE nombre_proceso = 'pruebaconsumo';
UPDATE Maestro_Plantillas SET codigo_formato = 'SST-F-005', version_formato = '0',  fecha_version = '2026-05-28' WHERE nombre_proceso = 'compromisosst';
UPDATE Maestro_Plantillas SET codigo_formato = 'SST-F-036', version_formato = '02', fecha_version = '2026-09-23' WHERE nombre_proceso = 'ats_semanal';
UPDATE Maestro_Plantillas SET codigo_formato = 'SST-R-094', version_formato = '1',  fecha_version = NULL         WHERE nombre_proceso = 'acta_apertura_cm';
UPDATE Maestro_Plantillas SET codigo_formato = 'SST-R-095', version_formato = '1',  fecha_version = NULL         WHERE nombre_proceso = 'acta_cierre_cm';

-- Selección (documentos de ingreso)
UPDATE Maestro_Plantillas SET codigo_formato = 'TH-R-026',   version_formato = '2',  fecha_version = NULL         WHERE nombre_proceso = 'ACTCON';
UPDATE Maestro_Plantillas SET codigo_formato = 'SST-FM-054', version_formato = '04', fecha_version = '2026-01-12' WHERE nombre_proceso = 'ARO';
UPDATE Maestro_Plantillas SET codigo_formato = 'SST-FM-036', version_formato = '01', fecha_version = NULL         WHERE nombre_proceso = 'CHC';
UPDATE Maestro_Plantillas SET codigo_formato = 'TH-R-025',   version_formato = '1',  fecha_version = NULL         WHERE nombre_proceso = 'CPC';
UPDATE Maestro_Plantillas SET codigo_formato = 'TH-R-011',   version_formato = '2',  fecha_version = NULL         WHERE nombre_proceso = 'CS';
UPDATE Maestro_Plantillas SET codigo_formato = 'SST-FM-003', version_formato = '03', fecha_version = NULL         WHERE nombre_proceso = 'EVIN';
UPDATE Maestro_Plantillas SET codigo_formato = 'SST-FM-004', version_formato = '04', fecha_version = NULL         WHERE nombre_proceso = 'INGE';
UPDATE Maestro_Plantillas SET codigo_formato = 'ITAL',       version_formato = '1',  fecha_version = NULL         WHERE nombre_proceso = 'ITAL';
UPDATE Maestro_Plantillas SET codigo_formato = 'SST-MA-002', version_formato = '2',  fecha_version = NULL         WHERE nombre_proceso = 'MF';
UPDATE Maestro_Plantillas SET codigo_formato = 'SST-FM-021', version_formato = '01', fecha_version = NULL         WHERE nombre_proceso = 'SEOP';
UPDATE Maestro_Plantillas SET codigo_formato = 'TH-R-008',   version_formato = '2',  fecha_version = NULL         WHERE nombre_proceso = 'TD';

-- Talento humano / Nómina
UPDATE Maestro_Plantillas SET codigo_formato = 'TH-R-016', version_formato = '01', fecha_version = '2025-06-10' WHERE nombre_proceso = 'aceptacion_renuncia';
UPDATE Maestro_Plantillas SET codigo_formato = 'TH-R-022', version_formato = '1',  fecha_version = NULL         WHERE nombre_proceso = 'paz_y_salvo_alto';
UPDATE Maestro_Plantillas SET codigo_formato = 'TH-R-021', version_formato = '1',  fecha_version = NULL         WHERE nombre_proceso = 'paz_y_salvo_bajo';
UPDATE Maestro_Plantillas SET codigo_formato = 'CP-R-001', version_formato = NULL, fecha_version = NULL         WHERE nombre_proceso = 'acta_entrega';
UPDATE Maestro_Plantillas SET codigo_formato = NULL,       version_formato = '1',  fecha_version = NULL         WHERE nombre_proceso IN ('descuento_anticipado', 'descuento_especifico');

-- Verificación
SELECT id_plantilla, nombre_proceso, codigo_formato, version_formato, DATE_FORMAT(fecha_version, '%d/%m/%Y') AS fecha_version
FROM Maestro_Plantillas ORDER BY nombre_proceso;
