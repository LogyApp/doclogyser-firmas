-- SST (solicitud del área, 2026-11-24). Se puede ejecutar más de una vez.
--  1. Documentación Inicial queda de primera en el menú de SST (Orden en Maestro_Menu).
--  2. Evaluación SST se desactiva: el proceso quedó cubierto por EVIN (Documentación Inicial).
--     Se quitan los roles de sus filas de Maestro_Menu, con lo que desaparece la pestaña, el enlace
--     del menú OTROS y ya no se pueden crear evaluaciones (las rutas validan esa sección).
--     Roles que tenía, para reactivarla si hiciera falta:
--       Acceso 1: 'AdmSst, LiderSst, Sistema, Archivo' · Acceso 2: 'AuxSst' · Acceso 3: 'AnaSst'
--     Los PDF ya generados siguen en Cloud Docs (Maestro_docTrabajador, prefijo EVSST).
--  3. Subpestañas de Documentación Inicial con nombre en vez de prefijo (solo la Etiqueta;
--     la Sección ARO / EVIN / INGE, que controla permisos y parámetros, no cambia).

-- Anotación del PDF para las evaluaciones pendientes que se cierran soportadas por correo
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Evaluación SST', 'Anotación en el PDF para evaluaciones soportadas por correo', '', 'Soportado por correo electrónico',
       'Texto que va en el resultado y en la firma del PDF de la Evaluación SST cuando se cierra sin respuestas ni firma porque quedó soportada por correo (se agrega la fecha). Vacío = "Soportado por correo electrónico".'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'sst' AND Seccion = 'Evaluación SST' AND Concepto = 'Anotación en el PDF para evaluaciones soportadas por correo'
);

-- 1. Orden del menú de SST: Documentación Inicial primero
UPDATE Maestro_Menu SET Orden = CASE Seccion
    WHEN 'ARO' THEN 1
    WHEN 'EVIN' THEN 2
    WHEN 'INGE' THEN 3
    WHEN 'Capacitación SST' THEN 4
    WHEN 'Temas de capacitación' THEN 5
    WHEN 'Prueba de Consumo' THEN 6
    WHEN 'Participación' THEN 7
    WHEN 'Compromiso SST' THEN 8
    WHEN 'Casos Medicos' THEN 9
    WHEN 'Incapacidades' THEN 10
    WHEN 'Inspecciones_vehiculos' THEN 11
    WHEN 'ATS' THEN 12
    WHEN 'Evaluación SST' THEN 99
    ELSE Orden END
WHERE Modulo = 'sst';

-- 2. Evaluación SST desactivada (sin roles)
UPDATE Maestro_Menu
   SET Rol = '',
       Descripcion = 'Desactivada el 2026-11-24: el proceso quedó cubierto por EVIN (Documentación Inicial). Ver migraciones/2026-11-24_sst_documentacion_inicial_primero.sql para reactivarla.'
 WHERE Modulo = 'sst' AND Seccion = 'Evaluación SST';

-- 3. Nombres de las subpestañas de Documentación Inicial
UPDATE Maestro_Menu SET Etiqueta = 'Análisis de Riesgo' WHERE Modulo = 'sst' AND Seccion = 'ARO';
UPDATE Maestro_Menu SET Etiqueta = 'Evaluación de Inducción' WHERE Modulo = 'sst' AND Seccion = 'EVIN';
UPDATE Maestro_Menu SET Etiqueta = 'Comprobante de Inducción' WHERE Modulo = 'sst' AND Seccion = 'INGE';
