-- Contabilidad › Formas de Pago: informe de la quincena por operación (Efectivo, Transferencia y Crédito).
-- Queda primera (Orden 0) y es la pestaña por defecto del módulo.
-- Todos ven los porcentajes de todas las operaciones; los valores en pesos según el acceso:
--   1 = todas las operaciones, 2 = las de su regional, 3 = su operación.
-- Se puede ejecutar más de una vez.

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Formas_Pago', 'Sistema, Contabilidad, Cuentas, Facturación', 1, 'Formas de Pago', '/contabilidad?tab=formaspago', 0, '📊',
       'Informe de formas de pago por quincena (Efectivo, Transferencia, Crédito). Acceso 1: ven porcentaje y valores de todas las operaciones.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Formas_Pago' AND Acceso = 1);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Formas_Pago', 'AuxiliarR, CoordinadorR', 2, 'Formas de Pago', '/contabilidad?tab=formaspago', 0, '📊',
       'Informe de formas de pago por quincena. Acceso 2: ven el porcentaje de todas las operaciones y los valores de las operaciones de su regional.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Formas_Pago' AND Acceso = 2);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'contabilidad', 'Formas_Pago', 'Auxiliar, Coordinador', 3, 'Formas de Pago', '/contabilidad?tab=formaspago', 0, '📊',
       'Informe de formas de pago por quincena. Acceso 3: ven el porcentaje de todas las operaciones y los valores de su operación.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'contabilidad' AND Seccion = 'Formas_Pago' AND Acceso = 3);
