-- Fecha por defecto en hora de Bogotá en las 8 tablas que la calculaban con convert_tz(now(), …).
-- now() depende de la zona de la conexión: la app se conecta en -05:00 y la fórmula restaba 5 horas de
-- más. utc_timestamp() no depende de la conexión, así que la hora queda bien desde la app y desde
-- cualquier otra herramienta. Solo cambia el valor por defecto (no toca datos). Se puede ejecutar más de una vez.

ALTER TABLE `Maestro_docTrabajador` ALTER COLUMN `FechaRegistro` SET DEFAULT (convert_tz(utc_timestamp(), '+00:00', '-05:00'));
ALTER TABLE `Maestro_docEmpresa` ALTER COLUMN `FechaRegistro` SET DEFAULT (convert_tz(utc_timestamp(), '+00:00', '-05:00'));
ALTER TABLE `Maestro_pazysalvo` ALTER COLUMN `fecha_creacion` SET DEFAULT (convert_tz(utc_timestamp(), '+00:00', '-05:00'));
ALTER TABLE `Dynamic_Actas` ALTER COLUMN `Fecha_Registro` SET DEFAULT (convert_tz(utc_timestamp(), '+00:00', '-05:00'));
ALTER TABLE `Dynamic_Actas_Items` ALTER COLUMN `Fecha_Registro` SET DEFAULT (convert_tz(utc_timestamp(), '+00:00', '-05:00'));
ALTER TABLE `Maestro_Dotacion_Cargos` ALTER COLUMN `Fecha_Registro` SET DEFAULT (convert_tz(utc_timestamp(), '+00:00', '-05:00'));
ALTER TABLE `Maestro_bitacora_cmedicos` ALTER COLUMN `fecha_registro` SET DEFAULT (convert_tz(utc_timestamp(), '+00:00', '-05:00'));
ALTER TABLE `Panel_Logs` ALTER COLUMN `creado_en` SET DEFAULT (convert_tz(utc_timestamp(), '+00:00', '-05:00'));
