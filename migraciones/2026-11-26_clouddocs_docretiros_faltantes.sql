-- Cloud Docs › Doc. Retiros › Faltantes por trabajador: documentos adicionales exigidos.
-- El rango se escoge por quincena de retiro en la pantalla (por defecto la quincena actual).
-- Fecha: 2026-11-26
-- Se puede ejecutar más de una vez. Ejecutar cada bloque por separado en HiSQL.

-- Bloque 1
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'DocRetiros', 'Documentos adicionales obligatorios en Faltantes', 'Lista', '34, 35',
       'Ids de Config_Doc_Trabajador que se exigen a todo retirado en la vista Faltantes, además de los de legalización y los de Config_condicion_retiros (34 = Liquidación definitiva, 35 = Comprobante de pago de liquidación). No aplica a motivos que terminan el proceso (No tomó cargo, Muerte). Lista separada por coma; vacío = ninguno adicional.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'DocRetiros' AND Concepto = 'Documentos adicionales obligatorios en Faltantes');
