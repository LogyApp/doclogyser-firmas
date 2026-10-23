-- Reglas de la pestaña Actas (módulo Inventario). Antes estaban fijas en el código
-- (actas.js, actasExpiryNotifier.js, inventario.js e index.html). Se puede ejecutar más de una
-- vez: solo inserta las filas que todavía no existen. Requiere la columna Descripcion
-- (2026-10-23_config_parametros_descripcion.sql). Las categorías del acceso restringido usan
-- la fila existente de inventario / General.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Actas', 'Habilitar notificaciones de correo en Actas', 'Booleano', '1',
       'Interruptor: 1 envía al trabajador el correo con el enlace para firmar el acta, 0 lo suspende (el enlace igual se puede copiar o enviar por WhatsApp).'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Actas' AND Concepto = 'Habilitar notificaciones de correo en Actas');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Actas', 'Roles que pueden editar actas firmadas', 'Rol', 'Sistema',
       'Roles que pueden cambiar los artículos o la foto de evidencia de un acta que ya no está Pendiente. Los demás solo editan actas Pendientes.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Actas' AND Concepto = 'Roles que pueden editar actas firmadas');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Actas', 'Roles que pueden regenerar PDF de actas', 'Rol', 'Sistema, Inventario',
       'Roles que ven el botón Regenerar PDF en las actas firmadas.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Actas' AND Concepto = 'Roles que pueden regenerar PDF de actas');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Actas', 'Roles que pueden gestionar la lógica de abastecimiento', 'Rol', 'Sistema, Inventario, AdmSst',
       'Roles que ven y editan la subpestaña Lógica de Abastecimiento (dotación y EPP por cargo).'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Actas' AND Concepto = 'Roles que pueden gestionar la lógica de abastecimiento');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Actas', 'Horas de vigencia del enlace de firma de actas', 'Número', '48',
       'Horas que dura el enlace para firmar un acta. Al vencer, la tarea automática genera el PDF "sin firma". También aplica a "Solicitar firma nuevamente".'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Actas' AND Concepto = 'Horas de vigencia del enlace de firma de actas');

-- Verificación
SELECT id, Concepto, Condicion, Parametro, Descripcion FROM Config_Parametros
WHERE Modulo = 'inventario' AND Seccion = 'Actas' ORDER BY id;
