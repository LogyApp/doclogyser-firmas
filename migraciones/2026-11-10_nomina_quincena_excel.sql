-- Nómina · pestaña "Quincena Excel" (Maestro_Visual_Excel).
-- Cada operación tiene una fila con la Quincena que trae el Excel de nómina (Power Query)
-- desde las vistas vista_datanomina / vista_horahombre. En la pestaña solo se cambia la Quincena
-- (lista de Maestro_Fechas); Usuario y Fecha Registro se guardan solos y se ven informativos.
-- Accesos: 1 = todas las operaciones, 2 = operaciones de su regional, 3 = su operación/dispositivo.
-- Se puede ejecutar más de una vez.

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'nomina', 'Quincena_Excel', 'Sistema, Nomina, Facturación, Contabilidad', 1, 'Quincena Excel',
       '/nomina?tab=quincenaexcel', 13, '▣',
       'Quincena que trae el Excel de nómina (Power Query) por operación. Acceso a todas las operaciones.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'nomina' AND Seccion = 'Quincena_Excel' AND Acceso = 1);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'nomina', 'Quincena_Excel', 'AuxiliarR, CoordinadorR', 2, 'Quincena Excel',
       '/nomina?tab=quincenaexcel', 13, '▣',
       'Quincena que trae el Excel de nómina (Power Query) para las operaciones de la regional asignada.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'nomina' AND Seccion = 'Quincena_Excel' AND Acceso = 2);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'nomina', 'Quincena_Excel', 'Auxiliar, Coordinador', 3, 'Quincena Excel',
       '/nomina?tab=quincenaexcel', 13, '▣',
       'Quincena que trae el Excel de nómina (Power Query) para la operación local.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'nomina' AND Seccion = 'Quincena_Excel' AND Acceso = 3);
