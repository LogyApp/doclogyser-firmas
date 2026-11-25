-- Facturación › Clientes: roles que pueden eliminar un cliente (reemplazando su Nit en recibos y
-- placas) y corregir el Nit de un cliente. Si la fila no existe, el código usa "Sistema, Facturación".
-- Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Clientes', 'Roles que pueden eliminar y corregir Nit de Clientes', '', 'Sistema, Facturación',
       'Roles (separados por coma) que ven los botones Eliminar Cliente y Corregir Nit en Facturación › Clientes. Al eliminar, el Nit se reemplaza en Dynamic_Recibos y Maestro_Placas por Consumidor Final u otro cliente; al corregir, el Nit nuevo se aplica al cliente, sus recibos, placas y clientes crédito. Vacío: nadie.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
   WHERE Modulo = 'facturacion' AND Seccion = 'Clientes'
     AND Concepto = 'Roles que pueden eliminar y corregir Nit de Clientes'
);
