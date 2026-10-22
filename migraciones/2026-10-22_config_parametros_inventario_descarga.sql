-- Límites de filas para descargar el reporte de la pestaña Inventario (módulo Inventario).
-- Excel solo si el reporte tiene hasta "Límite de filas reporte Excel - Inventario" filas;
-- por encima, solo CSV hasta "Límite de filas reporte CSV - Inventario".
-- Si estas filas no existen, el código usa 10000 (Excel) y 100000 (CSV).
-- Se puede ejecutar más de una vez: solo inserta las filas que todavía no existen.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Inventario', 'Límite de filas reporte Excel - Inventario', 'Filas', '10000'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Límite de filas reporte Excel - Inventario'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Inventario', 'Límite de filas reporte CSV - Inventario', 'Filas', '100000'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Límite de filas reporte CSV - Inventario'
);

-- Verificación
SELECT id, Modulo, Seccion, Concepto, Condicion, Parametro FROM Config_Parametros
WHERE Modulo = 'inventario' AND Seccion = 'Inventario' ORDER BY id;
