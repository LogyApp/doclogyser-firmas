const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

let parametros = [];
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.endsWith('evin.js') && parent.filename.includes('services')) {
    if (request === './db') return { execute: async () => [parametros] };
    if (request === './plantilla') return {
      obtenerPlantilla: async () => ({ contenido_html: '' }),
      reemplazarVariables: (_, variables) => variables,
      firmaConFecha: () => ''
    };
    if (request === './renderer') return {};
    if (request === './assets') return { LOGO_BASE64: '' };
    if (request === './storage' || request === './firmaUsuario') return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};
let evin;
try { evin = require('../src/services/evin'); } finally { Module._load = originalLoad; }

const configurados = [
  { Concepto: 'Respuesta correcta EVIN pregunta 9 COPASST', Parametro: 'B' },
  { Concepto: 'Respuesta correcta EVIN pregunta 25 PESV', Parametro: 'C' }
];

test('nuevas evaluaciones califican 9 B y 25 C y no publican las claves', async () => {
  parametros = configurados;
  const cfg = await evin.configuracion();
  assert.equal(cfg.claves[9], 'b');
  assert.equal(cfg.claves[25], 'c');
  assert.equal(evin.TOTAL_PREGUNTAS, 27);
  const respuestas = { ...cfg.claves };
  assert.deepEqual(evin.calificar(respuestas, 80, cfg.claves), { correctas: 27, total: 27, porcentaje: 100, aprobado: true });
  respuestas[9] = 'c'; respuestas[25] = 'b';
  assert.deepEqual(evin.calificar(respuestas, 80, cfg.claves), { correctas: 25, total: 27, porcentaje: 92.59, aprobado: true });
  for (const seccion of evin.formularioPublico().secciones) {
    for (const pregunta of seccion.preguntas) assert.equal(Object.hasOwn(pregunta, 'correcta'), false);
  }
});

test('sin parámetros se conserva la calificación anterior y se rechazan valores inválidos', async () => {
  parametros = [];
  const cfg = await evin.configuracion();
  assert.equal(cfg.claves[9], 'c');
  assert.equal(cfg.claves[25], 'b');
  parametros = [{ ...configurados[0], Parametro: 'z' }];
  await assert.rejects(evin.configuracion(), /pregunta EVIN 9 no es válida/);
});

test('el PDF regenera las evaluaciones con las claves que usaron al firmar', async () => {
  parametros = configurados;
  const cfg = await evin.configuracion();
  const datos = { fecha_firma: '2026-11-25 12:00:00', correctas: 2, porcentaje: 7.41, aprobado: 0 };
  const nuevo = await evin.htmlDocumento({ ...datos, respuestas: JSON.stringify({ 9: 'b', 25: 'c', _claves: cfg.claves }) });
  const viejo = await evin.htmlDocumento({ ...datos, respuestas: JSON.stringify({ 9: 'b', 25: 'c' }) });
  for (const [numero, texto] of [[9, 'COPASST'], [25, 'Plan Estratégico de Seguridad Vial']]) {
    const pregunta = html => html.slice(html.indexOf(`${numero}. ¿Qué`), html.indexOf(`${numero}. ¿Qué`) + 250);
    assert.match(pregunta(nuevo.preguntas_html), /Correcta/, texto);
    assert.match(pregunta(viejo.preguntas_html), /Incorrecta/, texto);
  }
  parametros = [
    { ...configurados[0], Parametro: 'c' },
    { ...configurados[1], Parametro: 'b' }
  ];
  const regenerado = await evin.htmlDocumento({ ...datos, respuestas: JSON.stringify({ 9: 'b', 25: 'c', _claves: cfg.claves }) });
  assert.match(regenerado.preguntas_html.slice(regenerado.preguntas_html.indexOf('9. ¿Qué'), regenerado.preguntas_html.indexOf('9. ¿Qué') + 250), /Correcta/);
  assert.match(regenerado.preguntas_html.slice(regenerado.preguntas_html.indexOf('25. ¿Qué'), regenerado.preguntas_html.indexOf('25. ¿Qué') + 250), /Correcta/);
});
