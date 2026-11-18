-- Restaurar documentos respaldados previamente en Maestro_docTrabajador_respaldo_20261118.
-- Solicitud de William: el área de archivo prefiere organizar y depurar los documentos ellos mismos.
-- Se reinsertan en Maestro_docTrabajador los registros que fueron respaldados hoy.
-- Nota: La columna 'Url' es VIRTUAL GENERATED, por lo que se especifican las columnas reales.
-- Es idempotente (INSERT IGNORE).

INSERT IGNORE INTO Maestro_docTrabajador (
  id, `Validación`, Regional, `Operación`, `Identificación`, 
  Estado, Fecha_Ingreso, TipoDocumento, Prefijo, Doc, 
  Observaciones, Visualizar, Solicitud, Justificacion_Solicitud, 
  FechaRegistro, Usuario, Usuario_Solicitud, Estado_Solicitud, recurso
)
SELECT 
  id, `Validación`, Regional, `Operación`, `Identificación`, 
  Estado, Fecha_Ingreso, TipoDocumento, Prefijo, Doc, 
  Observaciones, Visualizar, Solicitud, Justificacion_Solicitud, 
  FechaRegistro, Usuario, Usuario_Solicitud, Estado_Solicitud, recurso
FROM Maestro_docTrabajador_respaldo_20261118;
