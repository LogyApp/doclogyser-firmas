// LOG&SER — Renderer: ARO (SST-FM-054)
// Estructura fiel al original: 3 columnas, recuadros, ❖ bullets
'use strict';

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ── buildScreen ───────────────────────────────────────────────────────────────
function buildScreen(p) {
  const cls = p.clausulas || [];
  function get(kw) { return cls.find(x => x.titulo && x.titulo.toLowerCase().includes(kw)) || null; }

  // Bullets con ❖ tal como el original
  function bl(texto, fs) {
    if (!texto) return '<div style="height:4px"></div>';
    fs = fs || '11px';
    let html = '';
    texto.split('\n').forEach(ln => {
      const t = ln.trim().replace(/^[-•❖✦\*]\s*/, '');
      if (!t) return;
      html += '<div style="display:flex;gap:4px;padding:1px 0;font-size:' + fs + ';color:#222;line-height:1.5">'
        + '<span style="color:#333;flex-shrink:0;font-size:10px;margin-top:1px">❖</span>'
        + '<span>' + esc(t) + '</span></div>';
    });
    return html || '<div style="height:4px"></div>';
  }

  // Texto corrido con guiones (pasos, nota, auxiliar)
  function texto(t, fs) {
    if (!t) return '';
    fs = fs || '10.5px';
    return t.split('\n').map(ln => {
      const s = ln.trim();
      if (!s) return '';
      return '<div style="font-size:' + fs + ';color:#222;line-height:1.55;padding:1px 0">' + esc(s) + '</div>';
    }).join('');
  }

  // Título de sección (sin fondo, solo texto bold subrayado como en el original)
  function titSeccion(t) {
    return '<div style="font-size:10px;font-weight:700;color:#000;text-transform:uppercase;border-bottom:1px solid #000;padding-bottom:2px;margin-bottom:4px">' + esc(t) + '</div>';
  }

  const clEpp = get('protecci');
  const clRisk = get('riesgo');
  const clEquip = get('equipo');
  const clPasos = get('pasos');
  const clNota = get('nota');
  const clAux = get('auxiliar');
  const clDesv = get('desviac');
  const clPlan = get('plan');

  // Marco exterior como en el original
  let h = '<div style="border:1.5px solid #000;font-family:Arial,sans-serif">';

  // ── FILA 1: Encabezado con título doc + área ──────────────────────────────
  h += '<div style="display:grid;grid-template-columns:1fr auto;border-bottom:1px solid #000">';
  // Título + área
  h += '<div style="padding:6px 10px;border-right:1px solid #000">';
  h += '<div style="font-size:10.5px;font-weight:700;color:#000;text-align:center">ANALISIS DE RIESGO POR OFICIO</div>';
  h += '<div style="font-size:13px;font-weight:700;color:#000;text-align:center;margin-top:2px">DESCARGUE Y CARGUE DE MERCANCÍA</div>';
  h += '<div style="font-size:10px;color:#000;text-align:center;margin-top:1px">ÁREA: Bodegas y Muelle de carga</div>';
  h += '</div>';
  // Código/versión/fecha (col derecha pequeña)
  h += '<div style="width:120px;font-size:8.5px;color:#000">';
  h += '<div style="border-bottom:1px solid #000;padding:3px 6px"><strong>CODIGO:</strong> SST-FM 054</div>';
  h += '<div style="border-bottom:1px solid #000;padding:3px 6px"><strong>VERSION: 04</strong></div>';
  h += '<div style="padding:3px 6px"><strong>FECHA:</strong> 12/01/2026</div>';
  h += '</div>';
  h += '</div>'; // fin fila 1

  // ── FILA 2: EPP (izq) | Factores de Riesgo + Equipos (der) ─────────────
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #000">';

  // Col izq — EPP
  h += '<div style="padding:8px 10px;border-right:1px solid #000">';
  if (clEpp) { h += titSeccion(clEpp.titulo); h += bl(clEpp.texto); }
  h += '</div>';

  // Col der — Riesgo arriba + Equipos abajo
  h += '<div style="padding:0">';
  // Riesgo
  if (clRisk) {
    h += '<div style="padding:8px 10px;border-bottom:1px solid #000">';
    h += titSeccion(clRisk.titulo);
    h += bl(clRisk.texto);
    h += '</div>';
  }
  // Equipos
  if (clEquip) {
    h += '<div style="padding:8px 10px">';
    h += titSeccion(clEquip.titulo);
    h += bl(clEquip.texto);
    h += '</div>';
  }
  h += '</div>';

  h += '</div>'; // fin fila 2

  // ── FILA 3: Pasos Básicos — ancho completo ────────────────────────────────
  if (clPasos) {
    h += '<div style="padding:8px 10px;border-bottom:1px solid #000">';
    h += titSeccion(clPasos.titulo);
    h += texto(clPasos.texto);
    h += '</div>';
  }

  // ── FILA 4: Nota + Auxiliar — ancho completo ─────────────────────────────
  if (clNota) {
    h += '<div style="padding:8px 10px;border-bottom:1px solid #000">';
    h += '<span style="font-size:10.5px;font-weight:700;color:#000">Nota: </span>';
    h += texto((clNota.texto || '').replace(/^nota[:\s]*/i, ''));
    h += '</div>';
  }
  if (clAux) {
    h += '<div style="padding:8px 10px;border-bottom:1px solid #000">';
    h += texto(clAux.titulo ? clAux.titulo + '\n' + (clAux.texto || '') : clAux.texto);
    h += '</div>';
  }

  // ── FILA 5: Desviaciones (izq) | Reporte Herramientas (centro) | Firma (der) ─
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #000">';

  // Desviaciones izq
  h += '<div style="padding:8px 10px;border-right:1px solid #000">';
  if (clDesv) { h += titSeccion(clDesv.titulo); h += bl(clDesv.texto); }
  h += '</div>';

  // Reporte Herramientas der
  h += '<div style="padding:0">';
  // Encabezado tabla — título centrado (sin logo por indicación del usuario)
  h += '<div style="padding:5px 8px;border-bottom:1px solid #000;text-align:center">';
  h += '<div style="font-size:10px;font-weight:700;color:#000;text-transform:uppercase">REPORTE DE HERRAMIENTAS, EQUIPOS Y ÁREAS.</div>';
  h += '</div>';
  // Tabla
  h += '<table style="width:100%;border-collapse:collapse;font-size:8.5px">';
  h += '<thead><tr>';
  ['Fecha', 'Descripción de la falla que se presenta', 'Elemento', 'Nombre de quien reporta', 'Nombre de quien recibe el reporte'].forEach(col => {
    h += '<th style="border:1px solid #666;padding:3px 4px;font-weight:700;color:#000;text-align:center;background:#f5f5f5">' + col + '</th>';
  });
  h += '</tr></thead><tbody>';
  for (let i = 0; i < 3; i++) {
    h += '<tr><td style="border:1px solid #666;height:20px;padding:2px">&nbsp;</td>'
      + '<td style="border:1px solid #666;padding:2px">&nbsp;</td>'
      + '<td style="border:1px solid #666;padding:2px">&nbsp;</td>'
      + '<td style="border:1px solid #666;padding:2px">&nbsp;</td>'
      + '<td style="border:1px solid #666;padding:2px">&nbsp;</td></tr>';
  }
  h += '</tbody></table>';
  // Nota y tarjeta
  h += '<div style="padding:5px 8px;font-size:8px;color:#000;border-top:1px solid #000">'
    + '<strong>Nota:</strong> Por favor tenga en cuenta que los colaboradores de Apoyo logístico no están autorizados '
    + 'para realizar mantenimiento o manipulación de los elementos que se encuentran en mal estado o presentan fallas en su operación.'
    + '</div>';
  h += '<div style="padding:4px 8px;font-size:8px;color:#555;border-top:1px solid #ccc">Tarjeta de Reporte de actos o condiciones inseguras</div>';
  h += '</div>';

  h += '</div>'; // fin fila 5

  // ── FILA 6: Plan de Acción — ancho completo ───────────────────────────────
  if (clPlan) {
    h += '<div style="padding:8px 10px">';
    h += titSeccion(clPlan.titulo);
    h += bl(clPlan.texto);
    h += '</div>';
  }

  // Cláusulas sobrantes
  const usadas = new Set([clEpp, clRisk, clEquip, clPasos, clNota, clAux, clDesv, clPlan].filter(Boolean).map(c => c.numero));
  cls.filter(c => !usadas.has(c.numero)).forEach(cl => {
    h += '<div style="padding:8px 10px;border-top:1px solid #ccc">';
    h += titSeccion(cl.titulo || ('Sección ' + cl.numero));
    h += bl(cl.texto);
    h += '</div>';
  });

  h += '</div>'; // marco exterior
  return h;
}

// ── pdfJS ─────────────────────────────────────────────────────────────────────
const pdfJS = (
  'function pdfARO(r){'
  + 'var d=r.jdoc,c=PDF_CFG,CW=c.CW,ML=c.ML;'
  + 'r.y+=4;'

  // helper: título de sección subrayado (igual al original)
  + 'function titSec(titulo,x,w){'
  + '  r.check(8);'
  + '  pdfFont(d,7.5,"bold");pdfText(d,c.BLACK);'
  + '  d.text(titulo.toUpperCase(),x,r.y);'
  + '  r.y+=1;'
  + '  pdfDraw(d,c.BLACK);d.setLineWidth(0.3);'
  + '  d.line(x,r.y,x+w,r.y);'
  + '  r.y+=3;'
  + '}'

  // helper: bullets ❖
  + 'function bul(texto,x,w){'
  + '  var lns=(texto||"").split("\\n");'
  + '  lns.forEach(function(ln){'
  + '    var t=ln.trim().replace(/^[-\\u2022\u2022\\*]\\s*/,"");'
  + '    if(!t)return;'
  + '    r.check(5);'
  + '    pdfFont(d,7,"normal");pdfText(d,c.BLACK);'
  + '    d.text("\u2022",x+1,r.y);'
  + '    var ls=d.splitTextToSize(t,w-7);'
  + '    ls.forEach(function(l){r.check(4);d.text(l,x+6,r.y);r.y+=3.5;});'
  + '    r.y+=0.8;'
  + '  });'
  + '  r.y+=1;'
  + '}'

  // helper: texto corrido
  + 'function txt(texto,x,w,fs){'
  + '  if(!texto)return;'
  + '  fs=fs||7;'
  + '  var lns=(texto||"").split("\\n");'
  + '  lns.forEach(function(ln){'
  + '    var t=ln.trim();if(!t)return;'
  + '    pdfFont(d,fs,"normal");pdfText(d,c.BLACK);'
  + '    var ls=d.splitTextToSize(t,w);'
  + '    ls.forEach(function(l){r.check(4);d.text(l,x,r.y);r.y+=fs*0.42;});'
  + '    r.y+=1;'
  + '  });'
  + '}'

  + 'function getCL(kw){'
  + '  return CLAUSULAS.find(function(c){return c.titulo&&c.titulo.toLowerCase().indexOf(kw)>=0;})||null;'
  + '}'

  + 'var clEpp=getCL("protecci");'
  + 'var clRisk=getCL("riesgo");'
  + 'var clEquip=getCL("equipo");'
  + 'var clPasos=getCL("pasos");'
  + 'var clNota=getCL("nota");'
  + 'var clAux=getCL("auxiliar");'
  + 'var clDesv=getCL("desviac");'
  + 'var clPlan=getCL("plan");'

  // Marco exterior
  + 'pdfDraw(d,c.BLACK);d.setLineWidth(0.5);'
  + 'var BOXSTART=r.y;'

  // ── Encabezado: título + área + código/versión ──
  + 'r.check(18);'
  + 'pdfFont(d,8.5,"bold");pdfText(d,c.BLACK);'
  + 'd.text("ANALISIS DE RIESGO POR OFICIO",ML+CW/2,r.y+5,{align:"center"});'
  + 'pdfFont(d,10,"bold");'
  + 'd.text("DESCARGUE Y CARGUE DE MERCANC\\u00CDA",ML+CW/2,r.y+10,{align:"center"});'
  + 'pdfFont(d,7.5,"normal");'
  + 'd.text("\\u00C1REA: Bodegas y Muelle de carga",ML+CW/2,r.y+15,{align:"center"});'
  // Código/versión col der
  + 'var cxMeta=ML+CW-35;'
  + 'pdfFont(d,6.5,"normal");pdfText(d,c.BLACK);'
  + 'd.text("CODIGO: SST-FM 054",cxMeta,r.y+4);'
  + 'd.text("VERSION: 04",cxMeta,r.y+9);'
  + 'd.text("FECHA: 12/01/2026",cxMeta,r.y+14);'
  + 'pdfDraw(d,c.BLACK);d.setLineWidth(0.3);'
  + 'd.line(cxMeta-2,r.y,cxMeta-2,r.y+17);'
  + 'r.y+=17;'
  + 'd.line(ML,r.y,ML+CW,r.y);'
  + 'r.y+=4;'

  // ── EPP izq | Riesgo+Equipos der ──
  + 'var COL=CW/2-1,xL=ML+1,xR=ML+COL+3;'
  + 'var yTop=r.y;'

  // EPP izq
  + 'if(clEpp){titSec(clEpp.titulo,xL,COL-2);bul(clEpp.texto,xL,COL-2);}'
  + 'var yL=r.y;'

  // Riesgo + Equipos der
  + 'r.y=yTop;'
  + 'if(clRisk){titSec(clRisk.titulo,xR,COL-2);bul(clRisk.texto,xR,COL-2);}'
  + 'if(clEquip){r.y+=2;titSec(clEquip.titulo,xR,COL-2);bul(clEquip.texto,xR,COL-2);}'
  + 'var yR=r.y;'

  // Divisor vertical entre columnas
  + 'pdfDraw(d,c.BLACK);d.setLineWidth(0.3);'
  + 'd.line(ML+COL+2,yTop-2,ML+COL+2,Math.max(yL,yR)+1);'

  + 'r.y=Math.max(yL,yR)+2;'
  + 'd.line(ML,r.y,ML+CW,r.y);r.y+=4;'

  // ── Pasos Básicos ──
  + 'if(clPasos){titSec(clPasos.titulo,ML+1,CW-2);txt(clPasos.texto,ML+1,CW-2,7);}'
  + 'r.y+=1;d.line(ML,r.y,ML+CW,r.y);r.y+=4;'

  // ── Nota ──
  + 'if(clNota){'
  + '  pdfFont(d,7,"bold");pdfText(d,c.BLACK);d.text("Nota:",ML+1,r.y);'
  + '  r.y+=0.5;'
  + '  txt((clNota.texto||"").replace(/^nota[:\\s]*/i,""),ML+1,CW-2,7);'
  + '  r.y+=1;pdfDraw(d,c.BLACK);d.setLineWidth(0.3);d.line(ML,r.y,ML+CW,r.y);r.y+=4;'
  + '}'

  // ── Auxiliar ──
  + 'if(clAux){'
  + '  txt(clAux.titulo,ML+1,CW-2,7);'
  + '  txt(clAux.texto,ML+1,CW-2,7);'
  + '  r.y+=1;pdfDraw(d,c.BLACK);d.setLineWidth(0.3);d.line(ML,r.y,ML+CW,r.y);r.y+=4;'
  + '}'

  // ── Desviaciones izq | Reporte Herramientas der ──
  + 'var yTop2=r.y;'
  + 'var COL2=CW/2-1,xL2=ML+1,xR2=ML+COL2+3;'

  // Desviaciones
  + 'if(clDesv){titSec(clDesv.titulo,xL2,COL2-2);bul(clDesv.texto,xL2,COL2-2);}'
  + 'var yD=r.y;'

  // Reporte Herramientas
  + 'r.y=yTop2;'
  + 'r.check(12);'
  // Título centrado (sin logo)
  + 'pdfFont(d,7,"bold");pdfText(d,c.BLACK);'
  + 'd.text("REPORTE DE HERRAMIENTAS, EQUIPOS Y \\u00C1REAS.",xR2+(COL2-2)/2,r.y+4,{align:"center"});'
  + 'r.y+=7;'
  // Cabecera tabla 4 cols
  + 'var tcols=["Fecha","Descripci\\u00F3n de la falla","Elemento","Nombre\\nreporta","Nombre\\nrecibe"];'
  + 'var tcw=[14,COL2-72,16,21,21];'
  + 'var hxT=xR2;'
  + 'pdfFill(d,[245,245,245]);d.rect(xR2,r.y,COL2-2,9,"F");'
  + 'tcols.forEach(function(col,i){'
  + '  pdfDraw(d,c.BLACK);d.setLineWidth(0.2);d.rect(hxT,r.y,tcw[i],9);'
  + '  pdfFont(d,5,"bold");pdfText(d,c.BLACK);'
  + '  var colLines=col.split("\\n");'
  + '  var cy2=r.y+2.5+(9-(colLines.length*2.5))/2;'
  + '  colLines.forEach(function(l,li){d.text(l,hxT+tcw[i]/2,cy2+li*2.5,{align:"center"});});'
  + '  hxT+=tcw[i];'
  + '});'
  + 'r.y+=9;'
  // 3 filas vacías
  + 'for(var ri=0;ri<3;ri++){'
  + '  var rxT=xR2;'
  + '  tcw.forEach(function(w){'
  + '    pdfDraw(d,c.BLACK);d.setLineWidth(0.2);d.rect(rxT,r.y,w,9);'
  + '    rxT+=w;'
  + '  });'
  + '  r.y+=9;'
  + '}'
  // Nota reporte
  + 'r.check(8);'
  + 'pdfFont(d,5.5,"normal");pdfText(d,c.BLACK);'
  + 'var ntxt="Nota: Por favor tenga en cuenta que los colaboradores de Apoyo log\\u00EDstico no est\\u00E1n autorizados para realizar mantenimiento o manipulaci\\u00F3n de los elementos que se encuentran en mal estado o presentan fallas.";'
  + 'var ntl=d.splitTextToSize(ntxt,COL2-4);'
  + 'ntl.forEach(function(l){r.check(3);d.text(l,xR2+1,r.y);r.y+=2.8;});'
  + 'r.y+=2;'
  + 'pdfFont(d,5.5,"italic");pdfText(d,c.DGRAY);'
  + 'd.text("Tarjeta de Reporte de actos o condiciones inseguras",xR2+1,r.y);'
  + 'r.y+=4;'

  // Línea divisor vertical Desv|Reporte
  + 'pdfDraw(d,c.BLACK);d.setLineWidth(0.3);'
  + 'd.line(ML+COL2+2,yTop2-2,ML+COL2+2,Math.max(yD,r.y)+1);'
  + 'r.y=Math.max(yD,r.y)+2;'
  + 'd.line(ML,r.y,ML+CW,r.y);r.y+=4;'

  // ── Plan de Acción ──
  + 'if(clPlan){titSec(clPlan.titulo,ML+1,CW-2);bul(clPlan.texto,ML+1,CW-2);}'

  // Cláusulas sobrantes
  + 'var usadas=[];'
  + '[clEpp,clRisk,clEquip,clPasos,clNota,clAux,clDesv,clPlan].forEach(function(c){if(c)usadas.push(c.numero);});'
  + 'CLAUSULAS.filter(function(c){return usadas.indexOf(c.numero)<0;}).forEach(function(cl){'
  + '  r.y+=2;pdfDraw(d,c.BLACK);d.setLineWidth(0.3);d.line(ML,r.y,ML+CW,r.y);r.y+=4;'
  + '  titSec(cl.titulo||"Secci\\u00F3n "+cl.numero,ML+1,CW-2);'
  + '  bul(cl.texto,ML+1,CW-2);'
  + '});'

  // Marco exterior
  + 'pdfDraw(d,c.BLACK);d.setLineWidth(0.5);'
  + 'd.rect(ML,BOXSTART,CW,r.y-BOXSTART+2);'

  + '}'
);

module.exports = { buildScreen, pdfJS };