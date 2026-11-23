-- Habilitar Doc. SST desde Aspirantes (Panel Admin) y Cloud-Docs (portal del trabajador): Selección, Archivo o SST
-- habilitan la Prueba de Consumo, el ARO, la EVIN y el INGE, y el aspirante los firma desde su portal.
-- id_aspirante marca los registros habilitados desde el portal (src/services/docSstPortal.js). Mientras el aspirante
-- no esté vinculado, el PDF firmado no pasa a la carpeta digital; pasa al insertarlo en la Sociodemográfica.
-- La Prueba de Consumo guarda además la operación y regional de la requisición (antes de vincularlo no tiene
-- Maestro_Vinculación). Solo agrega lo que falte; se puede ejecutar más de una vez.

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_pruebaconsumo' AND COLUMN_NAME = 'id_aspirante');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_pruebaconsumo ADD COLUMN id_aspirante VARCHAR(12) COLLATE utf8mb4_bin NULL', 'SELECT ''Dynamic_pruebaconsumo.id_aspirante ya existe'' AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_pruebaconsumo' AND INDEX_NAME = 'idx_id_aspirante');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_pruebaconsumo ADD INDEX idx_id_aspirante (id_aspirante)', 'SELECT ''Dynamic_pruebaconsumo.idx_id_aspirante ya existe'' AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_aro' AND COLUMN_NAME = 'id_aspirante');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_aro ADD COLUMN id_aspirante VARCHAR(12) COLLATE utf8mb4_bin NULL', 'SELECT ''Dynamic_aro.id_aspirante ya existe'' AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_aro' AND INDEX_NAME = 'idx_id_aspirante');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_aro ADD INDEX idx_id_aspirante (id_aspirante)', 'SELECT ''Dynamic_aro.idx_id_aspirante ya existe'' AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_evin' AND COLUMN_NAME = 'id_aspirante');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_evin ADD COLUMN id_aspirante VARCHAR(12) COLLATE utf8mb4_bin NULL', 'SELECT ''Dynamic_evin.id_aspirante ya existe'' AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_evin' AND INDEX_NAME = 'idx_id_aspirante');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_evin ADD INDEX idx_id_aspirante (id_aspirante)', 'SELECT ''Dynamic_evin.idx_id_aspirante ya existe'' AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_inge' AND COLUMN_NAME = 'id_aspirante');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_inge ADD COLUMN id_aspirante VARCHAR(12) COLLATE utf8mb4_bin NULL', 'SELECT ''Dynamic_inge.id_aspirante ya existe'' AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_inge' AND INDEX_NAME = 'idx_id_aspirante');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_inge ADD INDEX idx_id_aspirante (id_aspirante)', 'SELECT ''Dynamic_inge.idx_id_aspirante ya existe'' AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_pruebaconsumo' AND COLUMN_NAME = 'operacion');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_pruebaconsumo ADD COLUMN operacion VARCHAR(150) NULL', 'SELECT ''Dynamic_pruebaconsumo.operacion ya existe'' AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_pruebaconsumo' AND COLUMN_NAME = 'regional');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_pruebaconsumo ADD COLUMN regional VARCHAR(100) NULL', 'SELECT ''Dynamic_pruebaconsumo.regional ya existe'' AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- habilitado_portal = 1: el registro lo creó el portal (Habilitar Doc. SST). Al deshabilitarlo se borra; si es 0 era
-- un pendiente que SST ya había generado y el portal solo reutilizó: al deshabilitarlo solo se le quita id_aspirante.
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_aro' AND COLUMN_NAME = 'habilitado_portal');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_aro ADD COLUMN habilitado_portal TINYINT(1) NOT NULL DEFAULT 0', 'SELECT ''Dynamic_aro.habilitado_portal ya existe'' AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_evin' AND COLUMN_NAME = 'habilitado_portal');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_evin ADD COLUMN habilitado_portal TINYINT(1) NOT NULL DEFAULT 0', 'SELECT ''Dynamic_evin.habilitado_portal ya existe'' AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_inge' AND COLUMN_NAME = 'habilitado_portal');
SET @sql := IF(@existe = 0, 'ALTER TABLE Dynamic_inge ADD COLUMN habilitado_portal TINYINT(1) NOT NULL DEFAULT 0', 'SELECT ''Dynamic_inge.habilitado_portal ya existe'' AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'General', 'Roles que pueden habilitar Doc. SST desde Aspirantes y Cloud-Docs', '',
       'Selección, CoorSelección, Selección Centro, Directorth, Archivo, Sistema, AdmSst, AnaSst, AuxSst, LiderSst',
       'Roles que ven el botón "Habilitar Doc. SST" en el Panel Admin del aspirante y en el portal de Cloud-Docs: habilitan la Prueba de Consumo, el ARO, la EVIN y el INGE para que el aspirante o trabajador los firme desde su portal. Quien habilita firma como responsable (EVIN) o analista (INGE). Vacío: nadie.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'General' AND Concepto = 'Roles que pueden habilitar Doc. SST desde Aspirantes y Cloud-Docs');

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('Dynamic_pruebaconsumo', 'Dynamic_aro', 'Dynamic_evin', 'Dynamic_inge')
   AND COLUMN_NAME IN ('id_aspirante', 'operacion', 'regional', 'habilitado_portal')
 ORDER BY TABLE_NAME, COLUMN_NAME;
