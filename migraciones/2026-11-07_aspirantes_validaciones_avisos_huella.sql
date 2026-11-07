-- Aspirantes (TalentHub › Selección): validaciones, avisos de la fase de firmas y huella de la firma.
-- Se puede ejecutar más de una vez.

-- 1. Huella de la firma en Dynamic_hv_documentos
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_hv_documentos' AND COLUMN_NAME = 'fecha_firma');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_hv_documentos ADD COLUMN fecha_firma DATETIME NULL COMMENT ''Fecha y hora (Colombia) de la firma digital''', 'SELECT ''fecha_firma ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_hv_documentos' AND COLUMN_NAME = 'ip_firma');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_hv_documentos ADD COLUMN ip_firma VARCHAR(64) NULL COMMENT ''IP desde donde se firmó''', 'SELECT ''ip_firma ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_hv_documentos' AND COLUMN_NAME = 'dispositivo_firma');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_hv_documentos ADD COLUMN dispositivo_firma VARCHAR(255) NULL COMMENT ''Navegador / dispositivo con el que se firmó''', 'SELECT ''dispositivo_firma ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_hv_documentos' AND COLUMN_NAME = 'hash_firma');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_hv_documentos ADD COLUMN hash_firma CHAR(64) NULL COMMENT ''SHA-256 del PDF firmado''', 'SELECT ''hash_firma ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_hv_documentos' AND COLUMN_NAME = 'codigo_verificacion');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_hv_documentos ADD COLUMN codigo_verificacion VARCHAR(20) NULL COMMENT ''Código de verificación impreso en el PDF firmado''', 'SELECT ''codigo_verificacion ya existe''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Parámetros (Config_Parametros talenthub/Aspirantes). Si una fila no existe, el código
--    no valida ni envía avisos (comportamiento anterior).
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Aspirantes', 'Exigir documentos del aspirante aprobados para pasar a En proceso', 'Booleano', '1',
       '1: para pasar al aspirante a "En proceso" (fase de firmas) deben estar aprobados los documentos de la fila "Documentos del aspirante obligatorios para pasar a En proceso". 0: no se valida.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Aspirantes' AND Concepto = 'Exigir documentos del aspirante aprobados para pasar a En proceso');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Aspirantes', 'Documentos del aspirante obligatorios para pasar a En proceso', 'Lista', '11, 5, 15/3, 10',
       'Ids de Config_Doc_Trabajador separados por coma que deben estar aprobados para pasar a "En proceso". Con "/" basta uno de ellos (15/3: Certificado de EPS o ADRES). Vacío: no exige ninguno.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Aspirantes' AND Concepto = 'Documentos del aspirante obligatorios para pasar a En proceso');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Aspirantes', 'Exigir todos los documentos de firma para finalizar la contratación', 'Booleano', '1',
       '1: solo se puede finalizar la contratación si el aspirante firmó todos los documentos de firma de su operación (firmados o aprobados). 0: no se valida.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Aspirantes' AND Concepto = 'Exigir todos los documentos de firma para finalizar la contratación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Aspirantes', 'Habilitar notificaciones de correo en Aspirantes', 'Booleano', '0',
       'Interruptor general de los correos de la fase de firmas de Aspirantes. 0: no se envía ningún aviso. 1: se envían los avisos que estén en 1.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Aspirantes' AND Concepto = 'Habilitar notificaciones de correo en Aspirantes');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Aspirantes', 'Aviso al aspirante al pasar a En proceso', 'Booleano', '1',
       '1: al pasar a "En proceso" se envía al aspirante un correo con el enlace para firmar sus documentos (quien hizo el cambio va en copia). Requiere el interruptor general en 1.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Aspirantes' AND Concepto = 'Aviso al aspirante al pasar a En proceso');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Aspirantes', 'Aviso a Selección cuando el aspirante completa las firmas', 'Booleano', '1',
       '1: cuando el aspirante firma el último documento se avisa por correo al Responsable de Selección de la requisición y a los roles de "Aviso de firmas completas - Para:". Requiere el interruptor general en 1.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Aspirantes' AND Concepto = 'Aviso a Selección cuando el aspirante completa las firmas');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Aspirantes', 'Aviso de firmas completas - Para:', 'Rol', 'CoorSelección',
       'Roles que reciben el aviso de firmas completas, además del Responsable de Selección de la requisición. Vacío: solo el Responsable de Selección.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Aspirantes' AND Concepto = 'Aviso de firmas completas - Para:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Aspirantes', 'Aviso de firmas completas - Copia:', 'Rol', '',
       'Roles que van en copia del aviso de firmas completas. Vacío: sin copia.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Aspirantes' AND Concepto = 'Aviso de firmas completas - Copia:');
