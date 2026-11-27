-- SST > Casos Médicos: campos de la "Matriz de casos médicos" (Excel de noviembre 2026) para dejar de usar el archivo.
-- 1) Campos nuevos del caso (estado laboral, origen, concepto, examen post-incapacidad, adaptación del puesto
--    Res. 1843/2025, proceso de calificación, APT, observación administrativa, actas del sistema anterior).
-- 2) Tablas por caso: restricciones, compromisos (con historial de reprogramaciones), trámites de calificación
--    y revisiones (quincenal / comité mensual).
-- 3) Bitácora: responsable, compromiso largo, cumplimiento, evidencia y próxima gestión.
-- 4) Firma del jefe inmediato en las actas de apertura y cierre (la de la Líder SST sale de su firma registrada).
-- 5) Valores nuevos de catálogos y listas desplegables en Config_Parametros (sst / Casos Medicos).
-- Solo agrega columnas, tablas y filas (amplía compromiso_accion a texto). Se puede ejecutar más de una vez.

-- 1) Campos nuevos del caso
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'codigo_matriz');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN codigo_matriz varchar(20) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'area');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN area varchar(30) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'cargo');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN cargo varchar(150) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'origen');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN origen varchar(30) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'estado_laboral');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN estado_laboral varchar(40) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'fecha_inicio_incap');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN fecha_inicio_incap date NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'fecha_fin_incap');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN fecha_fin_incap date NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'fecha_ultimo_concepto');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN fecha_ultimo_concepto date NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'tipo_concepto');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN tipo_concepto varchar(40) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'requiere_examen_postincap');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN requiere_examen_postincap varchar(2) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'fecha_examen_postincap');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN fecha_examen_postincap date NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'adaptacion_implementada');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN adaptacion_implementada varchar(2) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'fecha_evaluacion_ocupacional');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN fecha_evaluacion_ocupacional date NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'fecha_limite_adaptacion');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN fecha_limite_adaptacion date NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'estado_adaptacion');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN estado_adaptacion varchar(40) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'proceso_calificacion');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN proceso_calificacion varchar(30) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'requiere_apt');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN requiere_apt varchar(2) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'fecha_apt');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN fecha_apt date NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'apt_ubicacion');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN apt_ubicacion varchar(500) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'observacion_administrativa');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN observacion_administrativa text NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'acta_inicio_ext_fecha');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN acta_inicio_ext_fecha date NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'acta_inicio_ext_ubicacion');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN acta_inicio_ext_ubicacion varchar(500) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'acta_cierre_ext_fecha');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN acta_cierre_ext_fecha date NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'acta_cierre_ext_ubicacion');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN acta_cierre_ext_ubicacion varchar(500) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4) Firma del jefe inmediato en las actas (enlace propio, como el del trabajador)
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'token_jefe_apertura');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN token_jefe_apertura varchar(64) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'token_jefe_apertura_expira');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN token_jefe_apertura_expira datetime NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'firma_jefe_apertura');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN firma_jefe_apertura mediumtext NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'fecha_firma_jefe_apertura');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN fecha_firma_jefe_apertura datetime NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'token_jefe_cierre');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN token_jefe_cierre varchar(64) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'token_jefe_cierre_expira');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN token_jefe_cierre_expira datetime NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'firma_jefe_cierre');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN firma_jefe_cierre mediumtext NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_casosmedicos' AND COLUMN_NAME = 'fecha_firma_jefe_cierre');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_casosmedicos ADD COLUMN fecha_firma_jefe_cierre datetime NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) Bitácora
ALTER TABLE Maestro_bitacora_cmedicos MODIFY compromiso_accion text COLLATE utf8mb4_bin NULL;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_bitacora_cmedicos' AND COLUMN_NAME = 'responsable');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_bitacora_cmedicos ADD COLUMN responsable varchar(200) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_bitacora_cmedicos' AND COLUMN_NAME = 'responsable_compromiso');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_bitacora_cmedicos ADD COLUMN responsable_compromiso varchar(60) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_bitacora_cmedicos' AND COLUMN_NAME = 'fecha_cumplimiento');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_bitacora_cmedicos ADD COLUMN fecha_cumplimiento date NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_bitacora_cmedicos' AND COLUMN_NAME = 'evidencia');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_bitacora_cmedicos ADD COLUMN evidencia varchar(500) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_bitacora_cmedicos' AND COLUMN_NAME = 'proxima_gestion');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_bitacora_cmedicos ADD COLUMN proxima_gestion date NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_bitacora_cmedicos' AND COLUMN_NAME = 'observacion');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_bitacora_cmedicos ADD COLUMN observacion varchar(500) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_bitacora_cmedicos' AND COLUMN_NAME = 'codigo_matriz');
SET @sql := IF(@existe = 0, 'ALTER TABLE Maestro_bitacora_cmedicos ADD COLUMN codigo_matriz varchar(20) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Tablas por caso
CREATE TABLE IF NOT EXISTS Maestro_cm_restricciones (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  idcaso bigint unsigned NOT NULL,
  codigo_matriz varchar(20) NULL,
  fecha_concepto date NULL,
  tipo_concepto varchar(40) NULL,
  descripcion text NULL COMMENT 'Restricción o recomendación funcional, sin diagnóstico',
  temporalidad varchar(20) NULL,
  fecha_inicio date NULL,
  fecha_fin date NULL,
  seguimiento_medico varchar(2) NULL,
  fecha_control_medico date NULL,
  comunicada_jefe varchar(2) NULL,
  fecha_comunicacion date NULL,
  implementada varchar(2) NULL,
  fecha_implementacion date NULL,
  verificada_sst varchar(2) NULL,
  fecha_verificacion date NULL,
  usuario varchar(50) NULL,
  fecha_registro datetime NOT NULL DEFAULT (convert_tz(utc_timestamp(),'+00:00','-05:00')),
  fecha_actualizacion datetime NULL,
  deleted_at datetime NULL,
  PRIMARY KEY (id),
  KEY idx_cmres_caso (idcaso),
  CONSTRAINT fk_cmres_caso FOREIGN KEY (idcaso) REFERENCES Maestro_casosmedicos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS Maestro_cm_compromisos (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  idcaso bigint unsigned NOT NULL,
  codigo_matriz varchar(20) NULL,
  fecha_compromiso_registro date NULL,
  origen varchar(60) NULL,
  contraparte varchar(60) NULL,
  compromiso text NULL,
  responsable varchar(60) NULL,
  fecha_inicial date NULL COMMENT 'Fecha acordada originalmente: no cambia al reprogramar',
  fecha_vigente date NULL COMMENT 'Fecha inicial o la última reprogramada',
  fecha_cumplimiento date NULL,
  evidencia varchar(500) NULL,
  observaciones text NULL,
  usuario varchar(50) NULL,
  fecha_registro datetime NOT NULL DEFAULT (convert_tz(utc_timestamp(),'+00:00','-05:00')),
  fecha_actualizacion datetime NULL,
  deleted_at datetime NULL,
  PRIMARY KEY (id),
  KEY idx_cmcomp_caso (idcaso),
  CONSTRAINT fk_cmcomp_caso FOREIGN KEY (idcaso) REFERENCES Maestro_casosmedicos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS Maestro_cm_reprogramaciones (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  idcompromiso bigint unsigned NOT NULL,
  fecha_anterior date NULL,
  fecha_nueva date NOT NULL,
  motivo varchar(100) NULL,
  autorizado_por varchar(200) NULL,
  observaciones text NULL,
  usuario varchar(50) NULL,
  fecha_registro datetime NOT NULL DEFAULT (convert_tz(utc_timestamp(),'+00:00','-05:00')),
  PRIMARY KEY (id),
  KEY idx_cmrep_comp (idcompromiso),
  CONSTRAINT fk_cmrep_comp FOREIGN KEY (idcompromiso) REFERENCES Maestro_cm_compromisos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS Maestro_cm_calificacion (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  idcaso bigint unsigned NOT NULL,
  entidad varchar(40) NULL,
  tipo_tramite varchar(200) NULL,
  fecha_radicacion date NULL,
  radicado varchar(60) NULL,
  estado_tramite varchar(40) NULL,
  fecha_ultima_respuesta date NULL,
  pendiente varchar(500) NULL,
  responsable varchar(200) NULL,
  fecha_proxima_gestion date NULL,
  calificacion_origen varchar(30) NULL,
  fecha_origen date NULL,
  pcl_porcentaje decimal(5,2) NULL,
  fecha_dictamen date NULL,
  instancia varchar(100) NULL,
  estado_final varchar(40) NULL,
  observacion text NULL,
  usuario varchar(50) NULL,
  fecha_registro datetime NOT NULL DEFAULT (convert_tz(utc_timestamp(),'+00:00','-05:00')),
  fecha_actualizacion datetime NULL,
  deleted_at datetime NULL,
  PRIMARY KEY (id),
  KEY idx_cmcal_caso (idcaso),
  CONSTRAINT fk_cmcal_caso FOREIGN KEY (idcaso) REFERENCES Maestro_casosmedicos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS Maestro_cm_revisiones (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  idcaso bigint unsigned NOT NULL,
  codigo_matriz varchar(20) NULL,
  fecha_revision date NULL,
  tipo_revision varchar(30) NULL,
  jefe_revisado varchar(4) NULL,
  eps_revisada varchar(4) NULL,
  arl_revisada varchar(4) NULL,
  medicina_laboral_revisada varchar(4) NULL,
  tema_comite varchar(60) NULL,
  acuerdos text NULL,
  responsable varchar(200) NULL,
  evidencia varchar(500) NULL,
  observaciones text NULL,
  usuario varchar(50) NULL,
  fecha_registro datetime NOT NULL DEFAULT (convert_tz(utc_timestamp(),'+00:00','-05:00')),
  fecha_actualizacion datetime NULL,
  deleted_at datetime NULL,
  PRIMARY KEY (id),
  KEY idx_cmrev_caso (idcaso),
  CONSTRAINT fk_cmrev_caso FOREIGN KEY (idcaso) REFERENCES Maestro_casosmedicos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 5) Catálogos: tipos de gestión de la matriz y accidente común
INSERT IGNORE INTO Config_Tipo_Contacto (tipo) VALUES ('Cita medicina laboral');
INSERT IGNORE INTO Config_Tipo_Contacto (tipo) VALUES ('Gestión EPS');
INSERT IGNORE INTO Config_Tipo_Contacto (tipo) VALUES ('Gestión ARL');
INSERT IGNORE INTO Config_Tipo_Contacto (tipo) VALUES ('Gestión AFP');
INSERT IGNORE INTO Config_Tipo_Contacto (tipo) VALUES ('APT');
INSERT IGNORE INTO Config_Tipo_Contacto (tipo) VALUES ('Inspección de puesto');
INSERT IGNORE INTO Config_Tipo_Contacto (tipo) VALUES ('Verificación restricciones');
INSERT IGNORE INTO Config_Tipo_Contacto (tipo) VALUES ('Otro');
INSERT IGNORE INTO Config_Tipo_Evento (nombre) VALUES ('ACCIDENTE COMÚN');

-- Listas desplegables y parámetros (sst / Casos Medicos)
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Lista de opciones: Área', '', 'Administrativo, Operativo', 'Opciones (separadas por coma) de la lista desplegable de área del trabajador en Casos Médicos. Vacía: se usan las opciones de la matriz de noviembre 2026.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Lista de opciones: Área');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Lista de opciones: Origen', '', 'Laboral, Común, En estudio, No definido', 'Opciones (separadas por coma) de la lista desplegable de origen del evento en Casos Médicos. Vacía: se usan las opciones de la matriz de noviembre 2026.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Lista de opciones: Origen');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Lista de opciones: Estado laboral', '', 'Incapacitado, Activo en cargo, Reintegro con modificaciones, Reubicado temporal, Reubicado definitivo, Reconversión laboral, Ausente', 'Opciones (separadas por coma) de la lista desplegable de estado laboral del trabajador ("Activo en cargo" cuenta como mismo cargo y funciones) en Casos Médicos. Vacía: se usan las opciones de la matriz de noviembre 2026.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Lista de opciones: Estado laboral');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Lista de opciones: Tipo de concepto', '', 'Post-incapacidad, Reintegro/reincorporación, Seguimiento/control, Tratante, Recomendación externa', 'Opciones (separadas por coma) de la lista desplegable de tipo de concepto médico (caso y restricciones) en Casos Médicos. Vacía: se usan las opciones de la matriz de noviembre 2026.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Lista de opciones: Tipo de concepto');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Lista de opciones: Estado de adaptación', '', 'Implementada, En trámite, Pendiente, No aplica', 'Opciones (separadas por coma) de la lista desplegable de estado de la adaptación del puesto en Casos Médicos. Vacía: se usan las opciones de la matriz de noviembre 2026.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Lista de opciones: Estado de adaptación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Lista de opciones: Proceso de calificación', '', 'No iniciado, En proceso, Origen calificado, PCL en trámite, PCL calificada, Controversia, Cerrado', 'Opciones (separadas por coma) de la lista desplegable de estado del proceso de calificación del caso en Casos Médicos. Vacía: se usan las opciones de la matriz de noviembre 2026.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Lista de opciones: Proceso de calificación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Lista de opciones: Temporalidad', '', 'Temporal, Permanente', 'Opciones (separadas por coma) de la lista desplegable de temporalidad de la restricción en Casos Médicos. Vacía: se usan las opciones de la matriz de noviembre 2026.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Lista de opciones: Temporalidad');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Lista de opciones: Entidad', '', 'EPS, ARL, AFP, Junta Regional, Junta Nacional, Medicina laboral, IPS, Otra', 'Opciones (separadas por coma) de la lista desplegable de entidad gestora de los trámites de calificación en Casos Médicos. Vacía: se usan las opciones de la matriz de noviembre 2026.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Lista de opciones: Entidad');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Lista de opciones: Estado del trámite', '', 'Radicado, En trámite, Calificada, Controversia, Cerrado', 'Opciones (separadas por coma) de la lista desplegable de estado de los trámites de calificación en Casos Médicos. Vacía: se usan las opciones de la matriz de noviembre 2026.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Lista de opciones: Estado del trámite');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Lista de opciones: Origen del compromiso', '', 'Acta de inicio, Revisión quincenal, Comité mensual, Gestión con jefe, Gestión EPS/ARL/AFP, Otro', 'Opciones (separadas por coma) de la lista desplegable de de dónde sale el compromiso en Casos Médicos. Vacía: se usan las opciones de la matriz de noviembre 2026.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Lista de opciones: Origen del compromiso');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Lista de opciones: Contraparte', '', 'Jefe inmediato, EPS, ARL, Medicina laboral, Talento Humano, Trabajador, Otro', 'Opciones (separadas por coma) de la lista desplegable de con quién se acuerda el compromiso en Casos Médicos. Vacía: se usan las opciones de la matriz de noviembre 2026.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Lista de opciones: Contraparte');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Lista de opciones: Responsable del compromiso', '', 'Jefe inmediato, SST, Talento Humano, Trabajador', 'Opciones (separadas por coma) de la lista desplegable de quién debe cumplir el compromiso en Casos Médicos. Vacía: se usan las opciones de la matriz de noviembre 2026.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Lista de opciones: Responsable del compromiso');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Lista de opciones: Motivo de reprogramación', '', 'Pendiente de gestión, Ajuste operativo, Nueva recomendación, Solicitud de EPS/ARL/Medicina laboral, Ausencia o incapacidad del trabajador, Otro', 'Opciones (separadas por coma) de la lista desplegable de motivo al cambiar la fecha de un compromiso en Casos Médicos. Vacía: se usan las opciones de la matriz de noviembre 2026.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Lista de opciones: Motivo de reprogramación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Lista de opciones: Tipo de revisión', '', 'Quincenal, Comité mensual', 'Opciones (separadas por coma) de la lista desplegable de tipo de revisión del caso en Casos Médicos. Vacía: se usan las opciones de la matriz de noviembre 2026.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Lista de opciones: Tipo de revisión');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Lista de opciones: Tema del comité', '', 'Seguimiento general, Cierre de caso, Reubicación, Proceso de calificación, Varios', 'Opciones (separadas por coma) de la lista desplegable de tema tratado en la revisión o comité en Casos Médicos. Vacía: se usan las opciones de la matriz de noviembre 2026.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Lista de opciones: Tema del comité');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Días hábiles para implementar la adaptación del puesto', '', '20', 'Días hábiles (sin sábados, domingos ni festivos de Colombia) desde la evaluación ocupacional para implementar la adaptación del puesto (Res. 1843/2025, art. 6). Con este valor se calcula la fecha límite del caso.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Días hábiles para implementar la adaptación del puesto');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Rol que firma como Líder SST en las actas de casos médicos', '', 'LiderSst', 'Rol cuyo primer usuario firma como Líder SST las actas de apertura y cierre de casos médicos, con su firma registrada. Vacío: el acta sale sin firma de SST.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Rol que firma como Líder SST en las actas de casos médicos');

