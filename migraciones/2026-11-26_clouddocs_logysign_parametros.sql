-- Cloud Docs › LogySign: reglas que estaban fijas en src/routes/logysign.js, registrologysign.js,
-- logysignScheduler.js y las vistas pasan a Config_Parametros (Modulo 'CloudDocs', Seccion 'LogySign';
-- src/services/configLogysign.js). Los documentos van por Prefijo de Config_Doc_Trabajador.
-- Los valores son los mismos que tenía el código, salvo la copia a admin@ (se asigna por documento). Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Habilitar notificaciones de correo en LogySign', 'Booleano', '1',
       '1 = se envían los correos de LogySign: enlace de firma al trabajador (inmediato, programado o reenviado) y aviso de documento firmado. 0 = no se envían; el enlace se comparte por WhatsApp o copiándolo desde Registros.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Habilitar notificaciones de correo en LogySign');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Días de vigencia del enlace de firma', '', '30',
       'Días que dura el enlace de firma desde que se envía al trabajador. Reenviar o Renovar desde Registros vuelve a contar el plazo. Vacío o no válido: 30 días.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Días de vigencia del enlace de firma');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Días de vigencia del enlace de la Autorización de Descuento del contrato', '', '30',
       'Días que dura el enlace de la Autorización de Descuento que se crea junto con el contrato desde LogySign (y al reenviarlo). Vacío o no válido: 30 días.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Días de vigencia del enlace de la Autorización de Descuento del contrato');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Documentos que piden Causa', '', 'CR, TCR, TCRP',
       'Prefijos de Config_Doc_Trabajador (separados por coma) que piden Causa de desvinculación al enviar a firma; las causas nuevas se guardan en Config_Motivos_Documento. Vacío: ningún documento pide causa.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Documentos que piden Causa');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Documentos con Causa editable en Registros', '', 'CR',
       'Prefijos (separados por coma) cuya Causa se puede cambiar haciendo clic en la columna Causa de Registros. Vacío: la causa no se edita en ningún documento.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Documentos con Causa editable en Registros');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Documentos que se envían con la Autorización de Descuento', '', 'CONT',
       'Prefijos (separados por coma) que al enviarse a firma crean también la Autorización de Descuento por Nómina (Anticipada) y mandan los dos enlaces en el mismo correo; se puede desmarcar en el formulario. Vacío: nunca.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Documentos que se envían con la Autorización de Descuento');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Documentos que no copian a los responsables de la Operación', '', 'CONT',
       'Prefijos (separados por coma) cuyos correos no van en copia al Auxiliar, Coordinador, AuxiliarR y CoordinadorR de la Operación del trabajador (solo a quien envía y las copias fijas). Vacío: todos copian a los responsables.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Documentos que no copian a los responsables de la Operación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Roles que ven todos los registros', '', 'Sistema',
       'Roles (separados por coma) que ven todos los registros de LogySign y la columna Creado por. Los demás ven solo lo que crearon (o lo de Documentos de Ingreso, según el parámetro de ese nombre).'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Roles que ven todos los registros');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Roles que ven los Documentos de Ingreso', '', 'Contratación, Archivo, Asistencial',
       'Roles (separados por coma) que ven los registros de la clasificación de Documentos de Ingreso, más los que ellos crearon, y la columna Creado por. Vacío: solo ven lo que crearon.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Roles que ven los Documentos de Ingreso');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Clasificación de los Documentos de Ingreso', '', 'Documentos de Ingreso',
       'Texto que identifica la Clasificación de Config_Doc_Trabajador de los Documentos de Ingreso (se busca contenido, sin el número). Lo usa el parámetro Roles que ven los Documentos de Ingreso.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Clasificación de los Documentos de Ingreso');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Roles que ven la columna y el filtro Causa', '', 'Sistema, Juridica',
       'Roles (separados por coma) que ven la columna Causa y el filtro por Causa en Registros de LogySign. Vacío: nadie.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Roles que ven la columna y el filtro Causa');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Documento preseleccionado por rol', 'Contratación', 'CONT',
       'El rol va en Condicion (para otro rol, agregue una fila cuyo Concepto empiece por Documento preseleccionado por rol, ej. ... por rol - Juridica): Prefijo del documento que el formulario de LogySign deja seleccionado al abrir. Parametro vacío: no preselecciona nada para ese rol.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Documento preseleccionado por rol' AND Condicion = 'Contratación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Texto por defecto de la anotación No firma', '', 'El trabajador no firma,|se soporta por correo electrónico',
       'Texto que se propone al marcar No firma y que se escribe en el cuadro de firma del PDF. El símbolo | separa los renglones. Vacío: se usa este mismo texto.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Texto por defecto de la anotación No firma');

-- Copias de los correos de LogySign (antes correos escritos en logysignScheduler.js). Cada valor es
-- un Rol (se envía al Email de los usuarios de Maestro_Usuarios con ese Rol) o un correo escrito tal
-- cual para los buzones que no tienen rol (admin@, retiros@).

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Retiros', 'CR, PRE, TCR, TCRP', 'retiros@logyser.com',
       'Copia por grupo de documentos (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Retiros');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Otrosí', 'MODCTO', 'Nomina, Contratación',
       'Copia por grupo de documentos (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Otrosí');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Calamidad', 'PCD', 'Nomina',
       'Copia por grupo de documentos (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Calamidad');

-- 'Copia en todos los documentos' se reemplaza por una fila por documento: la fila que ya existía pasa a
-- ser la del Contrato (sin destinatarios) y cada documento queda con su propia copia, que se llena a mano.
UPDATE Config_Parametros
SET Concepto = 'Copia por documento - Contrato firmado', Condicion = 'CONT', Parametro = '',
    Descripcion = 'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia en todos los documentos';

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Contrato firmado', 'CONT', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Contrato firmado');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Citación a Descargos', 'CDES', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Citación a Descargos');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Acta de Descargos', 'ACTDES', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Acta de Descargos');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Cierre Proceso Disciplinario', 'CPDIS', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Cierre Proceso Disciplinario');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Descuentos de Nómina', 'DCTO', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Descuentos de Nómina');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Proceso Disciplinario', 'PDIS', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Proceso Disciplinario');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Otros Juridica', 'OTROJR', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Otros Juridica');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Comunicación', 'COMJUR', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Comunicación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Liquidación de Vacaciones', 'VAC', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Liquidación de Vacaciones');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Solicitud de vacaciones', 'SVAC', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Solicitud de vacaciones');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Acta de Descargos y Retroalimentación', 'ACTDRET', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Acta de Descargos y Retroalimentación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Acta de conocimiento de condiciones contractuales', 'ACTCON', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Acta de conocimiento de condiciones contractuales');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Terminación por finalización de la obra o labor contratada', 'TCRPOL', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Terminación por finalización de la obra o labor contratada');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Paz y salvo', 'PZ', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Paz y salvo');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Incapacidad', 'INC', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Incapacidad');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Otros', 'OTROS', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Otros');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Traslados', 'TRAS', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Traslados');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Documento de Retiro', 'RET', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Documento de Retiro');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Liquidación Definitiva', 'LIQDEF', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Liquidación Definitiva');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Copia por documento - Normas de seguridad en la operación', 'SEOP', '',
       'Copia por documento (se pueden agregar más filas cuyo Concepto empiece por Copia por documento): Condicion = prefijos (separados por coma), Parametro = roles o correos en copia de los correos de esos documentos. Un Rol envía al Email de sus usuarios en Maestro_Usuarios. Vacío: sin copia adicional.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Copia por documento - Normas de seguridad en la operación');

-- Responsables de la Operación del trabajador que van en copia (antes fijos en logysignScheduler.js)
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Roles responsables de la Operación en copia', '', 'Auxiliar, Coordinador, AuxiliarR, CoordinadorR',
       'Roles (separados por coma) que van en copia de los correos de LogySign cuando tienen la misma Operación del trabajador (o, si nadie la tiene, la SOCIODEMOGRAFICA de la operación en su Dispositivo). No aplica a Documentos que no copian a los responsables de la Operación. Vacío: nadie.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Roles responsables de la Operación en copia');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Roles en copia por Regional cuando la Operación no tiene responsables', '', 'AuxiliarR, CoordinadorR',
       'Roles (separados por coma) de la Regional del trabajador que van en copia cuando la Operación no tiene ningún responsable (ver Roles responsables de la Operación en copia). Vacío: nadie.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Roles en copia por Regional cuando la Operación no tiene responsables');
