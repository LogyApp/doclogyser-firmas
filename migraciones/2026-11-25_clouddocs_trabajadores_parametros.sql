-- Migración: parámetros de Cloud Docs › Trabajadores (Config_Parametros, Modulo CloudDocs, Seccion Trabajadores)
-- Fecha: 2026-11-25
-- Se puede ejecutar más de una vez: cada INSERT revisa que la fila no exista.
-- Los valores son los mismos que tenía el código, así que ejecutarla no cambia el comportamiento.
-- Excepción: "Bloquear documentos repetidos al cargar" queda en 0 (apagado); se enciende cambiándolo a 1.
-- Ejecutar cada bloque por separado en HiSQL.

-- Bloque 1
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'Trabajadores', 'Máximo de trabajadores en el listado', 'Numero', '1000',
       'Cantidad máxima de trabajadores que trae la pestaña Trabajadores de Cloud Docs (los de ingreso más reciente primero). Los que no alcanzan a aparecer se encuentran con el buscador. Vacío o inválido = 1000.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'Trabajadores' AND Concepto = 'Máximo de trabajadores en el listado'
);

-- Bloque 2
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'Trabajadores', 'Roles que pueden validar documentos', 'Rol', 'Archivo, Sistema, Asistencial',
       'Roles que pueden cambiar el semáforo de validación (OK, PEND, ERROR) de los documentos de un trabajador en Cloud Docs. Lista separada por coma. Si la fila no existe se usa Archivo, Sistema, Asistencial; si se deja vacía nadie puede validar.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'Trabajadores' AND Concepto = 'Roles que pueden validar documentos'
);

-- Bloque 3
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'Trabajadores', 'Roles que pueden eliminar documentos', 'Rol', 'Archivo, Sistema',
       'Roles que ven el botón de eliminar en las pestañas Todo y Doc. Retiros de Cloud Docs y pueden borrar un documento (registro y archivo). Se exige un motivo y queda constancia en Historial_Eliminaciones_CloudDocs. Lista separada por coma. Si la fila no existe se usa Archivo, Sistema; si se deja vacía nadie puede eliminar.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'Trabajadores'
    AND Concepto IN ('Roles que pueden eliminar documentos', 'Roles que pueden eliminar documentos con validación ERROR')
);

-- Bloque 4
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'Trabajadores', 'Roles que pueden crear tipos de documento', 'Rol', 'Archivo, Sistema',
       'Roles que pueden crear nuevos tipos de documento (Trabajador o General) en Cloud Docs. Aparte, los usuarios de la operación Administración siguen pudiendo crear tipos General. Si la fila no existe se usa Archivo, Sistema.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'Trabajadores' AND Concepto = 'Roles que pueden crear tipos de documento'
);

-- Bloque 5
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'Trabajadores', 'Bloquear documentos repetidos al cargar', 'Booleano', '0',
       '1 = al cargar un documento de trabajador se rechaza si ya existe el mismo tipo de documento para su vinculación actual, salvo que el tipo tenga Duplicados = SI en Config_Doc_Trabajador. 0 o vacío = se permite cargar repetidos (comportamiento anterior).'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'Trabajadores' AND Concepto = 'Bloquear documentos repetidos al cargar'
);

-- Verificación (debe devolver 5 filas)
SELECT Concepto, Condicion, Parametro
FROM Config_Parametros
WHERE Modulo = 'CloudDocs' AND Seccion = 'Trabajadores'
ORDER BY Concepto;
