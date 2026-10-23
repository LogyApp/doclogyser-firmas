-- Reglas de la pestaña Pendiente por recibir (módulo Inventario).
-- Ya existía (id 42): 'Puede eliminar registros pendientes por recibir'.
-- Se puede ejecutar más de una vez: solo inserta las filas que todavía no existen.
-- Editar artículos de un pedido usa 'Roles que pueden editar registros de Kardex' (Sección Kardex).

-- Generar actas de entrega al recibir: antes cualquiera con acceso a la pestaña. Se prellenan
-- los roles que hoy tienen la Sección 'pendienteRecibir' en Maestro_Menu_Inventario.
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Pendiente por recibir', 'Roles que pueden generar actas de entrega al recibir', 'Rol', 'AdmSst, AnaSst, Asistencial, AuxInventario, AuxSst, Auxiliar, AuxiliarR, Calidad, Contratación, Control, Coordinador, CoordinadorR, Cuentas, Inventario, LiderSst, Sistema'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Pendiente por recibir' AND Concepto = 'Roles que pueden generar actas de entrega al recibir');

-- Correo de transferencia recibida: Para = quien despachó; Copia = estos roles + quien recibe.
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Pendiente por recibir', 'Notificación transferencia recibida - Copia:', 'Rol', 'Sistema'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Pendiente por recibir' AND Concepto = 'Notificación transferencia recibida - Copia:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Pendiente por recibir', 'Habilitar notificaciones de correo en Transferencia recibida', 'Booleano', '1'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Pendiente por recibir' AND Concepto = 'Habilitar notificaciones de correo en Transferencia recibida');

-- Verificación
SELECT id, Concepto, Condicion, Parametro FROM Config_Parametros
WHERE Modulo = 'inventario' AND Seccion = 'Pendiente por recibir' ORDER BY id;
