-- Talent Hub › Entrevistas de Retiro: pestaña para que Selección y Bienestar analicen las entrevistas de
-- retiro (Maestro_evaluacionretiro): indicadores, puntos a mejorar, resultados por operación y
-- coordinador, tabla con el documento, regenerar el PDF y campana de nuevas entrevistas.
-- Quién ve la pestaña: Maestro_Menu talenthub / EntrevistasRetiro (como las demás pestañas).
-- Regenerar y campana: Config_Parametros talenthub / Entrevistas de Retiro (src/services/entrevistasRetiro.js).
-- Solo agrega filas. Se puede ejecutar más de una vez.

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'talenthub', 'EntrevistasRetiro', 'Sistema, CoorSelección, Directorth, Juridica, Nomina', 1,
       'Entrevistas de Retiro', '/talenthub?tab=EntrevistasRetiro', 6, '❖',
       'Análisis de las entrevistas de retiro: puntos a mejorar por aspecto, operación y coordinador.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'talenthub' AND Seccion = 'EntrevistasRetiro');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Entrevistas de Retiro', 'Roles que pueden regenerar entrevistas de retiro', 'Rol',
       'Sistema, CoorSelección, Directorth, Juridica, Nomina',
       'Roles (separados por coma) que ven el botón "Regenerar" en Talent Hub › Entrevistas de Retiro: vuelve a armar el PDF de la entrevista con la plantilla actual y reemplaza el documento. Vacío = nadie puede regenerar.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Entrevistas de Retiro' AND Concepto = 'Roles que pueden regenerar entrevistas de retiro');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Entrevistas de Retiro', 'Roles notificados de nuevas entrevistas de retiro', 'Rol',
       'Sistema, CoorSelección, Directorth, Juridica, Nomina',
       'Roles (separados por coma) que reciben en la campana de Talent Hub › Entrevistas de Retiro el aviso cada vez que un trabajador diligencia su entrevista. Deben tener también la pestaña en Maestro_Menu para verla. Vacío = no se crean avisos.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Entrevistas de Retiro' AND Concepto = 'Roles notificados de nuevas entrevistas de retiro');

SELECT 'Maestro_Menu' AS tabla, Seccion AS concepto, Rol AS valor FROM Maestro_Menu WHERE Modulo = 'talenthub' AND Seccion = 'EntrevistasRetiro'
UNION ALL
SELECT 'Config_Parametros', Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Entrevistas de Retiro';
