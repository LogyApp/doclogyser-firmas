// ── Exportación de reportes (Excel .xlsx y CSV) sin dependencias externas ────
// - generarXlsx: arma un libro de Excel mínimo (una hoja) en memoria. Pensado
//   para reportes medianos (el límite lo define cada módulo, p. ej. 10.000 filas).
// - CSV: se escribe fila por fila en la respuesta (streaming), para reportes
//   grandes sin cargar todo en memoria. Separador ";" y BOM UTF-8 para que Excel
//   en español lo abra con tildes y columnas correctas.
//
// Columnas: [{ titulo, campo, tipo }] con tipo 'texto' | 'numero' | 'fecha' | 'fechaHora'.

// ── Utilidades de fecha ──────────────────────────────────────────────────────
// Las fechas de MySQL llegan como Date (el pool usa timezone -05:00). Se leen
// siempre en hora de Bogotá, sin depender de la zona horaria del servidor
// (Cloud Run corre en UTC).
const FORMATO_BOGOTA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function partesFecha(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return null;
    const p = {};
    FORMATO_BOGOTA.formatToParts(valor).forEach(({ type, value }) => { p[type] = Number(value); });
    return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
  }
  const t = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!t) return null;
  return { y: +t[1], m: +t[2], d: +t[3], h: +(t[4] || 0), mi: +(t[5] || 0), s: +(t[6] || 0) };
}

const p2 = n => String(n).padStart(2, '0');

function textoFecha(valor, conHora) {
  const f = partesFecha(valor);
  if (!f) return '';
  const fecha = `${p2(f.d)}/${p2(f.m)}/${f.y}`;
  return conHora ? `${fecha} ${p2(f.h)}:${p2(f.mi)}` : fecha;
}

// Número de serie de Excel (días desde 1899-12-30) + fracción del día.
function serialExcel(valor, conHora) {
  const f = partesFecha(valor);
  if (!f) return null;
  const dias = (Date.UTC(f.y, f.m - 1, f.d) - Date.UTC(1899, 11, 30)) / 86400000;
  return conHora ? dias + (f.h * 3600 + f.mi * 60 + f.s) / 86400 : dias;
}

// ── CSV ──────────────────────────────────────────────────────────────────────
function celdaCsv(valor) {
  const s = valor === null || valor === undefined ? '' : String(valor);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function valorTexto(col, fila) {
  const v = fila[col.campo];
  if (col.tipo === 'fecha') return textoFecha(v, false);
  if (col.tipo === 'fechaHora') return textoFecha(v, true);
  return v === null || v === undefined ? '' : v;
}

function encabezadoCsv(columnas) {
  return '﻿' + columnas.map(c => celdaCsv(c.titulo)).join(';') + '\r\n';
}

function filaCsv(columnas, fila) {
  return columnas.map(c => celdaCsv(valorTexto(c, fila))).join(';') + '\r\n';
}

// ── XLSX ─────────────────────────────────────────────────────────────────────
function xmlEsc(valor) {
  return String(valor)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function letraColumna(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Estilos: 0 normal · 1 encabezado (negrita) · 2 fecha dd/mm/yyyy · 3 fecha y hora
const ESTILOS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1B2A5E"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function celdaXlsx(ref, col, fila) {
  const v = fila[col.campo];
  if (col.tipo === 'fecha' || col.tipo === 'fechaHora') {
    const serial = serialExcel(v, col.tipo === 'fechaHora');
    if (serial === null) return '';
    return `<c r="${ref}" s="${col.tipo === 'fecha' ? 2 : 3}"><v>${serial}</v></c>`;
  }
  if (col.tipo === 'numero' && v !== null && v !== '' && !isNaN(Number(v))) {
    return `<c r="${ref}"><v>${Number(v)}</v></c>`;
  }
  if (v === null || v === undefined || v === '') return '';
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
}

function hojaXml(columnas, filas) {
  const anchos = columnas.map(c => `<col min="${columnas.indexOf(c) + 1}" max="${columnas.indexOf(c) + 1}" width="${c.ancho || 18}" customWidth="1"/>`).join('');
  const partes = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
    `<cols>${anchos}</cols>`,
    '<sheetData>',
    '<row r="1">' + columnas.map((c, i) => `<c r="${letraColumna(i)}1" t="inlineStr" s="1"><is><t>${xmlEsc(c.titulo)}</t></is></c>`).join('') + '</row>',
  ];
  filas.forEach((fila, idx) => {
    const r = idx + 2;
    partes.push(`<row r="${r}">` + columnas.map((c, i) => celdaXlsx(`${letraColumna(i)}${r}`, c, fila)).join('') + '</row>');
  });
  const ultima = `${letraColumna(columnas.length - 1)}${Math.max(filas.length + 1, 1)}`;
  partes.push('</sheetData>', `<autoFilter ref="A1:${ultima}"/>`, '</worksheet>');
  return partes.join('');
}

// ZIP sin compresión ("store"): suficiente para Excel y sin dependencias.
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zipStore(archivos) {
  const locales = [];
  const centrales = [];
  let offset = 0;
  for (const { nombre, contenido } of archivos) {
    const nombreBuf = Buffer.from(nombre, 'utf8');
    const datos = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8');
    const crc = crc32(datos);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);           // versión necesaria
    local.writeUInt16LE(0x0800, 6);       // nombres en UTF-8
    local.writeUInt16LE(0, 8);            // sin compresión
    local.writeUInt32LE(0, 10);           // hora/fecha
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(datos.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombreBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locales.push(local, nombreBuf, datos);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(datos.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nombreBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrales.push(central, nombreBuf);

    offset += 30 + nombreBuf.length + datos.length;
  }
  const centralBuf = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(centralBuf.length, 12);
  fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, centralBuf, fin]);
}

function generarXlsx({ hoja = 'Reporte', columnas, filas }) {
  const nombreHoja = xmlEsc(String(hoja).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Reporte');
  return zipStore([
    { nombre: '[Content_Types].xml', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { nombre: '_rels/.rels', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { nombre: 'xl/workbook.xml', contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${nombreHoja}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${nombreHoja}'!$A$1:$${letraColumna(columnas.length - 1)}$${Math.max(filas.length + 1, 1)}</definedName></definedNames></workbook>` },
    { nombre: 'xl/_rels/workbook.xml.rels', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { nombre: 'xl/styles.xml', contenido: ESTILOS_XML },
    { nombre: 'xl/worksheets/sheet1.xml', contenido: hojaXml(columnas, filas) },
  ]);
}

// Nombre de archivo con fecha/hora de Bogotá: Activos_2026-10-21_1530.xlsx
function nombreArchivo(base, extension) {
  const b = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  return `${base}_${b.getFullYear()}-${p2(b.getMonth() + 1)}-${p2(b.getDate())}_${p2(b.getHours())}${p2(b.getMinutes())}.${extension}`;
}

module.exports = { generarXlsx, encabezadoCsv, filaCsv, nombreArchivo, textoFecha };
