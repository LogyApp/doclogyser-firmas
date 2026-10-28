-- Migración: Agregar columna medio_pago a Dynamic_Cesantias y parámetro en Config_Parametros
-- Fecha: 2026-10-28

-- 1. Columna medio_pago en Dynamic_Cesantias (idempotente vía procedimiento temporal)
DROP PROCEDURE IF EXISTS agregar_columna_medio_pago;
DELIMITER $$
CREATE PROCEDURE agregar_columna_medio_pago()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'Dynamic_Cesantias' 
      AND COLUMN_NAME = 'medio_pago'
  ) THEN
    ALTER TABLE Dynamic_Cesantias ADD COLUMN medio_pago VARCHAR(50) NULL AFTER tramitado_por;
  END IF;
END$$
DELIMITER ;

CALL agregar_columna_medio_pago();
DROP PROCEDURE IF EXISTS agregar_columna_medio_pago;

-- 2. Parámetro de medios de pago en Config_Parametros
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Cesantias', 'Medios de pago cesantias', 'Texto', 'Banco, Cheque, Consignación en cuenta', 'Medios de pago o entrega disponibles para que Nómina seleccione al tramitar una solicitud de cesantías.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros 
  WHERE Modulo = 'nomina' AND Seccion = 'Cesantias' AND Concepto = 'Medios de pago cesantias'
);
