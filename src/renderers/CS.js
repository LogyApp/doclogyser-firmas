'use strict';

const IMG_CUERPO_DEFAULT = '/assets/docs/CS/cuerpo_humano.jpg';

function _tablaDiagrama(dc) {
  const segmentos = dc.segmentos || [];
  let h = '<div style="border:1px solid #D8DCEA;border-top:none;border-radius:0 0 6px 6px;overflow:hidden">';
  h += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
  h += '<thead><tr style="background:#E8ECF8">';
  h += '<th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Segmento corporal</th>';
  h += '<th style="padding:7px 8px;text-align:center;width:120px;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Fractura / amputación</th>';
  h += '<th style="padding:7px 8px;text-align:center;width:150px;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Esguince o dolor (últ. 6 meses)</th>';
  h += '</tr></thead><tbody>';
  segmentos.forEach((s, i) => {
    const bg = i % 2 === 0 ? '#fff' : '#F4F6FB';
    h += '<tr style="background:' + bg + ';border-bottom:1px solid #EEF1F8">';
    h += '<td style="padding:6px 10px;font-size:11.5px;color:#0F1C3F;font-weight:500">' + s.label + '</td>';
    h += '<td style="padding:4px;text-align:center"><input type="checkbox" name="dc_' + s.id + '_fractura" style="width:15px;height:15px;accent-color:#1B2A5E;cursor:pointer"></td>';
    h += '<td style="padding:4px;text-align:center"><input type="checkbox" name="dc_' + s.id + '_esguince" style="width:15px;height:15px;accent-color:#F15A22;cursor:pointer"></td>';
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  return h;
}

// ── buildScreen ───────────────────────────────────────────────────────────────
function buildScreen(p) {
  let h = '';
  const dc = p.diagrama_corporal || null;
  const imgSrc = (dc && dc.imagen) || IMG_CUERPO_DEFAULT;

  // ── Bloque superior: intro izq | imagen cuerpo der ──
  if (p.intro) {
    h += '<table style="width:100%;border-collapse:collapse;border:1px solid #D8DCEA;margin-bottom:0">';
    h += '<tr>';
    h += '<td style="padding:12px 14px;vertical-align:top;font-size:11.5px;color:#5A6A8A;line-height:1.7">';
    h += p.intro;
    h += '</td>';
    h += '<td style="width:220px;min-width:220px;border-left:1px solid #D8DCEA;vertical-align:top;padding:10px;background:#FAFBFD">';
    h += '<div style="font-size:9px;font-weight:700;color:#1B2A5E;text-transform:uppercase;text-align:center;margin-bottom:6px;letter-spacing:.3px">' + ((dc && dc.instrucciones) || 'Marque el segmento corporal afectado') + '</div>';
    h += '<img src="' + imgSrc + '" alt="Cuerpo humano" style="width:200px;display:block;margin:0 auto;object-fit:contain">';
    h += '</td>';
    h += '</tr></table>';
  }

  // ── Checklist de segmentos corporales (equivalente digital de marcar con X) ──
  if (dc && dc.segmentos && dc.segmentos.length) {
    h += '<div style="background:#1B2A5E;color:#fff;padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:0">Marque el segmento corporal afectado</div>';
    h += _tablaDiagrama(dc);
  }

  // ── Secciones del formulario ──
  (p.secciones_formulario || []).forEach(sec => {
    h += '<div style="background:#1B2A5E;color:#fff;padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-radius:6px 6px 0 0;margin-top:14px">' + sec.titulo + '</div>';

    if (sec.tipo === 'datos_generales') {
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px;border:1px solid #D8DCEA;border-top:none;border-radius:0 0 6px 6px">';
      sec.campos.forEach(c => {
        const full = (c.tipo === 'opciones' || (c.tipo === 'text' && c.label.length > 25)) ? 'grid-column:1/-1;' : '';
        if (c.tipo === 'sino') {
          h += '<div style="' + full + '">';
          h += '<div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">' + c.label + '</div>';
          h += '<div style="display:flex;gap:14px">';
          h += '<label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="' + c.id + '" value="Si"> Sí</label>';
          h += '<label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="' + c.id + '" value="No"> No</label>';
          h += '</div></div>';
        } else if (c.tipo === 'opciones') {
          h += '<div style="' + full + '">';
          h += '<div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">' + c.label + '</div>';
          h += '<div style="display:flex;gap:10px;flex-wrap:wrap">';
          c.opciones.forEach(o => {
            h += '<label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="' + c.id + '" value="' + o + '"> ' + o + '</label>';
          });
          h += '</div></div>';
        } else {
          h += '<div style="' + full + '">';
          h += '<div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">' + c.label + '</div>';
          h += '<input type="' + (c.tipo || 'text') + '" name="' + c.id + '" id="' + c.id + '" style="width:100%;padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none" placeholder="' + c.label + '">';
          h += '</div>';
        }
      });
      h += '</div>';

    } else if (sec.tipo === 'preguntas_sino') {
      h += '<div style="border:1px solid #D8DCEA;border-top:none;border-radius:0 0 6px 6px;overflow:hidden">';
      h += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
      h += '<thead><tr style="background:#E8ECF8">';
      h += '<th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Descripción</th>';
      h += '<th style="padding:7px 8px;text-align:center;width:60px;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Sí/No</th>';
      h += '<th style="padding:7px 8px;text-align:center;width:90px;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Fecha evento</th>';
      h += '<th style="padding:7px 8px;text-align:center;width:60px;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">AT/T/C</th>';
      h += '<th style="padding:7px 8px;text-align:left;width:110px;font-size:10px;font-weight:700;color:#1B2A5E;border-bottom:1px solid #D8DCEA">Describa</th>';
      h += '</tr></thead><tbody>';

      sec.preguntas.forEach((pregunta, i) => {
        const bg = i % 2 === 0 ? '#fff' : '#F4F6FB';
        h += '<tr style="background:' + bg + ';border-bottom:1px solid #EEF1F8">';
        h += '<td style="padding:6px 10px;font-size:11px;color:#5A6A8A;line-height:1.5">' + pregunta.texto + '</td>';
        h += '<td style="padding:4px;text-align:center;vertical-align:middle">';
        h += '<div style="display:flex;flex-direction:column;gap:3px;align-items:center">';
        h += '<label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="' + pregunta.id + '_sn" value="Si" style="width:11px;height:11px"> Sí</label>';
        h += '<label style="font-size:10px;color:#5A6A8A;display:flex;align-items:center;gap:3px"><input type="radio" name="' + pregunta.id + '_sn" value="No" style="width:11px;height:11px"> No</label>';
        h += '</div></td>';
        h += '<td style="padding:4px;text-align:center"><input type="text" name="' + pregunta.id + '_fecha" style="width:80px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="dd/mm/aa"></td>';
        h += '<td style="padding:4px;text-align:center"><input type="text" name="' + pregunta.id + '_tipo" style="width:52px;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;text-align:center;outline:none" placeholder="AT/T/C"></td>';
        h += '<td style="padding:4px"><input type="text" name="' + pregunta.id + '_desc" style="width:100%;border:none;border-bottom:1px solid #D8DCEA;font-size:10px;padding:2px 4px;background:transparent;outline:none" placeholder="Describa..."></td>';
        h += '</tr>';
      });

      h += '</tbody></table></div>';
    }
  });

  // ── Declaración bajo juramento ──
  if (p.clausulas && p.clausulas.length) {
    h += '<div style="margin-top:16px;padding-top:14px;border-top:1px solid #D8DCEA;font-size:12px;color:#222;line-height:1.75;font-weight:600">';
    h += p.clausulas.map(cl => cl.texto || '').join(' ');
    h += '</div>';
  }

  return h;
}

// ── pdfJS ─────────────────────────────────────────────────────────────────────
const pdfJS = (
  'setTimeout(function(){'
  + 'if(typeof precargarImagen==="function"){'
  + 'var imgSrc=(PLANTILLA.diagrama_corporal&&PLANTILLA.diagrama_corporal.imagen)||' + JSON.stringify(IMG_CUERPO_DEFAULT) + ';'
  + 'precargarImagen(imgSrc,function(b64){window._cs_cuerpo=b64;});'
  + '}},200);'

  + 'function pdfCS(r,respuestas){'
  + 'var d=r.jdoc,c=PDF_CFG,CW=c.CW,ML=c.ML;'
  + 'var resp=respuestas||window.__CS_RESP__||{};'
  + 'r.y+=4;'

  // ── Bloque superior: intro izq | imagen cuerpo der ──
  + 'if(PLANTILLA.intro){'
  + '  var IMG_W=58;'
  + '  var TW=CW-IMG_W-0.5;'
  + '  var introL=d.splitTextToSize(PLANTILLA.intro,TW-4);'
  + '  var PAD=3;'
  + '  var introH=introL.length*3.6+PAD*2;'
  + '  var dc=PLANTILLA.diagrama_corporal||{};'
  + '  var leyenda=dc.instrucciones||"Marque el segmento corporal afectado";'
  + '  var leyL=d.splitTextToSize(leyenda,IMG_W-4);'
  + '  var leyH=leyL.length*3.2+4;'
  + '  if(introH<leyH+40)introH=leyH+40;'

  + '  r.check(introH+4);'
  + '  var y0=r.y;'
  + '  var IX=ML+TW+0.5;'

  + '  pdfFill(d,c.BG);d.rect(ML,y0,TW,introH,"F");'
  + '  pdfDraw(d,c.LGRAY);d.setLineWidth(0.25);d.rect(ML,y0,CW,introH);'
  + '  d.line(IX,y0,IX,y0+introH);'

  + '  pdfFont(d,7.5,"normal");pdfText(d,c.BLACK);'
  + '  introL.forEach(function(l,i){d.text(l,ML+2,y0+PAD+3.6+i*3.6);});'

  + '  pdfFont(d,6,"bold");pdfText(d,c.NAVY);'
  + '  leyL.forEach(function(l,i){d.text(l,IX+2,y0+3+3.2+i*3.2);});'

  + '  if(window._cs_cuerpo){'
  + '    var leyYEnd=y0+3+leyH;'
  + '    var imgAvail=introH-leyH-6;'
  + '    if(imgAvail>10){'
  + '      try{d.addImage(window._cs_cuerpo,"PNG",IX+2,leyYEnd+2,IMG_W-4,imgAvail);}catch(e){}'
  + '    }'
  + '  }'

  + '  r.y=y0+introH;'
  + '}'

  // ── Checklist de segmentos corporales ──
  + 'var dcSegs=(PLANTILLA.diagrama_corporal&&PLANTILLA.diagrama_corporal.segmentos)||[];'
  + 'if(dcSegs.length){'
  + '  var CN=CW-90,CF1=45,CF2=45;'
  + '  r.check(9);'
  + '  pdfFill(d,[232,236,248]);d.rect(ML,r.y,CW,7,"F");'
  + '  pdfDraw(d,c.LGRAY);d.setLineWidth(0.15);d.rect(ML,r.y,CW,7);'
  + '  pdfFont(d,6.5,"bold");pdfText(d,c.NAVY);'
  + '  d.text("Segmento corporal",ML+2,r.y+4.5);'
  + '  d.text("Fractura / amputación",ML+CN+CF1/2,r.y+4.5,{align:"center"});'
  + '  d.text("Esguince o dolor",ML+CN+CF1+CF2/2,r.y+4.5,{align:"center"});'
  + '  r.y+=7;'
  + '  dcSegs.forEach(function(s,i){'
  + '    var rowH=6.5;'
  + '    r.check(rowH+1);'
  + '    pdfFill(d,i%2===0?c.WHITE:c.BG);d.rect(ML,r.y,CW,rowH,"F");'
  + '    pdfDraw(d,c.LGRAY);d.setLineWidth(0.1);d.rect(ML,r.y,CW,rowH);'
  + '    pdfFont(d,7.5,"normal");pdfText(d,c.BLACK);'
  + '    d.text(s.label,ML+2,r.y+rowH/2+1.5);'
  + '    var xF1=ML+CN+CF1/2,xF2=ML+CN+CF1+CF2/2,cy=r.y+rowH/2;'
  + '    pdfDraw(d,c.DGRAY);d.setLineWidth(0.25);d.rect(xF1-2.2,cy-2.2,4.4,4.4);'
  + '    d.rect(xF2-2.2,cy-2.2,4.4,4.4);'
  + '    if(resp["dc_"+s.id+"_fractura"]){pdfFont(d,7,"bold");pdfText(d,c.NAVY);d.text("X",xF1,cy+1.4,{align:"center"});}'
  + '    if(resp["dc_"+s.id+"_esguince"]){pdfFont(d,7,"bold");pdfText(d,c.ORANGE);d.text("X",xF2,cy+1.4,{align:"center"});}'
  + '    r.y+=rowH;'
  + '  });'
  + '  r.y+=3;'
  + '}'

  // ── Secciones ──
  + 'var secs=PLANTILLA.secciones_formulario||[];'
  + 'secs.forEach(function(sec){'

  + '  r.check(12);'
  + '  pdfFill(d,c.NAVY);d.rect(ML,r.y,CW,7,"F");'
  + '  pdfFont(d,7.5,"bold");pdfText(d,c.WHITE);'
  + '  d.text(sec.titulo.toUpperCase(),ML+CW/2,r.y+4.8,{align:"center"});'
  + '  r.y+=7;'

  + '  if(sec.tipo==="datos_generales"){'
  + '    var campos=sec.campos||[];'
  + '    var colW=CW/2-3;'
  + '    for(var fi=0;fi<campos.length;fi+=2){'
  + '      r.check(9);'
  + '      var ca=campos[fi],cb=campos[fi+1];'
  + '      [ca,cb].forEach(function(campo,col){'
  + '        if(!campo)return;'
  + '        var ix=ML+col*(colW+6);'
  + '        var val=resp[campo.id]||resp[campo.id+"_sn"]||"";'
  + '        pdfFont(d,6,"bold");pdfText(d,c.DGRAY);'
  + '        d.text(campo.label.toUpperCase(),ix,r.y);'
  + '        pdfFont(d,8.5,"normal");pdfText(d,c.NAVY);'
  + '        d.text(String(val),ix,r.y+4);'
  + '        pdfDraw(d,c.LGRAY);d.setLineWidth(0.2);'
  + '        d.line(ix,r.y+5.5,ix+colW,r.y+5.5);'
  + '      });'
  + '      r.y+=9;'
  + '    }'
  + '    r.y+=2;'
  + '  }'

  + '  else if(sec.tipo==="preguntas_sino"){'
  + '    var preguntas=sec.preguntas||[];'
  + '    var CD=CW-54,CSN=14,CFEC=20,CATC=10,CDES=10;'

  + '    r.check(9);'
  + '    pdfFill(d,[225,230,245]);d.rect(ML,r.y,CW,7,"F");'
  + '    pdfDraw(d,c.LGRAY);d.setLineWidth(0.12);d.rect(ML,r.y,CW,7);'
  + '    pdfFont(d,6.5,"bold");pdfText(d,c.NAVY);'
  + '    d.text("Descripci\\u00F3n",ML+2,r.y+4.5);'
  + '    d.text("S\\u00ed/No",ML+CD+CSN/2,r.y+4.5,{align:"center"});'
  + '    d.text("Fecha",ML+CD+CSN+CFEC/2,r.y+4.5,{align:"center"});'
  + '    d.text("AT/T/C",ML+CD+CSN+CFEC+CATC/2,r.y+4.5,{align:"center"});'
  + '    d.text("Describa",ML+CD+CSN+CFEC+CATC+1,r.y+4.5);'
  + '    r.y+=7;'

  + '    preguntas.forEach(function(p,pi){'
  + '      var lns=d.splitTextToSize(p.texto,CD-4);'
  + '      var rowH=Math.max(8,lns.length*3.3+2.5);'
  + '      r.check(rowH+1);'
  + '      pdfFill(d,pi%2===0?c.WHITE:c.BG);d.rect(ML,r.y,CW,rowH,"F");'
  + '      pdfDraw(d,c.LGRAY);d.setLineWidth(0.1);d.rect(ML,r.y,CW,rowH);'
  + '      pdfFont(d,7,"normal");pdfText(d,c.BLACK);'
  + '      var sY=r.y+rowH/2-(lns.length*3.1)/2+1.5;'
  + '      lns.forEach(function(l,li){d.text(l,ML+2,sY+li*3.1);});'
  + '      var xc=ML+CD;'
  + '      pdfDraw(d,c.LGRAY);d.line(xc,r.y,xc,r.y+rowH);'
  + '      var snVal=resp[p.id+"_sn"]||"";'
  + '      pdfFont(d,7.5,"bold");'
  + '      if(snVal==="Si"){pdfText(d,[34,139,34]);d.text("S\\u00ed",xc+CSN/2,r.y+rowH/2+1.5,{align:"center"});}'
  + '      else if(snVal==="No"){pdfText(d,[180,40,40]);d.text("No",xc+CSN/2,r.y+rowH/2+1.5,{align:"center"});}'
  + '      xc+=CSN;'
  + '      pdfDraw(d,c.LGRAY);d.line(xc,r.y,xc,r.y+rowH);'
  + '      var fv=resp[p.id+"_fecha"]||"";'
  + '      if(fv){pdfFont(d,7,"normal");pdfText(d,c.DGRAY);d.text(fv,xc+1,r.y+rowH/2+1.5);}'
  + '      xc+=CFEC;'
  + '      pdfDraw(d,c.LGRAY);d.line(xc,r.y,xc,r.y+rowH);'
  + '      var av=resp[p.id+"_tipo"]||"";'
  + '      if(av){pdfFont(d,7,"normal");pdfText(d,c.DGRAY);d.text(av,xc+CATC/2,r.y+rowH/2+1.5,{align:"center"});}'
  + '      xc+=CATC;'
  + '      pdfDraw(d,c.LGRAY);d.line(xc,r.y,xc,r.y+rowH);'
  + '      var dv=resp[p.id+"_desc"]||"";'
  + '      if(dv){pdfFont(d,6.5,"normal");pdfText(d,c.DGRAY);var dl=d.splitTextToSize(dv,CDES+4);d.text(dl[0],xc+1,r.y+rowH/2+1.5);}'
  + '      r.y+=rowH;'
  + '    });'
  + '    r.y+=3;'
  + '  }'
  + '});'

  // ── Declaración bajo juramento ──
  + 'if(CLAUSULAS&&CLAUSULAS.length){'
  + '  r.y+=3;r.check(10);'
  + '  pdfDraw(d,c.LGRAY);d.setLineWidth(0.2);d.line(ML,r.y,ML+CW,r.y);'
  + '  r.y+=5;'
  + '  CLAUSULAS.forEach(function(cl){'
  + '    pdfFont(d,8.5,"bold");pdfText(d,c.BLACK);'
  + '    var dl=d.splitTextToSize(cl.texto||"",CW);'
  + '    dl.forEach(function(l){r.check(5);d.text(l,ML,r.y);r.y+=4.5;});'
  + '  });'
  + '}'
  + '}'

  // getRespuestas captura todo (radios, checkboxes y texto) y guarda en __CS_RESP__
  + 'function getRespuestas(){'
  + '  var r={};'
  + '  document.querySelectorAll("input,select,textarea").forEach(function(el){'
  + '    if(!el.name)return;'
  + '    if(el.type==="radio"){if(el.checked)r[el.name]=el.value;}'
  + '    else if(el.type==="checkbox"){r[el.name]=el.checked;}'
  + '    else r[el.name]=el.value;'
  + '  });'
  + '  window.__CS_RESP__=r;'
  + '  return r;'
  + '}'
);

module.exports = { buildScreen, pdfJS };
