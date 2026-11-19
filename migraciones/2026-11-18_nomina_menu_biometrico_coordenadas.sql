-- Subpestaña "Direcciones y Coordenadas" de Nómina › Biométrico: pasa a Maestro_Menu como la
-- Sección 'Biometrico_Coordenadas', para escoger los roles desde Configuración › Visual.
-- Antes la veía quien tuviera acceso a Biométrico y Operación 'Administración' (regla fija en
-- src/routes/nomina.js). Los roles de abajo son los de los 13 usuarios que la veían el 2026-11-18,
-- así que nadie gana ni pierde acceso. Sin Url: da permiso pero no sale en el menú OTROS.
-- Solo agrega una fila. Se puede ejecutar más de una vez.

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'nomina', 'Biometrico_Coordenadas',
       'AdmSst, Asistencial, Control, Directorth, Juridica, LiderSst, Nomina, Sistema, subgerente',
       1, 'Biométrico · Direcciones y Coordenadas', NULL, NULL, NULL,
       'Ver y editar la dirección y las coordenadas GPS de cada operación (Maestro_Operaciones), que usa el biométrico para medir la distancia del registro a la operación.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'nomina' AND Seccion = 'Biometrico_Coordenadas');

SELECT ID, Seccion, Rol, Acceso FROM Maestro_Menu WHERE Modulo = 'nomina' AND Seccion = 'Biometrico_Coordenadas';
