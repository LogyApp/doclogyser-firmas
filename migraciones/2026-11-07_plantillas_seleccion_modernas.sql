-- Diseño moderno de los documentos para firma de Selección (Aspirantes) en Maestro_Plantillas,
-- con el mismo estilo de Compromiso SST, Prueba de Consumo y Cesantías.
-- El HTML de cada uno también está en migraciones/plantillas/<PREFIJO>.html.
-- Respaldo del diseño anterior: respaldos/2026-11-07_respaldo_plantillas_seleccion.sql
-- ORDEN: 1) desplegar el código (llena {{logo_src}}, {{fecha_generacion}} y las respuestas);
--        2) ejecutar 2026-11-08_formularios_seleccion.sql (CS y CHC muestran las respuestas del formulario);
--        3) ejecutar este archivo.
-- El texto de cada documento es el mismo de la versión anterior. Se puede ejecutar más de una vez.

-- ACTCON
UPDATE Maestro_Plantillas
SET version = 3, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Acta de conocimiento de condiciones — LOG&amp;SER</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a; background: #ffffff; font-size: 9pt; line-height: 1.42;
    -webkit-font-smoothing: antialiased;
  }
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

  .metrics-card { display: flex; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 14px; }
  .metric-item { flex: 1; padding: 9px 12px; border-right: 1px solid #e2e8f0; min-width: 0; }
  .metric-item:last-child { border-right: none; }
  .metric-label { font-size: 7.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .metric-value { font-size: 9pt; font-weight: 700; color: #000b59; word-break: break-word; }

  .section-block { margin-bottom: 12px; }
  .section-title { font-size: 8.5pt; font-weight: 700; color: #000b59; text-transform: uppercase; letter-spacing: 0.6px; display: flex; align-items: center; gap: 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; margin-bottom: 8px; page-break-after: avoid; }
  .section-title::before { content: ''''; display: inline-block; width: 4px; height: 12px; background: #f55400; border-radius: 2px; }

  .data-grid { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 8.5pt; }
  .data-grid td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .data-grid tr:last-child td { border-bottom: none; }
  .data-grid tr:nth-child(even) td { background: #fafafa; }
  .data-label { width: 30%; font-weight: 600; color: #64748b; border-right: 1px solid #f1f5f9; }
  .data-val { font-weight: 600; color: #0f172a; }

  .statement-box { background: #f8fafc; border: 1px solid #cbd5e1; border-left: 3.5px solid #000b59; border-radius: 6px; padding: 10px 13px; margin-bottom: 12px; }
  .statement-header { font-size: 8pt; font-weight: 700; color: #000b59; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 0.3px; }
  .statement-text { font-size: 8.5pt; color: #334155; text-align: justify; line-height: 1.5; margin-bottom: 6px; }
  .statement-text:last-child { margin-bottom: 0; }
  .autoriza { background: #fff7ed; border: 1px solid #fed7aa; border-left: 3.5px solid #f55400; }
  .autoriza .statement-header { color: #c2410c; }
  .autoriza .statement-text { color: #1e293b; }
  .statement-list { margin: 4px 0 6px 18px; font-size: 8.5pt; color: #334155; line-height: 1.45; }
  .statement-list li { text-align: justify; margin-bottom: 3px; padding-left: 2px; }
  .statement-list li::marker { color: #f55400; font-weight: 700; }

  .rule-list { list-style: none; counter-reset: regla; }
  .rule-list li { counter-increment: regla; position: relative; padding: 6px 10px 6px 34px; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 5px; font-size: 8.5pt; color: #334155; text-align: justify; background: #ffffff; page-break-inside: avoid; }
  .rule-list li::before { content: counter(regla); position: absolute; left: 8px; top: 6px; width: 18px; height: 18px; border-radius: 50%; background: #000b59; color: #ffffff; font-size: 7.5pt; font-weight: 800; text-align: center; line-height: 18px; }

  .q-table { width: 100%; border-collapse: collapse; font-size: 8pt; border: 1px solid #e2e8f0; }
  .q-table th { background: #e6edf7; color: #000b59; font-weight: 700; text-transform: uppercase; font-size: 7pt; letter-spacing: 0.3px; padding: 5px 6px; border: 1px solid #cbd5e1; text-align: left; }
  .q-table td { padding: 5px 6px; border: 1px solid #e2e8f0; vertical-align: middle; color: #334155; }
  .q-table tr:nth-child(even) td { background: #fafafa; }
  .q-table tr { page-break-inside: avoid; }
  .q-table .c { text-align: center; white-space: nowrap; }
  .box { display: inline-block; width: 10px; height: 10px; border: 1px solid #64748b; border-radius: 2px; vertical-align: middle; margin: 0 2px 0 6px; }
  .blank { display: inline-block; min-width: 90px; border-bottom: 1px solid #94a3b8; height: 11px; vertical-align: bottom; }

  .lugar-fecha { font-size: 8.5pt; color: #334155; margin: 6px 0 4px; }
  .lugar-fecha strong { color: #000b59; }

  .signature-container { margin-top: 18px; page-break-inside: avoid; }
  .signature-card { width: 46%; margin: 0 auto; text-align: center; }
  .sig-img-wrap { height: 80px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
  .sig-img-wrap img { max-height: 70px; max-width: 240px; object-fit: contain; }
  .sig-line { border-top: 1.5px solid #000b59; margin-bottom: 5px; }
  .sig-role { font-size: 7.5pt; font-weight: 700; color: #c2410c; text-transform: uppercase; letter-spacing: 0.3px; }
  .sig-name { font-size: 9pt; font-weight: 700; color: #000b59; text-transform: uppercase; }
  .sig-details { font-size: 7.5pt; color: #64748b; line-height: 1.35; }

  .doc-footer { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 5px; display: flex; justify-content: space-between; gap: 10px; font-size: 7pt; color: #94a3b8; page-break-inside: avoid; }
</style>
</head>
<body>

  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell"><img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img"></td>
      <td class="header-title-cell">
        <div class="doc-title">Acta de Conocimiento de Condiciones</div>
        <div class="doc-subtitle">Condiciones contractuales del cargo</div>
        <div class="doc-subdetail">Proceso de selección y contratación</div>
      </td>
      <td class="header-meta-cell">
        <div class="meta-code">{{codigo_formato}}</div>
        <div class="meta-ver">Versión: {{version_formato}}</div>
        <div class="meta-date">{{fecha_formato}}</div>
      </td>
    </tr>
  </table>

  <div class="metrics-card">
    <div class="metric-item"><div class="metric-label">Colaborador</div><div class="metric-value">{{nombre_completo}}</div></div>
    <div class="metric-item"><div class="metric-label">Identificación</div><div class="metric-value">C.C. {{identificacion}}</div></div>
    <div class="metric-item"><div class="metric-label">Cargo</div><div class="metric-value">{{cargo}}</div></div>
    <div class="metric-item"><div class="metric-label">Operación</div><div class="metric-value">{{operacion}}</div></div>
  </div>

  <section class="statement-box ">
    <div class="statement-header">Declaración del colaborador</div>
    <p class="statement-text">Yo, <strong>{{nombre_completo}}</strong>, identificado(a) con C.C. No. <strong>{{identificacion}}</strong>, declaro que antes de mi contratación he sido informado(a) de manera clara sobre:</p>
    <ul class="statement-list">
      <li>Funciones principales del cargo de <strong>{{cargo}}</strong>.</li>
      <li>Salario y forma de pago.</li>
      <li>Horarios, turnos y condiciones de la labor.</li>
      <li>Normas de seguridad y reglamento interno.</li>
    </ul>
  </section>

  <p class="lugar-fecha">Se firma en el municipio de <strong>{{municipio_firma}}</strong>, el día <strong>{{dia_firma}}</strong> del mes de <strong>{{mes_firma}}</strong> del año <strong>{{anio_firma}}</strong>.</p>

  <div class="signature-container">
    <div class="signature-card">
      <div class="sig-img-wrap">{{firma_colaborador}}</div>
      <div class="sig-line"></div>
      <div class="sig-role">Colaborador</div>
      <div class="sig-name">{{nombre_completo}}</div>
      <div class="sig-details">C.C. {{identificacion}} de {{ciudad_expedicion}}<br>{{cargo}}</div>
    </div>
  </div>

  <footer class="doc-footer">
    <span>Apoyo Logístico y Operativo S.A.S. &bull; Acta de Conocimiento de Condiciones</span>
    <span>Certificación electrónica bajo Ley 527 de 1999</span>
    <span>Generado el {{fecha_generacion}}</span>
  </footer>

</body>
</html>
'
WHERE nombre_proceso = 'ACTCON';

-- CHC
UPDATE Maestro_Plantillas
SET version = 2, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Consentimiento informado prueba de alcohol y sustancias psicoactivas — LOG&amp;SER</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a; background: #ffffff; font-size: 9pt; line-height: 1.42;
    -webkit-font-smoothing: antialiased;
  }
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

  .metrics-card { display: flex; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 14px; }
  .metric-item { flex: 1; padding: 9px 12px; border-right: 1px solid #e2e8f0; min-width: 0; }
  .metric-item:last-child { border-right: none; }
  .metric-label { font-size: 7.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .metric-value { font-size: 9pt; font-weight: 700; color: #000b59; word-break: break-word; }

  .section-block { margin-bottom: 12px; }
  .section-title { font-size: 8.5pt; font-weight: 700; color: #000b59; text-transform: uppercase; letter-spacing: 0.6px; display: flex; align-items: center; gap: 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; margin-bottom: 8px; page-break-after: avoid; }
  .section-title::before { content: ''''; display: inline-block; width: 4px; height: 12px; background: #f55400; border-radius: 2px; }

  .data-grid { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 8.5pt; }
  .data-grid td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .data-grid tr:last-child td { border-bottom: none; }
  .data-grid tr:nth-child(even) td { background: #fafafa; }
  .data-label { width: 30%; font-weight: 600; color: #64748b; border-right: 1px solid #f1f5f9; }
  .data-val { font-weight: 600; color: #0f172a; }

  .statement-box { background: #f8fafc; border: 1px solid #cbd5e1; border-left: 3.5px solid #000b59; border-radius: 6px; padding: 10px 13px; margin-bottom: 12px; }
  .statement-header { font-size: 8pt; font-weight: 700; color: #000b59; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 0.3px; }
  .statement-text { font-size: 8.5pt; color: #334155; text-align: justify; line-height: 1.5; margin-bottom: 6px; }
  .statement-text:last-child { margin-bottom: 0; }
  .autoriza { background: #fff7ed; border: 1px solid #fed7aa; border-left: 3.5px solid #f55400; }
  .autoriza .statement-header { color: #c2410c; }
  .autoriza .statement-text { color: #1e293b; }
  .statement-list { margin: 4px 0 6px 18px; font-size: 8.5pt; color: #334155; line-height: 1.45; }
  .statement-list li { text-align: justify; margin-bottom: 3px; padding-left: 2px; }
  .statement-list li::marker { color: #f55400; font-weight: 700; }

  .rule-list { list-style: none; counter-reset: regla; }
  .rule-list li { counter-increment: regla; position: relative; padding: 6px 10px 6px 34px; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 5px; font-size: 8.5pt; color: #334155; text-align: justify; background: #ffffff; page-break-inside: avoid; }
  .rule-list li::before { content: counter(regla); position: absolute; left: 8px; top: 6px; width: 18px; height: 18px; border-radius: 50%; background: #000b59; color: #ffffff; font-size: 7.5pt; font-weight: 800; text-align: center; line-height: 18px; }

  .q-table { width: 100%; border-collapse: collapse; font-size: 8pt; border: 1px solid #e2e8f0; }
  .q-table th { background: #e6edf7; color: #000b59; font-weight: 700; text-transform: uppercase; font-size: 7pt; letter-spacing: 0.3px; padding: 5px 6px; border: 1px solid #cbd5e1; text-align: left; }
  .q-table td { padding: 5px 6px; border: 1px solid #e2e8f0; vertical-align: middle; color: #334155; }
  .q-table tr:nth-child(even) td { background: #fafafa; }
  .q-table tr { page-break-inside: avoid; }
  .q-table .c { text-align: center; white-space: nowrap; }
  .box { display: inline-block; width: 10px; height: 10px; border: 1px solid #64748b; border-radius: 2px; vertical-align: middle; margin: 0 2px 0 6px; }
  .blank { display: inline-block; min-width: 90px; border-bottom: 1px solid #94a3b8; height: 11px; vertical-align: bottom; }

  .lugar-fecha { font-size: 8.5pt; color: #334155; margin: 6px 0 4px; }
  .lugar-fecha strong { color: #000b59; }

  .signature-container { margin-top: 18px; page-break-inside: avoid; }
  .signature-card { width: 46%; margin: 0 auto; text-align: center; }
  .sig-img-wrap { height: 80px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
  .sig-img-wrap img { max-height: 70px; max-width: 240px; object-fit: contain; }
  .sig-line { border-top: 1.5px solid #000b59; margin-bottom: 5px; }
  .sig-role { font-size: 7.5pt; font-weight: 700; color: #c2410c; text-transform: uppercase; letter-spacing: 0.3px; }
  .sig-name { font-size: 9pt; font-weight: 700; color: #000b59; text-transform: uppercase; }
  .sig-details { font-size: 7.5pt; color: #64748b; line-height: 1.35; }

  .doc-footer { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 5px; display: flex; justify-content: space-between; gap: 10px; font-size: 7pt; color: #94a3b8; page-break-inside: avoid; }
</style>
</head>
<body>

  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell"><img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img"></td>
      <td class="header-title-cell">
        <div class="doc-title">Consentimiento Informado</div>
        <div class="doc-subtitle">Prueba de alcohol y detección de consumo de sustancias psicoactivas</div>
        <div class="doc-subdetail">Sistema de Gestión de Seguridad y Salud en el Trabajo</div>
      </td>
      <td class="header-meta-cell">
        <div class="meta-code">{{codigo_formato}}</div>
        <div class="meta-ver">Versión: {{version_formato}}</div>
        <div class="meta-date">{{fecha_formato}}</div>
      </td>
    </tr>
  </table>

  <div class="metrics-card">
    <div class="metric-item"><div class="metric-label">Colaborador</div><div class="metric-value">{{nombre_completo}}</div></div>
    <div class="metric-item"><div class="metric-label">Identificación</div><div class="metric-value">C.C. {{identificacion}}</div></div>
    <div class="metric-item"><div class="metric-label">Cargo</div><div class="metric-value">{{cargo}}</div></div>
    <div class="metric-item"><div class="metric-label">Operación</div><div class="metric-value">{{operacion}}</div></div>
  </div>

  <section class="section-block">
    <div class="section-title">Destinatario</div>
    <table class="data-grid">
      <tr><td class="data-label">Señores:</td><td class="data-val">{{eps}}</td></tr>
      <tr><td class="data-label">Asunto:</td><td class="data-val">Consentimiento para prueba de toxicología</td></tr>
    </table>
  </section>

  <section class="statement-box ">
    <div class="statement-header">Cordial saludo</div>
    <p class="statement-text">APOYO LOGÍSTICO Y OPERATIVO S.A.S., comprometido en prevenir la accidentalidad laboral asociada al consumo de sustancias psicoactivas legales y/o ilegales en el trabajo y en preservar el derecho a la vida e integridad personal de los mismos trabajadores, implementa de manera aleatoria y sin vulnerar los derechos fundamentales de las personas las pruebas de toxicología a los empleados, ya sea con equipos y personal propio o de terceros, y estos a su vez aceptan dicha directriz.</p>
  </section>

  <section class="statement-box autoriza">
    <div class="statement-header">Autorización</div>
    <p class="statement-text">Yo, <strong>{{nombre_completo}}</strong>, identificado(a) con C.C. No. <strong>{{identificacion}}</strong>, en calidad de trabajador(a) de la empresa, manifiesto de manera expresa, libre y voluntaria que <strong>AUTORIZO</strong> a que se me realice la toma de la prueba de toxicología conforme a las directrices de la empresa y/o el cliente <strong>{{operacion}}</strong>.</p>
  </section>

  <section class="statement-box ">
    <div class="statement-header">Declaración</div>
    <p class="statement-text">Declaro haber recibido y entendido la política de prevención de sustancias psicoactivas, normas y directrices de la compañía, así como la aplicación de pruebas y el proceso disciplinario por LOGYSER.</p>
    <p class="statement-text">Manifiesto, además, conocer y entender los riesgos a los que voy a estar expuesto(a) y las medidas de control que el empleador considere necesarias durante la relación laboral.</p>
    <p class="statement-text">En concordancia con lo anterior, me obligo y me comprometo a cumplir con las normas y procedimientos establecidos por la empresa y otros que sean necesarios para el buen desempeño de mi trabajo y/o durante la permanencia en la compañía.</p>
    <p class="statement-text">Por último, manifiesto que conozco las sanciones disciplinarias a las cuales me encuentro expuesto(a) en caso de incumplimiento de lo anteriormente mencionado, de acuerdo con la reglamentación legal vigente, al igual que las dispuestas en el reglamento interno de trabajo.</p>
    <p class="statement-text">Acepto la finalidad antes indicada: <strong>{{resp_acepta_finalidad}}</strong></p>
  </section>

  <p class="lugar-fecha">Se firma en el municipio de <strong>{{municipio_firma}}</strong>, el día <strong>{{dia_firma}}</strong> del mes de <strong>{{mes_firma}}</strong> del año <strong>{{anio_firma}}</strong>.</p>

  <div class="signature-container">
    <div class="signature-card">
      <div class="sig-img-wrap">{{firma_colaborador}}</div>
      <div class="sig-line"></div>
      <div class="sig-role">Colaborador</div>
      <div class="sig-name">{{nombre_completo}}</div>
      <div class="sig-details">C.C. {{identificacion}} de {{ciudad_expedicion}}<br>{{cargo}}</div>
    </div>
  </div>

  <footer class="doc-footer">
    <span>Apoyo Logístico y Operativo S.A.S. &bull; Consentimiento Informado Prueba de Alcohol y SPA</span>
    <span>Certificación electrónica bajo Ley 527 de 1999</span>
    <span>Generado el {{fecha_generacion}}</span>
  </footer>

</body>
</html>
'
WHERE nombre_proceso = 'CHC';

-- CS
UPDATE Maestro_Plantillas
SET version = 3, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Reporte inicial de condiciones de salud — LOG&amp;SER</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a; background: #ffffff; font-size: 9pt; line-height: 1.42;
    -webkit-font-smoothing: antialiased;
  }
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

  .metrics-card { display: flex; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 14px; }
  .metric-item { flex: 1; padding: 9px 12px; border-right: 1px solid #e2e8f0; min-width: 0; }
  .metric-item:last-child { border-right: none; }
  .metric-label { font-size: 7.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .metric-value { font-size: 9pt; font-weight: 700; color: #000b59; word-break: break-word; }

  .section-block { margin-bottom: 12px; }
  .section-title { font-size: 8.5pt; font-weight: 700; color: #000b59; text-transform: uppercase; letter-spacing: 0.6px; display: flex; align-items: center; gap: 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; margin-bottom: 8px; page-break-after: avoid; }
  .section-title::before { content: ''''; display: inline-block; width: 4px; height: 12px; background: #f55400; border-radius: 2px; }

  .data-grid { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 8.5pt; }
  .data-grid td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .data-grid tr:last-child td { border-bottom: none; }
  .data-grid tr:nth-child(even) td { background: #fafafa; }
  .data-label { width: 30%; font-weight: 600; color: #64748b; border-right: 1px solid #f1f5f9; }
  .data-val { font-weight: 600; color: #0f172a; }

  .statement-box { background: #f8fafc; border: 1px solid #cbd5e1; border-left: 3.5px solid #000b59; border-radius: 6px; padding: 10px 13px; margin-bottom: 12px; }
  .statement-header { font-size: 8pt; font-weight: 700; color: #000b59; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 0.3px; }
  .statement-text { font-size: 8.5pt; color: #334155; text-align: justify; line-height: 1.5; margin-bottom: 6px; }
  .statement-text:last-child { margin-bottom: 0; }
  .autoriza { background: #fff7ed; border: 1px solid #fed7aa; border-left: 3.5px solid #f55400; }
  .autoriza .statement-header { color: #c2410c; }
  .autoriza .statement-text { color: #1e293b; }
  .statement-list { margin: 4px 0 6px 18px; font-size: 8.5pt; color: #334155; line-height: 1.45; }
  .statement-list li { text-align: justify; margin-bottom: 3px; padding-left: 2px; }
  .statement-list li::marker { color: #f55400; font-weight: 700; }

  .rule-list { list-style: none; counter-reset: regla; }
  .rule-list li { counter-increment: regla; position: relative; padding: 6px 10px 6px 34px; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 5px; font-size: 8.5pt; color: #334155; text-align: justify; background: #ffffff; page-break-inside: avoid; }
  .rule-list li::before { content: counter(regla); position: absolute; left: 8px; top: 6px; width: 18px; height: 18px; border-radius: 50%; background: #000b59; color: #ffffff; font-size: 7.5pt; font-weight: 800; text-align: center; line-height: 18px; }

  .q-table { width: 100%; border-collapse: collapse; font-size: 8pt; border: 1px solid #e2e8f0; }
  .q-table th { background: #e6edf7; color: #000b59; font-weight: 700; text-transform: uppercase; font-size: 7pt; letter-spacing: 0.3px; padding: 5px 6px; border: 1px solid #cbd5e1; text-align: left; }
  .q-table td { padding: 5px 6px; border: 1px solid #e2e8f0; vertical-align: middle; color: #334155; }
  .q-table tr:nth-child(even) td { background: #fafafa; }
  .q-table tr { page-break-inside: avoid; }
  .q-table .c { text-align: center; white-space: nowrap; }
  .box { display: inline-block; width: 10px; height: 10px; border: 1px solid #64748b; border-radius: 2px; vertical-align: middle; margin: 0 2px 0 6px; }
  .blank { display: inline-block; min-width: 90px; border-bottom: 1px solid #94a3b8; height: 11px; vertical-align: bottom; }

  .lugar-fecha { font-size: 8.5pt; color: #334155; margin: 6px 0 4px; }
  .lugar-fecha strong { color: #000b59; }

  .signature-container { margin-top: 18px; page-break-inside: avoid; }
  .signature-card { width: 46%; margin: 0 auto; text-align: center; }
  .sig-img-wrap { height: 80px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
  .sig-img-wrap img { max-height: 70px; max-width: 240px; object-fit: contain; }
  .sig-line { border-top: 1.5px solid #000b59; margin-bottom: 5px; }
  .sig-role { font-size: 7.5pt; font-weight: 700; color: #c2410c; text-transform: uppercase; letter-spacing: 0.3px; }
  .sig-name { font-size: 9pt; font-weight: 700; color: #000b59; text-transform: uppercase; }
  .sig-details { font-size: 7.5pt; color: #64748b; line-height: 1.35; }

  .doc-footer { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 5px; display: flex; justify-content: space-between; gap: 10px; font-size: 7pt; color: #94a3b8; page-break-inside: avoid; }
</style>
</head>
<body>

  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell"><img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img"></td>
      <td class="header-title-cell">
        <div class="doc-title">Reporte Inicial de Condiciones de Salud</div>
        <div class="doc-subtitle">Cuestionario de ingreso</div>
        <div class="doc-subdetail">Sistema de Gestión de Seguridad y Salud en el Trabajo</div>
      </td>
      <td class="header-meta-cell">
        <div class="meta-code">{{codigo_formato}}</div>
        <div class="meta-ver">Versión: {{version_formato}}</div>
        <div class="meta-date">{{fecha_formato}}</div>
      </td>
    </tr>
  </table>

  <div class="metrics-card">
    <div class="metric-item"><div class="metric-label">Colaborador</div><div class="metric-value">{{nombre_completo}}</div></div>
    <div class="metric-item"><div class="metric-label">Identificación</div><div class="metric-value">C.C. {{identificacion}}</div></div>
    <div class="metric-item"><div class="metric-label">Cargo</div><div class="metric-value">{{cargo}}</div></div>
    <div class="metric-item"><div class="metric-label">Operación</div><div class="metric-value">{{operacion}}</div></div>
  </div>

  <section class="statement-box ">
    <div class="statement-header">Instrucciones</div>
    <p class="statement-text">Se realiza el siguiente cuestionario considerando los requisitos del perfil, las actividades a ejecutar y el riesgo al cual estará expuesto(a). Por favor responda de manera consciente y veraz las siguientes preguntas. Se reitera que la información suministrada está relacionada con la legislación vigente (Decreto 1072 de 2015, Resolución 2346 de 2007), con la obligación de los trabajadores de brindar información del estado actual de salud y con el documento de "Autorización para el acceso a historia clínica y tratamiento de datos personales".</p>
    <p class="statement-text">Marque con X el segmento corporal en el que ha presentado fractura o amputación, y el segmento en el que ha presentado esguince o dolor en los últimos 6 meses.</p>
  </section>

  {{formulario_respuestas}}

  <section class="statement-box autoriza">
    <div class="statement-header">Declaración juramentada</div>
    <p class="statement-text"><strong>DECLARO BAJO JURAMENTO</strong> la autenticidad de los datos consignados en el presente documento y autorizo a APOYO LOGÍSTICO Y OPERATIVO S.A.S. a verificar la autenticidad de la información presentada para la continuidad del proceso.</p>
  </section>

  <p class="lugar-fecha">Se firma en el municipio de <strong>{{municipio_firma}}</strong>, el día <strong>{{dia_firma}}</strong> del mes de <strong>{{mes_firma}}</strong> del año <strong>{{anio_firma}}</strong>.</p>

  <div class="signature-container">
    <div class="signature-card">
      <div class="sig-img-wrap">{{firma_colaborador}}</div>
      <div class="sig-line"></div>
      <div class="sig-role">Colaborador</div>
      <div class="sig-name">{{nombre_completo}}</div>
      <div class="sig-details">C.C. {{identificacion}} de {{ciudad_expedicion}}<br>{{cargo}}</div>
    </div>
  </div>

  <footer class="doc-footer">
    <span>Apoyo Logístico y Operativo S.A.S. &bull; Reporte Inicial de Condiciones de Salud</span>
    <span>Certificación electrónica bajo Ley 527 de 1999</span>
    <span>Generado el {{fecha_generacion}}</span>
  </footer>

</body>
</html>
'
WHERE nombre_proceso = 'CS';

-- MF
UPDATE Maestro_Plantillas
SET version = 3, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Manual de funciones — LOG&amp;SER</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a; background: #ffffff; font-size: 9pt; line-height: 1.42;
    -webkit-font-smoothing: antialiased;
  }
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

  .metrics-card { display: flex; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 14px; }
  .metric-item { flex: 1; padding: 9px 12px; border-right: 1px solid #e2e8f0; min-width: 0; }
  .metric-item:last-child { border-right: none; }
  .metric-label { font-size: 7.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .metric-value { font-size: 9pt; font-weight: 700; color: #000b59; word-break: break-word; }

  .section-block { margin-bottom: 12px; }
  .section-title { font-size: 8.5pt; font-weight: 700; color: #000b59; text-transform: uppercase; letter-spacing: 0.6px; display: flex; align-items: center; gap: 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; margin-bottom: 8px; page-break-after: avoid; }
  .section-title::before { content: ''''; display: inline-block; width: 4px; height: 12px; background: #f55400; border-radius: 2px; }

  .data-grid { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 8.5pt; }
  .data-grid td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .data-grid tr:last-child td { border-bottom: none; }
  .data-grid tr:nth-child(even) td { background: #fafafa; }
  .data-label { width: 30%; font-weight: 600; color: #64748b; border-right: 1px solid #f1f5f9; }
  .data-val { font-weight: 600; color: #0f172a; }

  .statement-box { background: #f8fafc; border: 1px solid #cbd5e1; border-left: 3.5px solid #000b59; border-radius: 6px; padding: 10px 13px; margin-bottom: 12px; }
  .statement-header { font-size: 8pt; font-weight: 700; color: #000b59; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 0.3px; }
  .statement-text { font-size: 8.5pt; color: #334155; text-align: justify; line-height: 1.5; margin-bottom: 6px; }
  .statement-text:last-child { margin-bottom: 0; }
  .autoriza { background: #fff7ed; border: 1px solid #fed7aa; border-left: 3.5px solid #f55400; }
  .autoriza .statement-header { color: #c2410c; }
  .autoriza .statement-text { color: #1e293b; }
  .statement-list { margin: 4px 0 6px 18px; font-size: 8.5pt; color: #334155; line-height: 1.45; }
  .statement-list li { text-align: justify; margin-bottom: 3px; padding-left: 2px; }
  .statement-list li::marker { color: #f55400; font-weight: 700; }

  .rule-list { list-style: none; counter-reset: regla; }
  .rule-list li { counter-increment: regla; position: relative; padding: 6px 10px 6px 34px; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 5px; font-size: 8.5pt; color: #334155; text-align: justify; background: #ffffff; page-break-inside: avoid; }
  .rule-list li::before { content: counter(regla); position: absolute; left: 8px; top: 6px; width: 18px; height: 18px; border-radius: 50%; background: #000b59; color: #ffffff; font-size: 7.5pt; font-weight: 800; text-align: center; line-height: 18px; }

  .q-table { width: 100%; border-collapse: collapse; font-size: 8pt; border: 1px solid #e2e8f0; }
  .q-table th { background: #e6edf7; color: #000b59; font-weight: 700; text-transform: uppercase; font-size: 7pt; letter-spacing: 0.3px; padding: 5px 6px; border: 1px solid #cbd5e1; text-align: left; }
  .q-table td { padding: 5px 6px; border: 1px solid #e2e8f0; vertical-align: middle; color: #334155; }
  .q-table tr:nth-child(even) td { background: #fafafa; }
  .q-table tr { page-break-inside: avoid; }
  .q-table .c { text-align: center; white-space: nowrap; }
  .box { display: inline-block; width: 10px; height: 10px; border: 1px solid #64748b; border-radius: 2px; vertical-align: middle; margin: 0 2px 0 6px; }
  .blank { display: inline-block; min-width: 90px; border-bottom: 1px solid #94a3b8; height: 11px; vertical-align: bottom; }

  .lugar-fecha { font-size: 8.5pt; color: #334155; margin: 6px 0 4px; }
  .lugar-fecha strong { color: #000b59; }

  .signature-container { margin-top: 18px; page-break-inside: avoid; }
  .signature-card { width: 46%; margin: 0 auto; text-align: center; }
  .sig-img-wrap { height: 80px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
  .sig-img-wrap img { max-height: 70px; max-width: 240px; object-fit: contain; }
  .sig-line { border-top: 1.5px solid #000b59; margin-bottom: 5px; }
  .sig-role { font-size: 7.5pt; font-weight: 700; color: #c2410c; text-transform: uppercase; letter-spacing: 0.3px; }
  .sig-name { font-size: 9pt; font-weight: 700; color: #000b59; text-transform: uppercase; }
  .sig-details { font-size: 7.5pt; color: #64748b; line-height: 1.35; }

  .doc-footer { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 5px; display: flex; justify-content: space-between; gap: 10px; font-size: 7pt; color: #94a3b8; page-break-inside: avoid; }
</style>
</head>
<body>

  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell"><img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img"></td>
      <td class="header-title-cell">
        <div class="doc-title">Manual de Funciones</div>
        <div class="doc-subtitle">Responsabilidades y competencias — Auxiliar logístico</div>
        <div class="doc-subdetail">Gestión del Talento Humano</div>
      </td>
      <td class="header-meta-cell">
        <div class="meta-code">{{codigo_formato}}</div>
        <div class="meta-ver">Versión: {{version_formato}}</div>
        <div class="meta-date">{{fecha_formato}}</div>
      </td>
    </tr>
  </table>

  <div class="metrics-card">
    <div class="metric-item"><div class="metric-label">Colaborador</div><div class="metric-value">{{nombre_completo}}</div></div>
    <div class="metric-item"><div class="metric-label">Identificación</div><div class="metric-value">C.C. {{identificacion}}</div></div>
    <div class="metric-item"><div class="metric-label">Cargo</div><div class="metric-value">{{cargo}}</div></div>
    <div class="metric-item"><div class="metric-label">Operación</div><div class="metric-value">{{operacion}}</div></div>
  </div>

  <section class="section-block">
    <div class="section-title">Identificación del cargo y ubicación</div>
    <table class="data-grid">
      <tr><td class="data-label">Cargo</td><td class="data-val">Auxiliar logístico</td></tr>
      <tr><td class="data-label">Ubicación</td><td class="data-val">Sede Operativa</td></tr>
      <tr><td class="data-label">Versión / Fecha de emisión</td><td class="data-val">01 &bull; 01/11/2024</td></tr>
      <tr><td class="data-label">Jefe inmediato</td><td class="data-val">Coordinador de centro de trabajo</td></tr>
      <tr><td class="data-label">Nivel jerárquico</td><td class="data-val">Operativo</td></tr>
    </table>
  </section>

  <section class="statement-box ">
    <div class="statement-header">Objetivo del cargo</div>
    <p class="statement-text">Apoyar en la gestión integral de la cadena logística dentro y fuera del Centro de Distribución, asegurando la correcta recepción y cargue de mercancías de acuerdo con los procedimientos establecidos y las políticas de Salud Ocupacional.</p>
  </section>

  <section class="section-block">
    <div class="section-title">Autoridad</div>
    <p class="statement-text">N/A</p>
  </section>

  <section class="section-block">
    <div class="section-title">Competencias del perfil</div>
    <table class="data-grid">
      <tr><td class="data-label">Edad</td><td class="data-val">Preferiblemente de 18 a 40 años</td></tr>
      <tr><td class="data-label">Género</td><td class="data-val">Preferiblemente masculino</td></tr>
      <tr><td class="data-label">Educación</td><td class="data-val">Que sepa leer y escribir</td></tr>
      <tr><td class="data-label">Formación</td><td class="data-val">N/A</td></tr>
      <tr><td class="data-label">Experiencia en el cargo</td><td class="data-val">No requiere</td></tr>
    </table>
    <p class="statement-text" style="margin-top:5px;font-size:7.5pt;color:#64748b"><strong>Nota:</strong> los requerimientos de educación, formación o experiencia se tendrán en cuenta para la homologación de las competencias del cargo.</p>
  </section>

  <section class="section-block">
    <div class="section-title">Responsabilidades del cargo</div>
    <ul class="statement-list">
      <li>Atender los vehículos.</li>
      <li>Mantener en óptimas condiciones su área de trabajo, garantizando la movilidad de los equipos y la aplicación de las normas de seguridad.</li>
      <li>Realizar la labor asignada siguiendo las directrices del cliente.</li>
      <li>Apoyar las diferentes actividades imprevistas que se soliciten.</li>
    </ul>
  </section>

  <section class="section-block">
    <div class="section-title">Funciones del cargo</div>
    <ul class="statement-list">
      <li>Cargar y descargar vehículos.</li>
      <li>Informar al líder en caso de identificar mercancía averiada o en mal estado, así como situaciones de hurto, recepción de propinas, eventos por el estado del camión que pongan en riesgo la mercancía y daños en instalaciones y equipos.</li>
      <li>Alistar mercancía para el despacho.</li>
      <li>Poner especial atención en la manipulación de la mercancía de línea blanca y línea marrón antes de ser cargada o descargada para evitar y/o identificar averías.</li>
      <li>Apadrinar mercancías a solicitud del proveedor.</li>
      <li>Mantener limpias las áreas de trabajo.</li>
      <li>Estibar la mercancía respetando los pictogramas.</li>
      <li>Paletizar mercancía optimizando el recurso.</li>
      <li>Destellar mercancía según los requerimientos del cliente.</li>
      <li>Además de las tareas principales, todas aquellas inherentes al cargo y que le sean asignadas por el jefe directo.</li>
    </ul>
  </section>

  <section class="section-block">
    <div class="section-title">Responsabilidades en SST</div>
    <ul class="statement-list">
      <li>Velar por el cumplimiento de las Políticas, Objetivos, Misión, Visión, Reglamentos y programas existentes en el SST (Seguridad, Salud en el Trabajo y Ambiente) en la organización.</li>
      <li>Cumplir con la implementación de los procesos existentes en Seguridad, Salud Ocupacional y Ambiente (utilización de formatos según sea el caso).</li>
      <li>Realizar sus actividades de forma segura, promoviendo su autocuidado, evitando generar impacto al medio ambiente, preservando los bienes de la Compañía y manteniendo una actitud preventiva y proactiva.</li>
      <li>Conocer y cumplir el programa de clasificación de residuos sólidos establecido por la Compañía.</li>
      <li>Desarrollar las actividades asignadas por el COPASST, Comité de Convivencia y Brigadista.</li>
      <li>Liderar y participar activamente en las reuniones o capacitaciones concernientes a Seguridad, Salud en el Trabajo y Ambiente.</li>
      <li>Establecer el uso adecuado de ahorro de agua y energía.</li>
      <li>Garantizar el uso, cuidado y mantenimiento de los elementos de protección personal y demás elementos de seguridad industrial requeridos para el desarrollo de las tareas, actividades y operación.</li>
      <li>Reportar todos los actos inseguros, condiciones inseguras, incidentes y/o accidentes de trabajo inmediatamente a su jefe directo.</li>
      <li>Suministrar información de forma clara, veraz y completa sobre su estado de salud.</li>
      <li>Procurar el cuidado integral de su salud.</li>
      <li>Participar en las actividades de capacitación de acuerdo al plan de trabajo SG-SST.</li>
    </ul>
  </section>

  <section class="section-block">
    <div class="section-title">Rendición de cuentas</div>
    <table class="data-grid">
      <tr><td class="data-label">Cargos que le reportan</td><td class="data-val">N/A</td></tr>
      <tr><td class="data-label">A quién le reporta</td><td class="data-val">Jefe directo, Recursos Humanos, Gerencia, Seguridad y Salud en el Trabajo</td></tr>
    </table>
  </section>

  <p class="lugar-fecha">Se firma en el municipio de <strong>{{municipio_firma}}</strong>, el día <strong>{{dia_firma}}</strong> del mes de <strong>{{mes_firma}}</strong> del año <strong>{{anio_firma}}</strong>.</p>

  <div class="signature-container">
    <div class="signature-card">
      <div class="sig-img-wrap">{{firma_colaborador}}</div>
      <div class="sig-line"></div>
      <div class="sig-role">Colaborador</div>
      <div class="sig-name">{{nombre_completo}}</div>
      <div class="sig-details">C.C. {{identificacion}} de {{ciudad_expedicion}}<br>{{cargo}}</div>
    </div>
  </div>

  <footer class="doc-footer">
    <span>Apoyo Logístico y Operativo S.A.S. &bull; Manual de Funciones, Responsabilidades y Competencias</span>
    <span>Certificación electrónica bajo Ley 527 de 1999</span>
    <span>Generado el {{fecha_generacion}}</span>
  </footer>

</body>
</html>
'
WHERE nombre_proceso = 'MF';

-- SEOP
UPDATE Maestro_Plantillas
SET version = 2, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Normas de seguridad en la operación — LOG&amp;SER</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a; background: #ffffff; font-size: 9pt; line-height: 1.42;
    -webkit-font-smoothing: antialiased;
  }
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

  .metrics-card { display: flex; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 14px; }
  .metric-item { flex: 1; padding: 9px 12px; border-right: 1px solid #e2e8f0; min-width: 0; }
  .metric-item:last-child { border-right: none; }
  .metric-label { font-size: 7.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .metric-value { font-size: 9pt; font-weight: 700; color: #000b59; word-break: break-word; }

  .section-block { margin-bottom: 12px; }
  .section-title { font-size: 8.5pt; font-weight: 700; color: #000b59; text-transform: uppercase; letter-spacing: 0.6px; display: flex; align-items: center; gap: 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; margin-bottom: 8px; page-break-after: avoid; }
  .section-title::before { content: ''''; display: inline-block; width: 4px; height: 12px; background: #f55400; border-radius: 2px; }

  .data-grid { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 8.5pt; }
  .data-grid td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .data-grid tr:last-child td { border-bottom: none; }
  .data-grid tr:nth-child(even) td { background: #fafafa; }
  .data-label { width: 30%; font-weight: 600; color: #64748b; border-right: 1px solid #f1f5f9; }
  .data-val { font-weight: 600; color: #0f172a; }

  .statement-box { background: #f8fafc; border: 1px solid #cbd5e1; border-left: 3.5px solid #000b59; border-radius: 6px; padding: 10px 13px; margin-bottom: 12px; }
  .statement-header { font-size: 8pt; font-weight: 700; color: #000b59; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 0.3px; }
  .statement-text { font-size: 8.5pt; color: #334155; text-align: justify; line-height: 1.5; margin-bottom: 6px; }
  .statement-text:last-child { margin-bottom: 0; }
  .autoriza { background: #fff7ed; border: 1px solid #fed7aa; border-left: 3.5px solid #f55400; }
  .autoriza .statement-header { color: #c2410c; }
  .autoriza .statement-text { color: #1e293b; }
  .statement-list { margin: 4px 0 6px 18px; font-size: 8.5pt; color: #334155; line-height: 1.45; }
  .statement-list li { text-align: justify; margin-bottom: 3px; padding-left: 2px; }
  .statement-list li::marker { color: #f55400; font-weight: 700; }

  .rule-list { list-style: none; counter-reset: regla; }
  .rule-list li { counter-increment: regla; position: relative; padding: 6px 10px 6px 34px; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 5px; font-size: 8.5pt; color: #334155; text-align: justify; background: #ffffff; page-break-inside: avoid; }
  .rule-list li::before { content: counter(regla); position: absolute; left: 8px; top: 6px; width: 18px; height: 18px; border-radius: 50%; background: #000b59; color: #ffffff; font-size: 7.5pt; font-weight: 800; text-align: center; line-height: 18px; }

  .q-table { width: 100%; border-collapse: collapse; font-size: 8pt; border: 1px solid #e2e8f0; }
  .q-table th { background: #e6edf7; color: #000b59; font-weight: 700; text-transform: uppercase; font-size: 7pt; letter-spacing: 0.3px; padding: 5px 6px; border: 1px solid #cbd5e1; text-align: left; }
  .q-table td { padding: 5px 6px; border: 1px solid #e2e8f0; vertical-align: middle; color: #334155; }
  .q-table tr:nth-child(even) td { background: #fafafa; }
  .q-table tr { page-break-inside: avoid; }
  .q-table .c { text-align: center; white-space: nowrap; }
  .box { display: inline-block; width: 10px; height: 10px; border: 1px solid #64748b; border-radius: 2px; vertical-align: middle; margin: 0 2px 0 6px; }
  .blank { display: inline-block; min-width: 90px; border-bottom: 1px solid #94a3b8; height: 11px; vertical-align: bottom; }

  .lugar-fecha { font-size: 8.5pt; color: #334155; margin: 6px 0 4px; }
  .lugar-fecha strong { color: #000b59; }

  .signature-container { margin-top: 18px; page-break-inside: avoid; }
  .signature-card { width: 46%; margin: 0 auto; text-align: center; }
  .sig-img-wrap { height: 80px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
  .sig-img-wrap img { max-height: 70px; max-width: 240px; object-fit: contain; }
  .sig-line { border-top: 1.5px solid #000b59; margin-bottom: 5px; }
  .sig-role { font-size: 7.5pt; font-weight: 700; color: #c2410c; text-transform: uppercase; letter-spacing: 0.3px; }
  .sig-name { font-size: 9pt; font-weight: 700; color: #000b59; text-transform: uppercase; }
  .sig-details { font-size: 7.5pt; color: #64748b; line-height: 1.35; }

  .doc-footer { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 5px; display: flex; justify-content: space-between; gap: 10px; font-size: 7pt; color: #94a3b8; page-break-inside: avoid; }
</style>
</head>
<body>

  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell"><img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img"></td>
      <td class="header-title-cell">
        <div class="doc-title">Normas de Seguridad en la Operación</div>
        <div class="doc-subtitle">Compromiso de autocuidado del colaborador</div>
        <div class="doc-subdetail">Sistema de Gestión de Seguridad y Salud en el Trabajo</div>
      </td>
      <td class="header-meta-cell">
        <div class="meta-code">{{codigo_formato}}</div>
        <div class="meta-ver">Versión: {{version_formato}}</div>
        <div class="meta-date">{{fecha_formato}}</div>
      </td>
    </tr>
  </table>

  <div class="metrics-card">
    <div class="metric-item"><div class="metric-label">Colaborador</div><div class="metric-value">{{nombre_completo}}</div></div>
    <div class="metric-item"><div class="metric-label">Identificación</div><div class="metric-value">C.C. {{identificacion}}</div></div>
    <div class="metric-item"><div class="metric-label">Cargo</div><div class="metric-value">{{cargo}}</div></div>
    <div class="metric-item"><div class="metric-label">Operación</div><div class="metric-value">{{operacion}}</div></div>
  </div>

  <section class="section-block">
    <div class="section-title">Generalidades</div>
    <table class="data-grid">
      <tr><td class="data-label">Objetivo</td><td class="data-val">Establecer normas a nivel de Seguridad y Salud en el Trabajo para laborar en las operaciones, como medida de prevención frente a riesgos y peligros derivados de la operación de Logyser.</td></tr>
      <tr><td class="data-label">Alcance</td><td class="data-val">Aplica para todos los colaboradores de Logyser.</td></tr>
    </table>
  </section>

  <section class="section-block">
    <div class="section-title">Objetivos específicos</div>
    <ul class="statement-list">
      <li>Prevenir incidentes y/o accidentes laborales, con afectación a la persona, al medio ambiente, a la operación y activos fijos de LOGYSER.</li>
      <li>Adoptar cultura de autocuidado y cumplimiento de normas de seguridad como medida preventiva frente al estado integral del trabajador.</li>
    </ul>
  </section>

  <section class="section-block">
    <div class="section-title">Normas que me comprometo a cumplir</div>
    <ol class="rule-list">
      <li>Presento mi carné al ingreso de las instalaciones de las operaciones, me presento a la zona de operación con mi dotación completa entregada por la empresa (overol, calzado y EPP) y durante toda mi jornada laboral utilizo mi dotación y los EPP requeridos para mi labor.</li>
      <li>Llego a mi lugar de trabajo con el tiempo de anticipación necesario para recibir el turno, así como la información necesaria de las actividades a realizar.</li>
      <li>Me abstengo de usar accesorios como aretes, piercing, expansiones, cadenas, pulseras, relojes, anillos y gorras, y me presento al trabajo libre de efectos de alcohol, drogas y sustancias psicoactivas, las cuales ponen en riesgo mi integridad y la de mis compañeros.</li>
      <li>Reporto mis condiciones de salud de forma diaria y, con 2 días de antelación como mínimo, informo mis citas médicas, terapias, exámenes y otros para gestionar el permiso a través del formato físico.</li>
      <li>Los soportes de incapacidad, recomendaciones y otros, una vez sean expedidos, debo entregarlos al jefe y/o a Gestión Humana y SST para el respectivo análisis vs. puesto de trabajo.</li>
      <li>Toda lesión que me suceda en la ejecución de mi labor la debo reportar de forma inmediata a la ocurrencia y participar en el proceso de investigación y plan de acción conforme a la legislación vigente.</li>
      <li>Me abstengo de utilizar celular, manos libres, radios, mp3 o cualquier otro elemento que me genere distracción durante mi jornada laboral.</li>
      <li>Sigo los procedimientos indicados en mi inducción, mantengo mi área de trabajo en condiciones óptimas de orden y aseo, cumpliendo las normas y controles requeridos, suspendiendo toda labor que ponga en riesgo mi vida, la de mis compañeros, el medio ambiente y los recursos de la empresa.</li>
      <li>Reporto actos y condiciones inseguras, doy buen trato a jefes y compañeros, sigo instrucciones de mi jefe y acepto retroalimentación de superiores en caso de ser necesario; en el trabajo y fuera de él cumplo las normas de seguridad vial (respeto las señales de tránsito).</li>
      <li>Con la firma del presente documento manifiesto que he recibido la información sobre los riesgos y normas de seguridad, y me comprometo a cumplirlas durante mi relación laboral con APOYO LOGÍSTICO Y OPERATIVO S.A.S.</li>
    </ol>
  </section>

  <p class="lugar-fecha">Se firma en el municipio de <strong>{{municipio_firma}}</strong>, el día <strong>{{dia_firma}}</strong> del mes de <strong>{{mes_firma}}</strong> del año <strong>{{anio_firma}}</strong>.</p>

  <div class="signature-container">
    <div class="signature-card">
      <div class="sig-img-wrap">{{firma_colaborador}}</div>
      <div class="sig-line"></div>
      <div class="sig-role">Colaborador</div>
      <div class="sig-name">{{nombre_completo}}</div>
      <div class="sig-details">C.C. {{identificacion}} de {{ciudad_expedicion}}<br>{{cargo}}</div>
    </div>
  </div>

  <footer class="doc-footer">
    <span>Apoyo Logístico y Operativo S.A.S. &bull; Normas de Seguridad en la Operación</span>
    <span>Certificación electrónica bajo Ley 527 de 1999</span>
    <span>Generado el {{fecha_generacion}}</span>
  </footer>

</body>
</html>
'
WHERE nombre_proceso = 'SEOP';

-- TD
UPDATE Maestro_Plantillas
SET version = 3, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Autorización para el tratamiento de datos personales — LOG&amp;SER</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a; background: #ffffff; font-size: 9pt; line-height: 1.42;
    -webkit-font-smoothing: antialiased;
  }
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

  .metrics-card { display: flex; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 14px; }
  .metric-item { flex: 1; padding: 9px 12px; border-right: 1px solid #e2e8f0; min-width: 0; }
  .metric-item:last-child { border-right: none; }
  .metric-label { font-size: 7.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .metric-value { font-size: 9pt; font-weight: 700; color: #000b59; word-break: break-word; }

  .section-block { margin-bottom: 12px; }
  .section-title { font-size: 8.5pt; font-weight: 700; color: #000b59; text-transform: uppercase; letter-spacing: 0.6px; display: flex; align-items: center; gap: 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; margin-bottom: 8px; page-break-after: avoid; }
  .section-title::before { content: ''''; display: inline-block; width: 4px; height: 12px; background: #f55400; border-radius: 2px; }

  .data-grid { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 8.5pt; }
  .data-grid td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .data-grid tr:last-child td { border-bottom: none; }
  .data-grid tr:nth-child(even) td { background: #fafafa; }
  .data-label { width: 30%; font-weight: 600; color: #64748b; border-right: 1px solid #f1f5f9; }
  .data-val { font-weight: 600; color: #0f172a; }

  .statement-box { background: #f8fafc; border: 1px solid #cbd5e1; border-left: 3.5px solid #000b59; border-radius: 6px; padding: 10px 13px; margin-bottom: 12px; }
  .statement-header { font-size: 8pt; font-weight: 700; color: #000b59; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 0.3px; }
  .statement-text { font-size: 8.5pt; color: #334155; text-align: justify; line-height: 1.5; margin-bottom: 6px; }
  .statement-text:last-child { margin-bottom: 0; }
  .autoriza { background: #fff7ed; border: 1px solid #fed7aa; border-left: 3.5px solid #f55400; }
  .autoriza .statement-header { color: #c2410c; }
  .autoriza .statement-text { color: #1e293b; }
  .statement-list { margin: 4px 0 6px 18px; font-size: 8.5pt; color: #334155; line-height: 1.45; }
  .statement-list li { text-align: justify; margin-bottom: 3px; padding-left: 2px; }
  .statement-list li::marker { color: #f55400; font-weight: 700; }

  .rule-list { list-style: none; counter-reset: regla; }
  .rule-list li { counter-increment: regla; position: relative; padding: 6px 10px 6px 34px; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 5px; font-size: 8.5pt; color: #334155; text-align: justify; background: #ffffff; page-break-inside: avoid; }
  .rule-list li::before { content: counter(regla); position: absolute; left: 8px; top: 6px; width: 18px; height: 18px; border-radius: 50%; background: #000b59; color: #ffffff; font-size: 7.5pt; font-weight: 800; text-align: center; line-height: 18px; }

  .q-table { width: 100%; border-collapse: collapse; font-size: 8pt; border: 1px solid #e2e8f0; }
  .q-table th { background: #e6edf7; color: #000b59; font-weight: 700; text-transform: uppercase; font-size: 7pt; letter-spacing: 0.3px; padding: 5px 6px; border: 1px solid #cbd5e1; text-align: left; }
  .q-table td { padding: 5px 6px; border: 1px solid #e2e8f0; vertical-align: middle; color: #334155; }
  .q-table tr:nth-child(even) td { background: #fafafa; }
  .q-table tr { page-break-inside: avoid; }
  .q-table .c { text-align: center; white-space: nowrap; }
  .box { display: inline-block; width: 10px; height: 10px; border: 1px solid #64748b; border-radius: 2px; vertical-align: middle; margin: 0 2px 0 6px; }
  .blank { display: inline-block; min-width: 90px; border-bottom: 1px solid #94a3b8; height: 11px; vertical-align: bottom; }

  .lugar-fecha { font-size: 8.5pt; color: #334155; margin: 6px 0 4px; }
  .lugar-fecha strong { color: #000b59; }

  .signature-container { margin-top: 18px; page-break-inside: avoid; }
  .signature-card { width: 46%; margin: 0 auto; text-align: center; }
  .sig-img-wrap { height: 80px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
  .sig-img-wrap img { max-height: 70px; max-width: 240px; object-fit: contain; }
  .sig-line { border-top: 1.5px solid #000b59; margin-bottom: 5px; }
  .sig-role { font-size: 7.5pt; font-weight: 700; color: #c2410c; text-transform: uppercase; letter-spacing: 0.3px; }
  .sig-name { font-size: 9pt; font-weight: 700; color: #000b59; text-transform: uppercase; }
  .sig-details { font-size: 7.5pt; color: #64748b; line-height: 1.35; }

  .doc-footer { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 5px; display: flex; justify-content: space-between; gap: 10px; font-size: 7pt; color: #94a3b8; page-break-inside: avoid; }
</style>
</head>
<body>

  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell"><img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img"></td>
      <td class="header-title-cell">
        <div class="doc-title">Autorización para el Tratamiento de Datos Personales</div>
        <div class="doc-subtitle">Política de tratamiento de datos y aviso de privacidad</div>
        <div class="doc-subdetail">Ley 1581 de 2012 — Habeas Data</div>
      </td>
      <td class="header-meta-cell">
        <div class="meta-code">{{codigo_formato}}</div>
        <div class="meta-ver">Versión: {{version_formato}}</div>
        <div class="meta-date">{{fecha_formato}}</div>
      </td>
    </tr>
  </table>

  <div class="metrics-card">
    <div class="metric-item"><div class="metric-label">Colaborador</div><div class="metric-value">{{nombre_completo}}</div></div>
    <div class="metric-item"><div class="metric-label">Identificación</div><div class="metric-value">C.C. {{identificacion}}</div></div>
    <div class="metric-item"><div class="metric-label">Cargo</div><div class="metric-value">{{cargo}}</div></div>
    <div class="metric-item"><div class="metric-label">Operación</div><div class="metric-value">{{operacion}}</div></div>
  </div>

  <section class="statement-box ">
    <div class="statement-header">Declaración</div>
    <p class="statement-text">Con la firma de este documento manifiesto que he sido informado(a) por APOYO LOGÍSTICO Y OPERATIVO S.A.S. de lo siguiente:</p>
  </section>

  <section class="section-block">
    <div class="section-title">Información y derechos del titular</div>
    <ol class="rule-list">
      <li>La Compañía actúa como responsable del tratamiento de datos personales del titular de acuerdo con lo establecido en la Ley 1581 de 2012 de habeas data, y conjunta o separadamente podrá recolectar, usar y tratar mis datos personales conforme a la Política de Tratamiento de Datos de la Compañía, que se encuentra disponible en la base de datos del área de Talento Humano. Es de carácter facultativo el responder las preguntas sobre datos sensibles o sobre niñas, niños y adolescentes.</li>
      <li>Es de carácter facultativo el responder las preguntas sobre datos sensibles o sobre niñas, niños y adolescentes. Mis derechos como titular de los datos son los previstos en la Constitución y la ley, especialmente los siguientes:</li>
      <li>Derecho a conocer, actualizar y rectificar mis datos personales frente a los responsables o encargados del tratamiento, así como el derecho a revocar el consentimiento otorgado para el tratamiento de datos personales. Este derecho se podrá ejercer, entre otros, frente a datos parciales, inexactos, incompletos, fraccionados, que induzcan a error, o aquellos cuyo tratamiento esté expresamente prohibido o no haya sido autorizado; pueden ser ejercidos a través de los canales gratuitos dispuestos por la Compañía y observando la Política de Tratamiento de Datos Personales de APOYO LOGÍSTICO Y OPERATIVO S.A.S.</li>
      <li>Derecho a solicitar prueba de la autorización otorgada al responsable del tratamiento, salvo cuando expresamente se exceptúe como requisito para el tratamiento.</li>
      <li>Derecho a ser informado por el responsable o el encargado del tratamiento, previa solicitud, respecto del uso que les ha dado a mis datos personales.</li>
      <li>Derecho a revocar la autorización y/o solicitar la supresión del dato cuando en el tratamiento no se respeten los principios, derechos y garantías constitucionales y legales.</li>
      <li>Derecho a acceder en forma gratuita a mis datos personales que hayan sido objeto de tratamiento, en los términos establecidos en la Ley 1581 de 2012 y las demás normas que la modifiquen, adicionen o complementen. Para cualquier inquietud o información adicional relacionada con el tratamiento de datos personales, puedo contactarme al correo electrónico <strong>directora.th@logyser.com</strong>.</li>
    </ol>
  </section>

  <section class="statement-box autoriza">
    <div class="statement-header">Aceptación de la Política de Tratamiento de Datos Personales</div>
    <p class="statement-text">El trabajador, al firmar este documento, declara que ha leído y comprendido en su totalidad la Política de Tratamiento de Datos Personales de APOYO LOGÍSTICO Y OPERATIVO S.A.S. (en adelante LOG&amp;SER), la cual ha sido proporcionada para su revisión. El trabajador acepta y consiente el tratamiento de sus datos personales de acuerdo con los términos y condiciones establecidos en dicha política.</p>
    <p class="statement-text">El trabajador entiende que la Política de Tratamiento de Datos Personales detalla cómo LOG&amp;SER recopila, utiliza, almacena y protege la información personal, así como los derechos y procedimientos relacionados con la protección de datos. Asimismo, reconoce que tiene acceso a la política en cualquier momento y puede solicitar aclaraciones o ejercer sus derechos de acceso, corrección, actualización o eliminación de datos conforme a lo dispuesto en la política y la legislación aplicable.</p>
    <p class="statement-text">Al firmar este documento, el trabajador otorga su consentimiento explícito para el tratamiento de sus datos personales conforme a las finalidades descritas en la política.</p>
  </section>

  <p class="lugar-fecha">Se firma en el municipio de <strong>{{municipio_firma}}</strong>, el día <strong>{{dia_firma}}</strong> del mes de <strong>{{mes_firma}}</strong> del año <strong>{{anio_firma}}</strong>.</p>

  <div class="signature-container">
    <div class="signature-card">
      <div class="sig-img-wrap">{{firma_colaborador}}</div>
      <div class="sig-line"></div>
      <div class="sig-role">Colaborador</div>
      <div class="sig-name">{{nombre_completo}}</div>
      <div class="sig-details">C.C. {{identificacion}} de {{ciudad_expedicion}}<br>{{cargo}}</div>
    </div>
  </div>

  <footer class="doc-footer">
    <span>Apoyo Logístico y Operativo S.A.S. &bull; Autorización para el Tratamiento de Datos Personales</span>
    <span>Certificación electrónica bajo Ley 527 de 1999</span>
    <span>Generado el {{fecha_generacion}}</span>
  </footer>

</body>
</html>
'
WHERE nombre_proceso = 'TD';

-- ITAL
UPDATE Maestro_Plantillas
SET version = 2, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Formatos Italcol — LOG&amp;SER</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a; background: #ffffff; font-size: 9pt; line-height: 1.42;
    -webkit-font-smoothing: antialiased;
  }
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

  .metrics-card { display: flex; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 14px; }
  .metric-item { flex: 1; padding: 9px 12px; border-right: 1px solid #e2e8f0; min-width: 0; }
  .metric-item:last-child { border-right: none; }
  .metric-label { font-size: 7.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .metric-value { font-size: 9pt; font-weight: 700; color: #000b59; word-break: break-word; }

  .section-block { margin-bottom: 12px; }
  .section-title { font-size: 8.5pt; font-weight: 700; color: #000b59; text-transform: uppercase; letter-spacing: 0.6px; display: flex; align-items: center; gap: 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; margin-bottom: 8px; page-break-after: avoid; }
  .section-title::before { content: ''''; display: inline-block; width: 4px; height: 12px; background: #f55400; border-radius: 2px; }

  .data-grid { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 8.5pt; }
  .data-grid td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .data-grid tr:last-child td { border-bottom: none; }
  .data-grid tr:nth-child(even) td { background: #fafafa; }
  .data-label { width: 30%; font-weight: 600; color: #64748b; border-right: 1px solid #f1f5f9; }
  .data-val { font-weight: 600; color: #0f172a; }

  .statement-box { background: #f8fafc; border: 1px solid #cbd5e1; border-left: 3.5px solid #000b59; border-radius: 6px; padding: 10px 13px; margin-bottom: 12px; }
  .statement-header { font-size: 8pt; font-weight: 700; color: #000b59; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 0.3px; }
  .statement-text { font-size: 8.5pt; color: #334155; text-align: justify; line-height: 1.5; margin-bottom: 6px; }
  .statement-text:last-child { margin-bottom: 0; }
  .autoriza { background: #fff7ed; border: 1px solid #fed7aa; border-left: 3.5px solid #f55400; }
  .autoriza .statement-header { color: #c2410c; }
  .autoriza .statement-text { color: #1e293b; }
  .statement-list { margin: 4px 0 6px 18px; font-size: 8.5pt; color: #334155; line-height: 1.45; }
  .statement-list li { text-align: justify; margin-bottom: 3px; padding-left: 2px; }
  .statement-list li::marker { color: #f55400; font-weight: 700; }

  .rule-list { list-style: none; counter-reset: regla; }
  .rule-list li { counter-increment: regla; position: relative; padding: 6px 10px 6px 34px; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 5px; font-size: 8.5pt; color: #334155; text-align: justify; background: #ffffff; page-break-inside: avoid; }
  .rule-list li::before { content: counter(regla); position: absolute; left: 8px; top: 6px; width: 18px; height: 18px; border-radius: 50%; background: #000b59; color: #ffffff; font-size: 7.5pt; font-weight: 800; text-align: center; line-height: 18px; }

  .q-table { width: 100%; border-collapse: collapse; font-size: 8pt; border: 1px solid #e2e8f0; }
  .q-table th { background: #e6edf7; color: #000b59; font-weight: 700; text-transform: uppercase; font-size: 7pt; letter-spacing: 0.3px; padding: 5px 6px; border: 1px solid #cbd5e1; text-align: left; }
  .q-table td { padding: 5px 6px; border: 1px solid #e2e8f0; vertical-align: middle; color: #334155; }
  .q-table tr:nth-child(even) td { background: #fafafa; }
  .q-table tr { page-break-inside: avoid; }
  .q-table .c { text-align: center; white-space: nowrap; }
  .box { display: inline-block; width: 10px; height: 10px; border: 1px solid #64748b; border-radius: 2px; vertical-align: middle; margin: 0 2px 0 6px; }
  .blank { display: inline-block; min-width: 90px; border-bottom: 1px solid #94a3b8; height: 11px; vertical-align: bottom; }

  .lugar-fecha { font-size: 8.5pt; color: #334155; margin: 6px 0 4px; }
  .lugar-fecha strong { color: #000b59; }

  .signature-container { margin-top: 18px; page-break-inside: avoid; }
  .signature-card { width: 46%; margin: 0 auto; text-align: center; }
  .sig-img-wrap { height: 80px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
  .sig-img-wrap img { max-height: 70px; max-width: 240px; object-fit: contain; }
  .sig-line { border-top: 1.5px solid #000b59; margin-bottom: 5px; }
  .sig-role { font-size: 7.5pt; font-weight: 700; color: #c2410c; text-transform: uppercase; letter-spacing: 0.3px; }
  .sig-name { font-size: 9pt; font-weight: 700; color: #000b59; text-transform: uppercase; }
  .sig-details { font-size: 7.5pt; color: #64748b; line-height: 1.35; }

  .doc-footer { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 5px; display: flex; justify-content: space-between; gap: 10px; font-size: 7pt; color: #94a3b8; page-break-inside: avoid; }

  .formato-head { display: flex; justify-content: space-between; align-items: center; background: #000b59; color: #ffffff; border-radius: 6px 6px 0 0; padding: 7px 12px; margin-top: 16px; page-break-after: avoid; }
  .formato-head .fh-title { font-size: 9pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; }
  .formato-head .fh-code { font-size: 7.5pt; font-weight: 700; background: #f55400; border-radius: 4px; padding: 2px 7px; white-space: nowrap; }
  .formato-body { border: 1px solid #cbd5e1; border-top: none; border-radius: 0 0 6px 6px; padding: 10px 12px; margin-bottom: 6px; }
  .formato-break { page-break-before: always; }
  .preg { margin-bottom: 9px; page-break-inside: avoid; }
  .preg-t { font-size: 8.5pt; font-weight: 700; color: #000b59; margin-bottom: 4px; }
  .preg-item { font-size: 8.3pt; color: #334155; text-align: justify; margin: 0 0 4px 10px; }
  .opciones { font-size: 8.3pt; color: #334155; margin: 2px 0 0 10px; line-height: 1.7; }
  .opciones span.op { display: inline-block; margin-right: 12px; }
  .firma-politica { font-size: 7.5pt; color: #64748b; margin-top: 6px; text-align: right; font-style: italic; }
</style>
</head>
<body>

  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell"><img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img"></td>
      <td class="header-title-cell">
        <div class="doc-title">Formatos y Políticas Italcol</div>
        <div class="doc-subtitle">Operación Italcol La Estrella</div>
        <div class="doc-subdetail">Inducción, emergencias y políticas del cliente</div>
      </td>
      <td class="header-meta-cell">
        <div class="meta-code">{{codigo_formato}}</div>
        <div class="meta-ver">Versión: {{version_formato}}</div>
        <div class="meta-date">{{fecha_formato}}</div>
      </td>
    </tr>
  </table>

  <div class="metrics-card">
    <div class="metric-item"><div class="metric-label">Colaborador</div><div class="metric-value">{{nombre_completo}}</div></div>
    <div class="metric-item"><div class="metric-label">Identificación</div><div class="metric-value">C.C. {{identificacion}}</div></div>
    <div class="metric-item"><div class="metric-label">Cargo</div><div class="metric-value">{{cargo}}</div></div>
    <div class="metric-item"><div class="metric-label">Operación</div><div class="metric-value">{{operacion}}</div></div>
  </div>

  <section class="statement-box ">
    <div class="statement-header">Contenido</div>
    <p class="statement-text">Este documento reúne los formatos y políticas de Italcol que el colaborador debe diligenciar y conocer para la operación. Con una sola firma quedan registrados todos.</p>
  </section>

  <section class="section-block">
    <div class="section-title">Formatos incluidos</div>
    <table class="data-grid">
      <tr><td class="data-label" style="width:8%;text-align:center">1</td><td class="data-val">Formato de Evaluación de Conocimiento (MAS-FR-GH-002 · V01)</td></tr>
      <tr><td class="data-label" style="width:8%;text-align:center">2</td><td class="data-val">Formulario de Información de Emergencias</td></tr>
      <tr><td class="data-label" style="width:8%;text-align:center">3</td><td class="data-val">Política de No Consumo de Alcohol, Tabaco y Sustancias Psicoactivas (DN-PC-GE-001 · V03)</td></tr>
      <tr><td class="data-label" style="width:8%;text-align:center">4</td><td class="data-val">Política de No Uso de Teléfonos Celulares en la Jornada de Trabajo (DN-PC-GE-001 · V03)</td></tr>
      <tr><td class="data-label" style="width:8%;text-align:center">5</td><td class="data-val">Política Sistema Integrado de Gestión Italcol (DN-PC-GE-001 · V04)</td></tr>
    </table>
  </section>

  <div class="formato-head"><span class="fh-title">1. Formato de Evaluación de Conocimiento</span><span class="fh-code">MAS-FR-GH-002 · V01</span></div>
  <div class="formato-body">
    <table class="data-grid" style="margin-bottom:9px">
      <tr><td class="data-label">Tema</td><td class="data-val">Inducción en Seguridad y Salud en el Trabajo</td></tr>
      <tr><td class="data-label">Planta</td><td class="data-val"><span class="blank" style="min-width:200px"></span></td></tr>
      <tr><td class="data-label">Empresa</td><td class="data-val">Apoyo Logístico y Operativo S.A.S.</td></tr>
    </table>
    <div class="preg"><div class="preg-t">1. Responda falso o verdadero.</div>
      <p class="preg-item">La política integral tiene como prioridad proteger la seguridad y salud de los trabajadores, mediante la planeación, implementación, verificación y mejora continua del SG-SST, identificando los peligros, evaluando y valorando los riesgos a los cuales se encuentren expuestos en su lugar de trabajo, estableciendo los controles respectivos, con el fin de establecer las acciones que contribuyan a la eliminación, reducción y prevención de incidentes, accidentes y enfermedades laborales.<br><span class="op">Falso <span class="box"></span></span> <span class="op">Verdadero <span class="box"></span></span></p>
      <p class="preg-item">La política de no consumo de alcohol, tabaco y sustancias psicoactivas establece que no se permite a ninguna persona ingresar y trabajar bajo la influencia del alcohol o sustancias psicoactivas.<br><span class="op">Falso <span class="box"></span></span> <span class="op">Verdadero <span class="box"></span></span></p>
      <p class="preg-item">La política de seguridad vial establece que el límite máximo de velocidad para vehículos en áreas de operación dentro de las instalaciones de ITALCOL DE OCCIDENTE es de 10 km/h.<br><span class="op">Falso <span class="box"></span></span> <span class="op">Verdadero <span class="box"></span></span></p>
      <p class="preg-item">La política de no uso de celulares en la jornada de trabajo determina que hacer uso de equipos electrónicos, como tablets, relojes electrónicos, entre otros, durante la jornada laboral está prohibido.<br><span class="op">Falso <span class="box"></span></span> <span class="op">Verdadero <span class="box"></span></span></p>
    </div>
    <div class="preg"><div class="preg-t">2. Marque con una X la respuesta correcta. Los EPP básicos que debo utilizar para ingresar a las áreas de producción son:</div>
      <div class="opciones"><span class="op"><span class="box"></span> a. Casco de seguridad.</span><span class="op"><span class="box"></span> b. Gafas de seguridad.</span><span class="op"><span class="box"></span> c. Protección auditiva.</span><span class="op"><span class="box"></span> d. Botas de seguridad.</span><span class="op"><span class="box"></span> e. Todas las anteriores.</span></div>
    </div>
    <div class="preg"><div class="preg-t">3. Relacione cada palabra con el número del concepto que le corresponde.</div>
      <div class="opciones" style="margin-bottom:4px"><span class="op">1. Combinación de probabilidad y severidad (consecuencia).</span><br><span class="op">2. Comportamientos que dan origen a incidentes o accidentes.</span><br><span class="op">3. Suceso repentino, por causa u ocasión del trabajo, que genera lesión.</span><br><span class="op">4. Circunstancias que pueden ocasionar incidentes o accidentes.</span><br><span class="op">5. Fuente o situación con potencial de daño.</span><br></div>
      <table class="data-grid">
      <tr><td style="width:30%"><strong>a. Peligro</strong></td><td><span class="blank" style="min-width:60px"></span></td></tr>
      <tr><td style="width:30%"><strong>b. Riesgo</strong></td><td><span class="blank" style="min-width:60px"></span></td></tr>
      <tr><td style="width:30%"><strong>c. Condición insegura</strong></td><td><span class="blank" style="min-width:60px"></span></td></tr>
      <tr><td style="width:30%"><strong>d. Acto inseguro</strong></td><td><span class="blank" style="min-width:60px"></span></td></tr>
      <tr><td style="width:30%"><strong>e. Accidente de trabajo</strong></td><td><span class="blank" style="min-width:60px"></span></td></tr>
      </table>
    </div>
    <div class="preg"><div class="preg-t">4. ¿Cuáles de los deberes hacen parte de mis responsabilidades como trabajador?</div>
      <div class="opciones"><span class="op"><span class="box"></span> a. Procurar el cuidado integral de su salud.</span><span class="op"><span class="box"></span> b. Cumplir las normas de seguridad e higiene propias de la empresa.</span><span class="op"><span class="box"></span> c. Reportar inmediatamente todo accidente de trabajo o incidente.</span><span class="op"><span class="box"></span> d. Suministrar información clara, completa y veraz sobre su estado de salud.</span><span class="op"><span class="box"></span> e. Todas las anteriores.</span></div>
    </div>
    <div class="preg"><div class="preg-t">5. Complete la palabra a la que hace referencia cada letra de la sigla PILOSO.</div>
      <table class="data-grid">
      <tr><td style="width:8%;text-align:center"><strong>P</strong></td><td><span class="blank" style="min-width:260px"></span></td></tr>
      <tr><td style="width:8%;text-align:center"><strong>I</strong></td><td><span class="blank" style="min-width:260px"></span></td></tr>
      <tr><td style="width:8%;text-align:center"><strong>L</strong></td><td><span class="blank" style="min-width:260px"></span></td></tr>
      <tr><td style="width:8%;text-align:center"><strong>O</strong></td><td><span class="blank" style="min-width:260px"></span></td></tr>
      <tr><td style="width:8%;text-align:center"><strong>S</strong></td><td><span class="blank" style="min-width:260px"></span></td></tr>
      <tr><td style="width:8%;text-align:center"><strong>O</strong></td><td><span class="blank" style="min-width:260px"></span></td></tr>
      </table>
    </div>
    <div class="preg"><div class="preg-t">6. Al activarse una alarma de emergencia debo seguir las siguientes instrucciones:</div>
      <div class="opciones"><span class="op"><span class="box"></span> a. Salir de la planta, irme para mi casa, llamar a bomberos.</span><span class="op"><span class="box"></span> b. Apagar mi equipo y estar atento a las instrucciones del líder de evacuación.</span><span class="op"><span class="box"></span> c. A y B son correctas.</span></div>
    </div>
    <div class="preg"><div class="preg-t">7. ¿Cuál es el tiempo que se debe esperar para evacuar cuando una alarma se activa?</div>
      <div class="opciones"><span class="op"><span class="box"></span> a. 0 minutos.</span><span class="op"><span class="box"></span> b. 30 segundos.</span><span class="op"><span class="box"></span> c. 1 hora.</span></div>
    </div>
    <div class="preg"><div class="preg-t">8. ¿Cuál es el lema del pilar de Protección en Acción?</div>
      <p class="preg-item"><span class="blank" style="min-width:420px"></span></p>
    </div>
    <section class="statement-box autoriza" style="margin-bottom:0">
      <div class="statement-header">Certificación</div>
      <p class="statement-text">Certifico que me ha sido divulgada y entiendo la Política de SST, los peligros y riesgos asociados al proceso productivo y los medios de control para mitigarlos. Por todo lo anterior firmo el presente documento como muestra del compromiso con mi seguridad y la de los demás, cumpliendo activamente con las normas de seguridad y todo lo expuesto en el curso de Seguridad y Salud en el Trabajo.</p>
    </section>
  </div>

  <div class="formato-head formato-break"><span class="fh-title">2. Formulario de Información de Emergencias</span></div>
  <div class="formato-body">
    <table class="data-grid" style="margin-bottom:9px">
      <tr><td class="data-label">Fecha (día / mes / año)</td><td class="data-val">{{dia_firma}} / {{mes_firma}} / {{anio_firma}}</td></tr>
      <tr><td class="data-label">Planta</td><td class="data-val"><span class="box"></span> Girardota &nbsp; <span class="box"></span> Santa Rosa de Osos &nbsp; <span class="box"></span> Yarumal</td></tr>
    </table>
    <div class="section-title">Información personal</div>
    <table class="data-grid" style="margin-bottom:9px">
      <tr><td class="data-label">Nombres y apellidos</td><td class="data-val">{{nombre_completo}}</td></tr>
      <tr><td class="data-label">Sexo</td><td class="data-val"><span class="box"></span> Masculino &nbsp; <span class="box"></span> Femenino &nbsp; <span class="box"></span> Otro</td></tr>
      <tr><td class="data-label">Nacionalidad</td><td class="data-val"><span class="blank" style="min-width:200px"></span></td></tr>
      <tr><td class="data-label">Fecha y lugar de nacimiento</td><td class="data-val"><span class="blank" style="min-width:200px"></span></td></tr>
      <tr><td class="data-label">Dirección de residencia</td><td class="data-val"><span class="blank" style="min-width:260px"></span></td></tr>
      <tr><td class="data-label">Contacto en caso de emergencia</td><td class="data-val"><span class="blank" style="min-width:200px"></span> &nbsp;Tel. <span class="blank" style="min-width:90px"></span></td></tr>
      <tr><td class="data-label">Contacto en caso de emergencia (2)</td><td class="data-val"><span class="blank" style="min-width:200px"></span> &nbsp;Tel. <span class="blank" style="min-width:90px"></span></td></tr>
    </table>
    <div class="section-title">Datos médicos</div>
    <table class="data-grid" style="margin-bottom:6px">
      <tr><td class="data-label">Grupo sanguíneo</td><td class="data-val"><span class="blank" style="min-width:80px"></span></td></tr>
      <tr><td class="data-label">Alergias</td><td class="data-val"><span class="blank" style="min-width:260px"></span></td></tr>
      <tr><td class="data-label">Condición de salud</td><td class="data-val"><span class="blank" style="min-width:260px"></span></td></tr>
    </table>
    <p class="statement-text" style="font-size:7.5pt;color:#64748b">La información suministrada por el colaborador es de uso confidencial y solo será utilizada en caso de emergencia.</p>
  </div>

  <div class="formato-head"><span class="fh-title">3. Política de No Consumo de Alcohol, Tabaco y Sustancias Psicoactivas</span><span class="fh-code">DN-PC-GE-001 · V03</span></div>
  <div class="formato-body">

    <p class="statement-text">ITALCOL ha definido y establecido una política para el no consumo de alcohol, tabaco y sustancias psicoactivas, para preservar, mejorar y conservar el bienestar de los trabajadores y su calidad de vida, logrando además un adecuado desempeño y competitividad del personal y de la empresa, así como el fomento de estilos de vida saludables, teniendo en cuenta lo establecido en la legislación vigente.</p>
    <p class="statement-text">ITALCOL es consciente de que el alcoholismo y el consumo de sustancias psicoactivas por parte de los trabajadores pueden tener efectos adversos en su capacidad de desempeño y pueden afectar considerablemente la salud y seguridad de los demás colaboradores y de terceros. Por lo anterior, ITALCOL contempla los siguientes aspectos:</p>
    <ul class="statement-list">
      <li>Está prohibido presentarse a trabajar bajo el efecto de alcohol, drogas y/o sustancias psicoactivas o que crean dependencia.</li>
      <li>Está estrictamente prohibida la posesión, consumo, distribución o venta de bebidas alcohólicas, tabaco o sustancias psicoactivas, medicamentos formulados o drogas no recetadas en el desarrollo del trabajo, dentro y fuera de las instalaciones de la empresa, dentro de los centros de trabajo o durante la prestación de servicios.</li>
      <li>ITALCOL se reserva el derecho de realizar pruebas de alcoholemia y/o de consumo de drogas ilícitas, o de convocar a terceros para que las hagan, en situaciones en que un trabajador, directamente contratado o de terceros, esté envuelto en algún accidente y/o presente características o actitudes sospechosas.</li>
    </ul>
    <p class="statement-text">La empresa se acoge a las normas, políticas y campañas que en materia de desestimulación o prohibición del consumo de tabaco, alcohol y drogas imparta el gobierno nacional.</p>
    <p class="statement-text">El alcance de esta política aplicará a nuestros trabajadores, contratistas y visitantes, y será divulgada a todo el personal.</p>
    <p class="firma-politica">Enero de 2019 — Juan Felipe Cadavid Hernández, Gerente Regional Antioquia</p>
  </div>

  <div class="formato-head formato-break"><span class="fh-title">4. Política de No Uso de Teléfonos Celulares en la Jornada de Trabajo</span><span class="fh-code">DN-PC-GE-001 · V03</span></div>
  <div class="formato-body">

    <p class="statement-text">ITALCOL es consciente de que el uso de teléfonos celulares en las áreas OPERATIVAS, tales como PRODUCCIÓN, ALMACÉN, TALLERES DE MANTENIMIENTO, VÍAS DE ACCESO, etc., puede generar distracciones y, en consecuencia, accidentes graves. Por este motivo declara la PROHIBICIÓN de la posesión y uso de teléfonos celulares y elementos distractores, tales como tablets (de uso personal) y relojes electrónicos, entre otros, durante la jornada laboral, razón por la cual establece para sus colaboradores:</p>
    <ul class="statement-list">
      <li>Realizar o recibir llamadas durante la jornada laboral en las áreas antes mencionadas queda prohibido.</li>
      <li>Enviar mensajes de texto o manipular el teléfono celular durante la jornada laboral está prohibido.</li>
      <li>Hacer uso de equipos electrónicos, como tablets (de uso personal), relojes electrónicos, entre otros, durante la jornada laboral está prohibido.</li>
      <li>La participación activa de los colaboradores en los programas de señalización y capacitación que promueven el cumplimiento de la política contra el uso de teléfonos celulares durante la jornada laboral es de obligatorio cumplimiento.</li>
      <li>Se permitirá el uso de tablets solo a personal autorizado, para fines específicos de su labor y en lugares autorizados.</li>
    </ul>
    <p class="statement-text">El incumplimiento de cualquiera de las obligaciones antes determinadas constituye una FALTA GRAVE y una violación a las obligaciones y prohibiciones que rigen los contratos de trabajo; en consecuencia, la EMPRESA podrá adoptar las medidas disciplinarias correspondientes, inclusive dar por finalizado el contrato de trabajo por justa causa de acuerdo con lo establecido en el reglamento interno de trabajo y la ley, según sea el caso.</p>
    <p class="statement-text">La empresa dispondrá de casilleros y punto de uso seguro del celular; así mismo, pondrá a disposición de los colaboradores las herramientas que se requieran para el buen desempeño de las labores, tales como cámaras, relojes de pared y/o radios.</p>
    <p class="statement-text">Esta política estará en vigencia a partir de su publicación en las instalaciones de ITALCOL y se aplicará a los colaboradores que desempeñan sus funciones laborales en las áreas OPERATIVAS y a cualquier actor (visitante, contratista o administrativo) que ingrese a estas áreas. Para los efectos de la presente política se entiende por jornada laboral el tiempo en que el trabajador presta un servicio al empleador.</p>
    <p class="firma-politica">Enero de 2019 — Juan Felipe Cadavid Hernández, Gerente Regional Antioquia</p>
  </div>

  <div class="formato-head"><span class="fh-title">5. Política Sistema Integrado de Gestión Italcol</span><span class="fh-code">DN-PC-GE-001 · V04</span></div>
  <div class="formato-body">

    <p class="statement-text">ITALCOL, dedicada a la elaboración de alimentos para animales, comercialización y almacenamiento de materias primas pecuarias en sus plantas de producción; recepción, almacenamiento y despacho de materias primas pecuarias en sus operaciones portuarias; fabricación de premezclas vitamínicas y minerales para alimentación animal; y cría de aves y cerdos, empleando materias primas nacionales e importadas, se compromete a cumplir con los requisitos internos y demás requisitos legales aplicables, así como con el mejoramiento continuo de los procesos, con estándares de calidad e inocuidad de los alimentos, contando con un grupo humano dispuesto a lograr la satisfacción de las necesidades y expectativas de nuestros colaboradores, clientes y otras partes interesadas, garantizando operaciones de comercio exterior seguras y confiables, trabajando en la mitigación de riesgos a través de toda la cadena de suministro y protegiendo así nuestras operaciones.</p>
    <p class="statement-text">Tiene como prioridad proteger la seguridad y salud de los colaboradores mediante la planeación, implementación, verificación y mejora continua del Sistema de Gestión de Seguridad y Salud en el Trabajo, identificando los peligros, evaluando y valorando los riesgos a los cuales se encuentren expuestos en su lugar de trabajo y que puedan afectar el bienestar físico, mental y social de los mismos y demás partes interesadas, mediante el establecimiento de los controles aplicables al contexto de cada centro de trabajo, con el fin de establecer las acciones que contribuyan a la eliminación, reducción y prevención de incidentes, accidentes y enfermedades laborales.</p>
    <p class="statement-text">Actúa de manera responsable con la protección del medio ambiente, buscando la prevención de la contaminación, gestionando los aspectos ambientales significativos asociados a las actividades, productos y servicios desarrollados en sus operaciones y estableciendo dentro de sus prioridades el uso racional y eficiente de los recursos naturales de mayor consumo, recursos nutricionales, gestión de gases de efecto invernadero y la reducción, reutilización y aprovechamiento de sus residuos sólidos.</p>
    <p class="statement-text">Se compromete a mejorar el desempeño energético mediante la adquisición de productos y servicios con alta eficiencia energética, diseñando o desarrollando actividades que consideren la mejora de este. Así mismo, asegura la disponibilidad de la información y los recursos para lograr los objetivos y metas energéticas, siendo factores claves para la sostenibilidad de la organización y sus partes interesadas.</p>
    <p class="statement-text">ITALCOL se compromete a asignar los recursos humanos, económicos, tecnológicos y de cualquier índole necesarios para el diseño, implementación, evaluación y mejoramiento de las actividades del Sistema Integrado de Gestión. Así mismo, a generar mecanismos para la consulta y participación de los trabajadores y sus representantes.</p>
    <p class="statement-text">Esta política se aplica y difunde en todos los centros de trabajo y a todos los niveles de la organización, y a cualquier persona que preste servicios independientemente de su forma de contratación: trabajadores directos o en misión, contratistas, subcontratistas, visitantes, asociados de negocio y todas las partes interesadas. Será revisada y actualizada acorde a los cambios normativos y legales asociados al Sistema Integrado de Gestión y al direccionamiento estratégico de ITALCOL.</p>
    <p class="firma-politica">Mayo de 2023 — Representante Legal</p>
  </div>

  <p class="lugar-fecha">Se firma en el municipio de <strong>{{municipio_firma}}</strong>, el día <strong>{{dia_firma}}</strong> del mes de <strong>{{mes_firma}}</strong> del año <strong>{{anio_firma}}</strong>.</p>

  <div class="signature-container">
    <div class="signature-card">
      <div class="sig-img-wrap">{{firma_colaborador}}</div>
      <div class="sig-line"></div>
      <div class="sig-role">Colaborador</div>
      <div class="sig-name">{{nombre_completo}}</div>
      <div class="sig-details">C.C. {{identificacion}} de {{ciudad_expedicion}}<br>{{cargo}}</div>
    </div>
  </div>

  <footer class="doc-footer">
    <span>Apoyo Logístico y Operativo S.A.S. &bull; Formatos y Políticas Italcol</span>
    <span>Certificación electrónica bajo Ley 527 de 1999</span>
    <span>Generado el {{fecha_generacion}}</span>
  </footer>

</body>
</html>
'
WHERE nombre_proceso = 'ITAL';
