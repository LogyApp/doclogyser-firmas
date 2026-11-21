-- Traslados: parámetros en Config_Parametros (nomina / Traslados). Se puede ejecutar más de una vez.
-- * Puede editar traslados: mismos roles de Maestro_Menu (nomina / Traslados). Solo se edita mientras
--   Jurídica no lo haya validado (Pendiente o Revisar).
-- * Fecha del traslado: dentro de la quincena actual, salvo los roles de
--   "Roles que pueden registrar traslados fuera de la quincena actual".
-- * El prefijo del documento sale de Config_Doc_Trabajador.Prefijo con el Id del tipo de documento.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Traslados', 'Puede editar traslados', 'Rol',
       'Asistencial, Contratación, Control, Juridica, Nomina, Sistema, Directorth, subgerente, AuxiliarR, CoordinadorR, Auxiliar, Coordinador',
       'Roles que pueden editar un traslado mientras Jurídica no lo haya validado (estado Pendiente o Revisar). Si se deja vacía, lo puede editar cualquier rol con acceso a la pestaña Traslados.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Puede editar traslados');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Traslados', 'Roles que pueden registrar traslados fuera de la quincena actual', 'Rol', 'Sistema, Juridica',
       'Roles que pueden registrar o editar un traslado con fecha fuera de la quincena actual (1 al 15 o 16 al fin de mes). Los demás solo pueden usar fechas de la quincena en curso.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Roles que pueden registrar traslados fuera de la quincena actual');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Traslados', 'Tipo de documento del traslado en Maestro_docTrabajador', 'Número', '50',
       'Id de Config_Doc_Trabajador con el que queda el documento de traslado en la Sociodemográfica; el prefijo se toma de la columna Prefijo de esa tabla. Si se deja vacía, se usa 50.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Tipo de documento del traslado en Maestro_docTrabajador');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Traslados', 'Anotación por defecto de No firma', 'Texto', 'El trabajador no firma, se soporta por correo electrónico',
       'Texto que se propone al generar un traslado con No firma; sale en el documento en el lugar de la firma del trabajador.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Anotación por defecto de No firma');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Traslados', 'Máximo de traslados en el listado', 'Número', '300',
       'Cuántos traslados se cargan en la pestaña Traslados (los más recientes). Los que están en curso siempre se muestran. Si se deja vacía, 300.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Máximo de traslados en el listado');

SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' ORDER BY Concepto;
