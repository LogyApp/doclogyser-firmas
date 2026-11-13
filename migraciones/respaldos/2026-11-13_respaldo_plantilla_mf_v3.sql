-- Respaldo de la plantilla MF versión 3 (contenido fijo del Auxiliar logístico), antes de 2026-11-13_plantilla_mf_por_cargo.sql.
-- Para volver a ella: ejecutar este UPDATE.
UPDATE Maestro_Plantillas SET version = 3, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
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
' WHERE nombre_proceso = 'MF';
