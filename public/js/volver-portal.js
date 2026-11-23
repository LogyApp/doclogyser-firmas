// Páginas de firma de SST (Prueba de Consumo, ARO, EVIN, INGE) abiertas desde el portal del aspirante o trabajador
// (Habilitar Doc. SST, services/docSstPortal.js): al terminar, el aviso de éxito muestra "Volver a mi portal" para
// seguir con los demás documentos. El servidor solo incluye este script con window.VOLVER_PORTAL cuando el enlace
// viene del portal; los enlaces que genera SST quedan como siempre.
(function () {
  const url = window.VOLVER_PORTAL;
  if (!url) return;
  const PANELES = ['panelExito', 'panelResultado', 'panel-exito'];

  function agregar(panel) {
    if (!panel || panel.querySelector('.volver-portal') || getComputedStyle(panel).display === 'none') return;
    const a = document.createElement('a');
    a.className = 'volver-portal';
    a.href = url;
    a.textContent = '← Volver a mi portal';
    a.style.cssText = 'display:inline-block;margin-top:18px;padding:12px 22px;border-radius:12px;background:#ea580c;color:#fff;font-weight:800;text-decoration:none;font-size:15px';
    const p = document.createElement('p');
    p.style.cssText = 'margin:12px 0 0;font-size:13px;color:#64748b';
    p.textContent = 'Desde su portal puede abrir y firmar los demás documentos.';
    panel.appendChild(a);
    panel.appendChild(p);
  }

  function revisar() { PANELES.forEach(id => agregar(document.getElementById(id))); }

  const obs = new MutationObserver(revisar);
  PANELES.forEach(id => {
    const el = document.getElementById(id);
    if (el) obs.observe(el, { attributes: true, attributeFilter: ['style', 'class'], childList: true });
  });
})();
