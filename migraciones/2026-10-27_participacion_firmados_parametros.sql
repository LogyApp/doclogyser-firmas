-- Migración: Parámetros para editar, regenerar PDF y eliminar formatos firmados de Participación en SST
-- Replicando la lógica de Evaluación SST

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Participación', 'Roles que pueden editar y regenerar PDF de formatos firmados en Participación', 'Rol', 'Sistema',
       'Roles con permiso para editar y regenerar el PDF de un formato de asistencia de Participación que ya ha sido firmado o tiene PDF generado.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'sst' AND Seccion = 'Participación'
    AND Concepto = 'Roles que pueden editar y regenerar PDF de formatos firmados en Participación'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Participación', 'Roles que pueden eliminar formatos firmados en Participación', 'Rol', 'Sistema',
       'Roles con permiso para eliminar un formato de asistencia de Participación que ya tiene documento PDF generado.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'sst' AND Seccion = 'Participación'
    AND Concepto = 'Roles que pueden eliminar formatos firmados en Participación'
);
