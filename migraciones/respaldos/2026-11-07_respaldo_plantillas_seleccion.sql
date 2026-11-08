-- Respaldo de las plantillas de Selección antes del diseño moderno (2026-11-07).
-- Para volver al diseño anterior, ejecutar este archivo.

-- ACTCON (versión 2)
UPDATE Maestro_Plantillas
SET version = 2, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acta de conocimiento de condiciones</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --navy: #1B2A5E;
    --navy-dk: #162249;
    --navy-lt: #EEF1F8;
    --orange: #F15A22;
    --border: #D8DCEA;
    --text: #0F1C3F;
    --text-mid: #5A6A8A;
    --text-dim: #9AA5BF;
    --green: #16A34A;
    --bg: #F4F6FB;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Plus Jakarta Sans", Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 24px 16px;
    line-height: 1.5;
  }
  .doc-container {
    max-width: 840px;
    margin: 0 auto;
    background: #fff;
    border-radius: 10px;
    border: 1px solid var(--border);
    box-shadow: 0 4px 20px rgba(15, 28, 63, 0.08);
    overflow: hidden;
  }
  .doc-head {
    display: grid;
    grid-template-columns: 140px 1fr 120px;
    border-bottom: 2.5px solid var(--navy);
  }
  .dh-logo {
    padding: 14px 16px;
    border-right: 1.5px solid var(--navy);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dh-logo img { height: 32px; object-fit: contain; }
  .dh-title {
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    border-right: 1.5px solid var(--navy);
  }
  .dh-title span {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .8px;
    text-transform: uppercase;
    color: var(--navy);
    line-height: 1.4;
  }
  .dh-meta { display: flex; flex-direction: column; }
  .dm-row {
    padding: 6px 10px;
    font-size: 9.5px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--border);
  }
  .dm-row:last-child { border-bottom: none; }
  .dm-row span:first-child { color: var(--text-dim); }
  .dm-row span:last-child { font-weight: 600; color: var(--text); }
  .stripe { height: 3px; background: linear-gradient(90deg, #F15A22, #D94E1A); }
  .colabo {
    display: grid;
    grid-template-columns: 2fr auto 1fr auto 1fr auto 1fr;
    align-items: center;
    padding: 10px 24px;
    background: var(--navy);
  }
  .ci { display: flex; flex-direction: column; gap: 2px; }
  .cl { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; color: rgba(255,255,255,.6); }
  .cv { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cs { width: 1px; height: 28px; background: rgba(255,255,255,.15); margin: 0 14px; }
  .doc-title { padding: 18px 24px 14px; text-align: center; border-bottom: 1px solid var(--border); }
  .doc-title h1 { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--navy); }
  .doc-body { padding: 24px 28px; border-bottom: 1px solid var(--border); }
  .doc-sig { padding: 22px 28px 26px; }
  .sig-frase { font-size: 12px; color: #333; margin-bottom: 16px; font-weight: 500; }
  .sig-table {
    width: 100%;
    border-collapse: collapse;
    border: 1.5px solid var(--navy);
    border-radius: 6px;
    overflow: hidden;
  }
  .sig-table th {
    background: var(--navy-lt);
    color: var(--navy);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .5px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    text-align: left;
  }
  .sig-table td {
    padding: 10px 10px;
    font-size: 11px;
    color: var(--text);
    border: 1px solid var(--border);
    vertical-align: middle;
  }
  .sig-box { min-height: 55px; display: flex; align-items: center; justify-content: center; }
  .sig-img { max-height: 55px; max-width: 160px; object-fit: contain; }
  @media (max-width: 640px) {
    .doc-head, .colabo { grid-template-columns: 1fr; }
    .cs { display: none; }
    .colabo { gap: 10px; padding: 14px; }
    .doc-body, .doc-sig { padding: 16px; }
  }
  @media print {
    body { background: #fff; padding: 0; }
    .doc-container { box-shadow: none; border: none; max-width: 100%; }
    .colabo { background: #f0f2f8 !important; -webkit-print-color-adjust: exact; }
    .cl { color: #555 !important; }
    .cv { color: #000 !important; }
  }
</style>
</head>
<body>
<div class="doc-container">
  <!-- ENCABEZADO -->
  <div class="doc-head">
    <div class="dh-logo">
      <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" alt="LOG&amp;SER">
    </div>
    <div class="dh-title">
      <span>Acta de Conocimiento de Condiciones</span>
    </div>
    <div class="dh-meta">
      <div class="dm-row"><span>Código</span><span>TH-R-026</span></div>
      <div class="dm-row"><span>Versión</span><span>2</span></div>
      <div class="dm-row"><span>Página</span><span>1 de 1</span></div>
    </div>
  </div>
  <div class="stripe"></div>

  <!-- BANNER COLABORADOR -->
  <div class="colabo">
    <div class="ci"><div class="cl">Colaborador</div><div class="cv">{{nombre_completo}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Identificación</div><div class="cv">{{identificacion}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Cargo</div><div class="cv">{{cargo}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Operación</div><div class="cv">{{operacion}}</div></div>
  </div>

  <!-- TITULO DOCUMENTO -->
  <div class="doc-title">
    <h1>Acta de conocimiento de condiciones</h1>
  </div>

  <!-- CONTENIDO ESPECÍFICO -->
  <div class="doc-body">
    <div style="font-size:12.5px;color:#222;line-height:1.8;margin-bottom:16px">Yo, {{nombre_completo}}, identificado con CC No. {{identificacion}}, declaro que antes de mi contratación he sido informado de manera clara sobre:</div><div style="display:flex;gap:8px;padding:3px 0 3px 8px;font-size:12px;color:#222;line-height:1.6"><span style="flex-shrink:0">•</span><span>Funciones principales del cargo de {{cargo}}.</span></div><div style="display:flex;gap:8px;padding:3px 0 3px 8px;font-size:12px;color:#222;line-height:1.6"><span style="flex-shrink:0">•</span><span>Salario y forma de pago.</span></div><div style="display:flex;gap:8px;padding:3px 0 3px 8px;font-size:12px;color:#222;line-height:1.6"><span style="flex-shrink:0">•</span><span>Horarios, turnos y condiciones de la labor.</span></div><div style="display:flex;gap:8px;padding:3px 0 3px 8px;font-size:12px;color:#222;line-height:1.6"><span style="flex-shrink:0">•</span><span>Normas de seguridad y reglamento interno.</span></div>
  </div>

  <!-- TABLA DE FIRMA -->
  <div class="doc-sig">
    <p class="sig-frase">
      Se firma en el municipio de <strong>{{municipio_firma}}</strong>, el día <strong>{{dia_firma}}</strong> del mes <strong>{{mes_firma}}</strong> del año <strong>{{anio_firma}}</strong>.
    </p>
    <table class="sig-table">
      <thead>
        <tr>
          <th style="width:28%">Firma</th>
          <th style="width:34%">Nombres y Apellidos</th>
          <th style="width:19%">Identificación</th>
          <th style="width:19%">Lugar de Expedición</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="sig-box">{{firma_colaborador}}</div>
          </td>
          <td><strong>{{nombre_completo}}</strong></td>
          <td>{{identificacion}}</td>
          <td>{{ciudad_expedicion}}</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
</body>
</html>'
WHERE nombre_proceso = 'ACTCON';

-- CHC (versión 1)
UPDATE Maestro_Plantillas
SET version = 1, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Consentimiento Informado para Prueba de Alcohol y Detección de Consumo de Sustancias Psicoactivas</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --navy: #1B2A5E;
    --navy-dk: #162249;
    --navy-lt: #EEF1F8;
    --orange: #F15A22;
    --border: #D8DCEA;
    --text: #0F1C3F;
    --text-mid: #5A6A8A;
    --text-dim: #9AA5BF;
    --green: #16A34A;
    --bg: #F4F6FB;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Plus Jakarta Sans", Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 24px 16px;
    line-height: 1.5;
  }
  .doc-container {
    max-width: 840px;
    margin: 0 auto;
    background: #fff;
    border-radius: 10px;
    border: 1px solid var(--border);
    box-shadow: 0 4px 20px rgba(15, 28, 63, 0.08);
    overflow: hidden;
  }
  .doc-head {
    display: grid;
    grid-template-columns: 140px 1fr 120px;
    border-bottom: 2.5px solid var(--navy);
  }
  .dh-logo {
    padding: 14px 16px;
    border-right: 1.5px solid var(--navy);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dh-logo img { height: 32px; object-fit: contain; }
  .dh-title {
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    border-right: 1.5px solid var(--navy);
  }
  .dh-title span {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .8px;
    text-transform: uppercase;
    color: var(--navy);
    line-height: 1.4;
  }
  .dh-meta { display: flex; flex-direction: column; }
  .dm-row {
    padding: 6px 10px;
    font-size: 9.5px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--border);
  }
  .dm-row:last-child { border-bottom: none; }
  .dm-row span:first-child { color: var(--text-dim); }
  .dm-row span:last-child { font-weight: 600; color: var(--text); }
  .stripe { height: 3px; background: linear-gradient(90deg, #F15A22, #D94E1A); }
  .colabo {
    display: grid;
    grid-template-columns: 2fr auto 1fr auto 1fr auto 1fr;
    align-items: center;
    padding: 10px 24px;
    background: var(--navy);
  }
  .ci { display: flex; flex-direction: column; gap: 2px; }
  .cl { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; color: rgba(255,255,255,.6); }
  .cv { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cs { width: 1px; height: 28px; background: rgba(255,255,255,.15); margin: 0 14px; }
  .doc-title { padding: 18px 24px 14px; text-align: center; border-bottom: 1px solid var(--border); }
  .doc-title h1 { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--navy); }
  .doc-body { padding: 24px 28px; border-bottom: 1px solid var(--border); }
  .doc-sig { padding: 22px 28px 26px; }
  .sig-frase { font-size: 12px; color: #333; margin-bottom: 16px; font-weight: 500; }
  .sig-table {
    width: 100%;
    border-collapse: collapse;
    border: 1.5px solid var(--navy);
    border-radius: 6px;
    overflow: hidden;
  }
  .sig-table th {
    background: var(--navy-lt);
    color: var(--navy);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .5px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    text-align: left;
  }
  .sig-table td {
    padding: 10px 10px;
    font-size: 11px;
    color: var(--text);
    border: 1px solid var(--border);
    vertical-align: middle;
  }
  .sig-box { min-height: 55px; display: flex; align-items: center; justify-content: center; }
  .sig-img { max-height: 55px; max-width: 160px; object-fit: contain; }
  @media (max-width: 640px) {
    .doc-head, .colabo { grid-template-columns: 1fr; }
    .cs { display: none; }
    .colabo { gap: 10px; padding: 14px; }
    .doc-body, .doc-sig { padding: 16px; }
  }
  @media print {
    body { background: #fff; padding: 0; }
    .doc-container { box-shadow: none; border: none; max-width: 100%; }
    .colabo { background: #f0f2f8 !important; -webkit-print-color-adjust: exact; }
    .cl { color: #555 !important; }
    .cv { color: #000 !important; }
  }
</style>
</head>
<body>
<div class="doc-container">
  <!-- ENCABEZADO -->
  <div class="doc-head">
    <div class="dh-logo">
      <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" alt="LOG&amp;SER">
    </div>
    <div class="dh-title">
      <span>Consentimiento Informado para Prueba de Alcohol y Detección de Consumo de Sustancias Psicoactivas</span>
    </div>
    <div class="dh-meta">
      <div class="dm-row"><span>Código</span><span>SST-FM-036</span></div>
      <div class="dm-row"><span>Versión</span><span>01</span></div>
      <div class="dm-row"><span>Página</span><span>1 de 1</span></div>
    </div>
  </div>
  <div class="stripe"></div>

  <!-- BANNER COLABORADOR -->
  <div class="colabo">
    <div class="ci"><div class="cl">Colaborador</div><div class="cv">{{nombre_completo}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Identificación</div><div class="cv">{{identificacion}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Cargo</div><div class="cv">{{cargo}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Operación</div><div class="cv">{{operacion}}</div></div>
  </div>

  <!-- TITULO DOCUMENTO -->
  <div class="doc-title">
    <h1>Consentimiento Informado para Prueba de Alcohol y Detección de Consumo de Sustancias Psicoactivas</h1>
  </div>

  <!-- CONTENIDO ESPECÍFICO -->
  <div class="doc-body">
    <div style="font-size:12px;color:#222;margin-bottom:14px"><strong>Señores:</strong> <span style="border-bottom:1px solid #000;display:inline-block;min-width:200px;padding-bottom:1px">&nbsp;(Indicar nombre de EPS o compañía de medicina prepagada)</span></div><div style="font-size:12px;color:#222;margin-bottom:12px">Cordial saludo.</div><div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:10px"><p style="margin:0 0 4px">APOYO LOGISTICO Y OPERATIVO SAS comprometidos en prevenir la accidentalidad laboral asociada al consumo de sustancias Psicoactivas legales y/o ilegales en el trabajo y preservar el derecho a la vida e integridad personal de los mismos trabajadores implementa de manera aleatoria y sin vulnerar los derechos fundamentales de las personas, las pruebas de toxicología a los empleados, ya sea con equipos y personal propio o de terceros y que estos a su vez aceptan dicha directriz.</p></div><div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:10px"><p style="margin:0 0 4px">Yo, {{nombre_completo}}, identificado con tipo de documento CC No. {{identificacion}}, en calidad de trabajador de la empresa, manifiesto de manera expresa, libre y voluntaria AUTORIZO a que se me realice la toma de la Prueba de toxicología conforme a directrices de la empresa y/o el cliente {{operacion}}.</p></div><div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:10px"><p style="margin:0 0 4px">Declaro haber recibido y entendido la política de prevención de Sustancias Psicoactivas, normas y directrices de la compañía, así como aplicación de pruebas y proceso disciplinario por LOGYSER.</p></div><div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:10px"><p style="margin:0 0 4px">Manifiesto, además, conocer y entender los riesgos a los que voy a estar expuesto y las medidas de control que el empleador considere necesarias durante la relación laboral.</p></div><div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:10px"><p style="margin:0 0 4px">En concordancia con lo anterior, me obligo y me comprometo a cumplir con las normas y procedimientos establecidos por la empresa y otros que sean necesarios para el buen desempeño de mi trabajo y/o durante la permanencia en la compañía.</p></div><div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:10px"><p style="margin:0 0 4px">Por último, manifiesto que conozco las sanciones disciplinarias, a las cuales me encuentro expuesto en caso de incumplimiento de lo anteriormente mencionado, de acuerdo con la reglamentación legal vigente, al igual que las dispuestas en el reglamento interno de trabajo.</p></div><div style="font-size:12px;color:#222;margin:14px 0"><strong>Acepto la finalidad antes indicada: SI: ___ , No: ___.</strong></div><div style="font-size:12px;color:#222;margin-top:16px"><strong>FIRMA:</strong></div>
  </div>

  <!-- TABLA DE FIRMA -->
  <div class="doc-sig">
    <p class="sig-frase">
      Se firma en el municipio de <strong>{{municipio_firma}}</strong>, el día <strong>{{dia_firma}}</strong> del mes <strong>{{mes_firma}}</strong> del año <strong>{{anio_firma}}</strong>.
    </p>
    <table class="sig-table">
      <thead>
        <tr>
          <th style="width:28%">Firma</th>
          <th style="width:34%">Nombres y Apellidos</th>
          <th style="width:19%">Identificación</th>
          <th style="width:19%">Lugar de Expedición</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="sig-box">{{firma_colaborador}}</div>
          </td>
          <td><strong>{{nombre_completo}}</strong></td>
          <td>{{identificacion}}</td>
          <td>{{ciudad_expedicion}}</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
</body>
</html>'
WHERE nombre_proceso = 'CHC';

-- CS (versión 2)
UPDATE Maestro_Plantillas
SET version = 2, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reporte Inicial de Condiciones de Salud</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --navy: #1B2A5E;
    --navy-dk: #162249;
    --navy-lt: #EEF1F8;
    --orange: #F15A22;
    --border: #D8DCEA;
    --text: #0F1C3F;
    --text-mid: #5A6A8A;
    --text-dim: #9AA5BF;
    --green: #16A34A;
    --bg: #F4F6FB;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Plus Jakarta Sans", Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 24px 16px;
    line-height: 1.5;
  }
  .doc-container {
    max-width: 840px;
    margin: 0 auto;
    background: #fff;
    border-radius: 10px;
    border: 1px solid var(--border);
    box-shadow: 0 4px 20px rgba(15, 28, 63, 0.08);
    overflow: hidden;
  }
  .doc-head {
    display: grid;
    grid-template-columns: 140px 1fr 120px;
    border-bottom: 2.5px solid var(--navy);
  }
  .dh-logo {
    padding: 14px 16px;
    border-right: 1.5px solid var(--navy);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dh-logo img { height: 32px; object-fit: contain; }
  .dh-title {
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    border-right: 1.5px solid var(--navy);
  }
  .dh-title span {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .8px;
    text-transform: uppercase;
    color: var(--navy);
    line-height: 1.4;
  }
  .dh-meta { display: flex; flex-direction: column; }
  .dm-row {
    padding: 6px 10px;
    font-size: 9.5px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--border);
  }
  .dm-row:last-child { border-bottom: none; }
  .dm-row span:first-child { color: var(--text-dim); }
  .dm-row span:last-child { font-weight: 600; color: var(--text); }
  .stripe { height: 3px; background: linear-gradient(90deg, #F15A22, #D94E1A); }
  .colabo {
    display: grid;
    grid-template-columns: 2fr auto 1fr auto 1fr auto 1fr;
    align-items: center;
    padding: 10px 24px;
    background: var(--navy);
  }
  .ci { display: flex; flex-direction: column; gap: 2px; }
  .cl { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; color: rgba(255,255,255,.6); }
  .cv { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cs { width: 1px; height: 28px; background: rgba(255,255,255,.15); margin: 0 14px; }
  .doc-title { padding: 18px 24px 14px; text-align: center; border-bottom: 1px solid var(--border); }
  .doc-title h1 { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--navy); }
  .doc-body { padding: 24px 28px; border-bottom: 1px solid var(--border); }
  .doc-sig { padding: 22px 28px 26px; }
  .sig-frase { font-size: 12px; color: #333; margin-bottom: 16px; font-weight: 500; }
  .sig-table {
    width: 100%;
    border-collapse: collapse;
    border: 1.5px solid var(--navy);
    border-radius: 6px;
    overflow: hidden;
  }
  .sig-table th {
    background: var(--navy-lt);
    color: var(--navy);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .5px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    text-align: left;
  }
  .sig-table td {
    padding: 10px 10px;
    font-size: 11px;
    color: var(--text);
    border: 1px solid var(--border);
    vertical-align: middle;
  }
  .sig-box { min-height: 55px; display: flex; align-items: center; justify-content: center; }
  .sig-img { max-height: 55px; max-width: 160px; object-fit: contain; }
  @media (max-width: 640px) {
    .doc-head, .colabo { grid-template-columns: 1fr; }
    .cs { display: none; }
    .colabo { gap: 10px; padding: 14px; }
    .doc-body, .doc-sig { padding: 16px; }
  }
  @media print {
    body { background: #fff; padding: 0; }
    .doc-container { box-shadow: none; border: none; max-width: 100%; }
    .colabo { background: #f0f2f8 !important; -webkit-print-color-adjust: exact; }
    .cl { color: #555 !important; }
    .cv { color: #000 !important; }
  }
</style>
</head>
<body>
<div class="doc-container">
  <!-- ENCABEZADO -->
  <div class="doc-head">
    <div class="dh-logo">
      <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" alt="LOG&amp;SER">
    </div>
    <div class="dh-title">
      <span>Reporte Inicial de Condiciones de Salud</span>
    </div>
    <div class="dh-meta">
      <div class="dm-row"><span>Código</span><span>TH-R-011</span></div>
      <div class="dm-row"><span>Versión</span><span>2</span></div>
      <div class="dm-row"><span>Página</span><span>1 de 1</span></div>
    </div>
  </div>
  <div class="stripe"></div>

  <!-- BANNER COLABORADOR -->
  <div class="colabo">
    <div class="ci"><div class="cl">Colaborador</div><div class="cv">{{nombre_completo}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Identificación</div><div class="cv">{{identificacion}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Cargo</div><div class="cv">{{cargo}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Operación</div><div class="cv">{{operacion}}</div></div>
  </div>

  <!-- TITULO DOCUMENTO -->
  <div class="doc-title">
    <h1>Reporte Inicial de Condiciones de Salud</h1>
  </div>

  <!-- CONTENIDO ESPECÍFICO -->
  <div class="doc-body">
    <table style="width:100%;border-collapse:collapse;border:1px solid #D8DCEA;margin-bottom:0"><tr><td style="padding:12px 14px;vertical-align:top;font-size:11.5px;color:#5A6A8A;line-height:1.7">Se realiza el siguiente cuestionario, considerando los requisitos del perfil, actividades a ejecutar y el riesgo al cual estará expuesto, por favor responder de manera consciente y veraz las siguientes preguntas, adicional se reitera que la información suministrada estará relacionada a legislación vigente Dec. 1072/2015, Res 2346/2007, obligaciones de los trabajadores brindar información del estado actual de salud y al documento de "AUTORIZACIÓN PARA EL ACCESO A HISTORIA CLINICA Y TRATAMIENTO DE DATOS PERSONALES".</td><td style="width:220px;min-width:220px;border-left:1px solid #D8DCEA;vertical-align:top;padding:10px;background:#FAFBFD"><div style="font-size:9px;font-weight:700;color:#1B2A5E;text-transform:uppercase;text-align:center;margin-bottom:6px;letter-spacing:.3px">Marque con X, el segmento corporal en el que ha presentado fractura, amputaciones. Marque con X, el segmento corporal en el que ha presentado esguince o dolor en los últimos 6 meses</div><img src="/assets/docs/CS/cuerpo_humano.jpg" alt="Cuerpo humano" style="width:200px;display:block;margin:0 auto;object-fit:contain"></td></tr></table><div style="background:#1B2A5E;color:#fff;padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:0">Marque el segmento corporal afectado</div><div style="border:1px solid #D8DCEA;border-top:none;border-radius:0 0 6px 6px;overflow:hidden"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#E8ECF8"><th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Segmento corporal</th><th style="padding:7px 8px;text-align:center;width:120px;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Fractura / amputación</th><th style="padding:7px 8px;text-align:center;width:150px;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Esguince o dolor (últ. 6 meses)</th></tr></thead><tbody><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11.5px;color:#0F1C3F;font-weight:500">Cráneo</td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_craneo_fractura" style="width:15px;height:15px;accent-color:#1B2A5E;cursor:pointer"></td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_craneo_esguince" style="width:15px;height:15px;accent-color:#F15A22;cursor:pointer"></td></tr><tr style="background:#F4F6FB;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11.5px;color:#0F1C3F;font-weight:500">Cara</td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_cara_fractura" style="width:15px;height:15px;accent-color:#1B2A5E;cursor:pointer"></td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_cara_esguince" style="width:15px;height:15px;accent-color:#F15A22;cursor:pointer"></td></tr><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11.5px;color:#0F1C3F;font-weight:500">Cuello</td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_cuello_fractura" style="width:15px;height:15px;accent-color:#1B2A5E;cursor:pointer"></td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_cuello_esguince" style="width:15px;height:15px;accent-color:#F15A22;cursor:pointer"></td></tr><tr style="background:#F4F6FB;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11.5px;color:#0F1C3F;font-weight:500">Tórax</td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_torax_fractura" style="width:15px;height:15px;accent-color:#1B2A5E;cursor:pointer"></td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_torax_esguince" style="width:15px;height:15px;accent-color:#F15A22;cursor:pointer"></td></tr><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11.5px;color:#0F1C3F;font-weight:500">Tronco</td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_tronco_fractura" style="width:15px;height:15px;accent-color:#1B2A5E;cursor:pointer"></td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_tronco_esguince" style="width:15px;height:15px;accent-color:#F15A22;cursor:pointer"></td></tr><tr style="background:#F4F6FB;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11.5px;color:#0F1C3F;font-weight:500">Brazo</td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_brazo_fractura" style="width:15px;height:15px;accent-color:#1B2A5E;cursor:pointer"></td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_brazo_esguince" style="width:15px;height:15px;accent-color:#F15A22;cursor:pointer"></td></tr><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11.5px;color:#0F1C3F;font-weight:500">Antebrazo</td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_antebrazo_fractura" style="width:15px;height:15px;accent-color:#1B2A5E;cursor:pointer"></td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_antebrazo_esguince" style="width:15px;height:15px;accent-color:#F15A22;cursor:pointer"></td></tr><tr style="background:#F4F6FB;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11.5px;color:#0F1C3F;font-weight:500">Mano</td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_mano_fractura" style="width:15px;height:15px;accent-color:#1B2A5E;cursor:pointer"></td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_mano_esguince" style="width:15px;height:15px;accent-color:#F15A22;cursor:pointer"></td></tr><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11.5px;color:#0F1C3F;font-weight:500">Abdomen</td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_abdomen_fractura" style="width:15px;height:15px;accent-color:#1B2A5E;cursor:pointer"></td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_abdomen_esguince" style="width:15px;height:15px;accent-color:#F15A22;cursor:pointer"></td></tr><tr style="background:#F4F6FB;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11.5px;color:#0F1C3F;font-weight:500">Pelvis</td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_pelvis_fractura" style="width:15px;height:15px;accent-color:#1B2A5E;cursor:pointer"></td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_pelvis_esguince" style="width:15px;height:15px;accent-color:#F15A22;cursor:pointer"></td></tr><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11.5px;color:#0F1C3F;font-weight:500">Muslo</td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_muslo_fractura" style="width:15px;height:15px;accent-color:#1B2A5E;cursor:pointer"></td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_muslo_esguince" style="width:15px;height:15px;accent-color:#F15A22;cursor:pointer"></td></tr><tr style="background:#F4F6FB;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11.5px;color:#0F1C3F;font-weight:500">Pierna</td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_pierna_fractura" style="width:15px;height:15px;accent-color:#1B2A5E;cursor:pointer"></td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_pierna_esguince" style="width:15px;height:15px;accent-color:#F15A22;cursor:pointer"></td></tr><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11.5px;color:#0F1C3F;font-weight:500">Pie</td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_pie_fractura" style="width:15px;height:15px;accent-color:#1B2A5E;cursor:pointer"></td><td style="padding:4px;text-align:center"><input type="checkbox" name="dc_pie_esguince" style="width:15px;height:15px;accent-color:#F15A22;cursor:pointer"></td></tr></tbody></table></div><div style="background:#1B2A5E;color:#fff;padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-radius:6px 6px 0 0;margin-top:14px">Datos generales de salud</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px;border:1px solid #D8DCEA;border-top:none;border-radius:0 0 6px 6px"><div style=""><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Peso</div><input type="number" name="peso" id="peso" style="width:100%;padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none" placeholder="Peso"></div><div style=""><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Altura</div><input type="text" name="altura" id="altura" style="width:100%;padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none" placeholder="Altura"></div><div style=""><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Edad</div><input type="number" name="edad" id="edad" style="width:100%;padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none" placeholder="Edad"></div><div style=""><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Fuma</div><div style="display:flex;gap:14px"><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="fuma" value="Si"> Sí</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="fuma" value="No"> No</label></div></div><div style=""><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">¿Cuántos cigarrillos día?</div><input type="text" name="cigarrillos_dia" id="cigarrillos_dia" style="width:100%;padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none" placeholder="¿Cuántos cigarrillos día?"></div><div style=""><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Alcohol</div><div style="display:flex;gap:14px"><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="alcohol" value="Si"> Sí</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="alcohol" value="No"> No</label></div></div><div style=""><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">¿Cuántos veces x semana?</div><input type="text" name="alcohol_veces" id="alcohol_veces" style="width:100%;padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none" placeholder="¿Cuántos veces x semana?"></div><div style=""><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Realiza actividad Física</div><div style="display:flex;gap:14px"><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="actividad_fisica" value="Si"> Sí</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="actividad_fisica" value="No"> No</label></div></div><div style="grid-column:1/-1;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">¿Cuántas veces a la semana?</div><input type="text" name="actividad_frecuencia" id="actividad_frecuencia" style="width:100%;padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none" placeholder="¿Cuántas veces a la semana?"></div><div style=""><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Cual actividad realiza</div><input type="text" name="actividad_cual" id="actividad_cual" style="width:100%;padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none" placeholder="Cual actividad realiza"></div><div style="grid-column:1/-1;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Su medio de transporte es</div><div style="display:flex;gap:10px;flex-wrap:wrap"><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="transporte" value="Pie"> Pie</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="transporte" value="Bicicleta"> Bicicleta</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="transporte" value="Moto"> Moto</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="transporte" value="Vehículo particular"> Vehículo particular</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="transporte" value="Transporte Publico"> Transporte Publico</label></div></div><div style=""><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Tiempo de desplazamiento x recorrido (Minutos)</div><input type="number" name="tiempo_desplazamiento" id="tiempo_desplazamiento" style="width:100%;padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none" placeholder="Tiempo de desplazamiento x recorrido (Minutos)"></div></div><div style="background:#1B2A5E;color:#fff;padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-radius:6px 6px 0 0;margin-top:14px">Condiciones de salud actuales</div><div style="border:1px solid #D8DCEA;border-top:none;border-radius:0 0 6px 6px;overflow:hidden"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#E8ECF8"><th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Descripción</th><th style="padding:7px 8px;text-align:center;width:60px;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Sí/No</th><th style="padding:7px 8px;text-align:center;width:90px;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Fecha evento</th><th style="padding:7px 8px;text-align:center;width:60px;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">AT/T/C</th><th style="padding:7px 8px;text-align:left;width:110px;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Describa</th></tr></thead><tbody><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Cuando fue la última vez que asistió a control médico</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs1_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs1_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs1_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs1_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs1_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#F4F6FB;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Ha tenido alguna enfermedad diagnosticada. Menciónela</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs2_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs2_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs2_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs2_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs2_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Tiene antecedentes familiares importantes (Hipertensión, Diabetes, Cáncer, Coronaria, artritis, dermatitis, epilepsia, otra)</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs3_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs3_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs3_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs3_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs3_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#F4F6FB;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Ha tenido algún tipo de accidente con lesiones como esguince fracturas, amputaciones, recomendaciones</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs4_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs4_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs4_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs4_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs4_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Ha tenido incapacidad mayor a 15 días por accidente de trabajo, transito o común en los últimos 6 meses</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs5_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs5_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs5_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs5_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs5_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#F4F6FB;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Ha estado en tratamiento por terapia Física, psicológica, o por sustancias psicoactivas</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs6_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs6_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs6_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs6_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs6_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">En los últimos 6 meses ha presentado problemas de hernias o dolores lumbares, espasmos, lumbago, ciática, vena varice</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs7_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs7_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs7_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs7_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs7_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#F4F6FB;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Ha presentado Lesiones o dolor en Hombro, Clavícula, codo, manos, tronco, espalda, rodilla, tobillo, pie u otro</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs8_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs8_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs8_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs8_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs8_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Tiene conocimiento o diagnóstico de presentar algún tipo de hernia abdominal, inguinal, femoral, otras</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs9_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs9_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs9_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs9_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs9_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#F4F6FB;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Ha presentado varicocele, ¿en que grado?</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs10_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs10_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs10_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs10_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs10_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Ha presentado dermatitis o lesiones en manos por alergias, exposición a temperaturas frio-calor</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs11_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs11_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs11_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs11_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs11_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#F4F6FB;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Tiene alguna condición de salud que altere su visión ¿accidentes en ojos, cirugías, etc.?</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs12_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs12_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs12_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs12_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs12_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Actualmente utiliza gafas o lentes de contacto, para la realización de sus actividades cotidiana</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs13_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs13_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs13_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs13_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs13_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#F4F6FB;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Ha presentado accidentes de tránsito, vehículo, moto, otro en los últimos 24 meses</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs14_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs14_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs14_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs14_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs14_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Ha presentado accidentes y lesiones al realizar deporte</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs15_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs15_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs15_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs15_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs15_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#F4F6FB;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Ha tenido cirugías, Mencione cuál</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs16_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs16_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs16_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs16_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs16_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Ha presentado incapacidades en los últimos 6 meses</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs17_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs17_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs17_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs17_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs17_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#F4F6FB;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Ha presentado algún accidente laboral o general que haya causado algún tipo de lesión o secuela</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs18_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs18_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs18_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs18_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs18_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Actualmente consume algún tipo de medicamento</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs19_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="cs19_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="cs19_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="cs19_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="cs19_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr></tbody></table></div><div style="background:#1B2A5E;color:#fff;padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-radius:6px 6px 0 0;margin-top:14px">Lesiones que ha presentado en su vida</div><div style="border:1px solid #D8DCEA;border-top:none;border-radius:0 0 6px 6px;overflow:hidden"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#E8ECF8"><th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Descripción</th><th style="padding:7px 8px;text-align:center;width:60px;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Sí/No</th><th style="padding:7px 8px;text-align:center;width:90px;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Fecha evento</th><th style="padding:7px 8px;text-align:center;width:60px;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">AT/T/C</th><th style="padding:7px 8px;text-align:left;width:110px;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Describa</th></tr></thead><tbody><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Conoce si es apto para trabajar en alturas</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="le1_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="le1_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="le1_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="le1_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="le1_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#F4F6FB;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Sufre de vértigo o tiene miedo a las alturas</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="le2_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="le2_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="le2_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="le2_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="le2_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#fff;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Ha tenido caídas a nivel o a diferente a nivel y a causa de la mismo requirió atención médica</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="le3_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="le3_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="le3_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="le3_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="le3_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr><tr style="background:#F4F6FB;border-bottom:1px solid #EEF1F8"><td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">Ha tenido lesiones por arma blanca</td><td style="padding:4px;text-align:center;vertical-align:middle"><div style="display:flex;flex-direction:column;gap:3px;align-items:center"><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="le4_sn" value="Si" style="width:11px;height:11px"> Sí</label><label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="le4_sn" value="No" style="width:11px;height:11px"> No</label></div></td><td style="padding:4px;text-align:center"><input type="text" name="le4_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td><td style="padding:4px;text-align:center"><input type="text" name="le4_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td><td style="padding:4px"><input type="text" name="le4_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td></tr></tbody></table></div><div style="margin-top:16px;padding-top:14px;border-top:1px solid #D8DCEA;font-size:12px;color:#222;line-height:1.75;font-weight:600">DECLARO BAJO JURAMENTO, la autenticidad de los datos consignados en el presente documento y autorizo a APOYO LOGISTICO Y OPERATIVO SAS a verificar la autenticidad de la información presentada para continuidad del proceso.</div>
  </div>

  <!-- TABLA DE FIRMA -->
  <div class="doc-sig">
    <p class="sig-frase">
      Se firma en el municipio de <strong>{{municipio_firma}}</strong>, el día <strong>{{dia_firma}}</strong> del mes <strong>{{mes_firma}}</strong> del año <strong>{{anio_firma}}</strong>.
    </p>
    <table class="sig-table">
      <thead>
        <tr>
          <th style="width:28%">Firma</th>
          <th style="width:34%">Nombres y Apellidos</th>
          <th style="width:19%">Identificación</th>
          <th style="width:19%">Lugar de Expedición</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="sig-box">{{firma_colaborador}}</div>
          </td>
          <td><strong>{{nombre_completo}}</strong></td>
          <td>{{identificacion}}</td>
          <td>{{ciudad_expedicion}}</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
</body>
</html>'
WHERE nombre_proceso = 'CS';

-- MF (versión 2)
UPDATE Maestro_Plantillas
SET version = 2, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Manual de funciones, responsabilidades y competencias — Auxiliar logístico</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --navy: #1B2A5E;
    --navy-dk: #162249;
    --navy-lt: #EEF1F8;
    --orange: #F15A22;
    --border: #D8DCEA;
    --text: #0F1C3F;
    --text-mid: #5A6A8A;
    --text-dim: #9AA5BF;
    --green: #16A34A;
    --bg: #F4F6FB;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Plus Jakarta Sans", Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 24px 16px;
    line-height: 1.5;
  }
  .doc-container {
    max-width: 840px;
    margin: 0 auto;
    background: #fff;
    border-radius: 10px;
    border: 1px solid var(--border);
    box-shadow: 0 4px 20px rgba(15, 28, 63, 0.08);
    overflow: hidden;
  }
  .doc-head {
    display: grid;
    grid-template-columns: 140px 1fr 120px;
    border-bottom: 2.5px solid var(--navy);
  }
  .dh-logo {
    padding: 14px 16px;
    border-right: 1.5px solid var(--navy);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dh-logo img { height: 32px; object-fit: contain; }
  .dh-title {
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    border-right: 1.5px solid var(--navy);
  }
  .dh-title span {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .8px;
    text-transform: uppercase;
    color: var(--navy);
    line-height: 1.4;
  }
  .dh-meta { display: flex; flex-direction: column; }
  .dm-row {
    padding: 6px 10px;
    font-size: 9.5px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--border);
  }
  .dm-row:last-child { border-bottom: none; }
  .dm-row span:first-child { color: var(--text-dim); }
  .dm-row span:last-child { font-weight: 600; color: var(--text); }
  .stripe { height: 3px; background: linear-gradient(90deg, #F15A22, #D94E1A); }
  .colabo {
    display: grid;
    grid-template-columns: 2fr auto 1fr auto 1fr auto 1fr;
    align-items: center;
    padding: 10px 24px;
    background: var(--navy);
  }
  .ci { display: flex; flex-direction: column; gap: 2px; }
  .cl { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; color: rgba(255,255,255,.6); }
  .cv { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cs { width: 1px; height: 28px; background: rgba(255,255,255,.15); margin: 0 14px; }
  .doc-title { padding: 18px 24px 14px; text-align: center; border-bottom: 1px solid var(--border); }
  .doc-title h1 { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--navy); }
  .doc-body { padding: 24px 28px; border-bottom: 1px solid var(--border); }
  .doc-sig { padding: 22px 28px 26px; }
  .sig-frase { font-size: 12px; color: #333; margin-bottom: 16px; font-weight: 500; }
  .sig-table {
    width: 100%;
    border-collapse: collapse;
    border: 1.5px solid var(--navy);
    border-radius: 6px;
    overflow: hidden;
  }
  .sig-table th {
    background: var(--navy-lt);
    color: var(--navy);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .5px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    text-align: left;
  }
  .sig-table td {
    padding: 10px 10px;
    font-size: 11px;
    color: var(--text);
    border: 1px solid var(--border);
    vertical-align: middle;
  }
  .sig-box { min-height: 55px; display: flex; align-items: center; justify-content: center; }
  .sig-img { max-height: 55px; max-width: 160px; object-fit: contain; }
  @media (max-width: 640px) {
    .doc-head, .colabo { grid-template-columns: 1fr; }
    .cs { display: none; }
    .colabo { gap: 10px; padding: 14px; }
    .doc-body, .doc-sig { padding: 16px; }
  }
  @media print {
    body { background: #fff; padding: 0; }
    .doc-container { box-shadow: none; border: none; max-width: 100%; }
    .colabo { background: #f0f2f8 !important; -webkit-print-color-adjust: exact; }
    .cl { color: #555 !important; }
    .cv { color: #000 !important; }
  }
</style>
</head>
<body>
<div class="doc-container">
  <!-- ENCABEZADO -->
  <div class="doc-head">
    <div class="dh-logo">
      <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" alt="LOG&amp;SER">
    </div>
    <div class="dh-title">
      <span>Manual de funciones - Responsabilidades - Competencias</span>
    </div>
    <div class="dh-meta">
      <div class="dm-row"><span>Código</span><span>SST-MA-002</span></div>
      <div class="dm-row"><span>Versión</span><span>2</span></div>
      <div class="dm-row"><span>Página</span><span>1 de 2</span></div>
    </div>
  </div>
  <div class="stripe"></div>

  <!-- BANNER COLABORADOR -->
  <div class="colabo">
    <div class="ci"><div class="cl">Colaborador</div><div class="cv">{{nombre_completo}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Identificación</div><div class="cv">{{identificacion}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Cargo</div><div class="cv">{{cargo}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Operación</div><div class="cv">{{operacion}}</div></div>
  </div>

  <!-- TITULO DOCUMENTO -->
  <div class="doc-title">
    <h1>Manual de funciones, responsabilidades y competencias — Auxiliar logístico</h1>
  </div>

  <!-- CONTENIDO ESPECÍFICO -->
  <div class="doc-body">
    <div style="font-family:Arial,sans-serif;font-size:11px;color:#000"><table style="width:100%;border-collapse:collapse;margin-bottom:0"><tr><td colspan="2" style="background:#1B2A5E;color:#fff;font-weight:700;padding:4px 8px;text-align:center;font-size:10.5px;text-transform:uppercase">Identificación del cargo y ubicación</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">CARGO: Auxiliar logístico | UBICACIÓN: Sede Operativa</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">Versión: 01 | Fecha de emisión: 01/11/2024</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">JEFE INMEDIATO: Coordinador de centro de trabajo | NIVEL JERÁRQUICO: Operativo</td></tr><tr><td colspan="2" style="background:#1B2A5E;color:#fff;font-weight:700;padding:4px 8px;text-align:center;font-size:10.5px;text-transform:uppercase">Objetivo del cargo</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">Apoyar en la gestión integral de la cadena logística dentro y fuera del Centro de Distribución, asegurando la correcta recepción y cargue de mercancías de acuerdo con los procedimientos establecidos y las políticas de Salud Ocupacional.</td></tr><tr><td colspan="2" style="background:#1B2A5E;color:#fff;font-weight:700;padding:4px 8px;text-align:center;font-size:10.5px;text-transform:uppercase">Autoridad</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">N/A</td></tr><tr><td colspan="2" style="background:#1B2A5E;color:#fff;font-weight:700;padding:4px 8px;text-align:center;font-size:10.5px;text-transform:uppercase">Competencias del perfil</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">EDAD: Preferiblemente de 18 a 40 años</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">GÉNERO: Preferiblemente masculino</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">EDUCACIÓN: Que sepa leer y escribir</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">FORMACIÓN: N/A</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">EXPERIENCIA EN EL CARGO: No requiere</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">Nota: Los requerimientos de educación, formación o experiencia se tendrán en cuenta para la homologación de las competencias del cargo.</td></tr><tr><td colspan="2" style="background:#1B2A5E;color:#fff;font-weight:700;padding:4px 8px;text-align:center;font-size:10.5px;text-transform:uppercase">Responsabilidades del cargo</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Atender los vehículos.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Mantener en óptimas condiciones su área de trabajo, garantizando la movilidad de los equipos y la aplicación de las normas de seguridad.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Realizar la labor asignada siguiendo las directrices del cliente.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Apoyar las diferentes actividades imprevistas que se soliciten.</td></tr><tr><td colspan="2" style="background:#1B2A5E;color:#fff;font-weight:700;padding:4px 8px;text-align:center;font-size:10.5px;text-transform:uppercase">Funciones del cargo</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Cargar y descargar vehículos.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Informar al líder en caso de identificar mercancía averiada o en mal estado, así como situaciones de hurto, recepción de propinas, eventos por el estado del camión que pongan en riesgo la mercancía y daños en instalaciones y equipos.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Alistar mercancía para el despacho.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Poner especial atención en la manipulación de la mercancía de línea blanca y línea marrón antes de ser cargada o descargada para evitar y/o identificar averías.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Apadrinar mercancías a solicitud del proveedor.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Mantener limpias las áreas de trabajo.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Estibar la mercancía respetando los pictogramas.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Paletizar mercancía optimizando el recurso.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Destellar mercancía según los requerimientos del cliente.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Además de las tareas principales, todas aquellas inherentes al cargo, y que le sean asignadas por el jefe directo.</td></tr><tr><td colspan="2" style="background:#1B2A5E;color:#fff;font-weight:700;padding:4px 8px;text-align:center;font-size:10.5px;text-transform:uppercase">Responsabilidades en SST</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Velar por el cumplimiento de las Políticas, Objetivos, Misión, Visión, Reglamentos y programas existentes en el SST (Seguridad, Salud en el trabajo y Ambiente) en la organización.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Cumplir con la implementación de los procesos existentes en Seguridad, Salud Ocupacional y Ambiente (utilización de formatos según sea el caso).</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Realizar sus actividades de forma segura, promoviendo su autocuidado, evitando generar impacto al medio ambiente, preservando los bienes de la Compañía y manteniendo una actitud preventiva y proactiva.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Conocer y cumplir el programa de clasificación de residuos sólidos establecido por la Compañía.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Desarrollar las actividades asignadas por el COPASST, Comité de Convivencia y Brigadista.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Liderar y participar activamente en las reuniones o capacitaciones concernientes a Seguridad, Salud en el trabajo y Ambiente.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Establecer el uso adecuado de ahorro de agua y energía.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Garantizar el uso, cuidado y mantenimiento de los elementos de protección personal y demás elementos de seguridad industrial requeridos para el desarrollo de las tareas, actividades y operación.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Reportar todos los actos inseguros, condiciones inseguras, incidentes y/o accidentes de trabajo inmediatamente a su jefe directo.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Suministrar información de forma clara, veraz y completa sobre su estado de salud.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Procurar el cuidado integral de su salud.</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">• Participar en las actividades de capacitación de acuerdo al plan de trabajo SG-SST.</td></tr><tr><td colspan="2" style="background:#1B2A5E;color:#fff;font-weight:700;padding:4px 8px;text-align:center;font-size:10.5px;text-transform:uppercase">Rendición de cuentas</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">CARGOS QUE LE REPORTAN: N/a</td></tr><tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">A QUIEN LE REPORTA: Jefe directo, Recursos Humanos, Gerencia, Seguridad y Salud en el trabajo.</td></tr></table></div>
  </div>

  <!-- TABLA DE FIRMA -->
  <div class="doc-sig">
    <p class="sig-frase">
      Se firma en el municipio de <strong>{{municipio_firma}}</strong>, el día <strong>{{dia_firma}}</strong> del mes <strong>{{mes_firma}}</strong> del año <strong>{{anio_firma}}</strong>.
    </p>
    <table class="sig-table">
      <thead>
        <tr>
          <th style="width:28%">Firma</th>
          <th style="width:34%">Nombres y Apellidos</th>
          <th style="width:19%">Identificación</th>
          <th style="width:19%">Lugar de Expedición</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="sig-box">{{firma_colaborador}}</div>
          </td>
          <td><strong>{{nombre_completo}}</strong></td>
          <td>{{identificacion}}</td>
          <td>{{ciudad_expedicion}}</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
</body>
</html>'
WHERE nombre_proceso = 'MF';

-- SEOP (versión 1)
UPDATE Maestro_Plantillas
SET version = 1, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Normas de Seguridad en Operación</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --navy: #1B2A5E;
    --navy-dk: #162249;
    --navy-lt: #EEF1F8;
    --orange: #F15A22;
    --border: #D8DCEA;
    --text: #0F1C3F;
    --text-mid: #5A6A8A;
    --text-dim: #9AA5BF;
    --green: #16A34A;
    --bg: #F4F6FB;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Plus Jakarta Sans", Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 24px 16px;
    line-height: 1.5;
  }
  .doc-container {
    max-width: 840px;
    margin: 0 auto;
    background: #fff;
    border-radius: 10px;
    border: 1px solid var(--border);
    box-shadow: 0 4px 20px rgba(15, 28, 63, 0.08);
    overflow: hidden;
  }
  .doc-head {
    display: grid;
    grid-template-columns: 140px 1fr 120px;
    border-bottom: 2.5px solid var(--navy);
  }
  .dh-logo {
    padding: 14px 16px;
    border-right: 1.5px solid var(--navy);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dh-logo img { height: 32px; object-fit: contain; }
  .dh-title {
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    border-right: 1.5px solid var(--navy);
  }
  .dh-title span {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .8px;
    text-transform: uppercase;
    color: var(--navy);
    line-height: 1.4;
  }
  .dh-meta { display: flex; flex-direction: column; }
  .dm-row {
    padding: 6px 10px;
    font-size: 9.5px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--border);
  }
  .dm-row:last-child { border-bottom: none; }
  .dm-row span:first-child { color: var(--text-dim); }
  .dm-row span:last-child { font-weight: 600; color: var(--text); }
  .stripe { height: 3px; background: linear-gradient(90deg, #F15A22, #D94E1A); }
  .colabo {
    display: grid;
    grid-template-columns: 2fr auto 1fr auto 1fr auto 1fr;
    align-items: center;
    padding: 10px 24px;
    background: var(--navy);
  }
  .ci { display: flex; flex-direction: column; gap: 2px; }
  .cl { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; color: rgba(255,255,255,.6); }
  .cv { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cs { width: 1px; height: 28px; background: rgba(255,255,255,.15); margin: 0 14px; }
  .doc-title { padding: 18px 24px 14px; text-align: center; border-bottom: 1px solid var(--border); }
  .doc-title h1 { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--navy); }
  .doc-body { padding: 24px 28px; border-bottom: 1px solid var(--border); }
  .doc-sig { padding: 22px 28px 26px; }
  .sig-frase { font-size: 12px; color: #333; margin-bottom: 16px; font-weight: 500; }
  .sig-table {
    width: 100%;
    border-collapse: collapse;
    border: 1.5px solid var(--navy);
    border-radius: 6px;
    overflow: hidden;
  }
  .sig-table th {
    background: var(--navy-lt);
    color: var(--navy);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .5px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    text-align: left;
  }
  .sig-table td {
    padding: 10px 10px;
    font-size: 11px;
    color: var(--text);
    border: 1px solid var(--border);
    vertical-align: middle;
  }
  .sig-box { min-height: 55px; display: flex; align-items: center; justify-content: center; }
  .sig-img { max-height: 55px; max-width: 160px; object-fit: contain; }
  @media (max-width: 640px) {
    .doc-head, .colabo { grid-template-columns: 1fr; }
    .cs { display: none; }
    .colabo { gap: 10px; padding: 14px; }
    .doc-body, .doc-sig { padding: 16px; }
  }
  @media print {
    body { background: #fff; padding: 0; }
    .doc-container { box-shadow: none; border: none; max-width: 100%; }
    .colabo { background: #f0f2f8 !important; -webkit-print-color-adjust: exact; }
    .cl { color: #555 !important; }
    .cv { color: #000 !important; }
  }
</style>
</head>
<body>
<div class="doc-container">
  <!-- ENCABEZADO -->
  <div class="doc-head">
    <div class="dh-logo">
      <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" alt="LOG&amp;SER">
    </div>
    <div class="dh-title">
      <span>Normas de Seguridad en Operación</span>
    </div>
    <div class="dh-meta">
      <div class="dm-row"><span>Código</span><span>SST-FM-021</span></div>
      <div class="dm-row"><span>Versión</span><span>01</span></div>
      <div class="dm-row"><span>Página</span><span>1 de 1</span></div>
    </div>
  </div>
  <div class="stripe"></div>

  <!-- BANNER COLABORADOR -->
  <div class="colabo">
    <div class="ci"><div class="cl">Colaborador</div><div class="cv">{{nombre_completo}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Identificación</div><div class="cv">{{identificacion}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Cargo</div><div class="cv">{{cargo}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Operación</div><div class="cv">{{operacion}}</div></div>
  </div>

  <!-- TITULO DOCUMENTO -->
  <div class="doc-title">
    <h1>Normas de Seguridad en Operación</h1>
  </div>

  <!-- CONTENIDO ESPECÍFICO -->
  <div class="doc-body">
    <table style="width:100%;border-collapse:collapse;border:1px solid #D8DCEA;margin-bottom:12px"><tr><td style="width:42%;border-right:1px solid #D8DCEA;vertical-align:top;padding:0"><img src="/assets/docs/SEOP/bodega.jpg" alt="Operacion" style="width:100%;height:220px;object-fit:cover;display:block"></td><td style="vertical-align:top;padding:0"><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px 10px;border-bottom:1px solid #D8DCEA;font-size:12px;color:#0F1C3F;line-height:1.6;vertical-align:top"><strong>Objetivo:</strong> Establecer normas a nivel de Seguridad y Salud en el Trabajo para laborar en las operaciones, como medida de prevenci&oacute;n frente a Riesgos y Peligros derivados de la operaci&oacute;n de Logyser.</td></tr><tr><td style="padding:8px 10px;border-bottom:1px solid #D8DCEA;font-size:12px;color:#0F1C3F;line-height:1.6;vertical-align:top"><strong>Alcance:</strong> Aplica para todos los colaboradores de Logyser.</td></tr><tr><td style="padding:0;vertical-align:top"><table style="width:100%;border-collapse:collapse"><tr><td style="width:90px;padding:8px 10px;border-right:1px solid #D8DCEA;font-size:12px;font-weight:700;color:#0F1C3F;vertical-align:middle;text-align:center">Objetivos<br>Espec&iacute;ficos</td><td style="vertical-align:top;padding:0"><div style="padding:7px 10px;font-size:12px;color:#0F1C3F;line-height:1.6;border-bottom:1px solid #D8DCEA">Prevenir incidentes y/o accidentes laborales, con afectaci&oacute;n a la persona, al medio ambiente, a la operaci&oacute;n y activos fijos de LOGYSER.</div><div style="padding:7px 10px;font-size:12px;color:#0F1C3F;line-height:1.6">Adoptar cultura de auto cuidado y cumplimiento de normas de seguridad como medida preventiva frente a estado integral del trabajador.</div></td></tr></table></td></tr></table></td></tr></table><table style="width:100%;border-collapse:collapse;border:1px solid #D8DCEA"><tr><td style="vertical-align:top;padding:0"><div style="display:grid;grid-template-columns:28px 1fr;background:#fff;border-bottom:1px solid #D8DCEA"><div style="padding:8px 4px 8px 8px;font-size:11.5px;font-weight:700;color:#5A6A8A">1.</div><div style="padding:8px 10px 8px 0;font-size:12px;color:#5A6A8A;line-height:1.6">Presento mi carnet al ingreso de las instalaciones de las operaciones, me presento a la zona de operación con mi dotación completa entregada por la empresa (Overol, calzado y EPP) durante toda mi jornada laboral utilizo mi dotación y EPP requeridos para mi labor.</div></div><div style="display:grid;grid-template-columns:28px 1fr;background:#F0F2F8;border-bottom:1px solid #D8DCEA"><div style="padding:8px 4px 8px 8px;font-size:11.5px;font-weight:700;color:#5A6A8A">2.</div><div style="padding:8px 10px 8px 0;font-size:12px;color:#5A6A8A;line-height:1.6">Llego a mi lugar de trabajo con tiempo de anticipación necesario para recibir el turno; así como la información necesaria de las actividades a realizar.</div></div><div style="display:grid;grid-template-columns:28px 1fr;background:#fff;border-bottom:1px solid #D8DCEA"><div style="padding:8px 4px 8px 8px;font-size:11.5px;font-weight:700;color:#5A6A8A">3.</div><div style="padding:8px 10px 8px 0;font-size:12px;color:#5A6A8A;line-height:1.6">Me abstengo de usar accesorios como: aretes, pearcing, expansiones, cadenas, pulseras, relojes, anillos, gorras y me presento al trabajo libre de efectos de sustancias de alcohol drogas y psicoactivas, las cuales ponen en riesgo mi integridad y la de mis compañeros.</div></div><div style="display:grid;grid-template-columns:28px 1fr;background:#F0F2F8;border-bottom:1px solid #D8DCEA"><div style="padding:8px 4px 8px 8px;font-size:11.5px;font-weight:700;color:#5A6A8A">4.</div><div style="padding:8px 10px 8px 0;font-size:12px;color:#5A6A8A;line-height:1.6">Reporto mis condiciones de salud de forma diaria y con 2 días de Antelación como mínimo informo mis citas medicas, terapias, exámenes y otros para gestionar el permiso a través de formato físico.</div></div><div style="display:grid;grid-template-columns:28px 1fr;background:#fff;border-bottom:1px solid #D8DCEA"><div style="padding:8px 4px 8px 8px;font-size:11.5px;font-weight:700;color:#5A6A8A">5.</div><div style="padding:8px 10px 8px 0;font-size:12px;color:#5A6A8A;line-height:1.6">Los soportes de incapacidad, recomendaciones y otros una vez sean expedida, debo entregarla a jefe y/o gestión humana y SST, para respectivo análisis vr puesto de trabajo.</div></div><div style="display:grid;grid-template-columns:28px 1fr;background:#F0F2F8;border-bottom:1px solid #D8DCEA"><div style="padding:8px 4px 8px 8px;font-size:11.5px;font-weight:700;color:#5A6A8A">6.</div><div style="padding:8px 10px 8px 0;font-size:12px;color:#5A6A8A;line-height:1.6">Toda lesión que me suceda en la ejecución de mi labor, la debo reportar de forma inmediata a la ocurrencia y participar en el proceso de investigación, plan de acción conforme a legislación vigente.</div></div><div style="display:grid;grid-template-columns:28px 1fr;background:#fff;border-bottom:1px solid #D8DCEA"><div style="padding:8px 4px 8px 8px;font-size:11.5px;font-weight:700;color:#5A6A8A">7.</div><div style="padding:8px 10px 8px 0;font-size:12px;color:#5A6A8A;line-height:1.6">Me abstengo de utilizar celular, manos libres, radios, mp3 o cualquier otro elemento que me genere distracción durante mi jornada laboral.</div></div><div style="display:grid;grid-template-columns:28px 1fr;background:#F0F2F8;border-bottom:1px solid #D8DCEA"><div style="padding:8px 4px 8px 8px;font-size:11.5px;font-weight:700;color:#5A6A8A">8.</div><div style="padding:8px 10px 8px 0;font-size:12px;color:#5A6A8A;line-height:1.6">Sigo procedimientos indicados en mi inducción, mantengo mi área de trabajo en condiciones óptimas de orden y aseo, cumpliendo normas y controles requeridos, suspendiendo toda labor que ponga en riesgo mi vida, la de mis compañeros, el medio ambiente y los recursos de la empresa.</div></div><div style="display:grid;grid-template-columns:28px 1fr;background:#fff;border-bottom:1px solid #D8DCEA"><div style="padding:8px 4px 8px 8px;font-size:11.5px;font-weight:700;color:#5A6A8A">9.</div><div style="padding:8px 10px 8px 0;font-size:12px;color:#5A6A8A;line-height:1.6">Reporto actos y condiciones inseguras, doy buen trato a jefes y compañeros, sigo instrucciones de mi jefe, acepto retroalimentación de superiores en caso de ser necesario; en el trabajo y fuera de él, cumplo las normas de seguridad vial (respeto señales de tránsito).</div></div><div style="display:grid;grid-template-columns:28px 1fr;background:#F0F2F8;border-bottom:1px solid #D8DCEA"><div style="padding:8px 4px 8px 8px;font-size:11.5px;font-weight:700;color:#5A6A8A">10.</div><div style="padding:8px 10px 8px 0;font-size:12px;color:#5A6A8A;line-height:1.6">Con la firma del presente documento manifiesto que he recibido la información sobre los riesgos, normas de seguridad y me comprometo a cumplirlas durante mi relación laboral con APOYO LOGÝSTICO Y OPERATIVO S.A.S.</div></div></td><td style="width:75px;border-left:1px solid #D8DCEA;vertical-align:top;padding:0"><img src="/assets/docs/SEOP/rompecabezas.jpg" alt="1-10" style="width:75px;height:100%;min-height:500px;object-fit:cover;object-position:center;display:block"></td></tr></table>
  </div>

  <!-- TABLA DE FIRMA -->
  <div class="doc-sig">
    <p class="sig-frase">
      Se firma en el municipio de <strong>{{municipio_firma}}</strong>, el día <strong>{{dia_firma}}</strong> del mes <strong>{{mes_firma}}</strong> del año <strong>{{anio_firma}}</strong>.
    </p>
    <table class="sig-table">
      <thead>
        <tr>
          <th style="width:28%">Firma</th>
          <th style="width:34%">Nombres y Apellidos</th>
          <th style="width:19%">Identificación</th>
          <th style="width:19%">Lugar de Expedición</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="sig-box">{{firma_colaborador}}</div>
          </td>
          <td><strong>{{nombre_completo}}</strong></td>
          <td>{{identificacion}}</td>
          <td>{{ciudad_expedicion}}</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
</body>
</html>'
WHERE nombre_proceso = 'SEOP';

-- TD (versión 2)
UPDATE Maestro_Plantillas
SET version = 2, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Autorización para el Tratamiento de Datos Personales</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --navy: #1B2A5E;
    --navy-dk: #162249;
    --navy-lt: #EEF1F8;
    --orange: #F15A22;
    --border: #D8DCEA;
    --text: #0F1C3F;
    --text-mid: #5A6A8A;
    --text-dim: #9AA5BF;
    --green: #16A34A;
    --bg: #F4F6FB;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Plus Jakarta Sans", Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 24px 16px;
    line-height: 1.5;
  }
  .doc-container {
    max-width: 840px;
    margin: 0 auto;
    background: #fff;
    border-radius: 10px;
    border: 1px solid var(--border);
    box-shadow: 0 4px 20px rgba(15, 28, 63, 0.08);
    overflow: hidden;
  }
  .doc-head {
    display: grid;
    grid-template-columns: 140px 1fr 120px;
    border-bottom: 2.5px solid var(--navy);
  }
  .dh-logo {
    padding: 14px 16px;
    border-right: 1.5px solid var(--navy);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dh-logo img { height: 32px; object-fit: contain; }
  .dh-title {
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    border-right: 1.5px solid var(--navy);
  }
  .dh-title span {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .8px;
    text-transform: uppercase;
    color: var(--navy);
    line-height: 1.4;
  }
  .dh-meta { display: flex; flex-direction: column; }
  .dm-row {
    padding: 6px 10px;
    font-size: 9.5px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--border);
  }
  .dm-row:last-child { border-bottom: none; }
  .dm-row span:first-child { color: var(--text-dim); }
  .dm-row span:last-child { font-weight: 600; color: var(--text); }
  .stripe { height: 3px; background: linear-gradient(90deg, #F15A22, #D94E1A); }
  .colabo {
    display: grid;
    grid-template-columns: 2fr auto 1fr auto 1fr auto 1fr;
    align-items: center;
    padding: 10px 24px;
    background: var(--navy);
  }
  .ci { display: flex; flex-direction: column; gap: 2px; }
  .cl { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; color: rgba(255,255,255,.6); }
  .cv { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cs { width: 1px; height: 28px; background: rgba(255,255,255,.15); margin: 0 14px; }
  .doc-title { padding: 18px 24px 14px; text-align: center; border-bottom: 1px solid var(--border); }
  .doc-title h1 { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--navy); }
  .doc-body { padding: 24px 28px; border-bottom: 1px solid var(--border); }
  .doc-sig { padding: 22px 28px 26px; }
  .sig-frase { font-size: 12px; color: #333; margin-bottom: 16px; font-weight: 500; }
  .sig-table {
    width: 100%;
    border-collapse: collapse;
    border: 1.5px solid var(--navy);
    border-radius: 6px;
    overflow: hidden;
  }
  .sig-table th {
    background: var(--navy-lt);
    color: var(--navy);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .5px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    text-align: left;
  }
  .sig-table td {
    padding: 10px 10px;
    font-size: 11px;
    color: var(--text);
    border: 1px solid var(--border);
    vertical-align: middle;
  }
  .sig-box { min-height: 55px; display: flex; align-items: center; justify-content: center; }
  .sig-img { max-height: 55px; max-width: 160px; object-fit: contain; }
  @media (max-width: 640px) {
    .doc-head, .colabo { grid-template-columns: 1fr; }
    .cs { display: none; }
    .colabo { gap: 10px; padding: 14px; }
    .doc-body, .doc-sig { padding: 16px; }
  }
  @media print {
    body { background: #fff; padding: 0; }
    .doc-container { box-shadow: none; border: none; max-width: 100%; }
    .colabo { background: #f0f2f8 !important; -webkit-print-color-adjust: exact; }
    .cl { color: #555 !important; }
    .cv { color: #000 !important; }
  }
</style>
</head>
<body>
<div class="doc-container">
  <!-- ENCABEZADO -->
  <div class="doc-head">
    <div class="dh-logo">
      <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" alt="LOG&amp;SER">
    </div>
    <div class="dh-title">
      <span>Política para la Autorización, Tratamiento de Datos Personales y Aviso de Privacidad</span>
    </div>
    <div class="dh-meta">
      <div class="dm-row"><span>Código</span><span>TH-R-008</span></div>
      <div class="dm-row"><span>Versión</span><span>2</span></div>
      <div class="dm-row"><span>Página</span><span>1 de 1</span></div>
    </div>
  </div>
  <div class="stripe"></div>

  <!-- BANNER COLABORADOR -->
  <div class="colabo">
    <div class="ci"><div class="cl">Colaborador</div><div class="cv">{{nombre_completo}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Identificación</div><div class="cv">{{identificacion}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Cargo</div><div class="cv">{{cargo}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Operación</div><div class="cv">{{operacion}}</div></div>
  </div>

  <!-- TITULO DOCUMENTO -->
  <div class="doc-title">
    <h1>Autorización para el Tratamiento de Datos Personales</h1>
  </div>

  <!-- CONTENIDO ESPECÍFICO -->
  <div class="doc-body">
    <div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:14px">Con la firma de este documento manifiesto que he sido informado por APOYO LOGISTICO Y OPERATIVO S.A.S. de lo siguiente:</div><div style="display:flex;gap:6px;margin-bottom:10px"><div style="font-size:12px;font-weight:700;color:#222;flex-shrink:0;min-width:18px">1.</div><div style="font-size:12px;color:#222;line-height:1.7">La Compañía actúa como responsable del tratamiento de datos personales del titular de acuerdo con lo establecido en la ley 1581 de 2012 de habeas data, y que conjunta o separadamente podrá recolectar, usar y tratar mis datos personales conforme a la Política de Tratamiento de Datos de la Compañía que se encuentra disponible en la base de datos del área de Talento Humano. Es de carácter facultativo el responder las preguntas sobre Datos Sensibles o sobre niñas, niños y adolescentes. </div></div><div style="display:flex;gap:6px;margin-bottom:10px"><div style="font-size:12px;font-weight:700;color:#222;flex-shrink:0;min-width:18px">2.</div><div style="font-size:12px;color:#222;line-height:1.7">Es de carácter facultativo el responder las preguntas sobre Datos Sensibles o sobre niñas, niños y adolescentes. Mis derechos como titular de los datos son los previstos en la Constitución y la ley, especialmente los siguientes: </div></div><div style="display:flex;gap:6px;margin-bottom:10px"><div style="font-size:12px;font-weight:700;color:#222;flex-shrink:0;min-width:18px">3.</div><div style="font-size:12px;color:#222;line-height:1.7">Derecho a conocer, actualizar y rectificar mis datos personales frente a los responsables o encargados del Tratamiento, así como el derecho a revocar el consentimiento otorgado para el tratamiento de datos personales. Este derecho se podrá ejercer, entre otros frente a datos parciales, inexactos, incompletos, fraccionados, que induzcan a error, o aquellos cuyo Tratamiento esté expresamente prohibido o no haya sido autorizado; pueden ser ejercidos a través de los canales gratuitos dispuestos por la Compañía y observando la Política de Tratamiento de Datos Personales de APOYO LOGISTICO Y OPERATIVO S.A.S. </div></div><div style="display:flex;gap:6px;margin-bottom:10px"><div style="font-size:12px;font-weight:700;color:#222;flex-shrink:0;min-width:18px">4.</div><div style="font-size:12px;color:#222;line-height:1.7">Derecho a solicitar prueba de la autorización otorgada al responsable del Tratamiento salvo cuando expresamente se exceptúe como requisito para el Tratamiento; </div></div><div style="display:flex;gap:6px;margin-bottom:10px"><div style="font-size:12px;font-weight:700;color:#222;flex-shrink:0;min-width:18px">5.</div><div style="font-size:12px;color:#222;line-height:1.7">Derecho a ser informado por el responsable del Tratamiento o el Encargado del Tratamiento, previa solicitud, respecto del uso que les ha dado a mis datos personales; </div></div><div style="display:flex;gap:6px;margin-bottom:10px"><div style="font-size:12px;font-weight:700;color:#222;flex-shrink:0;min-width:18px">6.</div><div style="font-size:12px;color:#222;line-height:1.7">Derecho a revocar la autorización y/o solicitar la supresión del dato cuando en el Tratamiento no se respeten los principios, derechos y garantías constitucionales y legales. </div></div><div style="display:flex;gap:6px;margin-bottom:10px"><div style="font-size:12px;font-weight:700;color:#222;flex-shrink:0;min-width:18px">7.</div><div style="font-size:12px;color:#222;line-height:1.7">Derecho a acceder en forma gratuita a mis datos personales que hayan sido objeto de Tratamiento, en los términos establecidos en la Ley 1581 de 2.012 y las demás normas que la modifiquen, adicionen o complementen, para cualquier inquietud o información adicional relacionada con el tratamiento de datos personales, puedo contactarme al correo electrónico directora.th@logyser.com </div></div><div style="display:flex;gap:6px;margin-bottom:10px"><div style="font-size:12px;font-weight:700;color:#222;flex-shrink:0;min-width:18px">8.</div><div style="font-size:12px;color:#222;line-height:1.7"><strong>Aceptación de la Política de Tratamiento de Datos Personales</strong> El trabajador, al firmar este documento, declara que ha leído y comprendido en su totalidad la Política de Tratamiento de Datos Personales de APOYO LOGÍSTICO Y OPERATIVO S.A.S (en adelante LOG&amp;SER), la cual ha sido proporcionada para su revisión. El trabajador acepta y consiente el tratamiento de sus datos personales de acuerdo con los términos y condiciones establecidos en dicha política. El trabajador entiende que la Política de Tratamiento de Datos Personales detalla cómo LOG&amp;SER recopila, utiliza, almacena y protege la información personal, así como los derechos y procedimientos relacionados con la protección de datos. Asimismo, reconoce que tiene acceso a la política en cualquier momento y puede solicitar aclaraciones o ejercer sus derechos de acceso, corrección, actualización o eliminación de datos conforme a lo dispuesto en la política y la legislación aplicable. Al firmar este documento, el trabajador otorga su consentimiento explícito para el tratamiento de sus datos personales conforme a las finalidades descritas en la política. </div></div>
  </div>

  <!-- TABLA DE FIRMA -->
  <div class="doc-sig">
    <p class="sig-frase">
      Se firma en el municipio de <strong>{{municipio_firma}}</strong>, el día <strong>{{dia_firma}}</strong> del mes <strong>{{mes_firma}}</strong> del año <strong>{{anio_firma}}</strong>.
    </p>
    <table class="sig-table">
      <thead>
        <tr>
          <th style="width:28%">Firma</th>
          <th style="width:34%">Nombres y Apellidos</th>
          <th style="width:19%">Identificación</th>
          <th style="width:19%">Lugar de Expedición</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="sig-box">{{firma_colaborador}}</div>
          </td>
          <td><strong>{{nombre_completo}}</strong></td>
          <td>{{identificacion}}</td>
          <td>{{ciudad_expedicion}}</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
</body>
</html>'
WHERE nombre_proceso = 'TD';

-- ITAL (versión 1)
UPDATE Maestro_Plantillas
SET version = 1, ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Formatos Italcol</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --navy: #1B2A5E;
    --navy-dk: #162249;
    --navy-lt: #EEF1F8;
    --orange: #F15A22;
    --border: #D8DCEA;
    --text: #0F1C3F;
    --text-mid: #5A6A8A;
    --text-dim: #9AA5BF;
    --green: #16A34A;
    --bg: #F4F6FB;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Plus Jakarta Sans", Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 24px 16px;
    line-height: 1.5;
  }
  .doc-container {
    max-width: 840px;
    margin: 0 auto;
    background: #fff;
    border-radius: 10px;
    border: 1px solid var(--border);
    box-shadow: 0 4px 20px rgba(15, 28, 63, 0.08);
    overflow: hidden;
  }
  .doc-head {
    display: grid;
    grid-template-columns: 140px 1fr 120px;
    border-bottom: 2.5px solid var(--navy);
  }
  .dh-logo {
    padding: 14px 16px;
    border-right: 1.5px solid var(--navy);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dh-logo img { height: 32px; object-fit: contain; }
  .dh-title {
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    border-right: 1.5px solid var(--navy);
  }
  .dh-title span {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .8px;
    text-transform: uppercase;
    color: var(--navy);
    line-height: 1.4;
  }
  .dh-meta { display: flex; flex-direction: column; }
  .dm-row {
    padding: 6px 10px;
    font-size: 9.5px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--border);
  }
  .dm-row:last-child { border-bottom: none; }
  .dm-row span:first-child { color: var(--text-dim); }
  .dm-row span:last-child { font-weight: 600; color: var(--text); }
  .stripe { height: 3px; background: linear-gradient(90deg, #F15A22, #D94E1A); }
  .colabo {
    display: grid;
    grid-template-columns: 2fr auto 1fr auto 1fr auto 1fr;
    align-items: center;
    padding: 10px 24px;
    background: var(--navy);
  }
  .ci { display: flex; flex-direction: column; gap: 2px; }
  .cl { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; color: rgba(255,255,255,.6); }
  .cv { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cs { width: 1px; height: 28px; background: rgba(255,255,255,.15); margin: 0 14px; }
  .doc-title { padding: 18px 24px 14px; text-align: center; border-bottom: 1px solid var(--border); }
  .doc-title h1 { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--navy); }
  .doc-body { padding: 24px 28px; border-bottom: 1px solid var(--border); }
  .doc-sig { padding: 22px 28px 26px; }
  .sig-frase { font-size: 12px; color: #333; margin-bottom: 16px; font-weight: 500; }
  .sig-table {
    width: 100%;
    border-collapse: collapse;
    border: 1.5px solid var(--navy);
    border-radius: 6px;
    overflow: hidden;
  }
  .sig-table th {
    background: var(--navy-lt);
    color: var(--navy);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .5px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    text-align: left;
  }
  .sig-table td {
    padding: 10px 10px;
    font-size: 11px;
    color: var(--text);
    border: 1px solid var(--border);
    vertical-align: middle;
  }
  .sig-box { min-height: 55px; display: flex; align-items: center; justify-content: center; }
  .sig-img { max-height: 55px; max-width: 160px; object-fit: contain; }
  @media (max-width: 640px) {
    .doc-head, .colabo { grid-template-columns: 1fr; }
    .cs { display: none; }
    .colabo { gap: 10px; padding: 14px; }
    .doc-body, .doc-sig { padding: 16px; }
  }
  @media print {
    body { background: #fff; padding: 0; }
    .doc-container { box-shadow: none; border: none; max-width: 100%; }
    .colabo { background: #f0f2f8 !important; -webkit-print-color-adjust: exact; }
    .cl { color: #555 !important; }
    .cv { color: #000 !important; }
  }
</style>
</head>
<body>
<div class="doc-container">
  <!-- ENCABEZADO -->
  <div class="doc-head">
    <div class="dh-logo">
      <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" alt="LOG&amp;SER">
    </div>
    <div class="dh-title">
      <span>Formatos y Políticas Italcol</span>
    </div>
    <div class="dh-meta">
      <div class="dm-row"><span>Código</span><span>ITAL</span></div>
      <div class="dm-row"><span>Versión</span><span>1</span></div>
      <div class="dm-row"><span>Página</span><span>1 de 1</span></div>
    </div>
  </div>
  <div class="stripe"></div>

  <!-- BANNER COLABORADOR -->
  <div class="colabo">
    <div class="ci"><div class="cl">Colaborador</div><div class="cv">{{nombre_completo}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Identificación</div><div class="cv">{{identificacion}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Cargo</div><div class="cv">{{cargo}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Operación</div><div class="cv">{{operacion}}</div></div>
  </div>

  <!-- TITULO DOCUMENTO -->
  <div class="doc-title">
    <h1>Formatos Italcol</h1>
  </div>

  <!-- CONTENIDO ESPECÍFICO -->
  <div class="doc-body">
    <style>.ital-acc summary{list-style:none}.ital-acc summary::-webkit-details-marker{display:none}.ital-acc summary::marker{content:""}.ital-acc[open]>summary .ital-chev{transform:rotate(90deg)}</style><div style="font-size:11.5px;color:#5A6A8A;line-height:1.7;margin-bottom:10px">Este documento reúne los formatos y políticas de Italcol que debes diligenciar y conocer. Ábrelos uno a uno completando cada sección — al abrir uno se cierra el anterior. Al final firmas una sola vez y quedan registrados todos.</div><details class="ital-acc" name="ital-secciones" open style="margin-top:12px;border:1px solid #D8DCEA;border-radius:6px;overflow:hidden"><summary style="list-style:none;cursor:pointer;background:#1B2A5E;color:#fff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px"><span style="display:flex;align-items:center;gap:9px"><span class="ital-chev" style="display:inline-block;font-size:10px;transition:transform .18s ease">&#9654;</span><span style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px">Formato de Evaluación de Conocimiento</span></span><span style="font-size:9.5px;color:rgba(255,255,255,.7);white-space:nowrap">MAS-FR-GH-002 · V01</span></summary><div style="padding:16px"><div style="font-size:11px;color:#5A6A8A;font-weight:600;margin-bottom:12px">Tema: Inducción en Seguridad y Salud en el Trabajo</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px"><div style="display:flex;flex-direction:column;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Planta</div><input type="text" name="q_planta" style="padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none"></div><div style="display:flex;flex-direction:column;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Empresa</div><input type="text" name="q_empresa" style="padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none"></div></div><div style="border-top:1px solid #EEF1F8;padding-top:12px;margin-top:12px"><div style="font-size:12px;font-weight:700;color:#0F1C3F;margin-bottom:6px">1. Responda falso o verdadero.</div><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:8px 0;border-bottom:1px dashed #EEF1F8"><div style="font-size:11.5px;color:#5A6A8A;line-height:1.6;flex:1">La política integral tiene como prioridad proteger la seguridad y salud de los trabajadores, Mediante la planeación, implementación, verificación y mejora continua del SG-SST, Identificando los peligros, evaluando y valorando los riesgos a los cuales se encuentren expuestos en su lugar de trabajo, Establecimiento de los controles respectivos, con el fin de establecer las acciones que contribuyan a la eliminación, reducción y prevención de incidentes, accidentes y enfermedades laborales.</div><div style="flex-shrink:0"><div style="display:flex;gap:14px;flex-wrap:wrap"><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="p1a" value="Falso"> Falso</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="p1a" value="Verdadero"> Verdadero</label></div></div></div><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:8px 0;border-bottom:1px dashed #EEF1F8"><div style="font-size:11.5px;color:#5A6A8A;line-height:1.6;flex:1">La política de no consumo de alcohol, tabaco y sustancias psicoactivas establece que no se permite a ninguna persona, ingresar y trabajar bajo la influencia del alcohol o sustancias psicoactivas.</div><div style="flex-shrink:0"><div style="display:flex;gap:14px;flex-wrap:wrap"><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="p1b" value="Falso"> Falso</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="p1b" value="Verdadero"> Verdadero</label></div></div></div><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:8px 0;border-bottom:1px dashed #EEF1F8"><div style="font-size:11.5px;color:#5A6A8A;line-height:1.6;flex:1">La política de seguridad vial establece que el límite máximo de velocidad para vehículos en áreas de operación dentro de las instalaciones de ITALCOL DE OCCIDENTE es de 10 Km/h.</div><div style="flex-shrink:0"><div style="display:flex;gap:14px;flex-wrap:wrap"><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="p1c" value="Falso"> Falso</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="p1c" value="Verdadero"> Verdadero</label></div></div></div><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:8px 0;border-bottom:1px dashed #EEF1F8"><div style="font-size:11.5px;color:#5A6A8A;line-height:1.6;flex:1">La política de no uso de celulares en la jornada de trabajo determina que hacer uso de equipos electrónicos, como tables, relojes electrónicos, entre otros durante la jornada laboral, está prohibido.</div><div style="flex-shrink:0"><div style="display:flex;gap:14px;flex-wrap:wrap"><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="p1d" value="Falso"> Falso</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="p1d" value="Verdadero"> Verdadero</label></div></div></div></div><div style="border-top:1px solid #EEF1F8;padding-top:12px;margin-top:12px"><div style="font-size:12px;font-weight:700;color:#0F1C3F;margin-bottom:6px">2. Marque con una X la respuesta correcta.</div><div style="font-size:11.5px;color:#5A6A8A;margin-bottom:6px">Los EPP básicos que debo utilizar para ingresar a las áreas de producción son:</div><div style="display:flex;flex-direction:column;gap:6px"><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:6px"><input type="radio" name="p2" value="a"> <strong>a.</strong> Casco de Seguridad.</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:6px"><input type="radio" name="p2" value="b"> <strong>b.</strong> Gafas de Seguridad.</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:6px"><input type="radio" name="p2" value="c"> <strong>c.</strong> Protección Auditiva.</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:6px"><input type="radio" name="p2" value="d"> <strong>d.</strong> Botas de Seguridad.</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:6px"><input type="radio" name="p2" value="e"> <strong>e.</strong> Todas las anteriores.</label></div></div><div style="border-top:1px solid #EEF1F8;padding-top:12px;margin-top:12px"><div style="font-size:12px;font-weight:700;color:#0F1C3F;margin-bottom:6px">3. Relacione con una flecha el concepto a cada palabra que corresponda.</div><div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;align-items:center;gap:10px"><div style="width:170px;flex-shrink:0;font-size:12px;font-weight:600;color:#0F1C3F">a. Peligro</div><select name="p3_a" style="flex:1;padding:6px 8px;border:1px solid #B8C0D8;border-radius:6px;font-size:11.5px;font-family:inherit;outline:none"><option value="">Seleccione el concepto correspondiente...</option><option value="Combinación de probabilidad y severidad (consecuencia)">Combinación de probabilidad y severidad (consecuencia)</option><option value="Comportamientos que dan origen a incidentes o accidentes.">Comportamientos que dan origen a incidentes o accidentes.</option><option value="Suceso repentino, causa u ocasión del trabajo, genera lesión">Suceso repentino, causa u ocasión del trabajo, genera lesión</option><option value="Circunstancias que pueden ocasionar incidentes o accidentes">Circunstancias que pueden ocasionar incidentes o accidentes</option><option value="Fuente o situación con potencial de daño.">Fuente o situación con potencial de daño.</option></select></div><div style="display:flex;align-items:center;gap:10px"><div style="width:170px;flex-shrink:0;font-size:12px;font-weight:600;color:#0F1C3F">b. Riesgo</div><select name="p3_b" style="flex:1;padding:6px 8px;border:1px solid #B8C0D8;border-radius:6px;font-size:11.5px;font-family:inherit;outline:none"><option value="">Seleccione el concepto correspondiente...</option><option value="Combinación de probabilidad y severidad (consecuencia)">Combinación de probabilidad y severidad (consecuencia)</option><option value="Comportamientos que dan origen a incidentes o accidentes.">Comportamientos que dan origen a incidentes o accidentes.</option><option value="Suceso repentino, causa u ocasión del trabajo, genera lesión">Suceso repentino, causa u ocasión del trabajo, genera lesión</option><option value="Circunstancias que pueden ocasionar incidentes o accidentes">Circunstancias que pueden ocasionar incidentes o accidentes</option><option value="Fuente o situación con potencial de daño.">Fuente o situación con potencial de daño.</option></select></div><div style="display:flex;align-items:center;gap:10px"><div style="width:170px;flex-shrink:0;font-size:12px;font-weight:600;color:#0F1C3F">c. Condición Insegura</div><select name="p3_c" style="flex:1;padding:6px 8px;border:1px solid #B8C0D8;border-radius:6px;font-size:11.5px;font-family:inherit;outline:none"><option value="">Seleccione el concepto correspondiente...</option><option value="Combinación de probabilidad y severidad (consecuencia)">Combinación de probabilidad y severidad (consecuencia)</option><option value="Comportamientos que dan origen a incidentes o accidentes.">Comportamientos que dan origen a incidentes o accidentes.</option><option value="Suceso repentino, causa u ocasión del trabajo, genera lesión">Suceso repentino, causa u ocasión del trabajo, genera lesión</option><option value="Circunstancias que pueden ocasionar incidentes o accidentes">Circunstancias que pueden ocasionar incidentes o accidentes</option><option value="Fuente o situación con potencial de daño.">Fuente o situación con potencial de daño.</option></select></div><div style="display:flex;align-items:center;gap:10px"><div style="width:170px;flex-shrink:0;font-size:12px;font-weight:600;color:#0F1C3F">d. Acto Inseguro</div><select name="p3_d" style="flex:1;padding:6px 8px;border:1px solid #B8C0D8;border-radius:6px;font-size:11.5px;font-family:inherit;outline:none"><option value="">Seleccione el concepto correspondiente...</option><option value="Combinación de probabilidad y severidad (consecuencia)">Combinación de probabilidad y severidad (consecuencia)</option><option value="Comportamientos que dan origen a incidentes o accidentes.">Comportamientos que dan origen a incidentes o accidentes.</option><option value="Suceso repentino, causa u ocasión del trabajo, genera lesión">Suceso repentino, causa u ocasión del trabajo, genera lesión</option><option value="Circunstancias que pueden ocasionar incidentes o accidentes">Circunstancias que pueden ocasionar incidentes o accidentes</option><option value="Fuente o situación con potencial de daño.">Fuente o situación con potencial de daño.</option></select></div><div style="display:flex;align-items:center;gap:10px"><div style="width:170px;flex-shrink:0;font-size:12px;font-weight:600;color:#0F1C3F">e. Accidente de Trabajo</div><select name="p3_e" style="flex:1;padding:6px 8px;border:1px solid #B8C0D8;border-radius:6px;font-size:11.5px;font-family:inherit;outline:none"><option value="">Seleccione el concepto correspondiente...</option><option value="Combinación de probabilidad y severidad (consecuencia)">Combinación de probabilidad y severidad (consecuencia)</option><option value="Comportamientos que dan origen a incidentes o accidentes.">Comportamientos que dan origen a incidentes o accidentes.</option><option value="Suceso repentino, causa u ocasión del trabajo, genera lesión">Suceso repentino, causa u ocasión del trabajo, genera lesión</option><option value="Circunstancias que pueden ocasionar incidentes o accidentes">Circunstancias que pueden ocasionar incidentes o accidentes</option><option value="Fuente o situación con potencial de daño.">Fuente o situación con potencial de daño.</option></select></div></div></div><div style="border-top:1px solid #EEF1F8;padding-top:12px;margin-top:12px"><div style="font-size:12px;font-weight:700;color:#0F1C3F;margin-bottom:6px">4. ¿Cuáles de los deberes hacen parte de mis responsabilidades como trabajador?</div><div style="display:flex;flex-direction:column;gap:6px"><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:6px"><input type="radio" name="p4" value="a"> <strong>a.</strong> Procurar el cuidado integral de su salud.</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:6px"><input type="radio" name="p4" value="b"> <strong>b.</strong> Cumplir las normas de seguridad e higiene propias de la empresa.</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:6px"><input type="radio" name="p4" value="c"> <strong>c.</strong> Reportar inmediatamente todo accidente de trabajo o incidente.</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:6px"><input type="radio" name="p4" value="d"> <strong>d.</strong> Suministrar información clara, completa y veraz sobre su estado de salud.</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:6px"><input type="radio" name="p4" value="e"> <strong>e.</strong> Todas las anteriores.</label></div></div><div style="border-top:1px solid #EEF1F8;padding-top:12px;margin-top:12px"><div style="font-size:12px;font-weight:700;color:#0F1C3F;margin-bottom:6px">5. Complete la palabra que hace referencia cada letra de la sigla PILOSO.</div><div style="display:flex;gap:10px;flex-wrap:wrap"><div style="display:flex;flex-direction:column;align-items:center;gap:3px"><div style="width:28px;height:28px;border-radius:5px;background:#1B2A5E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">P</div><input type="text" name="p5_0" style="width:140px;padding:6px 8px;border:1px solid #B8C0D8;border-radius:6px;font-size:11.5px;font-family:inherit;outline:none;text-align:center"></div><div style="display:flex;flex-direction:column;align-items:center;gap:3px"><div style="width:28px;height:28px;border-radius:5px;background:#1B2A5E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">I</div><input type="text" name="p5_1" style="width:140px;padding:6px 8px;border:1px solid #B8C0D8;border-radius:6px;font-size:11.5px;font-family:inherit;outline:none;text-align:center"></div><div style="display:flex;flex-direction:column;align-items:center;gap:3px"><div style="width:28px;height:28px;border-radius:5px;background:#1B2A5E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">L</div><input type="text" name="p5_2" style="width:140px;padding:6px 8px;border:1px solid #B8C0D8;border-radius:6px;font-size:11.5px;font-family:inherit;outline:none;text-align:center"></div><div style="display:flex;flex-direction:column;align-items:center;gap:3px"><div style="width:28px;height:28px;border-radius:5px;background:#1B2A5E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">O</div><input type="text" name="p5_3" style="width:140px;padding:6px 8px;border:1px solid #B8C0D8;border-radius:6px;font-size:11.5px;font-family:inherit;outline:none;text-align:center"></div><div style="display:flex;flex-direction:column;align-items:center;gap:3px"><div style="width:28px;height:28px;border-radius:5px;background:#1B2A5E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">S</div><input type="text" name="p5_4" style="width:140px;padding:6px 8px;border:1px solid #B8C0D8;border-radius:6px;font-size:11.5px;font-family:inherit;outline:none;text-align:center"></div><div style="display:flex;flex-direction:column;align-items:center;gap:3px"><div style="width:28px;height:28px;border-radius:5px;background:#1B2A5E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">O</div><input type="text" name="p5_5" style="width:140px;padding:6px 8px;border:1px solid #B8C0D8;border-radius:6px;font-size:11.5px;font-family:inherit;outline:none;text-align:center"></div></div></div><div style="border-top:1px solid #EEF1F8;padding-top:12px;margin-top:12px"><div style="font-size:12px;font-weight:700;color:#0F1C3F;margin-bottom:6px">6. Al activarse una alarma de emergencia debo seguir las siguientes instrucciones.</div><div style="display:flex;flex-direction:column;gap:6px"><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:6px"><input type="radio" name="p6" value="a"> <strong>a.</strong> Salir de la planta, irme para mi casa, llamar a bomberos.</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:6px"><input type="radio" name="p6" value="b"> <strong>b.</strong> Apagar mi equipo y estar atento a las instrucciones del líder de evacuación.</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:6px"><input type="radio" name="p6" value="c"> <strong>c.</strong> A y b son correctas.</label></div></div><div style="border-top:1px solid #EEF1F8;padding-top:12px;margin-top:12px"><div style="font-size:12px;font-weight:700;color:#0F1C3F;margin-bottom:6px">7. Cuál es el tiempo que se debe esperar para evacuar cuando una alarma se activa.</div><div style="display:flex;flex-direction:column;gap:6px"><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:6px"><input type="radio" name="p7" value="a"> <strong>a.</strong> 0 minutos.</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:6px"><input type="radio" name="p7" value="b"> <strong>b.</strong> 30 segundos.</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:6px"><input type="radio" name="p7" value="c"> <strong>c.</strong> 1 hora.</label></div></div><div style="border-top:1px solid #EEF1F8;padding-top:12px;margin-top:12px"><div style="font-size:12px;font-weight:700;color:#0F1C3F;margin-bottom:6px">8. Cuál es el lema del pilar de Protección en Acción.</div><input type="text" name="p8" style="width:100%;padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none"></div><div style="margin-top:16px;padding-top:12px;border-top:1px solid #D8DCEA;font-size:11px;color:#5A6A8A;line-height:1.7;font-style:italic">Certifico que me ha sido divulgada y entiendo la Política de SST, los peligros y riesgos asociados al proceso productivo y los medios de control para mitigarlos. Por todo lo anterior firmo el presente documento como muestra del compromiso con mi seguridad y la de los demás, cumpliendo activamente con las normas de seguridad y todo lo expuesto en el curso de Seguridad y Salud en el Trabajo.</div></div></details><details class="ital-acc" name="ital-secciones" style="margin-top:12px;border:1px solid #D8DCEA;border-radius:6px;overflow:hidden"><summary style="list-style:none;cursor:pointer;background:#1B2A5E;color:#fff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px"><span style="display:flex;align-items:center;gap:9px"><span class="ital-chev" style="display:inline-block;font-size:10px;transition:transform .18s ease">&#9654;</span><span style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px">Formulario de Información de Emergencias</span></span></summary><div style="padding:16px"><div style="display:grid;grid-template-columns:1fr 1fr 1fr 2fr;gap:10px;margin-bottom:16px"><div style="display:flex;flex-direction:column;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Día</div><input type="text" name="e_dia" style="padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none"></div><div style="display:flex;flex-direction:column;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Mes</div><input type="text" name="e_mes" style="padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none"></div><div style="display:flex;flex-direction:column;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Año</div><input type="text" name="e_anio" style="padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none"></div><div style="display:flex;flex-direction:column"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Planta</div><div style="display:flex;gap:14px;flex-wrap:wrap"><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="e_planta" value="Girardota"> Girardota</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="e_planta" value="Santa Rosa de Osos"> Santa Rosa de Osos</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="e_planta" value="Yarumal"> Yarumal</label></div></div></div><div style="background:#E8ECF8;padding:6px 10px;font-size:10px;font-weight:700;color:#1B2A5E;text-transform:uppercase;border-radius:4px;margin-bottom:10px">Información personal</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px"><div style="display:flex;flex-direction:column;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Nombres y apellidos</div><input type="text" name="e_nombres" style="padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none"></div><div style="display:flex;flex-direction:column"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Sexo</div><div style="display:flex;gap:14px;flex-wrap:wrap"><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="e_sexo" value="Masculino"> Masculino</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="e_sexo" value="Femenino"> Femenino</label><label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="e_sexo" value="Otro"> Otro</label></div></div><div style="display:flex;flex-direction:column;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Nacionalidad</div><input type="text" name="e_nacionalidad" style="padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none"></div><div style="display:flex;flex-direction:column;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Fecha y lugar de nacimiento</div><input type="text" name="e_nacimiento" style="padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none"></div><div style="display:flex;flex-direction:column;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Dirección de residencia</div><input type="text" name="e_direccion" style="padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none"></div><div style="display:flex;flex-direction:column;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Nombre de contacto en caso de emergencia</div><input type="text" name="e_contacto1_nombre" style="padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none"></div><div style="display:flex;flex-direction:column;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Número de teléfono del contacto de emergencia</div><input type="text" name="e_contacto1_tel" style="padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none"></div><div style="display:flex;flex-direction:column;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Nombre de contacto en caso de emergencia (2)</div><input type="text" name="e_contacto2_nombre" style="padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none"></div><div style="display:flex;flex-direction:column;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Número de teléfono contacto en caso de emergencia (2)</div><input type="text" name="e_contacto2_tel" style="padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none"></div></div><div style="background:#E8ECF8;padding:6px 10px;font-size:10px;font-weight:700;color:#1B2A5E;text-transform:uppercase;border-radius:4px;margin-bottom:10px">Datos médicos</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px"><div style="display:flex;flex-direction:column;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Grupo sanguíneo</div><input type="text" name="e_grupo_sanguineo" style="padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none"></div><div style="display:flex;flex-direction:column;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Alergias</div><input type="text" name="e_alergias" style="padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none"></div><div style="display:flex;flex-direction:column;"><div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Condición de salud</div><input type="text" name="e_condicion_salud" style="padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none"></div></div><div style="font-size:10.5px;color:#9AA5BF;line-height:1.6;border-top:1px solid #EEF1F8;padding-top:10px">La información suministrada por el colaborador es de uso confidencial y solo será utilizada únicamente en caso de emergencia.</div></div></details><details class="ital-acc" name="ital-secciones" style="margin-top:12px;border:1px solid #D8DCEA;border-radius:6px;overflow:hidden"><summary style="list-style:none;cursor:pointer;background:#1B2A5E;color:#fff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px"><span style="display:flex;align-items:center;gap:9px"><span class="ital-chev" style="display:inline-block;font-size:10px;transition:transform .18s ease">&#9654;</span><span style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px">Política de No Consumo de Alcohol, Tabaco y Sustancias Psicoactivas</span></span><span style="font-size:9.5px;color:rgba(255,255,255,.7);white-space:nowrap">DN-PC-GE-001 · V03</span></summary><div style="padding:16px"><div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:10px">ITALCOL, ha definido y establecido una política para el no consumo de alcohol, tabaco y sustancias psicoactivas, para preservar, mejorar y conservar el bienestar de los trabajadores y su calidad de vida, logrando además un adecuado desempeño y competitividad del personal y de la empresa, así como el fomento de estilos de vida saludables, teniendo en cuenta lo establecido en la legislación vigente.</div><div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:10px">ITALCOL, es consciente que el alcoholismo y el consumo de sustancias psicoactivas por parte de los trabajadores, puede tener efectos adversos en su capacidad de desempeño y pueden afectar considerablemente la salud y seguridad de los demás colaboradores y de terceros. Por lo anterior, ITALCOL contempla los siguientes aspectos.</div><div style="display:flex;gap:8px;padding:3px 0 3px 8px;font-size:12px;color:#222;line-height:1.6"><span style="flex-shrink:0">•</span><span>Está prohibido presentarse a trabajar bajo el efecto de alcohol, drogas y/o sustancias psicoactivas o que crean dependencia.</span></div><div style="display:flex;gap:8px;padding:3px 0 3px 8px;font-size:12px;color:#222;line-height:1.6"><span style="flex-shrink:0">•</span><span>Esta estrictamente prohibido la posesión, consumo, distribución o venta de bebidas alcohólicas, tabaco o sustancias psicoactivas, medicamentos formulados o drogas no recetadas en el desarrollo del trabajo, dentro y fuera de las instalaciones de la empresa, dentro de los centros de trabajo o durante la prestación de servicios.</span></div><div style="display:flex;gap:8px;padding:3px 0 3px 8px;font-size:12px;color:#222;line-height:1.6"><span style="flex-shrink:0">•</span><span>ITALCOL se reserva el derecho de realizar pruebas de alcoholemia y/o de consumo de drogas ilícitas o de convocas a terceros para que las hagan, en situaciones en que un trabajador, directamente contratado o de terceros, este envuelto en algún accidente y/o presente características o actitudes sospechosas.</span></div><div style="font-size:12px;color:#222;line-height:1.75;margin-top:10px">La empresa se acoge a las normas, políticas y campañas que en materia de desestimulacion o prohibición del consumo de tabaco, alcohol y drogas imparta el gobierno nacional.</div><div style="font-size:12px;color:#222;line-height:1.75;margin-top:10px">El alcance de esta política aplicará a nuestros trabajadores, contratistas, visitantes y será divulgada a todo el personal.</div><div style="margin-top:16px;padding-top:10px;border-top:1px solid #EEF1F8;font-size:10.5px;color:#9AA5BF">Enero del 2019 — JUAN FELIPE CADAVID HERNÁNDEZ — Gerente Regional Antioquia</div></div></details><details class="ital-acc" name="ital-secciones" style="margin-top:12px;border:1px solid #D8DCEA;border-radius:6px;overflow:hidden"><summary style="list-style:none;cursor:pointer;background:#1B2A5E;color:#fff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px"><span style="display:flex;align-items:center;gap:9px"><span class="ital-chev" style="display:inline-block;font-size:10px;transition:transform .18s ease">&#9654;</span><span style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px">Política de No Uso de Teléfonos Celulares en la Jornada de Trabajo</span></span><span style="font-size:9.5px;color:rgba(255,255,255,.7);white-space:nowrap">DN-PC-GE-001 · V03</span></summary><div style="padding:16px"><div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:10px">ITALCOL, es consciente que el uso de teléfonos celulares en las áreas OPERATIVAS, tales como PRODUCCIÓN, ALMACEN, TALLERES DE MANTENIMIENTO, VIAS DE ACCESO, ETC. Puede generar distracciones, y en consecuencia generar accidentes graves, por este motivo declara la PROHIBICIÓN de la posesión y uso de teléfonos celulares y elementos distractores tales como tablets (de uso personal), relojes electrónicos entre otros, durante la jornada laboral, razón por la cual establece para sus colaboradores:</div><div style="display:flex;gap:8px;padding:3px 0 3px 8px;font-size:12px;color:#222;line-height:1.6"><span style="flex-shrink:0">•</span><span>Realizar o recibir llamadas durante la jornada laboral en las áreas antes mencionadas queda prohibido.</span></div><div style="display:flex;gap:8px;padding:3px 0 3px 8px;font-size:12px;color:#222;line-height:1.6"><span style="flex-shrink:0">•</span><span>Enviar mensajes de texto o manipular el teléfono celular durante la jornada laboral, está prohibido.</span></div><div style="display:flex;gap:8px;padding:3px 0 3px 8px;font-size:12px;color:#222;line-height:1.6"><span style="flex-shrink:0">•</span><span>Hacer uso de equipos electrónicos, como tablets (de uso personal), relojes electrónicos, entre otros durante la jornada laboral, está prohibido.</span></div><div style="display:flex;gap:8px;padding:3px 0 3px 8px;font-size:12px;color:#222;line-height:1.6"><span style="flex-shrink:0">•</span><span>La participación activa de colaboradores en los programas de señalización y capacitación que promueve el cumplimiento de la política contra el uso de teléfonos celulares durante la jornada laboral es de obligatorio cumplimiento.</span></div><div style="display:flex;gap:8px;padding:3px 0 3px 8px;font-size:12px;color:#222;line-height:1.6"><span style="flex-shrink:0">•</span><span>Se permitirá el uso de tablets solo a personal autorizado y para fines específicos de su labor y en lugares autorizados.</span></div><div style="font-size:12px;color:#222;line-height:1.75;margin-top:10px">El incumplimiento de cualquiera de las obligaciones antes determinadas se constituya como una FALTA GRAVE y una violación a las obligaciones y prohibiciones que rigen los controles de trabajo, en consecuencia, la EMPRESA pueda adoptar las medidas disciplinarias correspondientes, inclusive dar por finalizado el contrato de trabajo por justa causa de acuerdo con lo establecido en el reglamento interno de trabajo y la ley, según sea el caso.</div><div style="font-size:12px;color:#222;line-height:1.75;margin-top:10px">La empresa dispondrá de casilleros y punto de uso de uso seguro del celular, así mismo pondrá a disposición de los colaboradores las herramientas que se requieran para el buen desempeño de las labores tales como cámaras, relojes de pared y/o radios.</div><div style="font-size:12px;color:#222;line-height:1.75;margin-top:10px">Esta política estará en vigencia a partir de su publicación en las instalaciones de ITALCOL, y se aplicara a los colaboradores que desempeñan sus funciones laborales en las áreas OPERATIVAS y cualquier actor (Visitante, contratista o administrativo que ingrese a estas áreas). para los efectos de la presente política se entienden por jornada laboral, el tiempo en que el trabajador presente un servicio al empleador.</div><div style="margin-top:16px;padding-top:10px;border-top:1px solid #EEF1F8;font-size:10.5px;color:#9AA5BF">Enero del 2019 — JUAN FELIPE CADAVID HERNÁNDEZ — Gerente Regional Antioquia</div></div></details><details class="ital-acc" name="ital-secciones" style="margin-top:12px;border:1px solid #D8DCEA;border-radius:6px;overflow:hidden"><summary style="list-style:none;cursor:pointer;background:#1B2A5E;color:#fff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px"><span style="display:flex;align-items:center;gap:9px"><span class="ital-chev" style="display:inline-block;font-size:10px;transition:transform .18s ease">&#9654;</span><span style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px">Política Sistema Integrado de Gestión Italcol</span></span><span style="font-size:9.5px;color:rgba(255,255,255,.7);white-space:nowrap">DN-PC-GE-001 · V04</span></summary><div style="padding:16px"><div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:10px">ITALCOL, dedicada a la elaboración de alimentos para animales, comercialización, y almacenamiento de materias primas pecuarias en sus plantas de producción; recepción, almacenamiento y despachos de materias primas pecuarias en sus operaciones portuarias; fabricación de Premezclas vitamínicas y minerales para alimentación animal; cría de aves y cerdos; empleando materias primas nacionales e importadas; Para esto se compromete a cumplir con los requisitos internos y demás requisitos legales aplicables, así como el mejoramiento continuo de los procesos, con estándares de calidad e inocuidad de los alimentos, contando con un grupo humano dispuesto a lograr la satisfacción de las necesidades y expectativas de nuestros colaboradores, clientes y otras partes interesadas, garantizando operaciones de comercio exterior, seguras y confiables, trabajando en la mitigación de riesgos a través de toda la cadena de suministro, protegiendo así nuestras operaciones.</div><div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:10px">Tiene como prioridad proteger la seguridad y salud de los colaboradores mediante la planeación, implementación, verificación y mejora continua del Sistema de Gestión de Seguridad y Salud en el Trabajo identificando los peligros, evaluando y valorando los riesgos a los cuales se encuentren expuestos en su lugar de trabajo y que puedan afectar el bienestar físico, mental y social de los mismos y demás partes interesadas, mediante el establecimiento de los controles aplicables al contexto de cada centro de trabajo, con el fin de establecer las acciones que contribuyan a la eliminación, reducción y prevención de incidentes, accidentes, enfermedades laborales.</div><div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:10px">Actúa de manera responsable con la protección del medio ambiente, buscando la prevención de la contaminación, gestionando los aspectos ambientales significativos asociados a las actividades, productos y servicios desarrollados en sus operaciones y estableciendo dentro de sus prioridades el uso racional y eficiente de los recursos naturales de mayor consumo, recursos nutricionales, gestión de gases de efecto invernadero y la reducción, reutilización y aprovechamiento de sus residuos sólidos.</div><div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:10px">Se compromete a mejorar el desempeño energético, mediante la adquisición de productos y servicios con alta eficiencia energética, diseñando o desarrollando actividades que consideren la mejora de este. Así mismo asegura la disponibilidad de la información y los recursos para lograr los objetivos y metas energéticas, siendo factores claves para la sostenibilidad de la organización y sus partes interesadas.</div><div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:10px">ITALCOL, se compromete a asignar los recursos humanos, económicos, tecnológicos y de cualquier índole, necesarios para el diseño, implementación, evaluación y mejoramiento de las actividades del Sistema Integrado de Gestión. Así mismo, a generar mecanismos para la consulta y participación de los trabajadores y sus representantes.</div><div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:10px">Esta política se aplica y difunde en todos los centros de trabajo y a todos los niveles de la Organización y a cualquier persona que preste servicios independientemente de su forma de contratación, trabajadores directos o en misión, contratistas, subcontratistas, visitantes, asociados de negocio y todas las partes interesadas. Será revisada y actualizada acorde a los cambios normativos y legales asociados al Sistema Integrado de Gestión y al direccionamiento estratégico de ITALCOL.</div><div style="margin-top:16px;padding-top:10px;border-top:1px solid #EEF1F8;font-size:10.5px;color:#9AA5BF">Mayo del 2023 — REPRESENTANTE LEGAL</div></div></details>
  </div>

  <!-- TABLA DE FIRMA -->
  <div class="doc-sig">
    <p class="sig-frase">
      Se firma en el municipio de <strong>{{municipio_firma}}</strong>, el día <strong>{{dia_firma}}</strong> del mes <strong>{{mes_firma}}</strong> del año <strong>{{anio_firma}}</strong>.
    </p>
    <table class="sig-table">
      <thead>
        <tr>
          <th style="width:28%">Firma</th>
          <th style="width:34%">Nombres y Apellidos</th>
          <th style="width:19%">Identificación</th>
          <th style="width:19%">Lugar de Expedición</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="sig-box">{{firma_colaborador}}</div>
          </td>
          <td><strong>{{nombre_completo}}</strong></td>
          <td>{{identificacion}}</td>
          <td>{{ciudad_expedicion}}</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
</body>
</html>'
WHERE nombre_proceso = 'ITAL';
