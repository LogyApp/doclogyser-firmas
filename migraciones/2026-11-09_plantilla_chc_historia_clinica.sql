-- Consentimiento CHC (Id 16): pasa al formato físico TH-R-025 v1
-- "Autorización para el acceso a historia clínica y tratamiento de datos personales".
-- Antes tenía, por error, el texto del consentimiento de prueba de alcohol y sustancias (SST-FM-036).
-- Diseño moderno (mismo estilo de Cesantías y SST), en una sola página con la huella de la firma.
-- HTML también en migraciones/plantillas/CHC.html. Se puede ejecutar más de una vez.
-- Después de ejecutarlo, los documentos ya firmados se actualizan con REGENERAR en el Panel Admin.

UPDATE Maestro_Plantillas
SET version = 3,
    codigo_formato = 'TH-R-025',
    version_formato = '1',
    ultima_actualizacion = NOW(),
    contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Autorización acceso a historia clínica — LOG&amp;SER</title>
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

  .metrics-card { margin-bottom: 10px; }
  .statement-box { padding: 8px 12px; margin-bottom: 9px; }
  .statement-text, .statement-list { line-height: 1.38; }
  .statement-list li { margin-bottom: 2px; }
  .signature-container { margin-top: 8px; }
  .sig-img-wrap { height: 64px; }
  .doc-footer { margin-top: 10px; }
</style>
</head>
<body>

  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell"><img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img"></td>
      <td class="header-title-cell">
        <div class="doc-title">Acceso a Historia Clínica</div>
        <div class="doc-subtitle">Autorización y tratamiento de datos personales</div>
        <div class="doc-subdetail">Gestión del Talento Humano — Ley 1581 de 2012</div>
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
    <table class="data-grid" style="margin-bottom:10px">
      <tr><td class="data-label">Señores:</td><td class="data-val">{{eps}}</td></tr>
      <tr><td class="data-label">Asunto:</td><td class="data-val">Autorización de acceso a historia clínica y tratamiento de datos personales</td></tr>
    </table>

  <section class="statement-box autoriza">
    <div class="statement-header">Autorización</div>
    <p class="statement-text">Cordial saludo.</p>
    <p class="statement-text">Por medio de la suscripción de la presente autorización de tratamiento de datos personales, yo, <strong>{{nombre_completo}}</strong>, identificado(a) con cédula de ciudadanía o documento número <strong>{{identificacion}}</strong>, en mi calidad de empleado(a) o aspirante en proceso de selección, manifiesto que <strong>AUTORIZO</strong> a la empresa APOYO LOGÍSTICO Y OPERATIVO S.A.S. para que acceda de forma permanente a mi historia clínica médica y/u odontológica y efectúe el tratamiento (recolección, almacenamiento, uso, circulación o supresión) de mis datos personales que se deriven directamente del desarrollo de mis funciones o que, en mi calidad de aspirante, tengan relación directa con el proceso de selección y el ejercicio del cargo de <strong>{{cargo}}</strong> al que aspiro ser contratado(a).</p>
    <p class="statement-text">Esta autorización la otorgo teniendo en cuenta la regulación vigente sobre la protección de datos personales: Ley 1266 de 2008, Ley 1581 de 2012, Decreto 1074 de 2015 y demás normas que la modifiquen, complementen o sustituyan.</p>
  </section>

  <section class="statement-box ">
    <div class="statement-header">Derechos del titular</div>
    <p class="statement-text">Como titular de los datos personales, declaro conocer mis derechos de aclaración, eliminación, corrección y actualización de estos, así como las demás condiciones establecidas en la Ley 1581 de 2012, que he leído previamente, dentro de las cuales se encuentran:</p>
    <ul class="statement-list">
      <li>Acceder en forma gratuita a los datos proporcionados que hayan sido objeto de tratamiento.</li>
      <li>Solicitar la actualización y rectificación de mi información frente a datos parciales, inexactos, incompletos, fraccionados, que induzcan a error, o aquellos cuyo tratamiento esté prohibido o no haya sido autorizado.</li>
      <li>Solicitar prueba de la autorización otorgada.</li>
      <li>Presentar ante la Superintendencia de Industria y Comercio (SIC) quejas por infracciones a lo dispuesto en la normatividad vigente.</li>
      <li>Revocar la autorización y/o solicitar la supresión del dato, a menos que exista un deber legal o contractual que haga imperativo conservar la información.</li>
      <li>Abstenerme de responder las preguntas sobre datos sensibles o sobre datos de niñas, niños y adolescentes.</li>
    </ul>
    <p class="statement-text" style="margin-top:6px;color:#000b59">Acepto la finalidad antes indicada: <strong>{{resp_acepta_finalidad}}</strong></p>
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
    <span>Apoyo Logístico y Operativo S.A.S. &bull; Autorización Acceso a Historia Clínica y Tratamiento de Datos</span>
    <span>Certificación electrónica bajo Ley 527 de 1999</span>
    <span>Generado el {{fecha_generacion}}</span>
  </footer>

</body>
</html>
'
WHERE nombre_proceso = 'CHC';
