-- Límites de filas del reporte de Requisiciones (TalentHub → Requisiciones → Descargar reporte).
-- Se puede ejecutar más de una vez: solo inserta las filas que todavía no existen.
-- Excel solo se permite si el reporte tiene hasta "Límite de filas reporte Excel" filas;
-- por encima de eso solo CSV, hasta "Límite de filas reporte CSV".
-- Si estas filas no existen, el código usa 10000 (Excel) y 100000 (CSV).
-- Se editan desde el botón "⚙️ Parámetros" de Requisiciones.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'talenthub', 'Requisiciones', 'Límite de filas reporte Excel', 'Filas', '10000'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Límite de filas reporte Excel'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'talenthub', 'Requisiciones', 'Límite de filas reporte CSV', 'Filas', '100000'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Límite de filas reporte CSV'
);

-- Verificación
SELECT id, Concepto, Condicion, Parametro FROM Config_Parametros
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' ORDER BY id;
