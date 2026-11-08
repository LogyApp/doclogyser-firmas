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
//               mismas opciones se muestran como una tabla (ej. segmento corporal)
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
    if (p.tipo === 'multiple' || p.tipo === 'marcas') {
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
    const clave = p.tipo === 'marcas' ? 'marcas:' + p.opciones.join('|')
      : (p.tipo === 'si_no' && (p.detalle.fecha || p.detalle.origen)) ? 'eventos' : 'campos';
    if (ultimo && ultimo.clave === clave) ultimo.preguntas.push(p);
    else sec.bloques.push({ clave, tipo: clave.split(':')[0], preguntas: [p] });
  }
  return secciones;
}

function fechaDMY(iso) {
  return iso ? iso.split('-').reverse().join('/') : '';
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
      if (b.tipo === 'marcas') {
        const ops = b.preguntas[0].opciones;
        const filas = b.preguntas.map(p => {
          const sel = (respuestas[p.codigo]?.respuesta || '').split(',').map(x => x.trim());
          return `<tr><td>${esc(p.texto)}</td>${ops.map(o => `<td class="c">${marca(sel.includes(o))}</td>`).join('')}</tr>`;
        }).join('');
        return `<table class="q-table"><tr><th></th>${ops.map(o => `<th class="c">${esc(o)}</th>`).join('')}</tr>${filas}</table>`;
      }
      if (b.tipo === 'eventos') {
        const filas = b.preguntas.map(p => {
          const r = respuestas[p.codigo] || {};
          return `<tr><td>${esc(p.texto)}</td><td class="c"><strong>${esc(r.respuesta || '—')}</strong></td>`
            + `<td class="c">${esc(fechaDMY(r.fecha))}</td><td class="c">${esc(r.origen)}</td><td>${esc(r.texto)}</td></tr>`;
        }).join('');
        return `<table class="q-table"><tr><th style="width:46%">Descripción</th><th class="c">Sí / No</th>`
          + `<th style="width:12%">Fecha evento</th><th style="width:9%">AT / T / C</th><th style="width:18%">Describa</th></tr>${filas}</table>`;
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
      if (b.tipo === 'marcas') {
        const ops = b.preguntas[0].opciones;
        const filas = b.preguntas.map(p => {
          const sel = (respuestas[p.codigo]?.respuesta || '').split(',').map(x => x.trim());
          return `<tr class="pregunta border-t border-slate-100" data-codigo="${esc(p.codigo)}" data-tipo="marcas" data-obligatorio="${p.obligatorio ? 1 : 0}" data-texto="${esc(p.texto)}">
            <td class="py-1.5 pr-2 text-xs font-semibold text-slate-700">${esc(p.texto)} ${req(p)}</td>
            ${ops.map(o => `<td class="text-center"><input type="checkbox" value="${esc(o)}" data-campo="r" ${sel.includes(o) ? 'checked' : ''} class="w-4 h-4 text-orange-500 rounded"></td>`).join('')}
          </tr>`;
        }).join('');
        const ninguno = ops.find(o => normalizar(o) === 'ninguno' || normalizar(o) === 'ninguna');
        return `<div class="overflow-x-auto"><table class="w-full">
          <thead><tr><th></th>${ops.map(o => `<th class="text-[10px] font-bold text-slate-500 uppercase px-1 pb-1 align-bottom">${esc(o)}</th>`).join('')}</tr></thead>
          <tbody>${filas}</tbody></table></div>
          ${ninguno ? `<button type="button" class="btn-marcar-ninguno mt-2 text-[11px] font-bold text-blue-600 hover:underline" data-opcion="${esc(ninguno)}">Marcar "${esc(ninguno)}" en los que no tengan respuesta</button>` : ''}`;
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
const JS_FORMULARIO = `
    (function () {
      const form = document.getElementById('formularioDocumento');
      if (!form) return;
      form.addEventListener('change', (ev) => {
        const preg = ev.target.closest('.pregunta');
        if (!preg) return;
        if (preg.dataset.tipo === 'si_no' && ev.target.dataset.campo === 'r') {
          const det = preg.querySelector('.detalle-si');
          if (det) det.classList.toggle('hidden', ev.target.value !== 'Sí');
        }
        if (preg.dataset.tipo === 'marcas' && ev.target.checked) {
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
      }));
    })();

    function recogerRespuestasFormulario() {
      const form = document.getElementById('formularioDocumento');
      if (!form) return { respuestas: null, faltantes: [] };
      const respuestas = {};
      const faltantes = [];
      form.querySelectorAll('.pregunta').forEach(preg => {
        const tipo = preg.dataset.tipo;
        const codigo = preg.dataset.codigo;
        let r = '';
        if (tipo === 'multiple' || tipo === 'marcas') {
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
