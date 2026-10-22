-- Límites de filas para descargar el reporte de la pestaña Activos (Nómina).
-- Mismo esquema que Requisiciones (Condicion 'Filas').
-- Se puede ejecutar más de una vez: solo inserta las filas que todavía no existen.
-- Si una fila no existe, el código usa estos mismos valores por defecto.
-- Cloud Run tiene memoria y tiempo limitados: no se recomienda subir el CSV de 100.000.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Activos', 'Límite de filas reporte Excel - Activos', 'Filas', '10000'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Activos' AND Concepto = 'Límite de filas reporte Excel - Activos'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Activos', 'Límite de filas reporte CSV - Activos', 'Filas', '100000'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Activos' AND Concepto = 'Límite de filas reporte CSV - Activos'
);

-- Verificación
SELECT id, Concepto, Condicion, Parametro FROM Config_Parametros
WHERE Modulo = 'nomina' AND Seccion = 'Activos' ORDER BY id;
