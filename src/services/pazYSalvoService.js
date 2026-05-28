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

  // Subgrupo Coordinadores: todas las áreas incluida Gerencia Operaciones
  if (CARGOS_ALTO_COORDINADOR.includes(cargoUpper)) {
    return { nivel: 'alto', areasRequeridas: ['tecnologia', 'sst', 'facturacion', 'contabilidad', 'cuentas', 'gerencia', 'nomina'] };
  }

  // Resto de cargos alto: Tecnología, SST, Facturación, Contabilidad, Cuentas y Nómina
  return { nivel: 'alto', areasRequeridas: ['tecnologia', 'sst', 'facturacion', 'contabilidad', 'cuentas', 'nomina'] };
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
      const etiqueta = NOMBRES_AREA[area] || area;

      const firmaHtml = url
        ? `<img src="${url}" style="max-height:50px;max-width:140px;display:block;margin:0 auto">`
        : `<div style="height:50px;border-bottom:1px solid #555;margin-bottom:2px"></div>`;

      return `<td style="width:${width}%;padding:6px 10px;vertical-align:bottom">
        <div style="font-size:9px;font-weight:bold;margin-bottom:2px">Firma ${etiqueta}:</div>
        ${firmaHtml}
        <div style="border-top:1px solid #555;padding-top:4px;font-size:9px;line-height:1.5">
          Nombre: <strong>${nombre}</strong><br>Cargo: ${cargo}
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
  return areasRequeridas.every(area => !!pz[`firma_${area}_url`]);
}

module.exports = {
  EMAILS_AREA,
  NOMBRES_AREA,
  ARTICULOS_BASE,
  determinarNivelYAreas,
  generarFilasArticulosHTML,
  generarFirmasAreasHtml,
  estaCompleto,
};
