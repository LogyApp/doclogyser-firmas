-- Formatos Italcol (documento de firma 33): 3 de 5 — Política de no consumo de alcohol, tabaco y sustancias psicoactivas.
-- Réplica exacta del formato del cliente (DN-PC-GE-001, versión 03, enero de 2019), una hoja carta.
-- La firma del colaborador va sobre la línea "Firma Colaborador"; debajo, nombre, C.C. y fecha de la firma electrónica.
-- El logo llega con {{logo_italcol}}. HTML también en migraciones/plantillas/ITAL_ALCOHOL.html.
-- Requiere 2026-11-13_italcol_politica_sig.sql (columnas id_config_doc y observaciones).
-- Ejecutada el 2026-11-13 (id 34). Se puede ejecutar más de una vez.

INSERT INTO Maestro_Plantillas
  (nombre_proceso, id_config_doc, observaciones, codigo_formato, version_formato, fecha_version, tabla_datos, id_campo_fk,
   bucket_carpeta, requiere_firma_trabajador, activo, version, contenido_html, ultima_actualizacion)
SELECT 'ITAL_ALCOHOL', 33, 'Política de no consumo de alcohol, tabaco y sustancias psicoactivas', 'DN-PC-GE-001', '03', '2019-01-01',
       'Dynamic_hv_aspirante', 'id_aspirante', 'hojas_vida_logyser', 1, 1, 1, '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Política de No Consumo de Alcohol, Tabaco y Sustancias Psicoactivas Italcol</title>
<style>
  /* Réplica del formato de Italcol DN-PC-GE-001 v03 (carta). No cambiar el diseño: es formato del cliente.
     El original usa Arial comprimida horizontalmente (escala 83 % el cuerpo, 78 % firmas, 89 % pie): se replica
     con transform: scaleX sobre Arial / Liberation Sans, que tiene las mismas medidas. */
  @page { size: letter; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #ffffff; }
  body { font-family: Arial, "Liberation Sans", Helvetica, sans-serif; color: #000000; font-size: 11.04pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pagina { position: relative; width: 612pt; height: 792pt; overflow: hidden; }

  .enc-logo { position: absolute; left: 91.05pt; top: 37.25pt; width: 74.65pt; height: 59.8pt; object-fit: contain; }
  .titulo { position: absolute; font-weight: bold; font-size: 12pt; line-height: 14pt; white-space: nowrap; }
  .linea-doble { position: absolute; left: 85pt; width: 481.5pt; height: 4.6pt; border-top: 0.7pt solid #ff6600; }
  .linea-doble::after { content: ''''; position: absolute; left: 0; right: 0; top: 1.1pt; height: 2.6pt; background: #ff6600; }
  .l-hdr { top: 98.2pt; }
  .l-pie { top: 693.9pt; }

  /* Bloques comprimidos al 82,927 % (como el original) */
  .comp { position: absolute; transform-origin: left top; transform: scaleX(0.82927); line-height: 14.4pt; text-align: justify; }
  .par { margin-bottom: 5.9pt; }
  .par:last-child { margin-bottom: 0; }
  .vinetas .par { margin-bottom: 6.2pt; }
  .vinetas .par:last-child { margin-bottom: 0; }
  .vi { position: relative; }
  .vi::before { content: ''\\2022''; position: absolute; left: -21.4pt; top: 0; font-family: Symbol, "Liberation Sans", Arial, sans-serif; font-size: 11pt; }
  /* Cada renglón como en el original: los que no terminan párrafo van justificados */
  .ln { white-space: nowrap; overflow: visible; }
  .ln.j { text-align: justify; text-align-last: justify; }
  .linea { position: absolute; white-space: nowrap; line-height: 14.4pt; transform-origin: left top; }
  .s78 { transform: scaleX(0.78049); }
  .b886 { font-weight: bold; transform: scaleX(0.88636); }
  .s878 { transform: scaleX(0.87805); }

  .firma-img { position: absolute; left: 445pt; top: 568pt; width: 132pt; height: 42pt; display: flex; align-items: flex-end; justify-content: center; }
  .firma-img img { max-height: 42pt; max-width: 132pt; object-fit: contain; }
  .firma-datos { position: absolute; left: 451.6pt; top: 634pt; width: 118pt; font-size: 6.5pt; line-height: 7.8pt; color: #333333; }
</style>
</head>
<body>
  <div class="pagina">
    <img class="enc-logo" src="{{logo_italcol}}" alt="Italcol">
    <div class="titulo" style="left:305.69pt; top:52.9pt">POLITICA DE NO CONSUMO DE</div>
    <div class="titulo" style="left:292.25pt; top:66.7pt">ALCOHOL, TABACO</div>
    <div class="titulo" style="left:412.99pt; top:66.7pt">Y SUSTANCIAS</div>
    <div class="titulo" style="left:352.39pt; top:80.5pt">PSICOACTIVAS</div>
    <div class="linea-doble l-hdr"></div>

    <div class="comp" style="left:85.1pt; top:152.9pt; width:571pt">
      <div class="par">
        <div class="ln j">ITALCOL, ha definido y establecido una política para el no consumo de alcohol, tabaco y sustancias psicoactivas,</div>
        <div class="ln j">para preservar, mejorar y conservar el bienestar de los trabajadores y su calidad de vida, logrando además un</div>
        <div class="ln j">adecuado desempeño y competitividad del personal y de la empresa, así como el fomento de estilos de vida</div>
        <div class="ln">saludables, teniendo en cuenta lo establecido en la legislación vigente.</div>
      </div>
      <div class="par">
        <div class="ln j">ITALCOL, es consciente que el alcoholismo y el consumo de sustancias psicoactivas por parte de los trabajadores,</div>
        <div class="ln j">puede tener efectos adversos en su capacidad de desempeño y pueden afectar considerablemente la salud y</div>
        <div class="ln">seguridad de los demás colaboradores y de terceros. Por lo anterior, ITALCOLcontempla los siguientes aspectos.</div>
      </div>
    </div>

    <div class="comp vinetas" style="left:121.1pt; top:265.5pt; width:528pt">
      <div class="par vi">
        <div class="ln j">Está prohibido presentarse a trabajar bajo el efecto de alcohol, drogas y/o sustancias psicoactivas o que</div>
        <div class="ln">crean dependencia.</div>
      </div>
      <div class="par vi">
        <div class="ln j">Esta estrictamente prohibido la posesión, consumo, distribución o venta de bebidas alcohólicas, tabaco o</div>
        <div class="ln j">sustancias psicoactivas, medicamentos formulados o drogas no recetadas en el desarrollo del trabajo, dentro</div>
        <div class="ln j">y fuera de las instalaciones de la empresa, dentro de los centros de trabajo o durante la prestación de</div>
        <div class="ln">servicios.</div>
      </div>
      <div class="par vi">
        <div class="ln j">ITALCOL se reserva el derecho de realizar pruebas de alcoholemia y/o de consumo de drogas ilícitas o de</div>
        <div class="ln j">convocas a terceros para que las hagan, en situaciones en que un trabajador, directamente contratado o de</div>
        <div class="ln">terceros, este envuelto en algún accidente y/o presente características o actitudes sospechosas.</div>
      </div>
    </div>

    <div class="comp" style="left:78.98pt; top:432.56pt; width:578.4pt">
      <div class="par" style="margin-bottom:5.28pt">
        <div class="ln j">La empresa se acoge a las normas, políticas y campañas que en materia de desestimulacion o prohibición del consumo</div>
        <div class="ln">de tabaco, alcohol y drogas imparta el gobierno nacional.</div>
      </div>
      <div class="par">
        <div class="ln">El alcance de esta política aplicará a nuestros trabajadores, contratistas, visitantes y será divulgada a todo el personal.</div>
      </div>
    </div>

    <div class="linea s78" style="left:85.1pt; top:508.64pt">Enero del 2019</div>

    <div class="firma-img">{{firma_colaborador}}</div>
    <div class="linea s78" style="left:85.1pt; top:601.55pt">----------------------------------------------</div>
    <div class="linea s78" style="left:439.63pt; top:601.55pt">---------------------------------------------</div>
    <div class="linea s78" style="left:85.1pt; top:621.23pt">JUAN FELIPE CADAVID HERNÁNDEZ</div>
    <div class="linea s78" style="left:451.63pt; top:621.23pt">Firma Colaborador</div>
    <div class="linea s78" style="left:85.1pt; top:633.83pt">Gerente Regional Antioquia.</div>
    <div class="firma-datos">{{nombre_completo}}<br>C.C. {{identificacion}}<br>Firma electrónica (Ley 527/1999)<br>{{fecha_generacion}}</div>
    <div class="linea s78" style="left:85.1pt; top:665pt">.</div>

    <div class="linea-doble l-pie"></div>
    <div class="linea b886" style="left:437.59pt; top:707.41pt">Código:</div>
    <div class="linea s878" style="left:499.42pt; top:707.41pt">DN-PC-GE-001</div>
    <div class="linea b886" style="left:437.59pt; top:724.45pt">Versión:</div>
    <div class="linea s878" style="left:548.14pt; top:724.45pt">03</div>
  </div>
<script>
  // Si un renglón quedó más largo que su bloque (Word ajusta el espaciado entre letras), se reduce el
  // espacio entre letras hasta que quepa, para conservar los mismos renglones del original.
  document.querySelectorAll(''.ln'').forEach(function (el) {
    var ancho = el.parentElement.clientWidth, ls = 0;
    el.style.display = ''inline-block'';
    while (el.scrollWidth > ancho + 0.5 && ls > -0.6) { ls -= 0.02; el.style.letterSpacing = ls + ''pt''; }
    el.style.display = ''block'';
  });
</script>
</body>
</html>
', NOW()
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Plantillas WHERE nombre_proceso = 'ITAL_ALCOHOL');

SELECT id_plantilla, nombre_proceso, id_config_doc, observaciones, LENGTH(contenido_html) AS tam,
       SHA2(contenido_html, 256) AS hash
FROM Maestro_Plantillas WHERE nombre_proceso LIKE 'ITAL\_%';
