-- Migración: Agregar columna Color a Config_Asistencia y asignar colores según convención
-- Fecha: 2026-11-05

-- 1. Agregar columna Color si no existe
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'Config_Asistencia' 
    AND COLUMN_NAME = 'Color'
);

SET @sql = IF(@col_exists = 0, 'ALTER TABLE Config_Asistencia ADD COLUMN Color VARCHAR(20) NULL DEFAULT NULL AFTER Evento;', 'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Asignar códigos de color HEX según la convención corporativa
UPDATE Config_Asistencia SET Color = '#FFFFFF' WHERE Novedad = 'Asistencia';
UPDATE Config_Asistencia SET Color = '#E97132' WHERE Novedad = 'Ausentismo';
UPDATE Config_Asistencia SET Color = '#00B0F0' WHERE Novedad = 'Ausentismo Pendiente Incapacidad';
UPDATE Config_Asistencia SET Color = '#FFFFDD' WHERE Novedad = 'Apoyo a Otra Operación';
UPDATE Config_Asistencia SET Color = '#EAD1DC' WHERE Novedad = 'Calamidad';
UPDATE Config_Asistencia SET Color = '#FFFFDD' WHERE Novedad = 'Descanso';
UPDATE Config_Asistencia SET Color = '#EAD1DC' WHERE Novedad = 'Día de Familia';
UPDATE Config_Asistencia SET Color = '#94DCF8' WHERE Novedad = 'Incapacidad';
UPDATE Config_Asistencia SET Color = '#EAD1DC' WHERE Novedad = 'Licencia de Luto';
UPDATE Config_Asistencia SET Color = '#A2C4C9' WHERE Novedad = 'Licencia Maternidad';
UPDATE Config_Asistencia SET Color = '#7030A0' WHERE Novedad = 'Licencia No Remunerada';
UPDATE Config_Asistencia SET Color = '#A2C4C9' WHERE Novedad = 'Licencia Paternidad';
UPDATE Config_Asistencia SET Color = '#E97132' WHERE Novedad = 'No pago por ausentismo';
UPDATE Config_Asistencia SET Color = '#7030A0' WHERE Novedad = 'Permiso No Remunerado';
UPDATE Config_Asistencia SET Color = '#EAD1DC' WHERE Novedad = 'Permiso Remunerado';
UPDATE Config_Asistencia SET Color = '#FFFFDD' WHERE Novedad = 'Restricción Medica';
UPDATE Config_Asistencia SET Color = '#FF0000' WHERE Novedad = 'Retirado';
UPDATE Config_Asistencia SET Color = '#FF00FF' WHERE Novedad = 'Sin Operación';
UPDATE Config_Asistencia SET Color = '#EA9999' WHERE Novedad = 'Suspendido';
UPDATE Config_Asistencia SET Color = '#FFFFDD' WHERE Novedad = 'Traslado';
UPDATE Config_Asistencia SET Color = '#FAF402' WHERE Novedad = 'Vacaciones';
UPDATE Config_Asistencia SET Color = '#94DCF8' WHERE Novedad = 'Incapacidad General Accidente de Transito';
UPDATE Config_Asistencia SET Color = '#94DCF8' WHERE Novedad = 'Incapacidad Pagada Por La Empresa';
UPDATE Config_Asistencia SET Color = '#94DCF8' WHERE Novedad = 'Incapacidad Por Accidente de Trabajo';
UPDATE Config_Asistencia SET Color = '#94DCF8' WHERE Novedad = 'Incapacidad Por Enfermedad General';
UPDATE Config_Asistencia SET Color = '#94DCF8' WHERE Novedad = 'Incapacidad por Enfermedad Profesional';
UPDATE Config_Asistencia SET Color = '#C1F0C8' WHERE Novedad = 'Incapacidad Reconocida AFP (+180)';
UPDATE Config_Asistencia SET Color = '#D9E2EC' WHERE Novedad = 'Nuevo';
