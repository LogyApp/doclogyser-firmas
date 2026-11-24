-- Corrección de fechas erróneas en traslados (años digitados con error tipográfico en la fecha efectiva):
-- 1. Darinel Sierra Navarro (9098650): fecha_traslado registrada como 2020-08-07 en lugar de 2026-08-07 (retorno de Cartagena a Barranquilla).
-- 2. Wilber Manuel Garavito Oyola (1100250156): fecha_traslado registrada como 2025-05-25 en lugar de 2026-05-25 (reintegro en Italcol Mosquera tras licencias de mayo 2026).
-- Idempotente (solo modifica si aún tienen el año incorrecto).

UPDATE Dynamic_traslados_trabajador
   SET fecha_traslado = '2026-08-07'
 WHERE IdTraslado = 'a9134dc2-218c-40b3-b20d-e9442fda0bd0'
   AND `Identificación` = 9098650
   AND fecha_traslado = '2020-08-07';

UPDATE Dynamic_traslados_trabajador
   SET fecha_traslado = '2026-05-25'
 WHERE IdTraslado = '2caddc66-9355-4545-9409-9707ea9d550b'
   AND `Identificación` = 1100250156
   AND fecha_traslado = '2025-05-25';
