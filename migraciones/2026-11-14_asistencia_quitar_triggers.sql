-- Quita los triggers que rellenaban Nuevo y Retirado en Dynamic_Asistencia. Ahora lo hace el código
-- (src/services/rellenoAsistencia.js), que además acomoda los días cuando corrigen la fecha de ingreso,
-- de retiro o de traslado. EJECUTAR SOLO CON CONFIRMACIÓN DE WILLIAM, después de probar la rama.
--   trg_MaestroVinculacion_AfterInsert       → "Nuevo" al crear la vinculación
--   trg_MaestroVinculacion_AfterUpdate_Retiro → "Retirado" al pasar el estado a Retirado
-- No se pierden datos: solo se quita la regla. Copia de su definición en
-- migraciones/respaldos/2026-11-14_triggers_relleno_asistencia.sql (para volver a crearlos si hiciera falta).
-- También enciende la revisión cada hora del relleno. Se puede ejecutar más de una vez.

DROP TRIGGER IF EXISTS trg_MaestroVinculacion_AfterInsert;
DROP TRIGGER IF EXISTS trg_MaestroVinculacion_AfterUpdate_Retiro;

UPDATE Config_Parametros SET Parametro = 'SI'
 WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Relleno_Automatico_Periodico';

SELECT TRIGGER_NAME FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME IN ('trg_MaestroVinculacion_AfterInsert', 'trg_MaestroVinculacion_AfterUpdate_Retiro');
