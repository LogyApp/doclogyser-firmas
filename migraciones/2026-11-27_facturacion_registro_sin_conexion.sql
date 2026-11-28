-- Facturación: registro sin conexión de Recibos y Servicios.
-- Fecha: 2026-11-27
-- Se puede ejecutar más de una vez.
--   * IdOffline: código único creado en el celular; evita duplicados si el registro se reintenta.
--   * FechaCaptura: fecha y hora en que el registro se guardó en el celular.
--   * Parámetros: Config_Parametros facturacion / Offline.

-- 1) Columnas en Dynamic_Recibos
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Recibos' AND COLUMN_NAME = 'IdOffline');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_Recibos ADD COLUMN IdOffline VARCHAR(40) NULL, ADD COLUMN FechaCaptura DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Recibos' AND INDEX_NAME = 'uq_recibos_idoffline');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_Recibos ADD UNIQUE INDEX uq_recibos_idoffline (IdOffline)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Columnas en Dynamic_Servicios
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Servicios' AND COLUMN_NAME = 'IdOffline');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_Servicios ADD COLUMN IdOffline VARCHAR(40) NULL, ADD COLUMN FechaCaptura DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Servicios' AND INDEX_NAME = 'uq_servicios_idoffline');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_Servicios ADD UNIQUE INDEX uq_servicios_idoffline (IdOffline)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) Parámetros
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Offline', 'Habilitar registro sin conexión', 'Booleano', '1',
       '1 = en Recibos y Servicios se pueden crear registros sin internet: quedan guardados en el celular y se suben solos al volver la señal. 0 o sin la fila = desactivado (todo requiere internet).'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Offline' AND Concepto = 'Habilitar registro sin conexión');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Offline', 'Aceptar servicios sin conexión en quincena bloqueada', 'Booleano', '1',
       '1 = un servicio guardado sin conexión se acepta al subirlo aunque su quincena ya esté bloqueada en Bloqueo de Datos (se sigue exigiendo la misma quincena del recibo). 0 = se aplica el bloqueo como a cualquier servicio.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Offline' AND Concepto = 'Aceptar servicios sin conexión en quincena bloqueada');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Offline', 'Días máximos para subir un registro sin conexión', 'Numero', '7',
       'Un registro guardado sin conexión hace más de estos días se rechaza al subirlo y debe registrarse de nuevo. Vacío o inválido = 7 (máximo 60).'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Offline' AND Concepto = 'Días máximos para subir un registro sin conexión');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Offline', 'Días de historial para los catálogos sin conexión', 'Numero', '90',
       'Placas, transportadoras, proveedores y clientes que se descargan al celular para buscar sin internet: los usados en este número de días en las operaciones del usuario (hasta 3000 de cada uno). Vacío o inválido = 90.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Offline' AND Concepto = 'Días de historial para los catálogos sin conexión');
