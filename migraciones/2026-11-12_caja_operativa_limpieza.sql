-- Caja Operativa: limpieza de los datos de prueba para empezar de nuevo (confirmado por William el 2026-11-12).
-- 1) Guarda una copia de cada tabla (tablas _respaldo_20261112).
-- 2) Borra solo lo registrado ANTES del 2026-11-13, así que si se vuelve a ejecutar más adelante
--    no toca los datos nuevos. Los proveedores (Maestro_proveedorcompra) NO se borran.
-- Se puede ejecutar más de una vez.

-- 1. Respaldo
CREATE TABLE IF NOT EXISTS Maestro_responsablegastos_respaldo_20261112 AS SELECT * FROM Maestro_responsablegastos;
CREATE TABLE IF NOT EXISTS Dynamic_gastos_periodo_respaldo_20261112   AS SELECT * FROM Dynamic_gastos_periodo;
CREATE TABLE IF NOT EXISTS Dynamic_gastos_respaldo_20261112           AS SELECT * FROM Dynamic_gastos;
CREATE TABLE IF NOT EXISTS Dynamic_gasto_trabajador_respaldo_20261112 AS SELECT * FROM Dynamic_gasto_trabajador;
CREATE TABLE IF NOT EXISTS Dynamic_gastos_reintegro_respaldo_20261112 AS SELECT * FROM Dynamic_gastos_reintegro;

-- 2. Borrado de los datos de prueba (registrados antes del 2026-11-13)
DELETE FROM Dynamic_gasto_trabajador WHERE fecha_registro < '2026-11-13';
DELETE FROM Dynamic_gastos           WHERE fecha_registro < '2026-11-13';
DELETE FROM Dynamic_gastos_reintegro WHERE fecha_registro < '2026-11-13';
DELETE FROM Dynamic_gastos_periodo   WHERE fecha_registro < '2026-11-13';
DELETE FROM Maestro_responsablegastos WHERE fecha_registro < '2026-11-13';

-- 3. Verificación: las tablas deben quedar en 0 y los respaldos con los conteos anteriores
SELECT 'responsables' AS tabla, (SELECT COUNT(*) FROM Maestro_responsablegastos) AS quedan, (SELECT COUNT(*) FROM Maestro_responsablegastos_respaldo_20261112) AS respaldo
UNION ALL SELECT 'periodos', (SELECT COUNT(*) FROM Dynamic_gastos_periodo), (SELECT COUNT(*) FROM Dynamic_gastos_periodo_respaldo_20261112)
UNION ALL SELECT 'gastos', (SELECT COUNT(*) FROM Dynamic_gastos), (SELECT COUNT(*) FROM Dynamic_gastos_respaldo_20261112)
UNION ALL SELECT 'gasto_trabajador', (SELECT COUNT(*) FROM Dynamic_gasto_trabajador), (SELECT COUNT(*) FROM Dynamic_gasto_trabajador_respaldo_20261112)
UNION ALL SELECT 'reintegros', (SELECT COUNT(*) FROM Dynamic_gastos_reintegro), (SELECT COUNT(*) FROM Dynamic_gastos_reintegro_respaldo_20261112);
