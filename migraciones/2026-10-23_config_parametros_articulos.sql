-- Reglas de la pestaña Artículos (módulo Inventario). Antes estaban fijas en el código
-- (inventario.js e index.html). Se puede ejecutar más de una vez: solo inserta las filas que
-- todavía no existen. Requiere la columna Descripcion (2026-10-23_config_parametros_descripcion.sql).

-- Crear y editar: antes, usuarios de la operación Administración + Auxiliar/AuxiliarR. Se prellenan
-- Auxiliar, AuxiliarR y los roles de Administración que hoy tienen la pestaña Artículos.
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Artículos', 'Roles que pueden crear y editar artículos', 'Rol',
       'Auxiliar, AuxiliarR, AdmSst, Asistencial, Calidad, Control, Cuentas, Inventario, LiderSst, Sistema',
       'Roles que pueden crear artículos (uno a uno o carga masiva) y editarlos. Los roles con acceso restringido solo gestionan sus categorías.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Artículos' AND Concepto = 'Roles que pueden crear y editar artículos');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Artículos', 'Roles que pueden eliminar artículos', 'Rol', 'Inventario, Sistema',
       'Roles que pueden eliminar artículos del catálogo.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Artículos' AND Concepto = 'Roles que pueden eliminar artículos');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'inventario', 'Artículos', 'Roles que pueden gestionar imágenes de elementos', 'Rol', 'Inventario, Sistema',
       'Roles que ven el gestor de imágenes de elementos: cambiar la imagen de un elemento la cambia en todos sus artículos.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'inventario' AND Seccion = 'Artículos' AND Concepto = 'Roles que pueden gestionar imágenes de elementos');

-- Verificación
SELECT id, Concepto, Condicion, Parametro, Descripcion FROM Config_Parametros
WHERE Modulo = 'inventario' AND Seccion = 'Artículos' ORDER BY id;
