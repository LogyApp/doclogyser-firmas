-- 2026-10-27: Parámetros para personalizar el cálculo de días de proceso de Requisiciones
-- 1. Días de la semana a contabilizar (Lunes a Domingo con checklist en UI)
-- 2. Conteo de festivos en el proceso (1: sí se suman como días transcurridos, 0: no se cuentan / se descuentan)

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Requisiciones', 'Conteo de Dias del proceso de Requisición', 'Lista', 'Lunes, Martes, Miercoles, Jueves, Viernes', 'Días de la semana que se contabilizan en el cálculo de días del proceso y cumplimiento SLA (Lunes a Domingo).'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Conteo de Dias del proceso de Requisición'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Requisiciones', 'Tener en cuenta festivos en el conteo de dias del proceso', 'Booleano', '0', 'Interruptor: 1 suma los días festivos al conteo del proceso (cuentan como transcurridos), 0 los excluye del conteo (no suman días al proceso).'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = 'Tener en cuenta festivos en el conteo de dias del proceso'
);
