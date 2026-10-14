const pool = require('../src/services/db');

const LOGO_URL = 'https://storage.googleapis.com/logyser-recursos-corporativos/Imagenes/Logyser_sin_Nit.png';

const PLANTILLA_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Solicitud de Retiro Parcial de Cesantías — LOG&SER</title>
<style>
  @page {
    size: letter;
    margin: 16mm 15mm 16mm 15mm;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    background: #ffffff;
    font-size: 9.2pt;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Header ── */
  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 12px;
    border-bottom: 2px solid #000b59;
    margin-bottom: 14px;
  }
  .header-left {
    max-width: 60%;
  }
  .company-name {
    font-size: 11pt;
    font-weight: 800;
    color: #000b59;
    letter-spacing: 0.3px;
    text-transform: uppercase;
  }
  .company-meta {
    font-size: 8pt;
    color: #64748b;
    margin-top: 2px;
    line-height: 1.35;
  }
  .header-right {
    text-align: right;
  }
  .logo-img {
    height: 48px;
    max-width: 190px;
    object-fit: contain;
  }
  .doc-badge {
    display: inline-block;
    background: #eef2ff;
    color: #000b59;
    font-size: 7.5pt;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 4px;
    margin-top: 4px;
    border: 1px solid #c7d2fe;
    letter-spacing: 0.4px;
  }

  /* ── Título del Documento ── */
  .doc-title-bar {
    text-align: center;
    margin-bottom: 14px;
  }
  .doc-title {
    font-size: 13pt;
    font-weight: 800;
    color: #000b59;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .doc-subtitle {
    font-size: 8pt;
    color: #64748b;
    margin-top: 2px;
  }

  /* ── Banner de Métricas Financieras (Hero Card) ── */
  .metrics-card {
    display: flex;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 14px;
  }
  .metric-item {
    flex: 1;
    padding: 10px 14px;
    border-right: 1px solid #e2e8f0;
  }
  .metric-item:last-child {
    border-right: none;
  }
  .metric-label {
    font-size: 7.5pt;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
  }
  .metric-value-primary {
    font-size: 13pt;
    font-weight: 800;
    color: #f55400;
    letter-spacing: -0.3px;
  }
  .metric-value {
    font-size: 10pt;
    font-weight: 700;
    color: #000b59;
  }
  .metric-sub {
    font-size: 7.5pt;
    color: #94a3b8;
    margin-top: 1px;
  }

  /* ── Secciones con títulos modernos ── */
  .section-block {
    margin-bottom: 12px;
  }
  .section-title {
    font-size: 8.5pt;
    font-weight: 700;
    color: #000b59;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid #e2e8f0;
    margin-bottom: 8px;
  }
  .section-title::before {
    content: '';
    display: inline-block;
    width: 4px;
    height: 12px;
    background: #f55400;
    border-radius: 2px;
  }

  /* ── Grillas de Datos ── */
  .data-grid {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
    font-size: 8.5pt;
  }
  .data-grid td {
    padding: 6px 10px;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
  }
  .data-grid tr:last-child td {
    border-bottom: none;
  }
  .data-grid tr:nth-child(even) td {
    background: #fafafa;
  }
  .data-label {
    width: 25%;
    font-weight: 600;
    color: #64748b;
    border-right: 1px solid #f1f5f9;
  }
  .data-val {
    width: 25%;
    font-weight: 600;
    color: #0f172a;
    border-right: 1px solid #f1f5f9;
  }
  .data-val:last-child {
    border-right: none;
  }

  /* ── Tabla de Documentos / Checklist ── */
  .doc-table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
    font-size: 8pt;
    margin-top: 6px;
  }
  .doc-table th {
    background: #000b59;
    color: #ffffff;
    font-weight: 700;
    text-align: left;
    padding: 5px 8px;
    font-size: 7.5pt;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .doc-table td {
    padding: 5px 8px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: middle;
  }
  .doc-table tr:last-child td {
    border-bottom: none;
  }
  .check-box {
    display: inline-block;
    width: 13px;
    height: 13px;
    line-height: 11px;
    text-align: center;
    border: 1.5px solid #000b59;
    border-radius: 3px;
    font-weight: 800;
    font-size: 8pt;
    color: #000b59;
    background: #fff;
  }

  /* ── Declaración Juramentada ── */
  .statement-box {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-left: 3.5px solid #000b59;
    border-radius: 6px;
    padding: 9px 12px;
    margin-top: 10px;
    margin-bottom: 14px;
  }
  .statement-header {
    font-size: 8pt;
    font-weight: 700;
    color: #000b59;
    text-transform: uppercase;
    margin-bottom: 3px;
    letter-spacing: 0.3px;
  }
  .statement-text {
    font-size: 8pt;
    color: #334155;
    text-align: justify;
    line-height: 1.4;
  }

  /* ── Sección de Firma ── */
  .signature-container {
    margin-top: 10px;
    page-break-inside: avoid;
  }
  .signature-card {
    width: 280px;
    margin: 0 auto;
    text-align: center;
  }
  .sig-img-wrap {
    height: 70px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    margin-bottom: 4px;
  }
  .sig-img {
    max-height: 65px;
    max-width: 240px;
    object-fit: contain;
  }
  .sig-line {
    border-top: 1.5px solid #000b59;
    margin-bottom: 5px;
  }
  .sig-name {
    font-size: 9pt;
    font-weight: 700;
    color: #000b59;
    text-transform: uppercase;
  }
  .sig-details {
    font-size: 7.5pt;
    color: #64748b;
    line-height: 1.35;
  }

  /* ── Footer ── */
  .doc-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    border-top: 1px solid #e2e8f0;
    padding-top: 6px;
    display: flex;
    justify-content: space-between;
    font-size: 7pt;
    color: #94a3b8;
  }
</style>
</head>
<body>

  <!-- Encabezado Corporativo -->
  <header class="doc-header">
    <div class="header-left">
      <div class="company-name">Apoyo Logístico y Operativo S.A.S.</div>
      <div class="company-meta">
        NIT. 900.318.733-1 &bull; Dg. 74B # 33A - 51 &bull; Medellín, Colombia<br>
        Gestión de Talento Humano y Nómina
      </div>
    </div>
    <div class="header-right">
      <img src="${LOGO_URL}" alt="Logyser" class="logo-img">
      <div><span class="doc-badge">RADICADO N° {{id_solicitud}}</span></div>
    </div>
  </header>

  <!-- Título del Formato -->
  <div class="doc-title-bar">
    <h1 class="doc-title">Solicitud de Retiro Parcial de Cesantías</h1>
    <p class="doc-subtitle">Conforme al Art. 256 del Código Sustantivo del Trabajo y Decreto Único Reglamentario 1072 de 2015</p>
  </div>

  <!-- Resumen de Métricas Financieras y Destino -->
  <div class="metrics-card">
    <div class="metric-item">
      <div class="metric-label">Monto para Retirar</div>
      <div class="metric-value-primary">$ {{monto_solicitado}}</div>
      <div class="metric-sub">Moneda legal colombiana (COP)</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Fondo de Cesantías</div>
      <div class="metric-value">{{fondo_cesantias}}</div>
      <div class="metric-sub">Administradora actual</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Modalidad / Destino</div>
      <div class="metric-value">{{tipo_retiro}}</div>
      <div class="metric-sub">{{motivo_retiro}}</div>
    </div>
  </div>

  <!-- Información del Trabajador Solicitante -->
  <section class="section-block">
    <div class="section-title">Información del Trabajador Solicitante</div>
    <table class="data-grid">
      <tr>
        <td class="data-label">Nombre Completo:</td>
        <td class="data-val" colspan="3"><strong>{{nombre_trabajador}}</strong></td>
      </tr>
      <tr>
        <td class="data-label">Documento de Identidad:</td>
        <td class="data-val">C.C. {{identificacion}}</td>
        <td class="data-label">Cargo:</td>
        <td class="data-val">{{cargo}}</td>
      </tr>
      <tr>
        <td class="data-label">Centro de Operaciones:</td>
        <td class="data-val">{{operacion}}</td>
        <td class="data-label">Regional:</td>
        <td class="data-val">{{regional}}</td>
      </tr>
      <tr>
        <td class="data-label">Teléfono de Contacto:</td>
        <td class="data-val">{{telefono}}</td>
        <td class="data-label">Correo Electrónico:</td>
        <td class="data-val">{{email}}</td>
      </tr>
      <tr>
        <td class="data-label">Ciudad y Fecha de Solicitud:</td>
        <td class="data-val">{{ciudad_solicitud}}, {{fecha_registro}}</td>
        <td class="data-label">Fecha de Ingreso a la Empresa:</td>
        <td class="data-val">{{fecha_ingreso}}</td>
      </tr>
    </table>
  </section>

  <!-- SECCIÓN CONDICIONAL: SE RENDERIZA VIVIENDA O EDUCACIÓN SEGÚN CORRESPONDA -->
  {{seccion_especifica}}

  <!-- Declaración Juramentada de Veracidad -->
  <section class="statement-box">
    <div class="statement-header">Declaración Juramentada de Utilización de Cesantías</div>
    <p class="statement-text">
      Yo, <strong>{{nombre_trabajador}}</strong>, identificado con cédula de ciudadanía N° <strong>{{identificacion}}</strong>, declaro bajo la gravedad de juramento que la información suministrada y los documentos anexos a esta solicitud gozan de total veracidad y corresponden a la realidad. En consecuencia, cualquier omisión o falsedad que se compruebe al respecto será considerada como falta disciplinaria grave, aceptando las consecuencias jurídicas y laborales pertinentes. Asimismo, autorizo expresamente a mi empleador <strong>APOYO LOGÍSTICO Y OPERATIVO S.A.S.</strong> para verificar, de ser necesario, la información y soportes aportados.
    </p>
  </section>

  <!-- Firma Electrónica del Solicitante -->
  <div class="signature-container">
    <div class="signature-card">
      <div class="sig-img-wrap">
        {{firma_trabajador_html}}
      </div>
      <div class="sig-line"></div>
      <div class="sig-name">{{nombre_trabajador}}</div>
      <div class="sig-details">
        C.C. {{identificacion}}<br>
        Firmado digitalmente el {{fecha_firma}}<br>
        <span style="font-size: 6.8pt; color: #94a3b8;">IP: {{ip_firma}} &bull; Token: {{token_firma}}</span>
      </div>
    </div>
  </div>

  <!-- Pie de página con auditoría -->
  <footer class="doc-footer">
    <span>Apoyo Logístico y Operativo S.A.S. &bull; Formato Digital de Cesantías</span>
    <span>Certificación electrónica bajo Ley 527 de 1999</span>
    <span>Página 1 de 1</span>
  </footer>

</body>
</html>`;

async function main() {
  console.log('=== Sembrando Plantilla "solicitud_cesantias" en Maestro_Plantillas ===\n');

  const [existentes] = await pool.execute(
    'SELECT id_plantilla FROM Maestro_Plantillas WHERE nombre_proceso = ? LIMIT 1',
    ['solicitud_cesantias']
  );

  if (existentes.length) {
    console.log(`Actualizando plantilla existente (id_plantilla: ${existentes[0].id_plantilla})...`);
    await pool.execute(
      `UPDATE Maestro_Plantillas SET
        tabla_datos = 'Dynamic_Cesantias',
        id_campo_fk = 'Id',
        bucket_carpeta = 'talenthub_central',
        requiere_firma_trabajador = 1,
        activo = 1,
        version = version + 1,
        contenido_html = ?,
        ultima_actualizacion = NOW()
       WHERE nombre_proceso = 'solicitud_cesantias'`,
      [PLANTILLA_HTML]
    );
    console.log('-> Plantilla "solicitud_cesantias" actualizada correctamente.');
  } else {
    console.log('Insertando nueva plantilla "solicitud_cesantias"...');
    await pool.execute(
      `INSERT INTO Maestro_Plantillas (
        nombre_proceso, tabla_datos, id_campo_fk, bucket_carpeta,
        requiere_firma_trabajador, activo, version, contenido_html, ultima_actualizacion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        'solicitud_cesantias',
        'Dynamic_Cesantias',
        'Id',
        'talenthub_central',
        1,
        1,
        1,
        PLANTILLA_HTML
      ]
    );
    console.log('-> Plantilla "solicitud_cesantias" insertada correctamente.');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('ERROR al sembrar plantilla:', err);
  process.exit(1);
});
