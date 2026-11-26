const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(require('node:path').join(__dirname, '../src/views/directoriocorporativo/index.html'), 'utf8');
const codigoMotivos = html.slice(html.indexOf('    let tkSolicitudMotivos = 0;'), html.indexOf('    async function guardarTicketGestion'));
const codigoEnlaces = html.slice(html.indexOf('    function tkReferenciaHtml(t)'), html.indexOf('    // Trabajadores del ticket.'));
assert.ok(codigoMotivos.includes('tkCargarMotivosGestion'));
assert.ok(codigoEnlaces.includes('tkReferenciaHtml'));

function entorno(fetch) {
  const elementos = {
    tkAdmModulo: { value: 'Servicios' },
    tkAdmMotivoWrap: { innerHTML: '', querySelector: () => ({}) },
    tkAdmGuardar: { disabled: false }
  };
  const avisos = [];
  const contexto = vm.createContext({
    document: { getElementById: id => elementos[id] || null },
    fetch, showToast: mensaje => avisos.push(mensaje),
    tkEsc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
    paramUsuario: 'usuario & test', encodeURIComponent
  });
  vm.runInContext(codigoMotivos + codigoEnlaces, contexto);
  return { contexto, elementos, avisos };
}
const respuesta = motivos => ({ ok: true, json: async () => motivos });

test('carga motivos del módulo, conserva motivo antiguo y permite texto libre sin catálogo', async () => {
  const llamadas = [];
  const e = entorno(async url => { llamadas.push(url); return respuesta(url.includes('Servicios') ? ['Motivo A', 'Motivo B'] : []); });
  await e.contexto.tkCargarMotivosGestion('Anterior');
  assert.match(e.elementos.tkAdmMotivoWrap.innerHTML, /Anterior.*selected/);
  assert.match(e.elementos.tkAdmMotivoWrap.innerHTML, /Motivo A/);
  e.elementos.tkAdmModulo.value = 'Asistencia';
  await e.contexto.tkCargarMotivosGestion();
  assert.match(e.elementos.tkAdmMotivoWrap.innerHTML, /type="text"/);
  assert.doesNotMatch(e.elementos.tkAdmMotivoWrap.innerHTML, /Anterior/);
  assert.match(llamadas[1], /modulo=Asistencia/);
});

test('no aplica respuestas antiguas cuando se cambia de módulo y notifica errores', async () => {
  let completar;
  const e = entorno(url => url.includes('Servicios')
    ? new Promise(resolve => { completar = resolve; })
    : Promise.resolve(respuesta(['Motivo nuevo'])));
  const anterior = e.contexto.tkCargarMotivosGestion('Viejo');
  e.elementos.tkAdmModulo.value = 'Asistencia';
  await e.contexto.tkCargarMotivosGestion();
  completar(respuesta(['Obsoleto']));
  await anterior;
  assert.match(e.elementos.tkAdmMotivoWrap.innerHTML, /Motivo nuevo/);
  assert.doesNotMatch(e.elementos.tkAdmMotivoWrap.innerHTML, /Obsoleto/);
  const fallo = entorno(async () => { throw new Error('Error de red'); });
  await fallo.contexto.tkCargarMotivosGestion();
  assert.equal(fallo.elementos.tkAdmGuardar.disabled, true);
  assert.deepEqual(fallo.avisos, ['Error de red']);
});

test('los enlaces distinguen recibos, servicios, ambos y referencias inexistentes', () => {
  const { contexto } = entorno();
  const recibo = contexto.tkReferenciaHtml({ idrecibo: 'R & 1', esRecibo: 1 });
  assert.match(recibo, /tab=recibos&amp;idrecibo=R%20%26%201/);
  assert.match(recibo, /usuario=usuario%20%26%20test/);
  const servicio = contexto.tkReferenciaHtml({ idrecibo: 'S1', esServicio: 1 });
  assert.match(servicio, /tab=servicios&amp;idservicio=S1/);
  const ambos = contexto.tkReferenciaHtml({ idrecibo: '1', esRecibo: 1, esServicio: 1 });
  assert.match(ambos, /tab=recibos/); assert.match(ambos, /tab=servicios/);
  assert.equal(contexto.tkReferenciaHtml({ idrecibo: '<x>' }), '&lt;x&gt;');
});
