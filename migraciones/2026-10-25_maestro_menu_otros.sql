-- Menú OTROS armado desde Maestro_Menu.
-- 1. Directorio Corporativo para todo el personal: Rol = 'Todos' (cualquier usuario registrado,
--    sin importar su rol; la misma palabra sirve para cualquier otra pestaña).
-- 2. Filas propias para 9 enlaces del menú que no tenían sección, con los mismos roles y
--    accesos de la sección de la que dependen. Por ahora controlan el enlace del menú; dentro
--    del módulo la sub-pestaña sigue dependiendo de su sección principal.
-- 3. Renumera Orden (y ajusta la etiqueta/url de Biométrico y el icono de Nómina) para mantener
--    el orden del menú anterior. Solo cambia cómo se muestra el menú, no los permisos.
-- Se puede ejecutar más de una vez: INSERT IGNORE no repite filas y los UPDATE dejan los mismos valores.

-- ── 1. Directorio Corporativo ──────────────────────────────────────────────
INSERT IGNORE INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
VALUES ('directorio', 'Directorio', 'Todos', 1, 'Directorio Corporativo', '/directorio-corporativo', 1, '📇',
        'Directorio con los datos de contacto del personal. Rol "Todos": lo ve cualquier usuario registrado.');

-- ── 2. Enlaces con fila propia (copian roles y acceso de su sección) ───────
INSERT IGNORE INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT m.Modulo, n.Seccion, m.Rol, m.Acceso, n.Etiqueta, n.Url, n.Orden, m.Icono, n.Descripcion
FROM Maestro_Menu m
JOIN (
  SELECT 'inventario' AS Modulo, 'Inventario' AS Padre, 'Reportes' AS Seccion, 'Reportes' AS Etiqueta, '/inventario?tab=reportes' AS Url, 2 AS Orden,
         'Enlace del menú a los reportes de inventario (dentro del módulo depende de la sección Inventario).' AS Descripcion
  UNION ALL SELECT 'inventario', 'Inventario', 'Historial', 'Historial de Confirmaciones', '/inventario?tab=historial', 9,
         'Enlace del menú al historial de confirmaciones de toma de cargo (dentro del módulo depende de la sección Inventario).'
  UNION ALL SELECT 'clouddocs', 'CloudDocs', 'TiposDocumento', 'Tipos de Documento', '/cloud-docs?tab=documento', 2,
         'Enlace del menú a Tipos de Documento (dentro del módulo depende de la sección CloudDocs).'
  UNION ALL SELECT 'clouddocs', 'CloudDocs', 'Consolidado', 'Consolidado', '/cloud-docs?tab=todo', 3,
         'Enlace del menú al consolidado de documentos (dentro del módulo depende de la sección CloudDocs).'
  UNION ALL SELECT 'clouddocs', 'CloudDocs', 'LogySign', 'LogySign', '/cloud-docs?tab=logysign', 5,
         'Enlace del menú a LogySign, firmas de documentos (dentro del módulo depende de la sección CloudDocs).'
  UNION ALL SELECT 'sst', 'Capacitación SST', 'Temas de capacitación', 'Temas de capacitación', '/sst?tab=capacitacion&subtab=temas', 3,
         'Enlace del menú a los temas de capacitación (dentro del módulo depende de la sección Capacitación SST).'
  UNION ALL SELECT 'sst', 'Casos Medicos', 'Incapacidades', 'Incapacidades', '/sst?tab=gestionmedica&subtab=incapacidades', 8,
         'Enlace del menú a las incapacidades de gestión médica (dentro del módulo depende de la sección Casos Medicos).'
  UNION ALL SELECT 'nomina', 'Biometrico', 'Biometrico_Recorridos', 'Biométrico · Recorridos GPS', '/nomina?tab=biometrico&subtab=rutas', 5,
         'Enlace del menú a los recorridos GPS del biométrico (dentro del módulo depende de la sección Biometrico).'
  UNION ALL SELECT 'nomina', 'Biometrico', 'Biometrico_Reportes', 'Biométrico · Reportes', '/nomina?tab=biometrico&subtab=reportes', 6,
         'Enlace del menú a los reportes del biométrico (dentro del módulo depende de la sección Biometrico).'
) n ON n.Modulo = m.Modulo AND n.Padre = m.Seccion;

-- ── 3. Orden del menú anterior ─────────────────────────────────────────────
UPDATE Maestro_Menu SET Orden = CASE Seccion
  WHEN 'Inventario' THEN 1 WHEN 'Reportes' THEN 2 WHEN 'pendienteRecibir' THEN 3 WHEN 'Kardex' THEN 4
  WHEN 'ArtÍculos' THEN 5 WHEN 'Solicitudes' THEN 6 WHEN 'Actas' THEN 7 WHEN 'DotacionLey' THEN 8
  WHEN 'Historial' THEN 9 ELSE Orden END
WHERE Modulo = 'inventario';

UPDATE Maestro_Menu SET Orden = CASE Seccion
  WHEN 'CloudDocs' THEN 1 WHEN 'TiposDocumento' THEN 2 WHEN 'Consolidado' THEN 3 WHEN 'DocRetiros' THEN 4
  WHEN 'LogySign' THEN 5 WHEN 'Solicitudes' THEN 6 WHEN 'ValidarCap' THEN 7 WHEN 'Permisos' THEN 8
  WHEN 'Duplicados' THEN 9 WHEN 'DescuentoNomina' THEN 10 ELSE Orden END
WHERE Modulo = 'clouddocs';

UPDATE Maestro_Menu SET Orden = CASE Seccion
  WHEN 'Evaluación SST' THEN 1 WHEN 'Capacitación SST' THEN 2 WHEN 'Temas de capacitación' THEN 3
  WHEN 'Prueba de Consumo' THEN 4 WHEN 'Participación' THEN 5 WHEN 'Compromiso SST' THEN 6
  WHEN 'Casos Medicos' THEN 7 WHEN 'Incapacidades' THEN 8 WHEN 'Inspecciones_vehiculos' THEN 9 ELSE Orden END
WHERE Modulo = 'sst';

UPDATE Maestro_Menu SET Orden = CASE Seccion
  WHEN 'Activo' THEN 1 WHEN 'Retiro' THEN 2 WHEN 'Bloqueo_datos' THEN 3 WHEN 'Biometrico' THEN 4
  WHEN 'Biometrico_Recorridos' THEN 5 WHEN 'Biometrico_Reportes' THEN 6 WHEN 'Traslados' THEN 7
  WHEN 'Incapacidades' THEN 8 WHEN 'Cesantias' THEN 9 ELSE Orden END,
  Icono = '▣'
WHERE Modulo = 'nomina';

UPDATE Maestro_Menu SET Etiqueta = 'Biométrico · Asistencia', Url = '/nomina?tab=biometrico&subtab=asistencia'
WHERE Modulo = 'nomina' AND Seccion = 'Biometrico';

-- Verificación
SELECT Modulo, Orden, Seccion, Etiqueta, Url, Acceso, Rol FROM Maestro_Menu ORDER BY Modulo, Orden, Acceso;
