-- Parámetros de la notificación de nuevo ingreso (Selección → Finalizar y enviar a Sociodemográfica).
-- Se puede ejecutar más de una vez: solo inserta las filas que todavía no existen.
-- El grupo de cada cargo se define en Config_Cargo_Laboral.Notificar (1, 2 o 3).
-- Las listas son de ROLES (se envía al Email de Maestro_Usuarios). Auxiliar, AuxiliarR,
-- Coordinador y CoordinadorR se resuelven según la Operación del trabajador.
-- Quien finaliza el proceso siempre va en copia.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'talenthub', 'Sociodemografica', 'Notificación de ingreso grupo 1 - Para:', 'Rol', 'Nomina, Facturación, Contabilidad, LiderSst, CoorSelección, Inventario, Cuentas, Directorth, Calidad'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Notificación de ingreso grupo 1 - Para:'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'talenthub', 'Sociodemografica', 'Notificación de ingreso grupo 2 - Para:', 'Rol', 'Nomina, LiderSst, CoorSelección, Directorth, Calidad'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Notificación de ingreso grupo 2 - Para:'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'talenthub', 'Sociodemografica', 'Notificación de ingreso grupo 3 - Para:', 'Rol', 'Auxiliar, AuxiliarR, Coordinador, CoordinadorR'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Notificación de ingreso grupo 3 - Para:'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'talenthub', 'Sociodemografica', 'Notificación de ingreso - Copia:', 'Rol', 'Sistema'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Notificación de ingreso - Copia:'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'talenthub', 'Sociodemografica', 'Habilitar notificaciones de correo en Ingresos', 'Booleano', '1'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Habilitar notificaciones de correo en Ingresos'
);

-- Verificación
SELECT id, Concepto, Condicion, Parametro FROM Config_Parametros
WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' ORDER BY id;
