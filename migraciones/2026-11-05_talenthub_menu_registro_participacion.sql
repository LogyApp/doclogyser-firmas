-- Talent Hub > pestaña "Registro Participación".
-- La Etiqueta (texto que se ve en el menú) puede cambiarse libremente, pero Seccion y Url
-- son la llave interna de la pestaña en el código: deben seguir siendo 'RegistroAsistencia'.
-- Se puede ejecutar más de una vez.

UPDATE Maestro_Menu
SET Seccion = 'RegistroAsistencia',
    Url = '/talenthub?tab=RegistroAsistencia',
    Etiqueta = 'Registro Participación'
WHERE Modulo = 'talenthub'
  AND Seccion IN ('RegistroParticipacion', 'RegistroAsistencia');
