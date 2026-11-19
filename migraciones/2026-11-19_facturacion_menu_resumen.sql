-- Facturación › Resumen: valor de los servicios por Operación y Día en Efectivo, Transferencia y Crédito
-- (GET /facturacion/api/resumen, public/js/facturacion-resumen.js).
-- Quién la ve y qué alcance tiene: Maestro_Menu facturacion / Resumen, con los mismos roles y niveles de
-- Acceso de la pestaña Servicios (1 = todo, 2 = su regional, 3 = sus operaciones).
-- Solo agrega filas. Se puede ejecutar más de una vez.

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'facturacion', 'Resumen', 'Control, Facturación, Sistema, Contabilidad, subgerente', 1,
       'Resumen', '/facturacion?tab=resumen', 0, '▣',
       'Valor de los servicios por operación y día en efectivo, transferencia y crédito (todas las operaciones).'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'facturacion' AND Seccion = 'Resumen' AND Acceso = 1);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'facturacion', 'Resumen', 'AuxiliarR, CoordinadorR', 2,
       'Resumen', '/facturacion?tab=resumen', 0, '▣',
       'Valor de los servicios por operación y día en efectivo, transferencia y crédito (operaciones de su regional).'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'facturacion' AND Seccion = 'Resumen' AND Acceso = 2);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'facturacion', 'Resumen', 'Auxiliar, Coordinador, Lider, Lider 2, Lider 3', 3,
       'Resumen', '/facturacion?tab=resumen', 0, '▣',
       'Valor de los servicios por operación y día en efectivo, transferencia y crédito (sus operaciones).'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'facturacion' AND Seccion = 'Resumen' AND Acceso = 3);

SELECT ID, Seccion, Acceso, Rol FROM Maestro_Menu WHERE Modulo = 'facturacion' AND Seccion = 'Resumen' ORDER BY Acceso;
