-- SST (solicitud del área, 2026-11-24). Se puede ejecutar más de una vez.
--  1. La pestaña "Documentación Inicial" pasa a llamarse "Documentos de Inducción". No tiene fila propia en
--     Maestro_Menu (agrupa secciones), así que su nombre queda en Config_Parametros sst / General.
--  2. Prueba de Consumo y Compromiso SST pasan a ser subpestañas de Documentos de Inducción, después de
--     Análisis de Riesgo, Evaluación de Inducción y Comprobante de Inducción. Sus Secciones (y por tanto
--     permisos y parámetros) no cambian; solo el orden, el enlace del menú OTROS y la descripción.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'General', 'Nombre de la pestaña Documentos de Inducción', '', 'Documentos de Inducción',
       'Nombre visible en SST de la pestaña que agrupa Análisis de Riesgo, Evaluación de Inducción, Comprobante de Inducción, Prueba de Consumo y Compromiso SST. Vacío = "Documentos de Inducción". Los nombres de cada subpestaña son la Etiqueta de Maestro_Menu.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'sst' AND Seccion = 'General' AND Concepto = 'Nombre de la pestaña Documentos de Inducción'
);

-- Orden del menú de SST: las cinco subpestañas de Documentos de Inducción primero
UPDATE Maestro_Menu SET Orden = CASE Seccion
    WHEN 'ARO' THEN 1
    WHEN 'EVIN' THEN 2
    WHEN 'INGE' THEN 3
    WHEN 'Prueba de Consumo' THEN 4
    WHEN 'Compromiso SST' THEN 5
    WHEN 'Capacitación SST' THEN 6
    WHEN 'Temas de capacitación' THEN 7
    WHEN 'Participación' THEN 8
    WHEN 'Casos Medicos' THEN 9
    WHEN 'Incapacidades' THEN 10
    WHEN 'Inspecciones_vehiculos' THEN 11
    WHEN 'ATS' THEN 12
    WHEN 'Evaluación SST' THEN 99
    ELSE Orden END
WHERE Modulo = 'sst';

-- Enlaces del menú OTROS (los anteriores ?tab=pruebaconsumo y ?tab=compromiso siguen funcionando)
UPDATE Maestro_Menu SET Url = '/sst?tab=docinicial&subtab=pruebaconsumo' WHERE Modulo = 'sst' AND Seccion = 'Prueba de Consumo';
UPDATE Maestro_Menu SET Url = '/sst?tab=docinicial&subtab=compromiso' WHERE Modulo = 'sst' AND Seccion = 'Compromiso SST';

-- Descripciones con el nombre nuevo de la pestaña
UPDATE Maestro_Menu
   SET Descripcion = REPLACE(Descripcion, 'Documentación Inicial ›', 'Documentos de Inducción ›')
 WHERE Modulo = 'sst' AND Seccion IN ('ARO', 'EVIN', 'INGE') AND Descripcion LIKE 'Documentación Inicial ›%';
UPDATE Maestro_Menu
   SET Descripcion = CONCAT('Documentos de Inducción › ', Descripcion)
 WHERE Modulo = 'sst' AND Seccion IN ('Prueba de Consumo', 'Compromiso SST')
   AND Descripcion NOT LIKE 'Documentos de Inducción ›%';
