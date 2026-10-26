-- Pestaña Nómina · Producción (destajo colectivo) y sus subpestañas Áreas y Valor fijo Nómina.
-- Se puede ejecutar más de una vez (INSERT IGNORE / WHERE NOT EXISTS; el ALTER deja la misma columna).

-- ── 1. Quién ve la pestaña y cada subpestaña (Maestro_Menu) ──────────────────
INSERT IGNORE INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion) VALUES
  ('nomina', 'Produccion', 'Sistema, Nomina, Directorth', 1, 'Producción', '/nomina?tab=produccion', 10, '▣',
   'Destajo colectivo por Operación y Día: valor de los servicios, bolsa a repartir y valor de cada trabajador que asistió.'),
  ('nomina', 'Produccion_Areas', 'Nomina, Sistema', 1, 'Producción · Áreas', '/nomina?tab=produccion&subtab=areas', 11, '▣',
   'Áreas de cada operación (Config_Area): si aplican destajo (DTJO), si se reparte en grupo (GRUPAL) y el % asignado.'),
  ('nomina', 'Produccion_Tarifas', 'Nomina, Sistema', 1, 'Producción · Valor fijo Nómina', '/nomina?tab=produccion&subtab=tarifas', 12, '▣',
   'Tarifas GENERAL de Maestro_Tarifas: si valor_nomina es mayor a 0, reemplaza el Valor Unitario del servicio al calcular el destajo.');

-- ── 2. Permisos de acciones (Config_Parametros, nomina / Produccion) ─────────
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Produccion', 'Roles que pueden eliminar áreas de producción', 'Rol', 'Sistema',
       'Roles que pueden eliminar un área en Producción · Áreas. Agregar y editar lo puede hacer cualquiera que vea la subpestaña. No se elimina un área que ya tenga asistencias o servicios.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Produccion' AND Concepto = 'Roles que pueden eliminar áreas de producción');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Produccion', 'Roles que pueden agregar y editar valor fijo nómina', 'Rol', 'Nomina, Sistema',
       'Roles que pueden agregar y editar tarifas GENERAL (Valor y valor_nomina) en Producción · Valor fijo Nómina.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Produccion' AND Concepto = 'Roles que pueden agregar y editar valor fijo nómina');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Produccion', 'Roles que pueden eliminar valor fijo nómina', 'Rol', 'Sistema',
       'Roles que pueden eliminar tarifas GENERAL en Producción · Valor fijo Nómina.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Produccion' AND Concepto = 'Roles que pueden eliminar valor fijo nómina');

-- ── 3. Config_Area.ID autoincremental ────────────────────────────────────────
-- Cambia la estructura de la columna (no borra datos). Config_Doc_Trabajador.area y
-- Maestro_programa_packing.area la referencian, por eso se desactiva un momento la revisión
-- de llaves foráneas; el tipo (INT) no cambia, solo se agrega AUTO_INCREMENT.
SET FOREIGN_KEY_CHECKS = 0;
ALTER TABLE Config_Area MODIFY ID INT NOT NULL AUTO_INCREMENT;
SET FOREIGN_KEY_CHECKS = 1;

-- Verificación
SELECT Modulo, Seccion, Rol, Acceso, Etiqueta, Url FROM Maestro_Menu WHERE Modulo = 'nomina' AND Seccion LIKE 'Produccion%';
SELECT id, Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Produccion';
SHOW COLUMNS FROM Config_Area LIKE 'ID';
