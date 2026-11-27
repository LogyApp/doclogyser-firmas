const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const vista = fs.readFileSync(path.join(__dirname, '../src/views/talenthub/index.html'), 'utf8');
const modalBack = fs.readFileSync(path.join(__dirname, '../public/js/modal-back.js'), 'utf8');
const editar = vista.slice(vista.indexOf('    async function abrirModalEditarRequisicion(req) {'), vista.indexOf('    async function guardarRequisicion(event) {'));
const cierres = vista.slice(vista.indexOf('    function cerrarModalConBack(el) {'), vista.indexOf("    document.querySelectorAll('.modal-backdrop')"));

function entorno() {
  const elementos = new Map();
  const listeners = {};
  const history = {
    entradas: 0,
    retrocesos: 0,
    pushState() { this.entradas++; },
    back() { this.retrocesos++; },
  };
  const document = {
    head: { appendChild() {} },
    createElement() { return {}; },
    addEventListener() {},
    getElementById(id) {
      if (!elementos.has(id)) elementos.set(id, { style: {}, dataset: {}, value: '', innerHTML: '', textContent: '' });
      return elementos.get(id);
    },
  };
  const contexto = {
    document, history, location: { href: '/talenthub?tab=Requisiciones' },
    addEventListener(tipo, fn) { listeners[tipo] = fn; },
    _reqCatalogos: { regionales: [], operaciones: [], permisos: { puedeModificarFechaRequisicion: true } },
    _reqFormModo: '',
    esc: valor => String(valor),
    setToggleBtn() {}, toggleCampoDescCurso() {}, toggleCondicionalesMotivo() {},
  };
  contexto.window = contexto;
  vm.createContext(contexto);
  vm.runInContext(modalBack, contexto);
  vm.runInContext(cierres + editar, contexto);
  return { contexto, document, history, listeners };
}

test('pasar de detalle a edición conserva la entrada de historial hasta cerrar', async () => {
  const { contexto, document, history, listeners } = entorno();
  const detalle = document.getElementById('modalDetalleRequisicion');
  detalle.style.display = 'flex';
  detalle._backEntry = contexto.registrarModalBack(() => contexto.cerrarModales());
  await contexto.abrirModalEditarRequisicion({
    IdRequisicion: 1, fechaRequisicionEditable: '2026-11-27T14:15:30',
  });
  const formulario = document.getElementById('modalFormRequisicion');
  assert.equal(history.entradas, 1);
  assert.equal(history.retrocesos, 0);
  assert.equal(detalle.style.display, 'none');
  assert.equal(formulario.style.display, 'flex');
  assert.equal(document.getElementById('formReqFechaRequisicion').value, '2026-11-27T14:15:30');
  contexto.cerrarModales();
  assert.equal(history.retrocesos, 1);
  listeners.popstate();
  assert.equal(formulario.style.display, 'none');
});

test('atrás del navegador cierra la edición sin retroceder nuevamente', async () => {
  const { contexto, document, history, listeners } = entorno();
  const detalle = document.getElementById('modalDetalleRequisicion');
  detalle._backEntry = contexto.registrarModalBack(() => contexto.cerrarModales());
  await contexto.abrirModalEditarRequisicion({ IdRequisicion: 1 });
  listeners.popstate();
  assert.equal(history.retrocesos, 0);
  assert.equal(document.getElementById('modalFormRequisicion').style.display, 'none');
});
