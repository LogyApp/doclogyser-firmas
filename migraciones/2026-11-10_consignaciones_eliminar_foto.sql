-- Parámetro para roles que pueden eliminar foto de consignación en Config_Parametros
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'contabilidad', 'Consignaciones', 'Roles que pueden eliminar foto de consignación', '', 'Contabilidad, Sistema',
       'Roles autorizados para eliminar el soporte o comprobante fotográfico adjunto de una consignación bancaria.' FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'contabilidad'
    AND Seccion = 'Consignaciones'
    AND Concepto = 'Roles que pueden eliminar foto de consignación'
);
