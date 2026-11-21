-- Asistencia y Novedades: novedades que NO piden ningún adjunto.
-- API (Ausentismo Pendiente Incapacidad): el trabajador avisa que se enfermó y trae la incapacidad después.
-- AFP (Incapacidad Reconocida AFP +180): no se pide documento de incapacidad ni historia clínica.
-- Se compara con la columna `Prefijo Novedad` de Config_Asistencia. Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Asistencia', 'Prefijos_Novedad_Sin_Adjunto', 'Lista', 'API, AFP',
       'Prefijos de novedad (columna Prefijo Novedad de Config_Asistencia, separados por coma) que no piden ningún adjunto al ingresar el evento, aunque sean incapacidades o tengan Soporte = SI. Si se deja vacía, todas piden su adjunto.'
WHERE NOT EXISTS (
    SELECT 1 FROM Config_Parametros
    WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Prefijos_Novedad_Sin_Adjunto'
);

SELECT Concepto, Parametro FROM Config_Parametros
WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Prefijos_Novedad_Sin_Adjunto';
