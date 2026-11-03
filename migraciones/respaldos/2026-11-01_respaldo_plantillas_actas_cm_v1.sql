-- RESPALDO de las plantillas de actas de Casos Médicos (versión 1, diseño anterior) antes de
-- pasarlas al diseño moderno (generado el 2026-11-01). NO es una migración: solo se ejecuta si hay
-- que volver al diseño anterior.

UPDATE Maestro_Plantillas SET version = 1, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  :root {
    --navy:#1B2A5E; --orange:#F15A22; --orange-lt:#FEF0EA;
    --bg:#F4F6FB; --border:#E2E7F0; --text:#0F1C3F; --text-mid:#5A6A8A; --green:#16A34A;
  }
  * { box-sizing: border-box; }
  body { font-family: "Plus Jakarta Sans", Arial, sans-serif; font-size:9.5pt; color:var(--text); margin:0; padding:28px 36px; background:#fff; line-height: 1.45; }
  .header { text-align:center; margin-bottom:6px; }
  .header img { max-width:170px; }
  .doc-version { text-align:center; font-size:7.5pt; color:var(--text-mid); letter-spacing:.5px; text-transform:uppercase; margin:4px 0 12px; }
  .title { text-align:center; font-size:15pt; font-weight:800; color:var(--navy); letter-spacing:.5px; margin:0; }
  .subtitle { text-align:center; font-size:9.5pt; font-weight:700; color:var(--orange); text-transform:uppercase; margin:4px 0 14px; }
  .acta-banner { background:var(--navy); color:#fff; text-align:center; font-weight:700; font-size:11.5pt; border-radius:8px; padding:9px 0; margin-bottom:16px; letter-spacing:.5px; }
  .acta-banner span { color:#FFB199; }
  .section-title { font-size:9pt; font-weight:800; color:var(--navy); text-transform:uppercase; letter-spacing:.5px; margin:14px 0 6px; }
  .info-grid { display:flex; gap:16px; margin-bottom:14px; align-items:stretch; }
  .info-card { flex:1; background:var(--bg); border:1px solid var(--border); border-radius:10px; padding:12px 16px; }
  .info-row { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border); font-size:8.8pt; }
  .info-row:last-child { border-bottom:none; }
  .info-label { color:var(--text-mid); font-weight:600; }
  .info-value { font-weight:700; color:var(--text); text-align:right; }
  .clausula { background:var(--orange-lt); border-left:4px solid var(--orange); border-radius:8px; padding:12px 14px; margin-bottom:14px; }
  .clausula-title { font-size:8.5pt; font-weight:800; color:var(--orange); text-transform:uppercase; margin-bottom:4px; }
  .clausula-text { font-size:8.5pt; color:var(--text); line-height:1.5; text-align:justify; }
  .diag-box { background:#EFF6FF; border:1px solid #BFDBFE; border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:8.8pt; color:#1E40AF; }
  .firma-block { border:1px dashed var(--border); border-radius:10px; padding:16px; text-align:center; margin:18px auto 14px; max-width:380px; page-break-inside:avoid; }
  .firma-block img { max-height:85px; max-width:260px; display:block; margin:0 auto; }
  .firma-line { border-top:1px solid var(--text); width:260px; margin:6px auto 4px; padding-top:6px; font-size:8.5pt; font-weight:700; }
  .firma-check { color:var(--green); font-size:7.5pt; font-weight:700; }
  .footer { display:flex; justify-content:space-between; border-top:1px solid var(--border); padding-top:8px; font-size:7.5pt; color:var(--text-mid); margin-top:16px; }
  .footer .brand { color:var(--orange); font-weight:800; }
</style>
</head>
<body>
  <div class="header">
    <img src="https://storage.googleapis.com/logyser-recursos-corporativos/Imagenes/Logyser_sin_Nit.png" alt="LOG&SER">
  </div>
  <div class="doc-version">SST-R-094 Versión 1</div>

  <p class="title">Acta de Apertura de Caso Médico</p>
  <p class="subtitle">Seguridad y Salud en el Trabajo</p>

  <div class="acta-banner">CASO MÉDICO No. <span>{{codigo_caso}}</span></div>

  <div class="info-grid">
    <div class="info-card">
      <div class="info-row"><span class="info-label">Colaborador</span><span class="info-value">{{nombre_trabajador}}</span></div>
      <div class="info-row"><span class="info-label">Cédula</span><span class="info-value">{{identificacion}}</span></div>
      <div class="info-row"><span class="info-label">Cargo</span><span class="info-value">{{cargo}}</span></div>
      <div class="info-row"><span class="info-label">Regional / Operación</span><span class="info-value">{{regional}} / {{operacion}}</span></div>
      <div class="info-row"><span class="info-label">Fecha de Ingreso</span><span class="info-value">{{fecha_ingreso}}</span></div>
      <div class="info-row"><span class="info-label">EPS / AFP</span><span class="info-value">{{eps}} / {{afp}}</span></div>
    </div>
    <div class="info-card">
      <div class="info-row"><span class="info-label">Tipo de Caso</span><span class="info-value">{{tipo_caso}}</span></div>
      <div class="info-row"><span class="info-label">Tipo de Evento</span><span class="info-value">{{tipo_evento}}</span></div>
      <div class="info-row"><span class="info-label">Fecha Evento</span><span class="info-value">{{fecha_evento}}</span></div>
      <div class="info-row"><span class="info-label">Días Incapacidad</span><span class="info-value">{{dias_incapacidad}}</span></div>
      <div class="info-row"><span class="info-label">% PCL</span><span class="info-value">{{pcl_porcentaje}}</span></div>
      <div class="info-row"><span class="info-label">Vigencia Recomendaciones</span><span class="info-value">{{periodo_recomendaciones}}</span></div>
    </div>
  </div>

  <div class="diag-box">
    <strong>🩺 Diagnóstico Principal (CIE-10):</strong> [{{diagnostico_cod}}] {{diagnostico_desc}}
  </div>

  <div class="clausula">
    <div class="clausula-title">Recomendaciones y Restricciones Médicas / Laborales</div>
    <div class="clausula-text">{{recomendaciones}}</div>
  </div>

  <div class="clausula">
    <div class="clausula-title">Compromiso y Notificación de Apertura</div>
    <div class="clausula-text">
      Por medio de la presente, el colaborador y el área de Seguridad y Salud en el Trabajo (SST) de LOG&SER dejan constancia formal de la apertura del presente caso médico, así como del pleno conocimiento y acatamiento de las indicaciones y restricciones médicas emitidas por los profesionales tratantes. El colaborador se compromete a asistir puntualmente a sus valoraciones médicas, cumplir los tratamientos indicados, abstenerse de realizar labores contrarias a sus recomendaciones ocupacionales y reportar cualquier novedad en su estado de salud de manera oportuna a su jefatura inmediata y al área de SST.
    </div>
  </div>

  <div class="info-grid" style="margin-bottom:8px;">
    <div class="info-card">
      <div class="info-row"><span class="info-label">Responsable SST</span><span class="info-value">{{responsable_sst}}</span></div>
    </div>
    <div class="info-card">
      <div class="info-row"><span class="info-label">Responsable Operación</span><span class="info-value">{{responsable_operacion}}</span></div>
    </div>
  </div>

  <div class="firma-block">
    {{firma_trabajador}}
    <div class="firma-line">Firma del Colaborador</div>
    <div style="font-size:7.5pt; color:var(--text-mid); margin-top:2px;">C.C. {{identificacion}}</div>
    <div class="firma-check">Documento firmado digitalmente</div>
  </div>

  <div class="footer">
    <span>Registrado por: {{usuario_registro}}</span>
    <span>Fecha registro: {{fecha_registro}}</span>
    <span class="brand">LogyApp SST</span>
  </div>
</body>
</html>'
WHERE nombre_proceso = 'acta_apertura_cm';

UPDATE Maestro_Plantillas SET version = 1, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  :root {
    --navy:#1B2A5E; --orange:#F15A22; --orange-lt:#FEF0EA;
    --bg:#F4F6FB; --border:#E2E7F0; --text:#0F1C3F; --text-mid:#5A6A8A; --green:#16A34A;
  }
  * { box-sizing: border-box; }
  body { font-family: "Plus Jakarta Sans", Arial, sans-serif; font-size:9.5pt; color:var(--text); margin:0; padding:28px 36px; background:#fff; line-height: 1.45; }
  .header { text-align:center; margin-bottom:6px; }
  .header img { max-width:170px; }
  .doc-version { text-align:center; font-size:7.5pt; color:var(--text-mid); letter-spacing:.5px; text-transform:uppercase; margin:4px 0 12px; }
  .title { text-align:center; font-size:15pt; font-weight:800; color:var(--navy); letter-spacing:.5px; margin:0; }
  .subtitle { text-align:center; font-size:9.5pt; font-weight:700; color:var(--orange); text-transform:uppercase; margin:4px 0 14px; }
  .acta-banner { background:var(--navy); color:#fff; text-align:center; font-weight:700; font-size:11.5pt; border-radius:8px; padding:9px 0; margin-bottom:16px; letter-spacing:.5px; }
  .acta-banner span { color:#FFB199; }
  .section-title { font-size:9pt; font-weight:800; color:var(--navy); text-transform:uppercase; letter-spacing:.5px; margin:14px 0 6px; }
  .info-grid { display:flex; gap:16px; margin-bottom:14px; align-items:stretch; }
  .info-card { flex:1; background:var(--bg); border:1px solid var(--border); border-radius:10px; padding:12px 16px; }
  .info-row { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border); font-size:8.8pt; }
  .info-row:last-child { border-bottom:none; }
  .info-label { color:var(--text-mid); font-weight:600; }
  .info-value { font-weight:700; color:var(--text); text-align:right; }
  .clausula { background:var(--orange-lt); border-left:4px solid var(--orange); border-radius:8px; padding:12px 14px; margin-bottom:14px; }
  .clausula-title { font-size:8.5pt; font-weight:800; color:var(--orange); text-transform:uppercase; margin-bottom:4px; }
  .clausula-text { font-size:8.5pt; color:var(--text); line-height:1.5; text-align:justify; }
  .diag-box { background:#EFF6FF; border:1px solid #BFDBFE; border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:8.8pt; color:#1E40AF; }
  .firma-block { border:1px dashed var(--border); border-radius:10px; padding:16px; text-align:center; margin:18px auto 14px; max-width:380px; page-break-inside:avoid; }
  .firma-block img { max-height:85px; max-width:260px; display:block; margin:0 auto; }
  .firma-line { border-top:1px solid var(--text); width:260px; margin:6px auto 4px; padding-top:6px; font-size:8.5pt; font-weight:700; }
  .firma-check { color:var(--green); font-size:7.5pt; font-weight:700; }
  .footer { display:flex; justify-content:space-between; border-top:1px solid var(--border); padding-top:8px; font-size:7.5pt; color:var(--text-mid); margin-top:16px; }
  .footer .brand { color:var(--orange); font-weight:800; }
</style>
</head>
<body>
  <div class="header">
    <img src="https://storage.googleapis.com/logyser-recursos-corporativos/Imagenes/Logyser_sin_Nit.png" alt="LOG&SER">
  </div>
  <div class="doc-version">SST-R-095 Versión 1</div>

  <p class="title">Acta de Cierre de Caso Médico</p>
  <p class="subtitle">Seguridad y Salud en el Trabajo</p>

  <div class="acta-banner">CIERRE DE CASO No. <span>{{codigo_caso}}</span></div>

  <div class="info-grid">
    <div class="info-card">
      <div class="info-row"><span class="info-label">Colaborador</span><span class="info-value">{{nombre_trabajador}}</span></div>
      <div class="info-row"><span class="info-label">Cédula</span><span class="info-value">{{identificacion}}</span></div>
      <div class="info-row"><span class="info-label">Cargo</span><span class="info-value">{{cargo}}</span></div>
      <div class="info-row"><span class="info-label">Regional / Operación</span><span class="info-value">{{regional}} / {{operacion}}</span></div>
      <div class="info-row"><span class="info-label">Fecha de Ingreso</span><span class="info-value">{{fecha_ingreso}}</span></div>
    </div>
    <div class="info-card">
      <div class="info-row"><span class="info-label">Tipo de Caso</span><span class="info-value">{{tipo_caso}}</span></div>
      <div class="info-row"><span class="info-label">Fecha de Cierre</span><span class="info-value">{{fecha_cierre}}</span></div>
      <div class="info-row"><span class="info-label">Motivo de Cierre</span><span class="info-value">{{motivo_cierre}}</span></div>
      <div class="info-row"><span class="info-label">Actividad Laboral Final</span><span class="info-value">{{actividad_actual}}</span></div>
    </div>
  </div>

  <div class="diag-box">
    <strong>🩺 Diagnóstico Principal (CIE-10):</strong> [{{diagnostico_cod}}] {{diagnostico_desc}}
  </div>

  <div class="clausula">
    <div class="clausula-title">Constancia de Cierre y Alta Médico-Laboral</div>
    <div class="clausula-text">
      Se deja constancia formal del cierre del presente caso médico en el Sistema de Gestión de Seguridad y Salud en el Trabajo (SG-SST) de LOG&SER S.A.S. Se ha verificado el cumplimiento de los planes de manejo médico, la culminación del período de recomendaciones, la expedición del alta médica correspondiente o la resolución del evento clínico conforme a los dictámenes médicos y la normatividad laboral vigente. El colaborador declara haber recibido el debido acompañamiento por parte de la empresa y continuar en condiciones de salud aptas para su desempeño.
    </div>
  </div>

  <div class="info-grid" style="margin-bottom:8px;">
    <div class="info-card">
      <div class="info-row"><span class="info-label">Responsable SST</span><span class="info-value">{{responsable_sst}}</span></div>
    </div>
    <div class="info-card">
      <div class="info-row"><span class="info-label">Responsable Operación</span><span class="info-value">{{responsable_operacion}}</span></div>
    </div>
  </div>

  <div class="firma-block">
    {{firma_trabajador}}
    <div class="firma-line">Firma del Colaborador</div>
    <div style="font-size:7.5pt; color:var(--text-mid); margin-top:2px;">C.C. {{identificacion}}</div>
    <div class="firma-check">Documento firmado digitalmente</div>
  </div>

  <div class="footer">
    <span>Cerrado por: {{usuario_cierre}}</span>
    <span>Fecha de cierre: {{fecha_cierre}}</span>
    <span class="brand">LogyApp SST</span>
  </div>
</body>
</html>'
WHERE nombre_proceso = 'acta_cierre_cm';
