-- ==============================================================================
-- Migración: Maestro_Menu y Config_Parametros para la pestaña Clientes
-- Fecha: 2026-10-25
-- Descripción:
--   1. Agrega y ajusta en Maestro_Menu las subpestañas del módulo de Facturación:
--      - Clientes (/facturacion?tab=clientes)
--      - Clientes Crédito (/facturacion?tab=clientescredito)
--      - Transportadora (/facturacion?tab=transportadoras)
--      - Proveedor (/facturacion?tab=proveedores)
--      - Placas (/facturacion?tab=placas)
--      Roles autorizados: Sistema, Facturación, Auxiliar, AuxiliarR, Coordinador, CoordinadorR.
--
--   2. Registra en Config_Parametros las políticas de la pestaña Clientes:
--      - Roles que pueden depurar maestros de Clientes (Solo Sistema: eliminar, eliminar y reemplazar,
--        ver duplicados, normalizar textos en servicios, a mayúsculas, placas ≠ 6).
--      - Roles que pueden editar y agregar en maestros de Clientes (Sistema, Facturación,
--        Auxiliar, AuxiliarR, Coordinador, CoordinadorR).
--      - Roles que pueden editar retenciones de Clientes (RTICA, RTIVA, RTSERVIC: Facturación, Sistema).
-- ==============================================================================

-- ── 1. Maestro_Menu: Subpestañas de Clientes ──────────────────────────────────
-- Clientes (Vista principal)
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'facturacion', 'Clientes', 'Auxiliar, AuxiliarR, Coordinador, CoordinadorR, Facturación, Sistema', 1,
       'Clientes', '/facturacion?tab=clientes', 3, '👥', 'Directorio general de clientes (Maestro_Clientes).'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM Maestro_Menu WHERE Modulo = 'facturacion' AND Seccion = 'Clientes'
);

-- Actualizar Clientes_credito si ya existe para asegurar que tenga los 6 roles
UPDATE Maestro_Menu
SET Rol = 'Auxiliar, AuxiliarR, Coordinador, CoordinadorR, Facturación, Sistema',
    Url = '/facturacion?tab=clientescredito'
WHERE Modulo = 'facturacion' AND Seccion = 'Clientes_credito';

-- Si no existiera Clientes_credito, insertarlo
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'facturacion', 'Clientes_credito', 'Auxiliar, AuxiliarR, Coordinador, CoordinadorR, Facturación, Sistema', 1,
       'Clientes Crédito', '/facturacion?tab=clientescredito', 3, '💳', 'Clientes con crédito y su estado de bloqueo.'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM Maestro_Menu WHERE Modulo = 'facturacion' AND Seccion = 'Clientes_credito'
);

-- Transportadora
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'facturacion', 'Transportadora', 'Auxiliar, AuxiliarR, Coordinador, CoordinadorR, Facturación, Sistema', 1,
       'Transportadoras', '/facturacion?tab=transportadoras', 3, '🚛', 'Catálogo de transportadoras de servicios.'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM Maestro_Menu WHERE Modulo = 'facturacion' AND Seccion = 'Transportadora'
);

-- Proveedor
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'facturacion', 'Proveedor', 'Auxiliar, AuxiliarR, Coordinador, CoordinadorR, Facturación, Sistema', 1,
       'Proveedores', '/facturacion?tab=proveedores', 3, '🏢', 'Catálogo de proveedores de servicios.'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM Maestro_Menu WHERE Modulo = 'facturacion' AND Seccion = 'Proveedor'
);

-- Placas
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'facturacion', 'Placas', 'Auxiliar, AuxiliarR, Coordinador, CoordinadorR, Facturación, Sistema', 1,
       'Placas', '/facturacion?tab=placas', 3, '🚗', 'Catálogo de vehículos y placas (PL1).'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM Maestro_Menu WHERE Modulo = 'facturacion' AND Seccion = 'Placas'
);


-- ── 2. Config_Parametros: Políticas de permisos en Clientes ──────────────────
-- Depuración avanzada (Solo Sistema)
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Clientes', 'Roles que pueden depurar maestros de Clientes', 'Rol', 'Sistema',
       'Roles que pueden eliminar registros, eliminar y reemplazar, ver y unificar duplicados, normalizar textos en servicios, convertir a mayúsculas y filtrar placas ≠ 6 en las subpestañas de Clientes.'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Clientes' AND Concepto = 'Roles que pueden depurar maestros de Clientes'
);

-- Edición y creación general (Acciones para los roles autorizados)
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Clientes', 'Roles que pueden editar y agregar en maestros de Clientes', 'Rol',
       'Auxiliar, AuxiliarR, Coordinador, CoordinadorR, Facturación, Sistema',
       'Roles que pueden agregar nuevos registros y editar registros existentes en las subpestañas Clientes, Clientes Crédito, Transportadoras, Proveedores y Placas.'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Clientes' AND Concepto = 'Roles que pueden editar y agregar en maestros de Clientes'
);

-- Edición de retenciones RTICA, RTIVA, RTSERVIC en Clientes (Facturación y Sistema)
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Clientes', 'Roles que pueden editar retenciones de Clientes', 'Rol',
       'Facturación, Sistema',
       'Roles autorizados para editar los campos RTICA, RTIVA y RTSERVIC al crear o editar clientes en Maestro_Clientes.'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Clientes' AND Concepto = 'Roles que pueden editar retenciones de Clientes'
);

-- Verificación de lo insertado
SELECT Modulo, Seccion, Concepto, Parametro, Descripcion FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Clientes';
SELECT Modulo, Seccion, Rol, Etiqueta, Url, Orden FROM Maestro_Menu WHERE Modulo = 'facturacion';
