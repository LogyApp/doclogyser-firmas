-- "No tomó cargo" pasa del formulario de retiro a un botón en Nómina › Activos (al lado de "Tomó Cargo",
-- mismos roles: nomina / Activos / Puede confirmar toma de cargo). El botón deja la vinculación Retirada con
-- Motivo "No tomó cargo" y Fecha de Retiro = Fecha de Ingreso (POST /nomina/api/no-tomo-cargo).
-- Parámetros en Config_Parametros (nomina / Retiros), leídos en src/services/configRetiro.js:
--   Motivos de retiro sin días laborados: la asistencia pone Retirado desde el mismo día del ingreso
--     (plantillaAsistencia.js, rellenoAsistencia.js, controlQuincena.js).
--   Motivos ocultos en formulario de retiro: no aparecen en la lista del formulario de retiro.
-- Solo agrega filas. Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Retiros', 'Motivos de retiro sin días laborados', 'Lista', 'No tomó cargo',
       'Motivos de retiro (separados por coma) con los que la persona no laboró ningún día: en Asistencia el Retirado empieza el mismo día del ingreso (no el día siguiente al retiro) y el Control de quincena no espera asistencia ese día. Vacío = ningún motivo; la regla normal (Retirado desde el día siguiente a la fecha de retiro) aplica a todos.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Motivos de retiro sin días laborados');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Retiros', 'Motivos ocultos en formulario de retiro', 'Lista', 'No tomó cargo',
       'Motivos de retiro (separados por coma) que no se ofrecen en el formulario de retiro porque se registran por otro camino: "No tomó cargo" se registra con el botón de Nómina › Activos. Los retiros ya registrados con estos motivos se pueden seguir editando. Vacío = el formulario muestra todos los motivos de Config_condicion_retiros.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Motivos ocultos en formulario de retiro');

SELECT Concepto, Condicion, Parametro FROM Config_Parametros
 WHERE Modulo = 'nomina' AND Seccion = 'Retiros'
   AND Concepto IN ('Motivos de retiro sin días laborados', 'Motivos ocultos en formulario de retiro');
