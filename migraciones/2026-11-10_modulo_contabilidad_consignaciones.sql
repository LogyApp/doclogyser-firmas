-- Migración: Habilitar el módulo de Contabilidad y la pestaña Consignaciones en Maestro_Menu
-- Fecha: 2026-11-10

-- 1. Pestaña Consignaciones en Maestro_Menu (Contabilidad)
-- Acceso 1: Sistema y Contabilidad (Sin filtro, todas las operaciones)
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
VALUES (
  'contabilidad',
  'Consignaciones',
  'Sistema, Contabilidad',
  1,
  'Consignaciones',
  '/contabilidad?tab=consignaciones',
  1,
  '💰',
  'Control, conciliación y registro de consignaciones bancarias de efectivo de las operaciones.'
)
ON DUPLICATE KEY UPDATE
  Rol = VALUES(Rol),
  Etiqueta = VALUES(Etiqueta),
  Url = VALUES(Url),
  Orden = VALUES(Orden),
  Icono = VALUES(Icono),
  Descripcion = VALUES(Descripcion);

-- Acceso 2: AuxiliarR y CoordinadorR (Por Regional)
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
VALUES (
  'contabilidad',
  'Consignaciones',
  'AuxiliarR, CoordinadorR',
  2,
  'Consignaciones',
  '/contabilidad?tab=consignaciones',
  1,
  '💰',
  'Gestión y registro de consignaciones bancarias de las operaciones de su Regional asignada.'
)
ON DUPLICATE KEY UPDATE
  Rol = VALUES(Rol),
  Etiqueta = VALUES(Etiqueta),
  Url = VALUES(Url),
  Orden = VALUES(Orden),
  Icono = VALUES(Icono),
  Descripcion = VALUES(Descripcion);

-- Acceso 3: Auxiliar y Coordinador (Por Operación propia)
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
VALUES (
  'contabilidad',
  'Consignaciones',
  'Auxiliar, Coordinador',
  3,
  'Consignaciones',
  '/contabilidad?tab=consignaciones',
  1,
  '💰',
  'Registro y soporte de consignaciones bancarias de efectivo de su operación asignada.'
)
ON DUPLICATE KEY UPDATE
  Rol = VALUES(Rol),
  Etiqueta = VALUES(Etiqueta),
  Url = VALUES(Url),
  Orden = VALUES(Orden),
  Icono = VALUES(Icono),
  Descripcion = VALUES(Descripcion);

-- 2. Parámetros de Config_Parametros para Contabilidad / Consignaciones
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'contabilidad', 'Consignaciones', 'Roles que pueden editar consignación validada', '', 'Sistema, Contabilidad', 'Roles autorizados para modificar una consignación que ya cuenta con comprobante registrado (Fase Green).'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'contabilidad' AND Seccion = 'Consignaciones' AND Concepto = 'Roles que pueden editar consignación validada'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'contabilidad', 'Consignaciones', 'Roles que pueden revertir o anular comprobante', '', 'Sistema, Contabilidad', 'Roles autorizados para vaciar o anular el comprobante de una consignación y regresarla a Fase Red.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'contabilidad' AND Seccion = 'Consignaciones' AND Concepto = 'Roles que pueden revertir o anular comprobante'
);
