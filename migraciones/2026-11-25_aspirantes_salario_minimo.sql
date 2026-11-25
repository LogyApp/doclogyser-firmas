-- Cargos que reciben el salario mínimo al enviar el aspirante a Sociodemográfica.
-- Sin esta fila, no se prellena ningún salario. Una lista vacía desactiva la automatización.
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Aspirantes', 'Cargos con salario mínimo predeterminado', 'Cargo',
       'AUXILIAR LOGISTICO',
       'Cargos separados por coma a los que se prellena el salario mínimo vigente al enviar a Sociodemográfica. Vacío = no se prellena ningún cargo.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Aspirantes'
    AND Concepto = 'Cargos con salario mínimo predeterminado'
);
