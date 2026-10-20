-- Parámetros configurables de la pestaña Traslados (Nómina).
-- Se puede ejecutar más de una vez: solo inserta las filas que todavía no existen.
-- Las listas de notificación son de ROLES (se envía al Email de Maestro_Usuarios).
-- Auxiliar, AuxiliarR, Coordinador y CoordinadorR se resuelven según la Operación
-- Destino del traslado. Quien registró el traslado siempre va en Copia.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Traslados', 'Puede validar traslados', 'Rol', 'Juridica, Sistema'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Puede validar traslados'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Traslados', 'Puede editar plantilla de traslados', 'Rol', 'Juridica, Sistema'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Puede editar plantilla de traslados'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Traslados', 'Puede previsualizar documento de traslado', 'Rol', 'Juridica, Sistema'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Puede previsualizar documento de traslado'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Traslados', 'Horas de vigencia del enlace de firma', 'Número', '48'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Horas de vigencia del enlace de firma'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Traslados', 'Notificación nuevo traslado - Para:', 'Rol', 'Juridica'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Notificación nuevo traslado - Para:'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Traslados', 'Notificación nuevo traslado - Copia:', 'Rol', 'Sistema'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Notificación nuevo traslado - Copia:'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Traslados', 'Notificación firma trabajador - Copia:', 'Rol', 'Juridica, Sistema, Auxiliar, AuxiliarR, Coordinador, CoordinadorR'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Notificación firma trabajador - Copia:'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Traslados', 'Notificación documento generado - Para:', 'Rol', 'Juridica, Control'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Notificación documento generado - Para:'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Traslados', 'Notificación documento generado - Copia:', 'Rol', 'Nomina, Sistema, CoorSelección, Contratación, Inventario, Auxiliar, AuxiliarR, Coordinador, CoordinadorR'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Notificación documento generado - Copia:'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Traslados', 'Cargos con copia de Calidad en traslados', 'Cargo', 'COORDINADOR LOGISTICO, AUXILIAR ADMINISTRATIVO DE OPERACIÓN, AUXILIAR ADMINISTRATIVO REGIONAL, COORDINADOR REGIONAL'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Cargos con copia de Calidad en traslados'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Traslados', 'Notificación traslado - Copia por cargo:', 'Rol', 'Calidad, Directorth'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Notificación traslado - Copia por cargo:'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Traslados', 'Habilitar notificaciones de correo en Traslados', 'Booleano', '1'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Traslados' AND Concepto = 'Habilitar notificaciones de correo en Traslados'
);

-- Verificación
SELECT id, Concepto, Condicion, Parametro FROM Config_Parametros
WHERE Modulo = 'nomina' AND Seccion = 'Traslados' ORDER BY id;
