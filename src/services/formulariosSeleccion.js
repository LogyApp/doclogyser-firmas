const pool = require('./db');

// ── Formularios de los documentos de firma (Selección) ───────────────────────
// Catálogo:   Config_Formulario_Preguntas (preguntas por documento de Config_Doc_Trabajador)
// Respuestas: Dynamic_hv_respuestas (una fila por aspirante, documento y pregunta)
// Si las tablas no existen o el documento no tiene preguntas, la firma funciona como antes.
//
// Tipos de pregunta (columna `tipo`):
//   si_no     → Sí / No
//   texto     → texto libre
//   numero    → número
//   opcion    → una opción de `opciones` (separadas por coma)
//   multiple  → varias opciones de `opciones`
//   marcas    → casillas de `opciones`; las preguntas seguidas de la misma sección con las
//               mismas opciones se muestran como una tabla
//   cuerpo    → igual que marcas, pero con la figura del cuerpo interactiva: el texto de la
//               pregunta es la zona (Cráneo, Cara, Cuello, Tórax, Tronco, Brazo, Antebrazo,
//               Mano, Abdomen, Pelvis, Muslo, Pierna, Pie). Opción 1 se pinta en rojo,
//               opción 2 en ámbar, las dos en morado y "Ninguno" en verde.
// `detalle_si` (solo si_no): campos extra cuando la respuesta es "Sí", separados por coma:
//   fecha  → fecha del evento        origen → AT / T / C
//   texto[:Etiqueta] → texto (obligatorio si la pregunta es obligatoria)
// `obligatorio`: 1 = debe responderse para poder firmar, 0 = opcional.

const ORIGENES = [
  { valor: 'AT', texto: 'AT (accidente de trabajo)' },
  { valor: 'T', texto: 'T (tránsito)' },
  { valor: 'C', texto: 'C (común)' }
];

function esc(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function normalizar(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function parseOpciones(txt) {
  return String(txt || '').split(',').map(x => x.trim()).filter(Boolean);
}

function parseDetalle(txt) {
  const det = { fecha: false, origen: false, texto: null };
  String(txt || '').split(',').map(x => x.trim()).filter(Boolean).forEach(parte => {
    const [clave, ...resto] = parte.split(':');
    const k = normalizar(clave);
    if (k === 'fecha') det.fecha = true;
    else if (k === 'origen') det.origen = true;
    else if (k === 'texto') det.texto = resto.join(':').trim() || 'Describa';
  });
  return det;
}

async function obtenerPreguntas(idConfigDoc) {
  try {
    const [rows] = await pool.execute(
      `SELECT codigo, seccion, orden, texto, tipo, opciones, obligatorio, detalle_si
       FROM Config_Formulario_Preguntas
       WHERE id_config_doc = ? AND activo = 1
       ORDER BY orden, id`,
      [idConfigDoc]
    );
    return rows.map(r => ({
      codigo: String(r.codigo).trim(),
      seccion: (r.seccion || '').trim(),
      texto: (r.texto || '').trim(),
      tipo: normalizar(r.tipo) || 'texto',
      opciones: parseOpciones(r.opciones),
      obligatorio: Number(r.obligatorio) === 1,
      detalle: parseDetalle(r.detalle_si)
    }));
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') console.error('[formularios] Error leyendo preguntas:', err.message);
    return [];
  }
}

async function obtenerRespuestas(idAspirante, idConfigDoc) {
  try {
    const [rows] = await pool.execute(
      `SELECT codigo_pregunta, respuesta, detalle_fecha, detalle_origen, detalle_texto
       FROM Dynamic_hv_respuestas WHERE id_aspirante = ? AND id_config_doc = ?`,
      [idAspirante, idConfigDoc]
    );
    const mapa = {};
    rows.forEach(r => {
      let fecha = r.detalle_fecha;
      if (fecha instanceof Date) fecha = fecha.toISOString().slice(0, 10);
      mapa[r.codigo_pregunta] = {
        respuesta: r.respuesta || '',
        fecha: fecha ? String(fecha).slice(0, 10) : '',
        origen: r.detalle_origen || '',
        texto: r.detalle_texto || ''
      };
    });
    return mapa;
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') console.error('[formularios] Error leyendo respuestas:', err.message);
    return {};
  }
}

// Valida lo que envió el aspirante. Devuelve { ok, errores: [texto], respuestas: { codigo: {...} } }
function validarRespuestas(preguntas, enviadas = {}) {
  const errores = [];
  const limpias = {};
  for (const p of preguntas) {
    const e = enviadas[p.codigo] || {};
    let respuesta = '';
    if (p.tipo === 'multiple' || p.tipo === 'marcas' || p.tipo === 'cuerpo') {
      const lista = (Array.isArray(e.r) ? e.r : String(e.r || '').split(','))
        .map(x => String(x).trim()).filter(x => p.opciones.includes(x));
      respuesta = lista.join(', ');
    } else if (p.tipo === 'si_no') {
      const r = normalizar(e.r);
      respuesta = r === 'si' ? 'Sí' : r === 'no' ? 'No' : '';
    } else if (p.tipo === 'opcion') {
      respuesta = p.opciones.includes(String(e.r || '').trim()) ? String(e.r).trim() : '';
    } else if (p.tipo === 'numero') {
      const n = String(e.r == null ? '' : e.r).trim().replace(',', '.');
      respuesta = n !== '' && !isNaN(Number(n)) ? n : '';
      if (String(e.r || '').trim() && !respuesta) errores.push(`"${p.texto}": debe ser un número.`);
    } else {
      respuesta = String(e.r || '').trim().slice(0, 500);
    }

    if (p.obligatorio && !respuesta) {
      errores.push(`Responde: "${p.texto}"${p.seccion ? ` (${p.seccion})` : ''}.`);
    }

    const fila = { respuesta, fecha: '', origen: '', texto: '' };
    if (p.tipo === 'si_no' && respuesta === 'Sí') {
      if (p.detalle.fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(e.fecha || ''))) fila.fecha = e.fecha;
      if (p.detalle.origen && ORIGENES.some(o => o.valor === e.origen)) fila.origen = e.origen;
      if (p.detalle.texto) {
        fila.texto = String(e.texto || '').trim().slice(0, 500);
        if (p.obligatorio && !fila.texto) errores.push(`"${p.texto}": completa "${p.detalle.texto}".`);
      }
    }
    limpias[p.codigo] = fila;
  }
  return { ok: errores.length === 0, errores, respuestas: limpias };
}

async function guardarRespuestas(idAspirante, idConfigDoc, respuestas) {
  for (const [codigo, r] of Object.entries(respuestas)) {
    await pool.execute(
      `INSERT INTO Dynamic_hv_respuestas
         (id_aspirante, id_config_doc, codigo_pregunta, respuesta, detalle_fecha, detalle_origen, detalle_texto)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE respuesta = VALUES(respuesta), detalle_fecha = VALUES(detalle_fecha),
         detalle_origen = VALUES(detalle_origen), detalle_texto = VALUES(detalle_texto),
         fecha_actualizacion = CURRENT_TIMESTAMP`,
      [idAspirante, idConfigDoc, codigo, r.respuesta || null, r.fecha || null, r.origen || null, r.texto || null]
    );
  }
}

// Agrupa por sección; dentro de la sección, las "marcas" seguidas con las mismas opciones forman una tabla
function agrupar(preguntas) {
  const secciones = [];
  for (const p of preguntas) {
    let sec = secciones[secciones.length - 1];
    if (!sec || sec.nombre !== p.seccion) { sec = { nombre: p.seccion, bloques: [] }; secciones.push(sec); }
    const ultimo = sec.bloques[sec.bloques.length - 1];
    const clave = (p.tipo === 'marcas' || p.tipo === 'cuerpo') ? p.tipo + ':' + p.opciones.join('|')
      : (p.tipo === 'si_no' && (p.detalle.fecha || p.detalle.origen)) ? 'eventos' : 'campos';
    if (ultimo && ultimo.clave === clave) ultimo.preguntas.push(p);
    else sec.bloques.push({ clave, tipo: clave.split(':')[0], preguntas: [p] });
  }
  return secciones;
}

function fechaDMY(iso) {
  return iso ? iso.split('-').reverse().join('/') : '';
}

// ── Figura del cuerpo (tipo "cuerpo") ──
// Silueta de frente en un lienzo de 200 x 430. Las piezas "lado" son del lado izquierdo del
// dibujo y se repiten en espejo para el derecho. En la vista de espalda la cara cuenta como
// cráneo y el tórax y el abdomen como tronco.
const PIEZAS_CUERPO = [
  { zona: 'brazo', lado: true, d: 'M60,88 Q46,90 43,106 L37,160 L52,163 L58,121 Z' },
  { zona: 'antebrazo', lado: true, d: 'M37,163 L52,166 L48,214 L33,213 Z' },
  { zona: 'mano', lado: true, d: 'M33,216 L48,217 Q53,228 48,240 Q42,248 35,241 Q29,229 33,216 Z' },
  { zona: 'craneo', d: 'M78,36 A22,25 0 0 1 122,36 Z' },
  { zona: 'cara', d: 'M78,36 L122,36 A22,29 0 0 1 100,66 A22,29 0 0 1 78,36 Z' },
  { zona: 'cuello', d: 'M90,63 L110,63 L112,80 L88,80 Z' },
  { zona: 'torax', d: 'M88,79 L112,79 Q120,84 134,86 Q142,88 143,98 L139,150 L61,150 L57,98 Q58,88 66,86 Q80,84 88,79 Z' },
  { zona: 'abdomen', d: 'M61,150 L139,150 L136,200 L64,200 Z' },
  { zona: 'pelvis', d: 'M64,200 L136,200 Q139,214 136,229 L100,238 L64,229 Q61,214 64,200 Z' },
  { zona: 'muslo', lado: true, d: 'M64,231 L98,239 L96,310 L72,310 Q64,272 64,231 Z' },
  { zona: 'pierna', lado: true, d: 'M72,313 L96,313 L93,392 L78,392 Q71,352 72,313 Z' },
  { zona: 'pie', lado: true, d: 'M78,395 L93,395 L95,410 Q96,418 88,418 L70,418 Q65,414 72,408 Z' }
];
const ESPALDA = { cara: 'craneo', torax: 'tronco', abdomen: 'tronco' };
// En la espalda la cabeza y el tronco van en una sola pieza (sin la división de frente)
const PIEZAS_ESPALDA = PIEZAS_CUERPO.filter(pz => pz.zona !== 'cara' && pz.zona !== 'abdomen').map(pz =>
  pz.zona === 'craneo' ? { zona: 'craneo', d: 'M78,36 A22,25 0 0 1 122,36 A22,29 0 0 1 100,66 A22,29 0 0 1 78,36 Z' }
    : pz.zona === 'torax' ? { zona: 'torax', d: 'M88,79 L112,79 Q120,84 134,86 Q142,88 143,98 L139,150 L136,200 L64,200 L61,150 L57,98 Q58,88 66,86 Q80,84 88,79 Z' }
      : pz);
// Etiquetas de la vista de frente: [zona, texto, punto de la figura, lado de la etiqueta]
const ETIQUETAS_FRENTE = [
  ['craneo', 'Cráneo', 112, 22, 'd'], ['cara', 'Cara', 113, 48, 'd'], ['cuello', 'Cuello', 106, 72, 'd'],
  ['torax', 'Tórax', 122, 112, 'd'], ['abdomen', 'Abdomen', 122, 176, 'd'], ['pelvis', 'Pelvis', 124, 214, 'd'],
  ['muslo', 'Muslo', 120, 268, 'd'], ['pierna', 'Pierna', 116, 350, 'd'], ['pie', 'Pie', 120, 410, 'd'],
  ['brazo', 'Brazo', 48, 128, 'i'], ['antebrazo', 'Antebrazo', 43, 190, 'i'], ['mano', 'Mano', 41, 231, 'i']
];
const COLORES_CUERPO = { vacio: '#e2e8f0', ninguno: '#bbf7d0', op1: '#ef4444', op2: '#f59e0b', ambas: '#8b5cf6' };

function zonaDeTexto(texto) {
  return normalizar(texto).replace(/[^a-z]/g, '');
}

// Color de una zona según lo marcado (lista de opciones elegidas) y las opciones del bloque
function colorZona(sel, ops) {
  const ninguno = ops.find(o => /^ningun[oa]$/.test(normalizar(o)));
  const reales = ops.filter(o => o !== ninguno);
  const a = reales[0] && sel.includes(reales[0]);
  const b = reales[1] && sel.includes(reales[1]);
  if (a && b) return COLORES_CUERPO.ambas;
  if (a) return COLORES_CUERPO.op1;
  if (b) return COLORES_CUERPO.op2;
  if (ninguno && sel.includes(ninguno)) return COLORES_CUERPO.ninguno;
  return COLORES_CUERPO.vacio;
}

// SVG de la figura. colores: { zona: '#hex' }. vista: 'frente' | 'espalda'.
function svgCuerpo({ colores = {}, vista = 'frente', interactivo = false, alto = null }) {
  const frente = vista === 'frente';
  const dx = frente ? 50 : 10;
  const ancho = frente ? 300 : 260;
  const zonaVista = z => (frente ? z : (ESPALDA[z] || z));
  const pieza = (pz, espejo) => {
    const z = zonaVista(pz.zona);
    const attrs = interactivo ? ` data-zona="${z}" class="zona-cuerpo" style="cursor:pointer"` : '';
    return `<path d="${pz.d}" fill="${colores[z] || COLORES_CUERPO.vacio}" stroke="#475569" stroke-width="1.2" stroke-linejoin="round"${espejo ? ' transform="translate(200,0) scale(-1,1)"' : ''}${attrs}><title>${z}</title></path>`;
  };
  const piezas = (frente ? PIEZAS_CUERPO : PIEZAS_ESPALDA).map(pz => pieza(pz, false) + (pz.lado ? pieza(pz, true) : '')).join('');
  const fs = interactivo ? 13 : 10.5;
  const texto = (x, y, t, ancla) => `<text x="${x}" y="${y + fs / 3}" font-size="${fs}" font-family="Arial,sans-serif" font-weight="700" fill="#1e293b" text-anchor="${ancla}">${t}</text>`;
  const linea = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="0.8"/><circle cx="${x2}" cy="${y2}" r="1.8" fill="#1e293b"/>`;
  let etiquetas = '';
  if (frente) {
    etiquetas = ETIQUETAS_FRENTE.map(([, t, x, y, lado]) => lado === 'd'
      ? linea(interactivo ? 228 : 236, y, x + dx, y) + texto(296, y, t, 'end')
      : linea(interactivo ? 68 : 62, y, x + dx, y) + texto(4, y, t, 'start')).join('');
  } else {
    etiquetas = linea(interactivo ? 204 : 212, 150, 128 + dx, 150) + texto(256, 150, 'Tronco', 'end')
      + linea(interactivo ? 204 : 212, 30, 112 + dx, 30) + texto(256, 30, 'Cráneo', 'end');
  }
  const pieDeFoto = `<text x="${ancho / 2}" y="440" font-size="11" font-family="Arial,sans-serif" font-weight="800" fill="#000b59" text-anchor="middle" letter-spacing="1">${frente ? 'FRENTE' : 'ESPALDA'}</text>`;
  const tam = alto ? ` height="${alto}" width="${Math.round(alto * ancho / 448)}"` : ' style="width:100%;height:auto"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} 448"${tam} data-vista="${vista}"><g transform="translate(${dx},4)">${piezas}</g>${etiquetas}${pieDeFoto}</svg>`;
}

function leyendaCuerpo(ops) {
  const ninguno = ops.find(o => /^ningun[oa]$/.test(normalizar(o)));
  const reales = ops.filter(o => o !== ninguno);
  const items = [];
  if (reales[0]) items.push([COLORES_CUERPO.op1, reales[0]]);
  if (reales[1]) items.push([COLORES_CUERPO.op2, reales[1]]);
  if (reales[0] && reales[1]) items.push([COLORES_CUERPO.ambas, 'Ambas']);
  if (ninguno) items.push([COLORES_CUERPO.ninguno, ninguno]);
  return items;
}

function coloresDeRespuestas(preguntas, respuestas) {
  const ops = preguntas[0].opciones;
  const colores = {};
  preguntas.forEach(p => {
    const sel = (respuestas[p.codigo]?.respuesta || '').split(',').map(x => x.trim());
    colores[zonaDeTexto(p.texto)] = colorZona(sel, ops);
  });
  return colores;
}

// ── HTML para el PDF (usa las clases del diseño moderno de las plantillas) ──
function htmlRespuestasPdf(preguntas, respuestas) {
  if (!preguntas.length) return '';
  const marca = on => `<span class="box" style="${on ? 'background:#000b59;border-color:#000b59' : ''}"></span>`;
  const valor = (p, r) => {
    if (!r || !r.respuesta) return '<span style="color:#94a3b8">—</span>';
    let v = `<strong>${esc(r.respuesta)}</strong>`;
    if (r.texto) v += ` &mdash; ${esc(p.detalle.texto || '')}: ${esc(r.texto)}`;
    return v;
  };
  return agrupar(preguntas).map(sec => {
    const bloques = sec.bloques.map(b => {
      if (b.tipo === 'marcas' || b.tipo === 'cuerpo') {
        const ops = b.preguntas[0].opciones;
        const filas = b.preguntas.map(p => {
          const sel = (respuestas[p.codigo]?.respuesta || '').split(',').map(x => x.trim());
          return `<tr><td>${esc(p.texto)}</td>${ops.map(o => `<td class="c">${marca(sel.includes(o))}</td>`).join('')}</tr>`;
        }).join('');
        const tabla = `<table class="q-table"><tr><th></th>${ops.map(o => `<th class="c" style="white-space:normal">${esc(o)}</th>`).join('')}</tr>${filas}</table>`;
        if (b.tipo === 'marcas') return tabla;
        const colores = coloresDeRespuestas(b.preguntas, respuestas);
        const leyenda = leyendaCuerpo(ops).map(([c, t]) => `<span style="display:inline-block;margin:0 8px 2px 0;white-space:nowrap"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${c};border:1px solid #475569;vertical-align:-1px;margin-right:3px"></span>${esc(t)}</span>`).join('');
        return `<table style="width:100%;border-collapse:collapse;page-break-inside:avoid"><tr>
          <td style="width:45%;vertical-align:top;padding-right:10px;text-align:center">
            <div style="border:1px solid #e2e8f0;border-radius:6px;padding:6px 4px 4px;white-space:nowrap">
              ${svgCuerpo({ colores, vista: 'frente', alto: 236 })}${svgCuerpo({ colores, vista: 'espalda', alto: 236 })}
              <div style="font-size:6.8pt;color:#334155;text-align:left;margin-top:3px;line-height:1.3;white-space:normal">${leyenda}</div>
            </div>
          </td>
          <td style="vertical-align:top">${tabla}</td>
        </tr></table>`;
      }
      if (b.tipo === 'eventos') {
        const filas = b.preguntas.map(p => {
          const r = respuestas[p.codigo] || {};
          return `<tr><td>${esc(p.texto)}</td><td class="c"><strong>${esc(r.respuesta || '—')}</strong></td>`
            + `<td class="c">${esc(fechaDMY(r.fecha))}</td><td class="c">${esc(r.origen)}</td><td>${esc(r.texto)}</td></tr>`;
        }).join('');
        return `<table class="q-table"><tr><th style="width:54%">Descripción</th><th class="c" style="width:7%">Sí / No</th>`
          + `<th style="width:10%">Fecha evento</th><th style="width:7%">AT / T / C</th><th>Describa</th></tr>${filas}</table>`;
      }
      // Con muchas preguntas cortas se usan dos columnas para ahorrar espacio en el PDF
      if (b.preguntas.length >= 6) {
        const filas = [];
        for (let i = 0; i < b.preguntas.length; i += 2) {
          const celdas = [b.preguntas[i], b.preguntas[i + 1]].map(p => p
            ? `<td class="data-label" style="width:27%">${esc(p.texto)}</td><td class="data-val" style="width:23%">${valor(p, respuestas[p.codigo])}</td>`
            : '<td class="data-label"></td><td class="data-val"></td>').join('');
          filas.push(`<tr>${celdas}</tr>`);
        }
        return `<table class="data-grid">${filas.join('')}</table>`;
      }
      const filas = b.preguntas.map(p => `<tr><td class="data-label">${esc(p.texto)}</td><td class="data-val">${valor(p, respuestas[p.codigo])}</td></tr>`).join('');
      return `<table class="data-grid">${filas}</table>`;
    }).join('<div style="height:6px"></div>');
    return `<section class="section-block">${sec.nombre ? `<div class="section-title">${esc(sec.nombre)}</div>` : ''}${bloques}</section>`;
  }).join('\n');
}

// Variables sueltas para las plantillas: {{resp_<codigo>}} con la respuesta (y el detalle)
function variablesRespuestas(preguntas, respuestas) {
  const vars = {};
  for (const p of preguntas) {
    const r = respuestas[p.codigo];
    let v = r && r.respuesta ? r.respuesta : '';
    if (r && r.texto) v += ` — ${r.texto}`;
    vars[`resp_${p.codigo}`] = esc(v);
  }
  return vars;
}

// ── HTML del formulario en la pantalla de firma ──
function htmlFormularioPantalla(preguntas, respuestas) {
  if (!preguntas.length) return '';
  const req = p => p.obligatorio ? '<span class="text-red-500">*</span>' : '';
  const campoDetalle = (p, r) => {
    if (p.tipo !== 'si_no' || (!p.detalle.fecha && !p.detalle.origen && !p.detalle.texto)) return '';
    const visible = r.respuesta === 'Sí';
    return `<div class="detalle-si grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 ${visible ? '' : 'hidden'}">
      ${p.detalle.fecha ? `<label class="text-[11px] text-slate-500">Fecha del evento<input type="date" data-campo="fecha" value="${esc(r.fecha)}" class="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs"></label>` : ''}
      ${p.detalle.origen ? `<label class="text-[11px] text-slate-500">Origen<select data-campo="origen" class="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white"><option value="">—</option>${ORIGENES.map(o => `<option value="${o.valor}" ${r.origen === o.valor ? 'selected' : ''}>${o.texto}</option>`).join('')}</select></label>` : ''}
      ${p.detalle.texto ? `<label class="text-[11px] text-slate-500 ${p.detalle.fecha || p.detalle.origen ? '' : 'sm:col-span-3'}">${esc(p.detalle.texto)} ${req(p)}<input type="text" data-campo="texto" maxlength="500" value="${esc(r.texto)}" class="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs"></label>` : ''}
    </div>`;
  };
  const control = (p, r) => {
    const nombre = `preg_${p.codigo}`;
    if (p.tipo === 'si_no') {
      return ['Sí', 'No'].map(v => `<label class="inline-flex items-center gap-1.5 mr-4 text-xs font-semibold text-slate-700 cursor-pointer">
        <input type="radio" name="${nombre}" value="${v}" data-campo="r" ${r.respuesta === v ? 'checked' : ''} class="w-4 h-4 text-orange-500"> ${v}</label>`).join('');
    }
    if (p.tipo === 'opcion') {
      return p.opciones.map(o => `<label class="inline-flex items-center gap-1.5 mr-4 mb-1 text-xs font-semibold text-slate-700 cursor-pointer">
        <input type="radio" name="${nombre}" value="${esc(o)}" data-campo="r" ${r.respuesta === o ? 'checked' : ''} class="w-4 h-4 text-orange-500"> ${esc(o)}</label>`).join('');
    }
    if (p.tipo === 'multiple') {
      const sel = (r.respuesta || '').split(',').map(x => x.trim());
      return p.opciones.map(o => `<label class="inline-flex items-center gap-1.5 mr-4 mb-1 text-xs font-semibold text-slate-700 cursor-pointer">
        <input type="checkbox" value="${esc(o)}" data-campo="r" ${sel.includes(o) ? 'checked' : ''} class="w-4 h-4 text-orange-500 rounded"> ${esc(o)}</label>`).join('');
    }
    const tipoInput = p.tipo === 'numero' ? 'number" step="any" inputmode="decimal' : 'text';
    return `<input type="${tipoInput}" data-campo="r" maxlength="500" value="${esc(r.respuesta)}" class="w-full sm:w-64 border border-slate-300 rounded-lg px-3 py-1.5 text-xs">`;
  };

  const secciones = agrupar(preguntas).map(sec => {
    const bloques = sec.bloques.map(b => {
      if (b.tipo === 'marcas' || b.tipo === 'cuerpo') {
        const ops = b.preguntas[0].opciones;
        const filas = b.preguntas.map(p => {
          const sel = (respuestas[p.codigo]?.respuesta || '').split(',').map(x => x.trim());
          return `<tr class="pregunta border-t border-slate-100 transition-colors" data-codigo="${esc(p.codigo)}" data-tipo="${b.tipo}" data-obligatorio="${p.obligatorio ? 1 : 0}" data-texto="${esc(p.texto)}" data-zona="${zonaDeTexto(p.texto)}">
            <td class="py-1.5 pr-2 text-xs font-semibold text-slate-700 ${b.tipo === 'cuerpo' ? 'cursor-pointer celda-zona' : ''}">${esc(p.texto)} ${req(p)}</td>
            ${ops.map(o => `<td class="text-center"><input type="checkbox" value="${esc(o)}" data-campo="r" ${sel.includes(o) ? 'checked' : ''} class="w-4 h-4 text-orange-500 rounded"></td>`).join('')}
          </tr>`;
        }).join('');
        const ninguno = ops.find(o => normalizar(o) === 'ninguno' || normalizar(o) === 'ninguna');
        const tabla = `<div class="overflow-x-auto"><table class="w-full">
          <thead><tr><th></th>${ops.map(o => `<th class="text-[10px] font-bold text-slate-500 uppercase px-1 pb-1 align-bottom">${esc(o)}</th>`).join('')}</tr></thead>
          <tbody>${filas}</tbody></table></div>`;
        const botonNinguno = ninguno ? `<button type="button" class="btn-marcar-ninguno mt-2 text-[11px] font-bold text-blue-600 hover:underline" data-opcion="${esc(ninguno)}">Marcar "${esc(ninguno)}" en los que no tengan respuesta</button>` : '';
        if (b.tipo === 'marcas') return tabla + botonNinguno;
        const colores = coloresDeRespuestas(b.preguntas, respuestas);
        const leyenda = leyendaCuerpo(ops).map(([c, t]) => `<span class="inline-flex items-center gap-1 mr-3 mb-1"><span class="w-3 h-3 rounded-sm border border-slate-500" style="background:${c}"></span>${esc(t)}</span>`).join('');
        return `<div class="bloque-cuerpo" data-opciones="${esc(JSON.stringify(ops))}">
          <p class="text-xs text-slate-600 mb-2">Toca en la figura la parte del cuerpo y marca lo que te haya pasado. Si no has tenido nada, usa el botón <b>"${esc(ninguno || 'Ninguno')}"</b>.</p>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <div>
              <div class="flex justify-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-2 select-none">
                <div class="w-[56%]">${svgCuerpo({ colores, vista: 'frente', interactivo: true })}</div>
                <div class="w-[44%]">${svgCuerpo({ colores, vista: 'espalda', interactivo: true })}</div>
              </div>
              <div class="text-[11px] text-slate-600 mt-2">${leyenda}</div>
              <div class="panel-zona hidden mt-2 border-2 border-orange-300 bg-orange-50 rounded-xl p-3">
                <p class="text-xs font-extrabold text-slate-900 uppercase mb-2">Zona: <span class="panel-zona-nombre"></span></p>
                <div class="panel-zona-opciones flex flex-wrap gap-2"></div>
              </div>
            </div>
            <div>${tabla}${botonNinguno}</div>
          </div>
        </div>`;
      }
      return b.preguntas.map(p => {
        const r = respuestas[p.codigo] || {};
        return `<div class="pregunta py-2.5 border-t border-slate-100 first:border-t-0" data-codigo="${esc(p.codigo)}" data-tipo="${p.tipo}" data-obligatorio="${p.obligatorio ? 1 : 0}" data-texto="${esc(p.texto)}" data-detalle-texto="${p.detalle.texto ? 1 : 0}">
          <p class="text-xs font-semibold text-slate-800 mb-1.5">${esc(p.texto)} ${req(p)}</p>
          <div>${control(p, r)}</div>
          ${campoDetalle(p, r)}
        </div>`;
      }).join('');
    }).join('<div class="h-2"></div>');
    return `<div class="bg-white border border-slate-200 rounded-2xl p-4">
      ${sec.nombre ? `<h3 class="text-[11px] font-extrabold text-slate-900 uppercase tracking-wide mb-2 flex items-center gap-2"><span class="w-1 h-3.5 bg-orange-500 rounded"></span>${esc(sec.nombre)}</h3>` : ''}
      ${bloques}
    </div>`;
  }).join('');

  return `<section id="formularioDocumento" class="space-y-3">
    <div class="border-b border-slate-100 pb-3">
      <h2 class="text-base font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-2"><span>📝</span> Responde el formulario</h2>
      <p class="text-xs text-slate-500 mt-1">Tus respuestas quedan en el documento que vas a firmar. Las preguntas con <span class="text-red-500">*</span> son obligatorias.</p>
    </div>
    ${secciones}
  </section>`;
}

// JavaScript de la pantalla: mostrar detalle con "Sí", botón "Ninguno" y recoger las respuestas
// prepararFormulario(form) y recogerRespuestasFormulario(form) reciben el <section> del formulario;
// sin parámetro usan #formularioDocumento (pantalla de un solo documento). La firma única
// (varios documentos en la misma página) pasa el formulario de cada paso.
const JS_FORMULARIO = `
    function prepararFormulario(form) {
      if (!form || form.dataset.preparado === '1') return;
      form.dataset.preparado = '1';
      form.addEventListener('change', (ev) => {
        const preg = ev.target.closest('.pregunta');
        if (!preg) return;
        if (preg.dataset.tipo === 'si_no' && ev.target.dataset.campo === 'r') {
          const det = preg.querySelector('.detalle-si');
          if (det) det.classList.toggle('hidden', ev.target.value !== 'Sí');
        }
        if ((preg.dataset.tipo === 'marcas' || preg.dataset.tipo === 'cuerpo') && ev.target.checked) {
          const esNinguno = /^ningun[oa]$/i.test(ev.target.value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, ''));
          preg.querySelectorAll('input[data-campo="r"]').forEach(i => {
            const otroNinguno = /^ningun[oa]$/i.test(i.value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, ''));
            if (i !== ev.target && (esNinguno ? !otroNinguno : otroNinguno)) i.checked = false;
          });
        }
      });
      form.querySelectorAll('.btn-marcar-ninguno').forEach(btn => btn.addEventListener('click', () => {
        const tabla = btn.previousElementSibling;
        tabla.querySelectorAll('.pregunta').forEach(fila => {
          const marcadas = fila.querySelectorAll('input[data-campo="r"]:checked').length;
          if (!marcadas) {
            const ninguno = Array.from(fila.querySelectorAll('input[data-campo="r"]')).find(i => i.value === btn.dataset.opcion);
            if (ninguno) ninguno.checked = true;
          }
        });
        const bloque = btn.closest('.bloque-cuerpo');
        if (bloque) bloque.dispatchEvent(new Event('change', { bubbles: true }));
      }));

      // Figura del cuerpo: colores por zona, selección de zona y panel con las opciones
      const COLORES = ${JSON.stringify(COLORES_CUERPO)};
      const esNing = v => /^ningun[oa]$/i.test(String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      form.querySelectorAll('.bloque-cuerpo').forEach(bloque => {
        const ops = JSON.parse(bloque.dataset.opciones || '[]');
        const reales = ops.filter(o => !esNing(o));
        const panel = bloque.querySelector('.panel-zona');
        let zonaActual = null;
        const fila = z => bloque.querySelector('.pregunta[data-zona="' + z + '"]');
        const marcadas = f => Array.from(f.querySelectorAll('input[data-campo="r"]:checked')).map(i => i.value);
        const color = sel => {
          const a = reales[0] && sel.includes(reales[0]);
          const b = reales[1] && sel.includes(reales[1]);
          if (a && b) return COLORES.ambas;
          if (a) return COLORES.op1;
          if (b) return COLORES.op2;
          if (sel.some(esNing)) return COLORES.ninguno;
          return COLORES.vacio;
        };
        const pintar = () => {
          bloque.querySelectorAll('.pregunta[data-zona]').forEach(f => {
            const c = color(marcadas(f));
            bloque.querySelectorAll('.zona-cuerpo[data-zona="' + f.dataset.zona + '"]').forEach(pz => {
              pz.setAttribute('fill', c);
              const activa = f.dataset.zona === zonaActual;
              pz.setAttribute('stroke', activa ? '#f55400' : '#475569');
              pz.setAttribute('stroke-width', activa ? '3' : '1.2');
            });
            f.classList.toggle('bg-orange-50', f.dataset.zona === zonaActual);
          });
          if (!zonaActual) return;
          const f = fila(zonaActual);
          const sel = marcadas(f);
          panel.querySelector('.panel-zona-opciones').innerHTML = ops.map((o, i) => {
            const on = sel.includes(o);
            const fondo = esNing(o) ? COLORES.ninguno : (i === 0 ? COLORES.op1 : COLORES.op2);
            return '<button type="button" data-op="' + i + '" class="px-3 py-2 rounded-lg text-xs font-bold border-2 '
              + (on ? 'border-slate-800 text-slate-900' : 'border-slate-300 text-slate-600 bg-white') + '"'
              + (on ? ' style="background:' + fondo + '"' : '') + '>' + (on ? '✓ ' : '') + o.replace(/</g, '&lt;') + '</button>';
          }).join('');
        };
        const elegir = (z, desplazar) => {
          const f = fila(z);
          if (!f) return;
          zonaActual = z;
          panel.classList.remove('hidden');
          panel.querySelector('.panel-zona-nombre').textContent = f.dataset.texto;
          pintar();
          if (desplazar && window.innerWidth < 1024) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        };
        bloque.addEventListener('click', ev => {
          const pz = ev.target.closest('.zona-cuerpo');
          if (pz) return elegir(pz.dataset.zona, true);
          const celda = ev.target.closest('.celda-zona');
          if (celda) return elegir(celda.closest('.pregunta').dataset.zona, false);
          const btnOp = ev.target.closest('[data-op]');
          if (btnOp && zonaActual) {
            const inp = fila(zonaActual).querySelectorAll('input[data-campo="r"]')[Number(btnOp.dataset.op)];
            inp.checked = !inp.checked;
            inp.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        bloque.addEventListener('change', () => setTimeout(pintar, 0));
        pintar();
      });
    }
    prepararFormulario(document.getElementById('formularioDocumento'));

    function recogerRespuestasFormulario(form) {
      form = form || document.getElementById('formularioDocumento');
      if (!form) return { respuestas: null, faltantes: [] };
      const respuestas = {};
      const faltantes = [];
      form.querySelectorAll('.pregunta').forEach(preg => {
        const tipo = preg.dataset.tipo;
        const codigo = preg.dataset.codigo;
        let r = '';
        if (tipo === 'multiple' || tipo === 'marcas' || tipo === 'cuerpo') {
          r = Array.from(preg.querySelectorAll('input[data-campo="r"]:checked')).map(i => i.value);
        } else if (tipo === 'si_no' || tipo === 'opcion') {
          const sel = preg.querySelector('input[data-campo="r"]:checked');
          r = sel ? sel.value : '';
        } else {
          const inp = preg.querySelector('[data-campo="r"]');
          r = inp ? inp.value.trim() : '';
        }
        const item = { r };
        ['fecha', 'origen', 'texto'].forEach(c => {
          const el = preg.querySelector('[data-campo="' + c + '"]');
          if (el) item[c] = el.value.trim();
        });
        respuestas[codigo] = item;
        const vacio = Array.isArray(r) ? r.length === 0 : !r;
        const obligatorio = preg.dataset.obligatorio === '1';
        preg.classList.remove('bg-red-50');
        if (obligatorio && (vacio || (tipo === 'si_no' && r === 'Sí' && preg.dataset.detalleTexto === '1' && !item.texto))) {
          faltantes.push(preg.dataset.texto);
          preg.classList.add('bg-red-50');
        }
      });
      return { respuestas, faltantes };
    }
`;

module.exports = {
  obtenerPreguntas,
  obtenerRespuestas,
  validarRespuestas,
  guardarRespuestas,
  htmlRespuestasPdf,
  variablesRespuestas,
  htmlFormularioPantalla,
  JS_FORMULARIO
};
