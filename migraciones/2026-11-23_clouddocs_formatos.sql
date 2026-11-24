-- Cloud Docs › Formatos: consulta y edición de las plantillas de documentos (Maestro_Plantillas).
-- Código: src/services/formatosPlantillas.js, rutas /cloud-docs/api/formatos en src/routes/clouddocs.js.
-- Se puede ejecutar más de una vez. Sin variables ni PREPARE (se puede correr en HiSQL por bloques).

-- ── Bloque 1: tabla de respaldo e historial de cambios ──────────────────────
-- Antes de cada cambio se guarda aquí lo anterior (contenido_html completo si cambió el texto o el código).
CREATE TABLE IF NOT EXISTS Historial_Plantillas (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  id_plantilla            INT          NOT NULL COMMENT 'Maestro_Plantillas.id_plantilla',
  nombre_proceso          VARCHAR(100) NULL,
  fecha                   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario                 VARCHAR(100) NULL COMMENT 'Maestro_Usuarios.ID de quien hizo el cambio',
  rol                     VARCHAR(50)  NULL,
  motivo                  VARCHAR(500) NULL,
  cambios                 TEXT         NULL COMMENT 'Resumen legible de lo que cambió',
  version_anterior        SMALLINT     NULL COMMENT 'Maestro_Plantillas.version antes del cambio',
  valores_anteriores      TEXT         NULL COMMENT 'JSON con código, versión, fecha, descripción o estado anteriores',
  contenido_html_anterior LONGTEXT     NULL COMMENT 'HTML completo anterior (solo si cambió el contenido)',
  KEY idx_historial_plantilla (id_plantilla, id)
);

-- ── Bloque 2: pestaña Formatos en el menú (quién la ve) ─────────────────────
-- Calidad no tiene acceso base a Cloud Docs: con esta fila entra solo a la pestaña Formatos.
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'clouddocs', 'Formatos', 'Sistema, Calidad', 1, 'Formatos', '/cloud-docs?tab=formatos', 10, '▤',
       'Plantillas de los documentos (Maestro_Plantillas): consultar y editar textos, código, versión y fecha del formato.'
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT ID FROM Maestro_Menu WHERE Modulo = 'clouddocs' AND Seccion = 'Formatos') ya);

-- ── Bloque 3: reglas de la pestaña (Config_Parametros CloudDocs / Formatos) ──
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'Formatos', 'Roles que pueden editar formatos', 'Rol', 'Sistema, Calidad',
       'Roles que pueden guardar cambios en Cloud Docs › Formatos. Quién ve la pestaña se define en Maestro_Menu (clouddocs / Formatos); un rol que la ve pero no está aquí solo consulta. Vacío = nadie edita.'
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'Formatos' AND Concepto = 'Roles que pueden editar formatos') ya);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'Formatos', 'Campos editables de los formatos', 'Lista', 'texto, codigo_formato, version_formato, fecha_version, observaciones',
       'Qué se puede cambiar en Formatos, separado por coma: texto (redacción del documento), codigo_formato, version_formato, fecha_version, observaciones (descripción) y activo (activar/inactivar la plantilla). Lo que no esté en la lista queda solo de lectura.'
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'Formatos' AND Concepto = 'Campos editables de los formatos') ya);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'Formatos', 'Roles que pueden editar el código HTML de los formatos', 'Rol', 'Sistema',
       'Roles que ven la pestaña Código HTML del formato y pueden cambiar el código completo (además deben estar en Roles que pueden editar formatos). Vacío = nadie edita el código.'
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'Formatos' AND Concepto = 'Roles que pueden editar el código HTML de los formatos') ya);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'Formatos', 'Exigir motivo del cambio en formatos', 'Booleano', '1',
       '1 = para guardar un cambio en Formatos hay que escribir el motivo (queda en el historial). 0 = el motivo es opcional.'
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'Formatos' AND Concepto = 'Exigir motivo del cambio en formatos') ya);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'Formatos', 'Subir la versión del formato al cambiar el texto', 'Booleano', '0',
       '1 = al guardar un cambio de texto o código sin tocar la versión, la versión del formato sube sola (03 → 04) y la fecha queda en la de hoy. 0 = la versión y la fecha solo cambian a mano.'
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'Formatos' AND Concepto = 'Subir la versión del formato al cambiar el texto') ya);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'Formatos', 'Plantillas ocultas en Formatos', 'Lista', '',
       'Nombres de proceso de Maestro_Plantillas (nombre_proceso) que no se muestran ni se editan en Formatos, separados por coma. Vacío = se muestran todas.'
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'Formatos' AND Concepto = 'Plantillas ocultas en Formatos') ya);

-- ── Bloque 4: verificación ──────────────────────────────────────────────────
SELECT Seccion, Rol, Acceso, Url FROM Maestro_Menu WHERE Modulo = 'clouddocs' AND Seccion = 'Formatos';
SELECT Concepto, Condicion, Parametro FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'Formatos' ORDER BY id;
SELECT COUNT(*) AS filas_historial FROM Historial_Plantillas;
