-- =============================================================================
-- Migración: Config_Parametros (facturacion / Servicios - Carga Masiva Grid)
-- Fecha: 2026-10-23
-- Se puede ejecutar más de una vez de forma segura (idempotente).
-- =============================================================================

-- 1. Roles con permiso para usar el Editor de Grid / Carga Masiva de Servicios
--    (la mayoría de usuarios solo carga recibos y servicios por el formulario individual).

INSERT INTO `Config_Parametros` (`Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro`, `Descripcion`)
SELECT 'facturacion', 'Servicios', 'Roles que pueden usar carga masiva de servicios',
       'Rol', 'Sistema, Facturación, AuxiliarR, CoordinadorR',
       'Lista de roles (separados por coma) que ven y pueden ejecutar el Editor de Grid de Carga Masiva de Servicios en Facturación.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `Config_Parametros`
  WHERE `Modulo` = 'facturacion'
    AND `Seccion` = 'Servicios'
    AND `Concepto` = 'Roles que pueden usar carga masiva de servicios'
);

-- 2. Límite máximo de filas de servicios por carga (los catálogos nuevos y recibos
--    quedan atados automáticamente a la cantidad de filas de servicios del lote)

INSERT INTO `Config_Parametros` (`Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro`, `Descripcion`)
SELECT 'facturacion', 'Servicios', 'Límite máximo de servicios por carga',
       'Filas', '500',
       'Cantidad máxima de filas de servicios que se pueden cargar en un solo lote desde el Editor de Grid de Facturación.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `Config_Parametros`
  WHERE `Modulo` = 'facturacion'
    AND `Seccion` = 'Servicios'
    AND `Concepto` = 'Límite máximo de servicios por carga'
);

-- Verificación
SELECT id, Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion
FROM `Config_Parametros`
WHERE `Modulo` = 'facturacion' AND `Seccion` = 'Servicios'
ORDER BY id;
