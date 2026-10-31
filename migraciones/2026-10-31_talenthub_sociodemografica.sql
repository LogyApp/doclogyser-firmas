-- =============================================================================
-- Migración: Pestaña Sociodemográfica en TalentHub
-- Fecha: 2026-10-31
-- =============================================================================
-- 1. Crea la columna `usuarioactualiza` en Maestro_Vinculación, Maestro_Segmentación
--    y Maestro_Examenes (si no existe) y la rellena inicialmente con `Usuario`.
-- 2. Inserta en Config_Parametros (Modulo = 'talenthub', Seccion = 'Sociodemografica')
--    los permisos por Rol para:
--      - Activar o desactivar vista Activos y Retirados
--      - Ver cada una de las 7 opciones en Activo y en Retirado
--      - Editar en cada una de las 7 opciones para Activo y para Retirado
-- =============================================================================

-- ── 1. Columna usuarioactualiza en Maestro_Vinculación ───────────────────────
SET @col_mv = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Vinculación' AND COLUMN_NAME = 'usuarioactualiza'
);
SET @sql_mv = IF(@col_mv = 0,
  'ALTER TABLE `Maestro_Vinculación` ADD COLUMN `usuarioactualiza` VARCHAR(100) NULL AFTER `Usuario`',
  'SELECT 1'
);
PREPARE stmt_mv FROM @sql_mv;
EXECUTE stmt_mv;
DEALLOCATE PREPARE stmt_mv;

UPDATE `Maestro_Vinculación`
SET `usuarioactualiza` = `Usuario`
WHERE `usuarioactualiza` IS NULL AND `Usuario` IS NOT NULL;

-- ── 2. Columna usuarioactualiza en Maestro_Segmentación ──────────────────────
SET @col_ms = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Segmentación' AND COLUMN_NAME = 'usuarioactualiza'
);
SET @sql_ms = IF(@col_ms = 0,
  'ALTER TABLE `Maestro_Segmentación` ADD COLUMN `usuarioactualiza` VARCHAR(100) NULL AFTER `Usuario`',
  'SELECT 1'
);
PREPARE stmt_ms FROM @sql_ms;
EXECUTE stmt_ms;
DEALLOCATE PREPARE stmt_ms;

UPDATE `Maestro_Segmentación`
SET `usuarioactualiza` = `Usuario`
WHERE `usuarioactualiza` IS NULL AND `Usuario` IS NOT NULL;

-- ── 3. Columna usuarioactualiza en Maestro_Examenes ──────────────────────────
SET @col_me = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Examenes' AND COLUMN_NAME = 'usuarioactualiza'
);
SET @sql_me = IF(@col_me = 0,
  'ALTER TABLE `Maestro_Examenes` ADD COLUMN `usuarioactualiza` VARCHAR(100) NULL AFTER `Usuario`',
  'SELECT 1'
);
PREPARE stmt_me FROM @sql_me;
EXECUTE stmt_me;
DEALLOCATE PREPARE stmt_me;

UPDATE `Maestro_Examenes`
SET `usuarioactualiza` = `Usuario`
WHERE `usuarioactualiza` IS NULL AND `Usuario` IS NOT NULL;

-- ── 4. Parámetros de permisos en Config_Parametros (talenthub / Sociodemografica) ──

-- 4.1 Interruptor de roles que pueden alternar entre Activos y Retirados
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Activar o desactivar vista Activos y Retirados', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Auxiliar, Coordinador, Sistema',
       'Roles que pueden cambiar el selector entre Activos y Retirados en la pestaña Sociodemográfica. Si se deja vacío, solo se muestra Activos.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Activar o desactivar vista Activos y Retirados'
);

-- 4.2 Ver opciones en Activo (7 opciones)
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Ver Colaboradores - Activo', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Auxiliar, Coordinador, Sistema',
       'Roles que pueden ver la opción Colaboradores cuando la vista está en Activos (también regulado por Maestro_Menu).'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Ver Colaboradores - Activo'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Ver Datos Generales - Activo', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Auxiliar, Coordinador, Sistema',
       'Roles que pueden ver la opción Datos Generales cuando la vista está en Activos. Vacío: nadie ve esta opción en Activos.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Ver Datos Generales - Activo'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Ver Información Personal - Activo', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Auxiliar, Coordinador, Sistema',
       'Roles que pueden ver la opción Información Personal cuando la vista está en Activos. Vacío: nadie ve esta opción en Activos.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Ver Información Personal - Activo'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Ver Dotación - Activo', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Auxiliar, Coordinador, Sistema',
       'Roles que pueden ver la opción Dotación cuando la vista está en Activos. Vacío: nadie ve esta opción en Activos.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Ver Dotación - Activo'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Ver Información Bancaria - Activo', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Auxiliar, Coordinador, Sistema',
       'Roles que pueden ver la opción Información Bancaria cuando la vista está en Activos. Vacío: nadie ve esta opción en Activos.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Ver Información Bancaria - Activo'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Ver Seguridad Social - Activo', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Auxiliar, Coordinador, Sistema',
       'Roles que pueden ver la opción Seguridad Social cuando la vista está en Activos. Vacío: nadie ve esta opción en Activos.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Ver Seguridad Social - Activo'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Ver Examenes - Activo', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Auxiliar, Coordinador, Sistema',
       'Roles que pueden ver la opción Exámenes cuando la vista está en Activos. Vacío: nadie ve esta opción en Activos.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Ver Examenes - Activo'
);

-- 4.3 Ver opciones en Retirado (7 opciones)
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Ver Colaboradores - Retirado', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Auxiliar, Coordinador, Sistema',
       'Roles que pueden ver la opción Colaboradores cuando la vista está en Retirados. Vacío: nadie ve esta opción en Retirados.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Ver Colaboradores - Retirado'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Ver Datos Generales - Retirado', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Auxiliar, Coordinador, Sistema',
       'Roles que pueden ver la opción Datos Generales cuando la vista está en Retirados. Vacío: nadie ve esta opción en Retirados.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Ver Datos Generales - Retirado'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Ver Información Personal - Retirado', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Auxiliar, Coordinador, Sistema',
       'Roles que pueden ver la opción Información Personal cuando la vista está en Retirados. Vacío: nadie ve esta opción en Retirados.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Ver Información Personal - Retirado'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Ver Dotación - Retirado', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Auxiliar, Coordinador, Sistema',
       'Roles que pueden ver la opción Dotación cuando la vista está en Retirados. Vacío: nadie ve esta opción en Retirados.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Ver Dotación - Retirado'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Ver Información Bancaria - Retirado', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Auxiliar, Coordinador, Sistema',
       'Roles que pueden ver la opción Información Bancaria cuando la vista está en Retirados. Vacío: nadie ve esta opción en Retirados.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Ver Información Bancaria - Retirado'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Ver Seguridad Social - Retirado', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Auxiliar, Coordinador, Sistema',
       'Roles que pueden ver la opción Seguridad Social cuando la vista está en Retirados. Vacío: nadie ve esta opción en Retirados.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Ver Seguridad Social - Retirado'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Ver Examenes - Retirado', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Auxiliar, Coordinador, Sistema',
       'Roles que pueden ver la opción Exámenes cuando la vista está en Retirados. Vacío: nadie ve esta opción en Retirados.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Ver Examenes - Retirado'
);

-- 4.4 Editar opciones en Activo (7 opciones)
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Editar Colaboradores - Activo', 'Rol',
       'Contratación, CoorSelección, Directorth, Sistema',
       'Roles que pueden editar registros en la opción Colaboradores cuando la vista está en Activos. Vacío: solo lectura.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Editar Colaboradores - Activo'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Editar Datos Generales - Activo', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, Sistema',
       'Roles que pueden editar registros en la opción Datos Generales cuando la vista está en Activos. Vacío: solo lectura.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Editar Datos Generales - Activo'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Editar Información Personal - Activo', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Auxiliar, Coordinador, Sistema',
       'Roles que pueden editar registros en la opción Información Personal cuando la vista está en Activos. Vacío: solo lectura.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Editar Información Personal - Activo'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Editar Dotación - Activo', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Auxiliar, Coordinador, Sistema',
       'Roles que pueden editar registros en la opción Dotación cuando la vista está en Activos. Vacío: solo lectura.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Editar Dotación - Activo'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Editar Información Bancaria - Activo', 'Rol',
       'Contratación, CoorSelección, Directorth, Sistema',
       'Roles que pueden editar registros en la opción Información Bancaria cuando la vista está en Activos. Vacío: solo lectura.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Editar Información Bancaria - Activo'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Editar Seguridad Social - Activo', 'Rol',
       'Contratación, CoorSelección, Directorth, Sistema',
       'Roles que pueden editar registros en la opción Seguridad Social cuando la vista está en Activos. Vacío: solo lectura.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Editar Seguridad Social - Activo'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Editar Examenes - Activo', 'Rol',
       'Contratación, CoorSelección, Directorth, Selección, Selección Centro, AuxiliarR, Sistema',
       'Roles que pueden editar registros en la opción Exámenes cuando la vista está en Activos. Vacío: solo lectura.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Editar Examenes - Activo'
);

-- 4.5 Editar opciones en Retirado (7 opciones)
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Editar Colaboradores - Retirado', 'Rol',
       'Contratación, CoorSelección, Directorth, Sistema',
       'Roles que pueden editar registros en la opción Colaboradores cuando la vista está en Retirados. Vacío: solo lectura.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Editar Colaboradores - Retirado'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Editar Datos Generales - Retirado', 'Rol',
       'Contratación, CoorSelección, Directorth, Sistema',
       'Roles que pueden editar registros en la opción Datos Generales cuando la vista está en Retirados. Vacío: solo lectura.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Editar Datos Generales - Retirado'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Editar Información Personal - Retirado', 'Rol',
       'Contratación, CoorSelección, Directorth, Sistema',
       'Roles que pueden editar registros en la opción Información Personal cuando la vista está en Retirados. Vacío: solo lectura.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Editar Información Personal - Retirado'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Editar Dotación - Retirado', 'Rol',
       'Contratación, CoorSelección, Directorth, Sistema',
       'Roles que pueden editar registros en la opción Dotación cuando la vista está en Retirados. Vacío: solo lectura.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Editar Dotación - Retirado'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Editar Información Bancaria - Retirado', 'Rol',
       'Contratación, CoorSelección, Directorth, Sistema',
       'Roles que pueden editar registros en la opción Información Bancaria cuando la vista está en Retirados. Vacío: solo lectura.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Editar Información Bancaria - Retirado'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Editar Seguridad Social - Retirado', 'Rol',
       'Contratación, CoorSelección, Directorth, Sistema',
       'Roles que pueden editar registros en la opción Seguridad Social cuando la vista está en Retirados. Vacío: solo lectura.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Editar Seguridad Social - Retirado'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Editar Examenes - Retirado', 'Rol',
       'Contratación, CoorSelección, Directorth, Sistema',
       'Roles que pueden editar registros en la opción Exámenes cuando la vista está en Retirados. Vacío: solo lectura.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Editar Examenes - Retirado'
);


-- ── 5. Etiqueta en Maestro_Menu para la pestaña Sociodemografica ─────────────
UPDATE Maestro_Menu
SET Etiqueta = 'Sociodemografica'
WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica';


-- =============================================================================
-- ── 6. Optimización de Índices (Agregar faltantes, Eliminar redundantes, Modificar)
-- =============================================================================

-- 6.1 Maestro_Examenes: Agregar índices faltantes (no tenía ningún índice secundario)
SET @idx_me_1 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Examenes' AND INDEX_NAME = 'idx_examenes_estado_fecha'
);
SET @sql_idx_me_1 = IF(@idx_me_1 = 0,
  'ALTER TABLE `Maestro_Examenes` ADD INDEX `idx_examenes_estado_fecha` (`Estado`, `Fecha Actualización`)',
  'SELECT 1'
);
PREPARE stmt_idx_me_1 FROM @sql_idx_me_1;
EXECUTE stmt_idx_me_1;
DEALLOCATE PREPARE stmt_idx_me_1;

SET @idx_me_2 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Examenes' AND INDEX_NAME = 'idx_examenes_ident_estado'
);
SET @sql_idx_me_2 = IF(@idx_me_2 = 0,
  'ALTER TABLE `Maestro_Examenes` ADD INDEX `idx_examenes_ident_estado` (`Identificación`, `Estado`)',
  'SELECT 1'
);
PREPARE stmt_idx_me_2 FROM @sql_idx_me_2;
EXECUTE stmt_idx_me_2;
DEALLOCATE PREPARE stmt_idx_me_2;

-- 6.2 Maestro_Segmentación: Agregar índices por Estado + Fecha de Actualización y Estado + Operación
SET @idx_ms_1 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Segmentación' AND INDEX_NAME = 'idx_segmentacion_estado_fecha'
);
SET @sql_idx_ms_1 = IF(@idx_ms_1 = 0,
  'ALTER TABLE `Maestro_Segmentación` ADD INDEX `idx_segmentacion_estado_fecha` (`Estado`, `Fecha de Actualización`)',
  'SELECT 1'
);
PREPARE stmt_idx_ms_1 FROM @sql_idx_ms_1;
EXECUTE stmt_idx_ms_1;
DEALLOCATE PREPARE stmt_idx_ms_1;

SET @idx_ms_2 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Segmentación' AND INDEX_NAME = 'idx_segmentacion_estado_operacion'
);
SET @sql_idx_ms_2 = IF(@idx_ms_2 = 0,
  'ALTER TABLE `Maestro_Segmentación` ADD INDEX `idx_segmentacion_estado_operacion` (`Estado`, `Operación`)',
  'SELECT 1'
);
PREPARE stmt_idx_ms_2 FROM @sql_idx_ms_2;
EXECUTE stmt_idx_ms_2;
DEALLOCATE PREPARE stmt_idx_ms_2;

-- 6.3 Maestro_Vinculación: Eliminar índice redundante idx_vinc_estado y agregar compuestos faltantes
SET @idx_mv_drop = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Vinculación' AND INDEX_NAME = 'idx_vinc_estado'
);
SET @sql_idx_mv_drop = IF(@idx_mv_drop > 0,
  'ALTER TABLE `Maestro_Vinculación` DROP INDEX `idx_vinc_estado`',
  'SELECT 1'
);
PREPARE stmt_idx_mv_drop FROM @sql_idx_mv_drop;
EXECUTE stmt_idx_mv_drop;
DEALLOCATE PREPARE stmt_idx_mv_drop;

SET @idx_mv_add1 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Vinculación' AND INDEX_NAME = 'idx_mv_ident_estado_ingreso'
);
SET @sql_idx_mv_add1 = IF(@idx_mv_add1 = 0,
  'ALTER TABLE `Maestro_Vinculación` ADD INDEX `idx_mv_ident_estado_ingreso` (`Identificación`, `Estado`, `Fecha de Ingreso`, `Fecha Actualización`)',
  'SELECT 1'
);
PREPARE stmt_idx_mv_add1 FROM @sql_idx_mv_add1;
EXECUTE stmt_idx_mv_add1;
DEALLOCATE PREPARE stmt_idx_mv_add1;

SET @idx_mv_add2 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_Vinculación' AND INDEX_NAME = 'idx_vinc_estado_op_ingreso'
);
SET @sql_idx_mv_add2 = IF(@idx_mv_add2 = 0,
  'ALTER TABLE `Maestro_Vinculación` ADD INDEX `idx_vinc_estado_op_ingreso` (`Estado`, `Operación`, `Fecha de Ingreso`)',
  'SELECT 1'
);
PREPARE stmt_idx_mv_add2 FROM @sql_idx_mv_add2;
EXECUTE stmt_idx_mv_add2;
DEALLOCATE PREPARE stmt_idx_mv_add2;

-- 6.4 Maestro_docTrabajador: Eliminar 4 índices redundantes (prefijos exactos de otros compuestos)
--     y modificar idx_mdt_tipo_ident e idx_identificacion_tipo para incluir FechaRegistro
SET @idx_mdt_d1 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_docTrabajador' AND INDEX_NAME = 'idx_identificacion_fk'
);
SET @sql_idx_mdt_d1 = IF(@idx_mdt_d1 > 0,
  'ALTER TABLE `Maestro_docTrabajador` DROP INDEX `idx_identificacion_fk`',
  'SELECT 1'
);
PREPARE stmt_idx_mdt_d1 FROM @sql_idx_mdt_d1;
EXECUTE stmt_idx_mdt_d1;
DEALLOCATE PREPARE stmt_idx_mdt_d1;

SET @idx_mdt_d2 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_docTrabajador' AND INDEX_NAME = 'idx_mdt_tipodocumento'
);
SET @sql_idx_mdt_d2 = IF(@idx_mdt_d2 > 0,
  'ALTER TABLE `Maestro_docTrabajador` DROP INDEX `idx_mdt_tipodocumento`',
  'SELECT 1'
);
PREPARE stmt_idx_mdt_d2 FROM @sql_idx_mdt_d2;
EXECUTE stmt_idx_mdt_d2;
DEALLOCATE PREPARE stmt_idx_mdt_d2;

SET @idx_mdt_d3 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_docTrabajador' AND INDEX_NAME = 'idx_mdt_regional_operacion'
);
SET @sql_idx_mdt_d3 = IF(@idx_mdt_d3 > 0,
  'ALTER TABLE `Maestro_docTrabajador` DROP INDEX `idx_mdt_regional_operacion`',
  'SELECT 1'
);
PREPARE stmt_idx_mdt_d3 FROM @sql_idx_mdt_d3;
EXECUTE stmt_idx_mdt_d3;
DEALLOCATE PREPARE stmt_idx_mdt_d3;

SET @idx_mdt_d4 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_docTrabajador' AND INDEX_NAME = 'idx_mdt_recurso'
);
SET @sql_idx_mdt_d4 = IF(@idx_mdt_d4 > 0,
  'ALTER TABLE `Maestro_docTrabajador` DROP INDEX `idx_mdt_recurso`',
  'SELECT 1'
);
PREPARE stmt_idx_mdt_d4 FROM @sql_idx_mdt_d4;
EXECUTE stmt_idx_mdt_d4;
DEALLOCATE PREPARE stmt_idx_mdt_d4;

-- Modificar idx_mdt_tipo_ident para incluir FechaRegistro (si aún tiene solo 2 columnas)
SET @cols_mdt_ti = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_docTrabajador' AND INDEX_NAME = 'idx_mdt_tipo_ident'
);
SET @sql_mod_mdt_ti = IF(@cols_mdt_ti = 2,
  'ALTER TABLE `Maestro_docTrabajador` DROP INDEX `idx_mdt_tipo_ident`, ADD INDEX `idx_mdt_tipo_ident` (`TipoDocumento`, `Identificación`, `FechaRegistro`)',
  IF(@cols_mdt_ti = 0,
    'ALTER TABLE `Maestro_docTrabajador` ADD INDEX `idx_mdt_tipo_ident` (`TipoDocumento`, `Identificación`, `FechaRegistro`)',
    'SELECT 1'
  )
);
PREPARE stmt_mod_mdt_ti FROM @sql_mod_mdt_ti;
EXECUTE stmt_mod_mdt_ti;
DEALLOCATE PREPARE stmt_mod_mdt_ti;

-- Modificar idx_identificacion_tipo para incluir FechaRegistro (en una sola sentencia ALTER para mantener soporte de FK)
SET @cols_mdt_it = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_docTrabajador' AND INDEX_NAME = 'idx_identificacion_tipo'
);
SET @sql_mod_mdt_it = IF(@cols_mdt_it = 2,
  'ALTER TABLE `Maestro_docTrabajador` DROP INDEX `idx_identificacion_tipo`, ADD INDEX `idx_identificacion_tipo` (`Identificación`, `TipoDocumento`, `FechaRegistro`)',
  IF(@cols_mdt_it = 0,
    'ALTER TABLE `Maestro_docTrabajador` ADD INDEX `idx_identificacion_tipo` (`Identificación`, `TipoDocumento`, `FechaRegistro`)',
    'SELECT 1'
  )
);
PREPARE stmt_mod_mdt_it FROM @sql_mod_mdt_it;
EXECUTE stmt_mod_mdt_it;
DEALLOCATE PREPARE stmt_mod_mdt_it;
