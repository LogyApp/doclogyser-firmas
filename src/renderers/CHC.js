// LOG&SER — Renderer: CHC (TH-R-025) Autorización Acceso Historia Clínica
'use strict';
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function buildScreen(p) {
  const cls = p.clausulas || [];
  let h = '';
  // Campo "Señores:" con línea
  h += '<div style="font-size:12px;color:#222;margin-bottom:14px">'
    + '<strong>Señores:</strong> <span style="border-bottom:1px solid #000;display:inline-block;min-width:200px;padding-bottom:1px">&nbsp;(Indicar nombre de EPS o compañía de medicina prepagada)</span>'
    + '</div>';
  h += '<div style="font-size:12px;color:#222;margin-bottom:12px">Cordial saludo.</div>';
  // Cláusulas
  cls.forEach(cl => {
    const lines = (cl.texto || '').split('\n');
    let inList = false;
    h += '<div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:10px">';
    lines.forEach(ln => {
      const t = ln.trim();
      if (!t) return;
      if (t[0] === '-') {
        if (!inList) { h += '<ul style="margin:4px 0;padding-left:20px">'; inList = true; }
        h += '<li style="margin-bottom:3px">' + esc(t.replace(/^-\s*/, '')) + '</li>';
      } else {
        if (inList) { h += '</ul>'; inList = false; }
        h += '<p style="margin:0 0 4px">' + esc(t) + '</p>';
      }
    });
    if (inList) h += '</ul>';
    h += '</div>';
  });
  // Acepto la finalidad
  h += '<div style="font-size:12px;color:#222;margin:14px 0"><strong>Acepto la finalidad antes indicada: SI: ___ , No: ___.</strong></div>';
  // FIRMA
  h += '<div style="font-size:12px;color:#222;margin-top:16px"><strong>FIRMA:</strong></div>';
  return h;
}

const pdfJS = (
  'function pdfCHC(r,df){'
  + 'var d=r.jdoc,c=PDF_CFG,CW=c.CW,ML=c.ML;'
  + 'r.y+=5;'
  // Señores
  + 'pdfFont(d,8.5,"bold");pdfText(d,c.BLACK);d.text("Se\\u00F1ores:",ML,r.y);'
  + 'pdfFont(d,8.5,"normal");'
  + 'd.text("(Indicar nombre de EPS o compa\\u00F1\\u00EDa de medicina prepagada)",ML+22,r.y);'
  + 'pdfDraw(d,c.BLACK);d.setLineWidth(0.3);d.line(ML+22,r.y+1,ML+CW,r.y+1);'
  + 'r.y+=8;'
  + 'pdfFont(d,8.5,"normal");pdfText(d,c.BLACK);d.text("Cordial saludo.",ML,r.y);r.y+=7;'
  // Cláusulas
  + 'CLAUSULAS.forEach(function(cl){'
  + '  if(!cl.texto)return;'
  + '  var lines=cl.texto.split("\\n");'
  + '  lines.forEach(function(ln){'
  + '    var t=ln.trim();if(!t)return;'
  + '    if(t[0]==="-"){'
  + '      r.check(5);'
  + '      pdfFont(d,8,"normal");pdfText(d,c.BLACK);'
  + '      d.text("-",ML+4,r.y);'
  + '      var ls=d.splitTextToSize(t.replace(/^-\\s*/,""),CW-10);'
  + '      ls.forEach(function(l){r.check(4);d.text(l,ML+8,r.y);r.y+=4;});'
  + '      r.y+=1;'
  + '    }else{'
  + '      var ls2=d.splitTextToSize(t,CW);'
  + '      ls2.forEach(function(l){r.check(4);pdfFont(d,8.5,"normal");pdfText(d,c.BLACK);d.text(l,ML,r.y);r.y+=4.2;});'
  + '      r.y+=2;'
  + '    }'
  + '  });'
  + '  r.y+=2;'
  + '});'
  // Acepto
  + 'r.check(8);r.y+=4;'
  + 'pdfFont(d,8.5,"bold");pdfText(d,c.BLACK);'
  + 'd.text("Acepto la finalidad antes indicada: SI: ___ , No: ___.",ML,r.y);'
  + 'r.y+=10;'
  // FIRMA
  + 'pdfFont(d,8.5,"bold");pdfText(d,c.BLACK);d.text("FIRMA:",ML,r.y);r.y+=12;'
  + 'pdfDraw(d,c.BLACK);d.setLineWidth(0.4);d.line(ML,r.y,ML+90,r.y);r.y+=4;'
  + 'pdfFont(d,8,"bold");pdfText(d,c.BLACK);d.text("NOMBRE:",ML,r.y);'
  + 'pdfFont(d,8,"normal");d.text(df.nombres||"",ML+20,r.y);'
  + 'pdfDraw(d,c.BLACK);d.setLineWidth(0.3);d.line(ML+20,r.y+1,ML+CW,r.y+1);'
  + 'r.y+=6;'
  + 'pdfFont(d,8,"bold");d.text("CEDULA:",ML,r.y);'
  + 'pdfFont(d,8,"normal");d.text(df.cedula||"",ML+20,r.y);'
  + 'pdfDraw(d,c.BLACK);d.setLineWidth(0.3);d.line(ML+20,r.y+1,ML+CW,r.y+1);'
  + 'r.y+=8;'
  + '}'
);

module.exports = { buildScreen, pdfJS };