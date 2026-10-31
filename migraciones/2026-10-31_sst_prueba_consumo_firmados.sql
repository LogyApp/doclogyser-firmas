-- SST > Prueba de Consumo: editar, regenerar el PDF y eliminar pruebas ya firmadas, como en
-- Evaluación SST, Capacitación SST y Participación (Config_Parametros sst / Prueba de Consumo).
-- El cambio del encabezado de la plantilla va aparte, en
-- 2026-10-31_sst_prueba_consumo_plantilla_formato.sql (se ejecuta después de desplegar).
-- Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Prueba de Consumo', 'Roles que pueden editar y regenerar PDF de pruebas de consumo firmadas', 'Rol', 'Sistema',
       'Roles que, con la prueba de consumo ya firmada (PDF generado), pueden editar ciudad, fecha y cliente y regenerar el PDF con la plantilla vigente, conservando la firma. Si se deja vacío, nadie puede.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Prueba de Consumo' AND Concepto = 'Roles que pueden editar y regenerar PDF de pruebas de consumo firmadas');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Prueba de Consumo', 'Roles que pueden eliminar pruebas de consumo firmadas', 'Rol', 'Sistema',
       'Roles que pueden eliminar una prueba de consumo ya firmada (también se quita su PDF de los documentos del trabajador). Las pruebas sin firmar se rigen por "Roles que pueden eliminar pruebas de consumo". Si se deja vacío, nadie puede.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Prueba de Consumo' AND Concepto = 'Roles que pueden eliminar pruebas de consumo firmadas');

-- Verificación
SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Prueba de Consumo' ORDER BY Concepto;
