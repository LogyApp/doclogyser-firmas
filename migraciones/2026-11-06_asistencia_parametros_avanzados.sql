-- Migración: Parámetros avanzados para el módulo de Asistencia y Novedades
-- Fecha: 2026-11-06
-- Roles para días futuros, roles para ver novedades de Sistema, cargos excluidos de asistencia y roles exentos.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Asistencia', 'Roles_Registrar_Dias_Futuros', 'Roles', 'Nomina, Sistema',
       'Roles autorizados para registrar asistencia o fecha inicial de novedad en días posteriores a la fecha actual.'
WHERE NOT EXISTS (
    SELECT 1 FROM Config_Parametros
    WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Registrar_Dias_Futuros'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Asistencia', 'Roles_Ver_Novedades_Sistema', 'Roles', 'Nomina, Sistema',
       'Roles que pueden visualizar y registrar tipos de novedad clasificados con Evento Sistema (Nuevo, Retirado, Traslado) en Config_Asistencia.'
WHERE NOT EXISTS (
    SELECT 1 FROM Config_Parametros
    WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Ver_Novedades_Sistema'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Asistencia', 'Cargos_Excluidos_Asistencia', 'Cargos', 'APRENDIZ, AUXILIAR ADMINISTRATIVO DE OPERACIÓN, AUXILIAR ADMINISTRATIVO REGIONAL, COORDINADOR LOGISTICO, COORDINADOR REGIONAL, AUXILIAR SST, ANALISTA DE SST',
       'Cargos obligados a registrar asistencia mediante Biométrico. No disponibles para ingreso manual en ventana emergente salvo para roles autorizados.'
WHERE NOT EXISTS (
    SELECT 1 FROM Config_Parametros
    WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Cargos_Excluidos_Asistencia'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Asistencia', 'Roles_Exencion_Cargos_Asistencia', 'Roles', 'Nomina, Sistema',
       'Roles autorizados para registrar asistencia manual a colaboradores con cargos obligados a Biométrico.'
WHERE NOT EXISTS (
    SELECT 1 FROM Config_Parametros
    WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Exencion_Cargos_Asistencia'
);
