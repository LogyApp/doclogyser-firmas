const pool = require('./db');
const {
  subirFirma,
  obtenerFirmaBase64Reciente,
  obtenerUrlFirmaReciente,
  subirPDFInspeccionVehiculo,
  subirFotoInspeccionVehiculo,
} = require('./storage');
const { generarPDFDesdeHTML } = require('./renderer');
const { LOGO_BASE64 } = require('./assets');

const INSPECTION_TEMPLATES = {
  vehiculo: {
    label: 'Vehículo',
    subtypes: {
      carro: {
        label: 'Carro',
        items: [
          ['Documentación', 'SOAT vigente', true],
          ['Documentación', 'Revisión técnico-mecánica vigente, cuando aplique', true],
          ['Documentación', 'Licencia de tránsito disponible', false],
          ['Exterior', 'Estado general de carrocería, puertas, capó y baúl', false],
          ['Exterior', 'Parabrisas, vidrios y espejos sin daños que afecten visibilidad', true],
          ['Exterior', 'Placas legibles y correctamente instaladas', false],
          ['Llantas', 'Llantas sin cortes, deformaciones ni desgaste excesivo', true],
          ['Llantas', 'Presión aparente adecuada y rines sin daños', true],
          ['Llantas', 'Llanta de repuesto y elementos para cambio', false],
          ['Luces', 'Luces bajas, altas, posición, freno y reversa operativas', true],
          ['Luces', 'Direccionales y luces de emergencia operativas', true],
          ['Seguridad', 'Cinturones de seguridad funcionales', true],
          ['Seguridad', 'Bocina operativa', true],
          ['Seguridad', 'Extintor vigente y asegurado', true],
          ['Seguridad', 'Botiquín y equipo de carretera disponibles', false],
          ['Mecánico', 'Frenos de servicio y estacionamiento funcionales', true],
          ['Mecánico', 'Dirección sin holguras o anomalías', true],
          ['Mecánico', 'Niveles de aceite, refrigerante y líquido de frenos adecuados', true],
          ['Mecánico', 'Sin fugas visibles de fluidos', true],
          ['Cabina', 'Limpiaparabrisas y lavaparabrisas operativos', false],
          ['Cabina', 'Tablero sin testigos críticos encendidos', true],
        ],
      },
      moto: {
        label: 'Moto',
        items: [
          ['Documentación', 'SOAT vigente', true],
          ['Documentación', 'Revisión técnico-mecánica vigente, cuando aplique', true],
          ['Documentación', 'Licencia de tránsito disponible', false],
          ['Llantas', 'Llantas sin cortes, deformaciones ni desgaste excesivo', true],
          ['Llantas', 'Presión aparente adecuada y rines sin daños', true],
          ['Frenos', 'Freno delantero operativo', true],
          ['Frenos', 'Freno trasero operativo', true],
          ['Luces', 'Luz delantera, trasera y de freno operativas', true],
          ['Luces', 'Direccionales operativas', true],
          ['Seguridad', 'Bocina operativa', true],
          ['Seguridad', 'Espejos completos y ajustados', true],
          ['Seguridad', 'Casco certificado en buen estado', true],
          ['Seguridad', 'Elementos reflectivos disponibles, cuando aplique', false],
          ['Mecánico', 'Cadena o sistema de transmisión con tensión adecuada', true],
          ['Mecánico', 'Sin fugas visibles de combustible o aceite', true],
          ['Mecánico', 'Nivel de aceite adecuado', true],
          ['Mecánico', 'Acelerador retorna correctamente', true],
          ['Controles', 'Manubrio y dirección sin juego excesivo', true],
          ['Controles', 'Pata lateral/central funcional', false],
          ['Controles', 'Tablero e indicadores operativos', false],
        ],
      },
      camioneta: {
        label: 'Camioneta',
        items: [
          ['Documentación', 'SOAT vigente', true],
          ['Documentación', 'Revisión técnico-mecánica vigente, cuando aplique', true],
          ['Documentación', 'Licencia de tránsito disponible', false],
          ['Exterior', 'Carrocería, puertas, platón o compartimiento de carga en buen estado', false],
          ['Exterior', 'Parabrisas, vidrios y espejos sin daños que afecten visibilidad', true],
          ['Llantas', 'Llantas sin cortes, deformaciones ni desgaste excesivo', true],
          ['Llantas', 'Presión aparente adecuada y rines sin daños', true],
          ['Llantas', 'Llanta de repuesto y equipo para cambio', false],
          ['Luces', 'Sistema completo de luces y direccionales operativo', true],
          ['Seguridad', 'Cinturones de seguridad funcionales', true],
          ['Seguridad', 'Bocina operativa', true],
          ['Seguridad', 'Extintor vigente y asegurado', true],
          ['Seguridad', 'Botiquín y equipo de carretera disponibles', false],
          ['Mecánico', 'Frenos de servicio y estacionamiento funcionales', true],
          ['Mecánico', 'Dirección sin holguras o anomalías', true],
          ['Mecánico', 'Niveles de aceite, refrigerante y líquido de frenos adecuados', true],
          ['Mecánico', 'Sin fugas visibles de fluidos', true],
          ['Carga', 'Elementos de sujeción de carga disponibles y en buen estado', true],
          ['Cabina', 'Limpiaparabrisas y lavaparabrisas operativos', false],
          ['Cabina', 'Tablero sin testigos críticos encendidos', true],
        ],
      },
    },
  },
  camion: {
    label: 'Camión',
    subtypes: {
      camion: {
        label: 'Camión',
        items: [
          ['Documentación', 'SOAT vigente', true],
          ['Documentación', 'Revisión técnico-mecánica vigente', true],
          ['Documentación', 'Licencia de tránsito y documentos de operación disponibles', false],
          ['Cabina', 'Parabrisas, vidrios, espejos y limpiaparabrisas en buen estado', true],
          ['Cabina', 'Cinturón de seguridad funcional', true],
          ['Cabina', 'Bocina operativa', true],
          ['Luces', 'Luces delanteras, traseras, freno, reversa y direccionales operativas', true],
          ['Luces', 'Luces de emergencia y demarcación operativas', true],
          ['Llantas', 'Llantas sin daños o desgaste excesivo', true],
          ['Llantas', 'Tuercas, pernos y rines completos y ajustados', true],
          ['Llantas', 'Llanta de repuesto disponible', false],
          ['Mecánico', 'Frenos de servicio y estacionamiento funcionales', true],
          ['Mecánico', 'Sistema de dirección sin holguras', true],
          ['Mecánico', 'Niveles de fluidos adecuados', true],
          ['Mecánico', 'Sin fugas visibles de aceite, combustible o refrigerante', true],
          ['Mecánico', 'Suspensión sin daños visibles', true],
          ['Seguridad', 'Extintor vigente y asegurado', true],
          ['Seguridad', 'Botiquín y equipo de carretera disponibles', false],
          ['Seguridad', 'Conos o elementos de señalización disponibles', false],
          ['Carga', 'Carrocería o plataforma en buen estado', true],
          ['Carga', 'Sistemas de amarre y sujeción disponibles y en buen estado', true],
          ['Carga', 'Puertas, seguros y cierres funcionales', true],
        ],
      },
    },
  },
  montacarga: {
    label: 'Montacarga eléctrica',
    subtypes: {
      electrica: {
        label: 'Montacarga eléctrica',
        items: [
          ['SISTEMA MECÁNICO', 'Rueda de tracción y de carga: sin cortes o desgaste excesivo, sin fisuras en caucho; pernos ajustados y completos', true],
          ['SISTEMA MECÁNICO', 'Aceite hidráulico: nivel adecuado', true],
          ['SISTEMA MECÁNICO', 'Mangueras: ajustadas, sin fisuras y sin fugas de aceite', true],
          ['SISTEMA MECÁNICO', 'Timón o volante: ajustado; responde al giro; comandos y botón de contramarcha funcionales', true],
          ['SISTEMA MECÁNICO', 'Mecanismo de levante de la torre: desplazamiento libre, sin ruidos extraños, fisuras visibles y correctamente lubricado', true],
          ['BATERÍA', 'Cables de potencia y conector: ajustados, sin cortes, añadidos ni cables expuestos', true],
          ['BATERÍA', 'Batería, compartimiento y cama porta batería: anclada, sin golpes ni fugas; seguro y rodillos en buen estado', true],
          ['BATERÍA', 'Cableado y cargador: ajustados, sin conexiones improvisadas; cargador funcional', true],
          ['BATERÍA', 'Nivel de agua dentro del rango de funcionamiento', true],
          ['BATERÍA', 'Porcentaje de voltaje superior a 20%', true],
          ['SISTEMA ELÉCTRICO', 'Cableado interno: ajustado, sin cortes, peladuras ni cables expuestos', true],
          ['SISTEMA ELÉCTRICO', 'Medidor: funcionamiento correcto y lectura de carga de batería', true],
          ['SISTEMA ELÉCTRICO', 'Conexiones: aseguradas y sin añadiduras', true],
          ['SISTEMA ELÉCTRICO', 'Controlador de velocidad: permite marcha hacia atrás y adelante', true],
          ['SISTEMA ELÉCTRICO', 'Controlador de desplazamiento: acciona entrada y salida de horquillas', true],
          ['ASPECTOS A REVISAR', 'Estado de la bocina', true],
          ['ASPECTOS A REVISAR', 'Extintor multipropósito: recarga vigente y presión adecuada', true],
          ['ASPECTOS A REVISAR', 'Cinturón de seguridad en buen estado', true],
          ['ASPECTOS A REVISAR', 'Asiento en buen estado', false],
          ['ASPECTOS A REVISAR', 'Direccionales en buen estado', true],
          ['ASPECTOS A REVISAR', 'Estado de frenos', true],
          ['ASPECTOS A REVISAR', 'Sistema hidráulico: sube y baja el mástil correctamente', true],
          ['ASPECTOS A REVISAR', 'Contador de horas en buen estado', false],
          ['ASPECTOS A REVISAR', 'Horquillas bien posicionadas y aseguradas con pin; libres de golpes y abolladuras', true],
          ['ASPECTOS A REVISAR', 'Mástil: sube y baja correctamente; rodamientos sin anomalías', true],
          ['ASPECTOS A REVISAR', 'Faros delanteros en buen estado', true],
          ['ASPECTOS A REVISAR', 'Luces traseras en buen estado', true],
          ['ASPECTOS A REVISAR', 'Engrase de la máquina adecuado', false],
          ['ASPECTOS A REVISAR', 'Estado de llantas: sin daños, cortes o desgaste excesivo', true],
        ],
      },
    },
  },
  montacarga_manual: {
    label: 'Montacarga manual (Transpaleta)',
    subtypes: {
      transpaleta: {
        label: 'Montacarga manual (Transpaleta)',
        items: [
          ['Estructura', 'Chasis sin deformaciones, fisuras ni soldaduras defectuosas', true],
          ['Estructura', 'Horquillas rectas, sin grietas ni deformaciones', true],
          ['Estructura', 'Puntas de horquilla sin daños que comprometan la carga', true],
          ['Ruedas', 'Ruedas de dirección sin cortes, planos o desgaste excesivo', true],
          ['Ruedas', 'Rodillos de carga giran libremente y sin daños', true],
          ['Ruedas', 'Ejes y pasadores completos y asegurados', true],
          ['Hidráulico', 'Bomba hidráulica eleva la carga de forma uniforme', true],
          ['Hidráulico', 'Descenso controlado y sin caída brusca', true],
          ['Hidráulico', 'Sin fugas de aceite hidráulico', true],
          ['Hidráulico', 'Palanca de mando en elevar/neutro/bajar funciona correctamente', true],
          ['Mando', 'Timón sin fisuras, deformaciones o juego excesivo', true],
          ['Mando', 'Empuñadura y mando firmes', true],
          ['Mando', 'Retorno del timón normal', false],
          ['Seguridad', 'Capacidad nominal legible', true],
          ['Seguridad', 'Equipo limpio y libre de grasa en zonas de agarre', false],
          ['Seguridad', 'No presenta elementos sueltos o faltantes', true],
          ['Operación', 'Prueba sin carga: desplazamiento suave', true],
          ['Operación', 'Prueba de elevación y descenso satisfactoria', true],
        ],
      },
    },
  },
};

function escHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[m]));
}

function getBogotaDateParts() {
  const b = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  const yyyy = b.getFullYear();
  const mm = p(b.getMonth() + 1);
  const dd = p(b.getDate());
  const hh = p(b.getHours());
  const min = p(b.getMinutes());
  const ss = p(b.getSeconds());
  return {
    sqlDateTime: `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`,
    displayDateTime: `${dd}/${mm}/${yyyy} ${hh}:${min}`,
    yearMonth: `${yyyy}-${mm}`,
    compactTs: `${yyyy}${mm}${dd}-${hh}${min}${ss}`,
  };
}

async function obtenerLimitesInspeccion() {
  try {
    const [rows] = await pool.execute(
      `SELECT Concepto, Parametro FROM Config_Parametros
       WHERE Modulo = 'empleado' AND Seccion = 'Inspecciones_Vehiculo'`
    );
    const map = {};
    rows.forEach(r => { map[r.Concepto] = r.Parametro; });
    const maxFotos = parseInt(map['Máximo de fotos de evidencia por inspección'], 10);
    const maxFotoMB = parseFloat(map['Tamaño máximo por foto de evidencia (MB)']);
    return {
      maxFotos: maxFotos > 0 ? maxFotos : 4,
      maxFotoMB: maxFotoMB > 0 ? maxFotoMB : 10,
    };
  } catch (err) {
    return { maxFotos: 4, maxFotoMB: 10 };
  }
}

function obtenerResumenPlantillasInspeccion() {
  const out = [];
  Object.keys(INSPECTION_TEMPLATES).forEach(type => {
    const t = INSPECTION_TEMPLATES[type];
    Object.keys(t.subtypes).forEach(subtype => {
      out.push({
        type,
        subtype,
        typeLabel: t.label,
        label: t.subtypes[subtype].label,
        totalItems: t.subtypes[subtype].items.length,
      });
    });
  });
  return out;
}

function obtenerPlantillaInspeccion(type, subtype) {
  const t = INSPECTION_TEMPLATES[type];
  if (!t || !t.subtypes[subtype]) {
    throw new Error('Tipo de inspección preoperacional no válido.');
  }
  const s = t.subtypes[subtype];
  return {
    type,
    subtype,
    typeLabel: t.label,
    label: s.label,
    items: s.items.map((x, i) => ({
      id: i + 1,
      section: x[0],
      text: x[1],
      critical: !!x[2],
    })),
  };
}

async function listarInspeccionesColaborador(identificacion, limit = 50) {
  if (!identificacion) return [];
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  try {
    const [rows] = await pool.execute(
      `SELECT
         id,
         id_vinculacion,
         identificacion,
         trabajador,
         cargo,
         regional,
         operacion,
         tipo,
         subtipo,
         tipo_label AS tipoLabel,
         equipo_interno AS equipoInterno,
         placa,
         odometro,
         resultado,
         puntaje,
         total_c AS totalC,
         total_nc AS totalNc,
         total_na AS totalNa,
         observaciones_generales AS observacionesGenerales,
         plan_accion AS planAccion,
         reporta_a AS reportaA,
         pdf_url AS pdfUrl,
         DATE_FORMAT(fecha_registro, '%d/%m/%Y %H:%i') AS fecha,
         DATE_FORMAT(fecha_registro, '%Y-%m') AS yearMonth
       FROM Dynamic_Inspecciones_Vehiculo
       WHERE identificacion = ?
       ORDER BY fecha_registro DESC
       LIMIT ${lim}`,
      [String(identificacion).trim()]
    );
    return rows.map(r => ({
      ...r,
      equipment: r.placa || r.equipoInterno || '—',
    }));
  } catch (err) {
    if (err && (err.code === 'ER_NO_SUCH_TABLE' || String(err.message).includes('doesn\'t exist'))) {
      return [];
    }
    console.warn('[inspeccionesVehiculo] Error listando inspecciones:', err.message);
    return [];
  }
}

async function calcularEstadisticasMesColaborador(identificacion) {
  const vacio = { total: 0, apt: 0, novelty: 0, equipmentTypes: 0 };
  if (!identificacion) return vacio;
  try {
    const { yearMonth } = getBogotaDateParts();
    const [rows] = await pool.execute(
      `SELECT resultado, tipo_label, placa, equipo_interno
       FROM Dynamic_Inspecciones_Vehiculo
       WHERE identificacion = ?
         AND DATE_FORMAT(fecha_registro, '%Y-%m') = ?`,
      [String(identificacion).trim(), yearMonth]
    );
    const equiposSet = new Set(
      rows.map(r => (r.placa || r.equipo_interno || r.tipo_label || '').trim()).filter(Boolean)
    );
    return {
      total: rows.length,
      apt: rows.filter(r => r.resultado === 'APTO').length,
      novelty: rows.filter(r => r.resultado !== 'APTO').length,
      equipmentTypes: equiposSet.size,
    };
  } catch (err) {
    return vacio;
  }
}

function construirHTMLPDFInspeccion({
  id,
  fechaHora,
  colaborador,
  template,
  equipoInterno,
  placa,
  odometro,
  status,
  score,
  items,
  observacionesGenerales,
  planAccion,
  reportaA,
  fotosDataUrls,
  firmaDataUrl,
}) {
  const statusBg = status === 'APTO' ? '#DDF4E6' : (status === 'NO APTO' ? '#FDE1E1' : '#FFF0D8');
  const statusColor = status === 'APTO' ? '#1F9D57' : (status === 'NO APTO' ? '#D83B3B' : '#F36B21');

  const rowsHtml = items.map((it, idx) => {
    const rowBg = idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
    const r = String(it.result || '');
    const resBg = r === 'C' ? '#DDF4E6' : (r === 'NC' ? '#FDE1E1' : '#EEF1F4');
    const resColor = r === 'C' ? '#1F9D57' : (r === 'NC' ? '#D83B3B' : '#6B7C8F');
    const critBadge = it.critical
      ? ' <span style="color:#D83B3B;font-size:7pt;font-weight:700;">[CRÍTICO]</span>'
      : '';
    return `
      <tr style="background:${rowBg};">
        <td style="padding:5px 7px;border:1px solid #D8E1EA;font-weight:700;color:#0A315D;font-size:8pt;">${escHtml(it.section)}</td>
        <td style="padding:5px 7px;border:1px solid #D8E1EA;color:#173655;font-size:8pt;">${idx + 1}. ${escHtml(it.item)}${critBadge}</td>
        <td style="padding:5px 7px;border:1px solid #D8E1EA;text-align:center;font-weight:700;background:${resBg};color:${resColor};font-size:8.5pt;">${escHtml(r)}</td>
        <td style="padding:5px 7px;border:1px solid #D8E1EA;color:#173655;font-size:8pt;">${escHtml(it.observation || '—')}</td>
      </tr>
    `;
  }).join('');

  const fotosHtml = (fotosDataUrls && fotosDataUrls.length)
    ? `
      <div class="sec-bar"><span class="sec-orange"></span><span class="sec-title">EVIDENCIAS FOTOGRÁFICAS</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
        ${fotosDataUrls.slice(0, 6).map((src, i) => `
          <div style="border:1px solid #D8E1EA;border-radius:4px;padding:6px;text-align:center;background:#fff;">
            <img src="${src}" style="max-width:100%;max-height:150px;object-fit:contain;" />
            <div style="font-size:7.5pt;color:#6B7C8F;font-weight:700;margin-top:4px;">Evidencia ${i + 1}</div>
          </div>
        `).join('')}
      </div>
    `
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: letter; margin: 14mm 14mm 16mm 14mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; color: #173655; margin: 0; }
    table { width: 100%; border-collapse: collapse; }
    .header-tbl td { vertical-align: middle; }
    .sec-bar { display: flex; align-items: stretch; margin: 10px 0 6px; }
    .sec-orange { width: 8px; background: #F36B21; flex-shrink: 0; }
    .sec-title { flex: 1; background: #0A315D; color: #FFFFFF; font-weight: 700; font-size: 8.5pt; padding: 5px 10px; letter-spacing: 0.4px; }
    .info-lbl { background: #F3F6F9; color: #0A315D; font-weight: 700; font-size: 7.5pt; padding: 5px 8px; border: 1px solid #D8E1EA; width: 22%; }
    .info-val { background: #FFFFFF; color: #173655; font-weight: 700; font-size: 8pt; padding: 5px 8px; border: 1px solid #D8E1EA; width: 28%; }
    .box-title { background: #0A315D; color: #FFFFFF; font-weight: 700; font-size: 7.5pt; padding: 4px 8px; border: 1px solid #D8E1EA; }
    .box-val { background: #F3F6F9; color: #173655; font-size: 8pt; padding: 6px 8px; border: 1px solid #D8E1EA; margin-bottom: 6px; min-height: 24px; }
  </style>
</head>
<body>
  <table class="header-tbl" style="margin-bottom:4px;">
    <tr>
      <td style="width:36%;padding:6px 10px;border:1px solid #D8E1EA;text-align:center;background:#fff;">
        <img src="${LOGO_BASE64}" style="max-height:52px;max-width:165px;object-fit:contain;" />
      </td>
      <td style="width:64%;background:#0A315D;color:#fff;text-align:center;padding:10px 14px;">
        <div style="font-size:13pt;font-weight:700;letter-spacing:0.5px;">REGISTRO DE INSPECCIÓN PREOPERACIONAL</div>
        <div style="font-size:9.5pt;font-weight:700;color:#FFD0B3;margin-top:3px;">${escHtml(template.label.toUpperCase())}</div>
      </td>
    </tr>
  </table>
  <div style="height:4px;background:#F36B21;margin-bottom:8px;"></div>

  <div class="sec-bar"><span class="sec-orange"></span><span class="sec-title">INFORMACIÓN GENERAL</span></div>
  <table style="margin-bottom:8px;">
    <tr>
      <td class="info-lbl">ID DEL REGISTRO</td>
      <td class="info-val">${escHtml(id)}</td>
      <td class="info-lbl">FECHA Y HORA</td>
      <td class="info-val">${escHtml(fechaHora)}</td>
    </tr>
    <tr>
      <td class="info-lbl">COLABORADOR / INSPECTOR</td>
      <td class="info-val">${escHtml(colaborador.nombre)}</td>
      <td class="info-lbl">DOCUMENTO</td>
      <td class="info-val">${escHtml(colaborador.identificacion)}</td>
    </tr>
    <tr>
      <td class="info-lbl">CARGO</td>
      <td class="info-val">${escHtml(colaborador.cargo || 'No registrado')}</td>
      <td class="info-lbl">OPERACIÓN / REGIONAL</td>
      <td class="info-val">${escHtml((colaborador.operacion || '') + (colaborador.regional ? ' · ' + colaborador.regional : ''))}</td>
    </tr>
    <tr>
      <td class="info-lbl">EQUIPO / INTERNO</td>
      <td class="info-val">${escHtml(equipoInterno || 'No aplica')}</td>
      <td class="info-lbl">PLACA / ODÓMETRO</td>
      <td class="info-val">${escHtml((placa || 'No aplica') + (odometro ? ' · ' + odometro : ''))}</td>
    </tr>
  </table>

  <table style="margin-bottom:10px;">
    <tr>
      <td style="background:#123E6B;color:#fff;font-size:7.5pt;font-weight:700;text-align:center;padding:5px;border:2px solid #fff;width:34%;">RESULTADO</td>
      <td style="background:#123E6B;color:#fff;font-size:7.5pt;font-weight:700;text-align:center;padding:5px;border:2px solid #fff;width:33%;">CUMPLIMIENTO</td>
      <td style="background:#123E6B;color:#fff;font-size:7.5pt;font-weight:700;text-align:center;padding:5px;border:2px solid #fff;width:33%;">TIPO DE EQUIPO</td>
    </tr>
    <tr>
      <td style="background:${statusBg};color:${statusColor};font-size:11pt;font-weight:700;text-align:center;padding:7px;border:2px solid #fff;">${escHtml(status)}</td>
      <td style="background:#F7F9FB;color:#0A315D;font-size:11pt;font-weight:700;text-align:center;padding:7px;border:2px solid #fff;">${score}%</td>
      <td style="background:#F7F9FB;color:#0A315D;font-size:10pt;font-weight:700;text-align:center;padding:7px;border:2px solid #fff;">${escHtml(template.label)}</td>
    </tr>
  </table>

  <div class="sec-bar"><span class="sec-orange"></span><span class="sec-title">LISTA DE VERIFICACIÓN (C: Cumple · NC: No Cumple · NA: No Aplica)</span></div>
  <table style="margin-bottom:10px;">
    <thead>
      <tr style="background:#0A315D;color:#FFFFFF;">
        <th style="padding:5px 7px;border:1px solid #D8E1EA;text-align:left;font-size:7.5pt;width:19%;">SECCIÓN</th>
        <th style="padding:5px 7px;border:1px solid #D8E1EA;text-align:left;font-size:7.5pt;width:47%;">ÍTEM A VERIFICAR</th>
        <th style="padding:5px 7px;border:1px solid #D8E1EA;text-align:center;font-size:7.5pt;width:10%;">ESTADO</th>
        <th style="padding:5px 7px;border:1px solid #D8E1EA;text-align:left;font-size:7.5pt;width:24%;">OBSERVACIÓN</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="sec-bar"><span class="sec-orange"></span><span class="sec-title">OBSERVACIONES Y ACCIONES</span></div>
  <div class="box-title">OBSERVACIONES GENERALES</div>
  <div class="box-val">${escHtml(observacionesGenerales || 'Sin observaciones adicionales.')}</div>
  <div class="box-title">PLAN DE ACCIÓN / MEDIDAS DE CONTROL</div>
  <div class="box-val">${escHtml(planAccion || 'No aplica.')}</div>
  ${reportaA ? `<div class="box-title">A QUIÉN SE REPORTA</div><div class="box-val">${escHtml(reportaA)}</div>` : ''}

  ${fotosHtml}

  <div class="sec-bar"><span class="sec-orange"></span><span class="sec-title">VALIDACIÓN Y FIRMA</span></div>
  <table>
    <tr>
      <td style="width:52%;border:1px solid #D8E1EA;padding:8px;text-align:center;background:#fff;">
        <div style="font-size:7.5pt;font-weight:700;color:#0A315D;margin-bottom:4px;">FIRMA DEL COLABORADOR / INSPECTOR</div>
        ${firmaDataUrl ? `<img src="${firmaDataUrl}" style="width:165px;height:62px;object-fit:contain;" />` : '<div style="height:62px;"></div>'}
        <div style="font-size:8pt;font-weight:700;color:#173655;margin-top:4px;">${escHtml(colaborador.nombre)}</div>
        <div style="font-size:7.5pt;color:#6B7C8F;">CC ${escHtml(colaborador.identificacion)}</div>
      </td>
      <td style="width:48%;border:1px solid #D8E1EA;padding:8px;text-align:center;background:#F7F9FB;">
        <div style="font-size:7.5pt;font-weight:700;color:#0A315D;margin-bottom:6px;">VALIDACIÓN DEL REGISTRO</div>
        <div style="font-size:8pt;line-height:1.5;color:#173655;">
          <strong>Resultado:</strong> ${escHtml(status)}<br/>
          <strong>Cumplimiento:</strong> ${score}%<br/>
          <strong>Registro:</strong> ${escHtml(id)}<br/>
          <strong>Generado:</strong> ${escHtml(fechaHora)}
        </div>
      </td>
    </tr>
  </table>
  <div style="text-align:center;font-size:7pt;color:#6B7C8F;margin-top:8px;">
    LOG&amp;SER S.A.S. · Apoyo Logístico y Operativo | Inspección Preoperacional ${escHtml(id)}
  </div>
</body>
</html>`;
}

async function crearInspeccionVehiculo({
  colaborador,
  type,
  subtype,
  equipmentId,
  plate,
  meter,
  generalObservations,
  actionPlan,
  reportTo,
  usarFirmaPrevia,
  firmaBase64,
  photos,
  items,
}) {
  if (!colaborador || !colaborador.identificacion) {
    throw new Error('La identificación del colaborador es obligatoria.');
  }

  const template = obtenerPlantillaInspeccion(type, subtype);
  if (!Array.isArray(items) || items.length !== template.items.length) {
    throw new Error('Debes responder todos los ítems de la lista de verificación.');
  }

  const itemsNormalizados = template.items.map((tplItem, idx) => {
    const incoming = items.find(x => Number(x.id) === tplItem.id) || items[idx] || {};
    const res = String(incoming.result || '').toUpperCase();
    if (!['C', 'NC', 'NA'].includes(res)) {
      throw new Error(`Falta respuesta en el ítem ${tplItem.id}: "${tplItem.text}".`);
    }
    return {
      id: tplItem.id,
      section: tplItem.section,
      item: tplItem.text,
      critical: tplItem.critical,
      result: res,
      observation: String(incoming.observation || '').trim(),
    };
  });

  // Resolver firma electrónica
  let firmaDataUrl = null;
  let firmaUrlPublica = null;
  const esPrevia = usarFirmaPrevia === true || usarFirmaPrevia === 'true' || usarFirmaPrevia === '1';

  if (esPrevia) {
    firmaDataUrl = await obtenerFirmaBase64Reciente(colaborador.identificacion);
    firmaUrlPublica = await obtenerUrlFirmaReciente(colaborador.identificacion);
    if (!firmaDataUrl) {
      throw new Error('No se encontró una firma previa en el sistema. Por favor selecciona "Dibujar nueva firma".');
    }
  } else {
    if (!firmaBase64 || !String(firmaBase64).startsWith('data:image/')) {
      throw new Error('La firma del colaborador es obligatoria.');
    }
    firmaDataUrl = firmaBase64;
    const rawBase64 = String(firmaBase64).replace(/^data:image\/\w+;base64,/, '');
    const bufferFirma = Buffer.from(rawBase64, 'base64');
    firmaUrlPublica = await subirFirma(colaborador.identificacion, bufferFirma);
  }

  const { sqlDateTime, displayDateTime, compactTs } = getBogotaDateParts();
  const rnd = Math.floor(Math.random() * 900 + 100);
  const id = `INS-${compactTs}-${rnd}`;

  const totalC = itemsNormalizados.filter(x => x.result === 'C').length;
  const totalNc = itemsNormalizados.filter(x => x.result === 'NC').length;
  const totalNa = itemsNormalizados.filter(x => x.result === 'NA').length;
  const evaluables = itemsNormalizados.length - totalNa;
  const score = evaluables > 0 ? Math.round((totalC / evaluables) * 100) : 100;

  const tieneCriticoNc = itemsNormalizados.some(x => x.critical && x.result === 'NC');
  const status = tieneCriticoNc
    ? 'NO APTO'
    : (totalNc > 0 ? 'APTO CON NOVEDADES' : 'APTO');

  // Subir evidencias fotográficas opcionales
  const { maxFotos } = await obtenerLimitesInspeccion();
  const fotosUrls = [];
  const fotosDataUrls = [];
  const listaFotos = Array.isArray(photos) ? photos.slice(0, maxFotos) : [];

  for (let i = 0; i < listaFotos.length; i++) {
    const p = listaFotos[i];
    const dataUrl = p && (p.data || p);
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
      fotosDataUrls.push(dataUrl);
      const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (match) {
        const buf = Buffer.from(match[2], 'base64');
        const urlFoto = await subirFotoInspeccionVehiculo(
          colaborador.identificacion,
          id,
          i + 1,
          buf,
          match[1]
        );
        fotosUrls.push(urlFoto);
      }
    }
  }

  const placaClean = String(plate || '').trim().toUpperCase();
  const equipoClean = String(equipmentId || '').trim();
  const odometroClean = String(meter || '').trim();

  // Generar PDF oficial de la inspección
  const htmlPdf = construirHTMLPDFInspeccion({
    id,
    fechaHora: displayDateTime,
    colaborador,
    template,
    equipoInterno: equipoClean,
    placa: placaClean,
    odometro: odometroClean,
    status,
    score,
    items: itemsNormalizados,
    observacionesGenerales: String(generalObservations || '').trim(),
    planAccion: String(actionPlan || '').trim(),
    reportaA: String(reportTo || '').trim(),
    fotosDataUrls,
    firmaDataUrl,
  });

  const bufferPdf = await generarPDFDesdeHTML(htmlPdf);
  const pdfUrl = await subirPDFInspeccionVehiculo(colaborador.identificacion, id, bufferPdf);

  // Guardar en Dynamic_Inspecciones_Vehiculo
  await pool.execute(
    `INSERT INTO Dynamic_Inspecciones_Vehiculo (
       id, id_vinculacion, identificacion, trabajador, cargo, regional, operacion,
       tipo, subtipo, tipo_label, equipo_interno, placa, odometro,
       resultado, puntaje, total_c, total_nc, total_na,
       observaciones_generales, plan_accion, reporta_a,
       respuestas_json, fotos_json, firma_url, pdf_url, fecha_registro
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      colaborador.idVinculacion || null,
      String(colaborador.identificacion),
      colaborador.nombre || '',
      colaborador.cargo || null,
      colaborador.regional || null,
      colaborador.operacion || null,
      type,
      subtype,
      template.label,
      equipoClean || null,
      placaClean || null,
      odometroClean || null,
      status,
      score,
      totalC,
      totalNc,
      totalNa,
      String(generalObservations || '').trim() || null,
      String(actionPlan || '').trim() || null,
      String(reportTo || '').trim() || null,
      JSON.stringify(itemsNormalizados),
      JSON.stringify(fotosUrls),
      firmaUrlPublica,
      pdfUrl,
      sqlDateTime,
    ]
  );

  const [stats, recent] = await Promise.all([
    calcularEstadisticasMesColaborador(colaborador.identificacion),
    listarInspeccionesColaborador(colaborador.identificacion, 30),
  ]);

  return {
    ok: true,
    id,
    status,
    score,
    pdfUrl,
    stats,
    recent,
  };
}

async function generarFormatoBlancoPDF(type, subtype) {
  const template = obtenerPlantillaInspeccion(type, subtype);
  const rowsHtml = template.items.map((it, idx) => `
    <tr>
      <td style="padding:5px 7px;border:1px solid #cbd5e1;font-weight:700;color:#0A315D;font-size:8pt;">${escHtml(it.section)}</td>
      <td style="padding:5px 7px;border:1px solid #cbd5e1;font-size:8pt;">${idx + 1}. ${escHtml(it.text)}${it.critical ? ' <strong style="color:#dc2626;font-size:7pt;">[CRÍTICO]</strong>' : ''}</td>
      <td style="padding:5px;border:1px solid #cbd5e1;width:30px;"></td>
      <td style="padding:5px;border:1px solid #cbd5e1;width:30px;"></td>
      <td style="padding:5px;border:1px solid #cbd5e1;width:30px;"></td>
      <td style="padding:5px;border:1px solid #cbd5e1;width:140px;"></td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: letter; margin: 14mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; color: #173655; margin: 0; }
    table { width: 100%; border-collapse: collapse; }
  </style>
</head>
<body>
  <table style="margin-bottom:8px;">
    <tr>
      <td style="width:34%;padding:6px;border:1px solid #cbd5e1;text-align:center;">
        <img src="${LOGO_BASE64}" style="max-height:48px;max-width:155px;object-fit:contain;" />
      </td>
      <td style="width:66%;background:#0A315D;color:#fff;text-align:center;padding:10px;">
        <div style="font-size:12pt;font-weight:700;">FORMATO DE INSPECCIÓN PREOPERACIONAL</div>
        <div style="font-size:9.5pt;color:#FFD0B3;font-weight:700;margin-top:3px;">${escHtml(template.label.toUpperCase())}</div>
      </td>
    </tr>
  </table>
  <table style="margin-bottom:10px;">
    <tr>
      <td style="padding:6px;border:1px solid #cbd5e1;font-size:8pt;"><strong>Fecha:</strong> ___________________</td>
      <td style="padding:6px;border:1px solid #cbd5e1;font-size:8pt;"><strong>Inspector:</strong> _______________________________</td>
      <td style="padding:6px;border:1px solid #cbd5e1;font-size:8pt;"><strong>Documento:</strong> ___________________</td>
    </tr>
    <tr>
      <td style="padding:6px;border:1px solid #cbd5e1;font-size:8pt;"><strong>Cargo:</strong> ___________________</td>
      <td style="padding:6px;border:1px solid #cbd5e1;font-size:8pt;"><strong>Operación:</strong> _______________________________</td>
      <td style="padding:6px;border:1px solid #cbd5e1;font-size:8pt;"><strong>Placa / Equipo:</strong> _______________</td>
    </tr>
  </table>
  <table style="margin-bottom:12px;">
    <thead>
      <tr style="background:#0A315D;color:#fff;font-size:7.5pt;">
        <th style="padding:5px;border:1px solid #cbd5e1;text-align:left;">SECCIÓN</th>
        <th style="padding:5px;border:1px solid #cbd5e1;text-align:left;">ÍTEM</th>
        <th style="padding:5px;border:1px solid #cbd5e1;text-align:center;">C</th>
        <th style="padding:5px;border:1px solid #cbd5e1;text-align:center;">NC</th>
        <th style="padding:5px;border:1px solid #cbd5e1;text-align:center;">NA</th>
        <th style="padding:5px;border:1px solid #cbd5e1;text-align:left;">OBSERVACIONES</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div style="border:1px solid #cbd5e1;padding:8px;min-height:42px;margin-bottom:8px;font-size:8pt;"><strong>Observaciones generales:</strong></div>
  <div style="border:1px solid #cbd5e1;padding:8px;min-height:42px;margin-bottom:14px;font-size:8pt;"><strong>Plan de acción / Medidas de control:</strong></div>
  <div style="margin-top:24px;font-size:8.5pt;"><strong>Firma de quien realiza la inspección:</strong> __________________________________________</div>
</body>
</html>`;

  const bufferPdf = await generarPDFDesdeHTML(html);
  const cleanName = String(template.label).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_');
  return {
    buffer: bufferPdf,
    filename: `Formato_Inspeccion_${cleanName}.pdf`,
  };
}

module.exports = {
  INSPECTION_TEMPLATES,
  obtenerLimitesInspeccion,
  obtenerResumenPlantillasInspeccion,
  obtenerPlantillaInspeccion,
  listarInspeccionesColaborador,
  calcularEstadisticasMesColaborador,
  crearInspeccionVehiculo,
  generarFormatoBlancoPDF,
};
