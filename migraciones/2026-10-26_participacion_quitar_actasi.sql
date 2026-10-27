-- Quitar de la carpeta digital de cada trabajador (Maestro_docTrabajador, ACTASI) las copias
-- del Registro de Asistencia de los formatos de Participación que tienen PDF con asistentes sin firma.
-- Esos formatos se regeneran con la anotación de soporte por correo y quedan en Maestro_docEmpresa (tipo 89).
--
-- ⚠️ BORRA FILAS de Maestro_docTrabajador. Antes de borrar guarda una copia en
--    Respaldo_ACTASI_Participacion_20261026 (con el id del formato).
-- ⚠️ Ejecutar ANTES de usar /participacion/regenerar-pdfs: la relación se hace con el PDF actual
--    del formato (asistencias/asistencia_<id>_<fecha>.pdf ↔ <cédula>.ACTASI.<fecha>.pdf).
-- Se puede ejecutar más de una vez (la segunda vez no encuentra nada nuevo que borrar).
-- Los archivos PDF del bucket no se borran (solo dejan de aparecer en la carpeta del trabajador).

CREATE TABLE IF NOT EXISTS Respaldo_ACTASI_Participacion_20261026 AS
SELECT d.*, f.id_asistencia AS id_asistencia_respaldo
FROM (
  SELECT a.id_asistencia,
         SUBSTRING_INDEX(SUBSTRING_INDEX(a.url_doc, '_', -1), '.pdf', 1) AS ts
  FROM Dynamic_formato_asistencia a
  WHERE a.url_doc LIKE '%/asistencias/asistencia\_%'
    AND EXISTS (SELECT 1 FROM Dynamic_formato_itemsAsistencia p
                WHERE p.id_asistencia = a.id_asistencia AND p.firma_asistente IS NULL)
) f
JOIN Dynamic_formato_itemsAsistencia i ON i.id_asistencia = f.id_asistencia
JOIN Maestro_docTrabajador d
  ON d.Prefijo = 'ACTASI'
 AND d.Doc = CONCAT('https://storage.googleapis.com/talenthub_central/', i.identificacion, '/', i.identificacion, '.ACTASI.', f.ts, '.pdf');

-- Revisar antes de borrar: cuántas filas y de cuántos formatos (al 26/10/2026: ~3.078 filas de 263 formatos)
SELECT COUNT(*) AS filas_a_borrar, COUNT(DISTINCT id_asistencia_respaldo) AS formatos
FROM Respaldo_ACTASI_Participacion_20261026;

DELETE d FROM Maestro_docTrabajador d
JOIN Respaldo_ACTASI_Participacion_20261026 r ON r.id = d.id;

-- Verificación: debe dar 0
SELECT COUNT(*) AS quedan
FROM Maestro_docTrabajador d
JOIN Respaldo_ACTASI_Participacion_20261026 r ON r.id = d.id;
