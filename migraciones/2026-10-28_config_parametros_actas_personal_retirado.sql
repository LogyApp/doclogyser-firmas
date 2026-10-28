-- Parámetro en Config_Parametros para permitir que ciertos roles (Inventario y Sistema)
-- puedan generar actas de entrega para personal retirado.

INSERT INTO `Config_Parametros` (`Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro`, `Descripcion`)
SELECT
  'inventario',
  'Actas',
  'Roles que pueden generar actas a personal retirado',
  'Rol',
  'Inventario, Sistema',
  'Roles autorizados para buscar y generar actas de entrega a colaboradores con estado Retirado. Los demás roles solo pueden generar actas a personal activo.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `Config_Parametros`
  WHERE `Modulo` = 'inventario'
    AND `Seccion` = 'Actas'
    AND `Concepto` = 'Roles que pueden generar actas a personal retirado'
);
