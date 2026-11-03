-- SST: fecha y hora de cada firma, para imprimirla debajo de la firma en los PDF
-- ("Firmado: dd/mm/aaaa hh:mm", como en LogySign).
--   Maestro_evaluacionsst.fecha_firma, Maestro_capacitacionsst.fecha_firma,
--   Dynamic_pruebaconsumo.fecha_firma,
--   Dynamic_compromisosst.fecha_firma_trabajador / fecha_firma_analista / fecha_firma_lidersst.
-- ATS, Participación y las actas de Casos Médicos ya guardaban la fecha de firma.
-- Los ya firmados se llenan con la hora del nombre de la imagen de la firma
-- (firma_<milisegundos>.png, que se sube en el momento de firmar; coincide con la hora del
-- documento en el 99% de los registros). La firma automática del Líder SST en Compromiso
-- toma la hora de la firma del Analista, porque se pone en el mismo momento.
-- OJO: en Maestro_evaluacionsst y Dynamic_pruebaconsumo, fecha_registro es ON UPDATE
-- CURRENT_TIMESTAMP; los UPDATE la dejan igual (fecha_registro = fecha_registro). La primera
-- ejecución (01/11/2026 21:40) no lo hacía y se restauró aparte.
-- Se puede ejecutar más de una vez (solo llena las fechas vacías).

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_evaluacionsst' AND COLUMN_NAME = 'fecha_firma');
SET @sql := IF(@c = 0, 'ALTER TABLE Maestro_evaluacionsst ADD COLUMN fecha_firma DATETIME NULL AFTER firma_trabajador', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_capacitacionsst' AND COLUMN_NAME = 'fecha_firma');
SET @sql := IF(@c = 0, 'ALTER TABLE Maestro_capacitacionsst ADD COLUMN fecha_firma DATETIME NULL AFTER firma_trabajador', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_pruebaconsumo' AND COLUMN_NAME = 'fecha_firma');
SET @sql := IF(@c = 0, 'ALTER TABLE Dynamic_pruebaconsumo ADD COLUMN fecha_firma DATETIME NULL AFTER url_firma', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_compromisosst' AND COLUMN_NAME = 'fecha_firma_trabajador');
SET @sql := IF(@c = 0, 'ALTER TABLE Dynamic_compromisosst ADD COLUMN fecha_firma_trabajador DATETIME NULL AFTER url_firma_trabajador', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_compromisosst' AND COLUMN_NAME = 'fecha_firma_analista');
SET @sql := IF(@c = 0, 'ALTER TABLE Dynamic_compromisosst ADD COLUMN fecha_firma_analista DATETIME NULL AFTER url_firma_analista', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_compromisosst' AND COLUMN_NAME = 'fecha_firma_lidersst');
SET @sql := IF(@c = 0, 'ALTER TABLE Dynamic_compromisosst ADD COLUMN fecha_firma_lidersst DATETIME NULL AFTER url_firma_lidersst', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- Llenar las firmas anteriores con la hora del nombre de la imagen de la firma
UPDATE Maestro_evaluacionsst
SET fecha_firma = FROM_UNIXTIME(CAST(REGEXP_SUBSTR(firma_trabajador, '[0-9]{13}') AS UNSIGNED) DIV 1000), fecha_registro = fecha_registro
WHERE fecha_firma IS NULL AND firma_trabajador REGEXP 'firma_[0-9]{13}\\.png';

UPDATE Maestro_capacitacionsst
SET fecha_firma = FROM_UNIXTIME(CAST(REGEXP_SUBSTR(firma_trabajador, '[0-9]{13}') AS UNSIGNED) DIV 1000)
WHERE fecha_firma IS NULL AND firma_trabajador REGEXP 'firma_[0-9]{13}\\.png';

UPDATE Dynamic_pruebaconsumo
SET fecha_firma = FROM_UNIXTIME(CAST(REGEXP_SUBSTR(url_firma, '[0-9]{13}') AS UNSIGNED) DIV 1000), fecha_registro = fecha_registro
WHERE fecha_firma IS NULL AND url_firma REGEXP 'firma_[0-9]{13}\\.png';

UPDATE Dynamic_compromisosst
SET fecha_firma_trabajador = FROM_UNIXTIME(CAST(REGEXP_SUBSTR(url_firma_trabajador, '[0-9]{13}') AS UNSIGNED) DIV 1000)
WHERE fecha_firma_trabajador IS NULL AND url_firma_trabajador REGEXP 'firma_[0-9]{13}\\.png';

UPDATE Dynamic_compromisosst
SET fecha_firma_analista = FROM_UNIXTIME(CAST(REGEXP_SUBSTR(url_firma_analista, '[0-9]{13}') AS UNSIGNED) DIV 1000)
WHERE fecha_firma_analista IS NULL AND url_firma_analista REGEXP 'firma_[0-9]{13}\\.png';

UPDATE Dynamic_compromisosst
SET fecha_firma_lidersst = FROM_UNIXTIME(CAST(REGEXP_SUBSTR(url_firma_lidersst, '[0-9]{13}') AS UNSIGNED) DIV 1000)
WHERE fecha_firma_lidersst IS NULL AND url_firma_lidersst REGEXP 'firma_[0-9]{13}\\.png';

UPDATE Dynamic_compromisosst
SET fecha_firma_lidersst = fecha_firma_analista
WHERE fecha_firma_lidersst IS NULL AND firma_lidersst IS NOT NULL AND fecha_firma_analista IS NOT NULL;

-- Verificación
SELECT 'Evaluación SST' AS tabla, SUM(firma_trabajador IS NOT NULL) AS firmadas, SUM(fecha_firma IS NOT NULL) AS con_fecha FROM Maestro_evaluacionsst
UNION ALL SELECT 'Capacitación SST', SUM(firma_trabajador IS NOT NULL), SUM(fecha_firma IS NOT NULL) FROM Maestro_capacitacionsst
UNION ALL SELECT 'Prueba de Consumo', SUM(url_firma IS NOT NULL), SUM(fecha_firma IS NOT NULL) FROM Dynamic_pruebaconsumo
UNION ALL SELECT 'Compromiso - trabajador', SUM(firma_trabajador IS NOT NULL), SUM(fecha_firma_trabajador IS NOT NULL) FROM Dynamic_compromisosst
UNION ALL SELECT 'Compromiso - analista', SUM(firma_analista IS NOT NULL), SUM(fecha_firma_analista IS NOT NULL) FROM Dynamic_compromisosst
UNION ALL SELECT 'Compromiso - líder', SUM(firma_lidersst IS NOT NULL), SUM(fecha_firma_lidersst IS NOT NULL) FROM Dynamic_compromisosst;
