-- Límites de filas para descargar el reporte de la pestaña Kardex (módulo Inventario).
-- Excel solo si el reporte tiene hasta "Límite de filas reporte Excel - Kardex" filas;
-- por encima, solo CSV hasta "Límite de filas reporte CSV - Kardex".
-- Si estas filas no existen, el código usa 10000 (Excel) y 100000 (CSV).
-- Se puede ejecutar más de una vez: solo inserta las filas que todavía no existen.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Kardex', 'Límite de filas reporte Excel - Kardex', 'Filas', '10000'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Límite de filas reporte Excel - Kardex'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Kardex', 'Límite de filas reporte CSV - Kardex', 'Filas', '100000'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Límite de filas reporte CSV - Kardex'
);

-- Verificación
SELECT id, Modulo, Seccion, Concepto, Condicion, Parametro FROM Config_Parametros
WHERE Modulo = 'inventario' AND Seccion = 'Kardex' ORDER BY id;
