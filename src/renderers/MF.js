// LOG&SER — Renderer: MF (SST-MA-002)
'use strict';
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function buildScreen(p) {
  const cls = p.clausulas || [];
  let h = '<div style="font-family:Arial,sans-serif;font-size:11px;color:#000">';

  // Función: fila de tabla MF
  function secTit(titulo) {
    return '<tr><td colspan="2" style="background:#1B2A5E;color:#fff;font-weight:700;padding:4px 8px;text-align:center;font-size:10.5px;text-transform:uppercase">'
      + esc(titulo) + '</td></tr>';
  }
  function fila2(k, v, k2, v2) {
    let r = '<tr>';
    r += '<td style="border:1px solid #D8DCEA;padding:3px 6px;font-weight:700;width:25%">' + esc(k) + '</td>';
    r += '<td style="border:1px solid #D8DCEA;padding:3px 6px;width:25%">' + esc(v || '') + '</td>';
    if (k2 !== undefined) {
      r += '<td style="border:1px solid #D8DCEA;padding:3px 6px;font-weight:700;width:25%">' + esc(k2) + '</td>';
      r += '<td style="border:1px solid #D8DCEA;padding:3px 6px;width:25%">' + esc(v2 || '') + '</td>';
    }
    r += '</tr>';
    return r;
  }

  h += '<table style="width:100%;border-collapse:collapse;margin-bottom:0">';

  cls.forEach(cl => {
    if (!cl.texto) {
      h += secTit(cl.titulo || '');
      return;
    }
    const lines = (cl.texto || '').split('\n').filter(l => l.trim());
    if (lines.length === 0) {
      h += secTit(cl.titulo || '');
      return;
    }
    // Sección con título encabezado + filas de contenido
    h += secTit(cl.titulo || '');
    if (cl.tipo === 'tabla2col') {
      // Pares clave:valor
      for (let i = 0; i < lines.length; i += 2) {
        const [k, v] = lines[i].split(':'), [k2, v2] = (lines[i + 1] || '').split(':');
        h += fila2(k?.trim() || '', v?.trim() || '', k2?.trim(), v2?.trim());
      }
    } else {
      // Lista simple — cada línea en celda ancho completo
      lines.forEach(ln => {
        h += '<tr><td colspan="2" style="border:1px solid #D8DCEA;padding:3px 6px">' + esc(ln.trim()) + '</td></tr>';
      });
    }
  });

  h += '</table></div>';
  return h;
}

const pdfJS = (
  'function pdfMF(r,df){'
  + 'var d=r.jdoc,c=PDF_CFG,CW=c.CW,ML=c.ML;'
  + 'r.y+=4;'
  + 'function secTit(t){'
  + '  r.check(10);'
  + '  pdfFill(d,c.NAVY);d.rect(ML,r.y,CW,7,"F");'
  + '  pdfFont(d,7.5,"bold");pdfText(d,c.WHITE);'
  + '  d.text(t.toUpperCase(),ML+CW/2,r.y+4.8,{align:"center"});'
  + '  r.y+=7;'
  + '}'
  + 'function fila(texto,x,w,bold){'
  + '  pdfFont(d,7.5,bold?"bold":"normal");pdfText(d,c.BLACK);'
  + '  var ls=d.splitTextToSize(texto,w-4);'
  + '  var h2=Math.max(7,ls.length*3.5+3);'
  + '  r.check(h2+1);'
  + '  pdfDraw(d,c.LGRAY);d.setLineWidth(0.2);d.rect(x,r.y,w,h2);'
  + '  var sy=r.y+h2/2-(ls.length*3.3)/2+1.5;'
  + '  ls.forEach(function(l,li){d.text(l,x+2,sy+li*3.3);});'
  + '  return h2;'
  + '}'
  + 'CLAUSULAS.forEach(function(cl){'
  + '  secTit(cl.titulo||"");'
  + '  if(!cl.texto)return;'
  + '  var lines=cl.texto.split("\\n").filter(function(l){return l.trim();});'
  // Si el texto tiene formato "Clave: Valor" → 2 columnas; si no → ancho completo
  + '  var is2col=lines.length>0&&lines[0].indexOf(":")>0&&lines[0].indexOf(":")<30;'
  + '  if(is2col){'
  + '    var COL=CW/2;'
  + '    for(var i=0;i<lines.length;i+=2){'
  + '      var p1=lines[i].split(":"),p2=(lines[i+1]||"").split(":");'
  + '      var k1=p1[0]||"",v1=p1.slice(1).join(":").trim();'
  + '      var k2=p2[0]||"",v2=p2.slice(1).join(":").trim();'
  + '      var h1a=fila(k1.trim(),ML,COL*0.45,true);'
  + '      r.y-=h1a;'
  + '      fila(v1,ML+COL*0.45,COL-COL*0.45,false);'
  + '      if(lines[i+1]){'
  + '        r.y-=h1a;'
  + '        fila(k2.trim(),ML+COL,COL*0.45,true);'
  + '        r.y-=h1a;'
  + '        fila(v2,ML+COL+COL*0.45,COL-COL*0.45,false);'
  + '      }'
  + '    }'
  + '  }else{'
  + '    lines.forEach(function(ln){'
  + '      var t=ln.trim();if(!t)return;'
  + '      fila(t,ML,CW,false);'
  + '    });'
  + '  }'
  + '});'
  + '}'
);

module.exports = { buildScreen, pdfJS };