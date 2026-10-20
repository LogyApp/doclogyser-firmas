-- Parámetros adicionales de la pestaña Cesantías (Nómina).
-- Se puede ejecutar más de una vez: solo inserta las filas que todavía no existen.
-- Si una fila no existe, el código usa el mismo valor por defecto que aparece aquí.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Cesantias', 'Puede tramitar registros de Cesantias', 'Rol', 'Nomina, Sistema'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Puede tramitar registros de Cesantias'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Cesantias', 'Puede devolver registros de Cesantias', 'Rol', 'Sistema, Juridica'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Puede devolver registros de Cesantias'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Cesantias', 'Días de vigencia del enlace de firma', 'Número', '30'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Días de vigencia del enlace de firma'
);

-- Cloud Run no acepta peticiones de más de 32 MB en total (todos los soportes juntos).
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Cesantias', 'Tamaño máximo de soportes (MB)', 'Número', '15'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Tamaño máximo de soportes (MB)'
);

-- Verificación
SELECT id, Concepto, Condicion, Parametro FROM Config_Parametros
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' ORDER BY id;
