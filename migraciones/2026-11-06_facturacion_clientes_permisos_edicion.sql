-- Facturación > Clientes > Clientes (Maestro_Clientes): quién edita el cliente y quién edita sus retenciones.
-- Antes estos permisos usaban valores fijos en el código (configFacturacion.js); con estas filas quedan
-- configurables. Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Clientes', 'Roles que pueden editar retenciones de Clientes', 'Rol', 'Facturación, Sistema',
       'Roles que, al crear o editar un cliente en Facturación > Clientes, pueden marcar con V las retenciones RTICA, RTIVA y RTSERVIC. A los demás roles no se les muestra esa sección. Si se deja vacía, nadie puede editar las retenciones.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'facturacion' AND Seccion = 'Clientes' AND Concepto = 'Roles que pueden editar retenciones de Clientes'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Clientes', 'Roles que pueden editar y agregar en maestros de Clientes', 'Rol', 'Auxiliar, AuxiliarR, Coordinador, CoordinadorR, Facturación, Sistema',
       'Roles que pueden agregar y editar registros en los maestros de Facturación > Clientes (Clientes, Transportadoras, Proveedores, Placas). En Clientes, al hacer clic en el registro editan Razón social, teléfono, correo, ubicación y Rut. Si se deja vacía, nadie puede editar.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'facturacion' AND Seccion = 'Clientes' AND Concepto = 'Roles que pueden editar y agregar en maestros de Clientes'
);
