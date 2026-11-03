-- Diseño moderno de las actas de Casos Médicos (apertura SST-R-094 y cierre SST-R-095) en
-- Maestro_Plantillas, con el mismo estilo de las demás plantillas SST. El encabezado toma código,
-- versión y fecha del formato de Maestro_Plantillas (codigo_formato, version_formato, fecha_version).
-- El HTML también está en migraciones/plantillas/acta_apertura_cm.html y acta_cierre_cm.html.
-- Respaldo del diseño anterior: respaldos/2026-11-01_respaldo_plantillas_actas_cm_v1.sql
-- EJECUTAR DESPUÉS DE DESPLEGAR el código que llena sus variables (services/casosmedicos_actas.js):
-- antes, el PDF saldría con {{logo_src}} y {{fecha_generacion}} sin llenar.
-- Se puede ejecutar más de una vez.

UPDATE Maestro_Plantillas
SET version = 2, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Acta de Apertura de Caso Médico — LOG&SER</title>
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
  .metric-value { font-size: 9.5pt; font-weight: 700; color: #000b59; }
  .metric-sub { font-size: 7.5pt; color: #94a3b8; margin-top: 1px; }

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

  /* Recuadros del consentimiento */
  .statement-box { background: #f8fafc; border: 1px solid #cbd5e1; border-left: 3.5px solid #000b59; border-radius: 6px; padding: 10px 13px; margin-bottom: 12px; page-break-inside: avoid; }
  .statement-header { font-size: 8pt; font-weight: 700; color: #000b59; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 0.3px; }
  .statement-text { font-size: 8.5pt; color: #334155; text-align: justify; line-height: 1.5; margin-bottom: 6px; }
  .statement-text:last-child { margin-bottom: 0; }
  .autoriza { background: #fff7ed; border: 1px solid #fed7aa; border-left: 3.5px solid #f55400; }
  .autoriza .statement-header { color: #c2410c; }
  .autoriza .statement-text { color: #1e293b; }

  /* Firma del trabajador */
  .signature-container { margin-top: 18px; page-break-inside: avoid; }
  .signature-card { width: 300px; margin: 0 auto; text-align: center; }
  .sig-img-wrap { height: 70px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
  .sig-img { max-height: 65px; max-width: 240px; object-fit: contain; }
  .firma-nota { display: inline-block; font-size: 7.5pt; color: #991b1b; font-weight: 600; background: #fee2e2; border: 1px solid #fca5a5; border-radius: 4px; padding: 4px 10px; line-height: 1.3; }
  .sig-line { border-top: 1.5px solid #000b59; margin-bottom: 5px; }
  .sig-name { font-size: 9pt; font-weight: 700; color: #000b59; text-transform: uppercase; }
  .sig-details { font-size: 7.5pt; color: #64748b; line-height: 1.35; }

  /* Pie de página */
  .doc-footer { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 5px; display: flex; justify-content: space-between; font-size: 7pt; color: #94a3b8; page-break-inside: avoid; }

  .statement-list { margin: 4px 0 6px 18px; font-size: 8.5pt; color: #334155; line-height: 1.45; }
  .statement-list li { text-align: justify; margin-bottom: 3px; padding-left: 2px; }
  .statement-list li::marker { color: #f55400; font-weight: 700; }

  /* Tres firmas */
  .signature-row { display: flex; justify-content: space-between; gap: 18px; }
  .signature-row .signature-card { width: 32%; margin: 0; }
  .sig-role { font-size: 7.5pt; font-weight: 700; color: #c2410c; text-transform: uppercase; letter-spacing: 0.3px; }

  /* Acta en una sola hoja: espacios más compactos */
  .metrics-card { margin-bottom: 10px; }
  .metric-item { padding: 8px 14px; }
  .section-block { margin-bottom: 8px; }
  .section-title { margin-bottom: 5px; }
  .data-grid td { padding: 4px 10px; }
  .statement-box { padding: 8px 12px; margin-bottom: 8px; }
  .signature-container { margin-top: 10px; }
  .doc-footer { margin-top: 10px; }
</style>
</head>
<body>

  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell">
        <img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img">
      </td>
      <td class="header-title-cell">
        <div class="doc-title">ACTA DE APERTURA DE CASO MÉDICO</div>
        <div class="doc-subtitle">SEGURIDAD Y SALUD EN EL TRABAJO</div>
        <div class="doc-subdetail">SISTEMA DE GESTIÓN DE SEGURIDAD Y SALUD EN EL TRABAJO</div>
      </td>
      <td class="header-meta-cell">
        <div class="meta-code">{{codigo_formato}}</div>
        <div class="meta-ver">Versión: {{version_formato}}</div>
        <div class="meta-date">{{fecha_formato}}</div>
        <div class="meta-id">CASO: {{codigo_caso}}</div>
      </td>
    </tr>
  </table>

  <div class="metrics-card">
    <div class="metric-item">
      <div class="metric-label">Caso médico</div>
      <div class="metric-value">{{codigo_caso}}</div>
      <div class="metric-sub">Código del caso</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Fecha del evento</div>
      <div class="metric-value">{{fecha_evento}}</div>
      <div class="metric-sub">Tipo: {{tipo_evento}}</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Tipo de caso</div>
      <div class="metric-value">{{tipo_caso}}</div>
      <div class="metric-sub">Clasificación SST</div>
    </div>
  </div>

  <section class="section-block">
    <div class="section-title">Información del Colaborador</div>
    <table class="data-grid">
      <tr><td class="data-label">Nombre del colaborador:</td><td class="data-val"><strong>{{nombre_trabajador}}</strong></td></tr>
      <tr><td class="data-label">Cédula de ciudadanía:</td><td class="data-val">{{identificacion}}</td></tr>
      <tr><td class="data-label">Cargo:</td><td class="data-val">{{cargo}}</td></tr>
      <tr><td class="data-label">Regional / Operación:</td><td class="data-val">{{regional}} / {{operacion}}</td></tr>
      <tr><td class="data-label">Fecha de ingreso:</td><td class="data-val">{{fecha_ingreso}}</td></tr>
    </table>
  </section>

  <section class="section-block">
    <div class="section-title">Información del Caso</div>
    <table class="data-grid">
      <tr><td class="data-label">EPS / AFP:</td><td class="data-val">{{eps}} / {{afp}}</td></tr>
      <tr><td class="data-label">Días de incapacidad:</td><td class="data-val">{{dias_incapacidad}}</td></tr>
      <tr><td class="data-label">% PCL:</td><td class="data-val">{{pcl_porcentaje}}</td></tr>
      <tr><td class="data-label">Vigencia recomendaciones:</td><td class="data-val">{{periodo_recomendaciones}}</td></tr>
    </table>
  </section>

  <section class="statement-box">
    <div class="statement-header">Diagnóstico principal (CIE-10)</div>
    <p class="statement-text"><strong>[{{diagnostico_cod}}]</strong> {{diagnostico_desc}}</p>
  </section>

  <section class="statement-box autoriza">
    <div class="statement-header">Recomendaciones y restricciones médicas / laborales</div>
    <p class="statement-text">{{recomendaciones}}</p>
  </section>

  <section class="statement-box">
    <div class="statement-header">Compromiso y notificación de apertura</div>
    <p class="statement-text">Por medio de la presente, el colaborador y el área de Seguridad y Salud en el Trabajo (SST) de LOG&amp;SER dejan constancia formal de la apertura del presente caso médico, así como del pleno conocimiento y acatamiento de las indicaciones y restricciones médicas emitidas por los profesionales tratantes. El colaborador se compromete a asistir puntualmente a sus valoraciones médicas, cumplir los tratamientos indicados, abstenerse de realizar labores contrarias a sus recomendaciones ocupacionales y reportar cualquier novedad en su estado de salud de manera oportuna a su jefatura inmediata y al área de SST.</p>
  </section>

  <section class="section-block">
    <div class="section-title">Responsables del caso</div>
    <table class="data-grid">
      <tr><td class="data-label">Responsable SST:</td><td class="data-val">{{responsable_sst}}</td></tr>
      <tr><td class="data-label">Responsable operación:</td><td class="data-val">{{responsable_operacion}}</td></tr>
    </table>
  </section>

  <div class="signature-container">
    <div class="signature-row" style="justify-content:center;">
      <div class="signature-card">
        <div class="sig-img-wrap">{{firma_trabajador}}</div>
        <div class="sig-line"></div>
        <div class="sig-role">Colaborador</div>
        <div class="sig-name">{{nombre_trabajador}}</div>
        <div class="sig-details">C.C. {{identificacion}}<br>{{cargo}}</div>
      </div>
    </div>
  </div>

  <footer class="doc-footer">
    <span>Registrado por: {{usuario_registro}} &bull; {{fecha_registro}}</span>
    <span>Certificación electrónica bajo Ley 527 de 1999</span>
    <span>Generado el {{fecha_generacion}}</span>
  </footer>

</body>
</html>
'
WHERE nombre_proceso = 'acta_apertura_cm' AND version < 2;

UPDATE Maestro_Plantillas
SET version = 2, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Acta de Cierre de Caso Médico — LOG&SER</title>
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
  .metric-value { font-size: 9.5pt; font-weight: 700; color: #000b59; }
  .metric-sub { font-size: 7.5pt; color: #94a3b8; margin-top: 1px; }

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

  /* Recuadros del consentimiento */
  .statement-box { background: #f8fafc; border: 1px solid #cbd5e1; border-left: 3.5px solid #000b59; border-radius: 6px; padding: 10px 13px; margin-bottom: 12px; page-break-inside: avoid; }
  .statement-header { font-size: 8pt; font-weight: 700; color: #000b59; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 0.3px; }
  .statement-text { font-size: 8.5pt; color: #334155; text-align: justify; line-height: 1.5; margin-bottom: 6px; }
  .statement-text:last-child { margin-bottom: 0; }
  .autoriza { background: #fff7ed; border: 1px solid #fed7aa; border-left: 3.5px solid #f55400; }
  .autoriza .statement-header { color: #c2410c; }
  .autoriza .statement-text { color: #1e293b; }

  /* Firma del trabajador */
  .signature-container { margin-top: 18px; page-break-inside: avoid; }
  .signature-card { width: 300px; margin: 0 auto; text-align: center; }
  .sig-img-wrap { height: 70px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
  .sig-img { max-height: 65px; max-width: 240px; object-fit: contain; }
  .firma-nota { display: inline-block; font-size: 7.5pt; color: #991b1b; font-weight: 600; background: #fee2e2; border: 1px solid #fca5a5; border-radius: 4px; padding: 4px 10px; line-height: 1.3; }
  .sig-line { border-top: 1.5px solid #000b59; margin-bottom: 5px; }
  .sig-name { font-size: 9pt; font-weight: 700; color: #000b59; text-transform: uppercase; }
  .sig-details { font-size: 7.5pt; color: #64748b; line-height: 1.35; }

  /* Pie de página */
  .doc-footer { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 5px; display: flex; justify-content: space-between; font-size: 7pt; color: #94a3b8; page-break-inside: avoid; }

  .statement-list { margin: 4px 0 6px 18px; font-size: 8.5pt; color: #334155; line-height: 1.45; }
  .statement-list li { text-align: justify; margin-bottom: 3px; padding-left: 2px; }
  .statement-list li::marker { color: #f55400; font-weight: 700; }

  /* Tres firmas */
  .signature-row { display: flex; justify-content: space-between; gap: 18px; }
  .signature-row .signature-card { width: 32%; margin: 0; }
  .sig-role { font-size: 7.5pt; font-weight: 700; color: #c2410c; text-transform: uppercase; letter-spacing: 0.3px; }

  /* Acta en una sola hoja: espacios más compactos */
  .metrics-card { margin-bottom: 10px; }
  .metric-item { padding: 8px 14px; }
  .section-block { margin-bottom: 8px; }
  .section-title { margin-bottom: 5px; }
  .data-grid td { padding: 4px 10px; }
  .statement-box { padding: 8px 12px; margin-bottom: 8px; }
  .signature-container { margin-top: 10px; }
  .doc-footer { margin-top: 10px; }
</style>
</head>
<body>

  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell">
        <img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img">
      </td>
      <td class="header-title-cell">
        <div class="doc-title">ACTA DE CIERRE DE CASO MÉDICO</div>
        <div class="doc-subtitle">SEGURIDAD Y SALUD EN EL TRABAJO</div>
        <div class="doc-subdetail">SISTEMA DE GESTIÓN DE SEGURIDAD Y SALUD EN EL TRABAJO</div>
      </td>
      <td class="header-meta-cell">
        <div class="meta-code">{{codigo_formato}}</div>
        <div class="meta-ver">Versión: {{version_formato}}</div>
        <div class="meta-date">{{fecha_formato}}</div>
        <div class="meta-id">CASO: {{codigo_caso}}</div>
      </td>
    </tr>
  </table>

  <div class="metrics-card">
    <div class="metric-item">
      <div class="metric-label">Caso médico</div>
      <div class="metric-value">{{codigo_caso}}</div>
      <div class="metric-sub">Código del caso</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Fecha de cierre</div>
      <div class="metric-value">{{fecha_cierre}}</div>
      <div class="metric-sub">Cierre del caso</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Tipo de caso</div>
      <div class="metric-value">{{tipo_caso}}</div>
      <div class="metric-sub">Clasificación SST</div>
    </div>
  </div>

  <section class="section-block">
    <div class="section-title">Información del Colaborador</div>
    <table class="data-grid">
      <tr><td class="data-label">Nombre del colaborador:</td><td class="data-val"><strong>{{nombre_trabajador}}</strong></td></tr>
      <tr><td class="data-label">Cédula de ciudadanía:</td><td class="data-val">{{identificacion}}</td></tr>
      <tr><td class="data-label">Cargo:</td><td class="data-val">{{cargo}}</td></tr>
      <tr><td class="data-label">Regional / Operación:</td><td class="data-val">{{regional}} / {{operacion}}</td></tr>
      <tr><td class="data-label">Fecha de ingreso:</td><td class="data-val">{{fecha_ingreso}}</td></tr>
    </table>
  </section>

  <section class="section-block">
    <div class="section-title">Información del Cierre</div>
    <table class="data-grid">
      <tr><td class="data-label">Motivo de cierre:</td><td class="data-val">{{motivo_cierre}}</td></tr>
      <tr><td class="data-label">Actividad laboral final:</td><td class="data-val">{{actividad_actual}}</td></tr>
    </table>
  </section>

  <section class="statement-box">
    <div class="statement-header">Diagnóstico principal (CIE-10)</div>
    <p class="statement-text"><strong>[{{diagnostico_cod}}]</strong> {{diagnostico_desc}}</p>
  </section>

  <section class="statement-box autoriza">
    <div class="statement-header">Constancia de cierre y alta médico-laboral</div>
    <p class="statement-text">Se deja constancia formal del cierre del presente caso médico en el Sistema de Gestión de Seguridad y Salud en el Trabajo (SG-SST) de LOG&amp;SER S.A.S. Se ha verificado el cumplimiento de los planes de manejo médico, la culminación del período de recomendaciones, la expedición del alta médica correspondiente o la resolución del evento clínico conforme a los dictámenes médicos y la normatividad laboral vigente. El colaborador declara haber recibido el debido acompañamiento por parte de la empresa y continuar en condiciones de salud aptas para su desempeño.</p>
  </section>

  <section class="section-block">
    <div class="section-title">Responsables del caso</div>
    <table class="data-grid">
      <tr><td class="data-label">Responsable SST:</td><td class="data-val">{{responsable_sst}}</td></tr>
      <tr><td class="data-label">Responsable operación:</td><td class="data-val">{{responsable_operacion}}</td></tr>
    </table>
  </section>

  <div class="signature-container">
    <div class="signature-row" style="justify-content:center;">
      <div class="signature-card">
        <div class="sig-img-wrap">{{firma_trabajador}}</div>
        <div class="sig-line"></div>
        <div class="sig-role">Colaborador</div>
        <div class="sig-name">{{nombre_trabajador}}</div>
        <div class="sig-details">C.C. {{identificacion}}<br>{{cargo}}</div>
      </div>
    </div>
  </div>

  <footer class="doc-footer">
    <span>Cerrado por: {{usuario_cierre}} &bull; {{fecha_cierre}}</span>
    <span>Certificación electrónica bajo Ley 527 de 1999</span>
    <span>Generado el {{fecha_generacion}}</span>
  </footer>

</body>
</html>
'
WHERE nombre_proceso = 'acta_cierre_cm' AND version < 2;

-- Verificación
SELECT nombre_proceso, version, codigo_formato, version_formato, DATE_FORMAT(fecha_version, '%d/%m/%Y') AS fecha_version,
       contenido_html LIKE '%{{logo_src}}%' AS diseno_moderno
FROM Maestro_Plantillas WHERE nombre_proceso IN ('acta_apertura_cm', 'acta_cierre_cm');
