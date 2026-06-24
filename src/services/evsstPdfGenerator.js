const { generarPDF } = require('./renderer');

function formatFechaCO(fecha) {
  if (!fecha) return '';
  const str = fecha instanceof Date ? fecha.toISOString().slice(0, 10) : String(fecha).slice(0, 10);
  const d = new Date(str + 'T12:00:00');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });
}

function limpiarNombre(n) {
  if (!n) return '';
  const p = String(n).split(' ** ');
  return (p.length > 1 ? p[1] : n).trim();
}

async function renderPDF(ev, vin, evaluadorNombre) {
  const isInduccion = ev.tipo === 'Inducción';
  const isReinduccion = ev.tipo === 'Reinducción';
  const isAprobado = ev.resultado === 'APROBADO';
  const isNoAprobado = ev.resultado === 'NO APROBADO';
  const puntaje = ev.puntaje !== null ? ev.puntaje : 0;
  const fechaFmt = formatFechaCO(ev.fecha);

  function box(checked) {
    return `<span class="box">${checked ? 'X' : '&nbsp;'}</span>`;
  }

  // Parse p9 selected values (expect comma-separated string or array)
  let p9Selections = [];
  if (ev.p9) {
    try {
      p9Selections = JSON.parse(ev.p9);
    } catch {
      p9Selections = String(ev.p9).split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  // Check signature status
  let firmaHtml = '';
  if (ev.firma_trabajador) {
    firmaHtml = `<img src="${ev.firma_trabajador}" style="max-height: 80px; max-width: 250px; display: block; margin: 4px auto;" />`;
  } else {
    firmaHtml = `<div class="no-firmo">No firmó dentro del plazo de 48 horas</div>`;
  }

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

    .q1-images { display: flex; gap: 20px; margin: 6px 0 6px 12px; }
    .q1-img-box { text-align: center; }
    .q1-img-box img { height: 90px; border: 1px solid #ddd; border-radius: 4px; display: block; margin-bottom: 4px; }
    .q1-img-box .option { justify-content: center; }

    .compromiso-box { margin-top: 15px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 8pt; text-align: justify; page-break-inside: avoid; }
    .compromiso-box p { margin: 4px 0; }

    /* Signature Table */
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
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" alt="LOG&SER">
      </td>
      <td class="title-col">
        EVALUACIÓN DE INDUCCIÓN - CAPACITACIÓN<br>SST
      </td>
      <td class="meta-col">
        <strong>F-SST-001</strong><br>
        FECHA: 28/05/2026<br>
        <strong>VERSION:02</strong>
      </td>
    </tr>
  </table>

  <!-- Info Table -->
  <table class="info-table">
    <tr>
      <td class="label">Fecha:</td>
      <td>${fechaFmt}</td>
      <td class="label">Evaluación:</td>
      <td>
        ${box(isInduccion)} Inducción &nbsp;&nbsp;
        ${box(isReinduccion)} Reinducción
      </td>
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
      <td style="font-weight: bold;">${puntaje} / 13</td>
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
    <p>Esta evaluación se realiza en cumplimiento de los requisitos legales vigentes del Sistema de Gestión de Seguridad y Salud en el Trabajo y de las políticas internas de prevención de riesgos laborales de la empresa.</p>
    <p><strong>OBJETIVO:</strong> Verificar la comprensión y apropiación de los conceptos, procedimientos, normas y controles establecidos en el Sistema de Gestión de Seguridad y Salud en el Trabajo, así como de los riesgos asociados a las actividades logísticas desarrolladas por la organización.</p>
    <p><strong>INSTRUCCIONES:</strong> Lea cuidadosamente cada pregunta y seleccione la respuesta que considere correcta. La aprobación de esta evaluación es requisito para el inicio o continuidad de las actividades laborales dentro de la organización.</p>
  </div>

  <h2>Cuestionario de Evaluación</h2>

  <!-- Q1 -->
  <div class="question">
    <div class="question-title">1. Indique cuál de las siguientes imágenes es un acto inseguro:</div>
    <div class="q1-images">
      <div class="q1-img-box">
        <img src="https://storage.googleapis.com/logyser-recursos-corporativos/Imagenes/Actoinseguro1.png" alt="Acto Inseguro 1">
        <div class="option">${box(ev.p1 === 'Imagen 1')} Imagen 1</div>
      </div>
      <div class="q1-img-box">
        <img src="https://storage.googleapis.com/logyser-recursos-corporativos/Imagenes/Actoinseguro2.png" alt="Acto Inseguro 2">
        <div class="option">${box(ev.p1 === 'Imagen 2')} Imagen 2</div>
      </div>
    </div>
  </div>

  <!-- Q2 -->
  <div class="question">
    <div class="question-title">2. Que es un accidente de trabajo</div>
    <div class="options">
      <div class="option">${box(ev.p2 === 'a')} a. Es todo suceso repentino que sobrevenga por causa o con ocasión del trabajo.</div>
      <div class="option">${box(ev.p2 === 'b')} b. Puede producir en el trabajador una lesión orgánica, una perturbación funcional, una invalidez o la muerte.</div>
      <div class="option">${box(ev.p2 === 'c')} c. A y B son correctas.</div>
      <div class="option">${box(ev.p2 === 'd')} d. Solo la A es correcta.</div>
    </div>
  </div>

  <!-- Q3 -->
  <div class="question">
    <div class="question-title">3. ¿Qué significa la sigla SGSST?</div>
    <div class="options">
      <div class="option">${box(ev.p3 === 'a')} a. Sistema de Gestión de Seguridad y Salud en la operación</div>
      <div class="option">${box(ev.p3 === 'b')} b. Sistema General de Servicios de Salud y Trabajo.</div>
      <div class="option">${box(ev.p3 === 'c')} c. Servicio de Gestión de Seguridad Social y Trabajo.</div>
      <div class="option">${box(ev.p3 === 'd')} d. Sistema de Gestión de Seguridad y Salud en el trabajo</div>
    </div>
  </div>

  <!-- Q4 -->
  <div class="question">
    <div class="question-title">4. ¿Qué es Enfermedad Laboral?</div>
    <div class="options">
      <div class="option">${box(ev.p4 === 'a')} a. Enfermedad causada por el trabajo</div>
      <div class="option">${box(ev.p4 === 'b')} b. Enfermedad hereditaria.</div>
      <div class="option">${box(ev.p4 === 'c')} c. Enfermedad adquirida en vacaciones.</div>
      <div class="option">${box(ev.p4 === 'd')} d. Enfermedad sin relación con el trabajo.</div>
      <div class="option">${box(ev.p4 === 'e')} e. Enfermedad por mala alimentación.</div>
    </div>
  </div>

  <!-- Q5 -->
  <div class="question">
    <div class="question-title">5. Que accidentes puedo sufrir en mi lugar de trabajo</div>
    <div class="options">
      <div class="option">${box(ev.p5 === 'a')} a. Caídas, golpes, heridas, contusiones</div>
      <div class="option">${box(ev.p5 === 'b')} b. Dolor de estómago, estrés, fatigas.</div>
      <div class="option">${box(ev.p5 === 'c')} c. Ninguna de las anteriores.</div>
    </div>
  </div>

  <!-- Q6 -->
  <div class="question">
    <div class="question-title">6. ¿Cuál es su ARL y en cuánto tiempo se reporta un accidente de trabajo?</div>
    <div class="options">
      <div class="option">${box(ev.p6 === 'a')} a. ARL: Seguros Bolívar, reporte en 48 horas.</div>
      <div class="option">${box(ev.p6 === 'b')} b. ARL: Sura, reporte en 15 días.</div>
      <div class="option">${box(ev.p6 === 'c')} c. ARL: Colmena, reporte en 30 días.</div>
      <div class="option">${box(ev.p6 === 'd')} d. ARL: Positiva, reporte 48 días</div>
    </div>
  </div>

  <!-- Q7 -->
  <div class="question">
    <div class="question-title">7. Que es el COPASST.</div>
    <div class="options">
      <div class="option">${box(ev.p7 === 'a')} a. Es una medida preventiva del acoso laboral.</div>
      <div class="option">${box(ev.p7 === 'b')} b. Es un organismo de promoción y vigilancia de las normas y reglamentos de Seguridad y salud en el trabajo dentro de la empresa.</div>
      <div class="option">${box(ev.p7 === 'c')} c. A y B son correctas</div>
    </div>
  </div>

  <!-- Q8 -->
  <div class="question">
    <div class="question-title">8. Que es el Comité de Convivencia</div>
    <div class="options">
      <div class="option">${box(ev.p8 === 'a')} a. Es una medida preventiva del acoso laboral.</div>
      <div class="option">${box(ev.p8 === 'b')} b. Es un comité para dirigir las rutas de evacuación</div>
      <div class="option">${box(ev.p8 === 'c')} c. Fomenta estilos de vida saludables</div>
      <div class="option">${box(ev.p8 === 'd')} d. A y C son correctas</div>
    </div>
  </div>

  <!-- Q9 -->
  <div class="question">
    <div class="question-title">9. Describa algunos riesgos a los que se encuentra expuesto en su lugar de trabajo:</div>
    <div class="options">
      <div class="option">${box(p9Selections.includes('Riesgo locativo'))} Riesgo locativo (caídas, golpes, superficies irregulares).</div>
      <div class="option">${box(p9Selections.includes('Riesgo biomecánico'))} Riesgo biomecánico (levantamiento y manipulación de cargas).</div>
      <div class="option">${box(p9Selections.includes('Riesgo físico'))} Riesgo físico (ruido, iluminación, temperatura).</div>
      <div class="option">${box(p9Selections.includes('Riesgo químico'))} Riesgo químico (combustibles, sustancias químicas, polvo).</div>
      <div class="option">${box(p9Selections.includes('Riesgo de tránsito'))} Riesgo de tránsito (desplazamiento de vehículos y montacargas).</div>
      <div class="option">${box(p9Selections.includes('Riesgo psicosocial'))} Riesgo psicosocial (estrés laboral, carga de trabajo).</div>
    </div>
  </div>

  <!-- Q10 -->
  <div class="question">
    <div class="question-title">10. ¿Qué debe hacer si es víctima o testigo de una situación de acoso sexual en el trabajo?</div>
    <div class="options">
      <div class="option">${box(ev.p10 === 'a')} a. Informar la situación a los canales establecidos por la empresa.</div>
      <div class="option">${box(ev.p10 === 'b')} b. Ignorar la situación.</div>
      <div class="option">${box(ev.p10 === 'c')} c. Compartir la situación con otros compañeros sin reportarla.</div>
    </div>
  </div>

  <!-- Q11 -->
  <div class="question">
    <div class="question-title">11. En materia de seguridad vial, ¿cuál de las siguientes acciones es obligatoria?</div>
    <div class="options">
      <div class="option">${box(ev.p11 === 'a')} a. No estar certificado como operador</div>
      <div class="option">${box(ev.p11 === 'b')} b. Exceder los límites de velocidad para llegar más rápido</div>
      <div class="option">${box(ev.p11 === 'c')} c. Cumplir las normas de tránsito y conducir de manera segura</div>
      <div class="option">${box(ev.p11 === 'd')} d. Utilizar el celular mientras conduce.</div>
    </div>
  </div>

  <!-- Q12 -->
  <div class="question">
    <div class="question-title">12. ¿Qué establece la Política de Seguridad y Salud en el Trabajo de la empresa?</div>
    <div class="options">
      <div class="option">${box(ev.p12 === 'a')} a. El aumento de la producción sin importar los riesgos laborales.</div>
      <div class="option">${box(ev.p12 === 'b')} b. El compromiso de prevenir accidentes de trabajo y enfermedades laborales.</div>
      <div class="option">${box(ev.p12 === 'c')} c. La aplicación de amonestaciones a todos los trabajadores.</div>
      <div class="option">${box(ev.p12 === 'd')} d. Reducir las horas extras.</div>
    </div>
  </div>

  <!-- Q13 -->
  <div class="question">
    <div class="question-title">13. En caso de una emergencia, ¿qué debe hacer primero?</div>
    <div class="options">
      <div class="option">${box(ev.p13 === 'a')} a. Seguir la ruta de evacuación y dirigirse al punto de encuentro.</div>
      <div class="option">${box(ev.p13 === 'b')} b. Continuar trabajando hasta recibir otra instrucción.</div>
      <div class="option">${box(ev.p13 === 'c')} c. Salir corriendo sin seguir las indicaciones.</div>
    </div>
  </div>

  <!-- Legal Declarations -->
  <div class="compromiso-box">
    <p>Declaro que he recibido capacitación en Seguridad y Salud en el Trabajo, comprendiendo la información relacionada con las políticas, normas, procedimientos, riesgos asociados a mi labor, medidas de prevención, reporte de incidentes y accidentes, uso adecuado de los elementos de protección personal y demás aspectos aplicables a mis funciones.</p>
    <p>Así mismo, me comprometo a cumplir las normas de Seguridad y Salud en el Trabajo establecidas por la empresa, utilizar correctamente los elementos de protección personal suministrados y participar activamente en las actividades de prevención y promoción de la seguridad y salud en el trabajo.</p>
    <p>En constancia, firmo el presente documento.</p>
  </div>

  <!-- Signatures Block -->
  <div style="width: 50%; border: 1px solid #000; padding: 6px; margin-top: 15px; page-break-inside: avoid;">
    <div class="sign-title" style="font-weight: bold; font-size: 8.5pt; background: #f5f5f5; border-bottom: 1px solid #000; margin: -6px -6px 6px -6px; padding: 4px 6px;">TRABAJADOR</div>
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
