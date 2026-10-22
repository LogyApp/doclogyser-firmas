-- Reglas de la pestaña Kardex (módulo Inventario). Antes estaban fijas en el código
-- (inventario.js e index.html). Se puede ejecutar más de una vez: solo inserta las filas
-- que todavía no existen. Listas separadas por coma; sin distinguir mayúsculas ni tildes.
-- Las operaciones que cada rol puede usar como origen las define Maestro_Menu_Inventario.

-- Editar y eliminar registros de la tabla de Kardex (antes: Inventario y Sistema)
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Kardex', 'Roles que pueden editar registros de Kardex', 'Rol', 'Inventario, Sistema'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Roles que pueden editar registros de Kardex');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Kardex', 'Roles que pueden eliminar registros de Kardex', 'Rol', 'Inventario, Sistema'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Roles que pueden eliminar registros de Kardex');

-- Asignar trabajador (cédula "Asignado A") en Agregar Kardex (antes: Sistema e Inventario)
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Kardex', 'Roles que pueden asignar trabajador en Kardex', 'Rol', 'Sistema, Inventario'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Roles que pueden asignar trabajador en Kardex');

-- Tipos de movimiento que se pueden registrar en Agregar Kardex (formulario, grilla y Excel)
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Kardex', 'Tipos de movimiento permitidos en Agregar Kardex', 'Lista', 'ENTRADA, AJUSTE, TRANSFERENCIA'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Tipos de movimiento permitidos en Agregar Kardex');

-- Transferencias: estos roles transfieren a cualquier operación; los demás solo a su
-- misma regional o a las "Operaciones destino permitidas para todos".
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Kardex', 'Roles que pueden transferir a cualquier operación', 'Rol', 'Sistema, Inventario, Cuentas, AdmSst, LiderSst'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Roles que pueden transferir a cualquier operación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Kardex', 'Operaciones destino permitidas para todos', 'Lista', 'Administración'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Operaciones destino permitidas para todos');

-- Correo de transferencia despachada: Para = roles, resueltos según la Operación destino
-- (AuxiliarR/CoordinadorR por su Regional, Auxiliar/Coordinador por la Operación; misma
-- lógica de Retiros). Quien despacha siempre va en copia.
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Kardex', 'Notificación transferencia despachada - Para:', 'Rol', 'Auxiliar, Coordinador, AuxiliarR, CoordinadorR'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Notificación transferencia despachada - Para:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Kardex', 'Habilitar notificaciones de correo en Transferencias', 'Booleano', '1'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Kardex' AND Concepto = 'Habilitar notificaciones de correo en Transferencias');

-- Verificación
SELECT id, Concepto, Condicion, Parametro FROM Config_Parametros
WHERE Modulo = 'inventario' AND Seccion = 'Kardex' ORDER BY id;
