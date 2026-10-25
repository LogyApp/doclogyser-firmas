-- Quién puede crear, eliminar y gestionar plantillas en las pestañas de SST (Evaluación,
-- Capacitación, Prueba de Consumo y Compromisos). Antes estaba fijo en el código
-- (ROLES_ESCRITURA_SST en accesoSst.js y sst/index.html, y LiderSst/Sistema para plantillas).
-- Ver la pestaña sigue en Maestro_Menu. Los valores iniciales son los que tenía el código.
-- Se puede ejecutar más de una vez: solo inserta las filas que todavía no existen.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Evaluación SST', 'Roles que pueden crear evaluaciones en SST', 'Rol', 'AdmSst, AnaSst, AuxSst, LiderSst, Sistema',
       'Roles que ven el botón Crear (individual y masivo) de Evaluación SST, y pueden reenviar la firma o regenerar el enlace. Los demás roles con acceso a la pestaña solo consultan.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Evaluación SST' AND Concepto = 'Roles que pueden crear evaluaciones en SST');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Evaluación SST', 'Roles que pueden eliminar evaluaciones en SST', 'Rol', 'AdmSst, AnaSst, AuxSst, LiderSst, Sistema',
       'Roles que pueden eliminar evaluaciones sin firmar. Además, salvo Sistema, solo pueden eliminar las que crearon ellos mismos.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Evaluación SST' AND Concepto = 'Roles que pueden eliminar evaluaciones en SST');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Capacitación SST', 'Roles que pueden crear capacitaciones en SST', 'Rol', 'AdmSst, AnaSst, AuxSst, LiderSst, Sistema',
       'Roles que ven el botón Crear (individual y masivo) de Capacitación SST, y pueden reenviar la firma o regenerar el enlace. Los demás roles con acceso a la pestaña solo consultan.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Capacitación SST' AND Concepto = 'Roles que pueden crear capacitaciones en SST');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Capacitación SST', 'Roles que pueden eliminar capacitaciones en SST', 'Rol', 'AdmSst, AnaSst, AuxSst, LiderSst, Sistema',
       'Roles que pueden eliminar capacitaciones sin firmar. Además, salvo Sistema, solo pueden eliminar las que crearon ellos mismos.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Capacitación SST' AND Concepto = 'Roles que pueden eliminar capacitaciones en SST');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Capacitación SST', 'Roles que pueden gestionar plantillas de capacitación', 'Rol', 'LiderSst, Sistema',
       'Roles que entran al panel de plantillas (cuestionarios) de capacitación y pueden crearlas, editarlas, activarlas o eliminarlas.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Capacitación SST' AND Concepto = 'Roles que pueden gestionar plantillas de capacitación');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Prueba de Consumo', 'Roles que pueden crear pruebas de consumo', 'Rol', 'AdmSst, AnaSst, AuxSst, LiderSst, Sistema',
       'Roles que ven el botón Crear (individual y masivo) de Prueba de Consumo, y pueden editarlas, enviar el enlace o regenerarlo. Los demás roles con acceso a la pestaña solo consultan.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Prueba de Consumo' AND Concepto = 'Roles que pueden crear pruebas de consumo');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Prueba de Consumo', 'Roles que pueden eliminar pruebas de consumo', 'Rol', 'AdmSst, AnaSst, AuxSst, LiderSst, Sistema',
       'Roles que pueden eliminar pruebas de consumo sin firmar. Además, salvo Sistema, solo pueden eliminar las que crearon ellos mismos.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Prueba de Consumo' AND Concepto = 'Roles que pueden eliminar pruebas de consumo');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Compromiso SST', 'Roles que pueden crear compromisos SST', 'Rol', 'AdmSst, AnaSst, AuxSst, LiderSst, Sistema',
       'Roles que ven el botón Crear (individual y masivo) de Compromisos SST, y pueden enviar el enlace de firma o regenerarlo. Los demás roles con acceso a la pestaña solo consultan.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Compromiso SST' AND Concepto = 'Roles que pueden crear compromisos SST');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Compromiso SST', 'Roles que pueden eliminar compromisos SST', 'Rol', 'AdmSst, AnaSst, AuxSst, LiderSst, Sistema',
       'Roles que pueden eliminar compromisos sin firmar. Además, salvo Sistema, solo pueden eliminar los que crearon ellos mismos.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Compromiso SST' AND Concepto = 'Roles que pueden eliminar compromisos SST');

-- Verificación
SELECT id, Seccion, Concepto, Parametro FROM Config_Parametros
WHERE Modulo = 'sst' AND Seccion IN ('Evaluación SST', 'Capacitación SST', 'Prueba de Consumo', 'Compromiso SST') ORDER BY id;
