// LOG&SER — Renderer: TD (TH-R-008)
'use strict';
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function buildScreen(p) {
  const cls = p.clausulas || [];
  let h = '';
  if (p.intro) {
    h += '<div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:14px">' + esc(p.intro) + '</div>';
  }
  cls.forEach(cl => {
    h += '<div style="display:flex;gap:6px;margin-bottom:10px">';
    h += '<div style="font-size:12px;font-weight:700;color:#222;flex-shrink:0;min-width:18px">' + esc(cl.numero) + '.</div>';
    h += '<div style="font-size:12px;color:#222;line-height:1.7">';
    if (cl.titulo) h += '<strong>' + esc(cl.titulo) + '</strong> ';
    // Texto con posibles sub-bullets
    const lines = (cl.texto || '').split('\n');
    let inList = false;
    lines.forEach(ln => {
      const t = ln.trim();
      if (!t) return;
      if (t[0] === '-' || t[0] === '•') {
        if (!inList) { h += '<ul style="margin:4px 0 0 0;padding-left:16px">'; inList = true; }
        h += '<li style="margin-bottom:2px">' + esc(t.replace(/^[-•]\s*/, '')) + '</li>';
      } else {
        if (inList) { h += '</ul>'; inList = false; }
        h += esc(t) + ' ';
      }
    });
    if (inList) h += '</ul>';
    h += '</div></div>';
  });
  return h;
}

const pdfJS = (
  'function pdfTD(r,df,fi){'
  + 'var d=r.jdoc,c=PDF_CFG,CW=c.CW,ML=c.ML;'
  + 'r.y+=5;'
  // Título del doc centrado bold
  + 'pdfFont(d,9.5,"bold");pdfText(d,c.BLACK);'
  + 'd.text("AUTORIZACI\\u00D3N PARA EL TRATAMIENTO DE DATOS PERSONALES",ML+CW/2,r.y,{align:"center"});'
  + 'r.y+=7;'
  // Intro
  + 'if(PLANTILLA.intro){'
  + '  pdfFont(d,8.5,"normal");pdfText(d,c.BLACK);'
  + '  var il=d.splitTextToSize(PLANTILLA.intro,CW);'
  + '  il.forEach(function(l){r.check(5);d.text(l,ML,r.y);r.y+=4.2;});'
  + '  r.y+=4;'
  + '}'
  // Cláusulas numeradas
  + 'CLAUSULAS.forEach(function(cl){'
  + '  r.check(8);'
  + '  pdfFont(d,8.5,"bold");pdfText(d,c.BLACK);'
  + '  d.text(String(cl.numero)+".",ML,r.y);'
  + '  if(cl.titulo){'
  + '    var tl=d.splitTextToSize(cl.titulo,CW-8);'
  + '    tl.forEach(function(l){r.check(4);d.text(l,ML+6,r.y);r.y+=4;});'
  + '  }'
  + '  if(cl.texto){'
  + '    pdfFont(d,8,"normal");pdfText(d,c.BLACK);'
  + '    var lines=cl.texto.split("\\n");'
  + '    lines.forEach(function(ln){'
  + '      var t=ln.trim();if(!t)return;'
  + '      var ls=d.splitTextToSize(t,CW-6);'
  + '      ls.forEach(function(l){r.check(4);d.text(l,ML+6,r.y);r.y+=4;});'
  + '    });'
  + '  }'
  + '  r.y+=3;'
  + '});'
  // Frase "Se firma en el municipio de..." (réplica del papel, con valores reales)
  + 'r.check(10);r.y+=3;'
  + 'var frase="Se firma en el municipio de "+(df.municipio||"____")+", d\\u00EDa "+(df.dia||"__")+" del mes "+(df.mes||"__")+" del 20"+(df.anio&&df.anio.length>=2?df.anio.slice(-2):(df.anio||"__"))+".";'
  + 'pdfFont(d,8.5,"normal");pdfText(d,c.BLACK);'
  + 'var fl=d.splitTextToSize(frase,CW);'
  + 'fl.forEach(function(l){r.check(5);d.text(l,ML,r.y);r.y+=4.5;});'
  + 'r.y+=3;'
  // Tabla de firma 4 columnas: Firma | Nombres y apellidos | Identificación | Lugar de expedición
  + 'r.check(24);'
  + 'var tcols=["Firma:","Nombres y apellidos:","Identificaci\\u00F3n:","Lugar de\\nexpedici\\u00F3n:"];'
  + 'var tcw=[CW*0.22,CW*0.32,CW*0.22,CW*0.24];'
  + 'var vals=["",df.nombres||"",df.cedula||"",df.expedicion||""];'
  + 'var hx=ML;'
  // Header
  + 'pdfDraw(d,c.BLACK);d.setLineWidth(0.3);d.rect(ML,r.y,CW,7);'
  + 'tcols.forEach(function(col,i){'
  + '  if(i>0)d.line(hx,r.y,hx,r.y+7);'
  + '  pdfFont(d,7,"bold");pdfText(d,c.BLACK);'
  + '  d.text(col,hx+2,r.y+4.5);'
  + '  hx+=tcw[i];'
  + '});'
  + 'r.y+=7;'
  // Fila de valores (con la firma real dentro de la celda "Firma")
  + 'var rowH=18;'
  + 'hx=ML;'
  + 'pdfDraw(d,c.BLACK);d.setLineWidth(0.3);d.rect(ML,r.y,CW,rowH);'
  + 'vals.forEach(function(v,i){'
  + '  if(i>0)d.line(hx,r.y,hx,r.y+rowH);'
  + '  if(i===0&&fi&&fi.indexOf("data:")===0){'
  + '    try{d.addImage(fi,"PNG",hx+1,r.y+1,tcw[0]-2,rowH-2);}catch(e){}'
  + '  }else{'
  + '    pdfFont(d,8.5,"normal");pdfText(d,c.BLACK);'
  + '    d.text(String(v),hx+2,r.y+rowH/2+1.5);'
  + '  }'
  + '  hx+=tcw[i];'
  + '});'
  + 'r.y+=rowH+2;'
  + '}'
);

module.exports = { buildScreen, pdfJS };