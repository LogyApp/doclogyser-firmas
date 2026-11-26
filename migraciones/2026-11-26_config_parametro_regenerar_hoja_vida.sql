-- ============================================================================
-- Migración: Roles autorizados para regenerar la Hoja de Vida institucional
-- Fecha: 2026-11-26
-- Módulo: talenthub / Sección: Aspirantes
-- ============================================================================

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Aspirantes', 'Roles que pueden regenerar hoja de vida', 'Rol', 'Sistema, CoorSelección',
       'Roles (separados por coma) que pueden ver el botón para regenerar la Hoja de Vida en PDF desde el Panel Admin del aspirante. Se deshabilita cuando el estado es contratado.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Aspirantes' AND Concepto = 'Roles que pueden regenerar hoja de vida'
);
