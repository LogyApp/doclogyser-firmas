-- Normalización de la columna Condicion en Config_Parametros
-- Corrige registros que tenían Condicion vacía ('') o irregular ('crear', 'eliminar', 'Roles', 'Cargos', 'General', 'Sistema')
-- para que el módulo de Configuración (pestaña Parámetros) muestre el editor interactivo adecuado (selectores de roles, booleanos, números, etc.).

-- SST: ARO
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Concepto = 'Roles que pueden crear ARO';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Concepto = 'Roles que pueden eliminar ARO';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Concepto = 'Roles que pueden editar y regenerar PDF de ARO firmados';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Concepto = 'Roles que pueden eliminar ARO firmados';
UPDATE Config_Parametros SET Condicion = 'Cargo' WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Concepto = 'Cargos a los que se les genera el ARO';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Concepto = 'Rol que firma como SG-SST en el ARO';
UPDATE Config_Parametros SET Condicion = 'Booleano' WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Concepto = 'Habilitar notificaciones de correo en ARO';

-- SST: General (Personal retirado)
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'sst' AND Seccion = 'General' AND Concepto = 'Roles que pueden realizar procesos a personal retirado';

-- SST: ATS
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'sst' AND Seccion = 'ATS' AND Concepto = 'Roles que pueden registrar ATS en SST';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'sst' AND Seccion = 'ATS' AND Concepto = 'Roles que pueden eliminar ATS en SST';

-- Contabilidad: Consignaciones y Filtros
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'contabilidad' AND Seccion = 'Consignaciones' AND Concepto = 'Roles que pueden revertir o anular comprobante';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'contabilidad' AND Seccion = 'Consignaciones' AND Concepto = 'Roles que pueden editar consignación validada';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'contabilidad' AND Seccion = 'Consignaciones' AND Concepto = 'Roles que pueden validar consignaciones';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'contabilidad' AND Seccion = 'Consignaciones' AND Concepto = 'Roles que pueden eliminar foto de consignación';
UPDATE Config_Parametros SET Condicion = 'Número' WHERE Modulo = 'contabilidad' AND Seccion = 'Filtros' AND Concepto = 'Meses para operaciones con registro';

-- Facturación: Resumen y Recibos
UPDATE Config_Parametros SET Condicion = 'Operación' WHERE Modulo = 'facturacion' AND Seccion = 'Resumen' AND Concepto = 'Operaciones con desglose por Área en Resumen';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'facturacion' AND Seccion = 'Recibos' AND Concepto = 'Roles que pueden anular servicios';

-- Nómina: Informes Disciplinarios
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'nomina' AND Seccion = 'Informes Disciplinarios' AND Concepto = 'Roles que ven todos los informes disciplinarios';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'nomina' AND Seccion = 'Informes Disciplinarios' AND Concepto = 'Roles que pueden cerrar informes disciplinarios';
UPDATE Config_Parametros SET Condicion = 'Lista' WHERE Modulo = 'nomina' AND Seccion = 'Informes Disciplinarios' AND Concepto = 'Tipos de falta';
UPDATE Config_Parametros SET Condicion = 'Lista' WHERE Modulo = 'nomina' AND Seccion = 'Informes Disciplinarios' AND Concepto = 'Resultados de cierre';
UPDATE Config_Parametros SET Condicion = 'Número' WHERE Modulo = 'nomina' AND Seccion = 'Informes Disciplinarios' AND Concepto = 'Días para aviso de inmediatez';
UPDATE Config_Parametros SET Condicion = 'Booleano' WHERE Modulo = 'nomina' AND Seccion = 'Informes Disciplinarios' AND Concepto = 'Habilitar notificaciones de correo en Informes Disciplinarios';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'nomina' AND Seccion = 'Informes Disciplinarios' AND Concepto = 'Notificación nuevo informe disciplinario - Para:';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'nomina' AND Seccion = 'Informes Disciplinarios' AND Concepto = 'Notificación nuevo informe disciplinario - Copia:';

-- Nómina: Asistencia
UPDATE Config_Parametros SET Condicion = 'Número' WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Dias_Maximos_Futuros_Novedades';
UPDATE Config_Parametros SET Condicion = 'Número' WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Dias_Maximos_Pasados';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Editar_Eliminar_Yellow';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Editar_Eliminar_Todos_Estados';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Registrar_Retirados';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Ver_Novedades_Sistema';
UPDATE Config_Parametros SET Condicion = 'Cargo' WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Cargos_Excluidos_Asistencia';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Exencion_Cargos_Asistencia';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Registrar_Dias_Futuros';
UPDATE Config_Parametros SET Condicion = 'Texto' WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Validar_Plantilla_Asistencia';
UPDATE Config_Parametros SET Condicion = 'Texto' WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Relleno_Automatico_Periodico';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Apoyo_Cualquier_Operacion';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Editar_Horario_Yellow';
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'nomina' AND Seccion = 'Asistencia' AND Concepto = 'Roles_Editar_Horario_Todos_Estados';

-- Directorio: Tickets
UPDATE Config_Parametros SET Condicion = 'Rol' WHERE Modulo = 'directorio' AND Seccion = 'Tickets' AND Concepto = 'Resolver tickets';
