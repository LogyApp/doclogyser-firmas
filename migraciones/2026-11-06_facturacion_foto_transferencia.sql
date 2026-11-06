-- Facturación > Servicios: reglas de la Foto de Transferencia al editar un servicio.
-- 1) Quién puede pasar a verde un servicio por Transferencia sin la foto.
-- 2) Aviso por correo a los responsables de la operación cuando Facturación cambia la Forma de
--    Pago a Transferencia y guarda sin la foto (destinatarios por Operación, como en Retiros).
-- Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que pueden pasar a verde un servicio por Transferencia sin Foto de Transferencia', 'Rol', 'Facturación, Sistema',
       'Roles que, al editar un servicio, pueden ponerlo en verde con Forma de Pago Transferencia aunque no tenga la Foto de Transferencia. A los demás se les sigue pidiendo la foto. Si se deja vacía, siempre se pide la foto.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que pueden pasar a verde un servicio por Transferencia sin Foto de Transferencia'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Habilitar notificaciones de correo en Foto de Transferencia pendiente', 'Booleano', '1',
       'Interruptor (1 = activo, 0 = apagado) del correo que avisa a los responsables de la operación que deben adjuntar la Foto de Transferencia de un servicio que Facturación pasó a Transferencia sin foto.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Habilitar notificaciones de correo en Foto de Transferencia pendiente'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que generan aviso de Foto de Transferencia pendiente', 'Rol', 'Facturación',
       'Roles que, al editar un servicio y cambiar su Forma de Pago a Transferencia sin adjuntar la foto, disparan el correo de Foto de Transferencia pendiente. Quien hace el cambio va en copia. Si se deja vacía, no se envía.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que generan aviso de Foto de Transferencia pendiente'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que reciben aviso de Foto de Transferencia pendiente', 'Rol', 'Coordinador, CoordinadorR, Auxiliar, AuxiliarR',
       'Roles que reciben el correo de Foto de Transferencia pendiente. Coordinador y Auxiliar se toman de la Operación del recibo; CoordinadorR y AuxiliarR, de su Regional (igual que en Retiros). Otro rol recibe el correo sin importar la operación.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que reciben aviso de Foto de Transferencia pendiente'
);
