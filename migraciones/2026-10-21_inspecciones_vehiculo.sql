-- Migración: Tabla y parámetros para Inspecciones Preoperacionales de Vehículos y Equipos (Módulo Empleado - Mi Portal)
-- Fecha: 2026-10-21
-- Idempotente: se puede ejecutar más de una vez de forma segura.

CREATE TABLE IF NOT EXISTS `Dynamic_Inspecciones_Vehiculo` (
  `id` VARCHAR(45) NOT NULL,
  `id_vinculacion` VARCHAR(60) DEFAULT NULL,
  `identificacion` VARCHAR(30) NOT NULL,
  `trabajador` VARCHAR(160) NOT NULL,
  `cargo` VARCHAR(120) DEFAULT NULL,
  `regional` VARCHAR(80) DEFAULT NULL,
  `operacion` VARCHAR(120) DEFAULT NULL,
  `tipo` VARCHAR(40) NOT NULL,
  `subtipo` VARCHAR(40) NOT NULL,
  `tipo_label` VARCHAR(100) NOT NULL,
  `equipo_interno` VARCHAR(80) DEFAULT NULL,
  `placa` VARCHAR(30) DEFAULT NULL,
  `odometro` VARCHAR(50) DEFAULT NULL,
  `resultado` VARCHAR(30) NOT NULL COMMENT 'APTO | APTO CON NOVEDADES | NO APTO',
  `puntaje` INT NOT NULL DEFAULT 0,
  `total_c` INT NOT NULL DEFAULT 0,
  `total_nc` INT NOT NULL DEFAULT 0,
  `total_na` INT NOT NULL DEFAULT 0,
  `observaciones_generales` TEXT DEFAULT NULL,
  `plan_accion` TEXT DEFAULT NULL,
  `reporta_a` VARCHAR(150) DEFAULT NULL,
  `respuestas_json` LONGTEXT DEFAULT NULL,
  `fotos_json` LONGTEXT DEFAULT NULL,
  `firma_url` VARCHAR(500) DEFAULT NULL,
  `pdf_url` VARCHAR(500) DEFAULT NULL,
  `fecha_registro` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_insp_identificacion` (`identificacion`),
  INDEX `idx_insp_vinculacion` (`id_vinculacion`),
  INDEX `idx_insp_fecha` (`fecha_registro`),
  INDEX `idx_insp_placa` (`placa`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Parámetros configurables en Config_Parametros para Inspecciones de Vehículo
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'empleado', 'Inspecciones_Vehiculo', 'Máximo de fotos de evidencia por inspección', 'Número', '4'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'empleado' AND Seccion = 'Inspecciones_Vehiculo' AND Concepto = 'Máximo de fotos de evidencia por inspección'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'empleado', 'Inspecciones_Vehiculo', 'Tamaño máximo por foto de evidencia (MB)', 'Número', '10'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'empleado' AND Seccion = 'Inspecciones_Vehiculo' AND Concepto = 'Tamaño máximo por foto de evidencia (MB)'
);

-- Verificación
SELECT id, Modulo, Seccion, Concepto, Condicion, Parametro
FROM Config_Parametros
WHERE Modulo = 'empleado' AND Seccion = 'Inspecciones_Vehiculo'
ORDER BY id;
