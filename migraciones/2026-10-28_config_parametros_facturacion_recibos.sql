-- Facturación > Recibos: permisos y reglas en Config_Parametros (y tope del valor base en Servicios).
-- Se puede ejecutar más de una vez: solo inserta las filas que no existen.
-- Si una fila no existe, el código usa estos mismos valores.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que pueden crear y editar recibos', 'Rol', 'Sistema, Facturación, Auxiliar, AuxiliarR, Coordinador, CoordinadorR, Lider', 'Roles que pueden crear recibos y editar sus datos en Facturación > Recibos. Quien no esté (por ejemplo Control) solo puede consultar. Vacío: nadie puede crear ni editar.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que pueden crear y editar recibos');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que pueden editar recibos validados', 'Rol', 'Facturación, Sistema', 'Roles que pueden editar recibos y servicios que ya están validados (verde). Los demás solo editan los que no están en verde.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que pueden editar recibos validados');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que pueden modificar retenciones de recibos', 'Rol', 'Facturación, Sistema', 'Roles que pueden marcar o quitar a mano ReteFuente, ReteIVA y ReteICA del recibo. A los demás se les calculan automáticamente.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que pueden modificar retenciones de recibos');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que pueden eliminar recibos', 'Rol', 'Sistema', 'Roles que pueden eliminar un recibo. Al eliminarlo se borran también todos sus servicios. Vacío: nadie puede eliminar.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que pueden eliminar recibos');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que pueden eliminar servicios', 'Rol', 'Sistema', 'Roles que pueden eliminar un servicio de un recibo. Vacío: nadie puede eliminar servicios.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que pueden eliminar servicios');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'Roles que pueden reasignar servicios a otro recibo', 'Rol', 'Sistema, Facturación, Auxiliar, AuxiliarR, Coordinador, CoordinadorR', 'Roles que pueden mover un servicio de un recibo a otro (dentro de las operaciones que ven).' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que pueden reasignar servicios a otro recibo');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Recibos', 'NITs con retención obligatoria de Fuente e IVA', 'Número', '860350940, 890204199', 'NITs de clientes a los que siempre se aplica ReteFuente y ReteIVA, sin importar el subtotal ni la marca del cliente (regla heredada de AppSheet). Separados por coma.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'NITs con retención obligatoria de Fuente e IVA');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Servicios', 'Tope del Valor Base por servicio', 'Número', '3000000', 'Valor máximo de Cantidad x Valor Unitario de un servicio, al agregarlo, editarlo y en la carga masiva.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Servicios' AND Concepto = 'Tope del Valor Base por servicio');

-- Verificación
SELECT Seccion, Concepto, Parametro FROM Config_Parametros
WHERE Modulo = 'facturacion' AND (Seccion = 'Recibos' OR Concepto = 'Tope del Valor Base por servicio') ORDER BY Seccion, Concepto;
