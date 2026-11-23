-- Facturación › Servicios: el formulario del servicio ya no deja marcar Rojo (lo usaban como anulación con
-- Cantidad y Valor Unitario en 1). En su lugar, el botón ⛔ Anular, uno a uno (detalle del servicio) o de forma
-- masiva (casillas en la tabla de Servicios, POST /facturacion/api/servicios/anular-masivo).
--   'Roles que pueden anular servicios'              → cualquier estado (también verdes): Facturación, Sistema.
--   'Roles que pueden anular servicios en amarillo'  → solo servicios en amarillo: Coordinador, Auxiliar, AuxiliarR.
-- Agrega la fila nueva y actualiza la descripción de la existente. Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que pueden anular servicios en amarillo', 'Rol', 'Coordinador, Auxiliar, AuxiliarR',
       'Roles que pueden anular servicios que estén en amarillo (no verdes), desde el detalle del servicio o de forma masiva en la tabla de Servicios, con confirmación. Queda en rojo, Valor Unitario 0 y Forma de Pago ANULADO. Vacío: nadie, salvo los roles de "Roles que pueden anular servicios".'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
   WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que pueden anular servicios en amarillo'
);

UPDATE Config_Parametros
   SET Descripcion = 'Roles que pueden anular servicios en cualquier estado (también los verdes), desde el detalle del servicio o de forma masiva en la tabla de Servicios: quedan en rojo, con Valor Unitario 0 y Forma de Pago ANULADO, y la nota va en Observaciones. Vacío: nadie, salvo "Roles que pueden anular servicios en amarillo".'
 WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que pueden anular servicios';

SELECT Concepto, Parametro, Descripcion FROM Config_Parametros
 WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto LIKE 'Roles que pueden anular servicios%';
