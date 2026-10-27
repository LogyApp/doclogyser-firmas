-- Facturación: subpestañas de la pestaña Clientes en Maestro_Menu y nuevo orden del menú.
-- Las secciones Clientes, Proveedor, Transportadora y Placas ya las consulta el código
-- (accesoMaestrosClientes en src/routes/facturacion.js); se registran con los mismos roles y
-- accesos que Clientes_credito, que es la fila que hoy da entrada a la pestaña Clientes.
-- Se puede ejecutar más de una vez (INSERT IGNORE sobre la llave Modulo + Seccion + Acceso).

INSERT IGNORE INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion) VALUES
  ('facturacion', 'Clientes', 'Control, Facturación, Sistema', 1, 'Clientes', '/facturacion?tab=clientes&subtab=clientes', 3, '◷', 'Maestro de clientes de contado.'),
  ('facturacion', 'Clientes', 'AuxiliarR, CoordinadorR', 2, 'Clientes', '/facturacion?tab=clientes&subtab=clientes', 3, '◷', 'Maestro de clientes de contado.'),
  ('facturacion', 'Clientes', 'Auxiliar, Coordinador', 3, 'Clientes', '/facturacion?tab=clientes&subtab=clientes', 3, '◷', 'Maestro de clientes de contado.'),
  ('facturacion', 'Proveedor', 'Control, Facturación, Sistema', 1, 'Proveedores', '/facturacion?tab=clientes&subtab=proveedores', 5, '◷', 'Maestro de proveedores.'),
  ('facturacion', 'Proveedor', 'AuxiliarR, CoordinadorR', 2, 'Proveedores', '/facturacion?tab=clientes&subtab=proveedores', 5, '◷', 'Maestro de proveedores.'),
  ('facturacion', 'Proveedor', 'Auxiliar, Coordinador', 3, 'Proveedores', '/facturacion?tab=clientes&subtab=proveedores', 5, '◷', 'Maestro de proveedores.'),
  ('facturacion', 'Transportadora', 'Control, Facturación, Sistema', 1, 'Transportadoras', '/facturacion?tab=clientes&subtab=transportadoras', 6, '◷', 'Maestro de transportadoras.'),
  ('facturacion', 'Transportadora', 'AuxiliarR, CoordinadorR', 2, 'Transportadoras', '/facturacion?tab=clientes&subtab=transportadoras', 6, '◷', 'Maestro de transportadoras.'),
  ('facturacion', 'Transportadora', 'Auxiliar, Coordinador', 3, 'Transportadoras', '/facturacion?tab=clientes&subtab=transportadoras', 6, '◷', 'Maestro de transportadoras.'),
  ('facturacion', 'Placas', 'Control, Facturación, Sistema', 1, 'Placas', '/facturacion?tab=clientes&subtab=placas', 7, '◷', 'Maestro de placas de vehículos.'),
  ('facturacion', 'Placas', 'AuxiliarR, CoordinadorR', 2, 'Placas', '/facturacion?tab=clientes&subtab=placas', 7, '◷', 'Maestro de placas de vehículos.'),
  ('facturacion', 'Placas', 'Auxiliar, Coordinador', 3, 'Placas', '/facturacion?tab=clientes&subtab=placas', 7, '◷', 'Maestro de placas de vehículos.');

-- Orden del menú: Recibos 1, Servicios 2, Clientes 3, Clientes Crédito 4, Proveedores 5,
-- Transportadoras 6, Placas 7, Bloqueos 8, Tickets 9.
UPDATE Maestro_Menu SET Orden = 1 WHERE Modulo = 'facturacion' AND Seccion = 'Recibos';
UPDATE Maestro_Menu SET Orden = 2 WHERE Modulo = 'facturacion' AND Seccion = 'Servicios';
UPDATE Maestro_Menu SET Orden = 4, Url = '/facturacion?tab=clientes&subtab=credito' WHERE Modulo = 'facturacion' AND Seccion = 'Clientes_credito';
UPDATE Maestro_Menu SET Orden = 8 WHERE Modulo = 'facturacion' AND Seccion = 'Bloqueo_datos';
UPDATE Maestro_Menu SET Orden = 9 WHERE Modulo = 'facturacion' AND Seccion = 'Tickets';
