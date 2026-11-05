-- Facturación > Servicios: filtro Bodega (valores únicos de la columna Etapa de Dynamic_Servicios).
-- Solo se habilita cuando en el filtro Operación se escoge una de estas operaciones.
-- Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Servicios', 'Operaciones con filtro Bodega en Servicios', 'Operación', 'D1 Cúcuta',
       'Operaciones en las que la pestaña Servicios habilita el filtro Bodega, que lista los valores únicos de Etapa de los servicios. Separadas por coma. Si se deja vacía, el filtro Bodega queda siempre deshabilitado.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'facturacion' AND Seccion = 'Servicios' AND Concepto = 'Operaciones con filtro Bodega en Servicios'
);
