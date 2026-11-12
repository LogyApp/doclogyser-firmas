-- Contabilidad › Consignaciones y Transferencias: los filtros muestran solo las operaciones que tienen
-- servicios en efectivo (Consignaciones) o por transferencia (Transferencias) en los últimos N meses.
-- Si la fila no existe, el código usa 12 meses. Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'contabilidad', 'Filtros', 'Meses para operaciones con registro', '', '12',
       'Meses hacia atrás que se revisan para decidir qué operaciones salen en los filtros de Consignaciones (servicios en efectivo) y Transferencias (servicios por transferencia). Las operaciones sin registros en ese tiempo (solo crédito) no aparecen. Número entre 1 y 60; vacío o sin fila = 12. El cambio se nota en máximo 1 hora.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'contabilidad' AND Seccion = 'Filtros' AND Concepto = 'Meses para operaciones con registro'
);

SELECT Modulo, Seccion, Concepto, Parametro FROM Config_Parametros
WHERE Modulo = 'contabilidad' AND Seccion = 'Filtros';
