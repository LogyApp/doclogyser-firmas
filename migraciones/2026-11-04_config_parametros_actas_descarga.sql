-- Límites de filas para descargar el reporte de la pestaña Actas de Entrega (módulo Inventario).
-- El reporte trae una fila por elemento entregado. Excel solo si tiene hasta
-- "Límite de filas reporte Excel - Actas" filas; por encima, solo CSV hasta
-- "Límite de filas reporte CSV - Actas".
-- Si estas filas no existen, el código usa 10000 (Excel) y 100000 (CSV).
-- Se puede ejecutar más de una vez: solo inserta las filas que todavía no existen.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Actas', 'Límite de filas reporte Excel - Actas', 'Filas', '10000',
       'Máximo de filas (una por elemento entregado) para descargar el reporte de Actas de Entrega en Excel. Si el reporte lo supera, solo se permite CSV. Si se deja vacío o sin fila, se usa 10000.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Actas' AND Concepto = 'Límite de filas reporte Excel - Actas'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Actas', 'Límite de filas reporte CSV - Actas', 'Filas', '100000',
       'Máximo de filas (una por elemento entregado) para descargar el reporte de Actas de Entrega en CSV. Si el reporte lo supera, no se puede descargar y se pide filtrar más. Si se deja vacío o sin fila, se usa 100000.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Actas' AND Concepto = 'Límite de filas reporte CSV - Actas'
);

-- Verificación
SELECT id, Modulo, Seccion, Concepto, Condicion, Parametro FROM Config_Parametros
WHERE Modulo = 'inventario' AND Seccion = 'Actas' AND Concepto LIKE 'Límite de filas reporte%' ORDER BY id;
