-- SST > Participación: enlaces de firma con clave única, correo de solicitud de firma,
-- PDF en talenthub_central/general (Maestro_docEmpresa tipo 89) y parámetros en Config_Parametros.
-- Se puede ejecutar más de una vez. Solo agrega columnas, un índice y filas nuevas (no borra nada).
-- Debe ejecutarse ANTES de probar la rama claude/sst-participacion-firmas.

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_formato_itemsAsistencia' AND COLUMN_NAME = 'token_firma');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_formato_itemsAsistencia ADD COLUMN token_firma VARCHAR(64) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_formato_itemsAsistencia' AND COLUMN_NAME = 'fecha_envio_correo');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_formato_itemsAsistencia ADD COLUMN fecha_envio_correo DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_formato_itemsAsistencia' AND COLUMN_NAME = 'fecha_firma');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_formato_itemsAsistencia ADD COLUMN fecha_firma DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_formato_asistencia' AND COLUMN_NAME = 'id_doc_empresa');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_formato_asistencia ADD COLUMN id_doc_empresa CHAR(50) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_formato_itemsAsistencia' AND INDEX_NAME = 'uk_items_asistencia_token');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_formato_itemsAsistencia ADD UNIQUE INDEX uk_items_asistencia_token (token_firma)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Participación', 'Roles que pueden crear formatos de participación', 'Rol', 'AdmSst, AnaSst, AuxSst, Calidad, LiderSst, Sistema', 'Roles que ven el botón para crear formatos de asistencia en SST > Participación. Vacío: nadie puede crear.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Participación' AND Concepto = 'Roles que pueden crear formatos de participación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Participación', 'Roles que pueden editar cualquier formato de participación', 'Rol', 'Sistema', 'Roles que pueden editar formatos creados por otros usuarios (solo antes de generar el PDF). Quien creó el formato siempre puede editarlo.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Participación' AND Concepto = 'Roles que pueden editar cualquier formato de participación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Participación', 'Roles que pueden eliminar cualquier formato de participación', 'Rol', 'Sistema, AdmSst, LiderSst', 'Roles que pueden eliminar formatos creados por otros usuarios (solo sin PDF). Quien creó el formato siempre puede eliminarlo.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Participación' AND Concepto = 'Roles que pueden eliminar cualquier formato de participación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Participación', 'Roles que pueden generar el PDF de cualquier formato de participación', 'Rol', 'Sistema', 'Roles que pueden generar o regenerar el PDF de formatos creados por otros usuarios. Quien creó el formato siempre puede hacerlo.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Participación' AND Concepto = 'Roles que pueden generar el PDF de cualquier formato de participación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Participación', 'Roles que pueden enviar enlaces de firma de cualquier formato de participación', 'Rol', 'Sistema, AdmSst, LiderSst', 'Roles que ven los enlaces de firma (WhatsApp, copiar) y reenvían el correo en formatos de otros usuarios. Quien creó el formato siempre puede.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Participación' AND Concepto = 'Roles que pueden enviar enlaces de firma de cualquier formato de participación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Participación', 'Habilitar notificaciones de correo en Participación', 'Booleano', '1', '1 = al crear el formato se envía a cada asistente el correo para firmar, y se permite reenviarlo. 0 = no se envían correos.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Participación' AND Concepto = 'Habilitar notificaciones de correo en Participación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Participación', 'Código del formato de participación', 'Texto', 'SST-F-003', 'Código que aparece en el encabezado del PDF del Registro de Participantes.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Participación' AND Concepto = 'Código del formato de participación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Participación', 'Versión del formato de participación', 'Texto', '02', 'Versión que aparece en el encabezado del PDF del Registro de Participantes.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Participación' AND Concepto = 'Versión del formato de participación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Participación', 'Fecha del formato de participación', 'Texto', '28/05/2026', 'Fecha de la versión del formato que aparece en el encabezado del PDF del Registro de Participantes.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Participación' AND Concepto = 'Fecha del formato de participación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Participación', 'Anotación en el PDF para asistentes sin firma', 'Texto', 'Soportado por correo electrónico', 'Texto que aparece en la casilla de firma de los asistentes que no firmaron (se agrega la fecha en que se envió el correo).' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Participación' AND Concepto = 'Anotación en el PDF para asistentes sin firma');

-- Verificación
SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Participación' ORDER BY Concepto;
SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_NAME IN ('token_firma', 'fecha_envio_correo', 'fecha_firma', 'id_doc_empresa')
  AND TABLE_NAME IN ('Dynamic_formato_itemsAsistencia', 'Dynamic_formato_asistencia');
