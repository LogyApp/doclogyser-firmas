-- Talent Hub › Cargos y Funciones (manual de funciones SST-MA-002 por cargo).
-- 1) Tablas: Config_Cargo_Manual (ficha del cargo, borrador de trabajo), Config_Cargo_Funciones (renglones
--    por sección) y Config_Cargo_Manual_Versiones (control de cambios; la versión publicada guarda una copia
--    del contenido en JSON, y es la que se usa al firmar).
-- 2) Pestaña en Maestro_Menu y parámetro de roles que editan/publican en Config_Parametros.
-- 3) Carga inicial de los 4 manuales aprobados: Auxiliar logístico, Montacarguista, Coordinador Regional y
--    Analista de Selección, publicados en su versión vigente.
-- La plantilla del manual (Maestro_Plantillas MF) se actualiza en 2026-11-13_plantilla_mf_por_cargo.sql.
-- Se puede ejecutar más de una vez (CREATE TABLE IF NOT EXISTS / INSERT ... WHERE NOT EXISTS).

CREATE TABLE IF NOT EXISTS Config_Cargo_Manual (
  Cargo              VARCHAR(50)  COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  Ubicacion          VARCHAR(150) NULL,
  JefeInmediato      VARCHAR(150) NULL,
  NivelJerarquico    VARCHAR(50)  NULL,
  Objetivo           TEXT NULL,
  Autoridad          TEXT NULL,
  Edad               VARCHAR(200) NULL,
  Genero             VARCHAR(100) NULL,
  Educacion          VARCHAR(300) NULL,
  Formacion          TEXT NULL,
  Experiencia        VARCHAR(300) NULL,
  CargosQueReportan  VARCHAR(500) NULL,
  AQuienReporta      VARCHAR(500) NULL,
  RevisadoPor        VARCHAR(150) NULL,
  RevisadoCargo      VARCHAR(150) NULL,
  AprobadoPor        VARCHAR(150) NULL,
  AprobadoCargo      VARCHAR(150) NULL,
  UsaSstComun        TINYINT(1) NOT NULL DEFAULT 1,
  CambiosSinPublicar TINYINT(1) NOT NULL DEFAULT 0,
  UsuarioActualiza   VARCHAR(100) NULL,
  FechaActualiza     DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Renglones del manual. Cargo = '__SST_COMUN__' guarda las responsabilidades SST comunes a todos los cargos.
CREATE TABLE IF NOT EXISTS Config_Cargo_Funciones (
  Id      INT AUTO_INCREMENT PRIMARY KEY,
  Cargo   VARCHAR(50) COLLATE utf8mb4_bin NOT NULL,
  Seccion ENUM('RESPONSABILIDAD','FUNCION','SST') NOT NULL,
  Orden   INT NOT NULL DEFAULT 0,
  Texto   TEXT NOT NULL,
  KEY idx_ccf_cargo_seccion (Cargo, Seccion, Orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Control de cambios. Contenido (JSON) solo en las versiones publicadas desde la app o en la carga inicial;
-- las versiones históricas anteriores quedan solo con fecha y descripción.
CREATE TABLE IF NOT EXISTS Config_Cargo_Manual_Versiones (
  Id            INT AUTO_INCREMENT PRIMARY KEY,
  Cargo         VARCHAR(50) COLLATE utf8mb4_bin NOT NULL,
  Version       INT NOT NULL,
  FechaEmision  DATE NOT NULL,
  Descripcion   VARCHAR(500) NOT NULL,
  Contenido     LONGTEXT NULL,
  Usuario       VARCHAR(100) NULL,
  FechaRegistro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ccmv_cargo_version (Cargo, Version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pestaña (la ven Selección y Sistema; editar y publicar lo decide Config_Parametros)
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'talenthub', 'CargosFunciones', 'CoorSelección, Selección, Selección Centro, Sistema', 1, 'Cargos y Funciones',
       '/talenthub?tab=CargosFunciones', 5, '❖', 'Manual de funciones por cargo (SST-MA-002)'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'talenthub' AND Seccion = 'CargosFunciones');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Cargos y Funciones', 'Roles que pueden editar y publicar manuales de funciones', 'Rol', 'Sistema, CoorSelección',
       'Roles (separados por coma) que pueden crear cargos, editar el manual de funciones y publicar nuevas versiones en Talent Hub › Cargos y Funciones. Los demás roles con acceso a la pestaña solo lo ven. Vacío = nadie puede editar.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Cargos y Funciones'
                  AND Concepto = 'Roles que pueden editar y publicar manuales de funciones');

-- Responsabilidades SST comunes (las heredan los cargos con UsaSstComun = 1)
INSERT INTO Config_Cargo_Funciones (Cargo, Seccion, Orden, Texto) SELECT '__SST_COMUN__', 'SST', 1, 'Velar por el cumplimiento de las Políticas, Objetivos, Misión, Visión, Reglamentos y programas existentes en el SST (Seguridad, Salud en el Trabajo y Ambiente) en la organización.' WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Funciones WHERE Cargo = '__SST_COMUN__' AND Seccion = 'SST' AND Orden = 1);
INSERT INTO Config_Cargo_Funciones (Cargo, Seccion, Orden, Texto) SELECT '__SST_COMUN__', 'SST', 2, 'Cumplir con la implementación de los procesos existentes en Seguridad, Salud Ocupacional y Ambiente (utilización de formatos según sea el caso).' WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Funciones WHERE Cargo = '__SST_COMUN__' AND Seccion = 'SST' AND Orden = 2);
INSERT INTO Config_Cargo_Funciones (Cargo, Seccion, Orden, Texto) SELECT '__SST_COMUN__', 'SST', 3, 'Realizar sus actividades de forma segura, promoviendo su autocuidado, evitando generar impacto al medio ambiente, preservando los bienes de la Compañía y manteniendo una actitud preventiva y proactiva.' WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Funciones WHERE Cargo = '__SST_COMUN__' AND Seccion = 'SST' AND Orden = 3);
INSERT INTO Config_Cargo_Funciones (Cargo, Seccion, Orden, Texto) SELECT '__SST_COMUN__', 'SST', 4, 'Conocer y cumplir el programa de clasificación de residuos sólidos establecido por la Compañía.' WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Funciones WHERE Cargo = '__SST_COMUN__' AND Seccion = 'SST' AND Orden = 4);
INSERT INTO Config_Cargo_Funciones (Cargo, Seccion, Orden, Texto) SELECT '__SST_COMUN__', 'SST', 5, 'Desarrollar las actividades asignadas por el COPASST, Comité de Convivencia y Brigadista.' WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Funciones WHERE Cargo = '__SST_COMUN__' AND Seccion = 'SST' AND Orden = 5);
INSERT INTO Config_Cargo_Funciones (Cargo, Seccion, Orden, Texto) SELECT '__SST_COMUN__', 'SST', 6, 'Liderar y participar activamente en las reuniones o capacitaciones concernientes a Seguridad, Salud en el Trabajo y Ambiente.' WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Funciones WHERE Cargo = '__SST_COMUN__' AND Seccion = 'SST' AND Orden = 6);
INSERT INTO Config_Cargo_Funciones (Cargo, Seccion, Orden, Texto) SELECT '__SST_COMUN__', 'SST', 7, 'Establecer el uso adecuado de ahorro de agua y energía.' WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Funciones WHERE Cargo = '__SST_COMUN__' AND Seccion = 'SST' AND Orden = 7);
INSERT INTO Config_Cargo_Funciones (Cargo, Seccion, Orden, Texto) SELECT '__SST_COMUN__', 'SST', 8, 'Garantizar el uso, cuidado y mantenimiento de los elementos de protección personal y demás elementos de seguridad industrial requeridos para el desarrollo de las tareas, actividades y operación.' WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Funciones WHERE Cargo = '__SST_COMUN__' AND Seccion = 'SST' AND Orden = 8);
INSERT INTO Config_Cargo_Funciones (Cargo, Seccion, Orden, Texto) SELECT '__SST_COMUN__', 'SST', 9, 'Reportar todos los actos inseguros, condiciones inseguras, incidentes y/o accidentes de trabajo inmediatamente a su jefe directo.' WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Funciones WHERE Cargo = '__SST_COMUN__' AND Seccion = 'SST' AND Orden = 9);
INSERT INTO Config_Cargo_Funciones (Cargo, Seccion, Orden, Texto) SELECT '__SST_COMUN__', 'SST', 10, 'Suministrar información de forma clara, veraz y completa sobre su estado de salud.' WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Funciones WHERE Cargo = '__SST_COMUN__' AND Seccion = 'SST' AND Orden = 10);
INSERT INTO Config_Cargo_Funciones (Cargo, Seccion, Orden, Texto) SELECT '__SST_COMUN__', 'SST', 11, 'Procurar el cuidado integral de su salud.' WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Funciones WHERE Cargo = '__SST_COMUN__' AND Seccion = 'SST' AND Orden = 11);
INSERT INTO Config_Cargo_Funciones (Cargo, Seccion, Orden, Texto) SELECT '__SST_COMUN__', 'SST', 12, 'Participar en las actividades de capacitación de acuerdo al plan de trabajo SG-SST.' WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Funciones WHERE Cargo = '__SST_COMUN__' AND Seccion = 'SST' AND Orden = 12);

-- AUXILIAR LOGISTICO
INSERT INTO Config_Cargo_Manual (Cargo, Ubicacion, JefeInmediato, NivelJerarquico, Objetivo, Autoridad, Edad, Genero, Educacion, Formacion, Experiencia, CargosQueReportan, AQuienReporta, RevisadoPor, RevisadoCargo, AprobadoPor, AprobadoCargo, UsaSstComun, CambiosSinPublicar, UsuarioActualiza, FechaActualiza)
SELECT 'AUXILIAR LOGISTICO', 'Sede Operativa', 'Coordinador de centro de trabajo', 'Operativo', 'Apoyar en la gestión integral de la cadena logística dentro y fuera del Centro de Distribución, asegurando la correcta recepción y cargue de mercancías de acuerdo con los procedimientos establecidos y las políticas de Salud Ocupacional.', 'N/A', 'Preferiblemente de 18 a 40 años', 'Preferiblemente masculino', 'Que sepa leer y escribir', 'N/A', 'No requiere', 'N/A', 'Jefe directo, Recursos Humanos, Gerencia, Seguridad y Salud en el Trabajo', NULL, NULL, NULL, NULL, 1, 0, 'Carga inicial', NOW()
WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Manual WHERE Cargo = 'AUXILIAR LOGISTICO');
INSERT INTO Config_Cargo_Funciones (Cargo, Seccion, Orden, Texto)
SELECT t.Cargo, t.Seccion, t.Orden, t.Texto FROM (
  SELECT 'AUXILIAR LOGISTICO' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 1 AS Orden, 'Atender los vehículos.' AS Texto
  UNION ALL
  SELECT 'AUXILIAR LOGISTICO' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 2 AS Orden, 'Mantener en óptimas condiciones su área de trabajo, garantizando la movilidad de los equipos y la aplicación de las normas de seguridad.' AS Texto
  UNION ALL
  SELECT 'AUXILIAR LOGISTICO' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 3 AS Orden, 'Realizar la labor asignada siguiendo las directrices del cliente.' AS Texto
  UNION ALL
  SELECT 'AUXILIAR LOGISTICO' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 4 AS Orden, 'Apoyar las diferentes actividades imprevistas que se soliciten.' AS Texto
  UNION ALL
  SELECT 'AUXILIAR LOGISTICO' AS Cargo, 'FUNCION' AS Seccion, 1 AS Orden, 'Cargar y descargar vehículos.' AS Texto
  UNION ALL
  SELECT 'AUXILIAR LOGISTICO' AS Cargo, 'FUNCION' AS Seccion, 2 AS Orden, 'Informar al líder en caso de identificar mercancía averiada o en mal estado, así como situaciones de hurto, recepción de propinas, eventos por el estado del camión que pongan en riesgo la mercancía y daños en instalaciones y equipos.' AS Texto
  UNION ALL
  SELECT 'AUXILIAR LOGISTICO' AS Cargo, 'FUNCION' AS Seccion, 3 AS Orden, 'Alistar mercancía para el despacho.' AS Texto
  UNION ALL
  SELECT 'AUXILIAR LOGISTICO' AS Cargo, 'FUNCION' AS Seccion, 4 AS Orden, 'Poner especial atención en la manipulación de la mercancía de línea blanca y línea marrón antes de ser cargada o descargada para evitar y/o identificar averías.' AS Texto
  UNION ALL
  SELECT 'AUXILIAR LOGISTICO' AS Cargo, 'FUNCION' AS Seccion, 5 AS Orden, 'Apadrinar mercancías a solicitud del proveedor.' AS Texto
  UNION ALL
  SELECT 'AUXILIAR LOGISTICO' AS Cargo, 'FUNCION' AS Seccion, 6 AS Orden, 'Mantener limpias las áreas de trabajo.' AS Texto
  UNION ALL
  SELECT 'AUXILIAR LOGISTICO' AS Cargo, 'FUNCION' AS Seccion, 7 AS Orden, 'Estibar la mercancía respetando los pictogramas.' AS Texto
  UNION ALL
  SELECT 'AUXILIAR LOGISTICO' AS Cargo, 'FUNCION' AS Seccion, 8 AS Orden, 'Paletizar mercancía optimizando el recurso.' AS Texto
  UNION ALL
  SELECT 'AUXILIAR LOGISTICO' AS Cargo, 'FUNCION' AS Seccion, 9 AS Orden, 'Destellar mercancía según los requerimientos del cliente.' AS Texto
  UNION ALL
  SELECT 'AUXILIAR LOGISTICO' AS Cargo, 'FUNCION' AS Seccion, 10 AS Orden, 'Además de las tareas principales, todas aquellas inherentes al cargo y que le sean asignadas por el jefe directo.' AS Texto
) t
WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Funciones WHERE Cargo = 'AUXILIAR LOGISTICO');
INSERT INTO Config_Cargo_Manual_Versiones (Cargo, Version, FechaEmision, Descripcion, Contenido, Usuario)
SELECT 'AUXILIAR LOGISTICO', 1, '2024-11-01', 'Documento inicial', '{"cargo": "AUXILIAR LOGISTICO", "version": 1, "fechaEmision": "2024-11-01", "ficha": {"ubicacion": "Sede Operativa", "jefeInmediato": "Coordinador de centro de trabajo", "nivelJerarquico": "Operativo", "objetivo": "Apoyar en la gestión integral de la cadena logística dentro y fuera del Centro de Distribución, asegurando la correcta recepción y cargue de mercancías de acuerdo con los procedimientos establecidos y las políticas de Salud Ocupacional.", "autoridad": "N/A", "edad": "Preferiblemente de 18 a 40 años", "genero": "Preferiblemente masculino", "educacion": "Que sepa leer y escribir", "formacion": "N/A", "experiencia": "No requiere", "cargosQueReportan": "N/A", "aQuienReporta": "Jefe directo, Recursos Humanos, Gerencia, Seguridad y Salud en el Trabajo", "revisadoPor": "", "revisadoCargo": "", "aprobadoPor": "", "aprobadoCargo": ""}, "usaSstComun": true, "responsabilidades": ["Atender los vehículos.", "Mantener en óptimas condiciones su área de trabajo, garantizando la movilidad de los equipos y la aplicación de las normas de seguridad.", "Realizar la labor asignada siguiendo las directrices del cliente.", "Apoyar las diferentes actividades imprevistas que se soliciten."], "funciones": ["Cargar y descargar vehículos.", "Informar al líder en caso de identificar mercancía averiada o en mal estado, así como situaciones de hurto, recepción de propinas, eventos por el estado del camión que pongan en riesgo la mercancía y daños en instalaciones y equipos.", "Alistar mercancía para el despacho.", "Poner especial atención en la manipulación de la mercancía de línea blanca y línea marrón antes de ser cargada o descargada para evitar y/o identificar averías.", "Apadrinar mercancías a solicitud del proveedor.", "Mantener limpias las áreas de trabajo.", "Estibar la mercancía respetando los pictogramas.", "Paletizar mercancía optimizando el recurso.", "Destellar mercancía según los requerimientos del cliente.", "Además de las tareas principales, todas aquellas inherentes al cargo y que le sean asignadas por el jefe directo."], "sst": ["Velar por el cumplimiento de las Políticas, Objetivos, Misión, Visión, Reglamentos y programas existentes en el SST (Seguridad, Salud en el Trabajo y Ambiente) en la organización.", "Cumplir con la implementación de los procesos existentes en Seguridad, Salud Ocupacional y Ambiente (utilización de formatos según sea el caso).", "Realizar sus actividades de forma segura, promoviendo su autocuidado, evitando generar impacto al medio ambiente, preservando los bienes de la Compañía y manteniendo una actitud preventiva y proactiva.", "Conocer y cumplir el programa de clasificación de residuos sólidos establecido por la Compañía.", "Desarrollar las actividades asignadas por el COPASST, Comité de Convivencia y Brigadista.", "Liderar y participar activamente en las reuniones o capacitaciones concernientes a Seguridad, Salud en el Trabajo y Ambiente.", "Establecer el uso adecuado de ahorro de agua y energía.", "Garantizar el uso, cuidado y mantenimiento de los elementos de protección personal y demás elementos de seguridad industrial requeridos para el desarrollo de las tareas, actividades y operación.", "Reportar todos los actos inseguros, condiciones inseguras, incidentes y/o accidentes de trabajo inmediatamente a su jefe directo.", "Suministrar información de forma clara, veraz y completa sobre su estado de salud.", "Procurar el cuidado integral de su salud.", "Participar en las actividades de capacitación de acuerdo al plan de trabajo SG-SST."]}', 'Carga inicial'
WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Manual_Versiones WHERE Cargo = 'AUXILIAR LOGISTICO' AND Version = 1);

-- MONTACARGUISTA
INSERT INTO Config_Cargo_Manual (Cargo, Ubicacion, JefeInmediato, NivelJerarquico, Objetivo, Autoridad, Edad, Genero, Educacion, Formacion, Experiencia, CargosQueReportan, AQuienReporta, RevisadoPor, RevisadoCargo, AprobadoPor, AprobadoCargo, UsaSstComun, CambiosSinPublicar, UsuarioActualiza, FechaActualiza)
SELECT 'MONTACARGUISTA', 'Sedes Operativas', 'Coordinador de operaciones', 'Operativo', 'El objetivo principal del cargo de montacarguista es manejar y operar montacargas para transportar, cargar, descargar y apilar materiales o mercancías en un entorno de almacén, fábrica o área de distribución. El operador debe garantizar que estas tareas se realicen de manera eficiente, segura y conforme a las normativas de seguridad laboral.', 'Tiene la autoridad de dar directrices a los auxiliares logisticos', 'Preferiblemente mayor a 20 años', 'N/A', 'N/A', 'Curso de montacarguista', '6 meses', 'N/A', 'Coordinador de operaciones', 'Esteban Velasquez Quintero', 'Coordinador de Calidad', 'Carlos Gomez', 'Gerente de Operaciones', 0, 0, 'Carga inicial', NOW()
WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Manual WHERE Cargo = 'MONTACARGUISTA');
INSERT INTO Config_Cargo_Funciones (Cargo, Seccion, Orden, Texto)
SELECT t.Cargo, t.Seccion, t.Orden, t.Texto FROM (
  SELECT 'MONTACARGUISTA' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 1 AS Orden, 'Asegurar el manejo adecuado y seguro del montacargas en todo momento, siguiendo los procedimientos establecidos para evitar accidentes o daños.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 2 AS Orden, 'Asegurarse de que los productos se almacenen correctamente según el sistema de inventario, con una organización adecuada para facilitar su acceso' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 3 AS Orden, 'Seguir todas las normas y regulaciones de seguridad laboral, como el uso de equipo de protección personal (EPP), señales de tránsito en el almacén y procedimientos de emergencia.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 4 AS Orden, 'Verificar que el montacargas no se sobrecargue, respetando las capacidades máximas de carga establecidas por el fabricante.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 5 AS Orden, 'Informar y coordinar con otros miembros del equipo, supervisores o personal de almacén para garantizar que las operaciones se realicen de manera sincronizada y eficiente.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 6 AS Orden, 'Mantener el montacargas limpio y en buen estado, realizando tareas básicas de limpieza del equipo y asegurándose de que esté siempre operativo.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 7 AS Orden, 'Asegurarse de que las áreas de trabajo estén libres de obstáculos y peligros que puedan poner en riesgo la seguridad de las personas o la integridad de las mercancías.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 8 AS Orden, 'Informar inmediatamente sobre cualquier mal funcionamiento o daño en el equipo para realizar las reparaciones necesarias.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'FUNCION' AS Seccion, 1 AS Orden, 'Realizar inspecciones diarias antes del uso, verificando que el montacargas esté en condiciones óptimas para su operación (revisar frenos, luces, llantas, carga máxima, etc.).' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'FUNCION' AS Seccion, 2 AS Orden, 'Transportar, cargar y descargar materiales o productos de manera eficiente y precisa, asegurándose de que las mercancías estén correctamente apiladas y almacenadas.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'FUNCION' AS Seccion, 3 AS Orden, 'Trasladar materiales o productos dentro de las instalaciones, ya sea para apilarlos, moverlos a otras áreas de almacenamiento o prepararlos para su distribución.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'FUNCION' AS Seccion, 4 AS Orden, 'Registrar y reportar cualquier incidencia en la operación del montacargas (fallos, accidentes menores, mal funcionamiento del equipo) a su supervisor inmediato.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'FUNCION' AS Seccion, 5 AS Orden, 'Mover de manera segura los productos desde el área de recepción hasta las estanterías de almacenamiento, o desde estas hasta el área de carga o distribución.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'FUNCION' AS Seccion, 6 AS Orden, 'Colocar los productos de manera organizada en estanterías, utilizando el montacargas para apilar de forma eficiente y ordenada, sin sobrecargar las estanterías.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'FUNCION' AS Seccion, 7 AS Orden, 'Cargar los camiones de distribución con los productos o materiales requeridos, y descargar los productos que llegan de los proveedores de manera ordenada y eficiente.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'FUNCION' AS Seccion, 8 AS Orden, 'Asegurarse de que los productos se coloquen en las ubicaciones correctas, facilitando el proceso de toma de inventarios y mejorando la logística del almacén.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'FUNCION' AS Seccion, 9 AS Orden, 'Colaborar con el personal de almacén y supervisores para mantener el orden y la precisión en el registro del inventario.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'FUNCION' AS Seccion, 10 AS Orden, 'Trasladar los productos a diferentes áreas dentro de la planta o almacén según las indicaciones de los supervisores o el sistema de gestión' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'SST' AS Seccion, 1 AS Orden, 'Velar por el cumplimiento de las Políticas, Objetivos, Misión, Visión, Reglamentos y programas existentes en el SSTA (Seguridad, Salud Ocupacional y Ambiente) en la organización.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'SST' AS Seccion, 2 AS Orden, 'Cumplir con la implementación de los procesos existentes en Seguridad, Salud en el trabajo y Ambiente (utilización de formatos según sea el caso y su archivo).' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'SST' AS Seccion, 3 AS Orden, 'Realizar sus actividades de forma segura, promoviendo su autocuidado, evitando generar impacto al medio ambiente, preservando los bienes de la Compañía y manteniendo una actitud preventiva y proactiva.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'SST' AS Seccion, 4 AS Orden, 'Verificar que en todos los contratos se cumpla con las Políticas, Normas y Estándares de Seguridad, Salud en el trabajo y Ambiente.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'SST' AS Seccion, 5 AS Orden, 'Conocer y cumplir el programa de clasificación de residuos sólidos establecido por la Compañía.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'SST' AS Seccion, 6 AS Orden, 'Desarrollar las actividades asignadas como integrante del COPASST, Comité de Convivencia y Brigadista (en caso de serlo) o participar en su elección.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'SST' AS Seccion, 7 AS Orden, 'Revisar la inclusión de temas relacionados con la salud de los trabajadores, la seguridad de la operación y la protección del medio Ambiente en las reuniones establecidas por los clientes para estas áreas.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'SST' AS Seccion, 8 AS Orden, 'Liderar y participar activamente en las reuniones o capacitaciones concernientes a Seguridad, Salud en el trabajo y Ambiente.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'SST' AS Seccion, 9 AS Orden, 'Establecer el uso adecuado de ahorro de agua y energía.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'SST' AS Seccion, 10 AS Orden, 'Garantizar el uso, cuidado y mantenimiento de los elementos de protección personal y demás elementos de seguridad industrial requeridos para el desarrollo de las tareas, actividades y operación.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'SST' AS Seccion, 11 AS Orden, 'Promover, recolectar y enviar el reporte de actos y condiciones inseguras en todas las áreas de la organización.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'SST' AS Seccion, 12 AS Orden, 'Además de las tareas principales, todas aquellas tareas inherentes al cargo, y que le sean asignadas por el jefe inmediato.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'SST' AS Seccion, 13 AS Orden, 'Suministrar información de forma clara, veraz y completa sobre su estado de salud.' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'SST' AS Seccion, 14 AS Orden, 'Procurar el cuidado integral de su salud' AS Texto
  UNION ALL
  SELECT 'MONTACARGUISTA' AS Cargo, 'SST' AS Seccion, 15 AS Orden, 'Participar en las actividades de capacitación de acuerdo al plan de trabajo SG-SST' AS Texto
) t
WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Funciones WHERE Cargo = 'MONTACARGUISTA');
INSERT INTO Config_Cargo_Manual_Versiones (Cargo, Version, FechaEmision, Descripcion, Contenido, Usuario)
SELECT 'MONTACARGUISTA', 1, '2015-10-05', 'Documento inicial', NULL, 'Carga inicial'
WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Manual_Versiones WHERE Cargo = 'MONTACARGUISTA' AND Version = 1);
INSERT INTO Config_Cargo_Manual_Versiones (Cargo, Version, FechaEmision, Descripcion, Contenido, Usuario)
SELECT 'MONTACARGUISTA', 2, '2024-11-01', 'Definir claramente las responsabilidades; omitir funciones y responsabilidades duplicadas; definir las competencias del perfil; establecer el control de cambios', '{"cargo": "MONTACARGUISTA", "version": 2, "fechaEmision": "2024-11-01", "ficha": {"ubicacion": "Sedes Operativas", "jefeInmediato": "Coordinador de operaciones", "nivelJerarquico": "Operativo", "objetivo": "El objetivo principal del cargo de montacarguista es manejar y operar montacargas para transportar, cargar, descargar y apilar materiales o mercancías en un entorno de almacén, fábrica o área de distribución. El operador debe garantizar que estas tareas se realicen de manera eficiente, segura y conforme a las normativas de seguridad laboral.", "autoridad": "Tiene la autoridad de dar directrices a los auxiliares logisticos", "edad": "Preferiblemente mayor a 20 años", "genero": "N/A", "educacion": "N/A", "formacion": "Curso de montacarguista", "experiencia": "6 meses", "cargosQueReportan": "N/A", "aQuienReporta": "Coordinador de operaciones", "revisadoPor": "Esteban Velasquez Quintero", "revisadoCargo": "Coordinador de Calidad", "aprobadoPor": "Carlos Gomez", "aprobadoCargo": "Gerente de Operaciones"}, "usaSstComun": false, "responsabilidades": ["Asegurar el manejo adecuado y seguro del montacargas en todo momento, siguiendo los procedimientos establecidos para evitar accidentes o daños.", "Asegurarse de que los productos se almacenen correctamente según el sistema de inventario, con una organización adecuada para facilitar su acceso", "Seguir todas las normas y regulaciones de seguridad laboral, como el uso de equipo de protección personal (EPP), señales de tránsito en el almacén y procedimientos de emergencia.", "Verificar que el montacargas no se sobrecargue, respetando las capacidades máximas de carga establecidas por el fabricante.", "Informar y coordinar con otros miembros del equipo, supervisores o personal de almacén para garantizar que las operaciones se realicen de manera sincronizada y eficiente.", "Mantener el montacargas limpio y en buen estado, realizando tareas básicas de limpieza del equipo y asegurándose de que esté siempre operativo.", "Asegurarse de que las áreas de trabajo estén libres de obstáculos y peligros que puedan poner en riesgo la seguridad de las personas o la integridad de las mercancías.", "Informar inmediatamente sobre cualquier mal funcionamiento o daño en el equipo para realizar las reparaciones necesarias."], "funciones": ["Realizar inspecciones diarias antes del uso, verificando que el montacargas esté en condiciones óptimas para su operación (revisar frenos, luces, llantas, carga máxima, etc.).", "Transportar, cargar y descargar materiales o productos de manera eficiente y precisa, asegurándose de que las mercancías estén correctamente apiladas y almacenadas.", "Trasladar materiales o productos dentro de las instalaciones, ya sea para apilarlos, moverlos a otras áreas de almacenamiento o prepararlos para su distribución.", "Registrar y reportar cualquier incidencia en la operación del montacargas (fallos, accidentes menores, mal funcionamiento del equipo) a su supervisor inmediato.", "Mover de manera segura los productos desde el área de recepción hasta las estanterías de almacenamiento, o desde estas hasta el área de carga o distribución.", "Colocar los productos de manera organizada en estanterías, utilizando el montacargas para apilar de forma eficiente y ordenada, sin sobrecargar las estanterías.", "Cargar los camiones de distribución con los productos o materiales requeridos, y descargar los productos que llegan de los proveedores de manera ordenada y eficiente.", "Asegurarse de que los productos se coloquen en las ubicaciones correctas, facilitando el proceso de toma de inventarios y mejorando la logística del almacén.", "Colaborar con el personal de almacén y supervisores para mantener el orden y la precisión en el registro del inventario.", "Trasladar los productos a diferentes áreas dentro de la planta o almacén según las indicaciones de los supervisores o el sistema de gestión"], "sst": ["Velar por el cumplimiento de las Políticas, Objetivos, Misión, Visión, Reglamentos y programas existentes en el SSTA (Seguridad, Salud Ocupacional y Ambiente) en la organización.", "Cumplir con la implementación de los procesos existentes en Seguridad, Salud en el trabajo y Ambiente (utilización de formatos según sea el caso y su archivo).", "Realizar sus actividades de forma segura, promoviendo su autocuidado, evitando generar impacto al medio ambiente, preservando los bienes de la Compañía y manteniendo una actitud preventiva y proactiva.", "Verificar que en todos los contratos se cumpla con las Políticas, Normas y Estándares de Seguridad, Salud en el trabajo y Ambiente.", "Conocer y cumplir el programa de clasificación de residuos sólidos establecido por la Compañía.", "Desarrollar las actividades asignadas como integrante del COPASST, Comité de Convivencia y Brigadista (en caso de serlo) o participar en su elección.", "Revisar la inclusión de temas relacionados con la salud de los trabajadores, la seguridad de la operación y la protección del medio Ambiente en las reuniones establecidas por los clientes para estas áreas.", "Liderar y participar activamente en las reuniones o capacitaciones concernientes a Seguridad, Salud en el trabajo y Ambiente.", "Establecer el uso adecuado de ahorro de agua y energía.", "Garantizar el uso, cuidado y mantenimiento de los elementos de protección personal y demás elementos de seguridad industrial requeridos para el desarrollo de las tareas, actividades y operación.", "Promover, recolectar y enviar el reporte de actos y condiciones inseguras en todas las áreas de la organización.", "Además de las tareas principales, todas aquellas tareas inherentes al cargo, y que le sean asignadas por el jefe inmediato.", "Suministrar información de forma clara, veraz y completa sobre su estado de salud.", "Procurar el cuidado integral de su salud", "Participar en las actividades de capacitación de acuerdo al plan de trabajo SG-SST"]}', 'Carga inicial'
WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Manual_Versiones WHERE Cargo = 'MONTACARGUISTA' AND Version = 2);

-- COORDINADOR REGIONAL
INSERT INTO Config_Cargo_Manual (Cargo, Ubicacion, JefeInmediato, NivelJerarquico, Objetivo, Autoridad, Edad, Genero, Educacion, Formacion, Experiencia, CargosQueReportan, AQuienReporta, RevisadoPor, RevisadoCargo, AprobadoPor, AprobadoCargo, UsaSstComun, CambiosSinPublicar, UsuarioActualiza, FechaActualiza)
SELECT 'COORDINADOR REGIONAL', 'Sede Operativa', 'Subgerente de Operaciones', 'Administrativo', 'Dirigir y controlar a nivel nacional el correcto desarrollo de los procesos operativos en cada Centro de Trabajo, supervisando y guiando las estrategias para el cumplimiento de los objetivos, y velando por el acatamiento de los compromisos, contratos y acuerdos con los clientes en lo que respecta a la eficiencia en la prestación de servicios y el control de calidad.', 'Autorizado para responder comunicaciones verbales y escritas de clientes internos y externos', 'Preferiblemente mayor a 25 años', 'N/A', 'Preferiblemente tecnólogo en carreras administrativas o logisticas', 'Manejo de Oficce ( Exel, word, power point ) internet, manejo de correo electronico , manejo de personal', '6 meses en cargos similares o como lider de operación', 'Auxiliares logisticos , Auxiliares administrativos , Lider logistico', 'Jefe directo, Recursos humanos, Gerencia, Seguridad y Salud en el trabajo', 'Esteban Velasquez Quintero', 'Coordinador de Calidad', 'Carlos Gomez', 'Gerente de Operaciones', 0, 0, 'Carga inicial', NOW()
WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Manual WHERE Cargo = 'COORDINADOR REGIONAL');
INSERT INTO Config_Cargo_Funciones (Cargo, Seccion, Orden, Texto)
SELECT t.Cargo, t.Seccion, t.Orden, t.Texto FROM (
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 1 AS Orden, 'Supervisar permanentemente la operación para asegurar el cumplimiento de los procedimientos y estándares de calidad.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 2 AS Orden, 'Cumplir el horario asignado por su jefe inmediato.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 3 AS Orden, 'Fomentar un buen ambiente sano que promueva la identificación y resolución proactiva de problemas.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 4 AS Orden, 'Supervisar el desempeño y los resultados de las operaciones, tomando medidas correctivas cuando sea necesario.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 5 AS Orden, 'Asegurar la precisión de la información ingresada en la aplicación de operaciones, indicadores y asistencia, validando que los tiempos de atención registrados sean coherentes y reales, y verificando que todos los datos introducidos sean correctos y completos.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 6 AS Orden, 'Velar por la veracidad de los reportes de asistencia' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 7 AS Orden, 'Monitorear constantemente el estado de avance de la labor en el turno, según el flujo de trabajo establecido. Atender los requerimientos del cliente.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 8 AS Orden, 'Realizar oportunamente los reportes de novedades del personal al proceso de Talento humano, cumpliendo con lo establecido en el "Instructivo gestión personal en el centro de operación"' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 9 AS Orden, 'Asegurar la solicitud y la entrega de los Epps en cada centro de operación, según necesidad justificada por el Auxiliar SST' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 10 AS Orden, 'Validar diariamente las Planillas de control de vehículos, las de servicios y/o las de hora hombre que aplican a su operación teniendo en cuenta que deben coincidir con los recibos físicos (aplica para centros de operación en donde se maneja efectivo).' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 11 AS Orden, 'Asegurar la entrega de las planillas de control en las operaciones que lo requieran' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 12 AS Orden, 'Validar y gestionar la aprobación de la conciliación de facturación realizada con el cliente, según la frecuencia acordada (semanal o quincenal).' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 13 AS Orden, 'Realizar el cierre de la operación, validando que no queden vehículos por cobrar, y en caso de que queden reportarlo en la bitácora.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 14 AS Orden, 'Realizar las inspecciones, charlas, divulgaciones en temas de la operación y de SSTA al personal del centro de trabajo' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 15 AS Orden, 'Notificar a direccion de talento humano condiciones inseguras, reporte de accidentes, reporte de enferemedades.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 16 AS Orden, 'Llevar registro consolidado de todos los casos de salud, ausentimos y acta de seguimiento de cada caso y Velar por el cumplimiento de las recomendaciones medicas' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 17 AS Orden, 'Velar por los ingresos y egresos del centro de trabajo' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 18 AS Orden, 'Coordinar ejecutar y gestionar las diferentes actividades imprevistas que se requieran en la operación' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 19 AS Orden, 'Estar en comunicacion constante con el cliente' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 20 AS Orden, 'Velar por el cumplimiento de los acuerdos contractuales' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 21 AS Orden, 'Velar por el cumplimiento de la normatividad de SST en los Centro de Trabajo' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 22 AS Orden, 'Supervisar el correcto desarrollo de las actividades en los Centros de Trabajo' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 23 AS Orden, 'Presentar avances y soluciones a los problemas que se presenten en desarrollo de la ejecución de los contratos suscritos entre la compañía y los clientes en el Comité de Gerencia.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 24 AS Orden, 'Apoyar administrativa y operativamente a las líneas de negocio de su área.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 25 AS Orden, 'Control y reporte de novedades de personal operativo (hora de llegada, salida, permisos, incapacidades, ausentismos,programación, desempeño, etc )' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 26 AS Orden, 'Proporcionar los recursos necesarios para que el personal comprenda y cumpla con los procedimientos y estándares de calidad establecidos' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 27 AS Orden, 'Estar atento a las diferentes actividades imprevistas que se soliciten' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 28 AS Orden, 'Manejo de caja menor' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 29 AS Orden, 'Colaborar en las Investigaciones de cualquier incidente o accidente ocurrido en las operaciones logísticas' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 30 AS Orden, 'informar cualquier incidente de seguridad que se presente en las operaciones al director de riesgos y seguridad' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 31 AS Orden, 'Mantener una relación cercana con las autoridades locales y llegado el caso solicitar su colaboración.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 32 AS Orden, 'Proponer ideas que aporten a la mejora y rendimiento de la calidad del servicio' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 1 AS Orden, 'Solicitar y evaluar la programación de las unidades, cajas y cantidad de vehículos a recibir en el siguiente turno.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 2 AS Orden, 'Socializar la programación al personal.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 3 AS Orden, 'Hacer breves charlas de temas de escuela de capacitación, auto cuidado, presentación personal etc, para mantener la calidad del servicio.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 4 AS Orden, 'Diligenciar en la bitácora la fecha y hora de inicio del turno y, a renglón seguido y sin espacios, las novedades que se presenten, a fin de que el siguiente turno pueda darles seguimiento' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 5 AS Orden, 'Programar al personal operativo para la realización efectivo de las actividades a su cargo' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 6 AS Orden, 'En caso de presentarse ausentismos revisar posteriormente la razón por la que no se presentó el personal y registrarlo en el reporte diario de asistencia.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 7 AS Orden, 'Coordinar el cargue, descargue, carpe y descarpe de vehiculos' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 8 AS Orden, 'Realización de planillas de carge y digitalizarlas' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 9 AS Orden, 'Realizar rondas para validar estado de los muelles, recursos, estibas disponibles, estibadores manuales, y demás herramientas e insumos que se requieran.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 10 AS Orden, 'Hacer seguimiento a las personas que se incapacitan de manera reiterativa y reportar las causas.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 11 AS Orden, 'Recaudo de servicios para la operación que aplique' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 12 AS Orden, 'Relacionar ingresos y egresos del centro de trabajo a contabilidad' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 13 AS Orden, 'Realizar el reporte parcial de accidente de trabajo, si llega a ocurrir y enviarrlo al area de RRHH y SST' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 14 AS Orden, 'Realizar seguimiento en los reportes de AT e investigación de accidentes de trabajo si llega a ocurrir' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 15 AS Orden, 'Envio de novedades del personal a cargo al area de RRHH' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 16 AS Orden, 'Mantener la documentacion y la entrega de EPP del personal actualizada' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 17 AS Orden, 'Responder la solicitudes del cliente interno y externo' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 18 AS Orden, 'Garantizar que la informacion plasmada en los indicadores sea veridica' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 19 AS Orden, 'Revisar el control de asistencia desde la APP' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 20 AS Orden, 'Garantizar que la informacion compartida por la operacion sea la correcta antes de ser enviada al area correspondiente.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 21 AS Orden, 'Velar por el correcto manejo del dinero de cajas operativa, verificando soportes de gastos vs dinero en caja' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 22 AS Orden, 'Notificar en el area correpondiente el no cumplimiento de las normas establecidas por la compañia' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 23 AS Orden, 'Envio de incapacidades del personal a cargo al area de RRHH' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 24 AS Orden, 'Registrar vehiculos o servicios' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 25 AS Orden, 'Diligenciar el check list diario operativo' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 26 AS Orden, 'Mantener la correcta disposicion de las averias' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 27 AS Orden, 'Cumplir con la política y objetivos de calidad establecidos por la compañía.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 28 AS Orden, 'Presentar periódicamente informes de resultados al Gerente de Operaciones' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 29 AS Orden, 'Presentar oportunamente los indicadores de su área al Gerente de Operaciones' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 30 AS Orden, 'Velar por el oportuno cumplimiento de los procesos, procedimientos y registros establecidos por el Sistema de Gestión de Calidad.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 31 AS Orden, 'Cumplir los Acuerdos de Nivel de Servicio (ANS) establecidos por la compañía.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 32 AS Orden, 'Informar oportunamente al Departamento de Recursos Humanos, las ausencias, incapacidades, accidentes de trabajo y cualquier otra eventualidad, que se le presente.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 33 AS Orden, 'Mantener siempre cargado y encendido el medio de comunicación suministrado por la compañía y estar atento de manera que permanezca en contacto permanente.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 34 AS Orden, 'Dar cumplimiento a los instructivos diseñados para el desempeño de su trabajo.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 35 AS Orden, 'Las demás funciones asignadas por autoridad competente de acuerdo a las actividades propias del cargo' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 36 AS Orden, 'Realizar el informe y reporte de averias al area encargada' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 37 AS Orden, 'Realizar las inspecciones, charlas, divulgaciones en temas de la operación y de SST al personal del centro de trabajo' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 38 AS Orden, 'Dejar constancia en actas firmadas por el personal o bitácoras de las charlas brindadas' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 39 AS Orden, 'Organizar semanalmente charlas de concientización al personal operativo en cuanto a la seguridad física y el cuidado de la mercancía' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 40 AS Orden, 'Analizar y detectar posibles riesgos y amenazas de consumo, averías, hurto etc, en las operaciones que pueda afectar la imagen de la empresa' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 41 AS Orden, 'Dejar constancias fotográficas de elementos,estibas,equipos etc, que lleguen en mal estado en cualquiera de las operaciones,' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 42 AS Orden, 'Realizar las entrevistas laborales' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'FUNCION' AS Seccion, 43 AS Orden, 'Además de las tareas principales, todas aquellas inherentes al cargo, y que le sean asignadas por el jefe directo.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'SST' AS Seccion, 1 AS Orden, 'Velar por el cumplimiento de las Políticas, Objetivos, Misión, Visión, Reglamentos y programas existentes en el SST (Seguridad, Salud en el trabajo y Ambiente) en la organización.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'SST' AS Seccion, 2 AS Orden, 'Cumplir con la implementación de los procesos existentes en Seguridad, Salud Ocupacional y Ambiente (utilización de formatos según sea el caso).' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'SST' AS Seccion, 3 AS Orden, 'Realizar sus actividades de forma segura, promoviendo su autocuidado, evitando generar impacto al medio ambiente, preservando los bienes de la Compañía y manteniendo una actitud preventiva y proactiva.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'SST' AS Seccion, 4 AS Orden, 'Conocer y cumplir el programa de clasificación de residuos sólidos establecido por la Compañía.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'SST' AS Seccion, 5 AS Orden, 'Desarrollar las actividades asignadas por el COPASST, Comité de Convivencia y Brigadista.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'SST' AS Seccion, 6 AS Orden, 'Liderar y participar activamente en las reuniones o capacitaciones concernientes a Seguridad, Salud en el trabajo y Ambiente.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'SST' AS Seccion, 7 AS Orden, 'Establecer el uso adecuado de ahorro de agua y energía.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'SST' AS Seccion, 8 AS Orden, 'Garantizar el uso, cuidado y mantenimiento de los elementos de protección personal y demás elementos de seguridad industrial requerido para el desarrollo de las tareas, actividades y operación.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'SST' AS Seccion, 9 AS Orden, 'Reportar todos los actos inseguros, condiciones inseguras, incidentes y/o accidentes de trabajo inmediatamente a su jefe directo.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'SST' AS Seccion, 10 AS Orden, 'Además de las tareas principales, todas aquellas tareas inherentes al cargo, y que le sean asignadas por el jefe directo.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'SST' AS Seccion, 11 AS Orden, 'Suministrar información de forma clara, veraz y completa sobre su estado de salud.' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'SST' AS Seccion, 12 AS Orden, 'Procurar el cuidado integral de su salud' AS Texto
  UNION ALL
  SELECT 'COORDINADOR REGIONAL' AS Cargo, 'SST' AS Seccion, 13 AS Orden, 'Participar el las actividades de capacitación de acuerdo al plan de trabajo SG-SST' AS Texto
) t
WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Funciones WHERE Cargo = 'COORDINADOR REGIONAL');
INSERT INTO Config_Cargo_Manual_Versiones (Cargo, Version, FechaEmision, Descripcion, Contenido, Usuario)
SELECT 'COORDINADOR REGIONAL', 1, '2015-10-05', 'Documento inicial', NULL, 'Carga inicial'
WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Manual_Versiones WHERE Cargo = 'COORDINADOR REGIONAL' AND Version = 1);
INSERT INTO Config_Cargo_Manual_Versiones (Cargo, Version, FechaEmision, Descripcion, Contenido, Usuario)
SELECT 'COORDINADOR REGIONAL', 2, '2024-11-01', 'Definir claramente las responsabilidades; omitir funciones y responsabilidades duplicadas; definir las competencias del perfil; establecer el control de cambios', '{"cargo": "COORDINADOR REGIONAL", "version": 2, "fechaEmision": "2024-11-01", "ficha": {"ubicacion": "Sede Operativa", "jefeInmediato": "Subgerente de Operaciones", "nivelJerarquico": "Administrativo", "objetivo": "Dirigir y controlar a nivel nacional el correcto desarrollo de los procesos operativos en cada Centro de Trabajo, supervisando y guiando las estrategias para el cumplimiento de los objetivos, y velando por el acatamiento de los compromisos, contratos y acuerdos con los clientes en lo que respecta a la eficiencia en la prestación de servicios y el control de calidad.", "autoridad": "Autorizado para responder comunicaciones verbales y escritas de clientes internos y externos", "edad": "Preferiblemente mayor a 25 años", "genero": "N/A", "educacion": "Preferiblemente tecnólogo en carreras administrativas o logisticas", "formacion": "Manejo de Oficce ( Exel, word, power point ) internet, manejo de correo electronico , manejo de personal", "experiencia": "6 meses en cargos similares o como lider de operación", "cargosQueReportan": "Auxiliares logisticos , Auxiliares administrativos , Lider logistico", "aQuienReporta": "Jefe directo, Recursos humanos, Gerencia, Seguridad y Salud en el trabajo", "revisadoPor": "Esteban Velasquez Quintero", "revisadoCargo": "Coordinador de Calidad", "aprobadoPor": "Carlos Gomez", "aprobadoCargo": "Gerente de Operaciones"}, "usaSstComun": false, "responsabilidades": ["Supervisar permanentemente la operación para asegurar el cumplimiento de los procedimientos y estándares de calidad.", "Cumplir el horario asignado por su jefe inmediato.", "Fomentar un buen ambiente sano que promueva la identificación y resolución proactiva de problemas.", "Supervisar el desempeño y los resultados de las operaciones, tomando medidas correctivas cuando sea necesario.", "Asegurar la precisión de la información ingresada en la aplicación de operaciones, indicadores y asistencia, validando que los tiempos de atención registrados sean coherentes y reales, y verificando que todos los datos introducidos sean correctos y completos.", "Velar por la veracidad de los reportes de asistencia", "Monitorear constantemente el estado de avance de la labor en el turno, según el flujo de trabajo establecido. Atender los requerimientos del cliente.", "Realizar oportunamente los reportes de novedades del personal al proceso de Talento humano, cumpliendo con lo establecido en el \\"Instructivo gestión personal en el centro de operación\\"", "Asegurar la solicitud y la entrega de los Epps en cada centro de operación, según necesidad justificada por el Auxiliar SST", "Validar diariamente las Planillas de control de vehículos, las de servicios y/o las de hora hombre que aplican a su operación teniendo en cuenta que deben coincidir con los recibos físicos (aplica para centros de operación en donde se maneja efectivo).", "Asegurar la entrega de las planillas de control en las operaciones que lo requieran", "Validar y gestionar la aprobación de la conciliación de facturación realizada con el cliente, según la frecuencia acordada (semanal o quincenal).", "Realizar el cierre de la operación, validando que no queden vehículos por cobrar, y en caso de que queden reportarlo en la bitácora.", "Realizar las inspecciones, charlas, divulgaciones en temas de la operación y de SSTA al personal del centro de trabajo", "Notificar a direccion de talento humano condiciones inseguras, reporte de accidentes, reporte de enferemedades.", "Llevar registro consolidado de todos los casos de salud, ausentimos y acta de seguimiento de cada caso y Velar por el cumplimiento de las recomendaciones medicas", "Velar por los ingresos y egresos del centro de trabajo", "Coordinar ejecutar y gestionar las diferentes actividades imprevistas que se requieran en la operación", "Estar en comunicacion constante con el cliente", "Velar por el cumplimiento de los acuerdos contractuales", "Velar por el cumplimiento de la normatividad de SST en los Centro de Trabajo", "Supervisar el correcto desarrollo de las actividades en los Centros de Trabajo", "Presentar avances y soluciones a los problemas que se presenten en desarrollo de la ejecución de los contratos suscritos entre la compañía y los clientes en el Comité de Gerencia.", "Apoyar administrativa y operativamente a las líneas de negocio de su área.", "Control y reporte de novedades de personal operativo (hora de llegada, salida, permisos, incapacidades, ausentismos,programación, desempeño, etc )", "Proporcionar los recursos necesarios para que el personal comprenda y cumpla con los procedimientos y estándares de calidad establecidos", "Estar atento a las diferentes actividades imprevistas que se soliciten", "Manejo de caja menor", "Colaborar en las Investigaciones de cualquier incidente o accidente ocurrido en las operaciones logísticas", "informar cualquier incidente de seguridad que se presente en las operaciones al director de riesgos y seguridad", "Mantener una relación cercana con las autoridades locales y llegado el caso solicitar su colaboración.", "Proponer ideas que aporten a la mejora y rendimiento de la calidad del servicio"], "funciones": ["Solicitar y evaluar la programación de las unidades, cajas y cantidad de vehículos a recibir en el siguiente turno.", "Socializar la programación al personal.", "Hacer breves charlas de temas de escuela de capacitación, auto cuidado, presentación personal etc, para mantener la calidad del servicio.", "Diligenciar en la bitácora la fecha y hora de inicio del turno y, a renglón seguido y sin espacios, las novedades que se presenten, a fin de que el siguiente turno pueda darles seguimiento", "Programar al personal operativo para la realización efectivo de las actividades a su cargo", "En caso de presentarse ausentismos revisar posteriormente la razón por la que no se presentó el personal y registrarlo en el reporte diario de asistencia.", "Coordinar el cargue, descargue, carpe y descarpe de vehiculos", "Realización de planillas de carge y digitalizarlas", "Realizar rondas para validar estado de los muelles, recursos, estibas disponibles, estibadores manuales, y demás herramientas e insumos que se requieran.", "Hacer seguimiento a las personas que se incapacitan de manera reiterativa y reportar las causas.", "Recaudo de servicios para la operación que aplique", "Relacionar ingresos y egresos del centro de trabajo a contabilidad", "Realizar el reporte parcial de accidente de trabajo, si llega a ocurrir y enviarrlo al area de RRHH y SST", "Realizar seguimiento en los reportes de AT e investigación de accidentes de trabajo si llega a ocurrir", "Envio de novedades del personal a cargo al area de RRHH", "Mantener la documentacion y la entrega de EPP del personal actualizada", "Responder la solicitudes del cliente interno y externo", "Garantizar que la informacion plasmada en los indicadores sea veridica", "Revisar el control de asistencia desde la APP", "Garantizar que la informacion compartida por la operacion sea la correcta antes de ser enviada al area correspondiente.", "Velar por el correcto manejo del dinero de cajas operativa, verificando soportes de gastos vs dinero en caja", "Notificar en el area correpondiente el no cumplimiento de las normas establecidas por la compañia", "Envio de incapacidades del personal a cargo al area de RRHH", "Registrar vehiculos o servicios", "Diligenciar el check list diario operativo", "Mantener la correcta disposicion de las averias", "Cumplir con la política y objetivos de calidad establecidos por la compañía.", "Presentar periódicamente informes de resultados al Gerente de Operaciones", "Presentar oportunamente los indicadores de su área al Gerente de Operaciones", "Velar por el oportuno cumplimiento de los procesos, procedimientos y registros establecidos por el Sistema de Gestión de Calidad.", "Cumplir los Acuerdos de Nivel de Servicio (ANS) establecidos por la compañía.", "Informar oportunamente al Departamento de Recursos Humanos, las ausencias, incapacidades, accidentes de trabajo y cualquier otra eventualidad, que se le presente.", "Mantener siempre cargado y encendido el medio de comunicación suministrado por la compañía y estar atento de manera que permanezca en contacto permanente.", "Dar cumplimiento a los instructivos diseñados para el desempeño de su trabajo.", "Las demás funciones asignadas por autoridad competente de acuerdo a las actividades propias del cargo", "Realizar el informe y reporte de averias al area encargada", "Realizar las inspecciones, charlas, divulgaciones en temas de la operación y de SST al personal del centro de trabajo", "Dejar constancia en actas firmadas por el personal o bitácoras de las charlas brindadas", "Organizar semanalmente charlas de concientización al personal operativo en cuanto a la seguridad física y el cuidado de la mercancía", "Analizar y detectar posibles riesgos y amenazas de consumo, averías, hurto etc, en las operaciones que pueda afectar la imagen de la empresa", "Dejar constancias fotográficas de elementos,estibas,equipos etc, que lleguen en mal estado en cualquiera de las operaciones,", "Realizar las entrevistas laborales", "Además de las tareas principales, todas aquellas inherentes al cargo, y que le sean asignadas por el jefe directo."], "sst": ["Velar por el cumplimiento de las Políticas, Objetivos, Misión, Visión, Reglamentos y programas existentes en el SST (Seguridad, Salud en el trabajo y Ambiente) en la organización.", "Cumplir con la implementación de los procesos existentes en Seguridad, Salud Ocupacional y Ambiente (utilización de formatos según sea el caso).", "Realizar sus actividades de forma segura, promoviendo su autocuidado, evitando generar impacto al medio ambiente, preservando los bienes de la Compañía y manteniendo una actitud preventiva y proactiva.", "Conocer y cumplir el programa de clasificación de residuos sólidos establecido por la Compañía.", "Desarrollar las actividades asignadas por el COPASST, Comité de Convivencia y Brigadista.", "Liderar y participar activamente en las reuniones o capacitaciones concernientes a Seguridad, Salud en el trabajo y Ambiente.", "Establecer el uso adecuado de ahorro de agua y energía.", "Garantizar el uso, cuidado y mantenimiento de los elementos de protección personal y demás elementos de seguridad industrial requerido para el desarrollo de las tareas, actividades y operación.", "Reportar todos los actos inseguros, condiciones inseguras, incidentes y/o accidentes de trabajo inmediatamente a su jefe directo.", "Además de las tareas principales, todas aquellas tareas inherentes al cargo, y que le sean asignadas por el jefe directo.", "Suministrar información de forma clara, veraz y completa sobre su estado de salud.", "Procurar el cuidado integral de su salud", "Participar el las actividades de capacitación de acuerdo al plan de trabajo SG-SST"]}', 'Carga inicial'
WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Manual_Versiones WHERE Cargo = 'COORDINADOR REGIONAL' AND Version = 2);

-- ANALISTA DE SELECCION
INSERT INTO Config_Cargo_Manual (Cargo, Ubicacion, JefeInmediato, NivelJerarquico, Objetivo, Autoridad, Edad, Genero, Educacion, Formacion, Experiencia, CargosQueReportan, AQuienReporta, RevisadoPor, RevisadoCargo, AprobadoPor, AprobadoCargo, UsaSstComun, CambiosSinPublicar, UsuarioActualiza, FechaActualiza)
SELECT 'ANALISTA DE SELECCION', 'Sede Administrativa', 'Coordinador de Selección', 'Administrativo', 'Persona dedicada enteramente a adelantar los aspectos operativos de los procesos de selección (entrevistas, evaluación de pruebas y demás aplicables) de las operaciones de Log&Ser a nivel nacional.', 'Colaborar con el Departamento de Recursos Humanos en el proceso de selección, abarcando la definición de fuentes de reclutamiento, gestión de candidatos, toma de decisiones y la mejora continua del proceso. Participar activamente en iniciativas de employer branding', 'N/A', 'N/A', 'Profesional en Psicología', 'Conocimientos en procesos de selección, entrevistas, aplicación e interpretación de pruebas psicotécnicas, gestión del talento humano, bienestar laboral, y manejo de herramientas ofimáticas.', '1 años de experiencica', 'Auxiliares Administrativos , Auxiliar de Selección', 'Coordinador de Selección', 'Esteban Velasquez Quintero', 'Coordinador de Calidad', 'Carlos Gomez', 'Gerente de operaciones', 0, 0, 'Carga inicial', NOW()
WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Manual WHERE Cargo = 'ANALISTA DE SELECCION');
INSERT INTO Config_Cargo_Funciones (Cargo, Seccion, Orden, Texto)
SELECT t.Cargo, t.Seccion, t.Orden, t.Texto FROM (
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 1 AS Orden, 'Colaborar con los líderes de procesos para comprender las necesidades de contratación y elaborar perfiles de puestos claros y' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 2 AS Orden, 'Utilizar fuentes de reclutamiento diversas para identificar y atraer candidatos potenciales, incluyendo redes sociales, bolsas de trabajo en' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 3 AS Orden, 'Mantener una comunicación clara y regular con los candidatos para proporcionarles información sobre el proceso de selección, el estado' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 4 AS Orden, 'Mantener registros precisos y actualizados de todos los candidatos y procesos de selección en el sistema de seguimiento de candidatos.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 5 AS Orden, 'Participar en actividades de employer branding y promoción de la marca empleadora para atraer y retener talento.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 6 AS Orden, 'Contribuir a la mejora continua de los procesos de reclutamiento y selección mediante la identificación de áreas de oportunidad y la' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 7 AS Orden, 'Velar por las capacitaciones e inducciones del área.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 8 AS Orden, 'Coordinar y programar entrevistas con los coordinadores solicitantes y otros miembros clave del equipo.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 9 AS Orden, 'Garantizar que cada requisición de personal se atienda conforme al perfil definido en el SST-MA-002.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 10 AS Orden, 'Asegurar la idoneidad de los candidatos mediante la verificación de su información, antecedentes, referencias y resultado de exámenes médicos antes de la vinculación.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'RESPONSABILIDAD' AS Seccion, 11 AS Orden, 'Responder por la confidencialidad, trazabilidad y tratamiento adecuado de los datos personales de los candidatos, y por mantener actualizados el software de gestión y la matriz de selección.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 1 AS Orden, 'Gestionar el proceso de selección de candidatos, abarcando la revisión de currículums, la realización de entrevistas (telefónicas, presenciales o virtuales) y la evaluación de idoneidad para los puestos vacantes.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 2 AS Orden, 'Revisar las requisiciones que se le haya sido asignadas en el software de gestión (LOGYAPP)' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 3 AS Orden, 'Verificar los requisitos del perfil y activar el reclutamiento a traes de las bolsas de empleo, redes sociales, voz a voz, referidos o volanteo.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 4 AS Orden, 'Gestionar las requisiciones de personal de acuerdo con los ANS (Acuerdos de Nivel de Servicio) establecidos para el cargo, garantizando el cierre de cada requisición en un plazo máximo de ocho (8) días calendario contados a partir de su fecha de creación. Para efectos del cumplimiento del ANS, si la requisición es recibida antes de las 12:00 m., el conteo de los ocho (8) días calendario iniciará el mismo día; si es recibida después de las 12:00 m., el conteo iniciará a partir del día calendario siguiente.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 5 AS Orden, 'Preseleccionar y clasificar las hojas de vida, priorizando a los candidatos que cumplen el perfil.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 6 AS Orden, 'Validar los datos personales (plataforma Tus Datos), la afiliación a EPS (ADRES) y las novedades en las bases de datos propias.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 7 AS Orden, 'Verificar antecedentes disciplinarios (Procuraduría, Contraloría y Policía Nacional).' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 8 AS Orden, 'En caso de reingreso, consultar en las bases internas la fecha de ingreso y retiro, la operación y el motivo del retiro, así mismo enviar un correo al área de jurídica solicitando la revisión de este.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 9 AS Orden, 'Aplicar la entrevista junto con el coordinador logístico, evaluando competencias, experiencia, habilidades y comportamientos observables, y diligenciar el formato TH-R-005.( ENTREVISTA Y EVALUACION PARA SELECCIÓN DE PERSONAL)' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 10 AS Orden, 'Solicitar a los aspirantes que continúan el registro o actualización de su hoja de vida en la pagina de LOGYSER (https://curriculum.logyser.com/)' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 11 AS Orden, 'Verificar las referencias laborales, familiares y personales, priorizando la última experiencia laboral (TH-R-004).' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 12 AS Orden, 'Remitir a exámenes médicos de preingreso y trasladar los resultados a SST para su validación.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 13 AS Orden, 'Entregar la carta de apertura de cuenta de nómina y programar el curso BPM con el proveedor.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 14 AS Orden, 'Solicitar por enlace los documentos de ingreso y validar su estado, vigencia, legibilidad y correspondencia con el candidato.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 15 AS Orden, 'Notificar el ingreso al área de contratación (datos del aspirante, fecha, ciudad y operación a través del correo electrónico almenos con un día de anticipacion) y citar al candidato para la firma de los documentos internos.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 16 AS Orden, 'Mantener comunicación permanente y efectiva con las coordinaciones operativas y las demás áreas transversales para garantizar la adecuada gestión y seguimiento de los procesos de selección.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 17 AS Orden, 'Elaborar y presentar diariamente los informes de gestión correspondientes a las actividades realizadas, avances, novedades y resultados del proceso de selección, de acuerdo con los lineamientos establecidos por los líderes del proceso.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 18 AS Orden, 'Cargar y mantener actualizados en el software de gestión LOGYAPP los documentos firmados y documentos técnicos correspondientes a los procesos de selección, actualizar la matriz de selección y realizar el cierre oportuno de las requisiciones, de acuerdo con los lineamientos establecidos.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'FUNCION' AS Seccion, 19 AS Orden, 'Además de las tareas principales, todas aquellas tareas inherentes al cargo que le sean asignadas por el jefe inmediato.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'SST' AS Seccion, 1 AS Orden, 'Velar por el cumplimiento de las Políticas, Objetivos, Misión, Visión, Reglamentos y programas existentes en el SST (Seguridad, Salud en el trabajo y Ambiente) en la organización.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'SST' AS Seccion, 2 AS Orden, 'Cumplir con la implementación de los procesos existentes en Seguridad, Salud Ocupacional y Ambiente (utilización de formatos según sea el caso y su archivo).' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'SST' AS Seccion, 3 AS Orden, 'Realizar sus actividades de forma segura, promoviendo su autocuidado, evitando generar impacto al medio ambiente, preservando los bienes de la Compañía y manteniendo una actitud preventiva y proactiva.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'SST' AS Seccion, 4 AS Orden, 'Verificar que en todos los contratos se cumpla con las Políticas, Normas y Estándares de Seguridad, Salud en el trabajo y Ambiente.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'SST' AS Seccion, 5 AS Orden, 'Conocer y cumplir el programa de clasificación de residuos sólidos establecido por la Compañía.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'SST' AS Seccion, 6 AS Orden, 'Desarrollar las actividades asignadas como integrante del COPASST, Comité de Convivencia y Brigadista (en caso de serlo) o participar en su elección.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'SST' AS Seccion, 7 AS Orden, 'Revisar la inclusión de temas relacionados con la salud de los trabajadores, la seguridad de la operación y la protección del medio Ambiente en las reuniones establecidas por los clientes para estas áreas.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'SST' AS Seccion, 8 AS Orden, 'Liderar y participar activamente en las reuniones o capacitaciones concernientes a Seguridad, Salud en el trabajo y Ambiente.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'SST' AS Seccion, 9 AS Orden, 'Establecer el uso adecuado de ahorro de agua y energía.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'SST' AS Seccion, 10 AS Orden, 'Garantizar el uso, cuidado y mantenimiento de los elementos de protección personal y demás elementos de seguridad industrial requerido para el desarrollo de las tareas, actividades y operación.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'SST' AS Seccion, 11 AS Orden, 'Reportar todos los actos inseguros, condiciones inseguras, incidentes y/o accidentes de trabajo inmediatamente a su jefe directo.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'SST' AS Seccion, 12 AS Orden, 'Promover, recolectar y enviar el reporte de actos y condiciones inseguras en todas las áreas de la organización.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'SST' AS Seccion, 13 AS Orden, 'Además de las tareas principales, todas aquellas tareas inherentes al cargo, y que le sean asignadas por el jefe inmediato.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'SST' AS Seccion, 14 AS Orden, 'Suministrar información de forma clara, veraz y completa sobre su estado de salud.' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'SST' AS Seccion, 15 AS Orden, 'Procurar el cuidado integral de su salud' AS Texto
  UNION ALL
  SELECT 'ANALISTA DE SELECCION' AS Cargo, 'SST' AS Seccion, 16 AS Orden, 'Participar el las actividades de capacitación de acuerdo al plan de trabajo SG-SST' AS Texto
) t
WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Funciones WHERE Cargo = 'ANALISTA DE SELECCION');
INSERT INTO Config_Cargo_Manual_Versiones (Cargo, Version, FechaEmision, Descripcion, Contenido, Usuario)
SELECT 'ANALISTA DE SELECCION', 1, '2015-10-05', 'Documento inicial', NULL, 'Carga inicial'
WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Manual_Versiones WHERE Cargo = 'ANALISTA DE SELECCION' AND Version = 1);
INSERT INTO Config_Cargo_Manual_Versiones (Cargo, Version, FechaEmision, Descripcion, Contenido, Usuario)
SELECT 'ANALISTA DE SELECCION', 2, '2024-11-01', 'Definir claramente las responsabilidades; omitir funciones y responsabilidades duplicadas; definir las competencias del perfil; establecer el control de cambios', NULL, 'Carga inicial'
WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Manual_Versiones WHERE Cargo = 'ANALISTA DE SELECCION' AND Version = 2);
INSERT INTO Config_Cargo_Manual_Versiones (Cargo, Version, FechaEmision, Descripcion, Contenido, Usuario)
SELECT 'ANALISTA DE SELECCION', 3, '2026-09-29', 'Revision documental y actualizacion de funciones', '{"cargo": "ANALISTA DE SELECCION", "version": 3, "fechaEmision": "2026-09-29", "ficha": {"ubicacion": "Sede Administrativa", "jefeInmediato": "Coordinador de Selección", "nivelJerarquico": "Administrativo", "objetivo": "Persona dedicada enteramente a adelantar los aspectos operativos de los procesos de selección (entrevistas, evaluación de pruebas y demás aplicables) de las operaciones de Log&Ser a nivel nacional.", "autoridad": "Colaborar con el Departamento de Recursos Humanos en el proceso de selección, abarcando la definición de fuentes de reclutamiento, gestión de candidatos, toma de decisiones y la mejora continua del proceso. Participar activamente en iniciativas de employer branding", "edad": "N/A", "genero": "N/A", "educacion": "Profesional en Psicología", "formacion": "Conocimientos en procesos de selección, entrevistas, aplicación e interpretación de pruebas psicotécnicas, gestión del talento humano, bienestar laboral, y manejo de herramientas ofimáticas.", "experiencia": "1 años de experiencica", "cargosQueReportan": "Auxiliares Administrativos , Auxiliar de Selección", "aQuienReporta": "Coordinador de Selección", "revisadoPor": "Esteban Velasquez Quintero", "revisadoCargo": "Coordinador de Calidad", "aprobadoPor": "Carlos Gomez", "aprobadoCargo": "Gerente de operaciones"}, "usaSstComun": false, "responsabilidades": ["Colaborar con los líderes de procesos para comprender las necesidades de contratación y elaborar perfiles de puestos claros y", "Utilizar fuentes de reclutamiento diversas para identificar y atraer candidatos potenciales, incluyendo redes sociales, bolsas de trabajo en", "Mantener una comunicación clara y regular con los candidatos para proporcionarles información sobre el proceso de selección, el estado", "Mantener registros precisos y actualizados de todos los candidatos y procesos de selección en el sistema de seguimiento de candidatos.", "Participar en actividades de employer branding y promoción de la marca empleadora para atraer y retener talento.", "Contribuir a la mejora continua de los procesos de reclutamiento y selección mediante la identificación de áreas de oportunidad y la", "Velar por las capacitaciones e inducciones del área.", "Coordinar y programar entrevistas con los coordinadores solicitantes y otros miembros clave del equipo.", "Garantizar que cada requisición de personal se atienda conforme al perfil definido en el SST-MA-002.", "Asegurar la idoneidad de los candidatos mediante la verificación de su información, antecedentes, referencias y resultado de exámenes médicos antes de la vinculación.", "Responder por la confidencialidad, trazabilidad y tratamiento adecuado de los datos personales de los candidatos, y por mantener actualizados el software de gestión y la matriz de selección."], "funciones": ["Gestionar el proceso de selección de candidatos, abarcando la revisión de currículums, la realización de entrevistas (telefónicas, presenciales o virtuales) y la evaluación de idoneidad para los puestos vacantes.", "Revisar las requisiciones que se le haya sido asignadas en el software de gestión (LOGYAPP)", "Verificar los requisitos del perfil y activar el reclutamiento a traes de las bolsas de empleo, redes sociales, voz a voz, referidos o volanteo.", "Gestionar las requisiciones de personal de acuerdo con los ANS (Acuerdos de Nivel de Servicio) establecidos para el cargo, garantizando el cierre de cada requisición en un plazo máximo de ocho (8) días calendario contados a partir de su fecha de creación. Para efectos del cumplimiento del ANS, si la requisición es recibida antes de las 12:00 m., el conteo de los ocho (8) días calendario iniciará el mismo día; si es recibida después de las 12:00 m., el conteo iniciará a partir del día calendario siguiente.", "Preseleccionar y clasificar las hojas de vida, priorizando a los candidatos que cumplen el perfil.", "Validar los datos personales (plataforma Tus Datos), la afiliación a EPS (ADRES) y las novedades en las bases de datos propias.", "Verificar antecedentes disciplinarios (Procuraduría, Contraloría y Policía Nacional).", "En caso de reingreso, consultar en las bases internas la fecha de ingreso y retiro, la operación y el motivo del retiro, así mismo enviar un correo al área de jurídica solicitando la revisión de este.", "Aplicar la entrevista junto con el coordinador logístico, evaluando competencias, experiencia, habilidades y comportamientos observables, y diligenciar el formato TH-R-005.( ENTREVISTA Y EVALUACION PARA SELECCIÓN DE PERSONAL)", "Solicitar a los aspirantes que continúan el registro o actualización de su hoja de vida en la pagina de LOGYSER (https://curriculum.logyser.com/)", "Verificar las referencias laborales, familiares y personales, priorizando la última experiencia laboral (TH-R-004).", "Remitir a exámenes médicos de preingreso y trasladar los resultados a SST para su validación.", "Entregar la carta de apertura de cuenta de nómina y programar el curso BPM con el proveedor.", "Solicitar por enlace los documentos de ingreso y validar su estado, vigencia, legibilidad y correspondencia con el candidato.", "Notificar el ingreso al área de contratación (datos del aspirante, fecha, ciudad y operación a través del correo electrónico almenos con un día de anticipacion) y citar al candidato para la firma de los documentos internos.", "Mantener comunicación permanente y efectiva con las coordinaciones operativas y las demás áreas transversales para garantizar la adecuada gestión y seguimiento de los procesos de selección.", "Elaborar y presentar diariamente los informes de gestión correspondientes a las actividades realizadas, avances, novedades y resultados del proceso de selección, de acuerdo con los lineamientos establecidos por los líderes del proceso.", "Cargar y mantener actualizados en el software de gestión LOGYAPP los documentos firmados y documentos técnicos correspondientes a los procesos de selección, actualizar la matriz de selección y realizar el cierre oportuno de las requisiciones, de acuerdo con los lineamientos establecidos.", "Además de las tareas principales, todas aquellas tareas inherentes al cargo que le sean asignadas por el jefe inmediato."], "sst": ["Velar por el cumplimiento de las Políticas, Objetivos, Misión, Visión, Reglamentos y programas existentes en el SST (Seguridad, Salud en el trabajo y Ambiente) en la organización.", "Cumplir con la implementación de los procesos existentes en Seguridad, Salud Ocupacional y Ambiente (utilización de formatos según sea el caso y su archivo).", "Realizar sus actividades de forma segura, promoviendo su autocuidado, evitando generar impacto al medio ambiente, preservando los bienes de la Compañía y manteniendo una actitud preventiva y proactiva.", "Verificar que en todos los contratos se cumpla con las Políticas, Normas y Estándares de Seguridad, Salud en el trabajo y Ambiente.", "Conocer y cumplir el programa de clasificación de residuos sólidos establecido por la Compañía.", "Desarrollar las actividades asignadas como integrante del COPASST, Comité de Convivencia y Brigadista (en caso de serlo) o participar en su elección.", "Revisar la inclusión de temas relacionados con la salud de los trabajadores, la seguridad de la operación y la protección del medio Ambiente en las reuniones establecidas por los clientes para estas áreas.", "Liderar y participar activamente en las reuniones o capacitaciones concernientes a Seguridad, Salud en el trabajo y Ambiente.", "Establecer el uso adecuado de ahorro de agua y energía.", "Garantizar el uso, cuidado y mantenimiento de los elementos de protección personal y demás elementos de seguridad industrial requerido para el desarrollo de las tareas, actividades y operación.", "Reportar todos los actos inseguros, condiciones inseguras, incidentes y/o accidentes de trabajo inmediatamente a su jefe directo.", "Promover, recolectar y enviar el reporte de actos y condiciones inseguras en todas las áreas de la organización.", "Además de las tareas principales, todas aquellas tareas inherentes al cargo, y que le sean asignadas por el jefe inmediato.", "Suministrar información de forma clara, veraz y completa sobre su estado de salud.", "Procurar el cuidado integral de su salud", "Participar el las actividades de capacitación de acuerdo al plan de trabajo SG-SST"]}', 'Carga inicial'
WHERE NOT EXISTS (SELECT 1 FROM Config_Cargo_Manual_Versiones WHERE Cargo = 'ANALISTA DE SELECCION' AND Version = 3);

-- Verificación
SELECT m.Cargo,
       (SELECT COUNT(*) FROM Config_Cargo_Funciones f WHERE f.Cargo = m.Cargo) AS renglones,
       (SELECT MAX(Version) FROM Config_Cargo_Manual_Versiones v WHERE v.Cargo = m.Cargo AND v.Contenido IS NOT NULL) AS version_publicada
FROM Config_Cargo_Manual m ORDER BY m.Cargo;
