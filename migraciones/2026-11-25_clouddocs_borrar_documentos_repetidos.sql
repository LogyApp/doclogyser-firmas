-- Borrado de documentos repetidos de trabajadores (Maestro_docTrabajador)
-- Fecha: 2026-11-25. Aprobado por William.
-- Regla: mismo trabajador + mismo tipo de documento + misma vinculación (Fecha_Ingreso), en tipos
-- que NO tienen Duplicados = SI en Config_Doc_Trabajador. Se deja el registro más reciente
-- (FechaRegistro) y se borran los anteriores.
-- Excepciones, que no se tratan como repetidos:
--   * Id 33 (Formatos Italcol): cada formato es una parte distinta (se distingue por Observaciones).
--   * Id 30 (Hoja de Vida): la "Versión del aspirante" es aparte de la Hoja de Vida del sistema.
-- Solo se borran registros de la base: los archivos en el bucket NO se borran.
-- Se puede ejecutar más de una vez: el respaldo se crea una sola vez y el borrado usa el respaldo.
-- Conteo al preparar el script: 3.242 registros.

-- Bloque 1: respaldo de los registros que se van a borrar
CREATE TABLE IF NOT EXISTS `backup_docTrabajador_repetidos_20261125` AS
SELECT t.*
FROM Maestro_docTrabajador t
JOIN (
  SELECT x.id,
         ROW_NUMBER() OVER (
           PARTITION BY x.`Identificación`, x.TipoDocumento, x.Fecha_Ingreso,
             CASE WHEN x.TipoDocumento = '33' THEN COALESCE(x.Observaciones, '')
                  WHEN x.TipoDocumento = '30' AND x.Observaciones LIKE 'Versión del aspirante%' THEN 'HV_ASPIRANTE'
                  ELSE '' END
           ORDER BY x.FechaRegistro DESC, x.id DESC) AS rn
  FROM Maestro_docTrabajador x
  JOIN Config_Doc_Trabajador c ON c.Id = x.TipoDocumento
  WHERE COALESCE(c.duplicados, '') <> 'SI'
) r ON r.id = t.id
WHERE r.rn > 1;

-- Bloque 2: revisar el respaldo (debe dar unos 3.242 registros)
SELECT COUNT(*) AS respaldados FROM `backup_docTrabajador_repetidos_20261125`;

-- Bloque 3: borrar solo los registros que quedaron en el respaldo
DELETE t
FROM Maestro_docTrabajador t
JOIN `backup_docTrabajador_repetidos_20261125` b ON b.id = t.id;

-- Bloque 4: verificación (debe dar 0)
SELECT COUNT(*) AS quedan
FROM Maestro_docTrabajador t
JOIN `backup_docTrabajador_repetidos_20261125` b ON b.id = t.id;

-- Para deshacer (solo si hace falta):
-- INSERT INTO Maestro_docTrabajador SELECT b.* FROM `backup_docTrabajador_repetidos_20261125` b
--   WHERE NOT EXISTS (SELECT 1 FROM Maestro_docTrabajador t WHERE t.id = b.id);
