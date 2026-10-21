-- Límites para descargar el reporte de la pestaña Activos (Nómina).
-- Se puede ejecutar más de una vez: solo inserta las filas que todavía no existen.
-- Si una fila no existe, el código usa estos mismos valores por defecto.
-- Cloud Run tiene memoria y tiempo limitados: no se recomienda subir el CSV de 100.000.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Activos', 'Máximo de filas para descargar en Excel', 'Número', '10000'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Activos' AND Concepto = 'Máximo de filas para descargar en Excel'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Activos', 'Máximo de filas para descargar en CSV', 'Número', '100000'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Activos' AND Concepto = 'Máximo de filas para descargar en CSV'
);

-- Verificación
SELECT id, Concepto, Condicion, Parametro FROM Config_Parametros
WHERE Modulo = 'nomina' AND Seccion = 'Activos' ORDER BY id;
