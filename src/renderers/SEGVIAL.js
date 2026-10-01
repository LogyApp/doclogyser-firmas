// LOG&SER — Renderer: SEGVIAL (SST-F-025)
'use strict';
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function buildScreen(p) {
  const cls = p.clausulas || [];
  const d = p._datos || {};
  let h = '';

  if (p.intro) {
    h += '<div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:14px">' + esc(p.intro) + '</div>';
  }
  if (p.subintro) {
    h += '<div style="font-size:12px;color:#222;font-weight:600;margin-bottom:10px">' + esc(p.subintro) + '</div>';
  }

  h += '<div style="margin-bottom:16px">';
  cls.forEach(cl => {
    h += '<div style="display:flex;gap:8px;padding:3px 0 3px 8px;font-size:12px;color:#222;line-height:1.6">'
      + '<span style="flex-shrink:0;font-weight:700">' + esc(cl.numero) + '.</span><span>' + esc(cl.texto || '') + '</span></div>';
  });
  h += '</div>';

  if (p.declaracion) {
    const intro2 = 'Yo, ' + (d.nombre_completo || '') + ', identificado(a) con cédula de ciudadanía ' + (d.identificacion || '') + ', ' + p.declaracion;
    h += '<div style="border-top:1px solid #D8DCEA;padding-top:14px;margin-top:6px">';
    h += '<div style="font-size:10px;font-weight:700;color:#9AA5BF;text-transform:uppercase;margin-bottom:6px">Declaración del trabajador</div>';
    h += '<div style="font-size:12px;color:#222;line-height:1.75">' + esc(intro2) + '</div>';
    h += '</div>';
  }

  return h;
}

const pdfJS = (
  'function pdfSEGVIAL(r){'
  + 'var d=r.jdoc,c=PDF_CFG,CW=c.CW,ML=c.ML;'
  + 'r.y+=5;'
  + 'if(PLANTILLA.intro){'
  + '  pdfFont(d,8.5,"normal");pdfText(d,c.BLACK);'
  + '  var il=d.splitTextToSize(PLANTILLA.intro,CW);'
  + '  il.forEach(function(l){r.check(5);d.text(l,ML,r.y);r.y+=4.2;});'
  + '  r.y+=4;'
  + '}'
  + 'if(PLANTILLA.subintro){'
  + '  r.check(6);'
  + '  pdfFont(d,8.5,"bold");pdfText(d,c.BLACK);'
  + '  var sl=d.splitTextToSize(PLANTILLA.subintro,CW);'
  + '  sl.forEach(function(l){r.check(5);d.text(l,ML,r.y);r.y+=4.2;});'
  + '  r.y+=3;'
  + '}'
  + 'CLAUSULAS.forEach(function(cl){'
  + '  r.check(7);'
  + '  pdfFont(d,8.5,"bold");pdfText(d,c.BLACK);'
  + '  d.text(String(cl.numero)+".",ML,r.y);'
  + '  pdfFont(d,8.5,"normal");'
  + '  var ls=d.splitTextToSize(cl.texto||"",CW-9);'
  + '  ls.forEach(function(l,li){if(li>0)r.check(4.5);d.text(l,ML+7,r.y);r.y+=4.5;});'
  + '  r.y+=1;'
  + '});'
  + 'if(PLANTILLA.declaracion){'
  + '  r.y+=4;r.check(10);'
  + '  pdfDraw(d,c.LGRAY);d.setLineWidth(0.2);d.line(ML,r.y,ML+CW,r.y);'
  + '  r.y+=5;'
  + '  pdfFont(d,7,"bold");pdfText(d,c.DGRAY);'
  + '  d.text("DECLARACI\\u00D3N DEL TRABAJADOR",ML,r.y);'
  + '  r.y+=5;'
  + '  var nom=(DATOS_COL&&DATOS_COL.nombre_completo)||"";'
  + '  var ced=(DATOS_COL&&DATOS_COL.identificacion)||"";'
  + '  var txt="Yo, "+nom+", identificado(a) con c\\u00E9dula de ciudadan\\u00EDa "+ced+", "+PLANTILLA.declaracion;'
  + '  pdfFont(d,8.5,"normal");pdfText(d,c.BLACK);'
  + '  var dl=d.splitTextToSize(txt,CW);'
  + '  dl.forEach(function(l){r.check(5);d.text(l,ML,r.y);r.y+=4.2;});'
  + '}'
  + 'r.y+=6;'
  + '}'
);

module.exports = { buildScreen, pdfJS };
