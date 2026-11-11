-- Migración: Pestaña Transferencias en Módulo de Contabilidad
-- Permisos en Maestro_Menu para la sección 'Transferencias'
-- Acceso 1: Sistema, Contabilidad (sin filtro)
-- Acceso 2: AuxiliarR, CoordinadorR (por Regional)
-- Acceso 3: Auxiliar, Coordinador (por Operación)

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Transferencias', 'Sistema, Contabilidad', 1, 'Transferencias', '/contabilidad?tab=transferencias', 2, '💳', 'Control, verificación y soporte de transferencias bancarias de los servicios.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Transferencias' AND Acceso = 1
);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Transferencias', 'AuxiliarR, CoordinadorR', 2, 'Transferencias', '/contabilidad?tab=transferencias', 2, '💳', 'Gestión y verificación de soportes de transferencias bancarias de su Regional asignada.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Transferencias' AND Acceso = 2
);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Transferencias', 'Auxiliar, Coordinador', 3, 'Transferencias', '/contabilidad?tab=transferencias', 2, '💳', 'Consulta y soporte de transferencias bancarias de los servicios de su operación asignada.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Transferencias' AND Acceso = 3
);
