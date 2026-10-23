-- Reglas de la pestaña Dotación de Ley (módulo Inventario). Antes estaban fijas en el código
-- (dotacionley.js, la vista vista_dotacion_ley e index.html). Se puede ejecutar más de una vez:
-- solo inserta las filas que todavía no existen. Requiere la columna Descripcion
-- (2026-10-23_config_parametros_descripcion.sql). La vista vista_dotacion_ley ya no la usa el
-- código; se deja quieta por ahora y se puede eliminar más adelante.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Dotación de Ley', 'Habilitar notificaciones de correo en Dotación de Ley', 'Booleano', '1',
       'Interruptor: 1 permite enviar al trabajador el correo con sus tallas (individual y masivo), 0 lo suspende y oculta esos botones (WhatsApp sigue disponible).'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Dotación de Ley' AND Concepto = 'Habilitar notificaciones de correo en Dotación de Ley');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Dotación de Ley', 'Meses entre entregas de dotación de ley', 'Número', '4',
       'Cada cuántos meses, contados desde el mes de ingreso, le toca dotación al trabajador (1 a 12). En su mes de ingreso solo aplica desde el año siguiente.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Dotación de Ley' AND Concepto = 'Meses entre entregas de dotación de ley');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Dotación de Ley', 'Regionales que reciben botas en la dotación de ley', 'Regional', 'ANTIOQUIA, CARIBE',
       'Regionales cuyos trabajadores reciben botas al enviar la dotación de ley al Kardex. Vacío = ninguna regional recibe botas.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Dotación de Ley' AND Concepto = 'Regionales que reciben botas en la dotación de ley');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Dotación de Ley', 'Regional de origen de la dotación de ley', 'Regional', 'ANTIOQUIA',
       'Regional desde la que salen las transferencias que genera "Enviar Dotación de Ley" en el Kardex.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Dotación de Ley' AND Concepto = 'Regional de origen de la dotación de ley');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Dotación de Ley', 'Operación de origen de la dotación de ley', 'Operación', 'Administracion',
       'Operación (bodega) desde la que salen las transferencias que genera "Enviar Dotación de Ley" en el Kardex.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Dotación de Ley' AND Concepto = 'Operación de origen de la dotación de ley');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Dotación de Ley', 'Roles que pueden enviar la dotación de ley al Kardex', 'Rol', 'Sistema, Inventario',
       'Roles que ven el botón "Enviar Dotación de Ley" y pueden generar las filas de transferencia en el Kardex (solo de las regionales/operaciones de su acceso).'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Dotación de Ley' AND Concepto = 'Roles que pueden enviar la dotación de ley al Kardex');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Dotación de Ley', 'Cargos que llevan número de buzo', 'Cargo', 'AUXILIAR LOGISTICO',
       'Cargos a los que se les informa el número de buzo en el correo y el WhatsApp de dotación de ley.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Dotación de Ley' AND Concepto = 'Cargos que llevan número de buzo');

-- Verificación
SELECT id, Concepto, Condicion, Parametro, Descripcion FROM Config_Parametros
WHERE Modulo = 'inventario' AND Seccion = 'Dotación de Ley' ORDER BY id;
