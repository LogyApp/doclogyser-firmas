const crypto = require('crypto');
const pool = require('./db');
const { generarPDFDesdeHTML } = require('./renderer');
const { LOGO_BASE64 } = require('./assets');
const {
  subirFirma,
  obtenerUrlFirmaReciente,
  obtenerFirmaBase64Reciente,
  subirPDFInspeccionVehiculo,
  subirFotoInspeccionVehiculo,
} = require('./storage');

// ══════════════════════════════════════════════════════════════════════════════
// PLANTILLAS SIMPLIFICADAS E INTERACTIVAS (10 A 12 PUNTOS ESENCIALES POR BLOQUES)
// ══════════════════════════════════════════════════════════════════════════════
const INSPECTION_TEMPLATES = {
  vehiculo: {
    moto: {
      type: 'vehiculo',
      subtype: 'moto',
      label: 'Motocicleta',
      shortLabel: 'MOTO',
      title: 'Inspección Preoperacional — Motocicleta',
      items: [
        // Bloque 1: Documentación Legal
        { id: 'm1', section: '1. DOCUMENTACIÓN LEGAL', text: 'SOAT y Tarjeta de Propiedad vigentes', critical: true },
        { id: 'm2', section: '1. DOCUMENTACIÓN LEGAL', text: 'Revisión Técnico-Mecánica vigente', critical: true },
        { id: 'm3', section: '1. DOCUMENTACIÓN LEGAL', text: 'Licencia de conducción vigente y acorde a la categoría', critical: true },
        // Bloque 2: Luces y Espejos
        { id: 'm4', section: '2. LUCES Y VISIBILIDAD', text: 'Luz delantera (baja/alta), luz de freno (stop) y direccionales funcionando', critical: true },
        { id: 'm5', section: '2. LUCES Y VISIBILIDAD', text: 'Espejos retrovisores completos y bien ajustados', critical: true },
        { id: 'm6', section: '2. LUCES Y VISIBILIDAD', text: 'Pito / bocina e indicadores de tablero funcionando', critical: false },
        // Bloque 3: Estado Mecánico
        { id: 'm7', section: '3. ESTADO MECÁNICO Y LLANTAS', text: 'Freno delantero y freno trasero con respuesta segura', critical: true },
        { id: 'm8', section: '3. ESTADO MECÁNICO Y LLANTAS', text: 'Llantas delantera y trasera con buen labrado y presión adecuada', critical: true },
        { id: 'm9', section: '3. ESTADO MECÁNICO Y LLANTAS', text: 'Cadena/kit de arrastre, guayas y motor sin fugas de aceite o gasolina', critical: true },
        // Bloque 4: Elementos de Protección
        { id: 'm10', section: '4. PROTECCIÓN PERSONAL (EPP)', text: 'Casco reglamentario certificado en buen estado y con visor limpio', critical: true },
        { id: 'm11', section: '4. PROTECCIÓN PERSONAL (EPP)', text: 'Prenda/chaleco reflectivo, guantes, calzado cerrado y protección impermeable', critical: true }
      ]
    },
    carro: {
      type: 'vehiculo',
      subtype: 'carro',
      label: 'Carro / Camioneta',
      shortLabel: 'CARRO / CAMIONETA',
      title: 'Inspección Preoperacional — Carro / Camioneta',
      items: [
        // Bloque 1: Documentación Legal
        { id: 'v1', section: '1. DOCUMENTACIÓN LEGAL', text: 'SOAT y Tarjeta de Propiedad vigentes', critical: true },
        { id: 'v2', section: '1. DOCUMENTACIÓN LEGAL', text: 'Revisión Técnico-Mecánica vigente', critical: true },
        { id: 'v3', section: '1. DOCUMENTACIÓN LEGAL', text: 'Licencia de conducción vigente', critical: true },
        // Bloque 2: Visibilidad y Cabina
        { id: 'v4', section: '2. VISIBILIDAD Y CABINA', text: 'Luces bajas, altas, direccionales, freno y reversa funcionando', critical: true },
        { id: 'v5', section: '2. VISIBILIDAD Y CABINA', text: 'Parabrisas sin fisuras, limpiabrisas y espejos retrovisores en buen estado', critical: true },
        { id: 'v6', section: '2. VISIBILIDAD Y CABINA', text: 'Cinturones de seguridad operativos en todos los puestos y pito funcional', critical: true },
        // Bloque 3: Mecánica y Llantas
        { id: 'v7', section: '3. MECÁNICA, FRENOS Y LLANTAS', text: 'Freno de pedal y freno de emergencia (mano) en óptimo funcionamiento', critical: true },
        { id: 'v8', section: '3. MECÁNICA, FRENOS Y LLANTAS', text: 'Llantas (las 4 y repuesto) con buen labrado, presión y pernos completos', critical: true },
        { id: 'v9', section: '3. MECÁNICA, FRENOS Y LLANTAS', text: 'Dirección y suspensión estables, sin ruidos ni vibraciones anormales', critical: true },
        { id: 'v10', section: '3. MECÁNICA, FRENOS Y LLANTAS', text: 'Niveles de fluidos normales y ausencia de fugas (aceite, refrigerante, frenos)', critical: true },
        // Bloque 4: Equipo de Carretera
        { id: 'v11', section: '4. EQUIPO DE CARRETERA Y EMERGENCIA', text: 'Extintor con carga vigente y botiquín de primeros auxilios completo', critical: true },
        { id: 'v12', section: '4. EQUIPO DE CARRETERA Y EMERGENCIA', text: 'Kit de carretera (gato, cruceta, 2 señales/conos, 2 tacos, linterna y chaleco)', critical: false }
      ]
    },
    camioneta: {
      type: 'vehiculo',
      subtype: 'camioneta',
      label: 'Camioneta Operativa',
      shortLabel: 'CAMIONETA',
      title: 'Inspección Preoperacional — Camioneta Operativa',
      items: [
        { id: 'ca1', section: '1. DOCUMENTACIÓN LEGAL', text: 'SOAT y Tarjeta de Propiedad vigentes', critical: true },
        { id: 'ca2', section: '1. DOCUMENTACIÓN LEGAL', text: 'Revisión Técnico-Mecánica vigente', critical: true },
        { id: 'ca3', section: '1. DOCUMENTACIÓN LEGAL', text: 'Licencia de conducción vigente', critical: true },
        { id: 'ca4', section: '2. VISIBILIDAD Y CABINA', text: 'Luces bajas, altas, direccionales, freno y alarma/luz de reversa', critical: true },
        { id: 'ca5', section: '2. VISIBILIDAD Y CABINA', text: 'Parabrisas, limpiabrisas y espejos retrovisores en buen estado', critical: true },
        { id: 'ca6', section: '2. VISIBILIDAD Y CABINA', text: 'Cinturones de seguridad operativos y pito funcional', critical: true },
        { id: 'ca7', section: '3. MECÁNICA, FRENOS Y LLANTAS', text: 'Freno principal y freno de emergencia en óptimo estado', critical: true },
        { id: 'ca8', section: '3. MECÁNICA, FRENOS Y LLANTAS', text: 'Llantas y repuesto con buen labrado, presión y pernos completos', critical: true },
        { id: 'ca9', section: '3. MECÁNICA, FRENOS Y LLANTAS', text: 'Dirección, suspensión y platón/compuerta en buen estado', critical: true },
        { id: 'ca10', section: '3. MECÁNICA, FRENOS Y LLANTAS', text: 'Niveles de fluidos normales y sin fugas activas', critical: true },
        { id: 'ca11', section: '4. EQUIPO DE CARRETERA Y EMERGENCIA', text: 'Extintor vigente y botiquín de primeros auxilios completo', critical: true },
        { id: 'ca12', section: '4. EQUIPO DE CARRETERA Y EMERGENCIA', text: 'Kit de carretera completo (gato, cruceta, conos, tacos y linterna)', critical: false }
      ]
    }
  },
  camion: {
    camion: {
      type: 'camion',
      subtype: 'camion',
      label: 'Camión de Ruta',
      shortLabel: 'CAMIÓN',
      title: 'Inspección Preoperacional — Camión de Ruta',
      items: [
        // Bloque 1: Documentación Legal
        { id: 'k1', section: '1. DOCUMENTACIÓN LEGAL Y RUTA', text: 'SOAT, Revisión Técnico-Mecánica y Tarjeta de Propiedad vigentes', critical: true },
        { id: 'k2', section: '1. DOCUMENTACIÓN LEGAL Y RUTA', text: 'Licencia de conducción vigente para la categoría del vehículo', critical: true },
        { id: 'k3', section: '1. DOCUMENTACIÓN LEGAL Y RUTA', text: 'Documentos de transporte / planilla de ruta y permisos al día', critical: false },
        // Bloque 2: Cabina y Luces
        { id: 'k4', section: '2. CABINA, LUCES Y VISIBILIDAD', text: 'Luces delanteras, direccionales, demarcación, stop y alarma sonora de reversa', critical: true },
        { id: 'k5', section: '2. CABINA, LUCES Y VISIBILIDAD', text: 'Espejos panorámicos/laterales, parabrisas y limpiabrisas en buen estado', critical: true },
        { id: 'k6', section: '2. CABINA, LUCES Y VISIBILIDAD', text: 'Cinturones de seguridad (conductor y auxiliar de ruta) y peldaños de acceso seguros', critical: true },
        // Bloque 3: Frenos y Llantas
        { id: 'k7', section: '3. FRENOS, LLANTAS Y MOTOR', text: 'Sistema de frenos (presión de aire/líquido) y freno de seguridad operativos', critical: true },
        { id: 'k8', section: '3. FRENOS, LLANTAS Y MOTOR', text: 'Llantas direccionales, tracción y repuesto con labrado, presión y pernos completos', critical: true },
        { id: 'k9', section: '3. FRENOS, LLANTAS Y MOTOR', text: 'Motor, dirección y transmisión sin fugas de aceite, ACPM o refrigerante', critical: true },
        // Bloque 4: Carrocería y Emergencia
        { id: 'k10', section: '4. CARROCERÍA Y EMERGENCIAS', text: 'Furgón/carrocería, puertas, seguros y elementos de sujeción de carga en buen estado', critical: true },
        { id: 'k11', section: '4. CARROCERÍA Y EMERGENCIAS', text: 'Extintor reglamentario vigente y botiquín de primeros auxilios completo', critical: true },
        { id: 'k12', section: '4. CARROCERÍA Y EMERGENCIAS', text: 'Tacos de bloqueo, conos reflectivos, gato, herramienta y EPP de ruta', critical: true }
      ]
    }
  },
  montacarga: {
    electrica: {
      type: 'montacarga',
      subtype: 'electrica',
      label: 'Montacarga Eléctrica',
      shortLabel: 'MONTACARGA ELÉCTRICA',
      title: 'Inspección Preoperacional — Montacarga Eléctrica',
      items: [
        // Bloque 1: Estructura e Izaje
        { id: 'me1', section: '1. ESTRUCTURA E IZAJE', text: 'Horquillas (uñas) y seguros sin fisuras ni deformación', critical: true },
        { id: 'me2', section: '1. ESTRUCTURA E IZAJE', text: 'Mástil, cadenas de elevación y carro porta-horquillas en buen estado', critical: true },
        { id: 'me3', section: '1. ESTRUCTURA E IZAJE', text: 'Tejadillo protector, respaldo de carga y asiento con cinturón de seguridad', critical: true },
        // Bloque 2: Sistema Hidráulico y Frenos
        { id: 'me4', section: '2. HIDRÁULICO, DIRECCIÓN Y FRENOS', text: 'Cilindros de elevación/inclinación y mangueras sin fugas de aceite hidráulico', critical: true },
        { id: 'me5', section: '2. HIDRÁULICO, DIRECCIÓN Y FRENOS', text: 'Freno de servicio, freno de parqueo y botón de parada de emergencia operativos', critical: true },
        { id: 'me6', section: '2. HIDRÁULICO, DIRECCIÓN Y FRENOS', text: 'Dirección suave y mandos de elevación/inclinación funcionando sin trabas', critical: true },
        // Bloque 3: Energía y Seguridad
        { id: 'me7', section: '3. ENERGÍA, RUEDAS Y SEGURIDAD', text: 'Batería con carga adecuada, cables y conector sin sulfatación ni daños', critical: true },
        { id: 'me8', section: '3. ENERGÍA, RUEDAS Y SEGURIDAD', text: 'Luces de trabajo, licuadora/baliza, pito y alarma sonora de reversa funcionando', critical: true },
        { id: 'me9', section: '3. ENERGÍA, RUEDAS Y SEGURIDAD', text: 'Ruedas de carga y dirección sin desprendimientos ni desgaste excesivo', critical: true },
        { id: 'me10', section: '3. ENERGÍA, RUEDAS Y SEGURIDAD', text: 'Extintor cargado y vigente en el equipo', critical: true },
        { id: 'me11', section: '3. ENERGÍA, RUEDAS Y SEGURIDAD', text: 'Operador con certificación vigente y EPP completo (casco, botas de seguridad)', critical: true }
      ]
    },
    transpaleta: {
      type: 'montacarga',
      subtype: 'transpaleta',
      label: 'Transpaleta Manual',
      shortLabel: 'TRANSPALETA MANUAL',
      title: 'Inspección Preoperacional — Transpaleta Manual',
      items: [
        // Bloque 1: Estructura
        { id: 'tm1', section: '1. ESTRUCTURA Y HORQUILLAS', text: 'Chasis y horquillas rectas, sin fisuras, dobleces ni bordes cortantes', critical: true },
        { id: 'tm2', section: '1. ESTRUCTURA Y HORQUILLAS', text: 'Maneral / timón de tracción firme, con retorno automático a posición vertical', critical: true },
        { id: 'tm3', section: '1. ESTRUCTURA Y HORQUILLAS', text: 'Equipo limpio y libre de objetos atascados en su estructura', critical: false },
        // Bloque 2: Sistema Hidráulico
        { id: 'tm4', section: '2. SISTEMA HIDRÁULICO', text: 'Palanca de control (Subir / Neutro / Bajar) funcionando correctamente', critical: true },
        { id: 'tm5', section: '2. SISTEMA HIDRÁULICO', text: 'Gato / cilindro hidráulico sin fugas de aceite', critical: true },
        { id: 'tm6', section: '2. SISTEMA HIDRÁULICO', text: 'Eleva y sostiene la carga sin bajarse sola y desciende de forma controlada', critical: true },
        // Bloque 3: Ruedas y Operación Segura
        { id: 'tm7', section: '3. RUEDAS Y OPERACIÓN SEGURA', text: 'Ruedas direccionales y rodillos de carga completos, girando sin bloqueos', critical: true },
        { id: 'tm8', section: '3. RUEDAS Y OPERACIÓN SEGURA', text: 'Pasadores, ejes y articulaciones completos y asegurados', critical: true },
        { id: 'tm9', section: '3. RUEDAS Y OPERACIÓN SEGURA', text: 'Capacidad máxima de carga visible o conocida por el operador', critical: false },
        { id: 'tm10', section: '3. RUEDAS Y OPERACIÓN SEGURA', text: 'Colaborador con botas de seguridad con puntera y guantes de trabajo', critical: true }
      ]
    },
    transpaleta_electrica: {
      type: 'montacarga',
      subtype: 'transpaleta_electrica',
      label: 'Transpaleta Eléctrica',
      shortLabel: 'TRANSPALETA ELÉCTRICA',
      title: 'Inspección Preoperacional — Transpaleta Eléctrica',
      items: [
        // Bloque 1: Estructura
        { id: 'tm1', section: '1. ESTRUCTURA Y HORQUILLAS', text: 'Chasis y horquillas rectas, sin fisuras, dobleces ni bordes cortantes', critical: true },
        { id: 'tm2', section: '1. ESTRUCTURA Y HORQUILLAS', text: 'Maneral / timón de tracción firme, con retorno automático a posición vertical', critical: true },
        { id: 'tm3', section: '1. ESTRUCTURA Y HORQUILLAS', text: 'Equipo limpio y libre de objetos atascados en su estructura', critical: false },
        // Bloque 2: Sistema Hidráulico
        { id: 'tm4', section: '2. SISTEMA HIDRÁULICO', text: 'Palanca / mando de control (Subir / Neutro / Bajar) funcionando correctamente', critical: true },
        { id: 'tm5', section: '2. SISTEMA HIDRÁULICO', text: 'Gato / cilindro hidráulico sin fugas de aceite', critical: true },
        { id: 'tm6', section: '2. SISTEMA HIDRÁULICO', text: 'Eleva y sostiene la carga sin bajarse sola y desciende de forma controlada', critical: true },
        // Bloque 3: Ruedas y Operación Segura
        { id: 'tm7', section: '3. RUEDAS Y OPERACIÓN SEGURA', text: 'Ruedas direccionales y rodillos de carga completos, girando sin bloqueos', critical: true },
        { id: 'tm8', section: '3. RUEDAS Y OPERACIÓN SEGURA', text: 'Pasadores, ejes y articulaciones completos y asegurados', critical: true },
        { id: 'tm9', section: '3. RUEDAS Y OPERACIÓN SEGURA', text: 'Capacidad máxima de carga visible o conocida por el operador', critical: false },
        { id: 'tm10', section: '3. RUEDAS Y OPERACIÓN SEGURA', text: 'Colaborador con botas de seguridad con puntera y guantes de trabajo', critical: true },
        // Bloque 4: Mandos Eléctricos y Cableado (Adicionales de Transpaleta Eléctrica)
        { id: 'tm11', section: '4. MANDOS ELÉCTRICOS Y CABLEADO', text: 'Tiene bueno el botón de ascenso y descenso', critical: true },
        { id: 'tm12', section: '4. MANDOS ELÉCTRICOS Y CABLEADO', text: 'Tiene bueno el botón de movilidad', critical: true },
        { id: 'tm13', section: '4. MANDOS ELÉCTRICOS Y CABLEADO', text: 'El cableado está en buen estado', critical: true }
      ]
    }
  },
  transporte_publico: {
    publico: {
      type: 'transporte_publico',
      subtype: 'publico',
      label: 'Transporte Público',
      shortLabel: 'TRANSPORTE PÚBLICO',
      title: 'Confirmación de Medio de Desplazamiento — Transporte Público',
      items: []
    }
  }
};

function getBogotaDateParts() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = {};
  fmt.formatToParts(now).forEach(p => { parts[p.type] = p.value; });
  const yyyy = parts.year;
  const mm = parts.month;
  const dd = parts.day;
  const hh = parts.hour === '24' ? '00' : parts.hour;
  const mi = parts.minute;
  const ss = parts.second;
  return {
    sqlDateTime: `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`,
    displayDateTime: `${dd}/${mm}/${yyyy} ${hh}:${mi}`,
    yearMonth: `${yyyy}-${mm}`,
    compactTs: `${yyyy}${mm}${dd}-${hh}${mi}${ss}`,
  };
}

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textoResultadoItem(res) {
  if (res === 'C') return 'Cumple';
  if (res === 'NC') return 'No cumple';
  if (res === 'NA') return 'No aplica';
  return res || '—';
}

// Filas de Config_Parametros de un Módulo/Sección (si la tabla falla, se usan los valores por defecto).
async function obtenerParametrosPorSeccion(modulo, seccion) {
  try {
    const [rows] = await pool.execute(
      'SELECT `Concepto`, `Condicion`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ?',
      [modulo, seccion]
    );
    return rows;
  } catch (err) {
    console.error('[inspeccionesVehiculo] Error leyendo Config_Parametros:', err.message);
    return [];
  }
}

async function obtenerLimitesInspeccion() {
  const filas = await obtenerParametrosPorSeccion('empleado', 'Inspecciones_Vehiculo');
  let maxFotos = 4;
  let maxFotoMB = 10;

  for (const f of filas) {
    const concepto = String(f.Concepto || '').toLowerCase();
    const num = Number(String(f.Parametro || '').trim());
    if (concepto.includes('máximo de fotos') || concepto.includes('maximo de fotos')) {
      if (Number.isFinite(num) && num > 0 && num <= 10) maxFotos = num;
    } else if (concepto.includes('tamaño máximo') || concepto.includes('tamano maximo')) {
      if (Number.isFinite(num) && num > 0) maxFotoMB = num;
    }
  }

  return { maxFotos, maxFotoMB };
}

function obtenerResumenPlantillasInspeccion() {
  const out = {};
  Object.keys(INSPECTION_TEMPLATES).forEach(type => {
    out[type] = {};
    Object.keys(INSPECTION_TEMPLATES[type]).forEach(sub => {
      const t = INSPECTION_TEMPLATES[type][sub];
      out[type][sub] = {
        type: t.type,
        subtype: t.subtype,
        label: t.label,
        shortLabel: t.shortLabel,
        title: t.title,
        totalItems: t.items.length,
        criticalCount: t.items.filter(i => i.critical).length,
      };
    });
  });
  return out;
}

function obtenerPlantillaInspeccion(type, subtype) {
  const t = String(type || '').toLowerCase().trim();
  const s = String(subtype || t || '').toLowerCase().trim();
  if (!INSPECTION_TEMPLATES[t] || !INSPECTION_TEMPLATES[t][s]) {
    throw new Error('No se encontró la plantilla de inspección solicitada.');
  }
  return INSPECTION_TEMPLATES[t][s];
}

/**
 * Obtiene las placas y equipos habituales del colaborador desde Maestro_Placas
 * y desde su historial reciente en Dynamic_Inspecciones_Vehiculo.
 */
async function listarVehiculosHabitualesColaborador(identificacion, idVinculacion, nombre) {
  const placasMap = new Map();
  const equiposMap = new Map();

  // 1. Consultar Maestro_Placas donde empleado contenga el Id Vinculación o Nit coincida
  try {
    const idNum = Number(String(identificacion || '').replace(/\D/g, '')) || 0;
    const likeVinc = idVinculacion ? `%${idVinculacion}%` : '';
    const [rowsPlacas] = await pool.execute(
      `SELECT Placa, tipo_vehiculo AS tipoVehiculo, empleado, \`Fecha Registro\` AS fecha
       FROM Maestro_Placas
       WHERE (empleado IS NOT NULL AND empleado LIKE ?)
          OR (Nit IS NOT NULL AND Nit = ?)
       ORDER BY \`Fecha Registro\` DESC
       LIMIT 15`,
      [likeVinc || '__NO_MATCH__', idNum]
    );
    for (const r of rowsPlacas) {
      const p = String(r.Placa || '').trim().toUpperCase();
      if (p && !placasMap.has(p)) {
        placasMap.set(p, {
          placa: p,
          tipoVehiculo: r.tipoVehiculo || '',
        });
      }
    }
  } catch (err) {
    console.warn('[inspecciones] Aviso consultando Maestro_Placas:', err.message);
  }

  // 2. Consultar historial reciente en Dynamic_Inspecciones_Vehiculo
  try {
    const [rowsIns] = await pool.execute(
      `SELECT placa, equipo_interno AS equipoInterno, tipo, subtipo, tipo_label AS tipoLabel, odometro
       FROM Dynamic_Inspecciones_Vehiculo
       WHERE identificacion = ?
       ORDER BY fecha_registro DESC
       LIMIT 20`,
      [String(identificacion || '').trim()]
    );
    for (const r of rowsIns) {
      const p = String(r.placa || '').trim().toUpperCase();
      if (p && !placasMap.has(p)) {
        placasMap.set(p, {
          placa: p,
          tipoVehiculo: r.tipoLabel || r.subtipo || '',
          ultimoOdometro: r.odometro || '',
          subtipo: r.subtipo || '',
        });
      } else if (p && placasMap.has(p)) {
        const prev = placasMap.get(p);
        if (!prev.ultimoOdometro && r.odometro) prev.ultimoOdometro = r.odometro;
        if (!prev.subtipo && r.subtipo) prev.subtipo = r.subtipo;
      }

      const eq = String(r.equipoInterno || '').trim().toUpperCase();
      if (eq && !equiposMap.has(eq)) {
        equiposMap.set(eq, {
          equipoInterno: eq,
          subtipo: r.subtipo || '',
          tipoLabel: r.tipoLabel || '',
          ultimoOdometro: r.odometro || '',
        });
      }
    }
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('[inspecciones] Aviso consultando vehículos recientes:', err.message);
    }
  }

  return {
    placas: Array.from(placasMap.values()).slice(0, 8),
    equipos: Array.from(equiposMap.values()).slice(0, 8),
  };
}

/**
 * Busca placas registradas en Maestro_Placas por texto parcial para autocompletado.
 */
async function buscarPlacasEnMaestro(query) {
  const q = String(query || '').replace(/[^0-9A-Za-z-]/g, '').trim().toUpperCase();
  if (!q || q.length < 2) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT Placa AS placa, MAX(tipo_vehiculo) AS tipoVehiculo, MAX(empleado) AS empleado
       FROM Maestro_Placas
       WHERE Placa LIKE ?
       GROUP BY Placa
       ORDER BY MAX(\`Fecha Registro\`) DESC
       LIMIT 10`,
      [`%${q}%`]
    );
    return rows.map(r => ({
      placa: String(r.placa || '').trim().toUpperCase(),
      tipoVehiculo: r.tipoVehiculo || '',
      empleado: r.empleado || '',
    }));
  } catch (err) {
    console.warn('[inspecciones] Error buscando en Maestro_Placas:', err.message);
    return [];
  }
}

/**
 * Registra o actualiza la placa en Maestro_Placas en las columnas tipo_vehiculo y empleado
 * sin alterar las columnas de clientes que se relacionan con Dynamic_Servicios.
 */
async function sincronizarPlacaEnMaestroPlacas({ placa, tipoVehiculo, colaborador, sqlDateTime }) {
  const placaClean = String(placa || '').replace(/[^0-9A-Za-z-]/g, '').trim().toUpperCase();
  if (!placaClean) return;

  const empleadoStr = `${colaborador.nombre || 'Colaborador'} - ${colaborador.idVinculacion || colaborador.identificacion}`.slice(0, 180);
  const tipoStr = String(tipoVehiculo || '').trim().slice(0, 60);

  try {
    const [existentes] = await pool.execute(
      `SELECT ID FROM Maestro_Placas WHERE Placa = ? LIMIT 1`,
      [placaClean]
    );

    if (existentes.length > 0) {
      await pool.execute(
        `UPDATE Maestro_Placas
         SET tipo_vehiculo = ?, empleado = ?
         WHERE Placa = ?`,
        [tipoStr || null, empleadoStr, placaClean]
      );
    } else {
      const idNuevo = crypto.randomBytes(4).toString('hex');
      const nitNum = Number(String(colaborador.identificacion || '').replace(/\D/g, '')) || null;
      const usuarioCorto = empleadoStr.slice(0, 50);

      await pool.execute(
        `INSERT INTO Maestro_Placas (ID, Placa, Nit, Usuario, \`Fecha Registro\`, tipo_vehiculo, empleado)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [idNuevo, placaClean, nitNum, usuarioCorto, sqlDateTime, tipoStr || null, empleadoStr]
      );
    }
  } catch (err) {
    console.warn('[inspecciones] Aviso al sincronizar Maestro_Placas:', err.message);
  }
}

async function listarInspeccionesColaborador(identificacion, limit = 30) {
  const idLimpio = String(identificacion || '').trim();
  if (!idLimpio) return [];

  try {
    const [rows] = await pool.execute(
      `SELECT
         id,
         id_vinculacion AS idVinculacion,
         identificacion,
         trabajador,
         cargo,
         regional,
         operacion,
         tipo,
         subtipo,
         tipo_label AS tipoLabel,
         equipo_interno AS equipmentId,
         placa AS plate,
         odometro AS meter,
         resultado AS status,
         puntaje AS score,
         total_c AS totalC,
         total_nc AS totalNc,
         total_na AS totalNa,
         observaciones_generales AS generalObservations,
         plan_accion AS actionPlan,
         reporta_a AS reportTo,
         pdf_url AS pdfUrl,
         DATE_FORMAT(fecha_registro, '%Y-%m-%d %H:%i') AS timestamp
       FROM Dynamic_Inspecciones_Vehiculo
       WHERE identificacion = ?
       ORDER BY fecha_registro DESC
       LIMIT ${Number(limit) || 30}`,
      [idLimpio]
    );
    return rows;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return [];
    }
    throw err;
  }
}

async function calcularEstadisticasMesColaborador(identificacion) {
  const idLimpio = String(identificacion || '').trim();
  const empty = {
    totalMonth: 0,
    aptoCount: 0,
    novedadCount: 0,
    noAptoCount: 0,
    uniqueVehicles: 0,
  };
  if (!idLimpio) return empty;

  const { yearMonth } = getBogotaDateParts();

  try {
    const [rows] = await pool.execute(
      `SELECT
         COUNT(*) AS totalMonth,
         SUM(CASE WHEN resultado = 'APTO' THEN 1 ELSE 0 END) AS aptoCount,
         SUM(CASE WHEN resultado = 'APTO CON NOVEDADES' THEN 1 ELSE 0 END) AS novedadCount,
         SUM(CASE WHEN resultado = 'NO APTO' THEN 1 ELSE 0 END) AS noAptoCount,
         COUNT(DISTINCT COALESCE(NULLIF(placa, ''), NULLIF(equipo_interno, ''))) AS uniqueVehicles
       FROM Dynamic_Inspecciones_Vehiculo
       WHERE identificacion = ?
         AND DATE_FORMAT(fecha_registro, '%Y-%m') = ?`,
      [idLimpio, yearMonth]
    );
    const r = rows[0] || {};
    return {
      totalMonth: Number(r.totalMonth || 0),
      aptoCount: Number(r.aptoCount || 0),
      novedadCount: Number(r.novedadCount || 0),
      noAptoCount: Number(r.noAptoCount || 0),
      uniqueVehicles: Number(r.uniqueVehicles || 0),
    };
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return empty;
    }
    throw err;
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
  const statusColor = status === 'APTO'
    ? '#16a34a'
    : (status === 'NO APTO' ? '#dc2626' : '#d97706');

  const itemsRowsHtml = items.map((it, idx) => {
    const resBg = it.result === 'NC'
      ? '#fef2f2'
      : (it.result === 'C' ? '#f0fdf4' : '#f8fafc');
    const resColor = it.result === 'NC'
      ? '#b91c1c'
      : (it.result === 'C' ? '#15803d' : '#475569');
    return `
      <tr>
        <td style="padding:3.5px 6px;border:1px solid #cbd5e1;font-size:7.6pt;color:#0A315D;font-weight:700;">${escHtml(it.section)}</td>
        <td style="padding:3.5px 6px;border:1px solid #cbd5e1;font-size:7.8pt;color:#1e293b;">
          ${idx + 1}. ${escHtml(it.text)}
          ${it.critical ? '<span style="color:#dc2626;font-weight:700;font-size:6.8pt;"> [CRÍTICO]</span>' : ''}
        </td>
        <td style="padding:3.5px 6px;border:1px solid #cbd5e1;text-align:center;font-weight:700;font-size:7.8pt;background:${resBg};color:${resColor};">${escHtml(textoResultadoItem(it.result))}</td>
        <td style="padding:3.5px 6px;border:1px solid #cbd5e1;font-size:7.5pt;color:#334155;">${escHtml(it.observation || '')}</td>
      </tr>
    `;
  }).join('');

  const esTransportePublico = template.type === 'transporte_publico' || !items || !items.length;
  const cuerpoVerificacionHtml = esTransportePublico
    ? `
  <div style="border:1.5px solid #16a34a;background:#f0fdf4;border-radius:6px;padding:12px 14px;margin-bottom:8px;">
    <div style="font-size:9pt;font-weight:700;color:#15803d;text-transform:uppercase;margin-bottom:4px;">
      ✓ Confirmación de Desplazamiento en Transporte Público
    </div>
    <div style="font-size:8.2pt;color:#1e293b;line-height:1.45;">
      El colaborador confirma y declara que para sus desplazamientos laborales u operativos utiliza <strong>Transporte Público</strong>, por lo cual no aplica lista de chequeo preoperacional de vehículo propio ni de equipo asignado.
    </div>
  </div>`
    : `
  <table style="margin-bottom:6px;">
    <thead>
      <tr style="background:#0A315D;color:#ffffff;">
        <th style="padding:4px 6px;border:1px solid #cbd5e1;text-align:left;width:22%;font-size:7.5pt;">BLOQUE</th>
        <th style="padding:4px 6px;border:1px solid #cbd5e1;text-align:left;width:44%;font-size:7.5pt;">PUNTO DE VERIFICACIÓN</th>
        <th style="padding:4px 6px;border:1px solid #cbd5e1;text-align:center;width:14%;font-size:7.5pt;">ESTADO</th>
        <th style="padding:4px 6px;border:1px solid #cbd5e1;text-align:left;width:20%;font-size:7.5pt;">OBSERVACIÓN</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRowsHtml}
    </tbody>
  </table>`;

  let fotosHtml = '';
  if (Array.isArray(fotosDataUrls) && fotosDataUrls.length) {
    const cells = fotosDataUrls.map((src, i) => `
      <td style="width:50%;padding:5px;border:1px solid #cbd5e1;text-align:center;vertical-align:top;">
        <div style="font-size:7.2pt;font-weight:700;color:#475569;margin-bottom:3px;">Evidencia fotográfica #${i + 1}</div>
        <img src="${src}" style="max-width:200px;max-height:115px;object-fit:contain;border-radius:4px;" />
      </td>
    `);
    const rows = [];
    for (let i = 0; i < cells.length; i += 2) {
      const second = cells[i + 1] || '<td style="width:50%;padding:5px;border:1px solid #cbd5e1;"></td>';
      rows.push(`<tr>${cells[i]}${second}</tr>`);
    }
    fotosHtml = `
      <div style="margin-top:6px;page-break-inside:avoid;">
        <div style="background:#0A315D;color:#ffffff;padding:4px 8px;font-size:8pt;font-weight:700;border-radius:4px 4px 0 0;">
          REGISTRO FOTOGRÁFICO DE EVIDENCIA
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${rows.join('')}
        </table>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 5mm 10mm 7mm 10mm; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #173655;
      font-size: 8.2pt;
      margin: 0;
      padding: 0;
    }
    table { width: 100%; border-collapse: collapse; }
  </style>
</head>
<body>
  <table style="margin-bottom:5px;border:1px solid #cbd5e1;">
    <tr>
      <td style="width:30%;padding:5px 8px;text-align:center;border-right:1px solid #cbd5e1;background:#ffffff;">
        <img src="${LOGO_BASE64}" style="max-height:42px;max-width:145px;object-fit:contain;" />
      </td>
      <td style="width:70%;background:#0A315D;color:#ffffff;padding:6px 12px;text-align:center;">
        <div style="font-size:10.5pt;font-weight:700;letter-spacing:0.3px;">INSPECCIÓN PREOPERACIONAL DE VEHÍCULOS Y EQUIPOS</div>
        <div style="font-size:8.8pt;color:#FFD0B3;font-weight:700;margin-top:2px;">${escHtml(template.label.toUpperCase())}</div>
        <div style="font-size:7.2pt;color:#dbeafe;margin-top:2px;">ID Registro: ${escHtml(id)} · Fecha: ${escHtml(fechaHora)}</div>
      </td>
    </tr>
  </table>

  <table style="margin-bottom:6px;">
    <tr>
      <td style="padding:4px 7px;border:1px solid #cbd5e1;width:34%;">
        <div style="font-size:6.8pt;color:#64748b;text-transform:uppercase;font-weight:700;">Inspector / Colaborador</div>
        <div style="font-size:8.2pt;font-weight:700;margin-top:1px;">${escHtml(colaborador.nombre)}</div>
      </td>
      <td style="padding:4px 7px;border:1px solid #cbd5e1;width:22%;">
        <div style="font-size:6.8pt;color:#64748b;text-transform:uppercase;font-weight:700;">Identificación</div>
        <div style="font-size:8.2pt;font-weight:700;margin-top:1px;">${escHtml(colaborador.identificacion)}</div>
      </td>
      <td style="padding:4px 7px;border:1px solid #cbd5e1;width:22%;">
        <div style="font-size:6.8pt;color:#64748b;text-transform:uppercase;font-weight:700;">Cargo</div>
        <div style="font-size:8.2pt;font-weight:700;margin-top:1px;">${escHtml(colaborador.cargo || '—')}</div>
      </td>
      <td style="padding:4px 7px;border:1px solid #cbd5e1;width:22%;">
        <div style="font-size:6.8pt;color:#64748b;text-transform:uppercase;font-weight:700;">Operación / Regional</div>
        <div style="font-size:8.2pt;font-weight:700;margin-top:1px;">${escHtml(colaborador.operacion || '—')} (${escHtml(colaborador.regional || '—')})</div>
      </td>
    </tr>
    <tr>
      <td style="padding:4px 7px;border:1px solid #cbd5e1;">
        <div style="font-size:6.8pt;color:#64748b;text-transform:uppercase;font-weight:700;">Placa / N° Interno Equipo</div>
        <div style="font-size:8.2pt;font-weight:700;margin-top:1px;">${escHtml([placa, equipoInterno].filter(Boolean).join(' / ') || '—')}</div>
      </td>
      <td style="padding:4px 7px;border:1px solid #cbd5e1;">
        <div style="font-size:6.8pt;color:#64748b;text-transform:uppercase;font-weight:700;">Kilometraje / Horómetro</div>
        <div style="font-size:8.2pt;font-weight:700;margin-top:1px;">${escHtml(odometro || 'N/A')}</div>
      </td>
      <td style="padding:4px 7px;border:1px solid #cbd5e1;">
        <div style="font-size:6.8pt;color:#64748b;text-transform:uppercase;font-weight:700;">Reporta a</div>
        <div style="font-size:8.2pt;font-weight:700;margin-top:1px;">${escHtml(reportaA || '—')}</div>
      </td>
      <td style="padding:4px 7px;border:1px solid #cbd5e1;background:${statusColor};color:#ffffff;text-align:center;">
        <div style="font-size:6.8pt;text-transform:uppercase;font-weight:700;opacity:0.9;">Resultado (${score}%)</div>
        <div style="font-size:9pt;font-weight:700;margin-top:1px;">${escHtml(status)}</div>
      </td>
    </tr>
  </table>

  ${cuerpoVerificacionHtml}

  <table style="margin-bottom:6px;page-break-inside:avoid;">
    <tr>
      <td style="width:50%;padding:5px 8px;border:1px solid #cbd5e1;vertical-align:top;">
        <div style="font-size:7.2pt;font-weight:700;color:#0A315D;text-transform:uppercase;margin-bottom:2px;">Observaciones Generales</div>
        <div style="font-size:7.8pt;color:#334155;min-height:20px;">${escHtml(observacionesGenerales || 'Sin observaciones adicionales.')}</div>
      </td>
      <td style="width:50%;padding:5px 8px;border:1px solid #cbd5e1;vertical-align:top;">
        <div style="font-size:7.2pt;font-weight:700;color:#0A315D;text-transform:uppercase;margin-bottom:2px;">Plan de Acción / Medidas de Control</div>
        <div style="font-size:7.8pt;color:#334155;min-height:20px;">${escHtml(planAccion || 'No aplica.')}</div>
      </td>
    </tr>
  </table>

  ${fotosHtml}

  <table style="margin-top:8px;page-break-inside:avoid;">
    <tr>
      <td style="padding:6px 8px;border:1px solid #cbd5e1;width:62%;vertical-align:middle;">
        <div style="font-size:7.5pt;color:#334155;line-height:1.35;">
          <strong>Declaración del inspector:</strong> Certifico que he realizado personalmente la inspección preoperacional del vehículo/equipo descrito antes de iniciar su operación y que los datos registrados corresponden al estado real verificado.
        </div>
      </td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1;width:38%;text-align:center;vertical-align:middle;">
        ${firmaDataUrl ? `<img src="${firmaDataUrl}" style="max-height:46px;max-width:170px;object-fit:contain;" />` : '<div style="height:40px;"></div>'}
        <div style="border-top:1px solid #334155;margin-top:3px;padding-top:2px;font-size:7.5pt;font-weight:700;">
          Firma: ${escHtml(colaborador.nombre)} (${escHtml(colaborador.identificacion)})
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Resuelve la "Persona a quien reporta (Jefe / Coordinador / SST)" para el colaborador:
 * 1. Busca la Operación en la columna `Operación` de Maestro_Usuarios; si el Rol es
 *    Coordinador o CoordinadorR, toma el valor de `Nombre`.
 * 2. Si no hay coincidencia directa, busca la Operación del trabajador en la columna
 *    `Operación` de Maestro_Usuarios para obtener su `Regional`, y con ese dato de
 *    `Regional` busca el Rol `CoordinadorR` y toma el valor de `Nombre`.
 */
async function resolverCoordinadorReporta(operacion, regionalTrabajador) {
  const op = String(operacion || '').trim();
  const regFallback = String(regionalTrabajador || '').trim();

  if (op && op !== '—') {
    // Paso 1: Buscar Operación en Maestro_Usuarios donde Rol sea Coordinador o CoordinadorR
    const [directRows] = await pool.execute(
      `SELECT Nombre, Rol
       FROM Maestro_Usuarios
       WHERE \`Operación\` = ?
         AND Rol IN ('Coordinador', 'CoordinadorR')
         AND Nombre IS NOT NULL AND Nombre <> ''
       ORDER BY CASE WHEN Rol = 'Coordinador' THEN 1 ELSE 2 END, ID ASC
       LIMIT 1`,
      [op]
    );
    if (directRows.length && directRows[0].Nombre) {
      return String(directRows[0].Nombre).trim();
    }

    // Paso 2: Buscar la Operación en Maestro_Usuarios para obtener la columna Regional,
    // y luego con esa Regional buscar el Rol CoordinadorR
    const [regRows] = await pool.execute(
      `SELECT DISTINCT Regional
       FROM Maestro_Usuarios
       WHERE \`Operación\` = ?
         AND Regional IS NOT NULL AND Regional <> ''`,
      [op]
    );
    const regionales = regRows.map(r => String(r.Regional).trim()).filter(Boolean);
    if (regionales.length) {
      const placeholders = regionales.map(() => '?').join(',');
      const [coordRegRows] = await pool.execute(
        `SELECT Nombre
         FROM Maestro_Usuarios
         WHERE Regional IN (${placeholders})
           AND Rol = 'CoordinadorR'
           AND Nombre IS NOT NULL AND Nombre <> ''
         ORDER BY ID ASC
         LIMIT 1`,
        regionales
      );
      if (coordRegRows.length && coordRegRows[0].Nombre) {
        return String(coordRegRows[0].Nombre).trim();
      }
    }
  }

  // Respaldo: Si aún no se encontró y tenemos la Regional del trabajador en vinculación
  if (regFallback && regFallback !== '—') {
    const [fallbackRows] = await pool.execute(
      `SELECT Nombre
       FROM Maestro_Usuarios
       WHERE Regional = ?
         AND Rol = 'CoordinadorR'
         AND Nombre IS NOT NULL AND Nombre <> ''
       ORDER BY ID ASC
       LIMIT 1`,
      [regFallback]
    );
    if (fallbackRows.length && fallbackRows[0].Nombre) {
      return String(fallbackRows[0].Nombre).trim();
    }
  }

  return '';
}

async function crearInspeccionVehiculo(payload, colaborador) {
  const {
    type,
    subtype,
    equipmentId,
    plate,
    meter,
    reportTo,
    generalObservations,
    actionPlan,
    items,
    photos,
    usarFirmaPrevia,
    firmaBase64,
  } = payload || {};

  const template = obtenerPlantillaInspeccion(type, subtype);
  const esTransportePublico = type === 'transporte_publico';
  const esTranspaleta = subtype === 'transpaleta' || subtype === 'transpaleta_electrica';

  if ((type === 'vehiculo' || type === 'camion') && !String(plate || '').trim()) {
    throw new Error('La placa del vehículo es obligatoria.');
  }
  if (type === 'montacarga' && !String(equipmentId || '').trim()) {
    throw new Error('El número interno o código del equipo es obligatorio para montacargas y transpaletas.');
  }
  if (!esTransportePublico && !esTranspaleta && !String(meter || '').trim()) {
    throw new Error('El kilometraje u horómetro actual es obligatorio.');
  }

  if (!esTransportePublico && (!Array.isArray(items) || items.length !== template.items.length)) {
    throw new Error('La lista de chequeo está incompleta.');
  }

  const mapRespuestas = new Map();
  items.forEach(it => {
    if (it && it.id) {
      mapRespuestas.set(it.id, {
        result: String(it.result || '').toUpperCase().trim(),
        observation: String(it.observation || '').trim(),
      });
    }
  });

  const itemsNormalizados = template.items.map(tplItem => {
    const resp = mapRespuestas.get(tplItem.id);
    if (!resp || !['C', 'NC', 'NA'].includes(resp.result)) {
      throw new Error(`Falta responder el punto: "${tplItem.text}".`);
    }
    return {
      id: tplItem.id,
      section: tplItem.section,
      text: tplItem.text,
      critical: !!tplItem.critical,
      result: resp.result,
      observation: resp.observation,
    };
  });

  // Resolver firma del colaborador
  let firmaUrlPublica = null;
  let firmaDataUrl = null;

  if (usarFirmaPrevia) {
    // 1. Intentar desde el bucket de firmas (firmas-images)
    try {
      firmaUrlPublica = await obtenerUrlFirmaReciente(colaborador.identificacion);
      if (firmaUrlPublica) {
        firmaDataUrl = await obtenerFirmaBase64Reciente(colaborador.identificacion);
      }
    } catch (_) { /* continuar a Maestro_docTrabajador si falla */ }

    // 2. Respaldo en Maestro_docTrabajador (columna `Identificación` con tilde y `FechaRegistro`)
    if (!firmaUrlPublica) {
      const [fRows] = await pool.execute(
        `SELECT Doc FROM Maestro_docTrabajador
         WHERE \`Identificación\` = ? AND TipoDocumento = '22'
         ORDER BY FechaRegistro DESC LIMIT 1`,
        [String(colaborador.identificacion)]
      );
      if (fRows.length && fRows[0].Doc) {
        const rawDoc = String(fRows[0].Doc);
        firmaUrlPublica = rawDoc.startsWith('http')
          ? rawDoc
          : `https://storage.googleapis.com/talenthub_central/${rawDoc.replace(/^\/+/, '')}`;
      }
    }

    if (!firmaUrlPublica) {
      throw new Error('No se encontró una firma previa registrada. Por favor dibuja tu firma.');
    }

    if (!firmaDataUrl) {
      try {
        const respImg = await fetch(firmaUrlPublica);
        if (respImg.ok) {
          const arrBuf = await respImg.arrayBuffer();
          const b64 = Buffer.from(arrBuf).toString('base64');
          const cType = respImg.headers.get('content-type') || 'image/png';
          firmaDataUrl = `data:${cType};base64,${b64}`;
        }
      } catch (_) {
        firmaDataUrl = firmaUrlPublica;
      }
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

  const placaClean = esTransportePublico
    ? 'TRANSPORTE PÚBLICO'
    : String(plate || '').replace(/[^0-9A-Za-z-]/g, '').trim().toUpperCase();
  const equipoClean = String(equipmentId || '').trim().toUpperCase();
  const odometroClean = esTransportePublico ? 'N/A' : String(meter || '').trim();

  // Sincronizar placa en Maestro_Placas (columnas tipo_vehiculo y empleado) si aplica
  if (placaClean && !esTransportePublico) {
    await sincronizarPlacaEnMaestroPlacas({
      placa: placaClean,
      tipoVehiculo: template.shortLabel || template.label,
      colaborador,
      sqlDateTime,
    });
  }

  let reportaAFinal = String(reportTo || '').trim();
  if (!reportaAFinal) {
    try {
      reportaAFinal = await resolverCoordinadorReporta(colaborador.operacion, colaborador.regional);
    } catch (_) {
      reportaAFinal = '';
    }
  }

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
    reportaA: reportaAFinal,
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
      reportaAFinal || null,
      JSON.stringify(itemsNormalizados),
      JSON.stringify(fotosUrls),
      firmaUrlPublica,
      pdfUrl,
      sqlDateTime,
    ]
  );

  const [stats, recent, vehiculosHabituales] = await Promise.all([
    calcularEstadisticasMesColaborador(colaborador.identificacion),
    listarInspeccionesColaborador(colaborador.identificacion, 30),
    listarVehiculosHabitualesColaborador(colaborador.identificacion, colaborador.idVinculacion, colaborador.nombre),
  ]);

  return {
    ok: true,
    id,
    status,
    score,
    pdfUrl,
    stats,
    recent,
    vehiculosHabituales,
  };
}

async function generarFormatoBlancoPDF(type, subtype) {
  const template = obtenerPlantillaInspeccion(type, subtype);
  const rowsHtml = template.items.map((it, idx) => `
    <tr>
      <td style="padding:6px 7px;border:1px solid #cbd5e1;font-weight:700;color:#0A315D;font-size:8pt;">${escHtml(it.section)}</td>
      <td style="padding:6px 7px;border:1px solid #cbd5e1;font-size:8pt;">${idx + 1}. ${escHtml(it.text)}${it.critical ? ' <strong style="color:#dc2626;font-size:7pt;">[CRÍTICO]</strong>' : ''}</td>
      <td style="padding:6px;border:1px solid #cbd5e1;width:48px;"></td>
      <td style="padding:6px;border:1px solid #cbd5e1;width:54px;"></td>
      <td style="padding:6px;border:1px solid #cbd5e1;width:52px;"></td>
      <td style="padding:6px;border:1px solid #cbd5e1;width:130px;"></td>
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
        <th style="padding:5px;border:1px solid #cbd5e1;text-align:left;">BLOQUE</th>
        <th style="padding:5px;border:1px solid #cbd5e1;text-align:left;">PUNTO DE VERIFICACIÓN</th>
        <th style="padding:5px;border:1px solid #cbd5e1;text-align:center;">Cumple</th>
        <th style="padding:5px;border:1px solid #cbd5e1;text-align:center;">No cumple</th>
        <th style="padding:5px;border:1px solid #cbd5e1;text-align:center;">No aplica</th>
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

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO SST — CONFIGURACIÓN EN Config_Parametros, LISTADO, FILTROS Y REPORTES
// ══════════════════════════════════════════════════════════════════════════════

const DEFAULTS_SST_INSPECCIONES = {
  rolesRegistrar: [
    'Sistema', 'AdmSst', 'AnaSst', 'AuxSst', 'LiderSst',
    'Coordinador', 'CoordinadorR', 'Auxiliar', 'AuxiliarR'
  ],
  rolesEliminar: ['Sistema', 'AdmSst', 'LiderSst'],
  limiteExcel: 10000,
  limiteCsv: 100000,
};

function normTextoParam(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function parseListaParam(valor, fallback = []) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    return [...fallback];
  }
  return String(valor)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function rolEnListaParam(rol, lista) {
  const r = normTextoParam(rol);
  if (!r) return false;
  return (lista || []).some(item => normTextoParam(item) === r);
}

// Quién ve la pestaña "Inspecciones Vehículos" y qué operaciones ve lo gobierna
// exclusivamente Maestro_Menu (sst / Inspecciones_vehiculos) vía computarAccesoSst.
// Config_Parametros solo guarda permisos de acciones (registrar/eliminar) y límites de reporte.
async function obtenerConfigInspeccionesSST(rol = '') {
  const mapa = {};
  try {
    const [rows] = await pool.execute(
      `SELECT Concepto, Parametro
       FROM Config_Parametros
       WHERE Modulo = 'sst' AND Seccion = 'Inspecciones_Vehiculo'`
    );
    for (const r of rows) {
      if (r.Concepto) mapa[r.Concepto.trim()] = r.Parametro;
    }
  } catch (err) {
    console.warn('[inspeccionesVehiculoService] No se pudo leer Config_Parametros (sst/Inspecciones_Vehiculo):', err.message);
  }

  const rolesRegistrar = parseListaParam(
    mapa['Roles que pueden registrar inspecciones de vehículos en SST'],
    DEFAULTS_SST_INSPECCIONES.rolesRegistrar
  );
  const rolesEliminar = parseListaParam(
    mapa['Roles que pueden eliminar inspecciones de vehículos en SST'],
    DEFAULTS_SST_INSPECCIONES.rolesEliminar
  );

  const limiteExcelRaw = parseInt(mapa['Límite de filas reporte Excel - Inspecciones Vehículos'], 10);
  const limiteCsvRaw = parseInt(mapa['Límite de filas reporte CSV - Inspecciones Vehículos'], 10);

  return {
    rolesRegistrar,
    rolesEliminar,
    puedeRegistrar: rolEnListaParam(rol, rolesRegistrar),
    puedeEliminar: rolEnListaParam(rol, rolesEliminar),
    limitesReporte: {
      excel: Number.isFinite(limiteExcelRaw) && limiteExcelRaw > 0 ? limiteExcelRaw : DEFAULTS_SST_INSPECCIONES.limiteExcel,
      csv: Number.isFinite(limiteCsvRaw) && limiteCsvRaw > 0 ? limiteCsvRaw : DEFAULTS_SST_INSPECCIONES.limiteCsv,
    },
  };
}

function construirCondicionBaseAccesoSST(acceso) {
  const conds = [];
  const params = [];

  if (!acceso || !acceso.sinFiltro) {
    const ops = (acceso && Array.isArray(acceso.operacionesFiltro)) ? acceso.operacionesFiltro : [];
    if (!ops.length) {
      conds.push('1 = 0');
    } else {
      const ph = ops.map(() => '?').join(',');
      conds.push(`i.operacion IN (${ph})`);
      params.push(...ops);
    }
  }
  return { conds, params };
}

function construirCondicionesFiltroEspecifico(query = {}, omitirCampo = null) {
  const conds = [];
  const params = [];

  const trabajador = String(query.trabajador || '').trim();
  const regional = String(query.regional || '').trim();
  const operacion = String(query.operacion || '').trim();
  const tipo = String(query.tipo || '').trim();
  const resultado = String(query.resultado || '').trim();
  const fechaDesde = String(query.fechaDesde || '').trim();
  const fechaHasta = String(query.fechaHasta || '').trim();

  if (trabajador && omitirCampo !== 'trabajador') {
    const like = `%${trabajador}%`;
    conds.push('(i.trabajador LIKE ? OR i.identificacion LIKE ? OR i.placa LIKE ? OR i.equipo_interno LIKE ?)');
    params.push(like, like, like, like);
  }
  if (regional && omitirCampo !== 'regional') {
    conds.push('i.regional = ?');
    params.push(regional);
  }
  if (operacion && omitirCampo !== 'operacion') {
    conds.push('i.operacion = ?');
    params.push(operacion);
  }
  if (tipo && omitirCampo !== 'tipo') {
    conds.push('i.tipo_label = ?');
    params.push(tipo);
  }
  if (resultado && omitirCampo !== 'resultado') {
    conds.push('i.resultado = ?');
    params.push(resultado);
  }
  if (fechaDesde && omitirCampo !== 'fechaDesde') {
    conds.push('DATE(i.fecha_registro) >= ?');
    params.push(fechaDesde);
  }
  if (fechaHasta && omitirCampo !== 'fechaHasta') {
    conds.push('DATE(i.fecha_registro) <= ?');
    params.push(fechaHasta);
  }

  return { conds, params };
}

async function listarInspeccionesSST(acceso, query = {}) {
  const base = construirCondicionBaseAccesoSST(acceso);
  if (base.conds.includes('1 = 0')) {
    return {
      results: [],
      counts: { regionales: {}, operaciones: {}, tipos: {}, resultados: {} },
      stats: { total: 0, aptos: 0, novedades: 0, noAptos: 0 },
    };
  }

  const preConds = [...base.conds];
  const preParams = [...base.params];

  const trabajador = String(query.trabajador || '').trim();
  const fechaDesde = String(query.fechaDesde || '').trim();
  const fechaHasta = String(query.fechaHasta || '').trim();

  if (trabajador) {
    const like = `%${trabajador}%`;
    preConds.push('(i.trabajador LIKE ? OR i.identificacion LIKE ? OR i.placa LIKE ? OR i.equipo_interno LIKE ?)');
    preParams.push(like, like, like, like);
  }
  if (fechaDesde) {
    preConds.push('DATE(i.fecha_registro) >= ?');
    preParams.push(fechaDesde);
  }
  if (fechaHasta) {
    preConds.push('DATE(i.fecha_registro) <= ?');
    preParams.push(fechaHasta);
  }

  const whereSql = preConds.length ? `WHERE ${preConds.join(' AND ')}` : '';
  const [rows] = await pool.execute(
    `SELECT
       i.id, i.id_vinculacion, i.identificacion, i.trabajador, i.cargo,
       i.regional, i.operacion, i.tipo, i.subtipo, i.tipo_label,
       i.equipo_interno, i.placa, i.odometro, i.resultado, i.puntaje,
       i.total_c, i.total_nc, i.total_na, i.observaciones_generales,
       i.plan_accion, i.reporta_a, i.firma_url, i.pdf_url, i.fecha_registro
     FROM Dynamic_Inspecciones_Vehiculo i
     ${whereSql}
     ORDER BY i.fecha_registro DESC
     LIMIT 3000`,
    preParams
  );

  const fReg = String(query.regional || '').trim();
  const fOp = String(query.operacion || '').trim();
  const fTipo = String(query.tipo || '').trim();
  const fRes = String(query.resultado || '').trim();

  const counts = {
    regionales: {},
    operaciones: {},
    tipos: {},
    resultados: {},
  };

  const results = [];
  for (const r of rows) {
    const reg = r.regional || '';
    const op = r.operacion || '';
    const tp = r.tipo_label || '';
    const res = r.resultado || '';

    const matchReg = !fReg || reg === fReg;
    const matchOp = !fOp || op === fOp;
    const matchTipo = !fTipo || tp === fTipo;
    const matchRes = !fRes || res === fRes;

    if (matchOp && matchTipo && matchRes && reg) {
      counts.regionales[reg] = (counts.regionales[reg] || 0) + 1;
    }
    if (matchReg && matchTipo && matchRes && op) {
      counts.operaciones[op] = (counts.operaciones[op] || 0) + 1;
    }
    if (matchReg && matchOp && matchRes && tp) {
      counts.tipos[tp] = (counts.tipos[tp] || 0) + 1;
    }
    if (matchReg && matchOp && matchTipo && res) {
      counts.resultados[res] = (counts.resultados[res] || 0) + 1;
    }

    if (matchReg && matchOp && matchTipo && matchRes) {
      results.push(r);
    }
  }

  const stats = {
    total: results.length,
    aptos: results.filter(x => x.resultado === 'APTO').length,
    novedades: results.filter(x => x.resultado === 'APTO CON NOVEDADES').length,
    noAptos: results.filter(x => x.resultado === 'NO APTO').length,
  };

  return { results, counts, stats };
}

async function obtenerDetalleInspeccionSST(id, acceso) {
  const base = construirCondicionBaseAccesoSST(acceso);
  if (base.conds.includes('1 = 0')) return null;

  const conds = ['i.id = ?', ...base.conds];
  const params = [id, ...base.params];

  const [rows] = await pool.execute(
    `SELECT i.*
     FROM Dynamic_Inspecciones_Vehiculo i
     WHERE ${conds.join(' AND ')}
     LIMIT 1`,
    params
  );
  if (!rows.length) return null;

  const row = rows[0];
  let respuestas = [];
  let fotos = [];
  try {
    respuestas = row.respuestas_json ? JSON.parse(row.respuestas_json) : [];
  } catch (_) {
    respuestas = [];
  }
  try {
    fotos = row.fotos_json ? JSON.parse(row.fotos_json) : [];
  } catch (_) {
    fotos = [];
  }

  return {
    ...row,
    respuestas,
    fotos,
  };
}

async function eliminarInspeccionSST(id, acceso) {
  const base = construirCondicionBaseAccesoSST(acceso);
  if (base.conds.includes('1 = 0')) return { ok: false, error: 'Sin permisos sobre la operación' };

  const conds = ['i.id = ?', ...base.conds];
  const params = [id, ...base.params];

  const [rows] = await pool.execute(
    `SELECT i.id FROM Dynamic_Inspecciones_Vehiculo i WHERE ${conds.join(' AND ')} LIMIT 1`,
    params
  );
  if (!rows.length) {
    return { ok: false, error: 'Inspección no encontrada o fuera de su alcance' };
  }

  await pool.execute('DELETE FROM Dynamic_Inspecciones_Vehiculo WHERE id = ?', [id]);
  return { ok: true };
}

async function buscarColaboradorPorIdentificacionSST(identificacion, acceso) {
  const cc = String(identificacion || '').trim();
  if (!cc) return null;

  const [rows] = await pool.execute(
    `SELECT
       \`Id Vinculación\` AS idVinculacion,
       \`Identificación\` AS identificacion,
       Trabajador AS nombre,
       Cargo AS cargo,
       Regional AS regional,
       \`Operación\` AS operacion,
       Estado AS estado,
       \`Fecha de Ingreso\` AS fechaIngreso
     FROM \`Maestro_Vinculación\`
     WHERE \`Identificación\` = ?
     ORDER BY CASE WHEN Estado = 'Activo' THEN 0 ELSE 1 END, \`Fecha de Ingreso\` DESC
     LIMIT 1`,
    [cc]
  );

  if (!rows.length) return null;
  const col = rows[0];

  if (acceso && !acceso.sinFiltro) {
    const ops = Array.isArray(acceso.operacionesFiltro) ? acceso.operacionesFiltro : [];
    if (col.operacion && ops.length && !ops.includes(col.operacion)) {
      return { fueraDeAlcance: true, colaborador: col };
    }
  }

  const [firmaPreviaUrl, vehiculosHabituales, reportaPorDefecto] = await Promise.all([
    obtenerUrlFirmaReciente(col.identificacion).catch(() => null),
    listarVehiculosHabitualesColaborador(col.identificacion, col.idVinculacion, col.nombre),
    resolverCoordinadorReporta(col.operacion, col.regional),
  ]);

  return {
    fueraDeAlcance: false,
    colaborador: col,
    firmaPreviaUrl,
    vehiculosHabituales,
    reportaPorDefecto: reportaPorDefecto || '',
  };
}

async function buscarColaboradoresSST(q, acceso) {
  const term = String(q || '').trim();
  if (term.length < 2) return [];

  const conds = ["Estado = 'Activo'", '(Trabajador LIKE ? OR `Identificación` LIKE ?)'];
  const like = `%${term}%`;
  const params = [like, like];

  if (acceso && !acceso.sinFiltro) {
    const ops = Array.isArray(acceso.operacionesFiltro) ? acceso.operacionesFiltro : [];
    if (!ops.length) return [];
    const ph = ops.map(() => '?').join(',');
    conds.push(`\`Operación\` IN (${ph})`);
    params.push(...ops);
  }

  const [rows] = await pool.execute(
    `SELECT
       \`Id Vinculación\` AS idVinculacion,
       \`Identificación\` AS identificacion,
       Trabajador AS nombre,
       Cargo AS cargo,
       Regional AS regional,
       \`Operación\` AS operacion
     FROM \`Maestro_Vinculación\`
     WHERE ${conds.join(' AND ')}
     ORDER BY Trabajador ASC
     LIMIT 15`,
    params
  );
  return rows;
}

const COLUMNAS_REPORTE_INSPECCIONES = [
  { titulo: 'ID Inspección',          campo: 'id',                      tipo: 'texto',     ancho: 22 },
  { titulo: 'Fecha Registro',         campo: 'fecha_registro',          tipo: 'fechaHora', ancho: 20 },
  { titulo: 'Identificación',         campo: 'identificacion',          tipo: 'texto',     ancho: 16 },
  { titulo: 'Trabajador',             campo: 'trabajador',              tipo: 'texto',     ancho: 32 },
  { titulo: 'Id Vinculación',         campo: 'id_vinculacion',          tipo: 'texto',     ancho: 18 },
  { titulo: 'Cargo',                  campo: 'cargo',                   tipo: 'texto',     ancho: 26 },
  { titulo: 'Regional',               campo: 'regional',                tipo: 'texto',     ancho: 18 },
  { titulo: 'Operación',              campo: 'operacion',               tipo: 'texto',     ancho: 26 },
  { titulo: 'Medio / Tipo Vehículo',  campo: 'tipo_label',              tipo: 'texto',     ancho: 24 },
  { titulo: 'Placa',                  campo: 'placa',                   tipo: 'texto',     ancho: 14 },
  { titulo: 'Equipo Interno',         campo: 'equipo_interno',          tipo: 'texto',     ancho: 18 },
  { titulo: 'Kilometraje / Horómetro',campo: 'odometro',                tipo: 'texto',     ancho: 18 },
  { titulo: 'Resultado',              campo: 'resultado',               tipo: 'texto',     ancho: 20 },
  { titulo: 'Puntaje (%)',            campo: 'puntaje',                 tipo: 'numero',    ancho: 14 },
  { titulo: 'Ítems Cumple',           campo: 'total_c',                 tipo: 'numero',    ancho: 14 },
  { titulo: 'Ítems No Cumple',        campo: 'total_nc',                tipo: 'numero',    ancho: 16 },
  { titulo: 'Ítems No Aplica',        campo: 'total_na',                tipo: 'numero',    ancho: 16 },
  { titulo: 'Reporta A',              campo: 'reporta_a',               tipo: 'texto',     ancho: 28 },
  { titulo: 'Observaciones Generales',campo: 'observaciones_generales', tipo: 'texto',     ancho: 38 },
  { titulo: 'Plan de Acción',         campo: 'plan_accion',             tipo: 'texto',     ancho: 38 },
  { titulo: 'URL Acta PDF',           campo: 'pdf_url',                 tipo: 'texto',     ancho: 45 },
];

async function contarFilasReporteInspecciones(acceso, query = {}) {
  const base = construirCondicionBaseAccesoSST(acceso);
  if (base.conds.includes('1 = 0')) return 0;

  const spec = construirCondicionesFiltroEspecifico(query);
  const allConds = [...base.conds, ...spec.conds];
  const allParams = [...base.params, ...spec.params];
  const whereSql = allConds.length ? `WHERE ${allConds.join(' AND ')}` : '';

  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM Dynamic_Inspecciones_Vehiculo i ${whereSql}`,
    allParams
  );
  return Number(rows[0]?.total) || 0;
}

async function obtenerFilasReporteInspecciones(acceso, query = {}, limite = 100000) {
  const base = construirCondicionBaseAccesoSST(acceso);
  if (base.conds.includes('1 = 0')) return [];

  const spec = construirCondicionesFiltroEspecifico(query);
  const allConds = [...base.conds, ...spec.conds];
  const allParams = [...base.params, ...spec.params];
  const whereSql = allConds.length ? `WHERE ${allConds.join(' AND ')}` : '';
  const maxRows = Math.max(1, Math.min(Number(limite) || 100000, 200000));

  const [rows] = await pool.execute(
    `SELECT
       i.id, i.fecha_registro, i.identificacion, i.trabajador, i.id_vinculacion,
       i.cargo, i.regional, i.operacion, i.tipo_label, i.placa, i.equipo_interno,
       i.odometro, i.resultado, i.puntaje, i.total_c, i.total_nc, i.total_na,
       i.reporta_a, i.observaciones_generales, i.plan_accion, i.pdf_url
     FROM Dynamic_Inspecciones_Vehiculo i
     ${whereSql}
     ORDER BY i.fecha_registro DESC
     LIMIT ${maxRows}`,
    allParams
  );
  return rows;
}

module.exports = {
  INSPECTION_TEMPLATES,
  obtenerLimitesInspeccion,
  obtenerResumenPlantillasInspeccion,
  obtenerPlantillaInspeccion,
  listarVehiculosHabitualesColaborador,
  buscarPlacasEnMaestro,
  listarInspeccionesColaborador,
  calcularEstadisticasMesColaborador,
  resolverCoordinadorReporta,
  crearInspeccionVehiculo,
  generarFormatoBlancoPDF,
  obtenerConfigInspeccionesSST,
  listarInspeccionesSST,
  obtenerDetalleInspeccionSST,
  eliminarInspeccionSST,
  buscarColaboradorPorIdentificacionSST,
  buscarColaboradoresSST,
  COLUMNAS_REPORTE_INSPECCIONES,
  contarFilasReporteInspecciones,
  obtenerFilasReporteInspecciones,
};
