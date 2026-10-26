// Servicio central de lógica para el Paz y Salvo de retiro

// Cargos que requieren nivel ALTO de compromiso (TH-R-022) con más áreas
const CARGOS_ALTO = [
  'COORDINADOR LOGISTICO',
  'AUXILIAR ADMINISTRATIVO DE OPERACIÓN',
  'AUXILIAR ADMINISTRATIVO REGIONAL',
  'ANALISTA DE NOMINA',
  'ASISTENTE CONTABLE',
  'COORDINADOR REGIONAL',
  'ANALISTA DE FACTURACIÓN',
  'ANALISTA DE TESORERIA',
  'ANALISTA Y CONTROL DE DATOS',
  'AUDITORA DE RECAUDO',
  'AUXILIAR DE ARCHIVO',
  'AUXILIAR FACTURACION',
  'CONTADOR',
  'COORDINADOR DE CALIDAD',
  'COORDINADOR DE NOMINA',
  'COORDINADOR DE SELECCIÓN',
  'DIRECTOR DE CALIDAD',
  'DIRECTOR SST',
  'DIRECTOR TALENTO HUMANO',
  'JEFE DE CUENTAS',
  'JEFE DE FACTURACION',
  'JEFE DE TECNOLOGIA',
  'RECEPCIONISTA',
  'SUBGERENTE DE OPERACIONES',
  'ANALISTA DE SST',
  'AUXILIAR SST',
];

// Subgrupo 1: solo firman Tecnología, SST y Nómina
const CARGOS_ALTO_SST = ['ANALISTA DE SST', 'AUXILIAR SST'];

// Subgrupo 2: firman Tecnología, SST, Facturación, Contabilidad, Cuentas, Gerencia Operaciones y Nómina
const CARGOS_ALTO_COORDINADOR = ['COORDINADOR LOGISTICO', 'COORDINADOR REGIONAL'];

// Áreas con sus emails de destino
const EMAILS_AREA = {
  tecnologia:   ['administradorti@logyser.com'],
  nomina:       ['nomina@logyser.com', 'gestor.nomina@logyser.com'],
  sst:          ['sst.nacional@logyser.com', 'sstadmon@logyser.com'],
  facturacion:  ['jefe.facturacion@logyser.com'],
  contabilidad: ['jefe.contabilidad@logyser.com'],
  cuentas:      ['controlcuentas@logyser.com'],
  gerencia:     ['subgerenciaoperaciones@logyser.com', 'gerenciaoperaciones@logyser.com'],
};

const NOMBRES_AREA = {
  tecnologia:   'Tecnología',
  nomina:       'Nómina',
  sst:          'SST',
  facturacion:  'Facturación',
  contabilidad: 'Contabilidad',
  cuentas:      'Cuentas por Pagar',
  gerencia:     'Gerencia de Operaciones',
};

const ARTICULOS_BASE = [
  'Buzo manga larga con Logo',
  'Jean',
  'Botas de seguridad',
  'Guantes',
  'Chaqueta',
  'Casco',
  'Carnet',
  'Llaves',
  'Celular',
  'Computador',
];

/**
 * Determina el nivel de compromiso y las áreas requeridas según el cargo.
 * @param {string} cargo
 * @returns {{ nivel: 'bajo'|'alto', areasRequeridas: string[] }}
 */
function determinarNivelYAreas(cargo) {
  const cargoUpper = (cargo || '').toUpperCase().trim();

  if (!CARGOS_ALTO.includes(cargoUpper)) {
    return { nivel: 'bajo', areasRequeridas: ['nomina'] };
  }

  // Subgrupo SST: solo Tecnología, SST y Nómina
  if (CARGOS_ALTO_SST.includes(cargoUpper)) {
    return { nivel: 'alto', areasRequeridas: ['tecnologia', 'sst', 'nomina'] };
  }

  // Subgrupo Coordinadores: todas las áreas incluida Gerencia Operaciones (sin SST)
  if (CARGOS_ALTO_COORDINADOR.includes(cargoUpper)) {
    return { nivel: 'alto', areasRequeridas: ['tecnologia', 'facturacion', 'contabilidad', 'cuentas', 'gerencia', 'nomina'] };
  }

  // Resto de cargos alto: Tecnología, Facturación, Contabilidad, Cuentas y Nómina
  return { nivel: 'alto', areasRequeridas: ['tecnologia', 'facturacion', 'contabilidad', 'cuentas', 'nomina'] };
}

/**
 * Genera el HTML de filas de artículos para la plantilla de Paz y Salvo.
 * @param {Array<{nombre: string, cantidad: number|string, devuelve: boolean}>} articulos
 * @returns {string} HTML de filas <tr>
 */
function generarFilasArticulosHTML(articulos) {
  if (!articulos || !articulos.length) {
    return '<tr><td colspan="4" style="text-align:center;padding:8px;color:#888">Sin artículos registrados</td></tr>';
  }
  return articulos.map((art, i) => {
    const si  = art.devuelve === true  || art.devuelve === 'true'  ? 'X' : '';
    const no  = art.devuelve === false || art.devuelve === 'false' ? 'X' : '';
    return `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f8f9fb'}">
      <td class="art-name">${art.nombre}</td>
      <td>${art.cantidad || ''}</td>
      <td>${si}</td>
      <td>${no}</td>
    </tr>`;
  }).join('');
}

/**
 * Genera el HTML del bloque de firmas de áreas para la plantilla alto compromiso.
 * @param {object} pz - Registro de Maestro_pazysalvo (con campos firma_*_url, firma_*_nombre, etc.)
 * @param {string[]} areasRequeridas
 * @returns {string}
 */
// Sello "Firmado: dd/mm/yyyy hh:mm" bajo una firma, igual al que usa el módulo Logysign.
// `fecha` es el valor ya guardado en BD (columna fecha_firma_<area>), no se calcula aquí.
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fechaFirmaTexto(fecha) {
  if (!fecha) return '';
  const b = new Date(new Date(fecha).toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `Firmado: ${p(b.getDate())}/${p(b.getMonth() + 1)}/${b.getFullYear()} ${p(b.getHours())}:${p(b.getMinutes())}`;
}

function generarFirmasAreasHtml(pz, areasRequeridas) {
  // Distribuir en filas de 3
  const cols = 3;
  const filas = [];
  for (let i = 0; i < areasRequeridas.length; i += cols) {
    filas.push(areasRequeridas.slice(i, i + cols));
  }
  const width = Math.floor(100 / cols);

  return filas.map(fila => {
    const celdas = fila.map(area => {
      const url      = pz[`firma_${area}_url`];
      const nombre   = pz[`firma_${area}_nombre`] || '';
      const cargo    = pz[`firma_${area}_cargo`] || '';
      const obs      = pz[`observacion_${area}`] || '';
      const etiqueta = NOMBRES_AREA[area] || area;

      const firmaHtml = url
        ? `<img src="${url}" style="max-height:50px;max-width:140px;display:block;margin:0 auto">
           <div style="font-size:6px;color:#888;text-align:center">${fechaFirmaTexto(pz[`fecha_firma_${area}`])}</div>`
        : `<div style="border:1px dashed #999;border-radius:3px;padding:4px 6px;color:#555;font-size:7.5px;text-align:center;line-height:1.2;background:#f9f9f9;min-height:36px;display:flex;align-items:center;justify-content:center">
             Se informó al área por correo electrónico
           </div>`;

      const obsHtml = obs
        ? `<div style="margin-top:3px;padding:2px 4px;background:#f4faf8;border-left:2.5px solid #16a085;border-radius:2px;font-size:7.5px;color:#222;line-height:1.25;text-align:left;word-break:break-word">
             <strong style="color:#16a085">Comentario:</strong> ${escapeHtml(obs)}
           </div>`
        : '';

      return `<td style="width:${width}%;padding:6px 8px;vertical-align:top">
        <div style="font-size:9px;font-weight:bold;margin-bottom:2px">Firma ${etiqueta}:</div>
        ${firmaHtml}
        <div style="border-top:1px solid #555;padding-top:4px;font-size:8.5px;line-height:1.4">
          Nombre: <strong>${nombre || '—'}</strong><br>Cargo: ${cargo || '—'}
          ${obsHtml}
        </div>
      </td>`;
    });
    // Rellenar hasta 3 columnas
    while (celdas.length < cols) celdas.push(`<td style="width:${width}%"></td>`);
    return `<tr>${celdas.join('')}</tr>`;
  }).join('');
}

/**
 * Verifica si todas las áreas han firmado.
 * @param {object} pz - Registro de Maestro_pazysalvo
 * @param {string[]} areasRequeridas
 * @returns {boolean}
 */
function estaCompleto(pz, areasRequeridas) {
  const arr = normalizarAreasRequeridas(areasRequeridas);
  return arr.length > 0 && arr.every(area => !!pz[`firma_${area}_url`]);
}

function normalizarAreasRequeridas(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return val.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

module.exports = {
  EMAILS_AREA,
  NOMBRES_AREA,
  ARTICULOS_BASE,
  determinarNivelYAreas,
  generarFilasArticulosHTML,
  generarFirmasAreasHtml,
  estaCompleto,
  fechaFirmaTexto,
  escapeHtml,
  normalizarAreasRequeridas,
};
