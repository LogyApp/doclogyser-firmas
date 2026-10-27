-- Módulo Configuración (/configuracion): pestañas Parámetros (Config_Parametros) y Visual (Maestro_Menu).
-- Solo para el rol Sistema. Se puede ejecutar más de una vez.

-- 1. Quién ve cada pestaña (Maestro_Menu)
INSERT IGNORE INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion) VALUES
  ('configuracion', 'Parametros', 'Sistema', 1, 'Parámetros', '/configuracion?tab=parametros', 1, '⚙',
   'Consultar, crear, editar y eliminar las reglas de negocio de todos los módulos (Config_Parametros).'),
  ('configuracion', 'Visual', 'Sistema', 1, 'Visual', '/configuracion?tab=visual', 2, '⚙',
   'Consultar, crear, editar y eliminar quién ve cada pestaña de cada módulo y el menú OTROS (Maestro_Menu).');

-- 2. Qué puede hacer cada rol dentro de las pestañas (Config_Parametros)
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'configuracion', 'Parametros', 'Roles que pueden crear y editar parámetros', 'Rol', 'Sistema',
       'Roles que pueden agregar y modificar filas de Config_Parametros desde Configuración · Parámetros. Sistema no se puede quitar. Si la fila no existe, solo Sistema.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'configuracion' AND Seccion = 'Parametros' AND Concepto = 'Roles que pueden crear y editar parámetros');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'configuracion', 'Parametros', 'Roles que pueden eliminar parámetros', 'Rol', 'Sistema',
       'Roles que pueden eliminar filas de Config_Parametros desde Configuración · Parámetros (pide confirmación). Si la fila no existe, solo Sistema.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'configuracion' AND Seccion = 'Parametros' AND Concepto = 'Roles que pueden eliminar parámetros');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'configuracion', 'Visual', 'Roles que pueden crear y editar el menú', 'Rol', 'Sistema',
       'Roles que pueden agregar y modificar filas de Maestro_Menu (quién ve cada pestaña) desde Configuración · Visual. Sistema no se puede quitar. Si la fila no existe, solo Sistema.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'configuracion' AND Seccion = 'Visual' AND Concepto = 'Roles que pueden crear y editar el menú');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'configuracion', 'Visual', 'Roles que pueden eliminar del menú', 'Rol', 'Sistema',
       'Roles que pueden eliminar filas de Maestro_Menu desde Configuración · Visual (pide confirmación). Si la fila no existe, solo Sistema.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'configuracion' AND Seccion = 'Visual' AND Concepto = 'Roles que pueden eliminar del menú');
