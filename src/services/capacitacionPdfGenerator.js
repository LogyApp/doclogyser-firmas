const { generarPDF } = require('./renderer');
const { LOGO_BASE64 } = require('./assets');

function formatFechaCO(fecha) {
  if (!fecha) return '';
  const str = fecha instanceof Date ? `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}` : String(fecha).slice(0, 10);
  const d = new Date(str + 'T12:00:00');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });
}

function limpiarNombre(n) {
  if (!n) return '';
  const p = String(n).split(' ** ');
  return (p.length > 1 ? p[1] : n).trim();
}

async function renderPDF(ev, vin, evaluadorNombre, items) {
  const isAprobado = ev.resultado === 'APROBADO';
  const isNoAprobado = ev.resultado === 'NO APROBADO';
  const puntaje = ev.puntaje !== null ? ev.puntaje : 0;
  const fechaFmt = formatFechaCO(ev.fecha);

  function box(checked) {
    return `<span class="box">${checked ? 'X' : '&nbsp;'}</span>`;
  }

  // Agrupar los ítems por número de pregunta
  const preguntasMap = {};
  items.forEach(item => {
    const qNum = item.pregunta;
    if (!preguntasMap[qNum]) {
      preguntasMap[qNum] = {
        pregunta: qNum,
        descripcion_pregunta: item.descripcion_pregunta,
        opciones: []
      };
    }
    preguntasMap[qNum].opciones.push({
      opcion: item.opciones || item.opcion,
      correcta: item.Correcta === 'SI' || item.correcta === 'SI',
      seleccionada: item.seleccionada === 'SI'
    });
  });

  const preguntasList = Object.values(preguntasMap).sort((a, b) => a.pregunta - b.pregunta);
  const totalPreguntas = preguntasList.length;

  let firmaHtml = '';
  if (ev.firma_trabajador) {
    firmaHtml = `<img src="${ev.firma_trabajador}" style="max-height: 80px; max-width: 250px; display: block; margin: 4px auto;" />`;
  } else {
    firmaHtml = `<div class="no-firmo">No firmó dentro del plazo de 48 horas</div>`;
  }

  // Generar HTML de las preguntas dinámicamente
  let cuestionarioHtml = '';
  preguntasList.forEach(q => {
    cuestionarioHtml += `
      <div class="question">
        <div class="question-title">${q.pregunta}. ${q.descripcion_pregunta}</div>
        <div class="options">
    `;
    
    // Asignar letras A, B, C, D... a las opciones
    const letras = ['A', 'B', 'C', 'D', 'E', 'F'];
    q.opciones.forEach((opt, idx) => {
      const letra = letras[idx] || '';
      cuestionarioHtml += `
        <div class="option">
          ${box(opt.seleccionada)} ${letra ? letra + '. ' : ''}${opt.opcion}
        </div>
      `;
    });

    cuestionarioHtml += `
        </div>
      </div>
    `;
  });

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 12mm 15mm 12mm 15mm; }
    body { font-family: Arial, sans-serif; font-size: 8.5pt; line-height: 1.3; color: #222; margin: 0; }
    
    /* Header Table */
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .header-table td { border: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle; }
    .header-table .logo-col { width: 25%; }
    .header-table .logo-col img { height: 42px; display: block; margin: 0 auto; }
    .header-table .title-col { width: 50%; font-weight: bold; font-size: 11pt; }
    .header-table .meta-col { width: 25%; font-size: 7.5pt; text-align: left; padding-left: 8px; }

    /* Info Table */
    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .info-table td { border: 1px solid #000; padding: 4px 6px; font-size: 9pt; }
    .info-table td.label { font-weight: bold; background-color: #f5f5f5; width: 22%; }
    
    .intro-text { font-size: 8pt; color: #444; margin-bottom: 10px; text-align: justify; }
    .intro-text p { margin: 3px 0; }

    h2 { font-size: 9.5pt; font-weight: bold; border-bottom: 1.5px solid #000; margin: 14px 0 6px; text-transform: uppercase; padding-bottom: 2px; }
    
    .question { margin-bottom: 10px; page-break-inside: avoid; }
    .question-title { font-weight: bold; margin-bottom: 4px; }
    
    .options { margin-left: 12px; }
    .option { display: flex; align-items: center; margin-bottom: 3px; }
    
    .box {
      display: inline-block;
      width: 10px;
      height: 10px;
      border: 1px solid #000;
      text-align: center;
      line-height: 9px;
      font-size: 7.5pt;
      font-family: Arial, sans-serif;
      font-weight: bold;
      margin-right: 6px;
      flex-shrink: 0;
    }

    .compromiso-box { margin-top: 15px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 8pt; text-align: justify; page-break-inside: avoid; }
    .compromiso-box p { margin: 4px 0; }

    .sign-table { width: 100%; border-collapse: collapse; margin-top: 15px; page-break-inside: avoid; }
    .sign-table td { border: 1px solid #000; padding: 6px; vertical-align: top; width: 50%; }
    .sign-title { font-weight: bold; font-size: 8.5pt; background: #f5f5f5; border-bottom: 1px solid #000; margin: -6px -6px 6px -6px; padding: 4px 6px; }
    .no-firmo { border: 1.5px solid #e74c3c; border-radius: 4px; padding: 8px; color: #e74c3c; font-size: 8.5pt; font-weight: bold; text-align: center; margin: 10px auto; width: 80%; }

    .footer { margin-top: 20px; border-top: 2px solid #F55400; padding-top: 6px; text-align: center; font-size: 7pt; color: #000b59; letter-spacing: 0.2px; }
  </style>
</head>
<body>

  <!-- Header -->
  <table class="header-table">
    <tr>
      <td class="logo-col">
        <img src="${LOGO_BASE64}" alt="LOG&SER">
      </td>
      <td class="title-col">
        EVALUACIÓN DE CAPACITACIÓN<br>SST
      </td>
      <td class="meta-col">
        <strong>F-SST-002</strong><br>
        FECHA: 28/05/2026<br>
        <strong>VERSION: 01</strong>
      </td>
    </tr>
  </table>

  <!-- Info Table -->
  <table class="info-table">
    <tr>
      <td class="label">Fecha:</td>
      <td>${fechaFmt}</td>
      <td class="label">Capacitación:</td>
      <td>Evaluación de Capacitación SST</td>
    </tr>
    <tr>
      <td class="label">Nombre del trabajador:</td>
      <td>${limpiarNombre(vin.Trabajador)}</td>
      <td class="label">Cédula:</td>
      <td>${ev.identificacion}</td>
    </tr>
    <tr>
      <td class="label">Nombre del evaluador:</td>
      <td>${limpiarNombre(evaluadorNombre)}</td>
      <td class="label">Puntaje obtenido:</td>
      <td style="font-weight: bold;">${puntaje} / ${totalPreguntas}</td>
    </tr>
    <tr>
      <td class="label">Resultado:</td>
      <td colspan="3" style="font-weight: bold;">
        ${box(isAprobado)} APROBADO &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        ${box(isNoAprobado)} NO APROBADO
      </td>
    </tr>
  </table>

  <!-- Intro -->
  <div class="intro-text">
    <p><strong>TEMA:</strong> ${ev.tema}</p>
    <p><strong>OBJETIVO:</strong> ${ev.objetivo}</p>
    <p><strong>INSTRUCCIONES:</strong> Lea cuidadosamente cada pregunta y seleccione la respuesta que considere correcta. La aprobación de esta evaluación es requisito para el inicio o continuidad de las actividades laborales dentro de la organización.</p>
  </div>

  <h2>Cuestionario de Evaluación</h2>

  ${cuestionarioHtml}

  <!-- Legal Declarations -->
  <div class="compromiso-box">
    <p>Declaro que he recibido capacitación en Seguridad y Salud en el Trabajo, comprendiendo la información relacionada con las políticas, normas, procedimientos, riesgos asociados a mi labor, medidas de prevención, reporte de incidentes y accidentes, uso adecuado de los elementos de protección personal y demás aspectos aplicables a mis funciones.</p>
    <p>Así mismo, me comprometo a cumplir las normas de Seguridad y Salud en el Trabajo establecidas por la empresa, utilizar correctamente los elementos de protección personal suministrados y participar activamente en las actividades de prevención y promoción de la seguridad y salud en el trabajo.</p>
    <p>En constancia, firmo el presente documento.</p>
  </div>

  <!-- Signatures Block -->
  <div style="width: 50%; border: 1px solid #000; padding: 6px; margin-top: 15px; page-break-inside: avoid;">
    <div class="sign-title">TRABAJADOR</div>
    <div style="height: 85px; display: flex; align-items: center; justify-content: center;">
      ${firmaHtml}
    </div>
    <div style="border-top: 1px solid #ccc; font-size: 8pt; padding-top: 3px; margin-top: 4px;">
      <strong>Nombre:</strong> ${limpiarNombre(vin.Trabajador)}<br>
      <strong>Cédula:</strong> ${ev.identificacion}
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    DIAGONAL 74B No. 33° 51-55 — ANTIGUA TRANSVERSAL 39° No 70° 51-55 — LAURELES - MEDELLÍN
  </div>

</body>
</html>`;

  return generarPDF(html);
}

module.exports = { renderPDF };
