-- Reglas de la pestaña Inventario (módulo Inventario) y reglas generales del módulo.
-- Antes estaban fijas en el código (inventario.js, accesoInventario.js e index.html).
-- Se puede ejecutar más de una vez: solo inserta las filas que todavía no existen.
-- Listas separadas por coma; comparación sin distinguir mayúsculas ni tildes.
-- Las listas de notificación son de ROLES: se envía al Email de Maestro_Usuarios con ese Rol
-- (Auxiliar, AuxiliarR, Coordinador y CoordinadorR se resuelven según la Operación).

-- ── Correo de "Confirmar Inventario": una fila por Categoría ───────────────
-- Prellenado con la lógica anterior (correos fijos → su Rol): admin@ = Sistema,
-- controlcuentas@ = Cuentas, auxiliarcompras@ = Inventario, analistasst@ = AdmSst,
-- administradorti@ y subgerenciaoperaciones@ = Control. sstadmon@ no es usuario.
-- Quien confirma siempre va en copia. Una categoría sin fila usa: Sistema, Control.
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Inventario', 'Notificación confirmación inventario ACTIVO FIJO - Para:', 'Rol', 'Sistema, Cuentas, Control'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Notificación confirmación inventario ACTIVO FIJO - Para:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Inventario', 'Notificación confirmación inventario DOTACIÓN - Para:', 'Rol', 'Sistema, Cuentas, Inventario, Control'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Notificación confirmación inventario DOTACIÓN - Para:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Inventario', 'Notificación confirmación inventario EPP - Para:', 'Rol', 'Sistema, AdmSst'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Notificación confirmación inventario EPP - Para:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Inventario', 'Notificación confirmación inventario HERRAMIENTA - Para:', 'Rol', 'Sistema, Cuentas, Control'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Notificación confirmación inventario HERRAMIENTA - Para:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Inventario', 'Notificación confirmación inventario PAPELERIA - Para:', 'Rol', 'Sistema, Cuentas, Control'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Notificación confirmación inventario PAPELERIA - Para:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Inventario', 'Notificación confirmación inventario TECNOLOGIA - Para:', 'Rol', 'Sistema, Control'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Notificación confirmación inventario TECNOLOGIA - Para:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Inventario', 'Habilitar notificaciones de correo en Confirmación de Inventario', 'Booleano', '1'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Habilitar notificaciones de correo en Confirmación de Inventario');

-- ── Permisos de la pestaña ─────────────────────────────────────────────────
-- Ajustar stock: antes 6 roles + cualquier usuario de la operación Administración. Se
-- prellenan también los roles de Administración con acceso a la pestaña, para no quitarle
-- el permiso a nadie. Las operaciones de cada rol las define Maestro_Menu_Inventario.
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Inventario', 'Roles que pueden ajustar stock', 'Rol', 'Inventario, Sistema, AuxiliarR, Auxiliar, AnaSst, AuxSst, AdmSst, Asistencial, Calidad, Contratación, Control, Cuentas, LiderSst'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Roles que pueden ajustar stock');

-- Editar placa: antes cualquiera con acceso a la pestaña (estos son los roles que hoy tienen
-- la Sección 'Inventario' en Maestro_Menu_Inventario). Además solo aplica a categorías Recuperables.
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Inventario', 'Roles que pueden editar placa', 'Rol', 'AdmSst, AnaSst, Asistencial, AuxInventario, AuxSst, Auxiliar, AuxiliarR, Calidad, Contratación, Control, Coordinador, CoordinadorR, Cuentas, Inventario, LiderSst, Sistema'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Roles que pueden editar placa');

-- ── Meses que se pueden confirmar ──────────────────────────────────────────
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Inventario', 'Mes inicial de confirmación de inventario', 'Mes', '2026-07'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Mes inicial de confirmación de inventario');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'Inventario', 'Meses hacia adelante permitidos para confirmar', 'Número', '1'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Inventario' AND Concepto = 'Meses hacia adelante permitidos para confirmar');

-- ── General (todas las pestañas del módulo) ────────────────────────────────
-- Categorías que ven los roles con Acceso 4, 5 o 6 en Maestro_Menu_Inventario.
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'inventario', 'General', 'Categorías permitidas en acceso restringido', 'Lista', 'EPP, DOTACIÓN'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'General' AND Concepto = 'Categorías permitidas en acceso restringido');

-- Verificación
SELECT id, Seccion, Concepto, Condicion, Parametro FROM Config_Parametros
WHERE Modulo = 'inventario' AND Seccion IN ('Inventario', 'General') ORDER BY Seccion, id;
