-- Nomina / Asistencia: Parámetros para control de edición de horario (hora entrada y salida) inline
-- Módulo: 'nomina', Sección: 'Asistencia'
-- Idempotente: seguro para ejecutarse múltiples veces.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Asistencia', 'Roles_Editar_Horario_Todos_Estados', 'Roles', 'Sistema, Nomina', 'Roles autorizados para editar el horario (hora entrada y salida) en cualquier estado (Green/Yellow) y para cualquier cargo de personal.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Editar_Horario_Todos_Estados'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Asistencia', 'Roles_Editar_Horario_Yellow', 'Roles', 'Auxiliar, AuxiliarR, Coordinador, CoordinadorR, subgerente', 'Roles autorizados para editar el horario (hora entrada y salida) directamente en registros en estado Yellow y exclusivamente para personal operativo.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Editar_Horario_Yellow'
);
