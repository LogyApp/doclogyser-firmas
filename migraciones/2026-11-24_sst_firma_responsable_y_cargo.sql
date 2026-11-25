-- SST (solicitud del área, 2026-11-24). Se puede ejecutar más de una vez.
-- La firma de quien registra EVIN, INGE y Compromiso SST no siempre es de SST (a veces es Selección o
-- Archivo): en los tres formatos la etiqueta queda "Responsable y cargo".
--   EVIN: antes "Responsable de inducción y cargo" · INGE y Compromiso SST: antes "Analista SST".

UPDATE Maestro_Plantillas
   SET contenido_html = REPLACE(contenido_html, '<div class="sig-role">Responsable de inducción y cargo</div>', '<div class="sig-role">Responsable y cargo</div>')
 WHERE nombre_proceso = 'EVIN'
   AND contenido_html LIKE '%<div class="sig-role">Responsable de inducción y cargo</div>%';

UPDATE Maestro_Plantillas
   SET contenido_html = REPLACE(contenido_html, '<div class="sig-role">Analista SST</div>', '<div class="sig-role">Responsable y cargo</div>')
 WHERE nombre_proceso IN ('INGE', 'compromisosst')
   AND contenido_html LIKE '%<div class="sig-role">Analista SST</div>%';
