-- Entrevista de Retiro (Gestión de Retiro) pasa a Maestro_Plantillas como 'entrevista_retiro', con el
-- diseño de los documentos recientes. Antes el HTML estaba dentro de src/routes/evaluacionretiro.js.
-- Ahora el código solo arma las opciones marcadas y las respuestas, y lee esta plantilla.
-- Sin código de formato (igual que Traslado): el encabezado lleva el radicado y la fecha de la entrevista.
-- Ejecutar ANTES de desplegar el código nuevo (el código anterior no lee esta fila, así que no cambia nada).
-- HTML también en migraciones/plantillas/entrevista_retiro.html. Solo agrega una fila; se puede ejecutar
-- más de una vez. Las entrevistas ya diligenciadas se actualizan con "Regenerar documentos".

INSERT INTO Maestro_Plantillas
  (nombre_proceso, tabla_datos, id_campo_fk, bucket_carpeta, requiere_firma_trabajador, activo, version, ultima_actualizacion, contenido_html)
SELECT 'entrevista_retiro', 'Maestro_evaluacionretiro', 'id_evaluacion', 'talenthub_central', 0, 1, 1, NOW(), '<style>
  /* Estilos encerrados en .evr. Las opciones y respuestas las arma src/routes/evaluacionretiro.js. */
  .evr { font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif; color: #0f172a; font-size: 9.6pt; line-height: 1.5; -webkit-font-smoothing: antialiased; }
  .evr * { box-sizing: border-box; }
  .evr p { margin: 0 0 8px 0; text-align: justify; }

  .evr .doc-header-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; border: 1px solid #cbd5e1; }
  .evr .doc-header-table td { border: 1px solid #cbd5e1; vertical-align: middle; }
  .evr .header-logo-cell { width: 24%; text-align: center; padding: 8px 10px; background: #ffffff; }
  .evr .logo-img { height: 46px; max-width: 170px; object-fit: contain; display: block; margin: 0 auto; }
  .evr .header-title-cell { width: 56%; background: #e6edf7; text-align: center; padding: 10px 14px; }
  .evr .doc-title { font-size: 11pt; font-weight: 800; color: #000b59; letter-spacing: 0.4px; text-transform: uppercase; line-height: 1.25; }
  .evr .doc-subtitle { font-size: 8pt; font-weight: 700; color: #c2410c; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.3px; }
  .evr .doc-subdetail { font-size: 7pt; color: #475569; font-weight: 600; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.2px; }
  .evr .header-meta-cell { width: 20%; padding: 6px 10px; font-size: 8pt; text-align: center; background: #f8fafc; color: #1e293b; line-height: 1.35; }
  .evr .meta-code { font-weight: 800; color: #000b59; font-size: 8.5pt; }
  .evr .meta-ver { color: #334155; }
  .evr .meta-date { color: #64748b; font-size: 7.5pt; }

  .evr .addressee { text-align: center; font-size: 10pt; font-weight: 800; color: #000b59; letter-spacing: 1px; text-transform: uppercase; margin: 6px 0 14px 0; }
  .evr .addressee::after { content: ''''; display: block; width: 46px; height: 3px; background: #f55400; border-radius: 2px; margin: 6px auto 0 auto; }

  .evr .metrics-card { display: table; width: 100%; table-layout: fixed; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin: 4px 0 14px 0; }
  .evr .metric-item { display: table-cell; padding: 10px 14px; border-right: 1px solid #e2e8f0; vertical-align: top; }
  .evr .metric-item:last-child { border-right: none; }
  .evr .metric-label { font-size: 7.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .evr .metric-value { font-size: 10pt; font-weight: 700; color: #000b59; }
  .evr .metric-value-primary { font-size: 10pt; font-weight: 800; color: #f55400; }

  .evr .section-block { margin-bottom: 14px; }
  .evr .section-title { font-size: 8.5pt; font-weight: 700; color: #000b59; text-transform: uppercase; letter-spacing: 0.6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; margin-bottom: 8px; }
  .evr .section-title::before { content: ''''; display: inline-block; width: 4px; height: 12px; background: #f55400; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }

  .evr .data-grid { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 9pt; }
  .evr .data-grid td { padding: 7px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .evr .data-grid tr:last-child td { border-bottom: none; }
  .evr .data-grid tr:nth-child(even) td { background: #fafafa; }
  .evr .data-label { width: 28%; font-weight: 700; color: #64748b; border-right: 1px solid #f1f5f9; }
  .evr .data-val { font-weight: 600; color: #0f172a; }

  .evr .note-box { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3.5px solid #000b59; border-radius: 6px; padding: 9px 12px; margin: 4px 0 14px 0; }
  .evr .note-box p { margin: 0 0 4px 0; font-size: 9pt; color: #334155; }
  .evr .note-box p:last-child { margin-bottom: 0; }
  .evr .note-box strong { color: #000b59; }

  .evr .sig-table { width: 100%; border-collapse: collapse; margin-top: 4px; page-break-inside: avoid; }
  .evr .sig-table td { width: 50%; vertical-align: top; text-align: center; padding: 0 14px; }
  .evr .sig-table td:first-child { padding-left: 0; }
  .evr .sig-table td:last-child { padding-right: 0; }
  .evr .sig-role { font-size: 7.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; margin-bottom: 4px; }
  .evr .sig-img-wrap { height: 96px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px; }
  .evr .sig-img-wrap img { max-height: 84px; max-width: 230px; margin: 0 auto !important; }
  .evr .sig-line { border-top: 1.5px solid #000b59; margin-bottom: 5px; }
  .evr .sig-name { font-size: 9pt; font-weight: 700; color: #000b59; text-transform: uppercase; }
  .evr .sig-details { font-size: 7.5pt; color: #64748b; line-height: 1.35; }

  .evr .doc-footer { margin-top: 22px; text-align: center; }
  .evr .doc-footer .line { height: 2px; background: #f55400; border-radius: 1px; margin-bottom: 7px; }
  .evr .doc-footer .addr { color: #000b59; font-size: 7.5pt; line-height: 1.4; letter-spacing: 0.3px; }
  .evr .doc-footer .legal { color: #94a3b8; font-size: 6.8pt; margin-top: 2px; }
  .evr .data-grid .data-label { width: 18%; }
  .evr .data-grid .data-val { width: 32%; border-right: 1px solid #f1f5f9; }
  .evr .data-grid .data-val:last-child { border-right: none; }
  .evr .meta-id { margin-top: 2px; font-size: 8pt; color: #000b59; font-weight: 800; letter-spacing: 0.4px; }
  .evr .q-table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 8.4pt; }
  .evr .q-table td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .evr .q-table tr:last-child td { border-bottom: none; }
  .evr .q-table tr:nth-child(even) td { background: #fafafa; }
  .evr .q-table td.q { width: 36%; font-weight: 600; color: #334155; }
  .evr .opt { display: inline-block; padding: 2px 9px; margin: 2px 4px 2px 0; border-radius: 10px; border: 1px solid #e2e8f0; color: #94a3b8; font-size: 7.8pt; background: #ffffff; }
  .evr .opt-sel { border-color: #000b59; background: #000b59; color: #ffffff; font-weight: 700; }
  .evr .opt-otro { font-style: italic; }
  .evr .answer { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3.5px solid #000b59; border-radius: 6px; padding: 7px 12px; font-size: 8.8pt; color: #0f172a; white-space: pre-line; margin: 3px 0 9px 0; }
  .evr .answer-empty { color: #94a3b8; font-style: italic; }
  .evr .q-open { font-size: 8.4pt; font-weight: 700; color: #334155; }
  .evr .section-block { page-break-inside: avoid; }
  .evr .data-grid { font-size: 8.4pt; }
  .evr .data-grid td { padding: 4px 10px; }
  .evr .data-grid .data-label { width: 17%; white-space: nowrap; }
  .evr .section-block { margin-bottom: 9px; }
  .evr .section-title { margin-bottom: 5px; }
  .evr .q-table td { padding: 3px 10px; }
  .evr .opt { padding: 1px 8px; margin: 1px 3px 1px 0; }
  .evr .answer { padding: 5px 12px; margin: 2px 0 6px 0; }
  .evr .doc-header-table { margin-bottom: 10px; }
  .evr .doc-footer { margin-top: 12px; }
</style>

<div class="evr">

  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell"><img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img"></td>
      <td class="header-title-cell">
        <div class="doc-title">Entrevista de retiro</div>
        <div class="doc-subtitle">Gestión de Talento Humano</div>
        <div class="doc-subdetail">Percepción del colaborador sobre su experiencia en la empresa</div>
      </td>
      <td class="header-meta-cell">
        <div class="meta-code">RADICADO</div>
        <div class="meta-id">N° {{radicado}}</div>
        <div class="meta-date">{{fecha_entrevista}}</div>
      </td>
    </tr>
  </table>

  <section class="section-block">
    <div class="section-title">Datos del colaborador</div>
    <table class="data-grid">
      <tr>
        <td class="data-label">Nombre:</td><td class="data-val"><strong>{{nombre_trabajador}}</strong></td>
        <td class="data-label">Cédula:</td><td class="data-val">{{identificacion}}</td>
      </tr>
      <tr>
        <td class="data-label">Cargo:</td><td class="data-val">{{cargo}}</td>
        <td class="data-label">Operación:</td><td class="data-val">{{operacion}}</td>
      </tr>
      <tr>
        <td class="data-label">Fecha de ingreso:</td><td class="data-val">{{fecha_ingreso}}</td>
        <td class="data-label">Fecha de retiro:</td><td class="data-val">{{fecha_retiro}}</td>
      </tr>
      <tr>
        <td class="data-label">Motivo del retiro:</td><td class="data-val" colspan="3">{{motivo_retiro}}</td>
      </tr>
    </table>
  </section>

  <section class="section-block">
    <div class="section-title">1. Motivo principal de retiro</div>
    <div>{{q_motivo_principal}}</div>
  </section>

  <section class="section-block">
    <div class="section-title">2. Experiencia en la empresa</div>
    <table class="q-table">
      <tr><td class="q">2.1. Relación con compañeros de trabajo</td><td>{{q_relacion_companeros}}</td></tr>
      <tr><td class="q">2.2. Relación con jefe inmediato</td><td>{{q_relacion_jefe}}</td></tr>
      <tr><td class="q">2.3. Claridad en funciones y responsabilidades</td><td>{{q_claridad_funciones}}</td></tr>
      <tr><td class="q">2.4. Condiciones de trabajo (herramientas, equipos, instalaciones)</td><td>{{q_condiciones_trabajo}}</td></tr>
    </table>
  </section>

  <section class="section-block">
    <div class="section-title">3. Remuneración y beneficios</div>
    <table class="q-table">
      <tr><td class="q">3.1. Sueldo percibido</td><td>{{q_satisfaccion_sueldo}}</td></tr>
      <tr><td class="q">3.2. Beneficios adicionales (bonos, auxilios, reconocimientos)</td><td>{{q_satisfaccion_beneficios}}</td></tr>
    </table>
  </section>

  <section class="section-block">
    <div class="section-title">4. Desarrollo y capacitación</div>
    <table class="q-table">
      <tr><td class="q">4.1. Oportunidades de formación y capacitación</td><td>{{q_oportunidad_formacion}}</td></tr>
      <tr><td class="q">4.2. Oportunidades de crecimiento y ascenso</td><td>{{q_oportunidad_crecimiento}}</td></tr>
    </table>
  </section>

  <section class="section-block">
    <div class="section-title">5. Recomendaciones y percepción final</div>
    <div class="q-open">5.1. ¿Qué fue lo que más valoró de trabajar en la empresa?</div>
    <div class="answer">{{valoracion_principal}}</div>
    <div class="q-open">5.2. ¿Qué aspectos considera que se deben mejorar?</div>
    <div class="answer">{{aspectos_mejorar}}</div>
    <table class="q-table" style="margin-bottom:9px">
      <tr><td class="q">5.3. ¿Recomendaría la empresa a otras personas para trabajar?</td><td>{{q_recomienda_empresa}}</td></tr>
    </table>
    <div class="q-open">5.4. Comentarios adicionales:</div>
    <div class="answer">{{comentarios_adicionales}}</div>
  </section>

  <div class="doc-footer">
    <div class="line"></div>
    <div class="addr">DIAGONAL 74B No. 33° 51-55 — ANTIGUA TRANSVERSAL 39° No 70° 51-55 — LAURELES - MEDELLÍN</div>
    <div class="legal">Apoyo Logístico y Operativo S.A.S. &bull; Documento electrónico — Ley 527 de 1999</div>
  </div>

</div>
'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Plantillas WHERE nombre_proceso = 'entrevista_retiro');

SELECT id_plantilla, nombre_proceso, version, activo, LENGTH(contenido_html) AS largo FROM Maestro_Plantillas WHERE nombre_proceso = 'entrevista_retiro';
