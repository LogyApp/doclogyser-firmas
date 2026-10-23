-- Reglas de la pestaña Solicitudes (módulo Inventario). Antes estaban fijas en el código
-- (solicitudes.js e index.html). Se puede ejecutar más de una vez: solo inserta las filas que
-- todavía no existen. Requiere la columna Descripcion (2026-10-23_config_parametros_descripcion.sql).
-- Aprobadores por categoría: los valores de ACTIVO FIJO, HERRAMIENTA, PAPELERIA y "Otras" unen lo que
-- tenían antes el servidor (Sistema, Cuentas) y la pantalla (Inventario, Cuentas, Sistema).
-- TECNOLOGIA queda en Sistema mientras se ajustan los roles.
-- Las categorías del acceso restringido usan la fila existente de inventario / General.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Roles aprobadores de solicitudes EPP', 'Rol', 'AdmSst, LiderSst, Inventario, Sistema', 'Roles que aprueban, rechazan, devuelven y completan solicitudes de EPP; también editan las que están Pendientes o Parciales.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Roles aprobadores de solicitudes EPP');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Roles aprobadores de solicitudes DOTACIÓN', 'Rol', 'Inventario, Cuentas, Sistema', 'Roles que aprueban, rechazan, devuelven y completan solicitudes de DOTACIÓN; también editan las que están Pendientes o Parciales.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Roles aprobadores de solicitudes DOTACIÓN');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Roles aprobadores de solicitudes TECNOLOGIA', 'Rol', 'Sistema', 'Roles que aprueban, rechazan, devuelven y completan solicitudes de TECNOLOGIA; también editan las que están Pendientes o Parciales.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Roles aprobadores de solicitudes TECNOLOGIA');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Roles aprobadores de solicitudes ACTIVO FIJO', 'Rol', 'Sistema, Cuentas, Inventario', 'Roles que aprueban, rechazan, devuelven y completan solicitudes de ACTIVO FIJO; también editan las que están Pendientes o Parciales.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Roles aprobadores de solicitudes ACTIVO FIJO');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Roles aprobadores de solicitudes HERRAMIENTA', 'Rol', 'Sistema, Cuentas, Inventario', 'Roles que aprueban, rechazan, devuelven y completan solicitudes de HERRAMIENTA; también editan las que están Pendientes o Parciales.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Roles aprobadores de solicitudes HERRAMIENTA');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Roles aprobadores de solicitudes PAPELERIA', 'Rol', 'Sistema, Cuentas, Inventario', 'Roles que aprueban, rechazan, devuelven y completan solicitudes de PAPELERIA; también editan las que están Pendientes o Parciales.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Roles aprobadores de solicitudes PAPELERIA');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Roles aprobadores de solicitudes - Otras categorías', 'Rol', 'Sistema, Cuentas, Inventario', 'Aprobadores de las solicitudes cuya categoría no tiene su propia fila "Roles aprobadores de solicitudes <CATEGORÍA>".'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Roles aprobadores de solicitudes - Otras categorías');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Notificación solicitud EPP - Para:', 'Rol', 'AdmSst, LiderSst, Inventario, Sistema', 'Roles que reciben el correo cuando cambia el estado de una solicitud de EPP. Quien la solicitó también lo recibe.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Notificación solicitud EPP - Para:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Notificación solicitud DOTACIÓN - Para:', 'Rol', 'Inventario, Cuentas, Sistema', 'Roles que reciben el correo cuando cambia el estado de una solicitud de DOTACIÓN. Quien la solicitó también lo recibe.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Notificación solicitud DOTACIÓN - Para:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Notificación solicitud TECNOLOGIA - Para:', 'Rol', 'Sistema', 'Roles que reciben el correo cuando cambia el estado de una solicitud de TECNOLOGIA. Quien la solicitó también lo recibe.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Notificación solicitud TECNOLOGIA - Para:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Notificación solicitud ACTIVO FIJO - Para:', 'Rol', 'Sistema, Cuentas, Inventario', 'Roles que reciben el correo cuando cambia el estado de una solicitud de ACTIVO FIJO. Quien la solicitó también lo recibe.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Notificación solicitud ACTIVO FIJO - Para:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Notificación solicitud HERRAMIENTA - Para:', 'Rol', 'Sistema, Cuentas, Inventario', 'Roles que reciben el correo cuando cambia el estado de una solicitud de HERRAMIENTA. Quien la solicitó también lo recibe.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Notificación solicitud HERRAMIENTA - Para:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Notificación solicitud PAPELERIA - Para:', 'Rol', 'Sistema, Cuentas, Inventario', 'Roles que reciben el correo cuando cambia el estado de una solicitud de PAPELERIA. Quien la solicitó también lo recibe.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Notificación solicitud PAPELERIA - Para:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Notificación solicitud - Otras categorías - Para:', 'Rol', 'Sistema, Cuentas, Inventario', 'Roles que reciben el correo de cambio de estado de las solicitudes cuya categoría no tiene su propia fila de notificación.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Notificación solicitud - Otras categorías - Para:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Notificación solicitud automática - Para:', 'Rol', 'Inventario, Sistema', 'Roles notificados cuando una solicitud automática (nuevo ingreso) pasa a Pendiente o Aprobada; quien hace el cambio también la recibe.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Notificación solicitud automática - Para:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Habilitar notificaciones de correo en Solicitudes', 'Booleano', '1', 'Interruptor: 1 envía los correos de Solicitudes, 0 los suspende.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Habilitar notificaciones de correo en Solicitudes');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Roles que pueden editar solicitudes cerradas', 'Rol', 'Sistema', 'Roles que pueden modificar solicitudes Aprobadas, Completadas o Rechazadas.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Roles que pueden editar solicitudes cerradas');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Roles que pueden eliminar solicitudes', 'Rol', 'Sistema', 'Roles que pueden eliminar una solicitud con sus artículos.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Roles que pueden eliminar solicitudes');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Solicitudes', 'Roles con categoría EPP por defecto en nueva solicitud', 'Rol', 'AdmSst, AnaSst, AuxSst, LiderSst', 'Roles a los que la categoría EPP les aparece marcada al crear una solicitud nueva (solo comodidad, no restringe).'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' AND Concepto = 'Roles con categoría EPP por defecto en nueva solicitud');

-- Verificación
SELECT id, Concepto, Condicion, Parametro, Descripcion FROM Config_Parametros
WHERE Modulo = 'inventario' AND Seccion = 'Solicitudes' ORDER BY id;
