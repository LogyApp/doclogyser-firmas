const puppeteer = require('puppeteer');

const CSS_PDF = `
  * { box-sizing: border-box; }
  body {
    font-family: Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.55;
    color: #000;
    margin: 0; padding: 0;
  }
  p { text-align: justify; margin: 0 0 6px 0; }
  strong { font-weight: bold; }
  u { text-decoration: underline; }
  em { font-style: italic; }
  img { max-width: 100%; height: auto; }
  div { max-width: 100%; }
`;

const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];

let browserInstance = null;
let launchingPromise = null;

// Reutiliza un único Chrome para todo el proceso en vez de lanzar uno nuevo en
// cada PDF/firma: levantar Chrome tarda 1-2s y consume CPU/RAM de forma
// notoria, y esta función la usan ~28 flujos de firma distintos — en un
// contenedor de 1 sola instancia eso se nota mucho si coinciden varias firmas.
// Si el navegador se desconecta (crash, sin memoria), se relanza solo al
// siguiente uso.
async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;
  if (launchingPromise) return launchingPromise;

  launchingPromise = puppeteer.launch({ args: LAUNCH_ARGS })
    .then((browser) => {
      browserInstance = browser;
      browser.once('disconnected', () => {
        if (browserInstance === browser) browserInstance = null;
      });
      return browser;
    })
    .finally(() => { launchingPromise = null; });

  return launchingPromise;
}

// Abre una pestaña nueva sobre el navegador compartido. Quien la use es
// responsable de cerrarla (page.close()) al terminar; el navegador en sí
// nunca se cierra entre llamadas. Exportada para que otros servicios que
// también usan Puppeteer (ej. firmaSyncService) compartan el mismo Chrome
// en vez de abrir uno adicional por su cuenta.
async function nuevaPagina() {
  const browser = await getBrowser();
  return browser.newPage();
}

async function generarPDF(htmlContenido, options = {}) {
  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><style>${CSS_PDF}</style></head>
<body>${htmlContenido}</body>
</html>`;

  const page = await nuevaPagina();
  try {
    await page.setContent(html, { waitUntil: 'networkidle2', timeout: 30000 });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: options.margin || { top: '12mm', bottom: '18mm', left: '20mm', right: '18mm' },
      ...options
    });
    return buffer;
  } finally {
    await page.close().catch(() => {});
  }
}

async function generarPDFDesdeHTML(htmlCompleto) {
  const page = await nuevaPagina();
  try {
    await page.setContent(htmlCompleto, { waitUntil: 'networkidle2', timeout: 30000 });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
    });
    return buffer;
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { generarPDF, generarPDFDesdeHTML, nuevaPagina };
