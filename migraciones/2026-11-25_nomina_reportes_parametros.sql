-- Migración: Configuración de parámetros para Reportes e Indicadores de Nómina (Rotación, Oportunidad, Fuga temprana)
-- Fecha: 2026-11-25

-- 1. Parámetros de negocio en Config_Parametros
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Reportes', 'Dias_Aviso_Oportuno', 'General', '2',
       'Días máximos transcurridos entre la fecha de retiro y la fecha de reporte en el sistema para calificar la notificación como oportuna (verde).'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Reportes' AND Concepto = 'Dias_Aviso_Oportuno'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Reportes', 'Dias_Aviso_Alerta', 'General', '5',
       'Días de umbral de alerta (amarillo) en el retraso del reporte de retiros. Superar este límite se califica como extemporáneo o crítico (rojo).'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Reportes' AND Concepto = 'Dias_Aviso_Alerta'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Reportes', 'Dias_Fuga_Temprana', 'General', '60',
       'Días de permanencia mínima para superar el periodo de prueba y amortizar los costos de ingreso (exámenes, dotación, inducción).'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Reportes' AND Concepto = 'Dias_Fuga_Temprana'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Reportes', 'Pct_Rotacion_Alerta', 'General', '5.0',
       'Porcentaje de rotación quincenal o mensual a partir del cual se enciende indicador de alerta en una operación.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Reportes' AND Concepto = 'Pct_Rotacion_Alerta'
);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Reportes', 'Roles_Historico_Mes', 'General', 'Nomina,Directorth,Juridica,subgerente,Sistema',
       'Roles autorizados para ver la ventana emergente de evolución histórica mensual de planta, ingresos y retiros en Reportes.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Reportes' AND Concepto = 'Roles_Historico_Mes'
);

-- 2. Registrar la sección Reportes en Maestro_Menu con los mismos roles y accesos que Activo
-- Queda de primera en el menú (Orden = 0), con su Etiqueta, Url e Icono para aparecer en el botón de OTROS
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Orden, Etiqueta, Url, Icono)
SELECT 'nomina', 'Reportes', m.Rol, m.Acceso, 0, 'Reportes e Indicadores', '/nomina?tab=reportes', '📊'
FROM Maestro_Menu m
WHERE m.Modulo = 'nomina' AND m.Seccion = 'Activo'
  AND NOT EXISTS (
    SELECT 1 FROM Maestro_Menu WHERE Modulo = 'nomina' AND Seccion = 'Reportes' AND Acceso = m.Acceso
  );

UPDATE Maestro_Menu r
JOIN Maestro_Menu a ON a.Modulo = 'nomina' AND a.Seccion = 'Activo' AND a.Acceso = r.Acceso
SET r.Rol = a.Rol,
    r.Orden = 0,
    r.Etiqueta = 'Reportes e Indicadores',
    r.Url = '/nomina?tab=reportes',
    r.Icono = '📊'
WHERE r.Modulo = 'nomina' AND r.Seccion = 'Reportes';
