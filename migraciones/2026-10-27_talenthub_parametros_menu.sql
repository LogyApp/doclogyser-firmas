-- Pestaña Parámetros en Maestro_Menu (talenthub / Parametros)
-- Solo los roles CoorSelección y Sistema tienen acceso a esta pestaña (al final del menú: Orden 5).
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
VALUES ('talenthub', 'Parametros', 'CoorSelección, Sistema', 1, 'Parámetros', '/talenthub?tab=Parametros', 5, '⚙', 'Consultar y editar las reglas de negocio y parámetros del módulo TalentHub (Config_Parametros).')
ON DUPLICATE KEY UPDATE
  Rol = VALUES(Rol),
  Etiqueta = VALUES(Etiqueta),
  Url = VALUES(Url),
  Orden = VALUES(Orden),
  Icono = VALUES(Icono),
  Descripcion = VALUES(Descripcion);

-- Eliminar registro temporal previo si existía
DELETE FROM Maestro_Menu WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones_Parametros';

-- Actualizar el parámetro 'Editar parametros de Requisiciones' en Config_Parametros
UPDATE Config_Parametros
SET Parametro = 'CoorSelección, Sistema'
WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Editar parametros de Requisiciones';

-- Consulta de verificación
SELECT ID, Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden FROM Maestro_Menu WHERE Modulo = 'talenthub' ORDER BY Orden, ID;
