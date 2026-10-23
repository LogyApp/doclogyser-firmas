-- =============================================================================
-- Migración: Maestro_Menu_Sst (limpieza de columnas y sección Inspecciones_vehiculos)
--            + Config_Parametros (sst / Inspecciones_Vehiculo)
-- Fecha: 2026-10-22
-- Se puede ejecutar más de una vez de forma segura (idempotente).
-- =============================================================================

-- 1. Eliminar las columnas Icono, Descripción y Url de Maestro_Menu_Sst
--    para que quede con la misma estructura (ID, Sección, Rol, Acceso) que Maestro_Menu_Nomina.

SET @col_icono = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Menu_Sst' AND COLUMN_NAME = 'Icono'
);
SET @sql_drop_icono = IF(@col_icono > 0,
  'ALTER TABLE `Maestro_Menu_Sst` DROP COLUMN `Icono`',
  'SELECT 1'
);
PREPARE stmt_icono FROM @sql_drop_icono;
EXECUTE stmt_icono;
DEALLOCATE PREPARE stmt_icono;

SET @col_desc = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Menu_Sst' AND COLUMN_NAME = 'Descripción'
);
SET @sql_drop_desc = IF(@col_desc > 0,
  'ALTER TABLE `Maestro_Menu_Sst` DROP COLUMN `Descripción`',
  'SELECT 1'
);
PREPARE stmt_desc FROM @sql_drop_desc;
EXECUTE stmt_desc;
DEALLOCATE PREPARE stmt_desc;

SET @col_url = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Menu_Sst' AND COLUMN_NAME = 'Url'
);
SET @sql_drop_url = IF(@col_url > 0,
  'ALTER TABLE `Maestro_Menu_Sst` DROP COLUMN `Url`',
  'SELECT 1'
);
PREPARE stmt_url FROM @sql_drop_url;
EXECUTE stmt_url;
DEALLOCATE PREPARE stmt_url;

-- 2. Registrar la nueva pestaña "Inspecciones_vehiculos" en Maestro_Menu_Sst
--    Códigos de Acceso: 1 = General (sin filtro), 2 = Por Regional, 3 = Por Dispositivo/Operación, 4 = Por Modalidad

INSERT INTO `Maestro_Menu_Sst` (`Sección`, `Rol`, `Acceso`)
SELECT 'Inspecciones_vehiculos', 'Sistema', 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Maestro_Menu_Sst` WHERE `Sección` = 'Inspecciones_vehiculos' AND `Rol` = 'Sistema');

INSERT INTO `Maestro_Menu_Sst` (`Sección`, `Rol`, `Acceso`)
SELECT 'Inspecciones_vehiculos', 'AdmSst', 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Maestro_Menu_Sst` WHERE `Sección` = 'Inspecciones_vehiculos' AND `Rol` = 'AdmSst');

INSERT INTO `Maestro_Menu_Sst` (`Sección`, `Rol`, `Acceso`)
SELECT 'Inspecciones_vehiculos', 'LiderSst', 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Maestro_Menu_Sst` WHERE `Sección` = 'Inspecciones_vehiculos' AND `Rol` = 'LiderSst');

INSERT INTO `Maestro_Menu_Sst` (`Sección`, `Rol`, `Acceso`)
SELECT 'Inspecciones_vehiculos', 'AnaSst', 4 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Maestro_Menu_Sst` WHERE `Sección` = 'Inspecciones_vehiculos' AND `Rol` = 'AnaSst');

INSERT INTO `Maestro_Menu_Sst` (`Sección`, `Rol`, `Acceso`)
SELECT 'Inspecciones_vehiculos', 'AuxSst', 3 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Maestro_Menu_Sst` WHERE `Sección` = 'Inspecciones_vehiculos' AND `Rol` = 'AuxSst');

INSERT INTO `Maestro_Menu_Sst` (`Sección`, `Rol`, `Acceso`)
SELECT 'Inspecciones_vehiculos', 'CoordinadorR', 2 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Maestro_Menu_Sst` WHERE `Sección` = 'Inspecciones_vehiculos' AND `Rol` = 'CoordinadorR');

INSERT INTO `Maestro_Menu_Sst` (`Sección`, `Rol`, `Acceso`)
SELECT 'Inspecciones_vehiculos', 'AuxiliarR', 2 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Maestro_Menu_Sst` WHERE `Sección` = 'Inspecciones_vehiculos' AND `Rol` = 'AuxiliarR');

INSERT INTO `Maestro_Menu_Sst` (`Sección`, `Rol`, `Acceso`)
SELECT 'Inspecciones_vehiculos', 'Coordinador', 3 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Maestro_Menu_Sst` WHERE `Sección` = 'Inspecciones_vehiculos' AND `Rol` = 'Coordinador');

INSERT INTO `Maestro_Menu_Sst` (`Sección`, `Rol`, `Acceso`)
SELECT 'Inspecciones_vehiculos', 'Auxiliar', 3 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Maestro_Menu_Sst` WHERE `Sección` = 'Inspecciones_vehiculos' AND `Rol` = 'Auxiliar');

-- Asegurar que Sistema también esté registrado en Participación y Casos Medicos
INSERT INTO `Maestro_Menu_Sst` (`Sección`, `Rol`, `Acceso`)
SELECT 'Participación', 'Sistema', 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Maestro_Menu_Sst` WHERE `Sección` = 'Participación' AND `Rol` = 'Sistema');

INSERT INTO `Maestro_Menu_Sst` (`Sección`, `Rol`, `Acceso`)
SELECT 'Casos Medicos', 'Sistema', 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Maestro_Menu_Sst` WHERE `Sección` = 'Casos Medicos' AND `Rol` = 'Sistema');

-- 3. Parámetros de acciones y límites de reporte en Config_Parametros (sst / Inspecciones_Vehiculo)
--    (Quién ve la pestaña y qué operaciones ve lo gobierna Maestro_Menu_Sst).

DELETE FROM `Config_Parametros`
WHERE `Modulo` = 'sst'
  AND `Seccion` = 'Inspecciones_Vehiculo'
  AND `Concepto` IN (
    'Roles con acceso total (sin filtro de operación) en Inspecciones Vehículos',
    'Roles con filtro por Regional en Inspecciones Vehículos'
  );

INSERT INTO `Config_Parametros` (`Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro`)
SELECT 'sst', 'Inspecciones_Vehiculo', 'Roles que pueden registrar inspecciones de vehículos en SST',
       'Rol', 'Sistema, AdmSst, AnaSst, AuxSst, LiderSst, Coordinador, CoordinadorR, Auxiliar, AuxiliarR'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `Config_Parametros`
  WHERE `Modulo` = 'sst'
    AND `Seccion` = 'Inspecciones_Vehiculo'
    AND `Concepto` = 'Roles que pueden registrar inspecciones de vehículos en SST'
);

INSERT INTO `Config_Parametros` (`Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro`)
SELECT 'sst', 'Inspecciones_Vehiculo', 'Roles que pueden eliminar inspecciones de vehículos en SST',
       'Rol', 'Sistema, AdmSst, LiderSst'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `Config_Parametros`
  WHERE `Modulo` = 'sst'
    AND `Seccion` = 'Inspecciones_Vehiculo'
    AND `Concepto` = 'Roles que pueden eliminar inspecciones de vehículos en SST'
);

INSERT INTO `Config_Parametros` (`Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro`)
SELECT 'sst', 'Inspecciones_Vehiculo', 'Límite de filas reporte Excel - Inspecciones Vehículos',
       'Filas', '10000'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `Config_Parametros`
  WHERE `Modulo` = 'sst'
    AND `Seccion` = 'Inspecciones_Vehiculo'
    AND `Concepto` = 'Límite de filas reporte Excel - Inspecciones Vehículos'
);

INSERT INTO `Config_Parametros` (`Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro`)
SELECT 'sst', 'Inspecciones_Vehiculo', 'Límite de filas reporte CSV - Inspecciones Vehículos',
       'Filas', '100000'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `Config_Parametros`
  WHERE `Modulo` = 'sst'
    AND `Seccion` = 'Inspecciones_Vehiculo'
    AND `Concepto` = 'Límite de filas reporte CSV - Inspecciones Vehículos'
);

-- Verificación
SELECT * FROM `Maestro_Menu_Sst` ORDER BY `Sección`, `Rol`;
SELECT id, Modulo, Seccion, Concepto, Condicion, Parametro
FROM `Config_Parametros`
WHERE `Modulo` = 'sst' AND `Seccion` = 'Inspecciones_Vehiculo'
ORDER BY id;
