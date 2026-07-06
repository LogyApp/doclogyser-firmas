require('dotenv').config();
const pool = require('../src/services/db');

const newHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      font-size: 9.5pt;
      line-height: 1.45;
      color: #333;
      margin: 0;
      padding: 0;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .header-table td {
      border: 1px solid #333;
      padding: 6px 10px;
      vertical-align: middle;
      text-align: center;
    }
    .logo-cell {
      width: 25%;
    }
    .logo-cell img {
      max-width: 130px;
      height: auto;
    }
    .title-cell {
      width: 50%;
      font-weight: bold;
      font-size: 10.5pt;
      text-transform: uppercase;
    }
    .meta-cell {
      width: 25%;
      font-size: 8pt;
      text-align: left;
      line-height: 1.4;
    }
    h2 {
      font-size: 10.5pt;
      text-align: center;
      margin-top: 15px;
      margin-bottom: 15px;
      text-transform: uppercase;
    }
    .date-row {
      margin-bottom: 12px;
      font-weight: bold;
    }
    .content-p {
      text-align: justify;
      margin-bottom: 12px;
    }
    ol {
      margin-bottom: 15px;
      padding-left: 20px;
    }
    li {
      text-align: justify;
      margin-bottom: 6px;
    }
    .signature-container {
      width: 100%;
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
      page-break-inside: avoid;
    }
    .signature-block {
      width: 30%;
      text-align: center;
      font-size: 8.5pt;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      page-break-inside: avoid;
    }
    .signature-line {
      width: 100%;
      border-top: 1px solid #333;
      margin-top: 5px;
      padding-top: 5px;
      font-weight: bold;
      text-transform: uppercase;
    }
    .signature-img-wrapper {
      height: 75px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 5px;
    }
    .signature-img-wrapper img {
      max-height: 70px;
      max-width: 100%;
    }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td class="logo-cell">
        <img src="https://storage.googleapis.com/logyser-recibo-public/Logyser%20sin%20Nit.png" alt="LOG&SER">
      </td>
      <td class="title-cell">
        Compromiso de Cumplimiento de las Normas de Seguridad y Salud en el Trabajo
      </td>
      <td class="meta-cell">
        <strong>Código:</strong> SST-F-005<br>
        <strong>Versión:</strong> 0<br>
        <strong>Página:</strong> 1 de 1<br>
        <strong>Fecha:</strong> 28/05/2026
      </td>
    </tr>
  </table>

  <h2>Compromiso de Cumplimiento de las Normas de Seguridad y Salud en el Trabajo</h2>

  <div class="date-row">Fecha: {{fecha}}</div>

  <p class="content-p">
    Yo, <strong>{{nombre_trabajador}}</strong>, identificado(a) con documento de identidad No. <strong>{{identificacion}}</strong>, en calidad de trabajador(a) de <strong>{{operacion}}</strong>, manifiesto que he recibido la inducción correspondiente en Seguridad y Salud en el Trabajo, incluyendo la información relacionada con los riesgos y peligros asociados a mi cargo, las políticas de la empresa, los procedimientos de trabajo seguro y las medidas de prevención y control establecidas.
  </p>

  <p class="content-p">En consecuencia, me comprometo a:</p>

  <ol>
    <li>Cumplir con las políticas, normas, procedures e instrucciones de Seguridad y Salud en el Trabajo establecidas por la empresa.</li>
    <li>Utilizar de manera adecuada y permanente los Elementos de Protección Personal suministrados para el desarrollo de mis actividades.</li>
    <li>Velar por mi seguridad, salud y la de mis compañeros de trabajo.</li>
    <li>Reportar oportunamente actos y condiciones unsafe, incidentes, accidentes de trabajo y cualquier situación que pueda afectar la seguridad y salud de los trabajadores.</li>
    <li>Participar en las capacitaciones, entrenamientos, simulacros y demás actividades programadas por el Sistema de Gestión de Seguridad y Salud en el Trabajo.</li>
    <li>Cumplir las normas de orden y aseo en las áreas de trabajo.</li>
    <li>Acatar las medidas de prevención establecidas para la ejecución segura de mis labores.</li>
    <li>Informar de manera inmediata cualquier restricción médica o condición que pueda afectar el desempeño seguro de mis funciones.</li>
    <li>Cuidar y conservar los equipos, herramientas y elementos de protección entregados por la empresa.</li>
    <li>Contribuir al fortalecimiento de la cultura de prevención y autocuidado dentro de la organización.</li>
  </ol>

  <p class="content-p">
    Declaro que he comprendido la información suministrada y que conozco las consecuencias disciplinarias derivadas del incumplimiento de las normas de Seguridad y Salud en el Trabajo establecidas por la empresa y la legislación vigente.
  </p>

  <p class="content-p" style="margin-bottom: 20px;">Para constancia, firmo el presente compromiso.</p>

  <div class="signature-container">
    <div class="signature-block">
      <div class="signature-img-wrapper">
        {{firma_trabajador}}
      </div>
      <div class="signature-line">
        {{nombre_trabajador}}<br>
        <span style="font-weight: normal; font-size: 8pt; text-transform: none;">C.C. {{identificacion}}</span>
      </div>
    </div>
    
    <div class="signature-block">
      <div class="signature-img-wrapper">
        {{firma_analista}}
      </div>
      <div class="signature-line">
        Analista SST<br>
        <span style="font-weight: normal; font-size: 8pt; text-transform: none;">{{nombre_analista}}</span>
      </div>
    </div>
    
    <div class="signature-block">
      <div class="signature-img-wrapper">
        {{firma_lidersst}}
      </div>
      <div class="signature-line">
        Lider SST<br>
        <span style="font-weight: normal; font-size: 8pt; text-transform: none;">{{nombre_lidersst}}</span>
      </div>
    </div>
  </div>
</body>
</html>`;

async function run() {
  try {
    const [result] = await pool.execute(
      'UPDATE Maestro_Plantillas SET contenido_html = ? WHERE LOWER(nombre_proceso) = LOWER(?)',
      [newHtml, 'compromisosst']
    );
    console.log('Plantilla actualizada en la base de datos. Filas afectadas:', result.affectedRows);
  } catch (err) {
    console.error('Error al actualizar plantilla:', err);
  } finally {
    await pool.end();
  }
}

run();
