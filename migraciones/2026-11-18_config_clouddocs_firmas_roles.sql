-- Migración: Configuración de roles con permiso para gestión de firmas digitales en CloudDocs
-- Modulo: CloudDocs, Seccion: Firmas
-- Permite separar los roles con acceso para trabajadores Activos y trabajadores Retirados.
-- Valores iniciales para ambos: Selección, Archivo, Selección Centro, AuxiliarR, Sistema

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'Firmas', 'Roles_Firmas_Trabajadores_Activos', 'Rol', 'Selección, Archivo, Selección Centro, AuxiliarR, Sistema', 'Roles autorizados en CloudDocs para generar y gestionar el proceso de firmas digitales de trabajadores activos.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'Firmas' AND Concepto = 'Roles_Firmas_Trabajadores_Activos'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'Firmas', 'Roles_Firmas_Trabajadores_Retirados', 'Rol', 'Selección, Archivo, Selección Centro, AuxiliarR, Sistema', 'Roles autorizados en CloudDocs para generar y gestionar el proceso de firmas digitales de trabajadores retirados.'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'Firmas' AND Concepto = 'Roles_Firmas_Trabajadores_Retirados'
);
