-- Índice para la campanita de notificaciones (Maestro_notificaciones): cada pestaña la consulta cada minuto con
-- WHERE usuario_id = ? AND modulo = ? ORDER BY fecha_creacion DESC (notificacionesService.obtenerNotificacionesUsuario).
-- Con este índice MySQL ya no ordena las filas aparte. Solo agrega el índice si no existe; se puede ejecutar más de una vez.

SET @existe := (SELECT COUNT(*) FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Maestro_notificaciones' AND INDEX_NAME = 'idx_notif_user_mod_fecha');
SET @sql := IF(@existe = 0,
  'ALTER TABLE Maestro_notificaciones ADD INDEX idx_notif_user_mod_fecha (usuario_id, modulo, fecha_creacion)',
  'SELECT ''El índice idx_notif_user_mod_fecha ya existe'' AS aviso');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

EXPLAIN SELECT id FROM Maestro_notificaciones WHERE usuario_id = 'Sistema' AND modulo = 'evaluacionsst' ORDER BY fecha_creacion DESC, id DESC LIMIT 50;
