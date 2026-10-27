-- Diseño del PDF de SST > Evaluación SST en Maestro_Plantillas,
-- con el mismo estilo de Participación y Cesantías, y versión 03 del formato.
-- Se puede ejecutar más de una vez: la plantilla y los parámetros solo se insertan si no existen.
-- El HTML también está en migraciones/plantillas/evaluacion_sst.html.

INSERT INTO Maestro_Plantillas
  (nombre_proceso, tabla_datos, id_campo_fk, bucket_carpeta, requiere_firma_trabajador, activo, version, contenido_html)
SELECT 'evaluacion_sst', 'Maestro_evaluacionsst', 'id_evaluacion', 'SST', 1, 1, 1, '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Evaluación de Inducción y Capacitación SST — LOG&SER</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a; background: #ffffff; font-size: 9pt; line-height: 1.42;
    -webkit-font-smoothing: antialiased;
  }

  /* Encabezado compacto 3 columnas */
  .doc-header-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; border: 1px solid #cbd5e1; }
  .doc-header-table td { border: 1px solid #cbd5e1; vertical-align: middle; }
  .header-logo-cell { width: 24%; text-align: center; padding: 8px 10px; background: #ffffff; }
  .logo-img { height: 46px; max-width: 170px; object-fit: contain; display: block; margin: 0 auto; }
  .header-title-cell { width: 56%; background: #e6edf7; color: #000b59; text-align: center; padding: 10px 14px; }
  .doc-title { font-size: 11pt; font-weight: 800; color: #000b59; letter-spacing: 0.4px; text-transform: uppercase; line-height: 1.25; }
  .doc-subtitle { font-size: 8pt; font-weight: 700; color: #c2410c; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.3px; }
  .doc-subdetail { font-size: 7pt; color: #475569; font-weight: 600; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.2px; }
  .header-meta-cell { width: 20%; padding: 6px 10px; font-size: 8pt; text-align: center; background: #f8fafc; color: #1e293b; line-height: 1.35; }
  .meta-code { font-weight: 800; color: #000b59; font-size: 8.5pt; }
  .meta-ver { color: #334155; }
  .meta-date { color: #64748b; font-size: 7.5pt; }
  .meta-id { margin-top: 2px; font-size: 7pt; color: #000b59; font-weight: 800; word-break: break-all; }

  /* Tarjeta de datos clave */
  .metrics-card { display: flex; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 14px; }
  .metric-item { flex: 1; padding: 10px 14px; border-right: 1px solid #e2e8f0; }
  .metric-item:last-child { border-right: none; }
  .metric-label { font-size: 7.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .metric-value-primary { font-size: 13pt; font-weight: 800; color: #f55400; letter-spacing: -0.3px; }
  .metric-value { font-size: 10pt; font-weight: 700; color: #000b59; }
  .metric-sub { font-size: 7.5pt; color: #94a3b8; margin-top: 1px; }
  .badge-aprobado { display: inline-block; background: #dcfce7; color: #166534; border: 1px solid #86efac; font-size: 8.5pt; font-weight: 800; padding: 2px 8px; border-radius: 4px; letter-spacing: 0.3px; }
  .badge-no-aprobado { display: inline-block; background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; font-size: 8.5pt; font-weight: 800; padding: 2px 8px; border-radius: 4px; letter-spacing: 0.3px; }
  /* Secciones */
  .section-block { margin-bottom: 12px; }
  .section-title { font-size: 8.5pt; font-weight: 700; color: #000b59; text-transform: uppercase; letter-spacing: 0.6px; display: flex; align-items: center; gap: 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; margin-bottom: 8px; }
  .section-title::before { content: ''''; display: inline-block; width: 4px; height: 12px; background: #f55400; border-radius: 2px; }

  /* Datos */
  .data-grid { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 8.5pt; }
  .data-grid td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .data-grid tr:last-child td { border-bottom: none; }
  .data-grid tr:nth-child(even) td { background: #fafafa; }
  .data-label { width: 24%; font-weight: 600; color: #64748b; border-right: 1px solid #f1f5f9; }
  .data-val { font-weight: 600; color: #0f172a; }

  /* Cuestionario */
  .q-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; margin-bottom: 7px; background: #ffffff; page-break-inside: avoid; }
  .q-title { font-size: 8.5pt; font-weight: 700; color: #000b59; margin-bottom: 5px; }
  .q-options { display: flex; flex-direction: column; gap: 3px; }
  .q-option { display: flex; align-items: flex-start; gap: 6px; font-size: 8pt; color: #334155; padding: 2.5px 6px; border-radius: 4px; border: 1px solid transparent; }
  .q-option.selected { background: #eef2ff; color: #000b59; font-weight: 600; border-color: #c7d2fe; }
  .q-check { display: inline-block; width: 12px; height: 12px; border: 1.5px solid #94a3b8; border-radius: 3px; text-align: center; line-height: 10px; font-size: 7.5pt; font-weight: 800; color: transparent; flex-shrink: 0; margin-top: 1px; background: #ffffff; }
  .q-option.selected .q-check { border-color: #f55400; background: #f55400; color: #ffffff; }

  .q1-images { display: flex; gap: 16px; margin-top: 4px; }
  .q1-img-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; background: #f8fafc; text-align: center; }
  .q1-img-card.selected { border-color: #f55400; background: #fff7ed; }
  .q1-img-card img { height: 85px; border-radius: 4px; border: 1px solid #cbd5e1; display: block; margin: 0 auto 5px; }
  .q1-img-card .q-option { justify-content: center; }

  /* Recuadro de soporte / declaraciones */
  .statement-box { background: #f8fafc; border: 1px solid #cbd5e1; border-left: 3.5px solid #000b59; border-radius: 6px; padding: 9px 12px; margin-top: 10px; margin-bottom: 12px; page-break-inside: avoid; }
  .statement-header { font-size: 8pt; font-weight: 700; color: #000b59; text-transform: uppercase; margin-bottom: 3px; letter-spacing: 0.3px; }
  .statement-text { font-size: 7.8pt; color: #334155; text-align: justify; line-height: 1.4; margin-bottom: 4px; }
  .statement-text:last-child { margin-bottom: 0; }

  /* Firma del trabajador */
  .signature-container { margin-top: 12px; page-break-inside: avoid; }
  .signature-card { width: 280px; margin: 0 auto; text-align: center; }
  .sig-img-wrap { height: 70px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
  .sig-img { max-height: 65px; max-width: 240px; object-fit: contain; }
  .firma-nota { display: inline-block; font-size: 7.5pt; color: #991b1b; font-weight: 600; background: #fee2e2; border: 1px solid #fca5a5; border-radius: 4px; padding: 4px 10px; line-height: 1.3; }
  .sig-line { border-top: 1.5px solid #000b59; margin-bottom: 5px; }
  .sig-name { font-size: 9pt; font-weight: 700; color: #000b59; text-transform: uppercase; }
  .sig-details { font-size: 7.5pt; color: #64748b; line-height: 1.35; }

  /* Pie de página */
  .doc-footer { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 5px; display: flex; justify-content: space-between; font-size: 7pt; color: #94a3b8; page-break-inside: avoid; }
</style>
</head>
<body>
  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell">
        <img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img">
      </td>
      <td class="header-title-cell">
        <div class="doc-title">EVALUACIÓN DE INDUCCIÓN Y CAPACITACIÓN SST</div>
        <div class="doc-subtitle">EVALUACIÓN DE CONOCIMIENTOS ({{tipo_evaluacion}})</div>
        <div class="doc-subdetail">SISTEMA DE GESTIÓN DE SEGURIDAD Y SALUD EN EL TRABAJO</div>
      </td>
      <td class="header-meta-cell">
        <div class="meta-code">{{codigo_formato}}</div>
        <div class="meta-ver">Versión: {{version_formato}}</div>
        <div class="meta-date">{{fecha_formato}}</div>
        <div class="meta-id">ID: #{{id_evaluacion}}</div>
      </td>
    </tr>
  </table>

  <div class="metrics-card">
    <div class="metric-item">
      <div class="metric-label">Fecha de Evaluación</div>
      <div class="metric-value">{{fecha}}</div>
      <div class="metric-sub">Registro en plataforma</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Tipo de Evaluación</div>
      <div class="metric-value">{{tipo_evaluacion}}</div>
      <div class="metric-sub">{{subtipo_detalle}}</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Puntaje Obtenido</div>
      <div class="metric-value-primary">{{puntaje}} / 13</div>
      <div class="metric-sub">Respuestas correctas</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Resultado</div>
      <div style="margin-top: 2px;">{{resultado_html}}</div>
      <div class="metric-sub">Calificación final</div>
    </div>
  </div>

  <section class="section-block">
    <div class="section-title">Información del Colaborador</div>
    <table class="data-grid">
      <tr><td class="data-label">Nombre del trabajador:</td><td class="data-val"><strong>{{nombre_trabajador}}</strong></td></tr>
      <tr><td class="data-label">Cédula de ciudadanía:</td><td class="data-val">{{identificacion}}</td></tr>
      <tr><td class="data-label">Nombre del evaluador:</td><td class="data-val">{{nombre_evaluador}}</td></tr>
    </table>
  </section>
  <section class="statement-box">
    <div class="statement-header">Objetivo e Instrucciones</div>
    <p class="statement-text">
      Esta evaluación se realiza en cumplimiento de los requisitos legales vigentes del Sistema de Gestión de Seguridad y Salud en el Trabajo y de las políticas internas de prevención de riesgos laborales de la empresa.
    </p>
    <p class="statement-text">
      <strong>OBJETIVO:</strong> Verificar la comprensión y apropiación de los conceptos, procedimientos, normas y controles establecidos en el Sistema de Gestión de Seguridad y Salud en el Trabajo, así como de los riesgos asociados a las actividades logísticas desarrolladas por la organización.
    </p>
    <p class="statement-text">
      <strong>INSTRUCCIONES:</strong> Lea cuidadosamente cada pregunta y seleccione la respuesta que considere correcta. La aprobación de esta evaluación es requisito para el inicio o continuidad de las actividades laborales dentro de la organización.
    </p>
  </section>

  <section class="section-block">
    <div class="section-title">Cuestionario de Evaluación</div>
    {{cuestionario_html}}
  </section>

  <section class="statement-box">
    <div class="statement-header">Declaración y Compromiso</div>
    <p class="statement-text">
      Declaro que he recibido capacitación en Seguridad y Salud en el Trabajo, comprendiendo la información relacionada con las políticas, normas, procedimientos, riesgos asociados a mi labor, medidas de prevención, reporte de incidentes y accidentes, uso adecuado de los elementos de protección personal y demás aspectos aplicables a mis funciones.
    </p>
    <p class="statement-text">
      Así mismo, me comprometo a cumplir las normas de Seguridad y Salud en el Trabajo establecidas por la empresa, utilizar correctamente los elementos de protección personal suministrados y participar activamente en las actividades de prevención y promoción de la seguridad y salud en el trabajo. En constancia, firmo el presente documento.
    </p>
  </section>

  <div class="signature-container">
    <div class="signature-card">
      <div class="sig-img-wrap">{{firma_trabajador_html}}</div>
      <div class="sig-line"></div>
      <div class="sig-name">{{nombre_trabajador}}</div>
      <div class="sig-details">C.C. {{identificacion}}<br>Trabajador Evaluado</div>
    </div>
  </div>

  <footer class="doc-footer">
    <span>Apoyo Logístico y Operativo S.A.S. &bull; Evaluación de Inducción y Capacitación SST</span>
    <span>Certificación electrónica bajo Ley 527 de 1999</span>
    <span>Generado el {{fecha_generacion}}</span>
  </footer>

</body>
</html>
'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Plantillas WHERE nombre_proceso = 'evaluacion_sst');

-- Parámetros del encabezado en Config_Parametros (Modulo = 'sst', Seccion = 'Evaluación SST')
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Evaluación SST', 'Código del formato de evaluación SST', 'Texto', 'F-SST-001', 'Código que aparece en el encabezado del PDF de la Evaluación de Inducción y Capacitación SST.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Evaluación SST' AND Concepto = 'Código del formato de evaluación SST');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Evaluación SST', 'Versión del formato de evaluación SST', 'Texto', '03', 'Versión que aparece en el encabezado del PDF de la Evaluación de Inducción y Capacitación SST.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Evaluación SST' AND Concepto = 'Versión del formato de evaluación SST');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Evaluación SST', 'Fecha del formato de evaluación SST', 'Texto', '28/05/2026', 'Fecha de la versión del formato que aparece en el encabezado del PDF de la Evaluación de Inducción y Capacitación SST.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Evaluación SST' AND Concepto = 'Fecha del formato de evaluación SST');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Evaluación SST', 'Roles que pueden editar y regenerar PDF de evaluaciones firmadas en SST', 'Rol', 'Sistema', 'Roles que pueden editar una evaluación SST y regenerar su PDF después de haberse generado y firmado el documento. Si se deja vacío, nadie puede hacerlo.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Evaluación SST' AND Concepto = 'Roles que pueden editar y regenerar PDF de evaluaciones firmadas en SST');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'Evaluación SST', 'Roles que pueden eliminar evaluaciones firmadas en SST', 'Rol', 'Sistema', 'Roles que pueden eliminar una evaluación SST después de haberse generado y firmado su PDF. Si se deja vacío, nadie puede eliminar evaluaciones ya firmadas.' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Evaluación SST' AND Concepto = 'Roles que pueden eliminar evaluaciones firmadas en SST');

-- Verificación
SELECT id_plantilla, nombre_proceso, version, activo, LENGTH(contenido_html) AS largo
FROM Maestro_Plantillas WHERE nombre_proceso = 'evaluacion_sst';

SELECT Concepto, Parametro FROM Config_Parametros
WHERE Modulo = 'sst' AND Seccion = 'Evaluación SST' ORDER BY Concepto;