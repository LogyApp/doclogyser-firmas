-- Talent Hub > Sociodemográfica > Colaboradores: columna CONTRATO FIRMADO.
-- Chulito verde si el trabajador tiene en Maestro_docTrabajador un documento con TipoDocumento 18,
-- y círculo para cambiar la Condicion de Maestro_Vinculación (En Proceso / Contratado).
-- Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Puede ver Contrato', 'Rol', 'Sistema, Contratación',
       'Roles que pueden abrir el contrato firmado (Url de Maestro_docTrabajador, TipoDocumento 18) al presionar el chulito verde de la columna CONTRATO FIRMADO en Colaboradores. Los demás solo ven el chulito. Si se deja vacía, nadie puede abrirlo.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Puede ver Contrato'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Sociodemografica', 'Puede cambiar la Condicion de contrato del trabajador', 'Rol', 'Sistema, Contratación',
       'Roles que ven el círculo de la columna CONTRATO FIRMADO en Colaboradores (amarillo = En Proceso, verde = Contratado) y pueden cambiar con él la Condicion de Maestro_Vinculación. Si se deja vacía, nadie ve el círculo.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Sociodemografica' AND Concepto = 'Puede cambiar la Condicion de contrato del trabajador'
);
