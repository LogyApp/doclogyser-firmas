-- Cloud Docs › Doc. Retiros: parámetros, historial de validación y acceso del rol Nomina.
-- Fecha: 2026-11-26
-- Se puede ejecutar más de una vez. Los valores son los que tenía el código, así que
-- no cambian el comportamiento. Ejecutar cada bloque por separado en HiSQL.

-- Bloque 1: historial de validaciones (quién, cuándo, antes/después y motivo)
CREATE TABLE IF NOT EXISTS Historial_Validacion_CloudDocs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  DocId VARCHAR(60) NOT NULL,
  Identificacion VARCHAR(30) NULL,
  TipoDocumento VARCHAR(50) NULL,
  ValidacionAnterior VARCHAR(50) NULL,
  ValidacionNueva VARCHAR(50) NOT NULL,
  Motivo VARCHAR(500) NULL,
  Usuario VARCHAR(100) NOT NULL,
  Rol VARCHAR(60) NULL,
  Fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hist_val_doc (DocId),
  INDEX idx_hist_val_ident (Identificacion),
  INDEX idx_hist_val_fecha (Fecha)
);

-- Bloque 2
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'DocRetiros', 'Roles que pueden validar documentos de retiro', 'Rol', 'Archivo, Nomina, Sistema',
       'Roles que ven las casillas y los botones de validación masiva (OK, PEND, ERROR) en Cloud Docs › Doc. Retiros. Lista separada por coma. Si la fila no existe se usa Archivo, Nomina, Sistema; si se deja vacía nadie puede validar. Para ver la pestaña el rol debe estar además en Maestro_Menu (clouddocs / DocRetiros).'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'DocRetiros' AND Concepto = 'Roles que pueden validar documentos de retiro');

-- Bloque 3
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'DocRetiros', 'Máximo de documentos en el listado', 'Numero', '1000',
       'Cantidad máxima de documentos que trae la pestaña Doc. Retiros (los más recientes primero). Los demás se encuentran con los filtros. Vacío o inválido = 1000.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'DocRetiros' AND Concepto = 'Máximo de documentos en el listado');

-- Bloque 4
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'DocRetiros', 'Clasificación de documentos de retiro', 'Lista', 'Retiro',
       'Textos que identifican un tipo de documento de retiro: se muestran en Doc. Retiros los tipos de Config_Doc_Trabajador cuya Clasificación contiene alguno de estos textos. Lista separada por coma. Vacío = Retiro.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'DocRetiros' AND Concepto = 'Clasificación de documentos de retiro');

-- Bloque 5
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'DocRetiros', 'Habilitar notificaciones de correo en Doc. Retiros', 'Booleano', '1',
       '1 = al marcar documentos de retiro con ERROR se envía el aviso por correo a los responsables. 0 = no se envía ningún correo desde Doc. Retiros.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'DocRetiros' AND Concepto = 'Habilitar notificaciones de correo en Doc. Retiros');

-- Bloque 6
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'DocRetiros', 'Aviso de documento con ERROR - Para:', 'Rol', 'Auxiliar, AuxiliarR, Coordinador, CoordinadorR',
       'Roles que reciben el aviso cuando se marcan documentos de retiro con ERROR. Auxiliar, AuxiliarR, Coordinador y CoordinadorR se resuelven según la Operación del trabajador; los demás roles por Maestro_Usuarios. Lista separada por coma.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'DocRetiros' AND Concepto = 'Aviso de documento con ERROR - Para:');

-- Bloque 7
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'DocRetiros', 'Aviso de documento con ERROR - Copia:', 'Rol', '',
       'Roles que van en copia del aviso de documentos de retiro con ERROR. Quien marca el ERROR siempre va en copia. Lista separada por coma; vacío = solo quien marca.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'DocRetiros' AND Concepto = 'Aviso de documento con ERROR - Copia:');

-- Bloque 8: el rol Nomina puede ver la pestaña Doc. Retiros (fila de Acceso 1)
UPDATE Maestro_Menu
   SET Rol = CONCAT(Rol, ', Nomina')
 WHERE LOWER(Modulo) = 'clouddocs' AND LOWER(Seccion) = 'docretiros' AND Acceso = 1
   AND CONCAT(',', REPLACE(Rol, ' ', ''), ',') NOT LIKE '%,Nomina,%';

-- Bloque 9: verificación
SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'DocRetiros' ORDER BY Concepto;
