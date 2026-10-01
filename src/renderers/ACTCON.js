// LOG&SER — Renderer: ACTCON (TH-R-026)
'use strict';
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function buildScreen(p) {
  const cls = p.clausulas || [];
  const d = p._datos || {};
  let h = '';
  // Intro: "Yo, ___, identificado con CC No. ___, declaro..."
  const intro = 'Yo, ' + (d.nombre_completo || '') + ', identificado con CC No. ' + (d.identificacion || '')
    + ', declaro que antes de mi contratación he sido informado de manera clara sobre:';
  h += '<div style="font-size:12.5px;color:#222;line-height:1.8;margin-bottom:16px">' + esc(intro) + '</div>';
  // Bullets de las cláusulas (el ACTCON solo tiene 1 cláusula con bullets)
  cls.forEach(cl => {
    const lines = (cl.texto || '').split('\n');
    lines.forEach(ln => {
      const t = ln.trim().replace(/^[-•]\s*/, '');
      if (!t) return;
      h += '<div style="display:flex;gap:8px;padding:3px 0 3px 8px;font-size:12px;color:#222;line-height:1.6">'
        + '<span style="flex-shrink:0">•</span><span>' + esc(t) + '</span></div>';
    });
  });
  return h;
}

const pdfJS = (
  'function pdfACTCON(r,df){'
  + 'var d=r.jdoc,c=PDF_CFG,CW=c.CW,ML=c.ML;'
  + 'r.y+=6;'
  // Intro con nombre y CC prellenados
  + 'var intro="Yo, "+(DATOS_COL.nombre_completo||df.nombres||"")+'
  + '", identificado con CC No. "+(DATOS_COL.identificacion||df.cedula||"")+", declaro que antes de mi contrataci\\u00F3n he sido informado de manera clara sobre:";'
  + 'pdfFont(d,9,"normal");pdfText(d,c.BLACK);'
  + 'var il=d.splitTextToSize(intro,CW);'
  + 'il.forEach(function(l){r.check(5);d.text(l,ML,r.y);r.y+=4.5;});'
  + 'r.y+=4;'
  // Bullets
  + 'CLAUSULAS.forEach(function(cl){'
  + '  (cl.texto||"").split("\\n").forEach(function(ln){'
  + '    var t=ln.trim().replace(/^[-\\u2022]\\s*/,"");if(!t)return;'
  + '    r.check(6);'
  + '    pdfFont(d,9,"normal");pdfText(d,c.BLACK);'
  + '    d.text("\\u2022",ML+4,r.y);'
  + '    var ls=d.splitTextToSize(t,CW-10);'
  + '    ls.forEach(function(l){r.check(5);d.text(l,ML+9,r.y);r.y+=4.5;});'
  + '    r.y+=1;'
  + '  });'
  + '});'
  + 'r.y+=6;'
  + '}'
);

module.exports = { buildScreen, pdfJS };