-- Talent Hub › Aspirantes: roles que pueden pasar un aspirante "bloqueado" a "En proceso" (Panel Admin).
-- Si la fila no existe, el código usa 'Sistema, CoorSelección'. Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Aspirantes', 'Roles que pueden desbloquear aspirantes', 'Rol', 'Sistema, CoorSelección',
       'Roles (separados por coma) que pueden pasar un aspirante en estado "bloqueado" (su documento de identidad no coincidió con el registrado) a "En proceso" desde el Panel Admin. Los demás roles no ven el botón. Vacío = nadie puede desbloquear.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Aspirantes'
                  AND Concepto = 'Roles que pueden desbloquear aspirantes');

SELECT Concepto, Parametro FROM Config_Parametros
WHERE Modulo = 'talenthub' AND Seccion = 'Aspirantes' AND Concepto = 'Roles que pueden desbloquear aspirantes';
