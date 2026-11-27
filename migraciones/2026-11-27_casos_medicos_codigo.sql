-- Casos Médicos: los casos cargados antes de existir el consecutivo quedaron sin codigo_caso y la pantalla
-- mostraba "null". Se les asigna CM-<id>, la misma regla con la que /casosmedicos/api/crear nombra los
-- casos nuevos (no choca con ningún código existente). Solo llena los vacíos. Se puede ejecutar más de una vez.
UPDATE Maestro_casosmedicos
SET codigo_caso = CONCAT('CM-', LPAD(id, 4, '0'))
WHERE codigo_caso IS NULL;
