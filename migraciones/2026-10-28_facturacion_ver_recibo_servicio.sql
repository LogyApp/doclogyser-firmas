-- Facturación: quién ve el Recibo del Cliente y el registro del Servicio (Config_Parametros
-- facturacion / Recibos). Los valores iniciales mantienen el comportamiento anterior:
--   Recibo del Cliente: solo RECAUDO y, para los demás roles, solo con todos los servicios en verde.
--   Registro del servicio (firma del cliente): solo Forma de Pago 3 (Crédito) y con teléfono.
-- Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que ven el Recibo del Cliente en cualquier estado', 'Rol', 'Facturación, Sistema',
       'Roles que ven el botón "Ver Recibo del Cliente" aunque el recibo no esté validado (amarillo o rojo). Los demás roles solo lo ven con todos los servicios en verde.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que ven el Recibo del Cliente en cualquier estado');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que ven el Recibo del Cliente en cualquier modalidad', 'Rol', '',
       'Roles que ven el botón "Ver Recibo del Cliente" también en recibos de CREDITO. Los demás roles solo lo ven en RECAUDO. Si se deja vacío, solo se ve en RECAUDO.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que ven el Recibo del Cliente en cualquier modalidad');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que ven el registro del servicio en cualquier forma de pago', 'Rol', '',
       'Roles que ven el botón "Ver Servicio / Firma del Cliente" con cualquier Forma de Pago. Los demás roles solo lo ven con Forma de Pago 3 (Crédito). Si se deja vacío, solo se ve en Crédito.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que ven el registro del servicio en cualquier forma de pago');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que ven el registro del servicio sin teléfono', 'Rol', '',
       'Roles que ven el botón "Ver Servicio / Firma del Cliente" aunque el servicio (y su recibo) no tengan Teléfono. Los demás roles solo lo ven si hay Teléfono. Si se deja vacío, siempre se exige el Teléfono.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que ven el registro del servicio sin teléfono');
