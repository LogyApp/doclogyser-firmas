-- Migración: Roles autorizados para la carga masiva de actas de entrega en grid
-- Fecha: 2026-10-29

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Actas', 'Roles que pueden usar la carga masiva de actas en grid', 'Rol',
       'Sistema, Inventario, AuxiliarR, Auxiliar, Asistencial',
       'Roles autorizados para usar el editor de grid y generar actas de entrega de forma masiva.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'inventario' AND Seccion = 'Actas' AND Concepto = 'Roles que pueden usar la carga masiva de actas en grid'
);
