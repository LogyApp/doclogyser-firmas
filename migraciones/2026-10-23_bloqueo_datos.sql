-- Bloqueo de Datos (Nómina y Facturación).
-- Se puede ejecutar más de una vez.

-- 1. Columna Desde en Bloqueo_Nomina (inicio del rango en el bloqueo por fechas de Facturación)
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Bloqueo_Nomina' AND COLUMN_NAME = 'Desde');
SET @sql := IF(@existe = 0, 'ALTER TABLE Bloqueo_Nomina ADD COLUMN Desde DATETIME NULL AFTER Quincena', 'SELECT ''Desde ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Permisos en Config_Parametros (si una fila no existe, el código usa estos mismos valores)
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Bloqueo_datos', 'Puede bloquear Asistencia', 'Rol', 'Nomina, Sistema' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Bloqueo_datos' AND Concepto = 'Puede bloquear Asistencia');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Bloqueo_datos', 'Puede desbloquear Asistencia', 'Rol', 'Nomina, Sistema' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Bloqueo_datos' AND Concepto = 'Puede desbloquear Asistencia');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'facturacion', 'Bloqueo_datos', 'Puede bloquear Servicios', 'Rol', 'Facturación, Sistema' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Bloqueo_datos' AND Concepto = 'Puede bloquear Servicios');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'facturacion', 'Bloqueo_datos', 'Puede desbloquear Servicios', 'Rol', 'Facturación, Sistema' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Bloqueo_datos' AND Concepto = 'Puede desbloquear Servicios');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'facturacion', 'Bloqueo_datos', 'Formas de pago permitidas en el bloqueo', 'Número', '1, 2, 3' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Bloqueo_datos' AND Concepto = 'Formas de pago permitidas en el bloqueo');

-- 3. Eliminar los registros antiguos de Nómina sin "Datos" (de AppSheet, ya no se necesitan).
--    Antes de borrar se puede revisar cuántos son (310 al 23/10/2026):
SELECT COUNT(*) AS a_eliminar FROM Bloqueo_Nomina WHERE Modulo = 'Nomina' AND (Datos IS NULL OR Datos = '');
DELETE FROM Bloqueo_Nomina WHERE Modulo = 'Nomina' AND (Datos IS NULL OR Datos = '');

-- Verificación
SELECT Modulo, Seccion, Concepto, Condicion, Parametro FROM Config_Parametros
WHERE Seccion = 'Bloqueo_datos' ORDER BY Modulo, Concepto;
SHOW COLUMNS FROM Bloqueo_Nomina LIKE 'Desde';
