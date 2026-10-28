-- Facturación: en ciertas operaciones el Área del servicio se prellena con el Área del usuario
-- (Maestro_Usuarios.Area, que guarda el ID de Config_Area). Reemplaza la fórmula de AppSheet de
-- Cedi Vegas: LOOKUP(USERSETTINGS("Usuario"), "Usuarios", "ID", "Area").
-- Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'facturacion', 'Servicios', 'Operaciones donde el Área del servicio se prellena con la del usuario', 'Operación', 'Cedi Vegas',
       'Operaciones en las que, al crear un servicio, el Área llega escogida con la del usuario que lo registra (columna Area de Maestro_Usuarios, con el ID de Config_Area). Si el usuario no tiene un Área válida de esa operación, no se prellena. Si se deja vacío, no aplica en ninguna operación.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Servicios' AND Concepto = 'Operaciones donde el Área del servicio se prellena con la del usuario');
