-- SST › Permiso para realizar procesos a personal retirado
-- Permite que roles específicos (por defecto Archivo y Sistema) generen documentos/procesos
-- a trabajadores en estado Retirado en el módulo de SST.
-- Para personal retirado, el sistema deshabilita el envío de correo al trabajador
-- y únicamente genera el enlace de firma para que el usuario pueda copiarlo y gestionarlo.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'General', 'Roles que pueden realizar procesos a personal retirado', '', 'Archivo, Sistema',
       'Roles autorizados para realizar procesos y generar documentos a trabajadores retirados en SST. Para estos trabajadores no se envía correo, solo se genera el enlace de firma.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros 
  WHERE Modulo = 'sst' AND Concepto = 'Roles que pueden realizar procesos a personal retirado'
);
