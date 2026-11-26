-- Cloud Docs: se quita el semáforo de validación (salvo Doc. Retiros) y el botón de eliminar
-- ya no depende de ERROR: lo ven los roles autorizados, con motivo obligatorio.
-- Fecha: 2026-11-26
-- Se puede ejecutar más de una vez. Ejecutar cada bloque por separado en HiSQL.

-- Bloque 1: constancia de cada documento eliminado desde Cloud Docs (copia completa del registro en Datos)
CREATE TABLE IF NOT EXISTS Historial_Eliminaciones_CloudDocs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  Tabla VARCHAR(60) NOT NULL,
  RegistroId VARCHAR(60) NOT NULL,
  Identificacion VARCHAR(30) NULL,
  TipoDocumento VARCHAR(50) NULL,
  Url VARCHAR(500) NULL,
  Datos LONGTEXT NULL,
  Motivo VARCHAR(500) NOT NULL,
  Usuario VARCHAR(100) NOT NULL,
  Rol VARCHAR(60) NULL,
  Fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hist_elim_ident (Identificacion),
  INDEX idx_hist_elim_fecha (Fecha)
);

-- Bloque 2: el permiso de eliminar ya no depende de la validación ERROR (se renombra el concepto)
UPDATE Config_Parametros
   SET Concepto = 'Roles que pueden eliminar documentos',
       Descripcion = 'Roles que ven el botón de eliminar en las pestañas Todo y Doc. Retiros de Cloud Docs y pueden borrar un documento (registro y archivo). Se exige un motivo y queda constancia en Historial_Eliminaciones_CloudDocs. Lista separada por coma. Si la fila no existe se usa Archivo, Sistema; si se deja vacía nadie puede eliminar.'
 WHERE Modulo = 'CloudDocs' AND Seccion = 'Trabajadores'
   AND Concepto = 'Roles que pueden eliminar documentos con validación ERROR';

-- Bloque 3: verificación
SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'Trabajadores' ORDER BY Concepto;
