-- Autorización para el tratamiento de datos personales (TD): ajustes frente al físico TH-R-008 v2.
-- - Título como el formato físico: "Política para la autorización, tratamiento de datos personales
--   y aviso de privacidad"; subtítulo "Autorización para el tratamiento de datos personales".
-- - Se quita la frase repetida ("Es de carácter facultativo...") del punto 1 y la frase
--   "Mis derechos como titular..." deja de estar pegada al punto 2 (queda como introducción).
-- - Punto 8 numerado como en el físico.
-- - Diseño compacto: el texto, el lugar y fecha, la firma y la huella caben en una sola página
--   (antes la firma quedaba sola en la página 2, separada del "Se firma en el municipio de...").
-- HTML también en migraciones/plantillas/TD.html. Se puede ejecutar más de una vez.
-- Los documentos ya firmados se actualizan con REGENERAR.

UPDATE Maestro_Plantillas
SET version = 3,
    ultima_actualizacion = NOW(),
    contenido_html = '<!DOCTYPE html>
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
  /* Compacto: el documento y la firma caben en una página */
  .doc-header-table, .metrics-card { margin-bottom: 7px; }
  .statement-box { padding: 6px 11px; margin-bottom: 6px; }
  .statement-text { line-height: 1.38; margin-bottom: 4px; }
  .section-block { margin-bottom: 8px; }
  .section-title { margin-bottom: 4px; padding-bottom: 3px; }
  .doc-title { font-size: 10pt; }
  .rule-list li { padding: 3px 8px 3px 30px; margin-bottom: 2px; line-height: 1.33; font-size: 8pt; }
  .autoriza .statement-text { font-size: 8pt; line-height: 1.33; }
  .rule-list li::before { top: 3px; width: 16px; height: 16px; line-height: 16px; left: 7px; }
  .intro-derechos { font-size: 8pt; color: #334155; margin: 0 0 4px; }
  .bloque-firma { page-break-inside: avoid; }
  .metric-item { padding: 6px 12px; }
  .lugar-fecha { margin: 4px 0 2px; }
  .signature-container { margin-top: 4px; }
  .sig-img-wrap { height: 86px; }
  .doc-footer { margin-top: 6px; }
</style>
</head>
<body>

  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell"><img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img"></td>
      <td class="header-title-cell">
        <div class="doc-title">Política para la autorización, tratamiento de datos personales y aviso de privacidad</div>
        <div class="doc-subtitle">Autorización para el tratamiento de datos personales</div>
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

  <p class="intro-derechos" style="font-weight:600;color:#0f172a">Con la firma de este documento manifiesto que he sido informado(a) por APOYO LOGÍSTICO Y OPERATIVO S.A.S. de lo siguiente:</p>

  <section class="section-block">
    <div class="section-title">Información y derechos del titular</div>
    <ol class="rule-list">
      <li>La Compañía actúa como responsable del tratamiento de datos personales del titular de acuerdo con lo establecido en la Ley 1581 de 2012 de habeas data, y conjunta o separadamente podrá recolectar, usar y tratar mis datos personales conforme a la Política de Tratamiento de Datos de la Compañía, que se encuentra disponible en el área de Talento Humano.</li>
      <li>Es de carácter facultativo responder las preguntas sobre datos sensibles o sobre niñas, niños y adolescentes.</li>
    </ol>
    <p class="intro-derechos" style="margin-top:5px">Mis derechos como titular de los datos son los previstos en la Constitución y la ley, especialmente los siguientes:</p>
    <ol class="rule-list" start="3" style="counter-reset: regla 2">
      <li>Derecho a conocer, actualizar y rectificar mis datos personales frente a los responsables o encargados del tratamiento, así como a revocar el consentimiento otorgado. Este derecho se podrá ejercer, entre otros, frente a datos parciales, inexactos, incompletos, fraccionados, que induzcan a error, o aquellos cuyo tratamiento esté expresamente prohibido o no haya sido autorizado, a través de los canales gratuitos dispuestos por la Compañía y observando la Política de Tratamiento de Datos Personales de APOYO LOGÍSTICO Y OPERATIVO S.A.S.</li>
      <li>Derecho a solicitar prueba de la autorización otorgada al responsable del tratamiento, salvo cuando expresamente se exceptúe como requisito para el tratamiento.</li>
      <li>Derecho a ser informado por el responsable o el encargado del tratamiento, previa solicitud, respecto del uso que se ha dado a mis datos personales.</li>
      <li>Derecho a revocar la autorización y/o solicitar la supresión del dato cuando en el tratamiento no se respeten los principios, derechos y garantías constitucionales y legales.</li>
      <li>Derecho a acceder en forma gratuita a mis datos personales que hayan sido objeto de tratamiento, en los términos establecidos en la Ley 1581 de 2012 y las demás normas que la modifiquen, adicionen o complementen. Para cualquier inquietud o información adicional relacionada con el tratamiento de datos personales, puedo contactarme al correo electrónico <strong>directora.th@logyser.com</strong>.</li>
    </ol>
  </section>

  <section class="statement-box autoriza">
    <div class="statement-header">8. Aceptación de la Política de Tratamiento de Datos Personales</div>
    <p class="statement-text">El trabajador, al firmar este documento, declara que ha leído y comprendido en su totalidad la <strong>Política de Tratamiento de Datos Personales</strong> de <strong>APOYO LOGÍSTICO Y OPERATIVO S.A.S.</strong> (en adelante <strong>LOG&amp;SER</strong>), la cual ha sido proporcionada para su revisión. El trabajador acepta y consiente el tratamiento de sus datos personales de acuerdo con los términos y condiciones establecidos en dicha política.</p>
    <p class="statement-text">El trabajador entiende que la Política de Tratamiento de Datos Personales detalla cómo LOG&amp;SER recopila, utiliza, almacena y protege la información personal, así como los derechos y procedimientos relacionados con la protección de datos. Asimismo, reconoce que tiene acceso a la política en cualquier momento y puede solicitar aclaraciones o ejercer sus derechos de acceso, corrección, actualización o eliminación de datos conforme a lo dispuesto en la política y la legislación aplicable.</p>
    <p class="statement-text">Al firmar este documento, el trabajador otorga su consentimiento explícito para el tratamiento de sus datos personales conforme a las finalidades descritas en la política.</p>
  </section>

  <div class="bloque-firma">
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
