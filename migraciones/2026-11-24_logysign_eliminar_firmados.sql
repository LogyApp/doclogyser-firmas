-- LogySign: roles que pueden eliminar registros ya FIRMADOS.
-- Al eliminar un firmado se borra todo rastro: PDF firmado y PDF original en el
-- bucket, la fila logysign-<id> de Maestro_docTrabajador y la de Dynamic_Logysign.
-- Los registros no firmados los sigue pudiendo eliminar cualquier usuario.
-- Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Roles que pueden eliminar registros firmados', '', 'Sistema',
       'Roles (separados por coma) que pueden eliminar en LogySign un registro ya firmado; se borra el PDF firmado y el original del bucket y sus filas en Dynamic_Logysign y Maestro_docTrabajador. Vacío = nadie puede eliminar firmados.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Roles que pueden eliminar registros firmados'
);
