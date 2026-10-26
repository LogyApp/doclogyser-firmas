-- ==============================================================================
-- Migración: Permitir NULL en Dynamic_Logueo_Servicios.Dato
-- Fecha: 2026-10-25
-- Descripción: Permite valores NULL en la columna Dato de la tabla de auditoría
--              Dynamic_Logueo_Servicios.
-- Motivo: Cuando se actualiza un campo en Dynamic_Servicios a NULL (ej: desvincular
--         una Transportadora o Proveedor al eliminarla), el trigger
--         `logueo_servicios_update` inserta el nuevo valor (NULL) en Dato,
--         provocando el error 1048: "Column 'Dato' cannot be null".
--         Las demás tablas de auditoría (Dynamic_Logueo_Trabajadores y
--         Logueo_Servicios) ya tienen Dato configurado como NULL.
-- ==============================================================================

ALTER TABLE Dynamic_Logueo_Servicios MODIFY Dato varchar(250) NULL DEFAULT NULL;
