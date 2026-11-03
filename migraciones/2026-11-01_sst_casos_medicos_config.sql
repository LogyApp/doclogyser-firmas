-- SST > Casos Médicos: permisos en Config_Parametros (antes fijos en el código), aviso diario
-- por correo de casos en alerta y registro de tareas diarias.
--   * Permisos (sst / Casos Medicos): los valores son los roles que tenía el código, así que
--     nada cambia hasta que se editen. Quien creó el caso siempre puede editarlo, eliminarlo
--     y gestionar sus actas.
--   * Resumen diario (7:00 AM) a los roles configurados con los casos abiertos con
--     recomendaciones por vencer o vencidas, o con más de 15 días sin seguimiento.
--   * Log_tareas_diarias: marca que una tarea diaria ya corrió hoy, para que no se repita
--     cuando hay varias instancias de la app (digital-logyser y nomina-logyser).
-- Se puede ejecutar más de una vez.

CREATE TABLE IF NOT EXISTS Log_tareas_diarias (
  tarea      VARCHAR(80) NOT NULL,
  fecha      DATE        NOT NULL,
  ejecutada  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tarea, fecha)
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Roles que pueden crear casos médicos', 'Rol', 'Sistema, AdmSst, LiderSst',
       'Roles que ven el botón "+ Agregar Caso Médico" y pueden registrar casos médicos nuevos. Si se deja vacío, nadie puede crear.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Roles que pueden crear casos médicos');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Roles que pueden editar cualquier caso médico y regenerar sus actas', 'Rol', 'Sistema, AdmSst, LiderSst',
       'Roles que pueden editar cualquier caso médico y regenerar el PDF de sus actas firmadas. Quien creó el caso siempre puede editarlo. Si se deja vacío, solo el creador.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Roles que pueden editar cualquier caso médico y regenerar sus actas');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Roles que pueden eliminar cualquier caso médico o seguimiento', 'Rol', 'Sistema, AdmSst, LiderSst',
       'Roles que pueden eliminar cualquier caso médico o registro de la bitácora. Quien lo creó siempre puede eliminarlo. Si se deja vacío, solo el creador.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Roles que pueden eliminar cualquier caso médico o seguimiento');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Roles que pueden registrar seguimientos en la bitácora de casos médicos', 'Rol', 'Sistema, AdmSst, LiderSst, AnaSst, AuxSst',
       'Roles que pueden agregar seguimientos en la bitácora de un caso médico. Si se deja vacío, nadie puede.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Roles que pueden registrar seguimientos en la bitácora de casos médicos');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Roles que pueden generar y enviar enlaces de firma de actas de casos médicos', 'Rol', 'Sistema, AdmSst, LiderSst',
       'Roles que pueden generar, copiar y enviar (WhatsApp o correo) el enlace de firma de las actas de apertura y cierre. Quien creó el caso siempre puede. Si se deja vacío, solo el creador.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Roles que pueden generar y enviar enlaces de firma de actas de casos médicos');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Habilitar notificaciones de correo en Casos Médicos', 'Booleano', '1',
       'Con 1 se envía cada día a las 7:00 AM el resumen de casos médicos abiertos con recomendaciones por vencer o vencidas, o con más de 15 días sin seguimiento. Con 0 (o si no existe la fila) no se envía.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Habilitar notificaciones de correo en Casos Médicos');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Casos Medicos', 'Roles que reciben el resumen diario de alertas de casos médicos', 'Rol', 'LiderSst, AdmSst',
       'Roles cuyos usuarios (Email de Maestro_Usuarios) reciben el resumen diario de casos médicos en alerta. Si se deja vacío, no se envía a nadie.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' AND Concepto = 'Roles que reciben el resumen diario de alertas de casos médicos');

-- Verificación
SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Casos Medicos' ORDER BY Concepto;
SELECT COUNT(*) AS tabla_log_tareas FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Log_tareas_diarias';
