-- Botón "Regenerar" en Nómina › Traslados (documentos ya generados): vuelve a armar el PDF con la
-- plantilla vigente y reemplaza el archivo del bucket (POST /admin/traslados/:id/regenerar).
-- Roles en Config_Parametros (nomina / Traslados), leídos en src/services/configTraslados.js.
-- Solo agrega una fila. Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Traslados', 'Puede regenerar documento de traslado', 'Lista', 'Juridica, Sistema',
       'Roles (separados por coma) que ven el botón "Regenerar" en los traslados con documento generado: vuelve a armar el PDF con la plantilla actual, conservando la firma del trabajador (o la anotación de "No firma") y su fecha, y reemplaza el documento en el bucket sin cambiar el enlace. Vacío = nadie puede regenerar.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Puede regenerar documento de traslado');

SELECT Concepto, Parametro FROM Config_Parametros
 WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Puede regenerar documento de traslado';
