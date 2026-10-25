-- Etapa 1 de la unificación de permisos: crea Maestro_Menu y copia ahí los permisos de las
-- 6 tablas Maestro_Menu_* que usa el código (Documentos, Facturacion, Inventario, Nomina, Sst,
-- Talenthub). Una fila por Módulo + Sección + nivel de Acceso, con los roles separados por coma.
-- Todavía NO cambia nada: el código sigue leyendo las tablas viejas, que no se tocan.
-- Se puede ejecutar más de una vez: INSERT IGNORE no repite una combinación
-- Modulo + Seccion + Acceso que ya exista (y no pisa lo que se haya editado a mano).
--
-- Acceso: 1 = todo, 2 = su regional, 3 = sus operaciones (dispositivo);
--         4, 5 y 6 = igual que 1, 2 y 3 pero solo con las categorías del acceso restringido.
-- Url: dirección interna de la pestaña (el código le agrega el usuario). Icono: símbolo del menú OTROS.

CREATE TABLE IF NOT EXISTS Maestro_Menu (
  ID          INT AUTO_INCREMENT PRIMARY KEY,
  Modulo      VARCHAR(50)   NOT NULL,
  Seccion     VARCHAR(100)  NOT NULL,
  Rol         VARCHAR(1000) NOT NULL,
  Acceso      TINYINT       NOT NULL DEFAULT 1,
  Etiqueta    VARCHAR(150)  NULL,
  Url         VARCHAR(300)  NULL,
  Orden       INT           NULL,
  Icono       VARCHAR(300)  NULL,
  Descripcion VARCHAR(500)  NULL,
  UNIQUE KEY uq_maestro_menu (Modulo, Seccion, Acceso)
);

SET SESSION group_concat_max_len = 10000;

-- ── Cloud Docs (Maestro_Menu_Documentos) ───────────────────────────────────
INSERT IGNORE INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'clouddocs', t.`Sección`, GROUP_CONCAT(DISTINCT TRIM(t.Rol) ORDER BY TRIM(t.Rol) SEPARATOR ', '), t.Acceso,
       c.Etiqueta, c.Url, c.Orden, '▤', c.Descripcion
FROM Maestro_Menu_Documentos t
LEFT JOIN (
  SELECT 'CloudDocs' AS Seccion, 'Doc Trabajadores' AS Etiqueta, '/cloud-docs?tab=trabajador' AS Url, 1 AS Orden, 'Entrada a Cloud Docs: documentos por trabajador, tipos de documento, consolidado y LogySign.' AS Descripcion
  UNION ALL SELECT 'DocRetiros', 'Doc Retiros', '/cloud-docs?tab=docretiros', 2, 'Documentos del proceso de retiro de los trabajadores.'
  UNION ALL SELECT 'Solicitudes', 'Solicitudes', '/cloud-docs?tab=solicitudes', 3, 'Solicitudes de documentos de los trabajadores.'
  UNION ALL SELECT 'ValidarCap', 'Validar Capacitación', '/cloud-docs?tab=validarcap', 4, 'Validación de los soportes de capacitación.'
  UNION ALL SELECT 'Permisos', 'Permisos', '/cloud-docs?tab=permisos', 5, 'Permisos de los trabajadores.'
  UNION ALL SELECT 'Duplicados', 'Duplicados', '/cloud-docs?tab=duplicados', 6, 'Revisión de documentos duplicados.'
  UNION ALL SELECT 'DescuentoNomina', 'Autorizaciones de Descuento', '/cloud-docs?tab=descuentonomina', 7, 'Autorizaciones de descuento de nómina firmadas por los trabajadores.'
) c ON c.Seccion = t.`Sección`
WHERE t.Rol IS NOT NULL AND TRIM(t.Rol) <> ''
GROUP BY t.`Sección`, t.Acceso, c.Etiqueta, c.Url, c.Orden, c.Descripcion;

-- ── Facturación (Maestro_Menu_Facturacion) ─────────────────────────────────
INSERT IGNORE INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'facturacion', t.`Sección`, GROUP_CONCAT(DISTINCT TRIM(t.Rol) ORDER BY TRIM(t.Rol) SEPARATOR ', '), t.Acceso,
       c.Etiqueta, c.Url, c.Orden, '◷', c.Descripcion
FROM Maestro_Menu_Facturacion t
LEFT JOIN (
  SELECT 'Servicios' AS Seccion, 'Servicios' AS Etiqueta, '/facturacion?tab=servicios' AS Url, 1 AS Orden, 'Registro y carga masiva de servicios a facturar.' AS Descripcion
  UNION ALL SELECT 'Recibos', 'Recibos', '/facturacion?tab=recibos', 2, 'Recibos de caja de los servicios.'
  UNION ALL SELECT 'Clientes_credito', 'Clientes Crédito', '/facturacion?tab=clientescredito', 3, 'Clientes con crédito y su estado.'
  UNION ALL SELECT 'Bloqueo_datos', 'Bloqueos', '/facturacion?tab=bloqueo', 4, 'Bloqueo de datos de facturación por periodo.'
  UNION ALL SELECT 'Tickets', 'Tickets', '/facturacion?tab=tickets', 5, 'Tickets de soporte del módulo de Facturación.'
) c ON c.Seccion = t.`Sección`
WHERE t.Rol IS NOT NULL AND TRIM(t.Rol) <> ''
GROUP BY t.`Sección`, t.Acceso, c.Etiqueta, c.Url, c.Orden, c.Descripcion;

-- ── Inventario (Maestro_Menu_Inventario; Icono y Url de AppSheet no se copian) ──
INSERT IGNORE INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'inventario', t.`Sección`, GROUP_CONCAT(DISTINCT TRIM(t.Rol) ORDER BY TRIM(t.Rol) SEPARATOR ', '), t.Acceso,
       c.Etiqueta, c.Url, c.Orden, '▦', c.Descripcion
FROM Maestro_Menu_Inventario t
LEFT JOIN (
  SELECT 'Inventario' AS Seccion, 'Inventario' AS Etiqueta, '/inventario?tab=inventario' AS Url, 1 AS Orden, 'Existencias por regional y operación, confirmación de toma de cargo, reportes e historial.' AS Descripcion
  UNION ALL SELECT 'pendienteRecibir', 'Pendiente por recibir', '/inventario?tab=pendienterecibir', 2, 'Transferencias enviadas que la operación destino debe recibir.'
  UNION ALL SELECT 'Kardex', 'Kardex', '/inventario?tab=kardex', 3, 'Entradas, salidas y transferencias de artículos.'
  UNION ALL SELECT 'ArtÍculos', 'Catálogo de artículos', '/inventario?tab=articulos', 4, 'Catálogo de artículos, costos e imágenes.'
  UNION ALL SELECT 'Solicitudes', 'Solicitudes', '/inventario?tab=solicitudes', 5, 'Solicitudes de artículos de las operaciones y su aprobación.'
  UNION ALL SELECT 'Actas', 'Actas de Entrega', '/inventario?tab=actas', 6, 'Actas de entrega de artículos firmadas por el trabajador.'
  UNION ALL SELECT 'DotacionLey', 'Dotación de Ley', '/inventario?tab=dotacionley', 7, 'Trabajadores a los que les toca dotación de ley este mes, sus tallas y el envío al Kardex.'
) c ON c.Seccion = t.`Sección`
WHERE t.Rol IS NOT NULL AND TRIM(t.Rol) <> ''
GROUP BY t.`Sección`, t.Acceso, c.Etiqueta, c.Url, c.Orden, c.Descripcion;

-- ── Nómina (Maestro_Menu_Nomina) ───────────────────────────────────────────
INSERT IGNORE INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'nomina', t.`Sección`, GROUP_CONCAT(DISTINCT TRIM(t.Rol) ORDER BY TRIM(t.Rol) SEPARATOR ', '), t.Acceso,
       c.Etiqueta, c.Url, c.Orden, '◈', c.Descripcion
FROM Maestro_Menu_Nomina t
LEFT JOIN (
  SELECT 'Activo' AS Seccion, 'Activos' AS Etiqueta, '/nomina?tab=activos' AS Url, 1 AS Orden, 'Trabajadores activos y su información de nómina.' AS Descripcion
  UNION ALL SELECT 'Retiro', 'Retiros', '/nomina?tab=retiros', 2, 'Registro y seguimiento de retiros de trabajadores.'
  UNION ALL SELECT 'Traslados', 'Traslados', '/nomina?tab=traslados', 3, 'Traslados de trabajadores entre operaciones.'
  UNION ALL SELECT 'Cesantias', 'Cesantías', '/nomina?tab=cesantias', 4, 'Solicitudes de retiro de cesantías.'
  UNION ALL SELECT 'Incapacidades', 'Incapacidades', '/nomina?tab=incapacidades', 5, 'Incapacidades de los trabajadores.'
  UNION ALL SELECT 'Biometrico', 'Biométrico', '/nomina?tab=biometrico', 6, 'Marcaciones del biométrico.'
  UNION ALL SELECT 'Bloqueo_datos', 'Bloqueo de Datos', '/nomina?tab=bloqueo', 7, 'Bloqueo de datos de nómina por periodo.'
) c ON c.Seccion = t.`Sección`
WHERE t.Rol IS NOT NULL AND TRIM(t.Rol) <> ''
GROUP BY t.`Sección`, t.Acceso, c.Etiqueta, c.Url, c.Orden, c.Descripcion;

-- ── SST (Maestro_Menu_Sst) ─────────────────────────────────────────────────
INSERT IGNORE INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'sst', t.`Sección`, GROUP_CONCAT(DISTINCT TRIM(t.Rol) ORDER BY TRIM(t.Rol) SEPARATOR ', '), t.Acceso,
       c.Etiqueta, c.Url, c.Orden, '＋', c.Descripcion
FROM Maestro_Menu_Sst t
LEFT JOIN (
  SELECT 'Evaluación SST' AS Seccion, 'Evaluación SST' AS Etiqueta, '/sst?tab=evaluacion' AS Url, 1 AS Orden, 'Evaluaciones de SST de los trabajadores.' AS Descripcion
  UNION ALL SELECT 'Capacitación SST', 'Capacitación', '/sst?tab=capacitacion', 2, 'Capacitaciones de SST y sus temas.'
  UNION ALL SELECT 'Prueba de Consumo', 'Prueba de Consumo', '/sst?tab=pruebaconsumo', 3, 'Pruebas de consumo de alcohol y sustancias.'
  UNION ALL SELECT 'Participación', 'Participación', '/sst?tab=participacion', 4, 'Participación de los trabajadores en SST.'
  UNION ALL SELECT 'Compromiso SST', 'Compromisos SST', '/sst?tab=compromiso', 5, 'Compromisos de SST firmados.'
  UNION ALL SELECT 'Casos Medicos', 'Casos Médicos', '/sst?tab=gestionmedica&subtab=casosmedicos', 6, 'Gestión médica: casos médicos e incapacidades.'
  UNION ALL SELECT 'Inspecciones_vehiculos', 'Inspecciones de Vehículos', '/sst?tab=inspecciones', 7, 'Inspecciones preoperacionales de vehículos.'
) c ON c.Seccion = t.`Sección`
WHERE t.Rol IS NOT NULL AND TRIM(t.Rol) <> ''
GROUP BY t.`Sección`, t.Acceso, c.Etiqueta, c.Url, c.Orden, c.Descripcion;

-- ── TalentHub (Maestro_Menu_Talenthub) ─────────────────────────────────────
INSERT IGNORE INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'talenthub', t.`Sección`, GROUP_CONCAT(DISTINCT TRIM(t.Rol) ORDER BY TRIM(t.Rol) SEPARATOR ', '), t.Acceso,
       c.Etiqueta, c.Url, c.Orden, '❖', c.Descripcion
FROM Maestro_Menu_Talenthub t
LEFT JOIN (
  SELECT 'Requisiciones' AS Seccion, 'Requisiciones' AS Etiqueta, '/talenthub?tab=Requisiciones' AS Url, 1 AS Orden, 'Requisiciones de personal de las operaciones.' AS Descripcion
  UNION ALL SELECT 'Aspirantes', 'Aspirantes & Hojas de Vida', '/talenthub?tab=Aspirantes', 2, 'Aspirantes y sus hojas de vida.'
  UNION ALL SELECT 'Sociodemografica', 'Sociodemográfica y Vinculación', '/talenthub?tab=Sociodemografica', 3, 'Información sociodemográfica y vinculación de los trabajadores.'
  UNION ALL SELECT 'Integridad', 'Integridad de Identificación', '/talenthub?tab=Integridad', 4, 'Revisión de la integridad de las identificaciones.'
) c ON c.Seccion = t.`Sección`
WHERE t.Rol IS NOT NULL AND TRIM(t.Rol) <> ''
GROUP BY t.`Sección`, t.Acceso, c.Etiqueta, c.Url, c.Orden, c.Descripcion;

-- Verificación
SELECT Modulo, Seccion, Acceso, Rol, Etiqueta, Url FROM Maestro_Menu ORDER BY Modulo, Orden, Acceso;
