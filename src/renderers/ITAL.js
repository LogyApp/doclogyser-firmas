// LOG&SER — Renderer: ITAL (paquete de formatos/políticas Italcol)
'use strict';
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function _resumenAcordeon(titulo, codigo, version) {
  let h = '<summary style="list-style:none;cursor:pointer;background:#1B2A5E;color:#fff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px">';
  h += '<span style="display:flex;align-items:center;gap:9px">';
  h += '<span class="ital-chev" style="display:inline-block;font-size:10px;transition:transform .18s ease">&#9654;</span>';
  h += '<span style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px">' + esc(titulo) + '</span>';
  h += '</span>';
  if (codigo) h += '<span style="font-size:9.5px;color:rgba(255,255,255,.7);white-space:nowrap">' + esc(codigo) + (version ? ' · V' + esc(version) : '') + '</span>';
  h += '</summary>';
  return h;
}

function _inputRow(id, label, ancho) {
  return '<div style="display:flex;flex-direction:column;' + (ancho || '') + '">'
    + '<div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">' + esc(label) + '</div>'
    + '<input type="text" name="' + esc(id) + '" style="padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none">'
    + '</div>';
}

function _radioGroup(name, opciones) {
  let h = '<div style="display:flex;gap:14px;flex-wrap:wrap">';
  opciones.forEach(o => {
    const val = typeof o === 'string' ? o : o.texto;
    h += '<label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:5px"><input type="radio" name="' + esc(name) + '" value="' + esc(val) + '"> ' + esc(val) + '</label>';
  });
  h += '</div>';
  return h;
}

function _quizHTML(sub) {
  let h = '<div style="padding:16px">';
  h += '<div style="font-size:11px;color:#5A6A8A;font-weight:600;margin-bottom:12px">Tema: ' + esc(sub.tema) + '</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">';
  (sub.campos_header || []).forEach(c => { h += _inputRow(c.id, c.label); });
  h += '</div>';

  sub.preguntas.forEach((p, i) => {
    h += '<div style="border-top:1px solid #EEF1F8;padding-top:12px;margin-top:12px">';
    h += '<div style="font-size:12px;font-weight:700;color:#0F1C3F;margin-bottom:6px">' + (i + 1) + '. ' + esc(p.instruccion || p.texto) + '</div>';

    if (p.tipo === 'vf_grupo') {
      p.items.forEach(it => {
        h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:8px 0;border-bottom:1px dashed #EEF1F8">';
        h += '<div style="font-size:11.5px;color:#5A6A8A;line-height:1.6;flex:1">' + esc(it.texto) + '</div>';
        h += '<div style="flex-shrink:0">' + _radioGroup(it.id, ['Falso', 'Verdadero']) + '</div>';
        h += '</div>';
      });
    } else if (p.tipo === 'seleccion') {
      if (p.texto && p.instruccion) h += '<div style="font-size:11.5px;color:#5A6A8A;margin-bottom:6px">' + esc(p.texto) + '</div>';
      h += '<div style="display:flex;flex-direction:column;gap:6px">';
      p.opciones.forEach(o => {
        h += '<label style="font-size:12px;color:#5A6A8A;display:flex;align-items:center;gap:6px"><input type="radio" name="' + esc(p.id) + '" value="' + esc(o.letra) + '"> <strong>' + esc(o.letra) + '.</strong> ' + esc(o.texto) + '</label>';
      });
      h += '</div>';
    } else if (p.tipo === 'relacionar') {
      h += '<div style="display:flex;flex-direction:column;gap:8px">';
      p.terminos.forEach(t => {
        h += '<div style="display:flex;align-items:center;gap:10px">';
        h += '<div style="width:170px;flex-shrink:0;font-size:12px;font-weight:600;color:#0F1C3F">' + esc(t.letra) + '. ' + esc(t.texto) + '</div>';
        h += '<select name="p3_' + esc(t.letra) + '" style="flex:1;padding:6px 8px;border:1px solid #B8C0D8;border-radius:6px;font-size:11.5px;font-family:inherit;outline:none"><option value="">Seleccione el concepto correspondiente...</option>';
        p.definiciones.forEach((d, di) => { h += '<option value="' + esc(d) + '">' + esc(d) + '</option>'; });
        h += '</select></div>';
      });
      h += '</div>';
    } else if (p.tipo === 'completar') {
      h += '<div style="display:flex;gap:10px;flex-wrap:wrap">';
      p.letras.forEach((letra, li) => {
        h += '<div style="display:flex;flex-direction:column;align-items:center;gap:3px">';
        h += '<div style="width:28px;height:28px;border-radius:5px;background:#1B2A5E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">' + esc(letra) + '</div>';
        h += '<input type="text" name="p5_' + li + '" style="width:140px;padding:6px 8px;border:1px solid #B8C0D8;border-radius:6px;font-size:11.5px;font-family:inherit;outline:none;text-align:center">';
        h += '</div>';
      });
      h += '</div>';
    } else if (p.tipo === 'abierta') {
      h += '<input type="text" name="' + esc(p.id) + '" style="width:100%;padding:7px 10px;border:1px solid #B8C0D8;border-radius:6px;font-size:12px;font-family:inherit;outline:none">';
    }
    h += '</div>';
  });

  if (sub.declaracion) {
    h += '<div style="margin-top:16px;padding-top:12px;border-top:1px solid #D8DCEA;font-size:11px;color:#5A6A8A;line-height:1.7;font-style:italic">' + esc(sub.declaracion) + '</div>';
  }
  h += '</div>';
  return h;
}

function _formularioHTML(sub) {
  let h = '<div style="padding:16px">';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 2fr;gap:10px;margin-bottom:16px">';
  h += _inputRow('e_dia', 'Día');
  h += _inputRow('e_mes', 'Mes');
  h += _inputRow('e_anio', 'Año');
  h += '<div style="display:flex;flex-direction:column">';
  h += '<div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">Planta</div>';
  h += _radioGroup('e_planta', sub.campos_planta);
  h += '</div></div>';

  sub.secciones.forEach(sec => {
    h += '<div style="background:#E8ECF8;padding:6px 10px;font-size:10px;font-weight:700;color:#1B2A5E;text-transform:uppercase;border-radius:4px;margin-bottom:10px">' + esc(sec.titulo) + '</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px">';
    sec.campos.forEach(c => {
      if (c.tipo === 'opciones') {
        h += '<div style="display:flex;flex-direction:column">';
        h += '<div style="font-size:10px;font-weight:600;color:#9AA5BF;text-transform:uppercase;margin-bottom:4px">' + esc(c.label) + '</div>';
        h += _radioGroup(c.id, c.opciones);
        h += '</div>';
      } else {
        h += _inputRow(c.id, c.label);
      }
    });
    h += '</div>';
  });

  if (sub.nota) h += '<div style="font-size:10.5px;color:#9AA5BF;line-height:1.6;border-top:1px solid #EEF1F8;padding-top:10px">' + esc(sub.nota) + '</div>';
  h += '</div>';
  return h;
}

function _politicaHTML(sub) {
  let h = '<div style="padding:16px">';
  (sub.parrafos || []).forEach(p => { h += '<div style="font-size:12px;color:#222;line-height:1.75;margin-bottom:10px">' + esc(p) + '</div>'; });
  if (sub.bullets && sub.bullets.length) {
    sub.bullets.forEach(b => {
      h += '<div style="display:flex;gap:8px;padding:3px 0 3px 8px;font-size:12px;color:#222;line-height:1.6">'
        + '<span style="flex-shrink:0">•</span><span>' + esc(b) + '</span></div>';
    });
  }
  (sub.parrafos_cierre || []).forEach(p => { h += '<div style="font-size:12px;color:#222;line-height:1.75;margin-top:10px">' + esc(p) + '</div>'; });
  if (sub.fecha_firma_politica || sub.firmante) {
    h += '<div style="margin-top:16px;padding-top:10px;border-top:1px solid #EEF1F8;font-size:10.5px;color:#9AA5BF">';
    if (sub.fecha_firma_politica) h += esc(sub.fecha_firma_politica) + ' — ';
    if (sub.firmante) h += esc(sub.firmante);
    h += '</div>';
  }
  h += '</div>';
  return h;
}

function buildScreen(p) {
  let h = '<style>';
  h += '.ital-acc summary{list-style:none}';
  h += '.ital-acc summary::-webkit-details-marker{display:none}';
  h += '.ital-acc summary::marker{content:""}';
  h += '.ital-acc[open]>summary .ital-chev{transform:rotate(90deg)}';
  h += '</style>';
  h += '<div style="font-size:11.5px;color:#5A6A8A;line-height:1.7;margin-bottom:10px">Este documento reúne los formatos y políticas de Italcol que debes diligenciar y conocer. Ábrelos uno a uno completando cada sección — al abrir uno se cierra el anterior. Al final firmas una sola vez y quedan registrados todos.</div>';
  (p.documentos || []).forEach((sub, i) => {
    h += '<details class="ital-acc" name="ital-secciones"' + (i === 0 ? ' open' : '') + ' style="margin-top:12px;border:1px solid #D8DCEA;border-radius:6px;overflow:hidden">';
    h += _resumenAcordeon(sub.titulo, sub.codigo, sub.version);
    if (sub.tipo === 'quiz') h += _quizHTML(sub);
    else if (sub.tipo === 'formulario') h += _formularioHTML(sub);
    else if (sub.tipo === 'politica') h += _politicaHTML(sub);
    h += '</details>';
  });
  return h;
}

// ── PDF: cada sub-documento se dibuja en su propio PdfDoc independiente ──
const pdfJS = (
  'function pdfITALQuiz(r,sub,resp){'
  + 'var d=r.jdoc,c=PDF_CFG,CW=c.CW,ML=c.ML;'
  + 'r.y+=4;'
  + 'pdfFont(d,7.5,"bold");pdfText(d,c.DGRAY);'
  + 'd.text("TEMA: "+(sub.tema||""),ML,r.y);r.y+=7;'
  + 'sub.preguntas.forEach(function(p,i){'
  + '  r.check(9);'
  + '  pdfFont(d,8.5,"bold");pdfText(d,c.NAVY);'
  + '  var enun=(i+1)+". "+(p.instruccion||p.texto||"");'
  + '  var el=d.splitTextToSize(enun,CW);'
  + '  el.forEach(function(l){r.check(4.5);d.text(l,ML,r.y);r.y+=4.5;});'
  + '  r.y+=1;'
  + '  if(p.tipo==="vf_grupo"){'
  + '    p.items.forEach(function(it){'
  + '      var lns=d.splitTextToSize(it.texto,CW-30);'
  + '      var h2=Math.max(6,lns.length*3.6+2);'
  + '      r.check(h2+1);'
  + '      pdfFont(d,7.5,"normal");pdfText(d,c.BLACK);'
  + '      lns.forEach(function(l,li){d.text(l,ML,r.y+li*3.6);});'
  + '      var val=resp[it.id]||"";'
  + '      pdfFont(d,7.5,"bold");'
  + '      pdfText(d,val==="Falso"?c.ORANGE:c.LGRAY);d.text((val==="Falso"?"[X] ":"[  ] ")+"Falso",ML+CW-58,r.y);'
  + '      pdfText(d,val==="Verdadero"?c.ORANGE:c.LGRAY);d.text((val==="Verdadero"?"[X] ":"[  ] ")+"Verdadero",ML+CW-28,r.y);'
  + '      r.y+=h2+2;'
  + '    });'
  + '  }else if(p.tipo==="seleccion"){'
  + '    if(p.texto&&p.instruccion){pdfFont(d,7.5,"normal");pdfText(d,c.BLACK);var tl2=d.splitTextToSize(p.texto,CW);tl2.forEach(function(l){r.check(4);d.text(l,ML,r.y);r.y+=4;});r.y+=1;}'
  + '    p.opciones.forEach(function(o){'
  + '      r.check(5);'
  + '      var sel=resp[p.id]===o.letra;'
  + '      pdfFont(d,7.5,sel?"bold":"normal");pdfText(d,sel?c.ORANGE:c.BLACK);'
  + '      var ol=d.splitTextToSize((sel?"[X] ":"[  ] ")+o.letra+". "+o.texto,CW-4);'
  + '      ol.forEach(function(l){r.check(4);d.text(l,ML+2,r.y);r.y+=4;});'
  + '    });'
  + '  }else if(p.tipo==="relacionar"){'
  + '    p.terminos.forEach(function(t){'
  + '      r.check(5);'
  + '      var val=resp["p3_"+t.letra]||"";'
  + '      pdfFont(d,7.5,"bold");pdfText(d,c.NAVY);'
  + '      d.text(t.letra+". "+t.texto+":",ML,r.y);'
  + '      pdfFont(d,7,"normal");pdfText(d,val?c.ORANGE:c.LGRAY);'
  + '      var vl=d.splitTextToSize(val||"(sin responder)",CW-70);'
  + '      d.text(vl[0]||"",ML+70,r.y);'
  + '      r.y+=5;'
  + '    });'
  + '  }else if(p.tipo==="completar"){'
  + '    var lineTxt=p.letras.map(function(letra,li){return letra+": "+(resp["p5_"+li]||"___");}).join("   ");'
  + '    pdfFont(d,7.5,"normal");pdfText(d,c.BLACK);'
  + '    var cl=d.splitTextToSize(lineTxt,CW);'
  + '    cl.forEach(function(l){r.check(4.5);d.text(l,ML,r.y);r.y+=4.5;});'
  + '  }else if(p.tipo==="abierta"){'
  + '    pdfFont(d,7.5,"normal");pdfText(d,resp[p.id]?c.BLACK:c.LGRAY);'
  + '    var al=d.splitTextToSize(resp[p.id]||"(sin responder)",CW);'
  + '    al.forEach(function(l){r.check(4.5);d.text(l,ML,r.y);r.y+=4.5;});'
  + '  }'
  + '  r.y+=3;'
  + '});'
  + 'if(sub.declaracion){r.y+=2;r.check(10);pdfFont(d,7.5,"italic");pdfText(d,c.DGRAY);var dl2=d.splitTextToSize(sub.declaracion,CW);dl2.forEach(function(l){r.check(4);d.text(l,ML,r.y);r.y+=4;});}'
  + '}'

  + 'function pdfITALFormulario(r,sub,resp){'
  + 'var d=r.jdoc,c=PDF_CFG,CW=c.CW,ML=c.ML,colW=CW/2-3;'
  + 'r.y+=4;'
  + 'pdfFont(d,7.5,"bold");pdfText(d,c.DGRAY);'
  + 'd.text("FECHA: "+(resp.e_dia||"__")+"/"+(resp.e_mes||"__")+"/"+(resp.e_anio||"____")+"    PLANTA: "+(resp.e_planta||"___________"),ML,r.y);'
  + 'r.y+=8;'
  + 'sub.secciones.forEach(function(sec){'
  + '  r.check(9);'
  + '  pdfFill(d,c.NAVY);d.rect(ML,r.y,CW,6.5,"F");'
  + '  pdfFont(d,7,"bold");pdfText(d,c.WHITE);'
  + '  d.text(sec.titulo.toUpperCase(),ML+CW/2,r.y+4.3,{align:"center"});'
  + '  r.y+=6.5+3;'
  + '  for(var fi=0;fi<sec.campos.length;fi+=2){'
  + '    r.check(9);'
  + '    var ca=sec.campos[fi],cb=sec.campos[fi+1];'
  + '    [ca,cb].forEach(function(campo,col){'
  + '      if(!campo)return;'
  + '      var ix=ML+col*(colW+6);'
  + '      var val=resp[campo.id]||"";'
  + '      pdfFont(d,6,"bold");pdfText(d,c.DGRAY);'
  + '      d.text(campo.label.toUpperCase(),ix,r.y);'
  + '      pdfFont(d,8.5,"normal");pdfText(d,c.NAVY);'
  + '      var vl=d.splitTextToSize(String(val),colW);'
  + '      d.text(vl[0]||"",ix,r.y+4);'
  + '      pdfDraw(d,c.LGRAY);d.setLineWidth(0.2);'
  + '      d.line(ix,r.y+5.5,ix+colW,r.y+5.5);'
  + '    });'
  + '    r.y+=9;'
  + '  }'
  + '  r.y+=2;'
  + '});'
  + 'if(sub.nota){pdfFont(d,6.5,"normal");pdfText(d,c.DGRAY);var nl=d.splitTextToSize(sub.nota,CW);nl.forEach(function(l){r.check(4);d.text(l,ML,r.y);r.y+=3.6;});}'
  + '}'

  + 'function pdfITALPolitica(r,sub){'
  + 'var d=r.jdoc,c=PDF_CFG;'
  + 'r.y+=4;'
  + '(sub.parrafos||[]).forEach(function(t){r.parrafo(t,{fs:8.5});});'
  + '(sub.bullets||[]).forEach(function(b){'
  + '  r.check(6);'
  + '  pdfFont(d,8.5,"normal");pdfText(d,PDF_CFG.BLACK);'
  + '  d.text("\\u2022",PDF_CFG.ML+2,r.y);'
  + '  var ls=d.splitTextToSize(b,PDF_CFG.CW-10);'
  + '  ls.forEach(function(l){r.check(4.5);d.text(l,PDF_CFG.ML+7,r.y);r.y+=4.5;});'
  + '  r.y+=1;'
  + '});'
  + '(sub.parrafos_cierre||[]).forEach(function(t){r.parrafo(t,{fs:8.5});});'
  + 'if(sub.fecha_firma_politica||sub.firmante){'
  + '  r.y+=3;r.check(6);'
  + '  pdfFont(d,7,"normal");pdfText(d,c.DGRAY);'
  + '  d.text(((sub.fecha_firma_politica||"")+" "+(sub.firmante?"\\u2014 "+sub.firmante:"")).trim(),PDF_CFG.ML,r.y);'
  + '}'
  + '}'

  + 'async function generarPDFsITAL(datosFirma,firmaCapturada,respuestas){'
  + 'var docs=PLANTILLA.documentos||[];'
  + 'var resultados=[];'
  + 'for(var i=0;i<docs.length;i++){'
  + '  var sub=docs[i];'
  + '  var r=new PdfDoc(window._logoBase64);'
  + '  var subPlantilla={nombre:sub.titulo,codigo:sub.codigo||PLANTILLA.codigo,version:sub.version||PLANTILLA.version,fecha_version:PLANTILLA.fecha_version||"",encabezado:{titulo_politica:sub.titulo,pagina:"1 de 1"}};'
  + '  r.init(subPlantilla);'
  + '  r.encabezado();'
  + '  if(sub.tipo==="quiz")pdfITALQuiz(r,sub,respuestas);'
  + '  else if(sub.tipo==="formulario")pdfITALFormulario(r,sub,respuestas);'
  + '  else if(sub.tipo==="politica")pdfITALPolitica(r,sub);'
  + '  r.bloqueFirema(datosFirma,firmaCapturada);'
  + '  r.numerarPaginas();'
  + '  resultados.push({sufijo:sub.sufijo,jdoc:r.jdoc});'
  + '}'
  + 'return resultados;'
  + '}'

  + 'function getRespuestas(){'
  + '  var r={};'
  + '  document.querySelectorAll("input,select,textarea").forEach(function(el){'
  + '    if(!el.name)return;'
  + '    if(el.type==="radio"){if(el.checked)r[el.name]=el.value;}'
  + '    else if(el.type==="checkbox"){r[el.name]=el.checked;}'
  + '    else r[el.name]=el.value;'
  + '  });'
  + '  return r;'
  + '}'
);

module.exports = { buildScreen, pdfJS };
