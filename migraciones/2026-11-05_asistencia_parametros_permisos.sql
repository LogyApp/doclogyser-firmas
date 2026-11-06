-- Migración: Configurar parámetros de edición, eliminación y registro de retirados en Asistencia
-- Fecha: 2026-11-05

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Asistencia', 'Roles_Editar_Eliminar_Yellow', 'General', 'Auxiliar, AuxiliarR, Coordinador, CoordinadorR',
  'Roles con autorización para editar y eliminar registros de asistencia cuando su estado sea Yellow.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros 
  WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Editar_Eliminar_Yellow'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Asistencia', 'Roles_Editar_Eliminar_Todos_Estados', 'General', 'Sistema, Nomina',
  'Roles con autorización total para editar y eliminar registros de asistencia sin importar su estado (Yellow o Green).'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros 
  WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Editar_Eliminar_Todos_Estados'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Asistencia', 'Roles_Registrar_Retirados', 'General', 'Sistema, Nomina',
  'Roles autorizados para seleccionar y registrar asistencia o novedades a trabajadores en estado Retirado.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros 
  WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Registrar_Retirados'
);
