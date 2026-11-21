-- Cesantías: corrección de documentos de una solicitud Devuelta.
-- Quien radicó la solicitud siempre puede corregirla; además, los roles de este parámetro.
-- Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Cesantias', 'Puede corregir documentos de Cesantias devueltas', 'Rol', 'Sistema, Juridica, Nomina',
       'Roles que pueden quitar y cargar documentos de una solicitud de cesantías en estado Devuelto y reenviarla a revisión (Pendiente). Quien radicó la solicitud siempre puede hacerlo. Si se deja vacía, se usan Sistema, Juridica y Nomina.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Puede corregir documentos de Cesantias devueltas'
);
