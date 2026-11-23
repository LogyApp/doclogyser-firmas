-- Corrige trabajadores activos cuya Área en Maestro_Vinculación quedó apuntando al área de la sede anterior
-- tras un traslado. Mapea el área con el mismo nombre en la nueva operación.
-- Seguro y re-ejecutable.

UPDATE `Maestro_Vinculación` v
  JOIN Config_Area ca_old ON (CAST(ca_old.ID AS CHAR) = CAST(v.Area AS CHAR) OR ca_old.AREA = CAST(v.Area AS CHAR))
  JOIN Config_Area ca_new ON ca_new.`OPERACIÓN` = v.`Operación` AND ca_new.AREA = ca_old.AREA
   SET v.Area = ca_new.ID,
       v.`Fecha Actualización` = NOW(),
       v.Usuario = 'Sistema (Migración área traslados)'
 WHERE v.Estado = 'Activo'
   AND ca_old.`OPERACIÓN` != v.`Operación`;
