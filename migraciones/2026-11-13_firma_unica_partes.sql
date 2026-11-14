-- Firma única de documentos (Portal del aspirante › Documentos para firmas).
-- Un documento de firma con varias plantillas (ej. Formatos Italcol, documento 33: SIG, Emergencias,
-- Alcohol y Celular) genera un PDF por plantilla. Esta tabla guarda cada parte con su observación;
-- Dynamic_hv_documentos sigue teniendo una fila por documento (con el PDF unido).
-- Al finalizar la contratación cada parte pasa a Maestro_docTrabajador con su observación.
-- Si la tabla no existe, la firma funciona igual (solo no se registran las partes).
-- Se puede ejecutar más de una vez.

CREATE TABLE IF NOT EXISTS Dynamic_hv_documentos_partes (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  id_aspirante        CHAR(12)     NOT NULL,
  id_config_doc       INT          NOT NULL,
  id_plantilla        INT          NOT NULL COMMENT 'Maestro_Plantillas.id_plantilla',
  nombre_proceso      VARCHAR(100) NULL,
  observaciones       VARCHAR(200) NULL COMMENT 'Formato del cliente (pasa a Maestro_docTrabajador.Observaciones)',
  gcs_path            VARCHAR(255) NOT NULL,
  fecha_firma         DATETIME     NULL COMMENT 'Hora de Colombia',
  ip_firma            VARCHAR(64)  NULL,
  hash_pdf            CHAR(64)     NULL,
  codigo_verificacion VARCHAR(20)  NULL,
  fecha_actualizacion TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_parte (id_aspirante, id_config_doc, id_plantilla),
  KEY idx_aspirante (id_aspirante)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

SELECT COUNT(*) AS partes_registradas FROM Dynamic_hv_documentos_partes;
