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

-- 2. Límites de carga máxima por lote (replicando el bloque de control del Excel V7)

INSERT INTO `Config_Parametros` (`Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro`, `Descripcion`)
SELECT 'facturacion', 'Servicios', 'Límite máximo de transportadoras nuevas por carga',
       'Filas', '50',
       'Cantidad máxima de transportadoras nuevas que se pueden crear automáticamente en Maestro_Transportadora durante una sola carga masiva.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `Config_Parametros`
  WHERE `Modulo` = 'facturacion'
    AND `Seccion` = 'Servicios'
    AND `Concepto` = 'Límite máximo de transportadoras nuevas por carga'
);

INSERT INTO `Config_Parametros` (`Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro`, `Descripcion`)
SELECT 'facturacion', 'Servicios', 'Límite máximo de proveedores nuevos por carga',
       'Filas', '50',
       'Cantidad máxima de proveedores nuevos que se pueden crear automáticamente en Maestro_Proveedor durante una sola carga masiva.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `Config_Parametros`
  WHERE `Modulo` = 'facturacion'
    AND `Seccion` = 'Servicios'
    AND `Concepto` = 'Límite máximo de proveedores nuevos por carga'
);

INSERT INTO `Config_Parametros` (`Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro`, `Descripcion`)
SELECT 'facturacion', 'Servicios', 'Límite máximo de placas nuevas por carga',
       'Filas', '100',
       'Cantidad máxima de placas nuevas de 6 caracteres que se pueden crear automáticamente en Maestro_Placas durante una sola carga masiva.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `Config_Parametros`
  WHERE `Modulo` = 'facturacion'
    AND `Seccion` = 'Servicios'
    AND `Concepto` = 'Límite máximo de placas nuevas por carga'
);

INSERT INTO `Config_Parametros` (`Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro`, `Descripcion`)
SELECT 'facturacion', 'Servicios', 'Límite máximo de recibos por carga',
       'Filas', '300',
       'Cantidad máxima de recibos nuevos que se pueden crear en Dynamic_Recibos durante una sola carga masiva de servicios.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `Config_Parametros`
  WHERE `Modulo` = 'facturacion'
    AND `Seccion` = 'Servicios'
    AND `Concepto` = 'Límite máximo de recibos por carga'
);

INSERT INTO `Config_Parametros` (`Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro`, `Descripcion`)
SELECT 'facturacion', 'Servicios', 'Límite máximo de servicios por carga',
       'Filas', '300',
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
