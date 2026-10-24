-- Bloqueo de Datos (Nómina y Facturación) y permisos de Clientes Crédito.
-- Se puede ejecutar más de una vez.

-- 1. Columna Desde en Bloqueo_Nomina (inicio del rango en el bloqueo por fechas de Facturación)
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Bloqueo_Nomina' AND COLUMN_NAME = 'Desde');
SET @sql := IF(@existe = 0, 'ALTER TABLE Bloqueo_Nomina ADD COLUMN Desde DATETIME NULL AFTER Quincena', 'SELECT ''Desde ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Parámetros en Config_Parametros (requiere la columna Descripcion:
--    migraciones/2026-10-23_config_parametros_descripcion.sql).
--    Si una fila no existe, el código usa estos mismos valores.
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Bloqueo_datos', 'Puede bloquear Asistencia', 'Rol', 'Nomina, Sistema', 'Roles que pueden bloquear la Asistencia de una quincena en Nómina > Bloqueo de Datos. Vacío: nadie puede bloquear.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Bloqueo_datos' AND Concepto = 'Puede bloquear Asistencia');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Bloqueo_datos', 'Puede desbloquear Asistencia', 'Rol', 'Nomina, Sistema', 'Roles que pueden desbloquear la Asistencia de una quincena en Nómina > Bloqueo de Datos. Vacío: nadie puede desbloquear.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Bloqueo_datos' AND Concepto = 'Puede desbloquear Asistencia');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Bloqueo_datos', 'Puede bloquear Servicios', 'Rol', 'Facturación, Sistema', 'Roles que pueden bloquear Servicios (por quincena o por fechas) en Facturación > Bloqueo de Datos. Vacío: nadie puede bloquear.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Bloqueo_datos' AND Concepto = 'Puede bloquear Servicios');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Bloqueo_datos', 'Puede desbloquear Servicios', 'Rol', 'Facturación, Sistema', 'Roles que pueden desbloquear Servicios (por quincena o por fechas) en Facturación > Bloqueo de Datos. Vacío: nadie puede desbloquear.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Bloqueo_datos' AND Concepto = 'Puede desbloquear Servicios');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Bloqueo_datos', 'Formas de pago permitidas en el bloqueo', 'Número', '1, 2, 3', 'Formas de pago que se pueden elegir al bloquear o desbloquear Servicios: 1 Efectivo, 2 Transferencia, 3 Crédito.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Bloqueo_datos' AND Concepto = 'Formas de pago permitidas en el bloqueo');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Clientes_credito', 'Puede gestionar Clientes Crédito', 'Rol', 'Facturación, Sistema', 'Roles que pueden agregar, editar, eliminar y marcar o desmarcar el Bloqueo de los clientes en Facturación > Clientes Crédito. Vacío: solo lectura para todos.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Clientes_credito' AND Concepto = 'Puede gestionar Clientes Crédito');

-- 3. Eliminar los registros antiguos de Nómina sin "Datos" (de AppSheet, ya no se necesitan).
--    Antes de borrar se puede revisar cuántos son (310 al 23/10/2026):
SELECT COUNT(*) AS a_eliminar FROM Bloqueo_Nomina WHERE Modulo = 'Nomina' AND (Datos IS NULL OR Datos = '');
DELETE FROM Bloqueo_Nomina WHERE Modulo = 'Nomina' AND (Datos IS NULL OR Datos = '');

-- Verificación
SELECT Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion FROM Config_Parametros
WHERE Seccion IN ('Bloqueo_datos', 'Clientes_credito') ORDER BY Modulo, Seccion, Concepto;
SHOW COLUMNS FROM Bloqueo_Nomina LIKE 'Desde';
