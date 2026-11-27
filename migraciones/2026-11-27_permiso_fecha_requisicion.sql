INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Requisiciones', 'Modificar Fecha de Requisición', 'Rol',
       'Directorth, CoorSelección, Sistema',
       'Roles autorizados para modificar la fecha y hora de una requisición existente; vacío impide su edición.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Modificar Fecha de Requisición'
);
