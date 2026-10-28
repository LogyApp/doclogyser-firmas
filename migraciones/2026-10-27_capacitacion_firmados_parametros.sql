-- Migración: Parámetros para editar, regenerar PDF y eliminar formatos firmados de Capacitación en SST
-- Replicando la lógica de Evaluación SST y Participación

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Capacitación SST', 'Roles que pueden editar y regenerar PDF de capacitaciones firmadas en SST', 'Rol', 'Sistema',
       'Roles con permiso para editar datos y regenerar el PDF de una capacitación SST que ya ha sido firmada o completada.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'sst' AND Seccion = 'Capacitación SST'
    AND Concepto = 'Roles que pueden editar y regenerar PDF de capacitaciones firmadas en SST'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Capacitación SST', 'Roles que pueden eliminar capacitaciones firmadas en SST', 'Rol', 'Sistema',
       'Roles con permiso para eliminar una capacitación SST que ya tiene documento PDF generado o ha sido firmada.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'sst' AND Seccion = 'Capacitación SST'
    AND Concepto = 'Roles que pueden eliminar capacitaciones firmadas en SST'
);
