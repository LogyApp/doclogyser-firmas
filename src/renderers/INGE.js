// LOG&SER — Renderer: INGE (SST-FM-004)
'use strict';
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function buildScreen(p) {
  const secs = p.secciones_checklist || [];
  let h = '';
  // Tabla de encabezado datos
  h += '<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px">';
  h += '<tr><td style="border:1px solid #000;padding:4px 6px;font-weight:700">Tipo de capacitación:</td><td style="border:1px solid #000;padding:4px 6px" colspan="3">Inducción (Primera vez) SI ___ NO ___&nbsp;&nbsp;&nbsp;Reinducción SI ___ NO ___</td></tr>';
  h += '<tr><td style="border:1px solid #000;padding:4px 6px;font-weight:700">Cuidad y operación</td><td style="border:1px solid #000;padding:4px 6px"></td><td style="border:1px solid #000;padding:4px 6px;font-weight:700">Fecha de Capacitación</td><td style="border:1px solid #000;padding:4px 6px"></td></tr>';
  h += '<tr><td style="border:1px solid #000;padding:4px 6px;font-weight:700">Nombre y Apellidos</td><td style="border:1px solid #000;padding:4px 6px"></td><td style="border:1px solid #000;padding:4px 6px;font-weight:700">No. De Cédula</td><td style="border:1px solid #000;padding:4px 6px"></td></tr>';
  h += '<tr><td style="border:1px solid #000;padding:4px 6px;font-weight:700">Cargo</td><td style="border:1px solid #000;padding:4px 6px"></td><td style="border:1px solid #000;padding:4px 6px;font-weight:700">Fecha de ingreso</td><td style="border:1px solid #000;padding:4px 6px"></td></tr>';
  h += '</table>';
  h += '<div style="font-size:11px;color:#222;margin-bottom:10px">Marque con X, de acuerdo a información recibida en la presente Inducción.</div>';

  secs.forEach((sec, si) => {
    h += '<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:0">';
    // Encabezado sección
    h += '<tr style="background:#000"><td colspan="3" style="padding:4px 8px;color:#fff;font-weight:700;font-size:11px">' + esc(sec.numero + '. ' + sec.titulo) + '</td></tr>';
    h += '<tr style="background:#f0f0f0"><td style="border:1px solid #000;padding:3px 6px;font-weight:700">Tema</td><td style="border:1px solid #000;padding:3px 6px;text-align:center;width:30px;font-weight:700">SI</td><td style="border:1px solid #000;padding:3px 6px;text-align:center;width:30px;font-weight:700">NO</td></tr>';
    (sec.items || []).forEach((item, ii) => {
      const bg = ii % 2 === 0 ? '#fff' : '#F5F6FA';
      h += '<tr style="background:' + bg + '">';
      h += '<td style="border:1px solid #999;padding:3px 6px">' + esc(item.texto) + '</td>';
      h += '<td style="border:1px solid #999;text-align:center"><div style="width:14px;height:14px;border:1px solid #999;margin:2px auto"></div></td>';
      h += '<td style="border:1px solid #999;text-align:center"><div style="width:14px;height:14px;border:1px solid #999;margin:2px auto"></div></td>';
      h += '</tr>';
    });
    h += '</table>';
  });
  return h;
}

const pdfJS = (
  'function pdfINGE(r,df){'
  + 'var d=r.jdoc,c=PDF_CFG,CW=c.CW,ML=c.ML;'
  + 'r.y+=4;'
  // Tabla encabezado
  + 'var hrows=['
  + '["Tipo de capacitaci\\u00F3n:","Inducci\\u00F3n (Primera vez)","Reinducci\\u00F3n SI ___ NO ___"],'
  + '["Cuidad y operaci\\u00F3n:",df.municipio||"","Fecha de Capacitaci\\u00F3n: "],'
  + '["Nombre y Apellidos:",DATOS_COL.nombre_completo||df.nombres||"","No. De C\\u00E9dula: "+(DATOS_COL.identificacion||df.cedula||"")],'
  + '["Cargo:",DATOS_COL.cargo||df.cargo||"","Fecha de ingreso: "]'
  + '];'
  + 'var c2=CW/2-1;'
  + 'hrows.forEach(function(row){'
  + '  r.check(7);'
  + '  pdfDraw(d,c.BLACK);d.setLineWidth(0.2);d.rect(ML,r.y,CW,6);'
  + '  d.line(ML+c2,r.y,ML+c2,r.y+6);'
  + '  pdfFont(d,7,"bold");pdfText(d,c.BLACK);d.text(row[0],ML+1,r.y+4);'
  + '  pdfFont(d,7,"normal");d.text(row[1],ML+c2*0.45,r.y+4);'
  + '  pdfFont(d,7,"normal");d.text(row[2],ML+c2+2,r.y+4);'
  + '  r.y+=6;'
  + '});'
  + 'r.y+=4;'
  // Instrucción
  + 'pdfFont(d,7.5,"normal");pdfText(d,c.BLACK);'
  + 'd.text("Marque con X, de acuerdo a informaci\\u00F3n recibida en la presente Inducci\\u00F3n.",ML,r.y);'
  + 'r.y+=6;'
  // Secciones checklist
  + 'var secs=PLANTILLA.secciones_checklist||[];'
  + 'secs.forEach(function(sec){'
  + '  r.check(14);'
  + '  r.bandaTitulo(sec.numero+". "+sec.titulo);'
  + '  r.tablaChecklist(sec.items,RESPUESTAS||{});'
  + '});'
  + '}'
);

module.exports = { buildScreen, pdfJS };