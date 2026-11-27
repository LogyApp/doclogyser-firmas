// Ventana "Habilitar Doc. SST" (Panel Admin del aspirante y Cloud-Docs). Cada documento lleva un interruptor como el
// de Retirados / Activos de la Sociodemográfica; los ya habilitados quedan encendidos con su estado. API:
// /seleccion/api/doc-sst/:id (estado) y /seleccion/api/doc-sst/:id/habilitar (services/docSstPortal.js).
//   DocSst.consultar(idAspirante, usuario) -> estado
//   DocSst.abrir({ idAspirante, usuario, onCambio })  abre la ventana; onCambio(estado) al guardar cambios
// Un documento habilitado que aún no se ha firmado se puede apagar para deshabilitarlo (/deshabilitar): el registro se
// borra como si no hubiera pasado nada. Los firmados quedan encendidos y bloqueados.
//   DocSst.htmlLista(estado)                          lista de los habilitados (estado, Ver PDF, Copiar enlace)
(function () {
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fecha = v => {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', year: 'numeric' });
  };

  const CSS = `
    .dsst-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit}
    .dsst-modal{background:#fff;color:#0f172a;border-radius:18px;width:100%;max-width:520px;max-height:92vh;overflow:auto;box-shadow:0 25px 50px -12px rgba(0,0,0,.35)}
    .dsst-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px;background:#ecfdf5;border-bottom:1px solid #a7f3d0}
    .dsst-head h3{margin:0;font-size:1rem;font-weight:800;color:#065f46}
    .dsst-head p{margin:3px 0 0;font-size:.78rem;color:#047857}
    .dsst-x{border:none;background:none;font-size:1.4rem;line-height:1;color:#065f46;cursor:pointer}
    .dsst-body{padding:16px 18px}
    .dsst-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:8px}
    .dsst-row.off{opacity:.55;background:#f8fafc}
    .dsst-nom{font-weight:700;font-size:.86rem;color:#1e293b}
    .dsst-sub{font-size:.72rem;color:#64748b;margin-top:2px}
    .dsst-switch{position:relative;display:inline-block;width:40px;height:21px;flex-shrink:0}
    .dsst-switch input{opacity:0;width:0;height:0}
    .dsst-slider{position:absolute;cursor:pointer;inset:0;background:#dc2626;transition:.28s;border-radius:21px}
    .dsst-slider:before{position:absolute;content:"";height:15px;width:15px;left:3px;bottom:3px;background:#fff;transition:.28s;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.25)}
    .dsst-switch input:checked+.dsst-slider{background:#16a34a}
    .dsst-switch input:checked+.dsst-slider:before{transform:translateX(19px)}
    .dsst-switch input:disabled+.dsst-slider{opacity:.55;cursor:not-allowed}
    .dsst-chip{font-size:.66rem;font-weight:800;padding:2px 8px;border-radius:6px;text-transform:uppercase;letter-spacing:.03em}
    .dsst-chip.ok{background:#dcfce7;color:#15803d}.dsst-chip.pend{background:#fef3c7;color:#b45309}
    .dsst-aviso{font-size:.76rem;border-radius:10px;padding:10px 12px;margin-bottom:12px;line-height:1.45}
    .dsst-aviso.info{background:#f0f9ff;border:1px solid #bae6fd;color:#075985}
    .dsst-aviso.warn{background:#fffbeb;border:1px solid #fde68a;color:#92400e}
    .dsst-aviso.err{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
    .dsst-aviso.ok{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534}
    .dsst-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid #e2e8f0}
    .dsst-btn{border:none;border-radius:9px;padding:8px 14px;font-weight:700;font-size:.8rem;cursor:pointer}
    .dsst-btn.prim{background:#059669;color:#fff}.dsst-btn.prim:disabled{background:#94a3b8;cursor:not-allowed}
    .dsst-btn.sec{background:#f1f5f9;color:#334155;border:1px solid #cbd5e1}
    .dsst-lista-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:.8rem}
    .dsst-lista-row:last-child{border-bottom:none}
    .dsst-mini{display:inline-flex;align-items:center;gap:4px;border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:7px;padding:3px 8px;font-size:.7rem;font-weight:700;cursor:pointer;text-decoration:none}
  `;

  function asegurarCss() {
    if (document.getElementById('dsst-css')) return;
    const s = document.createElement('style');
    s.id = 'dsst-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  async function consultar(idAspirante, usuario) {
    const r = await fetch(`/seleccion/api/doc-sst/${encodeURIComponent(idAspirante)}?usuario=${encodeURIComponent(usuario || '')}`, { cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'No se pudieron consultar los documentos SST');
    return data;
  }

  function copiar(texto, boton) {
    const listo = () => { if (boton) { const t = boton.textContent; boton.textContent = '¡Copiado! ✓'; setTimeout(() => { boton.textContent = t; }, 2000); } };
    if (navigator.clipboard) navigator.clipboard.writeText(texto).then(listo).catch(() => prompt('Copie el enlace:', texto));
    else prompt('Copie el enlace:', texto);
  }

  // Lista de los documentos ya habilitados
  function htmlLista(estado) {
    const habilitados = (estado && estado.opciones || []).filter(o => o.estado);
    if (!habilitados.length) return '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:.8rem">Aún no se han habilitado documentos SST.</div>';
    return habilitados.map(o => `
      <div class="dsst-lista-row">
        <span style="display:flex;align-items:center;gap:8px;min-width:0">
          <span>${o.estado === 'firmado' ? '✅' : '⏳'}</span>
          <span style="min-width:0">
            <span style="font-weight:600;color:#334155">${esc(o.nombre)}</span>
            <span style="display:block;font-size:.7rem;color:#94a3b8">${o.estado === 'firmado' ? `Firmado ${fecha(o.fechaFirma)}` : `Habilitado ${fecha(o.fechaCreacion)}`}</span>
          </span>
        </span>
        <span style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          ${o.urlDoc ? `<a class="dsst-mini" href="${esc(o.urlDoc)}" target="_blank" rel="noopener">📄 Ver</a>` : ''}
          ${o.enlace ? `<button type="button" class="dsst-mini" data-dsst-copiar="${esc(o.enlace)}" title="Copiar el enlace directo de este documento">📋 Enlace</button>` : ''}
          <span class="dsst-chip ${o.estado === 'firmado' ? 'ok' : 'pend'}">${o.estado === 'firmado' ? 'Firmado' : 'Pendiente'}</span>
        </span>
      </div>`).join('');
  }

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('[data-dsst-copiar]');
    if (b) copiar(b.getAttribute('data-dsst-copiar'), b);
  });

  function cerrar() {
    const o = document.getElementById('dsst-overlay');
    if (o) o.remove();
  }

  function pintar(cuerpo, estado, mensaje) {
    const p = estado.persona || {};
    let html = '';
    if (mensaje) html += mensaje;
    if (estado.error) html += `<div class="dsst-aviso err">${esc(estado.error)}</div>`;
    else if (!estado.puede) html += '<div class="dsst-aviso err">Su rol no puede habilitar documentos SST.</div>';
    else if (!estado.tieneFirma) html += '<div class="dsst-aviso warn">No tiene una firma registrada: en la EVIN y el INGE su firma saldría en blanco, y el Compromiso SST quedaría esperando su firma manual. Regístrela en su perfil antes de habilitarlos.</div>';
    html += `<div class="dsst-aviso info"><strong>${esc(p.nombre || '')}</strong> · C.C. ${esc(p.identificacion || '')}<br>
      Cargo: ${esc(p.cargo || '—')} · Operación: ${esc(p.operacion || '—')}<br>
      Lo que habilite aparece en su portal: el mismo enlace que usa para subir sus documentos y firmar.
      Si se equivocó, apague un documento pendiente y guarde para deshabilitarlo.</div>`;
    html += (estado.opciones || []).map(o => {
      const habilitado = !!o.estado;
      // Firmado: no se puede tocar. Pendiente: se puede apagar para deshabilitarlo.
      const bloqueado = o.estado === 'firmado' || (!habilitado && !o.aplica) || !estado.puede || (!!estado.error && !habilitado);
      const sub = habilitado
        ? `<span class="dsst-chip ${o.estado === 'firmado' ? 'ok' : 'pend'}">${o.estado === 'firmado' ? `Firmado ${fecha(o.fechaFirma)}` : `Habilitado ${fecha(o.fechaCreacion)} · pendiente`}</span>`
        : (o.aplica ? esc(o.accion) : `No aplica para el cargo ${esc(p.cargo || '')}`);
      return `
        <label class="dsst-row${!o.aplica && !habilitado ? ' off' : ''}">
          <span><span class="dsst-nom">${o.icono} ${esc(o.nombre)}</span><span class="dsst-sub" style="display:block">${sub}</span></span>
          <span class="dsst-switch"><input type="checkbox" data-clave="${esc(o.clave)}" data-habilitado="${habilitado && o.estado !== 'firmado' ? '1' : '0'}" ${habilitado ? 'checked' : ''} ${bloqueado ? 'disabled' : ''}><span class="dsst-slider"></span></span>
        </label>`;
    }).join('');
    cuerpo.innerHTML = html;
  }

  async function abrir({ idAspirante, usuario, onCambio }) {
    asegurarCss();
    cerrar();
    const ov = document.createElement('div');
    ov.id = 'dsst-overlay';
    ov.className = 'dsst-overlay';
    ov.innerHTML = `
      <div class="dsst-modal" role="dialog" aria-modal="true" aria-labelledby="dsst-titulo">
        <div class="dsst-head">
          <div><h3 id="dsst-titulo">🦺 Habilitar Doc. SST</h3><p>Encienda los documentos que el aspirante debe firmar desde su portal</p></div>
          <button type="button" class="dsst-x" aria-label="Cerrar">&times;</button>
        </div>
        <div class="dsst-body"><div style="padding:16px;text-align:center;color:#64748b;font-size:.85rem">Consultando...</div></div>
        <div class="dsst-foot">
          <button type="button" class="dsst-btn sec" data-accion="cerrar">Cerrar</button>
          <button type="button" class="dsst-btn prim" data-accion="habilitar" disabled>Guardar cambios</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const cuerpo = ov.querySelector('.dsst-body');
    const btn = ov.querySelector('[data-accion="habilitar"]');
    ov.addEventListener('click', (ev) => { if (ev.target === ov || ev.target.closest('.dsst-x') || ev.target.closest('[data-accion="cerrar"]')) cerrar(); });
    const nuevos = () => [...cuerpo.querySelectorAll('input[data-clave][data-habilitado="0"]:checked:not(:disabled)')].map(i => i.getAttribute('data-clave'));
    const quitar = () => [...cuerpo.querySelectorAll('input[data-clave][data-habilitado="1"]:not(:checked):not(:disabled)')].map(i => i.getAttribute('data-clave'));
    const hayCambios = () => nuevos().length + quitar().length > 0;
    cuerpo.addEventListener('change', () => { btn.disabled = !hayCambios(); });
    const enviar = async (accion, claves) => {
      const r = await fetch(`/seleccion/api/doc-sst/${encodeURIComponent(idAspirante)}/${accion}?usuario=${encodeURIComponent(usuario || '')}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claves }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'No se pudieron guardar los cambios');
      return data;
    };
    const nombreDe = c => ((estado.opciones || []).find(o => o.clave === c) || {}).nombre || c;

    let estado;
    try {
      estado = await consultar(idAspirante, usuario);
      pintar(cuerpo, estado);
    } catch (err) {
      cuerpo.innerHTML = `<div class="dsst-aviso err">${esc(err.message)}</div>`;
      return;
    }

    btn.addEventListener('click', async () => {
      const agregar = nuevos(), sacar = quitar();
      if (!agregar.length && !sacar.length) return;
      if (sacar.length && !confirm(`¿Deshabilitar ${sacar.map(nombreDe).join(', ')}? Se elimina del portal y de SST como si no se hubiera habilitado.`)) return;
      btn.disabled = true;
      btn.textContent = 'Guardando...';
      const partes = [], omitidos = [];
      try {
        if (sacar.length) {
          const d = await enviar('deshabilitar', sacar);
          estado = d.estado;
          if (d.deshabilitados.length) partes.push(`Deshabilitado: ${esc(d.deshabilitados.join(', '))}.`);
          omitidos.push(...d.omitidos);
        }
        if (agregar.length) {
          const h = await enviar('habilitar', agregar);
          estado = h.estado;
          if (h.habilitados.length) partes.push(`Habilitado: ${esc(h.habilitados.join(', '))}. Pídale que abra su portal con el mismo enlace.`);
          omitidos.push(...h.omitidos);
        }
        const msg = `<div class="dsst-aviso ok">${partes.join('<br>') || 'No hubo cambios.'}
          ${omitidos.length ? `<br>Sin cambios: ${esc(omitidos.join(', '))}.` : ''}</div>`;
        pintar(cuerpo, estado, msg);
        if (typeof onCambio === 'function') onCambio(estado);
      } catch (err) {
        alert(err.message);
        try { estado = await consultar(idAspirante, usuario); pintar(cuerpo, estado); if (typeof onCambio === 'function') onCambio(estado); } catch (e) { /* se mantiene la vista */ }
      } finally {
        btn.textContent = 'Guardar cambios';
        btn.disabled = !hayCambios();
      }
    });
  }

  window.DocSst = { consultar, abrir, htmlLista };
})();
