-- Respaldo (2026-11-14) de los triggers de relleno de asistencia que se reemplazan por
-- src/services/rellenoAsistencia.js. Para volver a crearlos, ejecutar este archivo completo.
DELIMITER $$
DROP TRIGGER IF EXISTS `trg_MaestroVinculacion_AfterInsert`$$
CREATE TRIGGER `trg_MaestroVinculacion_AfterInsert` AFTER INSERT ON `Maestro_Vinculación` FOR EACH ROW
BEGIN
    DECLARE var_quincena VARCHAR(50);
    DECLARE var_anio INT;
    DECLARE var_fecha_minima DATE;
    DECLARE var_nuevo_id VARCHAR(50);

    IF NEW.`Estado` = 'Activo' THEN
        
        -- Obtener contexto de fechas
        SELECT `Quincena`, `Año` INTO var_quincena, var_anio
        FROM `Maestro_Fechas`
        WHERE `Fecha` = NEW.`Fecha de Ingreso` LIMIT 1;

        SELECT MIN(`Fecha`) INTO var_fecha_minima
        FROM `Maestro_Fechas`
        WHERE `Quincena` = var_quincena AND `Año` = var_anio;

        -- Lógica: Solo si hay días previos en la quincena
        IF var_fecha_minima IS NOT NULL AND var_fecha_minima < NEW.`Fecha de Ingreso` THEN
            
            SET var_nuevo_id = UUID();

            -- Inserción limpia
            INSERT INTO `Dynamic_Registro_Asistencia` (
                `IdRegistro`, `Operación`, `Area`, `Evento`, `Novedad`,
                `Apoyo de Otra Operación`, `Trabajador2`, `Día`, `Fecha Final`,
                `Origen`, `Fecha Registro`, `Usuario`, `Disponible`
            )
            VALUES (
                var_nuevo_id, NEW.`Operación`, NEW.`Area`, 'Novedad', 'Nuevo',
                'NO', NEW.`Trabajador`, var_fecha_minima,
                DATE_SUB(NEW.`Fecha de Ingreso`, INTERVAL 1 DAY),
                NEW.`Operación`, CONVERT_TZ(NOW(), 'SYSTEM', '-05:00'), 'Sistema', 0
            );

            -- LLAMADA AL PROCEDIMIENTO ESPECIALIZADO
            CALL Desplegables.procesar_nuevo_retiro(var_nuevo_id);

        END IF;
    END IF;
END$$
DROP TRIGGER IF EXISTS `trg_MaestroVinculacion_AfterUpdate_Retiro`$$
CREATE TRIGGER `trg_MaestroVinculacion_AfterUpdate_Retiro` AFTER UPDATE ON `Maestro_Vinculación` FOR EACH ROW
BEGIN
    DECLARE var_quincena VARCHAR(50);
    DECLARE var_anio INT;
    DECLARE var_fecha_maxima DATE;

    -- Solo si el estado cambia a Retirado
    IF NEW.`Estado` = 'Retirado' AND (OLD.`Estado` <> 'Retirado' OR OLD.`Estado` IS NULL) THEN
        
        SELECT `Quincena`, `Año` INTO var_quincena, var_anio
        FROM `Maestro_Fechas`
        WHERE `Fecha` = NEW.`Fecha de Retiro` LIMIT 1;

        SELECT MAX(`Fecha`) INTO var_fecha_maxima
        FROM `Maestro_Fechas`
        WHERE `Quincena` = var_quincena AND `Año` = var_anio;

        IF var_fecha_maxima IS NOT NULL AND var_fecha_maxima > NEW.`Fecha de Retiro` THEN
            
            INSERT INTO `Dynamic_Registro_Asistencia` (
                `IdRegistro`, `Operación`, `Area`, `Evento`, `Novedad`,
                `Apoyo de Otra Operación`, `Trabajador2`, `Día`, `Fecha Final`,
                `Origen`, `Fecha Registro`, `Usuario`, `Disponible`
            )
            VALUES (
                UUID(),
                NEW.`Operación`,
                NEW.`Area`,
                'Novedad',
                'Retirado',
                'NO',
                NEW.`Trabajador`,
                DATE_ADD(NEW.`Fecha de Retiro`, INTERVAL 1 DAY),
                var_fecha_maxima,
                NEW.`Operación`,
                CONVERT_TZ(NOW(), 'SYSTEM', '-05:00'),
                NEW.`Usuario`,
                0 -- Al dejarlo en 0, el trigger 'desencadenar_procesamiento_asistencia' actuará solo
            );

            -- QUITAMOS EL CALL DE AQUÍ PARA EVITAR EL DOBLE PROCESO EN APPSHEET
        END IF;
    END IF;
END$$
DELIMITER ;
