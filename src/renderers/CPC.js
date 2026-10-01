// LOG&SER — Renderer: CPC (SST-FM-036) Consentimiento Prueba Alcohol
'use strict';
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function buildScreen(p) {
  const cls = p.clausulas || [];
  let h = '';
  // Ciudad y Fecha en línea
  h += '<div style="font-size:12px;color:#222;margin-bottom:16px">'
    + '<strong>Ciudad:</strong> <span style="border-bottom:1px solid #000;display:inline-block;min-width:120px;margin-right:30px">&nbsp;</span>'
    + '<strong>Fecha:</strong> <span style="border-bottom:1px solid #000;display:inline-block;min-width:120px">&nbsp;</span>'
    + '</div>';
  // Cláusulas
  cls.forEach(cl => {
    h += '<div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:12px">' + esc(cl.texto || '') + '</div>';
  });
  // Tabla firma centrada
  h += '<div style="margin:20px auto;width:60%;border:1px solid #000">';
  h += '<div style="padding:8px 12px;border-bottom:1px solid #000;font-size:12px;font-weight:700;color:#222">Firma del trabajador:</div>';
  h += '<div style="padding:8px 12px;font-size:12px;font-weight:700;color:#222"># Identificación</div>';
  h += '</div>';
  return h;
}

const pdfJS = (
  'function pdfCPC(r,df){'
  + 'var d=r.jdoc,c=PDF_CFG,CW=c.CW,ML=c.ML;'
  + 'r.y+=5;'
  // Ciudad y Fecha
  + 'pdfFont(d,8.5,"bold");pdfText(d,c.BLACK);d.text("Ciudad:",ML,r.y);'
  + 'pdfDraw(d,c.BLACK);d.setLineWidth(0.3);d.line(ML+18,r.y+1,ML+80,r.y+1);'
  + 'pdfFont(d,8.5,"bold");d.text("Fecha:",ML+90,r.y);'
  + 'd.line(ML+108,r.y+1,ML+CW,r.y+1);'
  + 'r.y+=10;'
  // Cláusulas
  + 'CLAUSULAS.forEach(function(cl){'
  + '  if(!cl.texto)return;'
  + '  var lines=cl.texto.split("\\n");'
  + '  lines.forEach(function(ln){'
  + '    var t=ln.trim();if(!t)return;'
  + '    pdfFont(d,8.5,"normal");pdfText(d,c.BLACK);'
  + '    var ls=d.splitTextToSize(t,CW);'
  + '    ls.forEach(function(l){r.check(5);d.text(l,ML,r.y);r.y+=4.2;});'
  + '  });'
  + '  r.y+=4;'
  + '});'
  // Tabla firma centrada
  + 'r.check(22);r.y+=6;'
  + 'var tw=CW*0.6,tx=ML+CW*0.2;'
  + 'pdfDraw(d,c.BLACK);d.setLineWidth(0.3);d.rect(tx,r.y,tw,7);'
  + 'pdfFont(d,8,"bold");pdfText(d,c.BLACK);d.text("Firma del trabajador:",tx+3,r.y+4.8);'
  + 'r.y+=7;'
  + 'pdfDraw(d,c.BLACK);d.setLineWidth(0.3);d.rect(tx,r.y,tw,7);'
  + 'pdfFont(d,8,"bold");d.text("# Identificaci\\u00F3n",tx+3,r.y+2);'
  + 'pdfFont(d,8,"normal");d.text(df.cedula||"",tx+3,r.y+5.5);'
  + 'r.y+=9;'
  + '}'
);

module.exports = { buildScreen, pdfJS };