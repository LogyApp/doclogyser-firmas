/* SST › Documentación Inicial: lo que comparten las subpestañas ARO, EVIN e INGE.
 * - Encabezados que ordenan al hacer clic y se ensanchan arrastrando el borde, como en las demás pestañas de SST
 *   (usa inicializarRedimensionColumnasSst del hub).
 * - Filtros con conteo interactivo: cada lista cuenta los registros con los demás filtros aplicados.
 * La columna Acciones usa iconoSst() del hub (botones redondos solo con icono).
 */
(function () {
  'use strict';

  const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tablas = {};

  function compara(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), 'es', { sensitivity: 'base', numeric: true });
  }

  function iconos(id) {
    const t = tablas[id];
    document.querySelectorAll(`#${id} th[data-orden]`).forEach(th => {
      const activa = th.dataset.orden === t.orden.clave;
      const ic = th.querySelector('.sort-icon');
      ic.textContent = activa ? (t.orden.dir === 'asc' ? '▲' : '▼') : '↕';
      ic.style.opacity = activa ? '1' : '0.35';
    });
  }

  window.docInicial = {
    /* Encabezado de la tabla `id`. columnas: [{ clave, titulo, ancho, valor(item) para ordenar }];
       la columna Acciones va primero y no ordena. orden: { clave, dir }. alOrdenar: vuelve a pintar. */
    encabezado(id, { columnas, orden, anchoAcciones = 110, alOrdenar }) {
      tablas[id] = { columnas, orden: { ...orden }, alOrdenar };
      return `<tr><th style="width:${anchoAcciones}px;min-width:70px"><div class="th-content"><span>Acciones</span></div><div class="col-resizer"></div></th>`
        + columnas.map(c => `<th class="sortable" data-orden="${c.clave}" style="width:${c.ancho}px;min-width:${Math.min(c.ancho, 90)}px" onclick="docInicial.clicOrden(event, '${id}', '${c.clave}')">
            <div class="th-content"><span>${esc(c.titulo)}</span><span class="sort-icon">↕</span></div><div class="col-resizer"></div></th>`).join('')
        + '</tr>';
    },

    // Después de montar la tabla: íconos de orden y bordes que se arrastran
    activar(id) {
      iconos(id);
      if (typeof inicializarRedimensionColumnasSst === 'function') inicializarRedimensionColumnasSst();
    },

    clicOrden(ev, id, clave) {
      if (ev && ev.target.closest('.col-resizer')) return;
      const t = tablas[id];
      if (t.orden.clave === clave) t.orden.dir = t.orden.dir === 'asc' ? 'desc' : 'asc';
      else t.orden = { clave, dir: 'asc' };
      iconos(id);
      t.alOrdenar();
    },

    ordenar(id, lista) {
      const t = tablas[id];
      const col = t && t.columnas.find(c => c.clave === t.orden.clave);
      if (!col) return lista;
      const signo = t.orden.dir === 'asc' ? 1 : -1;
      return lista.slice().sort((a, b) => signo * compara(col.valor(a), col.valor(b)));
    },

    /* Filtros con conteo. items: registros (ya filtrados por la búsqueda); pruebas: { clave: (item, valor) => bool };
       valores: { clave: valor elegido o '' }. Devuelve sin(clave): los registros con todos los filtros menos `clave`
       (sin(null) = la lista final). */
    facetas(items, pruebas, valores) {
      return (excluir) => items.filter(a => Object.keys(pruebas).every(k => k === excluir || !valores[k] || pruebas[k](a, valores[k])));
    },

    /* Llena un <select> con "Todos (n)" y cada opción con su conteo. opciones: [[valor, etiqueta]];
       base: registros con los demás filtros aplicados; prueba(item, valor). */
    select(sel, { opciones, base, prueba, actual, todos = 'Todos' }) {
      if (!sel) return;
      const lista = opciones.slice();
      if (actual && !lista.some(([v]) => v === actual)) lista.push([actual, actual]);
      sel.innerHTML = `<option value="">${esc(todos)} (${base.length})</option>`
        + lista.map(([v, l]) => `<option value="${esc(v)}" ${v === actual ? 'selected' : ''}>${esc(l)} (${base.filter(a => prueba(a, v)).length})</option>`).join('');
    },

    // Valores distintos de un campo, ordenados, como opciones [[valor, valor]]
    distintos(items, campo) {
      return [...new Set(items.map(a => a[campo]).filter(Boolean))].sort((a, b) => compara(a, b)).map(v => [v, v]);
    },
  };
})();
