/**
 * Hace que el botón "Atrás" del navegador/móvil cierre la ventana emergente
 * (modal) que esté abierta, en vez de sacar al usuario de la pestaña o del
 * módulo actual. Compartido entre todos los módulos (mismo patrón que
 * app-launcher-profile.js / ticket-boton.js): se incluye con un <script> y
 * queda disponible como window.registrarModalBack / window.cerrarModalBack.
 *
 * Uso dentro de las funciones existentes de abrir/cerrar cada modal:
 *
 *   function abrirModalX() {
 *     modalX.style.display = 'flex';           // o la lógica que ya tenga
 *     modalX._backEntry = registrarModalBack(() => cerrarModalX());
 *   }
 *   function cerrarModalX() {
 *     modalX.style.display = 'none';            // o la lógica que ya tenga
 *     cerrarModalBack(modalX._backEntry);
 *     modalX._backEntry = null;
 *   }
 *
 * registrarModalBack(onClose) se llama SIEMPRE que el modal se abre — agrega
 * una entrada al historial del navegador y devuelve un "ticket" que hay que
 * guardar (ej. en una propiedad del propio elemento del modal, como arriba).
 *
 * cerrarModalBack(entry) se llama SIEMPRE que el modal se cierra por
 * cualquier vía normal (botón X, Cancelar, click en el backdrop, Escape,
 * guardar y cerrar, etc.) — consume esa entrada del historial para que la
 * siguiente pulsación de "Atrás" del usuario vuelva a comportarse con
 * normalidad en vez de quedar atascada.
 *
 * Si el cierre ocurre porque el usuario presionó "Atrás" (evento popstate),
 * esta utilidad detecta automáticamente la entrada correspondiente (la más
 * reciente abierta) y llama a su onClose() por su cuenta — las funciones de
 * abrir/cerrar de cada módulo no necesitan distinguir el origen del cierre,
 * siempre llaman a cerrarModalBack() igual; internamente se ignora si la
 * entrada ya fue retirada por el botón "Atrás".
 *
 * Soporta modales anidados (pila LIFO): si se abre un modal sobre otro, el
 * primer "Atrás" cierra el de más arriba.
 *
 * En el celular, además, evita perder un formulario a medio llenar:
 *  - Quita el "deslizar hacia abajo para recargar" del navegador
 *    (overscroll-behavior en html/body), que recargaba la página al bajar con
 *    el dedo estando arriba del todo.
 *  - Si aun así la página se va a recargar o cerrar con un modal abierto en el
 *    que ya se escribió algo, el navegador pregunta antes de salir.
 */
(function () {
  const stack = [];
  let suppressNextPopstate = false;
  let modalConCambios = false; // se escribió algo con un modal abierto

  const estilo = document.createElement('style');
  estilo.textContent = 'html, body { overscroll-behavior-y: none; }';
  (document.head || document.documentElement).appendChild(estilo);

  ['input', 'change'].forEach((tipo) => document.addEventListener(tipo, (e) => {
    if (stack.length > 0 && e.isTrusted) modalConCambios = true;
  }, true));

  window.addEventListener('beforeunload', (e) => {
    if (stack.length === 0 || !modalConCambios) return;
    e.preventDefault();
    e.returnValue = ''; // el navegador muestra su propio aviso de "¿Salir? Los cambios no se guardarán"
  });

  window.addEventListener('popstate', () => {
    if (suppressNextPopstate) {
      suppressNextPopstate = false;
      return;
    }
    if (stack.length > 0) {
      const entry = stack.pop();
      if (typeof entry.onClose === 'function') entry.onClose();
      if (stack.length === 0) modalConCambios = false;
    }
  });

  window.registrarModalBack = function registrarModalBack(onClose) {
    history.pushState({ __modalBack: true }, '', location.href);
    const entry = { onClose };
    stack.push(entry);
    return entry;
  };

  window.cerrarModalBack = function cerrarModalBack(entry) {
    if (!entry) return;
    const idx = stack.indexOf(entry);
    if (idx === -1) return; // ya se retiró (se cerró vía botón "Atrás"), no duplicar
    stack.splice(idx, 1);
    if (stack.length === 0) modalConCambios = false;
    suppressNextPopstate = true;
    history.back();
  };
})();
