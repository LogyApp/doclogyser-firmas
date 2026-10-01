// LOG&SER — Renderer: EVIN (SST-FM-003)
'use strict';
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function buildScreen(p) {
  const secs = p.secciones_evaluacion || [];
  let h = '';

  secs.forEach(sec => {
    if (sec.tipo === 'calificacion_temas') {
      h += '<div style="margin-bottom:12px">';
      if (sec.titulo) h += '<div style="font-size:11px;font-weight:700;color:#1B2A5E;margin-bottom:4px">' + esc(sec.titulo) + '</div>';
      if (sec.instrucciones) h += '<div style="font-size:10.5px;color:#555;margin-bottom:6px;font-style:italic">' + esc(sec.instrucciones) + '</div>';
      // Tabla de temas con criterios
      h += '<table style="width:100%;border-collapse:collapse;font-size:10.5px">';
      h += '<thead><tr style="background:#1B2A5E"><th style="padding:4px 6px;color:#fff;text-align:left;border:1px solid #C8D0E4">Tema</th>';
      (sec.criterios || []).forEach(cr => {
        h += '<th style="padding:4px 6px;color:#fff;text-align:center;border:1px solid #C8D0E4;width:32px">' + esc(cr) + '</th>';
      });
      h += '</tr></thead><tbody>';
      (sec.temas || []).forEach((tema, ti) => {
        h += '<tr style="background:' + (ti % 2 === 0 ? '#fff' : '#F5F6FA') + '">';
        h += '<td style="padding:4px 6px;border:1px solid #C8D0E4">' + esc(tema) + '</td>';
        (sec.criterios || []).forEach(cr => {
          h += '<td style="border:1px solid #C8D0E4;text-align:center"><div style="width:18px;height:18px;border:1px solid #C8D0E4;margin:2px auto"></div></td>';
        });
        h += '</tr>';
      });
      h += '</tbody></table></div>';
    }

    if (sec.tipo === 'preguntas_vf') {
      h += '<div style="margin-bottom:12px">';
      if (sec.titulo) h += '<div style="font-size:11px;font-weight:700;color:#1B2A5E;margin-bottom:6px">' + esc(sec.titulo) + '</div>';
      // Dos columnas V/F
      const pregs = sec.preguntas || [];
      h += '<table style="width:100%;border-collapse:collapse;font-size:10px">';
      h += '<thead><tr style="background:#1B2A5E">'
        + '<th colspan="3" style="padding:4px;color:#fff;border:1px solid #C8D0E4;text-align:center">Columna A</th>'
        + '<th colspan="3" style="padding:4px;color:#fff;border:1px solid #C8D0E4;text-align:center">Columna B</th>'
        + '</tr>'
        + '<tr style="background:#EEF1F8">'
        + '<th style="padding:3px 6px;border:1px solid #C8D0E4;text-align:left">Enunciado</th><th style="border:1px solid #C8D0E4;width:24px;text-align:center">V</th><th style="border:1px solid #C8D0E4;width:24px;text-align:center">F</th>'
        + '<th style="padding:3px 6px;border:1px solid #C8D0E4;text-align:left">Enunciado</th><th style="border:1px solid #C8D0E4;width:24px;text-align:center">V</th><th style="border:1px solid #C8D0E4;width:24px;text-align:center">F</th>'
        + '</tr></thead><tbody>';
      for (let i = 0; i < pregs.length; i += 2) {
        const pa = pregs[i], pb = pregs[i + 1];
        const bg = (i / 2) % 2 === 0 ? '#fff' : '#F5F6FA';
        h += '<tr style="background:' + bg + '">';
        h += '<td style="padding:4px 6px;border:1px solid #C8D0E4">' + esc(pa?.texto || '') + '</td>';
        h += '<td style="border:1px solid #C8D0E4;text-align:center"><div style="width:16px;height:16px;border:1px solid #C8D0E4;border-radius:50%;margin:2px auto"></div></td>';
        h += '<td style="border:1px solid #C8D0E4;text-align:center"><div style="width:16px;height:16px;border:1px solid #C8D0E4;border-radius:50%;margin:2px auto"></div></td>';
        h += '<td style="padding:4px 6px;border:1px solid #C8D0E4">' + esc(pb?.texto || '') + '</td>';
        h += '<td style="border:1px solid #C8D0E4;text-align:center"><div style="width:16px;height:16px;border:1px solid #C8D0E4;border-radius:50%;margin:2px auto"></div></td>';
        h += '<td style="border:1px solid #C8D0E4;text-align:center"><div style="width:16px;height:16px;border:1px solid #C8D0E4;border-radius:50%;margin:2px auto"></div></td>';
        h += '</tr>';
      }
      h += '</tbody></table></div>';
    }
  });
  return h;
}

const pdfJS = (
  'function pdfEVIN(r,df){'
  + 'var d=r.jdoc,c=PDF_CFG,CW=c.CW,ML=c.ML;'
  + 'r.y+=4;'
  // Tabla datos encabezado
  + 'var flds=[["NOMBRE:",DATOS_COL.nombre_completo||df.nombres||"","DOCUMENTO:",DATOS_COL.identificacion||df.cedula||""],["CARGO:",DATOS_COL.cargo||df.cargo||"","CIUDAD:",df.municipio||""],["","","OPERACI\\u00D3N:",DATOS_COL.operacion||df.operacion||""]];'
  + 'flds.forEach(function(row){'
  + '  r.check(7);'
  + '  pdfFont(d,7,"bold");pdfText(d,c.BLACK);d.text(row[0],ML,r.y);'
  + '  pdfFont(d,7,"normal");d.text(row[1],ML+20,r.y);'
  + '  pdfDraw(d,c.BLACK);d.setLineWidth(0.2);d.line(ML+20,r.y+1,ML+CW/2-2,r.y+1);'
  + '  if(row[2]){'
  + '    pdfFont(d,7,"bold");d.text(row[2],ML+CW/2,r.y);'
  + '    pdfFont(d,7,"normal");d.text(row[3],ML+CW/2+20,r.y);'
  + '    d.line(ML+CW/2+20,r.y+1,ML+CW,r.y+1);'
  + '  }'
  + '  r.y+=6;'
  + '});'
  + 'r.y+=3;'
  // Secciones
  + 'var secs=PLANTILLA.secciones_evaluacion||[];'
  + 'secs.forEach(function(sec){'
  + '  if(sec.tipo==="calificacion_temas"){'
  + '    r.check(14);'
  + '    if(sec.titulo){pdfFont(d,7.5,"bold");pdfText(d,c.BLACK);d.text(sec.titulo,ML,r.y);r.y+=4;}'
  + '    if(sec.instrucciones){pdfFont(d,7,"normal");pdfText(d,c.BLACK);var il=d.splitTextToSize(sec.instrucciones,CW);il.forEach(function(l){r.check(4);d.text(l,ML,r.y);r.y+=3.5;});r.y+=2;}'
  + '    r.tablaCalificacion(sec.temas,sec.criterios,RESPUESTAS||{});'
  + '  }'
  + '  if(sec.tipo==="preguntas_vf"){'
  + '    r.check(14);'
  + '    if(sec.titulo){pdfFont(d,7.5,"bold");pdfText(d,c.BLACK);d.text(sec.titulo,ML,r.y);r.y+=5;}'
  + '    r.tablaVF(sec.preguntas,RESPUESTAS||{});'
  + '  }'
  + '});'
  + '}'
);

module.exports = { buildScreen, pdfJS };