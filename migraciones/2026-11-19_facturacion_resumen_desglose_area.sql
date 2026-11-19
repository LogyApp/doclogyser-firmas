-- Facturación › Resumen: interruptor "Por Área" (apagado por defecto) que separa el resumen por el Área
-- del servicio (Config_Area) en las operaciones de esta lista. Empieza con Cedi Vegas (SECOS, NOCHE, FRESCOS).
-- El interruptor "Por Bodega" (Etapa) usa la fila existente facturacion / Servicios /
-- 'Operaciones con filtro Bodega en Servicios' (D1 Cúcuta), así que no necesita fila nueva.
-- Solo agrega una fila. Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Resumen', 'Operaciones con desglose por Área en Resumen', '', 'Cedi Vegas',
       'Operaciones (separadas por coma) que ven en la pestaña Resumen el interruptor "Por Área" para separar los valores por el Área del servicio. Vacío: nadie ve el interruptor.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
   WHERE Modulo = 'facturacion' AND Seccion = 'Resumen' AND Concepto = 'Operaciones con desglose por Área en Resumen'
);

SELECT Modulo, Seccion, Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Resumen';
