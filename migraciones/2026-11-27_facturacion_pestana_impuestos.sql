-- Facturación › Impuestos: Configuración de impuestos, retenciones y bases mínimas (Config_Impuestos)
-- Quién ve la pestaña: Maestro_Menu (Modulo = 'facturacion', Seccion = 'Impuestos')
-- Permisos para agregar/editar: Config_Parametros (Modulo = 'facturacion', Seccion = 'Impuestos')
-- Idempotente: se puede ejecutar más de una vez sin duplicar registros.

-- 1. Pestaña Impuestos en Maestro_Menu (solo Sistema, Facturación y Contabilidad)
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'facturacion', 'Impuestos', 'Sistema, Facturación, Contabilidad', 1,
       'Impuestos', '/facturacion?tab=impuestos', 11, '％',
       'Configuración de impuestos y retenciones de facturación (Config_Impuestos).'
WHERE NOT EXISTS (
  SELECT 1 FROM Maestro_Menu WHERE Modulo = 'facturacion' AND Seccion = 'Impuestos' AND Acceso = 1
);

-- 2. Permiso para agregar en Config_Parametros
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Impuestos', 'Roles que pueden agregar impuestos', 'Rol',
       'Sistema, Facturación, Contabilidad',
       'Roles autorizados para agregar y editar registros en la pestaña Impuestos de Facturación (Config_Impuestos). Si se deja vacío, nadie puede agregar.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Impuestos' AND Concepto = 'Roles que pueden agregar impuestos'
);

-- 3. Quién y cuándo agregó o editó cada impuesto (la pestaña los llena al guardar)
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Config_Impuestos' AND COLUMN_NAME = 'Usuario');
SET @sql := IF(@existe = 0, 'ALTER TABLE Config_Impuestos ADD COLUMN `Usuario` varchar(100) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Config_Impuestos' AND COLUMN_NAME = 'Fecha_Registro');
SET @sql := IF(@existe = 0, 'ALTER TABLE Config_Impuestos ADD COLUMN `Fecha_Registro` datetime NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
