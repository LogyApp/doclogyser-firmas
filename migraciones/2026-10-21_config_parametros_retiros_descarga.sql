-- Límites de filas para descargar el reporte de la pestaña Retiros (Nómina).
-- Mismo esquema que Requisiciones y Activos (Condicion 'Filas').
-- Se puede ejecutar más de una vez: solo inserta las filas que todavía no existen.
-- Si una fila no existe, el código usa estos mismos valores por defecto.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Retiros', 'Límite de filas reporte Excel - Retiros', 'Filas', '10000'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Límite de filas reporte Excel - Retiros'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Retiros', 'Límite de filas reporte CSV - Retiros', 'Filas', '100000'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Límite de filas reporte CSV - Retiros'
);

-- Verificación
SELECT id, Concepto, Condicion, Parametro FROM Config_Parametros
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Condicion = 'Filas' ORDER BY id;
