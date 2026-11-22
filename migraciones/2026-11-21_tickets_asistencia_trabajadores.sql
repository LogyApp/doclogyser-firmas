-- Tickets de Asistencia: módulo por defecto en Nómina › Asistencia y Novedades, motivos y
-- trabajadores del ticket (identificaciones separadas por coma). Se puede ejecutar más de una vez.

-- 1. Columna con las identificaciones de los trabajadores del ticket
SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_Tickets' AND COLUMN_NAME = 'identificaciones');
SET @sql := IF(@existe = 0,
  'ALTER TABLE Dynamic_Tickets ADD COLUMN identificaciones VARCHAR(2000) NULL COMMENT ''Identificaciones de los trabajadores del ticket, separadas por coma (módulos como Asistencia)''',
  'SELECT ''identificaciones ya existe''');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- 2. Módulo por defecto "Asistencia" en Nómina › Asistencia y Novedades (fila ancla, Motivo NULL)
UPDATE Config_motivo_tickets SET ModuloERP = 'nomina', Seccion = 'Asistencia'
 WHERE Modulo = 'Asistencia' AND Motivo IS NULL;

-- 3. Motivos de Asistencia
INSERT INTO Config_motivo_tickets (Modulo, Motivo)
SELECT 'Asistencia', m.Motivo FROM (
  SELECT 'Agregar evento a personal retirado' AS Motivo UNION ALL
  SELECT 'Modificar hora Ingreso - Salida' UNION ALL
  SELECT 'Modificar Asistencia' UNION ALL
  SELECT 'Otros'
) m
WHERE NOT EXISTS (SELECT 1 FROM Config_motivo_tickets c WHERE c.Modulo = 'Asistencia' AND c.Motivo = m.Motivo);

-- 4. Módulos de ticket en los que se escogen trabajadores
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'configuracion', 'Tickets', 'Módulos de ticket que piden trabajadores', 'Lista', 'Asistencia',
       'Módulos de ticket (Config_motivo_tickets.Modulo, separados por coma) en los que el botón Ticket muestra el campo Trabajadores para escoger a los trabajadores de la operación. Si se deja vacía, ningún módulo lo muestra.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'configuracion' AND Seccion = 'Tickets' AND Concepto = 'Módulos de ticket que piden trabajadores');
