(() => {
  const params = new URLSearchParams(window.location.search);
  const usuario = params.get('usuario');
  if (!usuario) return;

  const currentModule = window.location.pathname.split('/').filter(Boolean)[0] || '';
  const homeModules = new Set(['nomina', 'inventario', 'sst', 'cloud-docs', 'facturacion', 'directorio-corporativo']);
  const defaultPhoto = 'https://storage.googleapis.com/logyser-recursos-corporativos/firmas-corporativas/fotos-empleados/usuario.png';
  const modules = [
    { id: 'nomina', name: 'Nómina', symbol: '▣', tabs: [
      ['Activos', 'activos'], ['Retiros', 'retiros'], ['Bloqueo de Datos', 'bloqueo'],
      ['Biométrico · Asistencia', 'biometrico', 'asistencia'], ['Biométrico · Recorridos GPS', 'biometrico', 'rutas'],
      ['Biométrico · Reportes', 'biometrico', 'reportes'], ['Traslados', 'traslados']
    ] },
    { id: 'inventario', name: 'Inventario', symbol: '▦', tabs: [
      ['Inventario', 'inventario'], ['Reportes', 'reportes'], ['Pendiente por recibir', 'pendienterecibir'],
      ['Kardex', 'kardex'], ['Catálogo de artículos', 'articulos'], ['Solicitudes', 'solicitudes'],
      ['Actas de Entrega', 'actas'], ['Dotación de Ley', 'dotacionley'], ['Historial de Confirmaciones', 'historial']
    ] },
    { id: 'cloud-docs', name: 'Cloud Docs', symbol: '▤', tabs: [
      ['Doc Trabajadores', 'trabajador'], ['Tipos de Documento', 'documento'], ['Consolidado', 'todo'],
      ['Doc Retiros', 'docretiros'], ['LogySign', 'logysign'], ['Solicitudes', 'solicitudes'],
      ['Validar Capacitación', 'validarcap'], ['Permisos', 'permisos'], ['Duplicados', 'duplicados']
    ] },
    { id: 'facturacion', name: 'Facturación', symbol: '◷', tabs: [
      ['Servicios', 'servicios'], ['Recibos', 'recibos'], ['Clientes Crédito', 'clientescredito'],
      ['Bloqueos', 'bloqueo'], ['Tickets', 'tickets']
    ] },
    { id: 'sst', name: 'SST', symbol: '＋', tabs: [
      ['Evaluación SST', 'evaluacion'], ['Capacitación', 'capacitacion'],
      ['Temas de capacitación', 'capacitacion', 'temas'], ['Prueba de Consumo', 'pruebaconsumo'],
      ['Participación', 'participacion'], ['Compromisos SST', 'compromiso'],
      ['Casos Médicos', 'gestionmedica', 'casosmedicos'], ['Incapacidades', 'gestionmedica', 'incapacidades']
    ] }
  ];
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let profile = null;
  let recentSignature = null;
  let signatureChanged = false;
  let canvasReady = false;
  const dirtyForms = new WeakSet();

  function controlPerteneceAFiltro(control) {
    return Boolean(control.closest('[class*="filter" i], [id*="filter" i], [class*="search" i], [id*="search" i]'));
  }

  function markFormAsActive(event) {
    const control = event.target;
    if (!(control instanceof Element) || controlPerteneceAFiltro(control)) return;
    const form = control.closest('form');
    if (form) dirtyForms.add(form);
  }
  document.addEventListener('input', markFormAsActive, true);
  document.addEventListener('change', markFormAsActive, true);
  document.addEventListener('focusin', markFormAsActive, true);
  document.addEventListener('reset', event => {
    if (event.target instanceof HTMLFormElement) dirtyForms.delete(event.target);
  }, true);

  function visible(element) {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  }

  function formHasChanges(form) {
    return dirtyForms.has(form);
  }

  function processIsActive() {
    const busyLabels = /guardando|procesando|enviando|cargando|generando|subiendo|actualizando|eliminando/i;
    const busyButton = [...document.querySelectorAll('button:disabled')].some(button => busyLabels.test(button.textContent || ''));
    const visibleLoader = [...document.querySelectorAll('.loading-overlay, .loading-screen, #global-loader, #loading-overlay, #loading')].some(visible);
    const activeModal = [...document.querySelectorAll('.modal-overlay.open, .modal-full-overlay.open, .alp-overlay.alp-visible, .modal-overlay[style*="display: flex"], .modal-overlay[style*="display:flex"]')].some(visible);
    return busyButton || visibleLoader || activeModal;
  }

  function confirmarSalidaModulo() {
    const dirty = [...document.forms].some(formHasChanges);
    if (!dirty && !processIsActive()) return true;
    const message = processIsActive()
      ? 'Hay un formulario abierto o un proceso en curso. Si vuelves al inicio, podrías perder los cambios o interrumpirlo. ¿Deseas continuar?'
      : 'Hay cambios sin guardar en un formulario. Si vuelves al inicio, se perderán. ¿Deseas continuar?';
    return window.confirm(message);
  }

  function volverAlInicioModulo() {
    if (!homeModules.has(currentModule) || !confirmarSalidaModulo()) return;
    const destino = new URL(`/${currentModule}`, window.location.origin);
    destino.searchParams.set('usuario', usuario);
    window.location.assign(destino.toString());
  }

  function activarLogoComoInicio(image) {
    image.style.cursor = 'pointer';
    image.title = `Volver al inicio de ${modules.find(module => module.id === currentModule)?.name || 'este módulo'}`;
    image.setAttribute('role', 'link');
    image.tabIndex = 0;
    image.setAttribute('aria-label', image.title);
    image.addEventListener('click', volverAlInicioModulo);
    image.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        volverAlInicioModulo();
      }
    });
  }

  function moduleUrl(module, tab, subtab) {
    const query = new URLSearchParams({ usuario });
    if (tab) query.set('tab', tab);
    if (subtab) query.set('subtab', subtab);
    return `/${module}?${query.toString()}`;
  }

  function createLauncher(sidebar, brand) {
    const launcher = document.createElement('div');
    launcher.className = 'alp-shell';
    launcher.innerHTML = `
      <button type="button" class="alp-trigger" aria-label="Abrir otros módulos" aria-expanded="false" aria-controls="alp-module-panel" title="Otros módulos">
        <span class="alp-grid" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
        <span class="alp-caption" aria-hidden="true">OTROS</span>
      </button>
      <div class="alp-panel" id="alp-module-panel" aria-label="Otros módulos">
        <div class="alp-panel-title">Otros módulos</div>
        ${modules.filter(module => module.id !== currentModule).map(module => `
          <details class="alp-group">
            <summary><span class="alp-symbol">${module.symbol}</span>${module.name}</summary>
            <div class="alp-links">${module.tabs.map(([label, tab, subtab]) =>
              `<a class="alp-link" href="${esc(moduleUrl(module.id, tab, subtab))}">${esc(label)}</a>`
            ).join('')}</div>
          </details>`).join('')}
        ${currentModule === 'directorio-corporativo' ? '' : `<a class="alp-link" href="/directorio-corporativo?usuario=${encodeURIComponent(usuario)}">Directorio Corporativo</a>`}
      </div>`;
    const button = launcher.querySelector('.alp-trigger');
    const panel = launcher.querySelector('.alp-panel');
    button.addEventListener('click', event => {
      event.stopPropagation();
      const open = !panel.classList.contains('alp-open');
      panel.classList.toggle('alp-open', open);
      button.setAttribute('aria-expanded', String(open));
    });
    launcher.querySelectorAll('.alp-group').forEach(group => group.addEventListener('toggle', () => {
      if (group.open) launcher.querySelectorAll('.alp-group').forEach(other => { if (other !== group) other.open = false; });
    }));
    panel.addEventListener('click', event => { if (event.target.closest('a')) closeLauncher(); });
    document.addEventListener('click', event => { if (!launcher.contains(event.target)) closeLauncher(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeLauncher(); });
    function closeLauncher() { panel.classList.remove('alp-open'); button.setAttribute('aria-expanded', 'false'); }

    brand.classList.add('alp-brand');
    brand.style.justifyContent = 'space-between';
    brand.appendChild(launcher);

    if (sidebar) {
      const nav = sidebar.querySelector('.nav-list');
      const profileCard = document.createElement('div');
      profileCard.className = 'alp-profile';
      profileCard.innerHTML = `
        <button type="button" class="alp-profile-trigger" aria-label="Abrir perfil y editar firma">
          <img class="alp-avatar" alt="Foto de perfil">
          <span class="alp-profile-meta"><span class="alp-profile-name"></span><span class="alp-profile-caption">Mi perfil corporativo</span></span>
          <span class="alp-profile-chevron" aria-hidden="true">›</span>
        </button>`;
      profileCard.querySelector('button').addEventListener('click', openProfile);
      if (nav) sidebar.insertBefore(profileCard, nav);
      else sidebar.insertBefore(profileCard, launcher.nextSibling);
    }
    return launcher;
  }

  function createProfileModal() {
    const overlay = document.createElement('div');
    overlay.className = 'alp-overlay';
    overlay.innerHTML = `
      <section class="alp-modal" role="dialog" aria-modal="true" aria-labelledby="alp-modal-title">
        <header class="alp-modal-head"><span id="alp-modal-title">Mi perfil corporativo</span><button type="button" aria-label="Cerrar">Cerrar ×</button></header>
        <div class="alp-modal-body">
          <div class="alp-view">
            <div class="alp-view-hero"><img class="alp-photo-large" alt="Foto de perfil"><div class="alp-view-name"></div><div class="alp-view-cargo"></div></div>
            <div class="alp-details">
              <div class="alp-detail"><span class="alp-detail-label">Dirección</span><span class="alp-detail-value" data-profile="direccion"></span></div>
              <div class="alp-detail"><span class="alp-detail-label">Correo</span><span class="alp-detail-value" data-profile="email"></span></div>
              <div class="alp-detail"><span class="alp-detail-label">Celular</span><span class="alp-detail-value" data-profile="celular"></span></div>
            </div>
            <div class="alp-status" role="status"></div>
            <div class="alp-modal-footer"><button class="alp-button alp-button-primary" type="button" data-edit>Editar perfil y firma</button></div>
          </div>
          <form class="alp-form">
            <div class="alp-field"><label>Nombre completo *</label><input name="nombre" maxlength="100" required></div>
            <div class="alp-field"><label>Cargo *</label><input name="cargo" maxlength="100" required></div>
            <div class="alp-field"><label>Dirección</label><input name="direccion" maxlength="255"></div>
            <div class="alp-field"><label>Correo electrónico *</label><input name="email" type="email" maxlength="100" required></div>
            <div class="alp-field"><label>Celular *</label><input name="celular" maxlength="20" required></div>
            <div class="alp-field"><label>Fotografía de perfil</label><div class="alp-photo-edit"><img class="alp-photo-preview" alt="Previsualización"><input name="foto" type="file" accept="image/png,image/jpeg,image/webp"></div></div>
            <section class="alp-section">
              <div class="alp-section-title">Firma corporativa</div>
              <div class="alp-sign-tabs"><button class="alp-sign-tab alp-active" type="button" data-sign-tab="html">Firma para correo</button><button class="alp-sign-tab" type="button" data-sign-tab="png">Imagen PNG</button></div>
              <div class="alp-preview" data-sign-panel="html"><div data-html-signature></div><div class="alp-actions"><small>Se actualiza con los datos del formulario.</small><button class="alp-button" type="button" data-copy-signature>Copiar firma HTML</button></div></div>
              <div class="alp-preview" data-sign-panel="png" style="display:none"><div data-png-empty>Guarda para generar o actualizar la firma PNG.</div><img class="alp-sign-image" alt="Firma corporativa" style="display:none"><div class="alp-actions" data-png-actions style="display:none"><span>Firma PNG generada</span><a data-png-download download="firma_corporativa.png">Descargar PNG</a></div></div>
            </section>
            <section class="alp-section">
              <div class="alp-section-title">Firma digital para documentos</div>
              <div class="alp-actions" style="justify-content:flex-start"><img class="alp-sign-image" data-recent-signature alt="Firma digital registrada" style="display:none"><span data-no-recent-signature>No hay firma guardada.</span><button type="button" class="alp-button" data-draw>Crear nueva firma</button></div>
              <div class="alp-canvas-wrap"><canvas class="alp-canvas" aria-label="Dibuja aquí tu firma digital"></canvas><div class="alp-actions"><small>Usa mouse, lápiz o pantalla táctil.</small><button type="button" class="alp-button" data-clear-canvas>Borrar trazo</button></div></div>
            </section>
            <div class="alp-error" role="alert"></div>
            <div class="alp-modal-footer"><button class="alp-button" type="button" data-cancel>Cancelar</button><button class="alp-button alp-button-primary" type="submit">Guardar y generar firma</button></div>
          </form>
        </div>
      </section>`;
    document.body.appendChild(overlay);
    const modal = overlay.querySelector('.alp-modal');
    const view = overlay.querySelector('.alp-view');
    const form = overlay.querySelector('.alp-form');
    const close = () => overlay.classList.remove('alp-visible');
    overlay.querySelector('.alp-modal-head button').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('[data-edit]').addEventListener('click', () => {
      view.style.display = 'none';
      form.style.display = 'block';
      form.querySelector('[name="nombre"]').value = profile.nombre || '';
      form.querySelector('[name="cargo"]').value = profile.cargo || '';
      form.querySelector('[name="direccion"]').value = profile.direccion || '';
      form.querySelector('[name="email"]').value = profile.email || '';
      form.querySelector('[name="celular"]').value = profile.celular || '';
      form.querySelector('[name="foto"]').value = '';
      form.querySelector('.alp-photo-preview').src = profile.foto_url || defaultPhoto;
      form.querySelector('.alp-error').style.display = 'none';
      paintHtmlSignature();
      paintPng(profile.firma_url);
      paintRecentSignature(recentSignature);
      signatureDirty = false;
      canvasWrap.style.display = 'none';
      selectSignTab('html');
    });

    const fields = ['nombre', 'cargo', 'direccion', 'email', 'celular'];
    fields.forEach(name => form.querySelector(`[name="${name}"]`).addEventListener('input', paintHtmlSignature));
    form.querySelector('[name="foto"]').addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
        event.target.value = '';
        return showError('La foto debe ser PNG, JPG o WEBP de máximo 10 MB.');
      }
      const reader = new FileReader();
      reader.onload = e => { form.querySelector('.alp-photo-preview').src = e.target.result; };
      reader.readAsDataURL(file);
    });

    form.querySelectorAll('[data-sign-tab]').forEach(btn => btn.addEventListener('click', () => selectSignTab(btn.dataset.signTab)));
    form.querySelector('[data-copy-signature]').addEventListener('click', copyHtmlSignature);
    form.querySelector('[data-draw]').addEventListener('click', () => { canvasWrap.style.display = 'block'; requestAnimationFrame(resizeCanvas); });
    form.querySelector('[data-clear-canvas]').addEventListener('click', clearCanvas);
    form.addEventListener('submit', saveProfile);
    form.querySelector('[data-cancel]').addEventListener('click', () => { form.style.display = 'none'; view.style.display = 'block'; });

    const canvas = form.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const canvasWrap = form.querySelector('.alp-canvas-wrap');
    let drawing = false, previous = null, signatureDirty = false;
    function resizeCanvas() {
      const box = canvas.getBoundingClientRect();
      if (!box.width) return;
      const ratio = window.devicePixelRatio || 1;
      const image = signatureDirty ? canvas.toDataURL('image/png') : null;
      canvas.width = Math.round(box.width * ratio);
      canvas.height = Math.round(130 * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.strokeStyle = '#000b59'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (image) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, box.width, 130); img.src = image; }
    }
    function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); signatureDirty = false; }
    function position(event) { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
    canvas.addEventListener('pointerdown', event => { if (!canvas.width) resizeCanvas(); drawing = true; previous = position(event); canvas.setPointerCapture(event.pointerId); event.preventDefault(); });
    canvas.addEventListener('pointermove', event => {
      if (!drawing) return;
      const point = position(event); ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(point.x, point.y); ctx.stroke();
      previous = point; signatureDirty = true; event.preventDefault();
    });
    const stopDrawing = () => { drawing = false; previous = null; };
    canvas.addEventListener('pointerup', stopDrawing); canvas.addEventListener('pointercancel', stopDrawing); canvas.addEventListener('lostpointercapture', stopDrawing);
    window.addEventListener('resize', () => { if (canvasWrap.style.display !== 'none') resizeCanvas(); });

    function selectSignTab(tab) {
      form.querySelectorAll('[data-sign-tab]').forEach(btn => btn.classList.toggle('alp-active', btn.dataset.signTab === tab));
      form.querySelectorAll('[data-sign-panel]').forEach(panel => panel.style.display = panel.dataset.signPanel === tab ? 'block' : 'none');
    }
    function showError(text) { const el = form.querySelector('.alp-error'); el.textContent = text; el.style.display = 'block'; }
    function paintHtmlSignature() {
      const val = name => esc(form.querySelector(`[name="${name}"]`).value.trim());
      const name = val('nombre') || 'Nombre y Apellido', cargo = val('cargo') || 'Cargo Corporativo';
      const email = val('email') || 'colaborador@logyser.com', cellphone = val('celular') || '3000000000';
      const address = val('direccion'), operation = esc(profile?.operacion || 'Sede Operación');
      const logo = 'https://storage.googleapis.com/logyser-recibo-public/Logyser%20sin%20Nit.png';
      const blue = '#1A2E44', orange = '#E8762B', style = `margin:0 0 3px;font-size:12px;color:${blue};font-family:Arial,Helvetica,sans-serif;`;
      form.querySelector('[data-html-signature]').innerHTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;max-width:480px;width:100%;background:#fff;border-collapse:collapse"><tr><td style="padding:16px 20px 12px;border:1px solid #DDE1E8;border-bottom:none"><p style="margin:0 0 2px;font-size:18px;font-weight:700;color:${blue}">${name}</p><p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${orange}">${cargo}</p><p style="${style}">Email: <a href="mailto:${email}" style="color:#06c;text-decoration:none;font-weight:600">${email}</a></p><p style="${style}">Celular: <span style="font-weight:600">+57 ${cellphone}</span></p><p style="${style}"><strong>Sede:</strong> ${operation}</p>${address ? `<p style="${style}">${address}</p>` : ''}</td></tr><tr><td style="padding:6px 20px;border-left:1px solid #DDE1E8;border-right:1px solid #DDE1E8"><img src="${logo}" alt="Logyser S.A.S." width="220" style="display:block;width:220px;height:auto"></td></tr><tr><td style="background:#F8FAFC;padding:12px 20px;border:1px solid #DDE1E8"><p style="margin:0;color:#64748B;font-size:9px;line-height:1.4;text-align:justify"><strong>AVISO DE CONFIDENCIALIDAD:</strong> La información de este correo es confidencial y para uso exclusivo del destinatario. Si lo recibió por error, notifique al remitente y elimínelo.</p><p style="margin:6px 0 0;color:#15803D;font-size:9px">Por favor, cuida el medio ambiente antes de imprimir este mensaje.</p></td></tr></table>`;
    }
    function paintPng(url) {
      const panel = form.querySelector('[data-sign-panel="png"]');
      const img = panel.querySelector('img');
      const empty = panel.querySelector('[data-png-empty]'), actions = panel.querySelector('[data-png-actions]'), link = panel.querySelector('[data-png-download]');
      if (!url) { img.style.display = 'none'; actions.style.display = 'none'; empty.style.display = 'block'; return; }
      img.src = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`; img.style.display = 'block';
      link.href = url; actions.style.display = 'flex'; empty.style.display = 'none';
    }
    async function copyHtmlSignature() {
      const signature = form.querySelector('[data-html-signature]');
      try {
        if (navigator.clipboard && window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([signature.innerHTML], { type: 'text/html' }) })]);
        else { const range = document.createRange(); range.selectNode(signature); window.getSelection().removeAllRanges(); window.getSelection().addRange(range); document.execCommand('copy'); window.getSelection().removeAllRanges(); }
        view.querySelector('.alp-status').textContent = 'Firma HTML copiada. Pégala en Gmail o Outlook.'; view.querySelector('.alp-status').style.display = 'block';
      } catch { showError('No se pudo copiar automáticamente. Selecciona la firma y cópiala.'); }
    }
    async function saveProfile(event) {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      const payload = new FormData();
      payload.set('usuario', usuario);
      payload.set('nombre', form.querySelector('[name="nombre"]').value.trim());
      payload.set('cargo', form.querySelector('[name="cargo"]').value.trim());
      payload.set('direccion', form.querySelector('[name="direccion"]').value.trim());
      payload.set('email', form.querySelector('[name="email"]').value.trim());
      payload.set('celular', form.querySelector('[name="celular"]').value.trim());
      payload.set('generarPng', 'true');
      const photoFile = form.querySelector('[name="foto"]').files?.[0];
      if (photoFile) payload.set('foto', photoFile);
      if (signatureDirty) payload.set('firmaDigital', canvas.toDataURL('image/png'));
      submit.disabled = true; submit.textContent = 'Guardando...'; form.querySelector('.alp-error').style.display = 'none';
      try {
        const response = await fetch('/perfil/api', { method: 'POST', body: payload });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || 'No se pudieron guardar los cambios.');
        profile = data.perfil; recentSignature = data.firmaDigital || recentSignature; signatureDirty = false; renderProfileCard();
        paintPng(profile.firma_url);
        const status = view.querySelector('.alp-status');
        status.textContent = profile.firma_generada ? 'Perfil guardado y firma PNG generada.' : 'Perfil guardado; no se pudo regenerar el PNG corporativo.';
        status.style.display = 'block'; form.style.display = 'none'; view.style.display = 'block';
      } catch (err) { showError(err.message); }
      finally { submit.disabled = false; submit.textContent = 'Guardar y generar firma'; }
    }
    return { overlay, modal, view, form, paintPng, paintHtmlSignature, paintRecentSignature, close };
  }

  function paintRecentSignature(signature) {
    const img = profileModal?.form.querySelector('[data-recent-signature]');
    const empty = profileModal?.form.querySelector('[data-no-recent-signature]');
    if (!img || !empty) return;
    img.src = signature || '';
    img.style.display = signature ? 'block' : 'none';
    empty.style.display = signature ? 'none' : 'inline';
  }

  function renderProfileCard() {
    if (!profile) return;
    const card = document.querySelector('.alp-profile');
    if (!card) return;
    const name = profile.nombre || usuario;
    card.querySelector('.alp-avatar').src = profile.foto_url || defaultPhoto;
    card.querySelector('.alp-avatar').onerror = event => { event.currentTarget.src = defaultPhoto; };
    card.querySelector('.alp-profile-name').textContent = name;
    card.style.display = 'block';
    profileModal.view.querySelector('.alp-photo-large').src = profile.foto_url || defaultPhoto;
    profileModal.view.querySelector('.alp-photo-large').onerror = event => { event.currentTarget.src = defaultPhoto; };
    profileModal.view.querySelector('.alp-view-name').textContent = name;
    profileModal.view.querySelector('.alp-view-cargo').textContent = profile.cargo || 'Cargo no registrado';
    ['direccion', 'email', 'celular'].forEach(key => profileModal.view.querySelector(`[data-profile="${key}"]`).textContent = profile[key] || 'No registrado');
  }

  async function openProfile() {
    if (!profile) return;
    profileModal.view.style.display = 'block'; profileModal.form.style.display = 'none';
    profileModal.view.querySelector('.alp-status').style.display = 'none'; profileModal.overlay.classList.add('alp-visible');
  }

  async function loadProfile() {
    try {
      const response = await fetch(`/perfil/api?usuario=${encodeURIComponent(usuario)}`);
      if (!response.ok) return;
      const data = await response.json();
      if (!data.ok || !data.perfil) return;
      profile = data.perfil; recentSignature = data.firmaDigital || null; renderProfileCard();
      paintRecentSignature(recentSignature);
      profileModal.paintPng(profile.firma_url);
    } catch (error) { console.warn('[módulos] No se pudo cargar el perfil:', error); }
  }

  function init() {
    const sidebar = document.querySelector('.sidebar');
    const brand = sidebar?.querySelector('.sidebar-brand') || document.querySelector('.brand-lockup-horizontal');
    if (!brand) return;
    brand.querySelectorAll('.brand-logo-app, .brand-logo-company-crop img').forEach(activarLogoComoInicio);
    sidebar?.querySelector('.sidebar-user')?.remove();
    if (currentModule === 'nomina') return;
    if (!document.querySelector('link[data-app-launcher-profile-style]')) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = '/css/app-launcher-profile.css';
      style.dataset.appLauncherProfileStyle = 'true';
      document.head.appendChild(style);
    }
    createLauncher(sidebar, brand);
    if (!sidebar) return;
    profileModal = createProfileModal();
    loadProfile();
  }

  let profileModal;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();