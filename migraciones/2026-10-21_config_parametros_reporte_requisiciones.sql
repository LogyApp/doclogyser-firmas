-- Límites de filas del reporte de Requisiciones (TalentHub → Requisiciones → Descargar reporte).
-- Se puede ejecutar más de una vez: solo inserta las filas que todavía no existen.
-- Excel solo se permite si el reporte tiene hasta "Límite de filas reporte Excel - Requisiciones" filas;
-- por encima de eso solo CSV, hasta "Límite de filas reporte CSV - Requisiciones".
-- Si estas filas no existen, el código usa 10000 (Excel) y 100000 (CSV).
-- Se editan desde el botón "⚙️ Parámetros" de Requisiciones.
-- El sufijo " - Requisiciones" permite distinguir los límites de reportes de otras pestañas.

-- Si existen con el nombre anterior (sin sufijo), se renombran.
UPDATE Config_Parametros SET Concepto = 'Límite de filas reporte Excel - Requisiciones'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Límite de filas reporte Excel';

UPDATE Config_Parametros SET Concepto = 'Límite de filas reporte CSV - Requisiciones'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Límite de filas reporte CSV';

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'talenthub', 'Requisiciones', 'Límite de filas reporte Excel - Requisiciones', 'Filas', '10000'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Límite de filas reporte Excel - Requisiciones'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'talenthub', 'Requisiciones', 'Límite de filas reporte CSV - Requisiciones', 'Filas', '100000'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Límite de filas reporte CSV - Requisiciones'
);

-- Verificación
SELECT id, Concepto, Condicion, Parametro FROM Config_Parametros
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' ORDER BY id;
