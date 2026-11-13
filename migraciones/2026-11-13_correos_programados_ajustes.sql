-- Ajustes a los correos programados de las 7:25–7:40.
-- 1) Sin duplicados (tareaProgramadaUnica.js): main se despliega en dos servicios de Cloud Run
--    (digital-logyser y nomina-logyser) y cada uno corría los correos, por eso llegaban dobles. El primer
--    servidor que registra la tarea del día en esta tabla la ejecuta; los demás la omiten. Queda como
--    bitácora (qué servidor la corrió y cuándo terminó).
-- 2) Responsable principal por regional: cuando el correo va a los AuxiliarR/CoordinadorR de una regional,
--    solo el principal va en "Para" y en el saludo; los demás quedan en copia.
-- Se puede ejecutar más de una vez.

CREATE TABLE IF NOT EXISTS Sistema_Tareas_Programadas (
  Tarea       VARCHAR(60)  NOT NULL,
  Fecha       DATE         NOT NULL,
  Instancia   VARCHAR(150) NULL,
  FechaInicio DATETIME     NOT NULL,
  FechaFin    DATETIME     NULL,
  Resumen     VARCHAR(500) NULL,
  PRIMARY KEY (Tarea, Fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'configuracion', 'Correos programados', 'Responsable principal de la regional SANTANDER', 'Usuario', 'Rosa Tarazona',
       'Nombre (o correo o ID de Maestro_Usuarios) del AuxiliarR o CoordinadorR principal de la regional SANTANDER. En los correos programados (Tomó Cargo, Forma de Pago pendiente, Consignaciones atrasadas) que van a los responsables de la regional, solo esta persona va en "Para" y en el saludo; los demás quedan en copia. Vacío = van todos en "Para". Para otra regional, crear una fila igual cambiando el nombre de la regional en el concepto.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'configuracion' AND Seccion = 'Correos programados'
                  AND Concepto = 'Responsable principal de la regional SANTANDER');

SELECT
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Sistema_Tareas_Programadas') AS tabla_creada,
  (SELECT Parametro FROM Config_Parametros WHERE Modulo = 'configuracion' AND Seccion = 'Correos programados'
     AND Concepto = 'Responsable principal de la regional SANTANDER') AS principal_santander;
