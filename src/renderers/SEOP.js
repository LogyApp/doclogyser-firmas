'use strict';

const IMG_BODEGA = '/assets/docs/SEOP/bodega.jpg';
const IMG_ROMPECABEZA = '/assets/docs/SEOP/rompecabezas.jpg';

function buildScreen(p) {
  let h = '';

  h += '<table style="width:100%;border-collapse:collapse;border:1px solid #D8DCEA;margin-bottom:12px">';
  h += '<tr>';
  h += '<td style="width:42%;border-right:1px solid #D8DCEA;vertical-align:top;padding:0">';
  h += '<img src="' + IMG_BODEGA + '" alt="Operacion" style="width:100%;height:220px;object-fit:cover;display:block">';
  h += '</td>';
  h += '<td style="vertical-align:top;padding:0">';
  h += '<table style="width:100%;border-collapse:collapse">';
  h += '<tr><td style="padding:8px 10px;border-bottom:1px solid #D8DCEA;font-size:12px;color:#0F1C3F;line-height:1.6;vertical-align:top">';
  h += '<strong>Objetivo:</strong> Establecer normas a nivel de Seguridad y Salud en el Trabajo para laborar en las operaciones, como medida de prevenci&oacute;n frente a Riesgos y Peligros derivados de la operaci&oacute;n de Logyser.';
  h += '</td></tr>';
  h += '<tr><td style="padding:8px 10px;border-bottom:1px solid #D8DCEA;font-size:12px;color:#0F1C3F;line-height:1.6;vertical-align:top">';
  h += '<strong>Alcance:</strong> Aplica para todos los colaboradores de Logyser.';
  h += '</td></tr>';
  h += '<tr><td style="padding:0;vertical-align:top">';
  h += '<table style="width:100%;border-collapse:collapse">';
  h += '<tr>';
  h += '<td style="width:90px;padding:8px 10px;border-right:1px solid #D8DCEA;font-size:12px;font-weight:700;color:#0F1C3F;vertical-align:middle;text-align:center">Objetivos<br>Espec&iacute;ficos</td>';
  h += '<td style="vertical-align:top;padding:0">';
  h += '<div style="padding:7px 10px;font-size:12px;color:#0F1C3F;line-height:1.6;border-bottom:1px solid #D8DCEA">Prevenir incidentes y/o accidentes laborales, con afectaci&oacute;n a la persona, al medio ambiente, a la operaci&oacute;n y activos fijos de LOGYSER.</div>';
  h += '<div style="padding:7px 10px;font-size:12px;color:#0F1C3F;line-height:1.6">Adoptar cultura de auto cuidado y cumplimiento de normas de seguridad como medida preventiva frente a estado integral del trabajador.</div>';
  h += '</td></tr></table>';
  h += '</td></tr></table>';
  h += '</td></tr></table>';

  const normas = [
    'Presento mi carnet al ingreso de las instalaciones de las operaciones, me presento a la zona de operaci\u00F3n con mi dotaci\u00F3n completa entregada por la empresa (Overol, calzado y EPP) durante toda mi jornada laboral utilizo mi dotaci\u00F3n y EPP requeridos para mi labor.',
    'Llego a mi lugar de trabajo con tiempo de anticipaci\u00F3n necesario para recibir el turno; as\u00ED como la informaci\u00F3n necesaria de las actividades a realizar.',
    'Me abstengo de usar accesorios como: aretes, pearcing, expansiones, cadenas, pulseras, relojes, anillos, gorras y me presento al trabajo libre de efectos de sustancias de alcohol drogas y psicoactivas, las cuales ponen en riesgo mi integridad y la de mis compa\u00F1eros.',
    'Reporto mis condiciones de salud de forma diaria y con 2 d\u00EDas de Antelaci\u00F3n como m\u00EDnimo informo mis citas medicas, terapias, ex\u00E1menes y otros para gestionar el permiso a trav\u00E9s de formato f\u00EDsico.',
    'Los soportes de incapacidad, recomendaciones y otros una vez sean expedida, debo entregarla a jefe y/o gesti\u00F3n humana y SST, para respectivo an\u00E1lisis vr puesto de trabajo.',
    'Toda lesi\u00F3n que me suceda en la ejecuci\u00F3n de mi labor, la debo reportar de forma inmediata a la ocurrencia y participar en el proceso de investigaci\u00F3n, plan de acci\u00F3n conforme a legislaci\u00F3n vigente.',
    'Me abstengo de utilizar celular, manos libres, radios, mp3 o cualquier otro elemento que me genere distracci\u00F3n durante mi jornada laboral.',
    'Sigo procedimientos indicados en mi inducci\u00F3n, mantengo mi \u00E1rea de trabajo en condiciones \u00F3ptimas de orden y aseo, cumpliendo normas y controles requeridos, suspendiendo toda labor que ponga en riesgo mi vida, la de mis compa\u00F1eros, el medio ambiente y los recursos de la empresa.',
    'Reporto actos y condiciones inseguras, doy buen trato a jefes y compa\u00F1eros, sigo instrucciones de mi jefe, acepto retroalimentaci\u00F3n de superiores en caso de ser necesario; en el trabajo y fuera de \u00E9l, cumplo las normas de seguridad vial (respeto se\u00F1ales de tr\u00E1nsito).',
    'Con la firma del presente documento manifiesto que he recibido la informaci\u00F3n sobre los riesgos, normas de seguridad y me comprometo a cumplirlas durante mi relaci\u00F3n laboral con APOYO LOG\u00DDSTICO Y OPERATIVO S.A.S.'
  ];

  h += '<table style="width:100%;border-collapse:collapse;border:1px solid #D8DCEA">';
  h += '<tr>';
  h += '<td style="vertical-align:top;padding:0">';
  normas.forEach(function (norma, i) {
    const bg = i % 2 === 0 ? '#fff' : '#F0F2F8';
    h += '<div style="display:grid;grid-template-columns:28px 1fr;background:' + bg + ';border-bottom:1px solid #D8DCEA">';
    h += '<div style="padding:8px 4px 8px 8px;font-size:11.5px;font-weight:700;color:#5A6A8A">' + (i + 1) + '.</div>';
    h += '<div style="padding:8px 10px 8px 0;font-size:12px;color:#5A6A8A;line-height:1.6">' + norma + '</div>';
    h += '</div>';
  });
  h += '</td>';
  h += '<td style="width:75px;border-left:1px solid #D8DCEA;vertical-align:top;padding:0">';
  h += '<img src="' + IMG_ROMPECABEZA + '" alt="1-10" style="width:75px;height:100%;min-height:500px;object-fit:cover;object-position:center;display:block">';
  h += '</td>';
  h += '</tr></table>';

  return h;
}

const pdfJS = (
  // Precargar imagenes con delay para que precargarImagen este disponible
  'setTimeout(function(){'
  + 'if(typeof precargarImagen==="function"){'
  + 'precargarImagen("' + IMG_BODEGA + '",function(b64){window._seop_bodega=b64;});'
  + 'precargarImagen("' + IMG_ROMPECABEZA + '",function(b64){window._seop_rompe=b64;});'
  + '}},200);'

  + 'function pdfSEOP(r){'
  + 'var d=r.jdoc,c=PDF_CFG,CW=c.CW,ML=c.ML;'
  + 'r.y+=4;'

  // ── BLOQUE SUPERIOR: foto izq | objetivo/alcance/obj.especificos der ──
  + 'var LC=Math.round(CW*0.42);'   // columna izquierda ~79mm (foto bodega)
  + 'var RC=CW-LC-0.3;'             // columna derecha ~108mm
  + 'var RX=ML+LC+0.3;'             // x inicio columna derecha
  + 'var LBL=30;'                   // ancho etiqueta "Objetivos Especificos"
  + 'var TW=RC-LBL-0.3;'           // ancho texto en sub-filas OE

  // Calcular alturas de cada fila con margen de seguridad
  + 'var objL=d.splitTextToSize("Objetivo: Establecer normas a nivel de SST para laborar en las operaciones, como medida de prevenci\u00F3n frente a Riesgos y Peligros derivados de la operaci\u00F3n de Logyser.",RC-8);'
  + 'var alcL=d.splitTextToSize("Alcance: Aplica para todos los colaboradores de Logyser.",RC-8);'
  + 'var oe1L=d.splitTextToSize("Prevenir incidentes y/o accidentes laborales, con afectaci\u00F3n a la persona, al medio ambiente, a la operaci\u00F3n y activos fijos de LOGYSER.",TW-6);'
  + 'var oe2L=d.splitTextToSize("Adoptar cultura de auto cuidado y cumplimiento de normas de seguridad como medida preventiva frente a estado integral del trabajador.",TW-6);'
  + 'var P=3;'  // padding
  + 'var hObj=objL.length*3.8+P*2;'
  + 'var hAlc=alcL.length*3.8+P*2;'
  + 'var hOE1=oe1L.length*3.6+P*2;'
  + 'var hOE2=oe2L.length*3.6+P*2;'
  + 'var hTop=hObj+hAlc+hOE1+hOE2;'

  + 'r.check(hTop+8);'
  + 'var y0=r.y;'

  // Foto bodega columna izquierda
  + 'if(window._seop_bodega){try{d.addImage(window._seop_bodega,"JPEG",ML,y0,LC,hTop);}catch(e){}}'
  + 'else{pdfFill(d,[210,210,210]);d.rect(ML,y0,LC,hTop,"F");}'

  // Bordes del bloque superior
  + 'pdfDraw(d,c.LGRAY);d.setLineWidth(0.25);'
  + 'd.rect(ML,y0,CW,hTop);'
  + 'd.line(ML+LC,y0,ML+LC,y0+hTop);'

  // Fila Objetivo
  + 'var ry=y0;'
  + 'pdfFill(d,c.WHITE);d.rect(RX,ry,RC,hObj,"F");'
  + 'pdfDraw(d,c.LGRAY);d.line(RX,ry+hObj,ML+CW,ry+hObj);'
  + 'pdfFont(d,7.5,"normal");pdfText(d,c.BLACK);'
  + 'objL.forEach(function(l,i){d.text(l,RX+2,ry+P+3.8+i*3.8);});'
  + 'ry+=hObj;'

  // Fila Alcance
  + 'pdfFill(d,c.BG);d.rect(RX,ry,RC,hAlc,"F");'
  + 'pdfDraw(d,c.LGRAY);d.line(RX,ry+hAlc,ML+CW,ry+hAlc);'
  + 'alcL.forEach(function(l,i){d.text(l,RX+2,ry+P+3.8+i*3.8);});'
  + 'ry+=hAlc;'

  // Fila Objetivos Especificos (etiqueta + 2 sub-filas)
  + 'var TX=RX+LBL+0.3;'
  + 'pdfFill(d,c.WHITE);d.rect(RX,ry,LBL,hOE1+hOE2,"F");'
  + 'd.line(RX+LBL,ry,RX+LBL,ry+hOE1+hOE2);'
  + 'pdfFont(d,7,"bold");pdfText(d,c.NAVY);'
  + 'var lbL=d.splitTextToSize("Objetivos Espec\u00EDficos",LBL-3);'
  + 'var lbY=ry+(hOE1+hOE2)/2-(lbL.length*3.8)/2+2;'
  + 'lbL.forEach(function(l,i){d.text(l,RX+1.5,lbY+i*3.8);});'
  // Sub-fila OE1
  + 'pdfFill(d,c.WHITE);d.rect(TX,ry,TW,hOE1,"F");'
  + 'pdfDraw(d,c.LGRAY);d.line(TX,ry+hOE1,ML+CW,ry+hOE1);'
  + 'pdfFont(d,7,"normal");pdfText(d,c.BLACK);'
  + 'oe1L.forEach(function(l,i){d.text(l,TX+2,ry+P+3.6+i*3.6);});'
  + 'ry+=hOE1;'
  // Sub-fila OE2
  + 'pdfFill(d,c.BG);d.rect(TX,ry,TW,hOE2,"F");'
  + 'oe2L.forEach(function(l,i){d.text(l,TX+2,ry+P+3.6+i*3.6);});'
  + 'r.y=y0+hTop+5;'

  // ── NORMAS: texto izq | imagen rompecabezas der ──
  + 'var IW=18;'               // ancho columna imagen rompecabezas
  + 'var NW=CW-IW-0.5;'       // ancho columna normas
  + 'var IX=ML+NW+0.5;'       // x inicio imagen
  + 'var NTXT=NW-12;'         // ancho texto dentro de la celda (margen seguridad -12mm)

  + 'var normas=['
  + '"Presento mi carnet al ingreso de las instalaciones de las operaciones, me presento a la zona de operaci\u00F3n con mi dotaci\u00F3n completa entregada por la empresa (Overol, calzado y EPP) durante toda mi jornada laboral utilizo mi dotaci\u00F3n y EPP requeridos para mi labor.",'
  + '"Llego a mi lugar de trabajo con tiempo de anticipaci\u00F3n necesario para recibir el turno; as\u00ED como la informaci\u00F3n necesaria de las actividades a realizar.",'
  + '"Me abstengo de usar accesorios como: aretes, pearcing, expansiones, cadenas, pulseras, relojes, anillos, gorras y me presento al trabajo libre de efectos de sustancias de alcohol drogas y psicoactivas, las cuales ponen en riesgo mi integridad y la de mis compa\u00F1eros.",'
  + '"Reporto mis condiciones de salud de forma diaria y con 2 d\u00EDas de Antelaci\u00F3n como m\u00EDnimo informo mis citas medicas, terapias, ex\u00E1menes y otros para gestionar el permiso a trav\u00E9s de formato f\u00EDsico.",'
  + '"Los soportes de incapacidad, recomendaciones y otros una vez sean expedida, debo entregarla a jefe y/o gesti\u00F3n humana y SST, para respectivo an\u00E1lisis vr puesto de trabajo.",'
  + '"Toda lesi\u00F3n que me suceda en la ejecuci\u00F3n de mi labor, la debo reportar de forma inmediata a la ocurrencia y participar en el proceso de investigaci\u00F3n, plan de acci\u00F3n conforme a legislaci\u00F3n vigente.",'
  + '"Me abstengo de utilizar celular, manos libres, radios, mp3 o cualquier otro elemento que me genere distracci\u00F3n durante mi jornada laboral.",'
  + '"Sigo procedimientos indicados en mi inducci\u00F3n, mantengo mi \u00E1rea de trabajo en condiciones \u00F3ptimas de orden y aseo, cumpliendo normas y controles requeridos, suspendiendo toda labor que ponga en riesgo mi vida, la de mis compa\u00F1eros, el medio ambiente y los recursos de la empresa.",'
  + '"Reporto actos y condiciones inseguras, doy buen trato a jefes y compa\u00F1eros, sigo instrucciones de mi jefe, acepto retroalimentaci\u00F3n de superiores; en el trabajo y fuera de \u00E9l, cumplo las normas de seguridad vial (respeto se\u00F1ales de tr\u00E1nsito).",'
  + '"Con la firma del presente documento manifiesto que he recibido la informaci\u00F3n sobre los riesgos, normas de seguridad y me comprometo a cumplirlas durante mi relaci\u00F3n laboral con APOYO LOG\u00DDSTICO Y OPERATIVO S.A.S."'
  + '];'

  // Pre-calcular alturas
  + 'var rhs=[];'
  + 'normas.forEach(function(n){'
  + 'var lns=d.splitTextToSize(n,NTXT);'
  + 'rhs.push(Math.max(8,lns.length*4+4));'
  + '});'
  + 'var totalNH=rhs.reduce(function(a,b){return a+b;},0);'

  + 'r.check(totalNH+4);'
  + 'var ny0=r.y;'

  // Imagen rompecabezas — dibujada primero, detrás de las normas
  + 'if(window._seop_rompe){try{d.addImage(window._seop_rompe,"JPEG",IX,ny0,IW,totalNH);}catch(e){}}'

  // Dibujar cada norma
  + 'var ny=ny0;'
  + 'normas.forEach(function(n,i){'
  + 'var lns=d.splitTextToSize(n,NTXT);'
  + 'var rh=rhs[i];'
  + 'pdfFill(d,i%2===0?c.WHITE:c.BG);'
  + 'd.rect(ML,ny,NW,rh,"F");'
  + 'pdfDraw(d,c.LGRAY);d.setLineWidth(0.1);'
  + 'd.rect(ML,ny,NW,rh);'
  + 'pdfFont(d,8,"bold");pdfText(d,c.NAVY);'
  + 'd.text(String(i+1)+".",ML+2,ny+rh/2+1.5);'
  + 'pdfFont(d,7.5,"normal");pdfText(d,c.BLACK);'
  + 'var ty=ny+(rh-lns.length*4)/2+3.5;'
  + 'lns.forEach(function(l,li){d.text(l,ML+9,ty+li*4);});'
  + 'ny+=rh;'
  + '});'

  // Borde exterior normas + línea separadora imagen
  + 'pdfDraw(d,c.LGRAY);d.setLineWidth(0.25);'
  + 'd.rect(ML,ny0,CW,totalNH);'
  + 'd.line(ML+NW,ny0,ML+NW,ny0+totalNH);'
  + 'r.y=ny0+totalNH+4;'
  + '}'
);

module.exports = { buildScreen, pdfJS };