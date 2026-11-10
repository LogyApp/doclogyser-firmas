-- Reporte inicial de condiciones de salud (CS, Id 20): figura del cuerpo interactiva.
-- 1. Las 13 preguntas del segmento corporal pasan del tipo 'marcas' al tipo 'cuerpo':
--    el aspirante toca la zona en la figura y marca fractura/amputación o esguince/dolor;
--    en el PDF sale la figura pintada junto a la tabla. Las respuestas se guardan igual que antes.
--    Para volver a la tabla sola basta con dejar el tipo en 'marcas'.
-- 2. Plantilla CS más compacta (todo cabe en 2 páginas), instrucción de la figura y más espacio
--    para la firma. HTML también en migraciones/plantillas/CS.html.
-- Se puede ejecutar más de una vez. Los documentos ya firmados se actualizan con REGENERAR.

UPDATE Config_Formulario_Preguntas
SET tipo = 'cuerpo'
WHERE id_config_doc = 20 AND codigo LIKE 'seg\_%' AND tipo = 'marcas';

UPDATE Maestro_Plantillas
SET version = 3,
    ultima_actualizacion = NOW(),
    contenido_html = '<!DOCTYPE html>
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
  .q-table td { padding: 3.5px 6px; border: 1px solid #e2e8f0; vertical-align: middle; color: #334155; }
  .q-table tr:nth-child(even) td { background: #fafafa; }
  .q-table tr { page-break-inside: avoid; }
  .q-table .c { text-align: center; white-space: nowrap; }
  .box { display: inline-block; width: 10px; height: 10px; border: 1px solid #64748b; border-radius: 2px; vertical-align: middle; margin: 0 2px 0 6px; }
  .blank { display: inline-block; min-width: 90px; border-bottom: 1px solid #94a3b8; height: 11px; vertical-align: bottom; }

  .lugar-fecha { font-size: 8.5pt; color: #334155; margin: 6px 0 4px; }
  .lugar-fecha strong { color: #000b59; }

  .signature-container { margin-top: 18px; page-break-inside: avoid; }
  .signature-card { width: 46%; margin: 0 auto; text-align: center; }
  .sig-img-wrap { height: 86px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
  .sig-img-wrap img { max-height: 70px; max-width: 240px; object-fit: contain; }
  .sig-line { border-top: 1.5px solid #000b59; margin-bottom: 5px; }
  .sig-role { font-size: 7.5pt; font-weight: 700; color: #c2410c; text-transform: uppercase; letter-spacing: 0.3px; }
  .sig-name { font-size: 9pt; font-weight: 700; color: #000b59; text-transform: uppercase; }
  .sig-details { font-size: 7.5pt; color: #64748b; line-height: 1.35; }

  .doc-footer { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 5px; display: flex; justify-content: space-between; gap: 10px; font-size: 7pt; color: #94a3b8; page-break-inside: avoid; }
  /* Compacto: el formulario completo y la firma caben en dos páginas */
  .doc-header-table, .metrics-card { margin-bottom: 9px; }
  .statement-box { padding: 7px 11px; margin-bottom: 9px; }
  .statement-text { line-height: 1.38; margin-bottom: 4px; }
  .section-block { margin-bottom: 9px; }
  .section-title { margin-bottom: 6px; }
  .data-grid td { padding: 4px 8px; }
  .q-table { font-size: 7.6pt; }
  .q-table td { padding: 2.5px 5px; line-height: 1.3; }
  .q-table th { padding: 4px 5px; }
  .signature-container { margin-top: 10px; }
  .doc-footer { margin-top: 10px; }
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
    <p class="statement-text">En la figura y en la tabla se marca el segmento corporal en el que ha presentado fractura o amputación (rojo) y el segmento en el que ha presentado esguince o dolor en los últimos 6 meses (ámbar).</p>
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
