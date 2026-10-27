-- Facturación: ajustes de los formularios de Recibo y Servicio por Operación (Config_Servicios)
-- y permisos de la pestaña "Ajustes Servicios". Se puede ejecutar más de una vez.
--
-- Cada fila ajusta un campo (columna de Dynamic_Recibos o Dynamic_Servicios) para una Operación:
--   seccion            'Recibo' (Dynamic_Recibos) o 'Servicio' (Dynamic_Servicios)
--   operacion          Operación del recibo; vacío = todas las operaciones (fila por defecto)
--   modalidad          'RECAUDO', 'CREDITO' o vacío = ambas
--   columna_origen     nombre exacto de la columna (Area, Actividad, Vehiculo, Unidad, ...)
--   etiqueta_columna   nombre del campo en el formulario; vacío = el nombre de siempre
--   datos_habilitados  valores que se pueden escoger, separados por coma; vacío = todos.
--                      Area y Actividad: ID de Config_Area / Config_Actividad.
--                      Vehiculo, Unidad, Duración, Cliente a Facturar: el nombre (llave de su tabla).
--   valor_defecto      valor que llega escogido al crear
--   visible            1 aparece en el formulario, 0 no aparece
--   obligatorio        1 no deja guardar sin ese dato
--   rol                roles que ven el campo, separados por coma; vacío = todos los que entran a
--                      Recibos o Servicios. A los demás no les aparece y se guarda el valor_defecto.
--   orden              orden del campo (reservado)
-- Si una operación no tiene filas, el formulario funciona como siempre. Gana la fila más
-- específica: Operación + Modalidad, luego Operación, luego Modalidad, luego la fila por defecto.

CREATE TABLE IF NOT EXISTS Config_Servicios (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  seccion           VARCHAR(20)  NOT NULL,
  operacion         VARCHAR(50)  NOT NULL DEFAULT '',
  modalidad         VARCHAR(20)  NOT NULL DEFAULT '',
  columna_origen    VARCHAR(64)  NOT NULL,
  etiqueta_columna  VARCHAR(100) NULL,
  datos_habilitados TEXT         NULL,
  valor_defecto     VARCHAR(255) NULL,
  visible           TINYINT(1)   NOT NULL DEFAULT 1,
  obligatorio       TINYINT(1)   NOT NULL DEFAULT 0,
  rol               VARCHAR(500) NULL,
  orden             INT          NULL,
  usuario           VARCHAR(100) NULL,
  fecha_registro    DATETIME     NULL,
  UNIQUE KEY uq_config_servicios (seccion, operacion, modalidad, columna_origen),
  KEY idx_config_servicios_operacion (operacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pestaña Ajustes Servicios en el menú de Facturación (quién la ve)
INSERT IGNORE INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion) VALUES
  ('facturacion', 'Ajustes_Servicios', 'Facturación, Sistema', 1, 'Ajustes Servicios', '/facturacion?tab=ajustes', 10, '◷',
   'Ajustes de los formularios de Recibo y Servicio por Operación (Config_Servicios).');

-- Quién crea, edita y elimina ajustes
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Ajustes_Servicios', 'Roles que pueden crear y editar ajustes de servicios', 'Rol', 'Facturación, Sistema',
       'Roles que pueden crear y editar filas de Config_Servicios en la pestaña Ajustes Servicios de Facturación. Si se deja vacío, nadie puede hacerlo.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Ajustes_Servicios' AND Concepto = 'Roles que pueden crear y editar ajustes de servicios');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Ajustes_Servicios', 'Roles que pueden eliminar ajustes de servicios', 'Rol', 'Sistema',
       'Roles que pueden eliminar filas de Config_Servicios en la pestaña Ajustes Servicios de Facturación. Si se deja vacío, nadie puede hacerlo.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Ajustes_Servicios' AND Concepto = 'Roles que pueden eliminar ajustes de servicios');
