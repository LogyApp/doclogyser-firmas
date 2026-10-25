-- Etapa final de la unificación de permisos: borra las 6 tablas de permisos que reemplazó
-- Maestro_Menu (2026-10-25_maestro_menu.sql). Desde esa fecha ningún módulo las lee
-- y nadie las modificó después de copiarlas (317 filas, comparativo sin diferencias).
--
-- ⚠ BORRA DATOS. Antes de ejecutarla se generó el respaldo completo (estructura + 317 filas):
--   migraciones/respaldos/2026-10-25_respaldo_maestro_menu_anteriores.sql
-- Para restaurarlas, ejecutar ese archivo.
--
-- No toca las otras tablas Maestro_Menu_* (Asistencia, Clientes, Contable, Operativo,
-- Servicios, Sociodemografica, Solicitudes), que son de AppSheet.
-- Se puede ejecutar más de una vez: DROP TABLE IF EXISTS no falla si ya no existen.

DROP TABLE IF EXISTS Maestro_Menu_Documentos;
DROP TABLE IF EXISTS Maestro_Menu_Facturacion;
DROP TABLE IF EXISTS Maestro_Menu_Inventario;
DROP TABLE IF EXISTS Maestro_Menu_Nomina;
DROP TABLE IF EXISTS Maestro_Menu_Sst;
DROP TABLE IF EXISTS Maestro_Menu_Talenthub;

-- Verificación: solo deben quedar Maestro_Menu y las tablas de AppSheet
SHOW TABLES LIKE 'Maestro_Menu%';
