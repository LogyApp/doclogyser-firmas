-- Facturación › Recibos: los filtros de Año / Mes / Quincena / Día usan la fecha del servicio más reciente
-- del recibo (MAX(Dynamic_Servicios.`Hora Inicio`), la misma fecha que filtra la pestaña Servicios) y no
-- la Fecha de Dynamic_Recibos (fecha en que se creó el recibo).
--
-- 1. Columna Dynamic_Recibos.`Fecha Servicio` (+ índices) = MAX(`Hora Inicio`) de sus servicios;
--    si el recibo no tiene servicios, se usa su Fecha.
-- 2. Triggers en Dynamic_Servicios (insertar, editar Hora Inicio o IdRecibo, borrar) que la recalculan,
--    para que quede al día sin importar desde dónde se guarde el servicio (app o AppSheet).
--    Triggers en Dynamic_Recibos que la llenan al crear el recibo y si cambia la Fecha de un recibo sin servicios.
--    Los triggers de logueo existentes no registran esta columna.
-- 3. Llenado inicial por meses, solo de los recibos que la tienen vacía.
-- Solo agrega una columna, índices y triggers propios. Se puede ejecutar más de una vez.

-- 1. Columna e índices
DROP PROCEDURE IF EXISTS mig_recibos_fecha_servicio_columna;
DELIMITER $$
CREATE PROCEDURE mig_recibos_fecha_servicio_columna()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Recibos' AND COLUMN_NAME = 'Fecha Servicio') THEN
    ALTER TABLE Dynamic_Recibos ADD COLUMN `Fecha Servicio` DATETIME NULL AFTER Fecha;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Recibos' AND INDEX_NAME = 'idx_dr_fecha_servicio') THEN
    ALTER TABLE Dynamic_Recibos ADD INDEX idx_dr_fecha_servicio (`Fecha Servicio`);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Recibos' AND INDEX_NAME = 'idx_dr_operacion_fecha_servicio') THEN
    ALTER TABLE Dynamic_Recibos ADD INDEX idx_dr_operacion_fecha_servicio (`Operación`, `Fecha Servicio`);
  END IF;
END$$
DELIMITER ;
CALL mig_recibos_fecha_servicio_columna();
DROP PROCEDURE IF EXISTS mig_recibos_fecha_servicio_columna;

-- 2. Triggers
DROP TRIGGER IF EXISTS bi_recibos_fecha_servicio;
DELIMITER $$
CREATE TRIGGER bi_recibos_fecha_servicio BEFORE INSERT ON Dynamic_Recibos FOR EACH ROW
BEGIN
  IF NEW.`Fecha Servicio` IS NULL THEN
    SET NEW.`Fecha Servicio` = NEW.Fecha;
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS bu_recibos_fecha_servicio;
DELIMITER $$
CREATE TRIGGER bu_recibos_fecha_servicio BEFORE UPDATE ON Dynamic_Recibos FOR EACH ROW
BEGIN
  IF NOT (NEW.Fecha <=> OLD.Fecha)
     AND NOT EXISTS (SELECT 1 FROM Dynamic_Servicios WHERE IdRecibo = NEW.IdRecibo) THEN
    SET NEW.`Fecha Servicio` = NEW.Fecha;
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS ai_servicios_fecha_recibo;
DELIMITER $$
CREATE TRIGGER ai_servicios_fecha_recibo AFTER INSERT ON Dynamic_Servicios FOR EACH ROW
BEGIN
  UPDATE Dynamic_Recibos dr
     SET dr.`Fecha Servicio` = COALESCE((SELECT MAX(`Hora Inicio`) FROM Dynamic_Servicios WHERE IdRecibo = NEW.IdRecibo), dr.Fecha)
   WHERE dr.IdRecibo = NEW.IdRecibo;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS au_servicios_fecha_recibo;
DELIMITER $$
CREATE TRIGGER au_servicios_fecha_recibo AFTER UPDATE ON Dynamic_Servicios FOR EACH ROW
BEGIN
  IF NOT (NEW.`Hora Inicio` <=> OLD.`Hora Inicio`) OR NOT (NEW.IdRecibo <=> OLD.IdRecibo) THEN
    UPDATE Dynamic_Recibos dr
       SET dr.`Fecha Servicio` = COALESCE((SELECT MAX(`Hora Inicio`) FROM Dynamic_Servicios WHERE IdRecibo = NEW.IdRecibo), dr.Fecha)
     WHERE dr.IdRecibo = NEW.IdRecibo;
    IF NOT (NEW.IdRecibo <=> OLD.IdRecibo) THEN
      UPDATE Dynamic_Recibos dr
         SET dr.`Fecha Servicio` = COALESCE((SELECT MAX(`Hora Inicio`) FROM Dynamic_Servicios WHERE IdRecibo = OLD.IdRecibo), dr.Fecha)
       WHERE dr.IdRecibo = OLD.IdRecibo;
    END IF;
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS ad_servicios_fecha_recibo;
DELIMITER $$
CREATE TRIGGER ad_servicios_fecha_recibo AFTER DELETE ON Dynamic_Servicios FOR EACH ROW
BEGIN
  UPDATE Dynamic_Recibos dr
     SET dr.`Fecha Servicio` = COALESCE((SELECT MAX(`Hora Inicio`) FROM Dynamic_Servicios WHERE IdRecibo = OLD.IdRecibo), dr.Fecha)
   WHERE dr.IdRecibo = OLD.IdRecibo;
END$$
DELIMITER ;

-- 3. Llenado inicial, un mes de Fecha de recibo a la vez (para no bloquear la tabla mucho tiempo)
DROP PROCEDURE IF EXISTS mig_recibos_fecha_servicio_llenar;
DELIMITER $$
CREATE PROCEDURE mig_recibos_fecha_servicio_llenar()
BEGIN
  DECLARE vDesde DATE;
  DECLARE vFin DATE;
  SELECT DATE_FORMAT(MIN(Fecha), '%Y-%m-01'), MAX(Fecha) INTO vDesde, vFin
    FROM Dynamic_Recibos WHERE `Fecha Servicio` IS NULL;
  WHILE vDesde IS NOT NULL AND vDesde <= vFin DO
    UPDATE Dynamic_Recibos dr
      LEFT JOIN (SELECT ds.IdRecibo, MAX(ds.`Hora Inicio`) AS mx
                   FROM Dynamic_Servicios ds
                   JOIN Dynamic_Recibos r ON r.IdRecibo = ds.IdRecibo
                  WHERE r.Fecha >= vDesde AND r.Fecha < DATE_ADD(vDesde, INTERVAL 1 MONTH)
                  GROUP BY ds.IdRecibo) s ON s.IdRecibo = dr.IdRecibo
       SET dr.`Fecha Servicio` = COALESCE(s.mx, dr.Fecha)
     WHERE dr.`Fecha Servicio` IS NULL
       AND dr.Fecha >= vDesde AND dr.Fecha < DATE_ADD(vDesde, INTERVAL 1 MONTH);
    SET vDesde = DATE_ADD(vDesde, INTERVAL 1 MONTH);
  END WHILE;
  -- Recibos sin Fecha
  UPDATE Dynamic_Recibos dr
     SET dr.`Fecha Servicio` = (SELECT MAX(`Hora Inicio`) FROM Dynamic_Servicios WHERE IdRecibo = dr.IdRecibo)
   WHERE dr.`Fecha Servicio` IS NULL AND dr.Fecha IS NULL;
END$$
DELIMITER ;
CALL mig_recibos_fecha_servicio_llenar();
DROP PROCEDURE IF EXISTS mig_recibos_fecha_servicio_llenar;

SELECT COUNT(*) AS recibos,
       SUM(`Fecha Servicio` IS NULL) AS sin_fecha_servicio,
       SUM(DATE(`Fecha Servicio`) <> DATE(Fecha)) AS fecha_distinta
  FROM Dynamic_Recibos;
