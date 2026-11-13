-- Correo programado de consignaciones atrasadas (7:40 a. m., consignacionesAtrasadasNotifier.js).
-- Si las filas no existen, el código usa los mismos valores por defecto. Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'contabilidad', 'Consignaciones', 'Habilitar notificaciones de correo en Consignaciones atrasadas', 'Booleano', '1',
       'Activa (1) o desactiva (0) el correo diario de las 7:40 a. m. con las operaciones que tienen días con efectivo sin consignar de antes de ayer o anteriores. Sin fila = activo.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'contabilidad' AND Seccion = 'Consignaciones'
                  AND Concepto = 'Habilitar notificaciones de correo en Consignaciones atrasadas');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'contabilidad', 'Consignaciones', 'Correos que reciben el reporte de consignaciones atrasadas', 'Correo', 'auditoria.recaudo@logyser.com, asistente.contabilidad@logyser.com',
       'Correos (separados por coma) que reciben el reporte general diario de consignaciones atrasadas, siempre con copia a admin@logyser.com. Los responsables de cada operación reciben aparte un aviso informativo. Vacío = no se envía el reporte general.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'contabilidad' AND Seccion = 'Consignaciones'
                  AND Concepto = 'Correos que reciben el reporte de consignaciones atrasadas');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'contabilidad', 'Consignaciones', 'Días que revisa el reporte de consignaciones atrasadas', 'Número', '30',
       'Cuántos días hacia atrás revisa el correo de consignaciones atrasadas (entre 1 y 365). Los días sin consignar más antiguos no aparecen. Vacío o sin fila = 30.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'contabilidad' AND Seccion = 'Consignaciones'
                  AND Concepto = 'Días que revisa el reporte de consignaciones atrasadas');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'contabilidad', 'Consignaciones', 'Operaciones excluidas del reporte de consignaciones atrasadas', 'Operación', '',
       'Operaciones (separadas por coma, como en Maestro_Operaciones) que no se revisan en el correo de consignaciones atrasadas, por ejemplo las que consignan por otro medio. Vacío = se revisan todas.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'contabilidad' AND Seccion = 'Consignaciones'
                  AND Concepto = 'Operaciones excluidas del reporte de consignaciones atrasadas');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'contabilidad', 'Consignaciones', 'Diferencia en pesos que se tolera por día en consignaciones', 'Número', '2000',
       'En el correo de consignaciones atrasadas, un día cubierto en parte por una consignación no se reporta si lo que falta es igual o menor a este valor en pesos (redondeos al consignar). Vacío o sin fila = 2000.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'contabilidad' AND Seccion = 'Consignaciones'
                  AND Concepto = 'Diferencia en pesos que se tolera por día en consignaciones');

SELECT Concepto, Parametro FROM Config_Parametros
WHERE Modulo = 'contabilidad' AND Seccion = 'Consignaciones' AND (Concepto LIKE '%atrasadas%' OR Concepto LIKE 'Diferencia en pesos%');
