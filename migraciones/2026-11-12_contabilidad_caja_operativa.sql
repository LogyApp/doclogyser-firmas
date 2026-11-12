-- Contabilidad › Caja Operativa: subpestañas en la barra lateral (grupo "Caja Operativa").
-- Reemplaza la lista de roles fija del código: quién ve cada subpestaña y con qué alcance lo decide Maestro_Menu.
-- Mismos roles de antes (+ Cuentas): 1 = Sistema, Contabilidad, Control, Cuentas; 2 = AuxiliarR, CoordinadorR; 3 = Auxiliar, Coordinador.
-- Se puede ejecutar más de una vez.

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Caja_Flujo', 'Sistema, Contabilidad, Control, Cuentas', 1, 'Flujo de Caja', '/contabilidad?tab=caja-flujo', 10, '💵', 'Caja Operativa › Flujo de Caja: Saldos por responsable y quincena, gastos del periodo y su validación. Acceso 1: todas las operaciones.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Caja_Flujo' AND Acceso = 1);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Caja_Flujo', 'AuxiliarR, CoordinadorR', 2, 'Flujo de Caja', '/contabilidad?tab=caja-flujo', 10, '💵', 'Caja Operativa › Flujo de Caja: Saldos por responsable y quincena, gastos del periodo y su validación. Acceso 2: operaciones de su regional.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Caja_Flujo' AND Acceso = 2);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Caja_Flujo', 'Auxiliar, Coordinador', 3, 'Flujo de Caja', '/contabilidad?tab=caja-flujo', 10, '💵', 'Caja Operativa › Flujo de Caja: Saldos por responsable y quincena, gastos del periodo y su validación. Acceso 3: su operación.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Caja_Flujo' AND Acceso = 3);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Caja_Responsables', 'Sistema, Contabilidad, Control, Cuentas', 1, 'Responsables', '/contabilidad?tab=caja-responsables', 11, '👤', 'Caja Operativa › Responsables: Responsables de caja, base autorizada y saldo disponible. Acceso 1: todas las operaciones.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Caja_Responsables' AND Acceso = 1);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Caja_Responsables', 'AuxiliarR, CoordinadorR', 2, 'Responsables', '/contabilidad?tab=caja-responsables', 11, '👤', 'Caja Operativa › Responsables: Responsables de caja, base autorizada y saldo disponible. Acceso 2: operaciones de su regional.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Caja_Responsables' AND Acceso = 2);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Caja_Responsables', 'Auxiliar, Coordinador', 3, 'Responsables', '/contabilidad?tab=caja-responsables', 11, '👤', 'Caja Operativa › Responsables: Responsables de caja, base autorizada y saldo disponible. Acceso 3: su operación.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Caja_Responsables' AND Acceso = 3);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Caja_Reintegros', 'Sistema, Contabilidad, Control, Cuentas', 1, 'Reintegros', '/contabilidad?tab=caja-reintegros', 12, '🔁', 'Caja Operativa › Reintegros: Solicitud y aprobación de reintegros de caja. Acceso 1: todas las operaciones.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Caja_Reintegros' AND Acceso = 1);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Caja_Reintegros', 'AuxiliarR, CoordinadorR', 2, 'Reintegros', '/contabilidad?tab=caja-reintegros', 12, '🔁', 'Caja Operativa › Reintegros: Solicitud y aprobación de reintegros de caja. Acceso 2: operaciones de su regional.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Caja_Reintegros' AND Acceso = 2);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Caja_Reintegros', 'Auxiliar, Coordinador', 3, 'Reintegros', '/contabilidad?tab=caja-reintegros', 12, '🔁', 'Caja Operativa › Reintegros: Solicitud y aprobación de reintegros de caja. Acceso 3: su operación.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Caja_Reintegros' AND Acceso = 3);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Caja_Reembolsos', 'Sistema, Contabilidad, Control, Cuentas', 1, 'Reembolsos', '/contabilidad?tab=caja-reembolsos', 13, '🧾', 'Caja Operativa › Reembolsos: Reembolsos solicitados por colaboradores. Acceso 1: todas las operaciones.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Caja_Reembolsos' AND Acceso = 1);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Caja_Reembolsos', 'AuxiliarR, CoordinadorR', 2, 'Reembolsos', '/contabilidad?tab=caja-reembolsos', 13, '🧾', 'Caja Operativa › Reembolsos: Reembolsos solicitados por colaboradores. Acceso 2: operaciones de su regional.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Caja_Reembolsos' AND Acceso = 2);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Caja_Reembolsos', 'Auxiliar, Coordinador', 3, 'Reembolsos', '/contabilidad?tab=caja-reembolsos', 13, '🧾', 'Caja Operativa › Reembolsos: Reembolsos solicitados por colaboradores. Acceso 3: su operación.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Caja_Reembolsos' AND Acceso = 3);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Caja_Proveedores', 'Sistema, Contabilidad, Control, Cuentas', 1, 'Proveedores', '/contabilidad?tab=caja-proveedores', 14, '🏪', 'Caja Operativa › Proveedores: Proveedores de compras de caja. Acceso 1: todas las operaciones.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Caja_Proveedores' AND Acceso = 1);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Caja_Proveedores', 'AuxiliarR, CoordinadorR', 2, 'Proveedores', '/contabilidad?tab=caja-proveedores', 14, '🏪', 'Caja Operativa › Proveedores: Proveedores de compras de caja. Acceso 2: operaciones de su regional.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Caja_Proveedores' AND Acceso = 2);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Caja_Proveedores', 'Auxiliar, Coordinador', 3, 'Proveedores', '/contabilidad?tab=caja-proveedores', 14, '🏪', 'Caja Operativa › Proveedores: Proveedores de compras de caja. Acceso 3: su operación.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Caja_Proveedores' AND Acceso = 3);

-- Roles que pueden hacer la validación contable de los gastos de caja (antes fijo: Contabilidad, Sistema)
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'contabilidad', 'Caja Operativa', 'Roles que pueden validar gastos', 'Rol', 'Contabilidad, Sistema',
       'Roles que hacen la validación contable de los gastos de Caja Operativa (Contabilidad › Caja Operativa). Lista separada por coma; si no existe la fila se usa Contabilidad, Sistema.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'contabilidad' AND Seccion = 'Caja Operativa' AND Concepto = 'Roles que pueden validar gastos');
