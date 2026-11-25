-- Facturación: borrado diario automático de recibos sin servicios (src/services/recibosVaciosCleaner.js).
-- Un recibo queda vacío al pasar sus servicios a otro recibo; cada día a las 2:00 AM (Colombia) se
-- borran los recibos sin servicios creados antes de hoy y su consecutivo vuelve a quedar disponible.
-- Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Habilitar borrado automático de recibos sin servicios', '', 'SI',
       'SI: cada día a las 2:00 AM se borran los recibos sin servicios creados antes de hoy (por ejemplo, al pasar sus servicios a otro recibo) y su consecutivo vuelve a quedar disponible. NO o vacío: no se borra nada.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
   WHERE Modulo = 'facturacion' AND Seccion = 'Recibos'
     AND Concepto = 'Habilitar borrado automático de recibos sin servicios'
);
