-- Facturación › detalle del servicio: botón ⛔ Anular (POST /facturacion/api/servicios/:id/anular).
-- Deja el servicio en Estado Rojo, Valor Unitario 0, Forma de Pago 0 (ANULADO), Edición Pendiente,
-- Usuario = quien anula y Observaciones = la nota que escriba.
-- Quién puede: facturacion / Recibos / 'Roles que pueden anular servicios'.
-- Solo agrega una fila. Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que pueden anular servicios', '', 'Facturación, Sistema',
       'Roles que ven el botón Anular en el detalle del servicio: lo deja en rojo, con Valor Unitario 0 y Forma de Pago ANULADO, y guarda la nota en Observaciones. Vacío: nadie puede anular.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
   WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que pueden anular servicios'
);

SELECT Modulo, Seccion, Concepto, Parametro FROM Config_Parametros
 WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que pueden anular servicios';
