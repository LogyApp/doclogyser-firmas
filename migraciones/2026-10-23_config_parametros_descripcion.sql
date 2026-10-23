-- Columna Descripcion en Config_Parametros: breve explicación de para qué sirve cada fila.
-- Se puede ejecutar más de una vez:
--  - la columna solo se crea si no existe;
--  - cada descripción solo se escribe si la fila existe y su Descripcion está vacía
--    (no sobrescribe lo que se haya editado a mano).
-- Si más adelante se ejecuta una migración que agrega filas de esta lista, basta con
-- volver a correr este archivo para llenar su descripción.

SET @col_desc = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Config_Parametros' AND COLUMN_NAME = 'Descripcion'
);
SET @sql_desc = IF(@col_desc = 0,
  'ALTER TABLE `Config_Parametros` ADD COLUMN `Descripcion` VARCHAR(500) NULL AFTER `Parametro`',
  'SELECT 1'
);
PREPARE stmt_desc FROM @sql_desc;
EXECUTE stmt_desc;
DEALLOCATE PREPARE stmt_desc;

-- ── talenthub / Integridad
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden crear procesos nuevos en la pestaña Integridad (botón Administrar Identificación).'
WHERE Modulo = 'talenthub' AND Seccion = 'Integridad' AND Concepto = 'Agregar Registros a Integridad' AND (Descripcion IS NULL OR Descripcion = '');

-- ── talenthub / Requisiciones
UPDATE Config_Parametros SET Descripcion = 'Días calendario que tiene Selección para que el aspirante ingrese; se usa para calcular el cumplimiento SLA.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Tiempo limite de Requisición' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden modificar una requisición después de creada.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Editar Requisición despues de guardar' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que aparecen como responsables de Selección y que pueden vincular aspirantes a una requisición.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Responsables area de Selección' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden asignar el responsable de Selección cuando la requisición aún no tiene uno.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Escoger responsables area de Selección en Requisición' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden cambiar el responsable de Selección que ya estaba asignado.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Editar responsables area de Selección en Requisición' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que ven y editan el salario de la requisición (también sale en el reporte solo para ellos).'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Editar y ver Salario en Requisición' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que ven el botón Parámetros de Requisiciones y pueden modificar estos valores desde la pantalla.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Editar parametros de Requisiciones' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que al abrir Requisiciones ven todo el historial; al resto se le filtra por defecto desde la quincena actual.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'No aplica el filtro de FECHA DESDE' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden pedir cualquier cargo (operativos y administrativos) en una requisición.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Puede escoger todos los cargos en la Requisición' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que solo pueden pedir cargos del grupo Administrativo. Los demás roles solo ven cargos Operativos.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Puede escoger cargos administrativos en la Requisición' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden cambiar el estado de una requisición (En proceso, Suspendido, Finalizado, Cancelado).'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Modificar Estado en Requisición' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden modificar la fecha de finalización de una requisición.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Modificar Fecha Fin en Requisición' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden volver a abrir una requisición Finalizada o Cancelada.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Reabrir Requisición Finalizada o Cancelada' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que reciben el correo de nueva requisición cuando es de la regional Antioquia.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Notificación de Requisición, regional Antioquia' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que reciben el correo de nueva requisición cuando es de la regional Centro.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Notificación de Requisición, regional Centro' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que reciben el correo de nueva requisición de las demás regionales (AuxiliarR solo si es de su regional).'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Notificación de Requisición, otras regionales' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Interruptor: 1 envía los correos de Requisiciones, 0 los suspende.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Habilitar notificicaciones de correo en Requisiciones' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Porcentaje mínimo de aspirantes contratados a tiempo para que el SLA salga en verde.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Porcentaje semáforo verde SLA' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Porcentaje mínimo para que el SLA salga en amarillo; por debajo sale en rojo.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Porcentaje semáforo amarillo SLA' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Hora (HH:mm): si la requisición se registra después de esta hora, el conteo del SLA empieza al día siguiente hábil.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Hora de corte inicio conteo SLA' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Máximo de filas para descargar el reporte de Requisiciones en Excel; si pasa, solo se permite CSV.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Límite de filas reporte Excel - Requisiciones' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Máximo de filas para descargar el reporte de Requisiciones en CSV.'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Límite de filas reporte CSV - Requisiciones' AND (Descripcion IS NULL OR Descripcion = '');

-- ── talenthub / Sociodemografica
UPDATE Config_Parametros SET Descripcion = 'Roles que reciben el correo de nuevo ingreso cuando el cargo tiene Notificar = 1 en Config_Cargo_Laboral.'
WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Notificación de ingreso grupo 1 - Para:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que reciben el correo de nuevo ingreso cuando el cargo tiene Notificar = 2 en Config_Cargo_Laboral.'
WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Notificación de ingreso grupo 2 - Para:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que reciben el correo de nuevo ingreso cuando el cargo tiene Notificar = 3 (se resuelven por la Operación).'
WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Notificación de ingreso grupo 3 - Para:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles en copia del correo de nuevo ingreso. Quien finaliza la contratación siempre va en copia.'
WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Notificación de ingreso - Copia:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Interruptor: 1 envía los correos de nuevo ingreso, 0 los suspende.'
WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Habilitar notificaciones de correo en Ingresos' AND (Descripcion IS NULL OR Descripcion = '');

-- ── nomina / Cesantias
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden anular una solicitud de cesantías.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Puede anular registros de Cesantias' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden rechazar una solicitud de cesantías.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Puede rechazar registros de Cesantias' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden aprobar una solicitud de cesantías.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Puede aprobar registros de Cesantias' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden validar (primera revisión) una solicitud de cesantías.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Puede validar registros de Cesantias' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden eliminar una solicitud de cesantías.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Puede eliminar registros de Cesantias' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden marcar una solicitud de cesantías como tramitada.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Puede tramitar registros de Cesantias' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden devolver una solicitud de cesantías para corrección.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Puede devolver registros de Cesantias' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Días que dura el enlace de firma que se envía al trabajador en Cesantías.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Días de vigencia del enlace de firma' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Tamaño máximo, en MB, de cada soporte que se adjunta a una solicitud de cesantías.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Tamaño máximo de soportes (MB)' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Interruptor: 1 envía los correos de Cesantías, 0 los suspende.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Habilitar notificicaciones de correo en Cesantias' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Operaciones cuyas solicitudes de cesantías saltan el paso de Validación (pasan directo a aprobación).'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Operación no requiere Validacion' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles notificados cuando se registra una solicitud de cesantías en una operación (se resuelven por la Operación).'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Notificación Cesantias registro pendiente Operación' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles notificados cuando se registra una solicitud de una operación que no requiere validación (Administración).'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Notificación Cesantias registro pendiente Adm' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles en copia cuando una solicitud de cesantías es validada.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Notificación Cesantias registro validado' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles en copia cuando una solicitud de cesantías es aprobada.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Notificación Cesantias registro aprobado' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles en copia cuando una solicitud de cesantías es tramitada.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Notificación Cesantias registro tramitado' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles en copia cuando una solicitud de cesantías es devuelta.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Notificación Cesantias registro devuelto' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles en copia cuando una solicitud de cesantías es rechazada.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Notificación Cesantias registro rechazado' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles destinatarios (Para) del correo cuando una solicitud de cesantías es validada.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Notificación Cesantias registro validado - Para:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles destinatarios (Para) del correo cuando una solicitud de cesantías es aprobada.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Notificación Cesantias registro aprobado - Para:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles destinatarios (Para) del correo cuando una solicitud de cesantías es devuelta.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Notificación Cesantias registro devuelto - Para:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles destinatarios (Para) del correo cuando una solicitud de cesantías es rechazada.'
WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Notificación Cesantias registro rechazado - Para:' AND (Descripcion IS NULL OR Descripcion = '');

-- ── nomina / Activos
UPDATE Config_Parametros SET Descripcion = 'Roles destinatarios del correo de Confirmación de Toma de Cargo.'
WHERE Modulo = 'nomina' AND Seccion = 'Activos' AND Concepto = 'Notificación toma de cargo - Para:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles en copia del correo de Toma de Cargo (Auxiliar/Coordinador se resuelven por la Operación).'
WHERE Modulo = 'nomina' AND Seccion = 'Activos' AND Concepto = 'Notificación toma de cargo - Copia:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Máximo de filas para descargar el reporte de Activos en Excel; si pasa, solo se permite CSV.'
WHERE Modulo = 'nomina' AND Seccion = 'Activos' AND Concepto = 'Límite de filas reporte Excel - Activos' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Máximo de filas para descargar el reporte de Activos en CSV.'
WHERE Modulo = 'nomina' AND Seccion = 'Activos' AND Concepto = 'Límite de filas reporte CSV - Activos' AND (Descripcion IS NULL OR Descripcion = '');

-- ── nomina / Retiros
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden generar y gestionar los documentos de retiro en cualquier regional.'
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Puede gestionar documentos de retiro' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que gestionan documentos de retiro solo fuera de la "Regional sin gestión de documentos".'
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Puede gestionar documentos de retiro según regional' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Regionales donde los roles "según regional" solo marcan el retiro; los documentos los gestiona Nómina.'
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Regional sin gestión de documentos' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden modificar un retiro después de registrado.'
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Puede editar retiro registrado' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Operaciones en las que Nómina también debe marcar al trabajador como Retirado.'
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Operación donde Nómina debe marcar Retirado' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden cambiar la fecha de retiro.'
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Puede editar Fecha de Retiro' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden modificar los artículos del Paz y Salvo después de guardado.'
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Puede modificar artículos de Paz y Salvo guardados' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden reenviar el Paz y Salvo a las áreas para que lo firmen.'
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Puede reenviar Paz y Salvo a áreas' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Correo destinatario (Para) de la notificación de retiro.'
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Notificación de retiro - Para:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles en copia de la notificación de retiro (Auxiliar/Coordinador se resuelven por la Operación).'
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Notificación de retiro - Copia:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Cargos del trabajador retirado que agregan en copia a los roles de "Copia cargos administrativos".'
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Cargos con copia administrativa' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles en copia del retiro cuando el cargo está en "Cargos con copia administrativa".'
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Notificación de retiro - Copia cargos administrativos:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Cargos del trabajador retirado que agregan en copia a los roles de "Copia cargos SST".'
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Cargos con copia SST' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles en copia del retiro cuando el cargo está en "Cargos con copia SST".'
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Notificación de retiro - Copia cargos SST:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Interruptor: 1 envía los correos de Retiros, 0 los suspende.'
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Habilitar notificaciones de correo en Retiros' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Máximo de filas para descargar el reporte de Retiros en Excel; si pasa, solo se permite CSV.'
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Límite de filas reporte Excel - Retiros' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Máximo de filas para descargar el reporte de Retiros en CSV.'
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Límite de filas reporte CSV - Retiros' AND (Descripcion IS NULL OR Descripcion = '');

-- ── nomina / Traslados
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden validar una solicitud de traslado.'
WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Puede validar traslados' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden editar la plantilla del documento de traslado.'
WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Puede editar plantilla de traslados' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden ver la vista previa del documento de traslado.'
WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Puede previsualizar documento de traslado' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Horas que dura el enlace de firma del traslado que se envía al trabajador.'
WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Horas de vigencia del enlace de firma' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles destinatarios del correo cuando se registra un traslado.'
WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Notificación nuevo traslado - Para:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles en copia del correo de nuevo traslado. Quien registra va en copia.'
WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Notificación nuevo traslado - Copia:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles en copia del correo que se envía al trabajador para firmar el traslado.'
WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Notificación firma trabajador - Copia:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles destinatarios del correo cuando se genera el documento de traslado firmado.'
WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Notificación documento generado - Para:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles en copia del correo de documento de traslado generado.'
WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Notificación documento generado - Copia:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Cargos del trabajador trasladado que agregan en copia a los roles de "Copia por cargo".'
WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Cargos con copia de Calidad en traslados' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles en copia del traslado cuando el cargo está en "Cargos con copia de Calidad en traslados".'
WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Notificación traslado - Copia por cargo:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Interruptor: 1 envía los correos de Traslados, 0 los suspende.'
WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Habilitar notificaciones de correo en Traslados' AND (Descripcion IS NULL OR Descripcion = '');

-- ── empleado / Inspecciones_Vehiculo
UPDATE Config_Parametros SET Descripcion = 'Cantidad máxima de fotos que el empleado puede adjuntar en una inspección de vehículo (Mi Portal).'
WHERE Modulo = 'empleado' AND Seccion = 'Inspecciones_Vehiculo' AND Concepto = 'Máximo de fotos de evidencia por inspección' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Tamaño máximo, en MB, de cada foto de una inspección de vehículo.'
WHERE Modulo = 'empleado' AND Seccion = 'Inspecciones_Vehiculo' AND Concepto = 'Tamaño máximo por foto de evidencia (MB)' AND (Descripcion IS NULL OR Descripcion = '');

-- ── sst / Inspecciones_Vehiculo
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden registrar inspecciones de vehículos desde el módulo SST.'
WHERE Modulo = 'sst' AND Seccion = 'Inspecciones_Vehiculo' AND Concepto = 'Roles que pueden registrar inspecciones de vehículos en SST' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden eliminar inspecciones de vehículos en el módulo SST.'
WHERE Modulo = 'sst' AND Seccion = 'Inspecciones_Vehiculo' AND Concepto = 'Roles que pueden eliminar inspecciones de vehículos en SST' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Máximo de filas para descargar el reporte de inspecciones en Excel; si pasa, solo se permite CSV.'
WHERE Modulo = 'sst' AND Seccion = 'Inspecciones_Vehiculo' AND Concepto = 'Límite de filas reporte Excel - Inspecciones Vehículos' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Máximo de filas para descargar el reporte de inspecciones en CSV.'
WHERE Modulo = 'sst' AND Seccion = 'Inspecciones_Vehiculo' AND Concepto = 'Límite de filas reporte CSV - Inspecciones Vehículos' AND (Descripcion IS NULL OR Descripcion = '');

-- ── inventario / General
UPDATE Config_Parametros SET Descripcion = 'Categorías que ven los roles con Acceso 4, 5 o 6 en Maestro_Menu_Inventario (todas las pestañas del módulo).'
WHERE Modulo = 'inventario' AND Seccion = 'General' AND Concepto = 'Categorías permitidas en acceso restringido' AND (Descripcion IS NULL OR Descripcion = '');

-- ── inventario / Inventario
UPDATE Config_Parametros SET Descripcion = 'Máximo de filas para descargar el reporte de la pestaña Inventario en Excel; si pasa, solo CSV.'
WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Límite de filas reporte Excel - Inventario' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Máximo de filas para descargar el reporte de la pestaña Inventario en CSV.'
WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Límite de filas reporte CSV - Inventario' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que reciben el correo cuando se confirma el inventario de Activo Fijo. Quien confirma va en copia.'
WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Notificación confirmación inventario ACTIVO FIJO - Para:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que reciben el correo cuando se confirma el inventario de Dotación. Quien confirma va en copia.'
WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Notificación confirmación inventario DOTACIÓN - Para:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que reciben el correo cuando se confirma el inventario de EPP. Quien confirma va en copia.'
WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Notificación confirmación inventario EPP - Para:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que reciben el correo cuando se confirma el inventario de Herramienta. Quien confirma va en copia.'
WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Notificación confirmación inventario HERRAMIENTA - Para:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que reciben el correo cuando se confirma el inventario de Papelería. Quien confirma va en copia.'
WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Notificación confirmación inventario PAPELERIA - Para:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que reciben el correo cuando se confirma el inventario de Tecnología. Quien confirma va en copia.'
WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Notificación confirmación inventario TECNOLOGIA - Para:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Interruptor: 1 envía los correos de Confirmar Inventario, 0 los suspende.'
WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Habilitar notificaciones de correo en Confirmación de Inventario' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que ven el botón Ajustar stock en la pestaña Inventario. Las operaciones las define Maestro_Menu_Inventario.'
WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Roles que pueden ajustar stock' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden editar la placa de un artículo (solo en categorías Recuperables). Vacío = todos.'
WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Roles que pueden editar placa' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Primer mes (AAAA-MM) que se puede escoger en la ventana Confirmar Inventario.'
WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Mes inicial de confirmación de inventario' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Cuántos meses después del actual se pueden escoger al confirmar inventario (0 = hasta el mes actual).'
WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Meses hacia adelante permitidos para confirmar' AND (Descripcion IS NULL OR Descripcion = '');

-- ── inventario / Kardex
UPDATE Config_Parametros SET Descripcion = 'Máximo de filas para descargar el reporte de Kardex en Excel; si pasa, solo se permite CSV.'
WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Límite de filas reporte Excel - Kardex' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Máximo de filas para descargar el reporte de Kardex en CSV.'
WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Límite de filas reporte CSV - Kardex' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden editar un movimiento de Kardex (también los artículos de un pedido pendiente por recibir).'
WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Roles que pueden editar registros de Kardex' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden eliminar movimientos de Kardex (uno a uno o en bloque).'
WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Roles que pueden eliminar registros de Kardex' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden diligenciar la cédula "Asignado A" en Agregar Kardex.'
WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Roles que pueden asignar trabajador en Kardex' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Tipos de movimiento que se pueden registrar en Agregar Kardex (formulario, grilla y Excel).'
WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Tipos de movimiento permitidos en Agregar Kardex' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden transferir a cualquier operación. Los demás solo a su regional o a las "destino permitidas para todos".'
WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Roles que pueden transferir a cualquier operación' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Operaciones a las que cualquier rol puede transferir, aunque sean de otra regional.'
WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Operaciones destino permitidas para todos' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que reciben el correo de transferencia despachada (se resuelven por la Operación destino). Quien despacha va en copia.'
WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Notificación transferencia despachada - Para:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Interruptor: 1 envía el correo de transferencia despachada, 0 lo suspende.'
WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Habilitar notificaciones de correo en Transferencias' AND (Descripcion IS NULL OR Descripcion = '');

-- ── inventario / Pendiente por recibir
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden eliminar un pedido pendiente por recibir junto con sus movimientos de Kardex.'
WHERE Modulo = 'inventario' AND Seccion = 'Pendiente por recibir' AND Concepto = 'Puede eliminar registros pendientes por recibir' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles que pueden generar actas de entrega a los trabajadores asignados al recibir una transferencia. Vacío = todos.'
WHERE Modulo = 'inventario' AND Seccion = 'Pendiente por recibir' AND Concepto = 'Roles que pueden generar actas de entrega al recibir' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Roles en copia del correo de transferencia recibida. El Para es quien despachó; quien recibe va en copia.'
WHERE Modulo = 'inventario' AND Seccion = 'Pendiente por recibir' AND Concepto = 'Notificación transferencia recibida - Copia:' AND (Descripcion IS NULL OR Descripcion = '');
UPDATE Config_Parametros SET Descripcion = 'Interruptor: 1 envía el correo de transferencia recibida, 0 lo suspende.'
WHERE Modulo = 'inventario' AND Seccion = 'Pendiente por recibir' AND Concepto = 'Habilitar notificaciones de correo en Transferencia recibida' AND (Descripcion IS NULL OR Descripcion = '');

-- Verificación: filas que todavía no tienen descripción
SELECT id, Modulo, Seccion, Concepto FROM Config_Parametros
WHERE Descripcion IS NULL OR Descripcion = '' ORDER BY Modulo, Seccion, id;
