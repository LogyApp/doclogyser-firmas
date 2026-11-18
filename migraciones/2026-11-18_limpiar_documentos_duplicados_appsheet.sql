-- Limpieza de documentos duplicados en Maestro_docTrabajador (EJECUTAR SOLO CON CONFIRMACIÓN DE WILLIAM).
-- Caso: al enviar a Sociodemográfica desde la app web (finalizar contratación) los documentos del
-- aspirante pasan con ruta corta (cedula/archivo.pdf). Después, en AppSheet, se volvió a cargar el
-- mismo documento con URL completa (https://storage.googleapis.com/...), mismo tipo, misma fecha de
-- ingreso y misma observación. Se borra la copia de AppSheet (la posterior) y se deja la de la app web.
-- Solo ingresos desde 2026-10-01. Los archivos en el bucket NO se borran (solo el registro).
-- Respaldo previo en Maestro_docTrabajador_respaldo_20261118. Se puede ejecutar más de una vez.

CREATE TABLE IF NOT EXISTS Maestro_docTrabajador_respaldo_20261118 LIKE Maestro_docTrabajador;

-- Ids a borrar: copias AppSheet que tienen una copia de la app web equivalente
CREATE TEMPORARY TABLE tmp_docs_dup AS
SELECT DISTINCT o.id
  FROM Maestro_docTrabajador m
  JOIN Maestro_docTrabajador o
    ON o.`Identificación` = m.`Identificación` AND o.TipoDocumento = m.TipoDocumento
   AND o.Fecha_Ingreso = m.Fecha_Ingreso AND COALESCE(o.Observaciones, '') = COALESCE(m.Observaciones, '')
   AND o.Doc LIKE 'https://%'
 WHERE m.Fecha_Ingreso >= '2026-10-01' AND m.Doc NOT LIKE 'https://%'
   AND (m.Doc IN (SELECT gcs_path FROM Dynamic_hv_documentos)
        OR m.Doc IN (SELECT gcs_path FROM Dynamic_hv_documentos_partes));

INSERT IGNORE INTO Maestro_docTrabajador_respaldo_20261118
SELECT d.* FROM Maestro_docTrabajador d JOIN tmp_docs_dup t ON t.id = d.id;

DELETE d FROM Maestro_docTrabajador d JOIN tmp_docs_dup t ON t.id = d.id;

SELECT (SELECT COUNT(*) FROM tmp_docs_dup) AS borrados,
       (SELECT COUNT(*) FROM Maestro_docTrabajador_respaldo_20261118) AS en_respaldo;
DROP TEMPORARY TABLE tmp_docs_dup;
