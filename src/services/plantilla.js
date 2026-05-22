const pool = require('./db');

async function obtenerPlantilla(proceso) {
  const [rows] = await pool.execute(
    'SELECT * FROM Maestro_Plantillas WHERE LOWER(nombre_proceso) = LOWER(?)',
    [proceso]
  );
  if (!rows.length) throw new Error(`Plantilla no encontrada: ${proceso}`);
  return rows[0];
}

const LOGO_HTML = '<div style="overflow:hidden;margin-bottom:20px"><div style="float:right;margin-left:16px"><img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:75px;display:block"></div></div>';

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

module.exports = { obtenerPlantilla, preprocesarDatos, reemplazarVariables };
