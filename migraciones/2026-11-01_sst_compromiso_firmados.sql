-- SST > Compromiso SST: editar, regenerar el PDF y eliminar compromisos ya firmados, como en
-- Evaluación SST, Capacitación SST, Participación y Prueba de Consumo
-- (Config_Parametros sst / Compromiso SST).
--   fecha_documento : fecha que se imprime en el PDF. Se guarda al generarlo para que al regenerar
--                     no cambie; se puede corregir al editar. Los ya generados se llenan con la
--                     fecha del nombre del archivo (<cc>.CSST.<aammdd...>.pdf).
--   nombre_lidersst : nombre del Líder SST con que se generó el PDF (antes no se guardaba; al
--                     regenerar los anteriores se usa el usuario con Rol LiderSst).
-- Formato del documento en Maestro_Plantillas: SST-F-005, versión 2, 01/11/2026 (indicado por William).
-- El diseño moderno de la plantilla va aparte, en 2026-11-01_plantilla_compromisosst_moderna.sql
-- (se ejecuta después de desplegar).
-- Se puede ejecutar más de una vez.

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_compromisosst' AND COLUMN_NAME = 'fecha_documento');
SET @sql := IF(@c = 0, 'ALTER TABLE Dynamic_compromisosst ADD COLUMN fecha_documento DATE NULL AFTER url_doc', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_compromisosst' AND COLUMN_NAME = 'nombre_lidersst');
SET @sql := IF(@c = 0, 'ALTER TABLE Dynamic_compromisosst ADD COLUMN nombre_lidersst VARCHAR(150) NULL AFTER url_firma_lidersst', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

UPDATE Dynamic_compromisosst
SET fecha_documento = STR_TO_DATE(LEFT(SUBSTRING_INDEX(url_doc, '.CSST.', -1), 6), '%y%m%d')
WHERE fecha_documento IS NULL AND url_doc REGEXP '\\.CSST\\.[0-9]{6}';

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Compromiso SST', 'Roles que pueden editar y regenerar PDF de compromisos SST firmados', 'Rol', 'Sistema',
       'Roles que, con el compromiso SST ya firmado (PDF generado), pueden editar cargo, fecha del documento y observaciones y regenerar el PDF con la plantilla vigente, conservando las firmas. Si se deja vacío, nadie puede.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Compromiso SST' AND Concepto = 'Roles que pueden editar y regenerar PDF de compromisos SST firmados');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Compromiso SST', 'Roles que pueden eliminar compromisos SST firmados', 'Rol', 'Sistema',
       'Roles que pueden eliminar un compromiso SST con alguna firma o con el PDF generado (también se quita su PDF de los documentos del trabajador). Los compromisos sin firmas se rigen por "Roles que pueden eliminar compromisos SST". Si se deja vacío, nadie puede.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Compromiso SST' AND Concepto = 'Roles que pueden eliminar compromisos SST firmados');

UPDATE Maestro_Plantillas SET codigo_formato = 'SST-F-005', version_formato = '2', fecha_version = '2026-11-01'
WHERE nombre_proceso = 'compromisosst';

-- Verificación
SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Compromiso SST' ORDER BY Concepto;
SELECT COUNT(*) AS con_pdf, SUM(fecha_documento IS NOT NULL) AS con_fecha_documento FROM Dynamic_compromisosst WHERE url_doc IS NOT NULL;
SELECT nombre_proceso, codigo_formato, version_formato, DATE_FORMAT(fecha_version, '%d/%m/%Y') AS fecha_version FROM Maestro_Plantillas WHERE nombre_proceso = 'compromisosst';
