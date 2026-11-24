-- Facturación › Recibos: texto adicional al final del mensaje de WhatsApp del recibo pendiente
-- (amarillo, modalidad RECAUDO), por operación. Va después de "Estado: PENDIENTE 🚫".
-- La llave única (Modulo, Seccion, Concepto) obliga a una fila por operación: la operación va en el
-- Concepto, después de ' · '. Para otra operación se agrega otra fila con el mismo formato.
-- Sin fila (o con Parametro vacío), el mensaje de esa operación queda igual que siempre.
-- Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'WhatsApp', 'Texto adicional del WhatsApp del recibo pendiente · Cedi Bmanga', 'Texto',
       'Detalle de pago: Por favor, el pago debe efectuarse a la cuenta de ahorros Bancolombia No. 02062046531.',
       'Texto que se agrega al final del mensaje de WhatsApp del recibo pendiente (amarillo, RECAUDO) de la operación Cedi Bmanga, después de "Estado: PENDIENTE". Vacío: el mensaje queda sin texto adicional.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
   WHERE Modulo = 'facturacion' AND Seccion = 'WhatsApp'
     AND Concepto = 'Texto adicional del WhatsApp del recibo pendiente · Cedi Bmanga'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'WhatsApp', 'Texto adicional del WhatsApp del recibo pendiente · D1 Bucaramanga', 'Texto',
       '- Detalle de pago: Por favor, el pago debe efectuarse a la cuenta de ahorros Bancolombia No. 02062046531.

🚨 ADVERTENCIA IMPORTANTE: En LOGYSER está estrictamente prohibido que el personal reciba dinero, propinas o cualquier tipo de dádiva. Todo intento de pago adicional a nuestros colaboradores será reportado directamente a la administración de Tiendas D1, lo que podría acarrear sanciones directas sobre la recepción de su mercancía o la relación comercial del proveedor. Evite reportes no deseados.',
       'Texto que se agrega al final del mensaje de WhatsApp del recibo pendiente (amarillo, RECAUDO) de la operación D1 Bucaramanga, después de "Estado: PENDIENTE". Vacío: el mensaje queda sin texto adicional.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
   WHERE Modulo = 'facturacion' AND Seccion = 'WhatsApp'
     AND Concepto = 'Texto adicional del WhatsApp del recibo pendiente · D1 Bucaramanga'
);

SELECT Concepto, Parametro FROM Config_Parametros
 WHERE Modulo = 'facturacion' AND Seccion = 'WhatsApp';
