-- Consignaciones: se quita la lógica de AppSheet que quedaba en la base de datos.
-- La pestaña Contabilidad › Consignaciones arma los días a partir de los servicios en efectivo y
-- crea la fila de Maestro_Consignaciones solo cuando alguien registra la consignación, así que ya
-- no hace falta que la base cree filas vacías por cada servicio en efectivo.
--
-- Qué se elimina (no se pierden datos: son lógica, no información):
--   1. Trigger after_insert_dynamic_servicios (Dynamic_Servicios AFTER INSERT): por cada servicio en
--      efectivo hacía INSERT IGNORE de una fila vacía en Maestro_Consignaciones (Usuario 'Sistema').
--   2. Vista vista_consignaciones_appsheet: la usaba solo AppSheet (ventas diarias en efectivo y
--      saldo por quincena de los últimos 45 días).
-- Las filas que ya existen en Maestro_Consignaciones NO se tocan.
-- Confirmado por William el 2026-11-12. Se puede ejecutar más de una vez.

DROP TRIGGER IF EXISTS after_insert_dynamic_servicios;
DROP VIEW IF EXISTS vista_consignaciones_appsheet;

-- Verificación (debe devolver 0 y 0)
SELECT
  (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = 'after_insert_dynamic_servicios') AS trigger_queda,
  (SELECT COUNT(*) FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vista_consignaciones_appsheet') AS vista_queda;

-- ─────────────────────────────────────────────────────────────────────────────
-- RESPALDO: definiciones originales, por si hubiera que restaurarlas.
-- ─────────────────────────────────────────────────────────────────────────────
-- DELIMITER //
-- CREATE TRIGGER after_insert_dynamic_servicios AFTER INSERT ON Dynamic_Servicios FOR EACH ROW
-- BEGIN
--     DECLARE fecha_servicio DATE;
--     DECLARE pequeño_uuid VARCHAR(8);
--     DECLARE v_operacion VARCHAR(50);
--     IF NEW.`Forma De Pago` = 1 THEN
--         SET fecha_servicio = DATE(NEW.`Hora Inicio`);
--         SET pequeño_uuid = LOWER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 8));
--         SELECT Operación INTO v_operacion FROM Desplegables.Dynamic_Recibos WHERE IdRecibo = NEW.IdRecibo LIMIT 1;
--         INSERT IGNORE INTO Desplegables.Maestro_Consignaciones (`Id`, `Día`, `Operación`, `Usuario`)
--         VALUES (pequeño_uuid, fecha_servicio, v_operacion, 'Sistema');
--     END IF;
-- END //
-- DELIMITER ;
--
-- CREATE VIEW vista_consignaciones_appsheet AS
-- with `VentasDiarias` as (select `operacion`, `dia`, sum(`total`) AS `valor_dia`, count(0) AS `registros_dia`,
--   concat(month(`dia`),'. ',(case month(`dia`) when 1 then 'Enero' when 2 then 'Febrero' when 3 then 'Marzo' when 4 then 'Abril'
--   when 5 then 'Mayo' when 6 then 'Junio' when 7 then 'Julio' when 8 then 'Agosto' when 9 then 'Septiembre' when 10 then 'Octubre'
--   when 11 then 'Noviembre' when 12 then 'Diciembre' end), if((dayofmonth(`dia`) > 15),' Q2',' Q1')) AS `quincena`
--   from `vista_servicios_appsheet` where `forma_de_pago` = 1 and `dia` >= (curdate() - interval 45 day) group by `operacion`, `dia`),
-- `SaldosQuincena` as (select `v`.`quincena`, `v`.`operacion`, sum(`v`.`valor_dia`) AS `total_ventas_q`,
--   coalesce((select sum(`m`.`Valor Consignado`) from `Maestro_Consignaciones` `m` where `m`.`Quincena` = `v`.`quincena` and `m`.`Operación` = `v`.`operacion`),0) AS `total_consignado_q`,
--   max(`v`.`dia`) AS `ultimo_dia_q` from `VentasDiarias` `v` group by `v`.`quincena`, `v`.`operacion`)
-- select coalesce(nullif(`mc`.`Id`,''),'Validar') AS `id`, `vd`.`operacion`, `mc`.`Fase` AS `fase`, `vd`.`dia`, `vd`.`quincena`,
--   round(`vd`.`valor_dia`,2) AS `valor_dia`,
--   (case when `vd`.`dia` = `sq`.`ultimo_dia_q` then round(`sq`.`total_ventas_q` - `sq`.`total_consignado_q`,2) else 0 end) AS `pendiente`,
--   `vd`.`registros_dia` AS `registros`, `mc`.`Fecha consignación` AS `fecha_consignacion`, `mc`.`Valor Consignado` AS `valor_consignado`,
--   `mc`.`Foto Consignación` AS `foto_consignacion`, `mc`.`Usuario` AS `usuario`
-- from `VentasDiarias` `vd`
-- left join `Maestro_Consignaciones` `mc` on `mc`.`Día` = `vd`.`dia` and `mc`.`Operación` = `vd`.`operacion`
-- left join `SaldosQuincena` `sq` on `sq`.`quincena` = `vd`.`quincena` and `sq`.`operacion` = `vd`.`operacion`;
