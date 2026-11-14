/**
 * formatosItalcol.js
 * Datos para los formatos de Italcol (documento de firma 33). Cada formato es una plantilla de
 * Maestro_Plantillas con id_config_doc = 33 y su observaciones (texto con el que se guarda el documento).
 *
 * Formulario de Información de Emergencias (ITAL_EMERG):
 *  - Se llena con la hoja de vida del aspirante (Dynamic_hv_aspirante y Dynamic_hv_contacto_emergencia).
 *  - Planta y segundo contacto de emergencia quedan vacíos (decisión de Selección).
 *  - Alergias y Condición de salud las escribe el aspirante al firmar (obligatorias). NO se guardan en la
 *    base: solo sirven para llenar el formato de Italcol.
 */

const pool = require('./db');

// Lo que el aspirante debe diligenciar al firmar (no se guarda en la base)
const CAMPOS_DILIGENCIAR = {
  ITAL_EMERG: [
    { codigo: 'ital_alergias', etiqueta: 'Alergias', ayuda: 'Escribe "Ninguna" si no tienes alergias.', obligatorio: true, max: 150 },
    { codigo: 'ital_condicion_salud', etiqueta: 'Condición de salud', ayuda: 'Escribe "Ninguna" si no tienes ninguna condición de salud.', obligatorio: true, max: 150 },
  ],
};

const NACIONALIDADES = {
  colombia: 'Colombiana', venezuela: 'Venezolana', ecuador: 'Ecuatoriana', peru: 'Peruana', 'perú': 'Peruana',
  panama: 'Panameña', 'panamá': 'Panameña', mexico: 'Mexicana', 'méxico': 'Mexicana', argentina: 'Argentina',
  chile: 'Chilena', bolivia: 'Boliviana', brasil: 'Brasileña', cuba: 'Cubana', 'estados unidos': 'Estadounidense',
  espana: 'Española', 'españa': 'Española',
};

function texto(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }

function escHtml(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function capitalizar(t) {
  return texto(t).toLowerCase().replace(/(^|[\s,(-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase());
}

function fechaDMY(v) {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v)) {
    return `${String(v.getUTCDate()).padStart(2, '0')}/${String(v.getUTCMonth() + 1).padStart(2, '0')}/${v.getUTCFullYear()}`;
  }
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : texto(v);
}

// "o+", "O +", "0+", "o positivo" -> "O+". Si no se reconoce, se deja como está.
function normalizarRh(v) {
  const t = texto(v).toUpperCase().replace(/\s+/g, '').replace(/POSITIVO/, '+').replace(/NEGATIVO/, '-')
    .replace(/^0/, 'O').replace(/О/g, 'O');
  const m = t.match(/^(AB|A|B|O)([+-])$/);
  if (m) return m[1] + m[2];
  const inv = t.match(/^([+-])(AB|A|B|O)$/);
  if (inv) return inv[2] + inv[1];
  return texto(v);
}

/**
 * Valida y limpia lo que el aspirante escribió al firmar. Lanza error (validacion) si falta algo obligatorio.
 * @param {string} plantilla  nombre_proceso (p. ej. 'ITAL_EMERG')
 * @param {object} respuestas { codigo: valor }
 */
function validarDiligenciados(plantilla, respuestas = {}) {
  const campos = CAMPOS_DILIGENCIAR[plantilla] || [];
  const out = {};
  const faltan = [];
  campos.forEach(c => {
    const v = texto(respuestas[c.codigo]).slice(0, c.max || 150);
    if (c.obligatorio && !v) faltan.push(c.etiqueta);
    out[c.codigo] = v;
  });
  if (faltan.length) {
    throw Object.assign(new Error(`Para firmar el Formulario de Información de Emergencias de Italcol diligencia: ${faltan.join(' y ')}.`), { validacion: true });
  }
  return out;
}

/**
 * Variables {{ital_*}} del Formulario de Información de Emergencias (ya escapadas para HTML).
 * @param {object} aspirante  fila de Dynamic_hv_aspirante
 * @param {object} contacto   primer contacto de Dynamic_hv_contacto_emergencia (o null)
 * @param {object} diligenciados  resultado de validarDiligenciados('ITAL_EMERG', ...)
 * @param {Date}   fechaFirma
 */
function variablesEmergencias(aspirante, contacto, diligenciados, fechaFirma = new Date()) {
  const a = aspirante || {};
  const hoy = new Date(fechaFirma.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const genero = texto(a.genero).toLowerCase();
  const pais = texto(a.pais_nacimiento);
  const lugarNac = [capitalizar(a.ciudad_nacimiento), capitalizar(a.departamento_nacimiento)].filter(Boolean).join(', ');
  const nacimiento = [fechaDMY(a.fecha_nacimiento), lugarNac].filter(Boolean).join(' · ');
  const direccion = [texto(a.direccion_barrio), capitalizar(a.ciudad)].filter(Boolean).join(' · ');
  const c = contacto || {};
  const nombreContacto = texto(c.nombre_completo).toUpperCase();
  const parentesco = capitalizar(c.parentesco);

  const v = {
    ital_dia: String(hoy.getDate()).padStart(2, '0'),
    ital_mes: String(hoy.getMonth() + 1).padStart(2, '0'),
    ital_anio: String(hoy.getFullYear()),
    // Planta y segundo contacto: vacíos por decisión de Selección
    ital_planta_girardota: '', ital_planta_santa_rosa: '', ital_planta_yarumal: '',
    ital_sexo_m: genero.startsWith('masc') ? 'X' : '',
    ital_sexo_f: genero.startsWith('fem') ? 'X' : '',
    ital_sexo_o: genero && !genero.startsWith('masc') && !genero.startsWith('fem') ? 'X' : '',
    ital_nacionalidad: NACIONALIDADES[pais.toLowerCase()] || capitalizar(pais),
    ital_nacimiento: nacimiento,
    ital_direccion: direccion,
    ital_contacto1_nombre: nombreContacto ? `${nombreContacto}${parentesco ? ` (${parentesco})` : ''}` : '',
    ital_contacto1_telefono: texto(c.telefono),
    ital_contacto2_nombre: '', ital_contacto2_telefono: '',
    ital_rh: normalizarRh(a.rh),
    ital_alergias: (diligenciados && diligenciados.ital_alergias) || '',
    ital_condicion_salud: (diligenciados && diligenciados.ital_condicion_salud) || '',
  };
  Object.keys(v).forEach(k => { v[k] = escHtml(v[k]); });
  return v;
}

/** Primer contacto de emergencia del aspirante (o null). */
async function obtenerContactoEmergencia(idAspirante) {
  const [rows] = await pool.execute(
    'SELECT nombre_completo, parentesco, telefono FROM Dynamic_hv_contacto_emergencia WHERE id_aspirante = ? ORDER BY fecha_registro LIMIT 1',
    [idAspirante]
  );
  return rows[0] || null;
}

/**
 * Variables propias de una parte (plantilla) de un documento de cliente. Las partes sin variables
 * propias usan solo las variables generales de la firma.
 * @param {string} nombreProceso  nombre_proceso de la plantilla
 */
async function variablesDeParte(nombreProceso, aspirante, diligenciados, fechaFirma = new Date()) {
  if (nombreProceso === 'ITAL_EMERG') {
    const contacto = aspirante && aspirante.id_aspirante ? await obtenerContactoEmergencia(aspirante.id_aspirante) : null;
    return variablesEmergencias(aspirante, contacto, diligenciados || {}, fechaFirma);
  }
  return {};
}

/**
 * Campos que el aspirante diligencia en la pantalla de firma (mismo formato del formulario de
 * Selección, para recogerlos con recogerRespuestasFormulario). Vacío si la parte no pide nada.
 */
function htmlCamposPantalla(nombreProceso, valores = {}) {
  const campos = CAMPOS_DILIGENCIAR[nombreProceso] || [];
  if (!campos.length) return '';
  const filas = campos.map(c => `
    <div class="pregunta py-3 border-t border-slate-100 first:border-t-0" data-codigo="${escHtml(c.codigo)}" data-tipo="texto" data-obligatorio="${c.obligatorio ? 1 : 0}" data-texto="${escHtml(c.etiqueta)}">
      <label class="block text-sm font-bold text-slate-800 mb-1">${escHtml(c.etiqueta)} ${c.obligatorio ? '<span class="text-red-500">*</span>' : ''}</label>
      <input type="text" data-campo="r" maxlength="${c.max || 150}" value="${escHtml(valores[c.codigo] || '')}" placeholder="Ej.: Ninguna"
        class="w-full border border-slate-300 rounded-xl px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-400">
      ${c.ayuda ? `<p class="text-[11px] text-slate-500 mt-1">${escHtml(c.ayuda)}</p>` : ''}
    </div>`).join('');
  return `<section id="formularioDocumento" class="space-y-2">
    <div class="border-b border-slate-100 pb-3">
      <h2 class="text-base font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-2"><span>📝</span> Diligencia el formato</h2>
      <p class="text-xs text-slate-500 mt-1">Estos datos solo se escriben en el formato de Italcol. Los campos con <span class="text-red-500">*</span> son obligatorios.</p>
    </div>
    <div class="bg-white border border-slate-200 rounded-2xl px-4">${filas}</div>
  </section>`;
}

/** Plantillas de Italcol activas (documento 33), en orden de creación. */
async function obtenerPlantillasItalcol() {
  const [rows] = await pool.execute(
    `SELECT id_plantilla, nombre_proceso, observaciones, codigo_formato, version_formato, fecha_version, contenido_html
       FROM Maestro_Plantillas WHERE id_config_doc = 33 AND activo = 1 ORDER BY id_plantilla`
  );
  return rows;
}

module.exports = {
  CAMPOS_DILIGENCIAR,
  validarDiligenciados,
  variablesDeParte,
  htmlCamposPantalla,
  variablesEmergencias,
  normalizarRh,
  obtenerContactoEmergencia,
  obtenerPlantillasItalcol,
};
