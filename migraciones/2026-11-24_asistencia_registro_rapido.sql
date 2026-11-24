-- Asistencia y Novedades: botón "Registro rápido" en la subpestaña Registros.
-- Registra asistencia o novedad por cédula + día/rango, con el ticket en Observaciones
-- (reemplaza el INSERT manual a Dynamic_Asistencia). Se puede ejecutar más de una vez.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Asistencia', 'Roles_Registro_Rapido', '', 'Sistema',
       'Roles (separados por coma) que ven el botón "Registro rápido" en Asistencia y Novedades > Registros: registran asistencia o novedades por cédula y ticket, sin adjuntos. Vacío = nadie lo ve.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Registro_Rapido'
);
