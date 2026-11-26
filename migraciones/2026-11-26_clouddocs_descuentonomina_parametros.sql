-- Cloud Docs › Autorizaciones de Descuento: reglas que estaban fijas en src/routes/descuentonomina.js
-- pasan a Config_Parametros (Modulo 'CloudDocs', Seccion 'DescuentoNomina'; src/services/configClouddocsDescuentos.js).
-- Los valores son los mismos que tenía el código. Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'DescuentoNomina', 'Roles que pueden regenerar el PDF de autorizaciones', '', 'Sistema, Contratación',
       'Roles (separados por coma) que ven el icono Regenerar en la columna Acciones y el botón Forzar Regenerar PDF. Regenera el PDF firmado con la plantilla actual y actualiza el documento en Cloud Docs. Vacío: nadie.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'DescuentoNomina' AND Concepto = 'Roles que pueden regenerar el PDF de autorizaciones');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'DescuentoNomina', 'Roles que pueden eliminar autorizaciones', '', 'Sistema, Contratación',
       'Roles (separados por coma) que ven el icono Eliminar: borra la autorización, su documento en Cloud Docs y el PDF del almacenamiento. Vacío: nadie.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'DescuentoNomina' AND Concepto = 'Roles que pueden eliminar autorizaciones');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'DescuentoNomina', 'Roles que pueden generar soporte de No firma', '', 'Sistema, Contratación',
       'Roles (separados por coma) que pueden cerrar una autorización pendiente como No firma (PDF con soporte por correo en lugar de la firma). Vacío: nadie.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'DescuentoNomina' AND Concepto = 'Roles que pueden generar soporte de No firma');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'DescuentoNomina', 'Roles que solo gestionan autorizaciones Anticipadas', '', 'Contratación, Archivo, Asistencial',
       'Roles (separados por coma) que solo ven, crean y gestionan autorizaciones de tipo Anticipada (no las Específicas por cuotas). Vacío: todos los roles ven ambos tipos.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'DescuentoNomina' AND Concepto = 'Roles que solo gestionan autorizaciones Anticipadas');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'DescuentoNomina', 'Horas de vigencia del enlace de firma', '', '48',
       'Horas que dura el enlace de firma que se envía al trabajador (al crear la autorización o al regenerar el enlace). Vacío o no válido: 48 horas.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'DescuentoNomina' AND Concepto = 'Horas de vigencia del enlace de firma');
