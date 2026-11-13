const path = require('path');
const crypto = require('crypto');
const pool = require('./db');
const { generarPDFDesdeHTML } = require('./renderer');
const { obtenerFirmaBase64Reciente, subirFirma } = require('./storage');
const { reemplazarVariables, aplicarFormatoPlantilla, firmaConFecha } = require('./plantilla');
const { LOGO_BASE64 } = require('./assets');
const formularios = require('./formulariosSeleccion');

// La lista de documentos para firma sale de Config_Doc_Trabajador (Clasificacion
// "3. Documentos para Firmas") y la regla por operación de Config_Parametros:
// ver services/docsSeleccion.js.
const { obtenerDocsFirmaParaOperacion, obtenerDocFirma } = require('./docsSeleccion');
// Manual de funciones (MF): contenido del cargo publicado en Talent Hub › Cargos y Funciones
const { obtenerManualPublicado, variablesManual } = require('./manualFunciones');

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

async function obtenerDatosAspiranteParaFirma(idAspirante, idConfigDoc) {
  const [aspRows] = await pool.execute(
    'SELECT * FROM Dynamic_hv_aspirante WHERE id_aspirante = ?',
    [idAspirante]
  );
  if (!aspRows.length) return null;
  const aspirante = aspRows[0];

  if (!aspirante.IdRequisicion) {
    throw new Error("El aspirante no tiene una requisición vinculada.");
  }
  if (aspirante.estado_proceso !== 'En proceso' && aspirante.estado_proceso !== 'contratado') {
    throw new Error("El aspirante no se encuentra en estado 'En proceso'.");
  }

  const docItem = await obtenerDocFirma(idConfigDoc);
  const prefijo = docItem ? docItem.prefijo : null;

  // Requisición
  let cargo = 'Colaborador';
  let operacion = '';
  let regional = '';
  if (aspirante.IdRequisicion) {
    const [reqRows] = await pool.execute(
      'SELECT `Cargo Requerido`, `Operación`, `Regional` FROM Dynamic_Requisiciones WHERE IdRequisicion = ? LIMIT 1',
      [aspirante.IdRequisicion]
    );
    if (reqRows.length > 0) {
      cargo = reqRows[0]['Cargo Requerido'] || cargo;
      operacion = reqRows[0]['Operación'] || operacion;
      regional = reqRows[0]['Regional'] || regional;
    }
  }

  // Validación: el documento debe aplicar a la operación de la requisición
  // (regla en Config_Parametros talenthub/Aspirantes; ej. Formatos Italcol solo en "Italcol La Estrella")
  if (docItem) {
    const aplicables = await obtenerDocsFirmaParaOperacion(operacion);
    if (!aplicables.some(d => d.id === docItem.id)) {
      throw new Error(`El documento ${docItem.etiqueta || docItem.nombre} no aplica para la operación '${operacion || 'sin operación'}'`);
    }
  }

  // Plantilla desde Maestro_Plantillas
  let contenidoHtml = '';
  if (prefijo) {
    const [plantillaRows] = await pool.execute(
      `SELECT contenido_html, codigo_formato, version_formato, fecha_version FROM Maestro_Plantillas
       WHERE nombre_proceso = ? AND activo = 1 ORDER BY version DESC LIMIT 1`,
      [prefijo]
    );
    // Las plantillas de selección se administran solo en Maestro_Plantillas
    // (los archivos de src/templates/seleccion quedan como base para SST).
    // El encabezado toma código, versión y fecha del formato de la misma fila.
    if (plantillaRows.length > 0 && plantillaRows[0].contenido_html) {
      const fila = plantillaRows[0];
      const fechaFormato = fila.fecha_version
        ? (fila.fecha_version instanceof Date
            ? fila.fecha_version.toISOString().slice(0, 10)
            : String(fila.fecha_version).slice(0, 10)).split('-').reverse().join('/')
        : '';
      contenidoHtml = aplicarFormatoPlantilla(fila.contenido_html, {
        codigo: fila.codigo_formato ? String(fila.codigo_formato).trim() : '',
        version: fila.version_formato ? String(fila.version_formato).trim() : '',
        fecha: fechaFormato
      });
      // Si la plantilla no tiene fecha del formato, no se muestra el marcador
      contenidoHtml = contenidoHtml.replace(/\{\{\s*(codigo_formato|version_formato|fecha_formato)\s*\}\}/g, '');
    }
  }

  // Documento cargado previamente
  const [docRows] = await pool.execute(
    'SELECT estado, gcs_path, fuente FROM Dynamic_hv_documentos WHERE id_aspirante = ? AND id_config_doc = ?',
    [idAspirante, idConfigDoc]
  );
  const docActual = docRows.length > 0 ? docRows[0] : null;

  // Firma previa (GCS o registro en aspirante)
  let firmaPrevia = null;
  try {
    firmaPrevia = await obtenerFirmaBase64Reciente(aspirante.identificacion);
  } catch (err) {
    console.warn('[Firma] Error al consultar firma en bucket:', err.message);
  }

  if (!firmaPrevia && aspirante.firma_url) {
    firmaPrevia = aspirante.firma_url;
  }

  // Variables para la plantilla
  const ahoraBogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const nombreCompleto = [
    aspirante.primer_nombre,
    aspirante.segundo_nombre,
    aspirante.primer_apellido,
    aspirante.segundo_apellido
  ].filter(n => n && n.trim() !== '').join(' ').trim().toUpperCase();

  const variables = {
    nombre_completo: nombreCompleto,
    identificacion: aspirante.identificacion || '',
    cargo: cargo,
    operacion: operacion,
    regional: regional,
    ciudad_expedicion: aspirante.ciudad_expedicion || aspirante.departamento_expedicion || aspirante.ciudad || 'Bogotá',
    municipio_firma: aspirante.ciudad || regional || 'Bogotá D.C.',
    eps: aspirante.eps || 'EPS No reportada',
    dia_firma: String(ahoraBogota.getDate()),
    mes_firma: MESES[ahoraBogota.getMonth()],
    anio_firma: String(ahoraBogota.getFullYear()),
    // Diseño moderno (mismo estilo de los formatos de SST y Cesantías)
    logo_src: LOGO_BASE64,
    fecha_generacion: ahoraColombia().texto.replace(' a las ', ', ').replace(/:\d{2}$/, '')
  };

  // Los datos del aspirante son texto: se escapan para que un símbolo como "<" en un
  // nombre no se interprete como HTML y desarme el documento (pasó con "AGUILAR<RODRIGUEZ")
  for (const clave of Object.keys(variables)) {
    if (clave !== 'logo_src' && typeof variables[clave] === 'string') variables[clave] = escHtml(variables[clave]);
  }

  // Manual de funciones: se llena con el manual publicado del cargo de la requisición. Sin manual
  // publicado no se puede firmar (motivoManual bloquea la firma; ver motivoBloqueoFirma).
  let motivoManual = null;
  if (prefijo === 'MF') {
    let manual = null;
    try {
      manual = await obtenerManualPublicado(cargo);
    } catch (err) {
      console.error('[Firma] No se pudo leer el manual de funciones del cargo:', err.message);
    }
    if (manual) {
      Object.assign(variables, variablesManual(manual));
    } else {
      motivoManual = `El cargo "${cargo}" aún no tiene manual de funciones publicado. Selección debe publicarlo en Talent Hub › Cargos y Funciones antes de firmar este documento.`;
    }
  }

  // Formulario del documento (Config_Formulario_Preguntas) y respuestas guardadas
  const preguntas = await formularios.obtenerPreguntas(idConfigDoc);
  const respuestas = preguntas.length ? await formularios.obtenerRespuestas(aspirante.id_aspirante, idConfigDoc) : {};
  Object.assign(variables, variablesFormulario(preguntas, respuestas));

  return {
    aspirante,
    docItem,
    prefijo,
    contenidoHtml,
    docActual,
    firmaPrevia,
    variables,
    motivoManual,
    formulario: { preguntas, respuestas }
  };
}

// {{formulario_respuestas}} (bloque con todas las respuestas) y {{resp_<codigo>}} por pregunta
function variablesFormulario(preguntas, respuestas) {
  if (!preguntas.length) return { formulario_respuestas: '' };
  const hayRespuestas = Object.keys(respuestas).length > 0;
  return {
    ...formularios.variablesRespuestas(preguntas, respuestas),
    formulario_respuestas: hayRespuestas
      ? formularios.htmlRespuestasPdf(preguntas, respuestas)
      : '<div style="padding:10px;border:1px dashed #cbd5e1;border-radius:6px;background:#f8fafc;color:#64748b;font-size:8.5pt;text-align:center">Tus respuestas del formulario aparecerán aquí al firmar el documento.</div>'
  };
}

// ¿Se puede firmar (o volver a firmar) este documento? Devuelve null si se puede,
// o el motivo del bloqueo: el aspirante debe estar "En proceso" y el documento no
// debe estar aprobado por Selección. Con el aspirante contratado o bloqueado no se firma.
// motivoManual: el manual de funciones del cargo no está publicado (solo aplica al documento MF).
function motivoBloqueoFirma(aspirante, docActual, motivoManual = null) {
  const estado = (aspirante && aspirante.estado_proceso || '').toString().trim().toLowerCase();
  if (estado === 'bloqueado') return 'El proceso del aspirante está bloqueado.';
  if (estado === 'contratado') return 'El aspirante ya fue contratado: los documentos de firma no se pueden modificar.';
  if (estado !== 'en proceso') return 'La fase de firmas aún no está habilitada para este aspirante.';
  if (docActual && (docActual.estado || '').toString().trim().toLowerCase() === 'aprobado') {
    return 'Este documento ya fue aprobado por Selección y no se puede volver a firmar.';
  }
  if (motivoManual) return motivoManual;
  return null;
}

const MESES_HUELLA = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Fecha y hora de Colombia: { sql: 'AAAA-MM-DD HH:MM:SS', texto: '7 de noviembre de 2026 a las 08:15:30' }
function ahoraColombia() {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  const hora = partes.hour === '24' ? '00' : partes.hour;
  return {
    sql: `${partes.year}-${partes.month}-${partes.day} ${hora}:${partes.minute}:${partes.second}`,
    texto: `${Number(partes.day)} de ${MESES_HUELLA[Number(partes.month) - 1]} de ${partes.year} a las ${hora}:${partes.minute}:${partes.second}`
  };
}

// Fecha guardada 'AAAA-MM-DD HH:MM:SS' (hora de Colombia) → { sql, texto }
function fechaDesdeSql(sql) {
  const [fecha, hora = '00:00:00'] = String(sql).split(' ');
  const [y, m, d] = fecha.split('-');
  return { sql: `${fecha} ${hora}`, texto: `${Number(d)} de ${MESES_HUELLA[Number(m) - 1]} de ${y} a las ${hora}` };
}

function desescHtml(t) {
  return String(t == null ? '' : t).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Regenera un documento ya firmado (Panel Admin) con la misma firma, respuestas y huella.
// Sirve para aplicar un cambio de plantilla sin pedirle al aspirante que vuelva a firmar.
async function regenerarDocumentoFirmado({ idAspirante, idConfigDoc, bucketAspirantes }) {
  const datos = await obtenerDatosAspiranteParaFirma(idAspirante, idConfigDoc);
  const estado = (datos.docActual && datos.docActual.estado || '').toLowerCase();
  if (!['firmado', 'aprobado'].includes(estado)) {
    throw Object.assign(new Error('Solo se pueden regenerar documentos que ya fueron firmados.'), { validacion: true });
  }
  if (!datos.firmaPrevia) {
    throw Object.assign(new Error('No se encontró la firma guardada del aspirante para regenerar el documento.'), { validacion: true });
  }
  return procesarFirmaDocumento({
    idAspirante, idConfigDoc, firmaBase64: datos.firmaPrevia, esNuevaFirma: false,
    bucketAspirantes, regenerar: true
  });
}

function escHtml(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Bloque de huella que se agrega al final del PDF firmado
function htmlHuellaFirma({ nombre, identificacion, fechaTexto, ip, codigo }) {
  return `
<div style="margin-top:18px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;font-family:Arial,sans-serif;font-size:9px;line-height:1.45;color:#334155;page-break-inside:avoid">
  <strong style="color:#1B2A5E">Firma electrónica (Ley 527 de 1999)</strong><br>
  Firmado por <strong>${escHtml(nombre)}</strong>, C.C. ${escHtml(identificacion)}, el ${escHtml(fechaTexto)} (hora de Colombia)
  desde la dirección IP ${escHtml(ip || 'no disponible')}.<br>
  Código de verificación: <strong style="font-family:monospace">${escHtml(codigo)}</strong>
</div>`;
}

function generarHtmlVistaFirma({ aspirante, docItem, contenidoHtmlConVariables, firmaPrevia, docActual, usuario, bucketAspirantes, formulario = null }) {
  const yaFirmado = docActual && docActual.estado === 'Firmado';
  const urlPdfFirmado = yaFirmado && docActual.gcs_path
    ? `https://storage.googleapis.com/${bucketAspirantes}/${docActual.gcs_path}`
    : null;

  const nombreDoc = docItem ? (docItem.etiqueta || docItem.nombre) : 'Documento';
  const nombreAspirante = [aspirante.primer_nombre, aspirante.primer_apellido].filter(Boolean).join(' ');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Firmar ${nombreDoc} | Logyser</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --navy: #1B2A5E;
      --orange: #F15A22;
    }
    body { font-family: 'Plus Jakarta Sans', sans-serif; background-color: #F8FAFC; }
    .doc-preview-container {
      background: white;
      box-shadow: 0 10px 30px -5px rgba(27, 42, 94, 0.08);
      border: 1px solid #E2E8F0;
      border-radius: 1rem;
      max-height: 65vh;
      overflow-y: auto;
      scroll-behavior: smooth;
    }
    .doc-preview-container::-webkit-scrollbar {
      width: 8px;
    }
    .doc-preview-container::-webkit-scrollbar-thumb {
      background: #CBD5E1;
      border-radius: 4px;
    }
    #canvasFirma {
      touch-action: none;
      cursor: crosshair;
    }
  </style>
</head>
<body class="min-h-screen text-slate-800 pb-16">
  <!-- Top Bar -->
  <header class="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
    <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <a href="/seleccion/portal/${aspirante.id_aspirante}?usuario=${usuario}" 
           class="inline-flex items-center text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-all">
          ← Volver al Portal
        </a>
        <div class="hidden sm:block h-5 w-px bg-slate-200"></div>
        <div>
          <h1 class="text-xs sm:text-sm font-extrabold text-slate-900 leading-tight uppercase tracking-tight">${nombreDoc}</h1>
          <p class="text-[11px] text-slate-500 font-medium">Aspirante: <span class="font-bold text-slate-700">${nombreAspirante}</span> (C.C. ${aspirante.identificacion})</p>
        </div>
      </div>
      <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" class="h-9 w-auto object-contain" alt="Logyser">
    </div>
  </header>

  <main class="max-w-5xl mx-auto px-4 py-6 space-y-6">
    ${yaFirmado ? `
    <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black">✓</div>
        <div>
          <p class="text-xs font-bold text-emerald-900">Este documento ya se encuentra firmado</p>
          <p class="text-[11px] text-emerald-700">Puedes consultar el PDF oficial generado o volver a firmarlo a continuación si requieres actualizarlo.</p>
        </div>
      </div>
      ${urlPdfFirmado ? `
      <a href="${urlPdfFirmado}" target="_blank" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all whitespace-nowrap">
        Ver PDF Firmado ↗
      </a>
      ` : ''}
    </div>
    ` : ''}

    <!-- Banner informativo -->
    <div class="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 flex items-start gap-3">
      <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 font-bold text-sm">i</div>
      <div class="text-xs text-blue-900 leading-relaxed">
        <strong class="font-semibold text-blue-950">Por favor, lee el documento completo antes de firmar.</strong> 
        Verifica que tus nombres, apellidos, número de documento y demás datos coincidan. Al firmar, estás manifestando tu conformidad y aceptación formal.
      </div>
    </div>

    <!-- Document Preview Card -->
    <div class="bg-white rounded-3xl p-4 md:p-6 border border-slate-200 shadow-sm space-y-3">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2">
          <span class="inline-block w-2.5 h-2.5 rounded-full bg-orange-500"></span>
          <span class="text-xs font-bold text-slate-700 uppercase tracking-wider">Vista Previa del Contrato / Formato</span>
        </div>
        <span class="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">Desplázate para leer todo</span>
      </div>

      <div class="doc-preview-container p-2 md:p-4">
        <iframe id="vistaDocumento" title="Vista previa del documento" class="w-full block border-0 bg-white" style="min-height:60vh"
          srcdoc="${String(contenidoHtmlConVariables).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"
          onload="try{const d=this.contentDocument;const ajustar=()=>{this.style.height=(d.documentElement.scrollHeight+16)+'px'};ajustar();setTimeout(ajustar,400);}catch(e){}"></iframe>
      </div>
    </div>

    ${formulario && formulario.preguntas && formulario.preguntas.length ? `
    <!-- Formulario del documento -->
    <div class="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm">
      ${formularios.htmlFormularioPantalla(formulario.preguntas, formulario.respuestas || {})}
    </div>` : ''}

    <!-- Signature Section -->
    <div class="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm space-y-6">
      <div class="border-b border-slate-100 pb-4">
        <h2 class="text-base font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-2">
          <span>✍️</span> Espacio de Firma Digital
        </h2>
        <p class="text-xs text-slate-500 mt-1">Selecciona cómo deseas estampar tu firma en este documento.</p>
      </div>

      <!-- Selector de método si hay firma previa -->
      ${firmaPrevia ? `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label id="labelFirmaGuardada" class="cursor-pointer border-2 border-orange-500 bg-orange-50/30 rounded-2xl p-4 flex flex-col gap-2 transition-all">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-800 flex items-center gap-2">
              <input type="radio" name="metodoFirma" value="guardada" checked class="text-orange-500 focus:ring-orange-500">
              Usar mi firma guardada
            </span>
            <span class="text-[10px] font-extrabold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-md uppercase">Recomendado</span>
          </div>
          <div class="h-24 bg-white border border-slate-200 rounded-xl flex items-center justify-center p-2 mt-1">
            <img src="${firmaPrevia}" class="max-h-20 max-w-full object-contain" alt="Firma Guardada">
          </div>
        </label>

        <label id="labelFirmaNueva" class="cursor-pointer border-2 border-slate-200 hover:border-slate-300 bg-white rounded-2xl p-4 flex flex-col gap-2 transition-all">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-800 flex items-center gap-2">
              <input type="radio" name="metodoFirma" value="nueva" class="text-orange-500 focus:ring-orange-500">
              Dibujar una nueva firma
            </span>
          </div>
          <p class="text-[11px] text-slate-400 mt-2">Dibuja una nueva firma manuscrita con tu dedo o ratón en el recuadro interactivo.</p>
        </label>
      </div>
      ` : ''}

      <!-- Canvas de dibujo interactivo -->
      <div id="seccionCanvas" class="${firmaPrevia ? 'hidden' : 'block'} space-y-3">
        <div class="flex items-center justify-between">
          <label class="text-xs font-bold text-slate-700">Dibuja tu firma en el recuadro:</label>
          <button type="button" id="btnLimpiarCanvas" class="text-xs font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-lg transition-colors">
            Limpiar lienzo
          </button>
        </div>
        <div class="border-2 border-dashed border-slate-300 rounded-2xl bg-white p-2 flex justify-center">
          <canvas id="canvasFirma" width="460" height="180" class="w-full max-w-[460px] h-[180px] bg-slate-50/50 rounded-xl border border-slate-200"></canvas>
        </div>
        <p class="text-[11px] text-center text-slate-400">Usa tu dedo en pantallas táctiles o el puntero de tu ratón para dibujar tu firma.</p>
      </div>

      <!-- Declaración de consentimiento -->
      <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
        <label class="flex items-start gap-3 cursor-pointer select-none">
          <input type="checkbox" id="chkConsentimiento" class="mt-0.5 w-4 h-4 text-orange-500 rounded border-slate-300 focus:ring-orange-500">
          <span class="text-xs text-slate-700 leading-snug font-medium">
            Declaro bajo la gravedad de juramento que he leído, comprendido y aceptado en su totalidad las cláusulas y condiciones establecidas en este documento (<strong>${nombreDoc}</strong>), y que la firma digital aquí plasmada corresponde a mi autoría y tiene plena validez jurídica.
          </span>
        </label>
      </div>

      <!-- Botón de acción -->
      <div class="pt-2">
        <button type="button" id="btnConfirmarFirma" 
          class="w-full py-4 px-6 bg-slate-900 hover:bg-orange-600 text-white font-extrabold text-sm uppercase tracking-wider rounded-2xl shadow-lg hover:shadow-orange-500/20 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
          Firmar y Guardar Documento Oficial
        </button>
      </div>

      <div id="msgAlerta" class="hidden p-4 rounded-xl text-xs font-bold text-center"></div>
    </div>
  </main>

  <!-- Loading Modal Overlay -->
  <div id="loadingOverlay" class="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 hidden flex flex-col items-center justify-center p-4 text-center">
    <div class="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl space-y-4">
      <div class="w-14 h-14 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
      <h3 class="text-base font-extrabold text-slate-900 uppercase tracking-tight">Generando Documento Oficial</h3>
      <p class="text-xs text-slate-500 leading-relaxed">
        Estamos aplicando tu firma digital y generando el documento PDF con certificación de validez. Por favor espera un momento...
      </p>
    </div>
  </div>

  <script>
    ${formularios.JS_FORMULARIO}
    const TIENE_FIRMA_PREVIA = ${firmaPrevia ? 'true' : 'false'};
    const FIRMA_PREVIA_URL = ${JSON.stringify(firmaPrevia || '')};
    const ID_ASPIRANTE = ${JSON.stringify(aspirante.id_aspirante)};
    const ID_CONFIG_DOC = ${Number(docItem ? docItem.id : 0)};
    const USUARIO = ${JSON.stringify(usuario || '')};

    const canvas = document.getElementById('canvasFirma');
    const ctx = canvas.getContext('2d');
    const btnLimpiar = document.getElementById('btnLimpiarCanvas');
    const btnConfirmar = document.getElementById('btnConfirmarFirma');
    const chkConsentimiento = document.getElementById('chkConsentimiento');
    const msgAlerta = document.getElementById('msgAlerta');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const seccionCanvas = document.getElementById('seccionCanvas');

    // Inicializar canvas blanco
    function limpiarCanvas() {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    limpiarCanvas();

    // Toggle método firma
    let metodoActual = TIENE_FIRMA_PREVIA ? 'guardada' : 'nueva';
    const radios = document.querySelectorAll('input[name="metodoFirma"]');
    radios.forEach(r => {
      r.addEventListener('change', (e) => {
        metodoActual = e.target.value;
        const labelG = document.getElementById('labelFirmaGuardada');
        const labelN = document.getElementById('labelFirmaNueva');
        if (metodoActual === 'guardada') {
          seccionCanvas.classList.add('hidden');
          if (labelG) { labelG.classList.add('border-orange-500', 'bg-orange-50/30'); labelG.classList.remove('border-slate-200'); }
          if (labelN) { labelN.classList.remove('border-orange-500', 'bg-orange-50/30'); labelN.classList.add('border-slate-200'); }
        } else {
          seccionCanvas.classList.remove('hidden');
          if (labelN) { labelN.classList.add('border-orange-500', 'bg-orange-50/30'); labelN.classList.remove('border-slate-200'); }
          if (labelG) { labelG.classList.remove('border-orange-500', 'bg-orange-50/30'); labelG.classList.add('border-slate-200'); }
        }
      });
    });

    // Dibujo en canvas
    let dibujando = false;
    let haDibujado = false;

    function getCoords(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }

    function iniciarDibujo(e) {
      e.preventDefault();
      dibujando = true;
      haDibujado = true;
      const { x, y } = getCoords(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    }

    function dibujarTrazo(e) {
      if (!dibujando) return;
      e.preventDefault();
      const { x, y } = getCoords(e);
      ctx.lineTo(x, y);
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    function detenerDibujo(e) {
      if (!dibujando) return;
      e.preventDefault();
      dibujando = false;
    }

    canvas.addEventListener('mousedown', iniciarDibujo);
    canvas.addEventListener('mousemove', dibujarTrazo);
    window.addEventListener('mouseup', detenerDibujo);

    canvas.addEventListener('touchstart', iniciarDibujo, { passive: false });
    canvas.addEventListener('touchmove', dibujarTrazo, { passive: false });
    window.addEventListener('touchend', detenerDibujo);

    btnLimpiar.addEventListener('click', () => {
      limpiarCanvas();
      haDibujado = false;
    });

    function mostrarAlerta(texto, tipo) {
      msgAlerta.textContent = texto;
      msgAlerta.className = 'p-4 rounded-xl text-xs font-bold text-center block ' +
        (tipo === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200');
      msgAlerta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Submit firma
    btnConfirmar.addEventListener('click', async () => {
      // Formulario del documento (si tiene preguntas)
      const datosFormulario = recogerRespuestasFormulario();
      if (datosFormulario.faltantes.length) {
        mostrarAlerta('Faltan ' + datosFormulario.faltantes.length + ' respuesta(s) obligatoria(s) del formulario (marcadas en rojo).', 'error');
        const primera = document.querySelector('#formularioDocumento .bg-red-50');
        if (primera) primera.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      if (!chkConsentimiento.checked) {
        mostrarAlerta('Debes marcar la casilla aceptando los términos y declarando tu consentimiento para firmar este documento.', 'error');
        return;
      }

      let firmaBase64 = null;
      let esNueva = false;

      if (metodoActual === 'guardada' && FIRMA_PREVIA_URL) {
        firmaBase64 = FIRMA_PREVIA_URL;
        esNueva = false;
      } else {
        if (!haDibujado) {
          mostrarAlerta('Por favor realiza tu firma dentro del recuadro antes de continuar.', 'error');
          return;
        }
        firmaBase64 = canvas.toDataURL('image/png');
        esNueva = true;
      }

      btnConfirmar.disabled = true;
      loadingOverlay.classList.remove('hidden');

      try {
        const resp = await fetch('/seleccion/firmar/' + encodeURIComponent(ID_ASPIRANTE) + '/' + encodeURIComponent(ID_CONFIG_DOC) + '?usuario=' + encodeURIComponent(USUARIO), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firma_base64: firmaBase64,
            es_nueva_firma: esNueva,
            respuestas: datosFormulario.respuestas
          })
        });

        const resData = await resp.json();
        if (resData.ok) {
          window.location.href = resData.redirect || ('/seleccion/portal/' + ID_ASPIRANTE + '?usuario=' + USUARIO + '&msg=firmado');
        } else {
          loadingOverlay.classList.add('hidden');
          btnConfirmar.disabled = false;
          mostrarAlerta(resData.error || 'Ocurrió un error al procesar la firma.', 'error');
        }
      } catch (err) {
        loadingOverlay.classList.add('hidden');
        btnConfirmar.disabled = false;
        mostrarAlerta('Error de comunicación con el servidor. Por favor intenta de nuevo.', 'error');
      }
    });
  </script>
</body>
</html>`;
}

async function procesarFirmaDocumento({ idAspirante, idConfigDoc, firmaBase64, esNuevaFirma, bucketAspirantes, ip = null, dispositivo = null, respuestas = null, regenerar = false }) {
  const datos = await obtenerDatosAspiranteParaFirma(idAspirante, idConfigDoc);
  if (!datos) {
    throw new Error('Aspirante no encontrado');
  }

  const { aspirante, docItem, prefijo, contenidoHtml, variables, docActual, motivoManual } = datos;
  if (!docItem || !prefijo) {
    throw new Error('Tipo de documento no configurado para firma');
  }
  // Al regenerar (desde el Panel Admin) no aplica el bloqueo: se rehace el mismo documento
  // con la firma, las respuestas y la huella que ya tenía
  // Sin manual de funciones publicado tampoco se regenera (el documento saldría sin contenido)
  if (regenerar && motivoManual) {
    throw Object.assign(new Error(motivoManual), { validacion: true });
  }
  const motivoBloqueo = regenerar ? null : motivoBloqueoFirma(aspirante, docActual, motivoManual);
  if (motivoBloqueo) {
    const err = new Error(motivoBloqueo);
    err.bloqueado = true;
    throw err;
  }

  let huellaPrevia = null;
  if (regenerar) {
    try {
      const [hRows] = await pool.execute(
        `SELECT DATE_FORMAT(fecha_firma, '%Y-%m-%d %H:%i:%s') AS fecha_firma, ip_firma, dispositivo_firma, codigo_verificacion
         FROM Dynamic_hv_documentos WHERE id_aspirante = ? AND id_config_doc = ?`,
        [idAspirante, idConfigDoc]
      );
      if (hRows.length && hRows[0].fecha_firma) huellaPrevia = hRows[0];
    } catch (e) { /* columnas de huella aún no creadas */ }
    if (huellaPrevia) {
      // La fecha del documento es la de la firma original, no la de hoy
      const [y, m, d] = huellaPrevia.fecha_firma.slice(0, 10).split('-');
      variables.dia_firma = String(Number(d));
      variables.mes_firma = MESES[Number(m) - 1];
      variables.anio_firma = y;
    }
  }

  // Formulario: validar y guardar las respuestas antes de generar el PDF
  // (al regenerar se usan las respuestas ya guardadas)
  const preguntas = (datos.formulario && datos.formulario.preguntas) || [];
  if (preguntas.length && !regenerar) {
    const validacion = formularios.validarRespuestas(preguntas, respuestas || {});
    if (!validacion.ok) {
      const err = new Error('Revisa el formulario: ' + validacion.errores.slice(0, 3).join(' ') + (validacion.errores.length > 3 ? ` (y ${validacion.errores.length - 3} más)` : ''));
      err.validacion = true;
      throw err;
    }
    await formularios.guardarRespuestas(idAspirante, idConfigDoc, validacion.respuestas);
    Object.assign(variables, variablesFormulario(preguntas, validacion.respuestas));
  }
  if (!contenidoHtml) {
    throw new Error(`Plantilla no encontrada para el documento ${prefijo}`);
  }

  // 1. Si es nueva firma, guardarla en el bucket de firmas
  let firmaFinalBase64 = firmaBase64;
  if (esNuevaFirma && firmaBase64.startsWith('data:image/')) {
    const base64Data = firmaBase64.replace(/^data:image\/\w+;base64,/, '');
    const bufferFirma = Buffer.from(base64Data, 'base64');
    try {
      const firmaUrlGcs = await subirFirma(aspirante.identificacion, bufferFirma);
      await pool.execute(
        'UPDATE Dynamic_hv_aspirante SET firma_url = ? WHERE id_aspirante = ?',
        [firmaUrlGcs, idAspirante]
      );
    } catch (saveErr) {
      console.warn('[Firma] No se pudo guardar firma individual en firmas-images:', saveErr.message);
    }
  }

  // 2. Si firmaBase64 es una URL de GCS, convertirla a base64 para inyección segura en Puppeteer
  if (firmaFinalBase64.startsWith('http://') || firmaFinalBase64.startsWith('https://')) {
    try {
      const respImg = await fetch(firmaFinalBase64);
      if (respImg.ok) {
        const arrBuf = await respImg.arrayBuffer();
        const mime = respImg.headers.get('content-type') || 'image/png';
        firmaFinalBase64 = `data:${mime};base64,${Buffer.from(arrBuf).toString('base64')}`;
      }
    } catch (fetchErr) {
      console.warn('[Firma] Error al convertir firma_url a base64:', fetchErr.message);
    }
  }

  // 3. Preparar HTML completo con firma (con la fecha y hora de firma debajo, como en LogySign)
  const fechaFirma = huellaPrevia ? fechaDesdeSql(huellaPrevia.fecha_firma) : ahoraColombia();
  const firmaHtml = firmaConFecha(
    `<img src="${firmaFinalBase64}" style="max-height:70px; max-width:220px; object-fit:contain; display:block; margin:0 auto;" alt="Firma Colaborador"/>`,
    fechaFirma.sql
  );
  const todasLasVariables = {
    ...variables,
    firma_colaborador: firmaHtml
  };

  let htmlCompleto = reemplazarVariables(contenidoHtml, todasLasVariables)
    .replace(/\{\{\s*resp_[^}]+\}\}/g, '');   // respuestas de preguntas que ya no existen

  // 3b. Huella de la firma: quién, cuándo (hora de Colombia), desde qué IP y un código de verificación
  const ipFirma = huellaPrevia ? huellaPrevia.ip_firma : ((ip || '').toString().split(',')[0].trim().slice(0, 64) || null);
  const dispositivoFirma = huellaPrevia ? huellaPrevia.dispositivo_firma : ((dispositivo || '').toString().slice(0, 255) || null);
  const codigoVerificacion = (huellaPrevia && huellaPrevia.codigo_verificacion) || crypto.createHash('sha256')
    .update([idAspirante, idConfigDoc, aspirante.identificacion, fechaFirma.sql, ipFirma || '', htmlCompleto].join('|'))
    .digest('hex').slice(0, 16).toUpperCase();
  const huella = htmlHuellaFirma({
    nombre: desescHtml(variables.nombre_completo),
    identificacion: aspirante.identificacion,
    fechaTexto: fechaFirma.texto,
    ip: ipFirma,
    codigo: codigoVerificacion
  });
  const posBody = htmlCompleto.toLowerCase().lastIndexOf('</body>');
  htmlCompleto = posBody >= 0 ? htmlCompleto.slice(0, posBody) + huella + htmlCompleto.slice(posBody) : htmlCompleto + huella;

  // 4. Generar PDF con Puppeteer
  console.log(`[Firma Selección] Generando PDF con Puppeteer para ${prefijo} (Aspirante ${idAspirante})...`);
  const pdfBuffer = await generarPDFDesdeHTML(htmlCompleto);

  // 5. Guardar en GCS (hojas_vida_logyser)
  const { Storage } = require('@google-cloud/storage');
  const storage = process.env.GCS_KEYFILE
    ? new Storage({ keyFilename: path.resolve(process.env.GCS_KEYFILE) })
    : new Storage();
  const bucket = storage.bucket(bucketAspirantes);

  const gcsPath = `${aspirante.identificacion}/${aspirante.identificacion}.${prefijo}.${idAspirante}.pdf`;
  const file = bucket.file(gcsPath);

  await file.save(pdfBuffer, {
    contentType: 'application/pdf',
    metadata: {
      // Sin caché: al volver a firmar o regenerar, el PDF nuevo se ve de inmediato
      cacheControl: 'no-cache, max-age=0'
    }
  });
  console.log(`[Firma Selección] PDF guardado en GCS: ${gcsPath}`);

  // 6. Registrar en Dynamic_hv_documentos
  await pool.execute(`
    INSERT INTO Dynamic_hv_documentos (id_aspirante, id_config_doc, gcs_path, estado, fuente)
    VALUES (?, ?, ?, 'Firmado', 'Sistema')
    ON DUPLICATE KEY UPDATE
      gcs_path = VALUES(gcs_path),
      estado = IF(? AND estado = 'Aprobado', estado, 'Firmado'),
      fuente = 'Sistema',
      fecha_actualizacion = CURRENT_TIMESTAMP
  `, [idAspirante, idConfigDoc, gcsPath, regenerar ? 1 : 0]);

  // 7. Guardar la huella (requiere migraciones/2026-11-07_aspirantes_validaciones_avisos_huella.sql;
  //    si las columnas aún no existen, la firma queda igual y solo se registra el aviso en el log)
  const hashPdf = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  try {
    await pool.execute(
      `UPDATE Dynamic_hv_documentos
       SET fecha_firma = ?, ip_firma = ?, dispositivo_firma = ?, hash_firma = ?, codigo_verificacion = ?
       WHERE id_aspirante = ? AND id_config_doc = ?`,
      [fechaFirma.sql, ipFirma, dispositivoFirma, hashPdf, codigoVerificacion, idAspirante, idConfigDoc]
    );
  } catch (errHuella) {
    console.warn('[Firma Selección] No se pudo guardar la huella de la firma:', errHuella.message);
  }

  return {
    ok: true,
    gcsPath,
    redirect: `/seleccion/portal/${idAspirante}?msg=firmado`
  };
}

module.exports = {
  regenerarDocumentoFirmado,
  motivoBloqueoFirma,
  obtenerDocsFirmaParaOperacion,
  obtenerDatosAspiranteParaFirma,
  generarHtmlVistaFirma,
  procesarFirmaDocumento
};
