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

async function generarPDF(htmlContenido) {
  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><style>${CSS_PDF}</style></head>
<body>${htmlContenido}</body>
</html>`;

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle2', timeout: 30000 });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '18mm', left: '20mm', right: '18mm' },
    });
    return buffer;
  } finally {
    await browser.close();
  }
}

module.exports = { generarPDF };
