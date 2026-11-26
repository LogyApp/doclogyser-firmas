-- Cloud Docs › LogySign: permisos de No firma y de eliminar registros pendientes (antes cualquier
-- usuario podía hacerlo). Config_Parametros Modulo 'CloudDocs', Seccion 'LogySign'
-- (src/services/configLogysign.js). Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Roles que pueden marcar No firma', '', 'Sistema, Juridica, Contratación',
       'Roles (separados por coma) que pueden cerrar un documento pendiente como No firma: genera el PDF con la anotación de soporte y lo registra en Cloud Docs. Solo sobre registros que el usuario ve. Vacío: nadie.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Roles que pueden marcar No firma');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'CloudDocs', 'LogySign', 'Roles que pueden eliminar registros pendientes', '', 'Sistema',
       'Roles (separados por coma) que pueden eliminar registros de LogySign que no están firmados (pendientes, vencidos, programados o cancelados). Quien creó el registro siempre puede eliminarlo. Vacío: solo quien lo creó.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'CloudDocs' AND Seccion = 'LogySign' AND Concepto = 'Roles que pueden eliminar registros pendientes');
