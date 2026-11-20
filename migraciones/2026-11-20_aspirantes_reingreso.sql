-- Reingresos en Talent Hub › Aspirantes.
-- Un aspirante ya contratado (por ejemplo, un AUXILIAR LOGISTICO que se retiró y vuelve, o alguien
-- que se postula a un cargo superior) puede iniciar un nuevo proceso con otra requisición sin
-- perder el anterior:
--   * Dynamic_hv_aspirante.proceso_numero: 1 para el primer ingreso, 2 para el primer reingreso, etc.
--   * Dynamic_hv_procesos: un registro por cada proceso cerrado (requisición, operación, cargo, quién lo cerró).
--   * Dynamic_hv_documentos_historial: copia de los documentos y firmas del proceso cerrado.
--   * Config_Parametros talenthub/Aspirantes: roles que pueden iniciar un reingreso y documentos que se conservan.
-- No borra ni modifica datos existentes. Se puede ejecutar más de una vez.

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_hv_aspirante' AND COLUMN_NAME = 'proceso_numero');
SET @sql := IF(@existe = 0,
  'ALTER TABLE Dynamic_hv_aspirante ADD COLUMN proceso_numero INT NOT NULL DEFAULT 1 COMMENT ''1 = primer ingreso; 2 en adelante = reingresos''',
  'SELECT ''proceso_numero ya existe''');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

CREATE TABLE IF NOT EXISTS Dynamic_hv_procesos (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  id_aspirante            CHAR(12)     NOT NULL,
  proceso_numero          INT          NOT NULL,
  IdRequisicion           INT          NULL COMMENT 'Requisición del proceso que se cerró',
  operacion               VARCHAR(150) NULL,
  cargo                   VARCHAR(150) NULL,
  estado_final            VARCHAR(50)  NULL,
  fecha_cierre            DATETIME     NULL COMMENT 'Hora de Colombia',
  usuario_cierre          VARCHAR(150) NULL,
  motivo_cierre           VARCHAR(200) NULL COMMENT 'Reingreso o Cambio de cargo',
  IdRequisicion_siguiente INT          NULL COMMENT 'Requisición con la que inició el siguiente proceso',
  UNIQUE KEY uq_proceso (id_aspirante, proceso_numero),
  KEY idx_aspirante (id_aspirante)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS Dynamic_hv_documentos_historial (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  id_aspirante            CHAR(12)     NOT NULL,
  proceso_numero          INT          NOT NULL,
  id_config_doc           INT          NOT NULL,
  id_plantilla            INT          NULL COMMENT 'Solo para partes de un documento de firma única',
  nombre_proceso          VARCHAR(100) NULL,
  observaciones           TEXT         NULL,
  gcs_path                VARCHAR(255) NULL,
  estado                  VARCHAR(30)  NULL,
  fecha_firma             DATETIME     NULL,
  codigo_verificacion     VARCHAR(20)  NULL,
  fecha_registro_original DATETIME     NULL,
  fecha_archivo           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_aspirante_proceso (id_aspirante, proceso_numero)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Aspirantes', 'Roles que pueden iniciar un reingreso', 'Lista',
       'Selección, Selección Centro, CoorSelección, Sistema, AuxiliarR',
       'Roles (separados por coma) que ven el botón "Iniciar reingreso" en el panel de un aspirante contratado. Si se deja vacía, nadie puede iniciar reingresos.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros
                  WHERE Modulo = 'talenthub' AND Seccion = 'Aspirantes' AND Concepto = 'Roles que pueden iniciar un reingreso');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Aspirantes', 'Documentos que se conservan en un reingreso', 'Lista', 'CC',
       'Prefijos de documentos (separados por coma, ej. CC) que se conservan al iniciar un reingreso; los demás y todas las firmas se piden de nuevo. El proceso anterior queda en el historial.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros
                  WHERE Modulo = 'talenthub' AND Seccion = 'Aspirantes' AND Concepto = 'Documentos que se conservan en un reingreso');

SELECT
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_hv_aspirante' AND COLUMN_NAME = 'proceso_numero') AS columna_proceso_numero,
  (SELECT COUNT(*) FROM Dynamic_hv_procesos) AS procesos_cerrados,
  (SELECT COUNT(*) FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Aspirantes' AND Concepto LIKE '%reingreso%') AS parametros_reingreso;
