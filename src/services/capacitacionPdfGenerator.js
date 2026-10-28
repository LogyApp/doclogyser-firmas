const pool = require('./db');
const { generarPDF, generarPDFDesdeHTML } = require('./renderer');
const { LOGO_BASE64 } = require('./assets');

const NOMBRE_PLANTILLA = 'capacitacion_sst';

const FORMATO_DEFAULTS = {
  codigo: 'F-SST-002',
  version: '02',
  fecha: '28/05/2026',
};

function esc(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatFechaCO(fecha) {
  if (!fecha) return '';
  const str = fecha instanceof Date ? `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}` : String(fecha).slice(0, 10);
  const d = new Date(str + 'T12:00:00');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });
}

function fechaHoraBogotaTexto(d = new Date()) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

function limpiarNombre(n) {
  if (!n) return '';
  const p = String(n).split(' ** ');
  return (p.length > 1 ? p[1] : n).trim();
}

async function obtenerFormatoCapacitacion() {
  const formato = { ...FORMATO_DEFAULTS };
  try {
    const [rows] = await pool.execute(
      "SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'Capacitación SST'"
    );
    for (const r of rows) {
      const c = String(r.Concepto || '').trim();
      const v = String(r.Parametro || '').trim();
      if (!v) continue;
      if (c === 'Código del formato de capacitación SST') formato.codigo = v;
      else if (c === 'Versión del formato de capacitación SST') formato.version = v;
      else if (c === 'Fecha del formato de capacitación SST') formato.fecha = v;
    }
  } catch (err) {
    console.warn('[capacitacionPdfGenerator] No se pudieron leer parámetros de formato, se usan valores por defecto:', err.message);
  }
  return formato;
}

function armarCuestionarioPlantillaHtml(preguntasList) {
  const letras = ['a', 'b', 'c', 'd', 'e', 'f'];
  return preguntasList.map((q) => {
    const opcionesHtml = (q.opciones || []).map((opt, idx) => {
      const letra = letras[idx] ? `${letras[idx]}. ` : '';
      const sel = !!opt.seleccionada;
      return `
      <div class="q-option${sel ? ' selected' : ''}">
        <span class="q-check">${sel ? '&#10003;' : ''}</span>
        <span>${esc(letra + (opt.opcion || ''))}</span>
      </div>`;
    }).join('');
    return `
    <div class="q-card">
      <div class="q-title">${esc(q.pregunta)}. ${esc(q.descripcion_pregunta)}</div>
      <div class="q-options">${opcionesHtml}</div>
    </div>`;
  }).join('\n');
}

async function armarHtmlDesdePlantilla({ ev, vin, evaluadorNombre, preguntasList }) {
  let plantilla = null;
  try {
    const [rows] = await pool.execute(
      'SELECT contenido_html FROM Maestro_Plantillas WHERE nombre_proceso = ? AND activo = 1 ORDER BY version DESC LIMIT 1',
      [NOMBRE_PLANTILLA]
    );
    plantilla = rows.length ? rows[0].contenido_html : null;
  } catch (err) {
    console.warn('[capacitacionPdfGenerator] No se pudo leer la plantilla capacitacion_sst:', err.message);
  }
  if (!plantilla) return null;

  const formato = await obtenerFormatoCapacitacion();
  const isAprobado = ev.resultado === 'APROBADO';
  const puntaje = ev.puntaje !== null && ev.puntaje !== undefined ? ev.puntaje : 0;
  const totalPreguntas = preguntasList.length;
  const fechaFmt = formatFechaCO(ev.fecha);

  const resultadoHtml = isAprobado
    ? '<span class="badge-aprobado">APROBADO</span>'
    : '<span class="badge-no-aprobado">NO APROBADO</span>';

  const firmaTrabajadorHtml = ev.firma_trabajador
    ? `<img src="${esc(ev.firma_trabajador)}" class="sig-img" alt="Firma">`
    : '<span class="firma-nota">No firmó dentro del plazo de 48 horas</span>';

  const datos = {
    logo_src: LOGO_BASE64,
    codigo_formato: esc(formato.codigo),
    version_formato: esc(formato.version),
    fecha_formato: esc(formato.fecha),
    id_capacitacion: esc(ev.id_capacitacion || '—'),
    fecha: esc(fechaFmt || '—'),
    tema: esc(ev.tema || 'Capacitación SST'),
    objetivo: esc(ev.objetivo || 'Verificar la comprensión y apropiación de los conceptos impartidos en la capacitación de Seguridad y Salud en el Trabajo.'),
    puntaje: esc(puntaje),
    total_preguntas: esc(totalPreguntas),
    resultado_html: resultadoHtml,
    nombre_trabajador: esc(limpiarNombre(vin && vin.Trabajador)) || '—',
    identificacion: esc(ev.identificacion) || '—',
    cargo: esc(vin && vin.Cargo) || '—',
    operacion: esc(vin && (vin.operacion || vin['Operación'])) || '—',
    regional: esc(vin && (vin.regional || vin.Regional)) || '—',
    nombre_evaluador: esc(limpiarNombre(evaluadorNombre)) || '—',
    cuestionario_html: armarCuestionarioPlantillaHtml(preguntasList),
    firma_trabajador_html: firmaTrabajadorHtml,
    fecha_generacion: fechaHoraBogotaTexto(),
  };

  return plantilla.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, clave) => (
    Object.prototype.hasOwnProperty.call(datos, clave) ? String(datos[clave]) : ''
  ));
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

  const htmlPlantilla = await armarHtmlDesdePlantilla({ ev, vin, evaluadorNombre, preguntasList });
  if (htmlPlantilla) {
    return generarPDFDesdeHTML(htmlPlantilla, {
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });
  }

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
        <div style="font-size: 11pt; font-weight: 800; color: #000b59; letter-spacing: 0.4px; text-transform: uppercase; line-height: 1.25;">EVALUACIÓN DE CAPACITACIÓN SST</div>
        <div style="font-size: 8pt; font-weight: 700; color: #c2410c; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.3px;">${esc(ev.tema || 'Capacitación SST')}</div>
        <div style="font-size: 7pt; color: #475569; font-weight: 600; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.2px;">SISTEMA DE GESTIÓN DE SEGURIDAD Y SALUD EN EL TRABAJO</div>
      </td>
      <td class="meta-col">
        <div style="font-weight: 800; color: #000b59; font-size: 8.5pt;">${formato.codigo}</div>
        <div style="color: #334155;">Versión: ${formato.version}</div>
        <div style="color: #64748b; font-size: 7.5pt;">${formato.fecha}</div>
        <div style="margin-top: 2px; font-size: 7pt; color: #000b59; font-weight: 800;">ID: #${ev.id_capacitacion || '—'}</div>
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
