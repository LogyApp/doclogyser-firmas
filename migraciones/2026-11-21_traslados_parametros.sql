-- Traslados: parámetros nuevos en Config_Parametros (nomina / Traslados).
-- Los valores iniciales dejan todo igual a como funcionaba. Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Traslados', 'Puede editar traslados', 'Rol', '',
       'Roles que pueden editar un traslado en curso (pendiente, validado o revisar). Si se deja vacía, lo puede editar cualquier rol con acceso a la pestaña Traslados.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Puede editar traslados');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Traslados', 'Días máximos hacia atrás para la fecha de traslado', 'Número', '',
       'Cuántos días antes de hoy puede ser la fecha de un traslado al registrarlo o editarlo. Si se deja vacía, no hay límite.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Días máximos hacia atrás para la fecha de traslado');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Traslados', 'Días máximos hacia adelante para la fecha de traslado', 'Número', '',
       'Cuántos días después de hoy puede ser la fecha de un traslado al registrarlo o editarlo. Si se deja vacía, no hay límite.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Días máximos hacia adelante para la fecha de traslado');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Traslados', 'Tipo de documento del traslado en Maestro_docTrabajador', 'Número', '50',
       'Id de Config_Doc_Trabajador con el que queda el documento de traslado en la Sociodemográfica (Maestro_docTrabajador.TipoDocumento). Si se deja vacía, se usa 50.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Tipo de documento del traslado en Maestro_docTrabajador');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Traslados', 'Prefijo del documento de traslado', 'Texto', 'TRAS',
       'Prefijo con el que queda el documento de traslado en Maestro_docTrabajador. Si se deja vacía, se usa TRAS.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Prefijo del documento de traslado');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Traslados', 'Anotación por defecto de No firma', 'Texto', 'El trabajador no firma, se soporta por correo electrónico',
       'Texto que se propone al generar un traslado con No firma; sale en el documento en el lugar de la firma del trabajador.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Anotación por defecto de No firma');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Traslados', 'Máximo de traslados en el listado', 'Número', '300',
       'Cuántos traslados se cargan en la pestaña Traslados (los más recientes). Los que están en curso siempre se muestran. Si se deja vacía, 300.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Máximo de traslados en el listado');

SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' ORDER BY Concepto;
