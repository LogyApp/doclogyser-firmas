-- Facturación > Recibos (Config_Parametros facturacion / Recibos):
--   1. Quién puede cambiar el Cliente a Facturar de un recibo CREDITO que ya tiene servicios.
--   2. Quién puede registrar servicios en periodos bloqueados por Facturación (Bloqueo_Nomina,
--      Modulo 'Facturacion', Datos 'Servicios'). Vacío = nadie: los bloqueos aplican a todos.
-- Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que pueden cambiar el Cliente a Facturar de un recibo con servicios', 'Rol', 'Facturación, Sistema',
       'Roles que pueden cambiar el Cliente a Facturar de un recibo CREDITO cuando ya tiene servicios (guardados o agregados en el formulario). Los demás lo escogen solo antes de agregar servicios. Si se deja vacío, nadie puede cambiarlo.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que pueden cambiar el Cliente a Facturar de un recibo con servicios');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que pueden registrar servicios en periodos bloqueados', 'Rol', '',
       'Roles que pueden crear servicios (o cambiarles la Hora Inicio) en fechas bloqueadas por Facturación en Bloqueo datos (Bloqueo_Nomina). Si se deja vacío, los bloqueos aplican a todos los roles.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que pueden registrar servicios en periodos bloqueados');

-- Verificación
SELECT Concepto, Parametro FROM Config_Parametros
WHERE Modulo = 'facturacion' AND Seccion = 'Recibos'
  AND Concepto IN ('Roles que pueden cambiar el Cliente a Facturar de un recibo con servicios', 'Roles que pueden registrar servicios en periodos bloqueados');
