const pool = require('./db');
const { LOGO_BASE64 } = require('./assets');

// ── Datos del formato (Maestro_Plantillas: codigo_formato, version_formato, fecha_version) ──
// Se imprimen en el encabezado con {{codigo_formato}}, {{version_formato}} y {{fecha_formato}}.
function textoFechaFormato(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    const p = n => String(n).padStart(2, '0');
    return `${p(valor.getDate())}/${p(valor.getMonth() + 1)}/${valor.getFullYear()}`;
  }
  const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(valor);
}

function formatoDeFila(fila) {
  return {
    codigo:  fila?.codigo_formato ? String(fila.codigo_formato).trim() : '',
    version: fila?.version_formato ? String(fila.version_formato).trim() : '',
    fecha:   textoFechaFormato(fila?.fecha_version),
  };
}

// Código, versión y fecha del formato de la plantilla activa más reciente ('' si no tiene)
async function formatoDePlantilla(proceso) {
  try {
    const [rows] = await pool.execute(
      `SELECT codigo_formato, version_formato, fecha_version FROM Maestro_Plantillas
       WHERE LOWER(nombre_proceso) = LOWER(?) AND activo = 1 ORDER BY version DESC LIMIT 1`,
      [proceso]
    );
    return formatoDeFila(rows[0]);
  } catch (err) {
    console.warn(`[plantilla] No se pudo leer el formato de ${proceso}:`, err.message);
    return formatoDeFila(null);
  }
}

// Llena en el HTML los datos del formato que tenga la plantilla (los vacíos quedan como estaban)
function aplicarFormatoPlantilla(html, formato) {
  const valores = { codigo_formato: formato.codigo, version_formato: formato.version, fecha_formato: formato.fecha };
  return String(html || '').replace(/\{\{\s*(codigo_formato|version_formato|fecha_formato)\s*\}\}/g,
    (match, clave) => valores[clave] || match);
}

async function obtenerPlantilla(proceso) {
  const [rows] = await pool.execute(
    'SELECT * FROM Maestro_Plantillas WHERE LOWER(nombre_proceso) = LOWER(?) ORDER BY activo DESC, version DESC LIMIT 1',
    [proceso]
  );
  if (!rows.length) throw new Error(`Plantilla no encontrada: ${proceso}`);
  const plantilla = rows[0];
  plantilla.contenido_html = aplicarFormatoPlantilla(plantilla.contenido_html, formatoDeFila(plantilla));
  return plantilla;
}

const LOGO_HTML = `<div style="overflow:hidden;margin-bottom:20px"><div style="float:right;margin-left:16px"><img src="${LOGO_BASE64}" style="height:75px;display:block"></div></div>`;

function preprocesarDatos(datos) {
  const d = { ...datos };
  d.logo = LOGO_HTML;

  if (d.Trabajador) {
    const partes = String(d.Trabajador).split(' ** ');
    d.nombre_trabajador = partes.length > 1 ? partes[1].trim() : d.Trabajador;
  }

  if (d.fecha_aviso) {
    const f = new Date(d.fecha_aviso);
    if (!isNaN(f)) {
      d.fecha_aviso = f.toLocaleDateString('es-CO', {
        timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric',
      });
    }
  }

  if (d.fecha_traslado) {
    const f = new Date(d.fecha_traslado);
    if (!isNaN(f)) {
      d.fecha_traslado = f.toLocaleDateString('es-CO', {
        timeZone: 'America/Bogota', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
    }
  }

  return d;
}

function reemplazarVariables(html, datos) {
  return html.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    if (datos[key] !== undefined && datos[key] !== null) return String(datos[key]);
    return match;
  });
}

module.exports = {
  obtenerPlantilla, preprocesarDatos, reemplazarVariables,
  formatoDePlantilla, aplicarFormatoPlantilla,
};
