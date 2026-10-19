-- Parámetros configurables de la pestaña Retiros (Nómina).
-- Se puede ejecutar más de una vez: solo inserta las filas que todavía no existen.
-- Los valores son los mismos que tenía el código, así que el comportamiento no cambia
-- hasta que se editen en la tabla.
--
-- Notas:
--  * "Notificación de retiro - Copia:" acepta correos (con @) y roles. Auxiliar,
--    AuxiliarR, Coordinador y CoordinadorR se resuelven según la Operación del
--    trabajador; otros roles envían a todos los usuarios con ese Rol.
--  * Las listas se separan con coma.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Retiros', 'Puede gestionar documentos de retiro', 'Rol', 'Sistema, Nomina, Asistencial'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Puede gestionar documentos de retiro'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Retiros', 'Puede gestionar documentos de retiro según regional', 'Rol', 'Coordinador, CoordinadorR, Auxiliar, AuxiliarR'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Puede gestionar documentos de retiro según regional'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Retiros', 'Regional sin gestión de documentos', 'Regional', 'ANTIOQUIA'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Regional sin gestión de documentos'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Retiros', 'Puede editar retiro registrado', 'Rol', 'Nomina, Sistema'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Puede editar retiro registrado'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Retiros', 'Operación donde Nómina debe marcar Retirado', 'Operación', 'Administracion'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Operación donde Nómina debe marcar Retirado'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Retiros', 'Puede editar Fecha de Retiro', 'Rol', 'Nomina, Sistema'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Puede editar Fecha de Retiro'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Retiros', 'Puede modificar artículos de Paz y Salvo guardados', 'Rol', 'Nomina, Sistema'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Puede modificar artículos de Paz y Salvo guardados'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Retiros', 'Puede reenviar Paz y Salvo a áreas', 'Rol', 'Nomina, Sistema'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Puede reenviar Paz y Salvo a áreas'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Retiros', 'Notificación de retiro - Para:', 'Correo', 'retiros@logyser.com'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Notificación de retiro - Para:'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Retiros', 'Notificación de retiro - Copia:', 'Rol', 'admin@logyser.com, Auxiliar, AuxiliarR, Coordinador, CoordinadorR'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Notificación de retiro - Copia:'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Retiros', 'Cargos con copia administrativa', 'Cargo', 'AUXILIAR ADMINISTRATIVO DE OPERACIÓN, AUXILIAR ADMINISTRATIVO REGIONAL, COORDINADOR LOGISTICO, COORDINADOR REGIONAL, SUBGERENTE DE OPERACIONES'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Cargos con copia administrativa'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Retiros', 'Notificación de retiro - Copia cargos administrativos:', 'Correo', 'jefe.facturacion@logyser.com, jefe.contabilidad@logyser.com, gestioncalidad@logyser.com, controlcuentas@logyser.com, directorrh@logyser.com, subgerenciaoperaciones@logyser.com, administradorti@logyser.com, nomina@logyser.com, seleccion@logyser.com'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Notificación de retiro - Copia cargos administrativos:'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Retiros', 'Cargos con copia SST', 'Cargo', 'ANALISTA DE SST, AUXILIAR SST'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Cargos con copia SST'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Retiros', 'Notificación de retiro - Copia cargos SST:', 'Correo', 'sstadmon@logyser.com'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Notificación de retiro - Copia cargos SST:'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro)
SELECT 'nomina', 'Retiros', 'Habilitar notificaciones de correo en Retiros', 'Booleano', '1'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Retiros' AND Concepto = 'Habilitar notificaciones de correo en Retiros'
);

-- Verificación
SELECT id, Concepto, Condicion, Parametro FROM Config_Parametros
WHERE Modulo = 'nomina' AND Seccion = 'Retiros' ORDER BY id;
