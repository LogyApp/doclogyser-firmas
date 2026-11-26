-- Corrección de respuestas para nuevas evaluaciones EVIN.
-- Sin las filas, el código conserva las respuestas anteriores (9: C, 25: B).
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'EVIN', 'Respuesta correcta EVIN pregunta 9 COPASST', '', 'b',
       'Letra correcta de la pregunta 9 sobre COPASST para nuevas evaluaciones de inducción. Si no existe se usa la respuesta anterior C.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'EVIN'
    AND Concepto = 'Respuesta correcta EVIN pregunta 9 COPASST'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'EVIN', 'Respuesta correcta EVIN pregunta 25 PESV', '', 'c',
       'Letra correcta de la pregunta 25 sobre PESV para nuevas evaluaciones de inducción. Si no existe se usa la respuesta anterior B.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'EVIN'
    AND Concepto = 'Respuesta correcta EVIN pregunta 25 PESV'
);
