-- Actualiza las columnas regional y operacion en Maestro_firma_corporativa
-- a partir de la información más reciente de Maestro_Vinculación por Identificación.
-- Re-ejecutable y seguro.

UPDATE Maestro_firma_corporativa fc
  JOIN (
    SELECT mv1.`Identificación`, mv1.Regional, mv1.`Operación`
      FROM `Maestro_Vinculación` mv1
      INNER JOIN (
        SELECT `Identificación`, MAX(`Fecha de Ingreso`) AS MaxFecha
          FROM `Maestro_Vinculación`
         WHERE `Fecha de Ingreso` IS NOT NULL
         GROUP BY `Identificación`
      ) ult ON mv1.`Identificación` = ult.`Identificación` AND mv1.`Fecha de Ingreso` = ult.MaxFecha
  ) v ON v.`Identificación` = fc.Identificacion
   SET fc.regional = v.Regional,
       fc.operacion = v.`Operación`
 WHERE (fc.regional != v.Regional OR (fc.regional IS NULL AND v.Regional IS NOT NULL) OR (fc.regional IS NOT NULL AND v.Regional IS NULL))
    OR (fc.operacion != v.`Operación` OR (fc.operacion IS NULL AND v.`Operación` IS NOT NULL) OR (fc.operacion IS NOT NULL AND v.`Operación` IS NULL));
