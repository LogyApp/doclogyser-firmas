-- Permisos de los botones de la pestaña Activos (Nómina).
-- Se puede ejecutar más de una vez: solo inserta las filas que todavía no existen.
-- Si una fila no existe, el código usa estos mismos valores.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Activos', 'Puede confirmar toma de cargo', 'Rol', 'AuxiliarR, Auxiliar, Coordinador, CoordinadorR, Nomina, Sistema',
       'Roles que ven y pueden usar el botón "Tomó Cargo" en Nómina > Activos para confirmar que un ingreso tomó el cargo. Vacío: nadie lo ve.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Activos' AND Concepto = 'Puede confirmar toma de cargo');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Activos', 'Puede retirar trabajador', 'Rol', 'AuxiliarR, Auxiliar, Coordinador, CoordinadorR, Nomina, Sistema',
       'Roles que ven y pueden usar el botón "Retirar" en Nómina > Activos para registrar el retiro de un trabajador. Vacío: nadie lo ve.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Activos' AND Concepto = 'Puede retirar trabajador');

-- Verificación
SELECT Concepto, Condicion, Parametro, Descripcion FROM Config_Parametros
WHERE Modulo = 'nomina' AND Seccion = 'Activos' ORDER BY Concepto;
