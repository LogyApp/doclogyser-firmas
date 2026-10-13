/*
 * Motor de tema compartido (Claro/Oscuro/Sistema + color de acento libre).
 * Aplica variables CSS sobre <html>, persiste en localStorage para que el
 * script anti-FOUC del <head> pinte el tema correcto desde el primer frame,
 * y sincroniza con /perfil/api/preferencias (fuente autoritativa en BD).
 */
(function () {
  const STORAGE_KEY = 'logyser-ui-prefs';
  const params = new URLSearchParams(window.location.search);
  const usuario = params.get('usuario') || (window.CONFIG && window.CONFIG.usuarioId) || (window.APP_CONFIG && window.APP_CONFIG.usuarioId) || '';

  function leerCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) { return null; }
  }

  function guardarCache(prefs) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch (e) {}
  }

  function resolverTema(pref) {
    if (pref === 'claro' || pref === 'oscuro') return pref;
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'oscuro' : 'claro';
  }

  // ───── Matemática de color (WCAG 2.x) ─────
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return { r: 245, g: 84, b: 0 };
    const int = parseInt(m[1], 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  }
  function rgbToHex(c) {
    const h = v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
    return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  }
  function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }
  function hslToRgb({ h, s, l }) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: r * 255, g: g * 255, b: b * 255 };
  }
  function relativeLuminance({ r, g, b }) {
    const chan = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  }
  function contrastRatio(rgb1, rgb2) {
    const L1 = relativeLuminance(rgb1), L2 = relativeLuminance(rgb2);
    const [light, dark] = L1 > L2 ? [L1, L2] : [L2, L1];
    return (light + 0.05) / (dark + 0.05);
  }
  const clampL = l => Math.max(0, Math.min(100, l));

  // Deriva --accent-dark/--accent-light/--accent-soft/--accent-contrast a
  // partir del HEX libre del usuario. Dos criterios deben cumplirse:
  // (1) el texto sobre el acento (blanco o el texto oscuro del tema) debe
  //     alcanzar >=4.5:1 (WCAG AA texto normal);
  // (2) el acento debe alcanzar >=3:1 contra la superficie donde vive
  //     (--card-bg del tema activo) para no volverse invisible como fondo
  //     de botón (ej. un acento blanco puro sobre una tarjeta blanca).
  // Si alguno falla, se empuja SOLO la luminosidad (nunca el tono elegido),
  // alejándola de la superficie, en pasos de 4%, máximo 14 iteraciones.
  function derivarPaletaAcento(hex, temaActivo) {
    const base = hexToRgb(hex);
    const hsl = rgbToHsl(base);

    const darkRgb = hslToRgb({ h: hsl.h, s: hsl.s, l: clampL(hsl.l - 12) });
    const lightRgb = hslToRgb({ h: hsl.h, s: hsl.s, l: clampL(hsl.l + 14) });

    // Blanco/negro fijos: son las dos opciones de color de TEXTO SOBRE EL
    // ACENTO (botones, badges) y no dependen del tema activo — un acento
    // claro necesita texto oscuro encima y viceversa, sea cual sea el modo.
    // Lo que sí cambia con el tema es `surface` (la tarjeta/fondo detrás del
    // acento), usada para el criterio de contraste no-textual.
    const white = { r: 255, g: 255, b: 255 };
    const darkText = { r: 16, g: 20, b: 37 };
    const surface = temaActivo === 'oscuro' ? { r: 21, g: 28, b: 43 } : { r: 255, g: 255, b: 255 };
    const surfaceLum = relativeLuminance(surface);

    function evaluar(rgb) {
      const cw = contrastRatio(rgb, white);
      const cd = contrastRatio(rgb, darkText);
      const cs = contrastRatio(rgb, surface);
      const textRatio = Math.max(cw, cd);
      return {
        textRatio,
        surfaceRatio: cs,
        contrastColor: cw >= cd ? '#ffffff' : rgbToHex(darkText),
        ok: textRatio >= 4.5 && cs >= 3,
        // Progreso combinado (0-2, capado por meta) para no optimizar un
        // criterio a costa de empeorar el otro.
        score: Math.min(textRatio / 4.5, 1) + Math.min(cs / 3, 1)
      };
    }

    let accentRgb = base;
    let actual = evaluar(base);

    if (!actual.ok) {
      // Dirección fija por superficie (no por la posición actual del acento):
      // superficie clara -> siempre oscurecer; superficie oscura -> siempre
      // aclarar. Comparar contra la posición actual del acento se atasca en
      // los extremos (ej. un acento blanco puro sobre superficie blanca
      // nunca "mejora" si se intenta aclarar aún más, porque ya está en el
      // tope).
      const oscurecer = surfaceLum > 0.5;
      let adjusted = { h: hsl.h, s: hsl.s, l: hsl.l };
      for (let i = 0; i < 24 && !actual.ok; i++) {
        adjusted = { h: adjusted.h, s: adjusted.s, l: clampL(oscurecer ? adjusted.l - 3 : adjusted.l + 3) };
        const candidato = evaluar(hslToRgb(adjusted));
        const candidatoRgb = hslToRgb(adjusted);
        if (candidato.ok || candidato.score > actual.score) {
          actual = candidato;
          accentRgb = candidatoRgb;
        }
      }
    }
    const accentContrast = actual.contrastColor;

    const softAlpha = temaActivo === 'oscuro' ? 0.16 : 0.10;
    return {
      accent: rgbToHex(accentRgb),
      accentDark: rgbToHex(darkRgb),
      accentLight: rgbToHex(lightRgb),
      accentSoft: `rgba(${Math.round(accentRgb.r)}, ${Math.round(accentRgb.g)}, ${Math.round(accentRgb.b)}, ${softAlpha})`,
      accentContrast
    };
  }

  // Deriva --primary/--primary-dark/--primary-light (barra lateral, header)
  // a partir del MISMO HEX elegido por el usuario, pero forzando la
  // luminosidad a valores siempre oscuros (sin importar el tono ni el tema
  // activo) para que el texto blanco del sidebar sea legible por
  // construcción, sin necesitar un bucle de ajuste de contraste. La
  // saturación se acota (30%-70%) para que el resultado siempre se lea
  // como "un color" -- ni grisáceo si el usuario eligió algo muy apagado,
  // ni neón si eligió algo muy saturado.
  // El naranja por defecto del sistema (#F55400, el mismo que ya trae toda
  // cuenta sin personalizar) es tratado como caso especial: conserva el
  // navy/naranja clasico de Cloud Docs (el estandar ya revisado) en vez de
  // derivar un sidebar marron oscuro del propio naranja. En cuanto el
  // usuario elige CUALQUIER otro color desde "Mi perfil", el sidebar sí
  // pasa a derivarse de ese color (lo que pedía el requisito original).
  const NAVY_POR_DEFECTO = { primary: '#000b59', primaryDark: '#00073a', primaryLight: '#1c2a7a' };
  function derivarPaletaPrimaria(hex) {
    if (hex.toLowerCase() === '#f55400') return NAVY_POR_DEFECTO;
    const hsl = rgbToHsl(hexToRgb(hex));
    const s = Math.max(30, Math.min(70, hsl.s));
    return {
      primary: rgbToHex(hslToRgb({ h: hsl.h, s, l: 16 })),
      primaryDark: rgbToHex(hslToRgb({ h: hsl.h, s, l: 10 })),
      primaryLight: rgbToHex(hslToRgb({ h: hsl.h, s, l: 28 }))
    };
  }

  function aplicarVariables(tema, hexOriginal) {
    const root = document.documentElement;
    root.setAttribute('data-theme', tema);
    const paleta = derivarPaletaAcento(hexOriginal, tema);
    const primaria = derivarPaletaPrimaria(hexOriginal);
    root.style.setProperty('--primary', primaria.primary);
    root.style.setProperty('--primary-dark', primaria.primaryDark);
    root.style.setProperty('--primary-light', primaria.primaryLight);
    root.style.setProperty('--accent', paleta.accent);
    root.style.setProperty('--accent-dark', paleta.accentDark);
    root.style.setProperty('--accent-light', paleta.accentLight);
    root.style.setProperty('--accent-soft', paleta.accentSoft);
    root.style.setProperty('--accent-contrast', paleta.accentContrast);
    root.style.setProperty('--focus-ring', `0 0 0 3px ${paleta.accentSoft}`);
  }

  let mediaQueryListener = null;
  function suscribirSistema(prefGuardada, colorAcento) {
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (!mq) return;
    if (mediaQueryListener) mq.removeEventListener('change', mediaQueryListener);
    mediaQueryListener = null;
    if (prefGuardada !== 'sistema') return;
    mediaQueryListener = () => aplicarVariables(resolverTema('sistema'), colorAcento);
    mq.addEventListener('change', mediaQueryListener);
  }

  // Debounce del guardado en BD: si el usuario arrastra el selector de color
  // o cambia varias opciones seguidas, cada cambio se aplica visualmente al
  // instante pero solo el ÚLTIMO valor se persiste (evita que dos POST en
  // vuelo terminen en orden inverso y guarden un valor obsoleto).
  let guardarTimeout = null;
  function guardarConDebounce(body) {
    if (guardarTimeout) clearTimeout(guardarTimeout);
    guardarTimeout = setTimeout(() => {
      fetch('/perfil/api/preferencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).catch(err => console.warn('[theme] No se pudo guardar la preferencia:', err.message));
    }, 350);
  }

  // API pública: usada por los controles de "Apariencia" en Mi Perfil.
  window.aplicarPreferenciasUI = function aplicarPreferenciasUI(tema, colorAcentoHex, opts) {
    opts = opts || {};
    const temaValido = ['claro', 'oscuro', 'sistema'].includes(tema) ? tema : 'sistema';
    const hexValido = /^#[0-9A-Fa-f]{6}$/.test(colorAcentoHex || '') ? colorAcentoHex : '#F55400';

    aplicarVariables(resolverTema(temaValido), hexValido);
    guardarCache({ tema: temaValido, colorAcento: hexValido });
    suscribirSistema(temaValido, hexValido);

    if (!opts.sinGuardar && usuario) {
      guardarConDebounce({ usuario, tema: temaValido, colorAcento: hexValido });
    }
  };

  // Aplicación inicial: cache local primero (sin esperar red, complementa al
  // script anti-FOUC del <head> que ya fijó data-theme), luego se contrasta
  // contra el valor autoritativo de BD y se reaplica solo si difiere.
  const cache = leerCache() || { tema: 'sistema', colorAcento: '#F55400' };
  aplicarVariables(resolverTema(cache.tema), cache.colorAcento);
  suscribirSistema(cache.tema, cache.colorAcento);

  if (usuario) {
    fetch(`/perfil/api/preferencias?usuario=${encodeURIComponent(usuario)}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!data || !data.ok) return;
        if (data.tema !== cache.tema || data.colorAcento !== cache.colorAcento) {
          window.aplicarPreferenciasUI(data.tema, data.colorAcento, { sinGuardar: true });
        }
      })
      .catch(() => {});
  }
})();
