-- Migración para incorporar el motivo de retiro por terminación de contrato en Config_MotivoCesantias
-- Permite que las autorizaciones de cesantías generadas al retirar un trabajador (CRS)
-- se vinculen con integridad referencial a Dynamic_Cesantias.

INSERT INTO Config_MotivoCesantias (tipo_retiro, motivo_retiro, fecha_creacion)
SELECT 'Retiro', 'Terminación de contrato', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM Config_MotivoCesantias WHERE tipo_retiro = 'Retiro' AND motivo_retiro = 'Terminación de contrato'
);
