-- Inventario > Dotación de Ley: límites de filas de la ventana "Descargar reporte"
-- (Todo / Por regional / Por operación), igual que en las pestañas Inventario y Kardex.
-- Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Dotación de Ley', 'Límite de filas reporte Excel - Dotación de Ley', 'Filas', '10000',
       'Máximo de filas que se pueden descargar en Excel desde la pestaña Dotación de Ley. Si el reporte tiene más, solo se ofrece en CSV. Si se deja vacío, se usan 10000.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Dotación de Ley' AND Concepto = 'Límite de filas reporte Excel - Dotación de Ley');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Dotación de Ley', 'Límite de filas reporte CSV - Dotación de Ley', 'Filas', '100000',
       'Máximo de filas que se pueden descargar en CSV desde la pestaña Dotación de Ley. Si el reporte tiene más, se pide elegir una regional u operación. Si se deja vacío, se usan 100000.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Dotación de Ley' AND Concepto = 'Límite de filas reporte CSV - Dotación de Ley');

-- Verificación
SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Dotación de Ley' AND Concepto LIKE 'Límite%';
